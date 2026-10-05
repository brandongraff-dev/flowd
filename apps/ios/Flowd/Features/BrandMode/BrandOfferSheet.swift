import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandOfferSheet: View {
    let creatorID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "paperplane.fill",
                title: "Send an offer",
                message: "To be built by ios-brand-mode. Price, deliverables, rights add-ons, message; shows what the creator sees."
            )
        }
        .flowdNavigationTitle("Send offer", large: false)
    }
}

#Preview {
    NavigationStack {
        BrandOfferSheet(creatorID: "cr_gigi_glow")
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
