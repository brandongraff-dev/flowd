import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct RightsRenewalsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "checkmark.shield.fill",
                title: "Rights and renewals",
                message: "To be built by ios-wallet-widgets. Licences on my posts, renewal offers (25% of base fee per 30 days), expiry alerts, Spark access status, AI likeness off."
            )
        }
        .flowdNavigationTitle("Rights", large: false)
    }
}

#Preview {
    NavigationStack {
        RightsRenewalsView()
    }
    .flowdPreviewEnvironment()
}
