// Peep relay API — controls FFmpeg SRT->Cloudflare relays on the Raspberry Pi.
// Auth: every request must send  Authorization: Bearer <RELAY_TOKEN>.
// This service is reached ONLY via the Cloudflare Tunnel from a Supabase Edge
// Function — never directly from the browser.

import express from "express";
import { spawn } from "node:child_process";
import {
  testSource, startRelay, stopRelay, restartRelay, statusOf, allStatus, health, resumeFromDisk,
} from "./relay-manager.js";

const PORT = process.env.RELAY_PORT || 8088;
const TOKEN = process.env.RELAY_TOKEN;
if (!TOKEN || TOKEN.length < 24) {
  console.error("FATAL: RELAY_TOKEN env var is required (>= 24 chars). Set it in .env / systemd.");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "256kb" }));

// Constant-time-ish token check
app.use((req, res, next) => {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${TOKEN}`) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/health", async (_req, res) => {
  const h = health();
  h.ffmpeg = await new Promise(r => {
    const p = spawn("ffmpeg", ["-version"]);
    let o = ""; p.stdout.on("data", d => (o += d));
    p.on("error", () => r(null));
    p.on("close", () => r((o.split("\n")[0] || "").trim() || null));
  });
  res.json(h);
});

app.get("/feeds", (_req, res) => res.json(allStatus()));
app.get("/feeds/:id/status", (req, res) => res.json(statusOf(req.params.id)));

app.post("/feeds/:id/test", async (req, res) => {
  try { res.json(await testSource(req.body?.source || {})); }
  catch (e) { res.status(400).json({ status: "UNKNOWN ERROR", detail: e.message }); }
});

app.post("/feeds/:id/start", (req, res) => {
  try { res.json(startRelay(req.params.id, req.body?.source, req.body?.destination)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/feeds/:id/stop", (req, res) => res.json(stopRelay(req.params.id)));

app.post("/feeds/:id/restart", (req, res) => {
  try { res.json(restartRelay(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`Peep relay listening on :${PORT}`);
  resumeFromDisk(); // reconnect relays that were running before a reboot
});
