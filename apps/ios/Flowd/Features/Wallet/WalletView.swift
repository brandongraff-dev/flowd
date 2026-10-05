import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct WalletView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "creditcard.fill",
                title: "Wallet",
                message: "To be built by ios-wallet-widgets. Money Clock hero: Cleared and Pending side by side (never summed), Paid-out total, earnings chart, per-post list, Cash out with fee line, honours numbers-off."
            )
        }
        .flowdNavigationTitle("Wallet", large: true)
    }
}

#Preview {
    NavigationStack {
        WalletView()
    }
    .flowdPreviewEnvironment()
}
