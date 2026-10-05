import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct CrewLeaderboardView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "list.number",
                title: "Crew leaderboard",
                message: "To be built by ios-compete-grow. Crews ranked weekly, your crew's position, contribution per member."
            )
        }
        .flowdNavigationTitle("Crew leaderboard", large: false)
    }
}

#Preview {
    NavigationStack {
        CrewLeaderboardView()
    }
    .flowdPreviewEnvironment()
}
