import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct HelpSupportView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "questionmark.circle.fill",
                title: "Help and support",
                message: "To be built by ios-onboarding-profile. Search help, contact human support with a named SLA, status link, send logs, report a problem."
            )
        }
        .flowdNavigationTitle("Help", large: false)
    }
}

#Preview {
    NavigationStack {
        HelpSupportView()
    }
    .flowdPreviewEnvironment()
}
