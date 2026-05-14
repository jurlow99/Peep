import { useState } from "react";
import { supabase } from "../supabase";

export function AuthModal({ onClose }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  function switchMode(m) { setMode(m); setError(null); setMessage(null); }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else onClose();
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) setError(error.message);
      else setMessage("Account created! Check your email to confirm, then sign in.");
    }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#141414", border: "1px solid #242424", borderRadius: 16, padding: "44px clamp(20px, 8vw, 40px)", width: "min(420px, calc(100vw - 32px))", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 18, right: 18, background: "none", border: "none", color: "#555", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>×</button>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30 }}>
            peep<span style={{ color: "#ff4d4d" }}>.</span>
          </span>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#555" }}>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 28, background: "#0a0a0a", borderRadius: 8, padding: 4 }}>
          {[["signin", "Sign In"], ["signup", "Create Account"]].map(([m, label]) => (
            <button key={m} onClick={() => switchMode(m)} style={{ flex: 1, background: mode === m ? "#1e1e1e" : "transparent", border: "none", borderRadius: 6, padding: "9px", color: mode === m ? "#fff" : "#555", fontSize: 13, fontWeight: mode === m ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {mode === "signup" && (
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={input} onFocus={focusBorder} onBlur={blurBorder} />
            )}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" required style={input} onFocus={focusBorder} onBlur={blurBorder} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required minLength={6} style={input} onFocus={focusBorder} onBlur={blurBorder} />
          </div>

          {error && <p style={{ color: "#f87171", fontSize: 12, margin: "14px 0 0" }}>{error}</p>}
          {message && <p style={{ color: "#4ade80", fontSize: 12, margin: "14px 0 0" }}>{message}</p>}

          <button type="submit" disabled={loading} style={{ width: "100%", marginTop: 20, background: "#ff4d4d", border: "none", borderRadius: 8, padding: "13px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

const input = {
  width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a",
  borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 13, outline: "none",
};

function focusBorder(e) { e.target.style.borderColor = "#ff4d4d"; }
function blurBorder(e) { e.target.style.borderColor = "#2a2a2a"; }
