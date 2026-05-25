import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const YELLOW = "#facc15";
const BG = "#0a0a0a";
const CARD = "#111";
const BORDER = "#1e1e1e";

function StrengthMeter({ password }) {
  if (!password) return null;
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#22c55e"];
  const labels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? colors[score] : "#1e1e1e", transition: "background 0.2s" }} />
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: colors[score] }}>{labels[score]}</p>
    </div>
  );
}

export function SetPasswordPage() {
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [ready, setReady]         = useState(false);
  const [done, setDone]           = useState(false);

  useEffect(() => {
    // Supabase puts access_token + refresh_token in the URL hash after clicking the recovery link
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace("#", "?").slice(1));
    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type         = params.get("type");

    if (accessToken && refreshToken && type === "recovery") {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) setError("This link is invalid or has expired. Use Forgot Password on the sign-in page.");
          else setReady(true);
        });
    } else {
      // Maybe already have a session (e.g. navigated here directly)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setReady(true);
        else setError("No valid session. Use Forgot Password on the sign-in page to get a new link.");
      });
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Refresh session so new tokens are committed before navigating away
      await supabase.auth.refreshSession();
      setDone(true);
      setTimeout(() => { window.location.href = "/streamer"; }, 1500);
    }
  }

  const inp = {
    width: "100%", background: "#0d0d0d", border: `1px solid ${BORDER}`,
    borderRadius: 10, padding: "13px 14px", color: "#fff", fontSize: 14,
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ width: "min(420px, 100%)" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: YELLOW }}>peep.</span>
          </a>
        </div>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "36px clamp(20px, 6vw, 40px)" }}>
          {done ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(250,204,21,0.1)", border: "2px solid rgba(250,204,21,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 20px" }}>✓</div>
              <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>Password set!</h2>
              <p style={{ margin: 0, fontSize: 14, color: "#555" }}>Taking you to your dashboard…</p>
            </div>
          ) : (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Set your password</h2>
              <p style={{ margin: "0 0 28px", fontSize: 13, color: "#555", lineHeight: 1.6 }}>
                Choose a password for your Peep streamer account. You'll use it every time you sign in.
              </p>

              {error && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{error}</p>
                  {error.includes("expired") || error.includes("No valid") ? (
                    <a href="/signin" style={{ display: "inline-block", marginTop: 10, fontSize: 13, color: YELLOW, textDecoration: "none", fontWeight: 600 }}>Go to Sign In →</a>
                  ) : null}
                </div>
              )}

              {ready && !error && (
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>New password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPw ? "text" : "password"}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(null); }}
                        placeholder="Create a password"
                        autoComplete="new-password"
                        style={{ ...inp, paddingRight: 60 }}
                        autoFocus
                      />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", fontWeight: 600, padding: 0 }}>
                        {showPw ? "HIDE" : "SHOW"}
                      </button>
                    </div>
                    <StrengthMeter password={password} />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>Confirm password</label>
                    <input
                      type={showPw ? "text" : "password"}
                      value={confirm}
                      onChange={e => { setConfirm(e.target.value); setError(null); }}
                      placeholder="Repeat your password"
                      autoComplete="new-password"
                      style={{ ...inp, borderColor: confirm && confirm !== password ? "#f87171" : BORDER }}
                    />
                    {confirm && confirm !== password && (
                      <p style={{ margin: "5px 0 0", fontSize: 12, color: "#f87171" }}>Passwords don't match</p>
                    )}
                  </div>

                  <button type="submit" disabled={loading || !password || !confirm}
                    style={{ background: YELLOW, border: "none", borderRadius: 10, padding: "13px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: loading || !password || !confirm ? "not-allowed" : "pointer", opacity: loading || !password || !confirm ? 0.6 : 1, marginTop: 4 }}>
                    {loading ? "Saving…" : "Set Password & Go to Dashboard →"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
