import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandScorecardSheet: View {
    let brandID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "checkmark.seal.fill",
                title: "Brand Scorecard",
                message: "To be built by ios-home-bounties. Pay speed, decision time, approval fairness, approved-work-run share, reliability, sample size, trend, recent bounties, report brand."
            )
        }
        .flowdNavigationTitle("Scorecard", large: false)
    }
}

#Preview {
    NavigationStack {
        BrandScorecardSheet(brandID: "br_lumi")
    }
    .flowdPreviewEnvironment()
}
