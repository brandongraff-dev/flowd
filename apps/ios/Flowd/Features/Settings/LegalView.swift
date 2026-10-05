import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct LegalView: View {
    let document: LegalDocument?

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "doc.plaintext.fill",
                title: "Legal and disclosures",
                message: "To be built by ios-onboarding-profile. In-app readers for the Creator Agreement, privacy, earnings disclosure (median methodology), usage rights and community rules; version and date; \"Draft, not legal advice\"."
            )
        }
        .flowdNavigationTitle("Legal", large: false)
    }
}

#Preview {
    NavigationStack {
        LegalView(document: nil)
    }
    .flowdPreviewEnvironment()
}
