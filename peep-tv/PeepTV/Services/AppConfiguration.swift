import Foundation

struct AppConfiguration {
    let baseURL: URL
    let anonKey: String
    let streamHost: String
    let isDevelopment: Bool

    static func accountManagementURL(bundle: Bundle = .main) -> URL? {
        guard let value = bundle.object(forInfoDictionaryKey: "PEEP_ACCOUNT_MANAGEMENT_URL") as? String,
              !value.contains("$("), let url = URL(string: value),
              url.host != nil, url.user == nil, url.password == nil,
              url.path == "/account/delete", url.query == nil, url.fragment == nil else { return nil }
        let development = bundle.object(forInfoDictionaryKey: "PEEP_ENVIRONMENT") as? String == "development"
        let parts = (url.host ?? "").split(separator: ".").compactMap { Int($0) }
        let privateLAN = parts.count == 4 && parts.allSatisfy { (0...255).contains($0) } && (parts[0] == 10 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && (16...31).contains(parts[1])))
        guard url.scheme == "https" || (development && url.scheme == "http" && privateLAN) else { return nil }
        return url
    }
    /// The two projects lost with the old account; the web app refuses them too.
    static let legacyHosts: Set<String> = ["iuozujwtuzuwubhsnhix.supabase.co", "fzrfevzrfurmszdjauov.supabase.co"]
    static func isLegacyHost(_ host: String?) -> Bool { legacyHosts.contains((host ?? "").lowercased()) }
    static func load(bundle: Bundle = .main) throws -> AppConfiguration {
        func value(_ key: String) -> String {
            (bundle.object(forInfoDictionaryKey: key) as? String ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard let url = URL(string: value("SUPABASE_URL")),
              url.scheme == "https", let host = url.host, !host.isEmpty,
              !value("SUPABASE_URL").contains("$("),
              !value("SUPABASE_ANON_KEY").isEmpty,
              !value("SUPABASE_ANON_KEY").contains("$(") else {
            throw AppError.networkError("Set the Supabase URL and public key in Config/Local.xcconfig (Debug) or Config/Production.xcconfig (Release), then rebuild.")
        }
        guard !isLegacyHost(host) else {
            throw AppError.networkError("This build points at a retired Supabase project. Update Config/Local.xcconfig to the current project, then rebuild.")
        }
        return AppConfiguration(baseURL: url, anonKey: value("SUPABASE_ANON_KEY"),
                                streamHost: value("CLOUDFLARE_STREAM_HOST"),
                                isDevelopment: value("PEEP_ENVIRONMENT") == "development")
    }
}

enum MediaURL {
    static func parse(_ value: String?) -> URL? {
        guard let value, let url = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme == "https", let host = url.host, !host.isEmpty else { return nil }
        return url
    }
}
