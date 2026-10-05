import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct PrivacyDataView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "hand.raised.fill",
                title: "Privacy and data",
                message: "To be built by ios-onboarding-profile. AI-training opt-in (off), data export, delete account with confirmation, connected-token disclosure, analytics opt-out."
            )
        }
        .flowdNavigationTitle("Privacy and data", large: false)
    }
}

#Preview {
    NavigationStack {
        PrivacyDataView()
    }
    .flowdPreviewEnvironment()
}
