import SwiftUI
import AVFoundation
import OSLog

@main
struct PeepTVApp: App {
    @StateObject private var supabase = SupabaseService.shared
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(supabase)
                .preferredColorScheme(.dark)
                .tint(ContentAppearance.accent)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showingIntro = true
    var body: some View {
        Group {
            if let error = supabase.configurationError {
                StatusView(title: "Connect your catalog", message: error, symbol: "gearshape")
            } else if supabase.isRestoring {
                ProgressView("Opening peep…")
            } else if supabase.session != nil && supabase.activeProfile == nil {
                ProfileSelectView().id(supabase.session?.userId)
            } else {
                ContentView()
                    .id(supabase.session?.userId ?? "guest")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black)
        .overlay(alignment: .bottomTrailing) {
            if supabase.configuration?.isDevelopment == true {
                Text("FARRIS · DEV").font(.system(size: 13, weight: .semibold)).tracking(1.5)
                    .foregroundStyle(Color.yellow.opacity(0.85)).padding(.horizontal, 12).padding(.vertical, 7)
                    .background(.black.opacity(0.85)).clipShape(Capsule()).padding(24)
                    .allowsHitTesting(false)
            }
        }
        .disabled(showingIntro)
        .accessibilityHidden(showingIntro)
        .overlay {
            if showingIntro {
                PeepLaunchIntro { showingIntro = false }
                    .transition(.opacity)
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.35), value: showingIntro)
        .sheet(isPresented: $supabase.needsReauthentication) { AuthView() }
        .task {
            await supabase.restoreSession()
            guard !Task.isCancelled else { return }
            await supabase.warmLaunchCatalog()
        }
        .task(id: supabase.session?.userId) { try? await supabase.refreshSavedList() }

    }
}


/// Local artwork keeps launch independent of streaming or network availability.
private struct PeepLaunchIntro: View {
    let finish: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var sound = PeepIntroSound()
    @State private var started = false
    @State private var revealed = false
    @State private var blinking = false
    @State private var gaze = CGSize.zero
    @State private var assembled = false
    @State private var closing = false
    @State private var finished = false
    @FocusState private var focused: Bool

    var body: some View {
        Button(action: skipIntro) {
            ZStack {
                Color.black.ignoresSafeArea()
                if reduceMotion {
                    PeepBrandMark(width: 440).opacity(revealed && !closing ? 1 : 0)
                } else {
                    animatedWordmark
                        .opacity(closing ? 0 : 1)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(LaunchIntroStyle())
        .focused($focused)
        .accessibilityLabel("Peep. Welcome.")
        .accessibilityHint("Press Select to skip the intro")
        .onExitCommand(perform: skipIntro)
        .onPlayPauseCommand(perform: skipIntro)
        .onDisappear { sound.stop() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active && started { skipIntro() }
        }
        .task(id: scenePhase) {
            // Launch can initially be inactive. Wait rather than silently skipping audio.
            guard scenePhase == .active, !started else { return }
            started = true
            focused = true
            await sound.play()
            guard !Task.isCancelled, !finished else { return }
            let introDuration = max(3.7, sound.duration + 0.2)
            withAnimation(.easeOut(duration: 0.15)) { revealed = true }
            do {
                if reduceMotion {
                    // Match the extended logo hold without the animated blinks.
                    try await Task.sleep(for: .seconds(introDuration - 0.46))
                    withAnimation(.easeInOut(duration: 0.46)) { closing = true }
                    try await Task.sleep(for: .seconds(0.46))
                    skipIntro()
                    return
                }
                // Audio accents measured in the bundled three-beep sound.
                // Start each glance just before its peak so it lands on the beep.
                try await Task.sleep(for: .seconds(0.36))
                withAnimation(.easeOut(duration: 0.12)) { gaze = CGSize(width: -48, height: 0) }
                try await Task.sleep(for: .seconds(0.78))
                withAnimation(.easeInOut(duration: 0.12)) { gaze = CGSize(width: -24, height: -18) }
                try await Task.sleep(for: .seconds(0.72))
                withAnimation(.easeInOut(duration: 0.12)) { gaze = CGSize(width: 4, height: 4) }
                try await Task.sleep(for: .seconds(0.44))
                withAnimation(.easeIn(duration: 0.08)) { blinking = true }
                try await Task.sleep(for: .seconds(0.13))
                gaze = .zero
                withAnimation(.easeOut(duration: 0.13)) { blinking = false }
                try await Task.sleep(for: .seconds(0.13))
                withAnimation(.easeInOut(duration: 0.18)) { assembled = true }
                try await Task.sleep(for: .seconds(introDuration - 3.28))
                assembled = false
                withAnimation(.easeIn(duration: 0.08)) { blinking = true }
                try await Task.sleep(for: .seconds(0.13))
                withAnimation(.easeOut(duration: 0.13)) { blinking = false }
                try await Task.sleep(for: .seconds(0.13))
                assembled = true
                // Let the final blink reopen before the mark fades into the audio tail.
                withAnimation(.easeInOut(duration: 0.46)) { closing = true }
                try await Task.sleep(for: .seconds(0.46))
                skipIntro()
            } catch { return }
        }
    }

    private func skipIntro() {
        guard !finished else { return }
        finished = true
        sound.stop()
        finish()
    }

    private var animatedWordmark: some View {
        let width: CGFloat = 440
        let height = width * 611 / 1797
        return ZStack {
            RoundedRectangle(cornerRadius: 14)
                .fill(LinearGradient(colors: [Color(hex: "#ffeb48"), Color(hex: "#ffda00")], startPoint: .top, endPoint: .bottom))
                .frame(width: width * 1.24, height: height + width * 0.16)
            ForEach(0..<4) { letter in
                Image("PeepTVWordmark").resizable().frame(width: width, height: height)
                    .mask(PeepLogoPiece(index: letter).fill(style: FillStyle(eoFill: true)))
                    .opacity(assembled ? 0 : 1)
            }
            ForEach(0..<2) { eye in
                let eyeX: CGFloat = eye == 0 ? 724 : 1147
                let pupilX: CGFloat = eye == 0 ? 750 : 1174
                let pupilY: CGFloat = eye == 0 ? 130 : 128
                ZStack {
                    // Fill only the hole left by the original pupil; keep the
                    // supplied artwork's outer eye shape and texture intact.
                    Ellipse()
                        .fill(LinearGradient(colors: [Color(hex: "#fff5cf"), Color(hex: "#f7e9b5")], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: width * 176 / 1797, height: width * 166 / 1797)
                        .position(x: width * eyeX / 1797, y: width * 142 / 1797)
                    Image("PeepTVWordmark").resizable().frame(width: width, height: height)
                        .mask(PeepLogoPiece(index: eye + 4))
                        .mask(PeepPupilCutout(eye: eye).fill(style: FillStyle(eoFill: true)))
                    Circle().fill(.black)
                        .frame(width: width * 84 / 1797, height: width * 84 / 1797)
                        .position(x: width * (pupilX + gaze.width) / 1797, y: width * (pupilY + gaze.height) / 1797)
                }
                    .frame(width: width, height: height)
                    .mask(PeepLogoPiece(index: eye + 4))
                    .scaleEffect(x: 1, y: blinking ? 0.08 : 1, anchor: UnitPoint(x: eye == 0 ? 724 / 1797 : 1147 / 1797, y: 142 / 611))
                    .opacity(assembled ? 0 : 1)
            }
            Image("PeepTVWordmark").resizable().frame(width: width, height: height)
                .opacity(assembled ? 1 : 0)
        }
        .frame(width: width * 1.24, height: height + width * 0.16)
        .opacity(revealed ? 1 : 0)
        .accessibilityHidden(true)
    }
}

/// Remove the original pupil from the eye layer so it can move independently.
private struct PeepPupilCutout: Shape {
    let eye: Int
    func path(in rect: CGRect) -> Path {
        let x: CGFloat = eye == 0 ? 750 : 1174
        let y: CGFloat = eye == 0 ? 130 : 128
        var path = Path(rect)
        path.addEllipse(in: CGRect(x: rect.minX + (x - 44) / 1797 * rect.width,
                                   y: rect.minY + (y - 44) / 611 * rect.height,
                                   width: 88 / 1797 * rect.width, height: 88 / 611 * rect.height))
        return path
    }
}

/// Masks the original wordmark into four letters and two eyes; no replacement font.
private struct PeepLogoPiece: Shape {
    let index: Int
    private func artworkRect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat, in rect: CGRect) -> CGRect {
        CGRect(x: rect.minX + x / 1797 * rect.width, y: rect.minY + y / 611 * rect.height,
               width: width / 1797 * rect.width, height: height / 611 * rect.height)
    }
    func path(in rect: CGRect) -> Path {
        let eyes = [artworkRect(636, 59, 176, 166, in: rect), artworkRect(1060, 58, 175, 165, in: rect)]
        var path = Path()
        if index >= 4 { path.addEllipse(in: eyes[index - 4]) }
        else {
            let edges: [CGFloat] = [0, 483, 890, 1308, 1797]
            path.addRect(artworkRect(edges[index], 0, edges[index + 1] - edges[index], 611, in: rect))
            if index == 1 || index == 2 { path.addEllipse(in: eyes[index - 1]) }
        }
        return path
    }
}

private struct LaunchIntroStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { configuration.label }
}


/// One local player for the launch sting; never continues into content playback.
@MainActor
final class PeepIntroSound: ObservableObject {
    private var player: AVAudioPlayer?
    private var generation = UUID()
    private(set) var lastError: String?
    var isPlaying: Bool { player?.isPlaying == true }
    var currentTime: TimeInterval { player?.currentTime ?? 0 }
    var duration: TimeInterval { player?.duration ?? 0 }
    private let logger = Logger(subsystem: "tv.watchpeep.PeepTV", category: "LaunchAudio")

    @discardableResult
    func play() async -> Bool {
        guard player == nil else { return isPlaying }
        let request = UUID()
        generation = request
        guard let asset = NSDataAsset(name: "PeepLaunchSound") else {
            lastError = "PeepLaunchSound is missing from the app bundle."
            logger.error("Launch audio asset missing")
            return false
        }
        do {
            try await PlaybackAudioSession.activate(intro: true)
            guard !Task.isCancelled, generation == request else { return false }
            let next = try await PlaybackAudioSession.startIntro(data: asset.data)
            guard !Task.isCancelled, generation == request else {
                PlaybackAudioSession.stopIntro(next)
                return false
            }
            player = next
            lastError = nil
            logger.notice("Launch audio started")
            return true
        } catch {
            // Sound is decorative: an unavailable audio route must never block launch.
            lastError = error.localizedDescription
            logger.error("Launch audio failed: \(error.localizedDescription, privacy: .public)")
            player = nil
            return false
        }
    }

    func stop() {
        generation = UUID()
        if let player { PlaybackAudioSession.stopIntro(player) }
        player = nil
    }
}
