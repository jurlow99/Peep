// Shared, non-component styling for the market card -- split out of
// MarketOverlay.jsx because a component file can only export components
// (react-refresh/only-export-components), and EventsPanel's live preview
// needs these to render the REAL card look, not a copy that can drift.
export const YELLOW = "#facc15";

// Full-width broadcast-bar background -- replaced the old floating
// frosted-glass CARD_STYLE when the card became a score-bug docked to the
// player's bottom edge (no surrounding space left for a blur/shadow to sit in).
export const BAR_BG = "#0d0c08";
