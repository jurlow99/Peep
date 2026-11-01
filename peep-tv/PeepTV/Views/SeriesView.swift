import SwiftUI

struct SeriesView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.catalogRevision) private var catalogRevision
    @State private var shows: [Show] = []
    @State private var selectedShow: Show?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BrowseHeader(title: "Series", subtitle: "")
            if isLoading {
                ProgressView("Loading series…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                StatusView(title: "Couldn't load series", message: errorMessage, retry: { Task { await load() } })
            } else if shows.isEmpty {
                StatusView(title: "No series yet", message: "Check back soon.", symbol: "tv")
            } else {
                GeometryReader { geometry in
                    let count = PosterGrid.columnCount(availableWidth: geometry.size.width - 140)
                    ScrollView {
                        LazyVGrid(columns: Array(repeating: GridItem(.fixed(PosterGrid.cardWidth), spacing: PosterGrid.spacing, alignment: .top), count: count), alignment: .leading, spacing: 34) {
                            ForEach(Array(shows.enumerated()), id: \.element.id) { index, show in
                                ShowCardView(show: show) { selectedShow = show }
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
        .fullScreenCover(item: $selectedShow) { SeriesDetailView(show: $0) }
    }

    private func load() async {
        isLoading = shows.isEmpty
        errorMessage = nil
        defer { isLoading = false }
        do { shows = try await supabase.fetchShows() }
        catch { errorMessage = error.localizedDescription }
    }
}

struct SeriesDetailView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.dismiss) private var dismiss
    let show: Show
    @State private var episodes: [Episode] = []
    @State private var progress: [String: WatchProgress] = [:]
    @State private var selectedSeason = 1
    @State private var seasonTouched = false
    @State private var selectedEpisode: Episode?
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var seasons: [Int] { Array(Set(episodes.map { $0.season ?? 1 })).sorted() }
    private var visibleEpisodes: [Episode] { episodes.filter { ($0.season ?? 1) == selectedSeason } }
    private var nextUp: Episode? { SeriesPlayback.nextUp(in: episodes, progress: progress) }
    private enum Field: Hashable { case back, play }
    @FocusState private var field: Field?
    private var facts: String {
        var parts: [String] = []
        if let category = BrowsePresentation.categories(show.category).first { parts.append(category) }
        if !episodes.isEmpty {
            parts.append(seasons.count > 1 ? "\(seasons.count) seasons" : "\(episodes.count) episode\(episodes.count == 1 ? "" : "s")")
        }
        return parts.joined(separator: "  ·  ")
    }
    private var tagChips: [String] { BrowsePresentation.tagChips(show.tags, category: show.category) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                Button { dismiss() } label: {
                    Label("Back", systemImage: "chevron.left")
                        .font(.system(size: 21, weight: .semibold)).padding(.horizontal, 20).padding(.vertical, 14)
                }.buttonStyle(BrowseCardStyle()).focused($field, equals: .back)

                HStack(alignment: .center, spacing: 44) {
                    PosterArtwork(url: show.thumbURL, width: 300, symbol: "tv")
                    VStack(alignment: .leading, spacing: 16) {
                        Text("SERIES").font(.system(size: 16, weight: .bold)).tracking(3).foregroundStyle(.secondary)
                        Text(show.title.trimmingCharacters(in: .whitespacesAndNewlines))
                            .font(.system(size: 52, weight: .bold, design: .rounded)).lineLimit(2)
                        if !facts.isEmpty {
                            Text(facts).font(.system(size: 21, weight: .medium)).foregroundStyle(Color(white: 0.72))
                        }
                        if let description = show.description, !description.isEmpty {
                            Text(description).font(.system(size: 23)).foregroundStyle(Color(white: 0.72))
                                .lineLimit(4).frame(maxWidth: 1040, alignment: .leading)
                        }
                        if !tagChips.isEmpty { DetailTagRow(tags: tagChips) }
                        HStack(spacing: 20) {
                            if let episode = nextUp {
                                Button { selectedEpisode = episode } label: {
                                    Label("\(progress[String(episode.id)]?.canResume == true ? "Resume" : "Play") S\(episode.season ?? 1) E\(episode.episode_number ?? 1)", systemImage: "play.fill")
                                        .font(.system(size: 22, weight: .semibold)).padding(18)
                                }.buttonStyle(BrowseCardStyle()).focused($field, equals: .play)
                            }
                            MyListAction(id: String(show.id), type: "show")
                        }.padding(.top, 8)
                    }
                    Spacer(minLength: 0)
                }.focusSection()

                Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1).padding(.top, 4)
                HStack(alignment: .center, spacing: 24) {
                    Text("Episodes").font(.system(size: 32, weight: .bold, design: .rounded))
                    if !episodes.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(seasons, id: \.self) { season in
                                    FilterChip(label: "Season \(season)", isSelected: selectedSeason == season) { seasonTouched = true; selectedSeason = season }
                                }
                            }.padding(6)
                        }
                        Text("\(visibleEpisodes.count) episode\(visibleEpisodes.count == 1 ? "" : "s")")
                            .font(.system(size: 18)).foregroundStyle(.secondary).fixedSize()
                    }
                }.focusSection()

                if isLoading {
                    ProgressView("Loading episodes…").frame(maxWidth: .infinity, minHeight: 220)
                } else if let errorMessage {
                    StatusView(title: "Couldn't load episodes", message: errorMessage, retry: { Task { await load() } })
                } else if episodes.isEmpty {
                    StatusView(title: "Coming soon", message: "Episodes haven't been published yet.", symbol: "tv")
                } else {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 32), count: 3), alignment: .leading, spacing: 36) {
                        ForEach(visibleEpisodes) { episode in
                            EpisodeRowView(episode: episode, progress: progress[String(episode.id)], fallbackArtwork: MediaURL.parse(show.thumbnail) ?? show.thumbURL) { selectedEpisode = episode }
                        }
                    }.focusSection()
                }
            }.padding(.horizontal, 80).padding(.top, 36).padding(.bottom, 70)
        }
        .background { DetailBackdrop(url: MediaURL.parse(show.thumbnail) ?? show.thumbURL) }
        .background(Color.black).foregroundStyle(.white)
        .defaultFocus($field, nextUp != nil ? .play : .back)
        .onExitCommand { dismiss() }
        .task {
            await load()
            // The Play button only exists once episodes are known; move the cursor to it then.
            try? await Task.sleep(for: .milliseconds(80))
            if field == nil || field == .back, nextUp != nil { field = .play }
        }
        .task(id: "\(supabase.watchProgressRevision):\(supabase.session?.userId ?? "guest")") { await loadProgress() }
        .fullScreenCover(item: $selectedEpisode, onDismiss: { Task { await loadProgress() } }) {
            PlaybackView(url: $0.videoURL, title: $0.displayTitle, identity: PlaybackIdentity(id: String($0.id), type: "episode"),
                         metadata: PlaybackMetadata(title: $0.displayTitle, subtitle: "\(show.title) · Season \($0.season ?? 1), Episode \($0.episode_number ?? 1)",
                                                    description: $0.description, artwork: $0.thumbURL ?? show.thumbURL))
        }
    }

    private func load() async {
        isLoading = episodes.isEmpty
        errorMessage = nil
        defer { isLoading = false }
        do {
            episodes = try await supabase.fetchEpisodes(showId: show.id)
            await loadProgress()
            followNextUp()
        } catch { errorMessage = error.localizedDescription }
    }
    /// Open on the season the viewer is up to, until they pick a season themselves.
    private func followNextUp() {
        guard !seasonTouched else { return }
        if let season = nextUp?.season { selectedSeason = season }
        else if !seasons.contains(selectedSeason) { selectedSeason = seasons.first ?? 1 }
    }
    private func loadProgress() async {
        if supabase.session == nil { progress = [:]; return }
        guard let rows = try? await supabase.fetchEpisodeProgress(ids: episodes.map(\.id)) else { return }
        progress = Dictionary(rows.map { ($0.content_id, $0) }, uniquingKeysWith: { _, latest in latest })
        followNextUp()
    }

}

struct EpisodeRowView: View {
    let episode: Episode
    var progress: WatchProgress? = nil
    var fallbackArtwork: URL?
    let onPlay: () -> Void
    @FocusState private var focused: Bool

    var body: some View {
        Button(action: { if episode.videoURL != nil { onPlay() } }) {
            VStack(alignment: .leading, spacing: 12) {
                EpisodeArtwork(url: episode.thumbURL, fallback: fallbackArtwork)
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(focused ? ContentAppearance.accent : .clear, lineWidth: ContentAppearance.focusWidth))
                    .overlay(alignment: .bottomLeading) {
                        if let progress, (progress.progress_seconds ?? 0) > 0 {
                            GeometryReader { geometry in
                                Rectangle().fill(Color.white.opacity(0.22))
                                    .overlay(alignment: .leading) {
                                        Rectangle().fill(Color.white.opacity(0.85)).frame(width: geometry.size.width * progress.fraction)
                                    }
                            }.frame(height: 4).padding(.horizontal, 14).padding(.bottom, 9)
                        }
                    }
                    .overlay(alignment: .topLeading) {
                        if progress?.completed == true {
                            Label("Watched", systemImage: "checkmark.circle.fill")
                                .font(.system(size: 16, weight: .semibold)).padding(.horizontal, 12).padding(.vertical, 8)
                                .background(.black.opacity(0.8), in: Capsule()).padding(12)
                        } else if progress?.canResume == true {
                            Text("Resume").font(.system(size: 16, weight: .semibold)).padding(.horizontal, 12).padding(.vertical, 8)
                                .background(.black.opacity(0.8), in: Capsule()).padding(12)
                        }
                    }
                    .overlay(alignment: .bottomTrailing) {
                        if episode.videoURL == nil {
                            Text("Coming soon").font(.system(size: 16, weight: .semibold)).padding(.horizontal, 12).padding(.vertical, 8)
                                .background(.black.opacity(0.8), in: Capsule()).padding(14)
                        } else {
                            Image(systemName: "play.fill").font(.system(size: 19, weight: .bold))
                                .padding(13).background(.black.opacity(0.75), in: Circle()).padding(14)
                        }
                    }
                HStack {
                    Text("EPISODE \(episode.episode_number ?? 1)").tracking(1.5)
                    Spacer()
                    if let duration = episode.duration, !duration.isEmpty { Text(duration) }
                }.font(.system(size: 16, weight: .semibold)).foregroundStyle(Color(white: 0.6))
                Text(episode.displayTitle).font(.system(size: 25, weight: .semibold))
                    .lineLimit(2).frame(height: 64, alignment: .topLeading)
                if let description = episode.description, !description.isEmpty {
                    Text(description).font(.system(size: 19)).foregroundStyle(Color(white: 0.65))
                        .lineLimit(2).frame(height: 50, alignment: .topLeading)
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.buttonStyle(EpisodePosterStyle()).focused($focused)
            .opacity(episode.videoURL == nil ? 0.6 : 1)
            .accessibilityLabel(episode.videoURL == nil ? "\(episode.displayTitle), coming soon" : episode.displayTitle)
    }
}

private struct EpisodePosterStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.foregroundStyle(.white).scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct EpisodeArtwork: View {
    let url: URL?
    let fallback: URL?
    @State private var artwork: UIImage?
    private var sources: [URL] { [url, fallback].compactMap { $0 } }
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color(white: 0.08)
                if let artwork {
                    if artwork.size.width > artwork.size.height {
                        Image(uiImage: artwork).resizable().scaledToFill()
                            .frame(width: geometry.size.width, height: geometry.size.height).clipped()
                    } else {
                        Image(uiImage: artwork).resizable().scaledToFit()
                            .frame(width: geometry.size.width, height: geometry.size.height)
                    }
                } else {
                    Image(systemName: "tv").font(.system(size: 38, weight: .light)).foregroundStyle(Color(white: 0.4))
                }
            }
        }.accessibilityHidden(true)
        .task(id: sources) {
            artwork = nil
            for source in sources {
                do {
                    let (data, response) = try await URLSession.shared.data(from: source)
                    guard !Task.isCancelled else { return }
                    guard (response as? HTTPURLResponse)?.statusCode == 200,
                          let image = UIImage(data: data), image.hasVisibleEpisodeArtwork else { continue }
                    artwork = image
                    return
                } catch { if Task.isCancelled { return } }
            }
        }
    }
}

private extension UIImage {
    // Reject effectively blank captures, rather than treating a black intro frame as artwork.
    var hasVisibleEpisodeArtwork: Bool {
        guard let cgImage else { return false }
        var pixels = [UInt8](repeating: 0, count: 16 * 16 * 4)
        return pixels.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(data: buffer.baseAddress, width: 16, height: 16, bitsPerComponent: 8,
                bytesPerRow: 64, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return true }
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: 16, height: 16))
            for index in stride(from: 0, to: buffer.count, by: 4) {
                if max(buffer[index], buffer[index + 1], buffer[index + 2]) > 16 { return true }
            }
            return false
        }
    }
}
