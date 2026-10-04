import Observation

/// App-wide observable state, created once in `FlowdApp` and read through
/// `@Environment(AppState.self)`. Keep it small: screen state belongs in feature
/// view models, data belongs behind the `FlowdAPI` service.
@MainActor
@Observable
final class AppState {
    /// Flips to `true` once the creator has finished onboarding.
    var hasCompletedOnboarding: Bool = false

    init() {}
}
