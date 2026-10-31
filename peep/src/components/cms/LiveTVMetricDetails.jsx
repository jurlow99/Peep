import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { liveMetricDetails, queryLiveViewingDetails } from '../../lib/liveViewingDetails';
const platforms = { tvos: 'Apple TV', web: 'Browser', mobile_web: 'Mobile browser' };
const minutes = value => (Number(value || 0) / 60).toLocaleString(undefined, { maximumFractionDigits: 2 });
const date = value => new Date(value).toLocaleString();
export default function LiveTVMetricDetails({ metric, days, value, onClose, includeTests = false }) {
  const definition = liveMetricDetails[metric];
  const heading = useRef(null);
  const [page, setPage] = useState(0);
  const [platform, setPlatform] = useState('');
  const [device, setDevice] = useState('');
  const [mode, setMode] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({ rows: [], count: 0, loading: true, error: '' });
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setResult(previous => ({ ...previous, loading: true, error: '' }));
      try {
        const now = Date.now();
        const response = await queryLiveViewingDetails(supabase, { metric, since: new Date(now - days * 86400000).toISOString(), now, page, platform, mode, device, includeTests });
        if (!active) return;
        if (response.error) throw response.error;
        if (page > 0 && page * 25 >= (response.count || 0)) {
          setPage(Math.max(0, Math.ceil((response.count || 0) / 25) - 1));
          return;
        }
        setResult({ rows: response.data || [], count: response.count || 0, loading: false, error: '', now });
      } catch (error) {
        if (active) setResult({ rows: [], count: 0, loading: false, error: error.message || 'Please try again.' });
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [metric, days, page, platform, mode, device, includeTests, revision]);
  return <section aria-label={`${definition.title} details`} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: 20, marginBottom: 24, background: '#f8fafc' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <h3 ref={heading} tabIndex={-1} style={{ margin: 0 }}>{definition.title} · {Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</h3>
      <button type="button" onClick={onClose} style={{ marginLeft: 'auto' }}>Close details</button>
    </div>
    <p style={{ color: '#475569', fontSize: 13 }}>{definition.description}</p>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <select aria-label="Filter viewing details by platform" value={platform} onChange={e => { setPlatform(e.target.value); setPage(0); }}>
        <option value="">All platforms</option>{Object.entries(platforms).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <select aria-label="Filter viewing details by playback mode" value={mode} onChange={e => { setMode(e.target.value); setPage(0); }}>
        <option value="">All playback modes</option><option value="single">Single channel</option><option value="multiview">Multiview</option>
      </select>
      {device && <button type="button" title={device} onClick={() => { setDevice(''); setPage(0); }}>Device {device.slice(0, 8)} · Clear filter ×</button>}
      <button type="button" disabled={result.loading} onClick={() => setRevision(revision + 1)}>Refresh details</button>
      <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>{definition.live ? 'Active in the last 45 seconds · all start dates' : `Sessions started in the last ${days === 1 ? '24 hours' : `${days} days`}`} · times shown in your local timezone</span>
    </div>
    {result.error ? <p role="alert">Couldn’t load viewing details: {result.error} <button type="button" onClick={() => setRevision(revision + 1)}>Retry</button></p>
      : result.loading ? <p role="status">Loading playback records…</p>
      : result.rows.length === 0 ? <p>No {definition.live ? 'active streams' : 'sessions'} match these filters.</p>
      : <div style={{ overflow: 'auto', maxHeight: 440 }}><table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr>{['Channel', 'Device', 'Platform', 'Mode', 'Started', 'Last activity', 'Watched minutes', 'Status'].map(label => <th key={label} scope="col" style={{ padding: 10, position: 'sticky', top: 0, background: '#f8fafc' }}>{label}</th>)}</tr></thead>
        <tbody>{result.rows.map(row => <tr key={row.id} style={{ borderTop: '1px solid #e2e8f0' }}>
          <td style={{ padding: 10 }}>{row.channel_name}</td><td><button type="button" title={row.device_id} aria-label={`Show sessions for device ${row.device_id}`} onClick={() => { setDevice(row.device_id); setPage(0); }}><code>{row.device_id.slice(0, 8)}…</code></button></td>
          <td>{platforms[row.platform] || row.platform}{row.is_test && <span> · Simulator test</span>}</td><td>{row.mode === 'multiview' ? 'Multiview' : 'Single channel'}</td>
          <td>{date(row.started_at)}</td><td>{date(row.last_ping)}</td><td>{minutes(row.watched_seconds)}</td>
          <td>{row.ended_at ? 'Ended' : new Date(row.last_ping).getTime() > result.now - 45000 ? 'Active' : 'Inactive'}</td>
        </tr>)}</tbody>
      </table></div>}
    {!result.loading && !result.error && <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
      <span>{result.count ? `${page * 25 + 1}–${Math.min((page + 1) * 25, result.count)} of ${result.count} channel sessions` : '0 channel sessions'}</span>
      <button type="button" disabled={(page + 1) * 25 >= result.count} onClick={() => setPage(page + 1)}>Next</button>
    </div>}
    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 0 }}>Filters apply to the records below; the headline remains the dashboard total. Details refresh every 30 seconds. Click a device to see its sessions. Device IDs are anonymous; no account information is shown.</p>
  </section>;
}
