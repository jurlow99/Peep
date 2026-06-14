import { useState, useRef } from "react";

export function VideoUploader({ onFile, disabled }) {
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState(null);
  const inputRef = useRef(null);

  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      alert("Please select a video file (MP4, MOV, etc.)");
      return;
    }
    setSelected(file);
    onFile(file);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  const sizeMB = selected ? (selected.size / 1024 / 1024).toFixed(1) : null;

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={disabled ? undefined : onDrop}
      style={{
        border: `2px dashed ${dragging ? "#facc15" : selected ? "rgba(74,222,128,0.4)" : "#2a2a2a"}`,
        borderRadius: 14,
        padding: "36px 24px",
        textAlign: "center",
        cursor: disabled ? "default" : "pointer",
        background: dragging ? "rgba(250,204,21,0.04)" : selected ? "rgba(74,222,128,0.04)" : "#0d0d0d",
        transition: "all 0.15s",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        style={{ display: "none" }}
        onChange={e => handleFile(e.target.files[0])}
        disabled={disabled}
      />

      {selected ? (
        <>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>{selected.name}</p>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#555" }}>{sizeMB} MB · {selected.type}</p>
          {!disabled && (
            <button
              onClick={e => { e.stopPropagation(); setSelected(null); onFile(null); }}
              style={{ background: "transparent", border: "1px solid #2a2a2a", borderRadius: 8, padding: "6px 14px", color: "#555", fontSize: 12, cursor: "pointer" }}
            >
              Remove
            </button>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
          <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "#aaa" }}>
            {dragging ? "Drop it here" : "Drag & drop your video"}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#444" }}>or click to browse · MP4, MOV, MKV</p>
        </>
      )}
    </div>
  );
}
