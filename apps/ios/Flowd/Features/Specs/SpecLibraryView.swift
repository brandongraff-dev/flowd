import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct SpecLibraryView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "film.stack",
                title: "Spec library",
                message: "To be built by ios-compete-grow. My specs (status, band, licensed or not), licence earnings, empty state with upload CTA."
            )
        }
        .flowdNavigationTitle("Specs", large: false)
    }
}

#Preview {
    NavigationStack {
        SpecLibraryView()
    }
    .flowdPreviewEnvironment()
}
