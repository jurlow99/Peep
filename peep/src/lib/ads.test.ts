import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../supabase', () => ({ supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } } }));
import { selectAdTag, recordAdEvent } from './ads';
import { startPreroll } from './preroll';
const tag = (id: number, scope: string, content_id: any = null, extra = {}) => ({ id, scope, content_id, active: true, platforms: ['web','tvos'], is_test: true, tag_url: 'https://example.com/vast', ...extra });
describe('CSAI placement and lifecycle', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('matches string IDs, exact scope first, then type, then global with stable priority', () => {
    const tags = [tag(8,'global'), tag(5,'movie'),tag(4,'movie','42'),tag(1,'episode','42')];
    expect(selectAdTag(tags,'movie',42)?.id).toBe(4);
    expect(selectAdTag(tags,'movie','99')?.id).toBe(5);
    expect(selectAdTag(tags,'live','42')?.id).toBe(8);
    expect(selectAdTag([tag(2,'global'),tag(1,'global')],'live','')?.id).toBe(1);
  });
  it('rejects disabled, wrong-platform, unsafe URLs and unrelated exact IDs', () => {
    expect(selectAdTag([tag(1,'movie',null,{active:false}),tag(2,'movie',null,{platforms:['tvos']}),tag(3,'movie',null,{tag_url:'javascript:bad'}),tag(4,'movie','other')],'movie','42')).toBeNull();
  });
  it('does not attempt a guest write', async () => { await expect(recordAdEvent(tag(1,'movie'),'session','impression','movie','42')).resolves.toBeUndefined(); });
  it('falls back once when metadata hangs and never starts content after disposal', async () => {
    vi.useFakeTimers();
    const q: any = {};
    for (const key of ['select','eq','order']) q[key] = () => q;
    q.abortSignal = () => new Promise(() => {});
    const ready = vi.fn(), pause = vi.fn(), busy = vi.fn();
    const stop = startPreroll({ client: {from: () => q}, video: {pause}, container: {}, scope:'movie',contentId:'42',onBusy:busy,onReady:ready });
    await vi.advanceTimersByTimeAsync(5000);
    expect(ready).toHaveBeenCalledTimes(1); expect(pause).toHaveBeenCalledTimes(1);
    stop(); await vi.advanceTimersByTimeAsync(20000); expect(ready).toHaveBeenCalledTimes(1);
    const neverReady = vi.fn();
    const dispose = startPreroll({ client:{from:()=>q}, video:{pause},container:{},scope:'live',contentId:'1',onBusy:busy,onReady:neverReady });
    dispose(); await vi.advanceTimersByTimeAsync(20000); expect(neverReady).not.toHaveBeenCalled();
  });
  it('does not wait for the SDK when no tag applies', async () => {
    const q: any = {}; for (const key of ['select','eq','order']) q[key] = () => q;
    q.abortSignal = () => Promise.resolve({ data: [], error: null });
    const ready = vi.fn();
    const stop = startPreroll({client:{from:()=>q},video:{pause:vi.fn()},container:{},scope:'multiview',contentId:'',onBusy:vi.fn(),onReady:ready});
    await Promise.resolve(); await Promise.resolve(); expect(ready).toHaveBeenCalledTimes(1); stop();
  });
  it('cleans up once on SDK resume and rejects a late SDK result after exit', async () => {
    vi.useFakeTimers();
    class Bus {
      listeners: Record<string, Function> = {};
      destroy = vi.fn();
      addEventListener(key: string, fn: Function) { this.listeners[key] = fn; }
      fire(key: string, value = {}) { this.listeners[key]?.(value); }
    }
    const loader = new Bus();
    const manager = Object.assign(new Bus(), { init: vi.fn(), start: vi.fn() });
    const display = { initialize: vi.fn(), destroy: vi.fn() };
    const events = { CONTENT_PAUSE_REQUESTED:'pause',CONTENT_RESUME_REQUESTED:'resume',ALL_ADS_COMPLETED:'all',IMPRESSION:'impression',STARTED:'started',COMPLETE:'complete',SKIPPED:'skip' };
    vi.stubGlobal('window', { google:{ima:{
      AdDisplayContainer: function() { return display; }, AdsLoader:function() { return loader; }, AdsRenderingSettings:function() {},
      AdsRequest:function() { return {setAdWillAutoPlay:vi.fn(),setAdWillPlayMuted:vi.fn()}; },
      AdsManagerLoadedEvent:{Type:{ADS_MANAGER_LOADED:'loaded'}},AdErrorEvent:{Type:{AD_ERROR:'error'}},AdEvent:{Type:events},ViewMode:{NORMAL:'normal'},
    }}});
    Object.assign(loader, { requestAds: vi.fn() });
    const q: any = {}; for (const key of ['select','eq','order']) q[key] = () => q;
    q.abortSignal = () => Promise.resolve({data:[tag(1,'movie')],error:null});
    const ready = vi.fn();
    const stop = startPreroll({client:{from:()=>q},video:{pause:vi.fn(),muted:false},container:{},scope:'movie',contentId:'42',onBusy:vi.fn(),onReady:ready});
    await vi.advanceTimersByTimeAsync(1);
    loader.fire('loaded', {getAdsManager:()=>manager});
    manager.fire('started'); manager.fire('resume'); manager.fire('all');
    expect(ready).toHaveBeenCalledTimes(1); expect(manager.destroy).toHaveBeenCalledTimes(1);
    stop();
    const late = {destroy:vi.fn()}; loader.fire('loaded', {getAdsManager:()=>late});
    expect(late.destroy).toHaveBeenCalledTimes(1); expect(ready).toHaveBeenCalledTimes(1);
    // Even a test ad earns a cooldown across a different placement/package.
    const from = vi.fn(), reopened = vi.fn();
    startPreroll({client:{from},video:{pause:vi.fn()},container:{},scope:'multiview',contentId:'other-package',onBusy:vi.fn(),onReady:reopened});
    expect(reopened).toHaveBeenCalledTimes(1); expect(from).not.toHaveBeenCalled();
  });
  it('persists the cap across reloads and allows another break after 30 minutes', async () => {
    const values = new Map<string,string>();
    vi.stubGlobal('localStorage', {getItem:(k:string)=>values.get(k) ?? null,setItem:(k:string,v:string)=>values.set(k,v)});
    vi.resetModules();
    const first = await import('./preroll');
    const now = 2_000_000_000_000;
    expect(first.allowsPreroll(now)).toBe(true);
    first.recordPrerollStart(now);
    vi.resetModules();
    const reloaded = await import('./preroll');
    expect(reloaded.allowsPreroll(now + 1799999)).toBe(false);
    expect(reloaded.allowsPreroll(now + 1800000)).toBe(true);
  });
});

import {appleTVPlacementError} from './ads';
it('limits Apple TV mid-roll to dev test tags on a single live channel',()=>{
 const form={platforms:['tvos'],ad_type:'mid_roll',scope:'live',is_test:true,content_id:'12'};
 expect(appleTVPlacementError(form,true)).toBeNull();
 expect(appleTVPlacementError({...form,content_id:'-830031'},true)).toBeNull();
 expect(appleTVPlacementError(form,false)).toBeTruthy();
 expect(appleTVPlacementError({...form,is_test:false},true)).toBeTruthy();
 expect(appleTVPlacementError({...form,content_id:''},true)).toBeTruthy();
 expect(appleTVPlacementError({...form,scope:'global'},true)).toBeTruthy();
 expect(appleTVPlacementError({...form,ad_type:'post_roll'},true)).toBeTruthy();
});
