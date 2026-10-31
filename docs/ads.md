# Ads in Peep

Peep sells ad breaks through **VAST tags** played by Google IMA (browser SDK on the
website, IMA tvOS SDK on Apple TV). Peep decides *when* a break runs and *which* tag
to ask; the ad server behind the tag decides what plays and keeps the money records.
Nothing in Peep moves money.

Everything lives in **Monetization → Ads** in web admin (`AdsPanel.jsx`). The same
rules and tags drive both players.

## Ad rules

One JSON row, `app_settings.ads_policy`, readable by every player, written by admins
(`db/features/ads-policy.sql`, `lib/adPolicy.js`, `AdPolicy` in `PlayerView.swift`).

| Rule | Default | Browser | Apple TV |
|---|---|---|---|
| Ads on/off | on | ✓ | ✓ |
| Minimum gap between **entry** ads (movie/episode/channel/multiview start) | 30 min | ✓ | ✓ |
| Ad before a live channel / before multiview | on / on | ✓ | ✓ |
| Mid-rolls: every N min, only in titles over M min, at most K breaks | 15 / 20 / 4 | ✓ | — |
| Post-roll after a movie or episode | on | ✓ | — |

The gap is one clock per device (`localStorage` / `UserDefaults`), reset by **any**
ad start including mid-rolls and test ads, so hopping between titles can't chain ads.
Mid-roll break points are computed from the title's duration when metadata loads;
never inside the last two minutes; seeking past several points plays one break.
Players read the rules when they start a break, so changes apply to the next break.

## Tags

A tag is a row in `vast_tags`: name, HTTPS URL, **position** (`pre_roll` /
`mid_roll` / `post_roll`), **scope** (`global`, `movie`, `episode`, `live`,
`multiview`), optional exact `content_id` (text; movies are UUIDs), `platforms`
(`web`, `tvos`), `is_test`, `active`. The database rejects unknown positions and
scopes.

Selection, identical on both players (`selectAdTag` / `CSAITag.select`): active,
right platform, HTTPS, and either the exact title → the whole type → global; ties go
to the lowest id. Post-roll can't target live or multiview; mid-roll can't target
multiview; a live mid-roll is an Apple TV development test only (see below).

The tag page in admin has a **title picker** (search movies, episodes or channels by
name — no raw ids), sample buttons (Google sample, Peep's own IAB fixture served by
`iab-vast-sample`), and **Play this tag**, which runs the URL through the browser IMA
SDK right there and says in words whether it played.

## Viewer behavior

- Movies and episodes: entry ad before content starts or resumes; mid-rolls and a
  post-roll on the browser per the rules. Watch progress never counts ad time.
- Live TV: entry ad before joining a channel. It does not replace commercials
  already inside the HLS stream. Returning to a channel already playing in the
  background does not request another ad.
- Multiview: one entry break before any tiles start; no per-tile ads.
- No tag, no fill, SDK errors, timeouts: content plays. Discovery is bounded to
  5 s, ad start to 10 s, ad media load to 8 s (native: 4 s / 10 s / 8 s). Back during
  an entry ad cancels it and does not start content.
- Ads use IMA's own controls and skip rules.

## Reporting and money

IMA fires the ad server's own tracking for every viewer. Peep's internal count
(`ad_impressions`) is **signed-in viewers only**, written with the viewer's own
permissions: `request`, `impression`, `complete`, `skip`, `error`, `timeout`,
`cancel`, each tied to a break session and ad/pod position (deduplicated by a unique
index). Browser logs the impression on IMA `IMPRESSION`, native on `STARTED`.

Admin's **Delivery, last 30 days** shows ads shown, signed-in viewers, completion
(completes ÷ shown), "breaks that filled" (requests with at least one impression),
skips/errors, a 14-day bar chart, and splits by player, by position and by tag.
Test tags, sample tags and simulator traffic are hidden unless **Include test
delivery** is ticked; **Clear test history** deletes test rows only. None of this
is a revenue figure — the ad server's report is what gets paid. See
`finances.md`.

## Before this earns anything

1. An ad server / SSP account (Google Ad Manager, or a partner that sells your
   inventory) that issues you VAST tags for CTV and web.
2. Replace the sample tags with those, **untick Test tag**, keep them active.
3. Run **Play this tag** in admin and watch a real break on an Apple TV.
4. Reconcile the ad server's numbers against Peep's delivery report for a week.

## What has been checked

- Apple TV simulator visibly played Google's sample pre-roll and then the demo
  movie; SDK request/start/completion diagnostics confirmed the sequence.
- Signed-in browser test produced request, impression and complete events marked
  test. Demo content resolution and watch progress reached the clip's 10-second
  duration after playback.
- Automated checks cover tag precedence, IDs, platform/active/URL rejection,
  guest write suppression, timeout fallback, cancellation and late SDK callbacks.
- Native SDK is pinned to Google IMA tvOS 4.17.0. Xcode signing settings preserved.

Before paid rollout, validate the actual provider tag on a physical Apple TV and
supported browsers/mobile devices, including required macros, privacy signals,
provider approval for each placement, no-fill, remote controls and multiview entry.
This integration does not supply advertiser demand, automatic revenue statements,
partner splits or transfers. No paid tags have been activated.

Official integration references:
[Google IMA tvOS](https://developers.google.com/interactive-media-ads/docs/sdks/tvos/client-side/get-started),
[Google IMA HTML5](https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/get-started).

### IAB multiview playback fixture (FARRIS dev)

The public `iab-vast-sample` Edge Function serves a static adaptation of the
IAB VAST 4.2 linear sample. Its original S3 video URLs returned HTTP 403, so the
fixture uses the same videos from the official IAB GitHub repository instead.
It contains no database access or user data. Sample tracking is not billing
verification; example.com impression URLs are placeholders.

Admin tag: **TEST — IAB wrapper multiview pre-roll (no earnings)**. It is active
for Web and Apple TV, scoped to multiview entry, with `is_test=true`. The previous
Google sample is retained but paused to avoid selection conflicts.

Endpoint: `https://cuwdyedmmnpklufduaho.supabase.co/functions/v1/iab-vast-sample`.
Source and license are in `supabase/functions/iab-vast-sample/`.

The active tag appends `?variant=wrapper`, which returns a single-hop wrapper
pointing to the base inline endpoint. The wrapper is adapted from IAB's
`Wrapper_Tag-test.xml`, with the companion placement omitted. Unknown variants
return HTTP 400. Both paths are static playback fixtures; neither verifies
third-party billing or measurement.

Verified in the Apple TV simulator: sample video visibly played, IMA emitted
request/impression/complete, then the four-channel grid opened. Three feeds
played; Dog the Bounty Hunter timed out with Retry available. Browser playback
of this specific fixture has not yet been verified.

### Apple TV reporting audit

Multiview runs one entry ad gate before creating the channel tiles. The 30-minute device-wide cooldown starts when the SDK reports ad start and persists in UserDefaults. Internal telemetry deduplicates each event/ad/pod-position combination and serializes request, impression and completion writes. Events are bound to the signed-in account that began the break; guests rely on provider SDK tracking. Simulator/sample-tag events are marked as tests. Admin ad analytics exclude test events unless enabled. Failed internal writes are logged in Xcode under CSAI; they are not proof of provider tracking failure.

The automated audit uses isolated defaults and a mock transport: it verifies one break, ordered deduplicated events, and cooldown after reopening without writing live impressions. A physical Apple TV test using a test tag is still required to confirm SDK rendering and actual reporting ingestion end to end.

### Apple TV live mid-roll: first dev test path

In FARRIS dev, create a **Mid-roll** VAST tag with **Live Channels** scope, one exact channel ID, **Test** enabled, and **Apple TV** as a platform. The sample-ad button preserves the selected position. Production, global mid-roll, non-test tags, VOD mid-roll and multiview mid-roll remain disabled on Apple TV.

The native player consumes HLS date-range metadata through AVPlayerItemMetadataCollector. A cue must include SCTE35-OUT, a stable range ID, a start date, and an end date or PLANNED-DURATION. Only durations from 5 to 180 seconds are accepted. Playback must be advancing and be no more than three seconds before or 15 seconds after the cue start, with at least five seconds of break remaining. This uses the player's program date rather than the admin inspector's observation time. Raw MPEG-TS SCTE-35 tracks without player-visible date ranges are not supported by this first path.

During a test ad the original live player continues silently, so finishing the ad reveals the current live stream rather than replaying the break. A monotonic deadline caps loading and ad playback at the remaining break duration; a received earlier end date can end it sooner. Ad errors/no-fill return to the underlying channel. Closing playback, backgrounding, changing channel or replacing the item cancels the test. Duplicate cue IDs are consumed once per player-item session. Normal SDK impression/completion tracking remains authoritative; forced termination does not fabricate completion. The pre-roll frequency limit is separate.

This is a development integration, not a validated revenue rollout. A real channel/date-range/ad playback test is still required before enabling it commercially. No channel is automatically enabled by a PMT detection or by running the inspector.

#### Embedded SCTE bridge (Dog dev test)

The dev Apple TV test path also probes clear MPEG-TS HLS segments. It discovers the SCTE PID from PMT, validates section CRCs, decodes scheduled program-level splice_insert start/end messages, and anchors their adjusted 33-bit PTS against the segment’s first video PES PTS and HLS program date. It handles PTS wraparound and skips discontinuities without a new date anchor, encrypted/fMP4/byte-range segments, immediate/component splices, and timestamps more than five minutes from the anchor. The reader uses the first advertised rendition to reduce duplicate traffic, remembers 100 segment URLs, and polls again two seconds after each pass. The segment reader is bounded to 4 MiB per segment and playlists to 1 MiB.

This runs only while a dev test-tagged single-channel player is open, after pre-roll finishes. A cue arriving more than 15 seconds late, or with under five seconds left, is skipped. Backgrounding or changing the player item cancels the reader. This is a prototype with extra segment requests, not a production shared ingest service or an always-on break archive. Captured Dog event 4177009 (120.067 seconds) is covered by native decoding and PTS-to-program-time tests. Actual IMA playback at a live embedded cue remains a separate live acceptance check.
