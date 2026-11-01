import Foundation

/// Catalog tags may arrive as a JSON array or legacy JSON/comma-separated text.
struct CatalogTags: Codable, Hashable {
    let values: [String]
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let array = try? container.decode([String].self) { values = array; return }
        let text = (try? container.decode(String.self)) ?? ""
        values = (try? JSONDecoder().decode([String].self, from: Data(text.utf8)))
            ?? text.components(separatedBy: ",")
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(values)
    }
}

struct Video: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let description: String?
    let category: String?
    let tags: CatalogTags?
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
    var heroURL: URL? { MediaURL.parse(thumbnail) ?? MediaURL.parse(poster) }
    var thumbURL: URL? { MediaURL.parse(poster) ?? MediaURL.parse(thumbnail) }
    var videoURL: URL? { MediaURL.playback(url) }
}

struct Show: Identifiable, Codable, Hashable {
    let id: Int
    let title: String
    let description: String?
    let category: String?
    let tags: CatalogTags?
    let thumbnail: String?
    let poster: String?
    let autoplay_next: Bool?
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
    var videoURL: URL? { MediaURL.playback(url) }
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
    let blackout_enabled: Bool?
    let blackout_message: String?
    let blackout_starts_at: String?
    let blackout_ends_at: String?

    func blackoutMessage(at date: Date = Date()) -> String? {
        let scheduled: Bool
        if let start = GuideEntry.date(blackout_starts_at), let end = GuideEntry.date(blackout_ends_at) {
            scheduled = start < end && start <= date && date < end
        } else { scheduled = false }
        guard blackout_enabled == true || scheduled else { return nil }
        let message = blackout_message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return message.isEmpty ? "This channel is temporarily unavailable. Please check back soon." : message
    }
    var thumbURL: URL? { MediaURL.parse(hero_url) ?? MediaURL.parse(logo_url) }
    /// What viewers see; `name` stays the source-of-truth for search and demo filtering.
    var displayName: String { BrowsePresentation.channelName(name) }
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
    // Parsed on every guide card refresh, so the formatters are built once.
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return formatter
    }()
    private static let plainFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime]; return formatter
    }()
    static func date(_ text: String?) -> Date? {
        guard let text else { return nil }
        return fractionalFormatter.date(from: text) ?? plainFormatter.date(from: text)
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
    let avatar_url: String?
    let user_id: String?
}

struct AccountProfile: Identifiable, Codable, Equatable {
    let id: String
    let email: String?
    let username: String?
    let full_name: String?
    let avatar_id: String?
    let avatar_url: String?
    var displayName: String { full_name?.isEmpty == false ? full_name! : (username ?? "Your profile") }
}

struct AccountProfileUpdate: Encodable {
    let full_name: String
    let avatarID: String?
    enum CodingKeys: String, CodingKey { case full_name, avatar_id, avatar_url }
    init(name: String, avatarID: String?) throws {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 80 else {
            throw AppError.networkError("Use a display name between 1 and 80 characters.")
        }
        guard avatarID == nil || (5...28).map({ "a\($0)" }).contains(avatarID!) else {
            throw AppError.networkError("Choose one of the available avatars.")
        }
        full_name = name
        self.avatarID = avatarID
    }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(full_name, forKey: .full_name)
        // A name-only edit preserves an existing uploaded photo or preset.
        if let avatarID {
            try values.encode(avatarID, forKey: .avatar_id)
            try values.encodeNil(forKey: .avatar_url)
        }
    }
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


struct Carousel: Decodable, Identifiable {
    let id: Int
    let title: String
    let type: String?
    let filter_value: String?
    let content_type: String?
    let enabled: Bool?
    let position: Int?
    let pages: String?
    let layout: String?
    var isHome: Bool { ((pages == nil || pages == "") ? "home" : pages!).split(separator: ",").contains { $0.trimmingCharacters(in: .whitespaces) == "home" } }
    struct Pick: Decodable { let id: CatalogID; let type: String? }
    var picks: [Pick]? { guard let data = filter_value?.data(using: .utf8) else { return nil }; return try? JSONDecoder().decode([Pick].self, from: data) }
    func liveChannels(from channels: [Channel]) -> [Channel] {
        let filter = (filter_value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if filter.isEmpty || filter.lowercased() == "all" { return channels }
        if filter.hasPrefix("[") {
            guard let picks else { return [] }
            var seen = Set<String>()
            return picks.compactMap { pick in
                guard seen.insert(pick.id.value).inserted else { return nil }
                return channels.first { String($0.id) == pick.id.value }
            }
        }
        return channels.filter { channel in
            let values = BrowsePresentation.categories(channel.category)
            return (values.isEmpty ? ["General"] : values).contains { $0.caseInsensitiveCompare(filter) == .orderedSame }
        }
    }
    static func automaticLiveRows(channels: [Channel], configured: [Carousel]) -> [Carousel] {
        let existing = Set(configured.filter {
            $0.type == "live_channels" && ($0.pages ?? "home").split(separator: ",").contains { $0.trimmingCharacters(in: .whitespaces) == "live" }
        }.map { ($0.filter_value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() })
        let categories = Set(channels.flatMap { channel -> [String] in
            let values = BrowsePresentation.categories(channel.category)
            return values.isEmpty ? ["General"] : values
        }).sorted()
        var usedIDs = Set(configured.map(\.id))
        return categories.filter { !existing.contains($0.lowercased()) }.map { category in
            // Stable local-only IDs: adding a category must not shift existing focus IDs.
            let hash = category.lowercased().utf8.reduce(UInt32(2166136261)) { ($0 ^ UInt32($1)) &* 16777619 }
            var id = -1_000_000_000 - Int(hash)
            while usedIDs.contains(id) { id -= 1 }
            usedIDs.insert(id)
            return Carousel(id: id, title: category, type: "live_channels", filter_value: category,
                            content_type: nil, enabled: true, position: nil, pages: "live", layout: "standard")
        }
    }
}
struct CatalogID: Decodable {
    let value: String
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { value = s } else { value = String(try c.decode(Int.self)) }
    }
}
extension MediaURL {
    static func playback(_ value: String?) -> URL? {
        guard let url = parse(value) else { return nil }
        // Web embed/details pages are not AVPlayer media resources.
        if url.host?.hasSuffix("archive.org") == true && (url.path.hasPrefix("/details/") || url.path.hasPrefix("/embed/")) { return nil }
        return url
    }
}

struct HomeHero: Decodable {
    let enabled: Bool?
    let image_url: String?
    let video_url: String?
    let title: String?
    let subtitle: String?
    let badge: String?
    let cta_type: String?
    let cta_label: String?
    let cta_value: String?

    var tabDestination: Int? {
        guard cta_type == "tab" else { return nil }
        return ["Home": 0, "Movies": 1, "Series": 2, "Streams": 3, "Podcasts": 4][cta_value ?? ""]
    }
}

struct PublicSetting: Decodable {
    let key: String
    let value: String?
}

enum HomeCatalogItem: Identifiable {
    case movie(Video)
    case show(Show)
    var id: String {
        switch self {
        case .movie(let movie): return "movie_\(movie.id)"
        case .show(let show): return "show_\(show.id)"
        }
    }
    var category: String? {
        switch self {
        case .movie(let movie): return movie.category
        case .show(let show): return show.category
        }
    }
    func matchesGenre(_ value: String?) -> Bool {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        guard !normalized.isEmpty else { return false }
        let tags: [String]
        switch self {
        case .movie(let movie): tags = movie.tags?.values ?? []
        case .show(let show): tags = show.tags?.values ?? []
        }
        return ([category ?? ""] + tags).contains {
            $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalized
        }
    }

}

enum HomeCatalog {
    static func items(videos: [Video], shows: [Show]) -> [HomeCatalogItem] {
        videos.sorted { $0.id < $1.id }.map(HomeCatalogItem.movie)
        + shows.sorted { $0.id < $1.id }.map(HomeCatalogItem.show)
    }
    static func featured(videos: [Video], shows: [Show]) -> HomeCatalogItem? {
        let movies = videos.sorted { $0.id < $1.id }
        let series = shows.sorted { $0.id < $1.id }
        if let movie = movies.first(where: { $0.featured == true }) { return .movie(movie) }
        if let show = series.first(where: { $0.featured == true }) { return .show(show) }
        return movies.first.map(HomeCatalogItem.movie) ?? series.first.map(HomeCatalogItem.show)
    }
    static func row(_ row: Carousel, videos: [Video], shows: [Show]) -> [HomeCatalogItem] {
        let all = items(videos: videos, shows: shows)
        var result: [HomeCatalogItem]
        switch row.type {
        case "handpicked":
            // Keep the owner's mixed movie/series order, including repeated numeric IDs across types.
            result = (row.picks ?? []).compactMap { pick in
                all.first { $0.id == "\(pick.type ?? "")_\(pick.id.value)" }
            }
        case "category": result = all.filter { $0.matchesGenre(row.filter_value) }
        case "trending": result = Array(all.reversed())
        case "continue", "recommended", "podcast", "creator_streams", "live_channels": result = []
        default: result = all
        }
        return result.filter { item in
            switch item {
            case .movie: return row.content_type != "shows"
            case .show: return row.content_type != "shorts"
            }
        }
    }
}

struct Podcast: Identifiable, Decodable, Hashable {
    let id: Int
    let title: String
    let host: String?
    let description: String?
    let artwork_url: String?
    let enabled: Bool?
    var artworkURL: URL? { MediaURL.parse(artwork_url) }
}

struct PodcastEpisode: Identifiable, Decodable {
    let id: Int
    let podcast_id: Int
    let episode_number: Int?
    let title: String?
    let description: String?
    let audio_url: String?
    let duration: String?
    let thumbnail: String?
    let published_at: String?
    var audioURL: URL? { MediaURL.playback(audio_url) }
    var thumbURL: URL? { MediaURL.parse(thumbnail) }
    var displayTitle: String { title ?? "Episode \(episode_number ?? 0)" }
}

// Admin-curated two-channel combinations, shared with the browser catalog.
struct MultiviewPackage: Identifiable, Decodable {
    let two_screen_layout: String?
    let id: String
    let title: String
    let description: String?
    let left_channel_id: Int
    let right_channel_id: Int
    let third_channel_id: Int?
    let fourth_channel_id: Int?
    let enabled: Bool?

    func pair(in channels: [Channel], host: String, feeds: [PublicFeed]) -> [Channel] {
        guard (third_channel_id == nil) == (fourth_channel_id == nil) else { return [] }
        let ids = [left_channel_id, right_channel_id] + [third_channel_id, fourth_channel_id].compactMap { $0 }
        let pair = ids.compactMap { id in
            // Preserve the saved layout even when one stream is unavailable.
            // The player can show a recoverable error in that tile.
            channels.first { $0.id == id && $0.is_premium != true }
        }
        return pair.count == ids.count && Set(ids).count == ids.count ? pair : []
    }
    static func items(for row: Carousel, packages: [MultiviewPackage]) -> [MultiviewPackage] {
        let available = packages.filter { $0.enabled != false }
        guard let value = row.filter_value, !value.isEmpty else { return available }
        guard let picks = row.picks else { return [] }
        return picks.compactMap { pick in available.first { $0.id == pick.id.value } }
    }
}

struct PlaybackIdentity: Hashable {
    let id: String
    let type: String
}
struct WatchProgress: Decodable, Identifiable {
    let content_id: String
    let content_type: String
    let progress_seconds: Double?
    let duration_seconds: Double?
    let completed: Bool?
    var id: String { content_type + ":" + content_id }
    var identity: PlaybackIdentity { PlaybackIdentity(id: content_id, type: content_type) }
    var fraction: Double {
        guard let position = progress_seconds, let duration = duration_seconds,
              position.isFinite, duration.isFinite, duration > 0 else { return 0 }
        return completed == true ? 1 : min(1, max(0, position / duration))
    }
    var canResume: Bool {
        let position = progress_seconds ?? 0, duration = duration_seconds ?? 0
        return completed != true && position.isFinite && duration.isFinite && position > 10 && duration > 0 && position / duration < 0.9
    }
}
struct ContinueWatchingItem: Identifiable {
    let progress: WatchProgress
    let title: String
    let artwork: URL?
    let url: URL
    var id: String { progress.id }
}


struct SavedListItem: Decodable, Identifiable {
    let content_id: String
    let content_type: String
    var type: String { content_type == "short" ? "movie" : content_type }
    var id: String { "\(type):\(content_id)" }
}

/// Never advance backwards or repeat an episode with duplicate numbering.
enum SeriesPlayback {
    static func before(_ a: Episode, _ b: Episode) -> Bool {
        if (a.season ?? 1) != (b.season ?? 1) { return (a.season ?? 1) < (b.season ?? 1) }
        if (a.episode_number ?? 0) != (b.episode_number ?? 0) { return (a.episode_number ?? 0) < (b.episode_number ?? 0) }
        return a.id < b.id
    }
    static func next(after current: Episode, in episodes: [Episode]) -> Episode? {
        episodes.filter { candidate in
            candidate.videoURL != nil && candidate.id != current.id &&
            ((candidate.season ?? 1) > (current.season ?? 1) ||
             ((candidate.season ?? 1) == (current.season ?? 1) && (candidate.episode_number ?? 0) > (current.episode_number ?? 0)))
        }.sorted(by: before).first
    }
    /// What the series Play button opens, across every season: the furthest unfinished
    /// episode, else the one after the last finished episode, else the first playable
    /// one (so a finished series starts again).
    static func nextUp(in episodes: [Episode], progress: [String: WatchProgress]) -> Episode? {
        let ordered = episodes.filter { $0.videoURL != nil }.sorted(by: before)
        if let resumable = ordered.last(where: { progress[String($0.id)]?.canResume == true }) { return resumable }
        if let finished = ordered.last(where: { progress[String($0.id)]?.completed == true }) {
            return next(after: finished, in: ordered) ?? ordered.first
        }
        return ordered.first
    }
}

/// Shared catalog search policy: all terms must match; title matches rank first.
enum CatalogSearch {
    static func normalized(_ value: String) -> String {
        value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: " ")
    }
    static func score(query: String, title: String, category: String?, tags: [String], description: String?) -> Int? {
        let q = normalized(String(query.prefix(256)))
        guard !q.isEmpty else { return nil }
        let t = normalized(title), c = normalized(category ?? ""), tag = tags.map(normalized).joined(separator: " "), d = normalized(description ?? "")
        // Descriptions only count for terms of three or more letters, so "th" no longer matches everything.
        let fields = [t, c, tag].joined(separator: " ")
        guard q.split(separator: " ").allSatisfy({ term in fields.contains(term) || (term.count >= 3 && d.contains(term)) }) else { return nil }
        if t == q { return 500 }
        if t.hasPrefix(q) { return 400 }
        if t.contains(q) { return 300 }
        if c == q || tags.contains(where: { normalized($0) == q }) { return 200 }
        if c.contains(q) || tag.contains(q) { return 100 }
        return 10
    }
}

/// A replaced source can have a different length than its saved progress.
enum ResumePosition {
    static func target(saved: Double, duration: Double) -> Double? {
        guard saved.isFinite, duration.isFinite, saved >= 0, duration > 0 else { return nil }
        return min(saved, max(0, duration - 1))
    }
}

/// "More like this" scoring, kept in step with the web's lib/recommendations.js
/// (category, shared tags, year proximity, matching rating).
enum RelatedTitles {
    static func tags(_ value: CatalogTags?) -> [String] {
        (value?.values ?? []).map { $0.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }
    static func similarity(_ source: Video, _ candidate: Video) -> Int {
        var points = 0
        if let a = source.category?.lowercased(), let b = candidate.category?.lowercased(), !a.isEmpty, a == b { points += 40 }
        points += Set(tags(source.tags)).intersection(tags(candidate.tags)).count * 15
        if let a = source.year, let b = candidate.year {
            switch abs(a - b) {
            case ...5: points += 10
            case ...15: points += 6
            case ...30: points += 2
            default: break
            }
        }
        if let a = source.rating, let b = candidate.rating, !a.isEmpty, a == b { points += 8 }
        return points
    }
    static func rank(_ source: Video, in pool: [Video], limit: Int = 12) -> [Video] {
        var scored: [(video: Video, points: Int)] = []
        for candidate in pool where candidate.id != source.id {
            let points = similarity(source, candidate)
            if points > 0 { scored.append((candidate, points)) }
        }
        scored.sort { lhs, rhs in lhs.points != rhs.points ? lhs.points > rhs.points : lhs.video.title < rhs.video.title }
        return scored.prefix(limit).map { $0.video }
    }
}

/// When the native Up Next proposal appears: the last 30 seconds (or final tenth of a
/// short item), never for clips under a minute or while the length is still unknown.
enum UpNextTiming {
    static func transitionTime(duration: Double) -> Double? {
        guard duration.isFinite, duration >= 60 else { return nil }
        return duration - min(30, duration * 0.1)
    }
}

/// Up/Down channel surfing: the next playable channel in the visible order, wrapping around.
enum LiveSurf {
    static func neighbor(of id: Int, in channels: [Channel], step: Int, playable: (Channel) -> Bool) -> Channel? {
        guard !channels.isEmpty, step != 0 else { return nil }
        let start = channels.firstIndex { $0.id == id } ?? (step > 0 ? channels.count - 1 : 0)
        for offset in 1...channels.count {
            let index = ((start + offset * step) % channels.count + channels.count) % channels.count
            let candidate = channels[index]
            if candidate.id != id, playable(candidate) { return candidate }
        }
        return nil
    }
}

/// Now Playing details for the Siri Remote info panel, plus the artwork screen for audio.
struct PlaybackMetadata {
    var title: String
    var subtitle: String? = nil
    var description: String? = nil
    var artwork: URL? = nil
    var isLive = false
    var audioOnly = false
}

/// Podcast episodes: newest first, and nothing that is scheduled for the future.
enum PodcastSchedule {
    static func visible(_ episodes: [PodcastEpisode], now: Date = Date()) -> [PodcastEpisode] {
        episodes.filter { episode in
            guard let published = GuideEntry.date(episode.published_at) else { return true }
            return published <= now
        }.sorted { a, b in
            switch (GuideEntry.date(a.published_at), GuideEntry.date(b.published_at)) {
            case let (x?, y?) where x != y: return x > y
            case (nil, .some): return false
            case (.some, nil): return true
            default:
                if (a.episode_number ?? 0) != (b.episode_number ?? 0) { return (a.episode_number ?? 0) > (b.episode_number ?? 0) }
                return a.id > b.id
            }
        }
    }
}
