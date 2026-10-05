import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioScoreView: View {
    let draftID: String

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Score", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "gauge.with.dots.needle.67percent",
                title: "Score",
                message: "To be built by ios-studio-edit. Hook Score ring and Flow Score band with timecoded reasons, brief check, QA flags, one-tap fixes, \"Checklist score: gets smarter as bounties settle\", Retake or Continue."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioScoreView(draftID: "draft_preview")
        .flowdPreviewEnvironment()
}
