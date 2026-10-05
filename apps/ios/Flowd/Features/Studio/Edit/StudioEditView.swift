import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioEditView: View {
    let draftID: String

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Edit", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "scissors",
                title: "Edit",
                message: "To be built by ios-studio-edit. AVMutableComposition timeline: trim, split, reorder; text overlays; approved music only; preview; undo; export presets; autosave."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioEditView(draftID: "draft_preview")
        .flowdPreviewEnvironment()
}
