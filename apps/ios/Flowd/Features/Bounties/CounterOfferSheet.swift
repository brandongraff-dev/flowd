import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct CounterOfferSheet: View {
    let offerID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "arrow.left.arrow.right",
                title: "Counter offer",
                message: "To be built by ios-home-bounties. Adjust price and rights add-ons within the market-suggested band, add a message, show what changes, send."
            )
        }
        .flowdNavigationTitle("Counter", large: false)
    }
}

#Preview {
    NavigationStack {
        CounterOfferSheet(offerID: "offer_0033")
    }
    .flowdPreviewEnvironment()
}
