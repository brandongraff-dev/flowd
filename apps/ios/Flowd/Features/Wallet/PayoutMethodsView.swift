import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct PayoutMethodsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "building.columns.fill",
                title: "Payout methods",
                message: "To be built by ios-wallet-widgets. Stripe-style web sheet (mock) to add bank or debit, status, default, verification, remove, security note."
            )
        }
        .flowdNavigationTitle("Payout methods", large: false)
    }
}

#Preview {
    NavigationStack {
        PayoutMethodsView()
    }
    .flowdPreviewEnvironment()
}
