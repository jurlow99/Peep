import { useState, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { supabase } from "../supabase";

const YELLOW = "#facc15";
const BG = "#0a0a0a";
const CARD = "#111";
const BORDER = "#1e1e1e";
const SUPABASE_URL = "https://iuozujwtuzuwubhsnhix.supabase.co";

const stripePromise = loadStripe("pk_live_51TYZ17RgQH3TYy3Q51H1NPxizg1dHKpdRx0Vzes5cFI1jdrkCctrYp1ulMTuZL1Obxe9QBq0oKSEAHN7QNAvSSq700rFAyMhZn");

const CARD_OPTS = {
  style: {
    base: { color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontSize: "15px", fontSmoothing: "antialiased", "::placeholder": { color: "#555" } },
    invalid: { color: "#f87171" },
  },
};

const STEPS = ["Account", "Password", "Payment"];

function Logo() {
  return (
    <div style={{ textAlign: "center", marginBottom: 36 }}>
      <a href="/" style={{ textDecoration: "none" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: YELLOW }}>peep.</span>
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

function Input({ label, type = "text", value, onChange, placeholder, autoComplete, error, rightSlot, ...rest }) {
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

// ─── PAYMENT STEP (inside Elements) ───────────────────────────────────────────

const FOUNDING_PRICE_ID = "price_1TafqJRgQH3TYy3QOCovduJf";
const FOUNDING_ANNUAL_PRICE_ID = "price_1Tag3FRgQH3TYy3Ql0KuQNeA";
const STANDARD_PRICE_ID = "price_1TZkbxRgQH3TYy3QAYrrn4Ew";

function PaymentStep({ email, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(FOUNDING_PRICE_ID);

  async function handlePay(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    try {
      const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
        type: "card",
        card: elements.getElement(CardElement),
        billing_details: { email },
      });
      if (pmError) throw new Error(pmError.message);

      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ email, payment_method_id: paymentMethod.id, user_id: session.user.id, price_id: selectedPlan }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.status === "requires_action" && data.client_secret) {
        const { error: confirmError } = await stripe.confirmCardPayment(data.client_secret);
        if (confirmError) throw new Error(confirmError.message);
      }
      onSuccess();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handlePromo(e) {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError(null);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/redeem-promo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ code: promoCode }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPromoLoading(false);
      onSuccess();
    } catch (err) {
      setPromoError(err.message);
      setPromoLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#fff" }}>Start watching</h2>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "#888" }}>Unlimited access to everything on Peep.</p>

      {/* Plan selector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[
          { id: FOUNDING_PRICE_ID, label: "Founding Member", price: "$2.99", period: "/mo", badge: "LIMITED", perks: ["Ad-free forever", "Founding badge", "Lock in this price"] },
          { id: FOUNDING_ANNUAL_PRICE_ID, label: "Founding Annual", price: "$19.99", period: "/yr", badge: "BEST VALUE", perks: ["Ad-free forever", "Founding badge", "Save 44%"] },
          { id: STANDARD_PRICE_ID, label: "Standard", price: "$10", period: "/mo", badge: "FLEXIBLE", perks: ["All content", "Cancel anytime"] },
        ].map(plan => {
          const active = selectedPlan === plan.id;
          return (
            <div key={plan.id} onClick={() => setSelectedPlan(plan.id)}
              style={{ border: `2px solid ${active ? YELLOW : "#222"}`, borderRadius: 12, padding: "14px 12px", cursor: "pointer", background: active ? "rgba(250,204,21,0.04)" : "#0d0d0d", transition: "all 0.15s", position: "relative" }}>
              {plan.badge && (
                <span style={{ position: "absolute", top: -1, right: -1, background: YELLOW, color: "#0a0a0a", fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: "0 10px 0 8px", letterSpacing: 0.5 }}>
                  {plan.badge}
                </span>
              )}
              <div style={{ fontSize: 12, color: active ? YELLOW : "#666", fontWeight: 600, marginBottom: 6 }}>{plan.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{plan.price}</span>
                <span style={{ fontSize: 11, color: "#555" }}>{plan.period}</span>
              </div>
              {plan.perks.map(p => (
                <div key={p} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={active ? YELLOW : "#444"} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ fontSize: 11, color: active ? "#aaa" : "#555" }}>{p}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <form onSubmit={handlePay}>
        <label style={{ fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500, display: "block" }}>Card details</label>
        <div style={{ background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <CardElement options={CARD_OPTS} />
        </div>
        {error && <p style={{ color: "#f87171", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
        <button type="submit" disabled={loading || !stripe}
          style={{ ...btnStyle, opacity: loading || !stripe ? 0.7 : 1, cursor: loading || !stripe ? "not-allowed" : "pointer" }}>
          {loading ? "Processing…" : `Subscribe — ${selectedPlan === FOUNDING_PRICE_ID ? "$2.99/mo" : selectedPlan === FOUNDING_ANNUAL_PRICE_ID ? "$19.99/yr" : "$10/mo"}`}
        </button>
      </form>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        {!showPromo ? (
          <button onClick={() => setShowPromo(true)} style={{ background: "none", border: "none", color: "#444", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            Have a promo code?
          </button>
        ) : (
          <form onSubmit={handlePromo} style={{ display: "flex", gap: 8 }}>
            <input
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value); setPromoError(null); }}
              placeholder="Enter code"
              autoFocus
              style={{ flex: 1, background: "#0d0d0d", border: `1px solid ${promoError ? "#f87171" : BORDER}`, borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none", textTransform: "uppercase", letterSpacing: "0.05em" }}
            />
            <button type="submit" disabled={promoLoading}
              style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 16px", color: YELLOW, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              {promoLoading ? "…" : "Apply"}
            </button>
          </form>
        )}
        {promoError && <p style={{ color: "#f87171", fontSize: 12, margin: "6px 0 0" }}>{promoError}</p>}
      </div>

      <p style={{ margin: "16px 0 0", fontSize: 11, color: "#333", textAlign: "center" }}>
        {selectedPlan === FOUNDING_ANNUAL_PRICE_ID ? "Cancel anytime. Billed annually." : "Cancel anytime. Billed monthly."}
      </p>
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
    if (step !== 4) return;
    const t = setTimeout(() => { window.location.href = "/?subscribed=1"; }, 2500);
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

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
    if (signUpError) { setErrors({ submit: signUpError.message }); setLoading(false); return; }

    if (!data.user || data.user.identities?.length === 0) {
      setErrors({ submit: "An account with that email already exists. Try signing in instead." });
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").insert({
        id: data.user.id,
        username: name.trim().toLowerCase().replace(/\s+/g, "_"),
        email: email.toLowerCase(),
        full_name: name.trim(),
        ...(refCode ? { referred_by: refCode } : {}),
      });
    }

    await supabase.auth.signInWithPassword({ email, password });

    // Send confirmation email via Resend (Supabase SMTP is not configured)
    fetch(`${SUPABASE_URL}/functions/v1/send-confirmation-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ email }),
    });

    setLoading(false);
    setStep(3);
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>

      <div style={{ width: "min(460px, 100%)" }}>
        <Logo />

        {step < 4 && <StepBar step={step} />}

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "36px clamp(20px, 6vw, 40px)" }}>

          {/* Step 1: Account info */}
          {step === 1 && (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>Create your account</h2>
              <p style={{ margin: "0 0 28px", fontSize: 13, color: "#555" }}>Enter your name and email to get started.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Input label="Name" value={name} onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: null })); }} placeholder="Hi! What's your name?" autoComplete="name" error={errors.name} />
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

          {/* Step 3: Payment */}
          {step === 3 && (
            <Elements stripe={stripePromise}>
              <PaymentStep email={email} onSuccess={() => setStep(4)} />
            </Elements>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
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
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else {
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      window.location.href = redirect && redirect.startsWith("/") ? redirect : "/";
    }
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

        <button onClick={() => { window.history.replaceState({}, "", "/signin?redirect=/streamer"); document.querySelector("input[type=email]")?.focus(); }}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 16, width: "100%", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "20px clamp(20px, 6vw, 40px)", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#333"}
          onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>
          <div>
            <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#fff" }}>Are you a streamer?</p>
            <p style={{ margin: 0, fontSize: 12, color: "#555" }}>Sign in above to access your dashboard and stream key.</p>
          </div>
          <span style={{ flexShrink: 0, color: YELLOW, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>Use form above →</span>
        </button>
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
