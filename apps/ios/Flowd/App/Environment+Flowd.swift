import SwiftUI

// What the app root puts in the SwiftUI environment, and how a screen reads it:
//
//     @Environment(AppState.self) private var appState        // gate, persona, creator, badges, Wellbeing Mode, celebrations
//     @Environment(Router.self) private var router            // push / open / present / dismiss
//     @Environment(\.flowdAPI) private var api                // the FlowdAPI (mock offline, live when configured)
//     @Environment(\.flowdToasts) private var toasts          // calm toasts (DesignSystem)
//     @Environment(StudioRouter.self) private var studio: StudioRouter?    // only inside the Studio cover
//
// Screens never construct an API: they read `\.flowdAPI`, which is the one the root created. In a `#Preview` the default is a signed-in mock on a
// frozen clock, and `.flowdPreviewEnvironment()` (PreviewSupport.swift) adds the rest.

private struct FlowdAPIKey: EnvironmentKey {
    static let defaultValue: any FlowdAPI = APIClientFactory.makePreviewMock()
}

extension EnvironmentValues {
    /// The data layer. `FlowdApp` injects the real client; a preview gets a signed-in `MockFlowdAPI` on a frozen clock.
    var flowdAPI: any FlowdAPI {
        get { return self[FlowdAPIKey.self] }
        set { self[FlowdAPIKey.self] = newValue }
    }
}
