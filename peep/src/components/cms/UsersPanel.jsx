import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { SUPABASE_URL } from "../../lib/config";
import { getAdminToken } from "./adminAuth";

// Members > Users: the account list, tier control and account deletion.
// Mounted only while its sub-tab is showing, so leaving it clears its state.
export default function UsersPanel({ showToast, logAudit }) {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersSearch, setUsersSearch] = useState("");
  const [deleteUserConfirm, setDeleteUserConfirm] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setUsersLoading(true);
    const { data: profileData } = await supabase.from("profiles").select("id, full_name, email, username, created_at, access_tier").order("created_at", { ascending: false });
    const profiles = profileData || [];
    if (!profiles.length) { setUsers([]); setUsersLoading(false); return; }
    const ids = profiles.map(p => p.id);
    const [{ data: subData }, { data: streamerData }] = await Promise.all([
      supabase.from("subscriptions").select("user_id, status, plan").in("user_id", ids),
      supabase.from("live_streams").select("user_id").in("user_id", ids),
    ]);
    const subMap = {};
    (subData || []).forEach(s => { subMap[s.user_id] = s; });
    const streamerSet = new Set((streamerData || []).map(s => s.user_id));
    setUsers(profiles.map(p => ({ ...p, subscription: subMap[p.id] || null, isStreamer: streamerSet.has(p.id) })));
    setUsersLoading(false);
  }
  async function deleteUser(user_id) {
    setDeletingUser(true);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ user_id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUsers(prev => prev.filter(u => u.id !== user_id));
      setDeleteUserConfirm(null);
      showToast("User deleted");
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
    setDeletingUser(false);
  }
  async function setUserAccessTier(userId, tier) {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, access_tier: tier } : u));
    const { error } = await supabase.from("profiles").update({ access_tier: tier }).eq("id", userId);
    if (error) { showToast("Failed: " + error.message, "error"); loadUsers(); }
    else { showToast(`Tier → ${tier}`); logAudit?.("update", "profile", userId, `access_tier → ${tier}`); }
  }

  return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Users</h2>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input value={usersSearch} onChange={e => setUsersSearch(e.target.value)} placeholder="Search by name or email…" style={{ border: "none", outline: "none", fontSize: 13, color: "#0f172a", background: "transparent", width: 220 }} />
            </div>
            <button onClick={loadUsers} style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 7, padding: "8px 16px", color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Refresh</button>
          </div>
        </div>

        {usersLoading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>Loading…</div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  {["Name", "Email", "Type", "Tier", "Subscription", "Joined", ""].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.filter(u => !usersSearch || (u.email || "").toLowerCase().includes(usersSearch.toLowerCase()) || (u.full_name || "").toLowerCase().includes(usersSearch.toLowerCase())).map((u, i, arr) => (
                  <tr key={u.id} style={{ borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <td style={{ padding: "14px 16px", fontWeight: 600, color: "#0f172a" }}>{u.full_name || u.username || "—"}</td>
                    <td style={{ padding: "14px 16px", color: "#6b7280" }}>{u.email}</td>
                    <td style={{ padding: "14px 16px" }}>
                      {u.isStreamer
                        ? <span style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "#dc2626" }}>User + Streamer</span>
                        : <span style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "#4f46e5" }}>User</span>
                      }
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <select value={u.access_tier || "production"} onChange={e => setUserAccessTier(u.id, e.target.value)}
                        style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", color: (u.access_tier && u.access_tier !== "production") ? "#7c3aed" : "#374151", fontWeight: (u.access_tier && u.access_tier !== "production") ? 700 : 400, cursor: "pointer" }}>
                        <option value="production">Production</option>
                        <option value="test">Test</option>
                      </select>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      {u.subscription ? (
                        <span style={{ background: u.subscription.status === "active" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", color: u.subscription.status === "active" ? "#059669" : "#dc2626", border: `1px solid ${u.subscription.status === "active" ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
                          {u.subscription.plan === "comp" ? "COMP" : u.subscription.status}
                        </span>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: 12 }}>None</span>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", color: "#6b7280", whiteSpace: "nowrap" }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <button onClick={() => setDeleteUserConfirm(u)} style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6, padding: "5px 12px", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {deleteUserConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: "32px 36px", maxWidth: 400, width: "90%", textAlign: "center" }}>
              <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#0f172a" }}>Delete user?</p>
              <p style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>{deleteUserConfirm.full_name}</p>
              <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{deleteUserConfirm.email}</p>
              <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 28 }}>This permanently deletes their account, profiles, subscription, and all watch data. Cannot be undone.</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setDeleteUserConfirm(null)} disabled={deletingUser} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button onClick={() => deleteUser(deleteUserConfirm.id)} disabled={deletingUser} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: deletingUser ? "not-allowed" : "pointer", opacity: deletingUser ? 0.7 : 1 }}>
                  {deletingUser ? "Deleting…" : "Delete Forever"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
