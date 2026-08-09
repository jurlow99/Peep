import { useState, useEffect, useRef } from "react";
import { Wordmark } from "../components/Wordmark";
import { supabase } from "../supabase";
import { SUPABASE_URL } from "../lib/config";
import {
  PREF_AUTOPLAY_NEXT,
  PREF_AUTOPLAY_PREVIEWS,
  PREF_AUTOPLAY_HERO,
  getPref,
  setPref,
  SettingRow,
  DeleteAccountSection,
} from "./settingsHelpers";

const BG = "#0a0a0a";
const CARD = "#111";
const BORDER = "#1e1e1e";
const YELLOW = "#facc15";
const inp = {
  width: "100%", background: "#161616", border: `1px solid ${BORDER}`,
  borderRadius: 10, padding: "11px 14px", color: "#fff", fontSize: 14,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  transition: "border-color 0.15s",
};

function Label({ children, sub }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#ccc" }}>{children}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#444" }}>{sub}</p>}
    </div>
  );
}

function SaveBtn({ onClick, disabled, loading, label = "Save Changes" }) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      style={{ background: disabled ? "#1a1a1a" : YELLOW, border: "none", borderRadius: 8, padding: "10px 22px", color: disabled ? "#444" : "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: disabled ? "default" : "pointer", transition: "background 0.15s, color 0.15s", marginTop: 16 }}>
      {loading ? "Saving…" : label}
    </button>
  );
}

function Msg({ msg }) {
  if (!msg) return null;
  return <p style={{ margin: "10px 0 0", fontSize: 13, color: msg.type === "ok" ? "#4ade80" : "#f87171" }}>{msg.text}</p>;
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#3a3a3a", letterSpacing: "0.12em", textTransform: "uppercase" }}>{title}</p>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 22px" }}>
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: `1px solid ${BORDER}`, margin: "20px 0" }} />;
}

// ── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab({ user, onProfileUpdate }) {
  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name || "");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    supabase.from("profiles").select("username, full_name, bio, avatar_url").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUsername(data.username || "");
          setDisplayName(data.full_name || user?.user_metadata?.full_name || "");
          setBio(data.bio || "");
          setAvatarUrl(data.avatar_url || user?.user_metadata?.avatar_url || "");
        }
      });
  }, [user.id]);

  async function uploadPhoto(file) {
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { setMsg({ type: "error", text: "Photo upload failed: " + error.message }); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(publicUrl);
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
    await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
    setMsg({ type: "ok", text: "Profile photo updated!" });
    onProfileUpdate?.();
    setUploading(false);
  }

  async function saveProfile() {
    setSaving(true); setMsg(null);
    await supabase.from("profiles").update({ full_name: displayName.trim(), username: username.trim(), bio: bio.trim() }).eq("id", user.id);
    await supabase.auth.updateUser({ data: { full_name: displayName.trim() } });
    setSaving(false);
    setMsg({ type: "ok", text: "Profile saved!" });
    onProfileUpdate?.();
  }

  const initials = (displayName || user?.email || "?")[0].toUpperCase();
  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;

  return (
    <>
      {/* Avatar */}
      <Section title="Profile Photo">
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg,#312e81,#6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700, color: "#fff", overflow: "hidden", border: `3px solid ${BORDER}` }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : initials}
            </div>
            <button onClick={() => fileRef.current?.click()}
              style={{ position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: "50%", background: YELLOW, border: "2px solid #0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#0a0a0a"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => uploadPhoto(e.target.files[0])} />
          </div>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>Profile Picture</p>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "#444" }}>JPG, PNG or GIF. Max 5MB.</p>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 16px", color: "#bbb", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              {uploading ? "Uploading…" : "Change Photo"}
            </button>
          </div>
        </div>
        <Msg msg={msg} />
      </Section>

      {/* Display Name + Username */}
      <Section title="Identity">
        <div style={{ marginBottom: 16 }}>
          <Label sub="How you appear across Peep">Display Name</Label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" maxLength={60} style={inp} />
        </div>
        <div>
          <Label sub="Your unique @handle">Username</Label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#444", fontSize: 14 }}>@</span>
            <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="yourhandle" maxLength={30} style={{ ...inp, paddingLeft: 28 }} />
          </div>
        </div>
      </Section>

      {/* Bio */}
      <Section title="About">
        <Label sub="Tell people a bit about yourself">Bio</Label>
        <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Write a short bio…" maxLength={300} rows={4}
          style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} />
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#333", textAlign: "right" }}>{bio.length}/300</p>
      </Section>

      <SaveBtn onClick={saveProfile} loading={saving} disabled={saving} />

      {memberSince && (
        <p style={{ margin: "20px 0 0", fontSize: 12, color: "#333" }}>Member since {memberSince}</p>
      )}
    </>
  );
}

// ── Account Tab ───────────────────────────────────────────────────────────────
function AccountTab({ user }) {
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null);
  const [showPw, setShowPw] = useState(false);

  async function changeEmail() {
    if (!newEmail.trim() || newEmail === user.email) return;
    setEmailSaving(true); setEmailMsg(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailSaving(false);
    if (error) {
      const msg = error.message?.toLowerCase() || "";
      const friendly = msg.includes("already") || msg.includes("registered") || msg.includes("taken")
        ? "That email is already linked to another account."
        : error.message;
      setEmailMsg({ type: "error", text: friendly });
    }
    else { setEmailMsg({ type: "ok", text: `Confirmation link sent to ${newEmail.trim()} — click it to complete the change.` }); setNewEmail(""); }
  }

  async function changePassword() {
    if (newPassword.length < 6) { setPasswordMsg({ type: "error", text: "Password must be at least 6 characters" }); return; }
    if (newPassword !== confirmPassword) { setPasswordMsg({ type: "error", text: "Passwords don't match" }); return; }
    setPasswordSaving(true); setPasswordMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) setPasswordMsg({ type: "error", text: error.message });
    else { setPasswordMsg({ type: "ok", text: "Password updated!" }); setNewPassword(""); setConfirmPassword(""); }
  }

  return (
    <>
      <Section title="Email Address">
        <p style={{ margin: "0 0 14px", fontSize: 14, color: "#555" }}>Current: <span style={{ color: "#aaa" }}>{user?.email}</span>
          {!user?.email_confirmed_at && <span style={{ marginLeft: 8, fontSize: 11, color: "#f87171", fontWeight: 700 }}>Unverified</span>}
        </p>
        {!user?.email_confirmed_at && (
          <button onClick={async () => { await supabase.auth.resend({ type: "signup", email: user.email }); setEmailMsg({ type: "ok", text: "Verification email sent!" }); }}
            style={{ background: "transparent", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "8px 16px", color: "#f87171", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16 }}>
            Resend Verification Email
          </button>
        )}
        <Label>New Email Address</Label>
        <input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setEmailMsg(null); }} placeholder="new@email.com" style={inp} />
        <Msg msg={emailMsg} />
        <SaveBtn onClick={changeEmail} disabled={!newEmail.trim() || emailSaving} loading={emailSaving} label="Update Email" />
      </Section>

      <Section title="Password">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
          <div>
            <Label>New Password</Label>
            <input type={showPw ? "text" : "password"} value={newPassword} onChange={e => { setNewPassword(e.target.value); setPasswordMsg(null); }} placeholder="Min 6 characters" style={inp} />
          </div>
          <div>
            <Label>Confirm Password</Label>
            <input type={showPw ? "text" : "password"} value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setPasswordMsg(null); }} placeholder="Repeat password" style={inp} />
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", marginTop: 8 }}>
          <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} style={{ accentColor: YELLOW }} />
          <span style={{ fontSize: 12, color: "#444" }}>Show passwords</span>
        </label>
        <Msg msg={passwordMsg} />
        <SaveBtn onClick={changePassword} disabled={!newPassword || passwordSaving} loading={passwordSaving} label="Update Password" />
      </Section>
    </>
  );
}

// ── Subscription Tab ──────────────────────────────────────────────────────────
// ── Preferences Tab ───────────────────────────────────────────────────────────
function PreferencesTab() {
  const [autoplayNext, setAutoplayNext] = useState(() => getPref(PREF_AUTOPLAY_NEXT));
  const [autoplayPreviews, setAutoplayPreviews] = useState(() => getPref(PREF_AUTOPLAY_PREVIEWS));
  const [autoplayHero, setAutoplayHero] = useState(() => getPref(PREF_AUTOPLAY_HERO));

  return (
    <Section title="Playback">
      <SettingRow label="Autoplay Next Episode" description="Automatically play the next episode when one ends" value={autoplayNext} onChange={v => { setAutoplayNext(v); setPref(PREF_AUTOPLAY_NEXT, v); }} />
      <SettingRow label="Hover Previews" description="Play a trailer when hovering over a title" value={autoplayPreviews} onChange={v => { setAutoplayPreviews(v); setPref(PREF_AUTOPLAY_PREVIEWS, v); }} />
      <SettingRow label="Hero Trailer Autoplay" description="Auto-play the featured trailer on the home screen" value={autoplayHero} onChange={v => { setAutoplayHero(v); setPref(PREF_AUTOPLAY_HERO, v); }} noBorder />
    </Section>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "profile", label: "Profile", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
  { id: "account", label: "Account", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> },
  { id: "preferences", label: "Preferences", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v1m0 16v1M3 12h1m16 0h1M5.6 5.6l.7.7m11.4-.7-.7.7M5.6 18.4l.7-.7m11.4.7-.7-.7"/><circle cx="12" cy="12" r="4"/></svg> },
];

export function SettingsPage({ user, isOwner, isStreamer = false, onApplyToStream, onBack, onGoHome, onProfileUpdate, onSignOut }) {
  const [activeTab, setActiveTab] = useState("profile");
  const isMobile = typeof window !== "undefined" && window.innerWidth < 700;

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>

      {/* Top nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 16, padding: "0 clamp(16px,5vw,48px)", height: 60, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: "#aaa", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <Wordmark height={22} onClick={onGoHome} />
        <span style={{ fontSize: 15, fontWeight: 600, color: "#555", marginLeft: 4 }}>Settings</span>
      </nav>

      <div style={{ paddingTop: 60, display: "flex", minHeight: "100vh" }}>

        {/* Sidebar */}
        <aside style={{ width: isMobile ? "100%" : 220, flexShrink: 0, borderRight: isMobile ? "none" : `1px solid ${BORDER}`, padding: isMobile ? "16px clamp(16px,5vw,48px) 0" : "40px 0", display: isMobile ? "flex" : "block", gap: isMobile ? 4 : 0, flexWrap: isMobile ? "wrap" : undefined, overflowX: isMobile ? "auto" : undefined }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: isMobile ? "auto" : "100%", padding: isMobile ? "8px 14px" : "11px 24px", background: activeTab === t.id ? "rgba(250,204,21,0.06)" : "transparent", border: isMobile ? `1px solid ${activeTab === t.id ? "rgba(250,204,21,0.3)" : BORDER}` : "none", borderRadius: isMobile ? 20 : 0, borderLeft: isMobile ? undefined : activeTab === t.id ? `3px solid ${YELLOW}` : "3px solid transparent", color: activeTab === t.id ? YELLOW : "#555", fontSize: 14, fontWeight: activeTab === t.id ? 600 : 400, cursor: "pointer", textAlign: "left", transition: "all 0.15s", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              <span style={{ color: activeTab === t.id ? YELLOW : "#3a3a3a" }}>{t.icon}</span>
              {t.label}
            </button>
          ))}

          {/* Bottom actions */}
          {!isMobile && (
            <div style={{ marginTop: "auto", padding: "24px 24px 32px", borderTop: `1px solid ${BORDER}`, position: "sticky", bottom: 0 }}>
              <button onClick={onSignOut} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer", padding: "10px 0", fontFamily: "inherit" }}
                onMouseEnter={e => e.currentTarget.style.color = "#aaa"}
                onMouseLeave={e => e.currentTarget.style.color = "#555"}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </button>
            </div>
          )}
        </aside>

        {/* Content */}
        <main style={{ flex: 1, padding: isMobile ? "24px clamp(16px,5vw,48px) 80px" : "40px clamp(24px,4vw,64px) 80px", maxWidth: 680, minWidth: 0 }}>

          {activeTab === "profile" && <ProfileTab user={user} onProfileUpdate={onProfileUpdate} />}
          {activeTab === "account" && <AccountTab user={user} />}
          {activeTab === "preferences" && <PreferencesTab />}

          {/* Stream on Peep — apply (non-streamers) or open studio (approved) */}
          {onApplyToStream && (
            <div style={{ marginTop: 32, padding: "14px 18px", background: "rgba(250,204,21,0.04)", border: "1px solid rgba(250,204,21,0.12)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>{isStreamer ? "Creator Studio" : "Stream on Peep"}</p>
                <p style={{ margin: 0, fontSize: 12, color: "#555" }}>{isStreamer ? "Manage your channel, go live, and see analytics" : "Peep Live is a curated lineup — apply for your own live channel."}</p>
              </div>
              <button onClick={onApplyToStream}
                style={{ background: "transparent", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 8, padding: "8px 16px", color: YELLOW, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                {isStreamer ? "Open →" : "Apply →"}
              </button>
            </div>
          )}

          {/* Admin shortcut */}
          {isOwner && (
            <div style={{ marginTop: 32, padding: "14px 18px", background: "rgba(250,204,21,0.04)", border: "1px solid rgba(250,204,21,0.12)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>Admin Dashboard</p>
                <p style={{ margin: 0, fontSize: 12, color: "#555" }}>Manage content, users, and settings</p>
              </div>
              <button onClick={() => window.location.href = "/admin"}
                style={{ background: "transparent", border: `1px solid rgba(250,204,21,0.2)`, borderRadius: 8, padding: "8px 16px", color: YELLOW, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Open →
              </button>
            </div>
          )}

          {/* Sign out + Delete (mobile or always-visible) */}
          <div style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${BORDER}`, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {isMobile && (
              <button onClick={onSignOut}
                style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 20px", color: "#666", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Sign Out
              </button>
            )}
            <DeleteAccountSection user={user} onSignOut={onSignOut} inline />
          </div>

        </main>
      </div>
    </div>
  );
}
