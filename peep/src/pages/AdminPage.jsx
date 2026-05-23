import { useState } from "react";
import { CMS } from "../components/CMS";
import { supabase } from "../supabase";

const SUPABASE_URL = "https://iuozujwtuzuwubhsnhix.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1b3p1and0dXp1d3ViaHNuaGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTQ2MDEsImV4cCI6MjA5NDE3MDYwMX0.IoCOsLNqUCwICddaYr1nW94gTFUUJsBIFp4pkF2bz8s";

export function AdminPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("peep_admin_auth") === "1");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function checkPin() {
    if (!pin.trim() || loading) return;
    setLoading(true);
    setPinError(false);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-admin-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.valid) {
        sessionStorage.setItem("peep_admin_auth", "1");
        if (data.role === "boss") sessionStorage.setItem("peep_boss_auth", "1");
        setAuthed(true);
      } else {
        supabase.from("admin_login_attempts").insert({ pin_entered: pin }).then(() => {});
        setPinError(true);
        setPin("");
      }
    } catch {
      setPinError(true);
      setPin("");
    }
    setLoading(false);
  }

  if (!authed) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
        <div style={{ width: 360, padding: "48px 40px", background: "#111", border: "1px solid #1e1e1e", borderRadius: 16 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28 }}>
              <span style={{ color: "#facc15" }}>peep.</span>
            </span>
            <p style={{ color: "#555", fontSize: 13, margin: "8px 0 0" }}>Admin Access</p>
          </div>
          <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
            Password
          </label>
          <input
            type="password"
            value={pin}
            onChange={e => { setPin(e.target.value); setPinError(false); }}
            onKeyDown={e => e.key === "Enter" && checkPin()}
            placeholder="Enter password"
            style={{ width: "100%", background: "#0a0a0a", border: `1px solid ${pinError ? "#facc15" : "#2a2a2a"}`, borderRadius: 8, padding: "12px 16px", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }}
            autoFocus
          />
          {pinError && <p style={{ color: "#facc15", fontSize: 12, margin: "8px 0 0" }}>Incorrect password</p>}
          <button
            onClick={checkPin}
            disabled={loading}
            style={{ width: "100%", marginTop: 20, background: "#facc15", border: "none", borderRadius: 8, padding: "13px", color: "#0a0a0a", fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Checking…" : "Enter"}
          </button>
          <button
            onClick={() => window.location.href = "/"}
            style={{ width: "100%", marginTop: 10, background: "transparent", border: "none", color: "#444", fontSize: 13, cursor: "pointer", padding: "8px" }}
          >
            ← Back to Peep
          </button>
        </div>
      </div>
    );
  }

  return <CMS onExit={() => (window.location.href = "/")} />;
}
