import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AuctionDetailView: View {
    let auctionID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "hammer",
                title: "Auction",
                message: "To be built by ios-compete-grow. Slot detail, reveal at close, second-price clearing result, history."
            )
        }
        .flowdNavigationTitle("Auction", large: false)
    }
}

#Preview {
    NavigationStack {
        AuctionDetailView(auctionID: "auc_005")
    }
    .flowdPreviewEnvironment()
}
