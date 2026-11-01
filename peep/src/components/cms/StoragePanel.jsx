import { useState } from "react";
import VODUploadFlow from "./VODUploadFlow";
import SeriesFolderImport from "./SeriesFolderImport";
import ConversionList from "./ConversionList";

const MODE_KEY = "peep-addvod-mode";
const MODES = [
  { key: "single", label: "One video", hint: "A movie or a single episode" },
  { key: "folder", label: "Series folder", hint: "A whole show, season by season" },
  { key: "series", label: "Add to a series", hint: "Pick the show, then upload or import there" },
];
function remembered() { try { return sessionStorage.getItem(MODE_KEY) || "single"; } catch { return "single"; } }

// Add VOD: pick how you're adding content, then one flow at a time. The file
// library (replace a playback file, keep originals) stays tucked away below.
export default function StoragePanel({ showToast, logAudit, videosList, showsList, onVODSaved, onOpenSaved }) {
  const [mode, setMode] = useState(remembered);
  const [queueVersion, setQueueVersion] = useState(0);
  const [pickedShow, setPickedShow] = useState("");
  const bumpQueue = () => setQueueVersion(v => v + 1);
  // Existing categories feed the Add VOD suggestions so spelling stays consistent across titles.
  const categories = [...new Set([...(videosList || []), ...(showsList || [])].map(item => item.category?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  function choose(next) { setMode(next); try { sessionStorage.setItem(MODE_KEY, next); } catch { /* fine without */ } }

  return (
    <div className="vod-workspace">
      <div className="vod-mode" role="tablist" aria-label="What are you adding?">
        {MODES.map(m => (
          <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} className={mode === m.key ? "on" : ""} onClick={() => choose(m.key)}>
            <strong>{m.label}</strong><small>{m.hint}</small>
          </button>
        ))}
      </div>
      <ConversionList showToast={showToast} reloadKey={queueVersion} />
      {mode === "single" && <VODUploadFlow shows={showsList} categories={categories} showToast={showToast} onSaved={onVODSaved} onOpenSaved={onOpenSaved} />}
      {mode === "folder" && <SeriesFolderImport shows={showsList} showToast={showToast} logAudit={logAudit} onSaved={onVODSaved} onQueueChanged={bumpQueue} />}
      {mode === "series" && (
        <div className="vod-series-pick">
          <h3>Which series?</h3>
          <p>You'll land on its page, where you can upload one episode or import a season folder.</p>
          <div className="vod-series-pick-row">
            <select value={pickedShow} onChange={e => setPickedShow(e.target.value)}>
              <option value="">Choose a series…</option>
              {[...(showsList || [])].sort((a, b) => String(a.title).localeCompare(String(b.title))).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <button type="button" className="vod-import-start" disabled={!pickedShow} onClick={() => onOpenSaved?.({ type: "episode", show_id: Number(pickedShow) })}>Open series</button>
          </div>
          <small>Not there yet? Use <button type="button" className="vod-link" onClick={() => choose("folder")}>Series folder</button> to create it from a folder, or <button type="button" className="vod-link" onClick={() => choose("single")}>One video</button> to start it with one episode.</small>
        </div>
      )}
    </div>
  );
}
