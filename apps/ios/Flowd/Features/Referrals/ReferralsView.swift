import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-compete-grow. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct ReferralsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "person.badge.plus",
                title: "Referrals",
                message: "To be built by ios-compete-grow. Link and code, invites sent and accepted, reward rules (single-level, capped, funded by flowd), referral earnings window, share sheet, FTC-safe copy."
            )
        }
        .flowdNavigationTitle("Referrals", large: false)
    }
}

#Preview {
    NavigationStack {
        ReferralsView()
    }
    .flowdPreviewEnvironment()
}
