import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-capture. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioTakeReviewView: View {
    let draftID: String

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Review your take", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "play.rectangle.fill",
                title: "Review your take",
                message: "To be built by ios-studio-capture. Playback of takes and segments, keep, retake, trim, \"Take saved\", continue to Edit."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioTakeReviewView(draftID: "draft_preview")
        .flowdPreviewEnvironment()
}
