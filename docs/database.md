# Database Schema

Hosted on Supabase (PostgreSQL). All tables are in the `public` schema.

---

## Content

| Table | ID Type | Description |
|---|---|---|
| `videos` | uuid | Movies / standalone films |
| `shows` | bigint | TV show parent records |
| `episodes` | bigint | TV episodes, FK → shows |
| `music_videos` | bigint | Music video entries |
| `songs` | uuid | Individual songs |
| `albums` | uuid | Music albums |
| `podcasts` | bigint | Podcast parent records |
| `podcast_episodes` | bigint | Podcast episodes, FK → podcasts |
| `live_streams` | bigint | Live TV channels |

---

## Platform

| Table | Description |
|---|---|
| `carousels` | Home/browse page carousel configuration |
| `epg_entries` | Electronic program guide entries for live TV |
| `epg_channel_sources` | Imported EPG XML sources per channel |

---

## Users

| Table | Description |
|---|---|
| `profiles` | Auth user profiles (username, email, role, is_admin legacy) |
| `viewer_profiles` | Multiple viewer profiles per account |
| `subscriptions` | Stripe subscription records |
| `watch_progress` | Per-user watch position and duration for all content |
| `user_list` | User's saved/watchlist items |
| `ratings` | User content ratings (1–5) |

---

## Creators + Payouts

| Table | Description |
|---|---|
| `creators` | Creator records (name, email, payment info) |
| `content_creators` | Junction table — links creators to their content |
| `creator_payouts` | Monthly payout records per creator |

---

## Live TV

| Table | Description |
|---|---|
| `live_viewers` | Active viewer sessions per channel (for viewer count) |
| `live_chat` | Live chat messages per channel |
| `user_presence` | Active user page tracking |

---

## Ads

| Table | Description |
|---|---|
| `vast_tags` | VAST ad tag configuration |
| `ad_impressions` | Ad event log (impression, complete, skip, error) |

---

## Admin

| Table | Description |
|---|---|
| `app_settings` | Key/value store for platform settings |
| `promo_codes` | Promotional codes |
| `blocked_users` | Blocked account emails |
| `admin_login_attempts` | CMS login attempt log |

---

## Key Column Notes

- `watch_progress.content_id` is stored as **text** even though most content IDs are integers
- `podcasts.artwork_url` — not `thumbnail_url`
- `podcast_episodes.audio_url` — not `url`
- `carousels.pages` — comma-separated text (e.g. `home,movies`)
- `creator_payouts` has a unique constraint on `(creator_id, month)`

## Curated multiview packages

`multiview_packages` stores reusable two-channel combinations: UUID `id`, `title`,
`description`, `left_channel_id`, `right_channel_id` (channel foreign keys),
`enabled`, `position`, `visibility_tier`, and `created_at`. The two channel IDs
must differ. Admins create/edit packages; viewers can read enabled packages within
their preview tier. Package editing is web admin only.

In **Admin → Live TV → Multiview packages**, create a package, select its active free channels,
and enable it. In **Curation → Screens & rows**, add a row on Home or Live TV and choose **Multiview** as its type.
Use all enabled packages, or select packages in display order. Existing row
reordering and visibility controls apply. Package cards use the two channels'
artwork, so no extra image upload is required. Disabling a package removes it from
all rows after the viewer reloads its catalog. A package with a missing,
unavailable, or premium channel is hidden rather than substituting another pair.

A `carousels` row with `type = 'multiview'` uses `filter_value` as either an empty
string (all enabled packages ordered by `position, created_at`) or JSON picks:
`[{"id":"<package UUID>","type":"multiview"}]`. `[]` explicitly displays none;
malformed filters display none. `pages` supports `home`, `live`, or `home,live`.
Apple TV and the browser consume the same configuration. Apple TV opens its native
two-player experience; browser uses two video players with one audio source.
Mobile browser support depends on the device's simultaneous video capabilities.

Schema source: `db/features/multiview.sql`. Applied to **FARRIS dev** by the
`curated_multiview_packages` hosted migration; production was not changed. The dev
sample is **Racer + RetroCrush**, in **Watch Together** on Home and Live TV.
Deploy this schema before publishing these client changes against another database.

### Four-channel multiview

Packages can now contain **two or four** channels. Optional `third_channel_id`
and `fourth_channel_id` reference `channels(id)`; both must be present together,
and all four IDs must differ. The original left/right fields represent screens
1/2 (top-left/top-right in the four-screen grid); third/fourth represent
bottom-left/bottom-right. Two-screen packages remain compatible.

Admin's package editor offers a Screens selector with two or four channels.
Apple TV opens four-channel packages in an uncropped 2×2 grid, with one audible
screen, independent replacement/retry, fullscreen and Back. Its in-player screen
switch supports two/four screens when four playable channels exist. Browser
package rows also support the shared four-channel configuration.

The additive schema is `db/features/multiview-four-channels.sql`, applied only to
FARRIS dev as `four_channel_multiview_packages`. The enabled **Four Channel Mix**
package is included in the existing **Multiview** Home/Live TV row. Existing row
names, package picks, signing settings and other catalog content are preserved.

## Continue Watching and Live TV viewing dashboard

Apple TV reads/writes the existing `watch_progress` contract for movies and episodes:
account-scoped `user_id, content_id, content_type` uniqueness, matching web. Positions
save every 15 seconds and on close. Resume applies after 10 seconds and before 90%
completion; finished/unavailable titles are excluded from the Home shelf. This is
shared account history, not separate per-viewer-profile history. Guests do not save
resume positions. An admin `continue` row controls the shelf title/placement when
present; otherwise Home automatically shows Continue Watching after the hero.

**Admin → Reports → Live TV Viewing** is an on-screen dashboard, also summarized on
Analytics Overview. It refreshes every 30 seconds and offers 24h/7d/30d windows:
active devices/streams, channel watch hours, sessions, unique devices, average session
minutes, top channels, platforms and daily watch hours. No exported/generated report.

`live_watch_sessions` stores channel-level playback sessions with server timestamps,
channel-name snapshot, platform (`tvos`, `web`, `mobile_web`), mode (`single`,
`multiview`), anonymous device UUID, optional authenticated user, watched seconds,
and a private ingest token. Public clients cannot read history or write the table.
They call `record_live_viewing`, whose private implementation validates the token,
account, channel eligibility and bounded elapsed time. `live_tv_dashboard` is admin
only and aggregates using caller RLS. The dashboard contains no user/session tokens.

Clients sample actual media advancement, report every 15 seconds, and close sessions
on pause/exit. Buffering and background time do not count. “Now” expires after 45s
without a heartbeat. Multiview counts one active device and one stream per playing
channel; watch hours sum channel playback, so four simultaneous channels can produce
four channel-hours per hour. Unique devices are estimates, not unique people.
Period metrics cover sessions started within the window; daily buckets use UTC.
Creator broadcasts and silent browse previews are excluded from this FAST channel
report. Legacy `live_viewers` remains separate and is not used for historical totals.

Tracking starts with updated clients; there is no historical backfill or synthetic
viewing data. Schema source `db/features/live-viewing.sql` was applied to FARRIS dev
as `live_tv_viewing_dashboard`. Production is unchanged; deploy this schema before
shipping the corresponding clients against another database.

## Apple TV My List / Favorites

Apple TV reuses `public.user_list`; no schema migration or policy changes are required.
Saves use `user_id`, text `content_id`, and `content_type` (`movie`, `show`, or `channel`),
with the existing unique key `(user_id, content_id, content_type)`. As on web, these
saves belong to the signed-in account; Apple TV does not set `profile_id`.
Legacy `short` movie saves are normalized and deduplicated for display. Removing a
movie deletes that account's matching `movie` and `short` rows. Add is idempotent
(`resolution=ignore-duplicates`), and Delete filters by account, ID, and type.

The client refreshes saves at login, foreground return, catalog reload, library load,
and before a mutation. UI changes only after a successful server response; failed
writes remain retryable. Sign-out clears the local list. RLS remains enabled with
existing owner/profile checks; no service-role credentials are used.

Movies and shows share web My List semantics. Channel favorites use canonical
numeric channel IDs as text and `channel` type. The existing web My List renderer
currently resolves movies/shows, so channel favorites are displayed on Apple TV.
Unavailable saved items remain removable instead of silently disappearing.

Verification: dev schema checks confirmed RLS, the account/content unique key,
owner policy, and authenticated Select/Insert/Delete privileges. Native contract
tests cover web-compatible types, legacy normalization, scoped removal, idempotent
adds, guest rejection, failed-write handling, and clearing on sign-out. The simulator
guest My List and sign-in presentation were checked; no real account saves were
created during validation. Production data and signing settings were unchanged.

### Live TV metric details

Each of the six web dashboard cards opens an inline detail panel backed by an
explicit-column, admin-RLS-protected `live_watch_sessions` read. Active metrics
use unended sessions with a heartbeat in the last 45 seconds, independent of the
selected history period. Other cards show sessions started in that period; watch
hours and average duration rank by watched seconds. Rows include channel, anonymous
device ID, platform, playback mode, start/last activity, watched minutes and status.
Platform, mode and device filters, 25-row pagination, empty/error/retry states and
30-second refresh are supported. Device rows remain channel sessions, with repeated
device IDs explained explicitly. No ingest token or account ID is requested.
No schema or permission changes were needed. Dev query confirmed non-admin reads
return zero rows; the signed-in local admin was verified against real records.

### Simulator test activity

`live_watch_sessions.is_test` defaults to false. Apple TV simulator builds send
`tvos_simulator` as their telemetry platform; ingestion stores platform `tvos`
and marks the session as a test. Physical devices continue sending `tvos`.
Known test device IDs retain their test classification on new sessions, including
older simulator builds. This flag controls reporting only, not authorization.

`live_tv_dashboard_filtered(p_since, p_include_test)` excludes tests by default
from all six metrics, channels, platforms and daily totals. The original
`live_tv_dashboard` delegates with tests excluded for compatibility. Web admin
provides **Include simulator tests**, also applied to detail queries; included test
rows are labeled. Existing admin checks, RLS and grants remain in place.

Source: `db/features/live-viewing-test-activity.sql`, applied only to FARRIS dev as
`exclude_simulator_viewing_activity`. The existing simulator ID was confirmed from
its local app preferences before its historical rows were marked as tests; no
sessions were deleted. Verified 1 normal device versus 2 with tests included,
new simulator ingestion in a rolled-back transaction, web tests/build and tvOS
simulator build. Production has not received this migration.

### CSAI pre-roll metadata (FARRIS dev)

`db/features/csai-preroll.sql` was applied as `csai_preroll_metadata`. It adds
`vast_tags.is_test` (default true), `platforms` (default `['web']`, allowed values
`web`/`tvos`), and delivery-event fields `is_test`, `platform`, `ad_id`.
A partial unique index on `(session_id,event,ad_id)` prevents duplicate delivery
rows for one ad within a break. Clients include creative ID and pod position.
No new grants or security-definer endpoint were introduced. Existing signed-in
own-account INSERT permissions remain the write boundary; guest playback has
provider tracking through IMA but no internal `ad_impressions` write.

Tags select deterministically by exact content/type match, type-wide, then global,
with ascending tag ID as tie-breaker. IDs remain text, including UUID movies.
Platform selection and active/pre-roll filtering apply in both clients. Multiview
uses a type-wide entry placement, not a separate request for every tile.

All existing delivery rows default to test/unclassified and stay excluded from
normal ad reports until reviewed. These client-reported events are operational
telemetry, not trusted billable impressions or partner payables. The sole active
sample tag is scoped to the dev 1080p Big Buck Bunny promo clip, supports browser
and Apple TV, and is marked test. Production was not changed.
# Live TV channel row curation

Browser Live TV generates category rows automatically from the visible channel
catalog. New categories appear without creating carousel records. Generated
rows follow curated rows and use stable client-only IDs. A configured Live TV
category row overrides the generated row for that category (including an
explicitly disabled row, which suppresses it). Manual collections and multiview
rows retain their saved order. Empty categories disappear with their channels.

Admin carousel rows with `type = live_channels` and `pages` containing `live`
are displayed on browser Live TV. Apple TV Live TV opens the channel grid; selecting a channel starts full-screen playback with a left channel drawer
containing automatic category filters, Search, and Multiview packages instead of
editorial channel shelves. The tab always enters the grid; holding Select on the Live TV sidebar item offers Watch current channel and Stop live playback. Native Home retains editorial curation. The native Multiview
section still uses enabled `multiview` rows targeting `live`, in saved order.
Existing enabled and visibility rules still apply. No schema migration is required.

The row editor offers All live channels, By category, and Choose channels.
Category suggestions come from channel records, splitting multi-category values
on semicolons, commas, or pipes. Matching ignores case and surrounding whitespace.
Manual picks use the existing `filter_value` field as an ordered JSON array:
`[{"id":123,"type":"channel"},{"id":456,"type":"channel"}]`.
Clients preserve pick order, omit missing/unavailable channels, and avoid duplicates.
Empty manual rows cannot be saved. Rows with no available channels are hidden.


### Channel blackouts

`db/features/channel-blackouts.sql` adds four fields to `channels`, applied to
FARRIS dev (`cuwdyedmmnpklufduaho`). Existing admin-only write and tier-aware
catalog read policies remain in effect. Existing channels default to no blackout.

In web admin, open **Channels → Edit → Channel blackout**:

- **Black out now** blocks app playback until an admin switches it off and saves.
- **Message viewers see** is public text, up to 500 characters. Blank uses
  “This channel is temporarily unavailable. Please check back soon.”
- **Schedule a blackout** configures one start/end window per channel. Both times
  are required and the end must follow the start. The editor displays the admin's
  browser timezone; timestamps are stored as UTC `timestamptz` values.

A blackout is active when `blackout_enabled` is true **or**
`blackout_starts_at <= now < blackout_ends_at`. Turning off the manual switch does
not cancel an active schedule; uncheck the schedule too to clear both. The manual
switch overrides the scheduled end. Channels stay listed, with their message
replacing playback rather than disappearing from the catalog.

Updated Apple TV, browser and mobile web players check active channel settings
about every 10 seconds while watching. Loaded schedules are evaluated every second,
so their start/end do not wait for the next metadata refresh. Apple TV's corner
preview and each Multiview pane obey the same settings; blacked-out players discard
their buffered media and stop audio. Availability returning recreates the stream
without restarting healthy Multiview panes. No viewing time is counted for stopped
blackout media. Browser players hold the initial playback/ad request until the first
availability check succeeds. Transient refresh failures retain the last known settings.

These are app playback controls, not geographic rights enforcement or CDN access
revocation. Older installed apps and direct external stream URLs are unaffected;
rights-sensitive enforcement also requires controls at the stream origin/CDN.
Deploy the SQL before the admin/client changes in another environment. Production
has not been changed. No existing channel was left blacked out during verification.

### Apple TV Predictions

Native Predictions reads the existing `prediction_events`, `prediction_markets`,
and `market_options` catalogs through their existing tier-aware read policies.
No schema, grants, policies, or server betting writes were added. Admin curation
is shared with web; TV preview picks are stored locally per environment/account/
viewer profile and are explicitly labeled virtual Points with no cash value.
See `peep-tv/README.md` → Predictions on Apple TV for refresh, lock checks,
video-delay behavior, and the local development demo.


## VOD storage (FARRIS dev)

VOD files live in private `vod-sources` and `vod-playback` Storage buckets;
metadata remains in `videos`, `shows`, and `episodes`. Paths use catalog IDs,
with separate masters/trailers/artwork/captions and finished-playback folders.
Admin manages these under **Content → VOD library**. Browser and Apple TV resolve
protected playback references into temporary URLs using the viewer's session and
existing catalog RLS. Existing catalog URLs were not migrated.

See [VOD storage](../db/storage/VOD.md) for paths, permissions, upload workflow,
signed-link lifetime and upload limits. The new buckets use a 50 MiB ceiling, matching the Free plan; the project
global limit can be lower. No billing change was made.
