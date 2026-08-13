import SwiftUI

struct HeroView: View {
    let video: Video
    let onPlay: () -> Void

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            AsyncImage(url: video.thumbURL) { img in
                img.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                Rectangle().fill(Color(white: 0.08))
            }
            .frame(height: 720)
            .clipped()

            // Cinematic gradients
            LinearGradient(colors: [.black.opacity(0.95), .clear], startPoint: .leading, endPoint: UnitPoint(x: 0.6, y: 0.5))
            LinearGradient(colors: [.black, .clear], startPoint: .bottom, endPoint: UnitPoint(x: 0.5, y: 0.45))

            VStack(alignment: .leading, spacing: 20) {
                // Badges
                HStack(spacing: 10) {
                    if let cat = video.category {
                        Text(cat.uppercased())
                            .font(.system(size: 16, weight: .black))
                            .foregroundColor(.black)
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(Color(hex: "#facc15"))
                            .cornerRadius(5)
                    }
                    if let rating = video.rating {
                        Text(rating)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(Color(white: 0.7))
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(white: 0.35)))
                    }
                    if let year = video.year {
                        Text(String(year))
                            .font(.system(size: 15))
                            .foregroundColor(Color(white: 0.5))
                    }
                }

                // Title
                Text(video.title)
                    .font(.system(size: 80, weight: .bold, design: .serif))
                    .foregroundColor(.white)
                    .shadow(color: .black.opacity(0.5), radius: 8, x: 0, y: 4)
                    .lineLimit(2)
                    .frame(maxWidth: 800, alignment: .leading)

                // Description
                if let desc = video.description {
                    Text(desc)
                        .font(.system(size: 26, weight: .light))
                        .foregroundColor(Color(white: 0.65))
                        .lineLimit(2)
                        .frame(maxWidth: 680, alignment: .leading)
                }

                // Buttons
                HStack(spacing: 16) {
                    Button(action: onPlay) {
                        HStack(spacing: 10) {
                            Image(systemName: "play.fill")
                            Text("Play")
                        }
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.black)
                        .padding(.horizontal, 44).padding(.vertical, 18)
                        .background(Color.white)
                        .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, 88)
            .padding(.bottom, 72)
        }
        .frame(height: 720)
    }
}
