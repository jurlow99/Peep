import SwiftUI

struct SeriesView: View {
    @EnvironmentObject var supabase: SupabaseService
    @State private var shows: [Show] = []
    @State private var selectedShow: Show?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 32) {
            Text("Series").font(.system(size: 52, weight: .bold))
                .padding(.horizontal, 80).padding(.top, 60)
            if isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                StatusView(title: "Couldn't load series", message: errorMessage, retry: { Task { await load() } })
            } else if shows.isEmpty {
                StatusView(title: "No series yet", message: "Check back soon.", symbol: "tv")
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 36)], spacing: 40) {
                        ForEach(shows) { show in
                            ShowCardView(show: show) { selectedShow = show }
                        }
                    }
                    .padding(.horizontal, 80).padding(.vertical, 40)
                }
            }
        }
        .background(Color.black)
        .task { await load() }
        .sheet(item: $selectedShow) { SeriesDetailView(show: $0) }
    }

    private func load() async {
        isLoading = true
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
    @State private var selectedSeason = 1
    @State private var selectedEpisode: Episode?
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var seasons: [Int] { Array(Set(episodes.map { $0.season ?? 1 })).sorted() }
    private var visibleEpisodes: [Episode] { episodes.filter { ($0.season ?? 1) == selectedSeason } }

    var body: some View {
        HStack(alignment: .top, spacing: 40) {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    Button("Back") { dismiss() }
                    AsyncImage(url: show.thumbURL) { image in
                        image.resizable().scaledToFill()
                    } placeholder: { Rectangle().fill(Color(white: 0.12)) }
                    .frame(width: 400, height: 225).clipped().cornerRadius(12)
                    Text(show.title).font(.title2.bold())
                    Text(show.description ?? "").font(.body).foregroundStyle(.secondary).lineLimit(5)
                    ForEach(seasons, id: \.self) { season in
                        Button {
                            selectedSeason = season
                        } label: {
                            Label("Season \(season)", systemImage: selectedSeason == season ? "checkmark.circle.fill" : "circle")
                        }
                        .buttonStyle(.card)
                    }
                }
                .padding(32)
            }
            .frame(width: 470)
            if isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                StatusView(title: "Couldn't load episodes", message: errorMessage, retry: { Task { await load() } })
            } else if episodes.isEmpty {
                StatusView(title: "Coming soon", message: "Episodes haven't been published yet.", symbol: "tv")
            } else {
                ScrollView {
                    LazyVStack(spacing: 28) {
                        ForEach(visibleEpisodes) { episode in
                            EpisodeRowView(episode: episode) { selectedEpisode = episode }
                        }
                    }.padding(40)
                }
            }
        }
        .padding(32).background(Color.black)
        .task { await load() }
        .fullScreenCover(item: $selectedEpisode) {
            PlaybackView(url: $0.videoURL, title: $0.displayTitle)
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            episodes = try await supabase.fetchEpisodes(showId: show.id)
            selectedSeason = seasons.first ?? 1
        } catch { errorMessage = error.localizedDescription }
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
