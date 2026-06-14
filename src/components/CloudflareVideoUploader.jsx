import { useState, useRef } from "react";
import * as tus from "tus-js-client";
import { supabase } from "../supabase";

const CF_CUSTOMER = "https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Poll until Cloudflare marks the video ready (transcoding complete)
async function pollReady(uid, token, onProgress) {
  const deadline = Date.now() + 20 * 60 * 1000; // give up after 20 min
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/check-video-status?uid=${uid}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = await res.json();
    if (json.readyToStream) return true;
    if (json.pctComplete != null) onProgress(json.pctComplete);
  }
  return false;
}

export function CloudflareVideoUploader({ onComplete, onError, disabled }) {
  const [phase, setPhase] = useState("idle"); // idle | uploading | processing | done | error
  const [uploadPct, setUploadPct] = useState(0);
  const [transPct, setTransPct] = useState(0);
  const [fileName, setFileName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef(null);
  const uploadRef = useRef(null);

  async function handleFile(file) {
    if (!file || !file.type.startsWith("video/")) return;
    setFileName(file.name);
    setPhase("uploading");
    setUploadPct(0);
    setErrorMsg("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");

      // Get a Cloudflare Stream TUS upload URL
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-stream-upload-url`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ maxDurationSeconds: 14400 }),
      });
      const { uid, uploadURL, error } = await res.json();
      if (error || !uploadURL) throw new Error(error ?? "Failed to get upload URL");

      // TUS resumable upload
      await new Promise((resolve, reject) => {
        const upload = new tus.Upload(file, {
          uploadUrl: uploadURL,
          chunkSize: 50 * 1024 * 1024, // 50 MB chunks
          retryDelays: [0, 3000, 6000, 12000],
          metadata: { filename: file.name, filetype: file.type },
          onProgress(loaded, total) {
            setUploadPct(Math.round((loaded / total) * 100));
          },
          onSuccess() { resolve(); },
          onError(err) { reject(err); },
        });
        uploadRef.current = upload;
        upload.start();
      });

      // Wait for Cloudflare to transcode
      setPhase("processing");
      setTransPct(0);
      const ready = await pollReady(uid, session.access_token, pct => {
        setTransPct(Number(pct));
      });

      if (!ready) throw new Error("Transcoding timed out — video may still be processing");

      setPhase("done");
      onComplete({
        uid,
        hlsUrl: `${CF_CUSTOMER}/${uid}/manifest/video.m3u8`,
        thumbnailUrl: `${CF_CUSTOMER}/${uid}/thumbnails/thumbnail.jpg`,
      });
    } catch (err) {
      setPhase("error");
      setErrorMsg(err.message);
      onError?.(err.message);
    }
  }

  function reset() {
    uploadRef.current?.abort();
    setPhase("idle");
    setUploadPct(0);
    setTransPct(0);
    setFileName("");
    setErrorMsg("");
  }

  if (phase === "idle") {
    return (
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        style={{ border: "2px dashed #2a2a2a", borderRadius: 10, padding: "24px 20px", textAlign: "center", cursor: disabled ? "default" : "pointer", background: "#0d0d0d", transition: "border-color 0.15s" }}
        onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = "#4f46e5"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
      >
        <input ref={inputRef} type="file" accept="video/*" style={{ display: "none" }}
          onChange={e => handleFile(e.target.files[0])} disabled={disabled} />
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" style={{ marginBottom: 8 }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#aaa" }}>Upload video to Cloudflare Stream</p>
        <p style={{ margin: 0, fontSize: 11, color: "#555" }}>MP4, MOV, MKV · Auto-transcodes to 1080p / 720p / 480p</p>
      </div>
    );
  }

  if (phase === "uploading") {
    return (
      <div style={{ border: "1px solid #1e1e1e", borderRadius: 10, padding: "20px", background: "#0d0d0d" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#e5e5e5" }}>Uploading…</p>
          <span style={{ fontSize: 13, color: "#4f46e5", fontWeight: 700 }}>{uploadPct}%</span>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 11, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</p>
        <div style={{ height: 6, background: "#1e1e1e", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${uploadPct}%`, background: "#4f46e5", borderRadius: 3, transition: "width 0.3s" }} />
        </div>
      </div>
    );
  }

  if (phase === "processing") {
    return (
      <div style={{ border: "1px solid #1e1e1e", borderRadius: 10, padding: "20px", background: "#0d0d0d" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#facc15", animation: "pulse 1.5s infinite" }} />
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#e5e5e5" }}>Transcoding 1080p → 720p → 480p…</p>
          {transPct > 0 && <span style={{ marginLeft: "auto", fontSize: 12, color: "#facc15" }}>{transPct}%</span>}
        </div>
        <p style={{ margin: 0, fontSize: 11, color: "#555" }}>This takes 1–5 minutes depending on file size. The URL will be filled in automatically.</p>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div style={{ border: "1px solid rgba(74,222,128,0.3)", borderRadius: 10, padding: "14px 16px", background: "rgba(74,222,128,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#4ade80" }}>Ready — HLS URL filled in</p>
        </div>
        <button onClick={reset} style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: 6, padding: "4px 10px", color: "#555", fontSize: 11, cursor: "pointer" }}>Replace</button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={{ border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "14px 16px", background: "rgba(239,68,68,0.04)" }}>
        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "#f87171" }}>Upload failed</p>
        <p style={{ margin: "0 0 10px", fontSize: 11, color: "#ef4444" }}>{errorMsg}</p>
        <button onClick={reset} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "6px 14px", color: "#f87171", fontSize: 12, cursor: "pointer" }}>Try again</button>
      </div>
    );
  }

  return null;
}
