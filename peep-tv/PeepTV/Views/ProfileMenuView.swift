import SwiftUI
import CoreImage.CIFilterBuiltins

struct ProfileMenuView: View {
    var reloadCatalog: () -> Void = {}
    @State private var showAppSettings = false
    @EnvironmentObject var supabase: SupabaseService
    @State private var showProfileSelect = false
    @State private var showSignIn = false
    @State private var confirmSignOut = false
    @State private var account: AccountProfile?
    @State private var editing: AccountProfile?
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        HStack(alignment: .center, spacing: 100) {
            VStack(alignment: .leading, spacing: 28) {
                PeepBrandMark(width: 180)
                Text("Your corner\nof Peep.").font(.system(size: 60, weight: .bold, design: .serif))
                Text(supabase.session == nil ? "Make yourself at home. Sign in to manage your profile." : "A little more you. Your name and avatar follow your account.")
                    .font(.system(size: 25)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }.frame(width: 500)
            VStack(alignment: .leading, spacing: 26) {
                Button("App Settings") { showAppSettings = true }.buttonStyle(BrowseCardStyle())
                if supabase.session == nil {
                    Image(systemName: "person.crop.circle").font(.system(size: 84)).foregroundStyle(.white.opacity(0.7))
                    Text("Welcome to Peep").font(.title2.bold())
                    Text("You can keep browsing and watching as a guest.").foregroundStyle(.secondary)
                    Button { showSignIn = true } label: { Text("Sign In").font(.system(size: 24, weight: .semibold)).padding(.horizontal, 28).padding(.vertical, 16) }.buttonStyle(BrowseCardStyle())
                } else if loading {
                    ProgressView("Loading your profile…")
                } else if let account {
                    HStack(spacing: 24) {
                        AccountAvatar(profile: account, size: 110)
                        VStack(alignment: .leading, spacing: 8) {
                            Text(account.displayName).font(.title2.bold()).lineLimit(2)
                            if let email = account.email { Text(email).font(.system(size: 22)).foregroundStyle(.secondary).lineLimit(2) }
                            if let username = account.username, !username.isEmpty { Text("@\(username)").font(.system(size: 22)).foregroundStyle(.secondary) }
                        }
                    }
                    Button("Profile Settings") { editing = account }.buttonStyle(BrowseCardStyle())
                    if !supabase.profiles.isEmpty {
                        Button("Viewer: \(supabase.activeProfile?.name ?? "Choose profile")") { showProfileSelect = true }.buttonStyle(BrowseCardStyle())
                        Text("Viewer selection does not sync watch history yet.").font(.system(size: 19)).foregroundStyle(.secondary)
                    }
                    Button("Sign Out of This TV", role: .destructive) { confirmSignOut = true }.buttonStyle(BrowseCardStyle())
                }
                if let error {
                    Text(error).font(.system(size: 22)).foregroundStyle(.secondary)
                    Button("Retry") { Task { await load() } }.buttonStyle(BrowseCardStyle())
                    Button("Sign Out of This TV", role: .destructive) { confirmSignOut = true }.buttonStyle(BrowseCardStyle())
                }
            }
            .frame(width: 650, alignment: .leading).padding(44)
            .background(Color.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 24))
        }
        .padding(70).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.black)
        .task(id: supabase.session?.userId) { await load() }
        .sheet(isPresented: $showAppSettings) {
            VStack {
                Button { showAppSettings = false } label: { Label("Back to Account", systemImage: "chevron.left").font(.system(size: 23, weight: .semibold)).padding(.horizontal, 28).padding(.vertical, 16) }.buttonStyle(BrowseCardStyle()).padding(.top, 30)
                AppSettingsView(reloadCatalog: reloadCatalog)
            }.background(Color.black).onExitCommand { showAppSettings = false }
        }
        .sheet(isPresented: $showSignIn) { AuthView() }
        .fullScreenCover(item: $editing) { profile in
            ProfileSettingsView(profile: profile) { account = $0 }
        }
        .fullScreenCover(isPresented: $showProfileSelect) { ProfileSelectView() }
        .confirmationDialog("Sign out of this Apple TV?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign Out", role: .destructive) { supabase.signOut(); account = nil }
            Button("Cancel", role: .cancel) {}
        } message: { Text("You can still browse and watch as a guest.") }
    }

    private func load() async {
        account = nil; error = nil
        guard supabase.session != nil else { return }
        loading = true
        defer { loading = false }
        do {
            account = try await supabase.fetchAccountProfile()
            try? await supabase.reloadProfiles()
        } catch { self.error = error.localizedDescription }
    }
}

struct ProfileSettingsView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.dismiss) private var dismiss
    let profile: AccountProfile
    let onSave: (AccountProfile) -> Void
    @State private var name: String
    @State private var avatarID: String?
    @State private var saving = false
    @State private var error: String?
    @State private var discard = false
    @FocusState private var focus: String?

    init(profile: AccountProfile, onSave: @escaping (AccountProfile) -> Void) {
        self.profile = profile
        self.onSave = onSave
        _name = State(initialValue: profile.full_name ?? profile.username ?? "")
    }
    private var changed: Bool { name != (profile.full_name ?? profile.username ?? "") || avatarID != nil }
    private var valid: Bool { (try? AccountProfileUpdate(name: name, avatarID: avatarID)) != nil }

    private var preview: AccountProfile {
        AccountProfile(id: profile.id, email: profile.email, username: profile.username,
                       full_name: name.isEmpty ? profile.displayName : name,
                       avatar_id: avatarID ?? profile.avatar_id,
                       avatar_url: avatarID == nil ? profile.avatar_url : nil)
    }
    private var selectedAvatar: String? { avatarID ?? (profile.avatar_url == nil ? profile.avatar_id : nil) }

    var body: some View {
        VStack(alignment: .leading, spacing: 30) {
            HStack {
                Text("Profile settings").font(.system(size: 52, weight: .bold, design: .rounded))
                Spacer()
                PeepBrandMark(width: 108)
            }
            HStack(alignment: .top, spacing: 65) {
                VStack(spacing: 26) {
                    AccountAvatar(profile: preview, size: 200)
                    Text(preview.displayName).font(.system(size: 30, weight: .semibold, design: .rounded))
                        .lineLimit(2).multilineTextAlignment(.center)
                    Text("Your account profile").font(.system(size: 20)).foregroundStyle(.secondary)
                    Text("Your name and avatar update across Peep.")
                        .font(.system(size: 20)).foregroundStyle(.white.opacity(0.45)).multilineTextAlignment(.center)
                }.frame(width: 290).padding(.top, 38)
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text("Display name").font(.system(size: 26, weight: .semibold, design: .rounded))
                        TextField("Your name", text: $name).focused($focus, equals: "name")
                            .font(.system(size: 26)).disabled(saving)
                        Text("1–80 characters").font(.system(size: 18)).foregroundStyle(.secondary)
                        Text("Choose your look").font(.system(size: 29, weight: .semibold, design: .rounded)).padding(.top, 12)
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 6), spacing: 18) {
                            ForEach(TVAvatar.choices) { avatar in
                                Button { avatarID = avatar.id } label: {
                                    VStack(spacing: 12) {
                                        Text(avatar.emoji).font(.system(size: 54))
                                            .frame(width: 100, height: 100).background(avatar.gradient, in: Circle())
                                            .overlay(alignment: .bottomTrailing) {
                                                if selectedAvatar == avatar.id {
                                                    Image(systemName: "checkmark.circle.fill")
                                                        .font(.system(size: 26)).symbolRenderingMode(.palette)
                                                        .foregroundStyle(.black, .white)
                                                }
                                            }
                                        Text(avatar.name).font(.system(size: 17, weight: .medium)).lineLimit(1)
                                    }.padding(.vertical, 14).frame(maxWidth: .infinity)
                                }.buttonStyle(ProfileAvatarChoiceStyle()).disabled(saving)
                                    .accessibilityLabel("\(avatar.name) avatar")
                                    .accessibilityAddTraits(selectedAvatar == avatar.id ? .isSelected : [])
                            }
                        }
                        Text("Choose an avatar to replace your photo, or leave it unchanged to keep it.")
                            .font(.system(size: 18)).foregroundStyle(.secondary)
                    }.padding(12)
                }.frame(maxWidth: .infinity)
            }
            Divider().overlay(.white.opacity(0.08))
            HStack(spacing: 22) {
                Button { Task { await save() } } label: {
                    Label(saving ? "Saving…" : "Save changes", systemImage: "checkmark")
                        .font(.system(size: 24, weight: .semibold)).padding(.horizontal, 30).padding(.vertical, 19)
                }.buttonStyle(SettingsRowStyle()).disabled(!valid || !changed || saving)
                    .opacity(valid && changed || saving ? 1 : 0.4)
                Button { close() } label: {
                    Text("Cancel").font(.system(size: 24, weight: .medium)).padding(.horizontal, 30).padding(.vertical, 19)
                }.buttonStyle(SettingsRowStyle()).disabled(saving)
                if saving { ProgressView() }
                if let error { Text(error).font(.system(size: 20)).foregroundStyle(.red).lineLimit(2) }
                Spacer(minLength: 0)
            }
        }.frame(maxWidth: 1500).padding(.horizontal, 70).padding(.vertical, 55)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.ignoresSafeArea())
        .interactiveDismissDisabled(changed || saving)
        .onAppear { focus = "name" }
        .onExitCommand { if !saving { close() } }
        .confirmationDialog("Discard your changes?", isPresented: $discard, titleVisibility: .visible) {
            Button("Discard Changes", role: .destructive) { dismiss() }
            Button("Keep Editing", role: .cancel) {}
        }
    }
    private func close() { if changed { discard = true } else { dismiss() } }
    private func save() async {
        saving = true; error = nil
        defer { saving = false }
        do {
            let saved = try await supabase.updateAccountProfile(name: name, avatarID: avatarID)
            onSave(saved)
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

struct TVAvatar: Identifiable {
    let id: String
    let name: String
    let emoji: String
    let start: String
    let end: String
    var gradient: LinearGradient { LinearGradient(colors: [Color(hex: start), Color(hex: end)], startPoint: .topLeading, endPoint: .bottomTrailing) }
    static let choices: [TVAvatar] = [
        .init(id: "a5", name: "Leaf", emoji: "🌿", start: "#22c55e", end: "#16a34a"),
        .init(id: "a6", name: "Lightning", emoji: "⚡", start: "#3b82f6", end: "#6366f1"),
        .init(id: "a7", name: "Theater", emoji: "🎭", start: "#f59e0b", end: "#ef4444"),
        .init(id: "a8", name: "Music", emoji: "🎵", start: "#8b5cf6", end: "#ec4899"),
        .init(id: "a9", name: "Gaming", emoji: "🎮", start: "#0ea5e9", end: "#22c55e"),
        .init(id: "a10", name: "Trophy", emoji: "🏆", start: "#f43f5e", end: "#f97316"),
        .init(id: "a11", name: "Alien", emoji: "👾", start: "#64748b", end: "#334155"),
        .init(id: "a12", name: "Star", emoji: "⭐", start: "#facc15", end: "#f97316"),
        .init(id: "a13", name: "Fox", emoji: "🦊", start: "#f97316", end: "#b45309"),
        .init(id: "a14", name: "Panda", emoji: "🐼", start: "#64748b", end: "#1e293b"),
        .init(id: "a15", name: "Cat", emoji: "🐱", start: "#fb7185", end: "#be185d"),
        .init(id: "a16", name: "Dog", emoji: "🐶", start: "#d97706", end: "#78350f"),
        .init(id: "a17", name: "Frog", emoji: "🐸", start: "#84cc16", end: "#15803d"),
        .init(id: "a18", name: "Octopus", emoji: "🐙", start: "#c084fc", end: "#7e22ce"),
        .init(id: "a19", name: "Shark", emoji: "🦈", start: "#38bdf8", end: "#0369a1"),
        .init(id: "a20", name: "Owl", emoji: "🦉", start: "#a78bfa", end: "#4338ca"),
        .init(id: "a21", name: "Astronaut", emoji: "🧑‍🚀", start: "#6366f1", end: "#172554"),
        .init(id: "a22", name: "Rocket", emoji: "🚀", start: "#f43f5e", end: "#7c3aed"),
        .init(id: "a23", name: "Planet", emoji: "🪐", start: "#a855f7", end: "#312e81"),
        .init(id: "a24", name: "Robot", emoji: "🤖", start: "#22d3ee", end: "#475569"),
        .init(id: "a25", name: "Popcorn", emoji: "🍿", start: "#ef4444", end: "#9f1239"),
        .init(id: "a26", name: "Film", emoji: "🎬", start: "#475569", end: "#0f172a"),
        .init(id: "a27", name: "Basketball", emoji: "🏀", start: "#fb923c", end: "#c2410c"),
        .init(id: "a28", name: "Headphones", emoji: "🎧", start: "#2dd4bf", end: "#0f766e")
    ]
}

struct AccountAvatar: View {
    static func hasArtwork(_ profile: AccountProfile) -> Bool {
        MediaURL.parse(profile.avatar_url) != nil || TVAvatar.choices.contains(where: { $0.id == profile.avatar_id })
    }
    let profile: AccountProfile
    let size: CGFloat
    var body: some View {
        ZStack {
            if let avatar = TVAvatar.choices.first(where: { $0.id == profile.avatar_id }) {
                Circle().fill(avatar.gradient)
                Text(avatar.emoji).font(.system(size: size * 0.5))
            } else {
                Circle().fill(Color.yellow.opacity(0.2))
                Text(String(profile.displayName.prefix(1)).uppercased()).font(.system(size: size * 0.45, weight: .bold)).foregroundStyle(.yellow)
            }
            if let url = MediaURL.parse(profile.avatar_url) {
                AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Color.clear }
            }
        }.frame(width: size, height: size).clipShape(Circle()).accessibilityHidden(true)
    }
}

struct AppSettingsView: View {
    var reloadCatalog: () -> Void = {}
    @ObservedObject private var preferences = PlaybackPreferences.shared
    @State private var accountManagementOpen = false
    @State private var privacyOpen = false
    @State private var confirmReset = false
    @State private var status: String?
    private var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Unknown" }
    private var build: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "Unknown" }
    private var environment: String { (try? AppConfiguration.load().isDevelopment) == true ? "Development · FARRIS" : "Release" }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Settings").font(.system(size: 52, weight: .bold, design: .rounded))
                    Text("Your playback. Your way.").font(.system(size: 24)).foregroundStyle(.secondary)
                }
                Spacer()
                Text("Version \(version) · \(build)").font(.system(size: 19)).foregroundStyle(.secondary)
            }.padding(.horizontal, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    sectionLabel("PLAYBACK")
                    settingsRow("Start automatically", detail: "Start videos and channels when opened.", icon: "play.fill", value: preferences.startAutomatically ? "On" : "Off") {
                        preferences.startAutomatically.toggle()
                    }
                    settingsRow("Next episode", detail: "Continue after a 10-second countdown. Cancel with Back.", icon: "play.rectangle.on.rectangle", value: preferences.autoplayNext ? "On" : "Off") {
                        preferences.autoplayNext.toggle()
                    }
                    sectionLabel("VIDEO & AUDIO")
                    settingsRow("Streaming quality", detail: "Automatic adapts to your connection. Data Saver requests a lower bitrate when available.", icon: "wifi", value: preferences.quality.rawValue) {
                        let options = PlaybackQuality.allCases
                        let index = options.firstIndex(of: preferences.quality) ?? options.startIndex
                        preferences.quality = options[(index + 1) % options.count]
                    }
                    settingsRow("Subtitles", detail: "Uses available subtitle tracks. System Default follows tvOS.", icon: "captions.bubble", value: preferences.subtitles == .on ? "On" : preferences.subtitles.rawValue) {
                        let options = SubtitlePreference.allCases
                        let index = options.firstIndex(of: preferences.subtitles) ?? options.startIndex
                        preferences.subtitles = options[(index + 1) % options.count]
                    }
                    if let _ = AppConfiguration.accountManagementURL() {
                        sectionLabel("ACCOUNT")
                        settingsRow("Manage account", detail: "Use your phone to manage account deletion securely.", icon: "person.crop.circle", value: nil) { accountManagementOpen = true }
                    }
                    sectionLabel("PRIVACY")
                    settingsRow("Privacy information", detail: "Learn about account data, viewing activity and advertising.", icon: "hand.raised", value: nil) { privacyOpen = true }
                    sectionLabel("THIS APPLE TV")
                    settingsRow("Reload catalog", detail: "Check for the latest content and screen updates.", icon: "arrow.clockwise", value: nil) {
                        reloadCatalog(); status = "Catalog refreshed."
                    }
                    settingsRow("Reset preferences", detail: "Restore playback settings on this TV.", icon: "arrow.counterclockwise", value: nil) { confirmReset = true }
                    if let status {
                        Label(status, systemImage: "checkmark.circle").font(.system(size: 21)).foregroundStyle(.white.opacity(0.7)).padding(12)
                    }
                    Text("Settings are saved on this Apple TV. · \(environment)")
                        .font(.system(size: 18)).foregroundStyle(.secondary).padding(12)
                }.padding(12)
            }.frame(maxHeight: 650)
        }
        .frame(maxWidth: 1120).padding(.horizontal, 60).padding(.vertical, 30)
        .frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.black)
        .fullScreenCover(isPresented: $accountManagementOpen) {
            if let url = AppConfiguration.accountManagementURL() { TVAccountManagementView(url: url) }
        }
        .fullScreenCover(isPresented: $privacyOpen) { TVPrivacyInformationView() }
        .confirmationDialog("Reset playback preferences?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Reset Preferences", role: .destructive) { preferences.reset(); status = "Playback preferences reset." }
            Button("Cancel", role: .cancel) {}
        } message: { Text("Restores automatic playback, Automatic streaming, and System Default subtitles. Your account and profile stay signed in.") }
    }
    private func sectionLabel(_ title: String) -> some View {
        Text(title).font(.system(size: 17, weight: .semibold)).tracking(2)
            .foregroundStyle(.white.opacity(0.45)).padding(.top, 18).padding(.bottom, 4).padding(.leading, 8)
    }

    private func settingsRow(_ title: String, detail: String, icon: String, value: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 24) {
                Image(systemName: icon).font(.system(size: 27, weight: .medium)).frame(width: 42)
                    .foregroundStyle(.white.opacity(0.65))
                VStack(alignment: .leading, spacing: 8) {
                    Text(title).font(.system(size: 26, weight: .semibold, design: .rounded))
                    Text(detail).font(.system(size: 19)).foregroundStyle(.white.opacity(0.5))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 20)
                if let value {
                    Text(value).font(.system(size: 23, weight: .medium)).foregroundStyle(.white.opacity(0.8))
                }
                Image(systemName: value == nil ? "chevron.right" : "arrow.triangle.2.circlepath")
                    .font(.system(size: 18, weight: .semibold)).foregroundStyle(.white.opacity(0.4))
            }.padding(.horizontal, 28).padding(.vertical, 22)
                .frame(maxWidth: .infinity, minHeight: 104, alignment: .leading)
                .contentShape(RoundedRectangle(cornerRadius: 20))
        }.buttonStyle(SettingsRowStyle())
            .accessibilityLabel(title)
            .accessibilityValue(value ?? "")
            .accessibilityHint(value == nil ? detail : "Press Select to change. " + detail)
    }

}

struct SettingsRowStyle: ButtonStyle {
    @Environment(\.isFocused) private var focused
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.foregroundStyle(.white)
            .background(Color(white: configuration.isPressed ? 0.16 : focused ? 0.12 : 0.065), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(focused ? ContentAppearance.accent : .white.opacity(0.07), lineWidth: focused ? ContentAppearance.focusWidth : 1))
    }
}

struct ProfileAvatarChoiceStyle: ButtonStyle {
    @Environment(\.isFocused) private var focused
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.foregroundStyle(.white)
            .background(Color(white: configuration.isPressed ? 0.16 : focused ? 0.1 : 0.035), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(focused ? ContentAppearance.accent : .clear, lineWidth: ContentAppearance.focusWidth))
    }
}

private struct TVPrivacyInformationView: View {
    @Environment(\.dismiss) private var dismiss
    private struct Section: Decodable { let title: String; let text: String }
    private struct Content: Decodable { let sections: [Section] }
    private var sections: [Section] {
        guard let url = Bundle.main.url(forResource: "PrivacyInformation", withExtension: "json"),
              let data = try? Data(contentsOf: url), let content = try? JSONDecoder().decode(Content.self, from: data) else {
            return [Section(title: "Information unavailable", text: "Privacy information could not be loaded. Contact privacy@watchpeep.tv.")]
        }
        return content.sections
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            HStack {
                Text("Privacy information").font(.system(size: 48, weight: .bold, design: .rounded))
                Spacer()
                Button { dismiss() } label: {
                    Label("Back", systemImage: "chevron.left").font(.system(size: 23, weight: .semibold)).padding(.horizontal, 28).padding(.vertical, 18)
                }.buttonStyle(SettingsRowStyle())
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    ForEach(sections, id: \.title) { section in privacySection(section.title, section.text) }
                }.padding(28)
            }.focusable().accessibilityLabel("Privacy information. Scroll to read all sections.")
        }.frame(maxWidth: 1300).padding(60).frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.black).onExitCommand { dismiss() }
    }
    private func privacySection(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.system(size: 28, weight: .semibold, design: .rounded)).accessibilityAddTraits(.isHeader)
            Text(text).font(.system(size: 24)).foregroundStyle(.white.opacity(0.7)).lineSpacing(6).fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct TVAccountManagementView: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss
    private var qrCode: UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(url.absoluteString.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage,
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
    var body: some View {
        HStack(spacing: 90) {
            VStack(alignment: .leading, spacing: 26) {
                Text("Manage your account").font(.system(size: 48, weight: .bold, design: .rounded))
                Text("Scan with your phone to open account deletion.")
                    .font(.system(size: 27)).foregroundStyle(.secondary)
                Text("Sign in on your phone, check the account email, and confirm there. Scanning this code does not delete anything or sign you in.")
                    .font(.system(size: 24)).foregroundStyle(.white.opacity(0.65))
                Text(url.absoluteString).font(.system(size: 22))
                Button { dismiss() } label: {
                    Label("Back", systemImage: "chevron.left").font(.system(size: 24, weight: .semibold)).padding(.horizontal, 30).padding(.vertical, 18)
                }.buttonStyle(SettingsRowStyle())
            }.frame(width: 680)
            if let qrCode {
                Image(uiImage: qrCode).interpolation(.none).resizable().scaledToFit()
                    .frame(width: 300, height: 300).padding(28).background(.white, in: RoundedRectangle(cornerRadius: 20))
                    .accessibilityLabel("Scan this QR code with your phone to open \(url.absoluteString)")
            }
        }.padding(70).frame(maxWidth: .infinity, maxHeight: .infinity).background(.black)
            .onExitCommand { dismiss() }
    }
}
