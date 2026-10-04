import SwiftUI

/// App entry point. Owns the single `AppState` and injects it through the environment.
@main
struct FlowdApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
        }
    }
}
