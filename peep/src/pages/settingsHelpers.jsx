import { useState } from "react";
import { supabase } from "../supabase";
import { captureError } from "../lib/observability";

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

export function DeleteAccountSection({ inline }) {
  return <a href="/account/delete" style={{display:"block",textAlign:"center",padding:14,border:"1px solid #5d3438",borderRadius:12,color:"#f2a5ab",textDecoration:"none",fontSize:14,flex:inline?1:undefined}}>Delete Account</a>;
}
