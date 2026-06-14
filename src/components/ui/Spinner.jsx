import { useState, useEffect } from "react";

const LOADING_MSGS = [
  "Loading something weird...",
  "Almost there, don't panic...",
  "Buffering the vibes...",
  "This better be worth it...",
  "Summoning the content...",
];

export function Spinner() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % LOADING_MSGS.length), 800);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ width: 28, height: 28, border: "2.5px solid #222", borderTop: "2.5px solid #facc15", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
      <span style={{ fontSize: 13, color: "#444", letterSpacing: "0.02em" }}>{LOADING_MSGS[idx]}</span>
    </div>
  );
}
