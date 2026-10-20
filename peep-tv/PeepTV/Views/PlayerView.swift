import SwiftUI
import AVKit
import Combine

// One player per presentation; SwiftUI body updates must never recreate it.
@MainActor
final class PlayerModel: ObservableObject {
    let player: AVPlayer
    @Published var errorMessage: String?
    private var observation: NSKeyValueObservation?

    init(url: URL, title: String) {
        let item = AVPlayerItem(url: url)
        let metadata = AVMutableMetadataItem()
        metadata.identifier = .commonIdentifierTitle
        metadata.value = title as NSString
        metadata.extendedLanguageTag = "und"
        item.externalMetadata = [metadata]
        player = AVPlayer(playerItem: item)
        observation = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
            guard item.status == .failed else { return }
            let message = item.error?.localizedDescription ?? "This video can't be played right now."
            Task { @MainActor [weak self] in self?.errorMessage = message }
        }
    }

    func play() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try AVAudioSession.sharedInstance().setActive(true)
            player.play()
        } catch { errorMessage = error.localizedDescription }
    }
    func stop() {
        player.pause()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

struct PlaybackView: View {
    let url: URL?
    let title: String
    @Environment(\.dismiss) private var dismiss
    @State private var attempt = UUID()

    var body: some View {
        Group {
            if let url {
                PlayerView(url: url, title: title, retry: { attempt = UUID() }).id(attempt)
            } else {
                VStack {
                    StatusView(title: "Video unavailable", message: "This title doesn't have an Apple TV compatible HTTPS video URL yet.", symbol: "play.slash")
                    Button("Back") { dismiss() }.padding(.bottom, 80)
                }
                .background(Color.black)
                .onExitCommand { dismiss() }
            }
        }
    }
}

struct PlayerView: View {
    @StateObject private var model: PlayerModel
    @Environment(\.dismiss) private var dismiss
    let retry: () -> Void

    init(url: URL, title: String, retry: @escaping () -> Void) {
        _model = StateObject(wrappedValue: PlayerModel(url: url, title: title))
        self.retry = retry
    }

    var body: some View {
        Group {
            if let error = model.errorMessage {
                VStack {
                    StatusView(title: "Playback interrupted", message: error, retry: retry)
                    Button("Back") { dismiss() }.padding(.bottom, 80)
                }.background(Color.black)
            } else {
                NativePlayer(player: model.player).ignoresSafeArea()
            }
        }
        .onAppear { model.play() }
        .onDisappear { model.stop() }
        .onExitCommand { dismiss() }
    }
}

private struct NativePlayer: UIViewControllerRepresentable {
    let player: AVPlayer
    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.player = player
        controller.showsPlaybackControls = true
        return controller
    }
    func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {}
    static func dismantleUIViewController(_ controller: AVPlayerViewController, coordinator: ()) {
        controller.player?.pause()
        controller.player = nil
    }
}
