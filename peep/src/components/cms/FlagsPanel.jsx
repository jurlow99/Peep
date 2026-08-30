import { useState, useEffect } from "react";
import { FEATURE_FLAGS, loadFlags, setFlag } from "../../lib/flags";

// Feature flags tab. Owns its own state — the CMS shell only hands it the two
// things it can't do itself: surface a toast and write the audit trail.
export default function FlagsPanel({ showToast, logAudit }) {
  const [flagStates, setFlagStates] = useState({});
  // Starts true: the panel only mounts when its tab opens, and it fetches
  // immediately, so there is no state in which it renders "not loading" first.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadFlags().then(states => {
      if (cancelled) return;
      setFlagStates(states);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function toggleFlag(key, on) {
    setFlagStates(s => ({ ...s, [key]: on }));
    const { error } = await setFlag(key, on);
    if (error) {
      showToast("Failed to save flag: " + error.message, "error");
      setFlagStates(s => ({ ...s, [key]: !on }));
      return;
    }
    logAudit("flag.toggle", "feature_flag", key, { on });
    showToast(`"${key}" turned ${on ? "on" : "off"}`);
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Feature Flags</h2>
        <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Turn features on or off instantly — no redeploy. Changes apply on each visitor's next load.</p>
      </div>
      {loading ? <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>Loading…</div> : (
        FEATURE_FLAGS.map(f => {
          const on = flagStates[f.key] ?? f.default;
          return (
            <div key={f.key} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{f.label} <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>({f.key})</span></p>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>{f.description}</p>
              </div>
              <button onClick={() => toggleFlag(f.key, !on)} aria-label={on ? "On" : "Off"}
                style={{ flexShrink: 0, width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", background: on ? "#22c55e" : "#cbd5e1", position: "relative", transition: "background 0.15s" }}>
                <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
