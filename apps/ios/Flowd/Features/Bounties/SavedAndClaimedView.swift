import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct SavedAndClaimedView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "bookmark.fill",
                title: "Saved and claimed",
                message: "To be built by ios-home-bounties. Saved bounties, claimed spots with expiry timers, active submissions, ended."
            )
        }
        .flowdNavigationTitle("Saved and claimed", large: false)
    }
}

#Preview {
    NavigationStack {
        SavedAndClaimedView()
    }
    .flowdPreviewEnvironment()
}
