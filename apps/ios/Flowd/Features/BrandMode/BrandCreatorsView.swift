import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandCreatorsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "person.2.fill",
                title: "Creators",
                message: "To be built by ios-brand-mode. Discover and scorecards, rehire list, send direct offer."
            )
        }
        .flowdNavigationTitle("Creators", large: false)
    }
}

#Preview {
    NavigationStack {
        BrandCreatorsView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
