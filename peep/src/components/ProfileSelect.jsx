import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const YELLOW = "#facc15";

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

function avatarForId(id) {
  return PRESET_AVATARS.find(a => a.id === id) ?? PRESET_AVATARS[0];
}

export function ProfileSelect({ user, onSelect }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [managing, setManaging] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState("a1");
  const [saving, setSaving] = useState(false);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data } = await supabase
      .from("viewer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    let list = data || [];

    if (list.length === 0) {
      const defaultName = user.email?.split("@")[0] || "Main";
      const { data: created } = await supabase
        .from("viewer_profiles")
        .insert({ user_id: user.id, name: defaultName, avatar_id: "a1" })
        .select()
        .single();
      if (created) list = [created];
    }

    setProfiles(list);
    setLoading(false);
    if (list.length === 1) onSelect(list[0]);
  }

  async function createProfile() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    const { data } = await supabase
      .from("viewer_profiles")
      .insert({ user_id: user.id, name: newName.trim(), avatar_id: newAvatar })
      .select()
      .single();
    if (data) {
      setProfiles(prev => [...prev, data]);
      setShowCreate(false);
      setNewName("");
      setNewAvatar("a1");
    }
    setSaving(false);
  }

  async function deleteProfile(id) {
    if (profiles.length <= 1) return;
    await supabase.from("viewer_profiles").delete().eq("id", id);
    setProfiles(prev => prev.filter(p => p.id !== id));
  }

  if (loading) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #1a1a1a", borderTopColor: YELLOW, animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", color: "#fff", padding: "80px 24px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ position: "absolute", top: 28, left: 40 }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: YELLOW }}>peep.</span>
      </div>

      <h1 style={{ margin: "0 0 52px", fontFamily: "'DM Serif Display', serif", fontSize: "clamp(26px, 5vw, 40px)", fontWeight: 400, textAlign: "center" }}>
        Who's watching?
      </h1>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center", maxWidth: 720 }}>
        {profiles.map(profile => {
          const av = avatarForId(profile.avatar_id);
          return (
            <div key={profile.id} onClick={() => !managing && onSelect(profile)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, cursor: managing ? "default" : "pointer" }}>
              <div
                style={{ width: 116, height: 116, borderRadius: 12, background: av.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46, border: "3px solid transparent", transition: "border-color 0.2s, transform 0.2s", position: "relative" }}
                onMouseEnter={e => { if (!managing) { e.currentTarget.style.borderColor = "#fff"; e.currentTarget.style.transform = "scale(1.06)"; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.transform = "scale(1)"; }}
              >
                {av.emoji}
                {managing && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: 10, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </div>
                )}
                {managing && profiles.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); deleteProfile(profile.id); }}
                    style={{ position: "absolute", top: -10, right: -10, width: 26, height: 26, borderRadius: "50%", background: "#ef4444", border: "2px solid #0a0a0a", color: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, lineHeight: 1 }}>
                    ×
                  </button>
                )}
              </div>
              <span style={{ fontSize: 14, color: "#bbb", fontWeight: 500, maxWidth: 116, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
                {profile.name}
              </span>
            </div>
          );
        })}

        {profiles.length < 5 && !managing && (
          <div onClick={() => setShowCreate(true)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, cursor: "pointer" }}>
            <div
              style={{ width: 116, height: 116, borderRadius: 12, border: "2px dashed #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color 0.2s, transform 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#555"; e.currentTarget.style.transform = "scale(1.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.transform = "scale(1)"; }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
            <span style={{ fontSize: 14, color: "#555", fontWeight: 500 }}>Add Profile</span>
          </div>
        )}
      </div>

      <button
        onClick={() => setManaging(m => !m)}
        style={{ marginTop: 52, background: "transparent", border: "1px solid #222", borderRadius: 8, padding: "10px 30px", color: "#666", fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", transition: "all 0.2s" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#aaa"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.color = "#666"; }}
      >
        {managing ? "Done" : "Manage Profiles"}
      </button>

      {showCreate && (
        <>
          <div onClick={() => setShowCreate(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, backdropFilter: "blur(6px)" }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 101, background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: "36px 32px", width: "min(460px, 90vw)" }}>
            <h2 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 700 }}>New Profile</h2>

            <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Name</label>
            <input
              autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createProfile()}
              placeholder="e.g. Jake, Mom, Kids" maxLength={24}
              style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "11px 14px", color: "#fff", fontSize: 15, outline: "none", marginBottom: 24, boxSizing: "border-box" }}
            />

            <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>Avatar</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 28 }}>
              {PRESET_AVATARS.map(av => (
                <button key={av.id} onClick={() => setNewAvatar(av.id)}
                  style={{ background: "none", border: `2px solid ${newAvatar === av.id ? YELLOW : "transparent"}`, borderRadius: 10, padding: 3, cursor: "pointer", outline: "none" }}>
                  <div style={{ width: "100%", aspectRatio: "1", borderRadius: 8, background: av.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                    {av.emoji}
                  </div>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowCreate(false)}
                style={{ flex: 1, background: "transparent", border: "1px solid #2a2a2a", borderRadius: 8, padding: "12px", color: "#666", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={createProfile} disabled={!newName.trim() || saving}
                style={{ flex: 2, background: newName.trim() ? YELLOW : "#1a1a1a", border: "none", borderRadius: 8, padding: "12px", color: newName.trim() ? "#0a0a0a" : "#444", fontSize: 14, fontWeight: 700, cursor: newName.trim() ? "pointer" : "default", transition: "background 0.2s" }}>
                {saving ? "Creating…" : "Create Profile"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
