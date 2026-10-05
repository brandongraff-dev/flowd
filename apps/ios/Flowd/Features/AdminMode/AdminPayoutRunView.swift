import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminPayoutRunView: View {
    let runID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "calendar.badge.clock",
                title: "Payout run",
                message: "To be built by ios-admin-mode. One run: creators, totals, holds with reasons, approve all or per item."
            )
        }
        .flowdNavigationTitle("Payout run", large: false)
    }
}

#Preview {
    NavigationStack {
        AdminPayoutRunView(runID: "run_2026-10-09")
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
