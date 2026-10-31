import SwiftUI

struct LiveGuideSession: Identifiable {
    let id = UUID()
    let channels: [Channel]
    let initial: Channel
    let url: URL
    let feeds: [PublicFeed]
    let streamHost: String
    let guide: [GuideEntry]
}

/// One player stays mounted behind the channel drawer and playback controls.
struct LiveSurfView: View {
    @State private var channels: [Channel]
    @State private var feeds: [PublicFeed]
    let streamHost: String
    private let developmentSamples: Bool
    @Environment(\.preparePlayback) private var preparePlayback
    @EnvironmentObject private var supabase: SupabaseService
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let onClose: () -> Void
    private let openMultiview: ((MultiviewSession) -> Void)?
    @StateObject private var adGate = CSAIGate()
    @State private var midrollReady = false
    @StateObject private var player: PlayerModel
    private let keepsPlaying: Bool
    private let onTune: (Channel, URL) -> Void
    @State private var selectedID: Int
    @State private var guide: [GuideEntry]
    @State private var showHint = true
    @State private var drawerOpen = false
    @State private var controlsOpen = false
    @State private var searchOpen = false
    @State private var searchText = ""
    @State private var category: String?
    @State private var showingMultiview = false
    @State private var packages: [MultiviewPackage] = []
    @State private var rows: [Carousel] = []
    @State private var packageError = false
    @State private var loadingPackages = true
    @State private var lastExit = -Double.infinity
    @FocusState private var focus: String?

    init(channels: [Channel], initial: Channel, url: URL, feeds: [PublicFeed], streamHost: String, guide: [GuideEntry], sharedPlayer: PlayerModel? = nil, onTune: @escaping (Channel, URL) -> Void = { _, _ in }, openMultiview: ((MultiviewSession) -> Void)? = nil, onClose: @escaping () -> Void) {
        self.onClose = onClose
        self.openMultiview = openMultiview
        self.keepsPlaying = sharedPlayer != nil
        self.onTune = onTune
        _channels = State(initialValue: channels)
        _feeds = State(initialValue: feeds)
        self.developmentSamples = BrowsePresentation.isDemo(initial.name)
        self.streamHost = streamHost
        _selectedID = State(initialValue: initial.id)
        _guide = State(initialValue: guide)
        _player = StateObject(wrappedValue: sharedPlayer ?? PlayerModel(url: url, title: initial.name))
    }
    private var selected: Channel? { channels.first { $0.id == selectedID } }
    private var categories: [String] { Array(Set(channels.flatMap { BrowsePresentation.categories($0.category) })).sorted() }
    private var visible: [Channel] {
        channels.filter {
            (category == nil || BrowsePresentation.categories($0.category).contains(category!)) &&
            (searchText.isEmpty || "\($0.name) \($0.category ?? "") \($0.description ?? "")".localizedCaseInsensitiveContains(searchText))
        }
    }
    private var curatedPackages: [MultiviewPackage] {
        var seen = Set<String>()
        return rows.filter {
            $0.type == "multiview" && $0.enabled != false &&
            ($0.pages ?? "home").split(separator: ",").contains { $0.trimmingCharacters(in: .whitespaces) == "live" }
        }.flatMap { MultiviewPackage.items(for: $0, packages: packages) }.filter {
            seen.insert($0.id).inserted && !$0.pair(in: channels, host: streamHost, feeds: feeds).isEmpty
        }
    }

    var body: some View {
        ZStack(alignment: .leading) {
            Color.black
            if !adGate.blocking || adGate.isMidroll {
                NativePlayer(player: player.player, onExit: exitPlayback, interactive: controlsOpen && !drawerOpen && player.blackoutMessage == nil, pauseOnDismantle: !keepsPlaying)
            }
            if !drawerOpen && !controlsOpen && !adGate.blocking {
                Button { if player.blackoutMessage == nil { controlsOpen = true } else { revealDrawer() } } label: { Color.clear.contentShape(Rectangle()) }
                    .buttonStyle(VideoSurfaceButtonStyle()).focused($focus, equals: "video")
                    .accessibilityLabel("\(selected?.name ?? "Live TV"). Select for playback controls. Swipe right for channels.")
                    .onRemoteMove { direction in if direction == .right { revealDrawer() } }
                    .onPlayPauseCommand { if player.player.rate == 0 { player.play() } else { player.player.pause() } }
            }
            if let message = player.blackoutMessage, !drawerOpen {
                VStack(spacing: 24) {
                    StatusView(title: "Channel temporarily unavailable", message: message, symbol: "tv.slash")
                    Button("Browse channels") { revealDrawer() }.buttonStyle(BrowseCardStyle()).padding(.bottom, 80)
                }
            }
            if let error = player.errorMessage, player.blackoutMessage == nil, !drawerOpen {
                StatusView(title: "Channel interrupted", message: error, retry: retune)
                    .padding(100)
                VStack { Spacer(); Button("Browse channels") { revealDrawer() }.buttonStyle(BrowseCardStyle()) }.padding(60)
            }
            if showHint && !drawerOpen && !controlsOpen && !adGate.blocking {
                VStack {
                    Spacer()
                    HStack {
                        Text(selected?.name ?? "Live TV").font(.system(size: 26, weight: .semibold))
                        Spacer()
                        Label("Swipe right for channels", systemImage: "arrow.right")
                        Text("· Select for controls")
                    }.font(.system(size: 20)).padding(28)
                        .background(LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .top, endPoint: .bottom))
                }.allowsHitTesting(false).padding(.horizontal, 40)
            }
            if drawerOpen {
                LinearGradient(colors: [.black.opacity(0.35), .clear], startPoint: .leading, endPoint: .trailing)
                    .allowsHitTesting(false)
                drawer.transition(.move(edge: .leading).combined(with: .opacity))
            }
        }
        .ignoresSafeArea()
        .background(Color.black)
        .overlay { CSAIOverlay(gate: adGate, cancel: onClose) }
        .liveMidroll(player: player.player, channelID: keepsPlaying ? nil : selectedID, gate: adGate, ready: midrollReady)
        .liveViewing(player: player.player, channelID: keepsPlaying || adGate.blocking ? nil : selectedID)
        .task {
            focus = "video"
            if !keepsPlaying {
                preparePlayback()
                player.applyBlackout(selected?.blackoutMessage())
                if player.blackoutMessage == nil {
                    guard await adGate.run(service: supabase, scope: "live", contentID: String(selectedID)), !Task.isCancelled else { return }
                }
                player.startIfEnabled()
                midrollReady = true
            }
        }
        .task(id: selectedID) {
            if !keepsPlaying { await player.monitorBlackout(channelID: selectedID, initial: selected, service: supabase) }
        }
        .onChange(of: player.blackoutMessage) { _, message in
            if message != nil { controlsOpen = false; focus = drawerOpen ? focus : "video" }
        }
        .task {
            await loadPackages()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
                async let nextChannels = supabase.fetchChannels()
                async let nextFeeds = supabase.fetchFeeds()
                async let nextPackages = supabase.fetchMultiviewPackages()
                async let nextRows = supabase.fetchCarousels()
                if let value = try? await nextChannels { channels = value.filter { BrowsePresentation.isDemo($0.name) == developmentSamples } }
                if let value = try? await nextFeeds { feeds = value }
                if let value = try? await nextPackages { packages = value }
                if let value = try? await nextRows { rows = value }
            }
        }
        .task {
            do { try await Task.sleep(for: .seconds(6)) } catch { return }
            showHint = false
        }
        .onDisappear { adGate.cancel(); if !keepsPlaying { player.stop() } }
        .onChange(of: controlsOpen) { _, open in if !open && !drawerOpen { focus = "video" } }
        .onExitCommand(perform: exitPlayback)
    }

    private var drawer: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                Text("Live TV").font(.system(size: 44, weight: .bold, design: .rounded))
                Spacer()
                MyListAction(id: String(selectedID), type: "channel")
                Button("Close", systemImage: "xmark") { dismissDrawer() }.labelStyle(.iconOnly).buttonStyle(BrowseCardStyle())
            }
            Text("Playing · \(selected?.name ?? "Live TV")").font(.system(size: 23)).foregroundStyle(.secondary).lineLimit(1)
            HStack(spacing: 12) {
                FilterChip(label: "Channels", isSelected: !showingMultiview && !searchOpen) { showingMultiview = false; searchOpen = false; searchText = ""; focusChannel() }
                    .focused($focus, equals: "channels")
                FilterChip(label: "Search", isSelected: searchOpen) { category = nil; showingMultiview = false; searchOpen = true; focus = "search" }
                    .focused($focus, equals: "search-tab")
                if openMultiview != nil {
                FilterChip(label: "Multiview", isSelected: showingMultiview) { showingMultiview = true; searchOpen = false; searchText = ""; focus = curatedPackages.first.map { "package:\($0.id)" } ?? "multiview" }
                    .focused($focus, equals: "multiview")
                }
            }
            if !showingMultiview {
                Menu {
                    Button("All channels") { category = nil; focusChannel() }
                    ForEach(categories, id: \.self) { value in Button(value) { category = value; focusChannel() } }
                } label: {
                    HStack { Text(category ?? "All categories"); Spacer(); Image(systemName: "chevron.down") }.font(.system(size: 26, weight: .semibold, design: .rounded)).padding(18)
                }.buttonStyle(BrowseCardStyle()).focused($focus, equals: "categories")
                if searchOpen {
                    TextField("Search channels", text: $searchText).font(.system(size: 22))
                        .focused($focus, equals: "search").onSubmit { focusChannel() }
                }
            }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 14) {
                        if showingMultiview {
                            if loadingPackages { ProgressView("Loading Multiview…") }
                            else if packageError { Button("Retry loading Multiview") { Task { await loadPackages() } } }
                            else if curatedPackages.isEmpty { Text("No Multiview packages are available yet.").foregroundStyle(.secondary).padding(20) }
                            ForEach(curatedPackages) { package in
                                Button {
                                    let pair = package.pair(in: channels, host: streamHost, feeds: feeds)
                                    openMultiview?(MultiviewSession(channels: channels, feeds: feeds, streamHost: streamHost, initialID: pair.first?.id, initialPair: pair.map(\.id), title: package.title))
                                } label: {
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text(package.title).font(.system(size: 25, weight: .bold, design: .rounded))
                                        Text("\(package.pair(in: channels, host: streamHost, feeds: feeds).count) channels · Multiview").font(.system(size: 18)).foregroundStyle(.secondary)
                                    }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
                                }.buttonStyle(BrowseCardStyle()).focused($focus, equals: "package:\(package.id)")
                            }
                        } else {
                            if visible.isEmpty { Text("No channels match your search.").foregroundStyle(.secondary).padding(20) }
                            ForEach(visible) { channel in
                                Button { tune(channel) } label: {
                                    HStack(spacing: 16) {
                                        BoundedArtwork(url: channel.thumbURL, symbol: "tv").frame(width: 100, height: 60).clipShape(RoundedRectangle(cornerRadius: 8))
                                        VStack(alignment: .leading, spacing: 6) {
                                            Text(channel.name).font(.system(size: 27, weight: .semibold, design: .rounded)).lineLimit(2)
                                            Text(channel.id == selectedID ? "Watching now" : BrowsePresentation.category(channel.category) ?? "Live channel")
                                                .font(.system(size: 21)).foregroundStyle(channel.id == selectedID ? ContentAppearance.accent : .secondary)
                                        }
                                        Spacer(minLength: 0)
                                    }.frame(maxWidth: .infinity, minHeight: 70, alignment: .leading).padding(16)
                                }.buttonStyle(BrowseCardStyle()).focused($focus, equals: "channel:\(channel.id)")
                                    .disabled(channel.playbackURL(streamHost: streamHost, feeds: feeds) == nil)
                                    .id("channel:\(channel.id)")
                            }
                        }
                    }.padding(8)
                }
                .onAppear {
                    // Position the selected channel once. Subsequent scrolling
                    // belongs to the focus engine, not a competing animation.
                    if !showingMultiview { proxy.scrollTo("channel:\(selectedID)", anchor: .center) }
                }
            }
            HStack {
                Button("Browse app", systemImage: "sidebar.left") { onClose() }.font(.system(size: 19)).buttonStyle(BrowseCardStyle())
                Spacer()
                Text("← or Back to close").font(.system(size: 17)).foregroundStyle(.secondary)
            }
        }
        .padding(34).padding(.vertical, 24).frame(width: 740)
        .environment(\.onDemandTypography, true)
        .background(Color(white: 0.055).opacity(0.98))
        .onMoveCommand { direction in
            if direction == .left { dismissDrawer() }
        }
    }
    private func focusChannel() {
        focus = visible.first(where: { $0.id == selectedID }).map { "channel:\($0.id)" } ?? visible.first.map { "channel:\($0.id)" }
    }
    private func revealDrawer() {
        controlsOpen = false
        showHint = false
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { drawerOpen = true }
        Task { @MainActor in await Task.yield(); guard drawerOpen else { return }; focusChannel() }
    }
    private func dismissDrawer() {
        guard drawerOpen else { return }
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { drawerOpen = false }
        Task { @MainActor in await Task.yield(); guard !drawerOpen else { return }; focus = "video" }
    }
    private func tune(_ channel: Channel) {
        guard let url = channel.playbackURL(streamHost: streamHost, feeds: feeds) else { return }
        if selectedID != channel.id {
            selectedID = channel.id
            onTune(channel, url)
            player.applyBlackout(channel.blackoutMessage())
            player.tune(url: url, title: channel.name)
            player.startIfEnabled()
        }
        dismissDrawer()
    }
    private func exitPlayback() {
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastExit > 0.35 else { return }
        lastExit = now
        if controlsOpen { controlsOpen = false }
        else if drawerOpen { dismissDrawer() }
        else { onClose() }
    }
    private func retune() {
        guard let selected, let url = selected.playbackURL(streamHost: streamHost, feeds: feeds) else { return }
        player.tune(url: url, title: selected.name)
        player.startIfEnabled()
    }
    private func loadPackages() async {
        loadingPackages = true; packageError = false
        defer { loadingPackages = false }
        do {
            async let nextPackages = supabase.fetchMultiviewPackages()
            async let nextRows = supabase.fetchCarousels()
            (packages, rows) = try await (nextPackages, nextRows)
        } catch { packageError = true }
    }
}

private struct VideoSurfaceButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { configuration.label }
}

struct ChannelPrograms {
    let current: GuideEntry?
    let next: GuideEntry?

    init(entries: [GuideEntry], channelID: Int, now: Date) {
        let ordered = entries.filter { $0.channel_id == channelID }
            .sorted { (GuideEntry.date($0.start_time) ?? .distantPast) < (GuideEntry.date($1.start_time) ?? .distantPast) }
        current = ordered.first { $0.isOnAir(at: now) }
        next = ordered.first { (GuideEntry.date($0.start_time) ?? .distantPast) > now }
    }
}
