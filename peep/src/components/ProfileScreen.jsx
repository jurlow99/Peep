import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const YELLOW = "#facc15";

export const PRESET_AVATARS = [
  { id: "a1", svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="100%" height="100%"><rect width="80" height="80" fill="#4a7c2f"/><rect x="4" y="16" width="22" height="64" rx="11" fill="#292524"/><rect x="54" y="16" width="22" height="64" rx="11" fill="#292524"/><ellipse cx="40" cy="14" rx="24" ry="12" fill="#292524"/><circle cx="40" cy="34" r="18" fill="#fde9c3"/><rect x="22" y="24" width="36" height="5" rx="2.5" fill="#ef4444"/><circle cx="57" cy="26" r="3.5" fill="#fbbf24"/><circle cx="57" cy="26" r="1.5" fill="#ef4444"/><ellipse cx="33" cy="32" rx="4" ry="4" fill="#1c0a00"/><ellipse cx="47" cy="32" rx="4" ry="4" fill="#1c0a00"/><ellipse cx="33" cy="29.5" rx="5" ry="3.5" fill="#fde9c3"/><ellipse cx="47" cy="29.5" rx="5" ry="3.5" fill="#fde9c3"/><path d="M28 32 Q33 29 38 32" stroke="#c8957a" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M42 32 Q47 29 52 32" stroke="#c8957a" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="35" cy="33" r="1" fill="#fff"/><circle cx="49" cy="33" r="1" fill="#fff"/><circle cx="40" cy="38" r="1.5" fill="#c8957a"/><path d="M29 43 Q40 51 51 43" stroke="#92400e" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>` },
  { id: "a2", svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="100%" height="100%"><rect width="80" height="80" fill="#db2777"/><ellipse cx="40" cy="52" rx="25" ry="34" fill="#4a0020"/><circle cx="40" cy="43" r="21" fill="#fff0f3"/><ellipse cx="26" cy="15" rx="10" ry="6" fill="#fda4af" transform="rotate(-20 26 15)"/><ellipse cx="54" cy="15" rx="10" ry="6" fill="#fda4af" transform="rotate(20 54 15)"/><circle cx="40" cy="14" r="5" fill="#f9a8d4"/><ellipse cx="27" cy="48" rx="5" ry="3" fill="#fda4af" opacity="0.6"/><ellipse cx="53" cy="48" rx="5" ry="3" fill="#fda4af" opacity="0.6"/><ellipse cx="33" cy="41" rx="4.5" ry="5" fill="#1c0a00"/><ellipse cx="47" cy="41" rx="4.5" ry="5" fill="#1c0a00"/><circle cx="35" cy="39" r="1.5" fill="#fff"/><circle cx="49" cy="39" r="1.5" fill="#fff"/><line x1="29" y1="37" x2="27" y2="34" stroke="#1c0a00" stroke-width="1.2"/><line x1="33" y1="36" x2="33" y2="33" stroke="#1c0a00" stroke-width="1.2"/><line x1="37" y1="37" x2="39" y2="34" stroke="#1c0a00" stroke-width="1.2"/><line x1="43" y1="37" x2="41" y2="34" stroke="#1c0a00" stroke-width="1.2"/><line x1="47" y1="36" x2="47" y2="33" stroke="#1c0a00" stroke-width="1.2"/><line x1="51" y1="37" x2="53" y2="34" stroke="#1c0a00" stroke-width="1.2"/><path d="M33 52 Q40 58 47 52" stroke="#be185d" stroke-width="2" fill="none" stroke-linecap="round"/></svg>` },
  { id: "a3", svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="100%" height="100%"><rect width="80" height="80" fill="#1e3a5f"/><circle cx="40" cy="40" r="22" fill="#fde9c3"/><path d="M18 30 Q20 12 40 12 Q60 12 62 30 Q54 20 40 18 Q26 20 18 30" fill="#1c1917"/><ellipse cx="18" cy="40" rx="3" ry="4" fill="#fde9c3"/><ellipse cx="62" cy="40" rx="3" ry="4" fill="#fde9c3"/><path d="M27 29 Q32 27 37 29" stroke="#1c1917" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M43 29 Q48 27 53 29" stroke="#1c1917" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="33" cy="37" rx="4" ry="4" fill="#1c1917"/><ellipse cx="47" cy="37" rx="4" ry="4" fill="#1c1917"/><circle cx="34" cy="35.5" r="1.5" fill="#fff"/><circle cx="48" cy="35.5" r="1.5" fill="#fff"/><path d="M34 48 Q40 53 46 48" stroke="#c8957a" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="0" y="62" width="80" height="18" fill="#1e293b"/><polygon points="40,60 28,64 20,80 40,70 60,80 52,64" fill="#1e293b"/><polygon points="40,60 30,64 40,68 50,64" fill="#f1f5f9"/><polygon points="40,62 38,70 40,76 42,70" fill="#dc2626"/></svg>` },
  { id: "a4", svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="100%" height="100%"><rect width="80" height="80" fill="#0284c7"/><ellipse cx="40" cy="76" rx="28" ry="16" fill="#334155"/><path d="M25 62 Q40 56 55 62 L50 76 L40 69 L30 76 Z" fill="#475569"/><circle cx="40" cy="44" r="21" fill="#fde9c3"/><path d="M14 27 Q14 7 40 7 Q66 7 66 27 Z" fill="#1e293b"/><rect x="14" y="24" width="52" height="5" fill="#0f172a"/><rect x="10" y="27" width="60" height="6" rx="3" fill="#1e293b"/><ellipse cx="18" cy="44" rx="3" ry="4" fill="#fde9c3"/><ellipse cx="62" cy="44" rx="3" ry="4" fill="#fde9c3"/><ellipse cx="33" cy="43" rx="4" ry="4" fill="#1c0a00"/><ellipse cx="47" cy="43" rx="4" ry="4" fill="#1c0a00"/><circle cx="34" cy="41.5" r="1.5" fill="#fff"/><circle cx="48" cy="41.5" r="1.5" fill="#fff"/><path d="M33 52 Q40 58 47 52" stroke="#c2856a" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>` },
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

export function ProfileScreen({ user, activeProfile, onClose, onAvatarChange, onProfileUpdate, onSwitchProfile, onViewProfile, onOpenSettings, onCreatorDash, onStreamerDash }) {
  const [profile, setProfile] = useState(null);
  const [savedAvatar, setSavedAvatar] = useState(null);
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("username, full_name, avatar_id").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setSavedAvatar(data.avatar_id ?? null);
          setSelectedAvatar(data.avatar_id ?? null);
        }
      });
  }, [user]);

  async function handleSaveAvatar() {
    setSaving(true);
    const saves = [
      supabase.from("profiles").upsert({ id: user.id, avatar_id: selectedAvatar }, { onConflict: "id" }),
    ];
    if (activeProfile?.id) {
      saves.push(supabase.from("viewer_profiles").update({ avatar_id: selectedAvatar }).eq("id", activeProfile.id));
    }
    const results = await Promise.all(saves);
    setSaving(false);
    const hasError = results.some(r => r.error);
    if (!hasError) {
      setSavedAvatar(selectedAvatar);
      onAvatarChange?.(selectedAvatar);
      onProfileUpdate?.({ ...activeProfile, avatar_id: selectedAvatar });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const currentAvatar = avatarForId(selectedAvatar);
  const initials = (profile?.username?.[0] || user?.email?.[0] || "?").toUpperCase();
  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;
  const hasChange = selectedAvatar !== savedAvatar;

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
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: currentAvatar?.svg ? "none" : (currentAvatar?.gradient ?? "linear-gradient(135deg, #6366f1, #8b5cf6)"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700, color: "#fff", border: `3px solid ${YELLOW}`, marginBottom: 16, flexShrink: 0, overflow: "hidden" }}>
            {currentAvatar?.svg ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: currentAvatar.svg }} /> : (currentAvatar ? currentAvatar.emoji : initials)}
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
            {saved && <span style={{ fontSize: 12, color: "#22c55e" }}>Saved ✓</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            {PRESET_AVATARS.map(av => {
              const isSelected = selectedAvatar === av.id;
              return (
                <button key={av.id} onClick={() => setSelectedAvatar(av.id)} style={{ background: "none", border: `2px solid ${isSelected ? YELLOW : "transparent"}`, borderRadius: 12, padding: 3, cursor: "pointer", outline: "none", transition: "border-color 0.15s" }}>
                  <div style={{ width: "100%", aspectRatio: "1", borderRadius: 9, background: av.svg ? "none" : av.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, overflow: "hidden" }}>
                    {av.svg ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: av.svg }} /> : av.emoji}
                  </div>
                </button>
              );
            })}
          </div>
          {hasChange && (
            <button onClick={handleSaveAvatar} disabled={saving} style={{ width: "100%", background: "#facc15", border: "none", borderRadius: 10, padding: "11px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, marginBottom: 8 }}>
              {saving ? "Saving…" : "Save Avatar"}
            </button>
          )}
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#333", textAlign: "center" }}>More avatars coming soon</p>
        </div>

        {/* Actions */}
        <div style={{ padding: "24px", borderTop: "1px solid #1a1a1a", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
          {onStreamerDash && (
            <button onClick={() => { onClose(); onStreamerDash(); }}
              style={{ width: "100%", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "12px", color: "#ef4444", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.14)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.08)"}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 7.76a6 6 0 0 0 0 8.49"/></svg> Streamer Dashboard
            </button>
          )}
          {onCreatorDash && (
            <button onClick={() => { onClose(); onCreatorDash(); }}
              style={{ width: "100%", background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.3)", borderRadius: 10, padding: "12px", color: "#facc15", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(250,204,21,0.14)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(250,204,21,0.08)"}>
              <span style={{ fontSize: 16 }}>🎬</span> Creator Dashboard
            </button>
          )}
          {onViewProfile && (
            <button onClick={() => { onClose(); onViewProfile(); }}
              style={{ width: "100%", background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 10, padding: "12px", color: "#facc15", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(250,204,21,0.14)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(250,204,21,0.08)"}>
              My Profile
            </button>
          )}
          {onOpenSettings && (
            <button onClick={() => { onClose(); onOpenSettings(); }}
              style={{ width: "100%", background: "transparent", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px", color: "#e5e5e5", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              Settings
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
