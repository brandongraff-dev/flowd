import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-capture. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioPermissionRecoveryView: View {
    let kind: PermissionKind

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Permission needed", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "camera.badge.ellipsis",
                title: "Permission needed",
                message: "To be built by ios-studio-capture. Denied camera, mic or speech: explanation, Settings deep link, alternative (import from camera roll); no dead end."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioPermissionRecoveryView(kind: .camera)
        .flowdPreviewEnvironment()
}
