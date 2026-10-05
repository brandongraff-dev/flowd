import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandCreatorProfileView: View {
    let creatorID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "person.crop.circle.fill",
                title: "Creator",
                message: "To be built by ios-brand-mode. A creator's scorecard, typical views, past work with the brand, send offer."
            )
        }
        .flowdNavigationTitle("Creator", large: false)
    }
}

#Preview {
    NavigationStack {
        BrandCreatorProfileView(creatorID: "cr_gigi_glow")
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
