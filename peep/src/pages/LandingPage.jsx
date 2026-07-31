import { useState, useRef, useCallback, useEffect } from "react";

const YELLOW = "#facc15";
const PAD = "clamp(20px, 6vw, 80px)";
const SAFE_TOP = window.location.protocol === "capacitor:" ? 50 : 0;

const POSTER_GRADS = [
  "linear-gradient(145deg, #3b0764, #7c3aed)",
  "linear-gradient(145deg, #7f1d1d, #dc2626)",
  "linear-gradient(145deg, #0c4a6e, #0ea5e9)",
  "linear-gradient(145deg, #064e3b, #10b981)",
  "linear-gradient(145deg, #4a044e, #c026d3)",
  "linear-gradient(145deg, #78350f, #f59e0b)",
  "linear-gradient(145deg, #1e1b4b, #6366f1)",
  "linear-gradient(145deg, #831843, #f43f5e)",
  "linear-gradient(145deg, #134e4a, #06b6d4)",
  "linear-gradient(145deg, #312e81, #818cf8)",
  "linear-gradient(145deg, #7c2d12, #f97316)",
  "linear-gradient(145deg, #14532d, #4ade80)",
  "linear-gradient(145deg, #4c0519, #fb7185)",
  "linear-gradient(145deg, #1e3a5f, #38bdf8)",
  "linear-gradient(145deg, #581c87, #a855f7)",
  "linear-gradient(145deg, #713f12, #facc15)",
];

const ROWS = Array.from({ length: 5 }, (_, r) =>
  Array.from({ length: 14 }, (_, c) => POSTER_GRADS[(r * 6 + c) % POSTER_GRADS.length])
);

const TICKER_ITEMS = [
  "CONSPIRACY", "STRANGE FILMS", "SPACE", "PARANORMAL", "WEIRD ANIMATION",
  "CULT CONTENT", "UNEXPLAINED", "UNDERGROUND", "CONSPIRACY", "STRANGE FILMS",
  "SPACE", "PARANORMAL", "WEIRD ANIMATION", "CULT CONTENT", "UNEXPLAINED",
];

const features = [
  { icon: "🛸", title: "Space & Cosmos", desc: "Documentaries, theories, and content about what's out there. The stuff NASA won't talk about." },
  { icon: "🕵️", title: "Conspiracy & Truth", desc: "Down the rabbit hole content. Question everything. Connect the dots." },
  { icon: "👁️", title: "Strange & Paranormal", desc: "Weird films, unexplained phenomena, cult classics, and content that defies categorization." },
  { icon: "🎭", title: "Underground Comedy", desc: "The comics and shows too edgy, too weird, or too real for mainstream platforms." },
];

const FAQ_ITEMS = [
  { q: "What kind of content is on Peep?", a: "Weird stuff. Strange films, conspiracy documentaries, space content, paranormal, underground comedy, cult animation — if it's strange and it's real, it belongs here. No algorithm-bait, no mainstream filler." },
  { q: "Is it really free?", a: "Yes. Watch everything on Peep for free — short ads keep the lights on, same as YouTube. Create a free account to save your list and pick up where you left off." },
  { q: "Do I need to download anything?", a: "No. Runs entirely in your browser on any device. Nothing to install." },
  { q: "How do I go ad-free?", a: "Coming soon. We'll offer an optional paid tier for ad-free viewing. For now, short pre-roll ads run before videos." },
  { q: "Can I stream on Peep?", a: "Peep Live is a curated lineup, not an open platform. Create an account, then apply from the Creator Studio — we review every application. If you're approved, you get your own live channel on the network." },
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

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("revealed"); obs.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

export function LandingPage({ onBrowse }) {
  const [openFaq, setOpenFaq] = useState(null);
  const orbRef = useRef(null);
  const orbRef2 = useRef(null);
  useScrollReveal();

  const handleMouseMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (orbRef.current) { orbRef.current.style.left = x + "px"; orbRef.current.style.top = y + "px"; }
    if (orbRef2.current) { orbRef2.current.style.left = x + "px"; orbRef2.current.style.top = y + "px"; }
  }, []);

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>

      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "max(env(safe-area-inset-top), 44px)", paddingBottom: 14, paddingLeft: PAD, paddingRight: PAD, background: "rgba(10,10,10,0.88)", backdropFilter: "blur(18px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: YELLOW, animation: "flicker 12s ease-in-out infinite" }}>peep.</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <a href="/signin" className="lp-nav-link" style={{ color: "#555", fontSize: 13, fontWeight: 500, textDecoration: "none", padding: "8px 12px", transition: "color 0.15s", whiteSpace: "nowrap" }}>Sign In</a>
          <button onClick={onBrowse} className="lp-cta-btn" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 13, fontWeight: 700, border: "none", padding: "9px 16px", borderRadius: 8, transition: "transform 0.2s, box-shadow 0.2s", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Watch Free</button>
        </div>
      </nav>

      {/* Hero */}
      <section onMouseMove={handleMouseMove} style={{ position: "relative", height: "100vh", minHeight: 600, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", textAlign: "center" }}>

        {/* Animated poster grid */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-30%", left: "-8%", right: "-8%", bottom: "-30%", transform: "rotate(-7deg)", display: "flex", flexDirection: "column", gap: 10 }}>
            {ROWS.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 10, animation: `scroll${i % 2 === 0 ? "L" : "R"} ${58 + i * 10}s linear infinite`, willChange: "transform" }}>
                {[...row, ...row].map((grad, j) => (
                  <div key={j} style={{ width: 200, height: 125, flexShrink: 0, borderRadius: 10, background: grad }} />
                ))}
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.82)" }} />
          {/* Yellow orb — tracks mouse fast */}
          <div ref={orbRef} style={{ position: "absolute", top: "50%", left: "50%", width: 650, height: 650, transform: "translate(-50%,-50%)", background: "radial-gradient(circle, rgba(250,204,21,0.11) 0%, rgba(250,204,21,0.03) 45%, transparent 70%)", pointerEvents: "none", transition: "left 0.55s cubic-bezier(0.23,1,0.32,1), top 0.55s cubic-bezier(0.23,1,0.32,1)" }} />
          {/* Purple orb — tracks mouse slow, lags behind */}
          <div ref={orbRef2} style={{ position: "absolute", top: "50%", left: "50%", width: 900, height: 900, transform: "translate(-50%,-50%)", background: "radial-gradient(circle, rgba(139,92,246,0.07) 0%, rgba(236,72,153,0.04) 40%, transparent 65%)", pointerEvents: "none", transition: "left 1.4s cubic-bezier(0.23,1,0.32,1), top 1.4s cubic-bezier(0.23,1,0.32,1)" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.5) 55%, transparent 100%)" }} />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 160, background: "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)" }} />
        </div>

        {/* Hero content — each element staggers in */}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 760, padding: `0 ${PAD}` }}>
          <div style={{ animation: "fadeUp 0.7s 0.1s ease both", display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.22)", borderRadius: 100, padding: "6px 18px", marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: YELLOW, display: "inline-block", boxShadow: `0 0 8px ${YELLOW}` }} />
            <span style={{ fontSize: 11, color: YELLOW, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>It's Weird on Here</span>
          </div>

          <h1 style={{ animation: "fadeUp 0.7s 0.25s ease both", margin: "0 0 22px", fontFamily: "'Righteous', sans-serif", fontSize: "clamp(46px, 8.5vw, 92px)", fontWeight: 400, lineHeight: 1.04, letterSpacing: "0.01em" }}>
            Watch things<br />
            <span style={{ color: YELLOW, animation: "glow 4s 1s ease-in-out infinite" }}>you can't explain.</span>
          </h1>

          <p style={{ animation: "fadeUp 0.7s 0.4s ease both", margin: "0 auto 14px", fontSize: "clamp(15px, 1.8vw, 18px)", color: "#777", lineHeight: 1.75, maxWidth: 520 }}>
            Not what you'd expect. Not what the algorithm recommends. Just weird.
          </p>

          <p style={{ animation: "fadeUp 0.7s 0.5s ease both", margin: "0 auto 40px", fontSize: 14, color: "#555" }}>Free to watch. No credit card. No catch.</p>

          <div style={{ animation: "fadeUp 0.7s 0.6s ease both", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%" }}>
            <button onClick={onBrowse} className="lp-cta-btn"
              style={{ background: YELLOW, color: "#0a0a0a", fontSize: 16, fontWeight: 800, border: "none", padding: "16px 44px", borderRadius: 12, cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s", fontFamily: "inherit", letterSpacing: 0.2 }}>
              Watch Free →
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <a href="/signup" style={{ color: "#555", fontSize: 13, fontWeight: 500, textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#888"}
                onMouseLeave={e => e.currentTarget.style.color = "#555"}>
                Create free account
              </a>
              <span style={{ color: "#222" }}>·</span>
              <a href="/signin" style={{ color: "#555", fontSize: 13, fontWeight: 500, textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#888"}
                onMouseLeave={e => e.currentTarget.style.color = "#555"}>
                Sign in
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Ticker strip */}
      <div style={{ borderTop: "1px solid #161616", borderBottom: "1px solid #161616", background: "#0d0d0d", overflow: "hidden", padding: "14px 0" }}>
        <div style={{ display: "flex", animation: "ticker 22s linear infinite", width: "max-content" }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 18, padding: "0 18px", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: i % 5 === 0 ? YELLOW : "#333", whiteSpace: "nowrap" }}>
              {item}
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#333", flexShrink: 0 }} />
            </span>
          ))}
        </div>
      </div>

      {/* Features */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #111" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div className="reveal" style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, margin: "0 0 10px", fontSize: "clamp(28px, 4vw, 44px)" }}>What's on Peep</h2>
            <p style={{ color: "#444", fontSize: 15, margin: 0 }}>Nothing ordinary.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {features.map((f, i) => (
              <div key={f.title} className={`reveal reveal-delay-${i + 1} lp-feat-card`} style={{ background: "#0e0e0e", border: "1px solid #1c1c1c", borderRadius: 16, padding: "30px 26px", transition: "border-color 0.22s, transform 0.22s, box-shadow 0.22s" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 18 }}>{f.icon}</div>
                <h3 style={{ margin: "0 0 8px", fontFamily: "'Righteous', sans-serif", fontWeight: 400, fontSize: 17 }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#555", lineHeight: 1.75 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission strip */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #111", background: "#0d0d0d", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 300, background: "radial-gradient(ellipse, rgba(250,204,21,0.04) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div className="reveal" style={{ position: "relative", maxWidth: 640, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, fontSize: "clamp(28px, 4vw, 44px)", margin: "0 0 20px", lineHeight: 1.15 }}>
            Built for the stuff<br /><span style={{ color: YELLOW }}>the algorithm hides.</span>
          </h2>
          <p style={{ fontSize: 15, color: "#555", lineHeight: 1.9, margin: 0 }}>
            Weird and not the ordinary. That's it.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #111" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div className="reveal" style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, margin: "0 0 10px", fontSize: "clamp(28px, 4vw, 44px)" }}>How it works</h2>
            <p style={{ color: "#444", fontSize: 15, margin: 0 }}>Simple as it gets.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {[
              { step: "01", title: "No account needed", desc: "Hit Watch Free and you're in. No credit card, no email, no wait." },
              { step: "02", title: "Short ads, full content", desc: "A short pre-roll ad before each video. That's it. Same deal as YouTube." },
              { step: "03", title: "Save your spot", desc: "Create a free account to save your list and pick up where you left off across devices." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="reveal" style={{ background: "#0e0e0e", border: "1px solid #1c1c1c", borderRadius: 16, padding: "30px 26px" }}>
                <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 800, color: YELLOW, letterSpacing: 2, textTransform: "uppercase" }}>{step}</p>
                <h3 style={{ margin: "0 0 8px", fontFamily: "'Righteous', sans-serif", fontWeight: 400, fontSize: 17 }}>{title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#555", lineHeight: 1.75 }}>{desc}</p>
              </div>
            ))}
          </div>
          <div className="reveal" style={{ textAlign: "center", marginTop: 48 }}>
            <button onClick={onBrowse} className="lp-cta-btn"
              style={{ background: YELLOW, color: "#0a0a0a", fontSize: 15, fontWeight: 800, border: "none", padding: "14px 40px", borderRadius: 11, cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s", fontFamily: "inherit" }}>
              Start Watching Free →
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #111" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <h2 className="reveal" style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, textAlign: "center", margin: "0 0 52px", fontSize: "clamp(28px, 4vw, 44px)" }}>Questions</h2>
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: `clamp(48px, 10vw, 96px) ${PAD}`, textAlign: "center", borderTop: "1px solid #111", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 560, height: 280, background: "radial-gradient(ellipse, rgba(250,204,21,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="reveal" style={{ position: "relative" }}>
          <h2 style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, margin: "0 0 14px", fontSize: "clamp(28px, 5vw, 52px)" }}>Go down the rabbit hole.</h2>
          <p style={{ margin: "0 0 38px", fontSize: 15, color: "#444" }}>Founding membership from $2.99/mo — limited spots.</p>
          <a href="/signup" className="lp-cta-btn" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 15, fontWeight: 700, textDecoration: "none", padding: "15px 48px", borderRadius: 10, display: "inline-block", transition: "transform 0.2s, box-shadow 0.2s" }}>
            Create Your Account →
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #111", padding: `36px ${PAD}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: YELLOW, display: "block", marginBottom: 4 }}>peep.</span>
          <p style={{ margin: 0, fontSize: 12, color: "#2a2a2a" }}>The home for content that can't live anywhere else.</p>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#2a2a2a" }}>© {new Date().getFullYear()} Peep. All rights reserved.</p>
      </footer>
    </div>
  );
}
