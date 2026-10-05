import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct HomeView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "house.fill",
                title: "Home",
                message: "To be built by ios-home-bounties. Greeting, earnings card (Cleared and Pending side by side), Daily Drop card, streak, Continue draft, matched bounties, What to post today, First-Dollar tracker, Flo entry, activity."
            )
        }
        .flowdNavigationTitle("Home", large: true)
    }
}

#Preview {
    NavigationStack {
        HomeView()
    }
    .flowdPreviewEnvironment()
}
