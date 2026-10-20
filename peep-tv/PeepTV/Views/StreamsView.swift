import SwiftUI

private struct ChannelPlayback: Identifiable {
    let id: Int
    let title: String
    let url: URL?
}

struct StreamsView: View {
    @EnvironmentObject var supabase: SupabaseService
    @State private var channels: [Channel] = []
    @State private var guide: [GuideEntry] = []
    @State private var feeds: [PublicFeed] = []
    @State private var selected: ChannelPlayback?
    @State private var category: String?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var guideUnavailable = false

    private var categories: [String] { Array(Set(channels.compactMap(\.category))).sorted() }
    private var visible: [Channel] { channels.filter { category == nil || $0.category == category } }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack {
                Text("Live TV").font(.system(size: 52, weight: .bold))
                Spacer()
                Button("Refresh") { Task { await load() } }.disabled(isLoading)
            }.padding(.horizontal, 80).padding(.top, 60)
            if isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                StatusView(title: "Couldn't load live TV", message: errorMessage, retry: { Task { await load() } })
            } else if channels.isEmpty {
                StatusView(title: "No channels yet", message: "Live channels will appear here when available.", symbol: "antenna.radiowaves.left.and.right")
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 24) {
                        FilterChip(label: "All", isSelected: category == nil) { category = nil }
                        ForEach(categories, id: \.self) { item in
                            FilterChip(label: item.capitalized, isSelected: category == item) { category = item }
                        }
                    }.padding(.horizontal, 80).padding(.vertical, 20)
                }
                if guideUnavailable {
                    Text("Program guide unavailable. You can still watch channels.")
                        .font(.caption).foregroundStyle(.secondary).padding(.horizontal, 80)
                }
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 36)], spacing: 40) {
                            ForEach(visible) { channel in
                                channelCard(channel, now: context.date)
                            }
                        }.padding(.horizontal, 80).padding(.vertical, 32)
                    }
                }
            }
        }
        .background(Color.black)
        .task {
            await load()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(60)) }
                catch { return }
                await refreshGuide()
            }
        }
        .fullScreenCover(item: $selected) {
            PlaybackView(url: $0.url, title: $0.title)
        }
    }

    private func channelCard(_ channel: Channel, now: Date) -> some View {
        let entries = guide.filter { $0.channel_id == channel.id }
        let current = entries.first { $0.isOnAir(at: now) }
        let next = entries.first { (GuideEntry.date($0.start_time) ?? .distantPast) > now }
        return Button {
            selected = ChannelPlayback(id: channel.id, title: channel.name,
                                       url: channel.playbackURL(streamHost: supabase.configuration?.streamHost ?? "", feeds: feeds))
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                AsyncImage(url: channel.thumbURL) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    Image(systemName: "tv").font(.system(size: 60)).foregroundStyle(.secondary)
                }
                .frame(width: 340, height: 191).background(Color(white: 0.12)).cornerRadius(12)
                Text(channel.name).font(.headline).lineLimit(1)
                Text("Now · \(current?.title ?? "Live programming")").font(.system(size: 20)).lineLimit(1)
                Text("Next · \(next?.title ?? "Guide unavailable")")
                    .font(.system(size: 18)).foregroundStyle(.secondary).lineLimit(1)
            }.frame(width: 340, alignment: .leading)
        }.buttonStyle(.card)
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            channels = try await supabase.fetchChannels()
            // This optional view isn't installed in every dev database.
            feeds = (try? await supabase.fetchFeeds()) ?? []
            await refreshGuide()
        } catch { errorMessage = error.localizedDescription }
    }

    private func refreshGuide() async {
        do {
            guide = try await supabase.fetchGuide()
            guideUnavailable = false
        } catch { guideUnavailable = true }
    }
}
