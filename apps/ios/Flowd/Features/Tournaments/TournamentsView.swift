import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct TournamentsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "flag.2.crossed.fill",
                title: "Tournaments",
                message: "To be built by ios-compete-grow. Live, upcoming and past, prize pool, entry status, countdown, enter."
            )
        }
        .flowdNavigationTitle("Tournaments", large: false)
    }
}

#Preview {
    NavigationStack {
        TournamentsView()
    }
    .flowdPreviewEnvironment()
}
