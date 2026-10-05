import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct ThreadView: View {
    let threadID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "bubble.left.and.bubble.right.fill",
                title: "Thread",
                message: "To be built by ios-home-bounties. Structured thread tied to a submission or offer, in-app-only banner, rate-limit notice, report, link back to context."
            )
        }
        .flowdNavigationTitle("Thread", large: false)
    }
}

#Preview {
    NavigationStack {
        ThreadView(threadID: "thr_0006")
    }
    .flowdPreviewEnvironment()
}
