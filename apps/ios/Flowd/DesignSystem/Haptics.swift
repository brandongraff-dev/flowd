import SwiftUI
import UIKit

// Haptics fire on the causal frame, matched to the visual, one per user action, and never as the only feedback.
//   selection  tab / segment / picker tick        tap       light press on a control
//   press      medium: record start, commit       heavy     a heavy object lands
//   success    cleared money, approval, tier-up   warning   gentle bad news (single, never repeated)
//   error      a rejected action                  increase / decrease   score or value steps
// Web has no reliable haptics; this layer is iOS only. Reduce noise: never on scroll, never per frame.

enum FlowdHapticKind: Hashable, Sendable {
    case selection
    case tap
    case press
    case heavy
    case success
    case warning
    case error
    case increase
    case decrease

    /// The declarative equivalent, for `.sensoryFeedback`.
    var sensoryFeedback: SensoryFeedback {
        switch self {
        case .selection: return SensoryFeedback.selection
        case .tap: return SensoryFeedback.impact(weight: SensoryFeedback.Weight.light)
        case .press: return SensoryFeedback.impact(weight: SensoryFeedback.Weight.medium)
        case .heavy: return SensoryFeedback.impact(weight: SensoryFeedback.Weight.heavy)
        case .success: return SensoryFeedback.success
        case .warning: return SensoryFeedback.warning
        case .error: return SensoryFeedback.error
        case .increase: return SensoryFeedback.increase
        case .decrease: return SensoryFeedback.decrease
        }
    }
}

// MARK: - Declarative

struct FlowdHapticModifier<T: Equatable>: ViewModifier {
    let kind: FlowdHapticKind
    let trigger: T
    @Environment(\.flowdHapticsEnabled) private var hapticsEnabled: Bool

    func body(content: Content) -> some View {
        let feedback: SensoryFeedback = kind.sensoryFeedback
        let enabled: Bool = hapticsEnabled
        return content.sensoryFeedback(trigger: trigger) { (_: T, _: T) -> SensoryFeedback? in
            return enabled ? feedback : nil
        }
    }
}

extension View {
    /// Plays a haptic whenever `trigger` changes. Honours the in-app haptics switch.
    /// `.flowdHaptic(.success, trigger: clearedCents)`
    func flowdHaptic<T: Equatable>(_ kind: FlowdHapticKind, trigger: T) -> some View {
        return modifier(FlowdHapticModifier(kind: kind, trigger: trigger))
    }
}

// MARK: - Imperative (UIKit fallback)

/// Imperative haptics for code that is not driven by a state change (a gesture ending, a view model event).
/// Call from the main actor. `FlowdHaptics.isEnabled` mirrors the in-app switch (set by `flowdRoot()`).
@MainActor
enum FlowdHaptics {
    static var isEnabled: Bool = true

    private static let selectionGenerator: UISelectionFeedbackGenerator = UISelectionFeedbackGenerator()
    private static let notificationGenerator: UINotificationFeedbackGenerator = UINotificationFeedbackGenerator()
    private static let lightGenerator: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: .light)
    private static let mediumGenerator: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: .medium)
    private static let heavyGenerator: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: .heavy)

    /// Plays one haptic now (no-op when haptics are off).
    static func play(_ kind: FlowdHapticKind) {
        if !isEnabled { return }
        switch kind {
        case .selection:
            selectionGenerator.selectionChanged()
        case .tap:
            lightGenerator.impactOccurred()
        case .press:
            mediumGenerator.impactOccurred()
        case .heavy:
            heavyGenerator.impactOccurred()
        case .success:
            notificationGenerator.notificationOccurred(.success)
        case .warning:
            notificationGenerator.notificationOccurred(.warning)
        case .error:
            notificationGenerator.notificationOccurred(.error)
        case .increase:
            selectionGenerator.selectionChanged()
        case .decrease:
            selectionGenerator.selectionChanged()
        }
    }

    /// Warms the Taptic Engine just before a haptic you know is coming (a drag nearing a detent).
    static func prepare(_ kind: FlowdHapticKind) {
        if !isEnabled { return }
        switch kind {
        case .selection, .increase, .decrease:
            selectionGenerator.prepare()
        case .tap:
            lightGenerator.prepare()
        case .press:
            mediumGenerator.prepare()
        case .heavy:
            heavyGenerator.prepare()
        case .success, .warning, .error:
            notificationGenerator.prepare()
        }
    }
}

// MARK: - Preview

private struct HapticSample: Identifiable {
    let id: String
    let kind: FlowdHapticKind
}

private struct HapticsPreview: View {
    private let samples: [HapticSample] = [
        HapticSample(id: "Selection: tab, segment, picker tick", kind: .selection),
        HapticSample(id: "Tap: light press", kind: .tap),
        HapticSample(id: "Press: record start, commit", kind: .press),
        HapticSample(id: "Heavy: a heavy object lands", kind: .heavy),
        HapticSample(id: "Success: cleared money, approval, tier-up", kind: .success),
        HapticSample(id: "Warning: gentle bad news, once", kind: .warning),
        HapticSample(id: "Error: a rejected action", kind: .error)
    ]

    var body: some View {
        FlowdPreviewCanvas {
            VStack(spacing: FlowdSpacing.sm) {
                Text("Run on a device. The simulator has no Taptic Engine.")
                    .flowdCaption(.footnote)
                    .flowdInk(.muted)
                ForEach(samples) { (sample: HapticSample) in
                    FlowdButton(sample.id, variant: .secondary, fullWidth: true) {
                        FlowdHaptics.play(sample.kind)
                    }
                }
            }
            .padding(FlowdSpacing.lg)
        }
    }
}

#Preview("Haptics") {
    HapticsPreview()
}
