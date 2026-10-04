import Foundation

/// The app's clock. In demo (mock) mode the world is frozen at 2026-10-03T14:00:00Z and ticks forward in real time from there, so every
/// countdown (the Daily Drop at 16:00Z, a post's 72-hour window, the next clearing run) is alive without ever disagreeing with the fixtures.
/// With the live API the clock is the system clock. One instance (`FlowdClock.shared`) is read by the mock API, the view models and the
/// design system (`.flowdClock { FlowdClock.shared.now }`); tests inject their own frozen instance.
final class FlowdClock: @unchecked Sendable {
    enum Mode: Sendable, Equatable {
        /// `base` plus the real seconds elapsed since the clock was created or last set.
        case ticking
        /// Always `base` (previews and tests).
        case frozen
        /// The device clock (live API).
        case system
    }

    /// The demo world's "now": 2026-10-03T14:00:00Z (a Saturday, ISO week 2026-W40). The 14:00 clearing run has just executed.
    static let demoNow: Date = Date(timeIntervalSince1970: 1_791_036_000)

    /// The app-wide clock. Starts in demo mode; `APIClientFactory` switches it to the system clock for the live API.
    static let shared: FlowdClock = FlowdClock(mode: .ticking, base: FlowdClock.demoNow)

    /// A frozen clock for previews and tests.
    static func frozen(at date: Date = FlowdClock.demoNow) -> FlowdClock {
        return FlowdClock(mode: .frozen, base: date)
    }

    private let lock: NSLock = NSLock()
    private var mode: Mode
    private var base: Date
    private var anchor: TimeInterval

    init(mode: Mode = .ticking, base: Date = FlowdClock.demoNow) {
        self.mode = mode
        self.base = base
        self.anchor = ProcessInfo.processInfo.systemUptime
    }

    /// The current instant.
    var now: Date {
        lock.lock()
        defer { lock.unlock() }
        switch mode {
        case .system:
            return Date()
        case .frozen:
            return base
        case .ticking:
            let elapsed: TimeInterval = ProcessInfo.processInfo.systemUptime - anchor
            return base.addingTimeInterval(elapsed)
        }
    }

    var currentMode: Mode {
        lock.lock()
        defer { lock.unlock() }
        return mode
    }

    /// Jumps the clock to `date` and keeps it in `mode` (demo controls, tests).
    func set(_ date: Date, mode newMode: Mode = .ticking) {
        lock.lock()
        defer { lock.unlock() }
        mode = newMode
        base = date
        anchor = ProcessInfo.processInfo.systemUptime
    }

    /// Moves the clock forward (the demo "advance 24 h / 72 h" control).
    func advance(byHours hours: Double) {
        let target: Date = now.addingTimeInterval(hours * 3_600)
        lock.lock()
        defer { lock.unlock() }
        if mode == .system {
            mode = .ticking
        }
        base = target
        anchor = ProcessInfo.processInfo.systemUptime
    }

    /// Switches to the device clock (live API).
    func useSystemTime() {
        lock.lock()
        defer { lock.unlock() }
        mode = .system
    }

    /// Back to the demo world's moment.
    func resetToDemoNow() {
        set(FlowdClock.demoNow, mode: .ticking)
    }
}
