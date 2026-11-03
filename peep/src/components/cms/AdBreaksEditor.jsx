// Per-title ad breaks on the movie and episode forms: the approved times as
// chips, a box to add one ("12:40"), and the break scanner's suggestions with
// one button to accept them. Blank means the Ad rules timing applies.
import { useState } from "react";
import { parseAdBreaks, parseBreakTime, formatBreakTime } from "../../lib/adBreaks";
import "./AdBreaksEditor.css";

export default function AdBreaksEditor({ value, suggested, onChange }) {
  const [draft, setDraft] = useState("");
  const breaks = parseAdBreaks(value);
  const hints = parseAdBreaks(suggested).filter(at => !breaks.includes(at));
  const add = () => {
    const at = parseBreakTime(draft);
    if (at == null) return;
    onChange(parseAdBreaks([...breaks, at]));
    setDraft("");
  };
  return (
    <div className="ad-breaks">
      <span className="ad-breaks-label">Ad breaks <small>— blank uses the Ad rules timing</small></span>
      <div className="ad-breaks-row">
        {breaks.map(at => (
          <span key={at} className="ad-breaks-chip">{formatBreakTime(at)}
            <button type="button" aria-label={`Remove break at ${formatBreakTime(at)}`} onClick={() => onChange(breaks.filter(b => b !== at))}>×</button>
          </span>
        ))}
        <input value={draft} placeholder="12:40" aria-label="Add a break at (minutes:seconds)" onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} disabled={parseBreakTime(draft) == null}>Add</button>
      </div>
      {hints.length > 0 && (
        <div className="ad-breaks-row ad-breaks-suggested">
          <span>Found in the video: {hints.map(formatBreakTime).join(", ")}</span>
          <button type="button" onClick={() => onChange(parseAdBreaks([...breaks, ...hints]))}>Use these</button>
        </div>
      )}
    </div>
  );
}
