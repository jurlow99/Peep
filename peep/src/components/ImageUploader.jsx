import { useState } from "react";
import { uploadImage } from "../lib/storageUtils";

export function ImageUploader({ onUploadSuccess, onError, label = "Upload Image", folder = "thumbnails" }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);

    // Upload
    setUploading(true);
    const result = await uploadImage(file, folder);
    setUploading(false);

    if (result.error) {
      onError?.(result.error);
    } else {
      onUploadSuccess?.(result.url);
      setPreview(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "24px",
          border: "2px dashed #2a2a2a",
          borderRadius: 8,
          cursor: uploading ? "not-allowed" : "pointer",
          background: "#0a0a0a",
          transition: "border-color 0.2s, background 0.2s",
          opacity: uploading ? 0.6 : 1,
        }}
        onMouseEnter={e => {
          if (!uploading) {
            e.currentTarget.style.borderColor = "#ff4d4d";
            e.currentTarget.style.background = "#1a0a0a";
          }
        }}
        onMouseLeave={e => {
          if (!uploading) {
            e.currentTarget.style.borderColor = "#2a2a2a";
            e.currentTarget.style.background = "#0a0a0a";
          }
        }}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: "none" }}
        />
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span style={{ fontSize: 13, color: "#aaa" }}>
          {uploading ? "Uploading..." : label}
        </span>
      </label>
      {preview && (
        <div style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}>
          <img
            src={preview}
            alt="Preview"
            style={{ width: "100%", height: "auto", maxHeight: 200, objectFit: "cover" }}
          />
        </div>
      )}
    </div>
  );
}
