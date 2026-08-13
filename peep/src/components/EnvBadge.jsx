// Persistent "which database am I on?" indicator. Keys off the Supabase URL, not
// the hostname — so it reflects the DATA you're touching. It shows on dev, and is
// deliberately INVISIBLE on prod (so its absence = "you're on the real database").
import { useState, useEffect } from "react";

const PROD_REF = "iuozujwtuzuwubhsnhix";
const URL = import.meta.env.VITE_SUPABASE_URL || "";

// Dev = anything not pointed at the prod project (localhost, previews, or if you
// swap .env back to prod the badge vanishes as a live "careful, this is real" cue).
export const IS_DEV_DB = !URL.includes(PROD_REF);

// Brief FARRIS splash on dev load — instantly signals "this is the dev build."
// Shows once per tab session so it doesn't nag on every reload; click to dismiss.
export function DevSplash() {
  const [show, setShow] = useState(() => IS_DEV_DB && !sessionStorage.getItem("farris_splash"));
  const [fade, setFade] = useState(false);
  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem("farris_splash", "1"); } catch { /* ignore */ }
    const t1 = setTimeout(() => setFade(true), 950);
    const t2 = setTimeout(() => setShow(false), 1450);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [show]);
  if (!show) return null;
  return (
    <div onClick={() => setShow(false)}
      style={{ position: "fixed", inset: 0, zIndex: 2147483646, background: "#0a0a0a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, cursor: "pointer", opacity: fade ? 0 : 1, transition: "opacity 0.5s ease" }}>
      <div style={{ fontSize: "clamp(44px, 10vw, 88px)", fontWeight: 800, letterSpacing: "0.2em", color: "#fff", fontFamily: "ui-monospace, Menlo, monospace", paddingLeft: "0.2em" }}>FARRIS</div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, color: "#a855f7", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#a855f7", boxShadow: "0 0 10px #a855f7" }} />
        Dev Build · peep-dev
      </div>
    </div>
  );
}

export function EnvBadge() {
  if (!IS_DEV_DB) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed", left: 12, bottom: 12, zIndex: 2147483647, pointerEvents: "none",
        display: "flex", alignItems: "center", gap: 7,
        background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 11,
        letterSpacing: 1.2, textTransform: "uppercase", fontFamily: "ui-monospace, Menlo, monospace",
        padding: "6px 11px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.25)",
        boxShadow: "0 6px 20px rgba(124,58,237,0.5)",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", boxShadow: "0 0 6px #fff" }} />
      DEV · peep-dev
    </div>
  );
}
