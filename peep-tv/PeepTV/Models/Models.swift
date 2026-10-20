import Foundation

struct Video: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let description: String?
    let category: String?
    let thumbnail: String?
    let poster: String?
    let url: String?
    let rating: String?
    let year: Int?
    let duration: String?
    let trailer_url: String?
    let featured: Bool?
    let visibility_tier: String?
    let is_premium: Bool?
    var is_featured: Bool? { featured }
    var thumbURL: URL? { MediaURL.parse(poster) ?? MediaURL.parse(thumbnail) }
    var videoURL: URL? { MediaURL.parse(url) }
}

struct Show: Identifiable, Codable, Hashable {
    let id: Int
    let title: String
    let description: String?
    let category: String?
    let thumbnail: String?
    let poster: String?
    let featured: Bool?
    let visibility_tier: String?
    let is_premium: Bool?
    var thumbURL: URL? { MediaURL.parse(poster) ?? MediaURL.parse(thumbnail) }
}

struct Episode: Identifiable, Codable {
    let id: Int
    let show_id: Int
    let season: Int?
    let episode_number: Int?
    let title: String?
    let description: String?
    let url: String?
    let thumbnail: String?
    let duration: String?
    let status: String?
    let is_premium: Bool?
    var videoURL: URL? { MediaURL.parse(url) }
    var thumbURL: URL? { MediaURL.parse(thumbnail) }
    var displayTitle: String { title ?? "Episode \(episode_number ?? 0)" }
}

struct Channel: Identifiable, Decodable {
    let id: Int
    let name: String
    let description: String?
    let category: String?
    let logo_url: String?
    let hero_url: String?
    let hls_url: String?
    let stream_uid: String?
    let live_feed_id: String?
    let visibility_tier: String?
    let is_premium: Bool?
    var thumbURL: URL? { MediaURL.parse(hero_url) ?? MediaURL.parse(logo_url) }
    func playbackURL(streamHost: String, feeds: [PublicFeed]) -> URL? {
        if let feed = feeds.first(where: { $0.id == live_feed_id }),
           let url = MediaURL.parse(feed.cloudflare_hls_url) { return url }
        if let url = MediaURL.parse(hls_url) { return url }
        guard let uid = stream_uid, !uid.isEmpty, !streamHost.isEmpty,
              uid.range(of: "^[a-zA-Z0-9_-]+$", options: .regularExpression) != nil else { return nil }
        return MediaURL.parse("https://\(streamHost)/\(uid)/manifest/video.m3u8")
    }
}
struct PublicFeed: Decodable {
    let id: String
    let cloudflare_hls_url: String?
}
struct GuideEntry: Identifiable, Decodable {
    let id: Int
    let channel_id: Int
    let title: String?
    let start_time: String?
    let end_time: String?
    static func date(_ text: String?) -> Date? {
        guard let text else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: text) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: text)
    }
    func isOnAir(at date: Date) -> Bool {
        guard let start = Self.date(start_time), let end = Self.date(end_time) else { return false }
        return start <= date && date < end
    }
}
struct Profile: Identifiable, Codable {
    let id: String
    let name: String?
    let avatar_id: String?
    let user_id: String?
}
struct UserSession: Codable {
    let accessToken: String
    let refreshToken: String
    let userId: String
    let expiresAt: Date
}
struct AuthResponse: Decodable {
    let access_token: String
    let refresh_token: String
    let expires_in: Double
    let user: AuthUser
    var session: UserSession {
        UserSession(accessToken: access_token, refreshToken: refresh_token,
                    userId: user.id, expiresAt: Date().addingTimeInterval(expires_in))
    }
}
struct AuthUser: Decodable { let id: String }
enum AppError: LocalizedError {
    case invalidCredentials
    case noSession
    case networkError(String)
    var errorDescription: String? {
        switch self {
        case .invalidCredentials: return "Unable to sign in. Check your email and password."
        case .noSession: return "Your session expired. Please sign in again."
        case .networkError(let message): return message
        }
    }
}
