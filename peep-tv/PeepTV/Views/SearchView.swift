import SwiftUI

struct SearchView: View {
    @EnvironmentObject var supabase: SupabaseService
    @State private var query = ""
    @State private var allVideos: [Video] = []
    @State private var allShows: [Show] = []
    @State private var selectedVideo: Video?
    @State private var selectedShow: Show?
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var results: (videos: [Video], shows: [Show]) {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            return ([], [])
        }
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return (
            allVideos.filter { $0.title.lowercased().contains(q) || ($0.description?.lowercased().contains(q) == true) },
            allShows.filter { $0.title.lowercased().contains(q) || ($0.description?.lowercased().contains(q) == true) }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 32) {
            Text("Search")
                .font(.system(size: 52, weight: .bold, design: .serif))
                .foregroundColor(.white)
                .padding(.horizontal, 80)
                .padding(.top, 60)

            // Search field
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(Color(white: 0.4))
                    .font(.system(size: 24))
                TextField("Search titles...", text: $query)
                    .font(.system(size: 28))
                    .foregroundColor(.white)
                if !query.isEmpty {
                    Button { query = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(Color(white: 0.4))
                    }
                    .buttonStyle(.card)
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
            .background(Color(white: 0.12))
            .cornerRadius(12)
            .padding(.horizontal, 80)

            if isLoading {
                ProgressView("Loading catalog…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                StatusView(title: "Couldn't load search", message: errorMessage, retry: { Task { await load() } })
            } else if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                // Prompt
                VStack(spacing: 16) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 64))
                        .foregroundColor(Color(white: 0.2))
                    Text("Start typing to search")
                        .font(.system(size: 28))
                        .foregroundColor(Color(white: 0.35))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if results.videos.isEmpty && results.shows.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "questionmark.circle")
                        .font(.system(size: 64))
                        .foregroundColor(Color(white: 0.2))
                    Text("No results for \"\(query)\"")
                        .font(.system(size: 28))
                        .foregroundColor(Color(white: 0.35))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 40) {
                        if !results.videos.isEmpty {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Movies")
                                    .font(.system(size: 28, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 80)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 24) {
                                        ForEach(results.videos) { v in
                                            VideoCardView(video: v) { selectedVideo = v }
                                        }
                                    }
                                    .padding(.horizontal, 80)
                                    .padding(.vertical, 28)
                                }
                            }
                        }
                        if !results.shows.isEmpty {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Series")
                                    .font(.system(size: 28, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 80)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 24) {
                                        ForEach(results.shows) { s in
                                            ShowCardView(show: s) { selectedShow = s }
                                        }
                                    }
                                    .padding(.horizontal, 80)
                                    .padding(.vertical, 28)
                                }
                            }
                        }
                    }
                    .padding(.bottom, 80)
                }
            }
        }
        .background(Color.black)
        .task { await load() }
        .fullScreenCover(item: $selectedVideo) { v in
            PlaybackView(url: v.videoURL, title: v.title)
        }
        .sheet(item: $selectedShow) { s in
            SeriesDetailView(show: s)
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let v = supabase.fetchVideos()
            async let s = supabase.fetchShows()
            (allVideos, allShows) = try await (v, s)
        } catch { errorMessage = error.localizedDescription }
    }
}
