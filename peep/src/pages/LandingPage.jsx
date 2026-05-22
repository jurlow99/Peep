import { useState } from "react";

const YELLOW = "#facc15";
const PAD = "clamp(24px, 7vw, 96px)";

const STACK_CARDS = [
  {
    title: "The Last Signal",
    genre: "Sci-Fi · Season 2",
    type: "SERIES",
    progress: 0.35,
    bg: "linear-gradient(145deg, #110308 0%, #220608 55%, #130306 100%)",
    glow: "rgba(239,68,68,0.18)",
    dot: "#ef4444",
  },
  {
    title: "Open Waters",
    genre: "Documentary",
    type: "FILM",
    progress: 0.78,
    bg: "linear-gradient(145deg, #020d16 0%, #041e2e 55%, #031018 100%)",
    glow: "rgba(6,182,212,0.15)",
    dot: "#06b6d4",
  },
  {
    title: "Midnight Drive",
    genre: "Thriller",
    type: "FILM",
    progress: 0.61,
    bg: "linear-gradient(145deg, #06040f 0%, #110c30 55%, #080618 100%)",
    glow: "rgba(99,102,241,0.18)",
    dot: "#818cf8",
  },
];

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={YELLOW} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    ),
    title: "Movies & Series",
    desc: "Original films, indie features, and full series with every episode — on demand.",
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
    desc: "Long-form audio shows and interviews from creators you won't find anywhere else.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={YELLOW} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
      </svg>
    ),
    title: "Music",
    desc: "Videos, albums, and curated listening — music built into the streaming experience.",
  },
];

const FAQ_ITEMS = [
  { q: "What can I watch on Peep?", a: "Peep is home to movies, full series, podcasts, live streams, and music — all in one place. Content is hand-curated, not algorithm-generated." },
  { q: "Do I need to download anything?", a: "No. Peep runs entirely in your browser on any device — phone, tablet, laptop, or TV. Nothing to install." },
  { q: "Can multiple people use one account?", a: "Yes. Peep supports multiple viewer profiles under one account so everyone gets their own watch history and saved list." },
  { q: "How do I cancel?", a: "You can cancel your subscription at any time from your account settings. No questions asked, no hoops to jump through." },
  { q: "Is there a free trial?", a: "We occasionally run limited-time offers. Create an account to see what's available to you." },
];

function NowPlayingCard({ card }) {
  return (
    <div style={{
      width: 320, height: 186, borderRadius: 16,
      background: card.bg,
      border: "1px solid rgba(255,255,255,0.07)",
      boxShadow: "0 28px 60px rgba(0,0,0,0.75), 0 4px 16px rgba(0,0,0,0.5)",
      overflow: "hidden", position: "relative",
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
    }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 35% 40%, ${card.glow} 0%, transparent 65%)`, pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "3px 8px", fontSize: 9, fontWeight: 700, letterSpacing: 1.8, color: "#777" }}>
        {card.type}
      </div>

      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>

      <div style={{ padding: "10px 14px 13px", background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 9 }}>
          <div>
            <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{card.title}</p>
            <p style={{ margin: 0, fontSize: 11, color: "#666" }}>{card.genre}</p>
          </div>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#0a0a0a"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>
        <div style={{ height: 2, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${card.progress * 100}%`, background: YELLOW, borderRadius: 2 }} />
        </div>
      </div>
    </div>
  );
}

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
        @keyframes floatFront {
          0%, 100% { transform: rotate(1.5deg) translateY(0px); }
          50% { transform: rotate(1.5deg) translateY(-10px); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lp-signin:hover { color: #fff !important; }
        .lp-cta:hover { transform: scale(1.04) !important; box-shadow: 0 8px 36px rgba(250,204,21,0.3) !important; }
        .lp-feat:hover { border-color: rgba(250,204,21,0.2) !important; transform: translateY(-3px); }
        @media (max-width: 800px) {
          .lp-hero { flex-direction: column !important; padding-top: 100px !important; text-align: center !important; }
          .lp-hero-left { align-items: center !important; }
          .lp-hero-right { display: none !important; }
          .lp-split { flex-direction: column !important; gap: 48px !important; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}`, height: 66, background: "rgba(10,10,10,0.7)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 27, color: YELLOW }}>peep.</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="/signin" className="lp-signin" style={{ color: "#666", fontSize: 14, fontWeight: 500, textDecoration: "none", padding: "8px 16px", borderRadius: 8, transition: "color 0.15s" }}>Sign In</a>
          <a href="/signup" className="lp-cta" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 14, fontWeight: 700, textDecoration: "none", padding: "9px 22px", borderRadius: 8, transition: "transform 0.2s, box-shadow 0.2s" }}>Get Started</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero" style={{ minHeight: "100vh", display: "flex", alignItems: "center", paddingTop: 66, paddingLeft: PAD, paddingRight: PAD, gap: 40, overflow: "hidden" }}>

        {/* Left */}
        <div className="lp-hero-left" style={{ flex: "0 0 auto", width: "min(520px, 50%)", display: "flex", flexDirection: "column", alignItems: "flex-start", animation: "fadeUp 0.85s ease both" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.16)", borderRadius: 100, padding: "6px 16px", marginBottom: 30 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: YELLOW, display: "inline-block", boxShadow: `0 0 8px ${YELLOW}` }} />
            <span style={{ fontSize: 11, color: YELLOW, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>Now Streaming</span>
          </div>

          <h1 style={{ margin: "0 0 20px", fontSize: "clamp(42px, 5.5vw, 72px)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
            Watch<br />something<br /><span style={{ color: YELLOW }}>worth watching.</span>
          </h1>

          <p style={{ margin: "0 0 40px", fontSize: "clamp(14px, 1.6vw, 17px)", color: "#555", lineHeight: 1.8, maxWidth: 400 }}>
            Movies, series, podcasts, and live streams — curated for people who care about what they watch.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <a href="/signup" className="lp-cta" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 15, fontWeight: 700, textDecoration: "none", padding: "15px 40px", borderRadius: 12, display: "inline-block", transition: "transform 0.2s, box-shadow 0.2s" }}>
              Start Watching
            </a>
            <a href="/signin" className="lp-signin" style={{ fontSize: 14, color: "#444", textDecoration: "none", paddingLeft: 4, transition: "color 0.15s" }}>
              Already have an account? <span style={{ color: "#777", fontWeight: 600 }}>Sign in →</span>
            </a>
          </div>

          <div style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 10 }}>
            {["No commitments — cancel anytime", "Works on any device", "Multiple profiles, one account"].map(t => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={YELLOW} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ fontSize: 13, color: "#444" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — card stack + orb */}
        <div className="lp-hero-right" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", minHeight: 520 }}>
          {/* Orb */}
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 560, height: 560, background: "radial-gradient(circle, rgba(250,204,21,0.07) 0%, rgba(250,204,21,0.02) 40%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "50%", left: "55%", transform: "translate(-50%, -50%)", width: 280, height: 280, background: "radial-gradient(circle, rgba(250,204,21,0.09) 0%, transparent 65%)", borderRadius: "50%", pointerEvents: "none" }} />

          {/* Card stack */}
          <div style={{ position: "relative", width: 320, height: 186 }}>
            {/* Card 3 — back */}
            <div style={{ position: "absolute", inset: 0, transform: "rotate(-6deg) translate(-44px, 28px)", transformOrigin: "bottom center", opacity: 0.45, zIndex: 1 }}>
              <NowPlayingCard card={STACK_CARDS[0]} />
            </div>
            {/* Card 2 — middle */}
            <div style={{ position: "absolute", inset: 0, transform: "rotate(-2.5deg) translate(-18px, 12px)", transformOrigin: "bottom center", opacity: 0.72, zIndex: 2 }}>
              <NowPlayingCard card={STACK_CARDS[1]} />
            </div>
            {/* Card 1 — front, floating */}
            <div style={{ position: "absolute", inset: 0, animation: "floatFront 4.5s ease-in-out infinite", zIndex: 3 }}>
              <NowPlayingCard card={STACK_CARDS[2]} />
            </div>
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
              <div key={f.title} className="lp-feat" style={{ background: "#0d0d0d", border: "1px solid #161616", borderRadius: 18, padding: "30px 26px", transition: "border-color 0.2s, transform 0.2s" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(250,204,21,0.07)", border: "1px solid rgba(250,204,21,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                  {f.icon}
                </div>
                <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#4a4a4a", lineHeight: 1.75 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Profiles ── */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #0f0f0f" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", gap: 80, flexWrap: "wrap" }} className="lp-split">
          <div style={{ flex: "1 1 340px" }}>
            <p style={{ fontSize: 11, color: YELLOW, fontWeight: 700, letterSpacing: 2, marginBottom: 14, textTransform: "uppercase" }}>Your account</p>
            <h2 style={{ margin: "0 0 18px", fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15 }}>One account,<br />everyone's taste</h2>
            <p style={{ margin: 0, fontSize: 14, color: "#4a4a4a", lineHeight: 1.85 }}>
              Create separate profiles for everyone in your household. Each person gets their own watch history, saved list, and experience — under one account.
            </p>
          </div>
          <div style={{ flex: "1 1 300px", display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { name: "Jacob", bg: "linear-gradient(135deg, #1e1b4b, #312e81)", ch: "🎬" },
              { name: "Sarah", bg: "linear-gradient(135deg, #4c0519, #881337)", ch: "🎙️" },
              { name: "Alex", bg: "linear-gradient(135deg, #052e16, #14532d)", ch: "🎵" },
              { name: "Kids", bg: "linear-gradient(135deg, #431407, #7c2d12)", ch: "⭐" },
            ].map(p => (
              <div key={p.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.firstChild.style.borderColor = YELLOW}
                onMouseLeave={e => e.currentTarget.firstChild.style.borderColor = "rgba(255,255,255,0.06)"}>
                <div style={{ width: 80, height: 80, borderRadius: 16, background: p.bg, border: "2px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, transition: "border-color 0.2s" }}>
                  {p.ch}
                </div>
                <span style={{ fontSize: 12, color: "#555", fontWeight: 500 }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #0f0f0f" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 52px", fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 700, textAlign: "center", letterSpacing: "-0.02em" }}>
            Questions? We've got answers.
          </h2>
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #0f0f0f", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 500, height: 260, background: "radial-gradient(ellipse, rgba(250,204,21,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: "clamp(30px, 5vw, 58px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05 }}>Ready to watch?</h2>
          <p style={{ margin: "0 auto 40px", fontSize: 15, color: "#4a4a4a", maxWidth: 360, lineHeight: 1.7 }}>Create your account and start streaming in seconds.</p>
          <a href="/signup" className="lp-cta" style={{ display: "inline-block", background: YELLOW, color: "#0a0a0a", fontSize: 15, fontWeight: 700, textDecoration: "none", padding: "16px 52px", borderRadius: 12, transition: "transform 0.2s, box-shadow 0.2s" }}>
            Get Started →
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid #0d0d0d", padding: `40px ${PAD}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 32, marginBottom: 36 }}>
          <div style={{ maxWidth: 240 }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: YELLOW, display: "block", marginBottom: 10 }}>peep.</span>
            <p style={{ margin: 0, fontSize: 13, color: "#2a2a2a", lineHeight: 1.7 }}>Independent streaming built for people who actually care about what they watch.</p>
          </div>
          <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
            {[
              { label: "Company", links: ["About Peep", "Careers", "Press Room"] },
              { label: "Support", links: ["Contact Us", "FAQ", "Terms of Use", "Privacy Policy"] },
            ].map(col => (
              <div key={col.label}>
                <p style={{ margin: "0 0 14px", fontSize: 10, color: "#2a2a2a", fontWeight: 700, letterSpacing: 1.8, textTransform: "uppercase" }}>{col.label}</p>
                {col.links.map(l => (
                  <p key={l} style={{ margin: "0 0 10px", fontSize: 13, color: "#383838", cursor: "pointer", transition: "color 0.15s" }}
                    onMouseEnter={e => e.target.style.color = "#888"}
                    onMouseLeave={e => e.target.style.color = "#383838"}>
                    {l}
                  </p>
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
      </footer>
    </div>
  );
}
