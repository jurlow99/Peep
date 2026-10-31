import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { Avatar, PRESET_AVATARS, avatarForId } from "./Avatar";

// These used to be defined here; they now live in Avatar.jsx. Re-export so the
// existing `import { avatarForId, PRESET_AVATARS } from ".../ProfileScreen"` calls
// around the app keep working.
export { PRESET_AVATARS, avatarForId };

const YELLOW = "#facc15";

// Quick-access profile drawer. Display + navigation only — editing lives in Settings
// (one editor, so the avatar/name/bio can't drift out of sync).
export function ProfileScreen({ user, userAvatarId, userAvatarUrl, userName, onClose, onViewProfile, onOpenSettings, onCreatorDash, onStreamerDash }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("username, full_name, bio, avatar_id, avatar_url").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setProfile(data); });
  }, [user]);

  async function handleSignOut() {
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = "/";
  }

  const avatarUrl = userAvatarUrl ?? profile?.avatar_url ?? null;
  const avatarId = userAvatarId ?? profile?.avatar_id ?? null;
  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;

  const actionBtn = (label, onClick, opts = {}) => (
    <button onClick={onClick}
      style={{ width: "100%", background: opts.bg || "transparent", border: `1px solid ${opts.border || "#2a2a2a"}`, borderRadius: 10, padding: "12px", color: opts.color || "#e5e5e5", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      onMouseEnter={e => e.currentTarget.style.background = opts.hover || "rgba(255,255,255,0.05)"}
      onMouseLeave={e => e.currentTarget.style.background = opts.bg || "transparent"}>
      {opts.icon}{label}
    </button>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />

      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: "min(400px, 100vw)", background: "#0f0f0f", borderLeft: "1px solid #1a1a1a", display: "flex", flexDirection: "column", overflowY: "auto", fontFamily: "'Space Grotesk', sans-serif" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #1a1a1a", flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Profile</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "2px 4px" }}>×</button>
        </div>

        {/* Avatar + info */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 24px 28px", borderBottom: "1px solid #1a1a1a" }}>
          <Avatar size={88} avatarUrl={avatarUrl} avatarId={avatarId} name={userName || profile?.full_name} email={user?.email} border={`3px solid ${YELLOW}`} style={{ marginBottom: 16 }} />
          <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#fff" }}>{userName || profile?.full_name || user?.email}</p>
          {profile?.username && <p style={{ margin: "0 0 4px", fontSize: 13, color: YELLOW, fontWeight: 600 }}>@{profile.username}</p>}
          <p style={{ margin: 0, fontSize: 13, color: "#555" }}>{user?.email}</p>
          {memberSince && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#333" }}>Member since {memberSince}</p>}
        </div>

        {/* Actions */}
        <div style={{ padding: "24px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
          {onStreamerDash && actionBtn("Streamer Dashboard", () => { onClose(); onStreamerDash(); }, { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.3)", color: "#ef4444", hover: "rgba(239,68,68,0.14)", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 7.76a6 6 0 0 0 0 8.49"/></svg> })}
          {onCreatorDash && actionBtn("Creator Dashboard", () => { onClose(); onCreatorDash(); }, { bg: "rgba(250,204,21,0.08)", border: "rgba(250,204,21,0.3)", color: YELLOW, hover: "rgba(250,204,21,0.14)", icon: <span style={{ fontSize: 16 }}>🎬</span> })}
          {onViewProfile && actionBtn("My Profile", () => { onClose(); onViewProfile(); }, { bg: "rgba(250,204,21,0.08)", border: "rgba(250,204,21,0.2)", color: YELLOW, hover: "rgba(250,204,21,0.14)" })}
          {onOpenSettings && actionBtn("Settings", () => { onClose(); onOpenSettings(); })}
          {actionBtn("Sign Out", handleSignOut, { border: "#2a2a2a", color: "#f87171", hover: "rgba(248,113,113,0.08)" })}
        </div>
      </div>
    </>
  );
}
