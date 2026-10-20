import SwiftUI

struct ContentView: View {
    @EnvironmentObject var supabase: SupabaseService

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house.fill") }

            MoviesView()
                .tabItem { Label("Movies", systemImage: "film.fill") }

            SeriesView()
                .tabItem { Label("Series", systemImage: "tv.fill") }

            StreamsView()
                .tabItem { Label("Live TV", systemImage: "antenna.radiowaves.left.and.right") }

            SearchView()
                .tabItem { Label("Search", systemImage: "magnifyingglass") }

            ProfileMenuView()
                .tabItem { Label("Account", systemImage: "person.fill") }
        }
    }
}
