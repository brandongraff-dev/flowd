import XCTest
@testable import Flowd

/// Smoke tests that prove the test bundle is hosted by the app and can see its types.
@MainActor
final class FlowdSmokeTests: XCTestCase {
    func testAppStateStartsBeforeOnboarding() {
        let state = AppState()
        XCTAssertFalse(state.hasCompletedOnboarding)
    }

    func testTestsRunInsideTheFlowdApp() {
        let hostBundle = Bundle(for: AppState.self)
        XCTAssertEqual(hostBundle.bundleIdentifier, "app.flowd.creator")
    }
}
