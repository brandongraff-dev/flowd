import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct RightsCardSheet: View {
    let bountyID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "doc.text.fill",
                title: "Rights Card",
                message: "To be built by ios-home-bounties. Organic, paid-ad usage and term, whitelisting, exclusivity, AI likeness, renewal price, and the plain-language summary."
            )
        }
        .flowdNavigationTitle("Rights Card", large: false)
    }
}

#Preview {
    NavigationStack {
        RightsCardSheet(bountyID: "bnty_lumi_glowup")
    }
    .flowdPreviewEnvironment()
}
