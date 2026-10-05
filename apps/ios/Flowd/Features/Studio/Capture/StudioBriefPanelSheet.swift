import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-capture. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioBriefPanelSheet: View {
    let bountyID: String
    let draftID: String?

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "doc.text.magnifyingglass",
                title: "Brief",
                message: "To be built by ios-studio-capture. Brief TL;DR, checkable must-say beats, do and don't, brand assets, Rights chip, deadline; collapsible during capture."
            )
        }
        .flowdNavigationTitle("Brief", large: false)
    }
}

#Preview {
    NavigationStack {
        StudioBriefPanelSheet(bountyID: "bnty_lumi_glowup", draftID: nil)
    }
    .flowdPreviewEnvironment()
}
