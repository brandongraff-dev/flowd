import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminLookupView: View {
    let query: String?

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "magnifyingglass",
                title: "Lookup",
                message: "To be built by ios-admin-mode. Creator and brand search with scorecards."
            )
        }
        .flowdNavigationTitle("Lookup", large: false)
    }
}

#Preview {
    NavigationStack {
        AdminLookupView(query: nil)
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
