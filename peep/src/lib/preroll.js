import { selectAdTag, recordAdEvent } from './ads';
const FREQUENCY_KEY = 'peep.preroll.lastStartedAt';
let lastStartedInMemory = 0;
export function allowsPreroll(now = Date.now()) {
  let last = lastStartedInMemory;
  try { last = Math.max(last, Number(localStorage.getItem(FREQUENCY_KEY)) || 0); } catch { /* Memory fallback for restricted storage. */ }
  return last <= 0 || now - last >= 30 * 60 * 1000;
}
export function recordPrerollStart(now = Date.now()) {
  lastStartedInMemory = now;
  try { localStorage.setItem(FREQUENCY_KEY, String(now)); } catch { /* Keep the in-memory cap. */ }
}
// One owner per playback; teardown never resumes content after navigation.
export function startPreroll({ client, video, container, scope, contentId, onBusy, onReady, onManager = () => {} }) {
  let disposed = false, finished = false, cleaned = false, loader, display, manager, tag, timer;
  const session = crypto.randomUUID();
  const abort = new AbortController();
  const log = (event, id = '') => { if (tag && !disposed) recordAdEvent(tag, session, event, scope, contentId, id); };
  const clean = () => { if (cleaned) return; cleaned = true; clearTimeout(timer); manager?.destroy(); loader?.destroy(); display?.destroy(); onManager(null); };
  const finish = () => { if (disposed || finished) return; finished = true; clean(); onBusy(false); onReady(); };
  const timeout = () => { log('timeout'); finish(); };
  if (!allowsPreroll()) { onBusy(false); onReady(); return () => {}; }
  onBusy(true);
  video.pause();
  timer = setTimeout(timeout, 5000);
  (async () => {
    try {
      const response = await client.from('vast_tags').select('id,tag_url,scope,content_id,active,is_test,platforms').eq('active', true).eq('ad_type', 'pre_roll').order('id').abortSignal(abort.signal);
      if (disposed || finished) return;
      if (response.error) { finish(); return; }
      tag = selectAdTag(response.data, scope, contentId);
      if (!tag) { finish(); return; }
      if (!allowsPreroll()) { finish(); return; }
      while (!window.google?.ima && !disposed && !finished) await new Promise(resolve => setTimeout(resolve, 100));
      if (disposed || finished) return;
      clearTimeout(timer);
      timer = setTimeout(timeout, 10000);
      const ima = window.google.ima;
      display = new ima.AdDisplayContainer(container, video);
      display.initialize();
      loader = new ima.AdsLoader(display);
      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, event => {
        if (disposed || finished) { event.getAdsManager(video).destroy(); return; }
        try {
          const settings = new ima.AdsRenderingSettings();
          settings.loadVideoTimeout = 8000;
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
            recordPrerollStart();
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
      request.setAdWillPlayMuted(video.muted);
      log('request');
      loader.requestAds(request);
    } catch { log('error'); finish(); }
  })();
  return () => { if (!finished) log('cancel'); disposed = true; abort.abort(); clean(); };
}
