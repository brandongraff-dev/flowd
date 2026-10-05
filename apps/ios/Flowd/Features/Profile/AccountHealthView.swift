import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AccountHealthView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "heart.text.square.fill",
                title: "Account health",
                message: "To be built by ios-onboarding-profile. Originality check history, per-account safety, platform rules in plain words, burner-account rule, how to fix, appeal link."
            )
        }
        .flowdNavigationTitle("Account health", large: false)
    }
}

#Preview {
    NavigationStack {
        AccountHealthView()
    }
    .flowdPreviewEnvironment()
}
