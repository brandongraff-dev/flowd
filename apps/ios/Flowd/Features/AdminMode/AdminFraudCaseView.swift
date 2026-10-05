import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminFraudCaseView: View {
    let flagID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "exclamationmark.triangle.fill",
                title: "Fraud case",
                message: "To be built by ios-admin-mode. View curve with anomaly markers, signal list with weights, account history, hold, clear and ban (confirm sheet)."
            )
        }
        .flowdNavigationTitle("Fraud case", large: false)
    }
}

#Preview {
    NavigationStack {
        AdminFraudCaseView(flagID: "flag_001")
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
