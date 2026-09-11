// Shared, non-component styling for the market card -- split out of
// MarketOverlay.jsx because a component file can only export components
// (react-refresh/only-export-components), and EventsPanel's live preview
// needs these to render the REAL card look, not a copy that can drift.
export const YELLOW = "#facc15";

export const CARD_STYLE = {
  padding: "14px 16px",
  borderRadius: 10,
  background: "rgba(15,14,8,0.72)",
  backdropFilter: "blur(10px) saturate(1.3)", // sized to the card only -- never full-bleed, see spec §2
  border: "1px solid rgba(255,255,255,0.09)",
  fontFamily: "'Space Grotesk', sans-serif",
  color: "#f3f1e6",
  boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
};
