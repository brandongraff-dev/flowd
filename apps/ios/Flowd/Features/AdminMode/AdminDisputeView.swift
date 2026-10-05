import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminDisputeView: View {
    let disputeID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "scale.3d",
                title: "Dispute",
                message: "To be built by ios-admin-mode. Evidence timeline, both sides, decision with reason code, message composer, human-reply SLA (48 h)."
            )
        }
        .flowdNavigationTitle("Dispute", large: false)
    }
}

#Preview {
    NavigationStack {
        AdminDisputeView(disputeID: "disp_001")
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
