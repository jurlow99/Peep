import Foundation
import Combine

/// `peeptv://movie/<uuid>`, `peeptv://show/<id>`, `peeptv://channel/<id>`.
/// The Top Shelf opens the app with these; anything else that wants to land on a
/// title can use the same addresses.
enum DeepLink: Equatable {
    case movie(String)
    case show(Int)
    case channel(Int)

    static let scheme = "peeptv"

    static func parse(_ url: URL) -> DeepLink? {
        guard url.scheme?.lowercased() == scheme, let kind = url.host?.lowercased() else { return nil }
        let value = url.pathComponents.dropFirst().first?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !value.isEmpty else { return nil }
        switch kind {
        case "movie", "video": return .movie(value)
        case "show", "series": return Int(value).map(DeepLink.show)
        case "channel", "live": return Int(value).map(DeepLink.channel)
        default: return nil
        }
    }

    var url: URL {
        switch self {
        case .movie(let id): return URL(string: "\(Self.scheme)://movie/\(id)")!
        case .show(let id): return URL(string: "\(Self.scheme)://show/\(id)")!
        case .channel(let id): return URL(string: "\(Self.scheme)://channel/\(id)")!
        }
    }
}

/// Holds the last link until the browsing UI is on screen to act on it.
@MainActor final class DeepLinkRouter: ObservableObject {
    static let shared = DeepLinkRouter()
    @Published var pending: DeepLink?
}
