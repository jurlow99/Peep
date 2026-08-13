// FFmpeg process manager for the Peep relay.
// - Builds SRT input + Cloudflare output commands from VALIDATED fields (no shell).
// - Prefers stream copy/remux; only the caller decides to transcode.
// - Auto-restarts crashed relays with exponential backoff (no infinite tight loop).
// - Persists desired state so relays resume after a Pi reboot.

import { spawn } from "node:child_process";
import os from "node:os";
import fs from "node:fs";

const STATE_FILE = process.env.RELAY_STATE_FILE || "./relay-state.json";
const MAX_RESTARTS = 10;

/** feedId -> { enabled, source, destination, proc, pid, status, restarts, spawnedAt, lastExit, lastError, restartTimer } */
const relays = new Map();

const validHost = h => typeof h === "string" && /^[a-zA-Z0-9._-]+$/.test(h);
const validPort = p => Number.isInteger(Number(p)) && Number(p) > 0 && Number(p) < 65536;

export function buildSrtUrl(source = {}) {
  if (!validHost(source.host)) throw new Error("Invalid source host");
  if (!validPort(source.port)) throw new Error("Invalid source port");
  const mode = ["caller", "listener", "rendezvous"].includes(source.mode) ? source.mode : "caller";
  const params = new URLSearchParams();
  params.set("mode", mode);
  const lat = Number(source.latency);
  if (Number.isInteger(lat) && lat > 0) params.set("latency", String(lat));
  if (source.stream_id) params.set("streamid", String(source.stream_id));
  if (source.passphrase) { params.set("passphrase", String(source.passphrase)); params.set("pbkeylen", "16"); }
  return `srt://${source.host}:${source.port}?${params.toString()}`;
}

function buildFfmpegArgs(source, destination) {
  const input = buildSrtUrl(source);
  const args = ["-hide_banner", "-loglevel", "warning", "-re", "-i", input, "-c", "copy"];
  if (destination?.type === "rtmps" || destination?.type === "rtmp") {
    if (!/^rtmps?:\/\//.test(destination.url || "")) throw new Error("Invalid rtmp(s) destination");
    args.push("-f", "flv", destination.url);
  } else if (destination?.type === "srt") {
    if (!/^srt:\/\//.test(destination.url || "")) throw new Error("Invalid srt destination");
    args.push("-f", "mpegts", destination.url);
  } else {
    throw new Error("Invalid destination type (rtmps|rtmp|srt)");
  }
  return args;
}

// ── Source probe (Test Connection) ─────────────────────────────────────────────
export function testSource(source = {}) {
  let url;
  try { url = buildSrtUrl(source); } catch (e) { return Promise.resolve({ status: "UNKNOWN ERROR", detail: e.message }); }
  return new Promise(resolve => {
    const args = ["-hide_banner", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", "-timeout", "8000000", url];
    const p = spawn("ffprobe", args);
    let out = "", err = "";
    const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, 12000);
    p.stdout.on("data", d => (out += d));
    p.stderr.on("data", d => (err += d));
    p.on("error", e => { clearTimeout(t); resolve({ status: e.code === "ENOENT" ? "UNKNOWN ERROR" : "UNKNOWN ERROR", detail: e.message }); });
    p.on("close", code => {
      clearTimeout(t);
      if (code === 0 && out) {
        try {
          const j = JSON.parse(out);
          const v = (j.streams || []).find(s => s.codec_type === "video");
          const a = (j.streams || []).find(s => s.codec_type === "audio");
          if (!v && !a) return resolve({ status: "NO VIDEO" });
          if (!v) return resolve({ status: "NO VIDEO", audio: a?.codec_name || null });
          let fps = null;
          if (v.r_frame_rate && v.r_frame_rate.includes("/")) { const [n, d] = v.r_frame_rate.split("/").map(Number); fps = d ? +(n / d).toFixed(2) : n; }
          return resolve({
            status: "CONNECTED",
            video: v.codec_name || null, width: v.width || null, height: v.height || null, fps,
            audio: a ? a.codec_name : null,
            bitrate_kbps: j.format?.bit_rate ? Math.round(Number(j.format.bit_rate) / 1000) : null,
          });
        } catch { return resolve({ status: "UNKNOWN ERROR", detail: "probe parse failed" }); }
      }
      const e = (err || "").toLowerCase();
      let status = "UNKNOWN ERROR";
      if (e.includes("timed out") || e.includes("timeout")) status = "TIMED OUT";
      else if (e.includes("connection refused") || e.includes("no route") || e.includes("unreachable") || e.includes("failed to connect")) status = "HOST UNREACHABLE";
      else if (e.includes("passphrase") || e.includes("decrypt") || e.includes("crypto") || e.includes("wrong")) status = "INVALID PASSPHRASE";
      else if (e.includes("stream id") || e.includes("streamid") || e.includes("rejected")) status = "INVALID STREAM ID";
      else if (e.includes("auth")) status = "AUTHENTICATION FAILED";
      resolve({ status, detail: (err || "").split("\n").filter(Boolean).slice(-1)[0] || null });
    });
  });
}

// ── Relay lifecycle ─────────────────────────────────────────────────────────────
function spawnProc(feedId) {
  const s = relays.get(feedId);
  if (!s || !s.enabled) return;
  let args;
  try { args = buildFfmpegArgs(s.source, s.destination); }
  catch (e) { s.status = "error"; s.lastError = e.message; return; }
  const proc = spawn("ffmpeg", args);
  s.proc = proc; s.pid = proc.pid; s.status = "running"; s.spawnedAt = Date.now();
  let tail = "";
  proc.stderr.on("data", d => { tail = (tail + d).slice(-2000); });
  proc.on("error", e => { s.lastError = e.message; });
  proc.on("exit", code => {
    s.lastExit = code; s.proc = null; s.pid = null;
    if (!s.enabled) { s.status = "stopped"; return; }
    // ran a while? reset backoff. Otherwise escalate.
    if (Date.now() - (s.spawnedAt || 0) > 60000) s.restarts = 0;
    s.restarts = (s.restarts || 0) + 1;
    s.status = "error";
    s.lastError = tail.split("\n").filter(Boolean).slice(-1)[0] || `ffmpeg exited (${code})`;
    if (s.restarts > MAX_RESTARTS) { s.lastError = "too many restarts — giving up (check the source)"; return; }
    const delay = Math.min(30000, 2000 * 2 ** (s.restarts - 1));
    s.restartTimer = setTimeout(() => spawnProc(feedId), delay);
  });
}

export function startRelay(feedId, source, destination) {
  if (!feedId) throw new Error("feedId required");
  stopRelay(feedId, true);
  const prev = relays.get(feedId) || {};
  relays.set(feedId, { ...prev, feedId, enabled: true, source, destination, restarts: 0, lastError: null });
  spawnProc(feedId);
  persist();
  return statusOf(feedId);
}

export function stopRelay(feedId, keep = false) {
  const s = relays.get(feedId);
  if (!s) return { feedId, status: "stopped", running: false };
  s.enabled = false;
  if (s.restartTimer) clearTimeout(s.restartTimer);
  if (s.proc) { try { s.proc.kill("SIGTERM"); } catch {} }
  s.status = "stopped";
  if (!keep) persist();
  return statusOf(feedId);
}

export function restartRelay(feedId) {
  const s = relays.get(feedId);
  if (!s || !s.source) throw new Error("feed not configured on this relay");
  return startRelay(feedId, s.source, s.destination);
}

export function statusOf(feedId) {
  const s = relays.get(feedId);
  if (!s) return { feedId, status: "stopped", running: false };
  return {
    feedId, status: s.status || "stopped", running: !!s.proc, pid: s.pid || null,
    restarts: s.restarts || 0,
    uptimeSec: s.proc && s.spawnedAt ? Math.round((Date.now() - s.spawnedAt) / 1000) : 0,
    lastExit: s.lastExit ?? null, lastError: s.lastError || null,
  };
}

export function allStatus() { return [...relays.keys()].map(statusOf); }

export function health() {
  const load = os.loadavg()[0];
  const cpus = os.cpus().length || 1;
  return {
    ok: true,
    uptimeSec: Math.round(os.uptime()),
    cpuLoadPct: Math.round((load / cpus) * 100),
    memUsedPct: Math.round((1 - os.freemem() / os.totalmem()) * 100),
    activeRelays: [...relays.values()].filter(s => s.proc).length,
  };
}

// ── Reboot persistence ──────────────────────────────────────────────────────────
function persist() {
  const desired = {};
  for (const [id, s] of relays) if (s.enabled && s.source) desired[id] = { source: s.source, destination: s.destination };
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(desired), { mode: 0o600 }); } catch (e) { console.error("persist failed:", e.message); }
}

export function resumeFromDisk() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const desired = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    for (const [id, cfg] of Object.entries(desired)) {
      relays.set(id, { feedId: id, enabled: true, source: cfg.source, destination: cfg.destination, restarts: 0 });
      spawnProc(id);
    }
    console.log(`Resumed ${Object.keys(desired).length} relay(s) from ${STATE_FILE}`);
  } catch (e) { console.error("resume failed:", e.message); }
}
