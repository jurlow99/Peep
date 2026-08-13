import SwiftUI

struct SeriesView: View {
    @EnvironmentObject var supabase: SupabaseService
    @State private var shows: [Show] = []
    @State private var selectedShow: Show?
    @State private var isLoading = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Series")
                .font(.system(size: 52, weight: .bold, design: .serif))
                .foregroundColor(.white)
                .padding(.horizontal, 80)
                .padding(.top, 60)
                .padding(.bottom, 32)

            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if shows.isEmpty {
                Text("No series yet.")
                    .font(.system(size: 28))
                    .foregroundColor(Color(white: 0.4))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVGrid(
                        columns: Array(repeating: GridItem(.fixed(320), spacing: 24), count: 5),
                        spacing: 40
                    ) {
                        ForEach(shows) { show in
                            ShowCardView(show: show) { selectedShow = show }
                        }
                    }
                    .padding(.horizontal, 80)
                    .padding(.bottom, 80)
                }
            }
        }
        .background(Color.black)
        .task { await load() }
        .sheet(item: $selectedShow) { show in
            SeriesDetailView(show: show)
        }
    }

    private func load() async {
        shows = (try? await supabase.fetchShows()) ?? []
        isLoading = false
    }
}

struct SeriesDetailView: View {
    @EnvironmentObject var supabase: SupabaseService
    let show: Show
    @State private var seasons: [Season] = []
    @State private var episodes: [Int: [Episode]] = [:]
    @State private var selectedSeason: Season?
    @State private var selectedEpisode: Episode?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Sidebar: show info + seasons
            VStack(alignment: .leading, spacing: 24) {
                AsyncImage(url: show.thumbURL) { img in
                    img.resizable().aspectRatio(16/9, contentMode: .fill)
                } placeholder: { Rectangle().fill(Color(white: 0.1)) }
                .frame(width: 400, height: 225)
                .clipped()
                .cornerRadius(12)

                Text(show.title)
                    .font(.system(size: 36, weight: .bold, design: .serif))
                    .foregroundColor(.white)

                if let desc = show.description {
                    Text(desc)
                        .font(.system(size: 20))
                        .foregroundColor(Color(white: 0.6))
                        .lineLimit(4)
                }

                if !seasons.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("SEASONS")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(Color(white: 0.4))

                        ForEach(seasons) { season in
                            Button {
                                selectedSeason = season
                                Task { await loadEpisodes(for: season) }
                            } label: {
                                Text(season.title ?? "Season \(season.season_number)")
                                    .font(.system(size: 22, weight: selectedSeason?.id == season.id ? .bold : .regular))
                                    .foregroundColor(selectedSeason?.id == season.id ? Color(hex: "#facc15") : .white)
                                    .padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Spacer()
            }
            .frame(width: 460)
            .padding(48)
            .background(Color(white: 0.07))

            // Episodes
            ScrollView {
                if let season = selectedSeason, let eps = episodes[season.id] {
                    LazyVStack(spacing: 16) {
                        ForEach(eps) { ep in
                            EpisodeRowView(episode: ep) {
                                selectedEpisode = ep
                            }
                        }
                    }
                    .padding(40)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(.top, 100)
                }
            }
        }
        .background(Color(white: 0.05))
        .task { await loadSeasons() }
        .fullScreenCover(item: $selectedEpisode) { ep in
            if let url = ep.videoURL {
                PlayerView(url: url, title: ep.displayTitle)
            }
        }
    }

    private func loadSeasons() async {
        seasons = (try? await supabase.fetchSeasons(showId: show.id)) ?? []
        if let first = seasons.first {
            selectedSeason = first
            await loadEpisodes(for: first)
        }
    }

    private func loadEpisodes(for season: Season) async {
        guard episodes[season.id] == nil else { return }
        episodes[season.id] = (try? await supabase.fetchEpisodes(seasonId: season.id)) ?? []
    }
}

struct EpisodeRowView: View {
    let episode: Episode
    let onPlay: () -> Void

    var body: some View {
        Button(action: onPlay) {
            HStack(spacing: 20) {
                AsyncImage(url: episode.thumbURL) { img in
                    img.resizable().aspectRatio(16/9, contentMode: .fill)
                } placeholder: {
                    Rectangle().fill(Color(white: 0.15))
                }
                .frame(width: 220, height: 124)
                .clipped()
                .cornerRadius(8)

                VStack(alignment: .leading, spacing: 8) {
                    Text(episode.displayTitle)
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundColor(.white)

                    if let desc = episode.description {
                        Text(desc)
                            .font(.system(size: 18))
                            .foregroundColor(Color(white: 0.55))
                            .lineLimit(2)
                    }

                    if let dur = episode.duration {
                        Text(dur)
                            .font(.system(size: 16))
                            .foregroundColor(Color(white: 0.35))
                    }
                }

                Spacer()

                Image(systemName: "play.circle.fill")
                    .font(.system(size: 44))
                    .foregroundColor(Color(hex: "#facc15"))
            }
            .padding(20)
            .background(Color(white: 0.1))
            .cornerRadius(12)
        }
        .buttonStyle(.card)
    }
}
