import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandAutoApproveRulesView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "bolt.shield.fill",
                title: "Auto-approve rules",
                message: "To be built by ios-brand-mode. Rule status, dry-run summary on the last 50, 10% spot-check, kill switch."
            )
        }
        .flowdNavigationTitle("Auto-approve", large: false)
    }
}

#Preview {
    NavigationStack {
        BrandAutoApproveRulesView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
