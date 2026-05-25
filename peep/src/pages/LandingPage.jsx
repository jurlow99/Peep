import { useState, useRef, useCallback, useEffect } from "react";

const YELLOW = "#facc15";
const PAD = "clamp(20px, 6vw, 80px)";

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
  "ADULT ANIMATION", "WEIRD TV", "INDIE", "NOT FOR KIDS",
  "TOO WEIRD FOR TV", "UNFILTERED", "ADULT ANIMATION", "WEIRD TV",
  "INDIE", "NOT FOR KIDS", "TOO WEIRD FOR TV", "UNFILTERED",
];

const features = [
  { icon: "🎬", title: "Animated Films", desc: "Indie animated features and shorts from creators who refused to water it down." },
  { icon: "📺", title: "Adult Series", desc: "Serialized adult animation — full runs of shows that never got a network deal." },
  { icon: "🎞️", title: "Shorts & Pilots", desc: "The stuff that got passed on. The weird pitches. The experiments that worked." },
  { icon: "🎙️", title: "Creator Spotlights", desc: "Go deeper with the animators, writers, and weirdos behind the work." },
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

export function LandingPage() {
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
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `16px ${PAD}`, background: "rgba(10,10,10,0.88)", backdropFilter: "blur(18px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: YELLOW, animation: "flicker 12s ease-in-out infinite" }}>peep.</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/signin" className="lp-nav-link" style={{ color: "#555", fontSize: 14, fontWeight: 500, textDecoration: "none", padding: "8px 14px", transition: "color 0.15s" }}>Sign In</a>
          <a href="/signup" className="lp-cta-btn" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 14, fontWeight: 700, textDecoration: "none", padding: "9px 22px", borderRadius: 8, transition: "transform 0.2s, box-shadow 0.2s", display: "inline-block" }}>Get Started</a>
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
            <span style={{ fontSize: 11, color: YELLOW, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>Indie Adult Animation</span>
          </div>

          <h1 style={{ animation: "fadeUp 0.7s 0.25s ease both", margin: "0 0 22px", fontFamily: "'Righteous', sans-serif", fontSize: "clamp(46px, 8.5vw, 92px)", fontWeight: 400, lineHeight: 1.04, letterSpacing: "0.01em" }}>
            Too weird for TV.<br />
            <span style={{ color: YELLOW, animation: "glow 4s 1s ease-in-out infinite" }}>Perfect for Peep.</span>
          </h1>

          <p style={{ animation: "fadeUp 0.7s 0.4s ease both", margin: "0 auto 14px", fontSize: "clamp(15px, 1.8vw, 18px)", color: "#777", lineHeight: 1.75, maxWidth: 480 }}>
            Weird TV. Adult animation. All of it.
          </p>

          <p style={{ animation: "fadeUp 0.7s 0.5s ease both", margin: "0 auto 44px", fontSize: 14, color: "#555" }}>Founding membership from <span style={{ color: YELLOW, fontWeight: 700 }}>$2.99/mo</span> — limited spots.</p>

          <div style={{ animation: "fadeUp 0.7s 0.6s ease both", display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/signup" className="lp-cta-btn" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 15, fontWeight: 700, textDecoration: "none", padding: "15px 40px", borderRadius: 10, display: "inline-block", transition: "transform 0.2s, box-shadow 0.2s" }}>
              Start Watching →
            </a>
            <a href="/signin" className="lp-ghost" style={{ background: "rgba(255,255,255,0.04)", color: "#888", fontSize: 15, fontWeight: 500, textDecoration: "none", padding: "15px 40px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", display: "inline-block", transition: "border-color 0.2s, color 0.2s" }}>
              Sign In
            </a>
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
            <p style={{ color: "#444", fontSize: 15, margin: 0 }}>Animated. Adult. Weird.</p>
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
            Built for the stuff<br /><span style={{ color: YELLOW }}>they said no to.</span>
          </h2>
          <p style={{ fontSize: 15, color: "#555", lineHeight: 1.9, margin: 0 }}>
            Weird cartoons for adults. That's it. That's the pitch.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #111" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div className="reveal" style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, margin: "0 0 10px", fontSize: "clamp(28px, 4vw, 44px)" }}>Pick your plan</h2>
            <p style={{ color: "#444", fontSize: 15, margin: 0 }}>Founding spots are limited. Lock in the low price before they're gone.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>

            {/* Founding Member */}
            <div className="reveal reveal-delay-1" style={{ position: "relative", background: "rgba(250,204,21,0.03)", border: `2px solid ${YELLOW}`, borderRadius: 18, padding: "32px 28px", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", top: -1, right: 20, background: YELLOW, color: "#0a0a0a", fontSize: 10, fontWeight: 800, padding: "4px 12px", borderRadius: "0 0 8px 8px", letterSpacing: 1, textTransform: "uppercase" }}>Limited</div>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: YELLOW, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Founding Member</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "0 0 6px" }}>
                <span style={{ fontSize: 42, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>$2.99</span>
                <span style={{ fontSize: 14, color: "#555" }}>/mo</span>
              </div>
              <p style={{ margin: "0 0 24px", fontSize: 12, color: "#555" }}>Billed monthly</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32, flex: 1 }}>
                {["Everything on Peep", "Ad-free forever", "Founding badge on your profile", "Lock in this price forever", "Cancel anytime"].map(perk => (
                  <div key={perk} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={YELLOW} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: 13, color: "#aaa" }}>{perk}</span>
                  </div>
                ))}
              </div>
              <a href="/signup" className="lp-cta-btn" style={{ background: YELLOW, color: "#0a0a0a", fontSize: 14, fontWeight: 700, textDecoration: "none", padding: "13px", borderRadius: 10, display: "block", textAlign: "center", transition: "transform 0.2s, box-shadow 0.2s" }}>
                Get Founding Access →
              </a>
            </div>

            {/* Founding Annual */}
            <div className="reveal reveal-delay-2" style={{ position: "relative", background: "#0e0e0e", border: "1px solid #1c1c1c", borderRadius: 18, padding: "32px 28px", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", top: -1, right: 20, background: "#22c55e", color: "#fff", fontSize: 10, fontWeight: 800, padding: "4px 12px", borderRadius: "0 0 8px 8px", letterSpacing: 1, textTransform: "uppercase" }}>Best Value</div>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#22c55e", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Founding Annual</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "0 0 6px" }}>
                <span style={{ fontSize: 42, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>$19.99</span>
                <span style={{ fontSize: 14, color: "#555" }}>/yr</span>
              </div>
              <p style={{ margin: "0 0 24px", fontSize: 12, color: "#555" }}>That's $1.67/mo — save 44%</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32, flex: 1 }}>
                {["Everything on Peep", "Ad-free forever", "Founding badge on your profile", "Biggest savings available", "Cancel anytime"].map(perk => (
                  <div key={perk} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: 13, color: "#aaa" }}>{perk}</span>
                  </div>
                ))}
              </div>
              <a href="/signup" style={{ background: "#111", border: "1px solid #2a2a2a", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", padding: "13px", borderRadius: 10, display: "block", textAlign: "center" }}>
                Get Annual Access →
              </a>
            </div>

            {/* Standard */}
            <div className="reveal reveal-delay-3" style={{ background: "#0e0e0e", border: "1px solid #1c1c1c", borderRadius: 18, padding: "32px 28px", display: "flex", flexDirection: "column" }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Standard</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "0 0 6px" }}>
                <span style={{ fontSize: 42, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>$10</span>
                <span style={{ fontSize: 14, color: "#555" }}>/mo</span>
              </div>
              <p style={{ margin: "0 0 24px", fontSize: 12, color: "#555" }}>Billed monthly</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32, flex: 1 }}>
                {["Everything on Peep", "Cancel anytime", "No long-term commitment"].map(perk => (
                  <div key={perk} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: 13, color: "#555" }}>{perk}</span>
                  </div>
                ))}
              </div>
              <a href="/signup" style={{ background: "#111", border: "1px solid #2a2a2a", color: "#777", fontSize: 14, fontWeight: 700, textDecoration: "none", padding: "13px", borderRadius: 10, display: "block", textAlign: "center" }}>
                Get Started →
              </a>
            </div>

          </div>
        </div>
      </section>

      {/* Streamer section */}
      <section style={{ padding: `96px ${PAD}`, borderTop: "1px solid #111", background: "#0d0d0d", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", right: "-10%", transform: "translateY(-50%)", width: 500, height: 500, background: "radial-gradient(circle, rgba(239,68,68,0.06) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 980, margin: "0 auto", position: "relative" }}>
          <div className="reveal" style={{ marginBottom: 52 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 100, padding: "5px 16px", marginBottom: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>For Streamers</span>
            </div>
            <h2 style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, margin: "0 0 14px", fontSize: "clamp(28px, 4vw, 44px)", lineHeight: 1.15 }}>
              Go live on Peep.<br /><span style={{ color: YELLOW }}>Your audience is here.</span>
            </h2>
            <p style={{ fontSize: 15, color: "#555", lineHeight: 1.85, maxWidth: 480, margin: 0 }}>
              Stream your show, build your following, and keep your replays — all in one place built for adult animation and indie creators.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 44 }}>
            {[
              { icon: "📡", title: "Live Streaming", desc: "Go live straight from OBS with a dedicated RTMP stream key." },
              { icon: "📼", title: "VOD Replays", desc: "Every stream is saved automatically. Your audience can catch up anytime." },
              { icon: "🔔", title: "Follower Alerts", desc: "Followers get an email the moment you go live." },
              { icon: "💬", title: "Live Chat", desc: "Real-time chat with your audience, with full moderation controls." },
            ].map((f, i) => (
              <div key={f.title} className={`reveal reveal-delay-${i + 1} lp-feat-card`} style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: 16, padding: "26px 22px", transition: "border-color 0.22s, transform 0.22s, box-shadow 0.22s" }}>
                <div style={{ fontSize: 22, marginBottom: 14 }}>{f.icon}</div>
                <h3 style={{ margin: "0 0 8px", fontFamily: "'Righteous', sans-serif", fontWeight: 400, fontSize: 16 }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#555", lineHeight: 1.75 }}>{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="reveal" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="/apply-to-stream" className="lp-cta-btn" style={{ background: "#ef4444", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none", padding: "13px 32px", borderRadius: 10, display: "inline-block", transition: "transform 0.2s, box-shadow 0.2s" }}>
              Apply to Stream →
            </a>
            <a href="/streamer" className="lp-ghost" style={{ background: "rgba(255,255,255,0.04)", color: "#888", fontSize: 14, fontWeight: 500, textDecoration: "none", padding: "13px 32px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", display: "inline-block", transition: "border-color 0.2s, color 0.2s" }}>
              Streamer Dashboard
            </a>
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
      <section style={{ padding: `96px ${PAD}`, textAlign: "center", borderTop: "1px solid #111", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 560, height: 280, background: "radial-gradient(ellipse, rgba(250,204,21,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="reveal" style={{ position: "relative" }}>
          <h2 style={{ fontFamily: "'Righteous', sans-serif", fontWeight: 400, margin: "0 0 14px", fontSize: "clamp(28px, 5vw, 52px)" }}>Ready to watch something weird?</h2>
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
          <p style={{ margin: 0, fontSize: 12, color: "#2a2a2a" }}>The home for adult animation that didn't make the cut.</p>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#2a2a2a" }}>© {new Date().getFullYear()} Peep. All rights reserved.</p>
      </footer>
    </div>
  );
}
