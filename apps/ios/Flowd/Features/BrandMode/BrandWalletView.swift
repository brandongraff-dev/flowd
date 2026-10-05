import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandWalletView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "creditcard.fill",
                title: "Wallet",
                message: "To be built by ios-brand-mode. Escrow balance, fund (calm sheet, card mock), ledger, invoices, auto top-up."
            )
        }
        .flowdNavigationTitle("Wallet", large: true)
    }
}

#Preview {
    NavigationStack {
        BrandWalletView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
