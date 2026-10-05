import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct RateCardEditorView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "tag.fill",
                title: "Rate card",
                message: "To be built by ios-home-bounties. Price per video, minimum CPM, rights days, deliverables, availability, market-suggested price with p25 to p75, preview as brands see it."
            )
        }
        .flowdNavigationTitle("Rate card", large: false)
    }
}

#Preview {
    NavigationStack {
        RateCardEditorView()
    }
    .flowdPreviewEnvironment()
}
