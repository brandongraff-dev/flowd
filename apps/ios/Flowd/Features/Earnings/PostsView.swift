import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct PostsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "play.square.stack.fill",
                title: "Posts",
                message: "To be built by ios-wallet-widgets. Live posts with views, installs, trials, earnings, state chip and clears-at; filter; pull-to-refresh."
            )
        }
        .flowdNavigationTitle("Posts", large: false)
    }
}

#Preview {
    NavigationStack {
        PostsView()
    }
    .flowdPreviewEnvironment()
}
