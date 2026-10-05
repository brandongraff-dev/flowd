import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AuctionsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "hammer.fill",
                title: "Auctions",
                message: "To be built by ios-compete-grow. My auction slots, create windows, sealed-bid count, closes at, locked state with unlock path (Platinum and up)."
            )
        }
        .flowdNavigationTitle("Auctions", large: false)
    }
}

#Preview {
    NavigationStack {
        AuctionsView()
    }
    .flowdPreviewEnvironment()
}
