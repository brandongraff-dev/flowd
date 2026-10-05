import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct EditProfileView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "pencil",
                title: "Edit profile",
                message: "To be built by ios-onboarding-profile. Handle, bio, niches, up to five portfolio videos, apps promoted (auto), live preview, validation."
            )
        }
        .flowdNavigationTitle("Edit profile", large: false)
    }
}

#Preview {
    NavigationStack {
        EditProfileView()
    }
    .flowdPreviewEnvironment()
}
