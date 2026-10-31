import SwiftUI

struct StatusView: View {
    let title: String
    let message: String
    var symbol = "exclamationmark.circle"
    var retry: (() -> Void)? = nil
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: symbol).font(.system(size: 60)).foregroundStyle(.white.opacity(0.7))
            Text(title).font(.system(size: 40, weight: .semibold)).accessibilityAddTraits(.isHeader)
            Text(message).font(.system(size: 26)).foregroundStyle(Color(white: 0.75))
                .multilineTextAlignment(.center).frame(maxWidth: 800)
            if let retry { Button("Try Again", action: retry).buttonStyle(.borderedProminent) }
        }
        .sidebarBoundary()
        .padding(60)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
