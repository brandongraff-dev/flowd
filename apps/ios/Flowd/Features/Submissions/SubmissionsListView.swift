import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct SubmissionsListView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "film.stack.fill",
                title: "Submissions",
                message: "To be built by ios-studio-edit. Status chips (In review with decide-by, Revise, Approved, Not approved, Withdrawn), reserved amount, SLA countdown, filters, pull-to-refresh."
            )
        }
        .flowdNavigationTitle("Submissions", large: false)
    }
}

#Preview {
    NavigationStack {
        SubmissionsListView()
    }
    .flowdPreviewEnvironment()
}
