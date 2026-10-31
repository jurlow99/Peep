import Foundation
import Combine
import OSLog

@MainActor
final class SupabaseService: ObservableObject {
    static let shared = SupabaseService()
    let configuration: AppConfiguration?
    @Published private(set) var configurationError: String?
    @Published private(set) var session: UserSession?
    @Published private(set) var accountProfile: AccountProfile?
    @Published private(set) var watchProgressRevision = 0
    @Published private(set) var savedItems: [SavedListItem] = []
    @Published private(set) var savingListKeys: Set<String> = []
    private var savedListOwner: String?
    private var savedListRevision = 0
    @Published var activeProfile: Profile?
    @Published private(set) var profiles: [Profile] = []
    @Published private(set) var isRestoring = true
    private var refreshTask: Task<Void, Error>?
    @Published var needsReauthentication = false
    private let loadLogger = Logger(subsystem: "tv.watchpeep", category: "CatalogLoading")
    private var catalogCache: [String: (data: Data, expires: Date)] = [:]
    private var catalogRequests: [String: (id: UUID, task: Task<Data, Error>)] = [:]
    private var catalogGeneration = 0
    func invalidateCatalogCache() {
        catalogGeneration += 1
        catalogCache.removeAll()
        catalogRequests.removeAll()
    }
    private let decoder = JSONDecoder()
    private var persistSession: (UserSession) throws -> Void = SessionStore.write
    private var send: (URLRequest) async throws -> (Data, URLResponse) = { try await URLSession.shared.data(for: $0) }

    // Isolated transport for contract tests; normal app initialization still loads its local configuration.
    init(configuration: AppConfiguration, session: UserSession?, persistSession: @escaping (UserSession) throws -> Void = SessionStore.write, send: @escaping (URLRequest) async throws -> (Data, URLResponse)) {
        self.configuration = configuration
        self.persistSession = persistSession
        self.session = session
        self.send = send
        self.isRestoring = false
    }

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
            // The launch picker loads viewers; do not fetch them twice.
            // Remember the previous viewer for initial focus, but ask who is
            // watching on each cold launch. Foregrounding does not call this.
            activeProfile = nil
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
        let (data, response) = try await send(request)
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
        accountProfile = nil
        needsReauthentication = false
        activeProfile = nil
        profiles = (try? await fetchProfiles()) ?? []
    }

    func signOut() {
        invalidateCatalogCache()
        refreshTask?.cancel()
        refreshTask = nil
        session = nil
        accountProfile = nil
        savedItems = []
        savedListOwner = nil
        savingListKeys = []
        savedListRevision += 1
        activeProfile = nil
        profiles = []
        SessionStore.clear()
        for key in ["peep_tv_token", "peep_tv_uid", "peep_tv_profile_id"] {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }

    func selectProfile(_ profile: Profile) {
        guard let userID = session?.userId, profile.user_id == userID, profiles.contains(where: { $0.id == profile.id }) else { return }
        activeProfile = profile
        UserDefaults.standard.set(profile.id, forKey: "peep_tv_profile_id")
    }

    private func refreshIfNeeded(force: Bool = false) async throws {
        if let refreshTask { try await refreshTask.value; return }
        guard let old = session, force || old.expiresAt.timeIntervalSinceNow < 60 else { return }
        let task = Task<Void, Error> {
            do {
                let updated = try await self.auth(grant: "refresh_token", body: ["refresh_token": old.refreshToken])
                try Task.checkCancellation()
                guard self.session?.refreshToken == old.refreshToken else { throw AppError.noSession }
                guard updated.userId == old.userId else { throw AppError.noSession }
                try self.persistSession(updated)
                self.session = updated
            } catch AppError.noSession {
                // Never clear a different account that signed in while renewal was pending.
                if self.session?.refreshToken == old.refreshToken {
                    self.signOut()
                    self.needsReauthentication = true
                }
                throw AppError.noSession
            }
        }
        refreshTask = task
        defer { refreshTask = nil }
        try await task.value
    }

    /// Retry once after authentication failure, including tokens revoked before local expiry.
    /// Network errors and entitlement denials never clear the viewer's session.
    private func sendPlayback(_ request: URLRequest, userID: String) async throws -> (Data, URLResponse) {
        let token = session?.accessToken
        let result = try await send(request)
        guard session?.userId == userID else { throw AppError.noSession }
        guard (result.1 as? HTTPURLResponse)?.statusCode == 401 else { return result }
        if session?.accessToken == token { try await refreshIfNeeded(force: true) }
        guard let session, session.userId == userID else { throw AppError.noSession }
        var retry = request
        retry.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        let renewed = try await send(retry)
        guard self.session?.userId == userID else { throw AppError.noSession }
        if (renewed.1 as? HTTPURLResponse)?.statusCode == 401 {
            guard self.session?.accessToken == session.accessToken else { throw AppError.noSession }
            signOut()
            needsReauthentication = true
            throw AppError.noSession
        }
        return renewed
    }

    func get<T: Decodable>(_ table: String, query: [String: String] = [:], timeout: TimeInterval = 25) async throws -> T {
        guard let config = configuration else { throw AppError.networkError(configurationError ?? "Missing configuration.") }
        try await refreshIfNeeded()
        var components = URLComponents(url: config.baseURL.appendingPathComponent("rest/v1/\(table)"), resolvingAgainstBaseURL: false)!
        components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        var request = URLRequest(url: components.url!)
        request.timeoutInterval = timeout
        request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
        // Publishable keys are not JWTs. Legacy anon keys can also be used as bearer tokens.
        if let session {
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        } else if config.anonKey.hasPrefix("eyJ") {
            request.setValue("Bearer \(config.anonKey)", forHTTPHeaderField: "Authorization")
        }
        let owner = session?.userId
        // Only short-lived catalog data is reusable. Progress, permissions,
        // signed playback and channel blackout checks always hit the server.
        // Episodes are public catalog rows too. Caching them briefly prevents
        // Home and a just-opened series page from issuing duplicate requests.
        let cacheable = ["videos", "shows", "episodes", "podcasts", "carousels", "multiview_packages", "public_live_feeds"].contains(table)
        let key = (session?.accessToken ?? "guest") + ":" + request.url!.absoluteString
        if cacheable, let cached = catalogCache[key], cached.expires > Date() {
            return try decoder.decode(T.self, from: cached.data)
        }
        if cacheable, let pending = catalogRequests[key] {
            let data = try await pending.task.value
            guard session?.userId == owner else { throw AppError.noSession }
            try Task.checkCancellation()
            return try decoder.decode(T.self, from: data)
        }
        let generation = catalogGeneration
        let id = UUID()
        let started = Date()
        let transport = send
        let task = Task<Data, Error> {
            let (data, response) = try await transport(request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw AppError.networkError("Couldn't load \(table). Please try again.")
            }
            return data
        }
        if cacheable { catalogRequests[key] = (id, task) }
        defer {
            if catalogRequests[key]?.id == id { catalogRequests.removeValue(forKey: key) }
            loadLogger.info("REST \(table, privacy: .public): \(Int(Date().timeIntervalSince(started) * 1000)) ms")
        }
        let data = try await task.value
        guard session?.userId == owner else { throw AppError.noSession }
        try Task.checkCancellation()
        let value = try decoder.decode(T.self, from: data)
        if cacheable, generation == catalogGeneration {
            if catalogCache.count >= 64 { catalogCache.removeAll() }
            catalogCache[key] = (data, Date().addingTimeInterval(15))
        }
        return value
    }

    /// Private VOD URL references are durable catalog values. Only a temporary,
    /// RLS-authorized signed URL is passed to AVPlayer; never persist that URL.
    func resolveVODPlayback(_ url: URL, expiresIn: Int = 21600) async throws -> URL {
        guard let config = configuration else { throw AppError.noSession }
        guard url.scheme == config.baseURL.scheme, url.host == config.baseURL.host,
              url.port == config.baseURL.port else { return url }
        let r2Prefix = "/functions/v1/r2-vod/play/"
        if url.path.hasPrefix(r2Prefix) {
            let id = String(url.path.dropFirst(r2Prefix.count))
            guard UUID(uuidString: id) != nil else { throw AppError.networkError("Invalid R2 playback reference.") }
            try await refreshIfNeeded()
            guard let session else { throw AppError.networkError("Sign in to watch this title.") }
            let userID = session.userId
            var request = URLRequest(url: config.baseURL.appendingPathComponent("functions/v1/r2-vod"))
            request.httpMethod = "POST"; request.timeoutInterval = 25
            request.allHTTPHeaderFields = ["apikey": config.anonKey, "Authorization": "Bearer \(session.accessToken)", "Content-Type": "application/json"]
            request.httpBody = try JSONSerialization.data(withJSONObject: ["action": "playback", "id": id, "expiresIn": expiresIn])
            let (data, response) = try await sendPlayback(request, userID: userID)
            guard self.session?.userId == userID else { throw AppError.noSession }
            guard let http = response as? HTTPURLResponse else {
                throw AppError.networkError("Couldn't prepare this video. Please try again.")
            }
            if http.statusCode == 401 {
                throw AppError.networkError("Please sign in again to watch this title.")
            }
            if http.statusCode == 403 {
                throw AppError.networkError("Your account does not have access to this video.")
            }
            guard (200..<300).contains(http.statusCode) else {
                throw AppError.networkError("Couldn't prepare this video. Please try again.")
            }
            struct R2Playback: Decodable { let signedURL: String }
            let payload = try decoder.decode(R2Playback.self, from: data)
            guard let signed = URL(string: payload.signedURL), signed.scheme == "https",
                  signed.host?.hasSuffix(".r2.cloudflarestorage.com") == true,
                  URLComponents(url: signed, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name == "X-Amz-Signature" && !($0.value ?? "").isEmpty }) == true else {
                throw AppError.networkError("Invalid R2 playback response.")
            }
            return signed
        }
        let bucket = ["vod-playback", "vod-sources"].first { url.path.hasPrefix("/storage/v1/object/authenticated/" + $0 + "/") }
        guard let bucket else { return url }
        let prefix = "/storage/v1/object/authenticated/" + bucket + "/"
        try await refreshIfNeeded()
        guard let session else { throw AppError.networkError("Sign in to watch this title.") }
        let userID = session.userId
        let path = String(url.path.dropFirst(prefix.count))
        guard !path.isEmpty, !path.split(separator: "/").contains("..") else {
            throw AppError.networkError("Invalid playback reference.")
        }
        var request = URLRequest(url: config.baseURL.appendingPathComponent("storage/v1/object/sign/" + bucket).appendingPathComponent(path))
        request.httpMethod = "POST"; request.timeoutInterval = 25
        request.allHTTPHeaderFields = ["apikey": config.anonKey, "Authorization": "Bearer \(session.accessToken)", "Content-Type": "application/json"]
        request.httpBody = try JSONSerialization.data(withJSONObject: ["expiresIn": expiresIn])
        let (data, response) = try await sendPlayback(request, userID: userID)
        guard self.session?.userId == userID, let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw AppError.networkError("Your account does not have access to this title, or its video is unavailable.")
        }
        struct SignedPlayback: Decodable { let signedURL: String }
        let signed = try decoder.decode(SignedPlayback.self, from: data)
        let raw = signed.signedURL
        let value = raw.hasPrefix("/object/sign/" + bucket + "/")
            ? config.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/storage/v1" + raw
            : raw
        guard let signedURL = URL(string: value), signedURL.scheme == config.baseURL.scheme,
              signedURL.host == config.baseURL.host, signedURL.port == config.baseURL.port,
              signedURL.path.hasPrefix("/storage/v1/object/sign/" + bucket + "/"),
              URLComponents(url: signedURL, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name == "token" && !($0.value ?? "").isEmpty }) == true else {
            throw AppError.networkError("Invalid signed playback response.")
        }
        return signedURL
    }

    // Shared REST mutation transport; credentials remain scoped to the current account.
    func post(_ path: String, body: [String: Any], query: [String: String] = [:], prefer: String? = nil, method: String = "POST", expectedUserID: String? = nil) async throws {
        try await refreshIfNeeded()
        if let expectedUserID, session?.userId != expectedUserID { throw AppError.noSession }
        guard let config = configuration else { throw AppError.noSession }
        let userID = session?.userId
        var components = URLComponents(url: config.baseURL.appendingPathComponent("rest/v1/\(path)"), resolvingAgainstBaseURL: false)!
        components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method; request.timeoutInterval = 15
        request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let session { request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization") }
        else if config.anonKey.hasPrefix("eyJ") { request.setValue("Bearer \(config.anonKey)", forHTTPHeaderField: "Authorization") }
        if let prefer { request.setValue(prefer, forHTTPHeaderField: "Prefer") }
        if method != "DELETE" { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (_, response) = try await send(request)
        guard session?.userId == userID, let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw AppError.networkError("Changes couldn't be saved. Please try again.")
        }
    }

    func isSaved(_ id: String, type: String) -> Bool {
        guard savedListOwner == session?.userId, session != nil else { return false }
        return savedItems.contains { $0.content_id == id && $0.type == type }
    }

    func refreshSavedList() async throws {
        guard let userID = session?.userId else {
            savedItems = []; savedListOwner = nil
            return
        }
        if savedListOwner != userID { savedItems = []; savedListOwner = userID }
        let revision = savedListRevision
        let rows: [SavedListItem] = try await all("user_list", query: ["user_id": "eq.\(userID)", "select": "content_id,content_type", "order": "added_at.desc,id.desc"])
        guard session?.userId == userID, revision == savedListRevision else { return }
        // Older web saves used short; present a single canonical movie entry.
        var seen = Set<String>()
        savedItems = rows.filter { seen.insert($0.id).inserted }
    }

    func toggleSaved(_ id: String, type: String, desired: Bool? = nil) async throws {
        guard let userID = session?.userId else { throw AppError.noSession }
        guard ["movie", "show", "channel"].contains(type) else { throw AppError.networkError("This item cannot be saved yet.") }
        let key = "\(type):\(id)"
        guard !savingListKeys.contains(key) else { return }
        savingListKeys.insert(key)
        defer { if session?.userId == userID { savingListKeys.remove(key) } }
        // Resolve the server state first, so a save made on web isn't accidentally removed.
        try await refreshSavedList()
        guard session?.userId == userID else { throw AppError.noSession }
        let currentlySaved = isSaved(id, type: type)
        let shouldSave = desired ?? !currentlySaved
        guard shouldSave != currentlySaved else { return }
        let removing = !shouldSave
        if removing {
            try await post("user_list", body: [:], query: ["user_id": "eq.\(userID)", "content_id": "eq.\(id)",
                "content_type": type == "movie" ? "in.(movie,short)" : "eq.\(type)"], method: "DELETE", expectedUserID: userID)
        } else {
            try await post("user_list", body: ["user_id": userID, "content_id": id, "content_type": type],
                           query: ["on_conflict": "user_id,content_id,content_type"], prefer: "resolution=ignore-duplicates,return=minimal", expectedUserID: userID)
        }
        guard session?.userId == userID else { return }
        savedListRevision += 1
        if removing { savedItems.removeAll { $0.content_id == id && $0.type == type } }
        else { savedItems.insert(SavedListItem(content_id: id, content_type: type), at: 0) }
    }

    func fetchWatchProgress() async throws -> [WatchProgress] {
        guard let userID = session?.userId else { return [] }
        let rows: [WatchProgress] = try await get("watch_progress", query: ["user_id": "eq.\(userID)", "completed": "eq.false", "order": "last_watched_at.desc", "limit": "100"])
        guard session?.userId == userID else { return [] }
        return rows
    }
    func removeWatchProgress(identity: PlaybackIdentity) async throws {
        guard let userID = session?.userId else { throw AppError.noSession }
        guard ["movie", "episode"].contains(identity.type), !identity.id.isEmpty else { throw AppError.networkError("This title cannot be removed.") }
        try await post("watch_progress", body: [:], query: ["user_id": "eq.\(userID)", "content_id": "eq.\(identity.id)", "content_type": "eq.\(identity.type)"], method: "DELETE", expectedUserID: userID)
        watchProgressRevision += 1
    }
    func fetchEpisodeProgress(ids: [Int]) async throws -> [WatchProgress] {
        guard let userID = session?.userId, !ids.isEmpty else { return [] }
        var result: [WatchProgress] = []
        for start in stride(from: 0, to: ids.count, by: 100) {
            let chunk = ids[start..<min(start + 100, ids.count)]
            let rows: [WatchProgress] = try await get("watch_progress", query: ["user_id": "eq.\(userID)", "content_type": "eq.episode", "content_id": "in.(\(chunk.map(String.init).joined(separator: ",")))"])
            guard session?.userId == userID else { return [] }
            result += rows
        }
        return result
    }
    func fetchWatchPosition(identity: PlaybackIdentity) async throws -> WatchProgress? {
        guard let userID = session?.userId else { return nil }
        let rows: [WatchProgress] = try await get("watch_progress", query: ["user_id": "eq.\(userID)", "content_id": "eq.\(identity.id)", "content_type": "eq.\(identity.type)", "limit": "1"], timeout: 5)
        guard session?.userId == userID else { return nil }
        return rows.first
    }
    func saveWatchProgress(identity: PlaybackIdentity, position: Double, duration: Double, userID: String) async throws {
        guard session?.userId == userID, position.isFinite, duration.isFinite, position >= 5, duration > 0 else { return }
        try await post("watch_progress", body: ["user_id": userID, "content_id": identity.id, "content_type": identity.type,
            "progress_seconds": min(position, duration), "duration_seconds": duration,
            "completed": position / duration >= 0.9, "last_watched_at": ISO8601DateFormatter().string(from: Date())],
            query: ["on_conflict": "user_id,content_id,content_type"], prefer: "resolution=merge-duplicates,return=minimal", expectedUserID: userID)
        watchProgressRevision += 1
    }
    func fetchContinueEpisodes(ids: [Int]) async throws -> [Episode] {
        guard !ids.isEmpty else { return [] }
        let rows: [Episode] = try await get("episodes", query: ["id": "in.(\(ids.map(String.init).joined(separator: ",")))"])
        return rows.filter { $0.is_premium != true && ($0.status == nil || $0.status == "published" || $0.status == "approved") }
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

    /// Warm only reusable catalog reads while the intro/profile picker is visible.
    /// No playback signatures, progress, or blackout decisions are prefetched.
    func warmLaunchCatalog() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { _ = try? await self.fetchVideos() }
            group.addTask { _ = try? await self.fetchShows() }
            group.addTask { _ = try? await self.fetchCarousels() }
            group.addTask { _ = try? await self.fetchPodcasts() }
            group.addTask { _ = try? await self.fetchMultiviewPackages() }
            group.addTask { _ = try? await self.fetchFeeds() }
        }
    }

    func fetchHomeHero() async throws -> HomeHero? {
        let rows: [PublicSetting] = try await get("app_settings", query: ["select": "key,value", "key": "eq.home_hero"])
        guard let value = rows.first?.value, let data = value.data(using: .utf8) else { return nil }
        // A malformed optional promo must not take the catalog offline.
        return try? decoder.decode(HomeHero.self, from: data)
    }

    func fetchMultiviewPackages() async throws -> [MultiviewPackage] {
        var query = catalogQuery(order: "position.asc,created_at.asc")
        query["enabled"] = "eq.true"
        return try await all("multiview_packages", query: query)
    }

    func fetchCarousels() async throws -> [Carousel] {
        var query = catalogQuery(order: "position.asc,id.asc")
        query["enabled"] = "eq.true"
        return try await all("carousels", query: query)
    }

    func fetchVideos() async throws -> [Video] {
        let rows: [Video] = try await all("videos", query: catalogQuery(order: "id.desc"))
        return rows.filter { $0.is_premium != true }
    }
    func fetchPodcasts() async throws -> [Podcast] {
        let rows: [Podcast] = try await all("podcasts", query: catalogQuery(order: "id.asc"))
        return rows.filter { $0.enabled != false }
    }
    func fetchPodcastEpisodes(podcastID: Int) async throws -> [PodcastEpisode] {
        PodcastSchedule.visible(try await all("podcast_episodes", query: ["podcast_id": "eq.\(podcastID)", "order": "published_at.desc.nullslast,episode_number.desc,id.desc"]))
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
    func fetchPredictionEvents() async throws -> [PredictionEvent] {
        try await all("prediction_events", query: catalogQuery(order: "starts_at.asc.nullslast,id.asc"))
    }
    func fetchPredictionMarkets(eventID: Int? = nil) async throws -> [PredictionMarket] {
        var query = ["select": "*,market_options(*)", "order": "id.desc"]
        if let eventID { query["event_id"] = "eq.\(eventID)" }
        return try await all("prediction_markets", query: query)
    }
    func fetchChannel(id: Int) async throws -> Channel? {
        let rows: [Channel] = try await all("channels", query: ["id": "eq.\(id)", "limit": "1"])
        return rows.first
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

    func fetchAccountProfile() async throws -> AccountProfile {
        guard let userID = session?.userId else { throw AppError.noSession }
        let rows: [AccountProfile] = try await get("profiles", query: ["id": "eq.\(userID)", "select": "id,email,username,full_name,avatar_id,avatar_url"])
        guard session?.userId == userID else { throw AppError.noSession }
        guard let profile = rows.first, profile.id == userID else {
            throw AppError.networkError("Your profile is not available yet. Please try again.")
        }
        accountProfile = profile
        return profile
    }

    func updateAccountProfile(name: String, avatarID: String?) async throws -> AccountProfile {
        let update = try AccountProfileUpdate(name: name, avatarID: avatarID)
        try await refreshIfNeeded()
        guard let config = configuration, let current = session else { throw AppError.noSession }
        var url = URLComponents(url: config.baseURL.appendingPathComponent("rest/v1/profiles"), resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "id", value: "eq.\(current.userId)"), URLQueryItem(name: "select", value: "id,email,username,full_name,avatar_id,avatar_url")]
        var request = URLRequest(url: url.url!)
        request.httpMethod = "PATCH"
        request.timeoutInterval = 25
        request.allHTTPHeaderFields = ["apikey": config.anonKey, "Authorization": "Bearer \(current.accessToken)", "Content-Type": "application/json", "Prefer": "return=representation"]
        request.httpBody = try JSONEncoder().encode(update)
        let (data, response) = try await send(request)
        guard session?.userId == current.userId else { throw AppError.noSession }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw AppError.networkError("Couldn't save your profile. Your changes are still here; please try again.")
        }
        let rows = try decoder.decode([AccountProfile].self, from: data)
        guard rows.count == 1, let saved = rows.first, saved.id == current.userId else {
            throw AppError.networkError("Your profile wasn't updated. Please reload it and try again.")
        }
        accountProfile = saved
        return saved
    }
    func createViewerProfile(id: String, name: String, avatarID: String?, avatarURL: String? = nil) async throws -> Profile {
        guard let userID = session?.userId, UUID(uuidString: id) != nil else { throw AppError.noSession }
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean.count <= 40 else { throw AppError.networkError("Use a viewer name between 1 and 40 characters.") }
        if let avatarID, !(1...28).map({ "a\($0)" }).contains(avatarID) { throw AppError.networkError("Choose an available avatar.") }
        let profile = Profile(id: id, name: clean, avatar_id: avatarID, avatar_url: avatarURL, user_id: userID)
        try await post("viewer_profiles", body: ["id": id, "user_id": userID, "name": clean,
            "avatar_id": avatarID as Any? ?? NSNull(), "avatar_url": avatarURL as Any? ?? NSNull()],
            query: ["on_conflict": "id"], prefer: "resolution=merge-duplicates,return=minimal", expectedUserID: userID)
        guard session?.userId == userID else { throw AppError.noSession }
        profiles.removeAll { $0.id == id }
        profiles.append(profile)
        return profile
    }
    func fetchProfiles() async throws -> [Profile] {
        guard let userID = session?.userId else { return [] }
        let rows: [Profile] = try await get("viewer_profiles", query: ["user_id": "eq.\(userID)", "order": "created_at.asc"])
        guard session?.userId == userID else { throw AppError.noSession }
        return rows.filter { $0.user_id == userID }
    }
}
