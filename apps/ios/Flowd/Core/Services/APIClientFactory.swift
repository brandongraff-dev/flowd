import Foundation

/// Builds the `FlowdAPI` the app runs against. The mock (the bundled demo world, in-memory mutations, offline) is the default, so the app runs in the
/// simulator, in previews, in CI and on a fresh clone with no server. The live API is opt-in:
///
///   launch argument   `-FlowdAPI live`  (production)   `-FlowdAPI demo`  (the web app's local demo server on localhost:3000)
///                     `-FlowdAPIURL https://staging.example/api/v1`  to point `live` somewhere else
///   environment       `FLOWD_API=live`, `FLOWD_API_URL=...`
///   Info.plist        `FlowdAPIMode`, `FlowdAPIBaseURL` (set from an xcconfig for a staging build)
///
/// Switching to live also switches `FlowdClock.shared` to the device clock; the mock keeps the demo world's "now".
enum APIClientFactory {
    /// The API for the current process (see the table above). Call once, at launch.
    static func makeDefault() -> any FlowdAPI {
        return make(mode: APIMode.resolve())
    }

    /// The API for a mode.
    static func make(
        mode: APIMode,
        clock: FlowdClock = FlowdClock.shared,
        loader: FixtureLoader = FixtureLoader(),
        tokens: any TokenStore = KeychainTokenStore()
    ) -> any FlowdAPI {
        switch mode {
        case .mock:
            return makeMock(clock: clock, loader: loader)
        case .live(let configuration):
            clock.useSystemTime()
            return LiveFlowdAPI(configuration: configuration, tokens: tokens)
        }
    }

    /// The offline demo API (Maya, Silver, 2026-10-03T14:00:00Z). Previews and tests pass a frozen clock.
    static func makeMock(
        clock: FlowdClock = FlowdClock.shared,
        loader: FixtureLoader = FixtureLoader(),
        persona: MockFlowdAPI.Persona = .maya,
        signedIn: Bool = true,
        autoBrandDecisions: Bool = true
    ) -> MockFlowdAPI {
        return MockFlowdAPI(clock: clock, loader: loader, persona: persona, signedIn: signedIn, autoBrandDecisions: autoBrandDecisions)
    }

    /// A mock on a frozen clock at the demo world's "now": what `#Preview` and the unit tests use.
    static func makePreviewMock(signedIn: Bool = true) -> MockFlowdAPI {
        return makeMock(clock: FlowdClock.frozen(), signedIn: signedIn)
    }
}
