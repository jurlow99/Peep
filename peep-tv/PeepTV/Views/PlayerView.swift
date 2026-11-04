import SwiftUI
import GoogleInteractiveMediaAds
import AVKit
import CoreImage.CIFilterBuiltins
import Combine
import OSLog

/// Used only on the serialized audio-session queue.
struct PlaybackAudioOwnership {
    private var owner: UUID?
    mutating func claim(_ owner: UUID?) { self.owner = owner }
    mutating func release(_ owner: UUID) -> Bool {
        guard self.owner == owner else { return false }
        self.owner = nil
        return true
    }
}

// AVAudioSession mutations can block while the system negotiates an audio route.
// Serialize them off the UI thread, including transitions between playback modes.
enum PlaybackAudioSession {
    private static let queue = DispatchQueue(label: "tv.watchpeep.audio-session", qos: .userInitiated)

    private static var ownership = PlaybackAudioOwnership()

    static func activate(intro: Bool = false, owner: UUID? = nil) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async {
                do {
                    let session = AVAudioSession.sharedInstance()
                    try session.setCategory(.playback, mode: intro ? .default : .moviePlayback,
                                            options: intro ? [.mixWithOthers] : [])
                    try session.setActive(true)
                    ownership.claim(owner)
                    continuation.resume()
                } catch { continuation.resume(throwing: error) }
            }
        }
    }

    // prepareToPlay/play may activate AVAudioSession internally even after an
    // explicit activation. Keep the entire intro startup on this same queue.
    static func startIntro(data: Data) async throws -> AVAudioPlayer {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                do {
                    dispatchPrecondition(condition: .notOnQueue(.main))
                    let player = try AVAudioPlayer(data: data, fileTypeHint: AVFileType.wav.rawValue)
                    player.volume = 0.8
                    guard player.prepareToPlay(), player.play() else {
                        throw NSError(domain: "PeepLaunchAudio", code: 1,
                                      userInfo: [NSLocalizedDescriptionKey: "Audio output could not start."])
                    }
                    continuation.resume(returning: player)
                } catch { continuation.resume(throwing: error) }
            }
        }
    }

    static func stopIntro(_ player: AVAudioPlayer) {
        queue.async { player.stop() }
    }

    static func deactivate(owner: UUID) {
        queue.async {
            guard ownership.release(owner) else { return }
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}

enum PlaybackQuality: String, CaseIterable {
    case automatic = "Automatic", dataSaver = "Data Saver"
    var peakBitRate: Double { self == .dataSaver ? 2_000_000 : 0 }
}

enum SubtitlePreference: String, CaseIterable {
    case system = "System Default", on = "On When Available", off = "Off"
}

@MainActor
final class PlaybackPreferences: ObservableObject {
    static let shared = PlaybackPreferences()
    private let defaults: UserDefaults
    @Published var startAutomatically: Bool { didSet { defaults.set(startAutomatically, forKey: "peep_tv_playback_start") } }
    @Published var autoplayNext: Bool { didSet { defaults.set(autoplayNext, forKey: "peep_tv_autoplay_next") } }
    @Published var quality: PlaybackQuality { didSet { defaults.set(quality.rawValue, forKey: "peep_tv_playback_quality") } }
    @Published var subtitles: SubtitlePreference { didSet { defaults.set(subtitles.rawValue, forKey: "peep_tv_playback_subtitles") } }
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        autoplayNext = defaults.object(forKey: "peep_tv_autoplay_next") as? Bool ?? true
        startAutomatically = defaults.object(forKey: "peep_tv_playback_start") as? Bool ?? true
        quality = PlaybackQuality(rawValue: defaults.string(forKey: "peep_tv_playback_quality") ?? "") ?? .automatic
        subtitles = SubtitlePreference(rawValue: defaults.string(forKey: "peep_tv_playback_subtitles") ?? "") ?? .system
    }
    func reset() { startAutomatically = true; autoplayNext = true; quality = .automatic; subtitles = .system }
    func applyQuality(to item: AVPlayerItem) { item.preferredPeakBitRate = quality.peakBitRate }
}

@MainActor
private final class LiveBlackoutPolicy {
    var channel: Channel?
    init(_ channel: Channel?) { self.channel = channel }
}

// One player per presentation; SwiftUI body updates must never recreate it.
@MainActor
final class PlayerModel: ObservableObject {
    let player: AVPlayer
    @Published private(set) var blackoutMessage: String?
    private var currentURL: URL?
    private var currentTitle = ""
    @Published var errorMessage: String?
    private var observation: NSKeyValueObservation?
    private var subtitleTask: Task<Void, Never>?
    private var audioTask: Task<Void, Never>?
    private var audioOwner = UUID()
    private let preferences: PlaybackPreferences
    @Published var subtitleNotice: String?
    var metadata: PlaybackMetadata?
    /// Live channels retune themselves after a failure or a long stall, like Multiview tiles.
    let live: Bool
    private var recoveryAttempts = 0
    private var stallWatch: Task<Void, Never>?

    init(url: URL, title: String, metadata: PlaybackMetadata? = nil, live: Bool = false, preferences: PlaybackPreferences? = nil) {
        self.preferences = preferences ?? .shared
        self.metadata = metadata
        self.live = live
        player = AVPlayer()
        tune(url: url, title: title)
    }

    /// Two quiet retunes before the viewer sees an error; a healthy stretch resets the budget.
    private func recover(from item: AVPlayerItem, reason: String) -> Bool {
        guard live, player.currentItem === item, blackoutMessage == nil, recoveryAttempts < 2, let currentURL else { return false }
        recoveryAttempts += 1
        subtitleNotice = "Reconnecting…"
        let title = currentTitle
        Task { [weak self] in
            do { try await Task.sleep(for: .seconds(2)) } catch { return }
            guard let self, self.player.currentItem === item else { return }
            self.tune(url: currentURL, title: title)
            self.startIfEnabled()
        }
        return true
    }
    private func watchForStalls(_ item: AVPlayerItem) {
        stallWatch?.cancel()
        guard live else { return }
        stallWatch = Task { [weak self] in
            var stalledFor = 0, healthyFor = 0
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                guard let self, self.player.currentItem === item else { return }
                switch self.player.timeControlStatus {
                case .playing:
                    stalledFor = 0; healthyFor += 1
                    if healthyFor >= 20 { self.recoveryAttempts = 0; if self.subtitleNotice == "Reconnecting…" { self.subtitleNotice = nil } }
                case .waitingToPlayAtSpecifiedRate:
                    healthyFor = 0; stalledFor += 1
                    if stalledFor >= 15, self.recover(from: item, reason: "stall") { return }
                default: stalledFor = 0
                }
            }
        }
    }

    nonisolated static func metadataItems(title: String, metadata: PlaybackMetadata?) -> [AVMetadataItem] {
        func item(_ identifier: AVMetadataIdentifier, _ value: String?) -> AVMetadataItem? {
            guard let value, !value.isEmpty else { return nil }
            let entry = AVMutableMetadataItem()
            entry.identifier = identifier; entry.value = value as NSString; entry.extendedLanguageTag = "und"
            return entry
        }
        return [item(.commonIdentifierTitle, metadata?.title ?? title),
                item(.iTunesMetadataTrackSubTitle, metadata?.subtitle),
                item(.commonIdentifierDescription, metadata?.description)].compactMap { $0 }
    }

    func tune(url: URL, title: String) {
        currentURL = url
        currentTitle = title
        guard blackoutMessage == nil else { player.replaceCurrentItem(with: nil); return }
        observation = nil
        subtitleTask?.cancel()
        subtitleNotice = nil
        errorMessage = nil
        let item = AVPlayerItem(url: url)
        preferences.applyQuality(to: item)
        item.externalMetadata = Self.metadataItems(title: title, metadata: metadata)
        if let artwork = metadata?.artwork {
            Task { [weak self] in
                guard let image = await UpNextArtwork.load(artwork), let data = image.jpegData(compressionQuality: 0.85),
                      let self, self.player.currentItem === item else { return }
                let entry = AVMutableMetadataItem()
                entry.identifier = .commonIdentifierArtwork; entry.value = data as NSData
                entry.dataType = kCMMetadataBaseDataType_JPEG as String; entry.extendedLanguageTag = "und"
                item.externalMetadata = item.externalMetadata + [entry]
            }
        }
        player.replaceCurrentItem(with: item)
        let subtitlePreference = preferences.subtitles
        subtitleTask = Task { [weak self] in
            do {
                let group = try await item.asset.loadMediaSelectionGroup(for: .legible)
                guard !Task.isCancelled, let self, self.player.currentItem === item else { return }
                guard let group else {
                    if subtitlePreference == .on { self.subtitleNotice = "This stream has no selectable subtitles." }
                    return
                }
                switch subtitlePreference {
                case .system: item.selectMediaOptionAutomatically(in: group)
                case .off:
                    if group.allowsEmptySelection { item.select(nil, in: group) }
                    else { self.subtitleNotice = "This stream requires its subtitle track." }
                case .on:
                    let playable = AVMediaSelectionGroup.playableMediaSelectionOptions(from: group.options)
                    let preferred = AVMediaSelectionGroup.mediaSelectionOptions(from: playable, filteredAndSortedAccordingToPreferredLanguages: Locale.preferredLanguages)
                    if let option = preferred.first ?? group.defaultOption ?? playable.first {
                        item.select(option, in: group)
                    } else { self.subtitleNotice = "This stream has no selectable subtitles." }
                }
            } catch {
                guard !Task.isCancelled, let self, self.player.currentItem === item else { return }
                if subtitlePreference != .system { self.subtitleNotice = "Subtitle options could not be loaded. Use the player's subtitle menu to check." }
            }
        }
        observation = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
            guard item.status == .failed else { return }
            let message = item.error?.localizedDescription ?? "This video can't be played right now."
            Task { @MainActor [weak self] in
                guard let self, self.player.currentItem === item else { return }
                if !self.recover(from: item, reason: "failed") { self.errorMessage = message }
            }
        }
        watchForStalls(item)
    }

    func applyBlackout(_ message: String?) {
        guard blackoutMessage != message else { return }
        let wasBlocked = blackoutMessage != nil
        blackoutMessage = message
        if message != nil {
            observation = nil
            subtitleTask?.cancel()
            errorMessage = nil
            player.pause()
            // Remove buffered video and audio, rather than merely hiding it.
            player.replaceCurrentItem(with: nil)
        } else if wasBlocked, let currentURL {
            tune(url: currentURL, title: currentTitle)
            startIfEnabled()
        }
    }

    func monitorBlackout(channelID: Int, initial: Channel? = nil, service: SupabaseService) async {
        let policy = LiveBlackoutPolicy(initial)
        await withTaskGroup(of: Void.self) { group in
            group.addTask { @MainActor in
                while !Task.isCancelled {
                    let latest = try? await service.fetchChannel(id: channelID)
                    guard !Task.isCancelled else { return }
                    if let latest { policy.channel = latest }
                    do { try await Task.sleep(for: .seconds(10)) } catch { return }
                }
            }
            // A slow metadata request must not delay a known schedule boundary.
            while !Task.isCancelled {
                if let channel = policy.channel { applyBlackout(channel.blackoutMessage()) }
                do { try await Task.sleep(for: .seconds(1)) } catch { break }
            }
            group.cancelAll()
        }
    }

    func startIfEnabled() {
        if preferences.startAutomatically { play() } else { player.pause() }
    }

    func play() {
        guard blackoutMessage == nil else { return }
        audioTask?.cancel()
        audioOwner = UUID()
        let owner = audioOwner
        audioTask = Task { @MainActor [weak self] in
            do {
                guard !Task.isCancelled else { return }
                try await PlaybackAudioSession.activate(owner: owner)
                guard !Task.isCancelled, let self, self.blackoutMessage == nil else {
                    PlaybackAudioSession.deactivate(owner: owner)
                    return
                }
                self.player.play()
            } catch {
                guard !Task.isCancelled else { return }
                self?.errorMessage = error.localizedDescription
            }
        }
    }
    /// Wait until the item can seek; never silently play from zero after a
    /// failed resume. Retuning or cancelling must not seek a different item.
    func resume(at position: Double) async -> Bool {
        guard position.isFinite, position >= 0, let item = player.currentItem else { return false }
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: .seconds(8))
        while item.status == .unknown && clock.now < deadline {
            guard !Task.isCancelled, player.currentItem === item else { return false }
            do { try await Task.sleep(for: .milliseconds(50)) } catch { return false }
        }
        guard !Task.isCancelled, player.currentItem === item, item.status == .readyToPlay else {
            if !Task.isCancelled { errorMessage = "Couldn't restore your position. Please try again." }
            return false
        }
        let duration = item.duration.seconds
        let target = ResumePosition.target(saved: position, duration: duration)
        guard let target else { errorMessage = "Couldn't restore your position. Please try again."; return false }
        let restored = await player.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        guard !Task.isCancelled, player.currentItem === item else { return false }
        if !restored { errorMessage = "Couldn't restore your position. Please try again." }
        return restored
    }

    func stop() {
        stallWatch?.cancel()
        audioTask?.cancel()
        subtitleTask?.cancel()
        player.pause()
        PlaybackAudioSession.deactivate(owner: audioOwner)
    }
}

struct PlaybackView: View {
    let url: URL?
    let title: String
    var identity: PlaybackIdentity? = nil
    var liveChannelID: Int? = nil
    var startFromBeginning = false
    var related: [Video] = []
    var openRelated: (Video) -> Void = { _ in }
    var metadata: PlaybackMetadata? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var currentEpisode: Episode?
    @State private var nextEpisode: Episode?
    @State private var seriesAllowsAutoplay = false
    @State private var introWindow: ClosedRange<Double>?
    @State private var adBreaks: [Int]?
    /// The info panel follows the episode actually playing: after Up Next (or autoplay)
    /// the opening episode's title and description must not stay on screen.
    private var playbackMetadata: PlaybackMetadata? {
        guard let episode = currentEpisode else { return metadata }
        let show = metadata?.subtitle?.components(separatedBy: " · ").first
        let place = SeriesPlayback.isExtra(episode) ? "Extras" : "Season \(episode.season ?? 1), Episode \(episode.episode_number ?? 1)"
        return PlaybackMetadata(title: episode.displayTitle, subtitle: [show, place].compactMap { $0 }.joined(separator: " · "),
                                description: episode.description, artwork: episode.thumbURL ?? metadata?.artwork, isLive: false, audioOnly: metadata?.audioOnly ?? false)
    }
    private var playbackIdentity: PlaybackIdentity? { currentEpisode.map { PlaybackIdentity(id: String($0.id), type: "episode") } ?? identity }
    @State private var attempt = UUID()
    @EnvironmentObject private var service: SupabaseService
    @State private var resolvedURL: URL?
    @State private var resolutionError: String?

    var body: some View {
        Group {
            if let resolvedURL {
                PlayerView(url: resolvedURL, title: currentEpisode?.displayTitle ?? title, identity: playbackIdentity, liveChannelID: liveChannelID, startFromBeginning: startFromBeginning, metadata: playbackMetadata,
                           nextEpisode: nextEpisode, seriesAllowsAutoplay: seriesAllowsAutoplay, introWindow: introWindow, adBreaks: adBreaks, related: related, openRelated: openRelated, playNext: {
                    guard let nextEpisode else { return }
                    currentEpisode = nextEpisode
                    self.resolvedURL = nil
                    attempt = UUID()
                }, retry: {
                    self.resolvedURL = nil; attempt = UUID()
                }).id(attempt)
            } else if let resolutionError {
                VStack {
                    StatusView(title: "Video unavailable", message: resolutionError, symbol: "play.slash")
                    HStack(spacing: 20) {
                        Button { attempt = UUID() } label: { PlayerActionLabel("Try again", symbol: "arrow.clockwise") }.buttonStyle(BrowseCardStyle())
                        Button { dismiss() } label: { PlayerActionLabel("Back", symbol: "chevron.left") }.buttonStyle(BrowseCardStyle())
                    }.padding(.bottom, 80)
                }.background(Color.black).onExitCommand { dismiss() }
            } else {
                ProgressView("Preparing playback…").frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black).onExitCommand { dismiss() }
            }
        }
        .task(id: attempt) {
            resolutionError = nil; resolvedURL = nil; nextEpisode = nil; seriesAllowsAutoplay = false; introWindow = nil; adBreaks = nil
            guard let url = currentEpisode?.videoURL ?? url else {
                resolutionError = "A direct video stream is not available for this title. Please choose another title."
                return
            }
            do {
                let playable = try await service.resolveVODPlayback(url)
                guard !Task.isCancelled else { return }
                resolvedURL = playable
                if let identity = playbackIdentity, identity.type == "episode" {
                    let current: [Episode] = try await service.get("episodes", query: ["id": "eq.\(identity.id)", "limit": "1"])
                    if let episode = current.first {
                        async let episodeRequest = service.fetchEpisodes(showId: episode.show_id)
                        async let showRequest: [Show] = service.get("shows", query: ["id": "eq.\(episode.show_id)", "limit": "1"])
                        let (episodes, shows) = try await (episodeRequest, showRequest)
                        guard !Task.isCancelled else { return }
                        nextEpisode = SeriesPlayback.next(after: episode, in: episodes)
                        seriesAllowsAutoplay = shows.first?.autoplay_next == true // explicit, like the web
                        introWindow = SeriesPlayback.introWindow(episode: episode, show: shows.first)
                        adBreaks = episode.ad_breaks
                    }
                } else if let identity = playbackIdentity, ["movie", "short"].contains(identity.type) {
                    // The title's own ad breaks; without any, the Ad rules timing applies.
                    let rows: [Video] = try await service.get("videos", query: ["id": "eq.\(identity.id)", "limit": "1"])
                    guard !Task.isCancelled else { return }
                    adBreaks = rows.first?.ad_breaks
                }
            } catch {
                guard !Task.isCancelled else { return }
                if resolvedURL == nil { resolutionError = error.localizedDescription }
            }
        }
    }
}

struct PlayerView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.preparePlayback) private var preparePlayback
    @EnvironmentObject private var supabase: SupabaseService
    let identity: PlaybackIdentity?
    let liveChannelID: Int?
    let startFromBeginning: Bool
    let title: String
    let metadata: PlaybackMetadata?
    var nextEpisode: Episode?
    let seriesAllowsAutoplay: Bool
    let introWindow: ClosedRange<Double>?
    let adBreaks: [Int]?
    @State private var offerSkip = false
    @State private var pauseAd: PauseAd?
    @State private var pauseAdCounted = false
    @State private var pauseKey = 0 // bumps on every pause, so each pause asks at most once
    let related: [Video]
    let openRelated: (Video) -> Void
    let playNext: () -> Void
    @State private var proposal: AVContentProposal?
    @State private var showEnd = false
    @FocusState private var endFocused: Bool
    @ObservedObject private var preferences = PlaybackPreferences.shared
    @State private var showNext = false
    @State private var countdown = 10
    @State private var countdownCancelled = false
    @State private var endHandled = false
    @FocusState private var nextFocused: Bool
    @State private var contentStarted = false
    @State private var progressUserID: String?
    @StateObject private var adGate = CSAIGate()
    @StateObject private var model: PlayerModel
    @Environment(\.dismiss) private var dismiss
    let retry: () -> Void

    init(url: URL, title: String, identity: PlaybackIdentity? = nil, liveChannelID: Int? = nil, startFromBeginning: Bool = false, metadata: PlaybackMetadata? = nil, nextEpisode: Episode? = nil, seriesAllowsAutoplay: Bool = false, introWindow: ClosedRange<Double>? = nil, adBreaks: [Int]? = nil, related: [Video] = [], openRelated: @escaping (Video) -> Void = { _ in }, playNext: @escaping () -> Void = {}, retry: @escaping () -> Void) {
        self.title = title
        self.introWindow = introWindow
        self.adBreaks = adBreaks
        self.metadata = metadata
        self.related = related
        self.openRelated = openRelated
        self.nextEpisode = nextEpisode
        self.seriesAllowsAutoplay = seriesAllowsAutoplay
        self.playNext = playNext
        self.identity = identity
        self.liveChannelID = liveChannelID
        self.startFromBeginning = startFromBeginning
        _model = StateObject(wrappedValue: PlayerModel(url: url, title: title, metadata: metadata, live: liveChannelID != nil))
        self.retry = retry
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let message = model.blackoutMessage {
                VStack(spacing: 24) {
                    StatusView(title: "Channel temporarily unavailable", message: message, symbol: "tv.slash")
                    Button { dismiss() } label: { PlayerActionLabel("Back", symbol: "chevron.left") }.buttonStyle(BrowseCardStyle()).padding(.bottom, 80)
                }
            } else if let error = model.errorMessage {
                VStack {
                    StatusView(title: "Playback interrupted", message: error, retry: retry)
                    Button { dismiss() } label: { PlayerActionLabel("Back", symbol: "chevron.left") }.buttonStyle(BrowseCardStyle()).padding(.bottom, 80)
                }.background(Color.black)
            } else {
                // A live mid-roll keeps the channel's player running (muted) underneath. Any other
                // break takes the paused player off screen: left in place, it keeps the remote's
                // focus and the ad's Skip button can never be reached.
                if (!adGate.blocking || (adGate.isMidroll && liveChannelID != nil)) && !showNext && !showEnd {
                    NativePlayer(player: model.player, interactive: !adGate.blocking, proposal: proposal, onAcceptProposal: nextEpisode == nil ? nil : playNext,
                                 skipIntro: offerSkip && introWindow != nil ? { skipIntro() } : nil,
                                 startOver: liveChannelID == nil && identity != nil ? { watchAgain() } : nil).ignoresSafeArea()
                    if let metadata, metadata.audioOnly { AudioArtworkOverlay(metadata: metadata) }
                }
            }
        }
        .squeezeAds(player: model.player, ready: contentStarted, key: "\(liveChannelID ?? 0):\(identity?.id ?? "")",
                    scope: liveChannelID != nil ? "live" : (identity?.type == "short" ? "movie" : identity?.type ?? "movie"),
                    contentID: liveChannelID.map(String.init) ?? identity?.id ?? "",
                    context: liveChannelID != nil ? AdContext(channel: title, contentType: "live") : AdContext(show: title),
                    busy: showNext || showEnd || pauseAd != nil || model.errorMessage != nil || model.blackoutMessage != nil, gate: adGate)
        .overlay {
            if showNext, let episode = nextEpisode {
                ZStack {
                    // The next episode's own artwork, blurred, is the backdrop: no banded gradient.
                    EndScreenBackdrop(url: episode.thumbURL)
                    HStack(spacing: 54) {
                        EpisodeArtwork(url: episode.thumbURL, fallback: nil)
                            .frame(width: 560, height: 315).clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                            .shadow(color: .black.opacity(0.55), radius: 30, y: 14)
                        VStack(alignment: .leading, spacing: 22) {
                            Text("UP NEXT").font(.system(size: 18, weight: .bold)).tracking(4).foregroundStyle(.secondary)
                            Text(episode.displayTitle).font(.system(size: 42, weight: .bold, design: .rounded)).lineLimit(2)
                            Text(SeriesPlayback.isExtra(episode) ? "Extras" : "Season \(episode.season ?? 1) · Episode \(episode.episode_number ?? 1)").font(.system(size: 23)).foregroundStyle(.secondary)
                            if !countdownCancelled && preferences.autoplayNext && seriesAllowsAutoplay {
                                Text("Playing in \(countdown) second\(countdown == 1 ? "" : "s")").font(.system(size: 23)).monospacedDigit()
                                    .contentTransition(.numericText(countsDown: true)).animation(.easeInOut(duration: 0.3), value: countdown)
                            }
                            HStack(spacing: 20) {
                                let countingDown = !countdownCancelled && preferences.autoplayNext && seriesAllowsAutoplay
                                Button(action: playNext) { PlayerActionLabel("Play next", symbol: "play.fill") }
                                    .buttonStyle(BrowseCardStyle()).focused($nextFocused)
                                Button { if countingDown { countdownCancelled = true } else { dismiss() } } label: {
                                    PlayerActionLabel(countingDown ? "Cancel autoplay" : "Back", symbol: countingDown ? "xmark" : "chevron.left")
                                }.buttonStyle(BrowseCardStyle())
                            }
                        }.frame(width: 650, alignment: .leading)
                    }.padding(80)
                }.transition(.opacity).onAppear { nextFocused = true }
            } else if showEnd {
                ZStack {
                    EndScreenBackdrop(url: metadata?.artwork)
                    VStack(alignment: .leading, spacing: 28) {
                        Text("THAT'S THE END").font(.system(size: 18, weight: .bold)).tracking(4).foregroundStyle(.secondary)
                        Text(title).font(.system(size: 42, weight: .bold, design: .rounded)).lineLimit(2)
                        HStack(spacing: 20) {
                            Button(action: watchAgain) { PlayerActionLabel("Watch again", symbol: "arrow.counterclockwise") }
                                .buttonStyle(BrowseCardStyle()).focused($endFocused)
                            Button { dismiss() } label: { PlayerActionLabel("Back", symbol: "chevron.left") }.buttonStyle(BrowseCardStyle())
                        }
                        if !related.isEmpty {
                            Text("More like this").font(.system(size: 28, weight: .bold, design: .rounded)).padding(.top, 12)
                            ScrollView(.horizontal, showsIndicators: false) {
                                LazyHStack(alignment: .top, spacing: 24) {
                                    ForEach(related.prefix(6)) { item in
                                        VideoCardView(video: item, width: 220) { openRelated(item) }
                                    }
                                }.padding(.vertical, 20)
                            }.focusSection()
                        }
                    }.padding(80).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }.transition(.opacity).onAppear { endFocused = true }
            }
        }
        .animation(.easeInOut(duration: 0.6), value: showNext)
        .animation(.easeInOut(duration: 0.6), value: showEnd)
        // Skip intro: poll the clock while inside the window; the native player shows the action.
        .task(id: "\(contentStarted):\(introWindow?.lowerBound ?? -1):\(introWindow?.upperBound ?? -1)") {
            guard contentStarted, let introWindow else { offerSkip = false; return }
            while !Task.isCancelled {
                let time = model.player.currentTime().seconds
                let offer = SeriesPlayback.shouldOfferSkip(introWindow, at: time)
                if offer != offerSkip { offerSkip = offer }
                if time > introWindow.upperBound + 2 { return } // past the intro; nothing more to do
                do { try await Task.sleep(for: .milliseconds(500)) } catch { return }
            }
        }
        // Build the native Up Next proposal once the item's length is known.
        .task(id: "\(contentStarted):\(nextEpisode?.id ?? 0):\(preferences.autoplayNext)") {
            guard contentStarted, let episode = nextEpisode else { proposal = nil; return }
            var duration = model.player.currentItem?.duration.seconds ?? .nan
            while !(duration.isFinite && duration > 0) {
                do { try await Task.sleep(for: .milliseconds(500)) } catch { return }
                duration = model.player.currentItem?.duration.seconds ?? .nan
            }
            guard let transition = UpNextTiming.transitionTime(duration: duration) else { return }
            let image = await UpNextArtwork.load(episode.thumbURL)
            guard !Task.isCancelled else { return }
            let next = AVContentProposal(contentTimeForTransition: CMTime(seconds: transition, preferredTimescale: 600), title: episode.displayTitle, previewImage: image)
            next.automaticAcceptanceInterval = preferences.autoplayNext && seriesAllowsAutoplay ? 10 : -1
            proposal = next
        }
        // Mid-rolls in movies and episodes, on the Ad rules cue points. Seeking past
        // several cue points plays one break; cue points before where playback
        // started (a resume) are skipped so a mid-roll never follows the pre-roll.
        .task(id: contentStarted) {
            guard contentStarted, liveChannelID == nil, let identity else { return }
            let scope = identity.type == "short" ? "movie" : identity.type
            var duration = model.player.currentItem?.duration.seconds ?? .nan
            while !(duration.isFinite && duration > 0) {
                do { try await Task.sleep(for: .milliseconds(500)) } catch { return }
                duration = model.player.currentItem?.duration.seconds ?? .nan
            }
            let policy = await CSAIGate.loadPolicy(supabase)
            let cues = policy.cuePoints(duration: duration, titleBreaks: adBreaks)
            // Tubi-style marks on the native scrub bar, one per break.
            model.player.currentItem?.interstitialTimeRanges = cues.map {
                AVInterstitialTimeRange(timeRange: CMTimeRange(start: CMTime(seconds: $0, preferredTimescale: 600), duration: CMTime(seconds: 1, preferredTimescale: 600)))
            }
            let start = model.player.currentTime().seconds
            var next = cues.firstIndex { $0 > start + 1 } ?? cues.count
            while !Task.isCancelled, next < cues.count {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                guard !adGate.blocking, !showNext, !showEnd, model.player.rate > 0 else { continue }
                let time = model.player.currentTime().seconds
                guard time >= cues[next] else { continue }
                while next < cues.count && time >= cues[next] { next += 1 }
                model.player.pause()
                adGate.context = AdContext(show: title)
                let stayed = await adGate.runMidroll(service: supabase, scope: scope, contentID: identity.id)
                guard stayed, !Task.isCancelled else { return }
                model.player.play()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { notification in
            guard contentStarted, !adGate.blocking, !endHandled,
                  let item = notification.object as? AVPlayerItem, item === model.player.currentItem else { return }
            endHandled = true
            Task { await saveProgress() }
            if nextEpisode != nil { showNext = true }
            else if liveChannelID == nil, identity != nil { showEnd = true }
        }
        .task(id: "\(showNext):\(scenePhase == .active)") {
            guard showNext, scenePhase == .active, preferences.autoplayNext, seriesAllowsAutoplay else { return }
            while countdown > 0 {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                guard !countdownCancelled, preferences.autoplayNext else { return }
                countdown -= 1
            }
            guard !Task.isCancelled else { return }
            playNext()
        }
        // Pause ad: on the right, clear of the native controls; never takes focus. The QR
        // code (only when the ad has a link) sits beside the picture, never over its art.
        .overlay(alignment: .trailing) {
            if let pauseAd, !adGate.blocking, !showNext, !showEnd {
                AsyncImage(url: pauseAd.image) { phase in
                    if let image = phase.image {
                        HStack(alignment: .bottom, spacing: 24) {
                            if let link = pauseAd.clickThrough, let qr = PauseAdQR.image(for: link) { AdQRCode(image: qr) }
                            image.resizable().aspectRatio(pauseAd.width / max(1, pauseAd.height), contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                .overlay(alignment: .topLeading) {
                                    Text("Ad").font(.system(size: 18, weight: .bold)).padding(.horizontal, 10).padding(.vertical, 4)
                                        .background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 8)).padding(12)
                                }
                                .frame(width: 620)
                        }
                        .shadow(color: .black.opacity(0.55), radius: 30, y: 12)
                        .onAppear { countPauseAd() }
                    }
                }
                .padding(.trailing, 90).allowsHitTesting(false).transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: pauseAd)
        // Ask for a pause ad ~2 s into a pause (once per pause); drop it the moment play resumes.
        .task(id: "\(contentStarted):\(pauseKey)") {
            guard contentStarted, model.player.timeControlStatus == .paused, pauseAd == nil else { if model.player.timeControlStatus != .paused { pauseAd = nil }; return }
            do { try await Task.sleep(for: .seconds(2)) } catch { return }
            guard model.player.timeControlStatus == .paused, !adGate.blocking, !showNext, !showEnd, model.errorMessage == nil else { return }
            let scope = liveChannelID != nil ? "live" : (identity?.type == "short" ? "movie" : identity?.type ?? "movie")
            let context = liveChannelID != nil ? AdContext(channel: title, contentType: "live") : AdContext(show: title)
            guard let (ad, _) = await PauseAd.load(service: supabase, scope: scope, contentID: liveChannelID.map(String.init) ?? identity?.id ?? "", context: context),
                  !Task.isCancelled, model.player.timeControlStatus == .paused, !adGate.blocking else { return }
            pauseAdCounted = false; pauseAd = ad
        }
        .onReceive(model.player.publisher(for: \.timeControlStatus)) { status in
            if status != .paused { pauseAd = nil }
            pauseKey = status == .paused ? pauseKey + 1 : pauseKey
        }
        .overlay { CSAIOverlay(gate: adGate, cancel: { dismiss() }) }
        .liveMidroll(player: model.player, channelID: liveChannelID, gate: adGate, ready: contentStarted)
        .liveViewing(player: model.player, channelID: adGate.blocking ? nil : liveChannelID)
        .vodViewing(player: model.player, identity: contentStarted && liveChannelID == nil ? identity : nil)
        .overlay(alignment: .top) {
            if let notice = model.subtitleNotice { Text(notice).font(.system(size: 20)).padding(12).background(.black.opacity(0.8), in: Capsule()).padding(.top, 35).allowsHitTesting(false) }
        }
        .task {
            preparePlayback()
            if let liveChannelID {
                guard let channel = try? await supabase.fetchChannel(id: liveChannelID) else {
                    if !Task.isCancelled { model.errorMessage = "Channel availability couldn’t be checked. Please try again." }
                    return
                }
                guard !Task.isCancelled else { return }
                model.applyBlackout(channel.blackoutMessage())
            }
            progressUserID = supabase.session?.userId
            if let identity, progressUserID != nil, !startFromBeginning,
               let progress = try? await supabase.fetchWatchPosition(identity: identity), progress.canResume,
               !(await model.resume(at: progress.progress_seconds ?? 0)) {
                // A ready item that merely failed to seek still plays from the start; an item that
                // never became ready keeps the error so Retry stays meaningful.
                guard !Task.isCancelled, model.player.currentItem?.status == .readyToPlay else { return }
                model.errorMessage = nil
                model.subtitleNotice = "Couldn't restore your position, so this starts from the beginning."
            }
            guard !Task.isCancelled else { return }
            if model.blackoutMessage == nil, let scope = liveChannelID != nil ? "live" : identity?.type {
                adGate.context = liveChannelID != nil ? AdContext(channel: title, contentType: "live") : AdContext(show: title)
                guard await adGate.run(service: supabase, scope: scope == "short" ? "movie" : scope, contentID: liveChannelID.map(String.init) ?? identity?.id ?? ""), !Task.isCancelled else { return }
            }
            contentStarted = true
            model.startIfEnabled()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
                await saveProgress()
            }
        }
        .task(id: liveChannelID) {
            if let liveChannelID { await model.monitorBlackout(channelID: liveChannelID, service: supabase) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { Task { await saveProgress() } }
        }
        .onDisappear {
            adGate.cancel()
            let position = model.player.currentTime().seconds
            let duration = model.player.currentItem?.duration.seconds ?? 0
            if contentStarted, let identity, let userID = progressUserID { Task { try? await supabase.saveWatchProgress(identity: identity, position: position, duration: duration, userID: userID) } }
            model.stop()
        }
        .onExitCommand { dismiss() }
    }
    private func countPauseAd() {
        guard !pauseAdCounted, let ad = pauseAd else { return }
        pauseAdCounted = true
        for url in ad.impressions { Task { _ = try? await URLSession.shared.data(from: url) } }
    }
    private func skipIntro() {
        guard let introWindow else { return }
        offerSkip = false
        model.player.seek(to: CMTime(seconds: introWindow.upperBound, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .positiveInfinity)
        model.player.play()
    }
    private func watchAgain() {
        showEnd = false; endHandled = false
        model.player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
        model.player.play()
    }
    private func saveProgress() async {
        guard contentStarted, let identity, let userID = progressUserID else { return }
        try? await supabase.saveWatchProgress(identity: identity, position: model.player.currentTime().seconds,
                                              duration: model.player.currentItem?.duration.seconds ?? 0, userID: userID)
    }
}

final class GuidePlayerController: AVPlayerViewController {
    var guideExit: (() -> Void)?
    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        if presses.contains(where: { $0.type == .menu }), let guideExit {
            guideExit()
            return
        }
        super.pressesBegan(presses, with: event)
    }
    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        if presses.contains(where: { $0.type == .menu }), guideExit != nil { return }
        super.pressesEnded(presses, with: event)
    }
}

struct NativePlayer: UIViewControllerRepresentable {
    let player: AVPlayer
    var onExit: (() -> Void)? = nil
    var interactive = true
    var pauseOnDismantle = true
    var videoGravity: AVLayerVideoGravity = .resizeAspect
    var onVideoReady: ((AVPlayerItem) -> Void)? = nil
    var proposal: AVContentProposal? = nil
    var onAcceptProposal: (() -> Void)? = nil
    var skipIntro: (() -> Void)? = nil   // when set, the native "Skip Intro" action is offered
    var startOver: (() -> Void)? = nil   // when set, the info bar offers "Start over"

    private func applyContextualActions(_ controller: AVPlayerViewController) {
        let wanted = skipIntro != nil
        if wanted == !controller.contextualActions.isEmpty { return }
        controller.contextualActions = wanted ? [UIAction(title: "Skip Intro", image: UIImage(systemName: "forward.end.fill")) { [skipIntro] _ in skipIntro?() }] : []
    }
    private func applyStartOver(_ controller: AVPlayerViewController) {
        if (startOver != nil) == !controller.transportBarCustomMenuItems.isEmpty { return }
        controller.transportBarCustomMenuItems = startOver == nil ? [] : [UIAction(title: "Start over", image: UIImage(systemName: "arrow.counterclockwise")) { [startOver] _ in startOver?() }]
    }

    final class Coordinator: NSObject, AVPlayerViewControllerDelegate {
        var pauseOnDismantle = true
        var onAcceptProposal: (() -> Void)?
        func playerViewController(_ playerViewController: AVPlayerViewController, shouldPresent proposal: AVContentProposal) -> Bool { onAcceptProposal != nil }
        func playerViewController(_ playerViewController: AVPlayerViewController, didAccept proposal: AVContentProposal) { onAcceptProposal?() }
        func playerViewController(_ playerViewController: AVPlayerViewController, didReject proposal: AVContentProposal) {}
        var displayObservation: NSKeyValueObservation?
        var onVideoReady: ((AVPlayerItem) -> Void)?
        var onExit: (() -> Void)?
        func playerViewControllerShouldDismiss(_ playerViewController: AVPlayerViewController) -> Bool {
            guard let onExit else { return true }
            onExit()
            return false
        }
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = GuidePlayerController()
        controller.guideExit = onExit
        controller.player = player
        controller.delegate = context.coordinator
        context.coordinator.onExit = onExit
        context.coordinator.pauseOnDismantle = pauseOnDismantle
        controller.videoGravity = videoGravity
        controller.showsPlaybackControls = interactive
        controller.view.isUserInteractionEnabled = interactive
        context.coordinator.onVideoReady = onVideoReady
        context.coordinator.onAcceptProposal = onAcceptProposal
        controller.player?.currentItem?.nextContentProposal = proposal
        applyContextualActions(controller)
        applyStartOver(controller)
        context.coordinator.displayObservation = controller.observe(\.isReadyForDisplay, options: [.initial, .new]) { [weak coordinator = context.coordinator, weak controller] _, _ in
            Task { @MainActor in
                guard let controller, controller.isReadyForDisplay, let item = controller.player?.currentItem else { return }
                coordinator?.onVideoReady?(item)
            }
        }
        return controller
    }
    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
        context.coordinator.onExit = onExit
        context.coordinator.onAcceptProposal = onAcceptProposal
        if let item = controller.player?.currentItem, item.nextContentProposal !== proposal { item.nextContentProposal = proposal }
        applyContextualActions(controller)
        applyStartOver(controller)
        context.coordinator.onVideoReady = onVideoReady
        context.coordinator.pauseOnDismantle = pauseOnDismantle
        let becameInteractive = !controller.view.isUserInteractionEnabled && interactive
        controller.videoGravity = videoGravity
        controller.showsPlaybackControls = interactive
        controller.view.isUserInteractionEnabled = interactive
        if becameInteractive {
            DispatchQueue.main.async {
                controller.setNeedsFocusUpdate()
                controller.updateFocusIfNeeded()
            }
        }
        (controller as? GuidePlayerController)?.guideExit = onExit
    }
    static func dismantleUIViewController(_ controller: AVPlayerViewController, coordinator: Coordinator) {
        coordinator.displayObservation = nil
        coordinator.onVideoReady = nil
        if coordinator.pauseOnDismantle { controller.player?.pause() }
        controller.player = nil
    }
}

enum LiveViewingEnvironment {
    static var platform: String {
        #if targetEnvironment(simulator)
        return "tvos_simulator"
        #else
        return "tvos"
        #endif
    }
}

// Samples media advancement rather than time spent on a screen or buffering.
// Live channels report to record_live_viewing, movies/episodes to record_vod_viewing;
// both feed the admin Reports (MOU, channel stats, platform analytics).
@MainActor
private final class LiveViewingTracker {
    private let player: AVPlayer
    private let rpc: String
    private let fields: [String: Any]
    private let service: SupabaseService
    private let deviceID: String
    private var sessionID = UUID().uuidString
    private var token = UUID().uuidString
    private var started = false
    private var seconds: Double = 0
    private var lastWall = ProcessInfo.processInfo.systemUptime
    private var lastMedia: Double = 0
    private var lastSent = ProcessInfo.processInfo.systemUptime
    private var pending: Task<Void, Never>?

    init(player: AVPlayer, rpc: String, fields: [String: Any], service: SupabaseService) {
        self.player = player; self.rpc = rpc; self.fields = fields; self.service = service
        let key = "peep_live_device_id"
        deviceID = UserDefaults.standard.string(forKey: key) ?? UUID().uuidString
        UserDefaults.standard.set(deviceID, forKey: key)
        lastMedia = player.currentTime().seconds
    }
    func run() async {
        defer { flush(end: true) }
        while !Task.isCancelled {
            do { try await Task.sleep(for: .seconds(1)) } catch { return }
            sample()
        }
    }
    private func sample() {
        let wall = ProcessInfo.processInfo.systemUptime
        let media = player.currentTime().seconds
        defer { lastWall = wall; lastMedia = media }
        guard UIApplication.shared.applicationState == .active, player.timeControlStatus == .playing, media.isFinite, lastMedia.isFinite, media > lastMedia else {
            if (UIApplication.shared.applicationState != .active || player.timeControlStatus == .paused) && started { flush(end: true) }
            return
        }
        if !started {
            sessionID = UUID().uuidString; token = UUID().uuidString; started = true
            flush(end: false)
        }
        seconds += min(max(0, wall - lastWall), media - lastMedia, 2)
        if wall - lastSent >= 15 { flush(end: false) }
    }
    private func flush(end: Bool) {
        guard started else { return }
        let payload = fields.merging(["p_session_id": sessionID, "p_token": token, "p_device_id": deviceID,
            "p_platform": LiveViewingEnvironment.platform, "p_seconds": min(30, seconds), "p_end": end]) { _, new in new }
        seconds = 0; lastSent = ProcessInfo.processInfo.systemUptime
        let previous = pending
        let service = service
        let path = "rpc/\(rpc)"
        pending = Task { await previous?.value; try? await service.post(path, body: payload) }
        if end { started = false }
    }
}
private struct LiveViewingModifier: ViewModifier {
    @EnvironmentObject private var service: SupabaseService
    let player: AVPlayer
    let channelID: Int?
    let mode: String
    func body(content: Content) -> some View {
        content.task(id: channelID) {
            guard let channelID else { return }
            await LiveViewingTracker(player: player, rpc: "record_live_viewing", fields: ["p_channel_id": channelID, "p_mode": mode], service: service).run()
        }
    }
}
private struct VODViewingModifier: ViewModifier {
    @EnvironmentObject private var service: SupabaseService
    let player: AVPlayer
    let identity: PlaybackIdentity?
    func body(content: Content) -> some View {
        content.task(id: identity) {
            guard let identity, let type = VODViewing.contentType(identity.type) else { return }
            await LiveViewingTracker(player: player, rpc: "record_vod_viewing", fields: ["p_content_type": type, "p_content_id": identity.id], service: service).run()
        }
    }
}
enum VODViewing {
    /// Movies arrive as "movie" or the legacy "short"; podcasts aren't measured.
    static func contentType(_ type: String) -> String? {
        switch type { case "movie", "short": return "movie"; case "episode": return "episode"; default: return nil }
    }
}
extension View {
    func liveViewing(player: AVPlayer, channelID: Int?, mode: String = "single") -> some View {
        modifier(LiveViewingModifier(player: player, channelID: channelID, mode: mode))
    }
    func vodViewing(player: AVPlayer, identity: PlaybackIdentity?) -> some View {
        modifier(VODViewingModifier(player: player, identity: identity))
    }
}

// CSAI entry breaks. Ad media belongs to IMA, never to the content AVPlayer,
// so watch progress and live viewing measurement cannot count an ad as content.
struct CSAITag: Decodable, Identifiable {
    let id: Int
    var tag_url: String
    let scope: String?
    let content_id: String?
    let active: Bool
    let is_test: Bool
    let platforms: [String]

    /// [BREAK_SECONDS] / [BREAK_MS] carry the live break length so the ad server can
    /// size its pod. Same rule as the web: unknown lengths go out as 30 s.
    /// [CHANNEL] / [SHOW] / [GENRE] describe what is playing, [DEVICE] is "tvos".
    /// [CHANNEL] is always the clean channel name (one spelling per channel, like the web).
    /// No App Tracking Transparency prompt, so [IFA] is blank and [LMT] is 1.
    /// [DEVICE_ID] is a random 32-hex label made once per Apple TV (see AdDeviceID).
    /// [SKIPPABLE] is 0 for live channel breaks, 1 otherwise, so the ad server can leave out skipoffset.
    func filled(breakSeconds: Double?, context: AdContext = AdContext(), skippable: Bool = true, deviceID: String = AdDeviceID.current()) -> CSAITag {
        let seconds = breakSeconds.map { max(1, Int($0.rounded())) } ?? 30
        let safe = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        let text = { (value: String) in value.trimmingCharacters(in: .whitespaces).addingPercentEncoding(withAllowedCharacters: safe) ?? "" }
        let values = ["BREAK_SECONDS": String(seconds), "BREAK_MS": String(seconds * 1000),
                      "CHANNEL": text(BrowsePresentation.channelName(context.channel)), "SHOW": text(context.show), "GENRE": text(context.genre),
                      "DEVICE": "tvos", "DEVICE_ID": text(deviceID), "IFA": "", "LMT": "1", "SKIPPABLE": skippable ? "1" : "0", "CT": context.contentType]
        var copy = self
        for (key, value) in values { copy.tag_url = copy.tag_url.replacingOccurrences(of: "[\(key)]", with: value) }
        return copy
    }

    static func select(_ tags: [CSAITag], scope: String, contentID: String) -> CSAITag? {
        tags.filter { tag in
            guard tag.active, tag.platforms.contains("tvos"), URL(string: tag.tag_url)?.scheme?.lowercased() == "https",
                  tag.scope == scope || tag.scope == "global" else { return false }
            return tag.content_id == nil || tag.content_id == "" || (tag.scope == scope && tag.content_id == contentID)
        }.sorted { a, b in
            let rank: (CSAITag) -> Int = { !($0.content_id ?? "").isEmpty ? 2 : $0.scope == scope ? 1 : 0 }
            return rank(a) == rank(b) ? a.id < b.id : rank(a) > rank(b)
        }.first
    }
}

// Admin "Ad rules" (app_settings.ads_policy). Apple TV honours the master switch,
// the gap between entry ads, the Live TV toggles and the movie/episode mid-roll
// rules; post-roll is browser only. Anything unreadable falls back to the
// defaults the browser uses.
struct AdPolicy: Decodable {
    var enabled = true
    var min_gap_minutes = 30
    var live_entry = true
    var multiview_entry = true
    var midroll_enabled = true
    var midroll_min_minutes = 20
    var midroll_every_minutes = 15
    var midroll_max_breaks = 4
    var pause_enabled = true
    var squeeze_enabled = true
    var squeeze_every_minutes = 10
    static let fallback = AdPolicy()
    init() {}
    private enum CodingKeys: String, CodingKey { case enabled, min_gap_minutes, live_entry, multiview_entry, midroll_enabled, midroll_min_minutes, midroll_every_minutes, midroll_max_breaks, pause_enabled, squeeze_enabled, squeeze_every_minutes }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let number = { (key: CodingKeys, fallback: Int, range: ClosedRange<Int>) in max(range.lowerBound, min(range.upperBound, (try? values.decode(Int.self, forKey: key)) ?? fallback)) }
        enabled = (try? values.decode(Bool.self, forKey: .enabled)) ?? true
        min_gap_minutes = number(.min_gap_minutes, 30, 0...1440)
        live_entry = (try? values.decode(Bool.self, forKey: .live_entry)) ?? true
        multiview_entry = (try? values.decode(Bool.self, forKey: .multiview_entry)) ?? true
        midroll_enabled = (try? values.decode(Bool.self, forKey: .midroll_enabled)) ?? true
        midroll_min_minutes = number(.midroll_min_minutes, 20, 1...600)
        midroll_every_minutes = number(.midroll_every_minutes, 15, 1...240)
        midroll_max_breaks = number(.midroll_max_breaks, 4, 0...20)
        pause_enabled = (try? values.decode(Bool.self, forKey: .pause_enabled)) ?? true
        squeeze_enabled = (try? values.decode(Bool.self, forKey: .squeeze_enabled)) ?? true
        squeeze_every_minutes = number(.squeeze_every_minutes, 10, 1...240)
    }
    /// Seconds into a title where a mid-roll plays: every N minutes, only in titles of
    /// at least M minutes, never inside the last two minutes, at most K. Same as the web.
    func midrollCuePoints(duration: Double) -> [Double] {
        guard enabled, midroll_enabled, duration.isFinite, duration >= Double(midroll_min_minutes * 60) else { return [] }
        let every = Double(midroll_every_minutes * 60)
        var points: [Double] = []
        var at = every
        while at < duration - 120 && points.count < midroll_max_breaks { points.append(at); at += every }
        return points
    }
    /// A title's own approved breaks win over the rules timing; both obey the switches
    /// and stay out of the last two minutes. Same as the web's titleCuePoints.
    func cuePoints(duration: Double, titleBreaks: [Int]?) -> [Double] {
        guard enabled, midroll_enabled, duration.isFinite else { return [] }
        let own = Set(titleBreaks ?? []).filter { $0 > 0 && Double($0) < duration - 120 }.sorted().map(Double.init)
        return own.isEmpty ? midrollCuePoints(duration: duration) : own
    }
    static func parse(_ value: String?) -> AdPolicy {
        guard let data = value?.data(using: .utf8), let policy = try? JSONDecoder().decode(AdPolicy.self, from: data) else { return fallback }
        return policy
    }
    var gap: TimeInterval { TimeInterval(min_gap_minutes * 60) }
    func allowsEntry(scope: String) -> Bool {
        guard enabled else { return false }
        if scope == "live" { return live_entry }
        if scope == "multiview" { return multiview_entry }
        return true
    }
}

struct AdFrequencyPolicy {
    let defaults: UserDefaults
    private let key = "peep.preroll.lastStartedAt"
    func allowsAd(at now: Date = Date(), gap: TimeInterval = 1800) -> Bool {
        let last = defaults.double(forKey: key)
        return last <= 0 || now.timeIntervalSince1970 - last >= gap
    }
    func recordStart(at now: Date = Date()) {
        defaults.set(now.timeIntervalSince1970, forKey: key)
    }
}

/// A random label for frequency caps on Peep's own ad server, made once and kept.
/// It is derived from nothing on the device or account; deleting the app resets it.
enum AdDeviceID {
    static func current(defaults: UserDefaults = .standard) -> String {
        let key = "peep_ad_device_id"
        if let stored = defaults.string(forKey: key), stored.count == 32, stored.allSatisfy(\.isHexDigit) { return stored }
        let id = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        defaults.set(id, forKey: key)
        return id
    }
}

/// What the ad server is told about the title: [CHANNEL] / [SHOW] / [GENRE] in tag URLs.
struct AdContext: Equatable {
    var channel = ""
    var show = ""
    var genre = ""
    /// [CT]: "live" or "vod".
    var contentType = "vod"
}

@MainActor final class CSAIGate: ObservableObject {
    /// Set by whoever shows the title, before an entry ad and whenever the channel changes.
    var context = AdContext()
    @Published private(set) var blocking = false
    @Published private(set) var tag: CSAITag?
    private var continuation: CheckedContinuation<Bool, Never>?
    private var generation = UUID()
    private var service: SupabaseService?
    private var reportingUserID: String?
    private var scope = "movie"
    private var contentID = ""
    private var session = UUID().uuidString
    private var pending: Task<Void, Never>?
    private var seen = Set<String>()
    private(set) var isMidroll = false
    /// Viewers may skip pre-rolls and movie/episode ads; never a live channel's break.
    var skipAllowed: Bool { !(isMidroll && scope == "live") }
    @Published private(set) var lastEvent = ""
    private let frequency: AdFrequencyPolicy
    // Rules last read this launch. A stored cooldown under these skips the network.
    private(set) static var policy: AdPolicy?
    init(defaults: UserDefaults = .standard) {
        frequency = AdFrequencyPolicy(defaults: defaults)
    }

    static func loadPolicy(_ service: SupabaseService) async -> AdPolicy {
        let rows: [PublicSetting]? = try? await service.get("app_settings", query: ["select": "key,value", "key": "eq.ads_policy"], timeout: 4)
        if let rows { policy = AdPolicy.parse(rows.first?.value) }
        return policy ?? .fallback
    }

    func run(service: SupabaseService, scope: String, contentID: String) async -> Bool {
        cancel()
        isMidroll = false
        if let known = Self.policy, !frequency.allowsAd(gap: known.gap) { return true }
        let current = UUID(); generation = current
        self.service = service; self.reportingUserID = service.session?.userId; self.scope = scope; self.contentID = contentID
        session = UUID().uuidString; seen = []; blocking = true
        let policy = await Self.loadPolicy(service)
        guard !Task.isCancelled, generation == current else { return false }
        guard policy.allowsEntry(scope: scope), frequency.allowsAd(gap: policy.gap) else { blocking = false; return true }
        let tags: [CSAITag] = (try? await service.get("vast_tags", query: ["select":"id,tag_url,scope,content_id,active,is_test,platforms", "active":"eq.true", "ad_type":"eq.pre_roll", "order":"id.asc"], timeout: 4)) ?? []
        guard !Task.isCancelled, generation == current else { return false }
        guard let selected = CSAITag.select(tags, scope: scope, contentID: contentID),
              frequency.allowsAd(gap: policy.gap) else {
            blocking = false; return true
        }
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                self.continuation = continuation
                self.tag = selected.filled(breakSeconds: nil, context: self.context)
                self.record("request")
            }
        } onCancel: { Task { @MainActor in if self.generation == current { self.cancel() } } }
    }

    func record(_ event: String, adID: String = "") {
        Logger(subsystem: "tv.watchpeep.PeepTV", category: "CSAI").notice("Ad delivery event: \(event, privacy: .public)")
        lastEvent = event
        guard let tag, seen.insert(event + ":" + adID).inserted else { return }
        if event == "impression", !isMidroll { frequency.recordStart() }
        guard let service, let userID = reportingUserID, service.session?.userId == userID else { return }
        let body: [String: Any] = ["vast_tag_id": tag.id, "session_id": session, "event": event,
            "content_id": contentID, "content_type": scope, "platform": "tvos", "ad_id": adID,
            "user_id": userID, "is_test": tag.is_test || LiveViewingEnvironment.platform == "tvos_simulator" || tag.tag_url.contains("/external/")]
        let previous = pending
        pending = Task {
            await previous?.value
            do { try await service.post("ad_impressions", body: body, expectedUserID: userID) }
            catch { Logger(subsystem: "tv.watchpeep.PeepTV", category: "CSAI").error("Internal ad reporting failed; provider SDK tracking is separate.") }
        }
    }
    /// A mid-roll inside a movie or episode, at an Ad rules cue point. Picks the most
    /// specific active Apple TV mid_roll tag and resolves when the break is over
    /// (true) or the viewer left (false). No tag means no break.
    func runMidroll(service: SupabaseService, scope: String, contentID: String) async -> Bool {
        if blocking { return true }
        let current = UUID(); generation = current
        self.service = service; reportingUserID = service.session?.userId; self.scope = scope; self.contentID = contentID
        session = UUID().uuidString; seen = []
        let tags: [CSAITag] = (try? await service.get("vast_tags", query: ["select":"id,tag_url,scope,content_id,active,is_test,platforms", "active":"eq.true", "ad_type":"eq.mid_roll", "order":"id.asc"], timeout: 4)) ?? []
        guard !Task.isCancelled, generation == current, !blocking,
              let selected = CSAITag.select(tags, scope: scope, contentID: contentID) else { return true }
        isMidroll = true; blocking = true
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                self.continuation = continuation
                self.tag = selected.filled(breakSeconds: nil, context: self.context)
                self.record("request")
            }
        } onCancel: { Task { @MainActor in if self.generation == current { self.cancel() } } }
    }

    /// Starts a live mid-roll over a marked break. Returns why it did not start, or nil.
    @discardableResult
    func beginMidroll(service: SupabaseService, tag: CSAITag, channelID: Int) -> String? {
        if blocking { return "another ad is already showing" }
        if service.configuration?.isDevelopment != true { return "not the dev environment" }
        if !tag.is_test { return "tag \(tag.id) is not marked test" }
        guard tag.scope == "live", (tag.content_id ?? "").isEmpty || tag.content_id == String(channelID) else { return "tag \(tag.id) is not for this channel" }
        guard tag.active, tag.platforms.contains("tvos") else { return "tag \(tag.id) is off or not for Apple TV" }
        guard URL(string: tag.tag_url)?.scheme?.lowercased() == "https" else { return "tag \(tag.id) URL is not https" }
        self.service = service; reportingUserID = service.session?.userId
        scope = "live"; contentID = String(channelID); session = UUID().uuidString
        seen = []; generation = UUID(); isMidroll = true; blocking = true; self.tag = tag
        record("request")
        return nil
    }

    func finish() { resolve(true) }
    func cancel() { if blocking { record("cancel") }; resolve(false) }
    private func resolve(_ allowed: Bool) {
        generation = UUID(); tag = nil; blocking = false; isMidroll = false
        let waiting = continuation; continuation = nil; waiting?.resume(returning: allowed)
    }
}

struct CSAIOverlay: View {
    @ObservedObject var gate: CSAIGate
    var cancel: () -> Void = {}
    var body: some View {
        if gate.blocking {
            ZStack {
                Color.black.ignoresSafeArea()
                if let tag = gate.tag {
                    IMAAdView(tag: tag, allowSkip: gate.skipAllowed, event: { gate.record($0, adID: $1) }, finished: gate.finish, cancelled: { gate.cancel(); cancel() })
                        .id(tag.id).ignoresSafeArea()
                } else { ProgressView("Preparing playback…") }
            }
            .onExitCommand { gate.cancel(); cancel() }
        }
    }
}

struct IMAAdView: UIViewControllerRepresentable {
    let tag: CSAITag
    var allowSkip = true
    let event: (String, String) -> Void
    let finished: () -> Void
    let cancelled: () -> Void
    func makeUIViewController(context: Context) -> IMAAdController {
        IMAAdController(tag: tag, allowSkip: allowSkip, event: event, finished: finished, cancelled: cancelled)
    }
    func updateUIViewController(_ controller: IMAAdController, context: Context) {}
    static func dismantleUIViewController(_ controller: IMAAdController, coordinator: ()) { controller.clean() }
}

@MainActor final class IMAAdController: UIViewController, @preconcurrency IMAAdsLoaderDelegate, @preconcurrency IMAAdsManagerDelegate {
    // Reuse the loader. Context identity rejects callbacks from an abandoned request.
    private static let loader = IMAAdsLoader(settings: nil)
    private let contextID = UUID().uuidString
    private let tag: CSAITag
    private let event: (String, String) -> Void
    private let finished: () -> Void
    private let cancelled: () -> Void
    private var manager: IMAAdsManager?
    private var display: IMAAdDisplayContainer?
    private var timeout: Task<Void, Never>?
    private var requested = false
    private var ended = false
    private var skipAt: TimeInterval?
    private let allowSkip: Bool
    // Peep's own ad chrome: "Ad 1 of 3 · 0:24" bottom left; bottom right a "Skip in 5"
    // pill that turns into a focusable "Skip ›" button. The SDK's countdown is turned off
    // (uiElements) and its skip controls stay but are hidden; pressing ours presses
    // theirs, so the SDK still reports the skip to the ad server.
    private let countdown = AdPill()
    private let skipSoon = AdPill()
    private let skip = AdSkipButton()
    private var podPosition = 1, podCount = 1
    // The SDK draws the ad in adSurface. With a banner the surface is two thirds wide
    // and the banner fills the right third; without one it is the whole screen.
    private let adSurface = UIView()
    private let banner = AdBannerView()
    private var fullWidth: NSLayoutConstraint!, twoThirds: NSLayoutConstraint!
    init(tag: CSAITag, allowSkip: Bool = true, event: @escaping (String,String) -> Void, finished: @escaping () -> Void, cancelled: @escaping () -> Void) {
        self.tag = tag; self.allowSkip = allowSkip; self.event = event; self.finished = finished; self.cancelled = cancelled
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        overrideUserInterfaceStyle = .dark
        // Scope contrast to the SDK's ad controls, including its information button.
        // A solid dark backing stays readable even over an all-white creative.
        let adButtons = UIButton.appearance(whenContainedInInstancesOf: [IMAAdController.self])
        adButtons.backgroundColor = UIColor(white: 0.08, alpha: 1)
        adButtons.tintColor = .white
        skip.addAction(UIAction { [weak self] _ in self?.pressSkip() }, for: .primaryActionTriggered)
        adSurface.translatesAutoresizingMaskIntoConstraints = false; adSurface.backgroundColor = .black
        view.addSubview(adSurface); view.addSubview(banner)
        banner.isHidden = true
        banner.onLoaded = { [weak self] loaded in if !loaded { self?.showBanner(nil) } }
        fullWidth = adSurface.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        twoThirds = adSurface.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 2.0 / 3.0)
        for chrome in [countdown, skipSoon, skip] as [UIView] { chrome.isHidden = true; view.addSubview(chrome) }
        NSLayoutConstraint.activate([
            adSurface.leadingAnchor.constraint(equalTo: view.leadingAnchor), adSurface.topAnchor.constraint(equalTo: view.topAnchor),
            adSurface.bottomAnchor.constraint(equalTo: view.bottomAnchor), fullWidth,
            banner.leadingAnchor.constraint(equalTo: adSurface.trailingAnchor), banner.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            banner.topAnchor.constraint(equalTo: view.topAnchor), banner.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            countdown.leadingAnchor.constraint(equalTo: adSurface.leadingAnchor, constant: 90),
            countdown.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -70),
            skipSoon.trailingAnchor.constraint(equalTo: adSurface.trailingAnchor, constant: -90),
            skipSoon.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -70),
            skip.trailingAnchor.constraint(equalTo: adSurface.trailingAnchor, constant: -90),
            skip.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -66),
        ])
    }
    private func showBanner(_ item: AdBanner?) {
        banner.show(item)
        fullWidth.isActive = item == nil; twoThirds.isActive = item != nil
        view.layoutIfNeeded()
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !requested, !ended else { return }; requested = true
        Task { @MainActor [weak self] in
            guard let self else { return }
            do { try await PlaybackAudioSession.activate() }
            catch { if !self.ended { self.event("error", ""); self.complete() }; return }
            guard !self.ended else { return }
            Self.loader.delegate = self
            display = IMAAdDisplayContainer(adContainer: adSurface, viewController: self)
            let request = IMAAdsRequest(adTagUrl: tag.tag_url, adDisplayContainer: display!, contentPlayhead: nil, userContext: contextID)
            timeout = Task { @MainActor in
                do { try await Task.sleep(for: .seconds(10)) } catch { return }
                guard !self.ended else { return }; self.event("timeout", ""); self.complete()
            }
            Self.loader.requestAds(with: request)
        }
    }

    func adsLoader(_ loader: IMAAdsLoader, adsLoadedWith data: IMAAdsLoadedData) {
        guard !ended, data.userContext as? String == contextID else { data.adsManager?.destroy(); return }
        manager = data.adsManager; manager?.delegate = self
        let settings = IMAAdsRenderingSettings()
        settings.loadVideoTimeout = 8
        settings.uiElements = [] // Peep draws its own countdown
        manager?.initialize(with: settings)
    }
    func adsLoader(_ loader: IMAAdsLoader, failedWith data: IMAAdLoadingErrorData) {
        guard !ended, data.userContext as? String == contextID else { return }
        event("error", ""); complete()
    }
    func adsManager(_ adsManager: IMAAdsManager, didReceive event: IMAAdEvent) {
        guard !ended else { return }
        let id = (event.ad?.adId ?? "ad") + ":" + String(event.ad?.adPodInfo.podIndex ?? 0) + ":" + String(event.ad?.adPodInfo.adPosition ?? 1)
        switch event.type {
        case .LOADED: adsManager.start()
        case .STARTED:
            timeout?.cancel(); self.event("impression", id)
            skipAt = allowSkip && (event.ad?.isSkippable ?? false) ? event.ad?.skipTimeOffset : nil
            podPosition = max(1, event.ad?.adPodInfo.adPosition ?? 1); podCount = max(podPosition, event.ad?.adPodInfo.totalAds ?? 1)
            skip.isHidden = true; skipSoon.isHidden = skipAt == nil; countdown.isHidden = false
            showBanner(AdBanner.parse(event.ad?.traffickingParameters))
            bringChromeForward()
        case .COMPLETE: self.event("complete", id); skip.isHidden = true; skipSoon.isHidden = true; showBanner(nil)
        case .SKIPPED: self.event("skip", id); skip.isHidden = true; skipSoon.isHidden = true; showBanner(nil)
        case .ALL_ADS_COMPLETED: complete()
        case .ICON_FALLBACK_IMAGE_CLOSED: adsManager.resume()
        default: break
        }
    }
    func adsManager(_ adsManager: IMAAdsManager, didReceive error: IMAAdError) { guard !ended else { return }; event("error", ""); complete() }
    func adsManagerDidRequestContentPause(_ adsManager: IMAAdsManager) { setNeedsFocusUpdate(); updateFocusIfNeeded() }
    func adsManager(_ adsManager: IMAAdsManager, adDidProgressToTime mediaTime: TimeInterval, totalTime: TimeInterval) {
        guard !ended else { return }
        hideSDKSkip()
        let left = max(0, Int((totalTime - mediaTime).rounded(.up)))
        let clock = "\(left / 60):" + String(format: "%02d", left % 60)
        countdown.text = podCount > 1 ? "Ad \(podPosition) of \(podCount)  ·  \(clock)" : "Ad  ·  \(clock)"
        guard let offset = skipAt, offset >= 0 else { skipSoon.isHidden = true; skip.isHidden = true; return }
        if mediaTime < offset {
            skipSoon.text = "Skip in \(max(1, Int((offset - mediaTime).rounded(.up))))"
            skipSoon.isHidden = false; skip.isHidden = true
            return
        }
        skipSoon.isHidden = true
        if skip.isHidden { skip.isHidden = false; bringChromeForward() }
        // Pull the remote's focus onto Skip (from the window: focus may sit outside
        // this controller) until it lands once.
        guard !skip.isFocused, let window = view.window, let focus = UIFocusSystem.focusSystem(for: window) else { return }
        focus.requestFocusUpdate(to: self)
        focus.updateFocusIfNeeded()
    }
    override var preferredFocusEnvironments: [UIFocusEnvironment] { skip.isHidden ? super.preferredFocusEnvironments : [skip] }
    // Only Peep's Skip may take focus: never the SDK's hidden ones (and on live breaks,
    // where skipping isn't allowed, ours never appears).
    override func shouldUpdateFocus(in context: UIFocusUpdateContext) -> Bool {
        if let next = context.nextFocusedView, next !== skip, sdkSkipControls().contains(where: { next === $0 || next.isDescendant(of: $0) }) { return false }
        return super.shouldUpdateFocus(in: context)
    }
    private func bringChromeForward() { [countdown, skipSoon, skip].forEach { view.bringSubviewToFront($0) } }
    /// The SDK's own skip controls ("You can skip this ad in 3", "Skip Ad"), found by label.
    private func sdkSkipControls() -> [UIView] {
        var found: [UIView] = []
        func search(_ view: UIView) {
            if view !== skip, view is UIControl,
               (((view as? UIButton)?.currentTitle ?? "") + " " + (view.accessibilityLabel ?? "")).localizedCaseInsensitiveContains("skip") { found.append(view); return }
            view.subviews.forEach(search)
        }
        if isViewLoaded { search(view) }
        return found
    }
    // The SDK's skip controls stay invisible. On live breaks they are also disabled, so
    // the remote can never reach them; the SDK re-enables them as its skip state changes,
    // so this runs on every layout pass, progress tick and focus move. (Elsewhere they
    // stay enabled: the SDK ignores a press on a disabled button, and ours presses it.)
    private func hideSDKSkip() {
        for control in sdkSkipControls() {
            control.layer.opacity = 0; control.isUserInteractionEnabled = false
            if !allowSkip { (control as? UIControl)?.isEnabled = false }
        }
    }
    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); hideSDKSkip() }
    override func didUpdateFocus(in context: UIFocusUpdateContext, with coordinator: UIFocusAnimationCoordinator) {
        super.didUpdateFocus(in: context, with: coordinator)
        guard let next = context.nextFocusedView, next !== skip, sdkSkipControls().contains(where: { next === $0 || next.isDescendant(of: $0) }) else { return }
        hideSDKSkip(); setNeedsFocusUpdate(); updateFocusIfNeeded()
    }
    private func pressSkip() {
        guard allowSkip else { return }
        let ready = sdkSkipControls().first { (($0 as? UIButton)?.currentTitle ?? $0.accessibilityLabel ?? "").lowercased().hasPrefix("skip") }
        if let button = ready as? UIControl { button.sendActions(for: .primaryActionTriggered); button.sendActions(for: .touchUpInside) }
        else { manager?.skip() }
    }
    func adsManagerDidRequestContentResume(_ adsManager: IMAAdsManager) { complete() }
    private func complete() { guard !ended else { return }; clean(); finished() }
    func clean() {
        ended = true; timeout?.cancel(); timeout = nil
        if isViewLoaded { showBanner(nil) }
        manager?.delegate = nil; manager?.destroy(); manager = nil
        if Self.loader.delegate === self { Self.loader.delegate = nil }
        display = nil
    }
    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        if presses.contains(where: { $0.type == .menu }) { clean(); cancelled(); return }
        super.pressesBegan(presses, with: event)
    }
}

/// Pause ad: a picture (VAST NonLinear) shown while the viewer has paused. Same rules
/// as the web (peep/src/lib/pauseAd.js): asked ~2 s into a pause, once per pause,
/// counted when the picture is on screen, hidden the moment play resumes.
struct PauseAd: Equatable {
    let image: URL
    let width: Double
    let height: Double
    let impressions: [URL]
    let title: String
    /// Advertiser link (NonLinearClickThrough), drawn as a QR code; it counts the scan itself.
    var clickThrough: URL? = nil
    /// minSuggestedDuration in seconds (squeeze ads); nil when absent.
    var duration: Double? = nil

    static func parse(_ data: Data) -> PauseAd? {
        let reader = PauseAdXML()
        let parser = XMLParser(data: data); parser.delegate = reader
        guard parser.parse(), let image = reader.image else { return nil }
        return PauseAd(image: image, width: reader.width ?? 16, height: reader.height ?? 9, impressions: reader.impressions, title: reader.title ?? "Ad", clickThrough: reader.clickThrough, duration: reader.duration)
    }
    /// "00:00:15.000" → 15 (VAST clock values); nil for anything else.
    static func seconds(_ clock: String) -> Double? {
        let parts = clock.trimmingCharacters(in: .whitespaces).split(separator: ":").map { Double($0) }
        guard parts.count == 3, !parts.contains(nil) else { return nil }
        let total = parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
        return total > 0 ? total : nil
    }

    /// Asks the most specific active Apple TV tag for this placement ("pause" or "squeeze");
    /// nil on no tag, no ad or any failure.
    static func load(service: SupabaseService, scope: String, contentID: String, context: AdContext, placement: String = "pause") async -> (PauseAd, CSAITag)? {
        let policy = await CSAIGate.loadPolicy(service)
        guard policy.enabled, placement == "squeeze" ? policy.squeeze_enabled : policy.pause_enabled else { return nil }
        let tags: [CSAITag] = (try? await service.get("vast_tags", query: ["select": "id,tag_url,scope,content_id,active,is_test,platforms", "active": "eq.true", "ad_type": "eq.\(placement)", "order": "id.asc"], timeout: 4)) ?? []
        guard let tag = CSAITag.select(tags, scope: scope, contentID: contentID)?.filled(breakSeconds: nil, context: context),
              let url = URL(string: tag.tag_url) else { return nil }
        var request = URLRequest(url: url); request.timeoutInterval = 4
        guard let (data, response) = try? await URLSession.shared.data(for: request), (response as? HTTPURLResponse)?.statusCode == 200,
              let ad = parse(data) else { return nil }
        return (ad, tag)
    }
}

private final class PauseAdXML: NSObject, XMLParserDelegate {
    var image: URL?, width: Double?, height: Double?, impressions: [URL] = [], title: String?, clickThrough: URL?, duration: Double?
    private var element = "", text = "", inAd = false, done = false
    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
        if name == "Ad" { inAd = true }
        if name == "NonLinear", width == nil { width = attributes["width"].flatMap(Double.init); height = attributes["height"].flatMap(Double.init); duration = attributes["minSuggestedDuration"].flatMap(PauseAd.seconds) }
        element = name; text = ""
    }
    func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }
    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) { text += String(data: CDATABlock, encoding: .utf8) ?? "" }
    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines); text = ""
        guard inAd, !done else { return }
        let secure = URL(string: value).flatMap { $0.scheme?.lowercased() == "https" ? $0 : nil }
        switch name {
        case "StaticResource": if image == nil { image = secure }
        case "Impression": if let secure { impressions.append(secure) }
        case "AdTitle": if title == nil, !value.isEmpty { title = value }
        case "NonLinearClickThrough": if clickThrough == nil { clickThrough = secure }
        case "Ad": done = true // only the first ad
        default: break
        }
    }
}

/// Squeeze ads (L-bar): a full-screen picture while the show keeps playing, shrunk to 75%
/// into the top-right corner, sound on. Asked about every N minutes of playback (Ad rules),
/// never during or within two minutes after an ad break, never while paused. Same as the
/// web's squeezeAd.js.
enum SqueezeSchedule {
    static let afterBreak: TimeInterval = 120
    static let defaultSeconds: Double = 15, maxSeconds: Double = 60
    static func due(now: Date, lastAsked: Date, lastBreakEnded: Date?, playing: Bool, adBusy: Bool, policy: AdPolicy) -> Bool {
        guard policy.enabled, policy.squeeze_enabled, playing, !adBusy else { return false }
        if let lastBreakEnded, now.timeIntervalSince(lastBreakEnded) < afterBreak { return false }
        return now.timeIntervalSince(lastAsked) >= Double(policy.squeeze_every_minutes * 60)
    }
    static func seconds(_ ad: PauseAd) -> Double { min(maxSeconds, ad.duration ?? defaultSeconds) }
}

/// Squeeze ads on any full-screen player (PlayerView, Live TV): every few seconds of
/// playback see whether it's time to ask the tag; show the picture full screen with the
/// show at 75% in the top-right corner, sound on, for the ad's suggested time; drop it
/// early for a break, a pause, `busy` (guide open, Up Next…) or a new `key` (channel or
/// title change). The native player can't be scaled (it stops drawing), so the small
/// show is a second video layer on the same AVPlayer, drawn over everything.
private struct SqueezeAdModifier: ViewModifier {
    @EnvironmentObject private var service: SupabaseService
    let player: AVPlayer
    let ready: Bool
    let key: String
    let scope: String
    let contentID: String
    let context: AdContext
    let busy: Bool
    @ObservedObject var gate: CSAIGate
    @State private var squeeze: PauseAd?
    @State private var counted = false
    @State private var lastAsked = Date()
    @State private var lastBreak: Date?
    // The task reads these, not the init values it captured when it started.
    @State private var busyNow = false
    @State private var request = (scope: "movie", contentID: "", context: AdContext())

    func body(content: Content) -> some View {
        content
            .overlay {
                if let squeeze {
                    ZStack(alignment: .topTrailing) {
                        SqueezeAdView(ad: squeeze, onShown: count)
                        GeometryReader { box in
                            SqueezeVideoSurface(player: player)
                                .frame(width: box.size.width * 0.75, height: box.size.height * 0.75)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                                .transition(.scale(scale: 4.0 / 3.0, anchor: .topTrailing))
                        }
                    }
                    .ignoresSafeArea().allowsHitTesting(false).transition(.opacity)
                }
            }
            .onChange(of: busy, initial: true) { _, value in busyNow = value; if value { hide() } }
            .onChange(of: "\(scope)|\(contentID)|\(context.channel)|\(context.show)", initial: true) { _, _ in request = (scope, contentID, context) }
            .onChange(of: gate.blocking) { _, blocking in
                if blocking { hide() } else { lastBreak = Date(); lastAsked = Date() }
            }
            .onReceive(player.publisher(for: \.timeControlStatus)) { status in if status == .paused { hide() } }
            .task(id: "\(ready):\(key)") {
                squeeze = nil; lastAsked = Date()
                guard ready else { return }
                if CSAIGate.policy == nil { _ = await CSAIGate.loadPolicy(service) } // the admin's interval, not the default
                let log = Logger(subsystem: "tv.watchpeep.PeepTV", category: "Squeeze")
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(5)) } catch { return }
                    guard squeeze == nil, SqueezeSchedule.due(now: Date(), lastAsked: lastAsked, lastBreakEnded: lastBreak, playing: player.timeControlStatus == .playing, adBusy: gate.blocking || busyNow, policy: CSAIGate.policy ?? .fallback) else { continue }
                    lastAsked = Date()
                    let ask = request
                    log.notice("Squeeze: asking the tag for \(ask.scope, privacy: .public) \(ask.context.channel.isEmpty ? ask.context.show : ask.context.channel, privacy: .public)")
                    guard let (ad, _) = await PauseAd.load(service: service, scope: ask.scope, contentID: ask.contentID, context: ask.context, placement: "squeeze") else {
                        log.notice("Squeeze: no ad"); continue
                    }
                    guard !Task.isCancelled, player.timeControlStatus == .playing, !gate.blocking, !busyNow else { log.notice("Squeeze: got an ad but the viewer paused or a break started"); continue }
                    log.notice("Squeeze: showing \(ad.title, privacy: .public) for \(Int(SqueezeSchedule.seconds(ad)), privacy: .public) s")
                    counted = false
                    withAnimation(.easeInOut(duration: 0.4)) { squeeze = ad }
                    do { try await Task.sleep(for: .seconds(SqueezeSchedule.seconds(ad))) } catch { return }
                    hide()
                }
            }
            .onDisappear { squeeze = nil }
    }
    private func hide() { if squeeze != nil { withAnimation(.easeInOut(duration: 0.4)) { squeeze = nil } } }
    private func count() {
        guard !counted, let ad = squeeze else { return }
        counted = true
        Logger(subsystem: "tv.watchpeep.PeepTV", category: "Squeeze").notice("Squeeze: picture on screen, counting \(ad.impressions.count, privacy: .public) impression(s)")
        for url in ad.impressions { Task { _ = try? await URLSession.shared.data(from: url) } }
    }
}
extension View {
    func squeezeAds(player: AVPlayer, ready: Bool, key: String, scope: String, contentID: String, context: AdContext, busy: Bool, gate: CSAIGate) -> some View {
        modifier(SqueezeAdModifier(player: player, ready: ready, key: key, scope: scope, contentID: contentID, context: context, busy: busy, gate: gate))
    }
}

/// The shrunk show during a squeeze ad: a plain video layer on the content player.
struct SqueezeVideoSurface: UIViewRepresentable {
    let player: AVPlayer
    final class Surface: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var videoLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
    func makeUIView(context: Context) -> Surface {
        let view = Surface(); view.backgroundColor = .black
        view.videoLayer.videoGravity = .resizeAspect; view.videoLayer.player = player
        return view
    }
    func updateUIView(_ view: Surface, context: Context) { if view.videoLayer.player !== player { view.videoLayer.player = player } }
    static func dismantleUIView(_ view: Surface, coordinator: ()) { view.videoLayer.player = nil }
}

/// The squeeze picture behind the shrunk show: full screen, an "Ad" label top-left and the
/// link's QR code bottom-right, where the picture leaves room for it. Never takes focus.
struct SqueezeAdView: View {
    let ad: PauseAd
    let onShown: () -> Void
    var body: some View {
        AsyncImage(url: ad.image) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill().ignoresSafeArea()
                    .overlay(alignment: .topLeading) {
                        Text("Ad").font(.system(size: 18, weight: .bold)).padding(.horizontal, 10).padding(.vertical, 4)
                            .background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 8)).padding(.leading, 24).padding(.top, 20)
                    }
                    // The picture leaves its bottom-right corner empty for this on purpose.
                    .overlay(alignment: .bottomTrailing) {
                        if let link = ad.clickThrough, let qr = PauseAdQR.image(for: link) {
                            AdQRCode(image: qr, size: 150).padding(.trailing, 60).padding(.bottom, 40)
                        }
                    }
                    .onAppear(perform: onShown)
            } else { Color.black.ignoresSafeArea() }
        }
        .allowsHitTesting(false).transition(.opacity)
    }
}

/// Banner beside a video ad, from the Linear creative's <AdParameters> JSON:
/// {"banner":{"image","width","height","creativeView":[…],"click"}}. Google's tvOS SDK
/// drops VAST CompanionAds, so Steep sends the banner this way. Same rules as the web
/// (peep/src/lib/adBanner.js): the video shrinks to two thirds, the picture takes the
/// right third, creativeView is counted once the picture shows, the click link is a QR code.
struct AdBanner: Equatable {
    let image: URL
    let width: Double
    let height: Double
    let creativeView: [URL]
    let click: URL?
    static func parse(_ text: String?) -> AdBanner? {
        guard let text, let data = text.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let banner = root["banner"] as? [String: Any], let image = secure(banner["image"]) else { return nil }
        func size(_ value: Any?) -> Double {
            let n = (value as? NSNumber)?.doubleValue ?? Double((value as? String) ?? "") ?? 0
            return n > 0 ? n : 1
        }
        let views = ((banner["creativeView"] as? [Any]) ?? [banner["creativeView"] as Any]).compactMap(secure)
        return AdBanner(image: image, width: size(banner["width"]), height: size(banner["height"]), creativeView: views, click: secure(banner["click"]))
    }
    private static func secure(_ value: Any?) -> URL? {
        guard let text = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), let url = URL(string: text), url.scheme?.lowercased() == "https" else { return nil }
        return url
    }
}

/// The right-hand third during a video ad: the banner picture, an "Ad" label and, when
/// the ad has a link, its QR code. Never takes focus.
final class AdBannerView: UIView {
    private let picture = UIImageView()
    private let label = AdPill()
    private let qrBox = UIStackView()
    private let qr = UIImageView()
    private var loading: Task<Void, Never>?
    /// Called with true once the picture is on screen, false if it couldn't be loaded.
    var onLoaded: ((Bool) -> Void)?
    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = UIColor(white: 0.04, alpha: 1)
        picture.contentMode = .scaleAspectFit; picture.translatesAutoresizingMaskIntoConstraints = false
        label.text = "Ad"; label.font = AdPill.rounded(20, .bold)
        let caption = UILabel(); caption.text = "Scan to learn more"; caption.font = AdPill.rounded(16, .semibold); caption.textColor = .black; caption.textAlignment = .center
        qr.layer.magnificationFilter = .nearest; qr.translatesAutoresizingMaskIntoConstraints = false
        qrBox.axis = .vertical; qrBox.alignment = .center; qrBox.spacing = 6
        qrBox.isLayoutMarginsRelativeArrangement = true; qrBox.layoutMargins = UIEdgeInsets(top: 10, left: 10, bottom: 10, right: 10)
        qrBox.backgroundColor = .white; qrBox.layer.cornerRadius = 14; qrBox.translatesAutoresizingMaskIntoConstraints = false
        qrBox.addArrangedSubview(qr); qrBox.addArrangedSubview(caption)
        for subview in [picture, label, qrBox] as [UIView] { addSubview(subview) }
        NSLayoutConstraint.activate([
            picture.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 40), picture.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -40),
            picture.topAnchor.constraint(equalTo: topAnchor, constant: 60),
            label.topAnchor.constraint(equalTo: topAnchor, constant: 70), label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 50),
            qr.widthAnchor.constraint(equalToConstant: 160), qr.heightAnchor.constraint(equalToConstant: 160),
            qrBox.centerXAnchor.constraint(equalTo: centerXAnchor), qrBox.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -60),
        ])
        pictureToBottom.isActive = true
    }
    // The picture fills the column, or stops above the QR code when the ad has a link:
    // the code gets its own space and never covers the banner's art.
    private lazy var pictureToBottom = picture.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -60)
    private lazy var pictureAboveQR = picture.bottomAnchor.constraint(equalTo: qrBox.topAnchor, constant: -28)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    func show(_ banner: AdBanner?) {
        loading?.cancel(); loading = nil
        picture.image = nil; isHidden = banner == nil
        guard let banner else { return }
        let code = banner.click.flatMap(PauseAdQR.image(for:))
        qr.image = code; qrBox.isHidden = code == nil
        pictureToBottom.isActive = code == nil; pictureAboveQR.isActive = code != nil
        loading = Task { [weak self] in
            let image = (try? await URLSession.shared.data(from: banner.image)).flatMap { UIImage(data: $0.0) }
            guard !Task.isCancelled, let self else { return }
            guard let image else { self.onLoaded?(false); return }
            self.picture.image = image
            for url in banner.creativeView { Task { _ = try? await URLSession.shared.data(from: url) } }
            self.onLoaded?(true)
        }
    }
}

/// An ad's link as a QR code on a white card with "Scan to learn more".
struct AdQRCode: View {
    let image: UIImage
    var size: CGFloat = 160
    var body: some View {
        VStack(spacing: 6) {
            Image(uiImage: image).interpolation(.none).resizable().frame(width: size, height: size)
            Text("Scan to learn more").font(.system(size: 15, weight: .semibold)).foregroundStyle(.black)
        }
        .padding(10).background(.white, in: RoundedRectangle(cornerRadius: 14))
    }
}

/// QR code for a pause ad's link (Core Image), crisp at any size: draw with .interpolation(.none).
enum PauseAdQR {
    static func image(for url: URL) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(url.absoluteString.utf8); filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)),
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// A small dark rounded label for the ad countdown and "Skip in 5".
final class AdPill: UILabel {
    override init(frame: CGRect) {
        super.init(frame: frame)
        font = AdPill.rounded(26, .semibold); textColor = .white; textAlignment = .center
        backgroundColor = UIColor(white: 0, alpha: 0.62)
        layer.cornerRadius = 24; layer.masksToBounds = true
        translatesAutoresizingMaskIntoConstraints = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override var intrinsicContentSize: CGSize { let size = super.intrinsicContentSize; return CGSize(width: size.width + 48, height: max(48, size.height + 20)) }
    static func rounded(_ size: CGFloat, _ weight: UIFont.Weight) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        return base.fontDescriptor.withDesign(.rounded).map { UIFont(descriptor: $0, size: size) } ?? base
    }
}

/// Peep's Skip button: dark pill, yellow outline and a little lift when focused.
final class AdSkipButton: UIButton {
    override init(frame: CGRect) {
        super.init(frame: frame)
        setTitle("Skip  ›", for: .normal); setTitleColor(.white, for: .normal)
        titleLabel?.font = AdPill.rounded(28, .bold)
        contentEdgeInsets = UIEdgeInsets(top: 14, left: 34, bottom: 14, right: 34)
        backgroundColor = UIColor(white: 0.08, alpha: 0.9)
        layer.cornerRadius = 28; layer.borderColor = UIColor(red: 1, green: 0.84, blue: 0, alpha: 1).cgColor // #FFD600
        translatesAutoresizingMaskIntoConstraints = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func didUpdateFocus(in context: UIFocusUpdateContext, with coordinator: UIFocusAnimationCoordinator) {
        coordinator.addCoordinatedAnimations {
            self.layer.borderWidth = self.isFocused ? 5 : 0
            self.transform = self.isFocused ? CGAffineTransform(scaleX: 1.06, y: 1.06) : .identity
        }
    }
}

// Development-only: accept a cue just before its start, or shortly after it
// starts while there is still enough of the announced break left for an ad.
struct LiveMidrollCue: Equatable {
    let id: String
    let start: Date
    let end: Date
    func remaining(at playhead: Date) -> TimeInterval? {
        let elapsed = playhead.timeIntervalSince(start)
        let duration = end.timeIntervalSince(start)
        let remaining = end.timeIntervalSince(playhead)
        guard duration.isFinite, (5...180).contains(duration),
              elapsed >= -3, elapsed <= 15, remaining >= 5 else { return nil }
        return remaining
    }
}

@MainActor
final class LiveMidrollMetadata: NSObject, @preconcurrency AVPlayerItemMetadataCollectorPushDelegate {
    private let collector = AVPlayerItemMetadataCollector(identifiers: nil, classifyingLabels: nil)
    private weak var item: AVPlayerItem?
    private var reads: Task<Void, Never>?
    private(set) var cues: [String: LiveMidrollCue] = [:]
    private(set) var inbandCues: [String: LiveMidrollCue] = [:]
    private var inbandTask: Task<Void, Never>?
    func attach(_ item: AVPlayerItem?) {
        detach()
        self.item = item
        collector.setDelegate(self, queue: .main)
        item?.add(collector)
        if let source = (item?.asset as? AVURLAsset)?.url {
            inbandTask = Task { @MainActor [weak self] in
                let reader = LiveInbandReader()
                while !Task.isCancelled {
                    do {
                        let next = try await reader.poll(source)
                        guard !Task.isCancelled else { return }
                        self?.inbandCues = next
                    } catch {
                        if Task.isCancelled { return }
                        Logger(subsystem: "tv.watchpeep.PeepTV", category: "CSAI").notice("Live mid-roll playlist read failed: \(String(describing: error), privacy: .public)"); print("CSAI playlist read failed: \(error)")
                    }
                    do { try await Task.sleep(for: .seconds(2)) } catch { return }
                }
            }
        }
    }
    func detach() {
        reads?.cancel(); reads = nil
        inbandTask?.cancel(); inbandTask = nil; inbandCues = [:]
        collector.setDelegate(nil, queue: nil)
        item?.remove(collector); item = nil; cues = [:]
    }
    func metadataCollector(_ metadataCollector: AVPlayerItemMetadataCollector, didCollect metadataGroups: [AVDateRangeMetadataGroup], indexesOfNewGroups: IndexSet, indexesOfModifiedGroups: IndexSet) {
        reads?.cancel()
        reads = Task { @MainActor [weak self] in
            var updated: [String: LiveMidrollCue] = [:]
            for group in metadataGroups {
                guard !Task.isCancelled, let id = group.uniqueID else { continue }
                var isBreak = false
                var planned: Double?
                for item in group.items {
                    let key = (item.key as? String ?? "").uppercased()
                    if key == "SCTE35-OUT" { isBreak = true }
                    if key == "PLANNED-DURATION", let value = try? await item.load(.value) {
                        planned = (value as? NSNumber)?.doubleValue ?? (value as? String).flatMap(Double.init)
                    }
                }
                guard isBreak, let end = group.endDate ?? planned.map({ group.startDate.addingTimeInterval($0) }) else { continue }
                updated[id] = LiveMidrollCue(id: id, start: group.startDate, end: end)
            }
            guard !Task.isCancelled else { return }
            self?.cues = updated
        }
    }
}

private struct LiveMidrollModifier: ViewModifier {
    @EnvironmentObject private var service: SupabaseService
    @Environment(\.scenePhase) private var scenePhase
    let player: AVPlayer
    let channelID: Int?
    @ObservedObject var gate: CSAIGate
    let ready: Bool
    // What the ad watcher does goes to the Xcode console only (category CSAI): an
    // on-screen status box here used to sit on top of the ad itself.
    func body(content: Content) -> some View {
        content
        .task(id: "\(channelID ?? -1):\(scenePhase == .active):\(ready)") {
            guard ready, scenePhase == .active, service.configuration?.isDevelopment == true, let channelID else { return }
            let log = Logger(subsystem: "tv.watchpeep.PeepTV", category: "CSAI")
            // Unified log only: writing to stdout can block once Xcode stops reading it.
            let trace: (String) -> Void = { line in log.notice("\(line, privacy: .public)") }
            defer { trace("Ad watch stopped") }
            let tags: [CSAITag] = (try? await service.get("vast_tags", query: ["select":"id,tag_url,scope,content_id,active,is_test,platforms", "active":"eq.true", "ad_type":"eq.mid_roll", "scope":"eq.live", "or":"(content_id.is.null,content_id.eq.\(channelID))", "is_test":"eq.true", "order":"id.asc"], timeout: 4)) ?? []
            guard !Task.isCancelled, let tag = CSAITag.select(tags, scope: "live", contentID: String(channelID)) else {
                trace("Live mid-roll not armed for channel \(channelID): \(tags.count) candidate tags")
                return
            }
            trace("Live mid-roll armed for channel \(channelID) with tag \(tag.id)")
            var lastReport = Date.distantPast
            let metadata = LiveMidrollMetadata()
            var attached: AVPlayerItem?
            var seen = Set<String>()
            var breakStarts: [Date] = [] // a break signalled twice (playlist + in-band) is still one break
            var midrollActive = false
            var mutedBeforeMidroll: Bool?
            var peakBeforeMidroll: Double?
            let account = service.session?.userId
            defer {
                metadata.detach()
                if midrollActive {
                    gate.finish()
                    if let mutedBeforeMidroll { player.isMuted = mutedBeforeMidroll }
                    if let peakBeforeMidroll { attached?.preferredPeakBitRate = peakBeforeMidroll }
                }
            }
            while !Task.isCancelled {
                if player.currentItem !== attached {
                    attached = player.currentItem; metadata.attach(attached); seen = []
                }
                if Date().timeIntervalSince(lastReport) >= 5 {
                    lastReport = Date()
                    let known = metadata.cues.merging(metadata.inbandCues, uniquingKeysWith: { _, new in new }).values.sorted { $0.start < $1.start }
                    let playhead = player.currentItem?.currentDate()
                    let summary = known.map { cue in
                        let elapsed = playhead.map { $0.timeIntervalSince(cue.start) }
                        return "\(cue.id.prefix(12)) start=\(cue.start) elapsed=\(elapsed.map { String(format: "%.1f", $0) } ?? "no-date") remaining=\(playhead.flatMap { cue.remaining(at: $0) }.map { String(format: "%.0f", $0) } ?? "nil")"
                    }.joined(separator: " | ")
                    trace("Live mid-roll watch: rate=\(player.rate) playhead=\(playhead.map { "\($0)" } ?? "none") cues=\(known.count) \(summary)")
                }
                if !gate.blocking, player.rate > 0, let date = player.currentItem?.currentDate(), service.session?.userId == account,
                   let cue = metadata.cues.merging(metadata.inbandCues, uniquingKeysWith: { _,new in new }).values.sorted(by: { $0.start < $1.start }).first(where: { cue in !seen.contains(cue.id) && !breakStarts.contains { abs($0.timeIntervalSince(cue.start)) < 5 } && cue.remaining(at: date) != nil }),
                   let remaining = cue.remaining(at: date) {
                    seen.insert(cue.id); breakStarts.append(cue.start); breakStarts = breakStarts.suffix(20)
                    trace("Live mid-roll cue matched: \(cue.id.prefix(12)), \(Int(remaining))s left; starting ad")
                    let wasMuted = player.isMuted
                    mutedBeforeMidroll = wasMuted
                    player.isMuted = true; midrollActive = true
                    // The channel keeps playing (muted, hidden) so the break's end is known. Drop it
                    // to its lowest rung meanwhile: one HD decode for the ad, not two, so it plays smoothly.
                    peakBeforeMidroll = attached?.preferredPeakBitRate; attached?.preferredPeakBitRate = 400_000
                    if let reason = gate.beginMidroll(service: service, tag: tag.filled(breakSeconds: remaining, context: gate.context, skippable: false), channelID: channelID) { trace("Live mid-roll did not start: \(reason)") }
                    let started = ProcessInfo.processInfo.systemUptime
                    let deadline = ProcessInfo.processInfo.systemUptime + remaining
                    while !Task.isCancelled, gate.blocking, player.currentItem === attached,
                          service.session?.userId == account, ProcessInfo.processInfo.systemUptime < deadline {
                        if let end = (metadata.cues[cue.id] ?? metadata.inbandCues[cue.id])?.end, let current = attached?.currentDate(), current >= end { break }
                        do { try await Task.sleep(for: .milliseconds(100)) } catch { break }
                    }
                    if gate.blocking { gate.record(Task.isCancelled ? "cancel" : "timeout"); gate.finish() }
                    let ran = Int(ProcessInfo.processInfo.systemUptime - started)
                    trace("Live mid-roll ended after \(ran)s of the \(Int(remaining))s break")
                    player.isMuted = wasMuted; mutedBeforeMidroll = nil; midrollActive = false
                    if let peakBeforeMidroll { attached?.preferredPeakBitRate = peakBeforeMidroll }; peakBeforeMidroll = nil
                }
                do { try await Task.sleep(for: .milliseconds(100)) } catch { return }
            }
        }
    }
}

extension View {
    func liveMidroll(player: AVPlayer, channelID: Int?, gate: CSAIGate, ready: Bool) -> some View {
        modifier(LiveMidrollModifier(player: player, channelID: channelID, gate: gate, ready: ready))
    }
}

struct InbandSplice: Equatable {
    let id: String
    let out: Bool
    let pts: Double
    let duration: Double?
}

// Clear MPEG-TS splice_insert only. Unknown/encrypted/immediate cues fail open.
enum LiveTransportProbe {
    static let wrap = 8589934592.0
    static func crc(_ data: [UInt8]) -> UInt32 {
        var c: UInt32 = 0xffffffff
        for b in data { c ^= UInt32(b) << 24; for _ in 0..<8 { c = c & 0x80000000 != 0 ? (c << 1) ^ 0x04c11db7 : c << 1 } }
        return c
    }
    static func splice(_ bytes: [UInt8]) -> InbandSplice? {
        var position = 24
        func read(_ n: Int) -> UInt64? {
            guard position+n <= bytes.count*8 else { return nil }
            var value: UInt64 = 0
            for _ in 0..<n { value = value*2 + UInt64((bytes[position/8] >> (7-position%8)) & 1); position += 1 }
            return value
        }
        guard bytes.first == 0xfc, crc(bytes) == 0, read(8) == 0, read(1) == 0,
              read(6) != nil, let adjustment = read(33), read(8) != nil,
              read(12) != nil, read(12) != nil, read(8) == 5,
              let id = read(32), read(1) == 0, read(7) != nil,
              let out = read(1), read(1) == 1, let hasDuration = read(1), read(1) == 0,
              read(4) != nil, read(1) == 1, read(6) != nil, let pts = read(33) else { return nil }
        var duration: Double?
        if hasDuration == 1 {
            guard read(1) != nil, read(6) != nil, let ticks = read(33) else { return nil }
            duration = Double(ticks)/90000
        }
        return InbandSplice(id: String(id), out: out == 1, pts: Double((pts+adjustment)%8589934592), duration: duration)
    }
    static func mappedDate(pts: Double, anchorPTS: Double, segmentDate: Date) -> Date? {
        guard pts.isFinite, anchorPTS.isFinite else { return nil }
        var delta = (pts-anchorPTS).truncatingRemainder(dividingBy: wrap)
        if delta > wrap/2 { delta -= wrap }; if delta < -wrap/2 { delta += wrap }
        guard abs(delta/90000) <= 300 else { return nil }
        return segmentDate.addingTimeInterval(delta/90000)
    }
    static func inspect(_ data: Data) -> (anchor: Double?, splices: [InbandSplice]) {
        let b = [UInt8](data)
        var pmts = Set<Int>(), cuePIDs = Set<Int>(), videoPIDs = Set<Int>()
        var buffers: [Int:[UInt8]] = [:], counters: [Int:Int] = [:], splices: [InbandSplice] = []
        var anchor: Double?
        func consume(_ pid: Int) {
            while let buffer = buffers[pid], buffer.count >= 3 {
                if buffer[0] == 255 { buffers[pid] = []; return }
                let size = 3 + (Int(buffer[1]&15)<<8 | Int(buffer[2]))
                guard size <= 4096 else { buffers[pid] = []; return }
                guard buffer.count >= size else { return }
                let section = Array(buffer.prefix(size)); buffers[pid] = Array(buffer.dropFirst(size))
                guard crc(section) == 0 else { continue }
                if pid == 0, section[0] == 0, size >= 12, section[5]&1 == 1 {
                    for p in stride(from: 8, to: size-4, by: 4) where p+3 < size-4 {
                        if section[p] != 0 || section[p+1] != 0 { pmts.insert(Int(section[p+2]&31)<<8 | Int(section[p+3])) }
                    }
                } else if pmts.contains(pid), section[0] == 2, size >= 16, section[5]&1 == 1 {
                    var p = 12 + (Int(section[10]&15)<<8 | Int(section[11]))
                    while p+5 <= size-4 {
                        let type = section[p], track = Int(section[p+1]&31)<<8 | Int(section[p+2])
                        let length = Int(section[p+3]&15)<<8 | Int(section[p+4])
                        guard p+5+length <= size-4 else { break }
                        if type == 0x86 { cuePIDs.insert(track) }
                        if [0x1b,0x24,0x02].contains(type) { videoPIDs.insert(track) }
                        p += 5+length
                    }
                } else if cuePIDs.contains(pid), let event = splice(section) { splices.append(event) }
            }
        }
        guard b.count >= 376 else { return (nil,[]) }
        for offset in stride(from: 0, through: b.count-188, by: 188) {
            guard b[offset] == 71 else { return (nil,[]) }
            let pid = Int(b[offset+1]&31)<<8 | Int(b[offset+2]), control = (b[offset+3]>>4)&3
            if b[offset+1]&128 != 0 || b[offset+3]&192 != 0 || control&1 == 0 { continue }
            var p = offset+4
            if control&2 != 0 { p += 1+Int(b[p]) }
            guard p < offset+188 else { continue }
            let starts = b[offset+1]&64 != 0
            if starts, videoPIDs.contains(pid), p+14 <= offset+188, b[p] == 0, b[p+1] == 0, b[p+2] == 1, b[p+7]&128 != 0 {
                let t = p+9
                if b[t]&1 == 1 && b[t+2]&1 == 1 && b[t+4]&1 == 1 {
                    let pts = Double(b[t]&14)*536870912 + Double(b[t+1])*4194304 + Double(b[t+2]&254)*16384 + Double(b[t+3])*128 + Double(b[t+4]>>1)
                    if anchor == nil { anchor = pts }
                }
            }
            guard pid == 0 || pmts.contains(pid) || cuePIDs.contains(pid) else { continue }
            let cc = Int(b[offset+3]&15)
            if counters[pid] == cc { continue }
            if let last = counters[pid], (last+1)%16 != cc { buffers[pid] = nil }
            counters[pid] = cc
            if starts {
                let pointer = Int(b[p]); p += 1
                guard p+pointer <= offset+188 else { continue }
                if pointer > 0, buffers[pid] != nil { buffers[pid]! += b[p..<p+pointer]; consume(pid) }
                p += pointer; buffers[pid] = []
            }
            if buffers[pid] != nil { buffers[pid]! += b[p..<offset+188]; consume(pid) }
        }
        return (anchor,splices)
    }
}

// Playlist-level break markers: #EXT-X-CUE-OUT, #EXT-X-CUE-OUT-CONT, #EXT-X-CUE-IN
// (with the optional #EXT-OATCLS-SCTE35 line), the style Tubi-type FAST feeds
// send. AVFoundation only surfaces EXT-X-DATERANGE, so these are read from the
// rendition playlist. Timing comes from PROGRAM-DATE-TIME; no date, no cue.
enum LivePlaylistCues {
    static func attribute(_ name: String, in list: String) -> String? {
        for pair in list.split(separator: ",") {
            guard let equals = pair.firstIndex(of: "=") else { continue }
            if pair[..<equals].trimmingCharacters(in: .whitespaces).caseInsensitiveCompare(name) == .orderedSame {
                return pair[pair.index(after: equals)...].trimmingCharacters(in: CharacterSet(charactersIn: "\" "))
            }
        }
        return nil
    }
    static func parse(_ text: String) -> [LiveMidrollCue] {
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        var date: Date?, duration = 0.0, signal: String?
        var pendingOut: (signal: String?, duration: Double?)?
        var pendingCont: (signal: String?, elapsed: Double, duration: Double?)?
        var open: String?
        var found: [String: LiveMidrollCue] = [:]
        let stamp = { (start: Date) in "cue:" + String(Int(start.timeIntervalSince1970.rounded())) }
        for raw in text.components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.hasPrefix("#EXT-X-PROGRAM-DATE-TIME:") { let value = String(line.dropFirst(25)); date = iso.date(from: value) ?? plain.date(from: value) }
            else if line == "#EXT-X-DISCONTINUITY" { date = nil }
            else if line.hasPrefix("#EXTINF:") { duration = Double(line.dropFirst(8).split(separator: ",")[0]) ?? 0 }
            else if line.hasPrefix("#EXT-OATCLS-SCTE35:") { signal = String(line.dropFirst(19)) }
            else if line.hasPrefix("#EXT-X-CUE-OUT") && !line.hasPrefix("#EXT-X-CUE-OUT-CONT") {
                let value = line.count > 15 ? String(line.dropFirst(15)) : ""
                pendingOut = (signal, Double(attribute("DURATION", in: value) ?? value))
            }
            else if line.hasPrefix("#EXT-X-CUE-OUT-CONT") {
                let attrs = line.count > 20 ? String(line.dropFirst(20)) : ""
                pendingCont = (attribute("SCTE35", in: attrs) ?? signal, Double(attribute("ElapsedTime", in: attrs) ?? "") ?? 0, Double(attribute("Duration", in: attrs) ?? ""))
            }
            else if line.hasPrefix("#EXT-X-CUE-IN") {
                if let open, let cue = found[open], let end = date, end > cue.start { found[open] = LiveMidrollCue(id: open, start: cue.start, end: end) }
                open = nil; signal = nil
            }
            else if !line.isEmpty, !line.hasPrefix("#") {
                defer { pendingOut = nil; pendingCont = nil; if let current = date { date = current.addingTimeInterval(duration) } }
                guard let segmentDate = date else { continue }
                if let out = pendingOut, let length = out.duration, length > 0 {
                    let id = out.signal.map { "cue:" + $0 } ?? stamp(segmentDate)
                    found[id] = LiveMidrollCue(id: id, start: segmentDate, end: segmentDate.addingTimeInterval(length)); open = id
                } else if let cont = pendingCont, let length = cont.duration, length > 0 {
                    let start = segmentDate.addingTimeInterval(-cont.elapsed)
                    let id = cont.signal.map { "cue:" + $0 } ?? stamp(start)
                    if found[id] == nil { found[id] = LiveMidrollCue(id: id, start: start, end: start.addingTimeInterval(length)) }
                    open = id
                }
            }
        }
        return found.values.sorted { $0.start < $1.start }
    }
}

actor LiveInbandReader {
    private var playlist: URL?
    private var segments: [URL] = []
    private var cues: [String:LiveMidrollCue] = [:]
    private var ends: [String:Date] = [:]
    private let session = URLSession(configuration: .ephemeral)
    private func fetch(_ url: URL, limit: Int) async throws -> Data {
        guard url.scheme == "https" else { throw URLError(.unsupportedURL) }
        var request = URLRequest(url: url); request.timeoutInterval = 8; request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data,response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw URLError(.badServerResponse) }
        guard data.count <= limit else { throw URLError(.dataLengthExceedsMaximum) }
        return data
    }
    func poll(_ source: URL) async throws -> [String:LiveMidrollCue] {
        if playlist == nil {
            let text = String(decoding: try await fetch(source,limit: 1024*1024),as: UTF8.self)
            // First rendition is normally the smallest; timing comes from its own PDT/PTS pair.
            let lines = text.components(separatedBy: .newlines)
            if let index = lines.firstIndex(where: { $0.hasPrefix("#EXT-X-STREAM-INF:") }), index+1 < lines.count {
                playlist = URL(string: lines[index+1].trimmingCharacters(in: .whitespacesAndNewlines),relativeTo: source)?.absoluteURL
            } else { playlist = source }
        }
        guard let playlist else { return [:] }
        let text = String(decoding: try await fetch(playlist,limit: 1024*1024),as: UTF8.self)
        guard text.hasPrefix("#EXTM3U") else { return [:] }
        // Playlist markers first: they need no segment download. A cue without a
        // signal id is matched to an earlier sighting by start time so it keeps one id.
        for cue in LivePlaylistCues.parse(text) {
            let id = cues.first { $0.key.hasPrefix("cue:") && abs($0.value.start.timeIntervalSince(cue.start)) < 3 }?.key ?? cue.id
            cues[id] = LiveMidrollCue(id: id, start: cue.start, end: min(cue.end, ends[id] ?? .distantFuture))
        }
        guard !text.contains("#EXT-X-KEY:"), !text.contains("#EXT-X-MAP:"), !text.contains("#EXT-X-BYTERANGE:") else { return prune() }
        var date: Date?, duration: Double = 0, discontinuity = false
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        for raw in text.components(separatedBy: .newlines) {
            try Task.checkCancellation()
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.hasPrefix("#EXT-X-PROGRAM-DATE-TIME:") {
                let value = String(line.dropFirst(25)); date = iso.date(from:value) ?? plain.date(from:value); discontinuity = false
            } else if line == "#EXT-X-DISCONTINUITY" { discontinuity = true; date = nil }
            else if line.hasPrefix("#EXTINF:") { duration = Double(line.dropFirst(8).split(separator:",")[0]) ?? 0 }
            else if !line.isEmpty, !line.hasPrefix("#"), let url = URL(string:line,relativeTo:playlist)?.absoluteURL {
                defer { if let current = date { date = current.addingTimeInterval(duration) } }
                guard !discontinuity, let segmentDate = date, duration > 0, !segments.contains(url) else { continue }
                let sample = LiveTransportProbe.inspect(try await fetch(url,limit:4*1024*1024))
                segments.append(url); if segments.count > 100 { segments.removeFirst() }
                guard let anchor = sample.anchor else { continue }
                for splice in sample.splices {
                    guard let point = LiveTransportProbe.mappedDate(pts:splice.pts,anchorPTS:anchor,segmentDate:segmentDate) else { continue }
                    let id = "ts:\(splice.id)"
                    if splice.out, let length = splice.duration, (5...180).contains(length) {
                        let end = min(point.addingTimeInterval(length),ends[id] ?? .distantFuture)
                        cues[id] = LiveMidrollCue(id:id,start:point,end:end)
                    } else if !splice.out {
                        ends[id] = point
                        if let cue = cues[id] { cues[id] = LiveMidrollCue(id:id,start:cue.start,end:point) }
                    }
                }
            }
        }
        return prune()
    }
    private func prune() -> [String:LiveMidrollCue] {
        cues = cues.filter { $0.value.end > Date().addingTimeInterval(-300) }
        ends = ends.filter { $0.value > Date().addingTimeInterval(-300) }
        return cues
    }
}

/// Preview image for the native Up Next panel, sharing the poster cache.
@MainActor enum UpNextArtwork {
    static func load(_ url: URL?) async -> UIImage? {
        guard let url else { return nil }
        if let cached = ArtworkMemory.images.object(forKey: url as NSURL) { return cached }
        var request = URLRequest(url: url); request.timeoutInterval = 8
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200, let image = UIImage(data: data) else { return nil }
        ArtworkMemory.images.setObject(image, forKey: url as NSURL, cost: Int(image.size.width * image.size.height * 4))
        return image
    }
}

/// One look for every button on the player's full-screen states: icon, label, generous padding.
struct PlayerActionLabel: View {
    let text: String
    let symbol: String
    init(_ text: String, symbol: String) { self.text = text; self.symbol = symbol }
    var body: some View {
        Label(text, systemImage: symbol)
            .font(.system(size: 22, weight: .semibold))
            .padding(.horizontal, 24).padding(.vertical, 16)
    }
}

/// Full-screen backdrop for the Up Next / end screens: the artwork blurred under a dark
/// scrim. A flat gradient bands visibly on large TVs; a blurred photo does not.
struct EndScreenBackdrop: View {
    let url: URL?
    var body: some View {
        ZStack {
            Color.black
            if url != nil {
                EpisodeArtwork(url: url, fallback: nil)
                    .scaleEffect(1.15)
                    .blur(radius: 70)
                    .saturation(0.8)
                    .opacity(0.55)
            }
            Color.black.opacity(0.45)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Audio-only items would otherwise play over a black screen.
struct AudioArtworkOverlay: View {
    let metadata: PlaybackMetadata
    var body: some View {
        VStack(spacing: 28) {
            BoundedArtwork(url: metadata.artwork, symbol: "mic")
                .frame(width: 420, height: 420).background(Color(white: 0.08))
                .clipShape(RoundedRectangle(cornerRadius: 20)).shadow(color: .black.opacity(0.6), radius: 30, y: 12)
            Text(metadata.title).font(.system(size: 38, weight: .bold, design: .rounded)).lineLimit(2).multilineTextAlignment(.center)
            if let subtitle = metadata.subtitle, !subtitle.isEmpty {
                Text(subtitle).font(.system(size: 24)).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .frame(maxWidth: 1100).padding(.bottom, 180)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .foregroundStyle(.white).allowsHitTesting(false)
    }
}
