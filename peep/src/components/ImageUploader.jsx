import { useState } from "react";
import { uploadImage } from "../lib/storageUtils";

export function ImageUploader({ onUploadSuccess, onError, label = "Upload Image", folder = "thumbnails", accept = "image/*" }) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const result = await uploadImage(file, folder);
    setUploading(false);

    if (result.error) {
      onError?.(result.error);
    } else {
      onUploadSuccess?.(result.url);
      setUploaded(file.name);
      setTimeout(() => setUploaded(null), 3000);
    }
  };

  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "18px 24px",
        border: `2px dashed ${uploaded ? "#4ade80" : "#2a2a2a"}`,
        borderRadius: 8,
        cursor: uploading ? "not-allowed" : "pointer",
        background: uploaded ? "rgba(74,222,128,0.05)" : "#0a0a0a",
        transition: "border-color 0.2s, background 0.2s",
        opacity: uploading ? 0.6 : 1,
      }}
      onMouseEnter={e => {
        if (!uploading && !uploaded) {
          e.currentTarget.style.borderColor = "#facc15";
          e.currentTarget.style.background = "rgba(250,204,21,0.04)";
        }
      }}
      onMouseLeave={e => {
        if (!uploading && !uploaded) {
          e.currentTarget.style.borderColor = "#2a2a2a";
          e.currentTarget.style.background = "#0a0a0a";
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
      <span style={{ fontSize: 13, color: uploaded ? "#4ade80" : "#aaa", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {uploading ? "Uploading..." : uploaded ? `Uploaded: ${uploaded}` : label}
      </span>
    </label>
  );
}
