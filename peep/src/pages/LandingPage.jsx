import { useState } from "react";

const YELLOW = "#facc15";
const PAD = "clamp(20px, 6vw, 80px)";

const features = [
  {
    icon: "🎬",
    title: "Animated Films",
    desc: "Indie animated features and shorts from creators who refused to water it down.",
  },
  {
    icon: "📺",
    title: "Adult Series",
    desc: "Serialized adult animation — full runs of shows that never got a network deal.",
  },
  {
    icon: "🎞️",
    title: "Shorts & Pilots",
    desc: "The stuff that got passed on. The weird pitches. The experiments that worked.",
  },
  {
    icon: "🎙️",
    title: "Creator Spotlights",
    desc: "Go deeper with the animators, writers, and weirdos behind the work.",
  },
];

const FAQ_ITEMS = [
  { q: "What kind of content is on Peep?", a: "Indie adult animation — animated films, series, shorts, and pilots that exist outside the traditional network system. If it's adult, animated, and independent, it belongs here." },
  { q: "Is this like Adult Swim?", a: "Think of it as the stuff Adult Swim wouldn't air. Unfiltered, independent, and made by creators who didn't want a network telling them what to cut." },
  { q: "Do I need to download anything?", a: "No. Runs entirely in your browser on any device. Nothing to install." },
  { q: "Can multiple people use one account?", a: "Yes — multiple viewer profiles under one account. Everyone gets their own watch history and saved list." },
  { q: "How do I cancel?", a: "Account settings, two clicks, done. No questions. No guilt email." },
];

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div onClick={onToggle} style={{ borderBottom: "1px solid #141414", cursor: "pointer", userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 0", gap: 20 }}>
        <span style={{ fontSize: "clamp(14px, 1.8vw, 16px)", fontWeight: 500, color: open ? "#fff" : "#777", transition: "color 0.2s" }}>{q}</span>
        <span style={{ color: open ? YELLOW : "#444", fontSize: 20, lineHeight: 1, flexShrink: 0, transition: "color 0.2s" }}>{open ? "−" : "+"}</span>
      </div>
      {open && <p style={{ margin: "0 0 20px", fontSize: 14, color: "#555", lineHeight: 1.8, maxWidth: 600 }}>{a}</p>}
    </div>
  );
}

export function LandingPage() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Righteous&family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes glow {
          0%, 100% { text-shadow: 0 0 30px rgba(250,204,21,0.25), 0 0 60px rgba(250,204,21,0.1); }
          50% { text-shadow: 0 0 50px rgba(250,204,21,0.45), 0 0 100px rgba(250,204,21,0.18); }
        }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .lp-cta-btn:hover { transform: scale(1.04); box-shadow: 0 0 32px rgba(250,204,21,0.4); }
        .lp-feat-card:hover { border-color: rgba(250,204,21,0.18) !important; transform: translateY(-3px); }
      `}</style>

      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `18px ${PAD}`, borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(10,10,10,0.9)", backdropFilter: "blur(14px)" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: YELLOW }}>peep.</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/signin" style={{ color: "#666", fontSize: 14, fontWeight: 500, textDecoration: "none", padding: "8px 16px", transition: "color 0.15s" }}
            onMouseEnter={e => e.target.style.color = "#fff"}
            onMouseLeave={e => e.target.style.color = "#666"}>
            Sign In
          </a>
          <a href="/signup" className="lp-cta-btn" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 14, fontWeight: 700, textDecoration: "none", padding: "9px 20px", borderRadius: 8, transition: "transform 0.2s, box-shadow 0.2s", display: "inline-block" }}>
            Get Started
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: `120px ${PAD} 80px`, position: "relative", overflow: "hidden" }}>
        {/* Orb glow */}
        <div style={{ position: "absolute", top: "35%", left: "50%", transform: "translate(-50%,-50%)", width: 700, height: 700, background: "radial-gradient(circle, rgba(250,204,21,0.07) 0%, transparent 65%)", pointerEvents: "none" }} />
        {/* Side bleed */}
        <div style={{ position: "absolute", top: "40%", left: "-5%", width: 400, height: 400, background: "radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "30%", right: "-5%", width: 400, height: 400, background: "radial-gradient(circle, rgba(236,72,153,0.05) 0%, transparent 65%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 740, animation: "fadeUp 0.9s ease both" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 100, padding: "6px 16px", marginBottom: 32 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: YELLOW, display: "inline-block", boxShadow: `0 0 6px ${YELLOW}` }} />
            <span style={{ fontSize: 11, color: YELLOW, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }}>Indie Adult Animation</span>
          </div>

          <h1 style={{ margin: "0 0 24px", fontFamily: "'Righteous', sans-serif", fontSize: "clamp(44px, 8vw, 88px)", fontWeight: 400, lineHeight: 1.05, letterSpacing: "0.01em" }}>
            Too weird for TV.<br /><span style={{ color: YELLOW, animation: "glow 4s ease-in-out infinite" }}>Perfect for Peep.</span>
          </h1>

          <p style={{ margin: "0 auto 16px", fontSize: "clamp(15px, 1.9vw, 18px)", color: "#666", lineHeight: 1.75, maxWidth: 520 }}>
            A streaming home for adult animation that didn't get a network deal — and didn't need one. Indie. Unfiltered. Exactly what it is.
          </p>

          <p style={{ margin: "0 auto 44px", fontSize: 14, color: "#444" }}>$10/month. Cancel anytime.</p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/signup" className="lp-cta-btn" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 15, fontWeight: 700, textDecoration: "none", padding: "15px 36px", borderRadius: 10, display: "inline-block", transition: "transform 0.2s, box-shadow 0.2s" }}>
              Start Watching →
            </a>
            <a href="/signin" style={{ background: "rgba(255,255,255,0.05)", color: "#aaa", fontSize: 15, fontWeight: 500, textDecoration: "none", padding: "15px 36px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", display: "inline-block", transition: "background 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}>
              Sign In
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: `80px ${PAD}`, borderTop: "1px solid #111" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, textAlign: "center", margin: "0 0 12px", fontSize: "clamp(26px, 4vw, 42px)" }}>
            What's on Peep
          </h2>
          <p style={{ textAlign: "center", color: "#444", fontSize: 15, margin: "0 0 52px" }}>The stuff that fell through the cracks of the mainstream.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {features.map(f => (
              <div key={f.title} className="lp-feat-card" style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 14, padding: "28px 24px", transition: "border-color 0.2s, transform 0.2s" }}>
                <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ margin: "0 0 8px", fontFamily: "'Righteous', sans-serif", fontWeight: 400, fontSize: 17 }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#555", lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission strip */}
      <section style={{ padding: `80px ${PAD}`, borderTop: "1px solid #111", background: "#0d0d0d" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, fontSize: "clamp(26px, 4vw, 42px)", margin: "0 0 20px", lineHeight: 1.2 }}>
            Built for the stuff<br /><span style={{ color: YELLOW }}>they said no to.</span>
          </h2>
          <p style={{ fontSize: 15, color: "#555", lineHeight: 1.85, margin: 0 }}>
            Adult animation has always lived on the fringe — but the fringe keeps getting cut. Peep exists so independent animators have somewhere to put their work, and fans have somewhere to find it. No gatekeepers. No notes. No watered-down cuts.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: `80px ${PAD}`, borderTop: "1px solid #111" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, textAlign: "center", margin: "0 0 48px", fontSize: "clamp(26px, 4vw, 42px)" }}>Questions</h2>
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <section style={{ padding: `80px ${PAD}`, textAlign: "center", borderTop: "1px solid #111", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 500, height: 260, background: "radial-gradient(ellipse, rgba(250,204,21,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <h2 style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, margin: "0 0 14px", fontSize: "clamp(28px, 5vw, 52px)" }}>Ready to watch something weird?</h2>
          <p style={{ margin: "0 0 36px", fontSize: 15, color: "#444" }}>$10/month. Cancel anytime. Start watching in seconds.</p>
          <a href="/signup" className="lp-cta-btn" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 15, fontWeight: 700, textDecoration: "none", padding: "15px 44px", borderRadius: 10, display: "inline-block", transition: "transform 0.2s, box-shadow 0.2s" }}>
            Create Your Account →
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #111", padding: `32px ${PAD}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: YELLOW, display: "block", marginBottom: 4 }}>peep.</span>
          <p style={{ margin: 0, fontSize: 12, color: "#2a2a2a" }}>The home for adult animation that didn't make the cut.</p>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#2a2a2a" }}>© {new Date().getFullYear()} Peep. All rights reserved.</p>
      </footer>
    </div>
  );
}
