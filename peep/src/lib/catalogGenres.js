// Match complete genre names, never substrings (Comedy must not match Dark Comedy).
export function matchesCatalogGenre(item, value) {
  const normalize = v => typeof v === 'string' ? v.trim().toLowerCase() : '';
  const genre = normalize(value);
  if (!genre) return false;
  let tags = item.tags;
  if (typeof tags === 'string') {
    try { tags = JSON.parse(tags); } catch { tags = tags.split(','); }
  }
  return [item.category, ...(Array.isArray(tags) ? tags : [])].some(v => normalize(v) === genre);
}
