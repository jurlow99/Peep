import { describe, expect, it, vi } from 'vitest';
import { queryLiveViewingDetails } from './liveViewingDetails';
function client() {
  const query: any = {};
  for (const method of ['select','is','gt','gte','eq','order','range']) query[method] = vi.fn(() => query);
  return { from: vi.fn(() => query), query };
}
describe('admin viewing drilldowns', () => {
  it('uses the active heartbeat window independently of the period without tokens or account fields', () => {
    const db = client();
    queryLiveViewingDetails(db, { metric: 'viewers_now', since: 'old', now: 100000 });
    expect(db.query.eq).toHaveBeenCalledWith('is_test', false);
    expect(db.query.is).toHaveBeenCalledWith('ended_at', null);
    expect(db.query.gt).toHaveBeenCalledWith('last_ping', new Date(55000).toISOString());
    expect(db.query.gte).not.toHaveBeenCalled();
    expect(db.query.select.mock.calls[0][0]).not.toMatch(/ingest_token|user_id/);
  });
  it('scopes history, platform and multiview with inclusive paging and stable sorting', () => {
    const db = client();
    queryLiveViewingDetails(db, { metric: 'watch_hours', since: '2026-10-21', now: 100000, page: 2, platform: 'tvos', mode: 'multiview' });
    expect(db.query.gte).toHaveBeenCalledWith('started_at', '2026-10-21');
    expect(db.query.eq).toHaveBeenCalledWith('platform', 'tvos');
    expect(db.query.eq).toHaveBeenCalledWith('mode', 'multiview');
    expect(db.query.order.mock.calls).toEqual([['watched_seconds', { ascending: false }], ['id', { ascending: false }]]);
    expect(db.query.range).toHaveBeenCalledWith(50, 74);
  });
  it('includes simulator records only when explicitly requested', () => {
    const db = client();
    queryLiveViewingDetails(db, { metric: 'sessions', since: '2026-10-21', now: 100000, includeTests: true });
    expect(db.query.eq).not.toHaveBeenCalledWith('is_test', false);
  });
});
