import SwiftUI

struct HomeView: View {
    var openDestination: (Int) -> Void = { _ in }
    var openMultiview: (MultiviewSession) -> Void = { _ in }
    @State private var multiviewPackages: [MultiviewPackage] = []
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.catalogRevision) private var catalogRevision
    @Environment(\.contentEntryActive) private var contentEntryActive
    @State private var removingProgress: ContinueWatchingItem?
    @State private var removalError: String?
    @State private var continueItems: [ContinueWatchingItem] = []
    @State private var playingResume: ContinueWatchingItem?
    @State private var progressError: String?
    @State private var videos: [Video] = []
    @State private var shows: [Show] = []
    @State private var podcasts: [Podcast] = []
    @State private var selectedPodcast: Podcast?
    @State private var playingVideo: Video?
    @State private var heroVideo: Video?
    @State private var playingShow: Show?
    @State private var isLoading = true
    @State private var errorMessage: String?

    @State private var carousels: [Carousel] = []
    @State private var channels: [Channel] = []
    @State private var channelPlayback: Channel?
    @State private var homeHero: HomeHero?
    @State private var feeds: [PublicFeed] = []
    private var catalogVideos: [Video] { videos.sorted { $0.id < $1.id }.filter { !BrowsePresentation.isDemo($0.title) } }
    private var catalogShows: [Show] { shows.sorted { $0.id < $1.id }.filter { !BrowsePresentation.isDemo($0.title) } }
    private var fallbackItems: [HomeCatalogItem] { HomeCatalog.items(videos: catalogVideos, shows: catalogShows) }
    private var fallbackCategories: [String] {
        fallbackItems.compactMap(\.category).reduce(into: []) { result, category in
            if !result.contains(category) { result.append(category) }
        }
    }
    private var hero: HomeCatalogItem? { HomeCatalog.featured(videos: videos, shows: shows) }
    private var homeRows: [Carousel] { carousels.filter { $0.isHome && $0.enabled != false } }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if isLoading {
                VStack(spacing: 20) {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .scaleEffect(1.5)
                    Text("Loading…")
                        .font(.system(size: 24))
                        .foregroundColor(Color(white: 0.4))
                }
            } else if let errorMessage {
                StatusView(title: "Couldn't load Home", message: errorMessage, retry: { Task { await load() } })
            } else if videos.isEmpty && shows.isEmpty && channels.isEmpty && homeHero?.enabled != true {
                welcome
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVStack(alignment: .leading, spacing: 26) {

                        if homeHero?.enabled != true && hero == nil {
                            BrowseHeader(title: "Home", subtitle: "Movies, series and channels. All in one place.")
                        }

                        // Hero
                        if let promo = homeHero, promo.enabled == true {
                            HeroView(promo: promo, available: promoAvailable(promo)) { openPromo(promo) }
                                .disabled(playingVideo != nil || heroVideo != nil || playingShow != nil || playingResume != nil || channelPlayback != nil || selectedPodcast != nil)
                        } else if let hero {
                            switch hero {
                            case .movie(let video): HeroView(video: video) { heroVideo = video }
                            case .show(let show): HeroView(show: show) { playingShow = show }
                            }
                        }

                        if carousels.isEmpty {
                            continueShelf(title: "Continue Watching")
                            catalogShelf(title: "Trending Now", items: Array(fallbackItems.reversed()), layout: "top10")
                            ForEach(fallbackCategories, id: \.self) { category in
                                catalogShelf(title: "\(category) Films", items: fallbackItems.filter { $0.category == category })
                            }
                        } else {
                            ForEach(homeRows) { row in
                                carousel(row)
                            }
                        }
                    }
                    .padding(.bottom, 100)
                }
                .scrollClipDisabled()
                .ignoresSafeArea(.container, edges: [.top, .trailing])
            }
        }
        .confirmationDialog("Remove from Continue Watching?", isPresented: Binding(get: { removingProgress != nil }, set: { if !$0 { removingProgress = nil } }), titleVisibility: .visible) {
            if let item = removingProgress {
                Button("Remove", role: .destructive) { Task {
                    do {
                        try await supabase.removeWatchProgress(identity: item.progress.identity)
                        continueItems.removeAll { $0.id == item.id }
                    } catch { removalError = error.localizedDescription }
                } }
            }
            Button("Cancel", role: .cancel) { removingProgress = nil }
        } message: { Text("This clears the saved resume position for this title across your account. Watching it again adds it back.") }
        .alert("Couldn't remove title", isPresented: Binding(get: { removalError != nil }, set: { if !$0 { removalError = nil } })) {
            Button("OK") { removalError = nil }
        } message: { Text(removalError ?? "Please try again.") }
        .onChange(of: supabase.watchProgressRevision) { _, _ in Task { await loadContinue() } }
        .task(id: supabase.session?.userId) { await loadContinue() }
        .fullScreenCover(item: $playingResume) { item in
            PlaybackView(url: item.url, title: item.title, identity: item.progress.identity)
        }
        .sheet(item: $selectedPodcast) { PodcastDetailView(podcast: $0) }
        .task(id: catalogRevision) { await load() }
        .task(id: contentEntryActive) {
            guard contentEntryActive else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
                if !isLoading {
                    async let nextPackages = supabase.fetchMultiviewPackages()
                    async let nextRows = supabase.fetchCarousels()
                    async let nextChannels = supabase.fetchChannels()
                    if let value = try? await nextChannels { channels = value }
                    if let value = try? await nextPackages { multiviewPackages = value }
                    if let value = try? await nextRows { carousels = value }
                }
            }
        }
        .fullScreenCover(item: $playingVideo) { MovieDetailView(video: $0) }
        .fullScreenCover(item: $heroVideo) { v in
            PlaybackView(url: v.videoURL, title: v.title, identity: PlaybackIdentity(id: v.id, type: "movie"))
        }
        .fullScreenCover(item: $channelPlayback) { channel in
            PlaybackView(url: channel.playbackURL(streamHost: supabase.configuration?.streamHost ?? "", feeds: feeds), title: channel.name, liveChannelID: channel.id)
        }
        .fullScreenCover(item: $playingShow) { s in
            SeriesDetailView(show: s)
        }
    }

    private var welcome: some View {
        StatusView(title: "No titles available", message: "Check back soon.", retry: { Task { await load() } })
    }

    @ViewBuilder private func carousel(_ row: Carousel) -> some View {
        let items = HomeCatalog.row(row, videos: row.type == "handpicked" ? videos : catalogVideos, shows: row.type == "handpicked" ? shows : catalogShows)
        if row.type == "continue" {
            continueShelf(title: row.title, contentType: row.content_type)
        } else if row.type == "multiview" {
            MultiviewPackageShelf(row: row, packages: multiviewPackages, channels: channels, feeds: feeds,
                                  streamHost: supabase.configuration?.streamHost ?? "", open: openMultiview)
        } else if row.type == "live_channels" {
            let items = rowChannels(row)
            if !items.isEmpty {
                ShelfView(title: row.title) {
                    ForEach(items) { channel in
                        Button { channelPlayback = channel } label: {
                            VStack(alignment: .leading, spacing: 12) {
                                BoundedArtwork(url: channel.thumbURL, symbol: "tv")
                                    .frame(width: 300, height: 169).background(Color(white: 0.1))
                                Text(channel.name).font(.system(size: 22, weight: .semibold)).lineLimit(2).frame(height: 54, alignment: .topLeading).padding(.horizontal, 12).padding(.bottom, 10)
                            }.frame(width: 300)
                        }.buttonStyle(BrowseCardStyle()).saveToMyList(String(channel.id), type: "channel").sidebarBoundary(channel.id == items.first?.id)
                    }
                }
            }
        } else if !items.isEmpty {
            catalogShelf(title: row.title, items: items, layout: row.layout ?? (row.type == "trending" ? "top10" : "standard"))
        }
    }

    @ViewBuilder private func continueShelf(title: String, contentType: String? = nil) -> some View {
        let items = continueItems.filter { item in
            contentType == "shorts" ? item.progress.content_type == "movie" :
            contentType == "shows" ? item.progress.content_type == "episode" : true
        }
        if !items.isEmpty {
            ShelfView(title: title) {
                ForEach(items) { item in
                    Button { playingResume = item } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            BoundedArtwork(url: item.artwork, symbol: "play.rectangle")
                                .frame(width: 350, height: 197)
                            VStack(alignment: .leading, spacing: 8) {
                                Text(item.title).font(.system(size: 23, weight: .semibold)).lineLimit(1)
                                ProgressView(value: item.progress.fraction)
                                    .tint(.white)
                                Text("Resume · \(max(1, Int(((item.progress.duration_seconds ?? 0) - (item.progress.progress_seconds ?? 0)) / 60))) min left")
                                    .font(.system(size: 17)).foregroundStyle(.secondary)
                            }.padding(12)
                        }.frame(width: 350)
                    }.buttonStyle(BrowseCardStyle()).sidebarBoundary(item.id == items.first?.id)
                    .contextMenu {
                        Button("Resume", systemImage: "play.fill") { playingResume = item }
                        Button("Remove from Continue Watching", systemImage: "minus.circle") { removingProgress = item }
                    }
                    .accessibilityHint("Select to resume. Hold Select for title options.")
                }
            }
        } else if progressError != nil && supabase.session != nil {
            Button("Reload Continue Watching") { Task { await loadContinue() } }
                .buttonStyle(BrowseCardStyle()).padding(.horizontal, 70).sidebarBoundary()
        }
    }

    private func loadContinue() async {
        guard let userID = supabase.session?.userId else { continueItems = []; progressError = nil; return }
        do {
            let progress = try await supabase.fetchWatchProgress().filter(\.canResume)
            let ids = progress.filter { $0.content_type == "episode" }.compactMap { Int($0.content_id) }
            let episodes = try await supabase.fetchContinueEpisodes(ids: ids)
            guard supabase.session?.userId == userID else { return }
            continueItems = progress.compactMap { row in
                if row.content_type == "movie", let video = videos.first(where: { $0.id == row.content_id }), let url = video.videoURL {
                    return ContinueWatchingItem(progress: row, title: video.title, artwork: video.heroURL, url: url)
                }
                if row.content_type == "episode", let episode = episodes.first(where: { String($0.id) == row.content_id }),
                   let show = shows.first(where: { $0.id == episode.show_id }), let url = episode.videoURL {
                    return ContinueWatchingItem(progress: row, title: "\(show.title) · \(episode.displayTitle)", artwork: episode.thumbURL ?? show.thumbURL, url: url)
                }
                return nil
            }
            progressError = nil
        } catch { progressError = error.localizedDescription }
    }

    private func catalogShelf(title: String, items: [HomeCatalogItem], layout: String = "standard") -> some View {
        ShelfView(title: title) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    Group {
                        switch item {
                        case .movie(let video): VideoCardView(video: video, width: layout == "spotlight" ? 360 : 320) { playingVideo = video }
                        case .show(let show): ShowCardView(show: show, width: layout == "spotlight" ? 360 : 320) { playingShow = show }
                        }
                    }
                    .sidebarBoundary(index == 0)
                    .overlay(alignment: .bottomLeading) {
                        if layout == "top10" {
                            Text(String(index + 1)).font(.system(size: 68, weight: .black))
                                .foregroundStyle(.white).shadow(color: .black, radius: 4)
                                .offset(x: -14, y: 10).allowsHitTesting(false).accessibilityHidden(true)
                        }
                    }
                }
        }
    }

    private func rowChannels(_ row: Carousel) -> [Channel] {
        if let picks = row.picks { return picks.compactMap { pick in channels.first { String($0.id) == pick.id.value } } }
        let items = channels.filter { !BrowsePresentation.isDemo($0.name) }
        guard let filter = row.filter_value, !filter.isEmpty, filter.lowercased() != "all" else { return items }
        return items.filter { ($0.category ?? "general").lowercased() == filter.lowercased() }
    }

    private func promoAvailable(_ promo: HomeHero) -> Bool {
        switch promo.cta_type {
        case "podcast": return podcasts.contains { String($0.id) == promo.cta_value }
        case "movie": return videos.contains { $0.id == promo.cta_value }
        case "show": return shows.contains { String($0.id) == promo.cta_value }
        case "channel": return channels.contains { String($0.id) == promo.cta_value }
        case "tab": return promo.tabDestination != nil
        default: return false
        }
    }

    private func openPromo(_ promo: HomeHero) {
        switch promo.cta_type {
        case "podcast": selectedPodcast = podcasts.first { String($0.id) == promo.cta_value }
        case "movie": playingVideo = videos.first { $0.id == promo.cta_value }
        case "show": playingShow = shows.first { String($0.id) == promo.cta_value }
        case "channel": channelPlayback = channels.first { String($0.id) == promo.cta_value }
        case "tab": if let destination = promo.tabDestination { openDestination(destination) }
        default: break
        }
    }

    private func load() async {
        isLoading = videos.isEmpty && shows.isEmpty && channels.isEmpty
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let packages = supabase.fetchMultiviewPackages()
            async let pods = supabase.fetchPodcasts()
            async let v = supabase.fetchVideos()
            async let s = supabase.fetchShows()
            async let c = supabase.fetchCarousels()
            async let ch = supabase.fetchChannels()
            async let promo = supabase.fetchHomeHero()
            async let publicFeeds = supabase.fetchFeeds()
            (videos, shows, carousels, channels) = try await (v, s, c, ch)
            isLoading = false
            // Optional configuration/feed failure must not hide otherwise playable catalog content.
            homeHero = (try? await promo) ?? nil
            feeds = (try? await publicFeeds) ?? []
            podcasts = (try? await pods) ?? []
            multiviewPackages = (try? await packages) ?? []
            await loadContinue()
        } catch { errorMessage = error.localizedDescription }
    }
}

// MARK: - Shelf

struct ShelfView<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text(title)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .padding(.leading, 70)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 28) { content }
                    .padding(.horizontal, 70)
                    .padding(.vertical, 16)
                    .focusSection()
            }
        }
    }
}
