import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioImportSheet: View {
    let bountyID: String?
    let onImported: (String) -> Void

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "square.and.arrow.down.fill",
                title: "Import a video",
                message: "To be built by ios-studio-edit. Camera roll or CapCut export via PhotosUI, validates 9:16 and length, creates a draft and calls onImported(draftID); \"edit in CapCut, then import\" hint."
            )
        }
        .flowdNavigationTitle("Import", large: false)
    }
}

#Preview {
    NavigationStack {
        StudioImportSheet(bountyID: nil, onImported: { _ in })
    }
    .flowdPreviewEnvironment()
}
