import Foundation
import Combine

@MainActor
class SupabaseService: ObservableObject {
    static let shared = SupabaseService()

    private let baseURL = "https://iuozujwtuzuwubhsnhix.supabase.co"
    private let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1b3p1and0dXp1d3ViaHNuaGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTQ2MDEsImV4cCI6MjA5NDE3MDYwMX0.IoCOsLNqUCwICddaYr1nW94gTFUUJsBIFp4pkF2bz8s"

    @Published var session: UserSession?
    @Published var activeProfile: Profile?
    @Published var profiles: [Profile] = []

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .useDefaultKeys
        return d
    }()

    init() { loadSession() }

    // MARK: - Headers

    private var headers: [String: String] {
        var h = ["apikey": anonKey, "Content-Type": "application/json"]
        if let token = session?.accessToken {
            h["Authorization"] = "Bearer \(token)"
        } else {
            h["Authorization"] = "Bearer \(anonKey)"
        }
        return h
    }

    // MARK: - Auth

    func signIn(email: String, password: String) async throws {
        let url = URL(string: "\(baseURL)/auth/v1/token?grant_type=password")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.allHTTPHeaderFields = ["apikey": anonKey, "Content-Type": "application/json"]
        req.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw AppError.invalidCredentials
        }

        let auth = try decoder.decode(AuthResponse.self, from: data)
        let uid = auth.user.id
        session = UserSession(accessToken: auth.access_token, userId: uid)
        saveSession()

        profiles = (try? await fetchProfiles()) ?? []
        activeProfile = profiles.first ?? Profile(id: uid, name: "Me", avatar_id: "a1", user_id: uid)
    }

    func signOut() {
        session = nil
        activeProfile = nil
        profiles = []
        UserDefaults.standard.removeObject(forKey: "peep_tv_token")
        UserDefaults.standard.removeObject(forKey: "peep_tv_uid")
        UserDefaults.standard.removeObject(forKey: "peep_tv_profile_id")
    }

    func selectProfile(_ profile: Profile) {
        activeProfile = profile
        UserDefaults.standard.set(profile.id, forKey: "peep_tv_profile_id")
    }

    private func saveSession() {
        guard let s = session else { return }
        UserDefaults.standard.set(s.accessToken, forKey: "peep_tv_token")
        UserDefaults.standard.set(s.userId, forKey: "peep_tv_uid")
    }

    private func loadSession() {
        guard
            let token = UserDefaults.standard.string(forKey: "peep_tv_token"),
            let uid = UserDefaults.standard.string(forKey: "peep_tv_uid")
        else { return }
        session = UserSession(accessToken: token, userId: uid)
        Task {
            profiles = (try? await fetchProfiles()) ?? []
            if let pid = UserDefaults.standard.string(forKey: "peep_tv_profile_id") {
                activeProfile = profiles.first { $0.id == pid } ?? profiles.first
            } else {
                activeProfile = profiles.first ?? Profile(id: uid, name: "Me", avatar_id: "a1", user_id: uid)
            }
        }
    }

    // MARK: - Generic fetch

    func get<T: Decodable>(_ table: String, query: [String: String] = [:]) async throws -> T {
        var comps = URLComponents(string: "\(baseURL)/rest/v1/\(table)")!
        comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        var req = URLRequest(url: comps.url!)
        req.allHTTPHeaderFields = headers
        let (data, _) = try await URLSession.shared.data(for: req)
        return try decoder.decode(T.self, from: data)
    }

    // MARK: - Content

    func fetchVideos(category: String? = nil) async throws -> [Video] {
        var q: [String: String] = ["order": "order_index.asc,id.desc", "limit": "200"]
        if let c = category { q["category"] = "eq.\(c)" }
        return try await get("videos", query: q)
    }

    func fetchShows() async throws -> [Show] {
        return try await get("shows", query: ["order": "id.desc", "limit": "100"])
    }

    func fetchLiveStreams() async throws -> [LiveStream] {
        return try await get("live_streams", query: ["order": "id.desc"])
    }

    func fetchSeasons(showId: Int) async throws -> [Season] {
        return try await get("show_seasons", query: [
            "show_id": "eq.\(showId)",
            "order": "season_number.asc"
        ])
    }

    func fetchEpisodes(seasonId: Int) async throws -> [Episode] {
        return try await get("show_episodes", query: [
            "season_id": "eq.\(seasonId)",
            "order": "episode_number.asc"
        ])
    }

    func fetchProfiles() async throws -> [Profile] {
        guard let uid = session?.userId else { return [] }
        return try await get("viewer_profiles", query: [
            "user_id": "eq.\(uid)",
            "order": "created_at.asc"
        ])
    }
}
