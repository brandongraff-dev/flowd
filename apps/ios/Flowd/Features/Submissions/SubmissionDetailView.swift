import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct SubmissionDetailView: View {
    let submissionID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "film.fill",
                title: "Submission",
                message: "To be built by ios-studio-edit. Player, status timeline, decision with reason code and evidence, timecoded comments (must-fix vs suggestion), version history, rounds left, Revise, Appeal, Post."
            )
        }
        .flowdNavigationTitle("Submission", large: false)
    }
}

#Preview {
    NavigationStack {
        SubmissionDetailView(submissionID: "sub_0646")
    }
    .flowdPreviewEnvironment()
}
