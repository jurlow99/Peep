export function parseIMDbID(value) {
  const input = String(value || '').trim();
  if (/^tt\d{7,12}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !['imdb.com','www.imdb.com','m.imdb.com'].includes(url.hostname)) return null;
    return url.pathname.match(/^\/title\/(tt\d{7,12})(?:\/|$)/)?.[1] || null;
  } catch { return null; }
}
export function metadataFields(data, type) {
  const allowed = type === 'episode' ? ['title','description','duration'] : type === 'series' ? ['title','description','year','tags'] : ['title','description','year','duration','tags'];
  return Object.fromEntries(allowed.filter(key => typeof data?.[key] === 'string' && data[key].trim() && data[key] !== 'N/A').map(key => [key,data[key].trim()]));
}
