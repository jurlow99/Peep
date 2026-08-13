// Persistent "which database am I on?" indicator. Keys off the Supabase URL, not
// the hostname — so it reflects the DATA you're touching. It shows on dev, and is
// deliberately INVISIBLE on prod (so its absence = "you're on the real database").
const PROD_REF = "iuozujwtuzuwubhsnhix";
const URL = import.meta.env.VITE_SUPABASE_URL || "";

// Dev = anything not pointed at the prod project (localhost, previews, or if you
// swap .env back to prod the badge vanishes as a live "careful, this is real" cue).
export const IS_DEV_DB = !URL.includes(PROD_REF);

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
