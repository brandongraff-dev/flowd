import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioSubmitView: View {
    let draftID: String

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Submit", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "paperplane.fill",
                title: "Submit",
                message: "To be built by ios-studio-edit. Summary, Rights Card accept, reserved amount, decide-by ETA, resumable background upload with progress, offline queue, \"Cleared by\" on the starter bounty."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioSubmitView(draftID: "draft_preview")
        .flowdPreviewEnvironment()
}
