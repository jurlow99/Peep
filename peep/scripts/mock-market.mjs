// Replays a prediction-market fixture onto a Supabase Broadcast channel, so
// MarketOverlay (once built) can be exercised end to end -- Broadcast
// delivery, the reveal scheduler, the store -- without a real event, a real
// odds provider, or a second backend to stand up. See the spec, §4.
//
// Usage:
//   node scripts/mock-market.mjs [streamId] [fixturePath]
//   node scripts/mock-market.mjs dev-stream-1
//   node scripts/mock-market.mjs dev-stream-1 scripts/fixtures/two-team-moneyline.json
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from peep/.env, same as
// the app -- this publishes as an anonymous client would, which is also how
// the Phase 1 "admin manually opens markets from the CMS" step will publish.
// No service-role key: Broadcast channels don't need one for this.

import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...loadEnv(".env"), ...process.env };
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY -- run this from peep/ with a .env in place.");
  process.exit(1);
}

const streamId = process.argv[2] ?? "dev-stream-1";
const fixturePath = process.argv[3] ?? new URL("./fixtures/two-team-moneyline.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const channel = supabase.channel(`market:${streamId}`, {
    config: { broadcast: { self: false, ack: false } },
  });

  await new Promise((resolve, reject) => {
    channel.subscribe(status => {
      if (status === "SUBSCRIBED") resolve();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
    });
  });

  console.log(`Connected to market:${streamId} -- replaying ${fixture.ticks.length} ticks from ${fixture.description ?? fixturePath}\n`);

  // The open tick carries locksAt so a countdown has something to show --
  // derived from the fixture's own lock offset rather than hardcoded, so a
  // fixture stays internally consistent if its timings change.
  const lockOffsetMs = fixture.ticks.find(t => t.payload.type === "lock")?.offsetMs ?? null;
  const t0 = Date.now();

  for (const tick of fixture.ticks) {
    const wait = t0 + tick.offsetMs - Date.now();
    if (wait > 0) await sleep(wait);

    const payload = { ...tick.payload, eventTs: Date.now() };
    if (payload.type === "open") payload.locksAt = lockOffsetMs != null ? t0 + lockOffsetMs : null;

    await channel.send({ type: "broadcast", event: "tick", payload });
    console.log(`[+${String(tick.offsetMs).padStart(6)}ms] ${payload.type.padEnd(6)} market ${payload.marketId} seq ${payload.seq}`);
  }

  console.log("\nFixture done.");
  await supabase.removeChannel(channel);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
