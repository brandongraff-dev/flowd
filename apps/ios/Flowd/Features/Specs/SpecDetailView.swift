import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct SpecDetailView: View {
    let specID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "film",
                title: "Spec",
                message: "To be built by ios-compete-grow. One spec: score band, price, rights, licences and earnings, withdraw."
            )
        }
        .flowdNavigationTitle("Spec", large: false)
    }
}

#Preview {
    NavigationStack {
        SpecDetailView(specID: "spec_001")
    }
    .flowdPreviewEnvironment()
}
