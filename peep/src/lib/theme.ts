/** Shared layout and brand tokens — import instead of duplicating inline styles. */
export const theme = {
  colors: {
    bg: "#0a0a0a",
    surface: "#111",
    border: "#222",
    text: "#fff",
    textMuted: "rgba(255,255,255,0.55)",
    textDim: "#555",
    accent: "#facc15",
    accentText: "#0a0a0a",
    danger: "#f87171",
    success: "#34d399",
  },
  fonts: {
    display: "'DM Serif Display', serif",
    body: "'Space Grotesk', sans-serif",
  },
  layout: {
    pad: "clamp(16px, 5vw, 96px)",
    cardW: "clamp(130px, 38vw, 252px)",
    safeTop: typeof window !== "undefined" && window.location.protocol === "capacitor:" ? 50 : 0,
  },
  radius: {
    sm: 6,
    md: 8,
    lg: 12,
    xl: 24,
  },
} as const;

export const PAD = theme.layout.pad;
export const CARD_W = theme.layout.cardW;
export const SAFE_TOP = theme.layout.safeTop;
