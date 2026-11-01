import { useEffect, useState } from 'react';
import { conversionListText, finishConversions, listConversions } from '../../lib/conversionQueue';
import { formatBytes } from '../../lib/uploadProgress';
import './ConversionList.css';

// Add VOD → "To convert": files the importer flagged, with a Copy button so the
// list can be handed over. Rows clear when the importer later sees the MP4 twin.
export default function ConversionList({ showToast, reloadKey = 0 }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    listConversions().then(data => { if (live) { setRows(data); setError(''); } }).catch(e => { if (live) { setError(e.message); setRows([]); } });
    return () => { live = false; };
  }, [reloadKey]);

  async function copy() {
    try { await navigator.clipboard.writeText(conversionListText(rows)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { showToast?.('Could not copy. Select the list and copy it by hand.', 'error'); }
  }
  async function done(row) {
    try { await finishConversions([row.path]); setRows(r => r.filter(x => x.id !== row.id)); }
    catch (e) { showToast?.(e.message, 'error'); }
  }
  async function clearAll() {
    if (!window.confirm(`Clear all ${rows.length} from the list?`)) return;
    try { await finishConversions(rows.map(r => r.path)); setRows([]); }
    catch (e) { showToast?.(e.message, 'error'); }
  }

  if (rows === null || (rows.length === 0 && !error)) return null;
  const bytes = rows.reduce((n, r) => n + (r.bytes || 0), 0);
  return (
    <div className="convert-list">
      <div className="convert-head">
        <div><strong>To convert</strong><small>{rows.length} file{rows.length === 1 ? '' : 's'}{bytes ? ` · ${formatBytes(bytes)}` : ''} · copy this list and hand it over</small></div>
        <div className="convert-actions">
          <button type="button" className="convert-primary" onClick={copy}>{copied ? 'Copied' : 'Copy list'}</button>
          <button type="button" onClick={clearAll}>Clear</button>
        </div>
      </div>
      {error && <p className="convert-error">{error}</p>}
      <ul>
        {rows.map(row => (
          <li key={row.id}>
            <span><strong>{row.name}</strong><small>{row.path.split('/').slice(0, -1).join(' / ') || '—'}{row.reason ? ` · ${row.reason}` : ''}</small></span>
            <button type="button" onClick={() => done(row)} title="Remove from the list">Done</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
