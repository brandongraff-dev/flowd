import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioScreenOverlayView: View {
    let draftID: String

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Screen overlay", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "rectangle.on.rectangle",
                title: "Screen overlay",
                message: "To be built by ios-studio-edit. Import a screen recording or brand demo clip, picture-in-picture or green-screen, position and size, sync, brand assets."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioScreenOverlayView(draftID: "draft_preview")
        .flowdPreviewEnvironment()
}
