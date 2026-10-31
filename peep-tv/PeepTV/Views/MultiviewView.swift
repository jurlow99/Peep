import SwiftUI
import AVKit

struct MultiviewSession: Identifiable {
    let id = UUID()
    let channels: [Channel]
    let feeds: [PublicFeed]
    let streamHost: String
    let initialID: Int?
    var initialPair: [Int] = []
    var title: String = "Multiview"
}

/// Owns the app-level idle override only while a multiview session is visible.
@MainActor
final class MultiviewIdleTimer {
    private let read: () -> Bool
    private let write: (Bool) -> Void
    private var previous: Bool?

    init() {
        read = { UIApplication.shared.isIdleTimerDisabled }
        write = { UIApplication.shared.isIdleTimerDisabled = $0 }
    }
    init(read: @escaping () -> Bool, write: @escaping (Bool) -> Void) {
        self.read = read
        self.write = write
    }
    func keepAwake(_ enabled: Bool) {
        if enabled {
            if previous == nil { previous = read() }
            write(true)
        } else if let previous {
            write(previous)
            self.previous = nil
        }
    }
}

@MainActor
final class MultiviewModel: ObservableObject {
    let players = (0..<4).map { _ in AVPlayer() }
    @Published private(set) var channels: [Channel]
    @Published private(set) var audibleSlot = 0
    @Published private(set) var blackouts: [String?] = [nil, nil, nil, nil]
    @Published private(set) var errors: [String?] = [nil, nil, nil, nil]
    @Published private(set) var preparing = true
    @Published private(set) var videoReady = [false, false, false, false]
    private var startupTimeout: Task<Void, Never>?
    private var recoveryTasks: [Task<Void, Never>?] = [nil, nil, nil, nil]
    private var playbackObservations: [NSKeyValueObservation] = []
    private var recovering = [false, false, false, false]
    @Published private(set) var recoveryAttempts = [0, 0, 0, 0]
    private let session: MultiviewSession
    private var observations: [NSKeyValueObservation?] = [nil, nil, nil, nil]
    private var previousFour: [Channel] = []
    private var active = false
    private var fullscreenSlot: Int?
    private let idleTimer: MultiviewIdleTimer

    init(session: MultiviewSession, idleTimer: MultiviewIdleTimer? = nil) {
        self.session = session
        self.idleTimer = idleTimer ?? MultiviewIdleTimer()
        players.forEach { $0.preventsDisplaySleepDuringVideoPlayback = true }
        let playable = session.channels.filter { $0.playbackURL(streamHost: session.streamHost, feeds: session.feeds) != nil }
        let initial = playable.first { $0.id == session.initialID } ?? playable.first
        if [2, 4].contains(session.initialPair.count) {
            let pair = session.initialPair.compactMap { id in session.channels.first { $0.id == id && $0.is_premium != true } }
            channels = pair.count == session.initialPair.count && Set(pair.map(\.id)).count == pair.count ? pair : []
        } else {
            channels = initial.map { first in [first] + playable.filter { $0.id != first.id }.prefix(1) } ?? []
        }
        if channels.count == 4 { previousFour = channels }
        for slot in channels.indices { tune(slot) }
        for slot in players.indices {
            playbackObservations.append(players[slot].observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
                Task { @MainActor [weak self] in
                    guard let self, self.active, self.channels.indices.contains(slot), !self.recovering[slot] else { return }
                    if player.timeControlStatus == .playing {
                        self.recoveryTasks[slot]?.cancel(); self.recoveryTasks[slot] = nil
                    } else if player.timeControlStatus == .waitingToPlayAtSpecifiedRate {
                        self.armRecoveryTimeout(slot)
                    }
                }
            })
        }
        selectAudio(0)
    }

    var canUseFourScreens: Bool {
        Set(session.channels.filter { $0.playbackURL(streamHost: session.streamHost, feeds: session.feeds) != nil }.map(\.id)).count >= 4
    }

    func setScreenCount(_ count: Int) {
        guard [2, 4].contains(count), count != channels.count else { return }
        if channels.count == 4 { previousFour = channels }
        var next = Array(channels.prefix(count))
        for channel in previousFour + session.channels where next.count < count {
            if !next.contains(where: { $0.id == channel.id }), channel.playbackURL(streamHost: session.streamHost, feeds: session.feeds) != nil { next.append(channel) }
        }
        guard next.count == count else { return }
        channels = next
        preparing = true
        videoReady = [false, false, false, false]
        startupTimeout?.cancel()
        fullscreenSlot = nil
        for slot in players.indices {
            recoveryTasks[slot]?.cancel(); recoveryTasks[slot] = nil
            observations[slot] = nil
            errors[slot] = nil
            if channels.indices.contains(slot) { tune(slot) }
            else { players[slot].pause(); players[slot].replaceCurrentItem(with: nil) }
        }
        selectAudio(min(audibleSlot, count - 1))
        updatePlayback()
        if active { armStartupTimeout() }
    }

    func selectAudio(_ slot: Int) {
        guard channels.indices.contains(slot) else { return }
        // Mute every player before enabling the new source, so audio never overlaps.
        players.forEach { $0.isMuted = true }
        audibleSlot = slot
        players[slot].isMuted = false
    }

    func replace(_ slot: Int, with channel: Channel) {
        guard channels.indices.contains(slot), !channels.enumerated().contains(where: { $0.offset != slot && $0.element.id == channel.id }),
              channel.playbackURL(streamHost: session.streamHost, feeds: session.feeds) != nil else { return }
        channels[slot] = channel
        tune(slot)
        selectAudio(slot)
        updatePlayback()
    }

    func setFullscreen(_ slot: Int?) {
        fullscreenSlot = slot
        if let slot { selectAudio(slot) }
        updatePlayback()
    }

    private var audioTask: Task<Void, Never>?
    private var audioOwner = UUID()

    func setActive(_ value: Bool) {
        audioTask?.cancel()
        active = value
        startupTimeout?.cancel()
        if value {
            if preparing { armStartupTimeout() }
            audioOwner = UUID()
            let owner = audioOwner
            audioTask = Task { @MainActor [weak self] in
                guard !Task.isCancelled else { return }
                do {
                    try await PlaybackAudioSession.activate(owner: owner)
                    if Task.isCancelled { PlaybackAudioSession.deactivate(owner: owner) }
                }
                catch {
                    guard !Task.isCancelled, let self, self.active else { return }
                    self.errors = Array(repeating: error.localizedDescription, count: self.players.count)
                }
            }
            for slot in channels.indices where errors[slot] == nil { armRecoveryTimeout(slot) }
        } else {
            recoveryTasks.forEach { $0?.cancel() }
            recoveryTasks = [nil, nil, nil, nil]
            recovering = [false, false, false, false]
        }
        updatePlayback()
    }

    private func updatePlayback() {
        for slot in players.indices {
            if active && channels.indices.contains(slot) && errors[slot] == nil && blackouts[slot] == nil && !recovering[slot] && (fullscreenSlot == nil || fullscreenSlot == slot) {
                players[slot].play()
                if players[slot].timeControlStatus == .waitingToPlayAtSpecifiedRate { armRecoveryTimeout(slot) }
            } else { players[slot].pause() }
        }
        updateIdleTimer()
    }

    private func updateIdleTimer() {
        let hasPlayableScreen = channels.indices.contains { errors[$0] == nil && players[$0].currentItem != nil }
        idleTimer.keepAwake(active && hasPlayableScreen)
    }

    private func tune(_ slot: Int, resetRecovery: Bool = true, at date: Date = Date()) {
        guard channels.indices.contains(slot) else { return }
        recoveryTasks[slot]?.cancel(); recoveryTasks[slot] = nil
        recovering[slot] = false
        if resetRecovery { recoveryAttempts[slot] = 0 }
        observations[slot] = nil
        errors[slot] = nil
        videoReady[slot] = false
        blackouts[slot] = channels[slot].blackoutMessage(at: date)
        if blackouts[slot] != nil {
            players[slot].pause()
            players[slot].replaceCurrentItem(with: nil)
            finishStartupIfReady()
            return
        }
        guard let url = channels[slot].playbackURL(streamHost: session.streamHost, feeds: session.feeds) else {
            players[slot].replaceCurrentItem(with: nil)
            errors[slot] = "This channel has no supported stream. Choose another channel."
            finishStartupIfReady()
            return
        }
        let item = AVPlayerItem(url: url)
        // All requests run in parallel; ask for a short initial buffer while keeping
        // AVPlayer's stall protection enabled for variable live-stream bandwidth.
        item.preferredForwardBufferDuration = 2
        item.preferredPeakBitRate = channels.count == 4 ? 1_200_000 : 2_000_000
        item.preferredMaximumResolution = channels.count == 4 ? CGSize(width: 960, height: 540) : CGSize(width: 1280, height: 720)
        players[slot].replaceCurrentItem(with: item)
        observations[slot] = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
            guard item.status == .failed else { return }
            Task { @MainActor [weak self] in
                guard let self, self.players[slot].currentItem === item else { return }
                self.recover(slot, item: item)
            }
        }
        if active { armRecoveryTimeout(slot) }
    }

    private func armRecoveryTimeout(_ slot: Int) {
        guard !recovering[slot], errors[slot] == nil, recoveryTasks[slot] == nil, let item = players[slot].currentItem else { return }
        recoveryTasks[slot] = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(12)) } catch { return }
            guard let self else { return }
            self.recoveryTasks[slot] = nil
            guard self.active, self.fullscreenSlot == nil || self.fullscreenSlot == slot else { return }
            self.recover(slot, item: item)
        }
    }

    // Retune only the failed tile. Healthy feeds, selection, and audio stay intact.
    func recover(_ slot: Int, item: AVPlayerItem) {
        guard channels.indices.contains(slot), players[slot].currentItem === item, !recovering[slot], errors[slot] == nil else { return }
        recoveryTasks[slot]?.cancel(); recoveryTasks[slot] = nil
        if active && recoveryAttempts[slot] < 2 {
            recoveryAttempts[slot] += 1
            recovering[slot] = true
            videoReady[slot] = false
            players[slot].pause()
            recoveryTasks[slot] = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(2)) } catch { return }
                guard let self, self.active, self.players[slot].currentItem === item else { return }
                self.tune(slot, resetRecovery: false)
                self.updatePlayback()
            }
        } else {
            errors[slot] = "This channel is unavailable. Choose Retry or change channel."
            players[slot].pause()
            finishStartupIfReady()
            updateIdleTimer()
        }
    }

    func markVideoReady(_ slot: Int, item: AVPlayerItem) {
        guard channels.indices.contains(slot), players[slot].currentItem === item, errors[slot] == nil, !recovering[slot] else { return }
        videoReady[slot] = true
        finishStartupIfReady()
    }

    private func finishStartupIfReady() {
        guard preparing, !channels.isEmpty,
              channels.indices.allSatisfy({ videoReady[$0] || errors[$0] != nil || blackouts[$0] != nil }) else { return }
        startupTimeout?.cancel()
        preparing = false
        selectAudio(audibleSlot)
    }

    private func armStartupTimeout() {
        startupTimeout?.cancel()
        startupTimeout = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(12)) } catch { return }
            self?.expireStartup()
        }
    }

    func expireStartup() {
        guard preparing else { return }
        preparing = false
        // One unavailable provider must not leave every healthy channel hidden.
        for slot in channels.indices where !videoReady[slot] && errors[slot] == nil {
            if let item = players[slot].currentItem { recover(slot, item: item) }
        }
        finishStartupIfReady()
        updateIdleTimer()
    }

    func refreshBlackouts(from latest: [Channel]? = nil, at date: Date = Date()) {
        var changed = false
        for slot in channels.indices {
            if let channel = latest?.first(where: { $0.id == channels[slot].id }) { channels[slot] = channel }
            let message = channels[slot].blackoutMessage(at: date)
            if message != blackouts[slot] {
                // Keep every other pane and the selected audio source intact.
                tune(slot, at: date)
                changed = true
            }
        }
        if changed { updatePlayback() }
    }

    func retry(_ slot: Int) { tune(slot); updatePlayback() }
    func stop() {
        audioTask?.cancel()
        active = false
        idleTimer.keepAwake(false)
        startupTimeout?.cancel()
        recoveryTasks.forEach { $0?.cancel() }
        recoveryTasks = [nil, nil, nil, nil]
        playbackObservations = []
        preparing = false
        observations = [nil, nil, nil, nil]
        players.forEach { $0.pause(); $0.replaceCurrentItem(with: nil) }
        PlaybackAudioSession.deactivate(owner: audioOwner)
    }
}

struct MultiviewView: View {
    let session: MultiviewSession
    @StateObject private var model: MultiviewModel
    let onClose: () -> Void
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var supabase: SupabaseService
    @FocusState private var focusedSlot: Int?
    @State private var replacementReturnSlot: Int?
    @State private var replacingSlot: Int?
    @State private var controlsSlot: Int?
    @State private var fullscreenSlot: Int?
    @State private var lastExit = Date.distantPast

    init(session: MultiviewSession, onClose: @escaping () -> Void) {
        self.session = session
        self.onClose = onClose
        _model = StateObject(wrappedValue: MultiviewModel(session: session))
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let slot = fullscreenSlot {
                NativePlayer(player: model.players[slot], onExit: exitPlayback, pauseOnDismantle: false)
                    .ignoresSafeArea()
                if let message = model.blackouts[slot] {
                    VStack(spacing: 24) {
                        StatusView(title: "Channel temporarily unavailable", message: message, symbol: "tv.slash")
                        Button("Return to Multiview") { leaveFullscreen() }.buttonStyle(BrowseCardStyle()).padding(.bottom, 80)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity).background(.black)
                }
            } else {
                GeometryReader { geometry in
                    Group {
                        if model.channels.count == 2 {
                            HStack(spacing: 0) {
                                ForEach(model.channels.indices, id: \.self) { slot in
                                    fourScreenTile(slot, width: geometry.size.width / 2, height: geometry.size.width * 9 / 32)
                                }
                            }.frame(width: geometry.size.width, height: geometry.size.height, alignment: .center)
                        } else {
                            let width = geometry.size.width / 2
                            let height = geometry.size.height / 2
                            LazyVGrid(columns: [GridItem(.fixed(width), spacing: 0), GridItem(.fixed(width), spacing: 0)], spacing: 0) {
                                ForEach(model.channels.indices, id: \.self) { slot in
                                    fourScreenTile(slot, width: width, height: height)
                                }
                            }.frame(width: geometry.size.width, height: geometry.size.height)
                        }
                    }
                        .overlay(alignment: .top) {
                            if focusedSlot == 100 || focusedSlot == 101 {
                                multiviewHeader.padding(32).background(.black.opacity(0.85))
                            }
                        }
                }.ignoresSafeArea()

            }
        }
        .background {
            ForEach(Array(model.channels.enumerated()), id: \.offset) { slot, channel in
                Color.clear.frame(width: 0, height: 0)
                    .liveViewing(player: model.players[slot], channelID: model.videoReady[slot] && model.errors[slot] == nil ? channel.id : nil, mode: "multiview")
            }
        }
        .task {
            while !Task.isCancelled {
                let channels = try? await supabase.fetchChannels()
                guard !Task.isCancelled else { return }
                if let channels { model.refreshBlackouts(from: channels) }
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
            }
        }
        .task {
            while !Task.isCancelled {
                model.refreshBlackouts()
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
            }
        }
        .onAppear { model.setActive(scenePhase == .active); focusedSlot = 0 }
        .onDisappear { model.stop() }
        .onExitCommand(perform: exitPlayback)
        .onChange(of: scenePhase) { _, phase in model.setActive(phase == .active) }
        .onChange(of: focusedSlot) { _, slot in
            guard let slot else { return }
            if model.channels.indices.contains(slot) {
                controlsSlot = nil
                model.selectAudio(slot)
            } else if (10..<14).contains(slot) { model.selectAudio(slot - 10) }
            else if (20..<24).contains(slot) { model.selectAudio(slot - 20) }
        }
        .sheet(isPresented: Binding(get: { replacingSlot != nil }, set: { if !$0 { replacingSlot = nil } }), onDismiss: {
            controlsSlot = nil
            if let slot = replacementReturnSlot { focusedSlot = slot }
            replacementReturnSlot = nil
        }) {
            NavigationStack {
                List {
                    ForEach(session.channels.filter { channel in
                        channel.playbackURL(streamHost: session.streamHost, feeds: session.feeds) != nil &&
                        !model.channels.enumerated().contains { $0.offset != replacingSlot && $0.element.id == channel.id }
                    }) { channel in
                        Button(channel.name) {
                            guard let slot = replacingSlot else { return }
                            model.replace(slot, with: channel)
                            replacingSlot = nil
                            focusedSlot = slot
                        }
                    }
                }.navigationTitle("Choose channel")
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { replacingSlot = nil } } }
                    .onExitCommand { replacingSlot = nil }
            }
        }
    }

    private var multiviewHeader: some View {
HStack {
                            Button("Back") { onClose() }.buttonStyle(MultiviewControlStyle())
                                .focused($focusedSlot, equals: 100)
                                .onRemoteMove { direction in
                                    if direction == .down { focusedSlot = 0 }
                                    if direction == .right, model.channels.count == 4 || model.canUseFourScreens { focusedSlot = 101 }
                                }
                            Spacer()
                            Text(session.title).lineLimit(1).font(.system(size: 36, weight: .bold))
                            Spacer()
                            if model.channels.count == 4 || model.canUseFourScreens {
                            Button(model.channels.count == 4 ? "2 screens" : "4 screens") {
                                model.setScreenCount(model.channels.count == 4 ? 2 : 4)
                                focusedSlot = 0
                            }.buttonStyle(MultiviewControlStyle())
                                .focused($focusedSlot, equals: 101)
                                .onRemoteMove { direction in
                                    if direction == .down { focusedSlot = model.channels.count == 4 ? 1 : 0 }
                                    if direction == .left { focusedSlot = 100 }
                                }
                            }
                        }
    }

    private func fourScreenTile(_ slot: Int, width: CGFloat, height: CGFloat) -> some View {
        ZStack(alignment: .bottom) {
            Button {
                fullscreenSlot = slot
                model.setFullscreen(slot)
            } label: {
                ZStack {
                    NativePlayer(player: model.players[slot], interactive: false, pauseOnDismantle: false, videoGravity: .resizeAspect,
                                                 onVideoReady: { model.markVideoReady(slot, item: $0) })
                                                .overlay {
                                                    if let message = model.blackouts[slot] {
                                                        Text(message).font(.system(size: 20)).multilineTextAlignment(.center)
                                                            .padding(24).frame(maxWidth: .infinity, maxHeight: .infinity).background(.black)
                                                            .allowsHitTesting(false)
                                                    } else if !model.videoReady[slot] && model.errors[slot] == nil {
                                                        ZStack {
                                                            Color.black
                                                            VStack(spacing: 12) {
                                                                ProgressView().tint(.white)
                                                                Text(model.recoveryAttempts[slot] > 0 ? "Reconnecting… (\(model.recoveryAttempts[slot])/2)" : "Loading channel…").font(.system(size: 20))
                                                            }
                                                        }.allowsHitTesting(false)
                                                    }
                                                }
                        .allowsHitTesting(false).accessibilityHidden(true)
                    if let error = model.errors[slot] {
                        Text(error).font(.system(size: 20)).lineLimit(3).padding(24)
                            .frame(maxWidth: .infinity, maxHeight: .infinity).background(.black)
                    }
                }.frame(width: width, height: height)
                    .clipped()
            }.buttonStyle(MultiviewGridTileStyle()).focused($focusedSlot, equals: slot)
                .accessibilityLabel("Screen \(slot + 1), \(model.channels[slot].name), open fullscreen")
                .onRemoteMove { direction in
                    if model.channels.count == 2 {
                        switch direction {
                        case .left: if slot == 1 { focusedSlot = 0 }
                        case .right: if slot == 0 { focusedSlot = 1 }
                        case .up: focusedSlot = slot == 1 && model.canUseFourScreens ? 101 : 100
                        case .down: showControls(slot)
                        default: break
                        }
                    } else {
                        switch direction {
                        case .left: if slot % 2 == 1 { focusedSlot = slot - 1 }
                        case .right: if slot % 2 == 0 { focusedSlot = slot + 1 }
                        case .up: focusedSlot = slot >= 2 ? slot - 2 : (slot == 0 ? 100 : 101)
                        case .down: if slot < 2 { focusedSlot = slot + 2 } else { showControls(slot) }
                        default: break
                        }
                    }
                }
                .onPlayPauseCommand { showControls(slot) }
            HStack(spacing: 12) {
                Text(model.channels[slot].name).font(.system(size: 22, weight: .semibold)).lineLimit(1)
                Spacer()
                if model.audibleSlot == slot { Image(systemName: "speaker.wave.2.fill").accessibilityLabel("Audio on") }
                if controlsSlot == slot {
                Button("Change") { model.selectAudio(slot); replacementReturnSlot = slot; replacingSlot = slot }
                    .buttonStyle(MultiviewControlStyle(compact: true)).focused($focusedSlot, equals: 10 + slot)
                    .onRemoteMove { direction in
                        switch direction {
                        case .right: if model.errors[slot] != nil { focusedSlot = 20 + slot }
                        case .left, .up, .down: focusedSlot = slot
                        default: break
                        }
                    }
                if model.errors[slot] != nil {
                    Button("Retry") { model.retry(slot); focusedSlot = slot }.buttonStyle(MultiviewControlStyle(compact: true))
                        .focused($focusedSlot, equals: 20 + slot)
                            .onRemoteMove { direction in
                            if direction == .left { focusedSlot = 10 + slot }
                            else { focusedSlot = slot }
                        }
                }
                }
            }.padding(.horizontal, 18).padding(.vertical, 12)
                .frame(width: width)
                .background(LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .top, endPoint: .bottom))
        }.frame(width: width, height: height)
            .overlay {
                Rectangle().strokeBorder((focusedSlot == slot || focusedSlot == 10 + slot || focusedSlot == 20 + slot) ? ContentAppearance.accent : .clear, lineWidth: ContentAppearance.focusWidth)
                    .allowsHitTesting(false)
            }
            .overlay(alignment: .topLeading) {
                if focusedSlot == slot {
                    Text("Select: fullscreen · Play/Pause: channel options")
                        .font(.system(size: 16, weight: .medium))
                        .padding(10).background(.black.opacity(0.75)).padding(12)
                        .allowsHitTesting(false)
                }
            }
    }

    private func showControls(_ slot: Int) {
        controlsSlot = slot
        focusedSlot = 10 + slot
    }

    private func exitPlayback() {
        // AVKit and SwiftUI may deliver the same Menu press to both handlers.
        guard Date().timeIntervalSince(lastExit) > 0.3 else { return }
        lastExit = Date()
        if replacingSlot != nil { replacingSlot = nil }
        else if fullscreenSlot != nil { leaveFullscreen() }
        else if let slot = controlsSlot { controlsSlot = nil; focusedSlot = slot }
        else { onClose() }
    }

    private func leaveFullscreen() {
        let previous = fullscreenSlot
        controlsSlot = nil
        fullscreenSlot = nil
        model.setFullscreen(nil)
        focusedSlot = previous
    }
}

private struct MultiviewGridTileStyle: ButtonStyle {
    @Environment(\.isFocused) private var focused
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(.black)
            .overlay(Rectangle().strokeBorder(focused ? ContentAppearance.accent : .clear, lineWidth: ContentAppearance.focusWidth))
    }
}

private typealias MultiviewControlStyle = TVActionControlStyle

struct MultiviewPackageShelf: View {
    @Environment(\.returnToSidebar) private var returnToSidebar
    let row: Carousel
    let packages: [MultiviewPackage]
    let channels: [Channel]
    let feeds: [PublicFeed]
    let streamHost: String
    let open: (MultiviewSession) -> Void
    var packageFocus: FocusState<String?>.Binding? = nil
    var navigate: (MoveCommandDirection) -> Void = { _ in }
    private var items: [MultiviewPackage] {
        MultiviewPackage.items(for: row, packages: packages).filter { !$0.pair(in: channels, host: streamHost, feeds: feeds).isEmpty }
    }
    var body: some View {
        if !items.isEmpty {
            ShelfView(title: row.title) {
                ForEach(items) { package in
                    let pair = package.pair(in: channels, host: streamHost, feeds: feeds)
                    Button {
                        open(MultiviewSession(channels: channels, feeds: feeds, streamHost: streamHost,
                                              initialID: pair.first?.id, initialPair: pair.map(\.id), title: package.title))
                    } label: {
                        VStack(alignment: .leading, spacing: 12) {
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)], spacing: 3) {
                                ForEach(pair) { channel in
                                    BoundedArtwork(url: channel.thumbURL, symbol: "tv")
                                        .frame(width: 194, height: pair.count == 4 ? 78 : 160).clipped()
                                }
                            }.background(Color(white: 0.1))
                            VStack(alignment: .leading, spacing: 6) {
                                Text(package.title).font(.system(size: 23, weight: .semibold)).lineLimit(1)
                                Text(pair.map(\.name).joined(separator: " + ")).font(.system(size: 17)).foregroundStyle(.secondary).lineLimit(1)
                                Text("MULTIVIEW · \(pair.count) CHANNELS").font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary)
                            }.padding(.horizontal, 12).padding(.bottom, 14)
                        }.frame(width: 391)
                    }.buttonStyle(BrowseCardStyle())
                        .modifier(MultiviewPackageFocus(binding: packageFocus, id: "\(row.id):\(package.id)"))
                        .onRemoteMove { direction in
                            if direction == .left && package.id == items.first?.id {
                                returnToSidebar()
                            } else {
                                navigate(direction)
                            }
                        }
                }
            }
        }
    }
}

private struct MultiviewPackageFocus: ViewModifier {
    let binding: FocusState<String?>.Binding?
    let id: String
    @ViewBuilder func body(content: Content) -> some View {
        if let binding { content.focused(binding, equals: id) } else { content }
    }
}
