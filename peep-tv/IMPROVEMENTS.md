# PeepTV — improvement backlog

From a full read of the tvOS source on 2026-10-31. Ranked by what a viewer would
notice first. Effort: S = under a day, M = a few days, L = a week or more. None of
these have been verified on a physical Apple TV yet; items marked *bug* were found
by reading the code and should be reproduced before fixing.

## 1. Biggest wins for viewers

1. **Movies have no detail page.** Selecting a movie starts playback immediately
   (`HomeView.swift:230`, `MoviesView.swift:49`, `SearchView.swift:116`). Viewers never
   see the description, year, rating, trailer, My List or "more like this". Add a
   `MovieDetailView` mirroring `SeriesDetailView`, with Play/Resume, Start over, My List,
   and a related shelf ported from the web's `lib/recommendations.js`. **M**
2. **Resume is silent and can trap the viewer** (*bug*). Playback always resumes; if the
   seek fails the whole start path exits, so no ad, no playback, no progress saves
   (`PlayerView.swift:446-449`). Offer "Resume from X / Start over", and fall back to
   zero when the seek fails. **S**
3. **Up Next only after the credits roll, movies dead-end.** The card appears only on
   `AVPlayerItemDidPlayToEndTime` (`PlayerView.swift:412-418`); a finished movie sits on
   its last frame. Show Up Next during the credits (`contentProposalViewController` or a
   timed overlay) and show related titles after a movie. Also align autoplay with web:
   TV treats a null `autoplay_next` as on (`PlayerView.swift:326`), web requires `true`. **M**
4. **Series Resume and Continue Watching are weak.** `firstPlayable` only looks in the
   selected (first) season (`SeriesView.swift:55-66, 146`); Continue Watching only exists
   if an admin made a "continue" carousel (`HomeView.swift:76-85`); progress fetch pulls
   completed rows too (`SupabaseService.swift:366`, add `completed=eq.false`). **S–M**
5. **No channel surfing.** Up/Down on the video surface does nothing; only Right is
   handled (`LiveSurfView.swift:86`); the drawer shows no Now/Next; `ChannelPrograms` is
   never used; My List opens channels with an empty guide (`MoviesView.swift:185`). **M**
6. **Guide goes stale.** The EPG is a 6-hour window fetched once per catalog load
   (`SupabaseService.swift:499-503`, `StreamsView.swift:240`); the 15 s refresh loop never
   reloads it, errors silently clear it. Refresh every 5–10 min; consider a time grid. **M**
7. **Podcasts are second-class.** Audio plays in the video player on black with no
   artwork, no progress (`PodcastsView.swift:136`), no background audio (`project.yml`
   lacks `UIBackgroundModes: audio`), sorted by number not `published_at`
   (`SupabaseService.swift:469-471`), not searchable, not saveable. **M**
8. **Sign-in is keyboard-only.** A QR / device-code flow would remove the biggest TV
   friction; the app already draws QR codes (`ProfileMenuView.swift:416-447`). Needs a
   backend endpoint. **L**
9. **Profile picker blocks launch without doing anything.** Every cold start forces
   "Who's watching" (`SupabaseService.swift:59`) but progress and My List are shared
   per account. `ProfileSelectView.swift:77` also swallows the Menu button at the root
   (App Review risk). Make the picker optional and always let Menu exit (**S**); scope
   data per profile later (**L**).

## 2. Correctness

10. `AppConfiguration.swift:25-31` doesn't reject the two lost legacy projects the web
    app blocks. **S**
11. Catalog reads don't retry after a 401; only `sendPlayback` does
    (`SupabaseService.swift:146-221`). **S**
12. Single-channel live playback doesn't auto-reconnect; Multiview already has stall
    detection to reuse (`PlayerView.swift:168-175`, `MultiviewView.swift:226-258`). **M**
13. Search is a substring match over titles *and descriptions* for movies/series only,
    re-normalised on every keystroke (`SearchView.swift:15-23`, `Models.swift:475`).
    Precompute, prefer word-prefix matches, add channels and podcasts, consider
    `.searchable`. **M**
14. Search flashes a spinner on every return to the app (`SearchView.swift:158`). **S**
15. Home shelves keyed by position (`HomeView.swift:227`) can make focus jump during the
    15 s refresh; key by id. **S**
16. Blackout polling selects `*` with limit 200 instead of the blackout columns
    (`SupabaseService.swift:420, 495-498`). **S**

## 3. Performance

17. Images decode full-size on the main thread with no downsampling or request
    de-duplication (`CardViews.swift:78-84, 148-156`, `SeriesView.swift:240-269`,
    `HeroView.swift:137`). Use ImageIO thumbnailing off-main and a shared loader. **M**
18. Home, Live TV and LiveSurf each refetch channels, packages and carousels every 15 s;
    Multiview refetches all channels every 10 s with `select=*`. Poll curation at ~60 s
    and select only needed columns. **S**
19. `GuideEntry.date` builds two `ISO8601DateFormatter`s per call in hot loops
    (`Models.swift:119-126`). Use static formatters. **S**
20. Debug-only `LiveInbandReader.fetch` reads segments one byte at a time
    (`PlayerView.swift:1116-1123`). **S**

## 4. Platform features not yet built

21. Now Playing metadata is title-only (`PlayerView.swift:136-140`); add artwork,
    description, episode, live flag. **S**
22. No dynamic Top Shelf and no deep links (`onOpenURL`). **L**
23. Skip intro / credits markers — needs schema + web admin fields first, then
    `AVPlayerItem` boundary observers. **L**
24. No post-roll ads, unlike web. Decide whether TV should match. **S**

## 5. Design rules and accessibility

25. Yellow-rule mismatches vs `PLATFORM_SCOPE.md`: focused rail item uses a yellow
    *fill* (`ContentView.swift:459-462`); selected filter chips are grey
    (`CardViews.swift:172-187`); `StatusView` Retry is `.borderedProminent`; several
    unstyled system buttons (`ProfileMenuView.swift:30-52`, `PodcastsView.swift:67`,
    `AuthView.swift:94`, `PlayerView.swift:300-301, 380`, `MultiviewView.swift:419-435`). **S**
26. Low-contrast grey text (`Color(white: 0.4)` on black ≈ 3.7:1) at `HomeView.swift:51`,
    `AuthView.swift:40, 55`, `SearchView.swift:42, 95`. **S**
27. VoiceOver: unplayable episodes are silently skipped (`SeriesView.swift:208`); Top-10
    rank numbers hidden (`HomeView.swift:239`); Multiview picker has no logos/Now-Next. **S**

## 6. Release hygiene

28. Privacy manifest declares only UserDefaults/boot time; no collected-data types
    despite a persistent device id (`PlayerView.swift:590-592`), watch history, email
    and the IMA SDK. **S**
29. `Production.xcconfig` doesn't exist; `Local.xcconfig` points `INFOPLIST_FILE` at an
    absolute path outside the repo. **S**
30. Dead code: `PredictionsView`/`PredictionEventView` (~690 lines) are never reachable;
    `CatalogArtwork`, `LiveBadge`, `ChannelPrograms` unused. README lines 47/51 say
    podcasts, My List, progress sync and ads are not implemented — they are; line 299's
    "test tags bypass the cooldown" is not what the code does.

## Already solid

Blackout handling across single, preview and multiview players; multiview audio
following focus; shared audio-session ownership; signed VOD URL validation; in-flight
catalog request caching; Reduce Motion support.
