import { useState } from "react";
import { Wordmark } from "../Wordmark";
import { supabase } from "../../supabase";
import { SUPABASE_URL } from "../../lib/config";

export function PasswordResetPage({ onDone, isInvite = false }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); return; }
    setDone(true);
    setTimeout(onDone, 2000);
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: 24 }}>
      <div style={{ width: "min(420px, 100%)" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <Wordmark height={38} />
        </div>
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: "36px clamp(20px, 6vw, 40px)" }}>
          {done ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#fff" }}>Password updated!</p>
              <p style={{ fontSize: 14, color: "#555" }}>Taking you back…</p>
            </div>
          ) : (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#fff" }}>{isInvite ? "Create your password" : "Set new password"}</h2>
              <p style={{ margin: "0 0 28px", fontSize: 13, color: "#555" }}>{isInvite ? "Welcome to Peep. Set a password to access your creator dashboard." : "Choose a new password for your account."}</p>
              <form onSubmit={handleSubmit}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>New Password</label>
                    <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(null); }} placeholder="At least 6 characters" required
                      style={{ width: "100%", background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 10, padding: "13px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>Confirm Password</label>
                    <input type="password" value={confirm} onChange={e => { setConfirm(e.target.value); setError(null); }} placeholder="Repeat new password" required
                      style={{ width: "100%", background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 10, padding: "13px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
                {error && <p style={{ color: "#f87171", fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
                <button type="submit" disabled={loading}
                  style={{ display: "block", width: "100%", marginTop: 24, background: "#facc15", border: "none", borderRadius: 10, padding: "13px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
                  {loading ? "Updating…" : "Update Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Email Verification Gate ──────────────────────────────────────────────────

export function EmailVerificationGate({ user }) {
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState(null);

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-confirmation-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResent(true);
    } catch (err) {
      setError(err.message);
    }
    setResending(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: 24 }}>
      <div style={{ width: "min(420px, 100%)", textAlign: "center" }}>
        <Wordmark height={34} style={{ marginBottom: 36 }} />

        <div style={{ fontSize: 48, marginBottom: 20 }}>✉️</div>
        <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 700, color: "#fff" }}>Check your inbox</h1>
        <p style={{ margin: "0 0 8px", fontSize: 14, color: "#666", lineHeight: 1.6 }}>
          We sent a confirmation link to
        </p>
        <p style={{ margin: "0 0 32px", fontSize: 14, fontWeight: 600, color: "#facc15" }}>{user.email}</p>
        <p style={{ margin: "0 0 32px", fontSize: 13, color: "#444", lineHeight: 1.6 }}>
          Click the link in that email to verify your account and start watching.
        </p>

        {resent ? (
          <p style={{ fontSize: 13, color: "#22c55e", marginBottom: 24 }}>Email resent — check your inbox.</p>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            style={{ width: "100%", background: "#facc15", border: "none", borderRadius: 10, padding: "13px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: resending ? "default" : "pointer", marginBottom: 12, opacity: resending ? 0.7 : 1 }}>
            {resending ? "Sending…" : "Resend verification email"}
          </button>
        )}

        {error && <p style={{ fontSize: 13, color: "#f87171", marginBottom: 12 }}>{error}</p>}

        <button
          onClick={handleSignOut}
          style={{ background: "transparent", border: "none", color: "#444", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
          Sign out and use a different account
        </button>

        <p style={{ marginTop: 28, fontSize: 12, color: "#2a2a2a" }}>
          Didn't get it? Check your spam folder or resend above.
        </p>
      </div>
    </div>
  );
}
