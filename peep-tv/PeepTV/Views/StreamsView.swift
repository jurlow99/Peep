import SwiftUI

struct VerticalFocusPosition {
    var column = 0
    func index(in count: Int) -> Int? { count > 0 ? min(max(column, 0), count - 1) : nil }
}

private struct ChannelPlayback: Identifiable {
    let id: Int
    let title: String
    let url: URL?
}

struct StreamsView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.catalogRevision) private var catalogRevision
    @State private var channels: [Channel] = []
    @State private var packages: [MultiviewPackage] = []
    @State private var rows: [Carousel] = []
    @State private var guide: [GuideEntry] = []
    @State private var guideRefreshedAt = Date.distantPast
    @State private var feeds: [PublicFeed] = []
    @State private var selected: ChannelPlayback?
    let isActive: Bool
    let returnToRail: () -> Void
    let openGuide: (LiveGuideSession) -> Void
    let openMultiview: (MultiviewSession) -> Void
    var preferredChannelID: Int? = nil
    var previewPlayer: PlayerModel? = nil
    var playingTitle: String? = nil
    @FocusState private var focus: String?
    @State private var lastChannelID: Int?
    private let columnCount = 3
    @State private var category: String?
    @State private var showingMultiview = false
    @State private var searching = false
    @State private var searchText = ""
    @State private var isLoading = true
    @State private var errorMessage: String?

    @State private var showDemos = false
    private var catalog: [Channel] { channels.filter { BrowsePresentation.isDemo($0.name) == showDemos } }
    private var visible: [Channel] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return catalog.filter { channel in
            (category == nil || BrowsePresentation.categories(channel.category).contains(category!))
            && (query.isEmpty || "\(channel.name) \(channel.category ?? "") \(channel.description ?? "")".localizedCaseInsensitiveContains(query))
        }
    }
    private var categories: [String] { Array(Set(catalog.flatMap { BrowsePresentation.categories($0.category) })).sorted() }
    private var multiviewRows: [Carousel] { curatedRows.filter { $0.type == "multiview" } }



    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 24) {
                BrowseHeader(title: "Live TV", subtitle: showDemos ? "Development samples · VOD, not live broadcasts" : "Choose a channel and settle in")
                if let player = previewPlayer {
                    VStack(alignment: .leading, spacing: 6) {
                        NativePlayer(player: player.player, onExit: {}, interactive: false, pauseOnDismantle: false)
                            .aspectRatio(16 / 9, contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        Text("Playing · \(playingTitle ?? "Live TV")")
                            .font(.system(size: 16, weight: .semibold)).lineLimit(1)
                    }
                    .frame(width: 260).padding(.trailing, 70).padding(.top, 12)
                    .allowsHitTesting(false).accessibilityHidden(true)
                }
            }
            if isLoading {
                ProgressView("Loading channels…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                StatusView(title: "Couldn't load live TV", message: errorMessage, retry: { Task { await load() } })
            } else if channels.isEmpty {
                StatusView(title: "No channels yet", message: "Live channels will appear here when available.", symbol: "antenna.radiowaves.left.and.right")
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 24) {
                        ForEach(Array(filterLabels.enumerated()), id: \.offset) { index, label in
                            FilterChip(label: label, isSelected: filterSelected(index)) { applyFilter(index) }
                                .focused($focus, equals: "filter:\(index)")
                                .sidebarBoundary(index == 0)

                        }
                    }.padding(.horizontal, 70).padding(.vertical, 12)
                }
                .focusSection()
                if searching {
                    TextField("Search channels", text: $searchText)
                        .font(.system(size: 24)).padding(.horizontal, 80)
                        .focused($focus, equals: "search")
                        .onSubmit { focusFirstChannel() }
                }
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    ScrollView {
                        if showingMultiview {
                            ForEach(multiviewRows) { row in
                                if row.type == "multiview" {
                                    MultiviewPackageShelf(row: row, packages: packages, channels: catalog, feeds: feeds,
                                        streamHost: supabase.configuration?.streamHost ?? "", open: openMultiview,
                                        packageFocus: $focus, navigate: { _ in })
                                }
                            }
                            if multiviewRows.isEmpty { Text("No multiview packages are available yet.").foregroundStyle(.secondary).padding(80) }
                        } else {
                            Text(searching ? "Search results" : (category ?? "All Channels"))
                                .font(.system(size: 30, weight: .bold, design: .rounded))
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 80)
                            if visible.isEmpty {
                                Text("No channels match your search.").foregroundStyle(.secondary).padding(80)
                            }
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: 350), spacing: 24), count: columnCount), spacing: 24) {
                            ForEach(Array(visible.enumerated()), id: \.element.id) { index, channel in
                                channelCard(channel, now: context.date)
                                    .focused($focus, equals: "channel:\(channel.id)")
                                    .sidebarBoundary(index % columnCount == 0)

                            }
                        }.padding(.horizontal, 70).padding(.vertical, 20)
                        }
                    }.focusSection()
                }
            }
        }
        .background(Color.black)
        .environment(\.onDemandTypography, true)
        .task(id: isActive) {
            guard isActive else { focus = nil; return }
            await Task.yield()
            guard !Task.isCancelled, isActive else { return }
            await refreshCuration()
            focusFirstChannel()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
                await refreshCuration()
                if Date().timeIntervalSince(guideRefreshedAt) > 300 { await refreshGuide() }
            }
        }
        .onChange(of: focus) { _, target in
            if let target, target.hasPrefix("channel:"), let id = Int(target.dropFirst(8)) { lastChannelID = id }
        }
        .onExitCommand { if selected == nil { returnToRail() } }
        .task(id: catalogRevision) {
            await load()
            if isActive { focusFirstChannel() }
        }
        .fullScreenCover(item: $selected) { selection in
            PlaybackView(url: selection.url, title: selection.title)
        }
    }

    private var curatedRows: [Carousel] {
        rows.filter { row in
            guard row.type == "multiview", row.enabled != false,
                  (row.pages ?? "home").split(separator: ",").contains(where: { $0.trimmingCharacters(in: .whitespaces) == "live" }) else { return false }
            return !rowTargets(row).isEmpty
        }
    }
    private func rowTargets(_ row: Carousel) -> [String] {
        if row.type == "multiview" {
            return MultiviewPackage.items(for: row, packages: packages).filter {
                !$0.pair(in: catalog, host: supabase.configuration?.streamHost ?? "", feeds: feeds).isEmpty
            }.map { "\(row.id):\($0.id)" }
        }
        guard row.type == "live_channels" else { return [] }
        return row.liveChannels(from: catalog).map { "live:\(row.id):\($0.id)" }
    }
    private var filterLabels: [String] {
        ["All", "Search", "Multiview"] + categories
        + (supabase.configuration?.isDevelopment == true ? [showDemos ? "Back to channels" : "Development samples"] : [])
        + ["Refresh"]
    }
    private func filterSelected(_ index: Int) -> Bool {
        if filterLabels[index] == "Search" { return searching }
        if filterLabels[index] == "Multiview" { return showingMultiview }
        return !searching && !showingMultiview && (index == 0 ? category == nil : index >= 3 && index < categories.count + 3 && category == categories[index - 3])
    }
    private func applyFilter(_ index: Int) {
        let label = filterLabels[index]
        if label == "Refresh" { Task { await load(); if isActive { focusFirstChannel() } }; return }
        if label == "Development samples" || label == "Back to channels" { showDemos.toggle(); category = nil; searching = false; showingMultiview = false; searchText = ""; focusFirstChannel(); return }
        searching = label == "Search"
        showingMultiview = label == "Multiview"
        category = index >= 3 && index < categories.count + 3 ? categories[index - 3] : nil
        searchText = ""
        if searching { focus = "search" } else { focusFirstChannel() }
    }

    private func focusFirstChannel() {
        guard isActive else { return }
        if showingMultiview, let row = multiviewRows.first, let first = rowTargets(row).first { focus = first }
        else if let id = lastChannelID ?? preferredChannelID, visible.contains(where: { $0.id == id }) { focus = "channel:\(id)" }
        else if let first = visible.first { focus = "channel:\(first.id)" }
        else { focus = "filter:\(0)" }
    }

    private func watchChannel(_ channel: Channel) {
        let host = supabase.configuration?.streamHost ?? ""
        if let url = channel.playbackURL(streamHost: host, feeds: feeds) {
            openGuide(LiveGuideSession(channels: catalog, initial: channel, url: url, feeds: feeds, streamHost: host, guide: guide))
        } else { selected = ChannelPlayback(id: channel.id, title: channel.displayName, url: nil) }
    }

    private func channelCard(_ channel: Channel, now: Date) -> some View {
        let entries = guide.filter { $0.channel_id == channel.id }
        let current = entries.first { $0.isOnAir(at: now) }
        let next = entries.first { (GuideEntry.date($0.start_time) ?? .distantPast) > now }
        return Button { watchChannel(channel)
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                BoundedArtwork(url: channel.thumbURL, symbol: "tv")
                    .frame(width: 326, height: 130)
                    .background(Color(white: 0.12)).clipShape(RoundedRectangle(cornerRadius: 10))
                Text(channel.displayName).font(.system(size: 29, weight: .semibold, design: .rounded)).lineLimit(1)
                Text(channel.description?.isEmpty == false ? channel.description! : (BrowsePresentation.category(channel.category) ?? "Live channel"))
                    .font(.system(size: 21)).foregroundStyle(.secondary).lineLimit(2)
                if let current {
                    Text("Now · \(current.title ?? "Program information unavailable")").font(.system(size: 22)).lineLimit(1)
                }
                if let next, current != nil {
                    Text("Next · \(next.title ?? "Schedule unavailable")").font(.system(size: 20)).foregroundStyle(.secondary).lineLimit(1)
                }
            }.frame(width: 326, height: 250, alignment: .topLeading).padding(12)
        }.buttonStyle(BrowseCardStyle()).saveToMyList(String(channel.id), type: "channel")
    }

    private func load() async {
        isLoading = channels.isEmpty
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let packageRequest = supabase.fetchMultiviewPackages()
            async let rowRequest = supabase.fetchCarousels()
            async let feedRequest = supabase.fetchFeeds()
            channels = try await supabase.fetchChannels()
            isLoading = false
            packages = (try? await packageRequest) ?? []
            rows = (try? await rowRequest) ?? []
            // This optional view isn't installed in every dev database.
            feeds = (try? await feedRequest) ?? []
            await refreshGuide()
        } catch { errorMessage = error.localizedDescription }
    }

    // A failed refresh keeps the last guide rather than blanking every card.
    private func refreshGuide() async {
        if let value = try? await supabase.fetchGuide() { guide = value; guideRefreshedAt = Date() }
    }
    private func refreshCuration() async {
        async let nextPackages = supabase.fetchMultiviewPackages()
        async let nextRows = supabase.fetchCarousels()
        async let nextChannels = supabase.fetchChannels()
        if let value = try? await nextChannels { channels = value }
        if let value = try? await nextPackages { packages = value }
        if let value = try? await nextRows { rows = value }
    }
}
