export function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(t => t.toLowerCase().trim()).filter(Boolean);
  return String(tags).split(",").map(t => t.toLowerCase().trim()).filter(Boolean);
}

function computeSimilarity(source, candidate) {
  let pts = 0;

  if (source.category && candidate.category && source.category === candidate.category) pts += 40;

  const srcTags = normalizeTags(source.tags);
  const candTags = normalizeTags(candidate.tags);
  if (srcTags.length && candTags.length) {
    const shared = srcTags.filter(t => candTags.includes(t)).length;
    pts += shared * 15;
  }

  if (source.year && candidate.year) {
    const diff = Math.abs(Number(source.year) - Number(candidate.year));
    if (diff <= 5) pts += 10;
    else if (diff <= 15) pts += 6;
    else if (diff <= 30) pts += 2;
  }

  if (source.rating && candidate.rating && source.rating === candidate.rating) pts += 8;

  if (source.score && candidate.score) {
    const diff = Math.abs(Number(source.score) - Number(candidate.score));
    if (diff <= 5) pts += 5;
    else if (diff <= 15) pts += 3;
  }

  return pts;
}

export function rankRelated(source, pool, limit = 12) {
  return pool
    .map(item => ({ item, pts: computeSimilarity(source, item) }))
    .filter(({ pts }) => pts > 0)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, limit)
    .map(({ item }) => item);
}
