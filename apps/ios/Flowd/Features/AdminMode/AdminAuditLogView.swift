import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminAuditLogView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "list.bullet.clipboard.fill",
                title: "Audit log",
                message: "To be built by ios-admin-mode. Every admin decision with actor, time and reason."
            )
        }
        .flowdNavigationTitle("Audit log", large: false)
    }
}

#Preview {
    NavigationStack {
        AdminAuditLogView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
