import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminPayoutApprovalsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "banknote.fill",
                title: "Money",
                message: "To be built by ios-admin-mode. Weekly batch with risk flags, approve all or per item, instant cash-out requests."
            )
        }
        .flowdNavigationTitle("Money", large: true)
    }
}

#Preview {
    NavigationStack {
        AdminPayoutApprovalsView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
