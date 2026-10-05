import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct InstantCashOutSheet: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "bolt.circle.fill",
                title: "Cash out now",
                message: "To be built by ios-wallet-widgets. Amount up to cleared, fee preview (1.5%, min $0.50, max $15) and net before confirm, free allowance, blocked states named, success celebration."
            )
        }
        .flowdNavigationTitle("Cash out", large: false)
    }
}

#Preview {
    NavigationStack {
        InstantCashOutSheet()
    }
    .flowdPreviewEnvironment()
}
