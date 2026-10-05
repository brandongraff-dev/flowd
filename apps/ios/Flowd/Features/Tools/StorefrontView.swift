import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StorefrontView: View {
    let handle: String?

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "storefront.fill",
                title: "Storefront",
                message: "To be built by ios-compete-grow. Link-in-bio editor and preview (joinflowd.io/c/<handle>): theme, bio, apps promoted, verified stats, rate card CTA, copy and share QR. nil handle is the creator's own."
            )
        }
        .flowdNavigationTitle("Storefront", large: false)
    }
}

#Preview {
    NavigationStack {
        StorefrontView(handle: nil)
    }
    .flowdPreviewEnvironment()
}
