import { useBetHistory } from "../../hooks/useBetHistory";
import { YELLOW } from "./marketCardStyle";

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SANS = "'Space Grotesk', sans-serif";

const PULSE_KEYFRAME = `@keyframes betPendingPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`;

function relativeTime(ts) {
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

// Win/loss streak of the most recent RESOLVED entries, signed (+3 = 3-win
// streak, -2 = 2-loss streak). History is newest-first; pending entries are
// skipped since they haven't gone one way or the other yet.
function currentStreak(resolved) {
  let streak = 0;
  for (const h of resolved) {
    if (streak === 0) { streak = h.status === "won" ? 1 : -1; continue; }
    if ((streak > 0) === (h.status === "won")) streak += h.status === "won" ? 1 : -1;
    else break;
  }
  return streak;
}

/**
 * Session-scoped record of prediction bets (see lib/betHistory.ts -- there's
 * no market_bets table write yet, so this is what "your bets" means today).
 * A bet appears here the moment it's placed (status "pending") and updates
 * in place once its market settles -- it doesn't wait for settlement to
 * show up. `compact` renders just the headline stats, for a spot in a page
 * header; the full panel is the list, meant to sit under a settled market
 * once its banner auto-dismisses so the win/loss doesn't just vanish.
 */
export function BetHistoryPanel({ compact = false }) {
  const history = useBetHistory();

  if (history.length === 0) {
    if (compact) return null;
    return (
      <div style={{ marginTop: 28, border: "1px dashed rgba(255,255,255,0.14)", borderRadius: 12, padding: "26px 20px", textAlign: "center" }}>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: 13, color: "#777" }}>Place a bet on an open market to start your track record.</p>
      </div>
    );
  }

  const resolved = history.filter(h => h.status !== "pending");
  const pendingCount = history.length - resolved.length;
  const wins = resolved.filter(h => h.status === "won").length;
  const losses = resolved.length - wins;
  const winRate = resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : null;
  const net = resolved.reduce((sum, h) => sum + (h.status === "won" ? h.payout - h.stake : -h.stake), 0);
  const streak = currentStreak(resolved);

  if (compact) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {pendingCount > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: YELLOW, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: YELLOW, animation: "betPendingPulse 1.4s ease-in-out infinite" }} />
            {pendingCount} live
          </span>
        )}
        {resolved.length > 0 && (
          <>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: "#888" }}>
              Record <strong style={{ color: "#ddd", fontWeight: 700 }}>{wins}-{losses}</strong>
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: "#888" }}>
              Net <strong style={{ color: net >= 0 ? YELLOW : "#9ca3af", fontWeight: 700 }}>{net >= 0 ? "+" : ""}{net} Pts</strong>
            </span>
          </>
        )}
        <style>{PULSE_KEYFRAME}</style>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 28 }}>
      <style>{PULSE_KEYFRAME}</style>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontFamily: SANS, fontSize: 16, fontWeight: 700, color: "#fff" }}>Your Bets</h2>
        <div style={{ display: "flex", gap: 18 }}>
          {pendingCount > 0 && <Stat label="Live" value={String(pendingCount)} tone="up" pulse />}
          <Stat label="Record" value={`${wins}-${losses}`} />
          <Stat label="Win rate" value={winRate == null ? "—" : `${winRate}%`} />
          <Stat label="Net" value={`${net >= 0 ? "+" : ""}${net}`} tone={net >= 0 ? "up" : "down"} />
          {streak !== 0 && <Stat label="Streak" value={`${Math.abs(streak)}${streak > 0 ? "W" : "L"}`} tone={streak > 0 ? "up" : "down"} />}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden" }}>
        {history.map(entry => <HistoryRow key={entry.id} entry={entry} />)}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, pulse }) {
  const color = tone === "up" ? YELLOW : tone === "down" ? "#9ca3af" : "#fff";
  return (
    <div style={{ textAlign: "right" }}>
      <span style={{ display: "block", fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#666" }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 700, color, animation: pulse ? "betPendingPulse 1.4s ease-in-out infinite" : "none" }}>{value}</span>
    </div>
  );
}

function HistoryRow({ entry }) {
  const isPending = entry.status === "pending";
  const won = entry.status === "won";
  const net = isPending ? null : (won ? entry.payout - entry.stake : -entry.stake);
  const dotColor = isPending ? YELLOW : won ? YELLOW : "#555";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "#111008" }}>
      <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: dotColor, animation: isPending ? "betPendingPulse 1.4s ease-in-out infinite" : "none" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: "#eee", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.question}</p>
        {entry.eventTitle && <p style={{ margin: 0, fontFamily: SANS, fontSize: 10.5, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.eventTitle}</p>}
      </div>
      <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 11, color: "#999", whiteSpace: "nowrap" }}>{entry.optionLabel} · {entry.odds.toFixed(2)}×</span>
      <span style={{ flexShrink: 0, width: 52, textAlign: "right", fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", color: isPending ? YELLOW : won ? YELLOW : "#666" }}>
        {isPending ? "LIVE" : won ? "WON" : "LOST"}
      </span>
      <span style={{ flexShrink: 0, width: 74, textAlign: "right", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: isPending ? "#999" : won ? YELLOW : "#777" }}>
        {isPending ? `→ ${Math.round(entry.stake * entry.odds)} Pts` : `${net >= 0 ? "+" : ""}${net} Pts`}
      </span>
      <span style={{ flexShrink: 0, width: 52, textAlign: "right", fontFamily: MONO, fontSize: 10, color: "#555" }}>{relativeTime(isPending ? entry.placedAt : entry.settledAt)}</span>
    </div>
  );
}
