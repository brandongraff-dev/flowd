import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-studio-capture. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct StudioTeleprompterSettingsSheet: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "text.viewfinder",
                title: "Teleprompter",
                message: "To be built by ios-studio-capture. Speed (wpm), size, mirror, voice-paced toggle, position near the lens, opacity, live preview. Persists with @AppStorage."
            )
        }
        .flowdNavigationTitle("Teleprompter", large: false)
    }
}

#Preview {
    NavigationStack {
        StudioTeleprompterSettingsSheet()
    }
    .flowdPreviewEnvironment()
}
