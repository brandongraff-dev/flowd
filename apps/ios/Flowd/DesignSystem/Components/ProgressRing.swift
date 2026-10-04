import SwiftUI

// ProgressRing: ONE Flow-gradient ring (never three nested activity rings). Used for tier progress, budget used, upload and
// streak-to-next. FlowdProgressBar is the linear sibling (budget left, onboarding steps). Both animate on a spring, finish with a
// round cap, expose a spoken percentage, and never rely on colour alone: the value is also in the centre or the label.

/// A circular progress ring with optional centre content.
///
///     ProgressRing(progress: 0.78, size: 96, lineWidth: 10) { Text("78%").flowdFigure(.md) }
///     ProgressRing(progress: uploaded, size: 44, lineWidth: 5, tone: .accent)
struct ProgressRing<Center: View>: View {
    let progress: Double
    let size: CGFloat
    let lineWidth: CGFloat
    let tone: FlowdTone
    let label: String?
    private let center: Center

    @State private var shown: Double = 0
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(
        progress: Double,
        size: CGFloat = 72,
        lineWidth: CGFloat = 8,
        tone: FlowdTone = .accent,
        label: String? = nil,
        @ViewBuilder center: () -> Center
    ) {
        self.progress = progress
        self.size = size
        self.lineWidth = lineWidth
        self.tone = tone
        self.label = label
        self.center = center()
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(FlowdColor.surfaceActive, style: StrokeStyle(lineWidth: lineWidth))
            Circle()
                .trim(from: 0, to: CGFloat(shown))
                .stroke(ringStyle, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(Angle.degrees(-90))
            center
        }
        .frame(width: size, height: size)
        .padding(lineWidth / 2)
        .onAppear { update(animated: false) }
        .onChange(of: progress) { _, _ in update(animated: true) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label ?? "Progress")
        .accessibilityValue(String(Int((clamped * 100).rounded())) + " percent")
    }

    private var clamped: Double {
        return min(max(progress, 0), 1)
    }

    private var ringStyle: AnyShapeStyle {
        if tone == FlowdTone.accent {
            return AnyShapeStyle(
                AngularGradient(
                    gradient: Gradient(stops: FlowdGradient.flowStops),
                    center: .center,
                    startAngle: Angle.degrees(0),
                    endAngle: Angle.degrees(360)
                )
            )
        }
        if let gradient = tone.gradient {
            return AnyShapeStyle(gradient)
        }
        return AnyShapeStyle(tone.solid)
    }

    private func update(animated: Bool) {
        if animated {
            withAnimation(appearance.animation(.gentle)) {
                shown = clamped
            }
        } else {
            withAnimation(appearance.animation(.gentle).delay(0.1)) {
                shown = clamped
            }
        }
    }
}

extension ProgressRing where Center == EmptyView {
    init(progress: Double, size: CGFloat = 72, lineWidth: CGFloat = 8, tone: FlowdTone = .accent, label: String? = nil) {
        self.init(progress: progress, size: size, lineWidth: lineWidth, tone: tone, label: label) { EmptyView() }
    }
}

// MARK: - Linear bar

/// A linear progress bar with a rounded fill. `FlowdProgressBar(progress: 0.62, tone: .accent, label: "Budget left")`.
struct FlowdProgressBar: View {
    let progress: Double
    let tone: FlowdTone
    let height: CGFloat
    let label: String?

    @State private var shown: Double = 0
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(progress: Double, tone: FlowdTone = .accent, height: CGFloat = 8, label: String? = nil) {
        self.progress = progress
        self.tone = tone
        self.height = height
        self.label = label
    }

    var body: some View {
        GeometryReader { (proxy: GeometryProxy) in
            let width: CGFloat = proxy.size.width
            ZStack(alignment: .leading) {
                Capsule(style: .continuous).fill(FlowdColor.surfaceActive)
                Capsule(style: .continuous)
                    .fill(fillStyle)
                    .frame(width: max(height, width * CGFloat(shown)))
                    .opacity(shown <= 0.001 ? 0 : 1)
            }
        }
        .frame(height: height)
        .onAppear { update() }
        .onChange(of: progress) { _, _ in update() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label ?? "Progress")
        .accessibilityValue(String(Int((clamped * 100).rounded())) + " percent")
    }

    private var clamped: Double {
        return min(max(progress, 0), 1)
    }

    private var fillStyle: AnyShapeStyle {
        if let gradient = tone.gradient {
            return AnyShapeStyle(gradient)
        }
        return AnyShapeStyle(tone.solid)
    }

    private func update() {
        withAnimation(appearance.animation(.smooth)) {
            shown = clamped
        }
    }
}

// MARK: - Preview

private struct ProgressPreview: View {
    @State private var value: Double = 0.78

    var body: some View {
        FlowdPreviewCanvas {
            VStack(spacing: FlowdSpacing.lg) {
                HStack(spacing: FlowdSpacing.xl) {
                    ProgressRing(progress: value, size: 96, lineWidth: 10, label: "Progress to Platinum") {
                        VStack(spacing: 0) {
                            Text(FlowdNumberFormat.percent(value)).flowdFigure(.md).flowdInk(.primary)
                            Text("to Platinum").flowdCaption(.caption2).flowdInk(.subtle)
                        }
                    }
                    ProgressRing(progress: 0.4, size: 44, lineWidth: 5, tone: .mint)
                    ProgressRing(progress: 0.92, size: 44, lineWidth: 5, tone: .ember)
                }
                VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
                    Text("Budget left 62%").flowdCaption(.footnote).flowdInk(.muted)
                    FlowdProgressBar(progress: 0.62, tone: .accent, label: "Budget left")
                    FlowdProgressBar(progress: 0.3, tone: .mint, height: 6)
                }
                FlowdButton("Bump progress", variant: .secondary) {
                    value = value >= 0.95 ? 0.1 : value + 0.15
                }
            }
            .padding(FlowdSpacing.lg)
        }
    }
}

#Preview("Progress") {
    ProgressPreview()
}
