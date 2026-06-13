/** Content types that use UUID primary keys (never parseInt). */
export const UUID_CONTENT_TYPES = new Set([
  "movie",
  "short",
  "song",
  "album",
]);

/** Normalize legacy "movie" ↔ "short" naming. */
export function normalizeContentType(type: string): string {
  if (type === "short") return "movie";
  if (type === "movie") return "movie";
  return type;
}

/** Parse a content ID for DB queries — preserves UUIDs, parses bigint types. */
export function parseContentId(type: string, id: string | number): string | number {
  const t = normalizeContentType(type);
  if (UUID_CONTENT_TYPES.has(t)) return String(id);
  const n = typeof id === "number" ? id : parseInt(String(id), 10);
  return Number.isNaN(n) ? String(id) : n;
}

/** Stable map key for myList / watch_progress lookups. */
export function contentKey(type: string, id: string | number): string {
  return `${normalizeContentType(type)}_${id}`;
}

/** Fields safe to fetch for browse grids (no playback URLs). */
export const VIDEO_BROWSE_SELECT =
  "id, title, category, tags, year, score, rating, thumbnail, poster, duration, description, trailer_url, featured";

/** Full video row including playback URL — use only when starting playback. */
export const VIDEO_PLAY_SELECT = "*";

export const EPISODE_BROWSE_SELECT =
  "id, show_id, season, episode_number, title, description, thumbnail, duration, status";

export const EPISODE_PLAY_SELECT = "*";
