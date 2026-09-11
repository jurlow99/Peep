/** Shared shapes for the prediction-markets overlay. See the spec's §3/§6 for
 * why ticks are ephemeral (never persisted) while markets/options/bets are. */

export type MarketStatus = "open" | "locked" | "settled" | "void";

export interface MarketOption {
  key: string;
  label: string;
  odds: number;
}

export interface Market {
  id: string;
  streamId: string;
  question: string;
  status: MarketStatus;
  options: MarketOption[];
  locksAt: number | null;
  winningKey: string | null;
  /** Highest applied tick seq for this market — used to drop stale/out-of-order ticks. */
  seq: number;
}

/** Wire shape published on the `market:{streamId}` Broadcast channel. */
export type MarketTick =
  | { type: "open"; marketId: string; seq: number; eventTs: number; question: string; options: MarketOption[]; locksAt: number | null }
  | { type: "price"; marketId: string; seq: number; eventTs: number; options: Array<{ key: string; odds: number }> }
  | { type: "lock"; marketId: string; seq: number; eventTs: number }
  | { type: "settle"; marketId: string; seq: number; eventTs: number; winningKey: string };
