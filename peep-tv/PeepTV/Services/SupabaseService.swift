import Foundation
import Combine

@MainActor
final class SupabaseService: ObservableObject {
    static let shared = SupabaseService()
    let configuration: AppConfiguration?
    @Published private(set) var configurationError: String?
    @Published private(set) var session: UserSession?
    @Published var activeProfile: Profile?
    @Published private(set) var profiles: [Profile] = []
    @Published private(set) var isRestoring = true
    private var refreshTask: Task<UserSession, Error>?
    private let decoder = JSONDecoder()

    init() {
        do { configuration = try AppConfiguration.load() }
        catch { configuration = nil; configurationError = error.localizedDescription }
    }

    func restoreSession() async {
        defer { isRestoring = false }
        guard configuration != nil else { return }
        session = SessionStore.read()
        guard session != nil else { return }
        do {
            try await refreshIfNeeded()
            profiles = try await fetchProfiles()
            if let id = UserDefaults.standard.string(forKey: "peep_tv_profile_id") {
                activeProfile = profiles.first { $0.id == id }
            }
        } catch {
            // A transient network failure must not erase saved credentials.
        }
    }

    private func auth(grant: String, body: [String: String]) async throws -> UserSession {
        guard let config = configuration else { throw AppError.networkError(configurationError ?? "Missing configuration.") }
        var components = URLComponents(url: config.baseURL.appendingPathComponent("auth/v1/token"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "grant_type", value: grant)]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.timeoutInterval = 25
        request.allHTTPHeaderFields = ["apikey": config.anonKey, "Content-Type": "application/json"]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AppError.networkError("No response from the server.") }
        if [400, 401, 403].contains(http.statusCode) {
            throw grant == "password" ? AppError.invalidCredentials : AppError.noSession
        }
        guard (200..<300).contains(http.statusCode) else {
            throw AppError.networkError("Sign in is unavailable (\(http.statusCode)). Please try again.")
        }
        return try decoder.decode(AuthResponse.self, from: data).session
    }

    func signIn(email: String, password: String) async throws {
        let result = try await auth(grant: "password", body: ["email": email.trimmingCharacters(in: .whitespacesAndNewlines), "password": password])
        try SessionStore.write(result)
        session = result
        activeProfile = nil
        profiles = (try? await fetchProfiles()) ?? []
    }

    func signOut() {
        refreshTask?.cancel()
        refreshTask = nil
        session = nil
        activeProfile = nil
        profiles = []
        SessionStore.clear()
        for key in ["peep_tv_token", "peep_tv_uid", "peep_tv_profile_id"] {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }

    func selectProfile(_ profile: Profile) {
        activeProfile = profile
        UserDefaults.standard.set(profile.id, forKey: "peep_tv_profile_id")
    }

    private func refreshIfNeeded() async throws {
        guard let old = session, old.expiresAt.timeIntervalSinceNow < 60 else { return }
        if let refreshTask { _ = try await refreshTask.value; return }
        let task = Task { try await self.auth(grant: "refresh_token", body: ["refresh_token": old.refreshToken]) }
        refreshTask = task
        defer { refreshTask = nil }
        do {
            let updated = try await task.value
            try Task.checkCancellation()
            guard session?.refreshToken == old.refreshToken else { return }
            try SessionStore.write(updated)
            session = updated
        } catch AppError.noSession {
            signOut()
            throw AppError.noSession
        }
    }

    func get<T: Decodable>(_ table: String, query: [String: String] = [:]) async throws -> T {
        guard let config = configuration else { throw AppError.networkError(configurationError ?? "Missing configuration.") }
        try await refreshIfNeeded()
        var components = URLComponents(url: config.baseURL.appendingPathComponent("rest/v1/\(table)"), resolvingAgainstBaseURL: false)!
        components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        var request = URLRequest(url: components.url!)
        request.timeoutInterval = 25
        request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
        // Publishable keys are not JWTs. Legacy anon keys can also be used as bearer tokens.
        if let session {
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        } else if config.anonKey.hasPrefix("eyJ") {
            request.setValue("Bearer \(config.anonKey)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw AppError.networkError("Couldn't load \(table). Please try again.")
        }
        return try decoder.decode(T.self, from: data)
    }

    private func catalogQuery(order: String) -> [String: String] {
        var query = ["select": "*", "order": order]
        // TV exposes the public catalog. Preview account tiers remain on the web.
        if configuration?.isDevelopment != true { query["or"] = "(visibility_tier.eq.production,visibility_tier.is.null)" }
        return query
    }

    private func all<T: Decodable>(_ table: String, query: [String: String]) async throws -> [T] {
        var result: [T] = []
        var offset = 0
        while true {
            try Task.checkCancellation()
            var pageQuery = query
            pageQuery["limit"] = "200"
            pageQuery["offset"] = String(offset)
            let page: [T] = try await get(table, query: pageQuery)
            result.append(contentsOf: page)
            if page.count < 200 { return result }
            offset += page.count
        }
    }

    func fetchVideos() async throws -> [Video] {
        let rows: [Video] = try await all("videos", query: catalogQuery(order: "id.desc"))
        return rows.filter { $0.is_premium != true }
    }
    func fetchShows() async throws -> [Show] {
        let rows: [Show] = try await all("shows", query: catalogQuery(order: "id.desc"))
        return rows.filter { $0.is_premium != true }
    }
    func fetchEpisodes(showId: Int) async throws -> [Episode] {
        let rows: [Episode] = try await all("episodes", query: ["show_id": "eq.\(showId)", "order": "season.asc,episode_number.asc,id.asc"])
        return rows.filter { $0.is_premium != true && ($0.status == nil || $0.status == "published" || $0.status == "approved") }
    }
    func fetchChannels() async throws -> [Channel] {
        var query = catalogQuery(order: "sort_order.asc,id.asc")
        query["is_active"] = "eq.true"
        let rows: [Channel] = try await all("channels", query: query)
        return rows.filter { $0.is_premium != true }
    }
    func fetchGuide() async throws -> [GuideEntry] {
        let formatter = ISO8601DateFormatter()
        let now = Date()
        return try await all("epg_entries", query: ["end_time": "gt.\(formatter.string(from: now))", "start_time": "lt.\(formatter.string(from: now.addingTimeInterval(6 * 3600)))", "order": "start_time.asc,id.asc"])
    }
    func fetchFeeds() async throws -> [PublicFeed] {
        try await all("public_live_feeds", query: ["select": "id,cloudflare_hls_url", "order": "id.asc"])
    }
    func reloadProfiles() async throws {
        profiles = try await fetchProfiles()
    }
    func fetchProfiles() async throws -> [Profile] {
        guard let session else { return [] }
        return try await get("viewer_profiles", query: ["user_id": "eq.\(session.userId)", "order": "created_at.asc"])
    }
}
