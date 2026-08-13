import Foundation

struct Video: Identifiable, Codable, Hashable {
    let id: Int
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
    let is_featured: Bool?
    let order_index: Int?

    var thumbURL: URL? { URL(string: poster ?? thumbnail ?? "") }
    var videoURL: URL? { URL(string: url ?? "") }
}

struct Show: Identifiable, Codable, Hashable {
    let id: Int
    let title: String
    let description: String?
    let category: String?
    let thumbnail: String?
    let poster: String?
    let is_featured: Bool?

    var thumbURL: URL? { URL(string: poster ?? thumbnail ?? "") }
}

struct Season: Identifiable, Codable {
    let id: Int
    let show_id: Int
    let season_number: Int
    let title: String?
}

struct Episode: Identifiable, Codable {
    let id: Int
    let season_id: Int
    let episode_number: Int?
    let title: String?
    let description: String?
    let url: String?
    let thumbnail: String?
    let duration: String?

    var videoURL: URL? { URL(string: url ?? "") }
    var thumbURL: URL? { URL(string: thumbnail ?? "") }
    var displayTitle: String { title ?? "Episode \(episode_number ?? 0)" }
}

struct LiveStream: Identifiable, Codable, Hashable {
    let id: Int
    let title: String?
    let channel_name: String?
    let stream_title: String?
    let is_live: Bool?
    let thumbnail: String?
    let stream_url: String?
    let viewer_count: Int?
    let slug: String?

    var displayName: String { channel_name ?? title ?? "Stream" }
    var thumbURL: URL? { URL(string: thumbnail ?? "") }
    var streamURL: URL? { URL(string: stream_url ?? "") }
}

struct Profile: Identifiable, Codable {
    let id: String
    let name: String?
    let avatar_id: String?
    let user_id: String?
}

struct UserSession {
    let accessToken: String
    let userId: String
}

struct AuthResponse: Codable {
    let access_token: String
    let user: AuthUser
}

struct AuthUser: Codable {
    let id: String
}

enum AppError: LocalizedError {
    case invalidCredentials
    case noSession
    case networkError(String)

    var errorDescription: String? {
        switch self {
        case .invalidCredentials: return "Invalid email or password."
        case .noSession: return "Not signed in."
        case .networkError(let msg): return msg
        }
    }
}
