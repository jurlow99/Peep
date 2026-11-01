import SwiftUI

struct SearchView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.catalogRevision) private var catalogRevision
    @State private var query = ""
    @State private var typeFilter = "All"
    @State private var allVideos: [Video] = []
    @State private var allShows: [Show] = []
    @State private var allPodcasts: [Podcast] = []
    @State private var allChannels: [Channel] = []
    @State private var feeds: [PublicFeed] = []
    @State private var selectedVideo: Video?
    @State private var selectedShow: Show?
    @State private var selectedPodcast: Podcast?
    @State private var selectedChannel: Channel?
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var results: (videos: [Video], shows: [Show], podcasts: [Podcast], channels: [Channel]) {
        let videos = allVideos.compactMap { video -> (Video, Int)? in
            CatalogSearch.score(query: query, title: video.title, category: video.category, tags: video.tags?.values ?? [], description: video.description).map { (video, $0) }
        }.sorted { $0.1 == $1.1 ? $0.0.title.localizedStandardCompare($1.0.title) == .orderedAscending : $0.1 > $1.1 }.map { $0.0 }
        let shows = allShows.compactMap { show -> (Show, Int)? in
            CatalogSearch.score(query: query, title: show.title, category: show.category, tags: show.tags?.values ?? [], description: show.description).map { (show, $0) }
        }.sorted { $0.1 == $1.1 ? $0.0.title.localizedStandardCompare($1.0.title) == .orderedAscending : $0.1 > $1.1 }.map { $0.0 }
        let podcasts = allPodcasts.compactMap { podcast -> (Podcast, Int)? in
            CatalogSearch.score(query: query, title: podcast.title, category: podcast.host, tags: [], description: podcast.description).map { (podcast, $0) }
        }.sorted { $0.1 == $1.1 ? $0.0.title.localizedStandardCompare($1.0.title) == .orderedAscending : $0.1 > $1.1 }.map { $0.0 }
        let channels = allChannels.compactMap { channel -> (Channel, Int)? in
            CatalogSearch.score(query: query, title: channel.name, category: channel.category, tags: [], description: channel.description).map { (channel, $0) }
        }.sorted { $0.1 == $1.1 ? $0.0.name.localizedStandardCompare($1.0.name) == .orderedAscending : $0.1 > $1.1 }.map { $0.0 }
        let only = typeFilter
        return (only == "All" || only == "Movies" ? videos : [], only == "All" || only == "Series" ? shows : [],
                only == "All" || only == "Podcasts" ? podcasts : [], only == "All" || only == "Live TV" ? channels : [])
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
                    .foregroundColor(Color(white: 0.6))
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
                ForEach(["All", "Movies", "Series", "Podcasts", "Live TV"], id: \.self) { type in
                    FilterChip(label: type, isSelected: typeFilter == type) { typeFilter = type }
                        .sidebarBoundary(type == "All")
                }
                Spacer()
                if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isLoading {
                    Text("\(matches.videos.count + matches.shows.count + matches.podcasts.count + matches.channels.count) results").font(.system(size: 23)).foregroundStyle(.secondary)
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
            } else if matches.videos.isEmpty && matches.shows.isEmpty && matches.podcasts.isEmpty && matches.channels.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "questionmark.circle")
                        .font(.system(size: 64))
                        .foregroundColor(Color(white: 0.45))
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
                        if !matches.podcasts.isEmpty {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Podcasts · \(matches.podcasts.count)").font(.system(size: 28, weight: .bold)).foregroundColor(.white).padding(.horizontal, 80)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    LazyHStack(alignment: .top, spacing: 24) {
                                        ForEach(matches.podcasts) { podcast in
                                            Button { selectedPodcast = podcast } label: {
                                                VStack(alignment: .leading, spacing: 12) {
                                                    BoundedArtwork(url: podcast.artworkURL, symbol: "mic").frame(width: 240, height: 240).background(Color(white: 0.08)).clipShape(RoundedRectangle(cornerRadius: 12))
                                                    Text(podcast.title).font(.system(size: 23, weight: .semibold)).lineLimit(2).frame(height: 58, alignment: .topLeading)
                                                    Text(podcast.host ?? "Podcast").font(.system(size: 17)).foregroundStyle(.secondary).lineLimit(1)
                                                }.frame(width: 240, alignment: .leading).padding(12)
                                            }.buttonStyle(BrowseCardStyle()).sidebarBoundary(podcast.id == matches.podcasts.first?.id)
                                        }
                                    }.padding(.horizontal, 80).padding(.vertical, 28)
                                }
                            }
                        }
                        if !matches.channels.isEmpty {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Live TV · \(matches.channels.count)").font(.system(size: 28, weight: .bold)).foregroundColor(.white).padding(.horizontal, 80)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    LazyHStack(alignment: .top, spacing: 24) {
                                        ForEach(matches.channels) { channel in
                                            Button { selectedChannel = channel } label: {
                                                VStack(alignment: .leading, spacing: 12) {
                                                    BoundedArtwork(url: channel.thumbURL, symbol: "tv").frame(width: 300, height: 169).background(Color(white: 0.1))
                                                    Text(channel.displayName).font(.system(size: 22, weight: .semibold)).lineLimit(2).frame(height: 54, alignment: .topLeading).padding(.horizontal, 12).padding(.bottom, 10)
                                                }.frame(width: 300)
                                            }.buttonStyle(BrowseCardStyle()).saveToMyList(String(channel.id), type: "channel").sidebarBoundary(channel.id == matches.channels.first?.id)
                                                .disabled(channel.playbackURL(streamHost: supabase.configuration?.streamHost ?? "", feeds: feeds) == nil)
                                        }
                                    }.padding(.horizontal, 80).padding(.vertical, 28)
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
        .fullScreenCover(item: $selectedVideo) { MovieDetailView(video: $0) }
        .fullScreenCover(item: $selectedShow) { s in
            SeriesDetailView(show: s)
        }
        .sheet(item: $selectedPodcast) { PodcastDetailView(podcast: $0) }
        .fullScreenCover(item: $selectedChannel) { channel in
            PlaybackView(url: channel.playbackURL(streamHost: supabase.configuration?.streamHost ?? "", feeds: feeds), title: channel.displayName, liveChannelID: channel.id,
                         metadata: PlaybackMetadata(title: channel.displayName, subtitle: BrowsePresentation.category(channel.category), description: channel.description, artwork: channel.thumbURL, isLive: true))
        }
    }

    private func load() async {
        // Returning from the background reloads the catalog; keep the results on screen meanwhile.
        isLoading = allVideos.isEmpty && allShows.isEmpty
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let v = supabase.fetchVideos()
            async let s = supabase.fetchShows()
            async let p = supabase.fetchPodcasts()
            async let c = supabase.fetchChannels()
            async let f = supabase.fetchFeeds()
            (allVideos, allShows) = try await (v, s)
            allPodcasts = (try? await p) ?? []
            allChannels = ((try? await c) ?? []).filter { !BrowsePresentation.isDemo($0.name) }
            feeds = (try? await f) ?? []
        } catch { errorMessage = error.localizedDescription }
    }
}
