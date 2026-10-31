import { useState } from "react";
import { imageFileFromURL } from "../lib/imageImport";
import { uploadImage } from "../lib/storageUtils";

export function ImageUploader({ onUploadSuccess, onError, label = "Upload Image", folder = "thumbnails", accept = "image/*", bucket, signedUrlSeconds = 0, allowUrlImport = false, appearance = "dark" }) {
  const light = appearance === "light";
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(null);

  const [importUrl, setImportUrl] = useState("");
  const upload = async (file) => {
    if (!file) return;

    setUploading(true);
    const result = await uploadImage(file, folder, bucket, signedUrlSeconds);
    setUploading(false);

    if (result.error) {
      onError?.(result.error);
    } else {
      onUploadSuccess?.(result.url);
      setUploaded(file.name);
      setTimeout(() => setUploaded(null), 3000);
    }
  };

  const handleFileChange = async (e) => { await upload(e.target.files?.[0]); };
  const importImage = async () => {
    setUploading(true);
    try { await upload(await imageFileFromURL(importUrl)); }
    catch (error) { onError?.(error.message); }
    finally { setUploading(false); }
  };

  return (
    <>
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "18px 24px",
        border: `2px dashed ${uploaded ? "#16a34a" : light ? "#cbd5e1" : "#2a2a2a"}`,
        borderRadius: 8,
        cursor: uploading ? "not-allowed" : "pointer",
        background: uploaded ? "rgba(74,222,128,0.05)" : light ? "#f8fafc" : "#0a0a0a",
        transition: "border-color 0.2s, background 0.2s",
        opacity: uploading ? 0.6 : 1,
      }}
      onMouseEnter={e => {
        if (!uploading && !uploaded) {
          e.currentTarget.style.borderColor = light ? "#6366f1" : "#facc15";
          e.currentTarget.style.background = light ? "#eef2ff" : "rgba(250,204,21,0.04)";
        }
      }}
      onMouseLeave={e => {
        if (!uploading && !uploaded) {
          e.currentTarget.style.borderColor = light ? "#cbd5e1" : "#2a2a2a";
          e.currentTarget.style.background = light ? "#f8fafc" : "#0a0a0a";
        }
      }}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleFileChange}
        disabled={uploading}
        style={{ display: "none" }}
      />
      {uploaded ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      )}
      <span style={{ fontSize: 13, color: uploaded ? "#15803d" : light ? "#475569" : "#aaa", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {uploading ? "Uploading..." : uploaded ? `Uploaded: ${uploaded}` : label}
      </span>
    </label>
    {allowUrlImport && (
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input aria-label="Image URL to import" value={importUrl} onChange={e => setImportUrl(e.target.value)}
          placeholder="Import an image URL into storage" disabled={uploading}
          style={{ background: light ? "#fff" : "#111", color: light ? "#0f172a" : "#eee", flex: 1, minWidth: 140, padding: 10, border: "1px solid #cbd5e1", borderRadius: 6 }} />
        <button type="button" onClick={importImage} disabled={uploading || !importUrl.trim()}
          style={{ background: light ? "#fff" : "#222", color: light ? "#4338ca" : "#eee", padding: "10px 14px", border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer" }}>
          {uploading ? "Importing…" : "Import image"}
        </button>
        {signedUrlSeconds > 0 && <small style={{ width: "100%", color: "#64748b" }}>Development preview: private artwork links expire after 24 hours.</small>}
      </div>
    )}
    </>
  );
}
