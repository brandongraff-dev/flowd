import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AcademyView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "graduationcap.fill",
                title: "Academy",
                message: "To be built by ios-compete-grow. Lessons grid (ten core), progress, badges, tier boosts, \"free, never required\"."
            )
        }
        .flowdNavigationTitle("Academy", large: false)
    }
}

#Preview {
    NavigationStack {
        AcademyView()
    }
    .flowdPreviewEnvironment()
}
