import XCTest
import Combine
import AVFoundation
import UIKit
import SwiftUI
@testable import PeepTV

final class CatalogTests: XCTestCase {
    func testCapturedEmbeddedDogCueAndClockWraparound() throws {
        let hex = "fc30470000000000000000c01405003fbc717feffef7fcee5efe00a4e30e000000000022022043554549000000017fff0000a4e30e0e0c32373132335f323030323034220101a8785acd"
        let bytes = stride(from: 0, to: hex.count, by: 2).map { offset -> UInt8 in
            let a = hex.index(hex.startIndex, offsetBy: offset)
            return UInt8(hex[a..<hex.index(a,offsetBy:2)],radix:16)!
        }
        let event = try XCTUnwrap(LiveTransportProbe.splice(bytes))
        XCTAssertEqual(event.id,"4177009"); XCTAssertTrue(event.out)
        XCTAssertEqual(try XCTUnwrap(event.duration),120.067,accuracy:0.00001)
        XCTAssertEqual(event.pts/90000,46228.316066666666,accuracy:0.00001)
        let segmentDate = Date(timeIntervalSince1970:1000)
        let start = try XCTUnwrap(LiveTransportProbe.mappedDate(pts:event.pts,anchorPTS:event.pts-90000,segmentDate:segmentDate))
        XCTAssertEqual(start.timeIntervalSince1970,1001,accuracy:0.00001)
        let cue = LiveMidrollCue(id:event.id,start:start,end:start.addingTimeInterval(event.duration!))
        XCTAssertEqual(try XCTUnwrap(cue.remaining(at:start)),120.067,accuracy:0.00001)
        XCTAssertEqual(try XCTUnwrap(cue.remaining(at:start.addingTimeInterval(4))),116.067,accuracy:0.00001)
        XCTAssertEqual(try XCTUnwrap(LiveTransportProbe.mappedDate(pts:45000,anchorPTS:LiveTransportProbe.wrap-45000,segmentDate:segmentDate)).timeIntervalSince1970,1001,accuracy:0.00001)
        XCTAssertNil(LiveTransportProbe.mappedDate(pts:400*90000,anchorPTS:0,segmentDate:segmentDate))
        func packet(_ pid: Int, _ payload: [UInt8]) -> [UInt8] {
            var data = [UInt8](repeating:255,count:188)
            let header: [UInt8] = [71,64|UInt8(pid>>8),UInt8(pid&255),16]
            data.replaceSubrange(0..<4,with:header);data.replaceSubrange(4..<4+payload.count,with:payload)
            return data
        }
        let pat: [UInt8] = [0,176,13,0,1,195,0,0,0,1,224,32,60,109,249,99]
        let pmt: [UInt8] = [2,176,44,0,1,193,0,0,225,0,240,6,5,4,67,85,69,73,27,225,0,240,10,5,8,72,68,77,86,255,27,68,63,15,225,1,240,0,134,225,244,240,0,147,58,35,105]
        let ticks = UInt64(event.pts)-90000
        let timestamp: [UInt8] = [0x21|UInt8((ticks>>29)&14),UInt8((ticks>>22)&255),UInt8((ticks>>14)&254)|1,UInt8((ticks>>7)&255),UInt8((ticks<<1)&254)|1]
        let pes: [UInt8] = [0,0,1,224,0,0,128,128,5]+timestamp
        let transport = packet(0,[0]+pat)+packet(32,[0]+pmt)+packet(256,pes)+packet(500,[0]+bytes)
        let inspected = LiveTransportProbe.inspect(Data(transport))
        XCTAssertEqual(inspected.splices,[event])
        XCTAssertEqual(try XCTUnwrap(inspected.anchor),Double(ticks),accuracy:0.01)
        let mapped = try XCTUnwrap(LiveTransportProbe.mappedDate(pts:event.pts,anchorPTS:inspected.anchor!,segmentDate:segmentDate))
        XCTAssertEqual(mapped.timeIntervalSince1970,1001,accuracy:0.00001)
        var corrupt = bytes; corrupt[20] ^= 1
        XCTAssertNil(LiveTransportProbe.splice(corrupt))
        XCTAssertNil(LiveTransportProbe.splice(Array(bytes.prefix(10))))
    }

    func testPlaylistCueOutMarkersBecomeMidrollCues() throws {
        let signal = "/DBHAAAAAAAAAADAFAUAAAI0f+/+C16cyf4ApOMOAAAAAAAiAiBDVUVJAAAAAX//AACk4w4ODDM4OTQ3XzIwMDMzMCIBAUfWsPg="
        let joined = """
        #EXTM3U
        #EXT-X-TARGETDURATION:6
        #EXT-X-PROGRAM-DATE-TIME:2026-10-31T22:16:54.030+00:00
        #EXTINF:6.006000,
        seg_0138250.ts
        #EXTINF:6.006000,
        seg_0138251.ts
        #EXT-OATCLS-SCTE35:\(signal)
        #EXT-X-CUE-OUT:120.067001
        #EXTINF:6.006000,
        seg_0138252.ts
        #EXT-X-CUE-OUT-CONT:ElapsedTime=6.006000,Duration=120.067001,SCTE35=\(signal)
        #EXTINF:6.006000,
        seg_0138253.ts
        """
        let cue = try XCTUnwrap(LivePlaylistCues.parse(joined).first)
        XCTAssertEqual(cue.id, "cue:" + signal)
        XCTAssertEqual(cue.start.timeIntervalSince1970, 1793485026.042, accuracy: 0.01)
        XCTAssertEqual(cue.end.timeIntervalSince(cue.start), 120.067, accuracy: 0.001)
        XCTAssertEqual(LivePlaylistCues.parse(joined).count, 1, "CUE-OUT and its CONT lines describe one break")
        XCTAssertNotNil(cue.remaining(at: cue.start.addingTimeInterval(2)))

        // Joining mid-break: only CONT lines are in the window, start is recovered from ElapsedTime.
        let late = """
        #EXTM3U
        #EXT-X-PROGRAM-DATE-TIME:2026-10-31T22:17:36.072+00:00
        #EXT-X-CUE-OUT-CONT:ElapsedTime=30.030000,Duration=120.067001,SCTE35=\(signal)
        #EXTINF:6.006000,
        seg_0138257.ts
        #EXT-X-CUE-OUT-CONT:ElapsedTime=36.036000,Duration=120.067001,SCTE35=\(signal)
        #EXTINF:6.006000,
        seg_0138258.ts
        #EXT-X-CUE-IN
        #EXTINF:6.006000,
        seg_0138259.ts
        """
        let recovered = try XCTUnwrap(LivePlaylistCues.parse(late).first)
        XCTAssertEqual(recovered.id, cue.id)
        XCTAssertEqual(recovered.start.timeIntervalSince1970, cue.start.timeIntervalSince1970, accuracy: 0.01)
        XCTAssertEqual(recovered.end.timeIntervalSince1970, 1793485068.084, accuracy: 0.01, "CUE-IN closes the break at the next segment's date")

        // No programme date, or a duration-less CUE-OUT, gives nothing to time against.
        XCTAssertTrue(LivePlaylistCues.parse("#EXTM3U\n#EXT-X-CUE-OUT:30\n#EXTINF:6,\na.ts\n").isEmpty)
        XCTAssertTrue(LivePlaylistCues.parse("#EXTM3U\n#EXT-X-PROGRAM-DATE-TIME:2026-10-31T22:00:00Z\n#EXT-X-CUE-OUT\n#EXTINF:6,\na.ts\n").isEmpty)
        let unsigned = LivePlaylistCues.parse("#EXTM3U\n#EXT-X-PROGRAM-DATE-TIME:2026-10-31T22:00:00Z\n#EXT-X-CUE-OUT:DURATION=45\n#EXTINF:6,\na.ts\n")
        XCTAssertEqual(unsigned.first?.id, "cue:1793484000")
        XCTAssertEqual(unsigned.first.map { $0.end.timeIntervalSince($0.start) }, 45)
    }

    func testLiveMidrollRequiresKnownBoundedDurationAndOnTimePlayback() {
        let start = Date(timeIntervalSince1970: 1000)
        let cue = LiveMidrollCue(id: "break", start: start, end: start.addingTimeInterval(30))
        XCTAssertEqual(cue.remaining(at: start), 30)
        XCTAssertEqual(cue.remaining(at: start.addingTimeInterval(1)), 29)
        XCTAssertEqual(cue.remaining(at: start.addingTimeInterval(-1)), 31)
        XCTAssertEqual(cue.remaining(at: start.addingTimeInterval(2)), 28)
        XCTAssertNil(cue.remaining(at: start.addingTimeInterval(-4)))
        XCTAssertNil(cue.remaining(at: start.addingTimeInterval(16)))
        XCTAssertNil(LiveMidrollCue(id: "bad", start: start, end: start).remaining(at: start))
        XCTAssertNil(LiveMidrollCue(id: "bad", start: start, end: start.addingTimeInterval(181)).remaining(at: start))
    }

    @MainActor
    func testMidrollRequiresExactTestChannelAndCanCancel() {
        let gate = CSAIGate()
        let config = AppConfiguration(baseURL: URL(string: "https://test.invalid")!, anonKey: "public", streamHost: "", isDevelopment: true)
        let service = SupabaseService(configuration: config, session: nil) { _ in throw URLError(.badURL) }
        let tag = CSAITag(id: 1, tag_url: "https://ads.invalid/test", scope: "live", content_id: "2", active: true, is_test: true, platforms: ["tvos"])
        gate.beginMidroll(service: service, tag: tag, channelID: 1)
        XCTAssertFalse(gate.blocking)
        let realTag = CSAITag(id: 2, tag_url: "https://ads.invalid/real", scope: "live", content_id: "1", active: true, is_test: false, platforms: ["tvos"])
        gate.beginMidroll(service: service, tag: realTag, channelID: 1)
        XCTAssertFalse(gate.blocking)
        gate.beginMidroll(service: service, tag: tag, channelID: 2)
        XCTAssertTrue(gate.blocking)
        XCTAssertTrue(gate.isMidroll)
        gate.cancel()
        XCTAssertFalse(gate.blocking)
        XCTAssertFalse(gate.isMidroll)
        XCTAssertNil(gate.tag)
    }

    @MainActor
    func testViewerCreationBindsAccountAndRejectsForeignSelection() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://profile-test.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: true)
        let session = UserSession(accessToken: "test-token", refreshToken: "test-refresh", userId: "owner", expiresAt: .distantFuture)
        let id = UUID().uuidString
        var requests = 0
        let service = SupabaseService(configuration: config, session: session) { request in
            requests += 1
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertTrue(request.url!.path.hasSuffix("/viewer_profiles"))
            let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: request.httpBody!) as? [String: Any])
            XCTAssertEqual(payload["user_id"] as? String, "owner")
            XCTAssertEqual(payload["id"] as? String, id)
            XCTAssertEqual(payload["name"] as? String, "Sam")
            XCTAssertEqual(payload["avatar_id"] as? String, "a28")
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!)
        }
        for name in [" ", String(repeating: "x", count: 41)] {
            do { _ = try await service.createViewerProfile(id: id, name: name, avatarID: "a28"); XCTFail("Invalid name accepted") } catch {}
        }
        XCTAssertEqual(requests, 0)
        let viewer = try await service.createViewerProfile(id: id, name: " Sam ", avatarID: "a28")
        service.selectProfile(Profile(id: "foreign", name: "Other", avatar_id: nil, avatar_url: nil, user_id: "another-account"))
        XCTAssertNil(service.activeProfile)
        service.selectProfile(viewer)
        XCTAssertEqual(service.activeProfile?.id, id)
        XCTAssertEqual(service.profiles.count, 1)
        XCTAssertEqual(requests, 1)
    }

    @MainActor
    func testContinueRemovalScopesRequestAndKeepsFailureVisible() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://progress.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: false)
        let session = UserSession(accessToken: "test-token", refreshToken: "test-refresh", userId: "owner", expiresAt: .distantFuture)
        for code in [204, 403] {
            let service = SupabaseService(configuration: config, session: session) { request in
                XCTAssertEqual(request.httpMethod, "DELETE")
                XCTAssertNil(request.httpBody)
                let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
                XCTAssertEqual(query.first { $0.name == "user_id" }?.value, "eq.owner")
                XCTAssertEqual(query.first { $0.name == "content_id" }?.value, "eq.42")
                XCTAssertEqual(query.first { $0.name == "content_type" }?.value, "eq.episode")
                return (Data(), HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: nil, headerFields: nil)!)
            }
            do {
                try await service.removeWatchProgress(identity: PlaybackIdentity(id: "42", type: "episode"))
                XCTAssertEqual(code, 204)
            } catch { XCTAssertEqual(code, 403) }
            XCTAssertEqual(service.watchProgressRevision, code == 204 ? 1 : 0)
        }
        let invalid = WatchProgress(content_id: "1", content_type: "movie", progress_seconds: 30, duration_seconds: .infinity, completed: false)
        XCTAssertFalse(invalid.canResume)
    }

    @MainActor
    func testCatalogSharesConcurrentRequestsAndReloadInvalidatesCache() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://catalog.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: false)
        var requests = 0
        let service = SupabaseService(configuration: config, session: nil) { request in
            requests += 1
            try await Task.sleep(for: .milliseconds(20))
            return (Data("[]".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        async let first: [Video] = service.get("videos", query: ["order":"id.desc", "limit":"200"])
        async let second: [Video] = service.get("videos", query: ["limit":"200", "order":"id.desc"])
        _ = try await (first, second)
        XCTAssertEqual(requests, 1, "Identical concurrent catalog reads should share transport")
        let _: [Video] = try await service.get("videos", query: ["limit":"200", "order":"id.desc"])
        XCTAssertEqual(requests, 1)
        service.invalidateCatalogCache()
        let _: [Video] = try await service.get("videos", query: ["limit":"200", "order":"id.desc"])
        XCTAssertEqual(requests, 2)
        let _: [Episode] = try await service.get("episodes", query: ["show_id":"eq.1"])
        let _: [Episode] = try await service.get("episodes", query: ["show_id":"eq.1"])
        XCTAssertEqual(requests, 3, "Episode catalog reads should reuse a short-lived response")
        let _: [Channel] = try await service.get("channels")
        let _: [Channel] = try await service.get("channels")
        XCTAssertEqual(requests, 5, "Blackout-sensitive channel reads must stay fresh")
        let _: [WatchProgress] = try await service.get("watch_progress")
        let _: [WatchProgress] = try await service.get("watch_progress")
        XCTAssertEqual(requests, 7, "Watch progress must stay fresh")
    }

    @MainActor
    func testFailedCatalogRequestCanRetry() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://catalog.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: false)
        var requests = 0
        let service = SupabaseService(configuration: config, session: nil) { request in
            requests += 1
            return (Data("[]".utf8), HTTPURLResponse(url: request.url!, statusCode: requests == 1 ? 503 : 200, httpVersion: nil, headerFields: nil)!)
        }
        do { let _: [Video] = try await service.get("videos"); XCTFail("Expected outage") } catch {}
        let _: [Video] = try await service.get("videos")
        XCTAssertEqual(requests, 2)
    }

    func testAudioHandoffIgnoresPreviousPlayerCleanup() {
        var ownership = PlaybackAudioOwnership()
        let previous = UUID(), next = UUID()
        ownership.claim(previous)
        ownership.claim(next)
        XCTAssertFalse(ownership.release(previous), "Old player cannot deactivate new playback")
        XCTAssertTrue(ownership.release(next))
        XCTAssertFalse(ownership.release(next), "Repeated cleanup is harmless")
        ownership.claim(previous)
        ownership.claim(nil)
        XCTAssertFalse(ownership.release(previous), "Ad or hero activation supersedes old player ownership")
    }

    func testResumePositionPreservesSavedTimeAndHandlesReplacedSources() {
        XCTAssertEqual(ResumePosition.target(saved: 123.5, duration: 600), 123.5)
        XCTAssertEqual(ResumePosition.target(saved: 800, duration: 600), 599)
        XCTAssertEqual(ResumePosition.target(saved: 0, duration: 600), 0)
        XCTAssertNil(ResumePosition.target(saved: .nan, duration: 600))
        XCTAssertNil(ResumePosition.target(saved: 120, duration: .infinity))
        XCTAssertNil(ResumePosition.target(saved: 120, duration: 0))
        XCTAssertNil(ResumePosition.target(saved: -1, duration: 600))
    }

    @MainActor
    func testLaunchWarmupReusesCatalogWithoutFetchingPrivatePlaybackOrProgress() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://catalog.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: false)
        var paths: [String] = []
        let service = SupabaseService(configuration: config, session: nil) { request in
            paths.append(request.url!.lastPathComponent)
            return (Data("[]".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        await service.warmLaunchCatalog()
        XCTAssertEqual(Set(paths), Set(["videos", "shows", "carousels", "podcasts", "multiview_packages", "public_live_feeds"]))
        XCTAssertEqual(paths.count, 6)
        _ = try await service.fetchVideos()
        _ = try await service.fetchShows()
        XCTAssertEqual(paths.count, 6, "Home should reuse data loaded behind the intro")
    }

    @MainActor
    func testMultiviewAdReportsOneBreakAndDeduplicatesCallbacks() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://ads.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: true)
        let account = UserSession(accessToken: "test-token", refreshToken: "refresh", userId: "owner", expiresAt: .distantFuture)
        var events: [[String: Any]] = []
        var tagRequests = 0
        let delivered = expectation(description: "ordered reporting events"); delivered.expectedFulfillmentCount = 3
        let service = SupabaseService(configuration: config, session: account) { request in
            if request.httpMethod == "POST" {
                events.append(try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]); delivered.fulfill()
                return (Data(), HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!)
            }
            if request.url!.path.hasSuffix("app_settings") {
                return (Data(#"[{"key":"ads_policy","value":"{\"enabled\":true,\"min_gap_minutes\":30}"}]"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            tagRequests += 1
            return (Data(#"[{"id":1,"tag_url":"https://example.com/vast","scope":"multiview","content_id":null,"active":true,"is_test":true,"platforms":["tvos"]}]"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let suite = "PeepAdReporting." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let gate = CSAIGate(defaults: defaults)
        let selected = expectation(description: "single Multiview break")
        let subscription = gate.$tag.dropFirst().sink { if $0 != nil { selected.fulfill() } }
        let run = Task { await gate.run(service: service, scope: "multiview", contentID: "") }
        await fulfillment(of: [selected], timeout: 2)
        gate.record("impression", adID: "ad:0:1")
        gate.record("impression", adID: "ad:0:1")
        gate.record("complete", adID: "ad:0:1")
        gate.record("complete", adID: "ad:0:1")
        gate.finish()
        let allowed = await run.value
        XCTAssertTrue(allowed)
        await fulfillment(of: [delivered], timeout: 2)
        XCTAssertEqual(events.compactMap { $0["event"] as? String }, ["request", "impression", "complete"])
        XCTAssertEqual(Set(events.compactMap { $0["session_id"] as? String }).count, 1)
        XCTAssertTrue(events.allSatisfy { $0["user_id"] as? String == "owner" && $0["content_type"] as? String == "multiview" && $0["is_test"] as? Bool == true })
        let reopened = CSAIGate(defaults: defaults)
        let secondAllowed = await reopened.run(service: service, scope: "multiview", contentID: "")
        XCTAssertTrue(secondAllowed)
        XCTAssertEqual(tagRequests, 1, "Reopening must respect the stored cooldown")
        subscription.cancel()
    }

    func testPosterGridAdaptsToSidebarWithoutChangingPosterWidth() {
        XCTAssertEqual(PosterGrid.columnCount(availableWidth: 1636), 4)
        XCTAssertEqual(PosterGrid.columnCount(availableWidth: 1380), 3)
        XCTAssertEqual(PosterGrid.columnCount(availableWidth: 320), 1)
        XCTAssertEqual(PosterGrid.columnCount(availableWidth: -1), 1)
        XCTAssertEqual(PosterGrid.columnCount(availableWidth: .infinity), 1)
    }

    func testPredictionPointsRoundDecimalHalvesWithoutBinaryDrift() {
        XCTAssertEqual(PredictionPick.potentialReturn(points: 50, odds: 2.05), 103)
        XCTAssertEqual(PredictionPick.potentialReturn(points: 25, odds: 1.90), 48)
        XCTAssertEqual(PredictionPick.potentialReturn(points: 100, odds: 2.05), 205)
        XCTAssertEqual(PredictionPick.potentialReturn(points: 50, odds: .infinity), 0)
    }
    func testPredictionMarketClosesAtDeadlineAndRejectsInvalidOptions() throws {
        let market = try decode(PredictionMarket.self, #"{"id":8,"event_id":3,"question":"Who wins?","status":"open","locks_at":"2026-10-26T22:00:00Z","market_options":[{"id":2,"key":"away","label":"Away","odds":2.05,"sort_order":1},{"id":1,"key":"home","label":"Home","odds":1.9,"sort_order":0}]}"#)
        XCTAssertEqual(market.options.map(\.id), [1,2])
        XCTAssertTrue(market.canPick(at: GuideEntry.date("2026-10-26T21:59:59Z")!))
        XCTAssertFalse(market.canPick(at: GuideEntry.date("2026-10-26T22:00:00Z")!))
        let invalid = try decode(PredictionMarket.self, #"{"id":9,"event_id":3,"question":"Bad price","status":"open","market_options":[{"id":1,"key":"a","label":"A","odds":0},{"id":2,"key":"b","label":"B","odds":2}]}"#)
        XCTAssertFalse(invalid.canPick())
        XCTAssertEqual(PredictionMarket.latest(for: 3, in: [market, invalid])?.id, 9)
    }

    @MainActor
    func testPredictionPicksPersistPerProfileAndRejectDuplicateOrStaleChoice() throws {
        let name = "peep.prediction-test.\(UUID())"
        let defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let event = PredictionDemo.event
        let market = PredictionDemo.market
        let picks = PredictionPicks(scope: "one", defaults: defaults)
        try picks.save(event: event, market: market, option: market.options[0], points: 50)
        XCTAssertEqual(picks.items.first?.potentialPoints, 95)
        XCTAssertThrowsError(try picks.save(event: event, market: market, option: market.options[1], points: 25))
        XCTAssertEqual(PredictionPicks(scope: "one", defaults: defaults).items.count, 1)
        XCTAssertTrue(PredictionPicks(scope: "two", defaults: defaults).items.isEmpty)
        let other = PredictionPicks(scope: "two", defaults: defaults)
        let stale = PredictionOption(id: market.options[0].id, key: "home", label: "Home", odds: 3, sort_order: 0)
        XCTAssertThrowsError(try other.save(event: event, market: market, option: stale, points: 50))
        XCTAssertThrowsError(try other.save(event: event, market: market, option: market.options[0], points: 500))
    }

    @MainActor
    func testPredictionResultUsesSavedOddsAndResolvesOnlyOnce() throws {
        let name = "peep.prediction-result.\(UUID())"
        let defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let picks = PredictionPicks(scope: "one", defaults: defaults)
        try picks.save(event: PredictionDemo.event, market: PredictionDemo.market, option: PredictionDemo.market.options[0], points: 100)
        let settled = try decode(PredictionMarket.self, #"{"id":-1,"event_id":-1,"question":"Who takes the next point?","status":"settled","winning_option_id":-1,"market_options":[{"id":-1,"key":"home","label":"Home","odds":3},{"id":-2,"key":"away","label":"Away","odds":2}]}"#)
        picks.watchingEvent = true
        picks.resolve([settled])
        XCTAssertEqual(picks.items.first?.result, "pending")
        picks.resolve([settled], fromPlayer: true); picks.resolve([settled], fromPlayer: true)
        XCTAssertEqual(picks.items.count, 1)
        XCTAssertEqual(picks.items.first?.result, "won")
        XCTAssertEqual(picks.items.first?.returnPoints, 190)
        XCTAssertEqual(PredictionPicks(scope: "one", defaults: defaults).items.first?.result, "won")
    }

    func testPredictionSnapshotsWaitForVideoAndDrainOnlyOnce() {
        let now = Date(timeIntervalSince1970: 100)
        var queue = PredictionRevealQueue()
        queue.enqueue([PredictionDemo.market], at: now, latency: 8)
        XCTAssertNil(queue.reveal(at: now.addingTimeInterval(8)))
        XCTAssertEqual(queue.reveal(at: now.addingTimeInterval(8.25))?.first?.id, -1)
        XCTAssertNil(queue.reveal(at: now.addingTimeInterval(9)))
        queue.enqueue([], at: now, latency: .infinity)
        XCTAssertEqual(queue.reveal(at: now.addingTimeInterval(0.25)), [])
    }

    @MainActor
    func testPredictionCatalogUsesSharedTablesAndEnvironmentFilter() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://predictions.invalid")!, anonKey: "public-test", streamHost: "media.invalid", isDevelopment: false)
        var paths: [String] = []
        let service = SupabaseService(configuration: config, session: nil) { request in
            let url = request.url!
            let query = Dictionary(uniqueKeysWithValues: URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!.map { ($0.name, $0.value ?? "") })
            paths.append(url.lastPathComponent)
            if url.lastPathComponent == "prediction_events" {
                XCTAssertEqual(query["or"], "(visibility_tier.eq.production,visibility_tier.is.null)")
            } else {
                XCTAssertEqual(query["select"], "*,market_options(*)")
                XCTAssertEqual(query["event_id"], "eq.3")
            }
            return (Data("[]".utf8), HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        _ = try await service.fetchPredictionEvents()
        _ = try await service.fetchPredictionMarkets(eventID: 3)
        XCTAssertEqual(paths, ["prediction_events", "prediction_markets"])
        let event = try decode(PredictionEvent.self, #"{"id":3,"title":"Final","stream_uid":"test_uid","status":"live"}"#)
        XCTAssertEqual(event.playbackURL(host: "media.invalid")?.absoluteString, "https://media.invalid/test_uid/manifest/video.m3u8")
    }

    func testChannelBlackoutWindowAndManualOverride() throws {
        let channel = try decode(Channel.self, #"{"id":1,"name":"News","blackout_message":" Game unavailable ","blackout_starts_at":"2026-10-26T18:00:00-04:00","blackout_ends_at":"2026-10-26T19:00:00-04:00"}"#)
        XCTAssertNil(channel.blackoutMessage(at: GuideEntry.date("2026-10-26T21:59:59Z")!))
        XCTAssertEqual(channel.blackoutMessage(at: GuideEntry.date("2026-10-26T22:00:00Z")!), "Game unavailable")
        XCTAssertNil(channel.blackoutMessage(at: GuideEntry.date("2026-10-26T23:00:00Z")!))
        let manual = try decode(Channel.self, #"{"id":1,"name":"News","blackout_enabled":true,"blackout_message":"  ","blackout_starts_at":"2020-01-01T00:00:00Z","blackout_ends_at":"2020-01-02T00:00:00Z"}"#)
        XCTAssertEqual(manual.blackoutMessage(), "This channel is temporarily unavailable. Please check back soon.")
        let old = try decode(Channel.self, #"{"id":1,"name":"News"}"#)
        XCTAssertNil(old.blackoutMessage())
    }

    @MainActor
    func testBlackoutRemovesBufferedPlaybackAndRestoresLatestTune() {
        let first = URL(string: "https://media.invalid/1.m3u8")!
        let second = URL(string: "https://media.invalid/2.m3u8")!
        let model = PlayerModel(url: first, title: "One")
        defer { model.stop() }
        XCTAssertNotNil(model.player.currentItem)
        model.applyBlackout("Unavailable")
        XCTAssertNil(model.player.currentItem)
        model.play()
        XCTAssertEqual(model.player.rate, 0)
        model.tune(url: second, title: "Two")
        XCTAssertNil(model.player.currentItem)
        model.applyBlackout(nil)
        XCTAssertNil(model.blackoutMessage)
        XCTAssertEqual((model.player.currentItem?.asset as? AVURLAsset)?.url, second)
    }

    @MainActor
    func testMultiviewBlackoutOnlyStopsAffectedTileAndResumesAtEnd() throws {
        let channels = try decode([Channel].self, #"[{"id":1,"name":"One","hls_url":"https://media.invalid/1.m3u8","blackout_starts_at":"2026-10-26T22:00:00Z","blackout_ends_at":"2026-10-26T23:00:00Z","blackout_message":"Game unavailable"},{"id":2,"name":"Two","hls_url":"https://media.invalid/2.m3u8"},{"id":3,"name":"Three","hls_url":"https://media.invalid/3.m3u8"},{"id":4,"name":"Four","hls_url":"https://media.invalid/4.m3u8"}]"#)
        let model = MultiviewModel(session: MultiviewSession(channels: channels, feeds: [], streamHost: "", initialID: 1, initialPair: [1,2,3,4]))
        defer { model.stop() }
        let healthy = model.players[1].currentItem
        model.refreshBlackouts(at: GuideEntry.date("2026-10-26T22:30:00Z")!)
        XCTAssertEqual(model.blackouts[0], "Game unavailable")
        XCTAssertNil(model.players[0].currentItem)
        XCTAssertNil(model.errors[0])
        XCTAssertTrue(model.players[1].currentItem === healthy)
        model.refreshBlackouts(at: GuideEntry.date("2026-10-26T23:00:00Z")!)
        XCTAssertNil(model.blackouts[0])
        XCTAssertNotNil(model.players[0].currentItem)
        XCTAssertTrue(model.players[1].currentItem === healthy)
    }

    func testChannelGridRejectsRapidRepeatsWithoutAccelerating() {
        var moves = RemoteMovePacer(initialRepeatDelay: 0.6, repeatInterval: 0.45, directionChangeDelay: 0.12)
        XCTAssertTrue(moves.accept(.down, at: 10))
        XCTAssertFalse(moves.accept(.down, at: 10.35))
        XCTAssertTrue(moves.accept(.down, at: 10.61))
        XCTAssertFalse(moves.accept(.down, at: 10.85))
        XCTAssertTrue(moves.accept(.down, at: 11.07))
        XCTAssertFalse(moves.accept(.up, at: 11.12))
        XCTAssertTrue(moves.accept(.up, at: 11.20))
    }
    func testAutomaticCategoryRowsPreserveConfiguredRowsAndStableIdentity() throws {
        let channels = try decode([Channel].self, #"[{"id":1,"name":"One","category":"News"},{"id":2,"name":"Two","category":"Outdoor;Sports"},{"id":3,"name":"Three"}]"#)
        let configured = try decode([Carousel].self, #"[{"id":1,"title":"My News","type":"live_channels","pages":"live","filter_value":" NEWS ","enabled":false}]"#)
        let rows = Carousel.automaticLiveRows(channels: channels, configured: configured)
        XCTAssertEqual(rows.map(\.title), ["General", "Outdoor", "Sports"])
        XCTAssertEqual(rows.first?.liveChannels(from: channels).map(\.id), [3])
        let more = try decode([Channel].self, #"[{"id":4,"name":"Four","category":"Kids"}]"#)
        let updated = Carousel.automaticLiveRows(channels: channels + more, configured: configured)
        XCTAssertEqual(rows.last?.id, updated.last?.id)
    }
    @MainActor
    func testFourChannelPackageStaysVisibleWhenOneStreamIsUnsupported() throws {
        let channels = try decode([Channel].self, #"[{"id":1,"name":"One","hls_url":"https://media.invalid/1.m3u8"},{"id":2,"name":"Two","hls_url":"https://media.invalid/2.m3u8"},{"id":3,"name":"Three","hls_url":"http://media.invalid/3.m3u8"},{"id":4,"name":"Four","hls_url":"https://media.invalid/4.m3u8"}]"#)
        let package = try decode(MultiviewPackage.self, #"{"id":"sports","title":"Sports","left_channel_id":1,"right_channel_id":2,"third_channel_id":3,"fourth_channel_id":4}"#)
        XCTAssertEqual(package.pair(in: channels, host: "", feeds: []).map(\.id), [1,2,3,4])
        let model = MultiviewModel(session: MultiviewSession(channels: channels, feeds: [], streamHost: "", initialID: 1, initialPair: [1,2,3,4]))
        defer { model.stop() }
        XCTAssertEqual(model.channels.count, 4)
        XCTAssertNotNil(model.errors[2])
        XCTAssertNil(model.players[2].currentItem)
        XCTAssertNotNil(model.players[0].currentItem)
    }
    func testVerticalFocusKeepsColumnAcrossShorterRows() {
        var position = VerticalFocusPosition(column: 2)
        XCTAssertEqual(position.index(in: 4), 2)
        XCTAssertEqual(position.index(in: 2), 1)
        XCTAssertEqual(position.index(in: 4), 2)
        XCTAssertNil(position.index(in: 0))
        position.column = 1
        XCTAssertEqual(position.index(in: 3), 1)
    }
    func testRemoteMovePacingRejectsSwipeBurstsButAllowsReversingDirection() {
        var pacer = RemoteMovePacer()
        XCTAssertTrue(pacer.accept(.right, at: 10))
        XCTAssertFalse(pacer.accept(.right, at: 10.08))
        XCTAssertFalse(pacer.accept(.right, at: 10.20))
        XCTAssertTrue(pacer.accept(.right, at: 10.35))
        XCTAssertFalse(pacer.accept(.right, at: 10.45))
        XCTAssertTrue(pacer.accept(.right, at: 10.58))
        XCTAssertTrue(pacer.accept(.left, at: 10.65))
        XCTAssertFalse(pacer.accept(.left, at: 10.72))
        XCTAssertTrue(pacer.accept(.down, at: 10.80))
        XCTAssertTrue(pacer.accept(.down, at: 12))
    }
    func testChannelNamesAndCategoriesReadCleanly() {
        XCTAssertEqual(BrowsePresentation.channelName("Dog the Bounty Hunter (1080p)"), "Dog the Bounty Hunter")
        XCTAssertEqual(BrowsePresentation.channelName("Formula 1 AntenaPlay (576p) [Not 24/7]"), "Formula 1 AntenaPlay")
        XCTAssertEqual(BrowsePresentation.channelName("ESPN (United States) HD (720p)"), "ESPN (United States) HD")
        XCTAssertEqual(BrowsePresentation.channelName("FightBox HD"), "FightBox HD")
        XCTAssertEqual(BrowsePresentation.channelName("  (1080p)  "), "(1080p)", "Never blank a name")
        XCTAssertEqual(BrowsePresentation.categories("usa; sports,mma"), ["USA", "Sports", "MMA"])
        XCTAssertEqual(BrowsePresentation.categories("united states"), ["United States"])
        XCTAssertEqual(BrowsePresentation.category("Animation;Classic"), "Animation · Classic")
    }

    func testCardCaptionsSaySomethingThePosterDoesNot() throws {
        let video = try JSONDecoder().decode(Video.self, from: Data(#"{"id":"a","title":"Full Force","category":"documentary","year":2019,"duration":"52 min"}"#.utf8))
        XCTAssertEqual(BrowsePresentation.movieCaption(video), "2019 · Documentary · 52 min")
        let bare = try JSONDecoder().decode(Video.self, from: Data(#"{"id":"b","title":"X"}"#.utf8))
        XCTAssertEqual(BrowsePresentation.movieCaption(bare), "Movie")
        let show = try JSONDecoder().decode(Show.self, from: Data(#"{"id":1,"title":"Lez","category":"comedy","tags":"comedy, Animation ,, animation,Adult"}"#.utf8))
        XCTAssertEqual(BrowsePresentation.showCaption(show), "Series · Comedy")
        XCTAssertEqual(BrowsePresentation.tagChips(show.tags, category: show.category), ["Animation", "Adult"])
    }

    func testAdPolicyReadsAdminRulesAndFallsBackSafely() {
        let rules = AdPolicy.parse(#"{"enabled":true,"min_gap_minutes":5,"live_entry":false,"multiview_entry":true,"midroll_enabled":false}"#)
        XCTAssertEqual(rules.gap, 300)
        XCTAssertFalse(rules.allowsEntry(scope: "live"))
        XCTAssertTrue(rules.allowsEntry(scope: "multiview"))
        XCTAssertTrue(rules.allowsEntry(scope: "movie"))
        XCTAssertFalse(AdPolicy.parse(#"{"enabled":false}"#).allowsEntry(scope: "movie"))
        XCTAssertEqual(AdPolicy.parse(#"{"min_gap_minutes":99999}"#).min_gap_minutes, 1440)
        XCTAssertEqual(AdPolicy.parse("not json").min_gap_minutes, 30)
        XCTAssertTrue(AdPolicy.parse(nil).allowsEntry(scope: "live"))
    }

    func testAdFrequencyHonoursAConfiguredGap() throws {
        let suite = "PeepAdGapTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let now = Date(timeIntervalSince1970: 2_000_000_000)
        let policy = AdFrequencyPolicy(defaults: defaults)
        policy.recordStart(at: now)
        XCTAssertFalse(policy.allowsAd(at: now.addingTimeInterval(299), gap: 300))
        XCTAssertTrue(policy.allowsAd(at: now.addingTimeInterval(300), gap: 300))
        XCTAssertTrue(policy.allowsAd(at: now.addingTimeInterval(1), gap: 0))
    }

    func testAdFrequencyPersistsAcrossInstancesAndExpiresAfterThirtyMinutes() throws {
        let suite = "PeepAdFrequencyTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let now = Date(timeIntervalSince1970: 2_000_000_000)
        let first = AdFrequencyPolicy(defaults: defaults)
        XCTAssertTrue(first.allowsAd(at: now))
        first.recordStart(at: now)
        let reopened = AdFrequencyPolicy(defaults: try XCTUnwrap(UserDefaults(suiteName: suite)))
        XCTAssertFalse(reopened.allowsAd(at: now.addingTimeInterval(1799)))
        XCTAssertTrue(reopened.allowsAd(at: now.addingTimeInterval(1800)))
    }

    @MainActor
    func testMultiviewRecoveryIsBoundedIsolatedAndStopsOnExit() async throws {
        let channels = try JSONDecoder().decode([Channel].self, from: Data(#"[{"id":1,"name":"One","hls_url":"https://media.invalid/1.m3u8"},{"id":2,"name":"Two","hls_url":"https://media.invalid/2.m3u8"}]"#.utf8))
        let model = MultiviewModel(session: MultiviewSession(channels: channels, feeds: [], streamHost: "", initialID: 1))
        defer { model.stop() }
        model.players[1].replaceCurrentItem(with: AVPlayerItem(asset: AVMutableComposition()))
        model.setActive(true)
        model.selectAudio(1)
        let healthy = try XCTUnwrap(model.players[1].currentItem)
        let stale = try XCTUnwrap(model.players[0].currentItem)
        for attempt in 1...2 {
            model.recover(0, item: try XCTUnwrap(model.players[0].currentItem))
            XCTAssertEqual(model.recoveryAttempts[0], attempt)
            try await Task.sleep(for: .milliseconds(2100))
        }
        model.recover(0, item: try XCTUnwrap(model.players[0].currentItem))
        XCTAssertNotNil(model.errors[0])
        XCTAssertEqual(model.recoveryAttempts[0], 2)
        XCTAssertTrue(model.players[1].currentItem === healthy)
        XCTAssertEqual(model.audibleSlot, 1)
        model.retry(0)
        XCTAssertEqual(model.recoveryAttempts[0], 0)
        model.recover(0, item: stale)
        XCTAssertEqual(model.recoveryAttempts[0], 0)
        model.recover(0, item: try XCTUnwrap(model.players[0].currentItem))
        model.stop()
        try await Task.sleep(for: .milliseconds(2100))
        XCTAssertTrue(model.players.allSatisfy { $0.currentItem == nil })
    }

    func testLiveChannelRowsMatchCategoriesAndPreserveManualOrder() throws {
        let channels = try decode([Channel].self, #"[{"id":1,"name":"One","category":"News"},{"id":2,"name":"Two","category":"Outdoor;Sports"},{"id":3,"name":"Three","category":"news"}]"#)
        let news = try decode(Carousel.self, #"{"id":1,"title":"News","type":"live_channels","filter_value":" NEWS "}"#)
        XCTAssertEqual(news.liveChannels(from: channels).map(\.id), [1,3])
        let sports = try decode(Carousel.self, #"{"id":2,"title":"Sports","filter_value":"sports"}"#)
        XCTAssertEqual(sports.liveChannels(from: channels).map(\.id), [2])
        let manual = try decode(Carousel.self, #"{"id":3,"title":"Custom","filter_value":"[{\"id\":\"3\"},{\"id\":1},{\"id\":999},{\"id\":3}]"}"#)
        XCTAssertEqual(manual.liveChannels(from: channels).map(\.id), [3,1])
    }

    func testCSAITagSelectionHonorsExactScopePlatformAndStablePriority() {
        func tag(_ id: Int, _ scope: String, _ content: String? = nil, platforms: [String] = ["tvos"], active: Bool = true, url: String = "https://example.com/vast") -> CSAITag {
            CSAITag(id: id, tag_url: url, scope: scope, content_id: content, active: active, is_test: true, platforms: platforms)
        }
        let tags = [tag(8,"global"),tag(5,"movie"),tag(4,"movie","42"),tag(1,"episode","42")]
        XCTAssertEqual(CSAITag.select(tags, scope: "movie", contentID: "42")?.id, 4)
        XCTAssertEqual(CSAITag.select(tags, scope: "movie", contentID: "99")?.id, 5)
        XCTAssertEqual(CSAITag.select(tags, scope: "live", contentID: "42")?.id, 8)
        XCTAssertNil(CSAITag.select([tag(1,"movie", platforms:["web"]),tag(2,"movie",active:false),tag(3,"movie",url:"http://example.com")],scope:"movie",contentID:"42"))
    }

    @MainActor
    func testCSAIGateCompletesOnceAndCancelDoesNotStartContent() async {
        let config = AppConfiguration(baseURL: URL(string: "https://ads.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: true)
        var writes = 0
        let service = SupabaseService(configuration: config, session: nil) { request in
            if request.httpMethod != "GET" { writes += 1 }
            let data = Data("[{\"id\":1,\"tag_url\":\"https://example.com/vast\",\"scope\":\"movie\",\"content_id\":null,\"active\":true,\"is_test\":true,\"platforms\":[\"tvos\"]}]".utf8)
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let suite = "PeepAdGateTests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let gate = CSAIGate(defaults: defaults)
        let displayed = expectation(description: "ad requested")
        var observation: AnyCancellable? = gate.$tag.dropFirst().sink { if $0 != nil { displayed.fulfill() } }
        let run = Task { await gate.run(service: service, scope: "movie", contentID: "42") }
        await fulfillment(of: [displayed], timeout: 2)
        XCTAssertTrue(gate.blocking)
        gate.record("impression", adID: "ad:0:1")
        gate.finish(); gate.finish()
        let allowed = await run.value
        XCTAssertTrue(allowed); XCTAssertFalse(gate.blocking)
        observation?.cancel()
        let reopened = await gate.run(service: service, scope: "multiview", contentID: "")
        XCTAssertTrue(reopened); XCTAssertNil(gate.tag); XCTAssertFalse(gate.blocking)
        // Reset only this test's isolated cap to exercise cancellation independently.
        defaults.removePersistentDomain(forName: suite)
        let next = expectation(description: "second ad requested")
        observation = gate.$tag.dropFirst().sink { if $0 != nil { next.fulfill() } }
        let cancelled = Task { await gate.run(service: service, scope: "movie", contentID: "42") }
        await fulfillment(of: [next], timeout: 2)
        gate.cancel()
        let shouldPlay = await cancelled.value
        XCTAssertFalse(shouldPlay); XCTAssertFalse(gate.blocking)
        XCTAssertEqual(writes, 0, "Guests use provider tracking without writing internal telemetry")
        observation?.cancel()
    }

    @MainActor
    func testMultiviewIdleTimerRestoresOriginalValueWithoutLosingItOnRepeatedUpdates() {
        var disabled = false
        let timer = MultiviewIdleTimer(read: { disabled }, write: { disabled = $0 })
        timer.keepAwake(true)
        XCTAssertTrue(disabled)
        timer.keepAwake(true)
        timer.keepAwake(true)
        timer.keepAwake(false)
        XCTAssertFalse(disabled, "Repeated grid updates must not replace the original setting with true")
        timer.keepAwake(false)
        XCTAssertFalse(disabled)
        disabled = true
        timer.keepAwake(true)
        timer.keepAwake(false)
        XCTAssertTrue(disabled, "Preserve an existing keep-awake owner")
    }

    @MainActor
    func testMultiviewKeepsAwakeAcrossLayoutsAndRestoresOnInactiveAndClose() throws {
        var disabled = false
        let timer = MultiviewIdleTimer(read: { disabled }, write: { disabled = $0 })
        let channels = try decode([Channel].self, #"[{"id":1,"name":"One","hls_url":"https://media.invalid/1.m3u8"},{"id":2,"name":"Two","hls_url":"https://media.invalid/2.m3u8"},{"id":3,"name":"Three","hls_url":"https://media.invalid/3.m3u8"},{"id":4,"name":"Four","hls_url":"https://media.invalid/4.m3u8"}]"#)
        let model = MultiviewModel(session: MultiviewSession(channels: channels, feeds: [], streamHost: "", initialID: nil, initialPair: [1,2,3,4]), idleTimer: timer)
        defer { model.stop() }
        XCTAssertFalse(disabled)
        model.setActive(true)
        XCTAssertTrue(disabled)
        model.setFullscreen(3)
        XCTAssertTrue(disabled)
        model.setFullscreen(nil)
        model.setScreenCount(2)
        XCTAssertTrue(disabled)
        model.setScreenCount(4)
        XCTAssertTrue(disabled)
        model.setActive(false)
        XCTAssertFalse(disabled)
        model.setActive(true)
        XCTAssertTrue(disabled)
        model.expireStartup()
        XCTAssertTrue(disabled, "Keep the TV awake while automatic reconnection is pending")
        model.retry(0)
        XCTAssertTrue(disabled)
        model.stop()
        XCTAssertFalse(disabled)
    }

    @MainActor
    func testMyListUsesWebContractAndAccountScopedMutations() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://saved.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: false)
        let account = UserSession(accessToken: "token", refreshToken: "refresh", userId: "owner", expiresAt: .distantFuture)
        var rows = [["content_id": "movie-uuid", "content_type": "short"], ["content_id": "movie-uuid", "content_type": "movie"], ["content_id": "12", "content_type": "show"]]
        var methods: [String] = []
        let service = SupabaseService(configuration: config, session: account) { request in
            let method = request.httpMethod ?? "GET"
            methods.append(method)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
            XCTAssertTrue(request.url!.path.hasSuffix("/user_list"))
            let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            if method == "GET" {
                XCTAssertEqual(query.first { $0.name == "user_id" }?.value, "eq.owner")
                XCTAssertEqual(query.first { $0.name == "order" }?.value, "added_at.desc,id.desc")
                return (try JSONSerialization.data(withJSONObject: rows), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            if method == "DELETE" {
                XCTAssertEqual(query.first { $0.name == "user_id" }?.value, "eq.owner")
                XCTAssertEqual(query.first { $0.name == "content_id" }?.value, "eq.movie-uuid")
                XCTAssertEqual(query.first { $0.name == "content_type" }?.value, "in.(movie,short)")
                XCTAssertNil(request.httpBody)
                rows.removeAll { $0["content_id"] == "movie-uuid" }
            } else {
                let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
                XCTAssertEqual(body["user_id"], "owner")
                XCTAssertEqual(body["content_id"], "-830025")
                XCTAssertEqual(body["content_type"], "channel")
                XCTAssertNil(body["profile_id"], "Web My List is account scoped")
                XCTAssertEqual(query.first { $0.name == "on_conflict" }?.value, "user_id,content_id,content_type")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Prefer"), "resolution=ignore-duplicates,return=minimal")
                rows.insert(["content_id": "-830025", "content_type": "channel"], at: 0)
            }
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 204, httpVersion: nil, headerFields: nil)!)
        }
        try await service.refreshSavedList()
        XCTAssertEqual(service.savedItems.count, 2, "Deduplicate legacy short and movie saves")
        XCTAssertTrue(service.isSaved("movie-uuid", type: "movie"))
        try await service.toggleSaved("movie-uuid", type: "movie")
        XCTAssertFalse(service.isSaved("movie-uuid", type: "movie"))
        try await service.toggleSaved("-830025", type: "channel")
        XCTAssertTrue(service.isSaved("-830025", type: "channel"))
        try await service.toggleSaved("-830025", type: "channel", desired: true)
        XCTAssertTrue(service.isSaved("-830025", type: "channel"), "Adding an existing web save must not remove it")
        XCTAssertEqual(methods.filter { $0 == "POST" }.count, 1)
        service.signOut()
        XCTAssertTrue(service.savedItems.isEmpty)
        XCTAssertFalse(service.isSaved("-830025", type: "channel"))
        XCTAssertTrue(service.savingListKeys.isEmpty)
    }

    @MainActor
    func testMyListRejectsGuestAndKeepsFailedSavesOutOfLibrary() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://saved.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: false)
        let guest = SupabaseService(configuration: config, session: nil) { _ in
            XCTFail("Guest saves must not reach the server")
            throw AppError.noSession
        }
        do { try await guest.toggleSaved("a", type: "movie"); XCTFail("Expected sign-in requirement") } catch { }
        let account = UserSession(accessToken: "token", refreshToken: "refresh", userId: "owner", expiresAt: .distantFuture)
        let service = SupabaseService(configuration: config, session: account) { request in
            let get = request.httpMethod == "GET"
            return (get ? Data("[]".utf8) : Data(), HTTPURLResponse(url: request.url!, statusCode: get ? 200 : 403, httpVersion: nil, headerFields: nil)!)
        }
        do { try await service.toggleSaved("a", type: "movie"); XCTFail("Expected failed save") } catch { }
        XCTAssertFalse(service.isSaved("a", type: "movie"))
        XCTAssertTrue(service.savingListKeys.isEmpty, "Failure must allow retry")
    }

    @MainActor
    func testLaunchSoundActuallyStartsAdvancesAndStops() async throws {
        let sound = PeepIntroSound()
        defer { sound.stop() }
        let started = await sound.play()
        XCTAssertTrue(started, sound.lastError ?? "Launch audio did not start")
        XCTAssertTrue(sound.isPlaying)
        XCTAssertEqual(AVAudioSession.sharedInstance().category, .playback)
        try await Task.sleep(for: .milliseconds(180))
        XCTAssertGreaterThan(sound.currentTime, 0.05)
        sound.stop()
        XCTAssertFalse(sound.isPlaying)
    }

    @MainActor
    func testLaunchSoundIsBundledAndDecodesWithoutNetwork() async throws {
        let data = try XCTUnwrap(NSDataAsset(name: "PeepLaunchSound", bundle: .main)).data
        let decoded = try await Task.detached {
            let player = try AVAudioPlayer(data: data, fileTypeHint: AVFileType.wav.rawValue)
            let result = (player.duration, player.numberOfChannels, player.prepareToPlay(), player.isPlaying)
            player.stop()
            return result
        }.value
        XCTAssertEqual(decoded.0, 4.25, accuracy: 0.01)
        XCTAssertEqual(decoded.1, 2)
        XCTAssertTrue(decoded.2)
        XCTAssertFalse(decoded.3)
    }

    @MainActor
    func testWatchProgressUsesSharedAccountContractAndCompletionRules() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://progress.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: false)
        let session = UserSession(accessToken: "test-token", refreshToken: "test-refresh", userId: "owner", expiresAt: .distantFuture)
        var saved: [String: Any] = [:]
        let service = SupabaseService(configuration: config, session: session) { request in
            let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
            if request.httpMethod == "POST" {
                saved = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
                XCTAssertEqual(query.first { $0.name == "on_conflict" }?.value, "user_id,content_id,content_type")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Prefer"), "resolution=merge-duplicates,return=minimal")
                return (Data(), HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!)
            }
            XCTAssertEqual(query.first { $0.name == "user_id" }?.value, "eq.owner")
            XCTAssertEqual(query.first { $0.name == "content_id" }?.value, "eq.movie-id")
            XCTAssertEqual(query.first { $0.name == "content_type" }?.value, "eq.movie")
            XCTAssertEqual(request.timeoutInterval, 5)
            return (Data(#"[{"content_id":"movie-id","content_type":"movie","progress_seconds":120,"duration_seconds":600,"completed":false}]"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let identity = PlaybackIdentity(id: "movie-id", type: "movie")
        let progress = try await service.fetchWatchPosition(identity: identity)
        XCTAssertTrue(try XCTUnwrap(progress).canResume)
        try await service.saveWatchProgress(identity: identity, position: 120, duration: 600, userID: "owner")
        XCTAssertEqual(saved["content_type"] as? String, "movie")
        XCTAssertEqual(saved["completed"] as? Bool, false)
        try await service.saveWatchProgress(identity: identity, position: 550, duration: 600, userID: "owner")
        XCTAssertEqual(saved["completed"] as? Bool, true)
        XCTAssertEqual(service.watchProgressRevision, 2)
        try await service.saveWatchProgress(identity: identity, position: 200, duration: 600, userID: "other-account")
        XCTAssertEqual(service.watchProgressRevision, 2)
        let completed = try JSONDecoder().decode(WatchProgress.self, from: Data(#"{"content_id":"1","content_type":"episode","progress_seconds":550,"duration_seconds":600,"completed":false}"#.utf8))
        XCTAssertFalse(completed.canResume)
    }

    @MainActor
    func testMultiviewLoadsIndependentlyAndRejectsStaleReadiness() throws {
        let channels = try decode([Channel].self, #"[{"id":1,"name":"One","hls_url":"https://media.invalid/1.m3u8"},{"id":2,"name":"Two","hls_url":"https://media.invalid/2.m3u8"},{"id":3,"name":"Three","hls_url":"https://media.invalid/3.m3u8"},{"id":4,"name":"Four","hls_url":"https://media.invalid/4.m3u8"},{"id":5,"name":"Five","hls_url":"https://media.invalid/5.m3u8"}]"#)
        let model = MultiviewModel(session: MultiviewSession(channels: channels, feeds: [], streamHost: "", initialID: nil, initialPair: [1,2,3,4]))
        defer { model.stop() }
        for slot in 0..<3 { model.markVideoReady(slot, item: try XCTUnwrap(model.players[slot].currentItem)) }
        XCTAssertTrue(model.preparing)
        model.selectAudio(2)
        XCTAssertEqual(model.players.filter { !$0.isMuted }.count, 1)
        let stale = try XCTUnwrap(model.players[3].currentItem)
        model.replace(3, with: channels[4])
        model.markVideoReady(3, item: stale)
        XCTAssertFalse(model.videoReady[3])
        XCTAssertTrue(model.preparing)
        model.markVideoReady(3, item: try XCTUnwrap(model.players[3].currentItem))
        XCTAssertFalse(model.preparing)
        XCTAssertEqual(model.players.filter { !$0.isMuted }.count, 1)
        XCTAssertFalse(model.players[3].isMuted)
    }

    @MainActor
    func testMultiviewStartupTimeoutKeepsHealthyFeedsAndAllowsRetry() throws {
        let channels = try decode([Channel].self, #"[{"id":1,"name":"One","hls_url":"https://media.invalid/1.m3u8"},{"id":2,"name":"Two","hls_url":"https://media.invalid/2.m3u8"}]"#)
        let model = MultiviewModel(session: MultiviewSession(channels: channels, feeds: [], streamHost: "", initialID: 1))
        defer { model.stop() }
        model.markVideoReady(0, item: try XCTUnwrap(model.players[0].currentItem))
        model.expireStartup()
        XCTAssertFalse(model.preparing)
        XCTAssertNil(model.errors[0])
        XCTAssertNotNil(model.errors[1])
        XCTAssertEqual(model.players[1].rate, 0)
        model.retry(1)
        XCTAssertNil(model.errors[1])
        XCTAssertFalse(model.preparing, "Retrying one screen must not hide healthy screens again")
    }

    @MainActor
    func testFourScreenMultiviewPreservesOrderAudioAndIndependentPlayers() throws {
        let channels = try JSONDecoder().decode([Channel].self, from: Data(#"[{"id":1,"name":"One","hls_url":"https://media.invalid/1.m3u8"},{"id":2,"name":"Two","hls_url":"https://media.invalid/2.m3u8"},{"id":3,"name":"Three","hls_url":"https://media.invalid/3.m3u8"},{"id":4,"name":"Four","hls_url":"https://media.invalid/4.m3u8"},{"id":5,"name":"Five","hls_url":"https://media.invalid/5.m3u8"}]"#.utf8))
        let package = try JSONDecoder().decode(MultiviewPackage.self, from: Data(#"{"id":"four","title":"Four","left_channel_id":4,"right_channel_id":1,"third_channel_id":3,"fourth_channel_id":2}"#.utf8))
        XCTAssertEqual(package.pair(in: channels, host: "", feeds: []).map(\.id), [4,1,3,2])
        XCTAssertTrue(package.pair(in: Array(channels.prefix(3)), host: "", feeds: []).isEmpty)
        let model = MultiviewModel(session: MultiviewSession(channels: channels, feeds: [], streamHost: "", initialID: nil, initialPair: [4,1,3,2]))
        defer { model.stop() }
        XCTAssertEqual(model.channels.map(\.id), [4,1,3,2])
        XCTAssertEqual(model.players.filter { $0.currentItem != nil }.count, 4)
        for slot in model.channels.indices { model.markVideoReady(slot, item: try XCTUnwrap(model.players[slot].currentItem)) }
        model.selectAudio(3)
        XCTAssertEqual(model.players.filter { !$0.isMuted }.count, 1)
        XCTAssertFalse(model.players[3].isMuted)
        let firstItem = model.players[0].currentItem
        model.replace(3, with: channels[3])
        XCTAssertEqual(model.channels[3].id, 2)
        model.replace(3, with: channels[4])
        XCTAssertEqual(model.channels[3].id, 5)
        XCTAssertTrue(model.players[0].currentItem === firstItem)
        model.setFullscreen(2)
        XCTAssertEqual(model.audibleSlot, 2)
        XCTAssertTrue(model.players.enumerated().filter { $0.offset != 2 }.allSatisfy { $0.element.rate == 0 })
        model.setFullscreen(nil)
        model.setScreenCount(2)
        XCTAssertEqual(model.channels.map(\.id), [4,1])
        XCTAssertNil(model.players[2].currentItem)
        XCTAssertNil(model.players[3].currentItem)
        model.setScreenCount(4)
        XCTAssertEqual(Set(model.channels.map(\.id)).count, 4)
        XCTAssertTrue(model.preparing)
        XCTAssertEqual(model.players.filter { !$0.isMuted }.count, 1)
        for slot in model.channels.indices { model.markVideoReady(slot, item: try XCTUnwrap(model.players[slot].currentItem)) }
        XCTAssertEqual(model.players.filter { !$0.isMuted }.count, 1)
    }

    @MainActor
    func testCuratedMultiviewUsesExactPairAndHidesUnavailablePackages() throws {
        let channels = try JSONDecoder().decode([Channel].self, from: Data(#"[{"id":1,"name":"One","hls_url":"https://media.invalid/one.m3u8"},{"id":2,"name":"Two","hls_url":"https://media.invalid/two.m3u8"},{"id":3,"name":"Three","hls_url":"https://media.invalid/three.m3u8"}]"#.utf8))
        let package = try JSONDecoder().decode(MultiviewPackage.self, from: Data(#"{"id":"package-a","title":"Chosen pair","left_channel_id":3,"right_channel_id":1,"enabled":true}"#.utf8))
        XCTAssertEqual(package.pair(in: channels, host: "", feeds: []).map(\.id), [3,1])
        XCTAssertTrue(package.pair(in: Array(channels.prefix(2)), host: "", feeds: []).isEmpty)
        let session = MultiviewSession(channels: channels, feeds: [], streamHost: "", initialID: nil, initialPair: [3,1])
        let model = MultiviewModel(session: session)
        defer { model.stop() }
        XCTAssertEqual(model.channels.map(\.id), [3,1])
        let row = try JSONDecoder().decode(Carousel.self, from: Data(#"{"id":1,"title":"Picks","type":"multiview","filter_value":"[{\"id\":\"package-a\"}]"}"#.utf8))
        XCTAssertEqual(MultiviewPackage.items(for: row, packages: [package]).map(\.id), ["package-a"])
    }

    @MainActor
    func testMultiviewKeepsOneAudioSourceAndRejectsDuplicateChannels() throws {
        let channels = try decode([Channel].self, #"[{"id":1,"name":"One","hls_url":"https://media.invalid/one.m3u8"},{"id":2,"name":"Two","hls_url":"https://media.invalid/two.m3u8"},{"id":3,"name":"Three","hls_url":"https://media.invalid/three.m3u8"},{"id":4,"name":"Unavailable"}]"#)
        let model = MultiviewModel(session: MultiviewSession(channels: channels, feeds: [], streamHost: "", initialID: 2))
        defer { model.stop() }
        XCTAssertEqual(model.channels.map(\.id), [2, 1])
        for slot in model.channels.indices { model.markVideoReady(slot, item: try XCTUnwrap(model.players[slot].currentItem)) }
        XCTAssertFalse(model.players[0].isMuted)
        XCTAssertTrue(model.players[1].isMuted)
        model.selectAudio(1)
        XCTAssertTrue(model.players[0].isMuted)
        XCTAssertFalse(model.players[1].isMuted)
        model.replace(1, with: channels[1])
        XCTAssertEqual(model.channels.map(\.id), [2, 1])
        model.replace(1, with: channels[2])
        XCTAssertEqual(model.channels.map(\.id), [2, 3])
        XCTAssertEqual(model.audibleSlot, 1)
        model.setFullscreen(0)
        XCTAssertEqual(model.audibleSlot, 0)
        XCTAssertEqual(model.players[1].rate, 0)
        model.stop()
        XCTAssertTrue(model.players.allSatisfy { $0.currentItem == nil && $0.rate == 0 })
    }

    @MainActor
    func testPodcastsUseSharedCatalogAndScopeEpisodes() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://podcasts.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: false)
        let service = SupabaseService(configuration: config, session: nil) { request in
            let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            let payload: String
            if request.url!.path.hasSuffix("/podcasts") {
                XCTAssertEqual(query.first { $0.name == "or" }?.value, "(visibility_tier.eq.production,visibility_tier.is.null)")
                payload = #"[{"id":1,"title":"Published","enabled":true},{"id":2,"title":"Hidden","enabled":false}]"#
            } else {
                XCTAssertEqual(query.first { $0.name == "podcast_id" }?.value, "eq.1")
                XCTAssertEqual(query.first { $0.name == "order" }?.value, "published_at.desc.nullslast,episode_number.desc,id.desc")
                payload = #"[{"id":3,"podcast_id":1,"episode_number":2,"audio_url":"https://media.invalid/episode.mp3"},{"id":4,"podcast_id":1,"audio_url":"javascript:bad"}]"#
            }
            return (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let podcasts = try await service.fetchPodcasts()
        XCTAssertEqual(podcasts.map(\.title), ["Published"])
        let episodes = try await service.fetchPodcastEpisodes(podcastID: 1)
        XCTAssertEqual(episodes.first?.displayTitle, "Episode 2")
        XCTAssertEqual(episodes.first?.audioURL?.pathExtension, "mp3")
        XCTAssertNil(episodes.last?.audioURL)
        let hero = try decode(HomeHero.self, #"{"cta_type":"tab","cta_value":"Podcasts"}"#)
        XCTAssertEqual(hero.tabDestination, 4)
    }

    func testHomeFeaturedMatchesWebPrecedenceAndStableOrder() throws {
        let movies = try decode([Video].self, #"[{"id":"b","title":"B"},{"id":"a","title":"A"}]"#)
        let shows = try decode([Show].self, #"[{"id":2,"title":"Featured series","featured":true}]"#)
        XCTAssertEqual(HomeCatalog.featured(videos: movies, shows: shows)?.id, "show_2")
        XCTAssertEqual(HomeCatalog.featured(videos: movies, shows: [])?.id, "movie_a")
        let featured = try decode([Video].self, #"[{"id":"b","title":"Movie","featured":true}]"#)
        XCTAssertEqual(HomeCatalog.featured(videos: featured, shows: shows)?.id, "movie_b")
        XCTAssertNil(HomeCatalog.featured(videos: [], shows: []))
    }

    func testCatalogSearchRanksTitlesAndMatchesGenresTagsAndAccents() {
        let title = CatalogSearch.score(query: "full force", title: "Full Force", category: "Documentary", tags: ["Comedy"], description: nil)!
        let tag = CatalogSearch.score(query: "full force", title: "Another film", category: nil, tags: ["Full Force"], description: nil)!
        XCTAssertGreaterThan(title, tag)
        XCTAssertNotNil(CatalogSearch.score(query: "comedy", title: "Full Force", category: "Documentary", tags: [" Comedy "], description: nil))
        XCTAssertNotNil(CatalogSearch.score(query: "full documentary", title: "Full Force", category: "Documentary", tags: [], description: nil))
        XCTAssertNotNil(CatalogSearch.score(query: "cafe", title: "Café!", category: nil, tags: [], description: nil))
        XCTAssertNil(CatalogSearch.score(query: "full sports", title: "Full Force", category: "Documentary", tags: [], description: nil))
        XCTAssertNil(CatalogSearch.score(query: "  -- ", title: "Full Force", category: nil, tags: [], description: nil))
    }

    func testHeroFillCanBeLoweredWithoutZoomOrEmptyEdges() {
        let bounds = CGSize(width: 1800, height: 640)
        let centered = HeroVideoFraming.frame(videoSize: CGSize(width: 1920, height: 1080), bounds: bounds, lowerBy: 0)
        let lowered = HeroVideoFraming.frame(videoSize: CGSize(width: 1920, height: 1080), bounds: bounds, lowerBy: 12)
        XCTAssertEqual(lowered.size, centered.size)
        XCTAssertEqual(lowered.minY - centered.minY, 12, accuracy: 0.01)
        XCTAssertLessThanOrEqual(lowered.minY, 0)
        XCTAssertGreaterThanOrEqual(lowered.maxY, bounds.height)
        let exact = HeroVideoFraming.frame(videoSize: bounds, bounds: bounds)
        XCTAssertEqual(exact, CGRect(origin: .zero, size: bounds))
    }

    func testSeriesPlaybackSkipsMissingStreamsAndAdvancesAcrossSeasons() throws {
        let episodes = try decode([Episode].self, #"[{"id":3,"show_id":1,"season":2,"episode_number":1,"url":"https://example.test/next.mp4"},{"id":1,"show_id":1,"season":1,"episode_number":1,"url":"https://example.test/current.mp4"},{"id":2,"show_id":1,"season":1,"episode_number":2}]"#)
        XCTAssertEqual(SeriesPlayback.next(after: episodes[1], in: episodes)?.id, 3)
        XCTAssertNil(SeriesPlayback.next(after: episodes[0], in: episodes))
        let progress = try decode(WatchProgress.self, #"{"content_id":"1","content_type":"episode","progress_seconds":45,"duration_seconds":100,"completed":false}"#)
        XCTAssertTrue(progress.canResume)
        XCTAssertEqual(progress.fraction, 0.45)
        let watched = try decode(WatchProgress.self, #"{"content_id":"1","content_type":"episode","progress_seconds":95,"duration_seconds":100,"completed":true}"#)
        XCTAssertFalse(watched.canResume)
        XCTAssertEqual(watched.fraction, 1)
    }

    @MainActor
    func testNextEpisodePreferencePersistsAndResets() {
        let defaults = UserDefaults(suiteName: "peep-test-next-episode")!
        defer { defaults.removePersistentDomain(forName: "peep-test-next-episode") }
        defaults.removePersistentDomain(forName: "peep-test-next-episode")
        let preferences = PlaybackPreferences(defaults: defaults)
        XCTAssertTrue(preferences.autoplayNext)
        preferences.autoplayNext = false
        XCTAssertFalse(PlaybackPreferences(defaults: defaults).autoplayNext)
        preferences.reset()
        XCTAssertTrue(preferences.autoplayNext)
    }

    func testGenreRowsMatchTagsAndKeepSeriesFilter() throws {
        let movies = try decode([Video].self, #"[{"id":"full-force","title":"Full Force","category":"Documentary","tags":"[\"Comedy\"]"},{"id":"other","title":"Other","tags":["Dark Comedy"]}]"#)
        let shows = try decode([Show].self, #"[{"id":1,"title":"Sassy","category":"Animation","tags":[" comedy "]}]"#)
        let mixed = try decode(Carousel.self, #"{"id":1,"title":"Have a Laugh","type":"category","filter_value":" Comedy "}"#)
        XCTAssertEqual(HomeCatalog.row(mixed, videos: movies, shows: shows).map(\.id), ["movie_full-force", "show_1"])
        let series = try decode(Carousel.self, #"{"id":2,"title":"Laughable Series","type":"category","filter_value":"Comedy","content_type":"shows"}"#)
        XCTAssertEqual(HomeCatalog.row(series, videos: movies, shows: shows).map(\.id), ["show_1"])
        let legacy = try decode(Video.self, #"{"id":"legacy","title":"Legacy","tags":"Drama, Comedy"}"#)
        XCTAssertTrue(HomeCatalogItem.movie(legacy).matchesGenre("comedy"))
        XCTAssertFalse(HomeCatalogItem.movie(legacy).matchesGenre(""))
    }

    func testHomeRowsPreserveMixedPicksAndApplyContentFilters() throws {
        let movies = try decode([Video].self, #"[{"id":"a","title":"A","category":"Horror"},{"id":"b","title":"B","category":"Drama"}]"#)
        let shows = try decode([Show].self, #"[{"id":7,"title":"Series","category":" Horror "}]"#)
        let picks = #"[{"id":7,"type":"show"},{"id":"missing","type":"movie"},{"id":"b","type":"movie"},{"id":"a","type":"movie"}]"#
        let data = try JSONSerialization.data(withJSONObject: ["id": 1, "title": "Selected", "type": "handpicked", "filter_value": picks, "layout": "spotlight"])
        let row = try JSONDecoder().decode(Carousel.self, from: data)
        XCTAssertEqual(HomeCatalog.row(row, videos: movies, shows: shows).map(\.id), ["show_7", "movie_b", "movie_a"])
        XCTAssertEqual(row.layout, "spotlight")
        let category = try decode(Carousel.self, #"{"id":2,"title":"Horror","type":"category","filter_value":" HORROR ","content_type":"shows"}"#)
        XCTAssertEqual(HomeCatalog.row(category, videos: movies, shows: shows).map(\.id), ["show_7"])
        let trending = try decode(Carousel.self, #"{"id":3,"title":"Trending","type":"trending"}"#)
        XCTAssertEqual(HomeCatalog.row(trending, videos: movies, shows: shows).map(\.id), ["show_7", "movie_b", "movie_a"])
        let unsupported = try decode(Carousel.self, #"{"id":4,"title":"Continue","type":"continue"}"#)
        XCTAssertTrue(HomeCatalog.row(unsupported, videos: movies, shows: shows).isEmpty)
    }

    @MainActor
    func testHomeHeroReadsOnlyPublicSettingAndHandlesMalformedValue() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://home-test.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: true)
        for value in [#"{"enabled":true,"title":"Admin promo","cta_type":"tab","cta_value":"Streams"}"#, "broken"] {
            let service = SupabaseService(configuration: config, session: nil) { request in
                XCTAssertEqual(request.httpMethod, "GET")
                XCTAssertEqual(request.url?.path, "/rest/v1/app_settings")
                let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
                XCTAssertTrue(query.contains { $0.name == "select" && $0.value == "key,value" })
                XCTAssertTrue(query.contains { $0.name == "key" && $0.value == "eq.home_hero" })
                let data = try JSONSerialization.data(withJSONObject: [["key": "home_hero", "value": value]])
                return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            let hero = try await service.fetchHomeHero()
            if value == "broken" { XCTAssertNil(hero) }
            else { XCTAssertEqual(hero?.title, "Admin promo"); XCTAssertEqual(hero?.tabDestination, 3) }
        }
        let browserOnly = try decode(HomeHero.self, #"{"cta_type":"tab","cta_value":"Predictions"}"#)
        XCTAssertNil(browserOnly.tabDestination)
    }

    func testRailLeftExpandsAndRightEntersContent() {
        var state = RailNavigationState()
        state.activate(3)
        state.returnToRail()
        XCTAssertTrue(state.expanded)
        XCTAssertFalse(state.inContent)
        state.right()
        XCTAssertFalse(state.expanded)
        XCTAssertTrue(state.inContent)
        state.returnToRail()
        XCTAssertEqual(state.selected, 3)
        XCTAssertTrue(state.expanded)
        XCTAssertFalse(state.inContent)
        state.returnToRail()
        XCTAssertTrue(state.expanded)
    }

    func testRailRightEntersContentWithoutExpandingFirst() {
        var state = RailNavigationState()
        state.right()
        XCTAssertFalse(state.expanded)
        XCTAssertTrue(state.inContent)
    }

    func testBrowseCategoryNormalizationAndDemoIdentification() {
        XCTAssertEqual(BrowsePresentation.categories(" Animation;Classic | Sports, "), ["Animation", "Classic", "Sports"])
        XCTAssertEqual(BrowsePresentation.category("Animation;Classic"), "Animation · Classic")
        XCTAssertNil(BrowsePresentation.category(" ; "))
        XCTAssertTrue(BrowsePresentation.isDemo("DEMO — Playback test"))
        XCTAssertFalse(BrowsePresentation.isDemo("The Lucifer Complex"))
    }

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    func testSeriesNextUpResumesFurthestThenFollowsLastFinishedAcrossSeasons() throws {
        let e1 = try decode(Episode.self, #"{"id":1,"show_id":1,"season":1,"episode_number":1,"url":"https://m.example.com/1.m3u8"}"#)
        let e2 = try decode(Episode.self, #"{"id":2,"show_id":1,"season":1,"episode_number":2,"url":"https://m.example.com/2.m3u8"}"#)
        let e3 = try decode(Episode.self, #"{"id":3,"show_id":1,"season":2,"episode_number":1,"url":"https://m.example.com/3.m3u8"}"#)
        let unreleased = try decode(Episode.self, #"{"id":4,"show_id":1,"season":2,"episode_number":2}"#)
        let done = try decode(WatchProgress.self, #"{"content_id":"x","content_type":"episode","progress_seconds":95,"duration_seconds":100,"completed":true}"#)
        let partial = try decode(WatchProgress.self, #"{"content_id":"x","content_type":"episode","progress_seconds":45,"duration_seconds":100,"completed":false}"#)
        let all = [unreleased, e3, e2, e1]
        XCTAssertEqual(SeriesPlayback.nextUp(in: all, progress: [:])?.id, 1)
        XCTAssertEqual(SeriesPlayback.nextUp(in: all, progress: ["1": done])?.id, 2)
        XCTAssertEqual(SeriesPlayback.nextUp(in: all, progress: ["1": done, "2": done])?.id, 3)             // crosses into season 2
        XCTAssertEqual(SeriesPlayback.nextUp(in: all, progress: ["1": done, "3": partial])?.id, 3)          // an unfinished episode wins
        XCTAssertEqual(SeriesPlayback.nextUp(in: all, progress: ["1": done, "2": done, "3": done])?.id, 1)  // a finished series starts again
        XCTAssertNil(SeriesPlayback.nextUp(in: [unreleased], progress: [:]))
    }

    func testPodcastEpisodesHideScheduledOnesAndListNewestFirst() throws {
        let old = try decode(PodcastEpisode.self, #"{"id":1,"podcast_id":1,"episode_number":1,"published_at":"2026-01-01T00:00:00Z"}"#)
        let newer = try decode(PodcastEpisode.self, #"{"id":2,"podcast_id":1,"episode_number":2,"published_at":"2026-02-01T00:00:00Z"}"#)
        let scheduled = try decode(PodcastEpisode.self, #"{"id":3,"podcast_id":1,"episode_number":3,"published_at":"2030-01-01T00:00:00Z"}"#)
        let undated = try decode(PodcastEpisode.self, #"{"id":4,"podcast_id":1,"episode_number":9}"#)
        let now = GuideEntry.date("2026-03-01T00:00:00Z")!
        XCTAssertEqual(PodcastSchedule.visible([old, scheduled, undated, newer], now: now).map(\.id), [2, 1, 4])
        XCTAssertEqual(PlayerModel.metadataItems(title: "Fallback", metadata: nil).count, 1)
        XCTAssertEqual(PlayerModel.metadataItems(title: "x", metadata: PlaybackMetadata(title: "Ep", subtitle: "Show", description: "")).map { $0.identifier }, [.commonIdentifierTitle, .iTunesMetadataTrackSubTitle])
    }

    func testConfigurationRejectsRetiredProjectsAndSearchIgnoresTinyDescriptionHits() {
        XCTAssertTrue(AppConfiguration.isLegacyHost("IUOZUJWTUZUWUBHSNHIX.supabase.co"))
        XCTAssertFalse(AppConfiguration.isLegacyHost("cuwdyedmmnpklufduaho.supabase.co"))
        XCTAssertNil(CatalogSearch.score(query: "th", title: "Full Force", category: nil, tags: [], description: "the thing"))
        XCTAssertNotNil(CatalogSearch.score(query: "thing", title: "Full Force", category: nil, tags: [], description: "the thing"))
        XCTAssertNotNil(CatalogSearch.score(query: "fu", title: "Full Force", category: nil, tags: [], description: nil))
    }

    @MainActor
    func testCatalogReadRenewsRevokedTokenAndRetriesOnce() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://renew.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: false)
        let session = UserSession(accessToken: "stale", refreshToken: "refresh-1", userId: "owner", expiresAt: .distantFuture)
        var calls: [String] = []
        let service = SupabaseService(configuration: config, session: session, persistSession: { XCTAssertEqual($0.accessToken, "fresh") }) { request in
            let auth = request.value(forHTTPHeaderField: "Authorization") ?? ""
            if request.url!.path.contains("/auth/v1/token") {
                calls.append("refresh")
                return (Data(#"{"access_token":"fresh","refresh_token":"refresh-2","expires_in":3600,"user":{"id":"owner"}}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            calls.append(auth)
            let status = auth == "Bearer fresh" ? 200 : 401
            return (Data("[]".utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
        let rows: [WatchProgress] = try await service.get("watch_progress", query: ["user_id": "eq.owner"])
        XCTAssertTrue(rows.isEmpty)
        XCTAssertEqual(calls, ["Bearer stale", "refresh", "Bearer fresh"])
        XCTAssertEqual(service.session?.accessToken, "fresh")
    }

    func testChannelSurfingWrapsAndSkipsUnplayableChannels() throws {
        let a = try decode(Channel.self, #"{"id":1,"name":"A","hls_url":"https://s.example.com/a.m3u8"}"#)
        let b = try decode(Channel.self, #"{"id":2,"name":"B"}"#)
        let c = try decode(Channel.self, #"{"id":3,"name":"C","hls_url":"https://s.example.com/c.m3u8"}"#)
        let playable: (Channel) -> Bool = { $0.playbackURL(streamHost: "", feeds: []) != nil }
        XCTAssertEqual(LiveSurf.neighbor(of: 1, in: [a, b, c], step: 1, playable: playable)?.id, 3)   // skips the channel with no stream
        XCTAssertEqual(LiveSurf.neighbor(of: 3, in: [a, b, c], step: 1, playable: playable)?.id, 1)   // wraps around
        XCTAssertEqual(LiveSurf.neighbor(of: 1, in: [a, b, c], step: -1, playable: playable)?.id, 3)
        XCTAssertEqual(LiveSurf.neighbor(of: 9, in: [a, b, c], step: 1, playable: playable)?.id, 1)   // current channel filtered out of the list
        XCTAssertNil(LiveSurf.neighbor(of: 1, in: [a, b], step: 1, playable: playable))
    }

    func testUpNextProposalLeadsByThirtySecondsAndSkipsShortOrUnknownItems() {
        XCTAssertNil(UpNextTiming.transitionTime(duration: .nan))
        XCTAssertNil(UpNextTiming.transitionTime(duration: 45))
        XCTAssertEqual(UpNextTiming.transitionTime(duration: 90), 81)      // final tenth of a short item
        XCTAssertEqual(UpNextTiming.transitionTime(duration: 1500), 1470)  // last 30 seconds otherwise
    }

    func testRelatedTitlesRankLikeWebAndSkipSelfAndUnrelated() throws {
        let source = try decode(Video.self, #"{"id":"a","title":"A","category":"Comedy","tags":["Family","road"],"year":2001,"rating":"PG"}"#)
        let sameGenre = try decode(Video.self, #"{"id":"b","title":"B","category":"comedy","year":1990}"#)
        let tagsAndYear = try decode(Video.self, #"{"id":"c","title":"C","category":"Drama","tags":"family, Road","year":2003,"rating":"PG"}"#)
        let unrelated = try decode(Video.self, #"{"id":"d","title":"D","category":"Horror","year":1950}"#)
        XCTAssertEqual(RelatedTitles.similarity(source, sameGenre), 46)   // category 40 + 11 years apart 6
        XCTAssertEqual(RelatedTitles.similarity(source, tagsAndYear), 48) // two tags 30 + 2 years 10 + rating 8
        XCTAssertEqual(RelatedTitles.similarity(source, unrelated), 0)
        XCTAssertEqual(RelatedTitles.rank(source, in: [unrelated, source, sameGenre, tagsAndYear]).map(\.id), ["c", "b"])
        XCTAssertEqual(RelatedTitles.rank(source, in: [sameGenre, tagsAndYear], limit: 1).map(\.id), ["c"])
        XCTAssertTrue(RelatedTitles.rank(source, in: [source]).isEmpty)
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
    func testSurfGuideSortsAndKeepsChannelsSeparate() throws {
        let entries = try decode([GuideEntry].self, #"[{"id":3,"channel_id":1,"title":"Next","start_time":"2026-10-20T14:00:00Z","end_time":"2026-10-20T15:00:00Z"},{"id":2,"channel_id":2,"title":"Other","start_time":"2026-10-20T13:00:00Z","end_time":"2026-10-20T14:00:00Z"},{"id":1,"channel_id":1,"title":"Now","start_time":"2026-10-20T13:00:00Z","end_time":"2026-10-20T14:00:00Z"}]"#)
        let now = try XCTUnwrap(GuideEntry.date("2026-10-20T13:30:00Z"))
        let programs = ChannelPrograms(entries: entries, channelID: 1, now: now)
        XCTAssertEqual(programs.current?.id, 1)
        XCTAssertEqual(programs.next?.id, 3)
        let absent = ChannelPrograms(entries: entries, channelID: 99, now: now)
        XCTAssertNil(absent.current)
        XCTAssertNil(absent.next)
    }

    func testArchiveWebpagesAreUnavailableButDirectMediaIsPreserved() {
        XCTAssertNil(MediaURL.playback("https://archive.org/details/example"))
        XCTAssertNil(MediaURL.playback("https://archive.org/embed/example"))
        XCTAssertNotNil(MediaURL.playback("https://archive.org/download/example/movie.mp4"))
    }
    func testCarouselPagesAndMixedIdentifierTypes() throws {
        let row = try JSONDecoder().decode(Carousel.self, from: Data(#"{"id":1,"title":"Spotlight","type":"handpicked","pages":"home,series","filter_value":"[{\"id\":12},{\"id\":\"abc\",\"type\":\"movie\"}]"}"#.utf8))
        XCTAssertTrue(row.isHome)
        XCTAssertEqual(row.picks?.map { $0.id.value }, ["12", "abc"])
        let excluded = try JSONDecoder().decode(Carousel.self, from: Data(#"{"id":2,"title":"Hidden","pages":""}"#.utf8))
        XCTAssertTrue(excluded.isHome)
    }
    func testProfileUpdateValidatesAndDoesNotSendEntitlements() throws {
        _ = try AccountProfileUpdate(name: "Viewer", avatarID: "a28")
        let update = try AccountProfileUpdate(name: "  Viewer  ", avatarID: "a12")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(update)) as? [String: Any])
        XCTAssertEqual(Set(body.keys), Set(["full_name", "avatar_id", "avatar_url"]))
        XCTAssertEqual(body["full_name"] as? String, "Viewer")
        XCTAssertTrue(body["avatar_url"] is NSNull)
        let nameOnly = try AccountProfileUpdate(name: "Viewer", avatarID: nil)
        let preserved = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(nameOnly)) as? [String: Any])
        XCTAssertEqual(Set(preserved.keys), Set(["full_name"]))
        XCTAssertThrowsError(try AccountProfileUpdate(name: "  ", avatarID: nil))
        XCTAssertThrowsError(try AccountProfileUpdate(name: String(repeating: "x", count: 81), avatarID: nil))
        XCTAssertThrowsError(try AccountProfileUpdate(name: "Viewer", avatarID: "admin"))
    }

    @MainActor
    func testOwnProfileSaveAndReloadWithMockTransport() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://profile-test.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: true)
        let session = UserSession(accessToken: "test-token", refreshToken: "test-refresh", userId: "owner", expiresAt: .distantFuture)
        var savedName = "Before"
        var savedAvatar = "a5"
        let service = SupabaseService(configuration: config, session: session) { request in
            XCTAssertEqual(request.url?.host, "profile-test.invalid")
            XCTAssertEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "id" })?.value, "eq.owner")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
            if request.httpMethod == "PATCH" {
                let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: request.httpBody!) as? [String: Any])
                savedName = payload["full_name"] as! String
                savedAvatar = payload["avatar_id"] as! String
            }
            let data = try JSONSerialization.data(withJSONObject: [["id": "owner", "email": "qa@example.invalid", "full_name": savedName, "avatar_id": savedAvatar]])
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let before = try await service.fetchAccountProfile()
        XCTAssertEqual(before.full_name, "Before")
        let saved = try await service.updateAccountProfile(name: "After", avatarID: "a12")
        let reloaded = try await service.fetchAccountProfile()
        XCTAssertEqual(saved, reloaded)
        XCTAssertEqual(reloaded.full_name, "After")
        XCTAssertEqual(reloaded.avatar_id, "a12")
    }

    @MainActor
    func testProfileSaveRejectsSignedOutDeniedEmptyAndOtherOwnerResponses() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://profile-test.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: true)
        let session = UserSession(accessToken: "test-token", refreshToken: "test-refresh", userId: "owner", expiresAt: .distantFuture)
        for (status, body) in [(403, "{}"), (200, "[]"), (200, "[{\"id\":\"someone-else\"}]")] {
            let service = SupabaseService(configuration: config, session: session) { request in
                (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
            do { _ = try await service.updateAccountProfile(name: "Viewer", avatarID: nil); XCTFail("Must not report success") }
            catch { /* Rejected as expected. */ }
        }
        let signedOut = SupabaseService(configuration: config, session: nil) { _ in
            XCTFail("Signed-out request must not reach the network")
            throw AppError.noSession
        }
        do { _ = try await signedOut.updateAccountProfile(name: "Viewer", avatarID: nil); XCTFail("Requires authentication") }
        catch { }
    }


    @MainActor
    func testPlaybackPreferenceDefaultsPersistenceAndScopedReset() throws {
        let domain = "peep-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: domain))
        defer { defaults.removePersistentDomain(forName: domain) }
        defaults.set("keep-session", forKey: "peep_tv_profile_id")
        let settings = PlaybackPreferences(defaults: defaults)
        XCTAssertTrue(settings.startAutomatically)
        XCTAssertEqual(settings.quality, .automatic)
        XCTAssertEqual(settings.subtitles, .system)
        settings.startAutomatically = false
        settings.quality = .dataSaver
        settings.subtitles = .on
        let restored = PlaybackPreferences(defaults: defaults)
        XCTAssertFalse(restored.startAutomatically)
        XCTAssertEqual(restored.quality, .dataSaver)
        XCTAssertEqual(restored.subtitles, .on)
        restored.reset()
        let reset = PlaybackPreferences(defaults: defaults)
        XCTAssertTrue(reset.startAutomatically)
        XCTAssertEqual(reset.quality, .automatic)
        XCTAssertEqual(reset.subtitles, .system)
        XCTAssertEqual(defaults.string(forKey: "peep_tv_profile_id"), "keep-session")
        defaults.set("unknown", forKey: "peep_tv_playback_quality")
        XCTAssertEqual(PlaybackPreferences(defaults: defaults).quality, .automatic)
    }

    @MainActor
    func testPlaybackPreferencesApplyToPlayerAndNewChannelItems() throws {
        let domain = "peep-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: domain))
        defer { defaults.removePersistentDomain(forName: domain) }
        let settings = PlaybackPreferences(defaults: defaults)
        settings.quality = .dataSaver
        settings.startAutomatically = false
        let player = PlayerModel(url: URL(fileURLWithPath: "/nonexistent-test.mp4"), title: "Test", preferences: settings)
        defer { player.stop() }
        player.startIfEnabled()
        XCTAssertEqual(player.player.rate, 0)
        XCTAssertEqual(player.player.currentItem?.preferredPeakBitRate, 2_000_000)
        settings.quality = .automatic
        player.tune(url: URL(fileURLWithPath: "/another-test.mp4"), title: "Next channel")
        XCTAssertEqual(player.player.currentItem?.preferredPeakBitRate, 0)
        XCTAssertEqual(player.player.rate, 0)
    }

    @MainActor
    func testR2VODSignsThroughEntitlementsAndFailsClosed() async throws {
        let base = URL(string: "https://vod.invalid")!
        let config = AppConfiguration(baseURL: base, anonKey: "public-test", streamHost: "", isDevelopment: false)
        let source = base.appendingPathComponent("functions/v1/r2-vod/play/12345678-1234-1234-1234-123456789abc")
        let guest = SupabaseService(configuration: config, session: nil) { _ in
            XCTFail("Guest must not request R2 signing"); throw AppError.noSession
        }
        do { _ = try await guest.resolveVODPlayback(source); XCTFail("Require sign-in") } catch { }
        let account = UserSession(accessToken: "token", refreshToken: "refresh", userId: "viewer", expiresAt: .distantFuture)
        let service = SupabaseService(configuration: config, session: account) { request in
            XCTAssertEqual(request.url?.path, "/functions/v1/r2-vod")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            XCTAssertEqual(body["action"] as? String, "playback")
            let data = try JSONSerialization.data(withJSONObject: ["signedURL": "https://account.r2.cloudflarestorage.com/private/video.mp4?X-Amz-Signature=test"])
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let signed = try await service.resolveVODPlayback(source)
        XCTAssertEqual(signed.host, "account.r2.cloudflarestorage.com")
        for value in ["https://evil.invalid/file?X-Amz-Signature=x", "https://account.r2.cloudflarestorage.com/file"] {
            let invalid = SupabaseService(configuration: config, session: account) { request in
                let data = try JSONSerialization.data(withJSONObject: ["signedURL": value])
                return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            do { _ = try await invalid.resolveVODPlayback(source); XCTFail("Reject invalid signed response") } catch { }
        }
    }

    @MainActor
    func testR2VODDistinguishesEndedSessionFromEntitlementDenial() async throws {
        let base = URL(string: "https://vod.invalid")!
        let config = AppConfiguration(baseURL: base, anonKey: "public-test", streamHost: "", isDevelopment: false)
        let source = base.appendingPathComponent("functions/v1/r2-vod/play/12345678-1234-1234-1234-123456789abc")
        let account = UserSession(accessToken: "token", refreshToken: "refresh", userId: "viewer", expiresAt: .distantFuture)
        for (status, message) in [(403, "does not have access"), (503, "Couldn't prepare")] {
            let service = SupabaseService(configuration: config, session: account) { request in
                (Data(), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
            do { _ = try await service.resolveVODPlayback(source); XCTFail("Must reject failed signing") }
            catch { XCTAssertTrue(error.localizedDescription.contains(message), error.localizedDescription) }
        }
    }

    @MainActor
    func testR2PlaybackRenewsRejectedTokenAndRetriesOnce() async throws {
        let base = URL(string: "https://vod.invalid")!
        let config = AppConfiguration(baseURL: base, anonKey: "public-test", streamHost: "", isDevelopment: false)
        let source = base.appendingPathComponent("functions/v1/r2-vod/play/12345678-1234-1234-1234-123456789abc")
        let account = UserSession(accessToken: "old", refreshToken: "refresh", userId: "viewer", expiresAt: .distantFuture)
        var signingCalls = 0
        var refreshCalls = 0
        let service = SupabaseService(configuration: config, session: account, persistSession: { XCTAssertEqual($0.refreshToken, "rotated") }) { request in
            if request.url?.path == "/auth/v1/token" {
                refreshCalls += 1
                XCTAssertEqual(request.url?.query, "grant_type=refresh_token")
                return (Data(#"{"access_token":"renewed","refresh_token":"rotated","expires_in":3600,"user":{"id":"viewer"}}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            signingCalls += 1
            let status = signingCalls == 1 ? 401 : 200
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), signingCalls == 1 ? "Bearer old" : "Bearer renewed")
            return (Data(#"{"signedURL":"https://account.r2.cloudflarestorage.com/private/video.mp4?X-Amz-Signature=test"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
        let signed = try await service.resolveVODPlayback(source)
        XCTAssertEqual(signed.host, "account.r2.cloudflarestorage.com")
        XCTAssertEqual(signingCalls, 2)
        XCTAssertEqual(refreshCalls, 1)
        XCTAssertFalse(service.needsReauthentication)
        XCTAssertEqual(service.session?.accessToken, "renewed")
    }

    @MainActor
    func testR2PlaybackRevokedSessionOpensSignInButNetworkFailurePreservesSession() async throws {
        let base = URL(string: "https://vod.invalid")!
        let config = AppConfiguration(baseURL: base, anonKey: "public-test", streamHost: "", isDevelopment: false)
        let source = base.appendingPathComponent("functions/v1/r2-vod/play/12345678-1234-1234-1234-123456789abc")
        let account = UserSession(accessToken: "old", refreshToken: "refresh", userId: "viewer", expiresAt: .distantFuture)
        for refreshStatus in [400, 503] {
            var calls = 0
            let service = SupabaseService(configuration: config, session: account) { request in
                calls += 1
                return (Data(), HTTPURLResponse(url: request.url!, statusCode: request.url?.path == "/auth/v1/token" ? refreshStatus : 401, httpVersion: nil, headerFields: nil)!)
            }
            do { _ = try await service.resolveVODPlayback(source); XCTFail("Must reject") } catch { }
            XCTAssertEqual(calls, 2)
            XCTAssertEqual(service.needsReauthentication, refreshStatus == 400)
            XCTAssertEqual(service.session == nil, refreshStatus == 400)
        }
    }

    @MainActor
    func testProtectedVODSignsOnlyConfiguredProjectAndRequiresSession() async throws {
        let base = URL(string: "https://vod.invalid")!
        let config = AppConfiguration(baseURL: base, anonKey: "public-test", streamHost: "", isDevelopment: false)
        let path = "movies/12345678-1234-1234-1234-123456789abc/playback/version.mp4"
        let source = base.appendingPathComponent("storage/v1/object/authenticated/vod-playback/" + path)
        let guest = SupabaseService(configuration: config, session: nil) { _ in
            XCTFail("Guest must not request a signature")
            throw AppError.noSession
        }
        do { _ = try await guest.resolveVODPlayback(source); XCTFail("Expected sign-in requirement") } catch { }
        let external = URL(string: "https://stream.invalid/film.m3u8")!
        let unchanged = try await guest.resolveVODPlayback(external)
        XCTAssertEqual(unchanged, external)
        let account = UserSession(accessToken: "token", refreshToken: "refresh", userId: "viewer", expiresAt: .distantFuture)
        let service = SupabaseService(configuration: config, session: account) { request in
            XCTAssertEqual(request.url?.path, "/storage/v1/object/sign/vod-playback/" + path)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
            XCTAssertEqual(request.httpMethod, "POST")
            let payload = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Int]
            XCTAssertEqual(payload["expiresIn"], 21600)
            let data = try JSONSerialization.data(withJSONObject: ["signedURL": "/object/sign/vod-playback/" + path + "?token=test"])
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let signed = try await service.resolveVODPlayback(source)
        XCTAssertEqual(signed.path, "/storage/v1/object/sign/vod-playback/" + path)
        XCTAssertEqual(signed.query, "token=test")
        let denied = SupabaseService(configuration: config, session: account) { request in
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!)
        }
        do { _ = try await denied.resolveVODPlayback(source); XCTFail("Denied playback must not fall back to a raw URL") } catch { }
    }

    @MainActor
    func testPrivateHeroUsesSourceBucketAndRejectsForeignSignedResponses() async throws {
        let config = AppConfiguration(baseURL: URL(string: "https://hero.invalid")!, anonKey: "public-test", streamHost: "", isDevelopment: true)
        let account = UserSession(accessToken: "token", refreshToken: "refresh", userId: "viewer", expiresAt: .distantFuture)
        let path = "inbox/12345678-1234-1234-1234-123456789abc/trailers/hero.mp4"
        let url = config.baseURL.appendingPathComponent("storage/v1/object/authenticated/vod-sources/" + path)
        let service = SupabaseService(configuration: config, session: account) { request in
            XCTAssertEqual(request.url?.path, "/storage/v1/object/sign/vod-sources/" + path)
            let payload = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Int]
            XCTAssertEqual(payload["expiresIn"], 3600)
            let data = try JSONSerialization.data(withJSONObject: ["signedURL": "/object/sign/vod-sources/" + path + "?token=hero"])
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let signed = try await service.resolveVODPlayback(url, expiresIn: 3600)
        XCTAssertEqual(signed.path, "/storage/v1/object/sign/vod-sources/" + path)
        for response in ["https://other.invalid/storage/v1/object/sign/vod-sources/test?token=x", "/object/sign/vod-playback/test?token=x"] {
            let denied = SupabaseService(configuration: config, session: account) { request in
                let data = try JSONSerialization.data(withJSONObject: ["signedURL": response])
                return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            do { _ = try await denied.resolveVODPlayback(url); XCTFail("Reject a different host or bucket") } catch { }
        }
    }

}
