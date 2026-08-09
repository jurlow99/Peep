// Brand marks. Assets live in public/PEEP_Logo_Pack/.
// README guidance: use the WHITE wordmark on dark surfaces; keep the eyes mark
// in the official yellow/black/white palette.
const BASE = "/PEEP_Logo_Pack";

// The "peep" wordmark (image, so the branded rounded look is consistent on every device).
export function Wordmark({ height = 26, variant = "white", onClick, style = {} }) {
  return (
    <img
      src={`${BASE}/peep-wordmark-${variant}.png`}
      alt="peep"
      onClick={onClick}
      style={{ height, width: "auto", display: "block", cursor: onClick ? "pointer" : "default", userSelect: "none", ...style }}
    />
  );
}

// The eyes-in-a-screen mark (SVG, pure vector). Good for narrow rails / icon slots.
export function EyesMark({ height = 32, onClick, style = {} }) {
  return (
    <img
      src={`${BASE}/peep-eyes.svg`}
      alt="peep"
      onClick={onClick}
      style={{ height, width: "auto", display: "block", cursor: onClick ? "pointer" : "default", userSelect: "none", ...style }}
    />
  );
}

// Full horizontal lockup (eyes + wordmark) for prominent headers.
export function LogoHorizontal({ height = 34, onClick, style = {} }) {
  return (
    <img
      src={`${BASE}/peep-logo-horizontal.png`}
      alt="peep"
      onClick={onClick}
      style={{ height, width: "auto", display: "block", cursor: onClick ? "pointer" : "default", userSelect: "none", ...style }}
    />
  );
}
