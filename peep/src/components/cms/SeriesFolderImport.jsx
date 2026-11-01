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
  const stop = useRef(false), current = useRef(null), alive = useRef(true);

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
    setPlan(next); setTitles({}); setResults({}); setShowTitle(next.showTitle); setPoster(next.show?.poster || ''); setShowID(next.show ? String(next.show.id) : '');
    if (!next.ready) showToast?.(next.episodes.length ? 'Everything in that folder is already in Peep.' : 'No importable episodes found in that folder.');
  }

  const limit = r2Ready ? R2_VOD_LIMIT : VOD_SOURCE_LIMIT;
  const tooBig = plan ? plan.episodes.filter(e => e.status === STATUS.READY && e.size > limit) : [];
  const needsPoster = plan && !plan.show && !poster;
  const queue = plan ? plan.episodes.filter(e => e.status === STATUS.READY && e.size <= limit) : [];
  const done = Object.values(results).filter(r => r.state === 'saved').length;
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
    plan.skipped.length ? `${plan.skipped.length} file${plan.skipped.length === 1 ? '' : 's'} skipped` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="vod-import">
      <div className="vod-import-head">
        <div>
          <h3>Import a series folder</h3>
          <p>Pick the show's top folder (e.g. <code>The Big Lez Show</code>) with <code>Season 1</code>, <code>Season 2</code>… inside and files named <code>S01E02 Title.mp4</code>. Everything uploads to {r2Ready ? 'R2' : 'Supabase'} and lands in Episodes, approved, one file at a time. Keep this tab open until it finishes. Files named trailer, teaser or bloopers go on the series' Extras shelf, and the first trailer becomes the series trailer. Pick the same folder again later and only new files show up — anything already in Peep is left alone.</p>
        </div>
        <label className="vod-import-pick">
          <input type="file" webkitdirectory="" directory="" multiple onChange={choose} disabled={running} />
          <span>{plan ? 'Pick a folder again' : 'Choose folder…'}</span>
        </label>
      </div>

      {plan && (
        <>
          <div className="vod-import-grid">
            <label>Series title
              <input value={showTitle} onChange={e => setShowTitle(e.target.value)} disabled={!!plan.show || running} />
              <small>{plan.show ? `Adds to the existing series "${plan.show.title}".` : 'A new series will be created with this title.'}</small>
            </label>
            <label>Visibility
              <select value={tier} onChange={e => setTier(e.target.value)} disabled={running}>
                <option value="production">Production — viewers can see it</option>
                <option value="test">Test — admin only</option>
              </select>
            </label>
            <label className="vod-import-check"><input type="checkbox" checked={premium} onChange={e => setPremium(e.target.checked)} disabled={running} /> Premium episodes</label>
            <label className="vod-import-check"><input type="checkbox" checked={grabThumbs} onChange={e => setGrabThumbs(e.target.checked)} disabled={running} /> Grab a thumbnail from each episode</label>
          </div>
          {!plan.show && (
            <div className="vod-import-poster">
              <span className="vod-import-label">SERIES POSTER (required for a new series)</span>
              {poster ? <div className="vod-import-poster-row"><img src={poster} alt="" /><button type="button" onClick={() => setPoster('')} disabled={running}>Replace</button></div>
                : <ImageUploader label="Upload poster" folder={artworkFolder('posters')} bucket={artworkBucket} appearance="light" onUploadSuccess={url => setPoster(url)} onError={m => showToast?.(m, 'error')} />}
            </div>
          )}

          <p className="vod-import-summary"><strong>{summary}</strong></p>

          {alreadyIn.length > 0 && (
            <details className="vod-import-skipped">
              <summary>{alreadyIn.length} episode{alreadyIn.length === 1 ? ' is' : 's are'} already in Peep and will be left alone</summary>
              <ul>{alreadyIn.map(e => <li key={e.key}>S{e.season}E{e.number} · {e.name}</li>)}</ul>
            </details>
          )}

          {!plan.ready && !plan.extras && !tooBig.length && <p className="vod-import-hint" style={{ marginTop: 14 }}>Nothing new to import from this folder.</p>}

          {newSeasons.map(season => (
            <div key={season} className="vod-import-season">
              <h4>{seasonLabel(season)}</h4>
              <table>
                <tbody>
                  {plan.episodes.filter(e => e.season === season && e.status !== STATUS.EXISTS).map(episode => {
                    const result = results[episode.key];
                    const blocked = episode.size > limit ? 'Too large for this storage.' : '';
                    return (
                      <tr key={episode.key} className={blocked ? 'blocked' : ''}>
                        <td className="num">{episode.extra ? '★' : `E${episode.number}`}</td>
                        <td><input value={titles[episode.key] ?? episode.title} onChange={e => setTitles(t => ({ ...t, [episode.key]: e.target.value }))} disabled={running || !!blocked} /><small>{episode.name} · {formatBytes(episode.size)}</small></td>
                        <td className="state">
                          {blocked ? <span className="vod-import-chip skip">Too large</span>
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

          {plan.skipped.length > 0 && (() => {
            const converted = plan.skipped.filter(s => s.converted), rest = plan.skipped.filter(s => !s.converted);
            return (
              <details className="vod-import-skipped">
                <summary>{rest.length ? `${rest.length} file${rest.length === 1 ? '' : 's'} won't be imported` : 'Nothing else to import'}{converted.length ? ` · ${converted.length} original${converted.length === 1 ? '' : 's'} already converted to MP4` : ''}</summary>
                {rest.length > 0 && <ul>{rest.map(item => <li key={item.key}><strong>{item.key}</strong> — {item.reason}</li>)}</ul>}
                {converted.length > 0 && <p className="vod-import-hint">Originals that already have an MP4 twin in the folder (safe to delete): {converted.map(c => c.name).join(', ')}.</p>}
              </details>
            );
          })()}

          <div className="vod-import-actions">
            {!running ? (
              <button type="button" className="vod-import-start" onClick={run} disabled={!queue.length || needsPoster}>
                {done ? `Import remaining (${queue.length - done})` : `Import ${queue.length} episode${queue.length === 1 ? '' : 's'}`}
              </button>
            ) : <button type="button" onClick={cancel}>Stop after this file</button>}
            {needsPoster && <span className="vod-import-hint">Add a poster for the new series first.</span>}
            {(done > 0 || failed > 0) && <span className="vod-import-hint">{done} saved{failed ? `, ${failed} failed` : ''}</span>}
          </div>
        </>
      )}
    </div>
  );
}
