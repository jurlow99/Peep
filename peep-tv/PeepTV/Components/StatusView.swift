import SwiftUI

struct StatusView: View {
    let title: String
    let message: String
    var symbol = "exclamationmark.circle"
    var retry: (() -> Void)? = nil
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: symbol).font(.system(size: 60)).foregroundStyle(.yellow)
            Text(title).font(.title2.bold())
            Text(message).font(.body).foregroundStyle(.secondary)
                .multilineTextAlignment(.center).frame(maxWidth: 800)
            if let retry { Button("Try Again", action: retry).buttonStyle(.borderedProminent) }
        }
        .padding(60)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
