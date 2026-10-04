import SwiftUI

// ScoreRing: the Hook Score / Flow Score gauge. Honest by design: day-one scores are CHECKLIST scores, never "AI predicts viral". The ring
// carries a band (Weak, Okay, Solid, Strong) AND a letter AND the number, so the band is never colour alone, and the footnote says
// "Checklist score" until the model has settled enough bounties. Bad news is calm: a weak band is Ember, never a red flash.

enum FlowdScoreBand: String, CaseIterable, Hashable, Sendable {
    case weak
    case okay
    case solid
    case strong

    /// 0-49 weak, 50-69 okay, 70-84 solid, 85-100 strong.
    static func from(score: Int) -> FlowdScoreBand {
        if score >= 85 { return .strong }
        if score >= 70 { return .solid }
        if score >= 50 { return .okay }
        return .weak
    }

    var title: String {
        switch self {
        case .weak: return "Weak"
        case .okay: return "Okay"
        case .solid: return "Solid"
        case .strong: return "Strong"
        }
    }

    /// Letter grade shown beside the number ("Checklist score: B").
    var letter: String {
        switch self {
        case .weak: return "D"
        case .okay: return "C"
        case .solid: return "B"
        case .strong: return "A"
        }
    }

    var tone: FlowdTone {
        switch self {
        case .weak: return FlowdTone.ember
        case .okay: return FlowdTone.sun
        case .solid: return FlowdTone.accent
        case .strong: return FlowdTone.mint
        }
    }
}

/// A score gauge. `score` nil means "analysing" (an indeterminate sweep, static under Reduce Motion).
///
///     ScoreRing(score: 82, title: "Hook Score")                       // Solid, B
///     ScoreRing(score: nil, title: "Hook Score", size: 120)           // analysing
///     ScoreRing(score: 91, title: "Flow Score", size: 160, caption: "Checklist score. Gets smarter as bounties settle.")
struct ScoreRing: View {
    let score: Int?
    let title: String
    let size: CGFloat
    let caption: String?

    @State private var shown: Double = 0
    @State private var spin: Double = 0
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(score: Int?, title: String, size: CGFloat = 132, caption: String? = "Checklist score") {
        self.score = score
        self.title = title
        self.size = size
        self.caption = caption
    }

    var body: some View {
        VStack(spacing: FlowdSpacing.xs) {
            ring
            if let caption = caption {
                Text(caption)
                    .flowdCaption(.caption1)
                    .foregroundStyle(FlowdColor.fgSubtle)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel)
        .accessibilityHint(caption ?? "")
        .onAppear { start() }
        .onChange(of: score) { _, _ in start() }
    }

    // MARK: Ring

    private var lineWidth: CGFloat {
        return max(6, size * 0.085)
    }

    private var band: FlowdScoreBand? {
        guard let score = score else { return nil }
        return FlowdScoreBand.from(score: score)
    }

    private var ring: some View {
        ZStack {
            Circle()
                .stroke(FlowdColor.surfaceActive, style: StrokeStyle(lineWidth: lineWidth))
            detentTicks
            if score != nil {
                Circle()
                    .trim(from: 0, to: CGFloat(shown))
                    .stroke(ringStyle, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(Angle.degrees(-90))
            } else {
                Circle()
                    .trim(from: 0, to: 0.22)
                    .stroke(ringStyle, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(Angle.degrees(-90 + spin))
            }
            centre
        }
        .frame(width: size, height: size)
        .padding(lineWidth / 2)
    }

    /// Tiny ticks at the band boundaries (50, 70, 85) so the detents read without colour.
    private var detentTicks: some View {
        ZStack {
            ForEach([0.5, 0.7, 0.85], id: \.self) { (fraction: Double) in
                Capsule(style: .continuous)
                    .fill(FlowdColor.rimStrong)
                    .frame(width: 2, height: lineWidth * 0.5)
                    .offset(y: -(size / 2) + lineWidth * 1.1)
                    .rotationEffect(Angle.degrees(fraction * 360))
            }
        }
        .accessibilityHidden(true)
    }

    private var centre: some View {
        VStack(spacing: 0) {
            if let score = score, let band = band {
                Text(String(score))
                    .font(.system(size: size * 0.34, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundStyle(FlowdColor.fg)
                    .contentTransition(.numericText(value: Double(score)))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                HStack(spacing: 4) {
                    Text(band.letter)
                        .font(.system(size: size * 0.1, weight: .heavy, design: .rounded))
                        .foregroundStyle(band.tone.onSolid)
                        .frame(width: size * 0.15, height: size * 0.15)
                        .background { Circle().fill(band.tone.solid) }
                    Text(band.title)
                        .font(.system(size: size * 0.1, weight: .semibold, design: .rounded))
                        .foregroundStyle(band.tone.ink)
                }
            } else {
                Text("Analysing")
                    .font(.system(size: size * 0.11, weight: .semibold, design: .rounded))
                    .foregroundStyle(FlowdColor.fgMuted)
                    .flowdShimmer()
            }
        }
        .animation(appearance.animation(.smooth), value: score)
    }

    private var ringStyle: AnyShapeStyle {
        guard let band = band else {
            return AnyShapeStyle(FlowdGradient.flow)
        }
        if let gradient = band.tone.gradient {
            return AnyShapeStyle(gradient)
        }
        return AnyShapeStyle(band.tone.solid)
    }

    private var spokenLabel: String {
        guard let score = score, let band = band else {
            return title + ": analysing"
        }
        return title + ": " + band.title + ", grade " + band.letter + ", " + String(score) + " out of 100"
    }

    // MARK: Animation

    private func start() {
        if let score = score {
            withAnimation(appearance.animation(.gentle)) {
                shown = Double(min(max(score, 0), 100)) / 100
            }
        } else {
            shown = 0
            if !appearance.reduceMotion {
                spin = 0
                withAnimation(Animation.linear(duration: 1.1).repeatForever(autoreverses: false)) {
                    spin = 360
                }
            }
        }
    }
}

// MARK: - Preview

private struct ScorePreview: View {
    @State private var score: Int? = 82

    var body: some View {
        FlowdPreviewCanvas {
            VStack(spacing: FlowdSpacing.xl) {
                FlowdCard {
                    HStack(alignment: .top, spacing: FlowdSpacing.md) {
                        ScoreRing(score: score, title: "Hook Score", size: 108)
                        ScoreRing(score: 41, title: "Flow Score", size: 80, caption: nil)
                        ScoreRing(score: 93, title: "Flow Score", size: 80, caption: nil)
                    }
                    .frame(maxWidth: .infinity)
                }
                FlowdButton("Re-check", variant: .secondary) {
                    score = nil
                    Task {
                        try? await Task.sleep(nanoseconds: 1_200_000_000)
                        score = 91
                    }
                }
            }
            .padding(FlowdSpacing.lg)
        }
    }
}

#Preview("Score ring") {
    ScorePreview()
}
