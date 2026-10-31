# CSAI ads in Peep

Peep uses Google IMA to request VAST ads and handle provider playback/tracking.
The current rollout focuses on **pre-roll entry breaks** for the browser and
Apple TV. Changes and sample configuration are in FARRIS dev; production has not
received the new metadata migration. See [database.md](database.md).

## Admin workflow

Open **Monetization → Ads & performance** in web admin and add/edit a VAST tag.

1. Give the tag an internal name and HTTPS URL.
2. Choose **Pre-roll** and the scope: all supported content, movies, episodes,
   Live Channels or Multiview entry.
3. For movies/episodes/channels, optionally enter the exact content ID. Movie IDs
   can be UUIDs. Blank means all content of that type. Multiview entry is type-wide.
4. Choose Browser, Apple TV or both, according to provider support.
5. Leave **Test tag** on during testing. **Use Google sample ad** supplies a sample
   VAST URL with no earnings. Enable the tag when ready to test playback.

An exact content match wins over a type-wide tag, then global. Lowest tag ID wins
when several tags have equal priority. Disabling a tag affects subsequent requests;
it does not retract an ad already requested by a player.

Mid/post-roll code exists in the legacy browser player but is outside this verified
pre-roll rollout. Apple TV rejects those positions in admin. Show-level targeting
and podcast playback are not enabled by this rollout. Use a single-break VAST tag;
a VMAP schedule is not a substitute for a pre-roll placement.

## Viewer behavior

- Movies and episodes: ad runs before content starts/resumes.
- Live TV: entry ad precedes joining the channel. It does not replace commercials
  already inside an HLS stream. Returning to the same background-playing channel
  in the Live TV page does not request another entry ad.
- Multiview: one entry break runs before any channel tiles start; there is no ad
  request for each muted tile. Per-tile ad monetization has not been implemented.
- All entry pre-rolls, including test tags, share a 30-minute client cooldown
  after an ad starts. Switching channels or multiview packages does not reset it.
  Browser cooldown uses local storage (with an in-memory fallback); Apple TV uses
  UserDefaults, so reloads/relaunches preserve the cap. Failed requests before
  playback do not consume it. This is not a cross-device/account frequency cap,
  and it does not control ads already embedded in third-party live streams.
- Metadata/SDK startup errors and no-fill fall back to content. Browser discovery
  is bounded to 5 seconds and ad startup to 10 seconds; native metadata fetch is
  bounded to 4 seconds and ad startup to 10 seconds. SDK media loading is bounded
  separately. Back cancels an entry break and returns without starting content.
- Ads use IMA's controls and skip rules. Peep does not invent a skip entitlement.
- Ad time must not enter content watch progress or Live TV viewing reports.

Browser browse rows omit playback URLs. The player resolves the full entitled row
before mounting the ad/content player; missing access or missing URLs show a retry
state. Native AVPlayer remains paused and detached from the ad surface during ads.

## Reporting and money

IMA sends the VAST provider's tracking events for guest and signed-in playback.
Peep's internal delivery report covers **signed-in viewers only**, using existing
own-account event permissions. Guest internal reporting was intentionally not
added. A proposed anonymous telemetry endpoint was rejected by automatic approval
review; the implementation uses existing permissions instead.

Internal events include request, playback impression, complete, skip, error,
timeout and cancel. Events identify a break and individual ad/pod position.
Native IMA's STARTED event records the local playback impression; browser uses
IMA's IMPRESSION event. Provider measurement remains authoritative for its billing.

Test tags, sample tags and simulator delivery are excluded from normal internal
ad reports. **Include test ad delivery** shows those records for QA. Historical
rows default to test/unclassified because their billing status is unknown.

**Ad break start rate** means requested breaks with at least one playback
impression divided by requested breaks. It is not provider fill rate. Completion
rate is local complete events divided by local playback impressions. Neither
metric establishes revenue. The report does not calculate earnings or send money.

The account behind the tag and partner agreements determine who receives revenue.
See [finances.md](finances.md) for money flow, reconciliation and payout gaps.

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
