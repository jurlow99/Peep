import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}


export function NotifBell({ user }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("viewer_notifications")
      .select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(30)
      .then(({ data }) => setNotifs(data || []));

    const ch = supabase.channel(`viewer-notifs-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "viewer_notifications", filter: `user_id=eq.${user.id}` },
        ({ new: row }) => setNotifs(prev => [row, ...prev].slice(0, 30))
      ).subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id]);

  const unread = notifs.filter(n => !n.read).length;

  async function markAllRead() {
    await supabase.from("viewer_notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  }

  function toggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && unread > 0) markAllRead();
  }

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (!bellRef.current?.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!user) return null;

  return (
    <div ref={bellRef} style={{ position: "relative" }}>
      <button onClick={toggle} title="Notifications" style={{ background: "none", border: "none", color: open ? "#fff" : "rgba(255,255,255,0.65)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", position: "relative", transition: "color 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.color = "#fff"}
        onMouseLeave={e => { if (!open) e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <div style={{ position: "absolute", top: 0, right: 0, minWidth: 15, height: 15, background: "#ef4444", borderRadius: 8, fontSize: 9, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
            {unread > 9 ? "9+" : unread}
          </div>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 12px)", width: 310, background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, overflow: "hidden", zIndex: 200, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#e5e5e5" }}>Notifications</p>
          </div>
          {notifs.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <p style={{ margin: 0, color: "#3a3a3a", fontSize: 13 }}>No notifications yet</p>
              <p style={{ margin: "6px 0 0", color: "#2a2a2a", fontSize: 12 }}>Follow a streamer to get go-live alerts</p>
            </div>
          ) : (
            <div style={{ maxHeight: 380, overflowY: "auto" }}>
              {notifs.map(n => (
                <a key={n.id} href={`/stream/${n.stream_slug}`}
                  onClick={() => setOpen(false)}
                  style={{ display: "block", padding: "12px 16px", textDecoration: "none", borderBottom: "1px solid #141414", background: n.read ? "transparent" : "rgba(239,68,68,0.05)", transition: "background 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                  onMouseLeave={e => { e.currentTarget.style.background = n.read ? "transparent" : "rgba(239,68,68,0.05)"; }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", marginTop: 6, flexShrink: 0, opacity: n.read ? 0 : 1, transition: "opacity 0.2s" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#e0e0e0" }}>
                        {n.channel_name} <span style={{ fontWeight: 400, color: "#666" }}>is live</span>
                      </p>
                      {n.stream_title && <p style={{ margin: "0 0 3px", fontSize: 12, color: "#555", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.stream_title}</p>}
                      <p style={{ margin: 0, fontSize: 11, color: "#383838" }}>{timeAgo(n.created_at)}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", letterSpacing: 0.5 }}>LIVE</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
