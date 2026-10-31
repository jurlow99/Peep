import { afterEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock('../supabase', () => ({ supabase: { rpc } }));
import { trackLiveVideo } from './liveViewing';
describe('live viewing playback measurement', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); rpc.mockClear(); });
  it('counts advancing playback, closes paused sessions and excludes buffering', async () => {
    vi.useFakeTimers();
    let now = 0;
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('navigator', { userAgent: 'Desktop' });
    const video = Object.assign(new EventTarget(), { currentTime: 0, paused: false, ended: false, readyState: 4 });
    const stop = trackLiveVideo(video, 123);
    for (let i=0;i<16;i++) { now += 1000; video.currentTime += 1; await vi.advanceTimersByTimeAsync(1000); }
    expect(rpc).toHaveBeenCalledWith('record_live_viewing', expect.objectContaining({ p_channel_id: 123, p_seconds: 0, p_end: false }));
    expect(rpc.mock.calls.some(([,p]) => p.p_seconds > 0 && p.p_seconds <= 16)).toBe(true);
    const count = rpc.mock.calls.length;
    // Stalled media time is not watch time, even if the UI remains mounted.
    for (let i=0;i<20;i++) { now += 1000; await vi.advanceTimersByTimeAsync(1000); }
    expect(rpc.mock.calls.length).toBe(count);
    video.paused = true; video.dispatchEvent(new Event('pause'));
    await Promise.resolve(); await Promise.resolve();
    expect(rpc.mock.calls.at(-1)?.[1].p_end).toBe(true);
    stop();
  });
});
