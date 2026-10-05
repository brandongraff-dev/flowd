import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct PayoutsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "banknote.fill",
                title: "Payouts",
                message: "To be built by ios-wallet-widgets. Weekly Fri 18:00 UTC free, upcoming estimate, history with dates, proof links, failure with reason and retry, method summary."
            )
        }
        .flowdNavigationTitle("Payouts", large: false)
    }
}

#Preview {
    NavigationStack {
        PayoutsView()
    }
    .flowdPreviewEnvironment()
}
