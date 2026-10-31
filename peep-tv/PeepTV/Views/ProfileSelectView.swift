import SwiftUI

struct ProfileSelectView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.dismiss) private var dismiss
    @State private var adding = false
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var firstProfileID = UUID().uuidString
    @FocusState private var focus: String?
    @Namespace private var scope
    private var preferredID: String {
        let saved = UserDefaults.standard.string(forKey: "peep_tv_profile_id")
        return supabase.profiles.first { $0.id == saved }?.id ?? supabase.profiles.first?.id ?? "account"
    }
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            RadialGradient(colors: [Color(white: 0.09), .black], center: UnitPoint(x: 0.5, y: 0.48), startRadius: 40, endRadius: 850).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                PeepBrandMark(width: 108)
                Spacer(minLength: 35)
                Text("Who's watching?")
                    .font(.system(size: 64, weight: .bold, design: .rounded)).tracking(-1.5)
                    .frame(maxWidth: .infinity)
                if supabase.activeProfile == nil {
                    Text("Or press Menu to continue without choosing.").font(.system(size: 21)).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                }
                if loading {
                    ProgressView("Getting your viewers…").frame(maxWidth: .infinity, minHeight: 330)
                } else if let error, supabase.profiles.isEmpty {
                    VStack(spacing: 20) {
                        Text(error).font(.system(size: 23)).foregroundStyle(.secondary)
                        Button("Try again") { Task { await load() } }.buttonStyle(BrowseCardStyle())
                    }.frame(maxWidth: .infinity, minHeight: 330)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 46) {
                            if supabase.profiles.isEmpty, let account = supabase.accountProfile {
                                viewerCard(id: "account", name: account.displayName, avatar: account) {
                                    Task {
                                        saving = true; error = nil
                                        defer { saving = false }
                                        do {
                                            let viewer = try await supabase.createViewerProfile(id: firstProfileID, name: String(account.displayName.prefix(40)), avatarID: account.avatar_id, avatarURL: account.avatar_url)
                                            supabase.selectProfile(viewer); dismiss()
                                        } catch { self.error = error.localizedDescription }
                                    }
                                }
                            }
                            ForEach(supabase.profiles) { profile in
                                viewerCard(id: profile.id, name: profile.name ?? "Viewer", avatar: AccountProfile(id: profile.id, email: nil, username: nil, full_name: profile.name, avatar_id: profile.avatar_id, avatar_url: profile.avatar_url)) {
                                    supabase.selectProfile(profile); dismiss()
                                }
                            }
                            Button { adding = true } label: {
                                VStack(spacing: 26) {
                                    ZStack {
                                        Circle().fill(Color(white: 0.075)).frame(width: 156, height: 156)
                                            .overlay(Circle().strokeBorder(.white.opacity(0.12), lineWidth: 2))
                                        Image(systemName: "plus").font(.system(size: 46, weight: .light))
                                    }.frame(width: 210, height: 210)
                                        .overlay(Circle().strokeBorder(focus == "add" ? ContentAppearance.accent : .clear, lineWidth: ContentAppearance.focusWidth))
                                    Text("Add viewer").font(.system(size: 25, weight: .medium, design: .rounded))
                                        .foregroundStyle(focus == "add" ? .white : Color(white: 0.5))
                                }.frame(width: 250, height: 300, alignment: .top)
                            }.buttonStyle(ViewerChoiceStyle()).focused($focus, equals: "add").disabled(saving)
                        }.padding(.horizontal, 20).padding(.vertical, 30).frame(minWidth: UIScreen.main.bounds.width - 200)
                    }.frame(height: 380).padding(.top, 48).focusScope(scope)
                }
                if let error, !supabase.profiles.isEmpty { Text(error).font(.system(size: 21)).foregroundStyle(.secondary).frame(maxWidth: .infinity) }
                if saving { ProgressView("Opening your space…").frame(maxWidth: .infinity) }
                Spacer(minLength: 25)
                // Match the logo's height so the profile group stays visually centered.
                Color.clear.frame(height: 45).accessibilityHidden(true)
            }.padding(.horizontal, 100).padding(.vertical, 65)
        }.foregroundStyle(.white)
        .task { await load() }
        // Menu always leaves this screen: with a viewer chosen it just closes; at launch it continues as the account.
        .onExitCommand {
            guard !saving else { return }
            if supabase.activeProfile == nil { supabase.skipProfileSelection() }
            dismiss()
        }
        .sheet(isPresented: $adding, onDismiss: { focus = "add" }) { AddViewerView { profile in supabase.selectProfile(profile); adding = false; dismiss() } }
    }
    private func viewerCard(id: String, name: String, avatar: AccountProfile, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 26) {
                AccountAvatar(profile: avatar, size: 190)
                    .frame(width: 210, height: 210)
                    .overlay(Circle().strokeBorder(focus == id ? ContentAppearance.accent : .clear, lineWidth: ContentAppearance.focusWidth))
                Text(name).font(.system(size: 29, weight: .semibold, design: .rounded))
                    .foregroundStyle(focus == id ? .white : Color(white: 0.65))
                    .lineLimit(1)
            }.frame(width: 250, height: 300, alignment: .top)
        }.buttonStyle(ViewerChoiceStyle()).focused($focus, equals: id)
        .prefersDefaultFocus(id == preferredID, in: scope).disabled(saving)
        .accessibilityLabel("Watch as \(name)")
    }
    private func load() async {
        loading = true; error = nil
        defer { loading = false; focus = preferredID }
        do {
            async let viewers: Void = supabase.reloadProfiles()
            async let account = supabase.fetchAccountProfile()
            _ = try await (viewers, account)
        } catch { self.error = "Your viewers couldn't be loaded. Please try again." }
    }
}

private struct ViewerChoiceStyle: ButtonStyle {
    @Environment(\.isFocused) private var focused
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .scaleEffect(configuration.isPressed ? 0.97 : focused && !reduceMotion ? 1.055 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: focused)
    }
}

private struct AddViewerView: View {
    let onCreated: (Profile) -> Void
    @EnvironmentObject private var service: SupabaseService
    @Environment(\.dismiss) private var dismiss
    @State private var id = UUID().uuidString
    @State private var name = ""
    @State private var avatarID = "a12"
    @State private var saving = false
    @State private var error: String?
    @FocusState private var nameFocused: Bool
    private var valid: Bool {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return !clean.isEmpty && clean.count <= 40
    }
    private var preview: AccountProfile {
        AccountProfile(id: id, email: nil, username: nil, full_name: name.isEmpty ? "New viewer" : name, avatar_id: avatarID, avatar_url: nil)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            HStack {
                Text("Add viewer").font(.system(size: 48, weight: .bold, design: .rounded))
                Spacer()
                PeepBrandMark(width: 108)
            }
            HStack(alignment: .top, spacing: 50) {
                VStack(spacing: 24) {
                    AccountAvatar(profile: preview, size: 180)
                    Text(preview.displayName).font(.system(size: 28, weight: .semibold, design: .rounded))
                        .lineLimit(2).multilineTextAlignment(.center)
                    Text("Make yourself at home.").font(.system(size: 21)).foregroundStyle(.secondary)
                }.frame(width: 280).padding(.top, 32)
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Text("Viewer name").font(.system(size: 26, weight: .semibold, design: .rounded))
                        TextField("Your name", text: $name).font(.system(size: 26)).focused($nameFocused).disabled(saving)
                        Text("1–40 characters").font(.system(size: 18)).foregroundStyle(.secondary)
                        Text("Choose your look").font(.system(size: 28, weight: .semibold, design: .rounded)).padding(.top, 8)
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 14), count: 6), spacing: 16) {
                            ForEach(TVAvatar.choices) { avatar in
                                Button { avatarID = avatar.id } label: {
                                    VStack(spacing: 12) {
                                        Text(avatar.emoji).font(.system(size: 50)).frame(width: 96, height: 96)
                                            .background(avatar.gradient, in: Circle())
                                            .overlay(alignment: .bottomTrailing) {
                                                if avatarID == avatar.id {
                                                    Image(systemName: "checkmark.circle.fill").font(.system(size: 26))
                                                        .symbolRenderingMode(.palette).foregroundStyle(.black, .white)
                                                }
                                            }
                                        Text(avatar.name).font(.system(size: 17, weight: .medium)).lineLimit(1)
                                    }.padding(.vertical, 14).frame(maxWidth: .infinity)
                                }.buttonStyle(ProfileAvatarChoiceStyle()).disabled(saving)
                                    .accessibilityLabel("\(avatar.name) avatar")
                                    .accessibilityAddTraits(avatarID == avatar.id ? .isSelected : [])
                            }
                        }
                        Text("Watch history and My List are shared on this account.")
                            .font(.system(size: 18)).foregroundStyle(.secondary)
                    }.padding(12)
                }
            }
            Divider().overlay(.white.opacity(0.08))
            HStack(spacing: 22) {
                Button { Task { await create() } } label: {
                    Label(saving ? "Creating…" : "Create viewer", systemImage: "plus")
                        .font(.system(size: 24, weight: .semibold)).padding(.horizontal, 30).padding(.vertical, 19)
                }.buttonStyle(SettingsRowStyle()).disabled(saving || !valid).opacity(valid || saving ? 1 : 0.4)
                Button { dismiss() } label: {
                    Text("Cancel").font(.system(size: 24, weight: .medium)).padding(.horizontal, 30).padding(.vertical, 19)
                }.buttonStyle(SettingsRowStyle()).disabled(saving)
                if saving { ProgressView() }
                if let error { Text(error).font(.system(size: 20)).foregroundStyle(.red).lineLimit(2) }
                Spacer(minLength: 0)
            }
        }.frame(maxWidth: 1450).padding(.horizontal, 60).padding(.vertical, 40)
            .frame(maxWidth: .infinity, maxHeight: .infinity).background(.black)
            .interactiveDismissDisabled(saving)
            .onAppear { nameFocused = true }
            .onExitCommand { if !saving { dismiss() } }
    }
    private func create() async {
        guard valid, !saving else { return }
        saving = true; error = nil
        defer { saving = false }
        do { onCreated(try await service.createViewerProfile(id: id, name: name, avatarID: avatarID)) }
        catch { self.error = error.localizedDescription }
    }
}
