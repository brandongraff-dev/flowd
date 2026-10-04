import SwiftUI

// Springs come from Tokens.swift (`FlowdMotion.tap / snappy / smooth / sheet / gentle / bouncy`). This file wraps them so that
// Reduce Motion is handled once, and adds the press style, transitions, reveal stagger and the gesture maths.
//
// Rules of thumb (from the brand motion spec): respond on press-down; springs for anything touched; ease-out for micro; no
// overshoot unless the gesture carried momentum (flick) or it is a payout moment; nothing locks input; stagger <= 40 ms, max 8 items.

// MARK: - Spring presets

/// The six brand springs. `resolved(reduceMotion:)` swaps in a 150 ms fade when Reduce Motion is on.
enum FlowdSpring: CaseIterable, Hashable, Sendable {
    /// Press feedback, toggles, checkboxes.
    case tap
    /// Menus, popovers, tabs, chips.
    case snappy
    /// Cards, list reorder, layout shifts, count-ups.
    case smooth
    /// Sheets, drawers, modals.
    case sheet
    /// Hero art, page transitions.
    case gentle
    /// Momentum only: flick release, payout celebration, tier-up.
    case bouncy

    var animation: Animation {
        switch self {
        case .tap: return FlowdMotion.tap
        case .snappy: return FlowdMotion.snappy
        case .smooth: return FlowdMotion.smooth
        case .sheet: return FlowdMotion.sheet
        case .gentle: return FlowdMotion.gentle
        case .bouncy: return FlowdMotion.bouncy
        }
    }

    func resolved(reduceMotion: Bool) -> Animation {
        if reduceMotion {
            return FlowdMotion.standard(FlowdMotion.fast)
        }
        return animation
    }
}

// MARK: - Animation modifier

struct FlowdAnimationModifier<V: Equatable>: ViewModifier {
    let spring: FlowdSpring
    let value: V
    @Environment(\.accessibilityReduceMotion) private var reduceMotion: Bool

    func body(content: Content) -> some View {
        return content.animation(spring.resolved(reduceMotion: reduceMotion), value: value)
    }
}

extension View {
    /// `.animation(_:value:)` with a brand spring that becomes a short fade under Reduce Motion.
    func flowdAnimation<V: Equatable>(_ spring: FlowdSpring = .smooth, value: V) -> some View {
        return modifier(FlowdAnimationModifier(spring: spring, value: value))
    }
}

// MARK: - Press style

/// Scale to 0.96 on press-down (instant), spring back on release. Under Reduce Motion it dims instead of scaling.
/// Use on any tappable card or row: `Button(action: open) { FlowdCard { ... } }.buttonStyle(FlowdPressStyle())`.
struct FlowdPressStyle: ButtonStyle {
    var scale: CGFloat = 0.96

    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        return FlowdPressBody(configuration: configuration, scale: scale)
    }
}

private struct FlowdPressBody: View {
    let configuration: ButtonStyleConfiguration
    let scale: CGFloat
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(configuration: ButtonStyleConfiguration, scale: CGFloat) {
        self.configuration = configuration
        self.scale = scale
    }

    var body: some View {
        let pressed: Bool = configuration.isPressed
        return configuration.label
            .scaleEffect(pressed && !appearance.reduceMotion ? scale : 1)
            .opacity(pressed && appearance.reduceMotion ? 0.8 : 1)
            .animation(appearance.animation(.tap), value: pressed)
    }
}

extension ButtonStyle where Self == FlowdPressStyle {
    /// `.buttonStyle(.flowdPress)`
    static var flowdPress: FlowdPressStyle { return FlowdPressStyle() }
}

// MARK: - Transitions

/// Blur + scale + fade: a surface "materialising". Blur stays under 12 pt.
struct FlowdMaterializeModifier: ViewModifier {
    let isActive: Bool

    func body(content: Content) -> some View {
        return content
            .opacity(isActive ? 0 : 1)
            .scaleEffect(isActive ? 0.96 : 1)
            .blur(radius: isActive ? 10 : 0)
    }
}

/// Small rise + fade. Exits are softer than entries: a fixed 8 pt, never full height.
struct FlowdRiseModifier: ViewModifier {
    let isActive: Bool
    let distance: CGFloat

    func body(content: Content) -> some View {
        return content
            .opacity(isActive ? 0 : 1)
            .offset(y: isActive ? distance : 0)
    }
}

extension AnyTransition {
    /// Glass-like arrival: blur 10 to 0, scale 0.96 to 1, fade.
    static var flowdMaterialize: AnyTransition {
        return AnyTransition.modifier(
            active: FlowdMaterializeModifier(isActive: true),
            identity: FlowdMaterializeModifier(isActive: false)
        )
    }

    /// 8 pt rise + fade.
    static var flowdRise: AnyTransition {
        return AnyTransition.modifier(
            active: FlowdRiseModifier(isActive: true, distance: 8),
            identity: FlowdRiseModifier(isActive: false, distance: 8)
        )
    }

    /// Icon swap: scale 0.25 to 1 with a fade (pair with `.animation(.snappy)`).
    static var flowdPop: AnyTransition {
        return AnyTransition.scale(scale: 0.25).combined(with: AnyTransition.opacity)
    }
}

// MARK: - Staggered reveal

/// Fades and rises a view in on first appearance, delayed by `index * 40 ms` (capped at 8 steps).
/// Use for the first screenful of a list. High-frequency screens (review queue style) must not use it.
struct FlowdRevealModifier: ViewModifier {
    let index: Int
    @State private var shown: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion: Bool

    func body(content: Content) -> some View {
        return content
            .opacity(shown ? 1 : 0)
            .offset(y: (shown || reduceMotion) ? 0 : 10)
            .onAppear {
                if shown { return }
                if reduceMotion {
                    withAnimation(FlowdMotion.standard(FlowdMotion.fast)) { shown = true }
                    return
                }
                let step: Double = Double(min(max(index, 0), 8))
                let delay: Double = step * FlowdMotion.stagger
                withAnimation(FlowdMotion.smooth.delay(delay)) { shown = true }
            }
    }
}

extension View {
    /// `ForEach(Array(items.enumerated()), id: \.element.id) { i, item in Row(item).flowdReveal(index: i) }`
    func flowdReveal(index: Int) -> some View {
        return modifier(FlowdRevealModifier(index: index))
    }
}

// MARK: - Gesture maths

/// Pure helpers for hand-built gestures (sheets, carousels, swipe rows). From the fluid-interface rules:
/// project where a flick will land, then snap to the nearest rest point; resist progressively past an edge.
enum FlowdPhysics {
    /// Distance the content would coast after release. `velocity` in points per second, `decelerationRate` 0.998 = scroll feel.
    static func project(velocity: CGFloat, decelerationRate: CGFloat = 0.998) -> CGFloat {
        return (velocity / 1000) * decelerationRate / (1 - decelerationRate)
    }

    /// Progressive resistance: the further past the bound, the less the content follows. Sign of `overshoot` is preserved.
    static func rubberBand(overshoot: CGFloat, dimension: CGFloat, constant: CGFloat = 0.55) -> CGFloat {
        if dimension <= 0 { return 0 }
        return (overshoot * dimension * constant) / (dimension + constant * abs(overshoot))
    }

    /// The snap point nearest to `value`.
    static func nearest(to value: CGFloat, in points: [CGFloat]) -> CGFloat {
        var best: CGFloat = value
        var bestDistance: CGFloat = CGFloat.greatestFiniteMagnitude
        for point in points {
            let distance: CGFloat = abs(point - value)
            if distance < bestDistance {
                bestDistance = distance
                best = point
            }
        }
        return best
    }
}

// MARK: - Preview

private struct MotionPreview: View {
    @State private var toggled: Bool = false
    @State private var count: Int = 0

    var body: some View {
        FlowdPreviewCanvas {
            VStack(spacing: FlowdSpacing.lg) {
                Button {
                    toggled.toggle()
                    count += 1
                } label: {
                    Text("Press me")
                        .flowdBody(.headline)
                        .flowdInk(.primary)
                        .padding(FlowdSpacing.lg)
                        .flowdSurface(cornerRadius: FlowdRadius.xl)
                }
                .buttonStyle(FlowdPressStyle())

                if toggled {
                    Text("Materialised")
                        .flowdBody(.callout)
                        .flowdInk(.muted)
                        .transition(AnyTransition.flowdMaterialize)
                }

                ForEach(0..<4, id: \.self) { (index: Int) in
                    Text("Row \(index + 1)")
                        .flowdBody(.body)
                        .flowdInk(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(FlowdSpacing.md)
                        .flowdSurface(cornerRadius: FlowdRadius.lg)
                        .flowdReveal(index: index)
                        .id("\(index)-\(count)")
                }
            }
            .padding(FlowdSpacing.lg)
            .flowdAnimation(.snappy, value: toggled)
        }
    }
}

#Preview("Motion") {
    MotionPreview()
}
