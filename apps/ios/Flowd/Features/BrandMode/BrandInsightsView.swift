import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandInsightsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "chart.line.uptrend.xyaxis",
                title: "Insights",
                message: "To be built by ios-brand-mode. Money Map funnel with tracked vs estimated, creative leaderboard, hook lab summary, Funnel Doctor top fix with expected-impact range, budget optimizer suggestion."
            )
        }
        .flowdNavigationTitle("Insights", large: true)
    }
}

#Preview {
    NavigationStack {
        BrandInsightsView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
