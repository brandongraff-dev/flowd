import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct FoundingBadgeView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "seal.fill",
                title: "Founding creator",
                message: "To be built by ios-onboarding-profile. Badge detail, perks with expiry dates (tier head start, free instant payouts for 12 months), share."
            )
        }
        .flowdNavigationTitle("Founding creator", large: false)
    }
}

#Preview {
    NavigationStack {
        FoundingBadgeView()
    }
    .flowdPreviewEnvironment()
}
