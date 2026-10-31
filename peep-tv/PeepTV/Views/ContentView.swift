import SwiftUI

/// Pace custom focus commands across views, so one swipe cannot accelerate as
/// focus moves from one card to the next. Uses monotonic time, not the wall clock.
struct RemoteMovePacer {
    var initialRepeatDelay: TimeInterval = 0.34
    var repeatInterval: TimeInterval = 0.22
    var directionChangeDelay: TimeInterval = 0.06
    private var direction: MoveCommandDirection?
    private var acceptedAt = -Double.infinity
    private var repeating = false

    mutating func accept(_ next: MoveCommandDirection, at now: TimeInterval) -> Bool {
        let elapsed = now - acceptedAt
        let sameDirection = direction == next
        let minimum = sameDirection ? (repeating ? repeatInterval : initialRepeatDelay) : directionChangeDelay
        guard elapsed >= minimum else { return false }
        repeating = sameDirection && elapsed < max(0.6, initialRepeatDelay + 0.2)
        direction = next
        acceptedAt = now
        return true
    }
}

@MainActor private final class RemoteMoveCoordinator {
    static let shared = RemoteMoveCoordinator()
    var pacer = RemoteMovePacer()
}

extension View {
    func onRemoteMove(perform action: @escaping (MoveCommandDirection) -> Void) -> some View {
        onMoveCommand { direction in
            guard RemoteMoveCoordinator.shared.pacer.accept(direction, at: ProcessInfo.processInfo.systemUptime) else { return }
            action(direction)
        }
    }
}

struct RailNavigationState {
    var selected = 0
    var expanded = false
    var inContent = false

    mutating func right() {
        expanded = false
        inContent = true
    }
    mutating func returnToRail() { expanded = true; inContent = false }
    mutating func activate(_ destination: Int) { selected = destination }
}

private struct ReturnToSidebarKey: EnvironmentKey {
    static let defaultValue: () -> Void = {}
}

private struct SidebarBoundary: ViewModifier {
    @Environment(\.returnToSidebar) private var returnToSidebar
    let enabled: Bool

    func body(content: Content) -> some View {
        content.onRemoteMove { direction in
            if enabled && direction == .left { returnToSidebar() }
        }
    }
}

extension View {
    // Only the leading item of each row can hand focus back to navigation.
    func sidebarBoundary(_ enabled: Bool = true) -> some View {
        modifier(SidebarBoundary(enabled: enabled))
    }
}

private struct HeroRailInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = 144
}

private struct CatalogRevisionKey: EnvironmentKey {
    static let defaultValue = 0
}

extension EnvironmentValues {
    var heroRailInset: CGFloat {
        get { self[HeroRailInsetKey.self] }
        set { self[HeroRailInsetKey.self] = newValue }
    }
    var returnToSidebar: () -> Void {
        get { self[ReturnToSidebarKey.self] }
        set { self[ReturnToSidebarKey.self] = newValue }
    }
    var catalogRevision: Int {
        get { self[CatalogRevisionKey.self] }
        set { self[CatalogRevisionKey.self] = newValue }
    }
}

private struct ContentEntryScopeKey: EnvironmentKey {
    static let defaultValue: Namespace.ID? = nil
}
private struct ContentEntryActiveKey: EnvironmentKey {
    static let defaultValue = false
}
extension EnvironmentValues {
    var contentEntryScope: Namespace.ID? {
        get { self[ContentEntryScopeKey.self] }
        set { self[ContentEntryScopeKey.self] = newValue }
    }
    var contentEntryActive: Bool {
        get { self[ContentEntryActiveKey.self] }
        set { self[ContentEntryActiveKey.self] = newValue }
    }
}
private struct ContentEntryTarget: ViewModifier {
    let first: Bool
    @Environment(\.contentEntryScope) private var scope
    @Environment(\.contentEntryActive) private var active
    @FocusState private var focused: Bool
    @ViewBuilder func body(content: Content) -> some View {
        if let scope {
            content.prefersDefaultFocus(first && active, in: scope)
                .focused($focused)
                .task(id: first && active) {
                    guard first && active else { focused = false; return }
                    await Task.yield()
                    guard !Task.isCancelled else { return }
                    focused = true
                }
        } else { content }
    }
}
extension View {
    func contentEntryTarget(_ first: Bool) -> some View { modifier(ContentEntryTarget(first: first)) }
}

// Every independent player hands off the audio session before starting content
// or an entry ad. Sheets inherit this callback from the app shell.
private struct PreparePlaybackKey: EnvironmentKey {
    static let defaultValue: () -> Void = {}
}
extension EnvironmentValues {
    var preparePlayback: () -> Void {
        get { self[PreparePlaybackKey.self] }
        set { self[PreparePlaybackKey.self] = newValue }
    }
}

struct ContentView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.resetFocus) private var resetFocus
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var navigation = RailNavigationState()
    @State private var visitedPages: Set<Int> = [0]
    @StateObject private var adGate = CSAIGate()
    @State private var entryTask: Task<Void, Never>?
    @AppStorage("peep.live.lastChannelID") private var lastLiveChannelID = 0
    @State private var liveGuide: LiveGuideSession?
    @State private var livePlayback: LiveGuideSession?
    @State private var livePlayer: PlayerModel?
    @State private var multiview: MultiviewSession?
    @State private var catalogRevision = 0
    @State private var accountMenuOpen = false
    @State private var accountSettingsOpen = false
    @State private var viewerPickerOpen = false
    @State private var accountEditor: AccountProfile?
    @State private var accountSignInOpen = false
    @State private var confirmAccountSignOut = false
    @State private var onDemandSeries = false
    @State private var needsForegroundRefresh = false
    @State private var focusTransfer: Task<Void, Never>?
    @FocusState private var railFocus: Int?
    @Namespace private var contentFocus
    @Namespace private var railScope
    private let railTransitionDuration = 0.32

    private var railAccount: AccountProfile? {
        if let viewer = supabase.activeProfile, viewer.user_id == supabase.session?.userId {
            return AccountProfile(id: supabase.session?.userId ?? viewer.id, email: nil, username: nil, full_name: viewer.name, avatar_id: viewer.avatar_id, avatar_url: viewer.avatar_url)
        }
        return supabase.accountProfile
    }

    private let destinations: [(String, String)] = [
        ("Home", "house.fill"), ("On Demand", "film.fill"), ("Series", "tv.fill"),
        ("Live TV", "antenna.radiowaves.left.and.right"), ("Podcasts", "mic.fill"), ("Search", "magnifyingglass"),
        ("Account", "person.fill"), ("Settings", "gearshape.fill"), ("My List", "bookmark.fill")
    ]

    var body: some View {
        ZStack(alignment: .leading) {
            ZStack {
                page(0) { HomeView(openDestination: { enterContent(destination: $0) }, openMultiview: openMultiview) }
                page(1) {
                    VStack(spacing: 0) {
                        HStack(spacing: 20) {
                            FilterChip(label: "Movies", isSelected: !onDemandSeries) { onDemandSeries = false }.sidebarBoundary()
                            FilterChip(label: "Series", isSelected: onDemandSeries) { onDemandSeries = true }
                            Spacer()
                        }.padding(.horizontal, 70).padding(.top, 28)
                        if onDemandSeries { SeriesView() } else { MoviesView() }
                    }.environment(\.onDemandTypography, true)
                }
                page(3) { StreamsView(isActive: navigation.selected == 3 && navigation.inContent && liveGuide == nil && multiview == nil,
                                      returnToRail: expandRail, openGuide: openLiveChannel, openMultiview: openMultiview,
                                      preferredChannelID: lastLiveChannelID,
                                      previewPlayer: nil, playingTitle: nil) }
                page(4) { PodcastsView() }
                page(5) { SearchView() }
                page(6) { ProfileMenuView(reloadCatalog: { supabase.invalidateCatalogCache(); catalogRevision += 1 }) }
                page(7) { AppSettingsView() }
                page(8) { MyListView() }
            }
            .environment(\.heroRailInset, navigation.expanded ? 400 : 144)
            .environment(\.catalogRevision, catalogRevision)
            .environment(\.returnToSidebar, expandRail)
            .focusScope(contentFocus)
            .padding(.leading, navigation.expanded ? 400 : 144)
            .animation(reduceMotion ? nil : .easeInOut(duration: railTransitionDuration), value: navigation.expanded)
            .onExitCommand {
                if navigation.inContent && liveGuide == nil && multiview == nil && !adGate.blocking { expandRail() }
            }

            rail.disabled(navigation.inContent || accountMenuOpen).focusScope(railScope)

        }
        .background(.black)
        .overlay(alignment: .bottomLeading) {
            if accountMenuOpen {
                AccountQuickMenu(profile: railAccount, signedIn: supabase.session != nil, canEditProfile: supabase.accountProfile != nil) { action in
                    closeAccountMenu()
                    switch action {
                    case "viewers": viewerPickerOpen = true
                    case "profile": accountEditor = supabase.accountProfile
                    case "settings": accountSettingsOpen = true
                    case "signout": confirmAccountSignOut = true
                    case "signin": accountSignInOpen = true
                    default: break
                    }
                } onClose: { closeAccountMenu() }
                .frame(width: 440).padding(.leading, 24).padding(.bottom, 120)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(10)
            }
        }
        .sheet(isPresented: $accountSettingsOpen, onDismiss: { railFocus = 6 }) {
            VStack {
                Button { accountSettingsOpen = false } label: { Label("Back", systemImage: "chevron.left").font(.system(size: 23, weight: .semibold)).padding(.horizontal, 28).padding(.vertical, 16) }.buttonStyle(BrowseCardStyle()).padding(.top, 30)
                AppSettingsView(reloadCatalog: { supabase.invalidateCatalogCache(); catalogRevision += 1 })
            }.background(.black).onExitCommand { accountSettingsOpen = false }
        }
        .fullScreenCover(isPresented: $viewerPickerOpen, onDismiss: { railFocus = 6 }) { ProfileSelectView() }
        .fullScreenCover(item: $accountEditor, onDismiss: { railFocus = 6 }) { profile in
            ProfileSettingsView(profile: profile) { _ in }
        }
        .sheet(isPresented: $accountSignInOpen, onDismiss: { railFocus = 6 }) { AuthView() }
        .confirmationDialog("Sign out of this Apple TV?", isPresented: $confirmAccountSignOut, titleVisibility: .visible) {
            Button("Sign Out", role: .destructive) { supabase.signOut(); railFocus = 6 }
            Button("Cancel", role: .cancel) { railFocus = 6 }
        }
        .overlay(alignment: .bottomTrailing) {
            if let player = livePlayer, let session = livePlayback, liveGuide == nil, multiview == nil, !adGate.blocking {
                VStack(alignment: .leading, spacing: 12) {
                    LivePreview(player: player)
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .allowsHitTesting(false).accessibilityHidden(true)
                    Text("Live · \(session.initial.name)").font(.system(size: 20, weight: .semibold)).lineLimit(1)
                    Text("Hold Select on Live TV for playback options")
                        .font(.system(size: 16)).foregroundStyle(.secondary)
                }
                .allowsHitTesting(false)
                .padding(18).frame(width: 380)
                .background(Color(white: 0.07), in: RoundedRectangle(cornerRadius: 18))
                .padding(.trailing, 50).padding(.bottom, 35)
            }
        }
        .disabled(liveGuide != nil || multiview != nil || adGate.blocking)
        .accessibilityHidden(liveGuide != nil || multiview != nil)
        .overlay {
            if let session = multiview {
                MultiviewView(session: session, onClose: { multiview = nil; if navigation.selected == 3 { expandRail() } })
                    .id(session.id).ignoresSafeArea()
            } else if let session = liveGuide {
                LiveSurfView(channels: session.channels, initial: session.initial, url: session.url,
                             feeds: session.feeds, streamHost: session.streamHost, guide: session.guide, sharedPlayer: livePlayer, onTune: { channel, url in
                                 lastLiveChannelID = channel.id
                                 livePlayback = LiveGuideSession(channels: session.channels, initial: channel, url: url, feeds: session.feeds, streamHost: session.streamHost, guide: session.guide)
                             }, openMultiview: openMultiview, onClose: {
                                 liveGuide = nil
                                 expandRail()
                             })
                    .id(session.id).ignoresSafeArea()
            }
        }
        .background {
            if let player = livePlayer {
                Color.clear.liveViewing(player: player.player, channelID: livePlayback?.initial.id)
            }
        }
        .onChange(of: multiview?.id) { _, id in
            if id != nil { stopLiveChannel() }
        }
        .overlay { CSAIOverlay(gate: adGate, cancel: { entryTask?.cancel() }) }
        .task(id: supabase.session?.userId) {
            if supabase.session != nil { _ = try? await supabase.fetchAccountProfile() }
        }
        .onAppear { railFocus = navigation.selected }
        .onDisappear { focusTransfer?.cancel(); entryTask?.cancel(); adGate.cancel(); stopLiveChannel() }
        .onChange(of: scenePhase) { _, current in
            if current == .background {
                needsForegroundRefresh = true
                entryTask?.cancel(); adGate.cancel(); stopLiveChannel()
            }
            if current == .active && needsForegroundRefresh {
                needsForegroundRefresh = false
                supabase.invalidateCatalogCache(); catalogRevision += 1
                Task {
                    try? await supabase.refreshSavedList()
                    if supabase.session != nil { _ = try? await supabase.fetchAccountProfile() }
                }
            }
        }
        .task(id: livePlayback?.initial.id) {
            if let session = livePlayback, let player = livePlayer {
                await player.monitorBlackout(channelID: session.initial.id, initial: session.initial, service: supabase)
            }
        }
        .environment(\.preparePlayback, stopLiveChannel)
    }

    private func resumeLiveChannel() {
        guard let session = livePlayback, livePlayer != nil else { return }
        focusTransfer?.cancel()
        navigation.activate(3)
        navigation.right()
        railFocus = nil
        liveGuide = session
    }

    private func expandRail() {
        // A held arrow or swipe may emit several Left events. Once open, leave
        // the viewer's current sidebar focus alone instead of snapping it back.
        guard !navigation.expanded || navigation.inContent else { return }
        focusTransfer?.cancel()
        // Set the destination in the same update that enables the rail. Deferring
        // this lets the focus engine briefly choose its first item (Home).
        railFocus = navigation.selected
        navigation.returnToRail()
    }

    private func openLiveChannel(_ session: LiveGuideSession) {
        if livePlayback?.initial.id == session.initial.id, livePlayer != nil { liveGuide = session; return }
        entryTask?.cancel(); adGate.cancel(); stopLiveChannel()
        entryTask = Task { @MainActor in
            if session.initial.blackoutMessage() == nil {
                guard await adGate.run(service: supabase, scope: "live", contentID: String(session.initial.id)), !Task.isCancelled else { return }
            }
            startLiveChannel(session)
        }
    }

    private func openMultiview(_ session: MultiviewSession) {
        entryTask?.cancel(); adGate.cancel(); stopLiveChannel()
        entryTask = Task { @MainActor in
            guard await adGate.run(service: supabase, scope: "multiview", contentID: ""), !Task.isCancelled else { return }
            multiview = session
        }
    }

    private func startLiveChannel(_ session: LiveGuideSession) {
        if livePlayback?.initial.id != session.initial.id || livePlayer == nil {
            livePlayer?.stop()
            let player = PlayerModel(url: session.url, title: session.initial.name)
            livePlayer = player
            player.applyBlackout(session.initial.blackoutMessage())
            player.startIfEnabled()
        }
        lastLiveChannelID = session.initial.id
        livePlayback = session
        liveGuide = session
    }

    private func stopLiveChannel() {
        livePlayer?.stop()
        livePlayer = nil
        livePlayback = nil
        liveGuide = nil
    }

    private func openAccountMenu() {
        focusTransfer?.cancel()
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { accountMenuOpen = true }
    }

    private func closeAccountMenu() {
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { accountMenuOpen = false }
        railFocus = 6
    }

    private func enterContent(destination requested: Int) {
        let destination = requested == 2 ? 1 : requested == 7 ? 6 : requested
        if requested == 2 { onDemandSeries = true }
        guard !navigation.inContent || navigation.selected != destination else { return }
        focusTransfer?.cancel()
        visitedPages.insert(destination)
        navigation.activate(destination)
        navigation.right()
        railFocus = nil
        focusTransfer = Task { @MainActor in
            await Task.yield()
            // A quick Left must win over an older deferred focus request.
            guard !Task.isCancelled, navigation.inContent, liveGuide == nil else { return }
            if ![1, 2, 3, 4, 8].contains(destination) { resetFocus(in: contentFocus) }
        }
    }

    @ViewBuilder private func page<V: View>(_ index: Int, @ViewBuilder content: () -> V) -> some View {
        if visitedPages.contains(index) {
        content()
            .environment(\.contentEntryScope, contentFocus)
            .environment(\.contentEntryActive, navigation.selected == index && navigation.inContent)
            .opacity(navigation.selected == index ? 1 : 0)
            .disabled(accountMenuOpen || navigation.selected != index || !navigation.inContent)
            .accessibilityHidden(navigation.selected != index)
            .allowsHitTesting(navigation.selected == index && navigation.inContent)
        }
    }

    private var rail: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Reserve the logo space so expanding never shifts the focused row vertically.
            PeepBrandMark(width: 132)
                .opacity(navigation.expanded ? 1 : 0)
                .frame(width: navigation.expanded ? 312 : 64, alignment: .leading)
                .clipped().accessibilityHidden(!navigation.expanded)
                .padding(.leading, 18).padding(.bottom, 12)
            ForEach([0, 3, 1, 4, 5, 8, 6], id: \.self) { index in
                if index == 6 { Spacer(minLength: 24) }
                Button {
                    if index == 6 { openAccountMenu() }
                    else { enterContent(destination: index) }
                } label: {
                    HStack(spacing: 24) {
                        if index == 6, let profile = railAccount,
                           profile.id == supabase.session?.userId,
                           AccountAvatar.hasArtwork(profile) {
                            AccountAvatar(profile: profile, size: 44).frame(width: 48)
                        } else {
                            Image(systemName: destinations[index].1)
                                .font(.system(size: 32, weight: .semibold)).frame(width: 48)
                        }
                        Text(destinations[index].0)
                            .font(.system(size: 30, weight: .semibold)).lineLimit(1)
                            .fixedSize().opacity(navigation.expanded ? 1 : 0)
                    }
                    .frame(width: navigation.expanded ? 312 : 64, height: 76, alignment: .leading)
                    .clipped()
                    .padding(.horizontal, 18)
                    // Selected destination: yellow fill. Focus: yellow outline just outside the item.
                    .foregroundStyle(navigation.selected == index ? .black : .white.opacity(railFocus == index ? 1 : 0.7))
                    .background(navigation.selected == index ? Color.yellow : Color.white.opacity(railFocus == index ? 0.12 : 0.035))
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .overlay(RoundedRectangle(cornerRadius: 25).stroke(Color.yellow, lineWidth: ContentAppearance.focusWidth).padding(-7).opacity(railFocus == index ? 1 : 0))
                }
                .buttonStyle(RailButtonStyle())
                .focused($railFocus, equals: index)
                .prefersDefaultFocus(navigation.selected == index, in: railScope)
                .accessibilityLabel(destinations[index].0)
                .accessibilityHint(index == 6 ? "Select to open profile options." : index == 3 && livePlayer != nil
                    ? "Select to browse channels. Hold Select for live playback options."
                    : "Select to open. Swipe Left to expand navigation. Swipe Right to enter the page.")
                .contextMenu {
                    if index == 3, livePlayer != nil {
                        Button("Watch current channel", systemImage: "play.fill") { resumeLiveChannel() }
                        Button("Stop live playback", systemImage: "stop.fill") { stopLiveChannel() }
                    }
                }
                .onRemoteMove { direction in
                    if direction == .left {
                        expandRail()
                    } else if direction == .right {
                        if index == 6 { openAccountMenu() }
                        else { enterContent(destination: index) }
                    }
                }
            }

        }
        .padding(.horizontal, 24).padding(.vertical, 24)
        .frame(maxHeight: .infinity)
        .background(navigation.selected == 0 && !navigation.expanded ? Color.clear : Color.black)
        .animation(reduceMotion ? nil : .easeInOut(duration: railTransitionDuration), value: navigation.expanded)

    }
}

private struct RailButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

/// Observe the player directly so a running preview updates when an admin blackout changes.
private struct LivePreview: View {
    @ObservedObject var player: PlayerModel
    var body: some View {
        ZStack {
            NativePlayer(player: player.player, interactive: false, pauseOnDismantle: false)
            if let message = player.blackoutMessage {
                Color.black
                Text(message).font(.system(size: 17)).multilineTextAlignment(.center).padding(18)
            }
        }
    }
}

/// A single remote focus group above the Account button. Back closes it.
private struct AccountQuickMenu: View {
    let profile: AccountProfile?
    let signedIn: Bool
    let canEditProfile: Bool
    let onAction: (String) -> Void
    let onClose: () -> Void
    @FocusState private var focused: String?
    private var actions: [(String, String, String)] {
        if signedIn {
            var items = [("viewers", "Switch viewer", "person.2.fill")]
            if canEditProfile { items.append(("profile", "Profile settings", "person.crop.circle")) }
            items.append(("settings", "App settings", "gearshape.fill"))
            items.append(("signout", "Sign out", "rectangle.portrait.and.arrow.right"))
            return items
        }
        return [("signin", "Sign in", "person.crop.circle"), ("settings", "App settings", "gearshape.fill")]
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 16) {
                if let profile { AccountAvatar(profile: profile, size: 54) }
                Text(profile?.displayName ?? "Welcome to Peep").font(.system(size: 25, weight: .semibold, design: .rounded)).lineLimit(1)
            }.padding(.horizontal, 14).padding(.vertical, 16)
            Divider().overlay(.white.opacity(0.1)).padding(.bottom, 8)
            ForEach(actions, id: \.0) { item in
                Button { onAction(item.0) } label: {
                    Label(item.1, systemImage: item.2)
                        .font(.system(size: 23, weight: .medium))
                        .frame(maxWidth: .infinity, alignment: .leading).padding(18)
                }.buttonStyle(BrowseCardStyle()).focused($focused, equals: item.0)
                .onRemoteMove { direction in
                    guard let index = actions.firstIndex(where: { $0.0 == item.0 }) else { return }
                    switch direction {
                    case .up: if index > 0 { focused = actions[index - 1].0 }
                    case .down: if index + 1 < actions.count { focused = actions[index + 1].0 }
                    case .left: onClose()
                    default: break
                    }
                }
            }
        }.padding(20).background(Color(white: 0.08), in: RoundedRectangle(cornerRadius: 28))
            .overlay(RoundedRectangle(cornerRadius: 28).strokeBorder(.white.opacity(0.12), lineWidth: 1))
            .shadow(color: .black.opacity(0.65), radius: 30, y: 12)
            .focusSection()
            .task { await Task.yield(); guard !Task.isCancelled else { return }; focused = actions.first?.0 }
            .onExitCommand(perform: onClose)
    }
}
