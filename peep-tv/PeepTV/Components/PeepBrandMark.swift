import SwiftUI

/// Supplied Apple TV wordmark, kept at its original aspect ratio.
struct PeepBrandMark: View {
    var width: CGFloat = 180
    var body: some View {
        Image("PeepTVWordmark")
            .resizable().scaledToFit()
            .frame(width: width, height: width * 611 / 1797)
            .padding(.horizontal, width * 0.12).padding(.vertical, width * 0.08)
            .background(LinearGradient(colors: [Color(hex: "#ffeb48"), Color(hex: "#ffda00")], startPoint: .top, endPoint: .bottom))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .accessibilityLabel("Peep")
    }
}
