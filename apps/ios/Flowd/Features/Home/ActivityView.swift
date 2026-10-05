import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct ActivityView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "list.bullet.rectangle",
                title: "Activity",
                message: "To be built by ios-home-bounties. Approvals, cleared money, offers and tier changes with filters; each row opens its detail."
            )
        }
        .flowdNavigationTitle("Activity", large: false)
    }
}

#Preview {
    NavigationStack {
        ActivityView()
    }
    .flowdPreviewEnvironment()
}
