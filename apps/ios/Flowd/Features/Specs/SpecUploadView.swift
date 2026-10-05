import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct SpecUploadView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "square.and.arrow.up.fill",
                title: "Upload a spec",
                message: "To be built by ios-compete-grow. Pick video, Score, price and rights, publish to the Spec Market; AI likeness off; terms."
            )
        }
        .flowdNavigationTitle("Upload a spec", large: false)
    }
}

#Preview {
    NavigationStack {
        SpecUploadView()
    }
    .flowdPreviewEnvironment()
}
