import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-capture. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioHookLibrarySheet: View {
    let bountyID: String?
    let formatID: FormatId?

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "quote.bubble.fill",
                title: "Hook library",
                message: "To be built by ios-studio-capture. 10+ fill-in hooks by type pre-filled with the app's name and features; favourite; use (writes StudioRouter.chosenHook)."
            )
        }
        .flowdNavigationTitle("Hook library", large: false)
    }
}

#Preview {
    NavigationStack {
        StudioHookLibrarySheet(bountyID: "bnty_lumi_glowup", formatID: nil)
    }
    .flowdPreviewEnvironment()
}
