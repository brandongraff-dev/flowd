import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct FloView: View {
    let context: FloLaunchContext

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "sparkles",
                title: "Flo",
                message: "To be built by ios-home-bounties. Streaming typewriter chat with chips (Write 3 scripts, Rewrite my hook, TL;DR this brief, Caption ideas), context from bounty and format, send to Studio, history, offline templates."
            )
        }
        .flowdNavigationTitle("Flo", large: false)
    }
}

#Preview {
    NavigationStack {
        FloView(context: FloLaunchContext.home)
    }
    .flowdPreviewEnvironment()
}
