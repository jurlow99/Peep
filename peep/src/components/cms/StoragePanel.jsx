import { useState } from "react";
import VODUploadFlow from "./VODUploadFlow";
import SeriesFolderImport from "./SeriesFolderImport";
import VODSourceLibrary from "./VODSourceLibrary";

const MODE_KEY = "peep-addvod-mode";
const MODES = [
  { key: "single", label: "One video", hint: "A movie or a single episode" },
  { key: "folder", label: "Series folder", hint: "A whole show, season by season" },
];
function remembered() { try { return sessionStorage.getItem(MODE_KEY) || "single"; } catch { return "single"; } }

// Add VOD: pick how you're adding content, then one flow at a time. The file
// library (replace a playback file, keep originals) stays tucked away below.
export default function StoragePanel({ showToast, logAudit, videosList, showsList, onVODSaved, onOpenSaved }) {
  const [mode, setMode] = useState(remembered);
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
      {mode === "single"
        ? <VODUploadFlow shows={showsList} categories={categories} showToast={showToast} onSaved={onVODSaved} onOpenSaved={onOpenSaved} />
        : <SeriesFolderImport shows={showsList} showToast={showToast} logAudit={logAudit} onSaved={onVODSaved} />}
      <details className="vod-tools"><summary><span>File library</span><small>Replace a playback file or keep originals · advanced</small></summary><VODSourceLibrary movies={videosList} shows={showsList} showToast={showToast} logAudit={logAudit} /></details>
    </div>
  );
}
