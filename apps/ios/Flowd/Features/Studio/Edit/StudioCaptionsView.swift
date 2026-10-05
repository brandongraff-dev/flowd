import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioCaptionsView: View {
    let draftID: String

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Captions", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "captions.bubble.fill",
                title: "Captions",
                message: "To be built by ios-studio-edit. On-device auto-captions (Speech), styles, TikTok and Reels safe-zone placement, edit text, word highlight, language."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioCaptionsView(draftID: "draft_preview")
        .flowdPreviewEnvironment()
}
