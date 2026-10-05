import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct DisputeSheet: View {
    let target: DisputeTarget

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "exclamationmark.bubble.fill",
                title: "Dispute",
                message: "To be built by ios-wallet-widgets. Snapshot range, reason chips, note, ledger evidence attached; open, in review, resolved with SLA; outcome with reasons; \"doesn't block undisputed money\"."
            )
        }
        .flowdNavigationTitle("Dispute", large: false)
    }
}

#Preview {
    NavigationStack {
        DisputeSheet(target: .post("post_0418"))
    }
    .flowdPreviewEnvironment()
}
