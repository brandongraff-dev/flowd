import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BountiesView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "target",
                title: "Bounties",
                message: "To be built by ios-home-bounties. The ranked bounty feed: search, filters, saved toggle, Funded badge, rate and cap, expected earnings, tier locks."
            )
        }
        .flowdNavigationTitle("Bounties", large: true)
    }
}

#Preview {
    NavigationStack {
        BountiesView()
    }
    .flowdPreviewEnvironment()
}
