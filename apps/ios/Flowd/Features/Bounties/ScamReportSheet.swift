import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-home-bounties. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct ScamReportSheet: View {
    let kind: ReportTargetKind
    let targetID: String?

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "exclamationmark.shield.fill",
                title: "Report a problem",
                message: "To be built by ios-home-bounties. Type chips, evidence, description; submit returns a case id and SLA; block brand."
            )
        }
        .flowdNavigationTitle("Report", large: false)
    }
}

#Preview {
    NavigationStack {
        ScamReportSheet(kind: .brand, targetID: "br_lumi")
    }
    .flowdPreviewEnvironment()
}
