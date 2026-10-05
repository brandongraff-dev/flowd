import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminControlTowerView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "gauge",
                title: "Control tower",
                message: "To be built by ios-admin-mode. 90-day targets vs actuals, market health, live alerts, demo clock control (appState.api.advanceDemoClock)."
            )
        }
        .flowdNavigationTitle("Control", large: true)
    }
}

#Preview {
    NavigationStack {
        AdminControlTowerView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
