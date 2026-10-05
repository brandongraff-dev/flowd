import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct ReviseView: View {
    let submissionID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "arrow.triangle.2.circlepath",
                title: "Revise",
                message: "To be built by ios-studio-edit. Checklist of must-fix comments, replace or re-edit then Score then resubmit as the next version with a diff, rounds left."
            )
        }
        .flowdNavigationTitle("Revise", large: false)
    }
}

#Preview {
    NavigationStack {
        ReviseView(submissionID: "sub_0646")
    }
    .flowdPreviewEnvironment()
}
