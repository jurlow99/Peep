import { useEffect, useState } from "react";
import { useMarket } from "../../hooks/useMarket";
import { useMarketFeed } from "../../hooks/useMarketFeed";
import { useLatestMarketId } from "../../hooks/useLatestMarketId";

const YELLOW = "#facc15";
const AUTO_DISMISS_MS = 6000;

// Root layer: a GPU-promoted, non-interactive sibling of <video>. contain
// keeps a reflow inside the card from ever touching the player around it;
// pointer-events is re-enabled only on the card itself, below.
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

/**
 * Mounts once per player. Connects the feed, tracks which market is current
 * for this stream, and renders that market's card. See the spec's §2/§5.
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
      {/* key remounts the card on a new market -- lets fresh useState
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

  const secsLeft = market.locksAt ? Math.max(0, Math.round((market.locksAt - now) / 1000)) : null;
  const clock = secsLeft != null ? `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")}` : null;

  return (
    <div style={{ margin: 16, pointerEvents: "auto", maxWidth: 340 }}>
      {market.status === "locked" && <LockedPill hasBet={!!myBet} />}
      {market.status === "settled" && (
        <SettledCard market={market} myBet={myBet} onClose={() => setDismissed(true)} />
      )}
      {market.status === "open" && (
        <OpenCard
          market={market}
          clock={clock}
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

const CARD_STYLE = {
  padding: "14px 16px",
  borderRadius: 10,
  background: "rgba(15,14,8,0.72)",
  backdropFilter: "blur(10px) saturate(1.3)", // sized to the card only -- never full-bleed, see spec §2
  border: "1px solid rgba(255,255,255,0.09)",
  fontFamily: "'Space Grotesk', sans-serif",
  color: "#f3f1e6",
  boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
};

function CloseButton({ onClose }) {
  return (
    <button onClick={onClose} aria-label="Dismiss"
      style={{ position: "absolute", top: 10, right: 10, width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "none", color: "#f3f1e6", fontSize: 13, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      ×
    </button>
  );
}

function OpenCard({ market, clock, myBet, selectedKey, onSelect, stake, onStake, onPlace, onClose }) {
  return (
    <div style={{ ...CARD_STYLE, position: "relative" }}>
      <CloseButton onClose={onClose} />
      <p style={{ fontSize: 13.5, fontWeight: 600, margin: "0 24px 3px 0" }}>{market.question}</p>
      {clock && <p style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, color: "#d7cf9e", margin: "0 0 11px" }}>Locks in {clock}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        {market.options.map(o => (
          <OddsOption key={o.key} option={o} selected={selectedKey === o.key} disabled={!!myBet} onClick={() => onSelect(o.key)} />
        ))}
      </div>

      {myBet && (
        <p style={{ fontSize: 11.5, color: "#d7cf9e", margin: "10px 0 0" }}>
          Bet placed — {myBet.stake} Points on {market.options.find(o => o.key === myBet.optionKey)?.label}
        </p>
      )}

      {!myBet && selectedKey && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 5 }}>
            {[25, 50, 100].map(v => (
              <button key={v} onClick={() => onStake(v)}
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 6, cursor: "pointer", background: stake === v ? YELLOW : "rgba(255,255,255,0.08)", color: stake === v ? "#171712" : "#f3f1e6", border: "none" }}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={onPlace}
            style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: "7px 10px", borderRadius: 6, cursor: "pointer", background: YELLOW, color: "#171712", border: "none" }}>
            Place · {stake} Points
          </button>
        </div>
      )}
    </div>
  );
}

function OddsOption({ option, selected, disabled, onClick }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{
        flex: 1, display: "flex", flexDirection: "column", gap: 2, padding: "9px 10px", borderRadius: 7,
        cursor: disabled ? "default" : "pointer", textAlign: "left",
        background: selected ? "rgba(234,179,8,0.22)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${selected ? "rgba(234,179,8,0.55)" : "rgba(255,255,255,0.16)"}`,
      }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{option.label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: selected ? YELLOW : "#e9e6d6" }}>
        {option.odds.toFixed(2)}×
      </span>
    </button>
  );
}

function LockedPill({ hasBet }) {
  return (
    <div style={{ ...CARD_STYLE, padding: "9px 14px", display: "flex", alignItems: "center", gap: 8, width: "fit-content" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#9ca3af" }} />
      <span style={{ fontSize: 12, fontWeight: 600 }}>{hasBet ? "Locked — bet placed" : "Locked"}</span>
    </div>
  );
}

function SettledCard({ market, myBet, onClose }) {
  const won = myBet?.optionKey === market.winningKey;
  const payout = myBet && won ? Math.round(myBet.stake * myBet.odds) : null;
  return (
    <div style={{ ...CARD_STYLE, position: "relative" }}>
      <CloseButton onClose={onClose} />
      <p style={{ fontSize: 13.5, fontWeight: 600, margin: "0 24px 10px 0" }}>{market.question}</p>
      <div style={{ display: "flex", gap: 8 }}>
        {market.options.map(o => (
          <div key={o.key} style={{
            flex: 1, padding: "9px 10px", borderRadius: 7,
            background: o.key === market.winningKey ? "rgba(234,179,8,0.22)" : "transparent",
            border: `1px solid ${o.key === market.winningKey ? "rgba(234,179,8,0.55)" : "rgba(255,255,255,0.1)"}`,
            opacity: o.key === market.winningKey ? 1 : 0.4,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, display: "block" }}>{o.label}</span>
          </div>
        ))}
      </div>
      {myBet && (
        <p style={{ fontSize: 12.5, fontWeight: 700, margin: "10px 0 0", color: won ? YELLOW : "#9ca3af" }}>
          {won ? `Won ${payout} Points` : "No luck this time"}
        </p>
      )}
    </div>
  );
}
