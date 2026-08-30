import { useState, useEffect } from "react";
import { supabase } from "../../supabase";

// Audit log tab: read-only view of the last 200 admin actions. Self-contained —
// the shell writes audit rows via its own logAudit; this only reads them back.
export default function AuditPanel() {
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);

  useEffect(() => { loadAudit(); }, []);

  async function loadAudit() {
    setAuditLoading(true);
    const { data } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
    setAuditRows(data || []);
    setAuditLoading(false);
  }

  return (
      <div>
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Audit Log</h2>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Recent admin actions — who did what, and when. Last 200 events.</p>
          </div>
          <button onClick={loadAudit} disabled={auditLoading} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer", flexShrink: 0 }}>{auditLoading ? "…" : "↻ Refresh"}</button>
        </div>
        {auditLoading ? <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>Loading…</div>
          : auditRows.length === 0 ? <div style={{ color: "#6b7280", padding: 40, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 10 }}>No audit entries yet. Deletes, approvals, and flag changes will show up here.</div>
          : (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
              {auditRows.map(r => (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr 150px", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 13, alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.action}{r.entity ? ` · ${r.entity}` : ""}</span>
                  <span style={{ color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.entity_id ? `#${r.entity_id} · ` : ""}{r.actor_email || r.actor_id || "—"}{r.details ? ` · ${JSON.stringify(r.details)}` : ""}</span>
                  <span style={{ color: "#9ca3af", textAlign: "right" }}>{new Date(r.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
      </div>
  );
}
