import XCTest
@testable import PeepTV

final class CatalogTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    func testMovieUUIDAndFeaturedMatchWebSchema() throws {
        let movie = try decode(Video.self, #"{"id":"54a263b4-1833-44b1-bdf2-f791868c410a","title":"Sample","featured":true,"url":"https://media.example.com/movie.m3u8"}"#)
        XCTAssertEqual(movie.id, "54a263b4-1833-44b1-bdf2-f791868c410a")
        XCTAssertEqual(movie.is_featured, true)
        XCTAssertEqual(movie.videoURL?.pathExtension, "m3u8")
    }

    func testEpisodeUsesShowAndSeasonColumns() throws {
        let episode = try decode(Episode.self, #"{"id":42,"show_id":7,"season":2,"episode_number":3,"status":"approved"}"#)
        XCTAssertEqual(episode.show_id, 7)
        XCTAssertEqual(episode.season, 2)
        XCTAssertEqual(episode.displayTitle, "Episode 3")
        XCTAssertNil(episode.videoURL)
    }

    func testLinkedFeedUUIDHasPriorityOverDirectChannelURL() throws {
        let channel = try decode(Channel.self, #"{"id":1,"name":"Live","live_feed_id":"c8bbfe6c-ef46-4b10-9af4-65a27ad15a8b","hls_url":"https://direct.example.com/live.m3u8","stream_uid":"abc"}"#)
        let feeds = [PublicFeed(id: "c8bbfe6c-ef46-4b10-9af4-65a27ad15a8b", cloudflare_hls_url: "https://feed.example.com/live.m3u8")]
        XCTAssertEqual(channel.playbackURL(streamHost: "stream.example.com", feeds: feeds)?.host, "feed.example.com")
        XCTAssertEqual(channel.playbackURL(streamHost: "stream.example.com", feeds: [])?.host, "direct.example.com")
    }

    func testCloudflareFallbackAndUnconfiguredChannel() throws {
        let channel = try decode(Channel.self, #"{"id":1,"name":"Live","stream_uid":"abc123"}"#)
        XCTAssertEqual(channel.playbackURL(streamHost: "stream.example.com", feeds: [])?.absoluteString,
                       "https://stream.example.com/abc123/manifest/video.m3u8")
        XCTAssertNil(channel.playbackURL(streamHost: "", feeds: []))
        let empty = try decode(Channel.self, #"{"id":2,"name":"Coming soon"}"#)
        XCTAssertNil(empty.playbackURL(streamHost: "stream.example.com", feeds: []))
    }

    func testGuideHandlesPostgresFractionalTimestampsAndEndBoundary() throws {
        let entry = try decode(GuideEntry.self, #"{"id":1,"channel_id":2,"title":"Now","start_time":"2026-10-20T12:00:00.000+00:00","end_time":"2026-10-20T13:00:00+00:00"}"#)
        XCTAssertTrue(entry.isOnAir(at: try XCTUnwrap(GuideEntry.date("2026-10-20T12:00:00Z"))))
        XCTAssertFalse(entry.isOnAir(at: try XCTUnwrap(GuideEntry.date("2026-10-20T13:00:00Z"))))
    }

    func testInvalidMediaURLsDoNotCreateEmptyPlayer() {
        for value in ["", "relative/path", "javascript:alert(1)", "http://insecure.example.com/video", "https://"] {
            XCTAssertNil(MediaURL.parse(value))
        }
        XCTAssertEqual(MediaURL.parse(" https://media.example.com/video.mp4 ")?.host, "media.example.com")
    }

    func testSessionPersistsRefreshTokenAndExpiration() throws {
        let response = try decode(AuthResponse.self, #"{"access_token":"access","refresh_token":"refresh","expires_in":3600,"user":{"id":"user-id"}}"#)
        let session = response.session
        let restored = try JSONDecoder().decode(UserSession.self, from: JSONEncoder().encode(session))
        XCTAssertEqual(restored.refreshToken, "refresh")
        XCTAssertEqual(restored.userId, "user-id")
        XCTAssertEqual(restored.expiresAt.timeIntervalSinceNow, 3600, accuracy: 2)
    }
}
