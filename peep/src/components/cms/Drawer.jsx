// The CMS's right-hand editing drawer, as chrome only: backdrop, panel, header
// and a scrolling body. It knows nothing about what it contains.
//
// Every editing surface in the CMS used to live in one 1,295-line drawer that
// switched on the active tab. Panels now render their own form as children, so
// a form leaves with its panel instead of staying behind in the shell.
export default function Drawer({ onClose, title, children }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 298, backdropFilter: "blur(2px)" }}
      />
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0,
        width: "min(520px, 100vw)",
        background: "#ffffff",
        borderLeft: "1px solid #e2e8f0",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.1)",
        zIndex: 299,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#0f172a" }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, color: "#6b7280", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {children}
        </div>
      </div>
    </>
  );
}
