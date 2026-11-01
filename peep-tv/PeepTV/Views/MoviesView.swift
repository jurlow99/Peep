import SwiftUI

struct MoviesView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.catalogRevision) private var catalogRevision
    @State private var videos: [Video] = []
    @State private var selectedCategory: String? = nil
    @State private var selectedVideo: Video?
    @State private var isLoading = true
    @State private var errorMessage: String?

    @State private var showDemos = false
    private var catalog: [Video] { videos.filter { BrowsePresentation.isDemo($0.title) == showDemos } }
    private var categories: [String] { Array(Set(catalog.flatMap { BrowsePresentation.categories($0.category) })).sorted() }
    private var filtered: [Video] {
        catalog.filter { selectedCategory == nil || BrowsePresentation.categories($0.category).contains(selectedCategory!) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BrowseHeader(title: "Movies", subtitle: showDemos ? "Development samples · on-demand test videos" : "")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    FilterChip(label: "All movies", isSelected: selectedCategory == nil) { selectedCategory = nil }.sidebarBoundary()
                    ForEach(categories, id: \.self) { cat in
                        FilterChip(label: cat, isSelected: selectedCategory == cat) { selectedCategory = cat }
                    }
                    if supabase.configuration?.isDevelopment == true {
                        FilterChip(label: showDemos ? "Back to catalog" : "Development samples", isSelected: showDemos) {
                            showDemos.toggle(); selectedCategory = nil
                        }
                    }
                }.padding(.horizontal, 70).padding(.vertical, 12)
            }.focusSection()

            if isLoading {
                ProgressView("Loading movies…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                StatusView(title: "Couldn't load movies", message: errorMessage, retry: { Task { await load() } })
            } else if filtered.isEmpty {
                StatusView(title: "No movies yet", message: "Try another category or come back soon.", symbol: "film")
            } else {
                GeometryReader { geometry in
                    let count = PosterGrid.columnCount(availableWidth: geometry.size.width - 140)
                    ScrollView {
                        LazyVGrid(columns: Array(repeating: GridItem(.fixed(PosterGrid.cardWidth), spacing: PosterGrid.spacing, alignment: .top), count: count), alignment: .leading, spacing: 34) {
                            ForEach(Array(filtered.enumerated()), id: \.element.id) { index, video in
                                VideoCardView(video: video) { selectedVideo = video }
                                    .contentEntryTarget(index == 0).sidebarBoundary(index % count == 0)
                            }
                        }.frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 70).padding(.top, 24).padding(.bottom, 60).focusSection()
                    }
                }
            }
        }
        .background(Color.black)
        .task(id: catalogRevision) { await load() }
        .fullScreenCover(item: $selectedVideo) { MovieDetailView(video: $0) }
    }

    private func load() async {
        isLoading = videos.isEmpty
        errorMessage = nil
        defer { isLoading = false }
        do { videos = try await supabase.fetchVideos() }
        catch { errorMessage = error.localizedDescription }
    }
}

struct FilterChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isSelected { Image(systemName: "checkmark").font(.system(size: 17, weight: .bold)) }
                Text(label)
            }
                .lineLimit(1).fixedSize(horizontal: true, vertical: false)
        }
        .buttonStyle(TVPillStyle(selected: isSelected))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// Account-backed library shared with web My List; unknown/unavailable saves remain removable.
struct MyListView: View {
    @EnvironmentObject private var supabase: SupabaseService
    @Environment(\.catalogRevision) private var catalogRevision
    @State private var videos: [Video] = []
    @State private var shows: [Show] = []
    @State private var channels: [Channel] = []
    @State private var feeds: [PublicFeed] = []
    @State private var guide: [GuideEntry] = []
    @State private var filter = "All"
    @State private var loading = true
    @State private var error: String?
    @State private var notice: String?
    @State private var signIn = false
    @State private var movie: Video?
    @State private var show: Show?
    @State private var live: Channel?
    private let filters = ["All", "Movies", "Series", "Live TV"]

    private var entries: [SavedLibraryEntry] {
        supabase.savedItems.filter { ["movie", "show", "channel"].contains($0.type) }.map { item in
            SavedLibraryEntry(saved: item,
                video: item.type == "movie" ? videos.first { $0.id == item.content_id } : nil,
                show: item.type == "show" ? shows.first { String($0.id) == item.content_id } : nil,
                channel: item.type == "channel" ? channels.first { String($0.id) == item.content_id } : nil)
        }.filter { filter == "All" || $0.category == filter }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            BrowseHeader(title: "My List", subtitle: "Your favorites, ready when you are")
            if supabase.session == nil {
                VStack(spacing: 24) {
                    Image(systemName: "bookmark").font(.system(size: 60)).foregroundStyle(.secondary)
                    Text("Make it yours").font(.system(size: 36, weight: .bold, design: .rounded))
                    Text("Sign in to save movies, series, and live channels to your account.")
                        .font(.system(size: 23)).foregroundStyle(.secondary)
                    Button { signIn = true } label: {
                        Label("Sign in", systemImage: "person.crop.circle")
                            .font(.system(size: 24, weight: .semibold))
                            .padding(.horizontal, 28).padding(.vertical, 16)
                    }.buttonStyle(BrowseCardStyle()).sidebarBoundary()
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(filters, id: \.self) { value in
                            FilterChip(label: value, isSelected: filter == value) { filter = value }.sidebarBoundary(value == "All")
                        }
                    }.padding(.horizontal, 70).padding(.vertical, 10)
                }.focusSection()
                if loading {
                    ProgressView("Opening My List…").frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error {
                    StatusView(title: "Couldn't load My List", message: error, retry: { Task { await load() } })
                } else if entries.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "bookmark").font(.system(size: 54)).foregroundStyle(.secondary)
                        Text(filter == "All" ? "Your next favorites belong here" : "No saved \(filter.lowercased()) yet")
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                        Text("Hold Select on a movie, series, or channel card to add it to My List.")
                            .font(.system(size: 22)).foregroundStyle(.secondary)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    Text("\(entries.count) saved · Hold Select to remove an item")
                        .font(.system(size: 19)).foregroundStyle(.secondary).padding(.horizontal, 70)
                    ScrollView {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 26), count: 3), spacing: 28) {
                            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                                Button { open(entry) } label: {
                                    VStack(alignment: .leading, spacing: 12) {
                                        BoundedArtwork(url: entry.artwork, symbol: entry.saved.type == "channel" ? "tv" : "film")
                                            .frame(width: 350, height: 197).background(Color(white: 0.1)).clipShape(RoundedRectangle(cornerRadius: 12))
                                        Text(entry.title).font(.system(size: 25, weight: .semibold)).lineLimit(2).frame(height: 62, alignment: .topLeading)
                                        Text(entry.available ? entry.category : "Unavailable · Hold Select to remove")
                                            .font(.system(size: 17)).foregroundStyle(.secondary).lineLimit(1)
                                    }.frame(width: 350, alignment: .leading).padding(12)
                                }.buttonStyle(BrowseCardStyle())
                                    .saveToMyList(entry.saved.content_id, type: entry.saved.type)
                                    .contentEntryTarget(index == 0)
                                    .sidebarBoundary(index % 3 == 0)
                            }
                        }.padding(.horizontal, 70).padding(.vertical, 20).focusSection()
                    }
                }
            }
        }
        .background(.black)
        .task(id: "\(catalogRevision):\(supabase.session?.userId ?? "guest")") { await load() }
        .sheet(isPresented: $signIn) { AuthView() }
        .fullScreenCover(item: $show) { SeriesDetailView(show: $0) }
        .fullScreenCover(item: $movie) { MovieDetailView(video: $0) }
        .fullScreenCover(isPresented: Binding(get: { live != nil }, set: { if !$0 { live = nil } })) {
            if let channel = live, let url = channel.playbackURL(streamHost: supabase.configuration?.streamHost ?? "", feeds: feeds) {
                LiveSurfView(channels: channels, initial: channel, url: url, feeds: feeds,
                             streamHost: supabase.configuration?.streamHost ?? "", guide: guide, onClose: { live = nil })
            }
        }
        .alert("Currently unavailable", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK") { notice = nil }
        } message: { Text(notice ?? "") }
    }
    private func open(_ entry: SavedLibraryEntry) {
        if let video = entry.video { movie = video }
        else if let series = entry.show { show = series }
        else if let channel = entry.channel,
                channel.playbackURL(streamHost: supabase.configuration?.streamHost ?? "", feeds: feeds) != nil { live = channel }
        else { notice = "This saved item isn't available in the current catalog. Hold Select to remove it from My List." }
    }
    private func load() async {
        guard supabase.session != nil else { loading = false; videos = []; shows = []; channels = []; return }
        let userID = supabase.session?.userId
        loading = true; error = nil
        defer { loading = false }
        do {
            async let v = supabase.fetchVideos()
            async let s = supabase.fetchShows()
            async let c = supabase.fetchChannels()
            async let f = supabase.fetchFeeds()
            async let g = supabase.fetchGuide()
            try await supabase.refreshSavedList()
            let catalog = try await (v, s, c, f)
            guard !Task.isCancelled, userID == supabase.session?.userId else { return }
            (videos, shows, channels, feeds) = catalog
            guide = (try? await g) ?? []
        } catch { if userID == supabase.session?.userId { self.error = error.localizedDescription } }
    }
}

private struct SavedLibraryEntry: Identifiable {
    let saved: SavedListItem
    let video: Video?
    let show: Show?
    let channel: Channel?
    var id: String { saved.id }
    var category: String { saved.type == "movie" ? "Movies" : saved.type == "show" ? "Series" : "Live TV" }
    var title: String { video?.title ?? show?.title ?? channel?.displayName ?? "Unavailable \(saved.type == "show" ? "series" : saved.type)" }
    var artwork: URL? { video?.thumbURL ?? show?.thumbURL ?? channel?.thumbURL }
    var available: Bool { video != nil || show != nil || channel != nil }
}

// MARK: - Movie detail

/// Mirrors SeriesDetailView: artwork, facts, Play/Resume, Start over, Trailer, My List
/// and a "More like this" shelf, instead of a card starting playback on its own.
/// Title artwork behind the detail header, dimmed so text stays readable and
/// faded to black before the rows below. Logos and tiny thumbnails still work:
/// the image fills the band and the gradient hides the edges.
struct DetailBackdrop: View {
    let url: URL?
    var body: some View {
        if url != nil {
            VStack(spacing: 0) {
                BoundedArtwork(url: url, symbol: "photo", fillsCard: true)
                    .frame(height: 820)
                    .overlay(LinearGradient(colors: [.black.opacity(0.55), .black.opacity(0.75), .black], startPoint: .top, endPoint: .bottom))
                    .overlay(LinearGradient(colors: [.black.opacity(0.9), .clear], startPoint: .leading, endPoint: .trailing).frame(maxWidth: .infinity))
                Color.black
            }.ignoresSafeArea().allowsHitTesting(false)
        }
    }
}

/// Genre/tag chips under the synopsis. Static text: nothing to focus.
struct DetailTagRow: View {
    let tags: [String]
    var body: some View {
        HStack(spacing: 10) {
            ForEach(tags, id: \.self) { tag in
                Text(tag).font(.system(size: 17, weight: .semibold)).foregroundStyle(Color(white: 0.8))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(Color.white.opacity(0.1), in: Capsule())
            }
        }
    }
}

struct MovieDetailView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.dismiss) private var dismiss
    let video: Video
    @State private var progress: WatchProgress?
    @State private var related: [Video] = []
    @State private var playback: MoviePlayback?
    @State private var relatedSelection: Video?
    @State private var pendingRelated: Video?

    private enum MoviePlayback: Identifiable {
        case movie(startOver: Bool), trailer
        var id: String {
            switch self {
            case .movie(let startOver): return startOver ? "start" : "resume"
            case .trailer: return "trailer"
            }
        }
    }
    private var canResume: Bool { progress?.canResume == true }
    private var trailerURL: URL? { MediaURL.playback(video.trailer_url) }
    private var facts: String {
        [video.year.map(String.init), video.rating, video.duration, BrowsePresentation.category(video.category)]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "  ·  ")
    }
    private var remaining: String? {
        guard canResume, let position = progress?.progress_seconds, let duration = progress?.duration_seconds else { return nil }
        let minutes = Int(((duration - position) / 60).rounded(.up))
        return minutes > 0 ? "\(minutes) min left" : nil
    }

    private enum Field: Hashable { case back, play }
    @FocusState private var field: Field?
    private var tagChips: [String] { BrowsePresentation.tagChips(video.tags, category: video.category) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                Button { dismiss() } label: {
                    Label("Back", systemImage: "chevron.left")
                        .font(.system(size: 21, weight: .semibold)).padding(.horizontal, 20).padding(.vertical, 14)
                }.buttonStyle(BrowseCardStyle()).focused($field, equals: .back)

                HStack(alignment: .center, spacing: 44) {
                    PosterArtwork(url: video.thumbURL, width: 300, symbol: "film")
                    VStack(alignment: .leading, spacing: 16) {
                        Text("MOVIE").font(.system(size: 16, weight: .bold)).tracking(3).foregroundStyle(.secondary)
                        Text(video.title.trimmingCharacters(in: .whitespacesAndNewlines))
                            .font(.system(size: 52, weight: .bold, design: .rounded)).lineLimit(2)
                        if !facts.isEmpty {
                            Text(facts).font(.system(size: 21, weight: .medium)).foregroundStyle(Color(white: 0.72))
                        }
                        if let description = video.description, !description.isEmpty {
                            Text(description).font(.system(size: 23)).foregroundStyle(Color(white: 0.72))
                                .lineLimit(5).frame(maxWidth: 1040, alignment: .leading)
                        }
                        if !tagChips.isEmpty { DetailTagRow(tags: tagChips) }
                        if let progress, canResume {
                            VStack(alignment: .leading, spacing: 8) {
                                GeometryReader { geometry in
                                    Rectangle().fill(Color.white.opacity(0.22))
                                        .overlay(alignment: .leading) {
                                            Rectangle().fill(ContentAppearance.accent).frame(width: geometry.size.width * progress.fraction)
                                        }
                                }.frame(height: 6).clipShape(Capsule())
                                if let remaining { Text(remaining).font(.system(size: 18)).foregroundStyle(.secondary) }
                            }.frame(maxWidth: 520)
                        }
                        HStack(spacing: 20) {
                            if video.videoURL != nil {
                                Button { playback = .movie(startOver: false) } label: {
                                    Label(canResume ? "Resume" : "Play", systemImage: "play.fill")
                                        .font(.system(size: 22, weight: .semibold)).padding(18)
                                }.buttonStyle(BrowseCardStyle()).focused($field, equals: .play)
                                if canResume {
                                    Button { playback = .movie(startOver: true) } label: {
                                        Label("Start over", systemImage: "arrow.counterclockwise")
                                            .font(.system(size: 22, weight: .semibold)).padding(18)
                                    }.buttonStyle(BrowseCardStyle())
                                }
                            }
                            if trailerURL != nil {
                                Button { playback = .trailer } label: {
                                    Label("Trailer", systemImage: "film")
                                        .font(.system(size: 22, weight: .semibold)).padding(18)
                                }.buttonStyle(BrowseCardStyle())
                            }
                            MyListAction(id: video.id, type: "movie")
                        }.padding(.top, 8)
                        if video.videoURL == nil {
                            Text("Not available to stream right now.").font(.system(size: 19)).foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                }.focusSection()

                if !related.isEmpty {
                    Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1).padding(.top, 4)
                    Text("More like this").font(.system(size: 32, weight: .bold, design: .rounded))
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(alignment: .top, spacing: 24) {
                            ForEach(related) { item in
                                VideoCardView(video: item) { relatedSelection = item }
                            }
                        }.padding(.vertical, 28)
                    }.focusSection()
                }
            }.padding(.horizontal, 80).padding(.top, 36).padding(.bottom, 70)
        }
        .background { DetailBackdrop(url: video.heroURL) }
        .background(Color.black).foregroundStyle(.white)
        // The decision button, not Back, is where the cursor lands.
        .defaultFocus($field, video.videoURL != nil ? .play : .back)
        .onExitCommand { dismiss() }
        .task {
            // Default focus can be evaluated before the buttons exist; settle it once the page is up.
            try? await Task.sleep(for: .milliseconds(80))
            if field == nil || field == .back, video.videoURL != nil { field = .play }
            await loadRelated()
        }
        .task(id: "\(supabase.watchProgressRevision):\(supabase.session?.userId ?? "guest")") { await loadProgress() }
        .fullScreenCover(item: $playback, onDismiss: {
            Task { await loadProgress() }
            if let next = pendingRelated { pendingRelated = nil; relatedSelection = next }
        }) { mode in
            switch mode {
            case .movie(let startOver):
                PlaybackView(url: video.videoURL, title: video.title, identity: PlaybackIdentity(id: video.id, type: "movie"), startFromBeginning: startOver,
                             related: related, openRelated: { pendingRelated = $0; playback = nil },
                             metadata: PlaybackMetadata(title: video.title, subtitle: facts.isEmpty ? nil : facts, description: video.description, artwork: video.heroURL))
            case .trailer:
                PlaybackView(url: trailerURL, title: "\(video.title) · Trailer")
            }
        }
        .fullScreenCover(item: $relatedSelection) { MovieDetailView(video: $0) }
    }

    private func loadProgress() async {
        guard supabase.session != nil else { progress = nil; return }
        progress = try? await supabase.fetchWatchPosition(identity: PlaybackIdentity(id: video.id, type: "movie"))
    }
    private func loadRelated() async {
        guard let pool = try? await supabase.fetchVideos() else { return }
        related = RelatedTitles.rank(video, in: pool.filter { !BrowsePresentation.isDemo($0.title) })
    }
}
