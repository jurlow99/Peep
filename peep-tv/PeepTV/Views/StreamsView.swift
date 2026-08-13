import SwiftUI

struct StreamsView: View {
    @EnvironmentObject var supabase: SupabaseService
    @State private var streams: [LiveStream] = []
    @State private var isLoading = true
    @State private var selectedStream: LiveStream?

    private var liveStreams: [LiveStream] { streams.filter { $0.is_live == true } }
    private var offlineStreams: [LiveStream] { streams.filter { $0.is_live != true } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 48) {
                Text("Streams")
                    .font(.system(size: 52, weight: .bold, design: .serif))
                    .foregroundColor(.white)
                    .padding(.horizontal, 80)
                    .padding(.top, 60)

                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 100)
                } else if streams.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "antenna.radiowaves.left.and.right.slash")
                            .font(.system(size: 64))
                            .foregroundColor(Color(white: 0.3))
                        Text("No streams right now")
                            .font(.system(size: 28))
                            .foregroundColor(Color(white: 0.4))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 80)
                } else {
                    // Live
                    if !liveStreams.isEmpty {
                        VStack(alignment: .leading, spacing: 16) {
                            HStack(spacing: 10) {
                                Circle().fill(Color.red).frame(width: 12, height: 12)
                                Text("LIVE NOW")
                                    .font(.system(size: 28, weight: .bold))
                                    .foregroundColor(.white)
                            }
                            .padding(.horizontal, 80)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 24) {
                                    ForEach(liveStreams) { stream in
                                        StreamCardView(stream: stream)
                                    }
                                }
                                .padding(.horizontal, 80)
                            }
                        }
                    }

                    // Offline / upcoming
                    if !offlineStreams.isEmpty {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("CHANNELS")
                                .font(.system(size: 28, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 80)

                            LazyVGrid(
                                columns: Array(repeating: GridItem(.fixed(320), spacing: 24), count: 5),
                                spacing: 40
                            ) {
                                ForEach(offlineStreams) { stream in
                                    StreamCardView(stream: stream)
                                }
                            }
                            .padding(.horizontal, 80)
                        }
                    }
                }
            }
            .padding(.bottom, 80)
        }
        .background(Color.black)
        .task { await load() }
    }

    private func load() async {
        streams = (try? await supabase.fetchLiveStreams()) ?? []
        isLoading = false
    }
}
