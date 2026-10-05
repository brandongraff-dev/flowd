import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminCreatorDetailView: View {
    let creatorID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "person.crop.circle.fill",
                title: "Creator",
                message: "To be built by ios-admin-mode. Profile, tier, reliability, holds, payouts, disputes, audit trail."
            )
        }
        .flowdNavigationTitle("Creator", large: false)
    }
}

#Preview {
    NavigationStack {
        AdminCreatorDetailView(creatorID: "cr_maya")
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
