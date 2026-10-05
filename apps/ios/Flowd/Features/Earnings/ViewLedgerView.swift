import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct ViewLedgerView: View {
    let postID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "list.number",
                title: "View Ledger",
                message: "To be built by ios-wallet-widgets. Hourly snapshots (list and chart), source, traffic split, verified vs excluded views with plain-language cause, Dispute CTA."
            )
        }
        .flowdNavigationTitle("View Ledger", large: false)
    }
}

#Preview {
    NavigationStack {
        ViewLedgerView(postID: "post_0418")
    }
    .flowdPreviewEnvironment()
}
