import SwiftUI

@main
struct PeepTVApp: App {
    @StateObject private var supabase = SupabaseService.shared
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(supabase)
                .preferredColorScheme(.dark)
                .tint(Color(hex: "#facc15"))
        }
    }
}

struct RootView: View {
    @EnvironmentObject var supabase: SupabaseService
    var body: some View {
        Group {
            if let error = supabase.configurationError {
                StatusView(title: "Connect your catalog", message: error, symbol: "gearshape")
            } else if supabase.isRestoring {
                ProgressView("Opening peep…")
            } else if supabase.session != nil && supabase.activeProfile == nil && !supabase.profiles.isEmpty {
                ProfileSelectView()
            } else {
                ContentView()
                    .id(supabase.session?.userId ?? "guest")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black)
        .overlay(alignment: .bottomTrailing) {
            if supabase.configuration?.isDevelopment == true {
                Text("FARRIS · DEV").font(.caption).padding(10)
                    .background(.purple).clipShape(Capsule()).padding(24)
                    .allowsHitTesting(false)
            }
        }
        .task { await supabase.restoreSession() }
    }
}
