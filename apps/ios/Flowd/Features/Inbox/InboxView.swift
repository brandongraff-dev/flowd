import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct InboxView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "tray.fill",
                title: "Inbox",
                message: "To be built by ios-home-bounties. Money, Reviews (with timecoded feedback summary), Offers and Updates; unread, swipe actions, batched-for-quiet-hours label."
            )
        }
        .flowdNavigationTitle("Inbox", large: true)
    }
}

#Preview {
    NavigationStack {
        InboxView()
    }
    .flowdPreviewEnvironment()
}
