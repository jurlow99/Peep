// One ad break, any position. Picks the tag, runs it through Google IMA on the
// content <video>, reports delivery, and always hands control back to content
// (or never, if the caller tore the player down first). One owner per break.
import { selectAdTag, recordAdEvent } from './ads';
import { hasAdPolicy, loadAdPolicy, allowsEntryAd, recordAdStart, placementAllowed } from './adPolicy';

export const PLACEMENTS = ['pre_roll', 'mid_roll', 'post_roll'];
const DISCOVERY_MS = 5000, STARTUP_MS = 10000, MEDIA_LOAD_MS = 8000;

export function playAdBreak({ client, video, container, placement = 'pre_roll', scope, contentId, onBusy, onReady, onManager = () => {} }) {
  let disposed = false, finished = false, cleaned = false, loader, display, manager, tag, timer;
  const entry = placement === 'pre_roll';
  const session = crypto.randomUUID();
  const abort = new AbortController();
  const log = (event, id = '') => { if (tag && !disposed) recordAdEvent(tag, session, event, scope, contentId, id); };
  const clean = () => { if (cleaned) return; cleaned = true; clearTimeout(timer); manager?.destroy(); loader?.destroy(); display?.destroy(); onManager(null); };
  const finish = () => { if (disposed || finished) return; finished = true; clean(); onBusy(false); onReady(); };
  const timeout = () => { log('timeout'); finish(); };
  const skip = () => { onBusy(false); onReady(); return () => {}; };
  // Cheap checks first, before touching the network: rules may say no.
  if (hasAdPolicy() && (!placementAllowed(placement, scope) || (entry && !allowsEntryAd()))) return skip();
  onBusy(true);
  video.pause();
  timer = setTimeout(timeout, DISCOVERY_MS);
  (async () => {
    try {
      if (!hasAdPolicy()) await loadAdPolicy(client);
      if (disposed || finished) return;
      if (!placementAllowed(placement, scope) || (entry && !allowsEntryAd())) { finish(); return; }
      const response = await client.from('vast_tags').select('id,tag_url,scope,content_id,active,is_test,platforms').eq('active', true).eq('ad_type', placement).order('id').abortSignal(abort.signal);
      if (disposed || finished) return;
      if (response.error) { finish(); return; }
      tag = selectAdTag(response.data, scope, contentId);
      if (!tag) { finish(); return; }
      if (entry && !allowsEntryAd()) { finish(); return; }
      while (!window.google?.ima && !disposed && !finished) await new Promise(resolve => setTimeout(resolve, 100));
      if (disposed || finished) return;
      clearTimeout(timer);
      timer = setTimeout(timeout, STARTUP_MS);
      const ima = window.google.ima;
      display = new ima.AdDisplayContainer(container, video);
      display.initialize();
      loader = new ima.AdsLoader(display);
      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, event => {
        if (disposed || finished) { event.getAdsManager(video).destroy(); return; }
        try {
          const settings = new ima.AdsRenderingSettings();
          settings.loadVideoTimeout = MEDIA_LOAD_MS;
          settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
          manager = event.getAdsManager(video, settings);
          onManager(manager);
          const adID = e => { const ad = e.getAd?.(); const pod = ad?.getAdPodInfo?.(); return `${ad?.getAdId?.() || 'ad'}:${pod?.getPodIndex?.() || 0}:${pod?.getAdPosition?.() || 1}`; };
          manager.addEventListener(ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => video.pause());
          manager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, finish);
          manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, finish);
          manager.addEventListener(ima.AdEvent.Type.IMPRESSION, e => log('impression', adID(e)));
          manager.addEventListener(ima.AdEvent.Type.STARTED, () => {
            if (disposed || finished) return;
            clearTimeout(timer);
            recordAdStart();
          });
          manager.addEventListener(ima.AdEvent.Type.COMPLETE, e => log('complete', adID(e)));
          manager.addEventListener(ima.AdEvent.Type.SKIPPED, e => log('skip', adID(e)));
          manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => { log('error'); finish(); });
          manager.init(video.clientWidth || 1280, video.clientHeight || 720, ima.ViewMode.NORMAL);
          manager.start();
        } catch { log('error'); finish(); }
      });
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => { log('error'); finish(); });
      const request = new ima.AdsRequest();
      request.adTagUrl = tag.tag_url;
      request.linearAdSlotWidth = video.clientWidth || 1280;
      request.linearAdSlotHeight = video.clientHeight || 720;
      request.setAdWillAutoPlay(true);
      request.setAdWillPlayMuted(!!video.muted);
      log('request');
      loader.requestAds(request);
    } catch { log('error'); finish(); }
  })();
  return () => { if (!finished) log('cancel'); disposed = true; abort.abort(); clean(); };
}

// Admin "check this tag": play one VAST URL straight through IMA. No rules, no
// cooldown, no reporting. Resolves with what happened in plain words.
export function previewAdTag({ tagUrl, video, container, onStatus = () => {} }) {
  let display, loader, manager, timer, done = false;
  const clean = () => { clearTimeout(timer); manager?.destroy(); loader?.destroy(); display?.destroy(); };
  const end = status => { if (done) return; done = true; clean(); onStatus(status); };
  (async () => {
    try {
      const started = Date.now();
      while (!window.google?.ima && !done && Date.now() - started < STARTUP_MS) await new Promise(resolve => setTimeout(resolve, 100));
      if (done) return;
      const ima = window.google?.ima;
      if (!ima) { end({ ok: false, text: 'The Google IMA SDK did not load in this browser.' }); return; }
      onStatus({ ok: null, text: 'Asking the ad server…' });
      timer = setTimeout(() => end({ ok: false, text: 'No ad started within 10 seconds. The tag may be empty or blocked.' }), STARTUP_MS);
      display = new ima.AdDisplayContainer(container, video);
      display.initialize();
      loader = new ima.AdsLoader(display);
      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, event => {
        if (done) { event.getAdsManager(video).destroy(); return; }
        try {
          const settings = new ima.AdsRenderingSettings();
          settings.loadVideoTimeout = MEDIA_LOAD_MS;
          manager = event.getAdsManager(video, settings);
          manager.addEventListener(ima.AdEvent.Type.STARTED, e => { clearTimeout(timer); onStatus({ ok: null, text: `Ad playing: ${e.getAd?.()?.getTitle?.() || 'untitled creative'}` }); });
          manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => end({ ok: true, text: 'The ad played through. This tag works in the browser.' }));
          manager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => end({ ok: true, text: 'The ad played through. This tag works in the browser.' }));
          manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, e => end({ ok: false, text: `Ad error: ${e.getError?.()?.getMessage?.() || 'playback failed'}` }));
          manager.init(video.clientWidth || 640, video.clientHeight || 360, ima.ViewMode.NORMAL);
          manager.start();
        } catch (error) { end({ ok: false, text: `Ad error: ${error?.message || 'could not start'}` }); }
      });
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, e => end({ ok: false, text: `The ad server said no: ${e.getError?.()?.getMessage?.() || 'request failed'}` }));
      const request = new ima.AdsRequest();
      request.adTagUrl = tagUrl;
      request.linearAdSlotWidth = video.clientWidth || 640;
      request.linearAdSlotHeight = video.clientHeight || 360;
      request.setAdWillAutoPlay(true);
      request.setAdWillPlayMuted(false);
      loader.requestAds(request);
    } catch (error) { end({ ok: false, text: `Ad error: ${error?.message || 'could not start'}` }); }
  })();
  return () => end({ ok: null, text: 'Preview stopped.' });
}

// Keep the ad surface the same size as the player when it goes fullscreen.
export function resizeAdBreak(manager, width, height) {
  const ima = window.google?.ima;
  if (!manager || !ima || !width || !height) return;
  try { manager.resize(width, height, ima.ViewMode.NORMAL); } catch { /* SDK may already be gone. */ }
}
