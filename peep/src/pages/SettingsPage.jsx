import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { PAD } from "../lib/theme";
import { captureError } from "../lib/observability";
import { SUPABASE_URL } from "../lib/config";
import {
  PREF_AUTOPLAY_NEXT,
  PREF_AUTOPLAY_PREVIEWS,
  PREF_AUTOPLAY_HERO,
  getPref,
  setPref,
  SettingRow,
  DeleteAccountSection,
} from "./settingsHelpers";

export function SettingsPage({ user, activeProfile, isOwner, onBack, onGoHome, onProfileUpdate, onAvatarChange, onSignOut }) {
  const [autoplayNext, setAutoplayNext] = useState(() => getPref(PREF_AUTOPLAY_NEXT));
  const [autoplayPreviews, setAutoplayPreviews] = useState(() => getPref(PREF_AUTOPLAY_PREVIEWS));
  const [subscription, setSubscription] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelFlow, setCancelFlow] = useState(null); // null | "confirm" | "success"
  const [cancelMode, setCancelMode] = useState("end_of_period");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelResult, setCancelResult] = useState(null);
  const [autoplayHero, setAutoplayHero] = useState(() => getPref(PREF_AUTOPLAY_HERO));
  const [newName, setNewName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null);

  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;

  useEffect(() => {
    supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => setSubscription(data));
  }, [user.id]);

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-portal-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ return_url: window.location.href }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err) {
      alert(err.message);
    }
    setPortalLoading(false);
  }

  async function handleCancelSubscription() {
    setCancelLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ mode: cancelMode }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCancelResult(data);
      setCancelFlow("success");
      setSubscription(prev => ({ ...prev, status: cancelMode === "immediate" ? "canceled" : "canceling" }));
    } catch (err) {
      alert(err.message);
    }
    setCancelLoading(false);
  }

  function toggleAutoplayNext(val) { setAutoplayNext(val); setPref(PREF_AUTOPLAY_NEXT, val); }
  function toggleAutoplayPreviews(val) { setAutoplayPreviews(val); setPref(PREF_AUTOPLAY_PREVIEWS, val); }
  function toggleAutoplayHero(val) { setAutoplayHero(val); setPref(PREF_AUTOPLAY_HERO, val); }


  async function changeName() {
    if (!newName.trim()) return;
    setNameSaving(true); setNameMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { full_name: newName.trim() } });
    if (!error) {
      await supabase.from("profiles").update({ username: newName.trim() }).eq("id", user.id);
    }
    setNameSaving(false);
    if (error) setNameMsg({ type: "error", text: error.message });
    else { setNameMsg({ type: "ok", text: "Name updated" }); setNewName(""); setExpandedSection(null); onProfileUpdate?.(); }
  }

  async function changeEmail() {
    if (!newEmail.trim() || newEmail === user.email) return;
    setEmailSaving(true); setEmailMsg(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailSaving(false);
    if (error) setEmailMsg({ type: "error", text: error.message });
    else { setEmailMsg({ type: "ok", text: `Confirmation sent to ${newEmail.trim()} — click the link in that email to complete the change.` }); setNewEmail(""); }
  }

  async function changePassword() {
    if (!newPassword || newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: newPassword !== confirmPassword ? "Passwords don't match" : "Enter a new password" });
      return;
    }
    if (newPassword.length < 6) { setPasswordMsg({ type: "error", text: "Password must be at least 6 characters" }); return; }
    setPasswordSaving(true); setPasswordMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) setPasswordMsg({ type: "error", text: error.message });
    else { setPasswordMsg({ type: "ok", text: "Password updated successfully" }); setNewPassword(""); setConfirmPassword(""); }
  }

  const [expandedSection, setExpandedSection] = useState(null);
  const inp = { width: "100%", background: "#181818", border: "1px solid #222", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const card = { marginBottom: 24, background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden" };
  const planLabel = subscription?.plan === "comp" ? "Complimentary" : subscription?.plan_id === "price_1TafqJRgQH3TYy3QOCovduJf" ? "Founding Member — $2.99/mo" : subscription?.plan_id === "price_1Tag3FRgQH3TYy3Ql0KuQNeA" ? "Founding Member — $19.99/yr" : "Peep Monthly — $10/mo";
  const AcctRow = ({ label, value, note, action, onAction, danger = false, noBorder = false }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: noBorder ? "none" : "1px solid #1a1a1a" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: danger ? "#f87171" : "#e0e0e0" }}>{label}</p>
        {value && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</p>}
        {note && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#f87171" }}>{note}</p>}
      </div>
      {action && <button onClick={onAction} style={{ background: "none", border: "none", color: danger ? "#f87171" : "#facc15", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, flexShrink: 0, fontFamily: "inherit", whiteSpace: "nowrap" }}>{action}</button>}
    </div>
  );
  const SectionLabel = ({ children }) => (
    <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#3a3a3a", letterSpacing: "0.1em", textTransform: "uppercase", paddingLeft: 2 }}>{children}</p>
  );

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>

      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", alignItems: "center", padding: `0 ${PAD}`, height: 64, gap: 20, background: "rgba(10,10,10,0.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#aaa", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <span onClick={onGoHome} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, cursor: "pointer", color: "#facc15" }}>peep.</span>
      </nav>

      <div style={{ paddingTop: 64 + 40, paddingBottom: 100, paddingLeft: PAD, paddingRight: PAD, maxWidth: 600, margin: "0 auto" }}>

        {/* Profile header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <div style={{ width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {(activeProfile?.name || user?.user_metadata?.full_name || user?.email || "?")[0].toUpperCase()}
          </div>
          <div>
            <p style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 700, color: "#fff" }}>{activeProfile?.name || user?.user_metadata?.full_name || "Your Account"}</p>
            <p style={{ margin: 0, fontSize: 13, color: "#555" }}>{user?.email}</p>
          </div>
          {isOwner && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#facc15", background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 6, padding: "3px 10px", flexShrink: 0 }}>Owner</span>}
        </div>

        {/* Email verification alert */}
        {!user?.email_confirmed_at && (
          <div style={{ marginBottom: 24, background: "#160a0a", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#f87171" }}>Email verification needed</p>
              <p style={{ margin: 0, fontSize: 12, color: "#555" }}>Verify your email to confirm your account.</p>
            </div>
            <button onClick={async () => { await supabase.auth.resend({ type: "signup", email: user.email }); alert("Verification email sent!"); }}
              style={{ background: "transparent", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "8px 16px", color: "#f87171", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
              Resend
            </button>
          </div>
        )}

        {/* ── Account ── */}
        <SectionLabel>Account</SectionLabel>
        <div style={card}>
          <AcctRow
            label="Name"
            value={activeProfile?.name || user?.user_metadata?.full_name || "—"}
            action={expandedSection === "name" ? "Cancel" : "Change"}
            onAction={() => { setExpandedSection(expandedSection === "name" ? null : "name"); setNameMsg(null); setNewName(""); }}
          />
          {expandedSection === "name" && (
            <div style={{ padding: "4px 18px 18px" }}>
              <input type="text" value={newName} onChange={e => { setNewName(e.target.value); setNameMsg(null); }} placeholder="New display name" style={{ ...inp, marginBottom: 10 }} maxLength={60} />
              {nameMsg && <p style={{ margin: "0 0 10px", fontSize: 13, color: nameMsg.type === "ok" ? "#4ade80" : "#f87171" }}>{nameMsg.text}</p>}
              <button onClick={changeName} disabled={nameSaving || !newName.trim()}
                style={{ background: newName.trim() ? "#facc15" : "#1e1e1e", border: "none", borderRadius: 8, padding: "11px 22px", color: newName.trim() ? "#0a0a0a" : "#444", fontSize: 13, fontWeight: 700, cursor: newName.trim() ? "pointer" : "default" }}>
                {nameSaving ? "Saving…" : "Update Name"}
              </button>
            </div>
          )}
          <AcctRow
            label="Email"
            value={user?.email}
            note={!user?.email_confirmed_at ? "Verification needed" : null}
            action={expandedSection === "email" ? "Cancel" : "Change"}
            onAction={() => setExpandedSection(expandedSection === "email" ? null : "email")}
          />
          {expandedSection === "email" && (
            <div style={{ padding: "4px 18px 18px" }}>
              <input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setEmailMsg(null); }} placeholder="New email address" style={{ ...inp, marginBottom: 10 }} />
              {emailMsg && <p style={{ margin: "0 0 10px", fontSize: 13, color: emailMsg.type === "ok" ? "#4ade80" : "#f87171" }}>{emailMsg.text}</p>}
              <button onClick={changeEmail} disabled={emailSaving || !newEmail.trim()}
                style={{ background: newEmail.trim() ? "#facc15" : "#1e1e1e", border: "none", borderRadius: 8, padding: "11px 22px", color: newEmail.trim() ? "#0a0a0a" : "#444", fontSize: 13, fontWeight: 700, cursor: newEmail.trim() ? "pointer" : "default" }}>
                {emailSaving ? "Sending…" : "Update Email"}
              </button>
            </div>
          )}
          <AcctRow
            label="Password"
            value="••••••••••"
            action={expandedSection === "password" ? "Cancel" : "Change"}
            onAction={() => setExpandedSection(expandedSection === "password" ? null : "password")}
            noBorder={expandedSection !== "password"}
          />
          {expandedSection === "password" && (
            <div style={{ padding: "4px 18px 18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <input type="password" value={newPassword} onChange={e => { setNewPassword(e.target.value); setPasswordMsg(null); }} placeholder="New password" style={inp} />
                <input type="password" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setPasswordMsg(null); }} placeholder="Confirm password" style={inp} />
              </div>
              {passwordMsg && <p style={{ margin: "0 0 10px", fontSize: 13, color: passwordMsg.type === "ok" ? "#4ade80" : "#f87171" }}>{passwordMsg.text}</p>}
              <button onClick={changePassword} disabled={passwordSaving || !newPassword}
                style={{ background: newPassword ? "#facc15" : "#1e1e1e", border: "none", borderRadius: 8, padding: "11px 22px", color: newPassword ? "#0a0a0a" : "#444", fontSize: 13, fontWeight: 700, cursor: newPassword ? "pointer" : "default" }}>
                {passwordSaving ? "Updating…" : "Update Password"}
              </button>
            </div>
          )}
        </div>

        {/* ── Subscription ── */}
        <SectionLabel>Subscription</SectionLabel>
        <div style={card}>
          {isOwner ? (
            <AcctRow label="Plan" value="Owner — Full access" noBorder />
          ) : subscription ? (
            <>
              <AcctRow label="Plan" value={planLabel} />
              {subscription.current_period_end && subscription.plan !== "comp" && (
                <AcctRow label="Next Billing Date" value={new Date(subscription.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
              )}
              {subscription.stripe_customer_id && (
                <AcctRow label="Payment Method" action="Update" onAction={openBillingPortal} />
              )}
              {cancelFlow === null && subscription.stripe_customer_id && subscription.status === "active" && (
                <AcctRow label="Cancel Subscription" danger action="Cancel" onAction={() => setCancelFlow("confirm")} noBorder />
              )}
              {cancelFlow === "confirm" && (
                <div style={{ padding: "16px 18px", borderTop: "1px solid #1a1a1a" }}>
                  <p style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>How would you like to cancel?</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                    {[
                      { id: "end_of_period", title: "Cancel at end of billing period", desc: `Keep access until ${subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "renewal"}. No refund.` },
                      { id: "immediate", title: "Cancel immediately", desc: "Access ends now. Prorated refund issued." },
                    ].map(opt => (
                      <div key={opt.id} onClick={() => setCancelMode(opt.id)}
                        style={{ border: `1px solid ${cancelMode === opt.id ? "#f87171" : "#222"}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", background: cancelMode === opt.id ? "rgba(248,113,113,0.04)" : "transparent", transition: "all 0.15s" }}>
                        <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600, color: cancelMode === opt.id ? "#f87171" : "#aaa" }}>{opt.title}</p>
                        <p style={{ margin: 0, fontSize: 12, color: "#555" }}>{opt.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setCancelFlow(null)} style={{ flex: 1, background: "transparent", border: "1px solid #222", borderRadius: 8, padding: "12px", color: "#666", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Keep Subscription</button>
                    <button onClick={handleCancelSubscription} disabled={cancelLoading} style={{ flex: 1, background: "#f87171", border: "none", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: cancelLoading ? "not-allowed" : "pointer", opacity: cancelLoading ? 0.7 : 1 }}>
                      {cancelLoading ? "Cancelling…" : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
              {cancelFlow === "success" && (
                <div style={{ padding: "18px" }}>
                  <p style={{ margin: "0 0 16px", fontSize: 14, color: "#aaa", lineHeight: 1.7 }}>
                    {cancelResult?.mode === "immediate"
                      ? `Your subscription has been cancelled.${cancelResult?.refund_issued ? ` A refund of $${(cancelResult.refund_amount / 100).toFixed(2)} has been issued.` : ""}`
                      : "You can still stream Peep until the end of your billing cycle."}
                  </p>
                  <button onClick={() => setCancelFlow(null)} style={{ background: "#1e1e1e", border: "none", borderRadius: 8, padding: "12px 24px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done</button>
                </div>
              )}
            </>
          ) : (
            <AcctRow label="Plan" value="No active subscription" noBorder />
          )}
        </div>

        {/* ── Playback ── */}
        <SectionLabel>Playback</SectionLabel>
        <div style={card}>
          <SettingRow label="Autoplay Next Episode" description="Automatically play the next episode when one ends" value={autoplayNext} onChange={toggleAutoplayNext} />
          <SettingRow label="Hover Previews" description="Play a trailer clip when hovering over a title" value={autoplayPreviews} onChange={toggleAutoplayPreviews} />
          <SettingRow label="Hero Trailer Autoplay" description="Automatically play the featured trailer on the home screen" value={autoplayHero} onChange={toggleAutoplayHero} noBorder />
        </div>

        {/* ── Admin (owner only) ── */}
        {isOwner && (
          <>
            <SectionLabel>Admin</SectionLabel>
            <div style={{ ...card, border: "1px solid rgba(250,204,21,0.12)", marginBottom: 24 }}>
              <AcctRow label="Admin Dashboard" value="Manage content, users, and settings" action="Open →" onAction={() => { window.location.href = "/admin"; }} noBorder />
            </div>
          </>
        )}

        {/* ── Sign out + Delete ── */}
        <SectionLabel>Session</SectionLabel>
        <div style={card}>
          <AcctRow label="Sign Out" action="Sign Out" onAction={onSignOut} noBorder />
        </div>
        <div style={{ marginTop: 8 }}>
          <DeleteAccountSection user={user} onSignOut={onSignOut} inline />
        </div>

      </div>
    </div>
  );
}
