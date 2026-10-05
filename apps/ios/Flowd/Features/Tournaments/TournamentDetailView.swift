import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct TournamentDetailView: View {
    let tournamentID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "flag.2.crossed",
                title: "Tournament",
                message: "To be built by ios-compete-grow. Bracket, your entry (submit a hook), standings, schedule, rules, results, share."
            )
        }
        .flowdNavigationTitle("Tournament", large: false)
    }
}

#Preview {
    NavigationStack {
        TournamentDetailView(tournamentID: "tour_screen_record_sprint")
    }
    .flowdPreviewEnvironment()
}
