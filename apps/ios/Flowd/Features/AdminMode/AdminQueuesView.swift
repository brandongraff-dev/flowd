import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminQueuesView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "tray.full.fill",
                title: "Queues",
                message: "To be built by ios-admin-mode. Fraud, disputes, verification and payouts with counts, oldest-item age and SLA colour."
            )
        }
        .flowdNavigationTitle("Queues", large: true)
    }
}

#Preview {
    NavigationStack {
        AdminQueuesView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
