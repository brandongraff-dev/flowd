import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandBountyDetailView: View {
    let bountyID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "target",
                title: "Bounty",
                message: "To be built by ios-brand-mode. Pace chart, submissions, top creators, Rights Card, edit caps, pause and extend."
            )
        }
        .flowdNavigationTitle("Bounty", large: false)
    }
}

#Preview {
    NavigationStack {
        BrandBountyDetailView(bountyID: "bnty_lumi_glowup")
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
