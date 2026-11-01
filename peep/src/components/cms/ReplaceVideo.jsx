import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { r2VODRequest } from '../../lib/r2VOD';
import { uploadToInbox } from '../../lib/inboxUpload';
import { detectMP4VideoCodec, mp4CodecProblem } from '../../lib/mp4Codec';
import { readVideoMetadata } from '../../lib/videoThumbnail';
import { formatDuration } from '../../lib/uploadProgress';
import './ReplaceVideo.css';

let r2Status = null;
const r2Configured = () => (r2Status ||= r2VODRequest('status').then(d => !!d.configured).catch(() => false));

// Swap the video file behind an existing movie or episode. Same private upload
// as Add VOD, then one RPC flips the playback link; viewers get the new file next play.
export default function ReplaceVideo({ type, id, title, onReplaced, showToast, logAudit, compact = false, disabled = false }) {
  const [state, setState] = useState('');     // '' | 'uploading' | 'saving'
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const input = useRef(null), task = useRef(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; task.current?.abort?.(); }; }, []);

  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (!/\.mp4$/i.test(file.name)) { setError('Choose a finished MP4.'); return; }
    const problem = mp4CodecProblem(await detectMP4VideoCodec(file).catch(() => null));
    if (problem) { setError(problem); return; }
    if (!window.confirm(`Replace the video for “${title || 'this title'}” with ${file.name}? Viewers get the new file the next time they play it.`)) return;
    setState('uploading'); setProgress(0);
    try {
      const r2Ready = await r2Configured();
      const upload = await uploadToInbox({ file, r2Ready, onTask: t => { task.current = t; }, onProgress: p => { if (alive.current) setProgress(p); } });
      if (!alive.current) return;
      setState('saving');
      const { data, error: rpcError } = await supabase.rpc('replace_vod_file', { p_type: type, p_id: String(id), p_upload_id: upload.id, p_path: upload.path, p_storage_provider: upload.provider });
      if (rpcError) throw rpcError;
      let duration = '';
      const local = URL.createObjectURL(file);
      try { const info = await readVideoMetadata(local); duration = formatDuration(info?.duration); } catch { /* optional */ } finally { URL.revokeObjectURL(local); }
      logAudit?.('update', type, id, `replaced video with ${file.name}`);
      showToast?.('Video replaced.');
      onReplaced?.({ url: data?.url, duration, file });
    } catch (e) {
      if (alive.current) setError(e?.message || 'Replace failed. The old video is still in place.');
    } finally {
      task.current = null;
      if (alive.current) setState('');
    }
  }

  const label = state === 'uploading' ? `Uploading ${progress}%` : state === 'saving' ? 'Swapping…' : compact ? 'Replace' : 'Replace video';
  return (
    <span className={`replace-video${compact ? ' compact' : ''}`}>
      <input ref={input} type="file" accept=".mp4,video/mp4" onChange={choose} hidden />
      <button type="button" disabled={disabled || !!state} onClick={() => input.current?.click()} title="Upload a new MP4 for this title">{label}</button>
      {state === 'uploading' && <button type="button" className="replace-video-cancel" onClick={() => task.current?.abort?.(true)}>Cancel</button>}
      {error && <small className="replace-video-error" role="alert">{error}</small>}
    </span>
  );
}
