import SwiftUI
import Observation

// ToastCenter: the one place toasts are raised. Call it from anywhere on the main actor; ToastHost (applied once at the root with
// `.flowdToastHost()`) draws them as L2 glass capsules. No setup is needed in previews: the environment default is the shared center.
//
//     @Environment(\.flowdToasts) private var toasts
//     toasts.success("Draft saved")
//     toasts.error("Upload stopped at 62%", actionTitle: "Retry") { retry() }
//     toasts.money("$62.40 cleared to your Wallet")
//
// Behaviour: success / info / money dismiss after ~3 s; warnings after 5 s; errors and any toast with an action stay until dismissed
// (tap, swipe up or the action). Each toast is announced to VoiceOver. A repeated message replaces its twin instead of stacking.
// At most three are visible; the oldest leaves first.

enum FlowdToastKind: String, CaseIterable, Hashable, Sendable {
    case success
    case info
    case warning
    case error
    /// Money landed. Mint glyph; pair with the success haptic.
    case money

    var tone: FlowdTone {
        switch self {
        case .success, .money: return FlowdTone.mint
        case .info: return FlowdTone.accent
        case .warning: return FlowdTone.ember
        case .error: return FlowdTone.rose
        }
    }

    var systemImage: String {
        switch self {
        case .success: return "checkmark.circle.fill"
        case .info: return "info.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .error: return "xmark.octagon.fill"
        case .money: return "arrow.up.right.circle.fill"
        }
    }

    var haptic: FlowdHapticKind? {
        switch self {
        case .success, .money: return FlowdHapticKind.success
        case .warning: return FlowdHapticKind.warning
        case .error: return FlowdHapticKind.error
        case .info: return nil
        }
    }
}

struct FlowdToast: Identifiable {
    let id: UUID
    let kind: FlowdToastKind
    let message: String
    let detail: String?
    let systemImage: String
    let actionTitle: String?
    let action: (() -> Void)?
}

@Observable
final class ToastCenter {
    /// The default center, used when none is injected.
    static let shared: ToastCenter = ToastCenter()

    private(set) var toasts: [FlowdToast] = []

    init() {}

    /// Raise a toast. `duration` nil picks the default for the kind (nil seconds = stays until dismissed).
    @MainActor
    func show(
        _ message: String,
        detail: String? = nil,
        kind: FlowdToastKind = .info,
        systemImage: String? = nil,
        actionTitle: String? = nil,
        duration: TimeInterval? = nil,
        action: (() -> Void)? = nil
    ) {
        let toast: FlowdToast = FlowdToast(
            id: UUID(),
            kind: kind,
            message: message,
            detail: detail,
            systemImage: systemImage ?? kind.systemImage,
            actionTitle: actionTitle,
            action: action
        )
        toasts.removeAll { (existing: FlowdToast) -> Bool in
            return existing.message == message && existing.kind == kind
        }
        toasts.append(toast)
        while toasts.count > 3 {
            toasts.removeFirst()
        }
        if let haptic = kind.haptic {
            FlowdHaptics.play(haptic)
        }
        AccessibilityNotification.Announcement(message).post()

        let seconds: TimeInterval? = duration ?? ToastCenter.defaultDuration(kind: kind, hasAction: action != nil)
        if let seconds = seconds {
            let toastID: UUID = toast.id
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                self?.dismiss(toastID)
            }
        }
    }

    @MainActor
    func success(_ message: String, detail: String? = nil) {
        show(message, detail: detail, kind: .success)
    }

    @MainActor
    func info(_ message: String, detail: String? = nil) {
        show(message, detail: detail, kind: .info)
    }

    @MainActor
    func warning(_ message: String, detail: String? = nil) {
        show(message, detail: detail, kind: .warning)
    }

    @MainActor
    func error(_ message: String, detail: String? = nil, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        show(message, detail: detail, kind: .error, actionTitle: actionTitle, action: action)
    }

    /// Money landed ("$62.40 cleared to your Wallet"). Success haptic, mint glyph.
    @MainActor
    func money(_ message: String, detail: String? = nil) {
        show(message, detail: detail, kind: .money)
    }

    @MainActor
    func dismiss(_ id: UUID) {
        toasts.removeAll { (existing: FlowdToast) -> Bool in
            return existing.id == id
        }
    }

    @MainActor
    func dismissAll() {
        toasts.removeAll()
    }

    private static func defaultDuration(kind: FlowdToastKind, hasAction: Bool) -> TimeInterval? {
        if hasAction {
            return nil
        }
        switch kind {
        case .success, .info, .money: return 3.2
        case .warning: return 5
        case .error: return nil
        }
    }
}

// MARK: - Environment

private struct FlowdToastsKey: EnvironmentKey {
    static let defaultValue: ToastCenter = ToastCenter.shared
}

extension EnvironmentValues {
    /// The toast center. Defaults to `ToastCenter.shared`; inject your own with `.environment(\.flowdToasts, center)`.
    var flowdToasts: ToastCenter {
        get { return self[FlowdToastsKey.self] }
        set { self[FlowdToastsKey.self] = newValue }
    }
}
