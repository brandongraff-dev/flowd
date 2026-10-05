import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct PermissionPrimerSheet: View {
    let kind: PermissionKind

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "lock.open.fill",
                title: "Permission",
                message: "To be built by ios-onboarding-profile. One-line why for camera, microphone, speech, notifications or photos; allow, or keep going without it."
            )
        }
        .flowdNavigationTitle("Permission", large: false)
    }
}

#Preview {
    NavigationStack {
        PermissionPrimerSheet(kind: .notifications)
    }
    .flowdPreviewEnvironment()
}
