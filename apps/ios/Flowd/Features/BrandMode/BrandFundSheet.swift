import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandFundSheet: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "lock.shield.fill",
                title: "Fund escrow",
                message: "To be built by ios-brand-mode. A calm sheet (card mock): amount, fee line, all-in price; never celebrates spending."
            )
        }
        .flowdNavigationTitle("Fund escrow", large: false)
    }
}

#Preview {
    NavigationStack {
        BrandFundSheet()
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
