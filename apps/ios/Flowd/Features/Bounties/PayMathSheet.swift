import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct PayMathSheet: View {
    let bountyID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "function",
                title: "Pay Math",
                message: "To be built by ios-home-bounties. p25, median and p75 pay per video, CPM and CPA parts, cap, typical beside top example, assumptions."
            )
        }
        .flowdNavigationTitle("Pay Math", large: false)
    }
}

#Preview {
    NavigationStack {
        PayMathSheet(bountyID: "bnty_lumi_glowup")
    }
    .flowdPreviewEnvironment()
}
