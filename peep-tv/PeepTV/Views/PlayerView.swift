import SwiftUI
import AVKit

struct PlayerView: View {
    let url: URL
    let title: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VideoPlayer(player: AVPlayer(url: url))
            .ignoresSafeArea()
            .onAppear {
                // AVPlayer handles HLS natively on tvOS — no HLS.js needed
            }
    }
}
