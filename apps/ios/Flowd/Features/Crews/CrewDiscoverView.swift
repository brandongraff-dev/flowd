import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct CrewDiscoverView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "magnifyingglass",
                title: "Find a crew",
                message: "To be built by ios-compete-grow. Browse and search crews, create a crew (Gold and up lead), invite link, join, rules."
            )
        }
        .flowdNavigationTitle("Find a crew", large: false)
    }
}

#Preview {
    NavigationStack {
        CrewDiscoverView()
    }
    .flowdPreviewEnvironment()
}
