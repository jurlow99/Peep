import { PAD } from "../../lib/theme";
import { useIsMobile } from "../../hooks/useIsMobile";

const FOOTER_MODALS = {
  "About Peep": {
    title: "About Peep",
    content: (
      <>
        <p>Peep is an independent streaming platform built for people who actually care about what they watch. We curate movies, series, podcasts, and live streams — no algorithm filler, no bloat.</p>
        <p style={{ marginTop: 16 }}>We believe great content shouldn't be buried. Peep is designed to surface stories worth your time, from indie films to original series to live events.</p>
        <p style={{ marginTop: 16 }}>Founded with a simple idea: streaming should feel good again.</p>
      </>
    ),
  },
  "Press Room": {
    title: "Press Room",
    content: (
      <>
        <p>For press inquiries, partnership opportunities, or media assets, please reach out to our communications team.</p>
        <p style={{ marginTop: 16, color: "#facc15" }}>press@watchpeep.tv</p>
        <p style={{ marginTop: 16 }}>We typically respond within 2 business days.</p>
      </>
    ),
  },
  "Careers": {
    title: "Careers at Peep",
    content: (
      <>
        <p>We're building a small, focused team of people who love great storytelling and great software. If that's you, we'd love to hear from you.</p>
        <p style={{ marginTop: 16 }}>Open roles are posted as we grow. In the meantime, send your resume and a note about what excites you to:</p>
        <p style={{ marginTop: 12, color: "#facc15" }}>jobs@watchpeep.tv</p>
      </>
    ),
  },
  "Contact Us": {
    title: "Contact Us",
    content: (
      <>
        <p>Have a question, a content suggestion, or just want to say hello? We're all ears.</p>
        <p style={{ marginTop: 16, color: "#facc15" }}>hello@watchpeep.tv</p>
        <p style={{ marginTop: 16 }}>For technical support, visit the Help Center or email support@watchpeep.tv.</p>
      </>
    ),
  },
  "FAQ": {
    title: "Frequently Asked Questions",
    content: (
      <>
        {[
          ["Is Peep free?", "Yes. Peep is completely free to join and watch. No credit card required."],
          ["What can I watch?", "Movies, original series, podcasts, and live streams — all in one place."],
          ["Do I need an account?", "You need an account to save content to your list and track watch progress, but browsing is open to everyone."],
          ["How do I cancel?", "There's nothing to cancel — Peep is free. You can delete your account at any time from your profile settings."],
          ["Is content available in my country?", "Peep is available globally. Some live content may be region-restricted."],
        ].map(([q, a]) => (
          <div key={q} style={{ marginBottom: 20 }}>
            <p style={{ margin: "0 0 6px", color: "#e5e5e5", fontWeight: 600, fontSize: 13 }}>{q}</p>
            <p style={{ margin: 0, color: "#777", fontSize: 13 }}>{a}</p>
          </div>
        ))}
      </>
    ),
  },
  "Contact Support": {
    title: "Contact Support",
    content: (
      <>
        <p>Running into an issue? We're here to help.</p>
        <p style={{ marginTop: 16, color: "#facc15" }}>support@watchpeep.tv</p>
        <p style={{ marginTop: 16 }}>Include your username and a description of the issue and we'll get back to you within 24 hours.</p>
      </>
    ),
  },
  "Terms of Use": {
    title: "Terms of Use",
    content: (
      <>
        <p>By using Peep, you agree to use the platform for lawful purposes only. You may not copy, distribute, or reproduce any content without explicit permission.</p>
        <p style={{ marginTop: 14 }}>Peep reserves the right to suspend accounts that violate these terms. Content availability is subject to change without notice.</p>
        <p style={{ marginTop: 14 }}>These terms are governed by applicable law. For questions, contact legal@watchpeep.tv.</p>
        <p style={{ marginTop: 14, color: "#444", fontSize: 12 }}>Last updated: 2025</p>
      </>
    ),
  },
  "Privacy Policy": {
    title: "Privacy Policy",
    content: (
      <>
        <p>Peep collects only the information necessary to provide the service: your email address, username, and watch activity.</p>
        <p style={{ marginTop: 14 }}>We do not sell your data. We do not share your personal information with third parties except as required by law.</p>
        <p style={{ marginTop: 14 }}>Watch history and list data are stored securely and used solely to improve your experience on Peep.</p>
        <p style={{ marginTop: 14 }}>You can request deletion of your account and all associated data at any time by contacting privacy@watchpeep.tv.</p>
        <p style={{ marginTop: 14, color: "#444", fontSize: 12 }}>Last updated: 2025</p>
      </>
    ),
  },
  "Privacy Settings": {
    title: "Privacy Settings",
    content: (
      <p>Privacy controls are coming soon. For now, to request data deletion or opt out of watch history, email privacy@watchpeep.tv.</p>
    ),
  },
};

const SOCIAL_LINKS = [
  { label: "Twitter / X", href: "https://x.com" },
  { label: "Instagram", href: "https://instagram.com" },
  { label: "YouTube", href: "https://youtube.com" },
  { label: "TikTok", href: "https://tiktok.com" },
  { label: "Facebook", href: "https://facebook.com" },
];

export function Footer({ onNavChange, onProfileOpen, onOpenModal }) {
  const isMobile = useIsMobile();

  function handleLink(label) {
    if (label === "Movies") { onNavChange("Movies"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (label === "Series") { onNavChange("Series"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (["Horror", "Comedy", "Drama", "Action", "Sci-Fi", "Documentary"].includes(label)) { onNavChange("Movies"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (label === "Support Development") { window.location.href = "/support"; return; }
    if (label === "Sign In") { window.location.href = "/signin"; return; }
    if (label === "Create Profile") { window.location.href = "/signup"; return; }
    if (label === "Manage Account") { onProfileOpen?.(); return; }
    if (FOOTER_MODALS[label]) { onOpenModal(FOOTER_MODALS[label]); return; }
  }

  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: `56px ${PAD} ${isMobile ? 100 : 40}px`, fontFamily: "'Space Grotesk', sans-serif" }}>
      <div style={{ display: "flex", gap: 28, marginBottom: 40, flexWrap: "wrap" }}>
        {SOCIAL_LINKS.map(s => (
          <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: "#666", cursor: "pointer", textDecoration: "none", transition: "color 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.color = "#ccc"}
            onMouseLeave={e => e.currentTarget.style.color = "#666"}>
            {s.label}
          </a>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 32, marginBottom: 44 }}>
        {[
          { heading: "Company", links: ["About Peep", "Press Room", "Careers", "Contact Us", "Support Development"] },
          { heading: "Browse", links: ["Movies", "Series", "Horror", "Comedy", "Drama"] },
          { heading: "Account", links: ["Sign In", "Create Profile", "Manage Account", "Privacy Settings"] },
          { heading: "Help Center", links: ["FAQ", "Contact Support", "Terms of Use", "Privacy Policy"] },
        ].map(col => (
          <div key={col.heading}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: "#555", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 0.8 }}>{col.heading}</p>
            {col.links.map(l => l === "Support Development" ? (
              <p key={l} onClick={() => handleLink(l)} style={{ margin: "0 0 10px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, background: "#facc15", color: "#0a0a0a", fontWeight: 700, borderRadius: 6, padding: "3px 9px", letterSpacing: 0.2, transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fde047"}
                  onMouseLeave={e => e.currentTarget.style.background = "#facc15"}>
                  ♥ Support Development
                </span>
              </p>
            ) : (
              <p key={l} onClick={() => handleLink(l)} style={{ fontSize: 12.5, color: "#3e3e3e", margin: "0 0 10px", cursor: "pointer", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#aaa"}
                onMouseLeave={e => e.currentTarget.style.color = "#3e3e3e"}>
                {l}
              </p>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#2e2e2e" }}><span style={{ color: "#facc15" }}>peep.</span></span>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: "0 0 4px", fontSize: 11, color: "#333" }}>© {new Date().getFullYear()} Peep Media, Inc. All rights reserved.</p>
          <p style={{ margin: 0, fontSize: 11, color: "#2a2a2a" }}>All content sourced from the public domain. Free to watch, forever.</p>
        </div>
      </div>
    </footer>
  );
}

// ─── Password Reset Page ──────────────────────────────────────────────────────
