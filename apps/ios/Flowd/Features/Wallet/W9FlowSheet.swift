import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct W9FlowSheet: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "signature",
                title: "W-9",
                message: "To be built by ios-wallet-widgets. Just-in-time form (name, business type, masked TIN, address, e-sign) mock, save progress, errors, resulting status."
            )
        }
        .flowdNavigationTitle("W-9", large: false)
    }
}

#Preview {
    NavigationStack {
        W9FlowSheet()
    }
    .flowdPreviewEnvironment()
}
