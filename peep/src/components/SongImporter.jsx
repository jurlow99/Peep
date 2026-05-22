import { useState, useRef } from "react";
import { supabase } from "../supabase";

const BUCKET = "peep-media";

function fmt(secs) {
  if (!secs || !isFinite(secs)) return "";
  const m = Math.floor(secs / 60), s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function uploadBlob(blob, path) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function SongImporter({ onClose, onImported }) {
  const [step, setStep] = useState("pick"); // "pick" | "review" | "uploading" | "done"
  const [songs, setSongs] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] });
  const fileInputRef = useRef(null);
  const artworkUrlsRef = useRef([]); // object URLs to revoke on close

  function cleanup() {
    artworkUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    artworkUrlsRef.current = [];
  }

  function handleClose() { cleanup(); onClose(); }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setStep("parsing");

    const results = await Promise.all(files.map(async (file) => {
      let title = file.name.replace(/\.[^/.]+$/, "");
      let artist = "", album = "", year = "", durationStr = "";
      let artworkBlob = null, artworkUrl = null;
      try {
        const duration = await new Promise((resolve) => {
          const audio = new Audio();
          const url = URL.createObjectURL(file);
          audio.addEventListener("loadedmetadata", () => { URL.revokeObjectURL(url); resolve(audio.duration); });
          audio.addEventListener("error", () => { URL.revokeObjectURL(url); resolve(null); });
          audio.src = url;
        });
        if (duration) durationStr = fmt(duration);
      } catch { /* use filename defaults */ }
      return { file, title, artist, album, year, durationStr, artworkBlob, artworkUrl, status: "ready" };
    }));

    setSongs(results);
    setStep("review");
  }

  function updateSong(idx, field, value) {
    setSongs(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  async function importAll() {
    setStep("uploading");
    const total = songs.length;
    let done = 0;
    const errors = [];
    const ts = () => Date.now();

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      try {
        const safeBase = song.file.name.replace(/\s+/g, "-").replace(/[^\w\-.]/g, "");
        const audioPath = `songs/audio/${ts()}-${safeBase}`;
        const audioUrl = await uploadBlob(song.file, audioPath);

        let thumbnailUrl = null;
        if (song.artworkBlob) {
          const ext = (song.artworkBlob.type.split("/")[1] || "jpg").split(";")[0];
          const artPath = `songs/artwork/${ts()}-${safeBase.replace(/\.[^/.]+$/, "")}.${ext}`;
          try { thumbnailUrl = await uploadBlob(song.artworkBlob, artPath); } catch { /* skip artwork */ }
        }

        const { error: dbErr } = await supabase.from("songs").insert([{
          title: song.title.trim() || song.file.name,
          artist: song.artist.trim(),
          album: song.album.trim(),
          url: audioUrl,
          thumbnail: thumbnailUrl,
          duration: song.durationStr,
          year: song.year ? Number(song.year) : null,
          enabled: true,
        }]);
        if (dbErr) throw dbErr;

        done++;
        setSongs(prev => prev.map((s, j) => j === i ? { ...s, status: "done" } : s));
      } catch (err) {
        done++;
        errors.push(`${song.file.name}: ${err.message}`);
        setSongs(prev => prev.map((s, j) => j === i ? { ...s, status: "error" } : s));
      }
      setProgress({ done, total, errors: [...errors] });
    }

    setStep("done");
    onImported?.();
  }

  const inputStyle = {
    background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6,
    padding: "6px 8px", color: "#0f172a", fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box",
  };

  return (
    <div onClick={handleClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 16, width: "min(900px, 100%)", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", fontFamily: "'Space Grotesk', sans-serif" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #e2e8f0" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Import Songs from Files</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>Reads ID3 tags (artist, title, album, artwork) automatically</p>
          </div>
          <button onClick={handleClose} style={{ background: "none", border: "none", fontSize: 22, color: "#9ca3af", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "24px" }}>
          {/* STEP: pick */}
          {(step === "pick" || step === "parsing") && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(79,70,229,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              </div>
              {step === "parsing" ? (
                <p style={{ color: "#6b7280", fontSize: 15 }}>Reading ID3 tags…</p>
              ) : (
                <>
                  <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: "#0f172a" }}>Select your audio files</p>
                  <p style={{ margin: "0 0 24px", fontSize: 13, color: "#6b7280" }}>MP3, FLAC, AAC, WMA, OGG — any format WMP supports</p>
                  <input ref={fileInputRef} type="file" multiple accept=".mp3,.m4a,.aac,.flac,.wav,.ogg,.wma,.opus,.aiff,.ape" onChange={handleFiles} style={{ display: "none" }} />
                  <button onClick={() => fileInputRef.current?.click()}
                    style={{ background: "#4f46e5", border: "none", borderRadius: 8, padding: "12px 28px", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    Choose Files
                  </button>
                  <p style={{ margin: "16px 0 0", fontSize: 12, color: "#9ca3af" }}>Files are uploaded to Supabase Storage — original filenames preserved</p>
                </>
              )}
            </div>
          )}

          {/* STEP: review */}
          {step === "review" && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>
                  <strong>{songs.length}</strong> song{songs.length !== 1 ? "s" : ""} detected — review and edit before uploading
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input ref={fileInputRef} type="file" multiple accept=".mp3,.m4a,.aac,.flac,.wav,.ogg,.wma,.opus,.aiff,.ape" onChange={handleFiles} style={{ display: "none" }} />
                  <button onClick={() => fileInputRef.current?.click()}
                    style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "8px 14px", color: "#374151", fontSize: 12, cursor: "pointer" }}>
                    + Add More Files
                  </button>
                </div>
              </div>

              <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Art", "File", "Artist", "Title", "Album", "Year", "Duration"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {songs.map((s, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 12px" }}>
                          {s.artworkUrl
                            ? <img src={s.artworkUrl} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />
                            : <div style={{ width: 36, height: 36, borderRadius: 4, background: "linear-gradient(135deg,#e0e7ff,#c7d2fe)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                              </div>
                          }
                        </td>
                        <td style={{ padding: "8px 12px", color: "#6b7280", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.file.name}>{s.file.name}</td>
                        <td style={{ padding: "8px 8px", minWidth: 120 }}><input value={s.artist} onChange={e => updateSong(i, "artist", e.target.value)} style={inputStyle} placeholder="Artist" /></td>
                        <td style={{ padding: "8px 8px", minWidth: 140 }}><input value={s.title} onChange={e => updateSong(i, "title", e.target.value)} style={inputStyle} placeholder="Title" /></td>
                        <td style={{ padding: "8px 8px", minWidth: 120 }}><input value={s.album} onChange={e => updateSong(i, "album", e.target.value)} style={inputStyle} placeholder="Album" /></td>
                        <td style={{ padding: "8px 8px", width: 60 }}><input value={s.year} onChange={e => updateSong(i, "year", e.target.value)} style={inputStyle} placeholder="Year" /></td>
                        <td style={{ padding: "8px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>{s.durationStr || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                <button onClick={handleClose} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "11px 20px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button onClick={importAll}
                  style={{ background: "#4f46e5", border: "none", borderRadius: 8, padding: "11px 24px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Upload & Save {songs.length} Song{songs.length !== 1 ? "s" : ""}
                </button>
              </div>
            </>
          )}

          {/* STEP: uploading */}
          {step === "uploading" && (
            <div style={{ padding: "20px 0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Uploading…</p>
                <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>{progress.done} / {progress.total}</p>
              </div>
              <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginBottom: 20 }}>
                <div style={{ height: "100%", background: "#4f46e5", borderRadius: 4, width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`, transition: "width 0.3s" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {songs.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 6 }}>
                    <span style={{ fontSize: 14 }}>{s.status === "done" ? "✓" : s.status === "error" ? "✗" : "⋯"}</span>
                    <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>{s.artist ? `${s.artist} — ` : ""}{s.title}</span>
                    {s.status === "error" && <span style={{ fontSize: 11, color: "#f87171" }}>failed</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP: done */}
          {step === "done" && (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: progress.errors.length === 0 ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                {progress.errors.length === 0
                  ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="#f59e0b"/></svg>
                }
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
                {progress.done - progress.errors.length} of {progress.total} songs imported
              </p>
              {progress.errors.length > 0 && (
                <div style={{ margin: "12px auto 0", maxWidth: 500, textAlign: "left" }}>
                  <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Failed:</p>
                  {progress.errors.map((e, i) => <p key={i} style={{ margin: "2px 0", fontSize: 12, color: "#f87171" }}>{e}</p>)}
                </div>
              )}
              <button onClick={handleClose} style={{ marginTop: 24, background: "#4f46e5", border: "none", borderRadius: 8, padding: "11px 28px", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
