import SwiftUI
import AVFoundation
import Combine
import UIKit

struct HeroView: View {
    @State private var heroMuted = true
    @Environment(\.heroRailInset) private var heroRailInset
    let title: String
    let subtitle: String?
    let metadata: String
    let badge: String
    let artwork: URL?
    let buttonLabel: String?
    var notice: String? = nil
    var backgroundVideo: URL? = nil
    // Catalog heroes get "More info" and a My List toggle; promos keep their single call to action.
    var onInfo: (() -> Void)? = nil
    var listItem: (id: String, type: String)? = nil
    let onPlay: () -> Void

    init(video: Video, onInfo: (() -> Void)? = nil, onPlay: @escaping () -> Void) {
        title = video.title; subtitle = video.description
        metadata = [BrowsePresentation.category(video.category), video.year.map(String.init), video.rating].compactMap { $0 }.joined(separator: " · ")
        badge = "FEATURED ON PEEP"; artwork = video.heroURL
        buttonLabel = video.videoURL == nil ? "View availability" : "Watch now"
        self.onInfo = onInfo; listItem = (video.id, "movie")
        self.onPlay = onPlay
    }

    init(show: Show, onPlay: @escaping () -> Void) {
        title = show.title; subtitle = show.description
        metadata = BrowsePresentation.category(show.category) ?? "Series"
        badge = "FEATURED ON PEEP"; artwork = MediaURL.parse(show.thumbnail) ?? show.thumbURL
        buttonLabel = "View series"; listItem = (String(show.id), "show"); self.onPlay = onPlay
    }

    init(promo: HomeHero, available: Bool, listItem: (id: String, type: String)? = nil, onPlay: @escaping () -> Void) {
        title = promo.title ?? ""; subtitle = promo.subtitle; metadata = ""
        self.listItem = listItem
        badge = promo.badge ?? ""; artwork = MediaURL.parse(promo.image_url)
        backgroundVideo = MediaURL.playback(promo.video_url)
        let hasAction = promo.cta_type != nil && promo.cta_type != "none" && !(promo.cta_label ?? "").isEmpty
        buttonLabel = hasAction && available ? promo.cta_label : nil
        notice = hasAction && !available ? "This promotion’s destination is available on the Peep website." : nil
        self.onPlay = onPlay
    }
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                ZStack {
                Group {
                    if let backgroundVideo {
                        PromoArtwork(videoURL: backgroundVideo, imageURL: artwork, muted: heroMuted)
                            .id(backgroundVideo)
                    } else {
                        HeroBackdrop(url: artwork)
                    }
                }
                .frame(width: geometry.size.width + heroRailInset, height: geometry.size.height)
                .clipped()

                LinearGradient(stops: [
                    .init(color: .black, location: 0),
                    .init(color: .black.opacity(0.9), location: 0.12),
                    .init(color: .black.opacity(0.55), location: 0.30),
                    .init(color: .black.opacity(0.18), location: 0.48),
                    .init(color: .clear, location: 0.72)
                ], startPoint: .leading, endPoint: .trailing)
                LinearGradient(stops: [
                    .init(color: .clear, location: 0.22),
                    .init(color: .black.opacity(0.25), location: 0.55),
                    .init(color: .black, location: 1)
                ], startPoint: .top, endPoint: .bottom)
                LinearGradient(stops: [
                    .init(color: .black.opacity(0.12), location: 0),
                    .init(color: .clear, location: 0.12)
                ], startPoint: .top, endPoint: .bottom)
                LinearGradient(stops: [
                    .init(color: .clear, location: 0.9),
                    .init(color: .black.opacity(0.15), location: 1)
                ], startPoint: .leading, endPoint: .trailing)

                }
                .frame(width: geometry.size.width + heroRailInset, height: geometry.size.height)
                .offset(x: -heroRailInset)

                VStack(alignment: .leading, spacing: 18) {
                    if !badge.isEmpty {
                        Text(badge).font(.system(size: 16, weight: .bold))
                            .tracking(3).foregroundStyle(.white.opacity(0.68))
                    }
                    Text(title.trimmingCharacters(in: .whitespacesAndNewlines)).font(.system(size: 66, weight: .bold))
                        .tracking(-1.4)
                        .lineLimit(2).accessibilityAddTraits(.isHeader)
                    if !metadata.isEmpty {
                        Text(metadata).font(.system(size: 21, weight: .medium)).foregroundStyle(.white.opacity(0.65))
                    }
                    if let description = subtitle, !description.isEmpty {
                        Text(description).font(.system(size: 24))
                            .lineSpacing(4).foregroundStyle(.white.opacity(0.78))
                            .lineLimit(2)
                    }
                    HStack(spacing: 22) {
                        if let buttonLabel {
                            Button { heroMuted = true; onPlay() } label: {
                                Label(buttonLabel, systemImage: "play.fill")
                                    .font(.system(size: 25, weight: .bold))
                                    .padding(.horizontal, 30).padding(.vertical, 19)
                            }.buttonStyle(BrowseCardStyle()).contentEntryTarget(true).sidebarBoundary()
                        }
                        if let onInfo {
                            Button(action: onInfo) {
                                Label("More info", systemImage: "info.circle")
                                    .font(.system(size: 21, weight: .semibold)).padding(.horizontal, 23).padding(.vertical, 21)
                            }.buttonStyle(BrowseCardStyle())
                        }
                        if let listItem {
                            MyListAction(id: listItem.id, type: listItem.type)
                        }
                        if backgroundVideo != nil {
                            Button { heroMuted.toggle() } label: {
                                Label(heroMuted ? "Sound on" : "Mute", systemImage: heroMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                                    .font(.system(size: 21, weight: .semibold)).padding(.horizontal, 23).padding(.vertical, 21)
                            }.buttonStyle(BrowseCardStyle())
                            .contentEntryTarget(buttonLabel == nil).sidebarBoundary(buttonLabel == nil)
                            .accessibilityLabel(heroMuted ? "Turn trailer sound on" : "Mute trailer")
                        }
                    }.padding(.top, 12)
                    if let notice {
                        Text(notice).font(.system(size: 18)).foregroundStyle(.white.opacity(0.65)).lineLimit(2)
                    }
                }
                .frame(maxWidth: min(760, geometry.size.width * 0.54), alignment: .leading)
                .padding(.horizontal, 70).padding(.bottom, 48).padding(.top, 28)
            }
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .bottomLeading)
            .background(.black)
        }
        .frame(height: UIScreen.main.bounds.height * 0.82)
    }

}


/// Full-bleed artwork is specific to the hero; catalog logos remain bounded.
private struct HeroBackdrop: View {
    let url: URL?
    var body: some View {
        GeometryReader { geometry in
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                LinearGradient(colors: [Color(white: 0.08), Color(white: 0.16)], startPoint: .leading, endPoint: .trailing)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()
        }
        .accessibilityHidden(true)
    }
}

/// Promotional media starts muted; the hero provides a remote-accessible sound control.
private struct PromoArtwork: View {
    let imageURL: URL?
    let videoURL: URL
    let muted: Bool
    @EnvironmentObject private var service: SupabaseService
    @StateObject private var loop: PromoLoopPlayer
    @State private var frameReady = false
    @State private var revealVideo = false
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(videoURL: URL, imageURL: URL?, muted: Bool) {
        self.muted = muted
        self.imageURL = imageURL; self.videoURL = videoURL
        _loop = StateObject(wrappedValue: PromoLoopPlayer())
    }
    var body: some View {
        ZStack {
            HeroBackdrop(url: imageURL)
            PromoVideoSurface(player: loop.player) { frameReady = $0 }
                .clipped()
                .opacity(revealVideo ? 1 : 0)
                .animation(.easeInOut(duration: 0.8), value: revealVideo)
                .allowsHitTesting(false).accessibilityHidden(true)
        }
        .task(id: canReveal) {
            guard canReveal else { revealVideo = false; return }
            // Let artwork settle, and keep it visible until a decoded frame exists.
            do { try await Task.sleep(for: .milliseconds(450)) } catch { return }
            guard !Task.isCancelled else { return }
            revealVideo = true
        }
        .task(id: videoURL.absoluteString + "|" + (service.session?.userId ?? "guest") + "|" + String(reduceMotion)) {
            loop.load(nil)
            guard !reduceMotion else { return }
            while !Task.isCancelled {
                let playable = try? await service.resolveVODPlayback(videoURL, expiresIn: 3600)
                guard !Task.isCancelled else { return }
                // Keep the current frame on transient refresh failures.
                if let playable { loop.load(playable, preservePosition: loop.player.currentItem != nil) }
                updatePlayback()
                do { try await Task.sleep(for: .seconds(1800)) } catch { return }
            }
        }
        .task(id: "\(muted):\(canReveal):\(revealVideo)") {
            loop.player.isMuted = true
            guard !muted, canReveal, revealVideo else { return }
            do {
                try await PlaybackAudioSession.activate()
                guard !Task.isCancelled else { return }
                loop.player.isMuted = false
            } catch { loop.player.isMuted = true }
        }
        .onAppear { updatePlayback() }
        .onDisappear { loop.player.isMuted = true; loop.player.pause() }
        .onChange(of: scenePhase) { _, _ in updatePlayback() }
        .onChange(of: reduceMotion) { _, _ in updatePlayback() }
        .onChange(of: isEnabled) { _, _ in updatePlayback() }
    }
    private var canReveal: Bool {
        frameReady && !loop.failed && scenePhase == .active && isEnabled && !reduceMotion
    }
    private func updatePlayback() {
        if scenePhase == .active && isEnabled && !reduceMotion { loop.player.play() }
        else { loop.player.pause() }
    }
}

@MainActor
private final class PromoLoopPlayer: ObservableObject {
    let player = AVQueuePlayer()
    @Published private(set) var failed = false
    private var looper: AVPlayerLooper?
    private var observer: AnyCancellable?
    init() {
        player.isMuted = true
        observer = player.publisher(for: \.currentItem)
            .map { item -> AnyPublisher<AVPlayerItem.Status, Never> in
                guard let item else { return Just(.unknown).eraseToAnyPublisher() }
                return item.publisher(for: \.status).eraseToAnyPublisher()
            }
            .switchToLatest()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.failed = $0 == .failed }
    }
    func load(_ url: URL?, preservePosition: Bool = false) {
        let position = player.currentTime()
        player.pause(); looper?.disableLooping(); looper = nil
        player.removeAllItems(); failed = false
        if let url {
            let item = AVPlayerItem(url: url)
            item.preferredForwardBufferDuration = 5
            looper = AVPlayerLooper(player: player, templateItem: item)
            if preservePosition, position.seconds.isFinite, position.seconds > 0 {
                player.seek(to: position, toleranceBefore: .zero, toleranceAfter: .zero)
            }
        }
    }

}


/// A decorative layer uses the same fill crop as the artwork and waits for the
/// first decoded frame. Buffering preserves the last frame instead of flashing
/// back to artwork whenever timeControlStatus briefly changes.
private struct PromoVideoSurface: UIViewRepresentable {
    let player: AVPlayer
    let onReady: (Bool) -> Void

    final class Surface: UIView {
        let videoLayer = AVPlayerLayer()
        override init(frame: CGRect) {
            super.init(frame: frame)
            clipsToBounds = true
            layer.addSublayer(videoLayer)
        }
        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
        override func layoutSubviews() {
            super.layoutSubviews()
            let size = videoLayer.player?.currentItem?.presentationSize ?? .zero
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            videoLayer.frame = HeroVideoFraming.frame(videoSize: size, bounds: bounds.size)
            CATransaction.commit()
        }
    }
    final class Coordinator {
        var observation: NSKeyValueObservation?
        var onReady: (Bool) -> Void
        var active = true
        init(onReady: @escaping (Bool) -> Void) { self.onReady = onReady }
    }
    func makeCoordinator() -> Coordinator { Coordinator(onReady: onReady) }
    func makeUIView(context: Context) -> Surface {
        let view = Surface()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        view.videoLayer.videoGravity = .resizeAspectFill
        view.videoLayer.player = player
        context.coordinator.observation = view.videoLayer.observe(\.isReadyForDisplay, options: [.initial, .new]) { [weak coordinator = context.coordinator, weak view] layer, _ in
            let ready = layer.isReadyForDisplay
            DispatchQueue.main.async {
                guard let coordinator, coordinator.active else { return }
                view?.setNeedsLayout()
                coordinator.onReady(ready)
            }
        }
        return view
    }
    func updateUIView(_ view: Surface, context: Context) {
        context.coordinator.onReady = onReady
        if view.videoLayer.player !== player { view.videoLayer.player = player }
        view.setNeedsLayout()
    }
    static func dismantleUIView(_ view: Surface, coordinator: Coordinator) {
        coordinator.active = false
        coordinator.observation?.invalidate()
        view.videoLayer.player = nil
    }
}

/// Fill the hero without scaling beyond the normal aspect-fill size. Move the
/// image down within its existing overflow, never exposing an empty top edge.
enum HeroVideoFraming {
    static func frame(videoSize: CGSize, bounds: CGSize, lowerBy: CGFloat = 0) -> CGRect {
        guard videoSize.width > 0, videoSize.height > 0, bounds.width > 0, bounds.height > 0 else {
            return CGRect(origin: .zero, size: bounds)
        }
        let scale = max(bounds.width / videoSize.width, bounds.height / videoSize.height)
        let width = videoSize.width * scale, height = videoSize.height * scale
        let overflow = max(0, height - bounds.height)
        return CGRect(x: (bounds.width - width) / 2,
                      y: -overflow / 2 + min(max(0, lowerBy), overflow / 2),
                      width: width, height: height)
    }
}
