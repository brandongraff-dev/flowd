import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct WhatToPostTodayView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "sparkles",
                title: "What to post today",
                message: "To be built by ios-home-bounties. Trend-radar cards matched to the creator's niches with Make it and Remix this."
            )
        }
        .flowdNavigationTitle("What to post today", large: false)
    }
}

#Preview {
    NavigationStack {
        WhatToPostTodayView()
    }
    .flowdPreviewEnvironment()
}
