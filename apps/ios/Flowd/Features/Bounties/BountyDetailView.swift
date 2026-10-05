import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BountyDetailView: View {
    let bountyID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "target",
                title: "Bounty",
                message: "To be built by ios-home-bounties. Rate, cap, budget bar, Funded badge, deadline, typical earnings, brief TL;DR by Flo, Rights Card and Scorecard entries, Scam Shield cues, sticky Make it."
            )
        }
        .flowdNavigationTitle("Bounty", large: false)
    }
}

#Preview {
    NavigationStack {
        BountyDetailView(bountyID: "bnty_lumi_glowup")
    }
    .flowdPreviewEnvironment()
}
