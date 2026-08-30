# Peep — Codebase Guide

## What Peep Is

A **broad, free streaming platform** (watchpeep.tv) with two distinct lanes that share the same video tech but nothing else:

- **Content lane (current focus):** on-demand movies (`videos`), series (`shows`/`episodes`), podcasts, and always-on **FAST channels** (`channels`) with a live EPG guide. Lean-back, anonymous, ad-supported. No creators onboarded yet, so this lane is where the effort goes.
- **Social lane (built, dormant):** creators go live (RTMP→Cloudflare) and viewers **follow + chat** — this is why users get usernames. Waiting on real creators.

Keep the lanes separate: don't add chat/follow to FAST channels, and don't treat a creator's stream as a channel.

**Brand:** *peep* — an eyes-peeping mark + rounded "peep" wordmark (yellow/black/white). **FARRIS** is the internal/dev brand and appears **only on the local/dev build** (splash, corner badge, top-left logo, local admin) so you can tell dev from prod at a glance. Prod is always *peep*.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, hls.js, tus-js-client, TanStack Query |
| Backend | Supabase (Postgres + Auth + Storage + 42 Edge Functions) |
| Video delivery | Cloudflare Stream (live + VODs + transcoded uploads) |
| Payments | Stripe |
| Ads | VAST/IMA pre-roll |
| Hosting | Cloudflare Pages (auto-deploy on push to `main`) |
| TV | **PeepTV** — native SwiftUI tvOS app (`peep-tv/PeepTV`), talks to Supabase directly |
| Tests | Vitest — one suite today (`lib/contentIds.test.ts`) |

## Repo Layout

| Path | Purpose |
|---|---|
| `peep/` | **Canonical frontend** — run all npm commands here |
| `peep-tv/` | PeepTV — SwiftUI tvOS app (App, Components, Models, Services, Views) |
| `supabase/functions/` | 42 edge functions |
| `db/` | Loose `.sql` migration files, applied by hand |
| `relay/` | Raspberry Pi 5 SRT relay node (FFmpeg + systemd + tunnel API) |
| `docs/` | Product/ops docs — admin guide, ads, revenue share, media specs |

**Branches:** `develop` is day-to-day work — push freely, nothing deploys. `main` is what's live; merging into it **deploys to Cloudflare Pages**. Ship by merging `develop` → `main` deliberately.

> Capacitor was removed on `develop` (commit 3b15238). `peep/ios/` is a leftover Capacitor shell still tracked in git; the native effort is now PeepTV on tvOS.

## Routing

`peep/src/main.jsx` does manual path dispatch at the top level. `react-router-dom` **is** installed, but only the main SPA branch uses it: `BrowserRouter` wraps `App`, and `App.jsx` resolves `page` state from `useLocation()` via `resolvePage(pathname, search)` + `useAppNavigation`.

```
admin.watchpeep.tv (prod) · localhost/admin (dev) → AdminPage (CMS)
/signup /signin      → AuthPages
/set-password        → SetPasswordPage
/support             → SupportPage
/streamer            → StreamerDashboard
/stream/<slug>       → StreamerProfile
*                    → BrowserRouter → QueryProvider → App (main SPA)
```

`/streamer-signin`, `/apply-to-stream`, and `/create-channel` are **legacy** — `main.jsx` redirects them to `/signin?redirect=/streamer`. (`ApplyToStreamPage.jsx` and `CreateChannelPage.jsx` still exist on disk but nothing imports them.)

Inside the SPA, `page` state switches views (`player`, `show`, `podcast`, `profile`, `settings`, `creator`, `studio`) and `activeNav` drives the nav tabs (Home, Movies, Series, Streams, Podcasts, My List).

## Key Files

| File | Purpose |
|---|---|
| `peep/src/main.jsx` | Entry point — path dispatch, tab title, dev splash |
| `peep/src/App.jsx` | Main SPA shell — auth gates, page routing, detail views, creator portal |
| `peep/src/components/CMS.jsx` | Admin CMS — **9.6k lines, ~40% of the frontend** |
| `peep/src/components/browse/Homepage.jsx` | Browse home + nav tabs |
| `peep/src/components/browse/BrowseWidgets.jsx` | Cards, rows, shared browse UI |
| `peep/src/components/player/PlayerView.jsx` | Video player (hls.js, ads, guide strip) |
| `peep/src/pages/LiveTV.jsx` | Streams tab — FAST channel mosaic, follow, viewer counts |
| `peep/src/pages/StreamerProfile.jsx` | Public streamer page — live player, chat, VODs |
| `peep/src/pages/StreamerDashboard.jsx` | Streamer portal — go live, analytics, VOD manager |
| `peep/src/pages/SettingsPage.jsx` | Account settings + billing |
| `peep/src/pages/PaywallPage.jsx` | Stripe checkout |
| `peep/src/lib/config.ts` | **Supabase URL / anon key / `IS_DEV_DB` — single source of truth** |
| `peep/src/lib/playerUtils.jsx` | `isHlsUrl`, `getEmbedUrl`, TrailerModal, guide strip |
| `peep/src/lib/contentIds.ts` | `parseContentId`, `contentKey`, browse/play select lists |
| `peep/src/lib/tiers.js` | Preview-tier gating |
| `peep/src/lib/flags.js` | Feature flags registry |
| `peep/src/lib/contentQueries.ts` | Shared `contentSelect` query builder |
| `peep/src/hooks/` | useAuth, useSubscription, useMyList (TanStack Query) |
| `peep/src/components/CloudflareVideoUploader.jsx` | TUS upload → Cloudflare Stream → HLS URL |
| `peep/src/components/cms/FeedsPanel.jsx` | SRT/live-feed panel (talks to the Pi relay) |

**Dead code** (no importers): `components/ProfileSelect.jsx`, `lib/carouselUtils.js`, `pages/ApplyToStreamPage.jsx`, `pages/CreateChannelPage.jsx`.

## Database (Supabase)

The client touches ~40 tables. The ones whose ID type or shape bites you:

| Table | ID type | Notes |
|---|---|---|
| `videos` | **uuid** | Movies — `url` stores HLS or direct URL |
| `shows` / `episodes` | bigint | Series; episodes FK → shows |
| `podcasts` / `podcast_episodes` | bigint | Podcast lane |
| `channels` / `epg_entries` | bigint | FAST channels + guide |
| `profiles` | uuid = auth user id | One row per user; holds `access_tier` |
| `viewer_profiles` | uuid | Netflix-style sub-profiles per user |
| `watch_progress` | bigint | Upserts on `(user_id, profile_id, content_id, content_type)` |
| `live_streams` | bigint | Streamer channels |
| `ratings` | bigint | 1–5 scale (not thumbs up/down) |
| `subscriptions` | bigint | Stripe subscription records |
| `app_settings` | key/value | Feature flags (`flag_*`), banned words, boss settings |
| `vast_tags` / `ad_impressions` | bigint | Ad serving + analytics |
| `audit_log` | bigint | Admin action trail |

`videos.id` is UUID — never `parseInt()` content IDs without checking the type first.

## Content ID Warning

`watch_progress.content_id` is stored as `text`. Movies use UUID strings, episodes/shows use bigint strings. Always preserve types — use **`parseContentId(type, id)`** from `lib/contentIds.ts`, which keeps UUID types as strings and `parseInt()`s the rest. `UUID_CONTENT_TYPES` = `movie`, `short`, `song`, `album` (`normalizeContentType` folds legacy `short` → `movie`).

## Video Transcoding (Cloudflare Stream)

1. CMS admin uploads a video file → `CloudflareVideoUploader`
2. Calls edge function `get-stream-upload-url` → gets a TUS upload URL from Cloudflare
3. Uploads in 50 MB chunks via TUS (resumable, survives network drops)
4. Polls `check-video-status` every 4 s until `readyToStream = true`
5. Cloudflare auto-transcodes to **1080p → 720p → 480p** (adaptive HLS)
6. HLS manifest URL auto-fills the Video URL field in the CMS form

```
HLS:       https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/{uid}/manifest/video.m3u8
Thumbnail: https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/{uid}/thumbnails/thumbnail.jpg
```

`PlayerView` detects `.m3u8` via `isHlsUrl()` (`lib/playerUtils.jsx`) and uses hls.js automatically — no player changes needed when storing Cloudflare Stream URLs.

### Edge Functions

42 in `supabase/functions/`, roughly grouped:

| Group | Functions |
|---|---|
| Video/VOD | `get-stream-upload-url`, `check-video-status`, `get-vods`, `delete-vod`, `rename-vod` |
| Live | `check-live-status`, `cf-live-input`, `stream-webhook`, `register-webhook`, `notify-go-live`, `rotate-stream-key`, `enable-streaming` |
| FAST/EPG | `refresh-epg`, `fetch-xmltv`, `fetch-m3u`, `fetch-rss`, `check-channels`, `create-channel`, `save-feed`, `relay-control` |
| Creators | `approve-streamer`, `reject-streamer`, `invite-creator`, `my-streamer-application`, `get-creator-dashboard`, `notify-episode-status` |
| Billing | `create-subscription`, `cancel-subscription`, `create-portal-session`, `create-donation-session`, `stripe-webhook`, `get-stripe-revenue`, `redeem-promo` |
| Admin/auth | `manage-admin-role`, `verify-admin-pin`, `verify-turnstile`, `grant-access`, `delete-user`, `update-email`, `send-confirmation-email`, `send-reset-email` |

Cloudflare credentials live in Supabase secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.

## Live Streaming

- Streamers push RTMP to `rtmps://live.cloudflare.com/live/{stream_key}`
- `live_streams.stream_uid` = Cloudflare live input UID
- `live_streams.is_live` is updated via Cloudflare webhook → `notify-go-live`
- 20-second polling fallback via `check-live-status` in `StreamerProfile`
- Viewer heartbeats every 30 s to `live_viewers`; viewer count = rows with `last_ping` within 90 s
- Chat in `live_chat` via Supabase Realtime

**SRT ingest** (`relay/`): provider SRT → Raspberry Pi 5 running FFmpeg stream-copy → Cloudflare live input → HLS → a `channels` row. The browser never talks to the Pi directly; the CMS Feeds panel calls the `relay-control` edge function over a Cloudflare Tunnel.

## Auth Notes

- `StreamerDashboard` requires an explicit sign-in this browser session — checks `sessionStorage.getItem("streamer_session_active")`. Set on `SIGNED_IN`, cleared on `SIGNED_OUT`.
- Main app (`App.jsx`) restores sessions normally from localStorage via Supabase's default persistence.

## Carousel / Handpicked Rows

Carousels store `filter_value` as JSON when `type = "handpicked"`: `[{id, type}]` (no titles). On edit, **`startCarouselEdit()`** (CMS.jsx) enriches from the in-memory pool to restore `title` and `thumbnail` for display.

The handpick pool is **movies (`rows`) + series (`showsList`) only** — podcasts and channels can't be hand-picked, and the pool literal is duplicated at the edit-enrichment site and the search UI. Search matches with `startsWith`, so partial-word queries won't find a title.

## Environments (dev / prod)

Two **separate Supabase projects**:
- **prod** `iuozujwtuzuwubhsnhix` (peep) → serves watchpeep.tv; creds come from Cloudflare Pages env vars.
- **dev** `fzrfevzrfurmszdjauov` (peep-dev) → local `npm run dev` via `peep/.env` (gitignored). Schema copied from prod; content seeded, no user data.

**`lib/config.ts` is the single source of truth** — it exports `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `IS_DEV_DB`. Never read `import.meta.env.VITE_SUPABASE_URL` directly and never hardcode a project URL: that's how you end up with a dev build calling prod edge functions with a dev JWT. `SUPABASE_URL` falls back to prod when the env var is missing, and `IS_DEV_DB` derives from the *resolved* URL — so a misconfigured build reads as prod (gating on, no FARRIS badge) rather than pretending to be dev.

`IS_DEV_DB` = "app is pointed at a non-prod DB." It drives all the FARRIS/dev-only UI and is re-exported from `components/EnvBadge.jsx` for existing importers. Browser tab titles (`main.jsx`): prod = `peep`/`admin`, local = `local`/`local admin`.

- **Copy schema/data prod→dev:** Docker Desktop running + `supabase db dump` → `supabase db push` (see the *env-setup* memory; migration history is messy so move `supabase/migrations/*` aside first).
- **Apply a schema change to prod:** run the SQL directly in the prod Supabase SQL editor (safest given the migration history).

## Content Tiers (preview rings)

`profiles.access_tier` + `<content>.visibility_tier` on `videos/shows/channels/podcasts/carousels` — both default `'production'`; values are `test` / `production` (`stage` exists in code, dropped from the UI). A viewer sees their tier **and everything below** (test → sees all; production → production only). Purpose: preview unreleased content live on prod with a Test account before real users see it. **Filtering is disabled on dev** (`lib/tiers.js` `canSeeTier`/`filterByTier` no-op when `IS_DEV_DB`) — dev shows everything. CMS: `TierSelect` on content/carousel forms + a **Tier** dropdown per user in the Users panel. Client-side gating (not a security boundary). See the *content-tiers* memory.

## Feature Flags

`lib/flags.js` holds the registry; state lives in `app_settings` as `flag_<key>` = `"true"`/`"false"`. `loadFlags()` on boot, `getFlags()` to read, CMS **Flags** tab to toggle. Add a flag by adding it to `FEATURE_FLAGS` — the panel and the app both read from that array. Current flags: `live_now_home`, `show_podcasts`.

## FAST Channels + EPG

The **Streams** tab (`LiveTV.jsx`) opens with a cinematic hero + a data-driven "Living Mosaic" of channels showing now/next from the guide. Channels live in `channels`; guide entries in `epg_entries`. **The EPG auto-refreshes daily**: the `refresh-epg` edge function (streams XMLTV from each channel's `epg_channel_sources.source_url` — i.mjh.nz for Plex/Roku, epgshare01 for others — and rebuilds `epg_entries`) is triggered by a `pg_cron` job and a CMS "↻ Refresh guides" button. See the *epg-automation* memory.

## CMS Structure

`CMS.jsx` renders a nine-group left nav that targets 12 internal tabs (`content`, `live`, `analytics`, `members`, `settings`, `security`, `moderation`, `creators`, `storage`, `flags`, `audit`, `scaffold`), most with sub-tabs. The `live` tab sits behind a passcode gate. Regions & Packages, Resources, and Devices are **scaffold placeholders** — nav entries with a blurb, no implementation.

Note the naming skew: the Movies UI is keyed `videoSubTab === "shorts"` and handpick labels `movie` as "Short" — legacy from when movies were shorts.

## Storage / Content Ingest

Public **`content`** storage bucket holds uploaded media. The CMS **Storage** tab lists **video/audio** files in the bucket (not images) and turns them into content: **"↑ Publish all new"** bulk-creates a Movie (`videos` row) per un-published video file (title from filename); single **Publish** does one with a form. Image fields (poster/thumbnail) in the content forms have an **↑ Upload** button (`UploadButton`) that uploads to `content` and fills the URL. Uploading a file to the bucket alone does nothing — it must be published into a DB row to appear in the app.

`lib/storageUtils.js` uploads to a separate `peep-media` bucket (creator video uploads), not `content`.

## Known Rough Edges

- `CMS.jsx` at 9.6k lines is the main structural debt; only `FeedsPanel` and `constants` have been extracted so far.
- `npm run lint` reports ~227 real problems — mostly `no-unused-vars` (81) and React hooks rules (`exhaustive-deps` 33, `static-components` 31, `set-state-in-effect` 23). Nothing build-breaking; there is no lint gate on the build.
- Test coverage is one file. `npm test` (Vitest) runs in under a second.
- The production bundle is a single 1.96 MB chunk (506 kB gzipped) — no code splitting, so every viewer downloads the 9.6k-line CMS.
