import Foundation

struct AppConfiguration {
    let baseURL: URL
    let anonKey: String
    let streamHost: String
    let isDevelopment: Bool

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
