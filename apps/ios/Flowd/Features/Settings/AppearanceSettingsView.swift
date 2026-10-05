import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AppearanceSettingsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "circle.lefthalf.filled",
                title: "Appearance",
                message: "To be built by ios-onboarding-profile. Theme (system, dark, light), Reduce glass, reduce-motion mirror, haptics toggle, app icon variant."
            )
        }
        .flowdNavigationTitle("Appearance", large: false)
    }
}

#Preview {
    NavigationStack {
        AppearanceSettingsView()
    }
    .flowdPreviewEnvironment()
}
