import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct PostComposerView: View {
    let submissionID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "square.and.arrow.up.fill",
                title: "Post it",
                message: "To be built by ios-studio-edit. Locked #ad plus brand-tag caption, tracking link and pool code (copy), why disclosure is locked, share to TikTok and Instagram, attach post URL, 72 h views-window timer."
            )
        }
        .flowdNavigationTitle("Post", large: false)
    }
}

#Preview {
    NavigationStack {
        PostComposerView(submissionID: "sub_0664")
    }
    .flowdPreviewEnvironment()
}
