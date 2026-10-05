import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminMoreView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "ellipsis.circle.fill",
                title: "More",
                message: "To be built by ios-admin-mode. Creator and brand lookup, scorecards, audit log, ML calibration, settings, persona switch."
            )
        }
        .flowdNavigationTitle("More", large: true)
    }
}

#Preview {
    NavigationStack {
        AdminMoreView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
