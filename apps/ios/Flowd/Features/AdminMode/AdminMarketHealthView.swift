import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminMarketHealthView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "chart.bar.fill",
                title: "Market",
                message: "To be built by ios-admin-mode. Fill rate, clearing CPMs by category with bands, supply vs demand, active creators per live bounty."
            )
        }
        .flowdNavigationTitle("Market", large: true)
    }
}

#Preview {
    NavigationStack {
        AdminMarketHealthView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
