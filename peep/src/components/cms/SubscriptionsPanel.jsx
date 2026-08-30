import { useState, useEffect } from "react";
import { supabase } from "../../supabase";

// Members > Subscriptions: Stripe subscription records with search, status
// filter, column sort, CSV export and revoke.

// Sortable column header. Module scope so it is not recreated every render --
// it takes the sort state it used to close over.
function SortTh({ col, label, sort, onSort }) {
  return (
    <th onClick={() => onSort(col)}
      style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: sort.col === col ? "#4f46e5" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
      {label} {sort.col === col ? (sort.dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}

export default function SubscriptionsPanel({ showToast }) {
  const [subs, setSubs] = useState([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [revokeConfirm, setRevokeConfirm] = useState(null);
  const [subSearch, setSubSearch] = useState("");
  const [subStatusFilter, setSubStatusFilter] = useState("all");
  const [subSort, setSubSort] = useState({ col: "created_at", dir: "desc" });

  useEffect(() => { loadSubscriptions(); }, []);

  function toggleSort(col) {
    setSubSort(s => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" }));
  }

  async function loadSubscriptions() {
    setSubsLoading(true);
    const { data: subsData } = await supabase.from("subscriptions").select("*").order("created_at", { ascending: false });
    if (!subsData?.length) { setSubs([]); setSubsLoading(false); return; }
    const userIds = subsData.map(s => s.user_id);
    const [{ data: presenceData }, { data: watchData }, { data: profileData }] = await Promise.all([
      supabase.from("user_presence").select("user_id, last_seen").in("user_id", userIds),
      supabase.from("watch_progress").select("user_id").in("user_id", userIds),
      supabase.from("viewer_profiles").select("user_id").in("user_id", userIds),
    ]);
    const presenceMap = {};
    (presenceData || []).forEach(p => { presenceMap[p.user_id] = p.last_seen; });
    const watchMap = {};
    (watchData || []).forEach(w => { watchMap[w.user_id] = (watchMap[w.user_id] || 0) + 1; });
    const profileMap = {};
    (profileData || []).forEach(p => { profileMap[p.user_id] = (profileMap[p.user_id] || 0) + 1; });
    setSubs(subsData.map(s => ({ ...s, last_seen: presenceMap[s.user_id] || null, watch_sessions: watchMap[s.user_id] || 0, profile_count: profileMap[s.user_id] || 0 })));
    setSubsLoading(false);
  }

  async function revokeSubscription(id) {
    await supabase.from("subscriptions").delete().eq("id", id);
    setRevokeConfirm(null);
    loadSubscriptions();
    showToast("Subscription revoked");
  }

  function exportSubsCSV() {
    const headers = ["Email", "Status", "Started", "Period Ends", "Last Seen", "Watch Sessions", "Profiles", "Stripe Customer", "Stripe Subscription"];
    const csvRows = subs.map(s => [
      s.email || s.user_id,
      s.status,
      s.created_at ? new Date(s.created_at).toLocaleDateString() : "",
      s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "",
      s.last_seen ? new Date(s.last_seen).toLocaleDateString() : "Never",
      s.watch_sessions,
      s.profile_count,
      s.stripe_customer_id || "",
      s.stripe_subscription_id || "",
    ].map(v => `"${v}"`));
    const csv = [headers, ...csvRows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `peep-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const active = subs.filter(s => s.status === "active");
  const activePaid = active.filter(s => s.plan !== "comp");
  const activeComp = active.filter(s => s.plan === "comp");
  const inactive = subs.filter(s => s.status !== "active");
  const mrr = activePaid.length * 10;
  const arr = mrr * 12;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const netNewThisMonth = subs.filter(s => s.plan !== "comp" && s.created_at && new Date(s.created_at) >= startOfMonth).length;
  const paidTotal = subs.filter(s => s.plan !== "comp").length;
  const churnRate = paidTotal > 0 ? (((paidTotal - activePaid.length) / paidTotal) * 100).toFixed(1) : "0.0";
  const atRisk = activePaid.filter(s => !s.last_seen || (now - new Date(s.last_seen)) > 14 * 24 * 60 * 60 * 1000);

  const filtered = subs
    .filter(s => subStatusFilter === "all" || s.status === subStatusFilter)
    .filter(s => !subSearch || (s.email || "").toLowerCase().includes(subSearch.toLowerCase()))
    .sort((a, b) => {
      const av = a[subSort.col] ?? "";
      const bv = b[subSort.col] ?? "";
      return subSort.dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });


  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Subscriptions</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button onClick={exportSubsCSV} disabled={subs.length === 0} style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 7, padding: "8px 16px", color: "#34d399", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Export CSV
          </button>
          <button onClick={loadSubscriptions} style={{ background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", borderRadius: 7, padding: "8px 16px", color: "#818cf8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 32 }}>
        {[
          { label: "MRR", value: `$${mrr}`, sub: "Paid only", color: "#facc15" },
          { label: "ARR", value: `$${arr}`, sub: "Paid only", color: "#f59e0b" },
          { label: "Active Paid", value: activePaid.length, color: "#34d399" },
          { label: "Comped", value: activeComp.length, sub: "Free access granted", color: "#818cf8" },
          { label: "Churned", value: inactive.length, color: "#f87171" },
          { label: "Churn Rate", value: `${churnRate}%`, sub: "Paid subs only", color: inactive.length > 0 ? "#f87171" : "#34d399" },
          { label: "New This Month", value: netNewThisMonth, color: "#a78bfa" },
          { label: "At Risk", value: atRisk.length, sub: "Paid, no activity 14d+", color: atRisk.length > 0 ? "#f59e0b" : "#34d399" },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</p>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color }}>{value}</p>
            {sub && <p style={{ margin: "4px 0 0", fontSize: 10, color: "#9ca3af" }}>{sub}</p>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 200 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={subSearch} onChange={e => setSubSearch(e.target.value)} placeholder="Search by email…" style={{ border: "none", outline: "none", fontSize: 13, color: "#0f172a", background: "transparent", flex: 1 }} />
        </div>
        <select value={subStatusFilter} onChange={e => setSubStatusFilter(e.target.value)} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#0f172a", cursor: "pointer", outline: "none" }}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="canceled">Cancelled</option>
          <option value="past_due">Past Due</option>
        </select>
      </div>

      {/* Table */}
      {subsLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>{subs.length === 0 ? "No subscribers yet" : "No results"}</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <SortTh col="email" label="Email" sort={subSort} onSort={toggleSort} />
                <SortTh col="status" label="Status" sort={subSort} onSort={toggleSort} />
                <SortTh col="created_at" label="Started" sort={subSort} onSort={toggleSort} />
                <SortTh col="current_period_end" label="Renews" sort={subSort} onSort={toggleSort} />
                <SortTh col="last_seen" label="Last Seen" sort={subSort} onSort={toggleSort} />
                <SortTh col="watch_sessions" label="Sessions" sort={subSort} onSort={toggleSort} />
                <SortTh col="profile_count" label="Profiles" sort={subSort} onSort={toggleSort} />
                <th style={{ padding: "12px 16px" }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const daysSinceActive = s.last_seen ? Math.floor((now - new Date(s.last_seen)) / 86400000) : null;
                const isAtRisk = s.status === "active" && (daysSinceActive === null || daysSinceActive > 14);
                return (
                  <tr key={s.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #f1f5f9" : "none", background: isAtRisk ? "rgba(245,158,11,0.03)" : "transparent" }}>
                    <td style={{ padding: "14px 16px", color: "#0f172a", fontWeight: 500, maxWidth: 220 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isAtRisk && <span title="No activity in 14+ days" style={{ fontSize: 10, background: "rgba(245,158,11,0.15)", color: "#b45309", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>at risk</span>}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.email || <span style={{ color: "#9ca3af", fontFamily: "monospace", fontSize: 11 }}>{s.user_id?.slice(0, 16)}…</span>}</span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ background: s.status === "active" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", color: s.status === "active" ? "#059669" : "#dc2626", border: `1px solid ${s.status === "active" ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
                          {s.status}
                        </span>
                        {s.plan === "comp" && (
                          <span style={{ background: "rgba(129,140,248,0.12)", color: "#818cf8", border: "1px solid rgba(129,140,248,0.3)", borderRadius: 20, padding: "3px 8px", fontSize: 10, fontWeight: 700 }}>COMP</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", color: "#6b7280", whiteSpace: "nowrap" }}>{s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}</td>
                    <td style={{ padding: "14px 16px", color: "#6b7280", whiteSpace: "nowrap" }}>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</td>
                    <td style={{ padding: "14px 16px", color: daysSinceActive !== null && daysSinceActive > 14 ? "#f59e0b" : "#6b7280", whiteSpace: "nowrap" }}>
                      {daysSinceActive === null ? <span style={{ color: "#9ca3af" }}>Never</span> : daysSinceActive === 0 ? "Today" : `${daysSinceActive}d ago`}
                    </td>
                    <td style={{ padding: "14px 16px", color: "#0f172a", fontWeight: 500, textAlign: "center" }}>{s.watch_sessions}</td>
                    <td style={{ padding: "14px 16px", color: "#0f172a", textAlign: "center" }}>{s.profile_count}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <button onClick={() => setRevokeConfirm(s)} style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6, padding: "5px 12px", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Revoke confirm modal */}
      {revokeConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "32px 36px", maxWidth: 380, width: "90%", textAlign: "center" }}>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Revoke subscription?</p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{revokeConfirm.email || revokeConfirm.user_id}</p>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 28 }}>This removes access immediately. It does not cancel billing in Stripe — do that separately.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setRevokeConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => revokeSubscription(revokeConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Revoke Access</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
