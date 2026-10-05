import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct NotificationPreferencesView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "bell.badge.fill",
                title: "Notifications",
                message: "To be built by ios-onboarding-profile. Categories, quiet hours (default 10 pm to 8 am), batching of non-cash items, one Daily Drop reminder, system permission state."
            )
        }
        .flowdNavigationTitle("Notifications", large: false)
    }
}

#Preview {
    NavigationStack {
        NotificationPreferencesView()
    }
    .flowdPreviewEnvironment()
}
