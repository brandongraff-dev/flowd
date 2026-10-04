import SwiftUI

// Tier badges (BRAND.md section 14). Five tiers, Bronze to Elite. A badge is a medallion with one to four chevrons, so rank reads
// without colour; Elite is the only DARK medallion with a rotating prismatic ring, so it is never mistaken for Gold. The tier name
// always appears as text beside the badge (`showsLabel`) or in the accessibility label. Geometry is drawn on a 112 grid and scaled.
// Under 24 pt the glow is dropped and the inner ring is hidden. The ring rotates once per 14 s and is static under Reduce Motion.

// MARK: - Level

/// The five earned tiers. Raw values match the contract enum strings (`"bronze"` ... `"elite"`).
enum FlowdTierLevel: String, CaseIterable, Identifiable, Comparable, Hashable, Sendable {
    case bronze
    case silver
    case gold
    case platinum
    case elite

    var id: String { return rawValue }

    /// 1 (Bronze) to 5 (Elite).
    var rank: Int {
        switch self {
        case .bronze: return 1
        case .silver: return 2
        case .gold: return 3
        case .platinum: return 4
        case .elite: return 5
        }
    }

    var title: String { return style.label }

    /// Generated badge style from the tokens.
    var style: FlowdTierStyle {
        switch self {
        case .bronze: return FlowdTier.bronze
        case .silver: return FlowdTier.silver
        case .gold: return FlowdTier.gold
        case .platinum: return FlowdTier.platinum
        case .elite: return FlowdTier.elite
        }
    }

    /// The next tier up, `nil` at Elite.
    var next: FlowdTierLevel? {
        switch self {
        case .bronze: return FlowdTierLevel.silver
        case .silver: return FlowdTierLevel.gold
        case .gold: return FlowdTierLevel.platinum
        case .platinum: return FlowdTierLevel.elite
        case .elite: return nil
        }
    }

    /// Tolerant lookup from a contract string (`"gold"`, `"Gold"`).
    init?(contractValue: String) {
        self.init(rawValue: contractValue.lowercased())
    }

    static func < (lhs: FlowdTierLevel, rhs: FlowdTierLevel) -> Bool {
        return lhs.rank < rhs.rank
    }
}

enum TierBadgeSize: CaseIterable, Hashable, Sendable {
    /// 20 pt: medallion only (chips, leaderboards, bios).
    case chip
    /// 32 pt: list rows.
    case row
    /// 56 pt: cards.
    case card
    /// 112 pt: profile and celebration.
    case hero

    var points: CGFloat {
        switch self {
        case .chip: return 20
        case .row: return 32
        case .card: return 56
        case .hero: return 112
        }
    }
}

// MARK: - Badge

/// `TierBadge(.gold, size: .card)`; `TierBadge(.elite, size: .hero, showsLabel: true)`.
struct TierBadge: View {
    let level: FlowdTierLevel
    let size: TierBadgeSize
    let showsLabel: Bool

    init(_ level: FlowdTierLevel, size: TierBadgeSize = .row, showsLabel: Bool = false) {
        self.level = level
        self.size = size
        self.showsLabel = showsLabel
    }

    var body: some View {
        HStack(spacing: FlowdSpacing.xs) {
            TierMedallion(level: level, diameter: size.points)
            if showsLabel {
                Text(level.title)
                    .flowdText(labelStyle)
                    .foregroundStyle(FlowdColor.fg)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(level.title + " tier")
    }

    private var labelStyle: FlowdTextStyle {
        switch size {
        case .chip, .row: return FlowdFont.headline
        case .card: return FlowdFont.title3
        case .hero: return FlowdFont.title1
        }
    }
}

// MARK: - Medallion

/// The medallion artwork at any diameter. Prefer `TierBadge`; use this directly for hero art.
struct TierMedallion: View {
    let level: FlowdTierLevel
    let diameter: CGFloat

    @State private var ringAngle: Double = 0
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(level: FlowdTierLevel, diameter: CGFloat) {
        self.level = level
        self.diameter = diameter
    }

    var body: some View {
        let style: FlowdTierStyle = level.style
        let scale: CGFloat = diameter / 112
        let showsDetail: Bool = diameter >= 24
        let coreDiameter: CGFloat = (style.hasRing ? 84 : 92) * scale
        return ZStack {
            if style.hasRing {
                eliteRing(scale: scale)
            }
            core(style: style, diameter: coreDiameter, scale: scale, showsDetail: showsDetail)
            TierChevrons(count: style.chevrons)
                .stroke(
                    chevronStyle(style),
                    style: StrokeStyle(lineWidth: 5.4 * scale, lineCap: .round, lineJoin: .round)
                )
                .frame(width: 112 * scale, height: 112 * scale)
            if style.hasRing && diameter >= 48 {
                sparks(scale: scale)
            }
        }
        .frame(width: diameter, height: diameter)
        .onAppear { startRing(isElite: style.hasRing) }
    }

    // MARK: Pieces

    private func core(style: FlowdTierStyle, diameter: CGFloat, scale: CGFloat, showsDetail: Bool) -> some View {
        return ZStack {
            Circle()
                .fill(coreFill(style))
                .frame(width: diameter, height: diameter)
                .shadow(
                    color: showsDetail ? style.glow.opacity(0.75) : Color.clear,
                    radius: 9 * scale,
                    x: 0,
                    y: 4 * scale
                )
            Circle()
                .fill(
                    RadialGradient(
                        colors: [FlowdPrimitive.white.opacity(0.6), FlowdPrimitive.white.opacity(0)],
                        center: UnitPoint(x: 0.3, y: 0.25),
                        startRadius: 0,
                        endRadius: 40 * scale
                    )
                )
                .frame(width: diameter, height: diameter)
            Circle()
                .strokeBorder(
                    LinearGradient(
                        colors: [style.rim, style.rim.opacity(0.1)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1.6 * scale
                )
                .frame(width: diameter, height: diameter)
            if showsDetail {
                Circle()
                    .stroke(
                        style.hasRing ? FlowdPrimitive.white.opacity(0.16) : style.ink.opacity(0.2),
                        style: StrokeStyle(lineWidth: 1.2 * scale, dash: style.hasRing ? [3 * scale, 3 * scale] : [])
                    )
                    .frame(width: 36 * scale, height: 36 * scale)
            }
        }
    }

    private func coreFill(_ style: FlowdTierStyle) -> AnyShapeStyle {
        if style.hasRing {
            return AnyShapeStyle(style.ink)
        }
        return AnyShapeStyle(style.gradient)
    }

    private func chevronStyle(_ style: FlowdTierStyle) -> AnyShapeStyle {
        if style.hasRing {
            return AnyShapeStyle(style.gradient)
        }
        return AnyShapeStyle(style.ink)
    }

    private func eliteRing(scale: CGFloat) -> some View {
        return Circle()
            .strokeBorder(
                AngularGradient(
                    colors: [
                        FlowdPrimitive.sun500,
                        FlowdPrimitive.ember500,
                        FlowdPrimitive.rose500,
                        FlowdPrimitive.ultraviolet500,
                        FlowdPrimitive.lagoon500,
                        FlowdPrimitive.sun500
                    ],
                    center: .center
                ),
                lineWidth: 3 * scale
            )
            .frame(width: 90 * scale, height: 90 * scale)
            .rotationEffect(Angle.degrees(ringAngle))
    }

    private func sparks(scale: CGFloat) -> some View {
        return ZStack {
            ForEach(0..<4, id: \.self) { (index: Int) in
                TierSpark()
                    .fill(FlowdPrimitive.white.opacity(0.9))
                    .frame(width: 7 * scale, height: 7 * scale)
                    .offset(sparkOffset(index: index, scale: scale))
            }
        }
    }

    private func sparkOffset(index: Int, scale: CGFloat) -> CGSize {
        let radius: CGFloat = 51 * scale
        switch index {
        case 0: return CGSize(width: 0, height: -radius)
        case 1: return CGSize(width: radius, height: 0)
        case 2: return CGSize(width: 0, height: radius)
        default: return CGSize(width: -radius, height: 0)
        }
    }

    private func startRing(isElite: Bool) {
        if !isElite || appearance.reduceMotion || diameter < 48 {
            return
        }
        withAnimation(Animation.linear(duration: 14).repeatForever(autoreverses: false)) {
            ringAngle = 360
        }
    }
}

/// One to four stacked up-chevrons on the 112 grid: 28 wide, 10.5 pitch, centred.
struct TierChevrons: Shape {
    let count: Int

    func path(in rect: CGRect) -> Path {
        let scale: CGFloat = rect.width / 112
        let centerX: CGFloat = rect.midX
        let centerY: CGFloat = rect.midY
        let pitch: CGFloat = 10.5 * scale
        let halfWidth: CGFloat = 14 * scale
        let rise: CGFloat = 4.5 * scale
        let span: CGFloat = CGFloat(max(count - 1, 0)) * pitch
        var path: Path = Path()
        var index: Int = 0
        while index < count {
            let y: CGFloat = centerY - span / 2 + CGFloat(index) * pitch
            path.move(to: CGPoint(x: centerX - halfWidth, y: y + rise))
            path.addLine(to: CGPoint(x: centerX, y: y - rise))
            path.addLine(to: CGPoint(x: centerX + halfWidth, y: y + rise))
            index += 1
        }
        return path
    }
}

/// A four-point star, for the Elite sparks.
struct TierSpark: Shape {
    func path(in rect: CGRect) -> Path {
        let c: CGPoint = CGPoint(x: rect.midX, y: rect.midY)
        let outer: CGFloat = min(rect.width, rect.height) / 2
        let inner: CGFloat = outer * 0.28
        var path: Path = Path()
        var index: Int = 0
        while index < 8 {
            let angle: Double = Double(index) * Double.pi / 4 - Double.pi / 2
            let radius: CGFloat = index % 2 == 0 ? outer : inner
            let point: CGPoint = CGPoint(
                x: c.x + radius * CGFloat(cos(angle)),
                y: c.y + radius * CGFloat(sin(angle))
            )
            if index == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
            index += 1
        }
        path.closeSubpath()
        return path
    }
}

// MARK: - Tier chip

/// Pill with the tier gradient, a translucent disc with an up-chevron and the tier name at the tier's ink colour.
/// For profiles, leaderboards and bios.
struct TierChip: View {
    let level: FlowdTierLevel

    init(_ level: FlowdTierLevel) {
        self.level = level
    }

    var body: some View {
        let style: FlowdTierStyle = level.style
        return HStack(spacing: 6) {
            Image(systemName: "chevron.up")
                .font(.system(size: 11, weight: .heavy))
                .foregroundStyle(chipInk(style))
                .frame(width: 22, height: 22)
                .background { Circle().fill(FlowdPrimitive.white.opacity(0.28)) }
                .accessibilityHidden(true)
            Text(style.label)
                .flowdText(FlowdFont.caption1)
                .fontWeight(.bold)
                .foregroundStyle(chipInk(style))
        }
        .padding(.leading, 4)
        .padding(.trailing, 10)
        .frame(minHeight: 28)
        .background { Capsule(style: .continuous).fill(chipFill(style)) }
        .overlay { Capsule(style: .continuous).strokeBorder(style.rim.opacity(0.7), lineWidth: 1) }
        .shadow(color: style.glow.opacity(0.5), radius: 6, x: 0, y: 3)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(style.label + " tier")
    }

    /// The tier gradient; the tier's ink clears 4.5:1 on the mid stop and 3:1 on the end stops (checked in the token build).
    private func chipFill(_ style: FlowdTierStyle) -> LinearGradient {
        return style.gradient
    }

    private func chipInk(_ style: FlowdTierStyle) -> Color {
        return style.ink
    }
}

// MARK: - Preview

#Preview("Tier badges") {
    FlowdPreviewCanvas {
        VStack(alignment: .leading, spacing: FlowdSpacing.lg) {
            ForEach(FlowdTierLevel.allCases) { (level: FlowdTierLevel) in
                HStack(spacing: FlowdSpacing.md) {
                    TierBadge(level, size: .chip)
                    TierBadge(level, size: .row)
                    TierBadge(level, size: .card)
                    TierChip(level)
                }
            }
            HStack(spacing: FlowdSpacing.xl) {
                TierBadge(.gold, size: .hero, showsLabel: false)
                TierBadge(.elite, size: .hero, showsLabel: false)
            }
            TierBadge(.platinum, size: .card, showsLabel: true)
        }
        .padding(FlowdSpacing.lg)
    }
}
