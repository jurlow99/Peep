import SwiftUI
import GoogleInteractiveMediaAds
import AVKit
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

    init(url: URL, title: String, metadata: PlaybackMetadata? = nil, preferences: PlaybackPreferences? = nil) {
        self.preferences = preferences ?? .shared
        self.metadata = metadata
        player = AVPlayer()
        tune(url: url, title: title)
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
                self.errorMessage = message
            }
        }
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
    private var playbackIdentity: PlaybackIdentity? { currentEpisode.map { PlaybackIdentity(id: String($0.id), type: "episode") } ?? identity }
    @State private var attempt = UUID()
    @EnvironmentObject private var service: SupabaseService
    @State private var resolvedURL: URL?
    @State private var resolutionError: String?

    var body: some View {
        Group {
            if let resolvedURL {
                PlayerView(url: resolvedURL, title: currentEpisode?.displayTitle ?? title, identity: playbackIdentity, liveChannelID: liveChannelID, startFromBeginning: startFromBeginning, metadata: metadata,
                           nextEpisode: nextEpisode, seriesAllowsAutoplay: seriesAllowsAutoplay, related: related, openRelated: openRelated, playNext: {
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
                    Button("Try again") { attempt = UUID() }.padding()
                    Button("Back") { dismiss() }.padding(.bottom, 80)
                }.background(Color.black).onExitCommand { dismiss() }
            } else {
                ProgressView("Preparing playback…").frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black).onExitCommand { dismiss() }
            }
        }
        .task(id: attempt) {
            resolutionError = nil; resolvedURL = nil; nextEpisode = nil; seriesAllowsAutoplay = false
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
                    }
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

    init(url: URL, title: String, identity: PlaybackIdentity? = nil, liveChannelID: Int? = nil, startFromBeginning: Bool = false, metadata: PlaybackMetadata? = nil, nextEpisode: Episode? = nil, seriesAllowsAutoplay: Bool = false, related: [Video] = [], openRelated: @escaping (Video) -> Void = { _ in }, playNext: @escaping () -> Void = {}, retry: @escaping () -> Void) {
        self.title = title
        self.metadata = metadata
        self.related = related
        self.openRelated = openRelated
        self.nextEpisode = nextEpisode
        self.seriesAllowsAutoplay = seriesAllowsAutoplay
        self.playNext = playNext
        self.identity = identity
        self.liveChannelID = liveChannelID
        self.startFromBeginning = startFromBeginning
        _model = StateObject(wrappedValue: PlayerModel(url: url, title: title, metadata: metadata))
        self.retry = retry
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let message = model.blackoutMessage {
                VStack(spacing: 24) {
                    StatusView(title: "Channel temporarily unavailable", message: message, symbol: "tv.slash")
                    Button("Back") { dismiss() }.buttonStyle(BrowseCardStyle()).padding(.bottom, 80)
                }
            } else if let error = model.errorMessage {
                VStack {
                    StatusView(title: "Playback interrupted", message: error, retry: retry)
                    Button("Back") { dismiss() }.padding(.bottom, 80)
                }.background(Color.black)
            } else {
                if (!adGate.blocking || adGate.isMidroll) && !showNext && !showEnd {
                    NativePlayer(player: model.player, proposal: proposal, onAcceptProposal: nextEpisode == nil ? nil : playNext).ignoresSafeArea()
                    if let metadata, metadata.audioOnly { AudioArtworkOverlay(metadata: metadata) }
                }
            }
        }
        .overlay {
            if showNext, let episode = nextEpisode {
                ZStack {
                    LinearGradient(colors: [Color(white: 0.09), .black], startPoint: .topTrailing, endPoint: .bottomLeading).ignoresSafeArea()
                    HStack(spacing: 54) {
                        EpisodeArtwork(url: episode.thumbURL, fallback: nil)
                            .frame(width: 560, height: 315).clipShape(RoundedRectangle(cornerRadius: 20))
                        VStack(alignment: .leading, spacing: 22) {
                            Text("UP NEXT").font(.system(size: 18, weight: .bold)).tracking(4).foregroundStyle(.secondary)
                            Text(episode.displayTitle).font(.system(size: 42, weight: .bold, design: .rounded)).lineLimit(2)
                            Text("Season \(episode.season ?? 1) · Episode \(episode.episode_number ?? 1)").font(.system(size: 23)).foregroundStyle(.secondary)
                            if !countdownCancelled && preferences.autoplayNext && seriesAllowsAutoplay {
                                Text("Playing in \(countdown) seconds").font(.system(size: 23)).monospacedDigit()
                            }
                            HStack(spacing: 20) {
                                Button(action: playNext) { Label("Play next", systemImage: "play.fill").padding(16) }
                                    .buttonStyle(BrowseCardStyle()).focused($nextFocused)
                                Button(countdownCancelled || !preferences.autoplayNext || !seriesAllowsAutoplay ? "Back" : "Cancel autoplay") {
                                    if countdownCancelled || !preferences.autoplayNext || !seriesAllowsAutoplay { dismiss() } else { countdownCancelled = true }
                                }.buttonStyle(BrowseCardStyle())
                            }
                        }.frame(width: 650, alignment: .leading)
                    }.padding(80)
                }.onAppear { nextFocused = true }
            } else if showEnd {
                ZStack {
                    LinearGradient(colors: [Color(white: 0.09), .black], startPoint: .topTrailing, endPoint: .bottomLeading).ignoresSafeArea()
                    VStack(alignment: .leading, spacing: 28) {
                        Text("THAT'S THE END").font(.system(size: 18, weight: .bold)).tracking(4).foregroundStyle(.secondary)
                        Text(title).font(.system(size: 42, weight: .bold, design: .rounded)).lineLimit(2)
                        HStack(spacing: 20) {
                            Button(action: watchAgain) { Label("Watch again", systemImage: "arrow.counterclockwise").padding(16) }
                                .buttonStyle(BrowseCardStyle()).focused($endFocused)
                            Button("Back") { dismiss() }.buttonStyle(BrowseCardStyle())
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
                }.onAppear { endFocused = true }
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
        .overlay { CSAIOverlay(gate: adGate, cancel: { dismiss() }) }
        .liveMidroll(player: model.player, channelID: liveChannelID, gate: adGate, ready: contentStarted)
        .liveViewing(player: model.player, channelID: adGate.blocking ? nil : liveChannelID)
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
@MainActor
private final class LiveViewingTracker {
    private let player: AVPlayer
    private let channelID: Int
    private let mode: String
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

    init(player: AVPlayer, channelID: Int, mode: String, service: SupabaseService) {
        self.player = player; self.channelID = channelID; self.mode = mode; self.service = service
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
        let payload: [String: Any] = ["p_session_id": sessionID, "p_token": token, "p_device_id": deviceID,
            "p_channel_id": channelID, "p_platform": LiveViewingEnvironment.platform, "p_mode": mode, "p_seconds": min(30, seconds), "p_end": end]
        seconds = 0; lastSent = ProcessInfo.processInfo.systemUptime
        let previous = pending
        let service = service
        pending = Task { await previous?.value; try? await service.post("rpc/record_live_viewing", body: payload) }
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
            await LiveViewingTracker(player: player, channelID: channelID, mode: mode, service: service).run()
        }
    }
}
extension View {
    func liveViewing(player: AVPlayer, channelID: Int?, mode: String = "single") -> some View {
        modifier(LiveViewingModifier(player: player, channelID: channelID, mode: mode))
    }
}

// CSAI entry breaks. Ad media belongs to IMA, never to the content AVPlayer,
// so watch progress and live viewing measurement cannot count an ad as content.
struct CSAITag: Decodable, Identifiable {
    let id: Int
    let tag_url: String
    let scope: String?
    let content_id: String?
    let active: Bool
    let is_test: Bool
    let platforms: [String]

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

struct AdFrequencyPolicy {
    let defaults: UserDefaults
    private let key = "peep.preroll.lastStartedAt"
    func allowsAd(at now: Date = Date()) -> Bool {
        let last = defaults.double(forKey: key)
        return last <= 0 || now.timeIntervalSince1970 - last >= 1800
    }
    func recordStart(at now: Date = Date()) {
        defaults.set(now.timeIntervalSince1970, forKey: key)
    }
}

@MainActor final class CSAIGate: ObservableObject {
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
    private let frequency: AdFrequencyPolicy
    init(defaults: UserDefaults = .standard) {
        frequency = AdFrequencyPolicy(defaults: defaults)
    }

    func run(service: SupabaseService, scope: String, contentID: String) async -> Bool {
        cancel()
        isMidroll = false
        guard frequency.allowsAd() else { return true }
        let current = UUID(); generation = current
        self.service = service; self.reportingUserID = service.session?.userId; self.scope = scope; self.contentID = contentID
        session = UUID().uuidString; seen = []; blocking = true
        let tags: [CSAITag] = (try? await service.get("vast_tags", query: ["select":"id,tag_url,scope,content_id,active,is_test,platforms", "active":"eq.true", "ad_type":"eq.pre_roll", "order":"id.asc"], timeout: 4)) ?? []
        guard !Task.isCancelled, generation == current else { return false }
        guard let selected = CSAITag.select(tags, scope: scope, contentID: contentID),
              frequency.allowsAd() else {
            blocking = false; return true
        }
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                self.continuation = continuation
                self.tag = selected
                self.record("request")
            }
        } onCancel: { Task { @MainActor in if self.generation == current { self.cancel() } } }
    }

    func record(_ event: String, adID: String = "") {
        Logger(subsystem: "tv.watchpeep.PeepTV", category: "CSAI").notice("Ad delivery event: \(event, privacy: .public)")
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
    func beginMidroll(service: SupabaseService, tag: CSAITag, channelID: Int) {
        guard !blocking, service.configuration?.isDevelopment == true, tag.is_test,
              tag.scope == "live", tag.content_id == String(channelID), tag.active, tag.platforms.contains("tvos"),
              URL(string: tag.tag_url)?.scheme?.lowercased() == "https" else { return }
        self.service = service; reportingUserID = service.session?.userId
        scope = "live"; contentID = String(channelID); session = UUID().uuidString
        seen = []; generation = UUID(); isMidroll = true; blocking = true; self.tag = tag
        record("request")
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
                    IMAAdView(tag: tag, event: { gate.record($0, adID: $1) }, finished: gate.finish, cancelled: { gate.cancel(); cancel() })
                        .id(tag.id).ignoresSafeArea()
                } else { ProgressView("Preparing playback…") }
            }
            .onExitCommand { gate.cancel(); cancel() }
        }
    }
}

struct IMAAdView: UIViewControllerRepresentable {
    let tag: CSAITag
    let event: (String, String) -> Void
    let finished: () -> Void
    let cancelled: () -> Void
    func makeUIViewController(context: Context) -> IMAAdController {
        IMAAdController(tag: tag, event: event, finished: finished, cancelled: cancelled)
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
    init(tag: CSAITag, event: @escaping (String,String) -> Void, finished: @escaping () -> Void, cancelled: @escaping () -> Void) {
        self.tag = tag; self.event = event; self.finished = finished; self.cancelled = cancelled
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
            display = IMAAdDisplayContainer(adContainer: view, viewController: self)
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
        case .STARTED: timeout?.cancel(); self.event("impression", id)
        case .COMPLETE: self.event("complete", id)
        case .SKIPPED: self.event("skip", id)
        case .ALL_ADS_COMPLETED: complete()
        case .ICON_FALLBACK_IMAGE_CLOSED: adsManager.resume()
        default: break
        }
    }
    func adsManager(_ adsManager: IMAAdsManager, didReceive error: IMAAdError) { guard !ended else { return }; event("error", ""); complete() }
    func adsManagerDidRequestContentPause(_ adsManager: IMAAdsManager) { setNeedsFocusUpdate(); updateFocusIfNeeded() }
    func adsManagerDidRequestContentResume(_ adsManager: IMAAdsManager) { complete() }
    private func complete() { guard !ended else { return }; clean(); finished() }
    func clean() {
        ended = true; timeout?.cancel(); timeout = nil
        manager?.delegate = nil; manager?.destroy(); manager = nil
        if Self.loader.delegate === self { Self.loader.delegate = nil }
        display = nil
    }
    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        if presses.contains(where: { $0.type == .menu }) { clean(); cancelled(); return }
        super.pressesBegan(presses, with: event)
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
                    } catch { if Task.isCancelled { return } }
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
    func body(content: Content) -> some View {
        content.task(id: "\(channelID ?? -1):\(scenePhase == .active):\(ready)") {
            guard ready, scenePhase == .active, service.configuration?.isDevelopment == true, let channelID else { return }
            let tags: [CSAITag] = (try? await service.get("vast_tags", query: ["select":"id,tag_url,scope,content_id,active,is_test,platforms", "active":"eq.true", "ad_type":"eq.mid_roll", "scope":"eq.live", "content_id":"eq.\(channelID)", "is_test":"eq.true", "order":"id.asc"], timeout: 4)) ?? []
            guard !Task.isCancelled, let tag = CSAITag.select(tags, scope: "live", contentID: String(channelID)) else { return }
            let metadata = LiveMidrollMetadata()
            var attached: AVPlayerItem?
            var seen = Set<String>()
            var midrollActive = false
            var mutedBeforeMidroll: Bool?
            let account = service.session?.userId
            defer {
                metadata.detach()
                if midrollActive {
                    gate.finish()
                    if let mutedBeforeMidroll { player.isMuted = mutedBeforeMidroll }
                }
            }
            while !Task.isCancelled {
                if player.currentItem !== attached {
                    attached = player.currentItem; metadata.attach(attached); seen = []
                }
                if !gate.blocking, player.rate > 0, let date = player.currentItem?.currentDate(), service.session?.userId == account,
                   let cue = metadata.cues.merging(metadata.inbandCues, uniquingKeysWith: { _,new in new }).values.sorted(by: { $0.start < $1.start }).first(where: { !seen.contains($0.id) && $0.remaining(at: date) != nil }),
                   let remaining = cue.remaining(at: date) {
                    seen.insert(cue.id)
                    let wasMuted = player.isMuted
                    mutedBeforeMidroll = wasMuted
                    player.isMuted = true; midrollActive = true
                    gate.beginMidroll(service: service, tag: tag, channelID: channelID)
                    let deadline = ProcessInfo.processInfo.systemUptime + remaining
                    while !Task.isCancelled, gate.blocking, player.currentItem === attached,
                          service.session?.userId == account, ProcessInfo.processInfo.systemUptime < deadline {
                        if let end = (metadata.cues[cue.id] ?? metadata.inbandCues[cue.id])?.end, let current = attached?.currentDate(), current >= end { break }
                        do { try await Task.sleep(for: .milliseconds(100)) } catch { break }
                    }
                    if gate.blocking { gate.record(Task.isCancelled ? "cancel" : "timeout"); gate.finish() }
                    player.isMuted = wasMuted; mutedBeforeMidroll = nil; midrollActive = false
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

actor LiveInbandReader {
    private var playlist: URL?
    private var segments: [URL] = []
    private var cues: [String:LiveMidrollCue] = [:]
    private var ends: [String:Date] = [:]
    private let session = URLSession(configuration: .ephemeral)
    private func fetch(_ url: URL, limit: Int) async throws -> Data {
        guard url.scheme == "https" else { throw URLError(.unsupportedURL) }
        var request = URLRequest(url: url); request.timeoutInterval = 8; request.cachePolicy = .reloadIgnoringLocalCacheData
        let (bytes,response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw URLError(.badServerResponse) }
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < limit else { throw URLError(.dataLengthExceedsMaximum) }
            data.append(byte)
        }
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
        guard text.hasPrefix("#EXTM3U"), !text.contains("#EXT-X-KEY:"), !text.contains("#EXT-X-MAP:"), !text.contains("#EXT-X-BYTERANGE:") else { return [:] }
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
