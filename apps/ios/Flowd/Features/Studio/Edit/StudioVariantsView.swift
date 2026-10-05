import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioVariantsView: View {
    let draftID: String

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Variants", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "square.stack.3d.up.fill",
                title: "Variants",
                message: "To be built by ios-studio-edit. Record 3 to 5 hooks, 1 body and 2 CTAs for up to 10 videos; matrix preview, per-variant score, choose which to submit."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioVariantsView(draftID: "draft_preview")
        .flowdPreviewEnvironment()
}
