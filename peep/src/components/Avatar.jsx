// One avatar system for the whole app.
// A user's avatar is EITHER an uploaded photo (avatar_url) OR a preset (avatar_id).
// Precedence everywhere: photo > preset > initials. Render with <Avatar/>, never
// re-implement the resolution inline (that's how the two-avatar drift happened).

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
  {"id": "a13", "name": "Fox", "gradient": "linear-gradient(135deg, #f97316, #b45309)", "emoji": "🦊"},
  {"id": "a14", "name": "Panda", "gradient": "linear-gradient(135deg, #64748b, #1e293b)", "emoji": "🐼"},
  {"id": "a15", "name": "Cat", "gradient": "linear-gradient(135deg, #fb7185, #be185d)", "emoji": "🐱"},
  {"id": "a16", "name": "Dog", "gradient": "linear-gradient(135deg, #d97706, #78350f)", "emoji": "🐶"},
  {"id": "a17", "name": "Frog", "gradient": "linear-gradient(135deg, #84cc16, #15803d)", "emoji": "🐸"},
  {"id": "a18", "name": "Octopus", "gradient": "linear-gradient(135deg, #c084fc, #7e22ce)", "emoji": "🐙"},
  {"id": "a19", "name": "Shark", "gradient": "linear-gradient(135deg, #38bdf8, #0369a1)", "emoji": "🦈"},
  {"id": "a20", "name": "Owl", "gradient": "linear-gradient(135deg, #a78bfa, #4338ca)", "emoji": "🦉"},
  {"id": "a21", "name": "Astronaut", "gradient": "linear-gradient(135deg, #6366f1, #172554)", "emoji": "🧑‍🚀"},
  {"id": "a22", "name": "Rocket", "gradient": "linear-gradient(135deg, #f43f5e, #7c3aed)", "emoji": "🚀"},
  {"id": "a23", "name": "Planet", "gradient": "linear-gradient(135deg, #a855f7, #312e81)", "emoji": "🪐"},
  {"id": "a24", "name": "Robot", "gradient": "linear-gradient(135deg, #22d3ee, #475569)", "emoji": "🤖"},
  {"id": "a25", "name": "Popcorn", "gradient": "linear-gradient(135deg, #ef4444, #9f1239)", "emoji": "🍿"},
  {"id": "a26", "name": "Film", "gradient": "linear-gradient(135deg, #475569, #0f172a)", "emoji": "🎬"},
  {"id": "a27", "name": "Basketball", "gradient": "linear-gradient(135deg, #fb923c, #c2410c)", "emoji": "🏀"},
  {"id": "a28", "name": "Headphones", "gradient": "linear-gradient(135deg, #2dd4bf, #0f766e)", "emoji": "🎧"},
];

export function avatarForId(id) {
  return PRESET_AVATARS.find(a => a.id === id) ?? null;
}

const FALLBACK_GRADIENT = "linear-gradient(135deg, #6366f1, #8b5cf6)";

// Unified avatar renderer. Photo wins, then preset, then initials.
export function Avatar({ size = 40, avatarUrl, avatarId, name, email, border, onClick, title, style = {} }) {
  const preset = avatarUrl ? null : avatarForId(avatarId);
  const initials = ((name || email || "?").trim()[0] || "?").toUpperCase();

  const bg = avatarUrl
    ? "#1a1a1a"
    : preset?.svg
      ? "none"
      : (preset?.gradient ?? FALLBACK_GRADIENT);

  return (
    <div
      onClick={onClick}
      title={title}
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, color: "#fff", fontSize: Math.round(size * 0.42),
        background: bg,
        border: border || undefined,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : preset?.svg
          ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: preset.svg }} />
          : preset?.emoji
            ? preset.emoji
            : initials}
    </div>
  );
}
