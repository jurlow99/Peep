import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { supabase } from "../supabase";

const SUPABASE_URL = "https://iuozujwtuzuwubhsnhix.supabase.co";
const stripePromise = loadStripe("pk_live_51TYZ17RgQH3TYy3Q51H1NPxizg1dHKpdRx0Vzes5cFI1jdrkCctrYp1ulMTuZL1Obxe9QBq0oKSEAHN7QNAvSSq700rFAyMhZn");
const FOUNDING_PRICE_ID = "price_1TafqJRgQH3TYy3QOCovduJf";
const FOUNDING_ANNUAL_PRICE_ID = "price_1Tag3FRgQH3TYy3Ql0KuQNeA";
const STANDARD_PRICE_ID = "price_1TZkbxRgQH3TYy3QAYrrn4Ew";
const YELLOW = "#facc15";

const CARD_OPTIONS = {
  style: {
    base: {
      color: "#fff",
      fontFamily: "'Space Grotesk', sans-serif",
      fontSize: "15px",
      fontSmoothing: "antialiased",
      "::placeholder": { color: "#555" },
    },
    invalid: { color: "#f87171" },
  },
};

function CheckoutForm({ user, onSignOut }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(FOUNDING_PRICE_ID);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

    try {
      const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
        type: "card",
        card: elements.getElement(CardElement),
        billing_details: { email: user.email },
      });
      if (pmError) throw new Error(pmError.message);

      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: user.id, email: user.email, payment_method_id: paymentMethod.id, price_id: selectedPlan }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.status === "requires_action" && data.client_secret) {
        const { error: confirmError } = await stripe.confirmCardPayment(data.client_secret);
        if (confirmError) throw new Error(confirmError.message);
      }

      window.location.href = "/?subscribed=1";
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
      window.location.href = "/?subscribed=1";
    } catch (err) {
      setPromoError(err.message);
      setPromoLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <CardElement options={CARD_OPTIONS} />
        </div>

        {error && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</p>}

        <button type="submit" disabled={loading || !stripe}
          style={{ width: "100%", background: "#facc15", border: "none", borderRadius: 10, padding: "14px", color: "#0a0a0a", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, transition: "opacity 0.15s" }}>
          {loading ? "Processing…" : `Subscribe — ${selectedPlan === FOUNDING_PRICE_ID ? "$2.99/mo" : selectedPlan === FOUNDING_ANNUAL_PRICE_ID ? "$19.99/yr" : "$10/mo"}`}
        </button>
      </form>

      {/* Promo code */}
      <div style={{ marginTop: 16, textAlign: "center" }}>
        {!showPromo ? (
          <button onClick={() => setShowPromo(true)} style={{ background: "none", border: "none", color: "#444", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            Have a promo code?
          </button>
        ) : (
          <form onSubmit={handlePromo} style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <input
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value); setPromoError(null); }}
              placeholder="Enter code"
              autoFocus
              style={{ flex: 1, background: "#0a0a0a", border: `1px solid ${promoError ? "#f87171" : "#2a2a2a"}`, borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none", textTransform: "uppercase", letterSpacing: "0.05em" }}
            />
            <button type="submit" disabled={promoLoading}
              style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 16px", color: "#facc15", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              {promoLoading ? "…" : "Apply"}
            </button>
          </form>
        )}
        {promoError && <p style={{ color: "#f87171", fontSize: 12, margin: "6px 0 0" }}>{promoError}</p>}
      </div>

      <p style={{ margin: "16px 0 0", fontSize: 12, color: "#333", textAlign: "center" }}>
        Signed in as {user.email} ·{" "}
        <span onClick={onSignOut} style={{ color: "#555", cursor: "pointer", textDecoration: "underline" }}>Sign out</span>
      </p>
    </div>
  );
}

export function PaywallPage({ user, onSubscribed, onSignOut }) {
  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: 24 }}>

      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: "#facc15" }}>peep.</span>
        </div>

        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 20, padding: "40px 36px" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <h1 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 700, color: "#fff" }}>Start Watching</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#555", lineHeight: 1.6 }}>
              Unlimited access to all movies, series, live TV, and podcasts.
            </p>
          </div>

          {/* Plan selector */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 24 }}>
            {[
              { id: FOUNDING_PRICE_ID, label: "Founding Member", price: "$2.99", period: "/mo", badge: "LIMITED", perks: ["Ad-free forever", "Founding badge", "Lock in this price"] },
              { id: FOUNDING_ANNUAL_PRICE_ID, label: "Founding Annual", price: "$19.99", period: "/yr", badge: "BEST VALUE", perks: ["Ad-free forever", "Founding badge", "Save 44%"] },
              { id: STANDARD_PRICE_ID, label: "Standard", price: "$10", period: "/mo", badge: "FLEXIBLE", perks: ["All content", "Cancel anytime"] },
            ].map(plan => {
              const active = selectedPlan === plan.id;
              return (
                <div key={plan.id} onClick={() => setSelectedPlan(plan.id)}
                  style={{ border: `2px solid ${active ? YELLOW : "#222"}`, borderRadius: 12, padding: "14px 12px", cursor: "pointer", background: active ? "rgba(250,204,21,0.04)" : "#0a0a0a", transition: "all 0.15s", position: "relative" }}>
                  {plan.badge && (
                    <span style={{ position: "absolute", top: -1, right: -1, background: YELLOW, color: "#0a0a0a", fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: "0 10px 0 8px", letterSpacing: 0.5 }}>
                      {plan.badge}
                    </span>
                  )}
                  <div style={{ fontSize: 12, color: active ? YELLOW : "#666", fontWeight: 600, marginBottom: 6 }}>{plan.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{plan.price}</span>
                    <span style={{ fontSize: 11, color: "#555" }}>/mo</span>
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

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
            {["All movies & series", "Live TV channels", "Podcasts", "New content weekly", "Watch on any device"].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(250,204,21,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <span style={{ fontSize: 13, color: "#888" }}>{f}</span>
              </div>
            ))}
          </div>

          <Elements stripe={stripePromise}>
            <CheckoutForm user={user} onSignOut={onSignOut} />
          </Elements>
        </div>
      </div>
    </div>
  );
}
