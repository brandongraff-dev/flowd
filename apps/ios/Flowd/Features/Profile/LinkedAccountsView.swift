import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct LinkedAccountsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "link",
                title: "Linked accounts",
                message: "To be built by ios-onboarding-profile. Per account status, last view sync, health; reconnect; disconnect; \"flowd never posts for you\"."
            )
        }
        .flowdNavigationTitle("Linked accounts", large: false)
    }
}

#Preview {
    NavigationStack {
        LinkedAccountsView()
    }
    .flowdPreviewEnvironment()
}
