import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct DraftsView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "tray.full.fill",
                title: "Drafts",
                message: "To be built by ios-studio-edit. SwiftData drafts: thumbnail, bounty, stage, size, last edited; resume (opens the Studio at the stage), delete, storage warning."
            )
        }
        .flowdNavigationTitle("Drafts", large: false)
    }
}

#Preview {
    NavigationStack {
        DraftsView()
    }
    .flowdPreviewEnvironment()
}
