import SwiftUI

struct PodcastsView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.catalogRevision) private var catalogRevision
    @State private var podcasts: [Podcast] = []
    @State private var selected: Podcast?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            BrowseHeader(title: "Podcasts", subtitle: "Find a show. Settle in and listen.")
            if loading {
                ProgressView("Loading podcasts…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                StatusView(title: "Couldn't load podcasts", message: error, retry: { Task { await load() } })
            } else if podcasts.isEmpty {
                StatusView(title: "No podcasts yet", message: "New shows will appear here when published.", symbol: "mic")
            } else {
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 32), count: 3), spacing: 32) {
                        ForEach(Array(podcasts.enumerated()), id: \.element.id) { index, podcast in
                            Button { selected = podcast } label: {
                                VStack(alignment: .leading, spacing: 12) {
                                    BoundedArtwork(url: podcast.artworkURL, symbol: "mic")
                                        .frame(width: 280, height: 280).background(Color(white: 0.08))
                                        .clipShape(RoundedRectangle(cornerRadius: 12))
                                    Text(podcast.title).font(.system(size: 25, weight: .semibold)).lineLimit(2)
                                        .frame(height: 62, alignment: .topLeading)
                                    Text(podcast.host ?? "Podcast").font(.system(size: 18)).foregroundStyle(.secondary).lineLimit(1)
                                }.frame(width: 280, alignment: .leading).padding(12)
                            }.buttonStyle(BrowseCardStyle()).contentEntryTarget(index == 0).sidebarBoundary(index % 3 == 0)
                        }
                    }.padding(.horizontal, 70).padding(.vertical, 24).focusSection()
                }
            }
        }
        .background(.black)
        .task(id: catalogRevision) { await load() }
        .sheet(item: $selected) { PodcastDetailView(podcast: $0) }
    }

    private func load() async {
        loading = true; error = nil
        defer { loading = false }
        do { podcasts = try await supabase.fetchPodcasts() }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}

struct PodcastDetailView: View {
    let podcast: Podcast
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.dismiss) private var dismiss
    @Environment(\.catalogRevision) private var catalogRevision
    @State private var episodes: [PodcastEpisode] = []
    @State private var playing: PodcastEpisode?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        HStack(alignment: .top, spacing: 36) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Button { dismiss() } label: { Label("Back", systemImage: "chevron.left").font(.system(size: 21, weight: .semibold)).padding(.horizontal, 20).padding(.vertical, 14) }.buttonStyle(BrowseCardStyle())
                    BoundedArtwork(url: podcast.artworkURL, symbol: "mic").frame(width: 340, height: 340)
                    Text(podcast.title).font(.system(size: 36, weight: .bold))
                    if let host = podcast.host { Text(host).foregroundStyle(.secondary) }
                    if let description = podcast.description { Text(description).font(.system(size: 22)).foregroundStyle(.secondary) }
                }.frame(width: 360, alignment: .leading).padding(30)
            }.frame(width: 420).focusSection()
            if loading {
                ProgressView("Loading episodes…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                StatusView(title: "Couldn't load episodes", message: error, retry: { Task { await load() } })
            } else if episodes.isEmpty {
                StatusView(title: "Coming soon", message: "Episodes haven't been published yet.", symbol: "mic")
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 22) {
                        Text("Episodes").font(.system(size: 34, weight: .semibold))
                        ForEach(episodes) { episode in
                            Button { playing = episode } label: {
                                HStack(spacing: 24) {
                                    Image(systemName: episode.audioURL == nil ? "exclamationmark.circle" : "play.circle")
                                        .font(.system(size: 36))
                                    VStack(alignment: .leading, spacing: 10) {
                                        Text(episode.displayTitle).font(.system(size: 26, weight: .semibold)).lineLimit(2)
                                        if let description = episode.description {
                                            Text(description).font(.system(size: 20)).foregroundStyle(.secondary).lineLimit(2)
                                        }
                                        Text(episode.audioURL == nil ? "Audio unavailable" : episode.duration ?? "Listen now")
                                            .font(.system(size: 18)).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
                            }.buttonStyle(BrowseCardStyle())
                        }
                    }.padding(32)
                }.focusSection()
            }
        }.padding(32).background(.black)
        .task(id: catalogRevision) { await load() }
        .fullScreenCover(item: $playing) { episode in
            PodcastPlaybackView(episode: episode, podcast: podcast)
        }
    }

    private func load() async {
        loading = true; error = nil
        defer { loading = false }
        do { episodes = try await supabase.fetchPodcastEpisodes(podcastID: podcast.id) }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}

private struct PodcastUnavailableView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack {
            StatusView(title: "Audio unavailable", message: "This episode doesn't have a playable audio URL yet.", symbol: "speaker.slash")
            Button("Back to episodes") { dismiss() }.padding(.bottom, 80)
        }.background(.black).onExitCommand { dismiss() }
    }
}

/// Goes through PlaybackView so the position is remembered and artwork shows while listening.
private struct PodcastPlaybackView: View {
    let episode: PodcastEpisode
    let podcast: Podcast
    var body: some View {
        if episode.audioURL != nil {
            PlaybackView(url: episode.audioURL, title: episode.displayTitle,
                         identity: PlaybackIdentity(id: String(episode.id), type: "podcast_episode"),
                         metadata: PlaybackMetadata(title: episode.displayTitle, subtitle: podcast.title, description: episode.description,
                                                    artwork: episode.thumbURL ?? podcast.artworkURL, audioOnly: true))
        } else {
            PodcastUnavailableView()
        }
    }
}
