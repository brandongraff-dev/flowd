import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct FirstDollarTrackerView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "flag.checkered",
                title: "First-Dollar Path",
                message: "To be built by ios-onboarding-profile. Four steps with ETAs (scored take, submitted, approved, cleared), \"Cleared by Tue 2:00 PM\", resumes drafts, retires after the first cleared dollar."
            )
        }
        .flowdNavigationTitle("First dollar", large: false)
    }
}

#Preview {
    NavigationStack {
        FirstDollarTrackerView()
    }
    .flowdPreviewEnvironment()
}
