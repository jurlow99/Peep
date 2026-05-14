import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

const YELLOW = "#facc15";
const BG = "#0a0a0a";
const CARD = "#111";
const BORDER = "#1e1e1e";

function Logo() {
  return (
    <div style={{ textAlign: "center", marginBottom: 36 }}>
      <a href="/" style={{ textDecoration: "none" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: YELLOW }}>peep.</span>
      </a>
    </div>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return <p style={{ color: "#f87171", fontSize: 12, margin: "5px 0 0" }}>{msg}</p>;
}

function Input({ label, type = "text", value, onChange, placeholder, autoComplete, error, rightSlot, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {label && <label style={{ fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>{label}</label>}
      <div style={{ position: "relative" }}>
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          style={{
            width: "100%", background: "#0d0d0d", border: `1px solid ${error ? "#f87171" : focused ? YELLOW : BORDER}`,
            borderRadius: 10, padding: rightSlot ? "13px 44px 13px 14px" : "13px 14px",
            color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {rightSlot && (
          <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }}>
            {rightSlot}
          </div>
        )}
      </div>
      <FieldError msg={error} />
    </div>
  );
}

function StrengthMeter({ password }) {
  if (!password) return null;

  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const colors = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#22c55e"];
  const labels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? colors[score] : "#1e1e1e", transition: "background 0.2s" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 12, color: colors[score] }}>{labels[score]}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
        {[
          [checks.length, "8+ characters"],
          [checks.upper, "Uppercase letter"],
          [checks.lower, "Lowercase letter"],
          [checks.number, "Number"],
          [checks.special, "Special character"],
        ].map(([ok, label]) => (
          <p key={label} style={{ margin: 0, fontSize: 12, color: ok ? "#22c55e" : "#444", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10 }}>{ok ? "●" : "○"}</span>{label}
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── SIGN UP PAGE ─────────────────────────────────────────────────────────────

export function SignupPage() {
  const [step, setStep] = useState(1); // 1: account info, 2: password, 3: done
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState(null); // null | checking | available | taken | invalid
  const [emailStatus, setEmailStatus] = useState(null); // null | checking | taken
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const usernameTimer = useRef(null);
  const emailTimer = useRef(null);

  useEffect(() => {
    if (!username) { setUsernameStatus(null); return; }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) { setUsernameStatus("invalid"); return; }
    setUsernameStatus("checking");
    clearTimeout(usernameTimer.current);
    usernameTimer.current = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("username").eq("username", username.toLowerCase()).maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 400);
    return () => clearTimeout(usernameTimer.current);
  }, [username]);

  useEffect(() => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailStatus(null); return; }
    setEmailStatus("checking");
    clearTimeout(emailTimer.current);
    emailTimer.current = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("email").eq("email", email.toLowerCase()).maybeSingle();
      setEmailStatus(data ? "taken" : null);
    }, 400);
    return () => clearTimeout(emailTimer.current);
  }, [email]);

  const pwScore = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  function validateStep1() {
    const e = {};
    if (!email) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email.";
    else if (emailStatus === "checking") e.email = "Checking email…";
    else if (emailStatus === "taken") e.email = "An account with that email already exists.";
    if (!username) e.username = "Username is required.";
    else if (usernameStatus === "invalid") e.username = "3–20 chars, letters/numbers/underscores only.";
    else if (usernameStatus === "taken") e.username = "Username already taken.";
    else if (usernameStatus === "checking") e.username = "Still checking availability…";
    return e;
  }

  function validateStep2() {
    const e = {};
    if (pwScore < 3) e.password = "Password is too weak — meet at least 3 requirements.";
    if (password !== confirm) e.confirm = "Passwords don't match.";
    return e;
  }

  function nextStep() {
    const e = step === 1 ? validateStep1() : {};
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setStep(s => s + 1);
  }

  async function handleSignup() {
    const e = validateStep2();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) { setErrors({ submit: signUpError.message }); setLoading(false); return; }

    if (!data.user || data.user.identities?.length === 0) {
      setErrors({ submit: "An account with that email already exists. Try signing in instead." });
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        full_name: "",
      });
      if (profileError) { setErrors({ submit: profileError.message }); setLoading(false); return; }
    }

    setLoading(false);
    setStep(3);
  }

  const stepLabels = ["Account Info", "Password", "Done"];

  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ width: "min(460px, 100%)" }}>
        <Logo />

        {/* Step indicators */}
        {step < 3 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 32 }}>
            {stepLabels.slice(0, 2).map((label, i) => {
              const n = i + 1;
              const active = step === n;
              const done = step > n;
              return (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: done ? YELLOW : active ? YELLOW : "#1e1e1e", border: `2px solid ${done || active ? YELLOW : "#333"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: done || active ? "#0a0a0a" : "#555", transition: "all 0.2s" }}>
                      {done ? "✓" : n}
                    </div>
                    <span style={{ fontSize: 12, color: active ? "#fff" : done ? YELLOW : "#555", fontWeight: active ? 600 : 400 }}>{label}</span>
                  </div>
                  {i < 1 && <div style={{ width: 24, height: 1, background: done ? YELLOW : "#1e1e1e" }} />}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "36px clamp(20px, 6vw, 40px)" }}>

          {/* Step 1: Account info */}
          {step === 1 && (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Create your account</h2>
              <p style={{ margin: "0 0 28px", fontSize: 13, color: "#555" }}>Choose a username and enter your email.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Input
                  label="Username"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setErrors(prev => ({ ...prev, username: null })); }}
                  placeholder="yourname"
                  autoComplete="username"
                  error={errors.username}
                  rightSlot={
                    username ? (
                      <span style={{ fontSize: 13 }}>
                        {usernameStatus === "checking" && <span style={{ color: "#555" }}>⋯</span>}
                        {usernameStatus === "available" && <span style={{ color: "#22c55e" }}>✓</span>}
                        {usernameStatus === "taken" && <span style={{ color: "#f87171" }}>✗</span>}
                        {usernameStatus === "invalid" && <span style={{ color: "#f97316" }}>!</span>}
                      </span>
                    ) : null
                  }
                />
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: null })); }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  error={errors.email || (emailStatus === "taken" ? "An account with that email already exists." : null)}
                  rightSlot={
                    emailStatus === "checking" ? <span style={{ color: "#555", fontSize: 13 }}>⋯</span> :
                    emailStatus === "taken" ? <span style={{ color: "#f87171", fontSize: 13 }}>✗</span> : null
                  }
                />
              </div>
              <button onClick={nextStep} style={btnStyle}>Continue →</button>
              <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 13, color: "#555" }}>
                Already have an account?{" "}
                <a href="/signin" style={{ color: YELLOW, textDecoration: "none", fontWeight: 600 }}>Sign in</a>
              </p>
            </>
          )}

          {/* Step 2: Password */}
          {step === 2 && (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Create a password</h2>
              <p style={{ margin: "0 0 28px", fontSize: 13, color: "#555" }}>Make it strong. You'll need it to sign in.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <Input
                    label="Password"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: null })); }}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    error={errors.password}
                    rightSlot={
                      <button type="button" onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", fontWeight: 600, padding: 0 }}>
                        {showPw ? "HIDE" : "SHOW"}
                      </button>
                    }
                  />
                  <StrengthMeter password={password} />
                </div>
                <Input
                  label="Confirm password"
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setErrors(prev => ({ ...prev, confirm: null })); }}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  error={errors.confirm || (confirm && confirm !== password ? "Passwords don't match" : null)}
                />
              </div>
              {errors.submit && <p style={{ color: "#f87171", fontSize: 13, margin: "16px 0 0" }}>{errors.submit}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button onClick={() => setStep(1)} style={{ ...btnStyle, background: "#1a1a1a", color: "#ccc", flex: "0 0 auto", width: "auto", padding: "13px 20px" }}>← Back</button>
                <button onClick={handleSignup} disabled={loading} style={{ ...btnStyle, flex: 1, margin: 0, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
                  {loading ? "Creating account…" : "Create Account"}
                </button>
              </div>
            </>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#0d2010", border: "2px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 26 }}>
                ✓
              </div>
              <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 700 }}>You're all set!</h2>
              <p style={{ margin: "0 0 8px", fontSize: 14, color: "#888", lineHeight: 1.6 }}>
                We sent a confirmation email to <strong style={{ color: "#ccc" }}>{email}</strong>.
              </p>
              <p style={{ margin: "0 0 28px", fontSize: 13, color: "#555", lineHeight: 1.6 }}>
                Click the link in your email to verify your account, then sign in.
              </p>
              <a href="/signin" style={{ display: "block", background: YELLOW, borderRadius: 10, padding: "13px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
                Go to Sign In →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SIGN IN PAGE ─────────────────────────────────────────────────────────────

export function SigninPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else window.location.href = "/";
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ width: "min(420px, 100%)" }}>
        <Logo />

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "36px clamp(20px, 6vw, 40px)" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Welcome back</h2>
          <p style={{ margin: "0 0 28px", fontSize: 13, color: "#555" }}>Sign in to your peep account.</p>

          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
              <Input
                label="Password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                required
                rightSlot={
                  <button type="button" onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", fontWeight: 600, padding: 0 }}>
                    {showPw ? "HIDE" : "SHOW"}
                  </button>
                }
              />
            </div>

            {error && <p style={{ color: "#f87171", fontSize: 13, margin: "14px 0 0" }}>{error}</p>}

            <button type="submit" disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 13, color: "#555" }}>
            Don't have an account?{" "}
            <a href="/signup" style={{ color: YELLOW, textDecoration: "none", fontWeight: 600 }}>Create one</a>
          </p>
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  display: "block", width: "100%", marginTop: 24,
  background: YELLOW, border: "none", borderRadius: 10,
  padding: "13px", color: "#0a0a0a", fontSize: 14,
  fontWeight: 700, cursor: "pointer",
};
