import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminBrandDetailView: View {
    let brandID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "building.2.fill",
                title: "Brand",
                message: "To be built by ios-admin-mode. Workspace, plan, scorecard, funding, disputes, verification."
            )
        }
        .flowdNavigationTitle("Brand", large: false)
    }
}

#Preview {
    NavigationStack {
        AdminBrandDetailView(brandID: "br_lumi")
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
