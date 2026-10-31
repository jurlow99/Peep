# Peep for Apple TV

Native SwiftUI app for tvOS 17+, backed by the same Supabase catalog as the web app. Includes guest browsing, featured movies, category filters, series and season browsing, title/description search, FAST channels with now/next programming, and optional account/profile selection. Playback uses AVPlayerViewController for Siri Remote transport controls, seeking, audio tracks, and captions supplied by the stream.

## Run on a Mac

Install Xcode with a tvOS simulator runtime, then:

```sh
brew install xcodegen
cd peep-tv
cp Config/Local.xcconfig.example Config/Local.xcconfig
```

Fill in `Local.xcconfig` with your **development** Supabase URL and public anon/publishable key (the same values used by the web app). Keep the `https:/$()/` syntax: ordinary `//` starts a comment in xcconfig files. Never use a service-role key. The stream host is the Cloudflare customer host used by the existing web app.

```sh
xcodegen generate
open PeepTV.xcodeproj
```

Select the **PeepTV** scheme and an Apple TV simulator, then Run. For a physical Apple TV, select your Apple developer team under Signing & Capabilities and pair the device with Xcode. The generated project is ignored; `project.yml` is the source of truth. Regenerate after adding files.

Debug reads `Config/Local.xcconfig`. Release reads `Config/Production.xcconfig`, which uses the same keys and must be created separately. Both are ignored by Git. An unconfigured build shows setup instructions and makes no backend requests. Debug displays a FARRIS DEV badge and allows preview content; Release filters to the production catalog. Use a dev project for Debug.

## Validate

In Xcode, Product > Test runs the catalog regression tests. Or choose an installed simulator from `xcrun simctl list devices available` and run:

```sh
xcodebuild test -project PeepTV.xcodeproj -scheme PeepTV \
  -destination 'platform=tvOS Simulator,name=Apple TV' CODE_SIGNING_ALLOWED=NO
```

The Apple TV GitHub workflow automatically selects an available tvOS simulator and builds/runs the tests without backend credentials. Tests cover UUID movie/feed IDs, episode schema, channel URL precedence, guide time boundaries, invalid media URLs, and session serialization. Native compilation and simulator tests require macOS; they cannot run in the Windows workspace.

Before shipping, check on a simulator and physical Apple TV:

- Browse as a guest; move focus through tabs, shelves, filters, grids, and search with the remote.
- Play an HTTPS HLS movie and episode, pause, seek, choose captions, and press Back. Audio must stop after dismissal.
- Open a live channel backed by a feed, a direct HLS URL, and a Cloudflare UID; verify now/next changes at program boundaries.
- Test an empty catalog, failed network request, missing playback URL, and broken stream; verify Retry and Back.
- Sign in, choose/switch profiles, relaunch, refresh an expired session, and sign out. Credentials use the device Keychain, scoped by backend host.

## Scope and release work

The Profile tab reads the signed-in user's `profiles` row and edits only `full_name`, `avatar_id`, and (when replacing a photo with a preset) `avatar_url`. Eight existing web avatar presets are available. Name-only edits preserve existing artwork. Profile settings use the current user's bearer token and own-row REST filter, and require the existing self-profile SELECT/UPDATE policies. No schema changes are needed. Sign-out clears the local TV session after confirmation. Existing viewer-profile selection is separate from account settings; this does not add household-profile creation, watch-history sync, or playback-preference placeholders.

Profile tests use an isolated mock HTTP transport to verify save/reload, payload restrictions, input validation, signed-out rejection, and denied/empty/wrong-owner responses. They do not write real account data or prove live RLS enforcement. Validate a disposable dev account before shipping.

This is the core free viewing client, not full web feature parity. Premium titles/channels are excluded until native entitlement handling is integrated. Production preview-account tiers, podcasts, My List, synced watch progress, creator streams/chat, ads, and purchases are not implemented. Profile selection currently identifies the viewer; it does not sync viewing history. Website/embed URLs are not playable in AVPlayer; catalog URLs must point to compatible HTTPS media (normally HLS).

Add approved Apple TV app icon/Top Shelf assets, validate the app's privacy declarations and ad/entitlement requirements, configure release signing, and complete device QA before a TestFlight/App Store release. No backend migrations or production deployment are needed for this source change.

References: [XcodeGen project specification](https://github.com/yonaskolb/XcodeGen/blob/master/Docs/ProjectSpec.md), [Apple AVPlayerViewController](https://developer.apple.com/documentation/avkit/avplayerviewcontroller).

## Device-local playback settings

The Settings tab stores preferences in this Apple TV's UserDefaults, separate from account/session storage. Automatic start controls opening videos and changing live channels; it is not next-episode autoplay. Data Saver applies AVPlayerItem.preferredPeakBitRate = 2,000,000; Automatic uses 0 (player-managed). This is a requested bitrate, not a guaranteed resolution or data cap. Subtitle preferences select actual playable legible media options, preferring device languages, or defer to tvOS with System Default. Missing/unloadable subtitle options are reported; burned-in text cannot be removed. Native player controls remain available for per-video changes. Preferences apply to newly opened/tuned items. Reset only restores these three app preferences after confirmation.

## Sidebar navigation and catalog refresh

Swipe Left from content to expand navigation; swipe Right on a menu
item, or press Select, to open that destination and collapse the rail. Movies,
Series, Podcasts, and My List enter on the first content card instead of the
category filters. Up still reaches filters. Simulator verified Select and Right
entering a movie card, Up reaching filters, and Left returning to navigation.
Up/Down moves between menu
items. Expanding keeps rows at the same vertical positions. Reduce Motion disables
the rail's layout animation. The simulator's directional controls exercise these
focus commands; touch-surface feel still needs a physical Siri Remote check.

Choose **Reload catalog** in the sidebar to fetch Home, Movies, Series, Search,
and Live TV again without restarting or signing out. Returning from the background
also reloads the catalog. This reads saved backend data; it is not a realtime admin
subscription. Account settings, signing, and playback preferences are unchanged.

Live TV uses a stable three-column channel grid with its own focus navigation.
Left/Right moves between cards or filters; Left at the first column or first filter
opens the sidebar. Right from the Live TV sidebar entry restores the last focused
channel (or the first available channel). Up from the top row reaches filters, Down
returns to channels, and Back from browsing opens navigation. Closing channel
playback returns to the channel grid, retaining the focused card.

Backing out of the Live TV player keeps the same channel playing in a small
preview above the channel grid. Browsing categories does not retune it; selecting
another channel replaces it, and selecting the same channel reopens it without
reloading the stream. Leaving the Live TV tab or opening multiview stops this
single-channel player. One persistent viewing tracker covers both player and
preview, so returning to the grid does not create a duplicate session. Simulator
verified RetroCrush continuing after Back; physical-device playback remains to
be checked.

## Shared Home controls

Apple TV reads the web admin's `app_settings.home_hero` promo, including title,
subtitle, badge, artwork, muted looping video, button label, and supported targets.
Movies, series, channels, and Home/Movies/Series/Live TV section links open natively.
External URLs, podcasts, and other unsupported targets show a browser notice rather
than an inert button. Unavailable or premium targets are not exposed by the TV
catalog. Promo video pauses off Home, behind playback/navigation, in the background,
and with Reduce Motion; image artwork remains the fallback.

When the promo is off or absent, featured selection matches web: featured movie,
featured series, first movie, first series, using ascending catalog ID order.
Home rows honor enabled status, page assignment (missing/empty means Home),
position, category/content-type filters, mixed handpicked order, and native versions
of spotlight and numbered/top10 layouts. Explicit featured/handpicked demo fixtures
can appear; automatic browsing rows continue to omit development samples. Unsupported
personalized, podcast, and creator rows remain omitted. Home channel playback now
resolves linked public feeds as well as direct HLS and Cloudflare IDs.

Use Reload catalog after saving admin changes. No schema or backend writes are
required by this client implementation. Contract tests cover hero precedence,
settings requests/malformed configuration, page defaults, row filters, layouts,
and mixed identifiers/order. Live promo playback and target actions still require
QA against an admin-configured development promo; a mock test is not that proof.

### Podcasts

The Podcasts sidebar tab reads enabled shows from the shared `podcasts` catalog and their `podcast_episodes` rows. Production visibility uses the same tier filter as movies; development sees the dev catalog. Admin-imported RSS episodes work through their saved direct `audio_url`; Apple TV does not independently fetch RSS feeds or open external podcast websites. Show details include artwork, host, description, and episode lists; native playback provides transport controls and Back returns to episodes. Missing audio, empty catalogs, and request failures have explicit states. Reload catalog and foreground refresh update the tab. Home Hero supports podcast show targets and the Podcasts tab destination.

Validation: focused service test covers enabled filtering, production tier query, episode scoping/order, playable audio URLs, and Podcasts promo navigation. The FARRIS dev catalog was empty during simulator verification, so real podcast audio playback remains to be verified with an admin-published episode.

### Live TV multiview

Selecting the Live TV tab or swiping into it opens the channel page without
starting or reopening playback. Selecting a channel opens it full screen. The
last watched channel ID is stored locally to help restore the grid focus.
Right reveals a left channel drawer without
replacing or pausing the player; selecting a channel tunes it and dismisses the
drawer. Left anywhere in the drawer or Back dismisses it. Select on the video
opens native playback controls, and Back closes those controls first. Back from
full screen or Browse app returns to the app sidebar. Leaving the Live TV tab keeps the channel playing in a corner preview across
app browsing. The preview is display-only, with no focus targets or buttons.
Hold Select on the Live TV sidebar item to open remote-accessible actions:
Watch current channel resumes full screen; Stop live playback ends it.
Starting a movie, episode, podcast, another independent live player, or Multiview
ends the previous live playback before the new content or its entry ad starts.
Backgrounding the app or leaving the app shell also stops it; returning from
other content does not automatically restart Live TV. The last channel ID stays
saved for focus restoration on the next Live TV visit.

The drawer provides Search, automatic category filters, saved-channel actions,
and admin-curated Multiview packages. Catalog and package metadata refresh every
15 seconds without retuning the current stream. Editorial channel shelves belong
on Home. The channel grid is the normal Live TV tab destination;
browsing does not require program listings. Existing ad entry/cooldown and shared
Live TV reporting remain in place; opening the drawer does not create a new ad
entry or player session.

Live TV cards, pills, sidebar icons, and drawer lists use native tvOS directional
focus and scrolling. There is no custom touch-pan recognizer, direction inversion,
or second manual Up/Down focus assignment. The drawer positions the selected
channel once on opening; it does not start another scroll animation on each
focus update. Swiping Left from the leading item of a row returns to the app sidebar, keeping
the current tab selected. Back also returns to the app sidebar. Left in the playback drawer closes it. Normal versus fast flick behavior belongs to tvOS; an exact three-item
flick count is not imposed. Playback controls and text entry retain system behavior.

Feed recovery: a failed or buffering tile gets up to two automatic reconnection
attempts, with a two-second delay between attempts and a twelve-second loading
window. The tile shows “Reconnecting…” while healthy feeds continue. If both
attempts fail, Retry starts a fresh recovery cycle and Change Channel remains
available. Recovery preserves audio selection and is cancelled when the app
becomes inactive, the tile changes, or multiview closes.

Choose **Multiview** in the Live TV drawer to open an admin-curated two- or four-channel package. Focus a screen to choose its audio, select it for fullscreen, and use Back to return to both screens. Change channel replaces one slot while the other stays playing; channels without playback URLs and duplicate assignments are excluded. Multiview has its own two-player lifecycle, pauses in the background, and releases both streams on exit. While fullscreen, the other stream is paused. Adaptive renditions are requested at up to 720p / 2 Mbps per slot where supported; this is a playback preference, not a hard bandwidth guarantee.

Validated with two real live streams in the tvOS 27 simulator, audio-source state switching, fullscreen return, and channel replacement. The focused model test passed for exclusive audio, duplicate rejection, replacement, and cleanup. Physical Apple TV decoder performance and sustained network playback still require device testing. Signing settings were preserved.

### Admin-curated multiview

Visible Home and Live TV package shelves refresh curation every 15 seconds.
Live TV also refreshes on entry. Saved package edits apply when reopening the
package; an active multiview session is not retuned by background admin edits.
A package with an unsupported stream preserves its two/four-slot layout and
shows an unavailable tile with Change Channel instead of hiding the package.
Apple TV still requires supported HTTPS media URLs; this does not allow HTTP
streams. Admin warns when a selected channel lacks an HTTPS/feed playback route.

Web admin → Live TV → Multiview packages manages reusable channel packages.
Curation → Screens & rows manages Multiview rows on Home and Live TV. Both clients read `multiview_packages`; row picks preserve
package order and launch the exact left/right channel pair. Disabled packages and
pairs missing a playable free channel are hidden. Reload catalog after admin edits.
See `docs/database.md` and `db/features/multiview.sql` for the shared contract.

Curation validation: simulator verified the shared Home/Live TV package card,
exact pair launch, audio switching, Back to browsing, filter/grid-to-package focus,
and Left to sidebar. Browser verified the same shelf, two live players, audio
switching, and close. Web build and 38 tests pass. The focused native curated-pair
test passed; Xcode's runner stalled after reporting success during teardown and
was stopped. Native simulator build succeeds. Existing signing settings preserved.

Apple TV two-screen multiview now stacks the feeds top and bottom, retaining each
feed's aspect ratio with channel/audio controls beside it. Up/Down moves between
screens and selects audio; Select opens fullscreen, and Back restores the stack.
Simulator checked both live feeds, audio switching, and fullscreen return; build passes.

The stacked multiview panes now span the available width, with compact channel and
audio overlays at the bottom. The stack uses aspect-fill (vertical crop, no
stretching); fullscreen keeps the original aspect ratio. Right accesses Change
channel and Left returns to its screen. Up/Down selects screen audio.

Current multiview presentation restores aspect-fit: both full pictures remain
visible, with compact controls beneath each screen and reduced outer padding.
The earlier full-width crop experiment was rejected and removed.

Four-channel multiview uses an uncropped 2×2 grid. Admin packages support two/four
channels, and the player offers a 2/4-screen switch when four sources are available.
Arrow navigation selects the audible screen; Select opens fullscreen, Back restores
the grid, and Change replaces only that slot. Four streams request up to 540p and
1.2 Mbps per source to reduce decoding/network load. Real source renditions may
exceed these preferences. Physical Apple TV performance still needs validation.

Four-screen validation: simulator showed Racer, RetroCrush, Sonic TV and Outdoor
America playing together; checked grid focus/audio, fullscreen return, independent
replacement and 4→2→4 switching. Three focused native regression test cases and
39 web tests pass; both client builds and lint on the changed web modules pass.
Database checks reject partial/duplicate four-channel packages. Production untouched.
The final three-test runner stalled during teardown after reporting all test cases
passed and was stopped; the earlier isolated four-screen test completed normally.

Four-screen layout refinement: the four fixed-size panes now meet around a shared
center with a 4-point divider. Compact channel controls overlay the lower edge,
and square focus borders keep the panes aligned. All video remains aspect-fit.
Simulator checked live playback, directional audio focus, fullscreen return and
channel picker access; build passes.

Home hero now uses a 640-point artwork area starting at the top edge, replacing
the separate Home heading when a hero is available. Artwork extends behind the
collapsed sidebar and to the trailing edge; the expanded sidebar stays opaque.
The upper fade is lighter and the bottom fade still blends into the first shelf.
Artwork delivery specs remain 1920×1080 (16:9); these are presentation changes.

Continue Watching now shares the web account's movie/episode positions, saving every
15s and on close and resuming unfinished titles. Home shows a progress shelf; signed
out viewers have no shared history. Existing admin Continue Watching rows control
placement/title when present. Live TV playback (single and multiview) now reports
actual advancing foreground playback to the web admin's Reports → Live TV Viewing
dashboard. No buffering/paused time or browse-preview playback is counted. See
`docs/database.md` and `db/features/live-viewing.sql` for metric definitions and rollout.

### Four-screen remote controls

Directional navigation moves between the four screen tiles without focusing the overlaid channel buttons. Select opens the focused screen fullscreen; Back returns to that same tile. Play/Pause opens that tile's channel options, and Down from the bottom row also opens options. Back from options returns to the tile before another Back closes multiview. Audio follows both tile and channel-option focus. Channel controls are excluded from normal grid focus until explicitly opened.

Verified in the tvOS 27 simulator: right/down/left screen navigation, Play/Pause options, channel-picker cancellation, fullscreen and Back restoring the same tile, Down-to-options, and Back-to-tile. Simulator build succeeds. Physical Siri Remote swipe feel still needs a device pass.

### Immediate multiview grid

Choosing a package immediately presents its two- or four-screen layout, with a loading indicator inside each tile until that renderer has its first frame ready. Feeds prepare concurrently with a two-second preferred forward buffer and AVPlayer stall protection. The selected screen provides audio as it becomes available; healthy screens do not wait for slower providers. Hidden preparation is excluded from Live TV viewing metrics. A 12-second initial timeout provides Retry/Change for missing feeds. Replacing or retrying a channel leaves the remaining screens visible.

### Apple TV launch intro

Once the scene becomes active, fresh app launches begin with the two Peep eyes floating on black. The yellow backing opens, four separately masked letters fly into place with staggered spring motion, and the eyes settle into the two e letters and blink once. The animation finishes on the untouched original artwork and fades into the app after about 3.3 seconds. Select, Back, or Play/Pause skips the intro. Reduce Motion uses a short fade and a 2.6-second hold so the complete sound can finish. Authentication and catalog loading continue underneath. The intro runs once per RootView launch, not during normal navigation or ordinary foreground returns, and uses no remote assets. A locally synthesized 2.25-second sound accompanies the full animation: two rounded pops, a filtered-noise swoosh, and C5/G5 chimes. It plays at 80% player volume with an explicitly activated playback audio session and mixWithOthers. Skipping the intro, leaving the scene, or removing the intro stops the sound; Reduce Motion retains the sound. The original stereo PCM file is bundled as PeepLaunchSound.dataset. Regenerate it with `python3 peep-tv/scripts/generate_intro_sound.py` (standard library only; deterministic synthesis, no external samples).

Launch audio verification: the bundled-asset decode test and actual playback start/advance/stop test pass on the tvOS simulator. The intro task waits for an active scene before starting both animation and audio, avoiding an initial inactive-phase skip. LaunchAudio logs report actual playback failures instead of silently dropping them.

### My List / Favorites

My List sits after Search in the sidebar. Hold Select on a movie, series, or channel
card to add/remove it; saved cards display a bookmark. Series details and the Live TV
guide also expose a direct My List button. Sign in to persist saves to the account.
The library filters All / Movies / Series / Live TV, opens saved content, and keeps
unavailable entries removable. Yellow focus borders and neutral surfaces are retained.
Movies/shows use the web account's existing user_list contract. Channel favorites are
currently displayed by the Apple TV client. Saves refresh on foreground return or
catalog reload rather than using Realtime. See docs/database.md for the contract.

### Multiview sleep prevention

An active foreground multiview session explicitly disables the application's idle
timer while at least one screen is loading or available. The override remains in
place across two/four-screen changes, channel replacement, and fullscreen transitions.
Each player also explicitly enables `preventsDisplaySleepDuringVideoPlayback`.
The previous idle-timer value is restored on scene inactivity, closing multiview,
or when every channel has failed/timed out. Retrying an available slot reacquires
the override. Manual device sleep remains under system control.

Two simulator tests verify repeated updates preserve the original setting, layout
and fullscreen transitions keep the override, and inactive/close/all-failed paths
restore it. A long unattended session on the physical Apple TV still requires the
updated device build to verify the reported sleep interval.

Simulator builds identify Live TV telemetry as `tvos_simulator`; the dev backend
marks these sessions as test activity and excludes them from normal reporting.
Admin can include simulator tests explicitly. Physical Apple TV telemetry remains
`tvos`. See `db/features/live-viewing-test-activity.sql` for the required backend
migration; it is currently applied to FARRIS dev only.

## CSAI entry ads

Google IMA tvOS 4.17.0 is pinned through Swift Package Manager and mirrored in
`project.yml`; signing settings remain unchanged. Shared `vast_tags` configuration
controls pre-rolls before movie/episode playback, Live TV entry and a single break
before multiview starts. Tags must explicitly include `tvos` in `platforms`.
SDK ad playback uses its own surface while content remains paused. Back cancels
without starting content; missing tags and ad-load errors fall back to playback.
Test tags bypass the 30-minute in-process non-test cooldown.

FARRIS dev's Home → Play sample has a Google sample pre-roll, scoped only to the
1080p demo clip. Simulator visibly verified the ad and subsequent movie playback.
Two native placement/lifecycle tests pass, including guest write suppression and
cancellation. Physical Apple TV and real paid-provider tags remain to be verified.
Internal telemetry uses existing signed-in event permissions; guests still receive
IMA provider tracking. Test/simulator events are not revenue or partner payables.
See `docs/ads.md` and `docs/finances.md` for the operating and payment boundaries.


Channel blackouts configured in web admin apply to single live playback, the
persistent corner preview, and individual Multiview panes. The native client reads
`channels.blackout_enabled`, `blackout_message`, `blackout_starts_at`, and
`blackout_ends_at`. Active playback refreshes settings every 10 seconds and checks
loaded schedule boundaries every second. Blacked-out players remove their media
item, display the viewer message and resume when available (respecting autoplay
preferences for single-channel playback). The manual switch remains active until
turned off, even after a schedule ends. Install this app build on every Apple TV
that must honor these controls; this does not revoke direct CDN links.

The Home hero is reduced from 820 to 640 points, leaving the first shelf visible.
Full-bleed artwork, black/grey styling and 1920×1080 delivery specs are unchanged.

## Predictions on Apple TV

The Predictions sidebar destination reads the web admin's `prediction_events`,
`prediction_markets`, and nested `market_options` rows. Event artwork prefers
`hero_url` and falls back to `thumbnail`; playback uses the event's secure direct
`stream_url`, or its Cloudflare `stream_uid` with the configured host. This remains
separate from FAST channels and creator streams. No admin or signing changes are
needed to publish an event to updated TV builds.

The native layout includes an event showcase, Live/Upcoming/Results filters,
account/profile-scoped local pick history, a side-by-side event player and market
panel, and fullscreen video with Back returning to the same playing event. Focus
uses native tvOS sections and yellow outlines; selected choices/Points chips may
fill yellow. Starting event video stops any previous Live TV corner player.

This matches the web feature's current **virtual Points preview** scope. It does
not place server bets, debit a wallet, pay money, or sync picks between devices.
Picks are stored in UserDefaults on this Apple TV under environment/account/profile
keys (200 retained). A real event requires sign-in to save a preview pick. The dev
build's clearly labeled local demo also permits guest preview picks, does not write
catalog rows, and never appears in Release. FARRIS dev currently has no scheduled
prediction events, so **Explore a demo** is available in its empty state.

Browse metadata refreshes every 10 seconds when active and not inside an event.
The event view polls market snapshots every 3 seconds, checks lock deadlines every
second, and rechecks the latest question and quoted multiplier before confirming.
Changed multipliers require a second confirmation; closed questions, duplicate
picks, malformed options, and expired deadlines are rejected. Snapshot refreshes
are serialized. Results use the multiplier captured with the saved pick. Point returns use decimal
multiplication with whole-Point half-up rounding (50 × 2.05 = 103 Points).

Live updates use REST snapshots, not the web Broadcast tick feed. Once viewing,
snapshots are buffered by the stream's dated HLS latency (when AVPlayerItem exposes
it), plus 250ms, before being revealed; invalid/missing live dates fall back to the
small cushion. Browse polling does not resolve results behind the event's player.
This is a preview implementation, not a production wager or guaranteed frame-accurate
sports settlement system. Full wallet/server settlement and higher-frequency
Broadcast updates remain separate platform work.

## Protected VOD Storage

`PlaybackView` resolves this backend’s `/storage/v1/object/authenticated/vod-playback/` references before creating `PlayerView`. Signed-in viewers obtain a fresh six-hour signed URL through Storage RLS, which follows existing movie/episode catalog permissions. Guest or denied requests show an error and never fall back to a raw private URL. External streams are unchanged. See `db/storage/VOD.md` for the admin setup and limitations.

Private hero backgrounds can reference `vod-sources` trailer MP4s. `PromoArtwork` resolves the viewer-authorized URL before creating a loop item, renews one-hour links every 30 minutes, and falls back to artwork on signing failure. Guests see artwork for private hero videos; masters remain admin-only.

Hero trailer presentation uses a decorative `AVPlayerLayer` with aspect-fill cropping and first-frame readiness. Artwork remains underneath a short settling delay and 0.8-second crossfade; buffering no longer toggles the poster on every time-control change. Failed media fades back to artwork. Signed-link renewal preserves the current clip position where possible.

### Simplified Apple TV navigation

The sidebar contains Home, Live TV, On Demand, Podcasts, Search and My List,
with Account separated at the bottom. On Demand switches between Movies and
Series; existing admin movie and series rows remain separate and unchanged.
Account includes App Settings, where Reload catalog now lives. Predictions
opens from Live TV; its events and markets remain managed in admin. Multiview
continues to use Live TV packages and admin-curated shelves.

### Launch profile selection

Signed-in viewers choose a profile after the intro on each fresh app launch. Returning from a brief background pause keeps the current viewer. The last viewer receives initial focus; selection is still explicit. New viewers can choose a name and avatar on Apple TV. Watch history and My List currently remain shared by the account. Admins can inspect viewer profiles in Audience/Support.

### Remote controls

Apple TV actions must be reachable and activatable with the Siri Remote. Passive previews show no playback buttons. Four-screen Multiview shows Change/Retry only when channel options are opened with Play/Pause (or Down from a bottom tile); Back returns to the tile. The screen-count action is hidden when another layout is unavailable. Keep website-only controls out of native screens.

### Account quick menu

Select the sidebar Account avatar to open a menu above it. Signed-in options include Switch viewer, Profile settings (when the account record is loaded), App settings, and Sign out. Guests see Sign in and App settings. Background navigation is disabled while the menu is open. Back closes it and restores focus to Account.

Two-screen Multiview uses fixed edge-to-edge side-by-side tiles. Play/Pause opens tile actions. Both feeds preserve their full widescreen picture, centered across the full-screen canvas; black space above and below is intentional. The legacy `two_screen_layout` column is retained for compatibility; Apple TV no longer offers orientation switching.

### Catalog loading

Only Home is mounted initially. Other destination pages load on first visit and remain mounted so returning preserves loaded data and browsing state. Home releases its loading screen after its core catalog arrives; optional hero, feeds, packages, podcasts, and progress can finish afterward. Session restoration leaves viewer loading to the launch picker, which fetches viewers and account details concurrently.

Catalog reads for movies, shows, podcasts, carousels, Multiview packages and public feed references share identical in-flight requests and reuse successful data for 15 seconds. Cache keys include the session token; sign-out and Reload catalog invalidate it. Channel/blackout checks, watch progress, entitlements, and playback signatures are excluded. In Xcode Console, filter `CatalogLoading` for REST timings in milliseconds; URLs, tokens, and payloads are not logged. Bounded channel artwork reuses a memory-limited image cache and uses a 10-second request timeout. Live TV releases its initial spinner when channels arrive while optional curation and guide data finish.

### Remote focus restoration

The Account quick menu moves one option per accepted Up/Down command; Left or Back closes it and restores the Account button. Cancelling Add viewer restores its originating button. Back from Switch viewer dismisses the picker without changing the active viewer; cold-launch selection remains required. Multiview’s channel chooser handles Back explicitly and restores its originating tile after selecting or cancelling. Validate these on a physical Siri Remote before release; simulator unit tests do not establish gesture feel or every focus-engine transition.

### Playback continuity

Resume waits up to eight seconds for the current item to become seekable, validates the source duration, checks the exact seek result, and does not silently start at zero on failure. Backgrounding triggers a progress save in addition to periodic and dismissal saves. Audio-session activations use per-attempt ownership on the serial audio queue: stale/cancelled player cleanup cannot deactivate newer playback. Next-episode list and series playback settings load concurrently after the current episode is identified. Physical-device audio handoffs and real-media seeking remain release verification items.

Home’s outer content and shared horizontal shelves use lazy stacks so offscreen rows/cards do not eagerly start all artwork work at launch. The full-screen launch sound is 4.25 seconds and the intro normally adds 0.2 seconds; Back or Play/Pause skips it. Do not confuse that intentional animation time with catalog/network timing when profiling startup.

After session restoration, launch warms the reusable catalog requests while the intro/profile selector is visible. Home and subsequent pages reuse those successful short-lived reads. Warmup never requests playback signatures, watch progress, or channel blackout decisions.

## Release-readiness audit — October 28, 2026

Status: not yet ready to treat as an App Store release candidate. This is a source/configuration audit, not App Review approval or a physical-device certification. No production configuration or accounts were changed.

| Priority | Finding | Evidence and required work |
| --- | --- | --- |
| Review outstanding | Privacy information reachable on Apple TV | App settings now includes remote-readable privacy information, shared with an admin preview. Full policy wording, advertising disclosures and App Store Connect privacy text still need review. |
| Partially addressed | App-owned privacy manifest bundled | PrivacyInfo.xcprivacy declares UserDefaults (CA92.1) and elapsed-time measurement (35F9.1). Full collection/tracking declarations, SDK aggregate privacy report and archive validation remain outstanding. |
| Release setup | Production configuration not supplied locally | Release.xcconfig optionally includes Production.xcconfig; that file is absent in this checkout. External build settings may supply it, but no configured production archive/upload has been validated. Keep Debug/FARRIS and signing team unchanged. |
| Account lifecycle | No native account-deletion entry point | TV currently offers sign-in, not sign-up. Web Settings has a deletion section; verify its complete backend behavior and provide an appropriate TV initiation path for the shared account model before submission. Sign-out is not deletion. Do not add a button without an implemented flow. |
| Submission verification | Content rights, store metadata, privacy disclosures | Content distribution rights were not audited. App Store Connect disclosures, IMA/ad tracking configuration, age rating and review account/instructions were not inspected. |
| Device verification | Siri Remote, VoiceOver, audio, resume and interruptions | Source includes focus labels, yellow focus outlines, Reduce Motion handling and playback error paths. Full VoiceOver traversal, contrast, device navigation, real ad delivery and network interruption recovery remain unverified. The latest native suite has 72 passing tests; unit tests do not establish these device behaviors. |

References: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [Required-reason API declarations](https://developer.apple.com/documentation/technotes/tn3183-adding-required-reason-api-entries-to-your-privacy-manifest), [App privacy details](https://developer.apple.com/app-store/app-privacy-details/).

Recommended implementation order: native privacy/legal access and accurate manifest; account deletion flow; configured Release archive/privacy report; physical-device and TestFlight verification.

Privacy information is bundled in `PeepTV/PrivacyInformation.json`; Settings reads the local resource and admin Platform → Planned tools offers a read-only preview of the same content. Edit the shared resource and rebuild both surfaces to change it. This information screen does not implement account deletion and is not a finalized legal policy. The privacy manifest intentionally adds required-reason API declarations only; it must not be treated as a declaration that the app/SDK collects no data.

### Manage account phone handoff

App settings shows Manage account when `PEEP_ACCOUNT_MANAGEMENT_URL` is configured to the direct `/account/delete` page. The QR contains only that public address, never a token or account ID. Production requires HTTPS; development also accepts a private IPv4 LAN HTTP address. Local testing runs Vite on port 5174 bound to the LAN, leaving the existing 5173 server unchanged. The phone must share the network. Update the development address if the Mac’s IP changes. An external local Info.plist must include the `PEEP_ACCOUNT_MANAGEMENT_URL` build-setting placeholder too.

The web route requires sign-in, current password and exact typed confirmation. It calls the self-service `delete-account` function, not the separate admin-only `delete-user` function. The server identifies the caller from authentication, verifies the password, rejects supplied user IDs, revokes sessions and uses Auth deletion/database FK cascades. Administrator accounts and paid subscriptions needing cancellation are blocked with instructions. FK/storage constraints may also prevent deletion; failures never claim success. Provider delivery/media records may remain unlinked under existing retention rules; final privacy and retention wording must be reviewed. No live account was deleted during implementation.

FARRIS dev deployment only. Production endpoint/configuration/deployment and an expendable-account end-to-end deletion test remain outstanding.

### On Demand poster presentation

Movies and Series share 320-point poster widths, 36-point column gaps and responsive column counts based on the sidebar’s available width. Poster slots reserve a 2:3 footprint while artwork loads, preserve the full source image, and draw focus around the actual fitted artwork. Titles and content types stay outside the picture with consistent caption height. Successful poster images reuse the bounded artwork memory cache; failed requests remain retryable. No admin artwork fields or source assets change.
