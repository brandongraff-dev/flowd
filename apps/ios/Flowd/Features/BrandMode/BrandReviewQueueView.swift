import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandReviewQueueView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "checkmark.seal.fill",
                title: "Review",
                message: "To be built by ios-brand-mode. Swipeable cards ranked by score and QA flags; approve, request changes (timecoded note, reason code) or reject (reason code mandatory); SLA chips; auto-approve status."
            )
        }
        .flowdNavigationTitle("Review", large: true)
    }
}

#Preview {
    NavigationStack {
        BrandReviewQueueView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
