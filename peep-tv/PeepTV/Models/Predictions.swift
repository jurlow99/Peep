import Foundation
import Combine

struct PredictionEvent: Identifiable, Decodable, Equatable {
    let id: Int
    let title: String
    let description: String?
    let thumbnail: String?
    let hero_url: String?
    let stream_url: String?
    let stream_uid: String?
    let status: String?
    let starts_at: String?
    let visibility_tier: String?
    var artwork: URL? { MediaURL.parse(hero_url) ?? MediaURL.parse(thumbnail) }
    var startDate: Date? { GuideEntry.date(starts_at) }
    var statusLabel: String { id < 0 ? "DEMO EVENT" : status == "live" ? "LIVE EVENT" : status == "ended" ? "FINISHED" : "UPCOMING" }
    func playbackURL(host: String) -> URL? {
        if let direct = MediaURL.playback(stream_url) { return direct }
        guard let uid = stream_uid, !host.isEmpty,
              uid.range(of: "^[a-zA-Z0-9_-]+$", options: .regularExpression) != nil else { return nil }
        return MediaURL.playback("https://\(host)/\(uid)/manifest/video.m3u8")
    }
}

struct PredictionOption: Identifiable, Decodable, Equatable {
    let id: Int
    let key: String
    let label: String
    let odds: Double
    let sort_order: Int?
    var valid: Bool { !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && odds.isFinite && odds >= 1 && odds < 10_000 }
    var multiplier: String { String(format: "%.2f×", odds) }
}

struct PredictionMarket: Identifiable, Decodable, Equatable {
    let id: Int
    let event_id: Int
    let question: String
    let status: String
    let locks_at: String?
    let winning_option_id: Int?
    let seq: Int?
    let market_options: [PredictionOption]
    var options: [PredictionOption] {
        market_options.sorted { ($0.sort_order ?? 0, $0.id) < ($1.sort_order ?? 0, $1.id) }
    }
    func canPick(at date: Date = Date()) -> Bool {
        guard status == "open", (2...4).contains(options.count), options.allSatisfy(\.valid),
              Set(options.map(\.id)).count == options.count else { return false }
        if let locks_at {
            guard let lock = GuideEntry.date(locks_at), date < lock else { return false }
        }
        return true
    }
    func statusLabel(at date: Date) -> String {
        switch status {
        case "settled": return "RESULT"
        case "void": return "VOIDED"
        default: return canPick(at: date) ? "MAKE YOUR PICK" : "PICKS CLOSED"
        }
    }
    var winner: PredictionOption? { options.first { $0.id == winning_option_id } }
    static func latest(for eventID: Int, in markets: [PredictionMarket]) -> PredictionMarket? {
        markets.filter { $0.event_id == eventID }.max { $0.id < $1.id }
    }
}

struct PredictionPick: Identifiable, Codable {
    let id: Int // one preview pick per market, scoped to account/profile/device
    let eventID: Int
    let eventTitle: String
    let question: String
    let optionID: Int
    let optionLabel: String
    let points: Int
    let odds: Double
    let placedAt: Date
    var result: String = "pending"
    var returnPoints: Int?
    var potentialPoints: Int { Self.potentialReturn(points: points, odds: odds) }
    static func potentialReturn(points: Int, odds: Double) -> Int {
        guard [25, 50, 100].contains(points), odds.isFinite, odds >= 1, odds < 10_000,
              let multiplier = Decimal(string: String(odds), locale: Locale(identifier: "en_US_POSIX")) else { return 0 }
        var value = Decimal(points) * multiplier
        var rounded = Decimal()
        NSDecimalRound(&rounded, &value, 0, .plain)
        return NSDecimalNumber(decimal: rounded).intValue
    }
}

@MainActor
final class PredictionPicks: ObservableObject {
    @Published private(set) var items: [PredictionPick]
    var watchingEvent = false
    private let defaults: UserDefaults
    private let key: String
    init(scope: String, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        key = "peep.predictions.preview.\(scope)"
        let stored = defaults.data(forKey: key).flatMap { try? JSONDecoder().decode([PredictionPick].self, from: $0) } ?? []
        items = stored.filter { [25, 50, 100].contains($0.points) && $0.odds.isFinite && $0.odds >= 1 && $0.odds < 10_000 }
    }
    func pick(for marketID: Int) -> PredictionPick? { items.first { $0.id == marketID } }
    func save(event: PredictionEvent, market: PredictionMarket, option: PredictionOption, points: Int, at date: Date = Date()) throws {
        guard market.event_id == event.id, market.canPick(at: date) else { throw AppError.networkError("Picks have closed for this question.") }
        guard pick(for: market.id) == nil else { throw AppError.networkError("You already saved a preview pick for this question.") }
        guard [25, 50, 100].contains(points), let quoted = market.options.first(where: { $0.id == option.id }), quoted == option else {
            throw AppError.networkError("This choice has changed. Review the options and try again.")
        }
        items.insert(PredictionPick(id: market.id, eventID: event.id, eventTitle: event.title, question: market.question,
                                   optionID: option.id, optionLabel: option.label, points: points, odds: option.odds, placedAt: date), at: 0)
        items = Array(items.prefix(200))
        persist()
    }
    func resolve(_ markets: [PredictionMarket], fromPlayer: Bool = false) {
        guard !watchingEvent || fromPlayer else { return }
        var changed = false
        for index in items.indices where items[index].result == "pending" {
            guard let market = markets.first(where: { $0.id == items[index].id && $0.event_id == items[index].eventID }) else { continue }
            if market.status == "void" {
                items[index].result = "void"; items[index].returnPoints = items[index].points; changed = true
            } else if market.status == "settled", let winner = market.winner {
                let won = winner.id == items[index].optionID
                items[index].result = won ? "won" : "lost"
                items[index].returnPoints = won ? items[index].potentialPoints : 0
                changed = true
            }
        }
        if changed { persist() }
    }
    private func persist() { if let data = try? JSONEncoder().encode(items) { defaults.set(data, forKey: key) } }
}

/// Snapshots are delayed to follow a dated live stream; locking is still checked
/// against a fresh authoritative snapshot when the viewer confirms a preview pick.
struct PredictionRevealQueue {
    private var snapshots: [(Date, [PredictionMarket])] = []
    mutating func enqueue(_ markets: [PredictionMarket], at date: Date, latency: TimeInterval) {
        let delay = latency.isFinite && latency >= 0 && latency < 120 ? latency : 0
        snapshots.append((date.addingTimeInterval(delay + 0.25), markets))
        snapshots = Array(snapshots.suffix(60))
    }
    mutating func reveal(at date: Date) -> [PredictionMarket]? {
        guard let lastReady = snapshots.lastIndex(where: { $0.0 <= date }) else { return nil }
        let result = snapshots[lastReady].1
        snapshots.removeFirst(lastReady + 1)
        return result
    }
}

#if DEBUG
/// Local development sample; never inserted into the admin catalog.
enum PredictionDemo {
    static let event = PredictionEvent(id: -1, title: "Make the next call.",
        description: "Try the Predictions experience with a sample video. Every pick here is a preview with virtual Points.",
        thumbnail: nil, hero_url: nil, stream_url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        stream_uid: nil, status: "live", starts_at: nil, visibility_tier: "test")
    static let market = PredictionMarket(id: -1, event_id: -1, question: "Who takes the next point?", status: "open",
        locks_at: nil, winning_option_id: nil, seq: 1, market_options: [
            PredictionOption(id: -1, key: "home", label: "Home", odds: 1.90, sort_order: 0),
            PredictionOption(id: -2, key: "away", label: "Away", odds: 2.05, sort_order: 1)
        ])
}
#endif
