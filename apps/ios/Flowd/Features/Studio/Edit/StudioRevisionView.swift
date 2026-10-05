import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioRevisionView: View {
    let submissionID: String

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Revise", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "arrow.triangle.2.circlepath",
                title: "Revise",
                message: "To be built by ios-studio-edit. Replace the take (back to capture) or re-edit it, then Score and resubmit as the next version."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioRevisionView(submissionID: "sub_0646")
        .flowdPreviewEnvironment()
}
