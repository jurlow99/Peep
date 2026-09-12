import { useEffect, useState } from "react";
import { useMarket } from "../../hooks/useMarket";
import { useMarketFeed } from "../../hooks/useMarketFeed";
import { useLatestMarketId } from "../../hooks/useLatestMarketId";
import { YELLOW, BAR_BG } from "./marketCardStyle";

const AUTO_DISMISS_MS = 6000;
const MONO = "'JetBrains Mono', ui-monospace, monospace";

// Root layer: a GPU-promoted, non-interactive sibling of <video>. contain
// keeps a reflow inside the card from ever touching the player around it;
// pointer-events is re-enabled only on the bar itself, below.
const ROOT_STYLE = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  contain: "layout paint style",
  transform: "translateZ(0)",
  display: "flex",
  alignItems: "flex-end",
  zIndex: 15, // above the ad slot (10), below a playback-error takeover (20)
};

// One-off keyframes, injected the same way PlayerView does for its own
// live-pulse dot -- not worth a shared stylesheet entry for three rules.
const KEYFRAMES = `
  @keyframes marketWipe { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes marketSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes marketGlow { 0%, 100% { box-shadow: inset 0 0 0 rgba(255,255,255,0); } 50% { box-shadow: inset 0 0 22px rgba(255,255,255,0.4); } }
  @keyframes marketFlip { 0% { transform: perspective(600px) rotateX(90deg); opacity: 0; } 100% { transform: perspective(600px) rotateX(0deg); opacity: 1; } }
  @keyframes marketSpark { 0% { opacity: 1; transform: translate(0,0) scale(1); } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.3); } }
`;

/**
 * Mounts once per player. Connects the feed, tracks which market is current
 * for this stream, and renders that market's bar. See the spec's §2/§5.
 *
 * `getPlayerLatencyMs`, if given, should be a STABLE function (useCallback
 * with no deps, or a ref-backed getter) reading how far behind the live
 * edge this player actually is right now -- e.g. for hls.js,
 * `hls.liveSyncPosition - video.currentTime`. Without it, ticks reveal with
 * no latency correction at all, which is fine for a mock feed with no real
 * playback delay but wrong against a real live stream (see spec §3).
 */
export function MarketOverlay({ streamId, getPlayerLatencyMs }) {
  useMarketFeed(streamId, getPlayerLatencyMs ? { getPlayerLatencyMs } : undefined);
  const marketId = useLatestMarketId(streamId);

  if (!marketId) return null;
  return (
    <div style={ROOT_STYLE}>
      <style>{KEYFRAMES}</style>
      {/* key remounts the bar on a new market -- lets fresh useState
          initializers do the reset instead of an effect fighting them. */}
      <MarketCard key={marketId} streamId={streamId} marketId={marketId} />
    </div>
  );
}

function MarketCard({ streamId, marketId }) {
  const market = useMarket(streamId, marketId);
  const [selectedKey, setSelectedKey] = useState(null);
  const [stake, setStake] = useState(50);
  const [myBet, setMyBet] = useState(null); // { optionKey, stake, odds } -- local only, see note below
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Captured once, when this card first observes the market -- the ring's
  // "full" reference point. For a viewer who joins mid-countdown (a
  // snapshot catch-up rather than watching it open), this reads as "how
  // much longer you have left to decide" rather than "how much of the
  // whole window has elapsed," which is the more honest thing to show
  // when the true open time isn't known client-side.
  const [openedAt] = useState(() => Date.now());

  // Countdown tick -- local to this card, 1/sec, unrelated to the shared
  // store's tick rate. Only runs while a lock time is actually pending.
  useEffect(() => {
    if (market?.status !== "open" || !market.locksAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [market?.status, market?.locksAt]);

  // Auto-dismiss a settled market after a few seconds, same as the spec's
  // mock: long enough to read a result, not so long it lingers over the video.
  useEffect(() => {
    if (market?.status !== "settled") return;
    const id = setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [market?.status]);

  if (!market || dismissed) return null;

  function placeBet() {
    if (!selectedKey) return;
    const option = market.options.find(o => o.key === selectedKey);
    // NOTE: local UI state only. There is no place-bet edge function or
    // market_bets row yet -- that's real backend work, not built here (see
    // the Predictions feature notes). This proves out the interaction only.
    setMyBet({ optionKey: selectedKey, stake, odds: option?.odds ?? 0 });
    setSelectedKey(null);
  }

  const remainingMs = market.locksAt ? Math.max(0, market.locksAt - now) : 0;
  const totalMs = market.locksAt ? Math.max(1, market.locksAt - openedAt) : 0;
  const ringFraction = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const secsLeft = market.locksAt ? Math.round(remainingMs / 1000) : null;
  const clock = secsLeft != null ? `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")}` : null;

  return (
    <div style={{ width: "100%", pointerEvents: "auto" }}>
      {market.status === "locked" && <LockedBar market={market} hasBet={!!myBet} />}
      {market.status === "settled" && (
        <SettledBar market={market} myBet={myBet} onClose={() => setDismissed(true)} />
      )}
      {market.status === "open" && (
        <OpenBar
          market={market}
          clock={clock}
          ringFraction={ringFraction}
          myBet={myBet}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          stake={stake}
          onStake={setStake}
          onPlace={placeBet}
          onClose={() => setDismissed(true)}
        />
      )}
    </div>
  );
}

function CloseButton({ onClose }) {
  return (
    <button onClick={onClose} aria-label="Dismiss"
      style={{ flexShrink: 0, width: 28, alignSelf: "stretch", background: "rgba(255,255,255,0.04)", border: "none", borderLeft: "1px solid rgba(255,255,255,0.08)", color: "#9ca3af", fontSize: 15, lineHeight: 1, cursor: "pointer" }}>
      ×
    </button>
  );
}

// A real circular countdown, not a decorative loop: fraction is the actual
// time-remaining ratio computed in MarketCard from market.locksAt.
function CountdownRing({ fraction }) {
  const r = 8, c = 2 * Math.PI * r;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
      <circle cx="10" cy="10" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
      <circle cx="10" cy="10" r={r} fill="none" stroke={YELLOW} strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} style={{ transition: "stroke-dashoffset 1s linear" }} />
    </svg>
  );
}

function OpenBar({ market, clock, ringFraction, myBet, selectedKey, onSelect, stake, onStake, onPlace, onClose }) {
  return (
    <div style={{ transformOrigin: "bottom", animation: "marketSlideUp 0.35s cubic-bezier(.2,.8,.25,1) backwards" }}>
      <div style={{ height: 2, background: YELLOW, transformOrigin: "left", animation: "marketWipe 0.4s ease-out backwards" }} />
      <div style={{ background: BAR_BG, display: "flex", alignItems: "stretch", fontFamily: "'Space Grotesk', sans-serif", color: "#f3f1e6" }}>
        <div style={{ flex: 1, minWidth: 0, padding: "13px 16px", display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: YELLOW, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{market.question}</p>
          {clock && (
            <div style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 6, paddingLeft: 10 }}>
              <CountdownRing fraction={ringFraction} />
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#d7cf9e" }}>{clock}</span>
            </div>
          )}
        </div>
        {market.options.map(o => (
          <OddsColumn key={o.key} option={o} selected={selectedKey === o.key} disabled={!!myBet} onClick={() => onSelect(o.key)} />
        ))}
        <CloseButton onClose={onClose} />
      </div>

      {myBet && (
        <div style={{ background: BAR_BG, borderTop: "1px solid rgba(255,255,255,0.06)", padding: "8px 16px" }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11.5, color: "#d7cf9e" }}>
            Bet placed — {myBet.stake} Points on {market.options.find(o => o.key === myBet.optionKey)?.label}
          </span>
        </div>
      )}

      {!myBet && selectedKey && (
        <div style={{ background: BAR_BG, borderTop: "1px solid rgba(255,255,255,0.06)", padding: "9px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 5 }}>
            {[25, 50, 100].map(v => (
              <button key={v} onClick={() => onStake(v)}
                style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 6, cursor: "pointer", background: stake === v ? YELLOW : "rgba(255,255,255,0.08)", color: stake === v ? "#171712" : "#f3f1e6", border: "none" }}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={onPlace}
            style={{ flex: 1, fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700, padding: "7px 10px", borderRadius: 6, cursor: "pointer", background: YELLOW, color: "#171712", border: "none" }}>
            Place · {stake} Points
          </button>
        </div>
      )}
    </div>
  );
}

// Exported so EventsPanel's live preview renders the SAME odds segment, not
// a copy that can drift. selected=true pulses with an inset glow -- a
// breathing bloom rather than an outer box-shadow, since these sit flush
// edge-to-edge with no gap for a shadow to read against.
export function OddsColumn({ option, selected, disabled, onClick }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{
        width: 84, flexShrink: 0, textAlign: "center", padding: "13px 4px",
        border: "none", borderLeft: "1px solid rgba(255,255,255,0.08)",
        cursor: disabled ? "default" : "pointer",
        background: selected ? YELLOW : "transparent",
        color: selected ? "#171712" : "#e9e6d6",
        animation: selected ? "marketGlow 1.8s ease-in-out infinite" : "none",
      }}>
      <span style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.02em" }}>{option.label.toUpperCase()}</span>
      <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {option.odds.toFixed(2)}×
      </span>
    </button>
  );
}

function LockedBar({ market, hasBet }) {
  return (
    <div style={{ background: BAR_BG, padding: "13px 16px", display: "flex", alignItems: "center", gap: 10, filter: "grayscale(1) opacity(0.7)", animation: "marketSlideUp 0.25s ease backwards", fontFamily: "'Space Grotesk', sans-serif" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#9ca3af", flexShrink: 0 }} />
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#ccc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{market.question}</p>
      <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: "#9ca3af" }}>
        LOCKED{hasBet ? " · BET PLACED" : ""}
      </span>
    </div>
  );
}

function SettledBar({ market, myBet, onClose }) {
  const won = myBet?.optionKey === market.winningKey;
  const winner = market.options.find(o => o.key === market.winningKey);
  const payout = myBet && won ? Math.round(myBet.stake * myBet.odds) : null;

  return (
    <div style={{ background: BAR_BG, display: "flex", alignItems: "stretch", borderTop: `2px solid ${YELLOW}`, fontFamily: "'Space Grotesk', sans-serif", color: "#f3f1e6" }}>
      <div style={{ flex: 1, minWidth: 0, padding: "13px 16px", display: "flex", alignItems: "center" }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{market.question}</p>
      </div>
      <div style={{ position: "relative", width: 160, flexShrink: 0, textAlign: "center", padding: "13px 8px", background: YELLOW, color: "#171712", animation: "marketFlip 0.5s cubic-bezier(.3,.6,.3,1) backwards" }}>
        <span style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>RESULT</span>
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
          {winner?.label?.toUpperCase() ?? "—"} · {won ? "WON" : "SETTLED"}
        </span>
        {won && (
          <>
            <span style={{ position: "absolute", top: 8, left: "20%", width: 4, height: 4, borderRadius: "50%", background: "#171712", animation: "marketSpark 0.7s ease-out 0.15s backwards", "--dx": "-16px", "--dy": "-14px" }} />
            <span style={{ position: "absolute", top: 8, left: "50%", width: 4, height: 4, borderRadius: "50%", background: "#171712", animation: "marketSpark 0.7s ease-out 0.22s backwards", "--dx": "2px", "--dy": "-18px" }} />
            <span style={{ position: "absolute", top: 8, left: "78%", width: 4, height: 4, borderRadius: "50%", background: "#171712", animation: "marketSpark 0.7s ease-out 0.1s backwards", "--dx": "16px", "--dy": "-14px" }} />
          </>
        )}
      </div>
      {myBet && (
        <div style={{ flexShrink: 0, padding: "13px 16px", display: "flex", alignItems: "center", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", color: won ? YELLOW : "#9ca3af" }}>
            {won ? `+${payout} Points` : "No luck this time"}
          </span>
        </div>
      )}
      <CloseButton onClose={onClose} />
    </div>
  );
}
