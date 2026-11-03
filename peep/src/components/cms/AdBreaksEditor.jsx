// Per-title ad breaks on the movie and episode forms: the approved times as
// chips, a box to add one ("12:40"), and the break scanner's suggestions with
// one button to accept them. Blank means the Ad rules timing applies.
// Clicking any time plays the few seconds around it, so an admin can check it
// lands on a real scene change before saving.
import { useRef, useState } from "react";
import { supabase } from "../../supabase";
import { SUPABASE_URL } from "../../lib/config";
import { resolveVODPlayback } from "../../lib/vodStorage";
import { parseAdBreaks, parseBreakTime, formatBreakTime } from "../../lib/adBreaks";
import "./AdBreaksEditor.css";

const LEAD = 4, TAIL = 4; // seconds shown before and after a break

export default function AdBreaksEditor({ value, suggested, onChange, videoUrl }) {
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState(null); // { at, src } | { at, error }
  const videoRef = useRef(null);
  const breaks = parseAdBreaks(value);
  const hints = parseAdBreaks(suggested).filter(at => !breaks.includes(at));
  const add = () => {
    const at = parseBreakTime(draft);
    if (at == null) return;
    onChange(parseAdBreaks([...breaks, at]));
    setDraft("");
  };
  async function play(at) {
    if (!videoUrl) return;
    setPreview({ at, loading: true });
    try {
      const src = await resolveVODPlayback(supabase, videoUrl, SUPABASE_URL, 15 * 60);
      setPreview({ at, src });
    } catch (error) { setPreview({ at, error: error.message || "Couldn't load the video." }); }
  }
  const time = (at, label = formatBreakTime(at)) => videoUrl
    ? <button type="button" className="ad-breaks-time" title="Play the seconds around this break" onClick={() => play(at)}>▶ {label}</button>
    : <span>{label}</span>;
  return (
    <div className="ad-breaks">
      <span className="ad-breaks-label">Ad breaks <small>— blank uses the Ad rules timing</small></span>
      <div className="ad-breaks-row">
        {breaks.map(at => (
          <span key={at} className="ad-breaks-chip">{time(at)}
            <button type="button" aria-label={`Remove break at ${formatBreakTime(at)}`} onClick={() => onChange(breaks.filter(b => b !== at))}>×</button>
          </span>
        ))}
        <input value={draft} placeholder="mm:ss" aria-label="Add a break at (minutes:seconds)" onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} disabled={parseBreakTime(draft) == null}>Add</button>
      </div>
      {hints.length > 0 && (
        <div className="ad-breaks-row ad-breaks-suggested">
          <span>Found in the video:</span>
          {hints.map(at => <span key={at} className="ad-breaks-hint">{time(at)}</span>)}
          <button type="button" onClick={() => onChange(parseAdBreaks([...breaks, ...hints]))}>Use these</button>
        </div>
      )}
      {preview && (
        <div className="ad-breaks-preview">
          <div className="ad-breaks-row">
            <span>{preview.loading ? "Loading…" : preview.error || `Around ${formatBreakTime(preview.at)} — the break is the middle of this clip`}</span>
            <button type="button" onClick={() => setPreview(null)}>Close</button>
          </div>
          {preview.src && (
            <video ref={videoRef} src={preview.src} controls autoPlay playsInline
              onLoadedMetadata={e => { e.currentTarget.currentTime = Math.max(0, preview.at - LEAD); }}
              onTimeUpdate={e => { if (e.currentTarget.currentTime > preview.at + TAIL) e.currentTarget.pause(); }} />
          )}
        </div>
      )}
    </div>
  );
}
