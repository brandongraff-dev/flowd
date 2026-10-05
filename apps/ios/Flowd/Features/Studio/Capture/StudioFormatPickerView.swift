import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-capture. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioFormatPickerView: View {
    let bountyID: String
    let preselected: FormatId?

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Pick a format", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "square.grid.2x2.fill",
                title: "Pick a format",
                message: "To be built by ios-studio-capture. The 11 formats ranked for this bounty (labelled checklist), beat structure preview, duration, difficulty, faceless badge."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioFormatPickerView(bountyID: "bnty_lumi_glowup", preselected: nil)
        .flowdPreviewEnvironment()
}
