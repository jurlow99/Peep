import { useState } from "react";
import { Wordmark } from "../components/Wordmark";
import { SUPABASE_URL, SUPABASE_ANON_KEY as ANON_KEY } from "../lib/config";

const YELLOW = "#facc15";
const PRESETS = [3, 5, 10, 25];

export function SupportPage() {
  const success = new URLSearchParams(window.location.search).get("success") === "1";
  const [selected, setSelected] = useState(5);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const amount = custom ? parseFloat(custom) : selected;

  async function handleSupport() {
    if (!amount || amount < 1) { setError("Minimum is $1."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-donation-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ amount }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      window.location.href = json.url;
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: "40px 16px" }}>
      <a href="/" style={{ textDecoration: "none", marginBottom: 48 }}>
        <Wordmark height={38} />
      </a>

      {success ? (
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🙏</div>
          <h1 style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 700, color: "#fff" }}>Thank you so much.</h1>
          <p style={{ margin: "0 0 32px", fontSize: 15, color: "#666", lineHeight: 1.7 }}>
            Your support genuinely helps keep Peep running and growing. It means a lot.
          </p>
          <a href="/" style={{ display: "inline-block", background: YELLOW, color: "#0a0a0a", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 10, textDecoration: "none" }}>
            Back to Peep →
          </a>
        </div>
      ) : (
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h1 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 700, color: "#fff" }}>Support Peep</h1>
            <p style={{ margin: 0, fontSize: 15, color: "#555", lineHeight: 1.7 }}>
              Peep is built and maintained by one developer. If you're enjoying it, any contribution helps keep the servers on and new features coming.
            </p>
          </div>

          {/* Preset amounts */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            {PRESETS.map(p => (
              <button key={p} onClick={() => { setSelected(p); setCustom(""); }}
                style={{ background: selected === p && !custom ? YELLOW : "rgba(255,255,255,0.04)", border: `1px solid ${selected === p && !custom ? YELLOW : "#1e1e1e"}`, borderRadius: 10, padding: "14px 0", color: selected === p && !custom ? "#0a0a0a" : "#888", fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit" }}>
                ${p}
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <div style={{ position: "relative", marginBottom: 20 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: custom ? "#fff" : "#333", fontSize: 15, fontWeight: 600, pointerEvents: "none" }}>$</span>
            <input
              type="number"
              min="1"
              placeholder="Custom amount"
              value={custom}
              onChange={e => { setCustom(e.target.value); setSelected(null); }}
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${custom ? YELLOW : "#1e1e1e"}`, borderRadius: 10, padding: "14px 14px 14px 28px", color: "#fff", fontSize: 15, outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s" }}
              onFocus={e => { if (!custom) e.target.style.borderColor = "#333"; }}
              onBlur={e => { if (!custom) e.target.style.borderColor = "#1e1e1e"; }}
            />
          </div>

          {error && <p style={{ margin: "0 0 14px", fontSize: 13, color: "#f87171", textAlign: "center" }}>{error}</p>}

          <button onClick={handleSupport} disabled={loading || !amount || amount < 1}
            style={{ width: "100%", background: amount >= 1 ? YELLOW : "#111", border: "none", borderRadius: 10, padding: "15px", color: amount >= 1 ? "#0a0a0a" : "#333", fontSize: 15, fontWeight: 700, cursor: amount >= 1 ? "pointer" : "not-allowed", transition: "all 0.15s", fontFamily: "inherit" }}>
            {loading ? "Redirecting…" : `Support with $${amount || "—"}`}
          </button>

          <p style={{ margin: "20px 0 0", fontSize: 12, color: "#2a2a2a", textAlign: "center", lineHeight: 1.6 }}>
            Processed securely by Stripe. No account required.
          </p>
        </div>
      )}
    </div>
  );
}
