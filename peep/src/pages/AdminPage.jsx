import { useState } from "react";
import { CMS } from "../components/CMS";

const ADMIN_PIN = "1234";

export function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);

  function checkPin() {
    if (pin === ADMIN_PIN) {
      setAuthed(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPin("");
    }
  }

  // ── PIN gate ──
  if (!authed) {
    return (
      <div
        style={{
          background: "#0a0a0a",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />
        <div
          style={{
            width: 360,
            padding: "48px 40px",
            background: "#111",
            border: "1px solid #1e1e1e",
            borderRadius: 16,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28 }}>
              <span style={{ color: "#facc15" }}>peep.</span>
            </span>
            <p style={{ color: "#555", fontSize: 13, margin: "8px 0 0" }}>Admin Access</p>
          </div>
          <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
            PIN
          </label>
          <input
            type="password"
            maxLength={8}
            value={pin}
            onChange={e => {
              setPin(e.target.value);
              setPinError(false);
            }}
            onKeyDown={e => e.key === "Enter" && checkPin()}
            placeholder="Enter PIN"
            style={{
              width: "100%",
              background: "#0a0a0a",
              border: `1px solid ${pinError ? "#facc15" : "#2a2a2a"}`,
              borderRadius: 8,
              padding: "12px 16px",
              color: "#fff",
              fontSize: 16,
              outline: "none",
              letterSpacing: "0.25em",
            }}
            autoFocus
          />
          {pinError && <p style={{ color: "#facc15", fontSize: 12, margin: "8px 0 0" }}>Incorrect PIN</p>}
          <button
            onClick={checkPin}
            style={{
              width: "100%",
              marginTop: 20,
              background: "#facc15",
              border: "none",
              borderRadius: 8,
              padding: "13px",
              color: "#0a0a0a",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Enter
          </button>
          <button
            onClick={() => window.location.href = "/"}
            style={{
              width: "100%",
              marginTop: 10,
              background: "transparent",
              border: "none",
              color: "#444",
              fontSize: 13,
              cursor: "pointer",
              padding: "8px",
            }}
          >
            ← Back to Peep
          </button>
        </div>
      </div>
    );
  }

  // ── Admin UI ──
  return <CMS onExit={() => (window.location.href = "/")} />;
}
