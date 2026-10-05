import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct SettingsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "gearshape.fill",
                title: "Settings",
                message: "To be built by ios-onboarding-profile. Hub: Account, Payouts, Notifications, Appearance, Privacy and data, Wellbeing, Safety, Legal, Help; version; \"Demo data\" indicator; persona switch; sign out."
            )
        }
        .flowdNavigationTitle("Settings", large: true)
    }
}

#Preview {
    NavigationStack {
        SettingsView()
    }
    .flowdPreviewEnvironment()
}
