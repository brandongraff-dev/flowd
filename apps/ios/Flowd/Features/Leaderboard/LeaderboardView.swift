import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct LeaderboardView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "trophy.fill",
                title: "Leaderboard",
                message: "To be built by ios-compete-grow. Peer cohort of about 30 with promotion line, your row, rank-delta chips, week-reset timer, Cohort and Global tabs, niche filter, private mode, unranked state."
            )
        }
        .flowdNavigationTitle("Leaderboard", large: false)
    }
}

#Preview {
    NavigationStack {
        LeaderboardView()
    }
    .flowdPreviewEnvironment()
}
