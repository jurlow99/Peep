import { useState } from "react";
import { supabase } from "../../supabase";
import { SUPABASE_URL } from "../../lib/config";
import { getAdminToken } from "./adminAuth";

// Members > Support: look a user up and act on their account -- grant or revoke
// access, send a password reset, delete. Mounted only while its sub-tab shows,
// so leaving it clears the search and the selected user.
export default function SupportPanel() {
  const [supportSearch, setSupportSearch] = useState("");
  const [supportResults, setSupportResults] = useState([]);
  const [supportSearching, setSupportSearching] = useState(false);
  const [supportUser, setSupportUser] = useState(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportActionLoading, setSupportActionLoading] = useState(false);
  const [supportActionMsg, setSupportActionMsg] = useState(null);
  const [supportDeleteConfirm, setSupportDeleteConfirm] = useState(false);

  async function searchSupportUsers(query) {
    if (!query.trim()) { setSupportResults([]); return; }
    setSupportSearching(true);
    const q = query.trim();
    const isUuid = /^[0-9a-f-]{8,}$/i.test(q);
    const { data } = await supabase.from("profiles").select("id, full_name, email, username, created_at")
      .or(isUuid ? `id.eq.${q},email.ilike.%${q}%,full_name.ilike.%${q}%` : `email.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(10);
    let results = data || [];

    // If UUID search found nothing in profiles, check subscriptions + presence
    if (isUuid && results.length === 0) {
      const [{ data: sub }, { data: presence }] = await Promise.all([
        supabase.from("subscriptions").select("user_id, email, created_at").eq("user_id", q).maybeSingle(),
        supabase.from("user_presence").select("user_id, last_seen").eq("user_id", q).maybeSingle(),
      ]);
      if (sub || presence) {
        results = [{ id: q, full_name: null, email: sub?.email || null, username: null, created_at: sub?.created_at || null, _ghost: true }];
      }
    }

    setSupportResults(results);
    setSupportSearching(false);
  }

  async function loadSupportUser(profile) {
    setSupportUser(null);
    setSupportLoading(true);
    setSupportActionMsg(null);
    setSupportDeleteConfirm(false);
    const [{ data: sub }, { data: presence }, { data: vprofiles }, { data: watchData }] = await Promise.all([
      supabase.from("subscriptions").select("*").eq("user_id", profile.id).maybeSingle(),
      supabase.from("user_presence").select("last_seen, current_page").eq("user_id", profile.id).maybeSingle(),
      supabase.from("viewer_profiles").select("id, name, avatar_id").eq("user_id", profile.id),
      supabase.from("watch_progress").select("id").eq("user_id", profile.id),
    ]);
    setSupportUser({ ...profile, subscription: sub || null, presence: presence || null, viewer_profiles: vprofiles || [], watch_count: watchData?.length || 0 });
    setSupportLoading(false);
  }

  async function supportGrantAccess() {
    setSupportActionLoading(true); setSupportActionMsg(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/grant-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ email: supportUser.email }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSupportActionMsg({ ok: true, text: "Free access granted" });
      loadSupportUser(supportUser);
    } catch (err) { setSupportActionMsg({ ok: false, text: err.message }); }
    setSupportActionLoading(false);
  }

  async function supportRevokeAccess() {
    setSupportActionLoading(true); setSupportActionMsg(null);
    try {
      const { error } = await supabase.from("subscriptions").delete().eq("user_id", supportUser.id);
      if (error) throw new Error(error.message);
      setSupportActionMsg({ ok: true, text: "Access revoked" });
      loadSupportUser(supportUser);
    } catch (err) { setSupportActionMsg({ ok: false, text: err.message }); }
    setSupportActionLoading(false);
  }

  async function supportSendPasswordReset() {
    setSupportActionLoading(true); setSupportActionMsg(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-reset-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ email: supportUser.email }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSupportActionMsg({ ok: true, text: `Password reset email sent to ${supportUser.email}` });
    } catch (err) { setSupportActionMsg({ ok: false, text: err.message }); }
    setSupportActionLoading(false);
  }

  async function supportDeleteUser() {
    setSupportActionLoading(true); setSupportActionMsg(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ user_id: supportUser.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSupportUser(null);
      setSupportResults(prev => prev.filter(u => u.id !== supportUser.id));
      setSupportActionMsg({ ok: true, text: "Account deleted" });
      setSupportDeleteConfirm(false);
    } catch (err) { setSupportActionMsg({ ok: false, text: err.message }); }
    setSupportActionLoading(false);
  }

  return (
    <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
      {/* Left: search panel */}
      <div style={{ width: 320, flexShrink: 0 }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Account Support</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            value={supportSearch}
            onChange={e => { setSupportSearch(e.target.value); searchSupportUsers(e.target.value); }}
            placeholder="Search by email, name, or user ID…"
            style={{ border: "none", outline: "none", fontSize: 14, color: "#0f172a", background: "transparent", flex: 1 }}
          />
          {supportSearching && <span style={{ color: "#9ca3af", fontSize: 12 }}>⋯</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {supportResults.map(u => (
            <button key={u.id} onClick={() => loadSupportUser(u)}
              style={{ background: supportUser?.id === u.id ? "rgba(34,211,238,0.08)" : "#fff", border: `1px solid ${supportUser?.id === u.id ? "rgba(34,211,238,0.4)" : "#e2e8f0"}`, borderRadius: 10, padding: "12px 14px", textAlign: "left", cursor: "pointer", transition: "all 0.15s" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: u._ghost ? "#9ca3af" : "#0f172a" }}>{u.full_name || u.username || (u._ghost ? "Ghost Account" : "—")}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{u.email || <span style={{ fontFamily: "monospace", fontSize: 11 }}>{u.id.slice(0, 20)}…</span>}</p>
            </button>
          ))}
          {supportSearch && !supportSearching && supportResults.length === 0 && (
            <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>No users found</p>
          )}
        </div>
      </div>

      {/* Right: user detail */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!supportUser && !supportLoading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#9ca3af" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="1.5" style={{ marginBottom: 12 }}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            <p style={{ margin: 0, fontSize: 14 }}>Search and select a user</p>
          </div>
        )}
        {supportLoading && <div style={{ textAlign: "center", padding: "80px 0", color: "#9ca3af" }}>Loading…</div>}
        {supportUser && !supportLoading && (() => {
          const sub = supportUser.subscription;
          const lastSeen = supportUser.presence?.last_seen ? new Date(supportUser.presence.last_seen) : null;
          // Display-only staleness math. Worth deriving at load time rather than in
          // render, but keeping it identical here to stay behaviour-preserving.
          // eslint-disable-next-line react-hooks/purity
          const daysSince = lastSeen ? Math.floor((Date.now() - lastSeen) / 86400000) : null;
          return (
            <div>
              {/* Header */}
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "24px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{supportUser.full_name || supportUser.username || "—"}</p>
                    <p style={{ margin: "0 0 4px", fontSize: 14, color: "#6b7280" }}>{supportUser.email}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Member since {supportUser.created_at ? new Date(supportUser.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—"}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {sub ? (
                      <span style={{ background: sub.status === "active" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", color: sub.status === "active" ? "#059669" : "#dc2626", border: `1px solid ${sub.status === "active" ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>
                        {sub.plan === "comp" ? "COMP" : sub.status}
                      </span>
                    ) : (
                      <span style={{ background: "rgba(156,163,175,0.1)", color: "#9ca3af", border: "1px solid #e2e8f0", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>No Subscription</span>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 20, paddingTop: 20, borderTop: "1px solid #f1f5f9" }}>
                  {[
                    { label: "Profiles", value: supportUser.viewer_profiles.length },
                    { label: "Watch Sessions", value: supportUser.watch_count },
                    { label: "Last Seen", value: daysSince === null ? "Never" : daysSince === 0 ? "Today" : `${daysSince}d ago` },
                    { label: "Current Page", value: supportUser.presence?.current_page || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <p style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{value}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Subscription detail */}
              {sub && (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px", marginBottom: 16 }}>
                  <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: 0.5 }}>Subscription</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
                    <div><span style={{ color: "#9ca3af" }}>Started: </span><span style={{ color: "#0f172a" }}>{sub.created_at ? new Date(sub.created_at).toLocaleDateString() : "—"}</span></div>
                    <div><span style={{ color: "#9ca3af" }}>Renews: </span><span style={{ color: "#0f172a" }}>{sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}</span></div>
                    {sub.stripe_customer_id && <div style={{ gridColumn: "span 2" }}><span style={{ color: "#9ca3af" }}>Stripe Customer: </span><a href={`https://dashboard.stripe.com/customers/${sub.stripe_customer_id}`} target="_blank" rel="noreferrer" style={{ color: "#4f46e5", fontFamily: "monospace", fontSize: 12 }}>{sub.stripe_customer_id}</a></div>}
                    {sub.stripe_subscription_id && <div style={{ gridColumn: "span 2" }}><span style={{ color: "#9ca3af" }}>Stripe Sub: </span><a href={`https://dashboard.stripe.com/subscriptions/${sub.stripe_subscription_id}`} target="_blank" rel="noreferrer" style={{ color: "#4f46e5", fontFamily: "monospace", fontSize: 12 }}>{sub.stripe_subscription_id}</a></div>}
                  </div>
                </div>
              )}

              {/* Viewer profiles */}
              {supportUser.viewer_profiles.length > 0 && (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px", marginBottom: 16 }}>
                  <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: 0.5 }}>Profiles</p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {supportUser.viewer_profiles.map(vp => (
                      <span key={vp.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 14px", fontSize: 13, color: "#374151" }}>{vp.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px" }}>
                <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: 0.5 }}>Actions</p>
                {supportActionMsg && (
                  <div style={{ background: supportActionMsg.ok ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)", border: `1px solid ${supportActionMsg.ok ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: supportActionMsg.ok ? "#059669" : "#dc2626" }}>
                    {supportActionMsg.text}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button onClick={supportGrantAccess} disabled={supportActionLoading}
                    style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 9, padding: "12px", color: "#059669", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Grant Free Access
                  </button>
                  <button onClick={supportRevokeAccess} disabled={supportActionLoading || !sub}
                    style={{ background: sub ? "rgba(245,158,11,0.08)" : "#f8fafc", border: `1px solid ${sub ? "rgba(245,158,11,0.3)" : "#e2e8f0"}`, borderRadius: 9, padding: "12px", color: sub ? "#b45309" : "#9ca3af", fontSize: 13, fontWeight: 600, cursor: sub ? "pointer" : "not-allowed" }}>
                    Revoke Access
                  </button>
                  <button onClick={supportSendPasswordReset} disabled={supportActionLoading}
                    style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.3)", borderRadius: 9, padding: "12px", color: "#4f46e5", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Send Password Reset
                  </button>
                  {sub?.stripe_customer_id && (
                    <a href={`https://dashboard.stripe.com/customers/${sub.stripe_customer_id}`} target="_blank" rel="noreferrer"
                      style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 9, padding: "12px", color: "#6366f1", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none", textAlign: "center" }}>
                      Open in Stripe ↗
                    </a>
                  )}
                  {!supportDeleteConfirm ? (
                    <button onClick={() => setSupportDeleteConfirm(true)} disabled={supportActionLoading}
                      style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 9, padding: "12px", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer", gridColumn: sub?.stripe_customer_id ? "span 1" : "span 2" }}>
                      Delete Account
                    </button>
                  ) : (
                    <div style={{ gridColumn: "span 2", background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 9, padding: "14px" }}>
                      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#dc2626", fontWeight: 600 }}>Permanently delete {supportUser.full_name || supportUser.email}?</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setSupportDeleteConfirm(false)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "9px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                        <button onClick={supportDeleteUser} disabled={supportActionLoading}
                          style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "9px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          {supportActionLoading ? "Deleting…" : "Delete Forever"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
