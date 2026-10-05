import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct OfferDetailView: View {
    let offerID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "envelope.open.fill",
                title: "Offer",
                message: "To be built by ios-home-bounties. Terms, Rights Card, Pay Math, Brand Scorecard, thread preview, Accept, Counter and Decline."
            )
        }
        .flowdNavigationTitle("Offer", large: false)
    }
}

#Preview {
    NavigationStack {
        OfferDetailView(offerID: "offer_0033")
    }
    .flowdPreviewEnvironment()
}
