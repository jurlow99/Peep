import SwiftUI

struct SearchView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.catalogRevision) private var catalogRevision
    @State private var query = ""
    @State private var typeFilter = "All"
    @State private var allVideos: [Video] = []
    @State private var allShows: [Show] = []
    @State private var selectedVideo: Video?
    @State private var selectedShow: Show?
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var results: (videos: [Video], shows: [Show]) {
        let videos = allVideos.compactMap { video -> (Video, Int)? in
            CatalogSearch.score(query: query, title: video.title, category: video.category, tags: video.tags?.values ?? [], description: video.description).map { (video, $0) }
        }.sorted { $0.1 == $1.1 ? $0.0.title.localizedStandardCompare($1.0.title) == .orderedAscending : $0.1 > $1.1 }.map { $0.0 }
        let shows = allShows.compactMap { show -> (Show, Int)? in
            CatalogSearch.score(query: query, title: show.title, category: show.category, tags: show.tags?.values ?? [], description: show.description).map { (show, $0) }
        }.sorted { $0.1 == $1.1 ? $0.0.title.localizedStandardCompare($1.0.title) == .orderedAscending : $0.1 > $1.1 }.map { $0.0 }
        return (typeFilter == "Series" ? [] : videos, typeFilter == "Movies" ? [] : shows)
    }
    private var genres: [String] {
        let values = allVideos.flatMap { BrowsePresentation.categories($0.category) + ($0.tags?.values ?? []) }
            + allShows.flatMap { BrowsePresentation.categories($0.category) + ($0.tags?.values ?? []) }
        return Array(Set(values.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).capitalized }.filter { !$0.isEmpty })).sorted().prefix(8).map { $0 }
    }

    var body: some View {
        let matches = results
        return VStack(alignment: .leading, spacing: 32) {
            Text("Search")
                .font(.system(size: 48, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .padding(.horizontal, 80)
                .padding(.top, 60)

            // Search field
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(Color(white: 0.4))
                    .font(.system(size: 24))
                TextField("Titles, genres or tags", text: $query)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .font(.system(size: 28))
                    .foregroundColor(.white)
                    .sidebarBoundary()
                if !query.isEmpty {
                    Button { query = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(Color(white: 0.4))
                    }
                    .buttonStyle(BrowseCardStyle()).accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
            .background(Color(white: 0.12))
            .cornerRadius(12)
            .padding(.horizontal, 80)

            HStack(spacing: 18) {
                ForEach(["All", "Movies", "Series"], id: \.self) { type in
                    FilterChip(label: type, isSelected: typeFilter == type) { typeFilter = type }
                        .sidebarBoundary(type == "All")
                }
                Spacer()
                if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isLoading {
                    Text("\(matches.videos.count + matches.shows.count) results").font(.system(size: 23)).foregroundStyle(.secondary)
                }
            }.padding(.horizontal, 80)

            if isLoading {
                ProgressView("Loading catalog…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                StatusView(title: "Couldn't load search", message: errorMessage, retry: { Task { await load() } })
            } else if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                VStack(alignment: .leading, spacing: 24) {
                    Text("What are you in the mood for?").font(.system(size: 32, weight: .bold, design: .rounded))
                    Text("Find a title, or explore a genre from the catalog.").font(.system(size: 24)).foregroundStyle(Color(white: 0.65))
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 18) {
                            ForEach(genres, id: \.self) { genre in
                                FilterChip(label: genre, isSelected: false) { query = genre }.sidebarBoundary(genre == genres.first)
                            }
                        }.padding(8)
                    }
                    Spacer()
                }.padding(.horizontal, 80).padding(.top, 30)
            } else if matches.videos.isEmpty && matches.shows.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "questionmark.circle")
                        .font(.system(size: 64))
                        .foregroundColor(Color(white: 0.2))
                    Text("No results for \"\(query)\"")
                        .font(.system(size: 28))
                        .foregroundColor(Color(white: 0.75))
                    Text("Try a shorter title, a category, or a tag. You can also switch back to All.")
                        .font(.system(size: 23)).foregroundStyle(.secondary)
                    Button("Clear search") { query = ""; typeFilter = "All" }.buttonStyle(BrowseCardStyle())
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 40) {
                        if !matches.videos.isEmpty {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Movies · \(matches.videos.count)")
                                    .font(.system(size: 28, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 80)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    LazyHStack(alignment: .top, spacing: 24) {
                                        ForEach(matches.videos) { v in
                                            VideoCardView(video: v) { selectedVideo = v }.sidebarBoundary(v.id == matches.videos.first?.id)
                                        }
                                    }
                                    .padding(.horizontal, 80)
                                    .padding(.vertical, 28)
                                }
                            }
                        }
                        if !matches.shows.isEmpty {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Series · \(matches.shows.count)")
                                    .font(.system(size: 28, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 80)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    LazyHStack(alignment: .top, spacing: 24) {
                                        ForEach(matches.shows) { s in
                                            ShowCardView(show: s) { selectedShow = s }.sidebarBoundary(s.id == matches.shows.first?.id)
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
        .environment(\.onDemandTypography, true)
        .task(id: catalogRevision) { await load() }
        .fullScreenCover(item: $selectedVideo) { v in
            PlaybackView(url: v.videoURL, title: v.title, identity: PlaybackIdentity(id: v.id, type: "movie"))
        }
        .fullScreenCover(item: $selectedShow) { s in
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
