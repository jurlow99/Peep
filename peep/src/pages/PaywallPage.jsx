import { useState } from "react";
import { supabase } from "../supabase";

const SUPABASE_URL = "https://iuozujwtuzuwubhsnhix.supabase.co";

export function PaywallPage({ user, onSubscribed, onSignOut }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          email: user.email,
          origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "No checkout URL returned.");
        setLoading(false);
      }
    } catch (e) {
      setError(e.message || "Network error.");
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: "#facc15" }}>peep.</span>
        </div>

        {/* Card */}
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 20, padding: "40px 36px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>

          <h1 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 700, color: "#fff" }}>Start Watching</h1>
          <p style={{ margin: "0 0 28px", fontSize: 14, color: "#555", lineHeight: 1.6 }}>
            Get unlimited access to all movies, series, live TV, and podcasts on peep.
          </p>

          {/* Price */}
          <div style={{ background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 12, padding: "20px", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 42, fontWeight: 700, color: "#fff" }}>$10</span>
              <span style={{ fontSize: 14, color: "#555" }}>/month</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#444" }}>Cancel anytime</p>
          </div>

          {/* Features */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28, textAlign: "left" }}>
            {["All movies & series", "Live TV channels", "Podcasts", "New content weekly", "Watch on any device"].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(250,204,21,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <span style={{ fontSize: 13, color: "#888" }}>{f}</span>
              </div>
            ))}
          </div>

          {error && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <button onClick={startCheckout} disabled={loading}
            style={{ width: "100%", background: "#facc15", border: "none", borderRadius: 10, padding: "14px", color: "#0a0a0a", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, transition: "opacity 0.15s" }}>
            {loading ? "Redirecting…" : "Subscribe for $10/mo"}
          </button>

          <p style={{ margin: "16px 0 0", fontSize: 12, color: "#333" }}>
            Signed in as {user.email} ·{" "}
            <span onClick={onSignOut} style={{ color: "#555", cursor: "pointer", textDecoration: "underline" }}>Sign out</span>
          </p>
        </div>
      </div>
    </div>
  );
}
