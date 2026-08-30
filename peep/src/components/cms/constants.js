// Horizontal page padding shared by the CMS shell and its panels.
export const PAD = "clamp(24px, 4vw, 64px)";

/** CMS form defaults — shared across content tabs. */
export const EMPTY_ROW = {
  title: "",
  category: "Horror",
  rating: "NR",
  score: "",
  duration: "",
  year: "",
  thumbnail: "",
  poster: "",
  url: "",
  trailer_url: "",
  description: "",
  tags: "",
  is_premium: false,
  visibility_tier: "production",
};

export const EMPTY_SHOW = {
  title: "",
  category: "Horror",
  rating: "NR",
  year: "",
  score: "",
  thumbnail: "",
  poster: "",
  description: "",
  tags: "",
  trailer_url: "",
  is_premium: false,
  visibility_tier: "production",
};

export const EMPTY_EPISODE = {
  show_id: "",
  season: 1,
  episode_number: 1,
  title: "",
  description: "",
  url: "",
  thumbnail: "",
  duration: "",
};

export const EMPTY_CAROUSEL = {
  title: "",
  type: "category",
  filter_value: "",
  content_type: "all",
  layout: "standard",
  enabled: true,
  position: 0,
  pages: "home",
  visibility_tier: "production",
};

export const EMPTY_CHANNEL = {
  name: "",
  slug: "",
  description: "",
  logo_url: "",
  hero_url: "",
  category: "general",
  ingest_type: "hls",
  hls_url: "",
  stream_uid: "",
  is_active: true,
  sort_order: 0,
  is_premium: false,
  tile_size: "normal",
  is_live_hero: false,
  live_feed_id: null,
  visibility_tier: "production",
};

export const EMPTY_LIVE_STREAM = {
  title: "",
  description: "",
  stream_url: "",
  thumbnail: "",
  hero_image: "",
  is_live: true,
  is_hero: false,
};

export const EMPTY_PODCAST = {
  title: "",
  host: "",
  description: "",
  artwork_url: "",
  link_url: "",
  episode_count: "",
  tags: "",
  enabled: true,
  visibility_tier: "production",
};

export const EMPTY_PODCAST_EPISODE = {
  podcast_id: "",
  episode_number: 1,
  title: "",
  description: "",
  audio_url: "",
  duration: "",
  published_at: "",
  thumbnail: "",
};

export const CMS_TABS = [
  { key: "content", labelKey: "content", color: "#4f46e5" },
  { key: "live", labelKey: "live", color: "#ef4444" },
  { key: "creators", label: "Partners", color: "#f97316" },
  { key: "members", label: "Members", color: "#818cf8" },
  { key: "analytics", label: "Analytics", color: "#34d399" },
  { key: "storage", label: "Storage", color: "#22d3ee" },
  { key: "settings", label: "Settings", color: "#facc15" },
  { key: "security", label: "Security", color: "#f87171" },
];
