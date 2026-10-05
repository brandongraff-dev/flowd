import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct HookScoreToolView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "scope",
                title: "Hook Score",
                message: "To be built by ios-compete-grow. Free tool: type a hook or pick a clip, band and reasons, on-device clip checks, share, \"Checklist score\" label."
            )
        }
        .flowdNavigationTitle("Hook Score", large: false)
    }
}

#Preview {
    NavigationStack {
        HookScoreToolView()
    }
    .flowdPreviewEnvironment()
}
