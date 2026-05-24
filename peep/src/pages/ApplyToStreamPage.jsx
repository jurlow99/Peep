import { useState } from "react";
import { supabase } from "../supabase";

const BG = "#0a0a0a";
const YELLOW = "#facc15";
const BORDER = "#1e1e1e";

export function ApplyToStreamPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [why, setWhy] = useState("");
  const [social, setSocial] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !why.trim()) return;
    setLoading(true);
    setError(null);

    const { error: insertErr } = await supabase.from("streamer_applications").insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      why_they_want_to_stream: why.trim(),
      social_links: social.trim() || null,
    });

    if (insertErr) {
      setError("Something went wrong. Try again.");
    } else {
      setDone(true);
    }
    setLoading(false);
  }

  const inp = {
    width: "100%", background: "#0d0d0d", border: `1px solid ${BORDER}`,
    borderRadius: 10, padding: "13px 14px", color: "#fff", fontSize: 14,
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
    resize: "vertical",
  };

  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ width: "min(520px, 100%)" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: YELLOW }}>peep.</span>
          </a>
        </div>

        {done ? (
          <div style={{ background: "#111", border: `1px solid ${BORDER}`, borderRadius: 16, padding: "48px 36px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>🎬</div>
            <h2 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 700, color: "#fff" }}>Application received!</h2>
            <p style={{ margin: "0 0 8px", fontSize: 14, color: "#888", lineHeight: 1.6 }}>
              We'll review your application and get back to you within 5 business days.
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#555" }}>Keep an eye on <strong style={{ color: "#aaa" }}>{email}</strong></p>
            <a href="/" style={{ display: "inline-block", marginTop: 28, background: YELLOW, color: "#0a0a0a", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 10, textDecoration: "none" }}>
              Back to Peep
            </a>
          </div>
        ) : (
          <div style={{ background: "#111", border: `1px solid ${BORDER}`, borderRadius: 16, padding: "40px clamp(20px,6vw,40px)" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, color: "#fff" }}>Apply to stream on Peep</h2>
            <p style={{ margin: "0 0 32px", fontSize: 13, color: "#555", lineHeight: 1.6 }}>
              Peep Live is invite-only. Tell us about yourself and we'll review your application within 5 business days.
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name or channel name" required style={inp} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required style={inp} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>Why do you want to stream on Peep?</label>
                <textarea value={why} onChange={e => setWhy(e.target.value)} placeholder="Tell us what you'd stream, why it fits Peep, and anything else relevant..." required rows={5} style={inp} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>Social / YouTube links <span style={{ color: "#444" }}>(optional)</span></label>
                <textarea value={social} onChange={e => setSocial(e.target.value)} placeholder="Twitter, YouTube, Twitch, TikTok — anything that shows your work" rows={3} style={inp} />
              </div>

              {error && <p style={{ margin: 0, color: "#f87171", fontSize: 13 }}>{error}</p>}

              <button type="submit" disabled={loading || !name.trim() || !email.trim() || !why.trim()}
                style={{ background: YELLOW, border: "none", borderRadius: 10, padding: "14px", color: "#0a0a0a", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading || !name.trim() || !email.trim() || !why.trim() ? 0.6 : 1, marginTop: 6 }}>
                {loading ? "Submitting…" : "Submit Application"}
              </button>
            </form>

            <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 13, color: "#444" }}>
              Already a creator?{" "}
              <a href="/signin" style={{ color: YELLOW, textDecoration: "none", fontWeight: 600 }}>Sign in</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
