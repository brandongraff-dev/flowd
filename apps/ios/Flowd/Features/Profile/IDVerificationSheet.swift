import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct IDVerificationSheet: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "person.badge.shield.checkmark.fill",
                title: "Verify your identity",
                message: "To be built by ios-onboarding-profile. Not started, processing, verified, failed with reason; why now; 18+ check; human fallback."
            )
        }
        .flowdNavigationTitle("Verify identity", large: false)
    }
}

#Preview {
    NavigationStack {
        IDVerificationSheet()
    }
    .flowdPreviewEnvironment()
}
