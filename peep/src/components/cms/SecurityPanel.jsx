import { useState, useEffect } from "react";
import { supabase } from "../../supabase";

// Security tab: blocked accounts, admin lockout policy, failed logins and live
// sessions. Owns all of it; the shell supplies toast, the shared app_settings
// writer, and where "Back" goes.
export default function SecurityPanel({ showToast, saveSetting, onBack }) {
  const [loginAttempts, setLoginAttempts] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [blockEmail, setBlockEmail] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockLoading, setBlockLoading] = useState(false);
  const [activeSessions, setActiveSessions] = useState([]);
  const [lockoutSettings, setLockoutSettings] = useState({ lockout_max_attempts: "5", lockout_duration_mins: "15" });

  // Mount-only: the panel is created when its tab opens, and Refresh re-runs it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSecurityData(); }, []);

  async function loadLoginAttempts() {
    const { data } = await supabase.from("admin_login_attempts").select("*").order("attempted_at", { ascending: false }).limit(50);
    setLoginAttempts(data || []);
  }
  async function loadSecurityData() {
    const [{ data: blocked }, { data: sessions }, { data: settings }] = await Promise.all([
      supabase.from("blocked_users").select("*").order("blocked_at", { ascending: false }),
      supabase.from("user_presence").select("user_id, last_seen, current_page").order("last_seen", { ascending: false }).limit(20),
      supabase.from("app_settings").select("key, value").in("key", ["lockout_max_attempts", "lockout_duration_mins"]),
    ]);
    setBlockedUsers(blocked || []);

    if (sessions?.length) {
      const userIds = sessions.map(s => s.user_id).filter(Boolean);
      const [{ data: subData }, { data: profileData }] = await Promise.all([
        supabase.from("subscriptions").select("user_id, email").in("user_id", userIds),
        supabase.from("viewer_profiles").select("user_id, name").in("user_id", userIds),
      ]);
      const emailMap = {};
      (subData || []).forEach(s => { emailMap[s.user_id] = s.email; });
      const nameMap = {};
      (profileData || []).forEach(p => { if (!nameMap[p.user_id]) nameMap[p.user_id] = p.name; });
      setActiveSessions(sessions.map(s => ({ ...s, email: emailMap[s.user_id] || null, profileName: nameMap[s.user_id] || null })));
    } else {
      setActiveSessions([]);
    }

    const s = {};
    (settings || []).forEach(r => { s[r.key] = r.value; });
    if (Object.keys(s).length) setLockoutSettings(prev => ({ ...prev, ...s }));
    loadLoginAttempts();
  }
  async function blockUser() {
    if (!blockEmail.trim()) return;
    setBlockLoading(true);
    const { error } = await supabase.from("blocked_users").insert({ email: blockEmail.trim().toLowerCase(), reason: blockReason.trim() || null });
    if (error) showToast(error.message, "error");
    else { showToast("User blocked"); setBlockEmail(""); setBlockReason(""); loadSecurityData(); }
    setBlockLoading(false);
  }

  async function unblockUser(id) {
    await supabase.from("blocked_users").delete().eq("id", id);
    setBlockedUsers(b => b.filter(u => u.id !== id));
    showToast("User unblocked");
  }
  const now = new Date();
  return (
    <div style={{ maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
        <button onClick={() => onBack()} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#374151", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          ← Back
        </button>
        <div>
          <h2 style={{ margin: "0 0 2px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Security</h2>
          <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Access control, blocked accounts, session monitoring</p>
        </div>
        <button onClick={loadSecurityData} style={{ marginLeft: "auto", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 7, padding: "8px 16px", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Refresh
        </button>
      </div>

      {/* Lockout Settings */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Admin Lockout</p>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#9ca3af" }}>Lock the admin login after too many wrong PINs.</p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Max Attempts</label>
            <input type="number" min="1" max="20"
              value={lockoutSettings.lockout_max_attempts}
              onChange={e => setLockoutSettings(p => ({ ...p, lockout_max_attempts: e.target.value }))}
              onBlur={e => saveSetting("lockout_max_attempts", e.target.value)}
              style={{ width: 80, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "#0f172a", outline: "none", textAlign: "center" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Lockout Duration (mins)</label>
            <input type="number" min="1" max="1440"
              value={lockoutSettings.lockout_duration_mins}
              onChange={e => setLockoutSettings(p => ({ ...p, lockout_duration_mins: e.target.value }))}
              onBlur={e => saveSetting("lockout_duration_mins", e.target.value)}
              style={{ width: 100, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "#0f172a", outline: "none", textAlign: "center" }} />
          </div>
        </div>
      </div>

      {/* Failed Login Attempts */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Failed Login Attempts</p>
            <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Wrong PINs entered on the admin login screen.</p>
          </div>
          {loginAttempts.length > 0 && (
            <button onClick={async () => { await supabase.from("admin_login_attempts").delete().neq("id", "00000000-0000-0000-0000-000000000000"); loadLoginAttempts(); showToast("Cleared"); }}
              style={{ background: "none", border: "none", fontSize: 12, color: "#9ca3af", cursor: "pointer", textDecoration: "underline" }}>Clear all</button>
          )}
        </div>
        {loginAttempts.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>No failed attempts — all clear</p>
        ) : (
          <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #f1f5f9" }}>
            {loginAttempts.map((a, i) => {
              const date = new Date(a.attempted_at);
              const masked = a.pin_entered ? a.pin_entered.slice(0, 1) + "*".repeat(Math.max(0, a.pin_entered.length - 1)) : "?";
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: i % 2 === 0 ? "#fafafa" : "#fff", borderBottom: i < loginAttempts.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>🚨</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Tried <code style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626", padding: "1px 6px", borderRadius: 4, letterSpacing: "0.1em" }}>{masked}</code></span>
                  </div>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Block User */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Block User</p>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#9ca3af" }}>Blocked users are signed out immediately and can't log back in.</p>
        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <input value={blockEmail} onChange={e => setBlockEmail(e.target.value)} placeholder="user@email.com" type="email"
            style={{ flex: 2, minWidth: 180, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#0f172a", outline: "none" }} />
          <input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Reason (optional)"
            style={{ flex: 2, minWidth: 140, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#0f172a", outline: "none" }} />
          <button onClick={blockUser} disabled={blockLoading || !blockEmail.trim()}
            style={{ background: "#dc2626", border: "none", borderRadius: 8, padding: "10px 20px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: blockLoading ? 0.6 : 1, whiteSpace: "nowrap" }}>
            {blockLoading ? "…" : "Block"}
          </button>
        </div>
        {blockedUsers.length > 0 && (
          <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #f1f5f9" }}>
            {blockedUsers.map((u, i) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: i % 2 === 0 ? "#fafafa" : "#fff", borderBottom: i < blockedUsers.length - 1 ? "1px solid #f1f5f9" : "none", gap: 12 }}>
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{u.email}</p>
                  {u.reason && <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{u.reason}</p>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{new Date(u.blocked_at).toLocaleDateString()}</span>
                  <button onClick={() => unblockUser(u.id)} style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 6, padding: "4px 12px", color: "#059669", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Unblock</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {blockedUsers.length === 0 && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9ca3af" }}>No blocked users</p>}
      </div>

      {/* Active Sessions */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Active Sessions</p>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#9ca3af" }}>Users seen in the last 5 minutes.</p>
        {activeSessions.filter(s => (now - new Date(s.last_seen)) < 5 * 60 * 1000).length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>No active sessions right now</p>
        ) : (
          <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #f1f5f9" }}>
            {activeSessions.filter(s => (now - new Date(s.last_seen)) < 5 * 60 * 1000).map((s, i, arr) => (
              <div key={s.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: i % 2 === 0 ? "#fafafa" : "#fff", borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0, display: "inline-block" }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#0f172a" }}>{s.email || <span style={{ color: "#9ca3af", fontFamily: "monospace", fontSize: 11 }}>{s.user_id?.slice(0, 16)}…</span>}</p>
                    {s.profileName && <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>Profile: {s.profileName}</p>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {s.current_page && <span style={{ fontSize: 11, background: "#f1f5f9", padding: "2px 8px", borderRadius: 4, color: "#6b7280" }}>{s.current_page}</span>}
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{Math.floor((now - new Date(s.last_seen)) / 1000)}s ago</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
