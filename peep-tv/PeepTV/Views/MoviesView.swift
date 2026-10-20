import SwiftUI

struct MoviesView: View {
    @EnvironmentObject var supabase: SupabaseService
    @State private var videos: [Video] = []
    @State private var selectedCategory: String? = nil
    @State private var selectedVideo: Video?
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var categories: [String] { Array(Set(videos.compactMap(\.category))).sorted() }
    private var filtered: [Video] {
        guard let cat = selectedCategory else { return videos }
        return videos.filter { $0.category == cat }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Movies")
                    .font(.system(size: 52, weight: .bold, design: .serif))
                    .foregroundColor(.white)

                Spacer()

                // Category filter
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        FilterChip(label: "All", isSelected: selectedCategory == nil) {
                            selectedCategory = nil
                        }
                        ForEach(categories, id: \.self) { cat in
                            FilterChip(label: cat, isSelected: selectedCategory == cat) {
                                selectedCategory = selectedCategory == cat ? nil : cat
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 80)
            .padding(.top, 60)
            .padding(.bottom, 32)

            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                StatusView(title: "Couldn't load movies", message: errorMessage, retry: { Task { await load() } })
            } else if filtered.isEmpty {
                StatusView(title: "No movies yet", message: "Try another category or come back soon.", symbol: "film")
            } else {
                ScrollView {
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 340), spacing: 36)],
                        spacing: 40
                    ) {
                        ForEach(filtered) { video in
                            VideoCardView(video: video) { selectedVideo = video }
                        }
                    }
                    .padding(.horizontal, 80)
                    .padding(.vertical, 40)
                }
            }
        }
        .background(Color.black)
        .task { await load() }
        .fullScreenCover(item: $selectedVideo) { v in
            PlaybackView(url: v.videoURL, title: v.title)
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do { videos = try await supabase.fetchVideos() }
        catch { errorMessage = error.localizedDescription }
    }
}

struct FilterChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 20, weight: isSelected ? .bold : .regular))
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(isSelected ? Color(hex: "#facc15") : Color(white: 0.15))
                .foregroundColor(isSelected ? .black : .white)
                .cornerRadius(20)
        }
        .buttonStyle(.card)
    }
}
