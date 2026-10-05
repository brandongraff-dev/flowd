import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AppealSheet: View {
    let submissionID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "scale.3d",
                title: "Appeal",
                message: "To be built by ios-studio-edit. One per rejection: reason, evidence with timecodes, what happens next, read-only after submit."
            )
        }
        .flowdNavigationTitle("Appeal", large: false)
    }
}

#Preview {
    NavigationStack {
        AppealSheet(submissionID: "sub_0644")
    }
    .flowdPreviewEnvironment()
}
