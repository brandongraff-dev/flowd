import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AccountSettingsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "person.crop.circle",
                title: "Account",
                message: "To be built by ios-onboarding-profile. Email, sign-in method, persona switch (demo), reset demo data, sign out."
            )
        }
        .flowdNavigationTitle("Account", large: false)
    }
}

#Preview {
    NavigationStack {
        AccountSettingsView()
    }
    .flowdPreviewEnvironment()
}
