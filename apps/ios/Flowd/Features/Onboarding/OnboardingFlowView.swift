import SwiftUI

// PLACEHOLDER from the app shell (ios-core). Owner: ios-onboarding-profile. Replace this file: keep the type name, the file path and the initialiser
// (see App/FEATURE_CONTRACT.md). It exists only so the app compiles and every route resolves before the screen is built.

struct OnboardingFlowView: View {
    @Environment(AppState.self) private var appState: AppState
    @Environment(\.flowdAPI) private var api: any FlowdAPI

    var body: some View {
        FlowdScreen {
            EmptyStateView(
                systemImage: "hand.wave.fill",
                title: "Welcome to flowd",
                message: "To be built by ios-onboarding-profile. First-Dollar Path: intro, earnings preview, Sign in with Apple, niches and style, link accounts, age and agreement, First-Dollar Path. Calls appState.completeOnboarding(session:) when done.",
                actionTitle: "Continue as the demo creator"
            ) {
                Task {
                    let session: CreatorSession? = try? await api.signIn(SignInCredential.demo)
                    appState.completeOnboarding(session: session)
                }
            }
        }
    }
}

#Preview {
    OnboardingFlowView()
        .flowdPreviewEnvironment()
}
