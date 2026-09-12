// Read-only proxy for ESPN's public (unofficial, undocumented) scoreboard
// endpoint -- lets the Predictions CMS link a market to a real game and
// later poll its live score/status, without a paid odds/scores API key.
// Being unofficial, ESPN's response shape could change without notice;
// this reads only a handful of fields and fails soft (empty events list)
// rather than surfacing ESPN's own shape to the client.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

// Allowlist, not a passthrough -- keeps this a scoreboard proxy, not an
// open fetch of any ESPN path.
const ALLOWED_LEAGUES = new Set([
  "football/nfl",
  "basketball/nba",
  "baseball/mlb",
  "hockey/nhl",
  "soccer/eng.1",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const league = new URL(req.url).searchParams.get("league") || "";
    if (!ALLOWED_LEAGUES.has(league)) throw new Error("Unsupported league");

    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${league}/scoreboard`, {
      // Confirmed empirically: ESPN's edge (Akamai) 403s a browser-claiming
      // UA (and Deno's own default) but allows curl's -- it reads a
      // "pretending to be a browser" signature as more suspicious than an
      // honest script. Fragile and undocumented since this is an unofficial
      // endpoint with no key to authenticate with instead; if ESPN changes
      // this, events just fail to load (caught below), nothing crashes.
      headers: { "User-Agent": "curl/8.12.1" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Scoreboard returned ${res.status}`);
    const data = await res.json();

    const events = (data.events || []).map((e: any) => {
      const comp = e.competitions?.[0];
      const status = comp?.status;
      const competitors = comp?.competitors || [];
      const home = competitors.find((c: any) => c.homeAway === "home");
      const away = competitors.find((c: any) => c.homeAway === "away");
      return {
        id: e.id,
        name: e.name,
        date: e.date,
        state: status?.type?.state ?? "pre",           // "pre" | "in" | "post"
        detail: status?.type?.shortDetail ?? "",         // e.g. "Q3 4:12", "Final", "8:20 PM"
        completed: !!status?.type?.completed,
        home: { name: home?.team?.displayName ?? "", abbrev: home?.team?.abbreviation ?? "", score: home?.score ?? null },
        away: { name: away?.team?.displayName ?? "", abbrev: away?.team?.abbreviation ?? "", score: away?.score ?? null },
      };
    });

    return new Response(JSON.stringify({ events }), { headers: { "Content-Type": "application/json", ...CORS } });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
});
