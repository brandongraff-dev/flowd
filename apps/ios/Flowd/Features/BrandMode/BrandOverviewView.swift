import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandOverviewView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "square.grid.2x2.fill",
                title: "Overview",
                message: "To be built by ios-brand-mode. Spend pacing vs budget, KPI row with tracked-vs-estimated chips, mini funnel, \"Needs you\" list, escrow balance chip, next best action."
            )
        }
        .flowdNavigationTitle("Overview", large: true)
    }
}

#Preview {
    NavigationStack {
        BrandOverviewView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
