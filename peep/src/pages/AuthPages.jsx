import { useState, useEffect, useRef } from "react";
import { Wordmark } from "../components/Wordmark";
import { supabase } from "../supabase";
import { SUPABASE_URL } from "../lib/config";

const YELLOW = "#facc15";
const BG = "#0a0a0a";
const CARD = "#111";
const BORDER = "#1e1e1e";
const TURNSTILE_SITE_KEY = "0x4AAAAAADlZlihNdneLgny1";

function useTurnstile() {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const resolveRef = useRef(null);

  useEffect(() => {
    function initWidget() {
      if (!containerRef.current || !window.turnstile || widgetIdRef.current !== null) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        size: "invisible",
        callback: (token) => { resolveRef.current?.(token); resolveRef.current = null; },
        "error-callback": () => { resolveRef.current?.(null); resolveRef.current = null; },
      });
    }

    if (window.turnstile) {
      initWidget();
    } else if (!document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = initWidget;
      document.head.appendChild(s);
    } else {
      const t = setInterval(() => { if (window.turnstile) { clearInterval(t); initWidget(); } }, 100);
      return () => clearInterval(t);
    }

    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
        widgetIdRef.current = null;
      }
    };
  }, []);

  async function getToken() {
    if (!window.turnstile || widgetIdRef.current === null) return null;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      window.turnstile.execute(widgetIdRef.current);
      setTimeout(() => { resolveRef.current?.(null); resolveRef.current = null; }, 15000);
    });
  }

  return { containerRef, getToken };
}

const STEPS = ["Account", "Password"];

function Logo() {
  return (
    <div style={{ textAlign: "center", marginBottom: 36 }}>
      <a href="/" style={{ textDecoration: "none" }}>
        <Wordmark height={38} />
      </a>
    </div>
  );
}

function StepBar({ step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 32 }}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: done || active ? YELLOW : "#1e1e1e", border: `2px solid ${done || active ? YELLOW : "#333"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: done || active ? "#0a0a0a" : "#555", transition: "all 0.2s" }}>
                {done ? "✓" : n}
              </div>
              <span style={{ fontSize: 12, color: active ? "#fff" : done ? YELLOW : "#555", fontWeight: active ? 600 : 400 }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ width: 24, height: 1, background: done ? YELLOW : "#1e1e1e" }} />}
          </div>
        );
      })}
    </div>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return <p style={{ color: "#f87171", fontSize: 12, margin: "5px 0 0" }}>{msg}</p>;
}

function Input({ label, type = "text", value, onChange, placeholder, autoComplete, error, rightSlot, hint, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {label && <label style={{ fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>{label}</label>}
      <div style={{ position: "relative" }}>
        <input
          type={type} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete}
          style={{ width: "100%", background: "#0d0d0d", border: `1px solid ${error ? "#f87171" : focused ? YELLOW : BORDER}`, borderRadius: 10, padding: rightSlot ? "13px 44px 13px 14px" : "13px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} {...rest}
        />
        {rightSlot && <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }}>{rightSlot}</div>}
      </div>
      {hint && !error && <p style={{ margin: "6px 0 0", fontSize: 11, color: "#555", lineHeight: 1.4 }}>{hint}</p>}
      <FieldError msg={error} />
    </div>
  );
}

function StrengthMeter({ password }) {
  if (!password) return null;
  const checks = { length: password.length >= 8, upper: /[A-Z]/.test(password), lower: /[a-z]/.test(password), number: /[0-9]/.test(password), special: /[^A-Za-z0-9]/.test(password) };
  const score = Object.values(checks).filter(Boolean).length;
  const colors = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#22c55e"];
  const labels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[1,2,3,4,5].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? colors[score] : "#1e1e1e", transition: "background 0.2s" }} />)}
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: colors[score] }}>{labels[score]}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
        {[[checks.length,"8+ characters"],[checks.upper,"Uppercase letter"],[checks.lower,"Lowercase letter"],[checks.number,"Number"],[checks.special,"Special character"]].map(([ok, lbl]) => (
          <p key={lbl} style={{ margin: 0, fontSize: 12, color: ok ? "#22c55e" : "#444", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10 }}>{ok ? "●" : "○"}</span>{lbl}
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── SIGN UP PAGE ─────────────────────────────────────────────────────────────

export function SignupPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [emailStatus, setEmailStatus] = useState(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const emailTimer = useRef(null);
  const refCode = new URLSearchParams(window.location.search).get("ref")?.toUpperCase() || null;
  const { containerRef: turnstileRef, getToken } = useTurnstile();

  useEffect(() => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailStatus(null); return; }
    setEmailStatus("checking");
    clearTimeout(emailTimer.current);
    emailTimer.current = setTimeout(async () => {
      const { data, error } = await supabase.from("profiles").select("email").eq("email", email.toLowerCase()).maybeSingle();
      if (error) { setEmailStatus(null); return; }
      setEmailStatus(data ? "taken" : null);
    }, 400);
    return () => clearTimeout(emailTimer.current);
  }, [email]);

  // Auto-redirect after success
  useEffect(() => {
    if (step !== 3) return;
    const t = setTimeout(() => { window.location.href = "/"; }, 2000);
    return () => clearTimeout(t);
  }, [step]);

  const pwScore = [password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;

  function validateStep1() {
    const e = {};
    if (!name.trim()) e.name = "Name is required.";
    else if (name.trim().length < 2) e.name = "Name must be at least 2 characters.";
    if (!email) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email.";
    else if (emailStatus === "checking") e.email = "Checking email…";
    else if (emailStatus === "taken") e.email = "An account with that email already exists.";
    return e;
  }

  function validateStep2() {
    const e = {};
    if (pwScore < 3) e.password = "Password is too weak — meet at least 3 requirements.";
    if (password !== confirm) e.confirm = "Passwords don't match.";
    return e;
  }

  function nextStep() {
    const e = validateStep1();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setStep(2);
  }

  async function handleCreateAccount() {
    const e = validateStep2();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setLoading(true);

    // Turnstile runs in background — don't block signup on it
    getToken().then(tsToken => {
      if (!tsToken) return;
      fetch(`${SUPABASE_URL}/functions/v1/verify-turnstile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ token: tsToken }),
      }).catch(() => null);
    });

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
    if (signUpError) { setErrors({ submit: signUpError.message }); setLoading(false); return; }

    if (!data.user || data.user.identities?.length === 0) {
      setErrors({ submit: "An account with that email already exists. Try signing in instead." });
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        username: name.trim().toLowerCase().replace(/\s+/g, "_"),
        email: email.toLowerCase(),
        full_name: name.trim(),
        ...(refCode ? { referred_by: refCode } : {}),
      }, { onConflict: "id", ignoreDuplicates: true });
    }

    await supabase.auth.signInWithPassword({ email, password });

    // Fire-and-forget welcome email — not blocking
    fetch(`${SUPABASE_URL}/functions/v1/send-confirmation-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ email, name: name.trim() }),
    });

    setLoading(false);
    setStep(3); // success
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>

      <div style={{ width: "min(460px, 100%)" }}>
        <Logo />

        {step < 3 && <StepBar step={step} />}

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "36px clamp(20px, 6vw, 40px)" }}>
          <div ref={turnstileRef} style={{ display: "none" }} />

          {/* Step 1: Account info */}
          {step === 1 && (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Create your account</h2>
              <p style={{ margin: "0 0 28px", fontSize: 13, color: "#555" }}>Enter your name and email to get started.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Input label="Name" value={name} onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: null })); }} placeholder="Hi! What's your name?" autoComplete="name" error={errors.name} hint="This is your public display name — it's what other viewers see in live chat and comments." />
                <Input label="Email" type="email" value={email} onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: null })); }} placeholder="you@example.com" autoComplete="email"
                  error={errors.email || (emailStatus === "taken" ? "An account with that email already exists." : null)}
                  rightSlot={emailStatus === "checking" ? <span style={{ color: "#555", fontSize: 13 }}>⋯</span> : emailStatus === "taken" ? <span style={{ color: "#f87171", fontSize: 13 }}>✗</span> : null}
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
                  <Input label="Password" type={showPw ? "text" : "password"} value={password}
                    onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: null })); }}
                    placeholder="Create a password" autoComplete="new-password" error={errors.password}
                    rightSlot={<button type="button" onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", fontWeight: 600, padding: 0 }}>{showPw ? "HIDE" : "SHOW"}</button>}
                  />
                  <StrengthMeter password={password} />
                </div>
                <Input label="Confirm password" type={showPw ? "text" : "password"} value={confirm}
                  onChange={e => { setConfirm(e.target.value); setErrors(p => ({ ...p, confirm: null })); }}
                  placeholder="Repeat your password" autoComplete="new-password"
                  error={errors.confirm || (confirm && confirm !== password ? "Passwords don't match" : null)}
                />
              </div>
              {errors.submit && <p style={{ color: "#f87171", fontSize: 13, margin: "16px 0 0" }}>{errors.submit}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button onClick={() => setStep(1)} style={{ ...btnStyle, background: "#1a1a1a", color: "#ccc", flex: "0 0 auto", width: "auto", padding: "13px 20px", margin: 0 }}>← Back</button>
                <button onClick={handleCreateAccount} disabled={loading} style={{ ...btnStyle, flex: 1, margin: 0, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
                  {loading ? "Setting up…" : "Continue →"}
                </button>
              </div>
            </>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(250,204,21,0.1)", border: "2px solid rgba(250,204,21,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 28 }}>
                🎬
              </div>
              <h2 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 700 }}>You're in!</h2>
              <p style={{ margin: "0 0 6px", fontSize: 14, color: "#888" }}>Welcome to Peep, {name.split(" ")[0]}.</p>
              <p style={{ margin: "0 0 28px", fontSize: 13, color: "#555" }}>Taking you to the app…</p>
              <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: YELLOW, opacity: 0.4, animation: `pulse 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </div>
              <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
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
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const { containerRef: turnstileRef, getToken } = useTurnstile();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    setLoading(true);

    // Turnstile runs in background — don't block signin on it
    getToken().then(tsToken => {
      if (!tsToken) return;
      fetch(`${SUPABASE_URL}/functions/v1/verify-turnstile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ token: tsToken }),
      }).catch(() => null);
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }

    const redirect = new URLSearchParams(window.location.search).get("redirect");
    window.location.href = redirect && redirect.startsWith("/") ? redirect : "/";
  }

  async function handleReset(e) {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email above first."); return; }
    setResetLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-reset-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResetSent(true);
    } catch (err) {
      setError(err.message);
    }
    setResetLoading(false);
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>

      <div style={{ width: "min(420px, 100%)" }}>
        <Logo />

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "36px clamp(20px, 6vw, 40px)" }}>
          <div ref={turnstileRef} style={{ display: "none" }} />
          <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Welcome back</h2>
          <p style={{ margin: "0 0 28px", fontSize: 13, color: "#555" }}>Sign in to your peep account.</p>

          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Input label="Email" type="email" value={email} onChange={e => { setEmail(e.target.value); setError(null); setResetSent(false); }} placeholder="you@example.com" autoComplete="email" required />
              <div>
                <Input label="Password" type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" required
                  rightSlot={<button type="button" onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", fontWeight: 600, padding: 0 }}>{showPw ? "HIDE" : "SHOW"}</button>}
                />
                <div style={{ textAlign: "right", marginTop: 6 }}>
                  <button type="button" onClick={handleReset} disabled={resetLoading}
                    style={{ background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                    {resetLoading ? "Sending…" : "Forgot password?"}
                  </button>
                </div>
              </div>
            </div>
            {resetSent && <p style={{ color: "#4ade80", fontSize: 13, margin: "12px 0 0" }}>Reset link sent — check your inbox.</p>}
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

// ─── STREAMER SIGN IN PAGE ────────────────────────────────────────────────────

export function StreamerSignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else { window.location.href = "/streamer"; }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email above first."); return; }
    setResetLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-reset-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResetSent(true);
    } catch (err) {
      setError(err.message);
    }
    setResetLoading(false);
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
      <div style={{ width: "min(420px, 100%)" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <Wordmark height={38} />
          </a>
        </div>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "36px clamp(20px, 6vw, 40px)" }}>
          <div style={{ marginBottom: 28 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }}>Creator Access</p>
            <h2 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, color: "#fff" }}>Streaming Portal</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#555" }}>Sign in to access your dashboard and stream key.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Input label="Email" type="email" value={email} onChange={e => { setEmail(e.target.value); setError(null); setResetSent(false); }} placeholder="you@example.com" autoComplete="email" required />
              <div>
                <Input label="Password" type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" required
                  rightSlot={<button type="button" onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", fontWeight: 600, padding: 0 }}>{showPw ? "HIDE" : "SHOW"}</button>}
                />
                <div style={{ textAlign: "right", marginTop: 6 }}>
                  <button type="button" onClick={handleReset} disabled={resetLoading}
                    style={{ background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                    {resetLoading ? "Sending…" : "Forgot password?"}
                  </button>
                </div>
              </div>
            </div>
            {resetSent && <p style={{ color: "#4ade80", fontSize: 13, margin: "12px 0 0" }}>Reset link sent — check your inbox.</p>}
            {error && <p style={{ color: "#f87171", fontSize: 13, margin: "14px 0 0" }}>{error}</p>}
            <button type="submit" disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Signing in…" : "Sign In to Portal"}
            </button>
          </form>

          <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 13, color: "#555" }}>
            Not a streamer?{" "}
            <a href="/signin" style={{ color: YELLOW, textDecoration: "none", fontWeight: 600 }}>Regular sign in</a>
          </p>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "#333" }}>
          Want to stream on Peep?{" "}
          <a href="/create-channel" style={{ color: "#555", textDecoration: "underline" }}>Create your channel</a>
        </p>
      </div>
    </div>
  );
}
