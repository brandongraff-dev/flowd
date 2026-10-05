import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct EarningsCardSheet: View {
    let source: EarningsCardSource

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "rectangle.portrait.fill",
                title: "Earnings Card",
                message: "To be built by ios-wallet-widgets. 9:16 and 1:1 (ImageRenderer): gradient, tier badge, amount, period, delta, post count, tier median line, proof link and QR, Hide amounts, ShareLink, revoke proof."
            )
        }
        .flowdNavigationTitle("Earnings Card", large: false)
    }
}

#Preview {
    NavigationStack {
        EarningsCardSheet(source: .latest)
    }
    .flowdPreviewEnvironment()
}
