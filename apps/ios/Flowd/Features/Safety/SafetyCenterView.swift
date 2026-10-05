import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct SafetyCenterView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "shield.fill",
                title: "Safety center",
                message: "To be built by ios-onboarding-profile. Scam Shield rules (\"flowd never asks you to pay\"), how to spot examples, my reports and status, report entry, contact support."
            )
        }
        .flowdNavigationTitle("Safety", large: false)
    }
}

#Preview {
    NavigationStack {
        SafetyCenterView()
    }
    .flowdPreviewEnvironment()
}
