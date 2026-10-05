import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-brand-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct BrandReviewDetailView: View {
    let submissionID: String

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "checkmark.seal.fill",
                title: "Review",
                message: "To be built by ios-brand-mode. Video stand-in, Hook Score and Flow Score with timecoded reasons, QA flags, fraud evidence, creator scorecard, decision bar."
            )
        }
        .flowdNavigationTitle("Review", large: false)
    }
}

#Preview {
    NavigationStack {
        BrandReviewDetailView(submissionID: "sub_0634")
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
