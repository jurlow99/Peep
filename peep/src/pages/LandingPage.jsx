const YELLOW = "#facc15";

const features = [
  {
    icon: "🎬",
    title: "Movies & Series",
    desc: "Stream originals, indie films, and full series — all in one place.",
  },
  {
    icon: "🎙️",
    title: "Podcasts",
    desc: "Discover audio shows from creators you won't find anywhere else.",
  },
  {
    icon: "📺",
    title: "Live Streams",
    desc: "Tune in to live events, premieres, and exclusive broadcasts.",
  },
  {
    icon: "✅",
    title: "Your List",
    desc: "Save anything to watch later. It's always waiting when you're ready.",
  },
];

export function LandingPage() {
  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px clamp(20px, 6vw, 80px)", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(10,10,10,0.85)", backdropFilter: "blur(12px)" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: YELLOW }}>peep.</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/signin" style={{ color: "#aaa", fontSize: 14, fontWeight: 500, textDecoration: "none", padding: "8px 16px", borderRadius: 8, transition: "color 0.15s" }}
            onMouseEnter={e => e.target.style.color = "#fff"}
            onMouseLeave={e => e.target.style.color = "#aaa"}>
            Sign In
          </a>
          <a href="/signup" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 14, fontWeight: 700, textDecoration: "none", padding: "9px 20px", borderRadius: 8 }}>
            Get Started
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "120px clamp(20px, 8vw, 120px) 80px", position: "relative", overflow: "hidden" }}>
        {/* Background glow */}
        <div style={{ position: "absolute", top: "30%", left: "50%", transform: "translate(-50%, -50%)", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, rgba(250,204,21,0.07) 0%, transparent 70%)`, pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 720 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 100, padding: "6px 14px", marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: YELLOW, display: "inline-block" }} />
            <span style={{ fontSize: 12, color: YELLOW, fontWeight: 600, letterSpacing: 0.5 }}>Now streaming</span>
          </div>

          <h1 style={{ margin: "0 0 20px", fontSize: "clamp(40px, 7vw, 72px)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            Watch something<br />
            <span style={{ color: YELLOW }}>worth watching.</span>
          </h1>

          <p style={{ margin: "0 0 44px", fontSize: "clamp(15px, 2vw, 18px)", color: "#666", lineHeight: 1.7, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
            Movies, series, podcasts, and live streams — curated for people who actually care about what they watch.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/signup" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 15, fontWeight: 700, textDecoration: "none", padding: "14px 32px", borderRadius: 10, display: "inline-block" }}>
              Create free account
            </a>
            <a href="/signin" style={{ background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 15, fontWeight: 600, textDecoration: "none", padding: "14px 32px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", display: "inline-block" }}>
              Sign in
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "80px clamp(20px, 8vw, 120px)", borderTop: "1px solid #111" }}>
        <h2 style={{ textAlign: "center", margin: "0 0 56px", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700 }}>
          Everything in one place
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, maxWidth: 900, margin: "0 auto" }}>
          {features.map(f => (
            <div key={f.title} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: "28px 24px" }}>
              <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 13, color: "#666", lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <section style={{ padding: "80px clamp(20px, 8vw, 120px)", textAlign: "center", borderTop: "1px solid #111" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "clamp(22px, 4vw, 36px)", fontWeight: 700 }}>Ready to start watching?</h2>
        <p style={{ margin: "0 0 32px", fontSize: 15, color: "#555" }}>Free to join. Start streaming in seconds.</p>
        <a href="/signup" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 15, fontWeight: 700, textDecoration: "none", padding: "14px 40px", borderRadius: 10, display: "inline-block" }}>
          Create your account →
        </a>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #111", padding: "24px clamp(20px, 6vw, 80px)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: YELLOW }}>peep.</span>
        <p style={{ margin: 0, fontSize: 12, color: "#333" }}>© {new Date().getFullYear()} Peep. All rights reserved.</p>
      </footer>
    </div>
  );
}
