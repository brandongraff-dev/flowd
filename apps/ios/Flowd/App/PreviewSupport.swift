import SwiftUI

// Previews. Every feature `#Preview` wraps its content in `.flowdPreviewEnvironment()` so `AppState`, `Router`, the API, the toast host and the in-app
// preferences exist, exactly as they do under `RootView`:
//
//     #Preview {
//         NavigationStack { BountyDetailView(bountyID: "bnty_lumi_glowup") }
//             .flowdPreviewEnvironment()
//     }
//
// The environment is a ready, signed-in demo (Maya, a frozen clock at 2026-10-03T14:00:00Z, an in-memory draft store). It is for previews and tests only.

extension AppState {
    /// A ready `AppState` for previews: signed in as Maya on a frozen-clock mock, in-memory drafts, no network monitor.
    static func preview(persona: AppPersona = AppPersona.creator) -> AppState {
        let state: AppState = AppState(api: PreviewData.api(), launch: LaunchOptions(isDemo: true, requestedPersona: persona))
        state.session = CreatorSession(user: PreviewData.user, creator: PreviewData.creator, token: nil, isDemo: true, now: PreviewData.now)
        state.draftStore = try? DraftStore.make(inMemory: true)
        return state
    }
}

/// Hosts a preview's content with the full app environment.
struct FlowdPreviewHost<Content: View>: View {
    private let content: Content
    @State private var appState: AppState
    @State private var router: Router

    init(persona: AppPersona, content: Content) {
        self.content = content
        let state: AppState = AppState.preview(persona: persona)
        let preparedRouter: Router = Router()
        preparedRouter.persona = persona
        state.router = preparedRouter
        _appState = State(initialValue: state)
        _router = State(initialValue: preparedRouter)
    }

    var body: some View {
        content
            .environment(appState)
            .environment(router)
            .environment(\.flowdAPI, appState.api)
            .flowdRoot()
            .flowdClock { PreviewData.now }
            .flowdToastHost()
    }
}

extension View {
    /// Adds the app environment (AppState, Router, the API, toasts, in-app preferences) to a preview.
    func flowdPreviewEnvironment(persona: AppPersona = AppPersona.creator) -> some View {
        return FlowdPreviewHost(persona: persona, content: self)
    }
}
