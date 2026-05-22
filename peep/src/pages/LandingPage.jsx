import { useState } from "react";

const ACCENT = "#ffffff";
const PAD = "clamp(24px, 7vw, 96px)";

// Garish, saturated cartoon-poster colors — the chaos IS the aesthetic
const POSTER_GRADS = [
  "linear-gradient(145deg, #ff4500, #ff6b35)",
  "linear-gradient(145deg, #0044ff, #33aaff)",
  "linear-gradient(145deg, #ff006e, #ff44aa)",
  "linear-gradient(145deg, #00cc44, #44ff88)",
  "linear-gradient(145deg, #6600ff, #aa44ff)",
  "linear-gradient(145deg, #ffcc00, #ffee44)",
  "linear-gradient(145deg, #00ccff, #44eeff)",
  "linear-gradient(145deg, #cc0000, #ff3333)",
  "linear-gradient(145deg, #ff8800, #ffaa33)",
  "linear-gradient(145deg, #00ffcc, #44ffdd)",
  "linear-gradient(145deg, #ff0099, #ff44cc)",
  "linear-gradient(145deg, #0033cc, #3377ff)",
  "linear-gradient(145deg, #aaff00, #ccff44)",
  "linear-gradient(145deg, #ff3300, #ff6644)",
  "linear-gradient(145deg, #4400cc, #7755ff)",
  "linear-gradient(145deg, #00cc88, #33ffaa)",
];

const ROWS = Array.from({ length: 6 }, (_, r) =>
  Array.from({ length: 14 }, (_, c) => POSTER_GRADS[(r * 5 + c) % POSTER_GRADS.length])
);

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    ),
    title: "Movies & Series",
    desc: "Films and full series. Not the ones your dad watches. The other ones.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M21.06 16.5a10.9 10.9 0 0 1-2.1 1.71"/><path d="M2.94 16.5a10.9 10.9 0 0 0 2.1 1.71"/><path d="M14.95 19.5a3.78 3.78 0 0 1-5.9 0"/>
      </svg>
    ),
    title: "Live Streams",
    desc: "Something is happening right now. You should probably be watching it.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    ),
    title: "Podcasts",
    desc: "Long-form audio from people who have too much to say and nowhere else to say it.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
      </svg>
    ),
    title: "Music",
    desc: "Videos, albums, and audio that actually belongs in the same place as everything else.",
  },
];

const FAQ_ITEMS = [
  { q: "What can I watch on Peep?", a: "Films, series, podcasts, live streams, and music — all in one place. Hand-curated. No algorithm. No 'because you watched The Office' recommendations." },
  { q: "Do I need to download anything?", a: "No. It runs in your browser. If you can read this sentence, you can watch Peep. That's the bar." },
  { q: "Can multiple people use one account?", a: "Yes. Multiple profiles under one account. Everyone gets their own watch history. No one has to know what you've been watching." },
  { q: "How do I cancel?", a: "Account settings. Two clicks. We won't ask why. We won't send a guilt email. We'll just be sad quietly." },
  { q: "Is there a free trial?", a: "Sometimes. Create an account and see what you're offered. No promises. We're doing our best." },
];

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div onClick={onToggle} style={{ borderBottom: "1px solid #181818", cursor: "pointer", userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0", gap: 20 }}>
        <span style={{ fontSize: "clamp(14px, 1.8vw, 16px)", fontFamily: "'Space Mono', monospace", color: open ? "#fff" : "#666", transition: "color 0.2s" }}>{q}</span>
        <span style={{ color: open ? "#fff" : "#444", fontSize: 20, lineHeight: 1, flexShrink: 0, transition: "color 0.2s" }}>{open ? "−" : "+"}</span>
      </div>
      {open && <p style={{ margin: "0 0 22px", fontSize: 13, fontFamily: "'Space Mono', monospace", color: "#555", lineHeight: 1.85, maxWidth: 600 }}>{a}</p>}
    </div>
  );
}

export function LandingPage() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div style={{ background: "#000", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff", overflowX: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes scrollL { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes scrollR { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes flicker {
          0%, 94%, 100% { opacity: 1; }
          95% { opacity: 0.5; }
          96% { opacity: 1; }
          97.5% { opacity: 0.3; }
          98% { opacity: 1; }
        }
        @keyframes grain {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-2%, -3%); }
          20% { transform: translate(3%, 1%); }
          30% { transform: translate(-1%, 4%); }
          40% { transform: translate(2%, -2%); }
          50% { transform: translate(-3%, 2%); }
          60% { transform: translate(1%, -4%); }
          70% { transform: translate(-2%, 3%); }
          80% { transform: translate(3%, -1%); }
          90% { transform: translate(-1%, 2%); }
        }
        .lp-cta:hover { background: #e0e0e0 !important; }
        .lp-ghost:hover { background: rgba(255,255,255,0.1) !important; color: #fff !important; }
        .lp-feat:hover { border-color: #333 !important; }
        .lp-nav-link:hover { color: #fff !important; }
      `}</style>

      {/* Grain texture */}
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none", opacity: 0.035, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`, backgroundRepeat: "repeat", backgroundSize: "128px 128px", animation: "grain 0.5s steps(1) infinite" }} />

      {/* ── Nav ── */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}`, height: 64, background: "rgba(0,0,0,0.85)", borderBottom: "1px solid #111" }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: 1, animation: "flicker 10s ease-in-out infinite" }}>[peep.]</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <a href="/signin" className="lp-nav-link" style={{ color: "#555", fontSize: 13, fontFamily: "'Space Mono', monospace", textDecoration: "none", padding: "8px 14px", transition: "color 0.15s" }}>sign in</a>
          <a href="/signup" className="lp-cta" style={{ background: "#fff", color: "#000", fontSize: 13, fontFamily: "'Space Mono', monospace", fontWeight: 700, textDecoration: "none", padding: "9px 20px", borderRadius: 4, transition: "background 0.15s" }}>get in →</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ position: "relative", height: "100vh", minHeight: 600, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>

        {/* Poster grid */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-35%", left: "-10%", right: "-10%", bottom: "-35%", transform: "rotate(-8deg)", display: "flex", flexDirection: "column", gap: 8 }}>
            {ROWS.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 8, animation: `scroll${i % 2 === 0 ? "L" : "R"} ${52 + i * 9}s linear infinite`, willChange: "transform" }}>
                {[...row, ...row].map((grad, j) => (
                  <div key={j} style={{ width: 200, height: 115, flexShrink: 0, borderRadius: 6, background: grad }} />
                ))}
              </div>
            ))}
          </div>

          {/* Overlay — dark enough for text, light enough for color to bleed */}
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.78)" }} />
          {/* Bottom fade to black */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "55%", background: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.5) 55%, transparent 100%)" }} />
          {/* Top fade */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 180, background: "linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)" }} />
        </div>

        {/* Hero content */}
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 760, padding: `0 ${PAD}`, animation: "fadeUp 0.8s ease both" }}>
          <p style={{ margin: "0 0 20px", fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#555", letterSpacing: 3, textTransform: "uppercase" }}>[ on the air ]</p>

          <h1 style={{ margin: "0 0 24px", fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(72px, 11vw, 130px)", fontWeight: 400, lineHeight: 0.92, letterSpacing: "0.01em", textTransform: "uppercase" }}>
            Watch something<br />wrong.
          </h1>

          <p style={{ margin: "0 auto 14px", fontSize: "clamp(13px, 1.6vw, 16px)", fontFamily: "'Space Mono', monospace", color: "#555", lineHeight: 1.8, maxWidth: 460 }}>
            For the terminally online. Films, series, podcasts, and music your algorithm is too scared to recommend.
          </p>

          <p style={{ margin: "0 auto 40px", fontSize: 12, fontFamily: "'Space Mono', monospace", color: "#333" }}>$10/month. don't overthink it.</p>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/signup" className="lp-cta" style={{ background: "#fff", color: "#000", fontSize: 13, fontFamily: "'Space Mono', monospace", fontWeight: 700, textDecoration: "none", padding: "15px 44px", borderRadius: 4, display: "inline-block", transition: "background 0.15s" }}>
              get in →
            </a>
            <a href="/signin" className="lp-ghost" style={{ background: "transparent", color: "#555", fontSize: 13, fontFamily: "'Space Mono', monospace", textDecoration: "none", padding: "15px 44px", borderRadius: 4, border: "1px solid #222", display: "inline-block", transition: "background 0.15s, color 0.15s" }}>
              sign in
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #111" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontFamily: "'Space Mono', monospace", color: "#444", letterSpacing: 2, marginBottom: 12, textTransform: "uppercase" }}>[ what's in here ]</p>
            <h2 style={{ margin: 0, fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(40px, 5.5vw, 72px)", fontWeight: 400, letterSpacing: "0.01em", textTransform: "uppercase" }}>It's all in here.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 1, border: "1px solid #111", borderRadius: 8, overflow: "hidden" }}>
            {FEATURES.map((f, idx) => (
              <div key={f.title} className="lp-feat" style={{ background: "#080808", border: "none", borderRight: idx < FEATURES.length - 1 ? "1px solid #111" : "none", padding: "32px 28px", transition: "border-color 0.2s" }}>
                <div style={{ marginBottom: 20 }}>{f.icon}</div>
                <h3 style={{ margin: "0 0 10px", fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#fff" }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#3a3a3a", lineHeight: 1.8, fontFamily: "'Space Mono', monospace" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Profiles ── */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #111" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", gap: 80, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <p style={{ fontSize: 11, fontFamily: "'Space Mono', monospace", color: "#444", letterSpacing: 2, marginBottom: 16, textTransform: "uppercase" }}>[ who's watching ]</p>
            <h2 style={{ margin: "0 0 20px", fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(40px, 5.5vw, 72px)", fontWeight: 400, letterSpacing: "0.01em", textTransform: "uppercase", lineHeight: 0.95 }}>one account.<br />many problems.</h2>
            <p style={{ margin: 0, fontSize: 13, fontFamily: "'Space Mono', monospace", color: "#3a3a3a", lineHeight: 1.85 }}>Create separate profiles for everyone. Each person gets their own watch history and saved list. No one has to know what you've been watching. We certainly don't care.</p>
          </div>
          <div style={{ flex: "1 1 300px", display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { name: "Jacob", bg: "linear-gradient(135deg, #1e1b4b, #312e81)", ch: "🎬" },
              { name: "Sarah", bg: "linear-gradient(135deg, #4c0519, #881337)", ch: "🎙️" },
              { name: "Alex", bg: "linear-gradient(135deg, #052e16, #14532d)", ch: "🎵" },
              { name: "Kids", bg: "linear-gradient(135deg, #431407, #7c2d12)", ch: "⭐" },
            ].map(p => (
              <div key={p.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.firstChild.style.borderColor = "#fff"}
                onMouseLeave={e => e.currentTarget.firstChild.style.borderColor = "#1a1a1a"}>
                <div style={{ width: 80, height: 80, borderRadius: 8, background: p.bg, border: "2px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, transition: "border-color 0.2s" }}>{p.ch}</div>
                <span style={{ fontSize: 11, fontFamily: "'Space Mono', monospace", color: "#444" }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #111" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 56px", fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(40px, 5.5vw, 72px)", fontWeight: 400, letterSpacing: "0.01em", textTransform: "uppercase" }}>you have questions.</h2>
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #111", textAlign: "center" }}>
        <p style={{ margin: "0 0 16px", fontSize: 11, fontFamily: "'Space Mono', monospace", color: "#444", letterSpacing: 3, textTransform: "uppercase" }}>[ still here? ]</p>
        <h2 style={{ margin: "0 0 16px", fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(52px, 8vw, 100px)", fontWeight: 400, letterSpacing: "0.01em", textTransform: "uppercase", lineHeight: 0.95 }}>still reading this?</h2>
        <p style={{ margin: "0 auto 44px", fontSize: 12, fontFamily: "'Space Mono', monospace", color: "#333", maxWidth: 340, lineHeight: 1.8 }}>$10 a month. cancel whenever.<br />start watching the weird stuff.</p>
        <a href="/signup" className="lp-cta" style={{ display: "inline-block", background: "#fff", color: "#000", fontSize: 13, fontFamily: "'Space Mono', monospace", fontWeight: 700, textDecoration: "none", padding: "16px 52px", borderRadius: 4, transition: "background 0.15s" }}>
          get in →
        </a>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid #111", padding: `48px ${PAD}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 36, marginBottom: 48 }}>
            <div style={{ maxWidth: 260 }}>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, color: "#fff", display: "block", marginBottom: 12, letterSpacing: 1 }}>[peep.]</span>
              <p style={{ margin: 0, fontSize: 12, fontFamily: "'Space Mono', monospace", color: "#2a2a2a", lineHeight: 1.8 }}>independent streaming. for people with taste. or no taste. honestly fine either way.</p>
            </div>
            <div style={{ display: "flex", gap: 52, flexWrap: "wrap" }}>
              {[
                { label: "Company", links: ["About Peep", "Careers", "Press Room"] },
                { label: "Support", links: ["Contact Us", "FAQ", "Terms of Use", "Privacy Policy"] },
              ].map(col => (
                <div key={col.label}>
                  <p style={{ margin: "0 0 16px", fontSize: 10, fontFamily: "'Space Mono', monospace", color: "#2a2a2a", letterSpacing: 1.5, textTransform: "uppercase" }}>{col.label}</p>
                  {col.links.map(l => (
                    <p key={l} style={{ margin: "0 0 10px", fontSize: 12, fontFamily: "'Space Mono', monospace", color: "#2f2f2f", cursor: "pointer", transition: "color 0.15s" }}
                      onMouseEnter={e => e.target.style.color = "#888"}
                      onMouseLeave={e => e.target.style.color = "#2f2f2f"}>{l}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: "1px solid #0d0d0d", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 11, fontFamily: "'Space Mono', monospace", color: "#222" }}>© {new Date().getFullYear()} peep. all rights reserved.</p>
            <div style={{ display: "flex", gap: 20 }}>
              {["Privacy Policy", "Terms of Use"].map(l => (
                <span key={l} style={{ fontSize: 11, fontFamily: "'Space Mono', monospace", color: "#222", cursor: "pointer", transition: "color 0.15s" }}
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
