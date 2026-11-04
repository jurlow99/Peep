// Pure helpers for Reports → Overview, Channels and MOU: reporting windows,
// period-over-period change, number formats and CSV export. The numbers come from
// the platform_report / channel_report / mou_report RPCs (db/features/reporting.sql).

export const PERIODS = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
];

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// A period key → { from, to } as Dates in the viewer's local time. Rolling periods
// end now and start at local midnight so every day in the chart is whole.
export function periodRange(key, now = new Date()) {
  const days = { '7d': 7, '30d': 30, '90d': 90 }[key];
  if (days) return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)), to: now };
  if (key === 'this_month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (key === 'last_month') return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
  throw new Error(`Unknown period ${key}`);
}

// "2026-10" → the whole calendar month in local time.
export function monthRange(month) {
  const [year, m] = String(month).split('-').map(Number);
  if (!year || !m || m < 1 || m > 12) throw new Error('Invalid month');
  return { from: new Date(year, m - 1, 1), to: new Date(year, m, 1) };
}

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function localTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

// Percent change vs the previous period; null when there's nothing to compare to.
export function change(current, previous) {
  const c = Number(current || 0), p = Number(previous || 0);
  if (!p) return null;
  return Math.round((c - p) / p * 100);
}

export const formatNumber = n => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

// Minutes → "45 min", "12.5 h", "1,204 h" for tiles; tables show raw minutes.
export function formatDuration(minutes) {
  const m = Number(minutes || 0);
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  return `${h.toLocaleString(undefined, { maximumFractionDigits: h < 100 ? 1 : 0 })} h`;
}

export function hourLabel(hour) {
  if (hour === null || hour === undefined) return '—';
  const h = Number(hour) % 24;
  return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
}

export const PLATFORM_LABELS = { tvos: 'Apple TV', web: 'Browser', mobile_web: 'Mobile browser' };
export const KIND_LABELS = { channel: 'Channel', movie: 'Movie', series: 'Series' };

// rows + [{ key, label, value? }] → CSV text (RFC 4180 quoting, CRLF lines).
export function toCSV(rows, columns) {
  const cell = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(c => cell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map(c => cell(c.value ? c.value(row) : row[c.key])).join(','));
  return lines.join('\r\n') + '\r\n';
}

export function downloadCSV(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Fill the days a report has no plays on, so the daily chart has no gaps.
export function fillDays(daily, from, to) {
  const byDay = new Map((daily || []).map(d => [d.day, d]));
  const out = [];
  for (let d = startOfDay(from); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push(byDay.get(key) || { day: key });
  }
  return out;
}
