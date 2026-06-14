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
  enabled: true,
  position: 0,
  pages: "home",
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
