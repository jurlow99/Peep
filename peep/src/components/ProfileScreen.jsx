import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const YELLOW = "#facc15";

// Placeholder preset avatars — replace with real images from DB later
const PRESET_AVATARS = [
  { id: "a1", gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)", emoji: "🎬" },
  { id: "a2", gradient: "linear-gradient(135deg, #ec4899, #f43f5e)", emoji: "🌙" },
  { id: "a3", gradient: "linear-gradient(135deg, #f97316, #eab308)", emoji: "🔥" },
  { id: "a4", gradient: "linear-gradient(135deg, #14b8a6, #06b6d4)", emoji: "🌊" },
  { id: "a5", gradient: "linear-gradient(135deg, #22c55e, #16a34a)", emoji: "🌿" },
  { id: "a6", gradient: "linear-gradient(135deg, #3b82f6, #6366f1)", emoji: "⚡" },
  { id: "a7", gradient: "linear-gradient(135deg, #f59e0b, #ef4444)", emoji: "🎭" },
  { id: "a8", gradient: "linear-gradient(135deg, #8b5cf6, #ec4899)", emoji: "🎵" },
  { id: "a9", gradient: "linear-gradient(135deg, #0ea5e9, #22c55e)", emoji: "🎮" },
  { id: "a10", gradient: "linear-gradient(135deg, #f43f5e, #f97316)", emoji: "🏆" },
  { id: "a11", gradient: "linear-gradient(135deg, #64748b, #334155)", emoji: "👾" },
  { id: "a12", gradient: "linear-gradient(135deg, #facc15, #f97316)", emoji: "⭐" },
];

export function avatarForId(id) {
  return PRESET_AVATARS.find(a => a.id === id) ?? null;
}

export function ProfileScreen({ user, onClose, onAvatarChange, onSwitchProfile, onViewProfile }) {
  const [profile, setProfile] = useState(null);
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("username, full_name, avatar_id").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setSelectedAvatar(data.avatar_id ?? null);
        }
      });
  }, [user]);

  async function saveAvatar(avatarId) {
    setSelectedAvatar(avatarId);
    onAvatarChange?.(avatarId);
    setSaving(true);
    await supabase.from("profiles").upsert({ id: user.id, avatar_id: avatarId }, { onConflict: "id" });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const currentAvatar = avatarForId(selectedAvatar);
  const initials = (profile?.username?.[0] || user?.email?.[0] || "?").toUpperCase();
  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />

      {/* Panel */}
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: "min(400px, 100vw)", background: "#0f0f0f", borderLeft: "1px solid #1a1a1a", display: "flex", flexDirection: "column", overflowY: "auto", fontFamily: "'Space Grotesk', sans-serif" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #1a1a1a", flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Profile</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "2px 4px" }}>×</button>
        </div>

        {/* Avatar + info */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 24px 28px", borderBottom: "1px solid #1a1a1a" }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: currentAvatar?.gradient ?? "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: currentAvatar ? 36 : 30, fontWeight: 700, color: "#fff", border: `3px solid ${YELLOW}`, marginBottom: 16, flexShrink: 0 }}>
            {currentAvatar ? currentAvatar.emoji : initials}
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#fff" }}>
            {profile?.username ? `@${profile.username}` : user?.email}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "#555" }}>{user?.email}</p>
          {memberSince && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#333" }}>Member since {memberSince}</p>}
        </div>

        {/* Avatar picker */}
        <div style={{ padding: "24px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.6 }}>Choose Avatar</p>
            {saving && <span style={{ fontSize: 12, color: "#555" }}>Saving…</span>}
            {saved && <span style={{ fontSize: 12, color: "#22c55e" }}>Saved ✓</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {PRESET_AVATARS.map(av => {
              const isSelected = selectedAvatar === av.id;
              return (
                <button key={av.id} onClick={() => saveAvatar(av.id)} style={{ background: "none", border: `2px solid ${isSelected ? YELLOW : "transparent"}`, borderRadius: 12, padding: 3, cursor: "pointer", outline: "none", transition: "border-color 0.15s" }}>
                  <div style={{ width: "100%", aspectRatio: "1", borderRadius: 9, background: av.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
                    {av.emoji}
                  </div>
                </button>
              );
            })}
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 11, color: "#333", textAlign: "center" }}>More avatars coming soon</p>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Switch / Sign out */}
        <div style={{ padding: "24px", borderTop: "1px solid #1a1a1a", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {onViewProfile && (
            <button onClick={() => { onClose(); onViewProfile(); }}
              style={{ width: "100%", background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 10, padding: "12px", color: "#facc15", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(250,204,21,0.14)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(250,204,21,0.08)"}>
              My Profile
            </button>
          )}
          {onSwitchProfile && (
            <button onClick={() => { onClose(); onSwitchProfile(); }}
              style={{ width: "100%", background: "transparent", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px", color: "#e5e5e5", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              Switch Profile
            </button>
          )}
          <button onClick={handleSignOut} style={{ width: "100%", background: "transparent", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px", color: "#f87171", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(248,113,113,0.08)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
