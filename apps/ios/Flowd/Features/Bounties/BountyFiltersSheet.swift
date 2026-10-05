import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BountyFiltersSheet: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "slider.horizontal.3",
                title: "Filters and sort",
                message: "To be built by ios-home-bounties. Pay structure, platform, niche, rights, minimum rate, tier-gated, decision speed; sort. Reads and writes AppState.feedQuery."
            )
        }
        .flowdNavigationTitle("Filters", large: false)
    }
}

#Preview {
    NavigationStack {
        BountyFiltersSheet()
    }
    .flowdPreviewEnvironment()
}
