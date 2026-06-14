import { VIDEO_BROWSE_SELECT, VIDEO_PLAY_SELECT, EPISODE_BROWSE_SELECT, EPISODE_PLAY_SELECT } from "./contentIds";

/** Supabase select strings — browse queries omit playback URLs for non-player views. */
export const contentSelect = {
  videosBrowse: VIDEO_BROWSE_SELECT,
  videosPlay: VIDEO_PLAY_SELECT,
  episodesBrowse: EPISODE_BROWSE_SELECT,
  episodesPlay: EPISODE_PLAY_SELECT,
  shows: "id, title, category, tags, year, score, rating, thumbnail, poster, description, trailer_url",
  podcasts: "id, title, host, description, artwork_url, link_url, episode_count, tags, enabled",
  liveStreams: "id, channel_name, username, title, description, thumbnail, hero_image, is_live, is_hero, stream_uid",
} as const;
