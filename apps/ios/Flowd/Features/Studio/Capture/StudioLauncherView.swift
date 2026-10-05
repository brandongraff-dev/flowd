import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-capture. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioLauncherView: View {
    let entry: StudioEntry
    @Environment(\.dismiss) private var dismiss: DismissAction

    var body: some View {
        VStack(spacing: 0) {
            FlowdNavBar("Studio", isLarge: false, leading: { FlowdBackButton() })
            EmptyStateView(
                systemImage: "video.fill",
                title: "Studio",
                message: "To be built by ios-studio-capture. Continue draft, pick a claimed or saved bounty or free practice, suggested formats, last scores, permission status chip, close. Reacts to entry .importVideo and .scriptWithFlo."
            )
            Spacer(minLength: 0)
        }
        .flowdAurora()
    }
}

#Preview {
    StudioLauncherView(entry: .launcher)
        .flowdPreviewEnvironment()
}
