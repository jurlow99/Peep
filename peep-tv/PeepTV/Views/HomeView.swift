import SwiftUI

struct HomeView: View {
    @EnvironmentObject var supabase: SupabaseService
    @State private var videos: [Video] = []
    @State private var shows: [Show] = []
    @State private var streams: [LiveStream] = []
    @State private var playingVideo: Video?
    @State private var playingShow: Show?
    @State private var isLoading = true

    private var hero: Video? { videos.first(where: { $0.is_featured == true }) ?? videos.first }
    private var live: [LiveStream] { streams.filter { $0.is_live == true } }

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
            } else {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 56) {

                        // Hero
                        if let h = hero {
                            HeroView(video: h) { playingVideo = h }
                        }

                        // Live Now
                        if !live.isEmpty {
                            ShelfView(title: "🔴  Live Now") {
                                ForEach(live) { s in StreamCardView(stream: s) }
                            }
                        }

                        // Just Added
                        if !videos.isEmpty {
                            ShelfView(title: "Just Added") {
                                ForEach(videos.prefix(14)) { v in
                                    VideoCardView(video: v) { playingVideo = v }
                                }
                            }
                        }

                        // Series
                        if !shows.isEmpty {
                            ShelfView(title: "Series") {
                                ForEach(shows.prefix(12)) { s in
                                    ShowCardView(show: s) { playingShow = s }
                                }
                            }
                        }

                        // Category rows
                        ForEach(categoryRows, id: \.0) { cat, catVideos in
                            ShelfView(title: cat) {
                                ForEach(catVideos) { v in
                                    VideoCardView(video: v) { playingVideo = v }
                                }
                            }
                        }
                    }
                    .padding(.bottom, 100)
                }
                .ignoresSafeArea(edges: .top)
            }
        }
        .task { await load() }
        .fullScreenCover(item: $playingVideo) { v in
            if let url = v.videoURL { PlayerView(url: url, title: v.title) }
        }
        .sheet(item: $playingShow) { s in
            SeriesDetailView(show: s)
        }
    }

    private var categoryRows: [(String, [Video])] {
        let cats = Array(Set(videos.compactMap(\.category))).sorted()
        return cats.compactMap { cat in
            let items = videos.filter { $0.category == cat }
            return items.count > 2 ? (cat, Array(items.prefix(10))) : nil
        }
    }

    private func load() async {
        async let v = try? supabase.fetchVideos()
        async let s = try? supabase.fetchShows()
        async let l = try? supabase.fetchLiveStreams()
        videos = await v ?? []
        shows = await s ?? []
        streams = await l ?? []
        isLoading = false
    }
}

// MARK: - Shelf

struct ShelfView<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text(title)
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(.white)
                .padding(.leading, 88)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 28) { content }
                    .padding(.horizontal, 88)
                    .padding(.vertical, 8)
            }
        }
    }
}
