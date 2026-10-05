import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-capture. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioScriptView: View {
    let bountyID: String
    let formatID: FormatId?
    let hook: String?
    let draftID: String?

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Script", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "text.alignleft",
                title: "Script",
                message: "To be built by ios-studio-capture. Three scripts from Flo for the format, own-script editor, word count and duration at 150 wpm, hook choice, regenerate, loads the teleprompter. Creates the draft."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioScriptView(bountyID: "bnty_lumi_glowup", formatID: nil, hook: nil, draftID: nil)
        .flowdPreviewEnvironment()
}
