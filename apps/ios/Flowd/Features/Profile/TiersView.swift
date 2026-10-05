import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct TiersView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "rosette",
                title: "Tiers",
                message: "To be built by ios-onboarding-profile. Bronze to Elite ladder, per-requirement progress, perks, \"No drop for 30 days after a dip\", tier history."
            )
        }
        .flowdNavigationTitle("Tiers", large: false)
    }
}

#Preview {
    NavigationStack {
        TiersView()
    }
    .flowdPreviewEnvironment()
}
