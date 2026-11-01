import TVServices
import OSLog

private let log = Logger(subsystem: "tv.watchpeep.PeepTV", category: "TopShelf")

// The strip above the Peep icon on the Apple TV home screen: featured titles and
// live channels, each opening the app at that title through a peeptv:// link.
// Runs as its own process, so it talks to Supabase directly with the public key
// and never touches the signed-in session.
final class ContentProvider: TVTopShelfContentProvider {
    override init() {
        super.init()
        log.notice("Top Shelf provider created")
    }
    override func loadTopShelfContent() async -> (any TVTopShelfContent)? {
        guard let config = TopShelfConfig.load() else {
            log.error("Top Shelf has no Supabase configuration in its Info.plist")
            return nil
        }
        log.notice("Top Shelf loading from \(config.base.host ?? "?", privacy: .public) production=\(config.production, privacy: .public)")
        let content = await TopShelfCatalog(config: config).content()
        log.notice("Top Shelf built \(content?.sections.count ?? 0, privacy: .public) sections")
        return content
    }
}

struct TopShelfConfig {
    let base: URL
    let key: String
    let production: Bool

    static func load(_ info: [String: Any] = Bundle.main.infoDictionary ?? [:]) -> TopShelfConfig? {
        guard let urlString = info["SUPABASE_URL"] as? String, !urlString.contains("$("),
              let base = URL(string: urlString), base.scheme == "https",
              let key = info["SUPABASE_ANON_KEY"] as? String, !key.isEmpty, !key.contains("$(") else { return nil }
        return TopShelfConfig(base: base, key: key, production: (info["PEEP_ENVIRONMENT"] as? String) != "development")
    }
}

struct TopShelfCatalog {
    struct VideoRow: Decodable { let id: String; let title: String; let poster: String?; let thumbnail: String?; let featured: Bool?; let is_premium: Bool? }
    struct ShowRow: Decodable { let id: Int; let title: String; let poster: String?; let thumbnail: String?; let featured: Bool?; let is_premium: Bool? }
    struct ChannelRow: Decodable { let id: Int; let name: String; let logo_url: String?; let hero_url: String?; let is_premium: Bool? }

    let config: TopShelfConfig
    private let limit = 10

    func content() async -> TVTopShelfSectionedContent? {
        async let videos: [VideoRow] = rows("videos", select: "id,title,poster,thumbnail,featured,is_premium", order: "id.desc", catalog: true)
        async let shows: [ShowRow] = rows("shows", select: "id,title,poster,thumbnail,featured,is_premium", order: "id.desc", catalog: true)
        async let channels: [ChannelRow] = rows("channels", select: "id,name,logo_url,hero_url,is_premium", order: "sort_order.asc,id.asc", catalog: true, extra: ["is_active": "eq.true"])
        let (videoRows, showRows, channelRows) = await (videos, shows, channels)
        let featured = Self.featuredItems(videos: videoRows, shows: showRows, limit: limit)
        let live = Self.liveItems(channelRows, limit: limit)
        log.notice("Top Shelf rows: videos=\(videoRows.count, privacy: .public) shows=\(showRows.count, privacy: .public) channels=\(channelRows.count, privacy: .public) → featured=\(featured.count, privacy: .public) live=\(live.count, privacy: .public)")
        var sections: [TVTopShelfItemCollection<TVTopShelfSectionedItem>] = []
        if !featured.isEmpty { let section = TVTopShelfItemCollection(items: featured); section.title = "Featured on Peep"; sections.append(section) }
        if !live.isEmpty { let section = TVTopShelfItemCollection(items: live); section.title = "Live now"; sections.append(section) }
        return sections.isEmpty ? nil : TVTopShelfSectionedContent(sections: sections)
    }

    // Featured first, then newest; demo and premium titles never reach the home screen.
    static func featuredItems(videos: [VideoRow], shows: [ShowRow], limit: Int) -> [TVTopShelfSectionedItem] {
        let movies = videos.filter { $0.is_premium != true && !isDemo($0.title) }
            .map { (featured: $0.featured == true, item: item("movie:\($0.id)", title: $0.title, image: artwork($0.poster, $0.thumbnail), shape: .poster, link: "peeptv://movie/\($0.id)")) }
        let series = shows.filter { $0.is_premium != true && !isDemo($0.title) }
            .map { (featured: $0.featured == true, item: item("show:\($0.id)", title: $0.title, image: artwork($0.poster, $0.thumbnail), shape: .poster, link: "peeptv://show/\($0.id)")) }
        let all = movies + series
        return Array((all.filter(\.featured) + all.filter { !$0.featured }).compactMap { $0.item }.prefix(limit))
    }

    static func liveItems(_ channels: [ChannelRow], limit: Int) -> [TVTopShelfSectionedItem] {
        Array(channels.filter { $0.is_premium != true && !isDemo($0.name) }
            .compactMap { item("channel:\($0.id)", title: displayName($0.name), image: artwork($0.hero_url, $0.logo_url), shape: .hdtv, link: "peeptv://channel/\($0.id)") }
            .prefix(limit))
    }

    // Admin stores "" rather than null for missing artwork, so fall through on blanks.
    static func artwork(_ candidates: String?...) -> String? {
        candidates.compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }
    }

    private static func item(_ identifier: String, title: String, image: String?, shape: TVTopShelfSectionedItem.ImageShape, link: String) -> TVTopShelfSectionedItem? {
        guard let image, let imageURL = URL(string: image), imageURL.scheme == "https", let url = URL(string: link) else { return nil }
        let item = TVTopShelfSectionedItem(identifier: identifier)
        item.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        item.imageShape = shape
        item.setImageURL(imageURL, for: [.screenScale1x, .screenScale2x])
        item.displayAction = TVTopShelfAction(url: url)
        item.playAction = TVTopShelfAction(url: url)
        return item
    }

    static func isDemo(_ title: String) -> Bool { title.uppercased().hasPrefix("DEMO") }
    // Same tidy-up the app applies: "(1080p)" and "[Not 24/7]" are source notes, not names.
    static func displayName(_ raw: String) -> String {
        var name = raw
        for pattern in [#"\s*\((?:\d{3,4}[pi]|\d+x\d+|HD|SD|FHD|UHD|4K)\)"#, #"\s*\[[^\]]*\]"#] {
            name = name.replacingOccurrences(of: pattern, with: "", options: [.regularExpression, .caseInsensitive])
        }
        name = name.replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? raw.trimmingCharacters(in: .whitespacesAndNewlines) : name
    }

    private func rows<T: Decodable>(_ table: String, select: String, order: String, catalog: Bool, extra: [String: String] = [:]) async -> [T] {
        var components = URLComponents(url: config.base.appendingPathComponent("rest/v1/\(table)"), resolvingAgainstBaseURL: false)!
        var query = ["select": select, "order": order, "limit": "40"]
        if catalog && config.production { query["or"] = "(visibility_tier.eq.production,visibility_tier.is.null)" }
        extra.forEach { query[$0.key] = $0.value }
        components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        guard let url = components.url else { return [] }
        var request = URLRequest(url: url)
        request.timeoutInterval = 8
        request.setValue(config.key, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(config.key)", forHTTPHeaderField: "Authorization")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let status = (response as? HTTPURLResponse)?.statusCode, status == 200 else {
                log.error("Top Shelf \(table, privacy: .public) returned HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1, privacy: .public)")
                return []
            }
            return try JSONDecoder().decode([T].self, from: data)
        } catch {
            log.error("Top Shelf \(table, privacy: .public) failed: \(String(describing: error), privacy: .public)")
            return []
        }
    }
}
