import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct PostDetailView: View {
    let postID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "play.square.fill",
                title: "Post",
                message: "To be built by ios-wallet-widgets. Views, installs, trials, retention curve, earnings timeline, conversions with source labels, Rights status, cap progress, links to View Ledger, Earnings Card and Dispute."
            )
        }
        .flowdNavigationTitle("Post", large: false)
    }
}

#Preview {
    NavigationStack {
        PostDetailView(postID: "post_0418")
    }
    .flowdPreviewEnvironment()
}
