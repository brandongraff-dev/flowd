import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StreakView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "flame.fill",
                title: "Streak",
                message: "To be built by ios-home-bounties. Weekly streak, this week, banked freezes, rest-week toggle, history. Calm copy, no guilt."
            )
        }
        .flowdNavigationTitle("Streak", large: false)
    }
}

#Preview {
    NavigationStack {
        StreakView()
    }
    .flowdPreviewEnvironment()
}
