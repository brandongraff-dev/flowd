import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-wallet-widgets. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct TaxDeskView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "doc.richtext.fill",
                title: "Tax Desk",
                message: "To be built by ios-wallet-widgets. W-9 status chip, YTD cleared and paid, 1099-NEC threshold progress, set-aside estimate, CSV export, \"not tax advice\", Academy lesson link."
            )
        }
        .flowdNavigationTitle("Tax Desk", large: false)
    }
}

#Preview {
    NavigationStack {
        TaxDeskView()
    }
    .flowdPreviewEnvironment()
}
