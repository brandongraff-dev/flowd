import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandBountiesView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "target",
                title: "Bounties",
                message: "To be built by ios-brand-mode. Bounties by status with Funded badge and budget bar; opens detail."
            )
        }
        .flowdNavigationTitle("Bounties", large: true)
    }
}

#Preview {
    NavigationStack {
        BrandBountiesView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
