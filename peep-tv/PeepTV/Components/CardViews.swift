import SwiftUI

private struct OnDemandTypographyKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var onDemandTypography: Bool {
        get { self[OnDemandTypographyKey.self] }
        set { self[OnDemandTypographyKey.self] = newValue }
    }
}


private let CARD_W: CGFloat = 320

// Poster focus belongs to the picture; the text below stays on the page background.
private struct PosterCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.foregroundStyle(.white)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

// MARK: - Video Card

struct VideoCardView: View {
    @Environment(\.onDemandTypography) private var largeType
    let video: Video
    @FocusState private var posterFocused: Bool
    var width: CGFloat = CARD_W
    let onSelect: () -> Void
    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 16) {
                PosterArtwork(url: video.thumbURL, width: width, symbol: "film", focused: posterFocused)
                VStack(alignment: .leading, spacing: 6) {
                    Text(video.title).font(.system(size: largeType ? 29 : 25, weight: .semibold, design: .rounded)).lineLimit(2)
                    Text("Movie")
                        .font(.system(size: 17, weight: .medium)).foregroundStyle(Color(white: 0.6))
                }.frame(width: width, height: 104, alignment: .topLeading)
            }.frame(width: width, alignment: .leading)
        }.buttonStyle(PosterCardStyle()).focused($posterFocused).saveToMyList(video.id, type: "movie")
    }
}

/// Reserve a consistent portrait slot while keeping the entire artwork visible.
/// The focus ring hugs the fitted image rather than its unused surrounding space.
struct PosterArtwork: View {
    let url: URL?
    let width: CGFloat
    var symbol = "film"
    var focused = false
    @State private var artwork: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack(alignment: .bottom) {
            if let artwork {
                let ratio = artwork.size.width / max(1, artwork.size.height)
                let fittedWidth = min(width, width * 1.5 * ratio)
                let fittedHeight = fittedWidth / max(0.01, ratio)
                Image(uiImage: artwork).resizable().scaledToFit()
                    .frame(width: fittedWidth, height: fittedHeight)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(focused ? ContentAppearance.accent : .clear, lineWidth: ContentAppearance.focusWidth))
            } else {
                VStack(spacing: 14) {
                    Image(systemName: symbol).font(.system(size: 34, weight: .light))
                    if failed { Text("Artwork unavailable").font(.system(size: 16)) }
                    else { ProgressView().tint(.white.opacity(0.5)) }
                }.foregroundStyle(.secondary).frame(width: width, height: width * 1.5)
                    .background(Color(white: 0.065), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(focused ? ContentAppearance.accent : .clear, lineWidth: ContentAppearance.focusWidth))
            }
        }.frame(width: width, height: width * 1.5, alignment: .bottom)
            .task(id: url) {
                artwork = nil; failed = false
                guard let url else { failed = true; return }
                if let cached = ArtworkMemory.images.object(forKey: url as NSURL) { artwork = cached; return }
                do {
                    var request = URLRequest(url: url); request.timeoutInterval = 10
                    let (data, response) = try await URLSession.shared.data(for: request)
                    guard !Task.isCancelled else { return }
                    guard (response as? HTTPURLResponse)?.statusCode == 200, let image = UIImage(data: data) else { failed = true; return }
                    ArtworkMemory.images.setObject(image, forKey: url as NSURL, cost: Int(image.size.width * image.size.height * image.scale * image.scale * 4))
                    artwork = image
                } catch { if !Task.isCancelled { failed = true } }
            }.accessibilityHidden(true)
    }
}

/// Keep cards the same size as the sidebar changes the usable page width.
enum PosterGrid {
    static let cardWidth: CGFloat = 320
    static let spacing: CGFloat = 36
    static func columnCount(availableWidth: CGFloat) -> Int {
        guard availableWidth.isFinite else { return 1 }
        return max(1, min(6, Int((max(0, availableWidth) + spacing) / (cardWidth + spacing))))
    }
}

/// Small in-memory artwork cache avoids re-downloading the same channel logo
/// whenever a card re-enters the viewport. Failed requests remain retryable.
@MainActor enum ArtworkMemory {
    static let images: NSCache<NSURL, UIImage> = {
        let cache = NSCache<NSURL, UIImage>()
        cache.countLimit = 120
        cache.totalCostLimit = 48 * 1024 * 1024
        return cache
    }()
}

/// A bounded image never magnifies a tiny title/logo into a full-screen backdrop.
struct BoundedArtwork: View {
    let url: URL?
    var symbol = "photo"
    var fillsCard = false
    var preservesEntireImage = false
    @State private var artwork: UIImage?
    @State private var finished = false
    var body: some View {
        GeometryReader { proxy in
            ZStack {
                if let artwork {
                    if preservesEntireImage {
                        Image(uiImage: artwork).resizable().scaledToFit()
                            .frame(width: proxy.size.width, height: proxy.size.height)
                    } else if fillsCard {
                        // Fill thumbnail frames without stretching the source image.
                        Image(uiImage: artwork).resizable().scaledToFill()
                            .frame(width: proxy.size.width, height: proxy.size.height).clipped()
                    } else {
                        Image(uiImage: artwork).resizable().scaledToFit()
                            .frame(width: min(proxy.size.width - 32, artwork.size.width), height: min(proxy.size.height - 24, artwork.size.height))
                    }
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: symbol).font(.system(size: 30, weight: .light))
                        Text(finished ? "Artwork unavailable" : "Loading artwork")
                            .font(.system(size: 15))
                    }.foregroundStyle(.secondary)
                }
            }.frame(width: proxy.size.width, height: proxy.size.height)
        }
        .task(id: url) {
            artwork = nil; finished = false
            defer { finished = true }
            guard let url else { return }
            if let cached = ArtworkMemory.images.object(forKey: url as NSURL) { artwork = cached; return }
            do {
                var request = URLRequest(url: url)
                request.timeoutInterval = 10
                let (data, response) = try await URLSession.shared.data(for: request)
                guard !Task.isCancelled, (response as? HTTPURLResponse)?.statusCode == 200,
                      let image = UIImage(data: data) else { return }
                let cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4)
                ArtworkMemory.images.setObject(image, forKey: url as NSURL, cost: cost)
                artwork = image
            } catch { }
        }.accessibilityHidden(true)
    }
}

/// Neutral surfaces with yellow outlines for focus and yellow fills for selection.
enum ContentAppearance {
    static let focusWidth: CGFloat = 6
    static let accent = Color(hex: "#facc15")
    static let pillHeight: CGFloat = 56
    static let controlHeight: CGFloat = 58
    static let compactControlHeight: CGFloat = 46
    static let controlCornerRadius: CGFloat = 14
}

/// Shared segmented control for filters throughout Apple TV. Selection stays
/// neutral; yellow is reserved for the remote-focus outline.
struct TVPillStyle: ButtonStyle {
    let selected: Bool
    @Environment(\.isFocused) private var focused
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 21, weight: selected ? .bold : .semibold, design: .rounded))
            .frame(minHeight: ContentAppearance.pillHeight)
            .padding(.horizontal, 25)
            .foregroundStyle(.white)
            .background(Color(white: selected ? 0.25 : 0.095), in: Capsule())
            .overlay(Capsule().strokeBorder(focused ? ContentAppearance.accent : (selected ? .white.opacity(0.28) : .clear), lineWidth: focused ? ContentAppearance.focusWidth : 1))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .shadow(color: focused ? ContentAppearance.accent.opacity(0.28) : .clear, radius: 12)
    }
}

/// Shared rectangular action control for playback, multiview and other
/// full-screen surfaces where a capsule would be visually noisy.
struct TVActionControlStyle: ButtonStyle {
    var compact = false
    @Environment(\.isFocused) private var focused
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 19 : 22, weight: .semibold))
            .frame(minHeight: compact ? ContentAppearance.compactControlHeight : ContentAppearance.controlHeight)
            .padding(.horizontal, compact ? 18 : 24)
            .foregroundStyle(.white)
            .background(Color(white: focused ? 0.17 : 0.09), in: RoundedRectangle(cornerRadius: ContentAppearance.controlCornerRadius))
            .overlay(RoundedRectangle(cornerRadius: ContentAppearance.controlCornerRadius).strokeBorder(focused ? ContentAppearance.accent : .white.opacity(0.12), lineWidth: focused ? ContentAppearance.focusWidth : 1))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct TVStatusBadge: View {
    let text: String
    var symbol: String? = nil
    var body: some View {
        Group {
            if let symbol { Label(text, systemImage: symbol) }
            else { Text(text) }
        }
            .font(.system(size: 15, weight: .bold))
            .tracking(1.2)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .foregroundStyle(.white.opacity(0.78))
            .background(Color.white.opacity(0.09), in: Capsule())
    }
}

struct BrowseCardStyle: ButtonStyle {
    @Environment(\.isFocused) private var focused
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.foregroundStyle(.white)
            .background(Color(white: focused ? 0.11 : 0.055))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(focused ? ContentAppearance.accent : Color.white.opacity(0.1), lineWidth: focused ? ContentAppearance.focusWidth : 1))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .shadow(color: focused ? ContentAppearance.accent.opacity(0.28) : .clear, radius: 14)
    }
}

enum BrowsePresentation {
    static func categories(_ raw: String?) -> [String] {
        (raw ?? "").components(separatedBy: CharacterSet(charactersIn: ";,|"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).capitalized }.filter { !$0.isEmpty }
    }
    static func category(_ raw: String?) -> String? {
        let values = categories(raw)
        return values.isEmpty ? nil : values.joined(separator: " · ")
    }
    static func isDemo(_ title: String) -> Bool { title.uppercased().hasPrefix("DEMO") }
}

struct BrowseHeader: View {
    @Environment(\.onDemandTypography) private var largeType
    let title: String
    let subtitle: String
    var body: some View {
        HStack(spacing: 24) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: largeType ? 48 : 38, weight: .bold, design: largeType ? .rounded : .serif))
                if !subtitle.isEmpty {
                    Text(subtitle).font(.system(size: largeType ? 23 : 18)).foregroundStyle(.secondary)
                }
            }
            Spacer()
        }.padding(.horizontal, 70).padding(.top, 24).padding(.bottom, 18)
    }
}

// MARK: - Show Card

struct ShowCardView: View {
    @Environment(\.onDemandTypography) private var largeType
    let show: Show
    @FocusState private var posterFocused: Bool
    var width: CGFloat = CARD_W
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 16) {
                PosterArtwork(url: show.thumbURL, width: width, symbol: "tv", focused: posterFocused)

                VStack(alignment: .leading, spacing: 4) {
                    Text(show.title)
                        .font(.system(size: largeType ? 29 : 25, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                        .lineLimit(2)
                    Text("Series")
                        .font(.system(size: 17, weight: .medium)).foregroundStyle(Color(white: 0.6))
                }
                .frame(width: width, height: 104, alignment: .topLeading)
            }
        }
        .buttonStyle(PosterCardStyle())
        .focused($posterFocused)
        .saveToMyList(String(show.id), type: "show")
        .frame(width: width)
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


private struct CatalogArtwork: View {
    let url: URL?
    let symbol: String
    var body: some View {
        AsyncImage(url: url) { phase in
            if let image = phase.image {
                image.resizable().scaledToFit()
            } else {
                ZStack {
                    Color(white: 0.1)
                    VStack(spacing: 12) {
                        Image(systemName: symbol).font(.system(size: 38))
                        Text(url == nil || phase.error != nil ? "Artwork unavailable" : "Loading artwork…")
                            .font(.system(size: 17)).multilineTextAlignment(.center)
                    }.foregroundStyle(Color(white: 0.65)).padding(20)
                }
            }
        }.accessibilityHidden(true)
    }
}


/// Hold Select on any catalog card to save/remove without changing its primary action.
struct MyListAction: View {
    @EnvironmentObject private var supabase: SupabaseService
    let id: String
    let type: String
    var styled = true
    @State private var showSignIn = false
    @State private var error: String?
    private var saved: Bool { supabase.isSaved(id, type: type) }
    private var busy: Bool { supabase.savingListKeys.contains("\(type):\(id)") }
    var body: some View {
        Group {
            if styled { action.buttonStyle(BrowseCardStyle()) }
            else { action }
        }
        .disabled(busy)
        .sheet(isPresented: $showSignIn) { AuthView() }
        .alert("Couldn't update My List", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "Please try again.") }
    }
    private var action: some View {
        Button {
            guard supabase.session != nil else { showSignIn = true; return }
            let desired = !saved
            Task {
                do { try await supabase.toggleSaved(id, type: type, desired: desired) }
                catch { self.error = error.localizedDescription }
            }
        } label: {
            Label(busy ? "Saving…" : (saved ? "Remove from My List" : "Add to My List"), systemImage: saved ? "checkmark" : "plus")
                .font(.system(size: 21, weight: .semibold)).padding(styled ? 18 : 0)
        }
        .accessibilityHint(saved ? "Removes this item from your saved list" : "Saves this item to your account")
    }
}

private struct MyListMenu: ViewModifier {
    @EnvironmentObject private var supabase: SupabaseService
    let id: String
    let type: String
    @State private var signIn = false
    @State private var error: String?
    private var saved: Bool { supabase.isSaved(id, type: type) }
    func body(content: Content) -> some View {
        content
            .contextMenu {
                Button(saved ? "Remove from My List" : "Add to My List", systemImage: saved ? "bookmark.slash" : "bookmark") {
                    guard supabase.session != nil else { signIn = true; return }
                    let desired = !saved
                    Task {
                        do { try await supabase.toggleSaved(id, type: type, desired: desired) }
                        catch { self.error = error.localizedDescription }
                    }
                }.disabled(supabase.savingListKeys.contains("\(type):\(id)"))
            }
            .sheet(isPresented: $signIn) { AuthView() }
            .alert("Couldn't update My List", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK") { error = nil }
            } message: { Text(error ?? "Please try again.") }
            .overlay(alignment: .topTrailing) {
                if saved {
                    Image(systemName: "bookmark.fill").font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(.white).padding(10).background(.black.opacity(0.85), in: Circle()).padding(10)
                        .allowsHitTesting(false).accessibilityHidden(true)
                }
            }
            .accessibilityHint("Hold Select for My List options")
    }
}

extension View {
    func saveToMyList(_ id: String, type: String) -> some View { modifier(MyListMenu(id: id, type: type)) }
}
