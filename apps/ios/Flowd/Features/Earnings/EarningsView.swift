import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct EarningsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "chart.bar.fill",
                title: "Earnings",
                message: "To be built by ios-wallet-widgets. Day, week and month chart (Swift Charts), by brand and bounty, gross vs net, median overlay, table alternative, Tax Desk CSV link."
            )
        }
        .flowdNavigationTitle("Earnings", large: false)
    }
}

#Preview {
    NavigationStack {
        EarningsView()
    }
    .flowdPreviewEnvironment()
}
