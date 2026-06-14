import { useState } from "react";
import { supabase } from "../supabase";
import { captureError } from "../lib/observability";
import { SUPABASE_URL } from "../lib/config";

export const PREF_AUTOPLAY_NEXT = "peep_pref_autoplay_next";
export const PREF_AUTOPLAY_PREVIEWS = "peep_pref_autoplay_previews";
export const PREF_AUTOPLAY_HERO = "peep_pref_autoplay_hero";

export function getPref(key) {
  const v = localStorage.getItem(key);
  return v === null ? true : v === "true";
}

export function setPref(key, val) {
  localStorage.setItem(key, String(val));
}

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 46, height: 26, borderRadius: 13, background: value ? "#facc15" : "#2a2a2a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 3, left: value ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: value ? "#0a0a0a" : "#555", transition: "left 0.2s, background 0.2s" }} />
    </div>
  );
}

export function SettingRow({ label, description, value, onChange, noBorder = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "14px 18px", borderBottom: noBorder ? "none" : "1px solid #1a1a1a" }}>
      <div>
        <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>{label}</p>
        {description && <p style={{ margin: 0, fontSize: 12, color: "#444" }}>{description}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}


export function AvatarThumb({ av, size = 48, selected = false, onClick }) {
  const isSvg = !!av.svg;
  return (
    <button onClick={onClick} style={{ background: "none", border: `2px solid ${selected ? "#facc15" : "rgba(255,255,255,0.06)"}`, borderRadius: 12, padding: 3, cursor: "pointer", outline: "none", transition: "border-color 0.15s, transform 0.15s", transform: selected ? "scale(1.06)" : "scale(1)" }}>
      <div style={{ width: size, height: size, borderRadius: 8, background: av.gradient || "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.44), overflow: "hidden" }}>
        {isSvg ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: av.svg }} /> : av.emoji}
      </div>
    </button>
  );
}

function AvatarDisplay({ av, size = 64, initials }) {
  if (!av) return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 700, border: "3px solid #facc15", flexShrink: 0 }}>{initials}</div>
  );
  const isSvg = !!av.svg;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: av.gradient || "#1a1a1a", border: "3px solid #facc15", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.44 }}>
      {isSvg ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: av.svg }} /> : av.emoji}
    </div>
  );
}

export function DeleteAccountSection({ user, onSignOut, inline }) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  if (inline) {
    return (
      <div style={{ flex: 1, position: "relative" }}>
        {!confirm ? (
          <button onClick={() => setConfirm(true)}
            style={{ width: "100%", background: "transparent", border: "1px solid #2a2a2a", borderRadius: 12, padding: "14px", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#7f1d1d"; e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#555"; }}>
            Delete Account
          </button>
        ) : (
          <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "20px" }}>
            <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "#f87171" }}>Delete your account?</p>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "#555" }}>This permanently deletes your account, all profiles, and watch history. This cannot be undone.</p>
            {error && <p style={{ margin: "0 0 12px", fontSize: 12, color: "#f87171" }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirm(false)} disabled={deleting}
                style={{ flex: 1, background: "transparent", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px", color: "#666", fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, background: "#7f1d1d", border: "none", borderRadius: 8, padding: "10px", color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1 }}>
                {deleting ? "Deleting…" : "Yes, Delete Everything"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #1a1a1a" }}>
      {!confirm ? (
        <button onClick={() => setConfirm(true)}
          style={{ background: "transparent", border: "none", color: "#444", fontSize: 13, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
          Delete Account
        </button>
      ) : (
        <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "20px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "#f87171" }}>Delete your account?</p>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: "#555" }}>This permanently deletes your account, all profiles, and watch history. This cannot be undone.</p>
          {error && <p style={{ margin: "0 0 12px", fontSize: 12, color: "#f87171" }}>{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setConfirm(false)} disabled={deleting}
              style={{ flex: 1, background: "transparent", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px", color: "#666", fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleting}
              style={{ flex: 1, background: "#7f1d1d", border: "none", borderRadius: 8, padding: "10px", color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1 }}>
              {deleting ? "Deleting…" : "Yes, Delete Everything"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
