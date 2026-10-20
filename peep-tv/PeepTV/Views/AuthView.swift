import SwiftUI

struct AuthView: View {
    @EnvironmentObject var supabase: SupabaseService
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            HStack(spacing: 0) {
                // Left panel — branding
                VStack(alignment: .leading, spacing: 24) {
                    Spacer()
                    Text("peep")
                        .font(.system(size: 96, weight: .heavy, design: .rounded))
                        .foregroundColor(Color(hex: "#facc15"))

                    Text("Find your next\nfavorite.")
                        .font(.system(size: 36, weight: .light))
                        .foregroundColor(Color(white: 0.6))
                        .lineSpacing(8)

                    Spacer()
                }
                .frame(maxWidth: .infinity)
                .padding(80)

                // Right panel — sign in form
                VStack(alignment: .leading, spacing: 28) {
                    Text("Sign In")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundColor(.white)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("EMAIL")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color(white: 0.4))
                            .kerning(1.5)
                        TextField("you@example.com", text: $email)
                            .font(.system(size: 24))
                            .foregroundColor(.white)
                            .padding(18)
                            .background(Color(white: 0.1))
                            .cornerRadius(10)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("PASSWORD")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color(white: 0.4))
                            .kerning(1.5)
                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .font(.system(size: 24))
                            .foregroundColor(.white)
                            .padding(18)
                            .background(Color(white: 0.1))
                            .cornerRadius(10)
                    }

                    if let err = errorMessage {
                        Text(err)
                            .font(.system(size: 20))
                            .foregroundColor(.red)
                    }

                    Button {
                        Task { await signIn() }
                    } label: {
                        Group {
                            if isLoading {
                                ProgressView().progressViewStyle(.circular).tint(.black)
                            } else {
                                Text("Sign In")
                                    .font(.system(size: 26, weight: .bold))
                                    .foregroundColor(.black)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 20)
                        .background(Color(hex: "#facc15"))
                        .cornerRadius(12)
                    }
                    .buttonStyle(.card)
                    .disabled(isLoading || email.isEmpty || password.isEmpty)
                    .opacity(email.isEmpty || password.isEmpty ? 0.5 : 1)
                    Button("Back to browsing") { dismiss() }
                }
                .frame(maxWidth: 560)
                .padding(80)
                .background(Color(white: 0.06))
            }
        }
    }

    private func signIn() async {
        isLoading = true
        errorMessage = nil
        do {
            try await supabase.signIn(email: email, password: password)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
