import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { Wordmark } from "./Wordmark";

function getStrength(pw) {
  let score = 0;
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
  score = Object.values(checks).filter(Boolean).length;
  return { score, checks };
}

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
const STRENGTH_COLORS = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#22c55e"];

export function AuthModal({ onClose }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState(null); // null | "checking" | "available" | "taken" | "invalid"
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const usernameTimer = useRef(null);

  function switchMode(m) {
    setMode(m);
    setError(null);
    setMessage(null);
    setUsername("");
    setUsernameStatus(null);
    setPassword("");
    setConfirm("");
  }

  useEffect(() => {
    if (mode !== "signup") return;
    if (!username) { setUsernameStatus(null); return; }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setUsernameStatus("invalid");
      return;
    }

    setUsernameStatus("checking");
    clearTimeout(usernameTimer.current);
    usernameTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", username.toLowerCase())
        .maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 400);

    return () => clearTimeout(usernameTimer.current);
  }, [username, mode]);

  const { score, checks } = getStrength(password);

  function validate() {
    if (mode === "signup") {
      if (!username) return "Username is required.";
      if (usernameStatus === "invalid") return "Username must be 3–20 chars, letters/numbers/underscores only.";
      if (usernameStatus === "taken") return "That username is already taken.";
      if (usernameStatus === "checking") return "Still checking username…";
      if (score < 3) return "Password is too weak. Meet at least 3 of the requirements below.";
      if (password !== confirm) return "Passwords don't match.";
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else onClose();
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) { setError(signUpError.message); setLoading(false); return; }

      if (data.user) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          username: username.toLowerCase(),
          full_name: "",
        }, { onConflict: "id", ignoreDuplicates: true });
        if (profileError) setError(profileError.message);
        else setMessage("Account created! Check your email to confirm, then sign in.");
      }
    }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#141414", border: "1px solid #242424", borderRadius: 16, padding: "40px clamp(20px, 8vw, 40px)", width: "min(440px, 100%)", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 18, right: 18, background: "none", border: "none", color: "#555", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>×</button>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Wordmark height={32} style={{ margin: "0 auto" }} />
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#555" }}>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        <div style={{ display: "flex", gap: 0, marginBottom: 24, background: "#0a0a0a", borderRadius: 8, padding: 4 }}>
          {[["signin", "Sign In"], ["signup", "Create Account"]].map(([m, label]) => (
            <button key={m} onClick={() => switchMode(m)} style={{ flex: 1, background: mode === m ? "#1e1e1e" : "transparent", border: "none", borderRadius: 6, padding: "9px", color: mode === m ? "#fff" : "#555", fontSize: 13, fontWeight: mode === m ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {mode === "signup" && (
              <div>
                <div style={{ position: "relative" }}>
                  <input
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Username"
                    autoComplete="username"
                    style={{ ...inputStyle, paddingRight: 36 }}
                    onFocus={focusBorder}
                    onBlur={blurBorder}
                  />
                  {username && (
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>
                      {usernameStatus === "checking" && <span style={{ color: "#555" }}>⋯</span>}
                      {usernameStatus === "available" && <span style={{ color: "#22c55e" }}>✓</span>}
                      {usernameStatus === "taken" && <span style={{ color: "#ef4444" }}>✗</span>}
                      {usernameStatus === "invalid" && <span style={{ color: "#f97316" }}>!</span>}
                    </span>
                  )}
                </div>
                {usernameStatus === "invalid" && (
                  <p style={{ color: "#f97316", fontSize: 11, marginTop: 4 }}>3–20 chars, letters/numbers/underscores only</p>
                )}
                {usernameStatus === "taken" && (
                  <p style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>Username already taken</p>
                )}
                {usernameStatus === "available" && (
                  <p style={{ color: "#22c55e", fontSize: 11, marginTop: 4 }}>Username available</p>
                )}
              </div>
            )}

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              required
              autoComplete="email"
              style={inputStyle}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />

            <div>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  style={{ ...inputStyle, paddingRight: 44 }}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer", padding: 0 }}>
                  {showPw ? "HIDE" : "SHOW"}
                </button>
              </div>

              {mode === "signup" && password && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? STRENGTH_COLORS[score] : "#2a2a2a", transition: "background 0.2s" }} />
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: STRENGTH_COLORS[score], margin: "0 0 8px" }}>{STRENGTH_LABELS[score]}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px" }}>
                    {[
                      [checks.length, "8+ characters"],
                      [checks.upper, "Uppercase letter"],
                      [checks.lower, "Lowercase letter"],
                      [checks.number, "Number"],
                      [checks.special, "Special character"],
                    ].map(([ok, label]) => (
                      <p key={label} style={{ margin: 0, fontSize: 11, color: ok ? "#22c55e" : "#555", display: "flex", alignItems: "center", gap: 4 }}>
                        <span>{ok ? "✓" : "○"}</span> {label}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {mode === "signup" && (
              <div>
                <input
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Confirm password"
                  required
                  autoComplete="new-password"
                  style={{ ...inputStyle, borderColor: confirm && confirm !== password ? "#ef4444" : "#2a2a2a" }}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
                {confirm && confirm !== password && (
                  <p style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>Passwords don't match</p>
                )}
              </div>
            )}
          </div>

          {error && <p style={{ color: "#f87171", fontSize: 12, margin: "14px 0 0" }}>{error}</p>}
          {message && <p style={{ color: "#4ade80", fontSize: 12, margin: "14px 0 0" }}>{message}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", marginTop: 20, background: "#facc15", border: "none", borderRadius: 8, padding: "13px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "#0a0a0a",
  border: "1px solid #2a2a2a",
  borderRadius: 8,
  padding: "12px 14px",
  color: "#fff",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

function focusBorder(e) { e.target.style.borderColor = "#facc15"; }
function blurBorder(e) { e.target.style.borderColor = "#2a2a2a"; }
