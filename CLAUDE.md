# Peep — Codebase Guide

Rewritten 2026-10-31 against the working tree on `rebuild/fresh-supabase`. Earlier
versions of this file described the pre-rebuild platform; where this file and older
prose in `docs/` disagree, trust this file and the code.

## Where things stand (read this first)

- The owner **lost the Gmail account** that owned the original Supabase projects
  (`iuozujwtuzuwubhsnhix` prod, `fzrfevzrfurmszdjauov` dev) and the `crazyfarris`
  GitHub account. Nothing in those accounts is reachable or recoverable.
- The platform was **rebuilt onto two new Supabase projects** in the owner's account:
  **dev `cuwdyedmmnpklufduaho`** ("FARRIS") and **prod `ffoiacnvcjlkgsazacrk`**. Prod
  has the base schema only — no content, storage, or edge functions.
- **watchpeep.tv and admin.watchpeep.tv serve a static "coming soon" page** (the
  `holding/` folder, deployed with `wrangler pages deploy` to Cloudflare Pages project
  `peep`). All automatic Git builds on that Pages project are **disabled** because it
  was still linked to `crazyfarris/peep`. Pushing to `main` deploys nothing. The old
  site is kept as Pages deployment `78e943b5` if it ever needs rolling back.
- Why the site is hidden: the FAST channels in the old database are **not licensed**.
  The owner is staying in dev until there's licensed content (via the provider
  deliveries workflow below).
- The current repo is `jurlow99/Peep`; day-to-day work is on `rebuild/fresh-supabase`.
- Owner's standing direction (`PLATFORM_SCOPE.md`): **every new feature ships with
  its web-admin support in the same change**; Apple TV is a viewer app, never an
  admin client; local testing uses FARRIS dev with browser/admin and Apple TV on the
  same backend; Apple TV focus = yellow outline, selected = yellow fill.
- The owner is not deep in the technical weeds. Keep replies short and plain; do the
  hard parts rather than handing over command lists. Production deploys and git
  pushes are blocked by Claude Code's auto-mode classifier — ask the owner to switch
  modes or approve rather than working around it.

## What Peep Is

A broad, free streaming platform with three lanes sharing the same video tech:

- **Content lane (current focus):** on-demand movies (`videos`), series
  (`shows`/`episodes`), podcasts, and always-on **FAST channels** (`channels`) with an
  EPG guide. Lean-back, ad-supported.
- **Social lane (built, dormant, currently broken under the rebuild's RLS):** creators
  go live (RTMP→Cloudflare) and viewers follow + chat. See "Creator live streaming".
- **Predictions lane:** curated, admin-scheduled events with a live-odds overlay. Bets
  are local UI state; no real money, KYC, or age gate.

Keep the lanes separate: no chat/follow on FAST channels; a creator stream is not a
channel.

**Brand:** *peep* — eyes-peeping mark + rounded wordmark (yellow `#FFD600` / black /
white; logo pack in `peep/public/PEEP_Logo_Pack`). **FARRIS** is the dev brand and
appears only when `IS_DEV_DB` is true.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, hls.js, tus-js-client, TanStack Query |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| VOD storage | Private Supabase Storage buckets **or** private Cloudflare R2 (`peep-vod-dev`), signed URLs — no transcoding, finished MP4s only |
| Live video | Cloudflare Stream live inputs (feeds via the Pi relay; creator RTMP) |
| Payments | Stripe (not configured on the new projects) |
| Ads | VAST/IMA pre/mid/post-roll (web), IMA CSAI (tvOS) |
| Hosting | Cloudflare Pages project `peep` (account `e356e06b…`), manual deploys only |
| TV | **PeepTV** — native SwiftUI tvOS app (`peep-tv/`), xcodegen, talks to Supabase directly |
| Tests | Vitest — 46 files / 153 tests in `peep/src/**/*.test.ts`; `CatalogTests.swift` on tvOS |

## Repo Layout

| Path | Purpose |
|---|---|
| `peep/` | **Canonical frontend** — run all npm commands here |
| `peep-tv/` | PeepTV tvOS app (App, Components, Models, Services, Views) |
| `supabase/functions/` | Edge functions (~47) + `_shared/` (`cors.ts`, `supabase.ts` with `requireUser`/`requireAdmin`, `xmltvFetch.ts` SSRF-guarded fetcher) |
| `db/rebuild/` | **The schema baseline**: `migrations/001_schema.sql`, `002_security.sql`, `003_private_helpers.sql`, `apply.sql`, tests, env templates, and a long README with the verified handoff status |
| `db/features/`, `db/storage/` | Add-on SQL applied **to dev only** by hand (`execute_sql`), not in any migration history |
| `db/*.sql`, `supabase/migrations/` | Historical fragments — **do not replay** |
| `holding/` | The static coming-soon page currently live on watchpeep.tv |
| `relay/` | Raspberry Pi 5 SRT relay (Express API + FFmpeg stream-copy + systemd unit) |
| `docs/` | Product/ops docs — several predate the rebuild (see "Stale docs") |
| `output/artwork/` | Demo poster/hero images |

**Branches:** `rebuild/fresh-supabase` is the working branch. `develop` and `main`
are older. Merging to `main` no longer deploys anything (Pages Git builds are off).

Node isn't on PATH on the owner's Mac; a copy lives at
`/private/tmp/node-v22.21.1-darwin-arm64/bin`. Docker is not installed.

## Environments

Config is resolved by `peep/src/lib/supabaseEnvironment.js` (`resolveSupabaseEnvironment`)
and re-exported from `peep/src/lib/config.ts` as `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`IS_DEV_DB`. It **throws at runtime** unless:

- `VITE_PEEP_ENV` is `development` or `production`;
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set and not placeholders;
- the URL is a bare https origin (http only for localhost in development);
- the host is **not** one of the two legacy projects (hard deny-list);
- the key doesn't start with `sb_secret_`.

`IS_DEV_DB` = `VITE_PEEP_ENV === 'development'`. It drives the FARRIS splash/badge and
disables tier filtering (`lib/tiers.js`). Templates: `peep/.env.example` and
`db/rebuild/environments/*.env.example`; local file is `peep/.env.local` (gitignored).
Never read `import.meta.env.VITE_SUPABASE_URL` directly.

Known leftovers to clean up before any launch: `peep/index.html` og/twitter images
point at the old project's `peep-media` bucket; `supabase/functions/iab-vast-sample`,
`db/epg_scheduler.sql`, `db/storage/*.sql` and `peep/public/dev-fixtures/` hardcode the
dev project URL; R2 CORS allows only `localhost:5173`.

## Routing

`peep/src/main.jsx` does manual path dispatch; only the main SPA uses `BrowserRouter`.
`AdminPage` is lazy-loaded (code-split) so viewers don't download the CMS.

```
/deliveries                                   → ProviderPortal (any host)
admin.watchpeep.tv (prod) · localhost/admin   → AdminPage (CMS)
/signup /signin                               → AuthPages
/account/delete                               → DeleteAccountPage
/set-password  /support                       → SetPasswordPage / SupportPage
/streamer      /stream/<slug>                 → StreamerDashboard / StreamerProfile
*                                             → BrowserRouter → QueryProvider → App
```

Legacy `/streamer-signin`, `/apply-to-stream`, `/create-channel` redirect to
`/signin?redirect=/streamer`.

## Key Files

| File | Purpose |
|---|---|
| `peep/src/main.jsx` | Entry — path dispatch, tab title, dev splash |
| `peep/src/App.jsx` | Main SPA shell — auth gates, page state, channel playback URL priority |
| `peep/src/components/CMS.jsx` | Admin CMS core — 7.8k lines, plus ~50 extracted panels in `components/cms/` |
| `peep/src/components/cms/adminSections.js` | `ADMIN_NAV` — the admin's group/section map |
| `peep/src/components/cms/VODUploadFlow.jsx` | Add VOD (upload-first → `save_uploaded_vod` RPC) |
| `peep/src/components/cms/ProviderDeliveries.jsx` | Provider delivery queue/review (admin + provider) |
| `peep/src/components/player/PlayerView.jsx` | Player: `PlayerView` → `AvailablePlayerView` (loads playable row) → `ResolvedPlayerView` |
| `peep/src/lib/vodStorage.js` | `resolveVODPlayback` — R2 / Supabase signed / external passthrough |
| `peep/src/lib/r2VOD.js` | R2 multipart upload + playback signing client |
| `peep/src/lib/adPolicy.js`, `adBreak.js`, `ads.js` | Ad rules (`app_settings.ads_policy`), the one IMA break player for pre/mid/post-roll, tag selection |
| `peep/src/components/cms/AdsPanel.jsx` | Monetization → Ads: rules, tags (with title picker + "Play this tag"), 30-day delivery report |
| `peep/src/lib/contentIds.ts` | `parseContentId`, `contentKey` — preserve UUID vs bigint ids |
| `peep/src/lib/tiers.js`, `lib/flags.js` | Tier gating (no-op on dev); feature flags |
| `peep/src/pages/LiveTV.jsx` | Streams tab (channel mosaic, now/next) |
| `peep/src/pages/ProviderPortal.jsx` | `/deliveries` wrapper for partners |
| `supabase/functions/r2-vod/` | Upload create/part/complete, playback signing, delivery publish |
| `peep-tv/PeepTV/Services/SupabaseService.swift` | All tvOS REST queries |

## Database

**Baseline** = `db/rebuild/migrations/001–003` applied via `apply.sql` in one
transaction to an *empty* database. It refuses to run on a non-empty schema. Both new
projects have it (dev also has the forward v2 hardening). 49 tables, **RLS on every
table**, anon sees only entitled production-tier catalog, premium needs a server-managed
subscription, episodes must be approved and inherit show rules.

- Helpers live in schema **`peep_private`** (`is_admin`, `has_active_subscription`,
  `can_read_tier`, `can_read_content`) — keep it **out of the Data API exposed schemas**.
- `public_live_feeds` is a SECURITY INVOKER view; admins read full feed metadata via
  `admin_live_feeds()`; ingest passphrases live in `live_feed_secrets` (no client policy).
- `profiles.role` ∈ `viewer | creator | admin`, plus `is_admin`; a trigger blocks
  self-promotion. No staff invitations / per-permission roles exist yet (scope wants them).
- Add-ons applied **to dev only**, by hand, no ledger: `db/features/*.sql` (channel
  blackouts, CSAI preroll columns, live viewing sessions + dashboard RPCs, multiview
  packages incl. 4-channel), `db/storage/*.sql` (VOD buckets/policies, upload-first,
  R2 registry, hero video, provider deliveries + types + trash, series playback,
  multiview layout, partner referral default), `db/epg_channel_setup.sql`
  (`save_channel_guide`), `db/epg_scheduler.sql` (pg_cron every 6h, dev URL).
  **Prod lacks all of these.** `001_schema.sql` was edited (adds `shows.autoplay_next`)
  after being applied, so it no longer matches prod exactly.
- Schema changes go in by running SQL in the project's SQL editor; there is still no
  incremental migration ledger. Add one before touching prod.

**ID types:** `videos.id` is **uuid**; `shows`/`episodes`/`channels`/`epg_entries`/
`podcasts` are bigint. `watch_progress.content_id` is text. Always go through
`parseContentId(type, id)`; never `parseInt()`/`Number()` a movie id. The CMS EPG and
ad editors still coerce with `Number(...)` — a known bug.

## Storage & VOD

Supabase dev buckets: **`promo-images`** (public, admin upload, images ≤5 MiB),
**`vod-sources`** and **`vod-playback`** (private, 50 MiB cap on the Free plan).
Cloudflare R2 bucket **`peep-vod-dev`** (private, ≤10 GiB multipart, parts signed by
`r2-vod`, browser uploads direct). Legacy `content`, `peep-media`, `avatars` buckets
**do not exist** on the new projects though code still names them.

**Add VOD** (Content → Add VOD, `VODUploadFlow`): pick a finished MP4 → uploads
immediately to a private inbox (R2 when configured, else Supabase) → choose
Movie/Episode, fill details → Save calls `save_uploaded_vod` (admin-only, transactional,
idempotent). No transcoding; H.264/AAC MP4 only. Episode thumbnails can be auto-grabbed
from the video. IMDb → TMDB metadata import via `title-metadata` (needs
`TMDB_READ_ACCESS_TOKEN`).

**Playback:** catalog `url` is either an R2 reference
`<supabase>/functions/v1/r2-vod/play/<uuid>`, an authenticated Supabase Storage path,
or an external HLS/MP4 URL. `resolveVODPlayback` turns the first two into 6-hour signed
URLs using the viewer's JWT (RLS decides eligibility); tvOS does the same. Signed URLs
are bearer links, not DRM. Cloudflare Stream is **no longer used for VOD uploads**
(`CloudflareVideoUploader` only survives in `StreamerDashboard`).

**Provider deliveries** (Partners → Provider deliveries; portal at `/deliveries`): admin
adds a partner and grants an existing account provider access; the provider creates a
delivery (movie / new series / episode / trailer), uploads files to R2, submits; admin
approves or requests changes; **publishing is a separate explicit step** that creates
the catalog row and records ownership in `content_creators`. This is the intended path
to *licensed* content. Full details: `db/storage/VOD.md`, `db/storage/R2.md`.

## Edge Functions

Deployed on **dev** as of 2026-10-31 (nothing on prod): `check-channels`,
`delete-account`, `fetch-m3u`, `fetch-rss`, `fetch-xmltv`, `iab-vast-sample`,
`inspect-channel`, `r2-vod`, `refresh-epg`, `send-welcome-email`, `title-metadata`.
Dev secrets present: `R2_*`, `RESEND_API_KEY`, `SITE_URL`, `PEEP_ENV`,
`WELCOME_EMAIL_ENABLED` + Supabase defaults. **No Cloudflare, Stripe, Turnstile, TMDB
or relay secrets yet** — creator streaming, billing, EPG-from-relay and the Pi can't run
on dev until those are added.

Deploy without Docker (Supabase CLI ≥ 2.122):
`supabase functions deploy <name> --project-ref cuwdyedmmnpklufduaho --use-api`
with `SUPABASE_ACCESS_TOKEN` set (personal `sbp_…` token; keep it out of chat/git).

Groups in `supabase/functions/`:

| Group | Functions |
|---|---|
| VOD / R2 | `r2-vod`, `title-metadata`, `get-stream-upload-url`, `check-video-status`, `get-vods`, `delete-vod`, `rename-vod` |
| FAST / EPG | `refresh-epg` (admin JWT or `x-epg-job-token`), `fetch-xmltv`, `fetch-m3u`, `fetch-rss`, `check-channels`, `inspect-channel`, `create-channel`, `save-feed`, `cf-live-input`, `relay-control` |
| Creator live | `check-live-status`, `stream-webhook` (verifies `Webhook-Signature`, needs `CLOUDFLARE_STREAM_WEBHOOK_SECRET`), `register-webhook`, `notify-go-live`, `rotate-stream-key`, `enable-streaming` |
| Creators / partners | `approve-streamer`, `reject-streamer`, `invite-creator`, `my-streamer-application`, `get-creator-dashboard`, `notify-episode-status` |
| Billing | `create-subscription`, `cancel-subscription`, `create-portal-session`, `create-donation-session`, `stripe-webhook` (verifies signature), `get-stripe-revenue`, `redeem-promo` |
| Admin / auth | `manage-admin-role` (owner email hardcoded), `verify-admin-pin` (dead — nothing calls it), `verify-turnstile`, `grant-access`, `delete-user`, `delete-account`, `update-email`, `send-confirmation-email`, `send-reset-email`, `send-welcome-email` |
| Misc | `sports-scoreboard` (unauthenticated ESPN proxy, 5-league allowlist), `iab-vast-sample` |

Admin gating is `requireAdmin` from `_shared/supabase.ts` (checks `profiles.role` /
`is_admin`). There is no `supabase/config.toml`, so `verify_jwt` is whatever each
deploy passed.

## Admin (CMS)

Reached at `admin.watchpeep.tv` or `localhost:5173/admin`. Email+password login, then
`profiles.role==='admin' || is_admin` (`lib/auth.ts isAdminProfile`); re-checked on
every auth change. No PIN step.

Navigation is two horizontal rows driven by `ADMIN_NAV` (8 groups):
**Content** (Add VOD, Movies, Series, Episodes, Podcasts) · **Curation** (Screens & rows,
incl. Home Hero with private background video) · **Live TV** (Channels & schedules,
Feeds, Multiview packages, Predictions) · **Partners** (Content partners, Provider
deliveries, Submission review, Creator streams, Streaming applications) · **Audience**
(Users, Support, Content reports) · **Monetization** (Ads, Subscriptions, Partner
payouts) · **Reports** (Live TV viewing, Platform analytics) · **Platform** (Settings,
Security, Flags, Audit, Planned tools). Tab state is not in the URL. Movies are still
keyed `videoSubTab === "shorts"` internally (legacy naming).

Cleaned up 2026-10-31: the Live TV passcode is gone; the Settings → Admin Access card
shows for every admin and `manage-admin-role` uses `requireAdmin` (you can't change
your own role); no owner email is hardcoded anywhere — admins get premium content by
role; Security panel is just Block user + Active sessions (`blocked_users` has a
`self_read` policy, `db/features/blocked_users_self_read.sql`, so blocking works).
Still open: `grant-access` wired in two places; "Planned tools" (Regions &
packages, Resources, Devices) are placeholders.

**Carousels:** `filter_value` is JSON for handpicked rows (`[{id,type}]`); the handpick
pool is movies + series only; search uses `startsWith`. Row types include
`live_channels`, `creator_streams`, `multiview`.

**Feature flags:** `lib/flags.js` registry → `app_settings` `flag_<key>`. Current:
`live_now_home`, `show_podcasts`.

**Content tiers:** `profiles.access_tier` + `visibility_tier` (`test`/`production`;
`stage` recognised); viewer sees their tier and below; filtering is a no-op on dev.
Server RLS also enforces production visibility for anon.

## Live TV (FAST channels)

- **Channel playback URL priority** (`App.jsx`): linked `live_feed_id` →
  `public_live_feeds.cloudflare_hls_url`, else `channels.hls_url`, else the Cloudflare
  `stream_uid` manifest. Playing requires sign-in. Live ids are `ch-<id>`.
- **Blackouts:** `channels.blackout_*` manual flag or scheduled window; client polls
  every 10 s (`hooks/useChannelBlackout.js`). Client-side only — the URL stays readable.
- **Multiview:** `multiview_packages` (2 or 4 free active channels), `MultiviewShelf.jsx`.
- **Live viewing telemetry:** `lib/liveViewing.js` → `record_live_viewing` RPC every
  ≤15 s → `live_watch_sessions`; admin Reports → Live TV viewing. Legacy `live_viewers`
  30-s heartbeat also runs (channel_id is bigint — the player strips the `ch-` prefix).
- **EPG:** two import paths — new `ChannelGuideSetup` → `lib/xmltv.js` →
  `save_channel_guide` RPC (atomic), and a legacy delete+insert in `CMS.jsx`.
  `refresh-epg` streams each `epg_channel_sources.source_url`; `db/epg_scheduler.sql`
  is a pg_cron job every 6 h (dev URL, token in Vault) — not confirmed enabled.
- **Feeds:** two roads, see `docs/live-feeds.md`. *Push* (`source_type='push'`): the provider is
  the SRT caller and sends straight to the feed's Cloudflare live input; the Feeds panel's **Push
  details** fetches the SRT address/stream ID/passphrase from Cloudflare via `cf-live-input`
  `ingest` (never stored). *Pull* (`source_type='srt'`): provider SRT → Pi (`relay/server.js`, `relay-manager.js`,
  FFmpeg stream-copy) → Cloudflare live input → HLS → `live_feeds` row linked to a
  channel. CMS Feeds panel calls `save-feed`, `cf-live-input`, `relay-control` (over a
  Cloudflare Tunnel at `relay.watchpeep.tv`, Bearer `RELAY_TOKEN`).
- **Inspector:** `inspect-channel` + `StreamInspector.jsx` probe variants, SCTE-35 cues,
  PMT. `lib/streamBreaks.js` is for the inspector, not the player.

## Creator live streaming (dormant)

`StreamerDashboard`/`StreamerProfile` + `enable-streaming`, `rotate-stream-key`,
`check-live-status`, `stream-webhook`, `notify-go-live`, Realtime `live_chat`. Under the
rebuild **this does not work**: `live_streams` is owner/admin-read only (it still holds
`stream_key`), owner updates are denied, Realtime/Broadcast isn't enabled, and
`increment_view` is service-only. Before re-enabling: split secrets out of
`live_streams`, add safe public projections, enable Realtime deliberately, set the
Cloudflare secrets. `check-live-status` now trusts only the stream's stored input UID;
`stream-webhook` rejects unsigned events.

## Predictions

`PredictionsPage.jsx` → `EventPlayer.jsx` → `MarketOverlay`; store/scheduler/feed in
`lib/market*.ts`; admin `EventsPanel.jsx` writes rows and publishes Broadcast ticks on
`market:{eventId}`. Tables are in the rebuild baseline, but Broadcast isn't enabled on
the new projects so live ticks won't arrive. `npm run mock:market` replays a fixture.

## PeepTV (tvOS)

xcodegen `project.yml`, bundle `tv.watchpeep.PeepTV`, Google IMA SPM, tvOS 17.
`Config/Debug.xcconfig` includes gitignored `Local.xcconfig` (dev URL + key, plus a local
Info.plist). `Release.xcconfig` includes `Production.xcconfig`, which **doesn't exist
yet**. `AppConfiguration.swift` requires https + key but does **not** reject legacy
projects. Supports browse, hero (incl. private hero video), channels/EPG/feeds, LiveSurf,
multiview, predictions, search, progress/My List, password auth + Keychain, viewer
profiles, live-viewing telemetry, Supabase/R2 signed playback, IMA CSAI ads. Yellow
focus outline / yellow selected fill per the owner. `peep-tv/README.md` is current.

## Tests, CI, lint

`cd peep && npm test` (Vitest, `src/**/*.test.ts`, ~2 s). `.github/workflows/ci.yml`
runs test + build on Node 22 (lint is continue-on-error, ~227 known problems);
`tvos.yml` runs xcodegen + simulator tests. `db/rebuild/tests/` has PGlite policy tests,
a real-Supabase rollback script (dev only), and a read-only tvOS REST smoke test.

## Open items before any launch

- Reconnect Cloudflare Pages `peep` to `jurlow99/Peep` (or keep deploying by hand),
  set `VITE_PEEP_ENV=production` + the prod URL/key there, and fix `index.html` asset
  URLs.
- Apply the dev-only SQL add-ons to prod with a ledger; create prod storage buckets /
  R2 bucket + CORS; deploy edge functions and secrets to prod.
- Resolve the admin weak spots above and the `Number(...)` coercion in EPG/ad editors.
- Staff invitations + role permissions (required by scope, not built).
- Real end-to-end upload → publish → playback test with owned media on web and tvOS
  (nobody has done this yet).
- Creator streaming, billing, predictions settlement remain unfinished (see above).

## Stale docs

`docs/SECURITY.md`, `docs/admin-guide.md`, `docs/database.md`, `docs/cms.md` and
`README.md` (root) still describe the pre-rebuild setup in places. `db/rebuild/README.md`,
`db/storage/VOD.md`, `db/storage/R2.md`, `docs/finances.md` and `PLATFORM_SCOPE.md` are
current.
