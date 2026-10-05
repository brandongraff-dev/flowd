import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-capture. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioCaptureView: View {
    let bountyID: String
    let draftID: String?

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Capture", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "camera.fill",
                title: "Capture",
                message: "To be built by ios-studio-capture. AVFoundation 1080x1920 at 30 fps, teleprompter beside the lens, live shot checklist, safe-zone guides, 3-2-1 countdown, flip, segments, retake, controls fade after 2 s, interruption autosaves a draft."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioCaptureView(bountyID: "bnty_lumi_glowup", draftID: nil)
        .flowdPreviewEnvironment()
}
