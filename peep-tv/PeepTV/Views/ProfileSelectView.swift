import SwiftUI

struct ProfileSelectView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.dismiss) private var dismiss

    let avatarColors: [Color] = [
        Color(hex: "#6366f1"), Color(hex: "#ec4899"),
        Color(hex: "#f59e0b"), Color(hex: "#10b981"),
        Color(hex: "#3b82f6"), Color(hex: "#8b5cf6")
    ]

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 60) {
                Text("Who's watching?")
                    .font(.system(size: 56, weight: .bold))
                    .foregroundColor(.white)

                HStack(spacing: 40) {
                    ForEach(supabase.profiles) { profile in
                        Button {
                            supabase.selectProfile(profile)
                            dismiss()
                        } label: {
                            VStack(spacing: 16) {
                                ZStack {
                                    Circle()
                                        .fill(avatarColors[(profile.avatar_id ?? "a1").utf8.reduce(0) { ($0 + Int($1)) % avatarColors.count }])
                                        .frame(width: 160, height: 160)
                                    Text(String((profile.name ?? "?").prefix(1)).uppercased())
                                        .font(.system(size: 72, weight: .bold))
                                        .foregroundColor(.white)
                                }

                                Text(profile.name ?? "Profile")
                                    .font(.system(size: 28, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                        }
                        .buttonStyle(.card)
                    }
                }

                Button("Sign Out") {
                    supabase.signOut()
                    dismiss()
                }
                .font(.system(size: 22))
                .foregroundColor(Color(white: 0.4))
                .buttonStyle(.plain)
                .padding(.top, 20)
            }
        }
    }
}
