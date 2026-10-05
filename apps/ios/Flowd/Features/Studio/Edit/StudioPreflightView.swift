import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-edit. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioPreflightView: View {
    let draftID: String

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Pre-flight", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "checklist",
                title: "Pre-flight",
                message: "To be built by ios-studio-edit. Disclosure (audio and on-screen), #ad caption and brand tag, music licence flag, banned claims, AI-content flag, 9:16, length, safe zones; blocking vs warning with fix actions."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioPreflightView(draftID: "draft_preview")
        .flowdPreviewEnvironment()
}
