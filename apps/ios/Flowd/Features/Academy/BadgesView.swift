import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BadgesView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "rosette",
                title: "Badges",
                message: "To be built by ios-compete-grow. Earned and locked grid with criteria; share."
            )
        }
        .flowdNavigationTitle("Badges", large: false)
    }
}

#Preview {
    NavigationStack {
        BadgesView()
    }
    .flowdPreviewEnvironment()
}
