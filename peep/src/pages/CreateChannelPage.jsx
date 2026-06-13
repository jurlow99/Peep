import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const BG = "#0a0a0a";
const YELLOW = "#facc15";
const BORDER = "#1e1e1e";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function CreateChannelPage() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [channelName, setChannelName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creds, setCreds] = useState(null); // { rtmp_url, stream_key, slug }
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user ?? null));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!channelName.trim()) return;
    setLoading(true);
    setError(null);

    const token = await getToken();
    if (!token) { setError("You need to be signed in."); setLoading(false); return; }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-channel`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel_name: channelName.trim() }),
    });
    const data = await res.json();

    if (data.error) {
      if (data.error === "already_exists") {
        setError("You already have a channel. Sign in to your streamer dashboard to manage it.");
      } else {
        setError(data.error);
      }
      setLoading(false);
      return;
    }

    // Set streamer session so dashboard works immediately
    sessionStorage.setItem("streamer_session_active", "1");
    setCreds(data);
    setLoading(false);
  }

  function copy(text, label) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  const inp = {
    width: "100%", background: "#0d0d0d", border: `1px solid ${BORDER}`,
    borderRadius: 10, padding: "13px 14px", color: "#fff", fontSize: 15,
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  const mono = {
    fontFamily: "monospace", fontSize: 13, color: YELLOW,
    wordBreak: "break-all", margin: 0, lineHeight: 1.6,
  };

  // Loading auth
  if (user === undefined) return null;

  return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
      <div style={{ width: "min(540px, 100%)" }}>

        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: YELLOW }}>peep.</span>
          </a>
        </div>

        {/* Success — show credentials */}
        {creds ? (
          <div style={{ background: "#111", border: `1px solid ${BORDER}`, borderRadius: 16, padding: "40px clamp(20px,6vw,40px)" }}>
            <div style={{ fontSize: 40, marginBottom: 16, textAlign: "center" }}>🎙️</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: "#fff", textAlign: "center" }}>You're live-ready.</h2>
            <p style={{ margin: "0 0 32px", fontSize: 14, color: "#666", textAlign: "center", lineHeight: 1.6 }}>
              Add these to OBS under Settings → Stream → Custom.
            </p>

            {[
              { label: "RTMP Server", value: creds.rtmp_url },
              { label: "Stream Key", value: creds.stream_key },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 6px", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>{label}</p>
                    <p style={mono}>{value}</p>
                  </div>
                  <button
                    onClick={() => copy(value, label)}
                    style={{ flexShrink: 0, background: copied === label ? "#22c55e22" : "#1a1a1a", border: `1px solid ${copied === label ? "#22c55e" : BORDER}`, borderRadius: 8, padding: "6px 14px", color: copied === label ? "#22c55e" : "#aaa", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {copied === label ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
              <a
                href="/streamer"
                style={{ display: "block", background: YELLOW, color: "#0a0a0a", fontWeight: 700, fontSize: 15, padding: "14px", borderRadius: 10, textDecoration: "none", textAlign: "center" }}
              >
                Go to Dashboard →
              </a>
              {creds.slug && (
                <a
                  href={`/stream/${creds.slug}`}
                  style={{ display: "block", background: "transparent", color: "#555", fontWeight: 500, fontSize: 13, padding: "10px", borderRadius: 10, textDecoration: "none", textAlign: "center", border: `1px solid ${BORDER}` }}
                >
                  View your channel page
                </a>
              )}
            </div>
          </div>

        ) : !user ? (
          /* Not signed in */
          <div style={{ background: "#111", border: `1px solid ${BORDER}`, borderRadius: 16, padding: "48px 36px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>📡</div>
            <h2 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 700, color: "#fff" }}>Create your channel</h2>
            <p style={{ margin: "0 0 28px", fontSize: 14, color: "#666", lineHeight: 1.6 }}>
              Sign up or sign in to get your RTMP stream key and start broadcasting immediately. No application. No waiting.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/signup" style={{ background: YELLOW, color: "#0a0a0a", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 10, textDecoration: "none" }}>
                Create account
              </a>
              <a href="/signin" style={{ background: "transparent", color: "#aaa", fontWeight: 600, fontSize: 14, padding: "12px 28px", borderRadius: 10, textDecoration: "none", border: `1px solid ${BORDER}` }}>
                Sign in
              </a>
            </div>
          </div>

        ) : (
          /* Signed in — create channel form */
          <div style={{ background: "#111", border: `1px solid ${BORDER}`, borderRadius: 16, padding: "40px clamp(20px,6vw,40px)" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, color: "#fff" }}>Create your channel</h2>
            <p style={{ margin: "0 0 32px", fontSize: 13, color: "#555", lineHeight: 1.6 }}>
              No application. No approval. Just pick a name and you're live.
            </p>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>Channel name</label>
                <input
                  type="text"
                  value={channelName}
                  onChange={e => setChannelName(e.target.value)}
                  placeholder="Your name or channel name"
                  maxLength={60}
                  required
                  style={inp}
                  autoFocus
                />
              </div>

              {error && <p style={{ margin: 0, color: "#f87171", fontSize: 13 }}>{error}</p>}

              <button
                type="submit"
                disabled={loading || !channelName.trim()}
                style={{ background: YELLOW, border: "none", borderRadius: 10, padding: "14px", color: "#0a0a0a", fontSize: 15, fontWeight: 700, cursor: loading || !channelName.trim() ? "not-allowed" : "pointer", opacity: loading || !channelName.trim() ? 0.6 : 1, marginTop: 4 }}
              >
                {loading ? "Setting up your channel…" : "Create channel"}
              </button>
            </form>

            <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 13, color: "#444" }}>
              Already have a channel?{" "}
              <a href="/streamer-signin" style={{ color: YELLOW, textDecoration: "none", fontWeight: 600 }}>Sign in to dashboard</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
