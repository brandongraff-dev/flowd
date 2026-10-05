import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandNotificationsSettingsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "bell.badge.fill",
                title: "Notifications and settings",
                message: "To be built by ios-brand-mode. Approvals, SLA, rights expiries, digest preferences, persona switch (appState.setPersona)."
            )
        }
        .flowdNavigationTitle("Settings", large: false)
    }
}

#Preview {
    NavigationStack {
        BrandNotificationsSettingsView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
