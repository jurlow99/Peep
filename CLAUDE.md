# Peep — Codebase Guide

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, hls.js, tus-js-client |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Video delivery | Cloudflare Stream (live + VODs + transcoded uploads) |
| Payments | Stripe |
| Hosting | Cloudflare Pages |

## Routing

No React Router. `peep/src/main.jsx` does manual path matching:

```
/admin              → AdminPage
/signup /signin     → AuthPages
/set-password       → SetPasswordPage
/streamer-signin    → StreamerSignInPage
/apply-to-stream    → ApplyToStreamPage
/streamer           → StreamerDashboard
/stream/<slug>      → StreamerProfile
*                   → App (main SPA)
```

The main SPA (`App.jsx`) uses `page` state to switch between views (home, player, show, profile, etc.) and `activeNav` state for the nav tabs (Home, Movies, Series, Streams, Podcasts, My List).

## Key Files

| File | Purpose |
|---|---|
| `peep/src/App.jsx` | Main SPA shell — auth gates, page routing, detail views |
| `peep/src/main.jsx` | Entry point — path-based route dispatch + BrowserRouter |
| `peep/src/components/browse/Homepage.jsx` | Browse home + nav tabs |
| `peep/src/components/player/PlayerView.jsx` | Video player |
| `peep/src/pages/SettingsPage.jsx` | Account settings + billing |
| `peep/src/hooks/` | useAuth, useSubscription, useMyList (TanStack Query) |
| `peep/src/lib/` | contentIds, theme, auth helpers (TypeScript) |
| `peep/src/components/CMS.jsx` | Admin CMS — all content management |
| `peep/src/pages/StreamerProfile.jsx` | Public streamer page — live player, chat, VODs |
| `peep/src/pages/StreamerDashboard.jsx` | Streamer portal — go live, analytics, VOD manager |
| `peep/src/pages/LiveTV.jsx` | Streams tab — channel grid, follow, viewer counts |
| `peep/src/components/CloudflareVideoUploader.jsx` | TUS upload → Cloudflare Stream → HLS URL |

## Database (Supabase)

Key tables and their ID types:

| Table | ID type | Notes |
|---|---|---|
| `videos` | **uuid** | Movies — `url` stores HLS or direct URL |
| `shows` | bigint | Series |
| `episodes` | bigint | FK → shows |
| `profiles` | uuid = auth user id | One row per user |
| `viewer_profiles` | uuid | Netflix-style sub-profiles per user |
| `watch_progress` | bigint | Upserts on `(user_id, profile_id, content_id, content_type)` |
| `live_streams` | bigint | Streamer channels |
| `ratings` | bigint | 1–5 scale (not thumbs up/down) |
| `subscriptions` | bigint | Stripe subscription records |

`videos.id` is UUID — never `parseInt()` content IDs without checking the type first.

## Video Transcoding (Cloudflare Stream)

### How it works

1. CMS admin uploads a video file → `CloudflareVideoUploader` component
2. Calls edge function `get-stream-upload-url` → gets a TUS upload URL from Cloudflare
3. Uploads in 50 MB chunks via TUS (resumable, survives network drops)
4. Polls `check-video-status` every 4 s until `readyToStream = true`
5. Cloudflare auto-transcodes to **1080p → 720p → 480p** (adaptive HLS)
6. HLS manifest URL auto-fills the Video URL field in the CMS form

### Playback URLs

```
HLS:       https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/{uid}/manifest/video.m3u8
Thumbnail: https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/{uid}/thumbnails/thumbnail.jpg
```

The App.jsx player detects `.m3u8` URLs via `isHlsUrl()` and uses hls.js automatically — no player changes needed when storing Cloudflare Stream URLs.

### Edge Functions (Supabase)

| Function | Purpose |
|---|---|
| `get-stream-upload-url` | Returns `{ uid, uploadURL }` from Cloudflare for TUS upload |
| `check-video-status` | Returns `{ readyToStream, pctComplete, state }` for a uid |
| `check-live-status` | Checks if a live stream is active via Cloudflare |
| `get-vods` | Lists recorded VODs for a streamer's live input |
| `rotate-stream-key` | Rotates a streamer's RTMP stream key |
| `delete-vod` / `rename-vod` | VOD management |
| `notify-go-live` | Sends viewer notifications when a streamer goes live |

Cloudflare credentials are in Supabase secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.

## Live Streaming

- Streamers push RTMP to `rtmps://live.cloudflare.com/live/{stream_key}`
- `live_streams.stream_uid` = Cloudflare live input UID
- `live_streams.is_live` is updated via Cloudflare webhook → `notify-go-live`
- 20-second polling fallback via `check-live-status` in `StreamerProfile`
- Viewer heartbeats every 30 s to `live_viewers` table; viewer count = rows with `last_ping` within 90 s
- Chat in `live_chat` table via Supabase Realtime

## Auth Notes

- `StreamerDashboard` requires an explicit sign-in this browser session — checks `sessionStorage.getItem("streamer_session_active")`. Set on `SIGNED_IN` event, cleared on `SIGNED_OUT`.
- Main app (`App.jsx`) restores sessions normally from localStorage via Supabase's default persistence.

## Content ID Warning

`watch_progress.content_id` is stored as `text`. Movies use UUID strings, episodes/shows use bigint strings. Always preserve types — use `parseId(type, id)` pattern where `type === "movie"` keeps the string and other types call `parseInt()`.

## Carousel / Handpicked Rows

Carousels store `filter_value` as JSON when `type = "handpicked"`: `[{id, type}]` (no titles). On edit, `startEditCarousel()` enriches from the in-memory pool (`rows`, `showsList`, etc.) to restore `title` and `thumbnail` for display.
