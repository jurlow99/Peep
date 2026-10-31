import SwiftUI
import AVKit

struct PredictionPlaybackSession: Identifiable {
    let id = UUID()
    let event: PredictionEvent
    let markets: [PredictionMarket]
    let picks: PredictionPicks
}

struct PredictionsView: View {
    let isPresenting: Bool
    let openEvent: (PredictionPlaybackSession) -> Void
    @EnvironmentObject private var supabase: SupabaseService
    var body: some View {
        let scope = "\(supabase.configuration?.baseURL.host ?? "")|\(supabase.session?.userId ?? "guest")|\(supabase.activeProfile?.id ?? "default")"
        PredictionsContent(scope: scope, isPresenting: isPresenting, openEvent: openEvent).id(scope)
    }
}

private enum PredictionTab: String, CaseIterable {
    case all = "All events", live = "Live", upcoming = "Upcoming", results = "Results", picks = "Your picks"
}

private struct PredictionsContent: View {
    @EnvironmentObject private var supabase: SupabaseService
    @Environment(\.catalogRevision) private var catalogRevision
    @Environment(\.contentEntryActive) private var active
    @Environment(\.returnToSidebar) private var returnToSidebar
    @StateObject private var picks: PredictionPicks
    @State private var events: [PredictionEvent] = []
    @State private var markets: [PredictionMarket] = []
    @State private var tab = PredictionTab.all
    let isPresenting: Bool
    let openEvent: (PredictionPlaybackSession) -> Void
    @State private var loading = true
    @State private var error: String?
    init(scope: String, isPresenting: Bool, openEvent: @escaping (PredictionPlaybackSession) -> Void) {
        _picks = StateObject(wrappedValue: PredictionPicks(scope: scope))
        self.isPresenting = isPresenting
        self.openEvent = openEvent
    }
    private func open(_ event: PredictionEvent) {
        openEvent(PredictionPlaybackSession(event: event, markets: markets.filter { $0.event_id == event.id }, picks: picks))
    }
    private var visible: [PredictionEvent] {
        events.filter {
            tab == .all || (tab == .live && $0.status == "live") ||
            (tab == .upcoming && $0.status == "scheduled") || (tab == .results && $0.status == "ended")
        }.sorted {
            let left = $0.status == "live" ? 0 : $0.status == "scheduled" ? 1 : 2
            let right = $1.status == "live" ? 0 : $1.status == "scheduled" ? 1 : 2
            if left != right { return left < right }
            return ($0.startDate ?? .distantFuture, $0.id) < ($1.startDate ?? .distantFuture, $1.id)
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Predictions").font(.system(size: 48, weight: .bold, design: .rounded))
                        Text("Watch the moment. Make the call.").font(.system(size: 23)).foregroundStyle(.secondary)
                    }
                    Spacer()
                    previewBadge
                }
                HStack(spacing: 14) {
                    ForEach(PredictionTab.allCases, id: \.self) { item in
                        FilterChip(label: item.rawValue, isSelected: tab == item) { tab = item }
                            .sidebarBoundary(item == .all)
                    }
                    Spacer()
                    Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise").padding(14) }
                        .buttonStyle(BrowseCardStyle()).accessibilityLabel("Refresh Predictions")
                }
                if loading { ProgressView("Loading events…").frame(maxWidth: .infinity, minHeight: 400) }
                else if let error, events.isEmpty {
                    StatusView(title: "Couldn’t load Predictions", message: error, retry: { Task { await load() } })
                } else if tab == .picks { history }
                else if let featured = visible.first {
                    Button { open(featured) } label: { PredictionFeature(event: featured, market: PredictionMarket.latest(for: featured.id, in: markets)) }
                        .buttonStyle(BrowseCardStyle()).contentEntryTarget(true).sidebarBoundary()
                    if visible.count > 1 {
                        Text(tab == .all ? "More to make a call on" : tab.rawValue).font(.system(size: 30, weight: .bold, design: .rounded))
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 24), count: 3), spacing: 24) {
                            ForEach(Array(visible.dropFirst().enumerated()), id: \.element.id) { index, event in
                                Button { open(event) } label: { eventCard(event) }
                                    .buttonStyle(BrowseCardStyle()).sidebarBoundary(index % 3 == 0)
                            }
                        }
                    }
                } else { empty }
                if let error, !events.isEmpty { Text(error).font(.system(size: 18)).foregroundStyle(.secondary) }
                Text("18+ · Virtual Points preview · Picks stay on this Apple TV. No cash value.")
                    .font(.system(size: 17)).foregroundStyle(Color(white: 0.5)).padding(.top, 6)
            }.padding(.horizontal, 70).padding(.top, 48).padding(.bottom, 80)
        }
        .background(.black)
        .task(id: catalogRevision) { await load() }
        .task(id: active) {
            guard active else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(10)) } catch { return }
                if !isPresenting { await load() }
            }
        }
        .onExitCommand { if !isPresenting { returnToSidebar() } }
    }
    private var previewBadge: some View {
        TVStatusBadge(text: "POINTS PREVIEW", symbol: "sparkles")
    }
    private var empty: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack {
                VStack(alignment: .leading, spacing: 14) {
                    Text("The next moment\nis yours.").font(.system(size: 52, weight: .bold, design: .rounded))
                    Text(tab == .all ? "New events will appear here as they’re scheduled." : "No \(tab.rawValue.lowercased()) events right now.")
                        .font(.system(size: 24)).foregroundStyle(.secondary).frame(maxWidth: 650, alignment: .leading)
                    #if DEBUG
                    if supabase.configuration?.isDevelopment == true {
                        Button("Explore a demo", systemImage: "play.fill") { open(PredictionDemo.event) }
                            .font(.system(size: 23, weight: .semibold)).padding(.top, 14)
                            .buttonStyle(PredictionActionStyle()).contentEntryTarget(true).sidebarBoundary()
                        Text("DEVELOPMENT DEMO · SAMPLE VIDEO").font(.system(size: 13, weight: .semibold)).tracking(1.8).foregroundStyle(.secondary)
                    }
                    #endif
                }
                Spacer()
                PredictionArtwork(url: nil).frame(width: 480, height: 360)
            }
        }.padding(40).frame(maxWidth: .infinity, minHeight: 430, alignment: .leading)
            .background(Color(white: 0.045), in: RoundedRectangle(cornerRadius: 24))
    }
    private func eventCard(_ event: PredictionEvent) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            PredictionArtwork(url: event.artwork).frame(height: 205).clipShape(RoundedRectangle(cornerRadius: 12))
            Text(event.statusLabel).font(.system(size: 13, weight: .semibold)).tracking(1.7).foregroundStyle(.secondary)
            Text(event.title).font(.system(size: 26, weight: .bold, design: .rounded)).lineLimit(2)
            Text(PredictionMarket.latest(for: event.id, in: markets)?.question ?? eventSchedule(event))
                .font(.system(size: 20)).foregroundStyle(.secondary).lineLimit(2)
        }.frame(maxWidth: .infinity, minHeight: 325, alignment: .topLeading).padding(16)
    }
    private var history: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Your calls. Your track record.").font(.system(size: 32, weight: .bold, design: .rounded))
            if picks.items.isEmpty {
                Text("Choose an event and save a preview pick to start your history.")
                    .font(.system(size: 25)).foregroundStyle(.secondary).padding(.vertical, 70)
            }
            ForEach(picks.items) { pick in
                Button { openPick(pick) } label: {
                    HStack(spacing: 28) {
                        Image(systemName: pick.result == "won" ? "checkmark.circle" : pick.result == "pending" ? "clock" : "flag.checkered")
                            .font(.system(size: 34)).frame(width: 50)
                        VStack(alignment: .leading, spacing: 8) {
                            Text(pick.question).font(.system(size: 25, weight: .semibold)).lineLimit(2)
                            Text("\(pick.eventTitle) · \(pick.optionLabel) · \(pick.points) Points at \(String(format: "%.2f×", pick.odds))")
                                .font(.system(size: 19)).foregroundStyle(.secondary).lineLimit(2)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 8) {
                            Text(pick.result == "pending" ? "PENDING" : pick.result.uppercased()).font(.system(size: 14, weight: .bold)).tracking(1.5)
                            Text("\(pick.returnPoints ?? pick.potentialPoints) Points").font(.system(size: 27, weight: .bold, design: .rounded))
                            if pick.result == "pending" { Text("potential return").font(.system(size: 16)).foregroundStyle(.secondary) }
                        }
                    }.padding(28).frame(maxWidth: .infinity, alignment: .leading)
                }.buttonStyle(BrowseCardStyle()).sidebarBoundary()
                    .disabled(pick.eventID >= 0 && !events.contains { $0.id == pick.eventID })
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func openPick(_ pick: PredictionPick) {
        #if DEBUG
        if pick.eventID == -1 { open(PredictionDemo.event); return }
        #endif
        if let event = events.first(where: { $0.id == pick.eventID }) { open(event) }
    }
    private func load() async {
        do {
            async let nextEvents = supabase.fetchPredictionEvents()
            async let nextMarkets = supabase.fetchPredictionMarkets()
            let result = try await (nextEvents, nextMarkets)
            guard !Task.isCancelled else { return }
            events = result.0; markets = result.1; if !isPresenting { picks.resolve(markets) }; error = nil
        } catch {
            guard !Task.isCancelled else { return }
            self.error = "Events couldn’t refresh. Try again to get the latest questions."
        }
        loading = false
    }
}

private struct PredictionFeature: View {
    let event: PredictionEvent
    let market: PredictionMarket?
    var body: some View {
        ZStack(alignment: .leading) {
            GeometryReader { geometry in
                PredictionArtwork(url: event.artwork).frame(width: geometry.size.width * 0.65, height: 420)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            LinearGradient(colors: [.black, .black.opacity(0.85), .clear], startPoint: .leading, endPoint: .trailing)
            VStack(alignment: .leading, spacing: 18) {
                Text(event.statusLabel).font(.system(size: 14, weight: .bold)).tracking(2.5).foregroundStyle(.secondary)
                Text(event.title).font(.system(size: 48, weight: .bold, design: .rounded)).lineLimit(2)
                Text(market?.question ?? event.description ?? "Watch together and make your call.")
                    .font(.system(size: 24)).foregroundStyle(.white.opacity(0.72)).lineLimit(2)
                HStack(spacing: 20) {
                    Label("Explore event", systemImage: "arrow.up.right").font(.system(size: 23, weight: .semibold))
                    Text(eventSchedule(event)).font(.system(size: 18)).foregroundStyle(.secondary)
                }.padding(.top, 10)
            }.frame(maxWidth: 760, alignment: .leading).padding(42)
        }.frame(height: 420).frame(maxWidth: .infinity).clipped()
    }
}

private struct PredictionArtwork: View {
    let url: URL?
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(colors: [Color(white: 0.16), Color(white: 0.035)], startPoint: .topTrailing, endPoint: .bottomLeading)
                Image(systemName: "scope").font(.system(size: min(geometry.size.width, geometry.size.height) * 0.65, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.13)).rotationEffect(.degrees(-15))
                if let url {
                    AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
                }
            }.frame(width: geometry.size.width, height: geometry.size.height).clipped()
        }.accessibilityHidden(true)
    }
}

private func eventSchedule(_ event: PredictionEvent) -> String {
    event.startDate?.formatted(.dateTime.month(.abbreviated).day().hour().minute()) ?? (event.id < 0 ? "Sample video · Virtual Points" : "Schedule to be announced")
}

struct PredictionEventView: View {
    @EnvironmentObject private var supabase: SupabaseService
    @Environment(\.preparePlayback) private var preparePlayback
    @Environment(\.scenePhase) private var scenePhase
    let onClose: () -> Void
    @ObservedObject var picks: PredictionPicks
    @State private var event: PredictionEvent
    @State private var markets: [PredictionMarket]
    @State private var player: PlayerModel?
    @State private var fullVideo = false
    @State private var lastExit = -Double.infinity
    @State private var selectedID: Int?
    @State private var points = 50
    @State private var submitting = false
    @State private var notice: String?
    @State private var refreshError: String?
    @State private var refreshing = false
    @State private var lastRefresh: Date?
    @State private var queue = PredictionRevealQueue()
    @FocusState private var optionFocus: Int?
    @FocusState private var actionFocus: String?
    @State private var enteredMarket = false
    init(event: PredictionEvent, markets: [PredictionMarket], picks: PredictionPicks, onClose: @escaping () -> Void) {
        _event = State(initialValue: event)
        _markets = State(initialValue: markets)
        self.picks = picks
        self.onClose = onClose
    }
    private var demo: Bool { event.id < 0 }
    private var market: PredictionMarket? { PredictionMarket.latest(for: event.id, in: markets) }
    var body: some View {
        VStack(alignment: .leading, spacing: 30) {
            HStack(spacing: 20) {
                Button("Events", systemImage: "chevron.left") { onClose() }.buttonStyle(PredictionActionStyle()).focused($actionFocus, equals: "back")
                Spacer()
                Text(demo ? "DEMO · POINTS PREVIEW" : "PREDICTIONS · POINTS PREVIEW")
                    .font(.system(size: 16, weight: .semibold)).tracking(2).foregroundStyle(.secondary)
            }.focusSection()
            GeometryReader { geometry in
                HStack(alignment: .top, spacing: 38) {
                    VStack(alignment: .leading, spacing: 22) {
                        Group {
                            if let player {
                                PredictionVideo(player: player)
                            } else {
                                ZStack {
                                    PredictionArtwork(url: event.artwork)
                                    VStack(spacing: 14) {
                                        Image(systemName: "play.rectangle").font(.system(size: 44))
                                        Text("Video will appear when it’s available").font(.system(size: 23, weight: .medium))
                                    }.padding(30).background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 16))
                                }
                            }
                        }.frame(height: max(220, min((geometry.size.width - 558) * 9 / 16, geometry.size.height - 250)))
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                        HStack {
                            Text(event.statusLabel).font(.system(size: 14, weight: .bold)).tracking(2).foregroundStyle(.secondary)
                            Spacer()
                            if player != nil {
                                Button("Fullscreen", systemImage: "arrow.up.left.and.arrow.down.right") { fullVideo = true }
                                    .buttonStyle(PredictionActionStyle(compact: true)).focused($actionFocus, equals: "fullscreen")
                            }
                        }
                        Text(event.title).font(.system(size: 38, weight: .bold, design: .rounded)).lineLimit(2)
                        Text(event.description ?? "Watch the event and choose your moment.")
                            .font(.system(size: 23)).foregroundStyle(.secondary).lineLimit(3)
                        Text(demo ? "Sample video for demonstration. No real event or payout." : eventSchedule(event))
                            .font(.system(size: 17)).foregroundStyle(Color(white: 0.5))
                    }.frame(maxWidth: .infinity, alignment: .leading).focusSection()
                    TimelineView(.periodic(from: .now, by: 1)) { context in marketPanel(now: context.date) }
                        .frame(width: 520).frame(maxHeight: .infinity)
                        .background(Color(white: 0.055), in: RoundedRectangle(cornerRadius: 24)).focusSection()
                }
            }
        }.padding(60).frame(maxWidth: .infinity, maxHeight: .infinity).background(.black)
        .task(id: event.playbackURL(host: supabase.configuration?.streamHost ?? "")) {
            guard let url = event.playbackURL(host: supabase.configuration?.streamHost ?? "") else { return }
            preparePlayback()
            let next = PlayerModel(url: url, title: event.title)
            player?.stop(); player = next
            next.startIfEnabled()
        }
        .task {
            #if DEBUG
            if demo { markets = [PredictionDemo.market]; lastRefresh = Date(); return }
            #endif
            while !Task.isCancelled {
                await refresh()
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
            }
        }
        .task {
            while !Task.isCancelled {
                if let ready = queue.reveal(at: Date()) { markets = ready; picks.resolve(ready, fromPlayer: true) }
                do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
            }
        }
        .onAppear { actionFocus = "back" }
        .onChange(of: market?.id, initial: true) { _, _ in
            selectedID = nil; notice = nil
            guard !enteredMarket, let market else { return }
            enteredMarket = true
            if market.canPick(), picks.pick(for: market.id) == nil {
                Task { @MainActor in await Task.yield(); optionFocus = market.options.first?.id }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { player?.startIfEnabled() } else { player?.player.pause() }
        }
        .onDisappear { picks.watchingEvent = false; player?.stop() }
        .disabled(fullVideo)
        .accessibilityHidden(fullVideo)
        .overlay {
            if fullVideo, let player {
                NativePlayer(player: player.player, onExit: exitEvent, pauseOnDismantle: false)
                    .background(.black).ignoresSafeArea()
            }
        }
        .onExitCommand(perform: exitEvent)
    }
    private func exitEvent() {
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastExit > 0.35 else { return }
        lastExit = now
        if fullVideo { fullVideo = false } else { onClose() }
    }
    private func marketPanel(now: Date) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(market?.statusLabel(at: now) ?? "THE NEXT CALL")
                    .font(.system(size: 14, weight: .bold)).tracking(2.3).foregroundStyle(.secondary)
                if let market {
                    let saved = picks.pick(for: market.id)
                    let fresh = demo || (lastRefresh.map { now.timeIntervalSince($0) < 15 } ?? false)
                    Text(market.question).font(.system(size: 34, weight: .bold, design: .rounded)).fixedSize(horizontal: false, vertical: true)
                    if let lock = GuideEntry.date(market.locks_at), market.canPick(at: now) {
                        let seconds = max(0, Int(lock.timeIntervalSince(now)))
                        Label(String(format: "Closes in %d:%02d", seconds / 60, seconds % 60), systemImage: "clock")
                            .font(.system(size: 18, weight: .medium)).monospacedDigit().foregroundStyle(.secondary)
                    }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                        ForEach(market.options) { option in
                            let chosen = saved?.optionID == option.id || (saved == nil && selectedID == option.id)
                            Button { selectedID = option.id; notice = nil } label: {
                                VStack(alignment: .leading, spacing: 14) {
                                    Text(option.label).font(.system(size: 23, weight: .semibold)).lineLimit(2).frame(height: 56, alignment: .topLeading)
                                    Text(option.valid ? option.multiplier : "—").font(.system(size: 36, weight: .bold, design: .rounded)).monospacedDigit()
                                }.frame(maxWidth: .infinity, alignment: .leading).padding(22)
                            }.buttonStyle(PredictionChoiceStyle(selected: chosen))
                                .focused($optionFocus, equals: option.id)
                                .disabled(!market.canPick(at: now) || saved != nil || !fresh || submitting)
                                .accessibilityLabel("\(option.label), \(option.multiplier) Points multiplier")
                        }
                    }
                    if let saved {
                        pickSummary(saved)
                    } else if market.canPick(at: now) {
                        Text("PREVIEW POINTS").font(.system(size: 13, weight: .semibold)).tracking(1.8).foregroundStyle(.secondary)
                        HStack(spacing: 12) {
                            ForEach([25, 50, 100], id: \.self) { amount in
                                FilterChip(label: String(amount), isSelected: points == amount) { points = amount }.disabled(submitting)
                            }
                        }
                        if let option = market.options.first(where: { $0.id == selectedID }), option.valid {
                            HStack {
                                Text("Potential return").font(.system(size: 18)).foregroundStyle(.secondary)
                                Spacer()
                                Text("\(PredictionPick.potentialReturn(points: points, odds: option.odds)) Points").font(.system(size: 22, weight: .semibold)).monospacedDigit()
                            }
                        }
                        Button { Task { await savePick() } } label: {
                            HStack { Text(submitting ? "Checking your pick…" : "Save preview pick"); Spacer(); Image(systemName: "arrow.right") }
                                .font(.system(size: 22, weight: .semibold)).padding(22).frame(maxWidth: .infinity)
                        }.buttonStyle(PredictionActionStyle())
                            .disabled(selectedID == nil || submitting || !fresh || (!demo && supabase.session == nil))
                        if !demo && supabase.session == nil {
                            Text("Sign in from Profile to save preview picks.").font(.system(size: 18)).foregroundStyle(.secondary)
                        }
                    } else if let winner = market.winner, market.status == "settled" {
                        Label("Result · \(winner.label)", systemImage: "flag.checkered").font(.system(size: 25, weight: .semibold))
                    } else {
                        Text(market.status == "void" ? "This question was voided." : "Picks are closed. Stay tuned for the next question.")
                            .font(.system(size: 22)).foregroundStyle(.secondary)
                    }
                    if !fresh { Label("Updating availability…", systemImage: "arrow.clockwise").font(.system(size: 18)).foregroundStyle(.secondary) }
                } else {
                    Image(systemName: "scope").font(.system(size: 55, weight: .light)).foregroundStyle(.secondary).padding(.vertical, 20)
                    Text("Stay in the moment.").font(.system(size: 34, weight: .bold, design: .rounded))
                    Text("The next question will appear here when it opens.").font(.system(size: 24)).foregroundStyle(.secondary)
                }
                if let notice { Text(notice).font(.system(size: 20)).foregroundStyle(.white).accessibilityAddTraits(.updatesFrequently) }
                if let refreshError {
                    Text(refreshError).font(.system(size: 18)).foregroundStyle(.secondary)
                    Button("Retry") { Task { await refresh() } }.buttonStyle(PredictionActionStyle(compact: true))
                }
                Rectangle().fill(.white.opacity(0.1)).frame(height: 1)
                Text("VIRTUAL POINTS · NO CASH VALUE").font(.system(size: 12, weight: .semibold)).tracking(1.3).foregroundStyle(.secondary)
                Text("Preview picks are saved on this Apple TV, separately for each account and profile.")
                    .font(.system(size: 17)).foregroundStyle(Color(white: 0.5))
            }.padding(30)
        }
    }
    private func pickSummary(_ pick: PredictionPick) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(pick.result == "pending" ? "Preview pick saved" : pick.result == "won" ? "You called it." : pick.result == "void" ? "Pick voided" : "Result is in.",
                  systemImage: pick.result == "pending" ? "checkmark.circle" : "flag.checkered")
                .font(.system(size: 25, weight: .bold, design: .rounded))
            Text("\(pick.points) Points on \(pick.optionLabel) · \(String(format: "%.2f×", pick.odds))")
                .font(.system(size: 20)).foregroundStyle(.secondary)
            Text("\(pick.result == "pending" ? "Potential return" : "Preview return") · \(pick.returnPoints ?? pick.potentialPoints) Points")
                .font(.system(size: 22, weight: .semibold)).monospacedDigit()
        }.padding(22).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(white: 0.1), in: RoundedRectangle(cornerRadius: 16))
    }
    private func refresh() async {
        guard !demo, !refreshing else { return }
        refreshing = true
        defer { refreshing = false }
        do {
            let latest = try await supabase.fetchPredictionMarkets(eventID: event.id)
            guard !Task.isCancelled else { return }
            let now = Date()
            if lastRefresh == nil { markets = latest; picks.resolve(latest, fromPlayer: true) }
            else {
                let latency = player?.player.currentItem?.currentDate().map { now.timeIntervalSince($0) } ?? 0
                queue.enqueue(latest, at: now, latency: latency)
            }
            lastRefresh = now; refreshError = nil
        } catch {
            if !Task.isCancelled { refreshError = "Live questions couldn’t refresh. Your saved pick is safe." }
        }
    }
    private func savePick() async {
        guard !submitting, let market, let selectedID, let choice = market.options.first(where: { $0.id == selectedID }) else { return }
        guard demo || supabase.session != nil else { return }
        let requestedPoints = points
        let owner = supabase.session?.userId
        let profile = supabase.activeProfile?.id
        submitting = true; notice = nil
        defer { submitting = false }
        do {
            let snapshot = demo ? [market] : try await supabase.fetchPredictionMarkets(eventID: event.id)
            let latest = PredictionMarket.latest(for: event.id, in: snapshot)
            guard !Task.isCancelled, owner == supabase.session?.userId, profile == supabase.activeProfile?.id else { return }
            guard let latest, latest.id == market.id else { throw AppError.networkError("A new question is available. Review it before saving a pick.") }
            guard latest.canPick() else { throw AppError.networkError("Picks have closed for this question.") }
            guard latest.options.first(where: { $0.id == choice.id }) == choice else {
                queue = PredictionRevealQueue()
                markets = markets.map { $0.id == latest.id ? latest : $0 }
                throw AppError.networkError("The multiplier changed. Review the updated choice and confirm again.")
            }
            try picks.save(event: event, market: latest, option: choice, points: requestedPoints)
            notice = "Saved on this Apple TV."
        } catch { notice = error.localizedDescription }
    }
}

private struct PredictionVideo: View {
    @ObservedObject var player: PlayerModel
    @State private var ready = false
    var body: some View {
        ZStack {
            NativePlayer(player: player.player, interactive: false, pauseOnDismantle: false, onVideoReady: { _ in ready = true })
            if let error = player.errorMessage {
                Color.black
                VStack(spacing: 16) {
                    Image(systemName: "wifi.exclamationmark").font(.system(size: 38))
                    Text("Video interrupted").font(.system(size: 27, weight: .semibold))
                    Text(error).font(.system(size: 19)).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }.padding(40)
            } else if !ready { Color.black; ProgressView("Loading event…") }
        }.allowsHitTesting(false)
    }
}

private struct PredictionChoiceStyle: ButtonStyle {
    let selected: Bool
    @Environment(\.isFocused) private var focused
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.foregroundStyle(selected ? .black : .white)
            .background(selected ? ContentAppearance.accent : Color(white: focused ? 0.16 : 0.095), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(focused ? ContentAppearance.accent : .white.opacity(0.1), lineWidth: focused ? ContentAppearance.focusWidth : 1))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

private typealias PredictionActionStyle = TVActionControlStyle
