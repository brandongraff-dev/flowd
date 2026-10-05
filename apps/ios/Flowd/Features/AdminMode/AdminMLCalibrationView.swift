import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-admin-mode. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct AdminMLCalibrationView: View {
    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "brain",
                title: "ML calibration",
                message: "To be built by ios-admin-mode. Score drift, band calibration chart, shadow-model comparison."
            )
        }
        .flowdNavigationTitle("ML calibration", large: false)
    }
}

#Preview {
    NavigationStack {
        AdminMLCalibrationView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
