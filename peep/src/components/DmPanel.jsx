import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { avatarForId } from "./ProfileScreen";

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

function Spinner() {
  return <div style={{ width: 24, height: 24, border: "2px solid #1a1a1a", borderTopColor: "#facc15", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />;
}

function Avatar({ profile, size = 42 }) {
  const av = avatarForId(profile?.avatar_id);
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: av?.svg ? "none" : (av?.gradient ?? "#1a1a1a"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.42, flexShrink: 0, overflow: "hidden" }}>
      {av?.svg
        ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: av.svg }} />
        : (av?.emoji ?? (profile?.display_name?.[0] ?? "?").toUpperCase())}
    </div>
  );
}

export function DmPanel({ user, open, onClose, initialFriendId = null }) {
  const [threads, setThreads] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [activeFriendId, setActiveFriendId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [newMsgMode, setNewMsgMode] = useState(false);
  const [friends, setFriends] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const msgsEndRef = useRef(null);
  const activeFriendRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { activeFriendRef.current = activeFriendId; }, [activeFriendId]);

  useEffect(() => {
    if (open && user) loadThreads();
    if (!open) { setActiveFriendId(null); setMessages([]); setNewMsgMode(false); }
  }, [open, user]);

  useEffect(() => {
    if (initialFriendId && open) openThread(initialFriendId);
  }, [initialFriendId, open]);

  // Realtime: new incoming messages
  useEffect(() => {
    if (!user || !open) return;
    const ch = supabase.channel(`dm-inbox-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${user.id}` },
        ({ new: msg }) => {
          const partnerId = msg.sender_id;
          setThreads(prev => {
            const idx = prev.findIndex(t => t.partnerId === partnerId);
            const isActive = activeFriendRef.current === partnerId;
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], lastMsg: msg, unread: (next[idx].unread || 0) + (isActive ? 0 : 1) };
              return next;
            }
            return [{ partnerId, lastMsg: msg, unread: isActive ? 0 : 1 }, ...prev];
          });
          if (activeFriendRef.current === partnerId) {
            setMessages(prev => [...prev, msg]);
            markRead(partnerId);
          }
          // Ensure we have their profile
          setProfiles(prev => {
            if (prev[partnerId]) return prev;
            supabase.from("profiles").select("id, display_name, avatar_id").eq("id", partnerId).single()
              .then(({ data }) => { if (data) setProfiles(p => ({ ...p, [partnerId]: data })); });
            return prev;
          });
        })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user, open]);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadThreads() {
    setLoadingThreads(true);
    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (!msgs) { setLoadingThreads(false); return; }

    const threadMap = {};
    msgs.forEach(msg => {
      const partnerId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
      if (!threadMap[partnerId]) {
        threadMap[partnerId] = { partnerId, lastMsg: msg, unread: 0 };
      }
      if (!msg.read && msg.recipient_id === user.id) {
        threadMap[partnerId].unread = (threadMap[partnerId].unread || 0) + 1;
      }
    });

    const threadList = Object.values(threadMap).sort((a, b) => new Date(b.lastMsg.created_at) - new Date(a.lastMsg.created_at));
    setThreads(threadList);

    const partnerIds = threadList.map(t => t.partnerId);
    if (partnerIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_id").in("id", partnerIds);
      const pMap = {};
      (profs || []).forEach(p => { pMap[p.id] = p; });
      setProfiles(prev => ({ ...prev, ...pMap }));
    }
    setLoadingThreads(false);
  }

  async function openThread(friendId) {
    setActiveFriendId(friendId);
    setNewMsgMode(false);
    setLoadingMessages(true);

    if (!profiles[friendId]) {
      const { data: prof } = await supabase.from("profiles").select("id, display_name, avatar_id").eq("id", friendId).single();
      if (prof) setProfiles(prev => ({ ...prev, [friendId]: prof }));
    }

    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${user.id})`)
      .order("created_at", { ascending: true });

    setMessages(msgs || []);
    setLoadingMessages(false);
    markRead(friendId);
    setThreads(prev => prev.map(t => t.partnerId === friendId ? { ...t, unread: 0 } : t));
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function markRead(friendId) {
    await supabase.from("messages").update({ read: true })
      .eq("recipient_id", user.id).eq("sender_id", friendId).eq("read", false);
  }

  async function sendMessage() {
    if (!draft.trim() || !activeFriendId || sending) return;
    setSending(true);
    const content = draft.trim();
    setDraft("");
    const { data: msg } = await supabase.from("messages")
      .insert({ sender_id: user.id, recipient_id: activeFriendId, content })
      .select().single();
    if (msg) {
      setMessages(prev => [...prev, msg]);
      setThreads(prev => {
        const idx = prev.findIndex(t => t.partnerId === activeFriendId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], lastMsg: msg };
          return next;
        }
        return [{ partnerId: activeFriendId, lastMsg: msg, unread: 0 }, ...prev];
      });
    }
    setSending(false);
  }

  async function loadFriends() {
    const { data: friendships } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq("status", "accepted");
    if (!friendships?.length) { setFriends([]); return; }
    const ids = friendships.map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id);
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_id").in("id", ids);
    setFriends(profs || []);
    const pMap = {};
    (profs || []).forEach(p => { pMap[p.id] = p; });
    setProfiles(prev => ({ ...prev, ...pMap }));
  }

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ flex: 1 }} onClick={onClose} />
      <div style={{ width: 380, maxWidth: "100vw", height: "100vh", background: "#0e0e0e", borderLeft: "1px solid #1e1e1e", display: "flex", flexDirection: "column", fontFamily: "'Space Grotesk', sans-serif", boxShadow: "-20px 0 60px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px 16px", borderBottom: "1px solid #1a1a1a", flexShrink: 0 }}>
          {activeFriendId ? (
            <>
              <button onClick={() => { setActiveFriendId(null); setMessages([]); }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 4, display: "flex" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <Avatar profile={profiles[activeFriendId]} size={32} />
              <p style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600, color: "#fff" }}>{profiles[activeFriendId]?.display_name || "User"}</p>
            </>
          ) : newMsgMode ? (
            <>
              <button onClick={() => setNewMsgMode(false)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 4, display: "flex" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <p style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>New Message</p>
            </>
          ) : (
            <>
              <p style={{ flex: 1, margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>Messages</p>
              <button onClick={() => { setNewMsgMode(true); loadFriends(); }}
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid #222", borderRadius: 6, padding: "6px 12px", color: "#aaa", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                New
              </button>
            </>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: 4, display: "flex", marginLeft: activeFriendId || newMsgMode ? 0 : 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {activeFriendId ? (
            <div style={{ display: "flex", flexDirection: "column", padding: "16px 20px", gap: 10, minHeight: "100%" }}>
              {loadingMessages ? (
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}><Spinner /></div>
              ) : messages.length === 0 ? (
                <p style={{ color: "#333", fontSize: 13, textAlign: "center", marginTop: 60 }}>No messages yet. Say hi!</p>
              ) : messages.map(msg => {
                const isMe = msg.sender_id === user.id;
                return (
                  <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "78%", background: isMe ? "#facc15" : "#1e1e1e", color: isMe ? "#0a0a0a" : "#e5e5e5", borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 14px", fontSize: 14, lineHeight: 1.45, wordBreak: "break-word" }}>
                      {msg.content}
                    </div>
                    <span style={{ fontSize: 10, color: "#2a2a2a", marginTop: 4 }}>{timeAgo(msg.created_at)}</span>
                  </div>
                );
              })}
              <div ref={msgsEndRef} />
            </div>
          ) : newMsgMode ? (
            <div style={{ padding: "8px 0" }}>
              {friends.length === 0 ? (
                <p style={{ color: "#333", fontSize: 13, textAlign: "center", padding: "40px 20px" }}>No friends yet. Add some from your profile page.</p>
              ) : friends.map(f => (
                <div key={f.id} onClick={() => openThread(f.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", cursor: "pointer", borderBottom: "1px solid #0f0f0f" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <Avatar profile={f} size={40} />
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>{f.display_name || "Unnamed User"}</p>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "4px 0" }}>
              {loadingThreads ? (
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}><Spinner /></div>
              ) : threads.length === 0 ? (
                <div style={{ textAlign: "center", padding: "50px 20px" }}>
                  <p style={{ color: "#333", fontSize: 14, marginBottom: 16 }}>No messages yet.</p>
                  <button onClick={() => { setNewMsgMode(true); loadFriends(); }}
                    style={{ background: "#facc15", border: "none", borderRadius: 8, padding: "10px 22px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Start a Conversation
                  </button>
                </div>
              ) : threads.map(t => {
                const prof = profiles[t.partnerId];
                const isLastMine = t.lastMsg?.sender_id === user.id;
                return (
                  <div key={t.partnerId} onClick={() => openThread(t.partnerId)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", cursor: "pointer", borderBottom: "1px solid #0f0f0f" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <Avatar profile={prof} size={44} />
                      {t.unread > 0 && (
                        <div style={{ position: "absolute", top: -2, right: -2, width: 13, height: 13, background: "#ef4444", borderRadius: "50%", border: "2px solid #0e0e0e" }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: t.unread > 0 ? 700 : 500, color: "#e5e5e5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {prof?.display_name || "User"}
                        </p>
                        <span style={{ fontSize: 11, color: "#2a2a2a", flexShrink: 0, marginLeft: 10 }}>{timeAgo(t.lastMsg?.created_at)}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: t.unread > 0 ? "#888" : "#383838", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {isLastMine ? "You: " : ""}{t.lastMsg?.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Message input */}
        {activeFriendId && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid #1a1a1a", display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
            <textarea ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Message..."
              style={{ flex: 1, background: "#1a1a1a", border: "1px solid #252525", borderRadius: 20, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.4, height: 40, maxHeight: 120, overflowY: "auto", boxSizing: "border-box" }}
            />
            <button onClick={sendMessage} disabled={!draft.trim() || sending}
              style={{ background: draft.trim() ? "#facc15" : "#1a1a1a", border: "none", borderRadius: "50%", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: draft.trim() ? "pointer" : "default", flexShrink: 0, transition: "background 0.15s" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={draft.trim() ? "#0a0a0a" : "#444"} strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
