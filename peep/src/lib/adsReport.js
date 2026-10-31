// Turns raw ad_impressions rows into the numbers the admin report shows. Pure,
// so the panel stays thin and the math is testable. Delivery telemetry only:
// nothing here is a billing figure.
export const AD_EVENTS = ['request', 'impression', 'complete', 'skip', 'error', 'timeout', 'cancel'];
export const PLACEMENT_LABELS = { pre_roll: 'Pre-roll', mid_roll: 'Mid-roll', post_roll: 'Post-roll' };
export const PLATFORM_LABELS = { web: 'Browser', tvos: 'Apple TV' };

function pct(part, whole) { return whole > 0 ? Math.round(part / whole * 100) : null; }
function bucket(map, key) { return map[key] || (map[key] = { requests: 0, impressions: 0, completes: 0, skips: 0, errors: 0 }); }
function count(stats, row) {
  if (row.event === 'request') stats.requests++;
  if (row.event === 'impression') stats.impressions++;
  if (row.event === 'complete') stats.completes++;
  if (row.event === 'skip') stats.skips++;
  if (row.event === 'error' || row.event === 'timeout') stats.errors++;
}

export function summarizeAdEvents(rows, tags = [], { days = 14, now = new Date() } = {}) {
  const tagsById = Object.fromEntries((tags || []).map(t => [String(t.id), t]));
  const totals = bucket({}, 'all');
  const byTag = {}, byPlatform = {}, byPlacement = {};
  const requested = new Set(), started = new Set(), viewers = new Set();
  const daily = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    daily[d.toISOString().slice(0, 10)] = 0;
  }
  for (const row of rows || []) {
    count(totals, row);
    count(bucket(byTag, String(row.vast_tag_id)), row);
    count(bucket(byPlatform, row.platform || 'web'), row);
    count(bucket(byPlacement, tagsById[String(row.vast_tag_id)]?.ad_type || 'unknown'), row);
    if (row.event === 'request') requested.add(row.session_id);
    if (row.event === 'impression') {
      started.add(row.session_id);
      if (row.user_id) viewers.add(row.user_id);
      const day = String(row.created_at || '').slice(0, 10);
      if (day in daily) daily[day]++;
    }
  }
  let startedRequested = 0;
  for (const id of started) if (requested.has(id)) startedRequested++;
  return {
    impressions: totals.impressions, completes: totals.completes, skips: totals.skips, errors: totals.errors,
    completionRate: pct(totals.completes, totals.impressions),
    startRate: pct(startedRequested, requested.size),
    uniqueViewers: viewers.size,
    daily: Object.entries(daily).map(([date, count]) => ({ date, count })),
    byTag, byPlatform, byPlacement,
  };
}
