import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct DailyDropScreen: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "bolt.fill",
                title: "Daily Drop",
                message: "To be built by ios-home-bounties. Pre-drop countdown to 16:00 UTC, live cards with true spots left and claim, sold-out state."
            )
        }
        .flowdNavigationTitle("Daily Drop", large: false)
    }
}

#Preview {
    NavigationStack {
        DailyDropScreen()
    }
    .flowdPreviewEnvironment()
}
