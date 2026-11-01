import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { IS_DEV_DB } from '../../lib/config';
import { createVODUpload } from '../../lib/vodUpload';
import { createR2VODUpload, r2VODRequest, R2_VOD_LIMIT } from '../../lib/r2VOD';
import { VOD_PLAYBACK_BUCKET, VOD_SOURCE_LIMIT, vodFilePath } from '../../lib/vodStorage';
import { captureVideoThumbnail, readVideoMetadata } from '../../lib/videoThumbnail';
import { formatBytes, formatDuration } from '../../lib/uploadProgress';
import { uploadImage } from '../../lib/storageUtils';
import { planSeriesImport, STATUS, seasonLabel } from '../../lib/seriesImport';
import { codecLabel, detectMP4VideoCodec, mp4CodecProblem } from '../../lib/mp4Codec';
import { ImageUploader } from '../ImageUploader';

const artworkFolder = name => (IS_DEV_DB ? `hero/${name}` : name);
const artworkBucket = IS_DEV_DB ? 'promo-images' : undefined;

// Pick a show folder (Show / Season N / SxxEyy Title.mp4), review what was
// found, then every episode uploads and saves through the same
// save_uploaded_vod path as Add VOD. One file at a time; the page must stay open.
export default function SeriesFolderImport({ shows = [], showToast, logAudit, onSaved }) {
  const [plan, setPlan] = useState(null);
  const [titles, setTitles] = useState({});          // key → edited episode title
  const [showTitle, setShowTitle] = useState('');
  const [poster, setPoster] = useState('');
  const [tier, setTier] = useState('production');
  const [premium, setPremium] = useState(false);
  const [grabThumbs, setGrabThumbs] = useState(true);
  const [r2Ready, setR2Ready] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState({});        // key → { state, progress, message }
  const [showID, setShowID] = useState('');
  const [badCodec, setBadCodec] = useState({});     // key → codec name for MP4s Peep can't play (AV1, HEVC…)
  const stop = useRef(false), current = useRef(null), alive = useRef(true), fileInput = useRef(null);

  useEffect(() => { alive.current = true; return () => { alive.current = false; stop.current = true; current.current?.abort?.(); }; }, []);
  useEffect(() => { let live = true; r2VODRequest('status').then(d => { if (live && d.configured) setR2Ready(true); }).catch(() => {}); return () => { live = false; }; }, []);
  // What's already in Peep is read fresh every time a folder is picked, so
  // re-picking the same folder after an import only surfaces what's new.
  async function loadExisting() {
    const { data } = await supabase.from('episodes').select('show_id,season,episode_number');
    const bySlot = {};
    (data || []).forEach(e => { (bySlot[e.show_id] ||= []).push({ season: e.season, episode_number: e.episode_number }); });
    return shows.map(s => ({ ...s, episodes: bySlot[s.id] || [] }));
  }

  async function choose(event) {
    const files = Array.from(event.target.files || []).map(file => ({ name: file.name, size: file.size, path: file.webkitRelativePath || file.name, file }));
    event.target.value = '';
    if (!files.length) return;
    const known = await loadExisting();
    if (!alive.current) return;
    const next = planSeriesImport(files, known);
    setPlan(next); setTitles({}); setResults({}); setBadCodec({}); setShowTitle(next.showTitle); setPoster(next.show?.poster || ''); setShowID(next.show ? String(next.show.id) : '');
    if (!next.ready) showToast?.(next.episodes.length ? 'Everything in that folder is already in Peep.' : 'No importable episodes found in that folder.');
    // An MP4 can hide AV1 or HEVC video, which plays as sound over black on Safari and Apple TV. Check before anything uploads.
    const problems = {};
    for (const item of next.episodes) {
      if (item.status !== STATUS.READY) continue;
      const codec = await detectMP4VideoCodec(item.file.file).catch(() => null);
      if (mp4CodecProblem(codec)) problems[item.key] = codecLabel(codec);
    }
    if (alive.current && Object.keys(problems).length) setBadCodec(problems);
  }

  const limit = r2Ready ? R2_VOD_LIMIT : VOD_SOURCE_LIMIT;
  const tooBig = plan ? plan.episodes.filter(e => e.status === STATUS.READY && e.size > limit) : [];
  const needsPoster = plan && !plan.show && !poster;
  const queue = plan ? plan.episodes.filter(e => e.status === STATUS.READY && e.size <= limit && !badCodec[e.key]) : [];
  const badCount = Object.keys(badCodec).length;
  const failed = Object.values(results).filter(r => r.state === 'failed').length;

  function update(key, patch) { setResults(r => ({ ...r, [key]: { ...(r[key] || {}), ...patch } })); }

  async function uploadOne(episode, id) {
    const file = episode.file.file;
    return new Promise((resolve, reject) => {
      const options = {
        file, id,
        onProgress: percent => update(episode.key, { progress: percent }),
        onSuccess: ({ path }) => resolve(path),
        onError: reject,
      };
      (async () => {
        try {
          let task;
          if (r2Ready) task = await createR2VODUpload(options);
          else {
            const path = vodFilePath({ type: 'inbox', id, role: 'playback' }, file.name);
            task = await createVODUpload({ ...options, bucket: VOD_PLAYBACK_BUCKET, path, contentType: 'video/mp4', onSuccess: () => resolve(path) });
          }
          current.current = task; task.start();
        } catch (error) { reject(error); }
      })();
    });
  }

  async function run() {
    if (!queue.length || needsPoster) return;
    setRunning(true); stop.current = false;
    let series = showID;
    let posterURL = poster;
    for (const episode of queue) {
      if (stop.current) break;
      const previous = results[episode.key];
      if (previous?.state === 'saved') continue;
      const id = crypto.randomUUID();
      update(episode.key, { state: 'uploading', progress: 0, message: '' });
      try {
        const path = await uploadOne(episode, id);
        if (stop.current) break;
        let thumbnail = '', duration = '';
        const local = URL.createObjectURL(episode.file.file);
        try {
          try { const info = await readVideoMetadata(local); duration = formatDuration(info?.duration); } catch { /* duration stays blank */ }
          if (grabThumbs) {
            update(episode.key, { state: 'thumbnail', message: 'Grabbing a frame…' });
            try {
              const frame = await captureVideoThumbnail(local);
              const uploaded = await uploadImage(frame, artworkFolder('episodes'), artworkBucket);
              if (!uploaded.error) thumbnail = uploaded.url;
            } catch { /* An episode without a thumbnail is still an episode. */ }
          }
        } finally { URL.revokeObjectURL(local); }
        update(episode.key, { state: 'saving', message: 'Saving…' });
        const details = {
          type: 'episode', title: titles[episode.key] ?? episode.title, season: episode.season, episode_number: episode.number,
          thumbnail, duration, is_premium: premium, visibility_tier: tier, storage_provider: r2Ready ? 'r2' : 'supabase',
          ...(series ? { show_id: series } : { series_title: showTitle.trim(), poster: posterURL }),
        };
        const { data, error } = await supabase.rpc('save_uploaded_vod', { p_upload_id: id, p_path: path, p_details: details });
        if (error) throw error;
        if (!series && data?.show_id) { series = String(data.show_id); setShowID(series); posterURL = poster; }
        logAudit?.('create', 'episode', data?.id, episode.extra ? 'folder import extra' : `folder import S${episode.season}E${episode.number}`);
        if (episode.extra && /trailer/i.test(episode.name) && series) await adoptTrailer(series, data?.id);
        update(episode.key, { state: 'saved', progress: 100, message: episode.extra ? 'Saved to Extras' : `Saved as S${episode.season}E${episode.number}` });
      } catch (error) {
        if (!alive.current) return;
        const text = error?.message || 'Failed';
        update(episode.key, { state: /already exists/i.test(text) ? 'saved' : 'failed', message: text });
      }
    }
    current.current = null;
    if (alive.current) { setRunning(false); onSaved?.(); showToast?.(stop.current ? 'Import stopped. Saved episodes are kept.' : 'Series import finished.'); }
  }

  function cancel() { stop.current = true; current.current?.abort?.(); }

  // The first imported trailer becomes the series trailer when the series has none.
  async function adoptTrailer(seriesID, episodeID) {
    if (!episodeID) return;
    const { data: show } = await supabase.from('shows').select('trailer_url').eq('id', seriesID).maybeSingle();
    if (show?.trailer_url) return;
    const { data: saved } = await supabase.from('episodes').select('url').eq('id', episodeID).maybeSingle();
    if (saved?.url) await supabase.from('shows').update({ trailer_url: saved.url }).eq('id', seriesID);
  }

  const alreadyIn = plan ? plan.episodes.filter(e => e.status === STATUS.EXISTS) : [];
  const newSeasons = plan ? plan.seasons.filter(season => plan.episodes.some(e => e.season === season && e.status !== STATUS.EXISTS)) : [];
  const summary = plan && [
    `${plan.ready} new episode${plan.ready === 1 ? '' : 's'}${plan.extras ? ` + ${plan.extras} extra${plan.extras === 1 ? '' : 's'}` : ''}${plan.ready || plan.extras ? ` · ${formatBytes(plan.bytes)}` : ''}`,
    alreadyIn.length ? `${alreadyIn.length} already in Peep` : '',
    tooBig.length ? `${tooBig.length} too large for ${r2Ready ? 'R2' : 'Supabase (configure R2 for files over 50 MiB)'}` : '',
    badCount ? `${badCount} can't play on Safari/Apple TV (convert to H.264)` : '',
    plan.skipped.length ? `${plan.skipped.length} file${plan.skipped.length === 1 ? '' : 's'} skipped` : '',
  ].filter(Boolean).join(' · ');

  const twins = plan ? plan.skipped.filter(s => s.converted) : [];
  const rest = plan ? plan.skipped.filter(s => !s.converted) : [];
  const saved = Object.values(results).filter(r => r.state === 'saved').length;
  const remaining = queue.filter(e => results[e.key]?.state !== 'saved').length;
  const actionLabel = running ? `Importing ${saved + 1} of ${queue.length}…` : saved ? `Import remaining (${remaining})` : `Import ${queue.length} file${queue.length === 1 ? '' : 's'}`;

  return (
    <div className="vod-import">
      <input ref={fileInput} className="vod-import-file" type="file" webkitdirectory="" directory="" multiple onChange={choose} disabled={running} />
      <div className="vod-import-head">
        <div>
          <h3>Import a series folder</h3>
          <p>Pick the show's folder: <code>Show / Season 1 / S01E02 Title.mp4</code>.</p>
        </div>
        <button type="button" className="vod-import-start" onClick={() => fileInput.current?.click()} disabled={running}>{plan ? 'Pick folder again' : 'Choose folder'}</button>
      </div>
      <details className="vod-import-help">
        <summary>How it works</summary>
        <ul>
          <li>Each MP4 uploads to {r2Ready ? 'R2' : 'Supabase'} and lands in Episodes, approved, one file at a time. Keep this tab open.</li>
          <li>Files named trailer, teaser, promo or bloopers go to the series' <strong>Extras</strong> shelf; the first trailer becomes the series trailer.</li>
          <li>Pick the same folder again later and only new files show up.</li>
          <li>Peep plays H.264 MP4 only. <code>.mkv</code> / <code>.webm</code> and AV1 / HEVC MP4s are flagged — convert them first.</li>
        </ul>
      </details>

      {plan && (
        <>
          <div className="vod-import-bar">
            <strong>{summary}</strong>
            <div className="vod-import-actions">
              {(saved > 0 || failed > 0) && <span className="vod-import-hint">{saved} saved{failed ? `, ${failed} failed` : ''}</span>}
              {needsPoster && <span className="vod-import-hint">Needs a poster first</span>}
              {!running ? <button type="button" className="vod-import-start" onClick={run} disabled={!remaining || needsPoster}>{actionLabel}</button>
                : <><span className="vod-import-hint">{actionLabel}</span><button type="button" onClick={cancel}>Stop after this file</button></>}
            </div>
          </div>

          <div className="vod-import-grid">
            <label>Series
              <input value={showTitle} onChange={e => setShowTitle(e.target.value)} disabled={!!plan.show || running} />
              <small>{plan.show ? 'Existing series — episodes are added to it.' : 'New series.'}</small>
            </label>
            <label>Visibility
              <select value={tier} onChange={e => setTier(e.target.value)} disabled={running}>
                <option value="production">Production — viewers can see it</option>
                <option value="test">Test — admin only</option>
              </select>
            </label>
            <label className="vod-import-check"><input type="checkbox" checked={premium} onChange={e => setPremium(e.target.checked)} disabled={running} /> Premium</label>
            <label className="vod-import-check"><input type="checkbox" checked={grabThumbs} onChange={e => setGrabThumbs(e.target.checked)} disabled={running} /> Auto thumbnails</label>
          </div>
          {!plan.show && (
            <div className="vod-import-poster">
              <span className="vod-import-label">POSTER — required for a new series</span>
              {poster ? <div className="vod-import-poster-row"><img src={poster} alt="" /><button type="button" onClick={() => setPoster('')} disabled={running}>Replace</button></div>
                : <ImageUploader label="Upload poster" folder={artworkFolder('posters')} bucket={artworkBucket} appearance="light" onUploadSuccess={url => setPoster(url)} onError={m => showToast?.(m, 'error')} />}
            </div>
          )}

          {!plan.ready && !plan.extras && !tooBig.length && <p className="vod-import-hint" style={{ marginTop: 14 }}>Nothing new in this folder.</p>}

          {newSeasons.map(season => (
            <div key={season} className="vod-import-season">
              <h4>{seasonLabel(season)}</h4>
              <table>
                <tbody>
                  {plan.episodes.filter(e => e.season === season && e.status !== STATUS.EXISTS).map(episode => {
                    const result = results[episode.key];
                    const blocked = badCodec[episode.key] ? `${badCodec[episode.key]} video — Safari and Apple TV play it as sound over black. Convert to H.264 first.` : episode.size > limit ? 'Too large for this storage.' : '';
                    return (
                      <tr key={episode.key} className={blocked ? 'blocked' : ''}>
                        <td className="num">{episode.extra ? '★' : `E${episode.number}`}</td>
                        <td><input value={titles[episode.key] ?? episode.title} onChange={e => setTitles(t => ({ ...t, [episode.key]: e.target.value }))} disabled={running || !!blocked} /></td>
                        <td className="meta">{formatBytes(episode.size)}</td>
                        <td className="state">
                          {blocked ? <span className="vod-import-chip skip" title={blocked}>{badCodec[episode.key] ? `${badCodec[episode.key]} · convert first` : 'Too large'}</span>
                            : !result ? <span className="vod-import-chip">Ready</span>
                            : result.state === 'uploading' ? <span className="vod-import-chip busy">Uploading {result.progress || 0}%</span>
                            : result.state === 'thumbnail' || result.state === 'saving' ? <span className="vod-import-chip busy">{result.message}</span>
                            : result.state === 'saved' ? <span className="vod-import-chip ok">Saved</span>
                            : <span className="vod-import-chip bad" title={result.message}>Failed</span>}
                          {result?.state === 'failed' && <small className="vod-import-error">{result.message}</small>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {alreadyIn.length > 0 && (
            <details className="vod-import-skipped">
              <summary>{alreadyIn.length} already in Peep</summary>
              <ul>{alreadyIn.map(e => <li key={e.key}>{e.extra ? '★' : `S${e.season}E${e.number}`} · {e.name}</li>)}</ul>
            </details>
          )}

          {plan.skipped.length > 0 && (
            <details className="vod-import-skipped">
              <summary>{[rest.length ? `${rest.length} can't be imported` : '', twins.length ? `${twins.length} original${twins.length === 1 ? '' : 's'} already converted` : ''].filter(Boolean).join(' · ')}</summary>
              {rest.length > 0 && <ul>{rest.map(item => <li key={item.key}><strong>{item.name}</strong> — {item.reason}</li>)}</ul>}
              {twins.length > 0 && <p className="vod-import-hint">Safe to delete: {twins.map(c => c.name).join(', ')}.</p>}
            </details>
          )}
        </>
      )}
    </div>
  );
}
