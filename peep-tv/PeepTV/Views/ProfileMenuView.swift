import SwiftUI

struct ProfileMenuView: View {
    @EnvironmentObject var supabase: SupabaseService
    @State private var showProfileSelect = false
    @State private var showSignIn = false
    @State private var profileError: String?

    var body: some View {
        VStack(spacing: 36) {
            Text("peep").font(.system(size: 72, weight: .heavy, design: .rounded)).foregroundStyle(.yellow)
            Text(supabase.session == nil ? "Make yourself at home." : (supabase.activeProfile?.name ?? "Your account"))
                .font(.title)
            if supabase.session == nil {
                Text("Browse and watch for free. Sign in to choose your profile.")
                    .foregroundStyle(.secondary)
                Button("Sign In") { showSignIn = true }
            } else {
                Button("Switch Profile") {
                    Task {
                        do {
                            try await supabase.reloadProfiles()
                            if supabase.profiles.isEmpty {
                                profileError = "No viewer profiles yet. Create one at watchpeep.tv."
                            } else {
                                showProfileSelect = true
                            }
                        } catch { profileError = error.localizedDescription }
                    }
                }
                Button("Sign Out") { supabase.signOut() }
            }
            Text("Manage your account at watchpeep.tv").font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.black)
        .sheet(isPresented: $showSignIn) { AuthView() }
        .fullScreenCover(isPresented: $showProfileSelect) { ProfileSelectView() }
        .alert("Profiles", isPresented: Binding(get: { profileError != nil }, set: { if !$0 { profileError = nil } })) {
            Button("OK") { profileError = nil }
        } message: { Text(profileError ?? "") }
    }
}
