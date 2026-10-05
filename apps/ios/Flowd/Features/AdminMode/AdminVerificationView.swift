import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminVerificationView: View {
    let verificationID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "person.badge.shield.checkmark.fill",
                title: "Verification",
                message: "To be built by ios-admin-mode. ID review card, risk signals, approve or request more."
            )
        }
        .flowdNavigationTitle("Verification", large: false)
    }
}

#Preview {
    NavigationStack {
        AdminVerificationView(verificationID: "ver_001")
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
