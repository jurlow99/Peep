import SwiftUI

private let CARD_W: CGFloat = 340
private let CARD_H: CGFloat = 191 // 16:9

// MARK: - Video Card

struct VideoCardView: View {
    let video: Video
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 12) {
                ZStack(alignment: .bottomLeading) {
                    AsyncImage(url: video.thumbURL) { img in
                        img.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        ZStack {
                            Rectangle().fill(Color(white: 0.12))
                            Image(systemName: "film")
                                .font(.system(size: 36))
                                .foregroundColor(Color(white: 0.25))
                        }
                    }
                    .frame(width: CARD_W, height: CARD_H)
                    .clipped()

                    LinearGradient(colors: [.black.opacity(0.7), .clear], startPoint: .bottom, endPoint: .top)
                        .frame(height: 80)

                    if let cat = video.category {
                        Text(cat.uppercased())
                            .font(.system(size: 13, weight: .black))
                            .foregroundColor(.black)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color(hex: "#facc15"))
                            .cornerRadius(4)
                            .padding(10)
                    }
                }
                .cornerRadius(12)

                VStack(alignment: .leading, spacing: 4) {
                    Text(video.title)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    HStack(spacing: 10) {
                        if let year = video.year {
                            Text(String(year)).foregroundColor(Color(white: 0.45))
                        }
                        if let rating = video.rating {
                            Text(rating)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color(white: 0.3)))
                                .foregroundColor(Color(white: 0.45))
                        }
                        if let dur = video.duration {
                            Text(dur).foregroundColor(Color(white: 0.35))
                        }
                    }
                    .font(.system(size: 16))
                }
                .frame(width: CARD_W, alignment: .leading)
            }
        }
        .buttonStyle(.card)
    }
}

// MARK: - Show Card

struct ShowCardView: View {
    let show: Show
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 12) {
                ZStack(alignment: .topTrailing) {
                    AsyncImage(url: show.thumbURL) { img in
                        img.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        ZStack {
                            Rectangle().fill(Color(white: 0.12))
                            Image(systemName: "tv")
                                .font(.system(size: 36))
                                .foregroundColor(Color(white: 0.25))
                        }
                    }
                    .frame(width: CARD_W, height: CARD_H)
                    .clipped()

                    Text("SERIES")
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Color(hex: "#6366f1"))
                        .cornerRadius(4)
                        .padding(10)
                }
                .cornerRadius(12)

                VStack(alignment: .leading, spacing: 4) {
                    Text(show.title)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    if let cat = show.category {
                        Text(cat).font(.system(size: 16)).foregroundColor(Color(white: 0.45))
                    }
                }
                .frame(width: CARD_W, alignment: .leading)
            }
        }
        .buttonStyle(.card)
    }
}

// MARK: - Stream Card

struct StreamCardView: View {
    let stream: LiveStream
    @State private var playing: LiveStream?

    var body: some View {
        Button { if stream.is_live == true { playing = stream } } label: {
            VStack(alignment: .leading, spacing: 12) {
                ZStack {
                    AsyncImage(url: stream.thumbURL) { img in
                        img.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        ZStack {
                            Rectangle().fill(Color(white: 0.12))
                            Image(systemName: "antenna.radiowaves.left.and.right")
                                .font(.system(size: 36))
                                .foregroundColor(Color(white: 0.25))
                        }
                    }
                    .frame(width: CARD_W, height: CARD_H)
                    .clipped()

                    if stream.is_live == true {
                        VStack {
                            HStack {
                                LiveBadge()
                                Spacer()
                                if let v = stream.viewer_count, v > 0 {
                                    Label("\(v)", systemImage: "eye.fill")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 8).padding(.vertical, 4)
                                        .background(Color.black.opacity(0.6))
                                        .cornerRadius(6)
                                }
                            }
                            .padding(10)
                            Spacer()
                        }
                    }
                }
                .cornerRadius(12)

                VStack(alignment: .leading, spacing: 4) {
                    Text(stream.displayName)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    if let t = stream.stream_title {
                        Text(t).font(.system(size: 16)).foregroundColor(Color(white: 0.45)).lineLimit(1)
                    }
                }
                .frame(width: CARD_W, alignment: .leading)
            }
        }
        .buttonStyle(.card)
        .fullScreenCover(item: $playing) { s in
            if let url = s.streamURL { PlayerView(url: url, title: s.displayName) }
        }
    }
}

// MARK: - Live Badge

struct LiveBadge: View {
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(Color.red)
                .frame(width: 8, height: 8)
                .scaleEffect(pulse ? 1.3 : 1.0)
                .animation(.easeInOut(duration: 0.8).repeatForever(), value: pulse)
            Text("LIVE")
                .font(.system(size: 14, weight: .black))
                .foregroundColor(.white)
        }
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(Color.red)
        .cornerRadius(6)
        .onAppear { pulse = true }
    }
}
