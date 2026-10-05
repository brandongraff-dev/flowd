import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct ProfileView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "person.crop.circle.fill",
                title: "Profile",
                message: "To be built by ios-onboarding-profile. Tier ring with progress, badges, verified stats, storefront preview and share link, Earnings Card shortcut, Account Health chip."
            )
        }
        .flowdNavigationTitle("Profile", large: true)
    }
}

#Preview {
    NavigationStack {
        ProfileView()
    }
    .flowdPreviewEnvironment()
}
