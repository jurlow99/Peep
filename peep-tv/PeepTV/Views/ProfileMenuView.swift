import SwiftUI

struct ProfileMenuView: View {
    @EnvironmentObject var supabase: SupabaseService
    @State private var showProfileSelect = false

    var body: some View {
        VStack(spacing: 40) {
            Text("Account")
                .font(.system(size: 52, weight: .bold, design: .serif))
                .foregroundColor(.white)

            if let profile = supabase.activeProfile {
                VStack(spacing: 12) {
                    Circle()
                        .fill(Color(hex: "#6366f1"))
                        .frame(width: 120, height: 120)
                        .overlay(
                            Text(String((profile.name ?? "?").prefix(1)).uppercased())
                                .font(.system(size: 56, weight: .bold))
                                .foregroundColor(.white)
                        )

                    Text(profile.name ?? "Profile")
                        .font(.system(size: 32, weight: .semibold))
                        .foregroundColor(.white)
                }
            }

            VStack(spacing: 16) {
                Button("Switch Profile") {
                    showProfileSelect = true
                }
                .font(.system(size: 26))
                .padding(.horizontal, 48)
                .padding(.vertical, 16)
                .background(Color(white: 0.15))
                .foregroundColor(.white)
                .cornerRadius(10)
                .buttonStyle(.card)

                Button("Sign Out") {
                    supabase.signOut()
                }
                .font(.system(size: 26))
                .padding(.horizontal, 48)
                .padding(.vertical, 16)
                .background(Color(white: 0.1))
                .foregroundColor(Color(white: 0.6))
                .cornerRadius(10)
                .buttonStyle(.card)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black)
        .fullScreenCover(isPresented: $showProfileSelect) {
            ProfileSelectView()
        }
    }
}
