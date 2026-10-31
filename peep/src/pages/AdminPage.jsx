import { useState, useEffect } from "react";
import { Wordmark } from "../components/Wordmark";
import { IS_DEV_DB } from "../components/EnvBadge";
import { CMS } from "../components/CMS";
import { supabase } from "../supabase";
import { isAdminProfile } from "../lib/auth";

export function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true, revision = 0, verifiedID = null;
    async function validate(session) {
      const request = ++revision;
      if (!session?.user) {
        setChecking(false);
        setError("Sign in with your admin account. Signing out in another tab also signs out this tab.");
        return;
      }
      try {
        const { data: profile, error } = await supabase.from("profiles").select("role, is_admin").eq("id", session.user.id).maybeSingle();
        if (!active || request !== revision) return;
        if (error) throw error;
        const allowed = isAdminProfile(profile);
        verifiedID = allowed ? session.user.id : null;
        setIsAdmin(allowed);
        setCurrentUser(allowed ? session.user : null);
        setError(allowed ? null : "This account doesn't have admin access. Sign in with your admin account.");
      } catch (err) {
        if (active && request === revision) setError(`Can't verify admin access: ${err.message}`);
      } finally {
        if (active && request === revision) setChecking(false);
      }
    }
    // Defer API work outside Supabase's synchronous auth event callback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id && session.user.id === verifiedID) return;
      verifiedID = null;
      setIsAdmin(false);
      setCurrentUser(null);
      setTimeout(() => { if (active) void validate(session); }, 0);
    });
    supabase.auth.getSession().then(({ data: { session } }) => { if (active) void validate(session); });
    return () => { active = false; revision++; subscription.unsubscribe(); };
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (signInErr) { setError(signInErr.message); setLoading(false); return; }
    const { data: profile } = await supabase.from("profiles").select("role, is_admin").eq("id", data.user.id).maybeSingle();
    if (!isAdminProfile(profile)) {
      await supabase.auth.signOut({ scope: 'local' });
      setError("This account doesn't have admin access.");
      setLoading(false);
      return;
    }
    setIsAdmin(true);
    setCurrentUser(data.user);
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = "/";
  }

  if (checking) return null;

  if (!isAdmin) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
        <div style={{ width: 360, padding: "48px 40px", background: "#111", border: "1px solid #1e1e1e", borderRadius: 16 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            {IS_DEV_DB ? (
              <>
                <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: 5, color: "#fff" }}>FARRIS</span>
                <p style={{ color: "#555", fontSize: 11, margin: "10px 0 0", letterSpacing: 2, textTransform: "uppercase" }}>Admin Panel</p>
              </>
            ) : (
              <>
                <Wordmark height={30} />
                <p style={{ color: "#555", fontSize: 13, margin: "8px 0 0" }}>Admin</p>
              </>
            )}
          </div>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                placeholder="admin@example.com"
                required
                autoFocus
                style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "12px 16px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                placeholder="••••••••"
                required
                style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "12px 16px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            {error && <p style={{ color: "#f87171", fontSize: 12, margin: 0 }}>{error}</p>}
            <button type="submit" disabled={loading}
              style={{ width: "100%", marginTop: 6, background: "#facc15", border: "none", borderRadius: 8, padding: "13px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <button onClick={() => window.location.href = "/"}
            style={{ width: "100%", marginTop: 12, background: "transparent", border: "none", color: "#444", fontSize: 13, cursor: "pointer", padding: "8px" }}>
            ← Back to Peep
          </button>
        </div>
      </div>
    );
  }

  return <CMS onExit={handleSignOut} currentUser={currentUser} />;
}
