import SwiftUI

/// App entry point. Builds the data layer, `AppState` and the `Router` once, injects them (and the toast centre, the in-app preferences and the demo
/// clock) into the environment, and wires the three ways the outside world reaches the app:
///
///   - deep links: `flowd://...` (`onOpenURL`: Home Screen widgets, the Live Activity, notification taps that carry a URL), universal links on
///     joinflowd.io (`onContinueUserActivity`), and notification taps (`NotificationRouter`), all through `AppState.open(_:)`;
///   - scene changes: the app refreshes its badges when it becomes active and publishes the widget snapshot when it goes to the background;
///   - launch arguments (`LaunchOptions`): demo mode, persona, a screen to open, appearance, Reduce glass.
@main
struct FlowdApp: App {
    @UIApplicationDelegateAdaptor(FlowdAppDelegate.self) private var appDelegate: FlowdAppDelegate
    @State private var appState: AppState
    @State private var router: Router
    @Environment(\.scenePhase) private var scenePhase: ScenePhase

    init() {
        let launch: LaunchOptions = LaunchOptions.current
        launch.applyPreferences()
        let api: any FlowdAPI = FlowdApp.makeAPI(launch: launch)
        let state: AppState = AppState.live(api: api, launch: launch)
        let navigator: Router = Router()
        navigator.persona = launch.persona
        state.router = navigator
        if let screen = launch.screen {
            state.deferredLaunchRoute = navigator.apply(screen)
        }
        _appState = State(initialValue: state)
        _router = State(initialValue: navigator)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .environment(router)
                .environment(\.flowdAPI, appState.api)
                .environment(\.flowdToasts, ToastCenter.shared)
                .flowdRoot()
                .flowdClock { FlowdClock.shared.now }
                .onOpenURL { (url: URL) in
                    appState.open(url: url)
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { (activity: NSUserActivity) in
                    if let url = activity.webpageURL {
                        appState.open(url: url)
                    }
                }
                .onChange(of: scenePhase) { (_: ScenePhase, newPhase: ScenePhase) in
                    appState.scenePhaseChanged(newPhase)
                }
                .onAppear {
                    NotificationRouter.deepLinkHandler = { (link: DeepLink) in
                        appState.open(link)
                    }
                }
                .task {
                    await appState.start()
                }
        }
    }

    /// The data layer for this process: the offline mock (signed in for the demo and for returning creators, signed out on a first run) or the live API
    /// when `-FlowdAPI live|demo` / `FLOWD_API` asks for it.
    private static func makeAPI(launch: LaunchOptions) -> any FlowdAPI {
        switch APIMode.resolve() {
        case .mock:
            let onboarded: Bool = UserDefaults.standard.bool(forKey: FlowdDefaultsKey.onboarded)
            let signedIn: Bool = launch.isDemo || onboarded
            let mock: MockFlowdAPI = APIClientFactory.makeMock(signedIn: signedIn)
            return mock
        case .live:
            return APIClientFactory.makeDefault()
        }
    }
}
