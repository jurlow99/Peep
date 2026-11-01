// Turns a picked folder (Show / Season N / SxxEyy Title.mp4) into an import plan
// the admin can review before anything uploads. Pure functions, no I/O.
export const SUPPORTED_EXTENSIONS = ['mp4', 'm4v'];

const SEASON_FOLDER = /^(?:season|series|s)\s*0*(\d{1,3})$/i;
const CODES = [
  /\bS(\d{1,2})\s*[._ -]?\s*E(\d{1,3})\b/i,     // S02E01, s2e1, S02 E01
  /\b(\d{1,2})x(\d{1,3})\b/i,                    // 2x01
  /\b(?:episode|ep)\.?\s*0*(\d{1,3})\b/i,        // Episode 3, Ep. 3
  /^0*(\d{1,3})(?=[\s._-])/,                     // "03 - Title"
];

export function parseSeasonFolder(name) {
  const match = String(name || '').trim().match(SEASON_FOLDER);
  return match ? Number(match[1]) : null;
}

export function extensionOf(name) {
  const match = String(name || '').match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

const EXTRA = /\b(trailer|teaser|promo|preview|sneak peek|behind the scenes|bloopers?|recap)\b/i;
export function isExtra(name) { return EXTRA.test(String(name || '').replace(/\.[a-z0-9]+$/i, '')); }

// Episode number (and season when the name carries one) plus a clean title.
// `confidence` is the pattern index: S01E02 beats "Episode 2" beats "02 - Title".
export function parseEpisodeFile(name) {
  const base = String(name || '').replace(/\.[a-z0-9]+$/i, '');
  for (let index = 0; index < CODES.length; index++) {
    const match = base.match(CODES[index]);
    if (!match) continue;
    const season = index < 2 ? Number(match[1]) : null;
    const episode = Number(index < 2 ? match[2] : match[1]);
    const title = tidyTitle(base.replace(match[0], ' '));
    return { season, episode, title: title || `Episode ${episode}`, confidence: index };
  }
  return null;
}

function tidyTitle(text) {
  return text.replace(/[._]+/g, ' ').replace(/\s*[-–:]+\s*/g, m => (m.trim() === '' ? ' ' : ' ')).replace(/\s{2,}/g, ' ').trim()
    .replace(/^[-–:\s]+|[-–:\s]+$/g, '');
}

const EXISTS = 'exists', READY = 'ready', UNSUPPORTED = 'unsupported', UNRECOGNIZED = 'unrecognized';
export const STATUS = { READY, EXISTS, UNSUPPORTED, UNRECOGNIZED };

function normalTitle(title) { return String(title || '').trim().toLowerCase().replace(/\s+/g, ' '); }

// files: [{ name, size, path }] where path is the browser's webkitRelativePath.
// existingShows: [{ id, title, poster, episodes?: [{ season, episode_number }] }]
export function planSeriesImport(files, existingShows = []) {
  const items = [];
  let showTitle = '';
  for (const file of files || []) {
    const segments = String(file.path || file.name).split('/').filter(Boolean);
    if (segments.length > 1 && !showTitle) showTitle = segments[0];
    const name = segments[segments.length - 1];
    if (name.startsWith('.')) continue; // .DS_Store and friends
    const folderSeason = segments.length > 2 ? parseSeasonFolder(segments[segments.length - 2]) : null;
    const parsed = parseEpisodeFile(name);
    const extension = extensionOf(name);
    const base = { key: segments.join('/'), file, name, size: file.size || 0, folder: segments.slice(0, -1).join('/') };
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      items.push({ ...base, status: UNSUPPORTED, reason: extension ? `.${extension} can't be played by Peep. Convert it to an H.264 MP4 first.` : 'Not a video file.' });
      continue;
    }
    if (isExtra(name)) {
      items.push({ ...base, status: UNRECOGNIZED, reason: 'Looks like a trailer or extra, not an episode. Add it from the series page instead.' });
      continue;
    }
    if (!parsed) {
      items.push({ ...base, status: UNRECOGNIZED, reason: 'No episode number in the name (expects S01E02, 1x02, Episode 2 or "02 - Title").' });
      continue;
    }
    items.push({ ...base, status: READY, season: parsed.season ?? folderSeason ?? 1, number: parsed.episode, title: parsed.title, confidence: parsed.confidence });
  }
  // An original next to its converted MP4 twin is explained, not nagged about.
  const playable = new Set(items.filter(i => i.status !== UNSUPPORTED).map(i => i.key.replace(/\.[a-z0-9]+$/i, '').toLowerCase()));
  for (const item of items) {
    if (item.status === UNSUPPORTED && playable.has(item.key.replace(/\.[a-z0-9]+$/i, '').toLowerCase())) {
      item.reason = `Original file — the MP4 version next to it is used instead. Safe to delete.`;
      item.converted = true;
    }
  }
  showTitle = tidyTitle(showTitle) || tidyTitle(items[0]?.folder.split('/')[0] || '');
  const show = existingShows.find(candidate => normalTitle(candidate.title) === normalTitle(showTitle)) || null;
  const taken = new Set((show?.episodes || []).map(e => `${e.season}x${e.episode_number}`));
  // A slot goes to the file that names it most explicitly; the loser is reported, not guessed about.
  const claims = {};
  for (const item of items) {
    if (item.status !== READY) continue;
    const slot = `${item.season}x${item.number}`;
    if (taken.has(slot)) { item.status = EXISTS; item.reason = 'This season and episode number is already in Peep.'; continue; }
    const holder = claims[slot];
    if (!holder) { claims[slot] = item; continue; }
    const loser = item.confidence < holder.confidence ? holder : item;
    const winner = loser === item ? holder : item;
    claims[slot] = winner;
    loser.status = UNRECOGNIZED; loser.reason = `"${winner.name}" is already S${item.season}E${item.number}.`;
  }
  const episodes = items.filter(i => i.status === READY || i.status === EXISTS).sort((a, b) => a.season - b.season || a.number - b.number);
  const skipped = items.filter(i => i.status === UNSUPPORTED || i.status === UNRECOGNIZED).sort((a, b) => a.key.localeCompare(b.key));
  const seasons = [...new Set(episodes.map(e => e.season))].sort((a, b) => a - b);
  return {
    showTitle, show, episodes, skipped, seasons,
    ready: episodes.filter(e => e.status === READY).length,
    bytes: episodes.filter(e => e.status === READY).reduce((n, e) => n + e.size, 0),
  };
}
