import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioSilenceCutView: View {
    let draftID: String

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Cut silences", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "waveform.badge.minus",
                title: "Cut silences",
                message: "To be built by ios-studio-edit. Detected pauses and filler words, preview cuts, one-tap apply and undo, amount removed."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioSilenceCutView(draftID: "draft_preview")
        .flowdPreviewEnvironment()
}
