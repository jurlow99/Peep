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

This is the core free viewing client, not full web feature parity. Premium titles/channels are excluded until native entitlement handling is integrated. Production preview-account tiers, podcasts, My List, synced watch progress, creator streams/chat, ads, and purchases are not implemented. Profile selection currently identifies the viewer; it does not sync viewing history. Website/embed URLs are not playable in AVPlayer; catalog URLs must point to compatible HTTPS media (normally HLS).

Add approved Apple TV app icon/Top Shelf assets, validate the app's privacy declarations and ad/entitlement requirements, configure release signing, and complete device QA before a TestFlight/App Store release. No backend migrations or production deployment are needed for this source change.

References: [XcodeGen project specification](https://github.com/yonaskolb/XcodeGen/blob/master/Docs/ProjectSpec.md), [Apple AVPlayerViewController](https://developer.apple.com/documentation/avkit/avplayerviewcontroller).
