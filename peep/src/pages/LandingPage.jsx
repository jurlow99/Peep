import { useState } from "react";

const YELLOW = "#facc15";
const PAD = "clamp(24px, 7vw, 96px)";

// Cinematic gradient "posters" for the background grid
const POSTER_GRADS = [
  "linear-gradient(145deg, #1e3a8a, #2563eb)",
  "linear-gradient(145deg, #14532d, #166534)",
  "linear-gradient(145deg, #7f1d1d, #b91c1c)",
  "linear-gradient(145deg, #1e1b4b, #4338ca)",
  "linear-gradient(145deg, #78350f, #b45309)",
  "linear-gradient(145deg, #134e4a, #0f766e)",
  "linear-gradient(145deg, #4a044e, #7e22ce)",
  "linear-gradient(145deg, #1c1917, #44403c)",
  "linear-gradient(145deg, #7c2d12, #c2410c)",
  "linear-gradient(145deg, #0c4a6e, #0369a1)",
  "linear-gradient(145deg, #831843, #be185d)",
  "linear-gradient(145deg, #14532d, #15803d)",
  "linear-gradient(145deg, #312e81, #6d28d9)",
  "linear-gradient(145deg, #064e3b, #047857)",
  "linear-gradient(145deg, #7f1d1d, #dc2626)",
  "linear-gradient(145deg, #1e3a8a, #1d4ed8)",
];

const ROWS = Array.from({ length: 6 }, (_, r) =>
  Array.from({ length: 14 }, (_, c) => POSTER_GRADS[(r * 5 + c) % POSTER_GRADS.length])
);

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={YELLOW} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    ),
    title: "Movies & Series",
    desc: "Original films, indie features, and full series — on demand, any time.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={YELLOW} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M21.06 16.5a10.9 10.9 0 0 1-2.1 1.71"/><path d="M2.94 16.5a10.9 10.9 0 0 0 2.1 1.71"/><path d="M14.95 19.5a3.78 3.78 0 0 1-5.9 0"/>
      </svg>
    ),
    title: "Live Streams",
    desc: "Tune in to live events, premieres, and exclusive broadcasts as they happen.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={YELLOW} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    ),
    title: "Podcasts",
    desc: "Long-form audio from creators you won't find anywhere else.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={YELLOW} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
      </svg>
    ),
    title: "Music",
    desc: "Videos, albums, and curated listening built into the streaming experience.",
  },
];

const FAQ_ITEMS = [
  { q: "What can I watch on Peep?", a: "Peep is home to movies, full series, podcasts, live streams, and music — all in one place. Content is hand-curated, not algorithm-generated." },
  { q: "Do I need to download anything?", a: "No. Peep runs entirely in your browser on any device — phone, tablet, laptop, or TV. Nothing to install." },
  { q: "Can multiple people use one account?", a: "Yes. Peep supports multiple viewer profiles under one account so everyone gets their own watch history and saved list." },
  { q: "How do I cancel?", a: "You can cancel your subscription at any time from your account settings. No questions asked." },
  { q: "Is there a free trial?", a: "We occasionally run limited-time offers. Create an account to see what's available to you." },
];

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div onClick={onToggle} style={{ borderBottom: "1px solid #141414", cursor: "pointer", userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0", gap: 20 }}>
        <span style={{ fontSize: "clamp(14px, 1.8vw, 16px)", fontWeight: 600, color: open ? "#fff" : "#bbb", transition: "color 0.2s" }}>{q}</span>
        <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: open ? YELLOW : "rgba(255,255,255,0.05)", border: `1px solid ${open ? YELLOW : "rgba(255,255,255,0.08)"}`, display: "flex", alignItems: "center", justifyContent: "center", color: open ? "#0a0a0a" : "#555", fontSize: 18, lineHeight: 1, transition: "all 0.2s" }}>
          {open ? "−" : "+"}
        </div>
      </div>
      {open && <p style={{ margin: "0 0 22px", fontSize: 14, color: "#555", lineHeight: 1.85, maxWidth: 600 }}>{a}</p>}
    </div>
  );
}

export function LandingPage() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff", overflowX: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes scrollL { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes scrollR { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .lp-cta:hover { transform: scale(1.04) !important; box-shadow: 0 8px 36px rgba(250,204,21,0.28) !important; }
        .lp-feat:hover { border-color: rgba(250,204,21,0.2) !important; transform: translateY(-3px); }
        .lp-signin-nav:hover { color: #fff !important; }
      `}</style>

      {/* ── Fixed Nav ── */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}`, height: 68, background: "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: YELLOW }}>peep.</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="/signin" className="lp-signin-nav" style={{ color: "#aaa", fontSize: 14, fontWeight: 500, textDecoration: "none", padding: "8px 16px", borderRadius: 8, transition: "color 0.15s" }}>Sign In</a>
          <a href="/signup" className="lp-cta" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 14, fontWeight: 700, textDecoration: "none", padding: "9px 22px", borderRadius: 8, transition: "transform 0.2s, box-shadow 0.2s" }}>Get Started</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ position: "relative", height: "100vh", minHeight: 600, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>

        {/* Poster grid background */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-35%", left: "-10%", right: "-10%", bottom: "-35%", transform: "rotate(-8deg)", display: "flex", flexDirection: "column", gap: 10 }}>
            {ROWS.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 10, animation: `scroll${i % 2 === 0 ? "L" : "R"} ${52 + i * 9}s linear infinite`, willChange: "transform" }}>
                {[...row, ...row].map((grad, j) => (
                  <div key={j} style={{ width: 210, height: 120, flexShrink: 0, borderRadius: 10, background: grad, border: "1px solid rgba(255,255,255,0.04)" }} />
                ))}
              </div>
            ))}
          </div>

          {/* Dark overlay */}
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
          {/* Yellow orb */}
          <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)", width: 700, height: 500, background: "radial-gradient(ellipse, rgba(250,204,21,0.055) 0%, transparent 65%)", pointerEvents: "none" }} />
          {/* Bottom fade */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.6) 50%, transparent 100%)" }} />
          {/* Top fade */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 160, background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)" }} />
        </div>

        {/* Hero content */}
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 700, padding: `0 ${PAD}`, animation: "fadeUp 0.9s ease both" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 100, padding: "6px 16px", marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: YELLOW, display: "inline-block", boxShadow: `0 0 8px ${YELLOW}` }} />
            <span style={{ fontSize: 11, color: YELLOW, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>Now Streaming</span>
          </div>

          <h1 style={{ margin: "0 0 20px", fontSize: "clamp(40px, 7vw, 76px)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.03em", textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}>
            Watch something<br /><span style={{ color: YELLOW }}>worth watching.</span>
          </h1>

          <p style={{ margin: "0 auto 16px", fontSize: "clamp(14px, 1.8vw, 18px)", color: "#999", lineHeight: 1.7, maxWidth: 480 }}>
            Movies, series, podcasts, and live streams — curated for people who care about what they watch.
          </p>

          <p style={{ margin: "0 auto 36px", fontSize: 14, color: "#555" }}>$10/month. Cancel anytime.</p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/signup" className="lp-cta" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 16, fontWeight: 700, textDecoration: "none", padding: "16px 44px", borderRadius: 12, display: "inline-block", transition: "transform 0.2s, box-shadow 0.2s" }}>
              Get Started →
            </a>
            <a href="/signin" style={{ background: "rgba(255,255,255,0.08)", color: "#ccc", fontSize: 16, fontWeight: 600, textDecoration: "none", padding: "16px 44px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", display: "inline-block", backdropFilter: "blur(8px)", transition: "background 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.14)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}>
              Sign In
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #0f0f0f" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 11, color: YELLOW, fontWeight: 700, letterSpacing: 2, marginBottom: 12, textTransform: "uppercase" }}>All in one place</p>
            <h2 style={{ margin: 0, fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 700, letterSpacing: "-0.02em" }}>Everything you love to watch</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
            {FEATURES.map(f => (
              <div key={f.title} className="lp-feat" style={{ background: "#161616", border: "1px solid #222", borderRadius: 18, padding: "30px 26px", transition: "border-color 0.2s, transform 0.2s" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(250,204,21,0.07)", border: "1px solid rgba(250,204,21,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>{f.icon}</div>
                <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#444", lineHeight: 1.75 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Profiles ── */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #0f0f0f" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", gap: 80, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <p style={{ fontSize: 11, color: YELLOW, fontWeight: 700, letterSpacing: 2, marginBottom: 14, textTransform: "uppercase" }}>Your account</p>
            <h2 style={{ margin: "0 0 18px", fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15 }}>One account,<br />everyone's taste</h2>
            <p style={{ margin: 0, fontSize: 14, color: "#444", lineHeight: 1.85 }}>Create separate profiles for everyone in your household. Each person gets their own watch history, saved list, and experience — all under one account.</p>
          </div>
          <div style={{ flex: "1 1 300px", display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { name: "Jacob", bg: "linear-gradient(135deg, #1e1b4b, #312e81)", ch: "🎬" },
              { name: "Sarah", bg: "linear-gradient(135deg, #4c0519, #881337)", ch: "🎙️" },
              { name: "Alex", bg: "linear-gradient(135deg, #052e16, #14532d)", ch: "🎵" },
              { name: "Kids", bg: "linear-gradient(135deg, #431407, #7c2d12)", ch: "⭐" },
            ].map(p => (
              <div key={p.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.firstChild.style.borderColor = YELLOW}
                onMouseLeave={e => e.currentTarget.firstChild.style.borderColor = "rgba(255,255,255,0.06)"}>
                <div style={{ width: 82, height: 82, borderRadius: 16, background: p.bg, border: "2px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, transition: "border-color 0.2s" }}>{p.ch}</div>
                <span style={{ fontSize: 12, color: "#555", fontWeight: 500 }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #0f0f0f" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 52px", fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 700, textAlign: "center", letterSpacing: "-0.02em" }}>Questions? We've got answers.</h2>
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #0f0f0f", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 500, height: 260, background: "radial-gradient(ellipse, rgba(250,204,21,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: "clamp(30px, 5vw, 56px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05 }}>Ready to watch?</h2>
          <p style={{ margin: "0 auto 40px", fontSize: 15, color: "#444", maxWidth: 360, lineHeight: 1.7 }}>$10/month. Cancel anytime. Start streaming in seconds.</p>
          <a href="/signup" className="lp-cta" style={{ display: "inline-block", background: YELLOW, color: "#0a0a0a", fontSize: 15, fontWeight: 700, textDecoration: "none", padding: "16px 52px", borderRadius: 12, transition: "transform 0.2s, box-shadow 0.2s" }}>
            Get Started →
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid #0d0d0d", padding: `40px ${PAD}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 36, marginBottom: 40 }}>
            <div style={{ maxWidth: 240 }}>
              <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: YELLOW, display: "block", marginBottom: 10 }}>peep.</span>
              <p style={{ margin: 0, fontSize: 13, color: "#2a2a2a", lineHeight: 1.7 }}>Independent streaming built for people who actually care about what they watch.</p>
            </div>
            <div style={{ display: "flex", gap: 52, flexWrap: "wrap" }}>
              {[
                { label: "Company", links: ["About Peep", "Careers", "Press Room"] },
                { label: "Support", links: ["Contact Us", "FAQ", "Terms of Use", "Privacy Policy"] },
              ].map(col => (
                <div key={col.label}>
                  <p style={{ margin: "0 0 14px", fontSize: 10, color: "#2a2a2a", fontWeight: 700, letterSpacing: 1.8, textTransform: "uppercase" }}>{col.label}</p>
                  {col.links.map(l => (
                    <p key={l} style={{ margin: "0 0 10px", fontSize: 13, color: "#383838", cursor: "pointer", transition: "color 0.15s" }}
                      onMouseEnter={e => e.target.style.color = "#888"}
                      onMouseLeave={e => e.target.style.color = "#383838"}>{l}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: "1px solid #0d0d0d", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#222" }}>© {new Date().getFullYear()} Peep. All rights reserved.</p>
            <div style={{ display: "flex", gap: 20 }}>
              {["Privacy Policy", "Terms of Use"].map(l => (
                <span key={l} style={{ fontSize: 12, color: "#222", cursor: "pointer", transition: "color 0.15s" }}
                  onMouseEnter={e => e.target.style.color = "#555"}
                  onMouseLeave={e => e.target.style.color = "#222"}>{l}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
