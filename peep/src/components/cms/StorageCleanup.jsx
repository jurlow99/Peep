import { useState } from 'react';
import { r2VODRequest } from '../../lib/r2VOD';
import { formatBytes } from '../../lib/uploadProgress';
import './StorageCleanup.css';

// Files in R2 / Supabase Storage that nothing in the catalog points at
// (replaced videos, abandoned uploads, re-imports). Scan, review, delete.
export default function StorageCleanup({ showToast, logAudit }) {
  const [scan, setScan] = useState(null);     // { r2, storage, bytes }
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  async function find() {
    setBusy('scan'); setError('');
    try { setScan(await r2VODRequest('cleanup', { mode: 'scan' })); setOpen(true); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }

  async function remove() {
    const count = scan.r2.length + scan.storage.length;
    if (!window.confirm(`Delete ${count} unused file${count === 1 ? '' : 's'} (${formatBytes(scan.bytes)})? They are not referenced by any movie, episode, trailer, hero or delivery.`)) return;
    setBusy('delete'); setError('');
    try {
      const result = await r2VODRequest('cleanup', { mode: 'delete', r2: scan.r2.map(f => f.id), storage: scan.storage.map(f => ({ bucket: f.bucket, path: f.path })) });
      logAudit?.('delete', 'storage', null, `cleanup removed ${result.deleted} files, ${formatBytes(result.freed)}`);
      showToast?.(result.failed?.length ? `Deleted ${result.deleted}, ${result.failed.length} could not be removed` : `Deleted ${result.deleted} file${result.deleted === 1 ? '' : 's'} · ${formatBytes(result.freed)} freed`, result.failed?.length ? 'error' : undefined);
      setScan(await r2VODRequest('cleanup', { mode: 'scan' }));
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }

  const files = scan ? [...scan.r2.map(f => ({ key: f.id, where: 'R2', path: f.path, bytes: f.bytes, note: f.state === 'uploading' ? 'abandoned upload' : '' })), ...scan.storage.map(f => ({ key: `${f.bucket}/${f.path}`, where: f.bucket, path: f.path, bytes: f.bytes, note: '' }))] : [];
  const name = path => path.split('/').pop();

  return (
    <div className="cleanup">
      <div className="cleanup-head">
        <div><strong>Storage clean-up</strong><small>{scan ? (files.length ? `${files.length} unused file${files.length === 1 ? '' : 's'} · ${formatBytes(scan.bytes)}` : 'Nothing unused. Storage is tidy.') : 'Replaced videos and abandoned uploads pile up quietly.'}</small></div>
        <div className="cleanup-actions">
          <button type="button" onClick={find} disabled={!!busy}>{busy === 'scan' ? 'Checking…' : scan ? 'Check again' : 'Find unused files'}</button>
          {files.length > 0 && <button type="button" className="cleanup-danger" onClick={remove} disabled={!!busy}>{busy === 'delete' ? 'Deleting…' : `Delete ${files.length} · ${formatBytes(scan.bytes)}`}</button>}
        </div>
      </div>
      {error && <p className="cleanup-error" role="alert">{error}</p>}
      {files.length > 0 && (
        <details className="cleanup-list" open={open} onToggle={e => setOpen(e.target.open)}>
          <summary>What will be deleted</summary>
          <ul>{files.map(f => <li key={f.key}><span>{name(f.path)}</span><small>{f.where}{f.note ? ` · ${f.note}` : ''} · {formatBytes(f.bytes)}</small></li>)}</ul>
        </details>
      )}
    </div>
  );
}
