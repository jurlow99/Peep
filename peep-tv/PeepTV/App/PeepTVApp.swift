import SwiftUI

@main
struct PeepTVApp: App {
    @StateObject private var supabase = SupabaseService.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(supabase)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var supabase: SupabaseService

    var body: some View {
        Group {
            if supabase.session == nil {
                AuthView()
            } else if supabase.activeProfile == nil && !supabase.profiles.isEmpty {
                ProfileSelectView()
            } else {
                ContentView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: supabase.session == nil)
    }
}
