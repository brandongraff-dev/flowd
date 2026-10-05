import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-capture. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioHookCoachView: View {
    let draftID: String

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Hook coach", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "eye.fill",
                title: "Hook coach",
                message: "To be built by ios-studio-capture. On-device Vision checks of the first 3 seconds, filmstrip with timecoded ticks and crosses, band plus reasons, Retake or Continue, \"Checklist score\" label."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioHookCoachView(draftID: "draft_preview")
        .flowdPreviewEnvironment()
}
