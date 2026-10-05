import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct WellbeingView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "leaf.fill",
                title: "Wellbeing mode",
                message: "To be built by ios-onboarding-profile. Master toggle, quiet hours, numbers-off schedule, pace setting that never affects tier, Pause, rest weeks, leaderboard opt-out, resources."
            )
        }
        .flowdNavigationTitle("Wellbeing", large: false)
    }
}

#Preview {
    NavigationStack {
        WellbeingView()
    }
    .flowdPreviewEnvironment()
}
