import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct MoneyClockView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "clock.fill",
                title: "Money Clock",
                message: "To be built by ios-wallet-widgets. Per-row timeline (posted, window closes, fraud check, cleared, payout) with timestamps, named delay reasons and next actions."
            )
        }
        .flowdNavigationTitle("Money Clock", large: false)
    }
}

#Preview {
    NavigationStack {
        MoneyClockView()
    }
    .flowdPreviewEnvironment()
}
