import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct PayoutDetailView: View {
    let payoutID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "banknote",
                title: "Payout",
                message: "To be built by ios-wallet-widgets. A payout with the earning rows it carries, proof link, arrival date."
            )
        }
        .flowdNavigationTitle("Payout", large: false)
    }
}

#Preview {
    NavigationStack {
        PayoutDetailView(payoutID: "pay_0330")
    }
    .flowdPreviewEnvironment()
}
