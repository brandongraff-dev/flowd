import SwiftUI

// ThumbArt renders an `ArtSeed` as a generated 9:16 (or 16:9, 4:5, 1:1) video thumbnail: a diagonal brand gradient, a seeded motif
// drawn with Canvas, a tiny generic app glyph top-left, big rounded type and a caption chip bottom-left. All text sits on a media
// scrim (ink 80 percent at the bottom fading to zero) so it stays AA on every palette. No faces, no stock, no real logos.

enum ThumbAspect: CaseIterable, Hashable, Sendable {
    /// 9:16, the video thumbnail.
    case portrait
    /// 16:9, hero banners.
    case landscape
    /// 4:5, feed cards.
    case card
    /// 1:1.
    case square

    var ratio: CGFloat {
        switch self {
        case .portrait: return 9.0 / 16.0
        case .landscape: return 16.0 / 9.0
        case .card: return 4.0 / 5.0
        case .square: return 1.0
        }
    }
}

/// A generated thumbnail.
///
///     ThumbArt(bounty.artSeed)                                          // 9:16, radius 16, with text
///     ThumbArt(bounty.artSeed, aspect: .landscape, cornerRadius: 28)    // hero banner
///     ThumbArt(post.artSeed, showsText: false, isDecorative: true)      // tiny list thumbnail
///
/// It sizes itself to the width it is offered (`aspectRatio`): give it a `.frame(width:)` or let the parent decide.
struct ThumbArt: View {
    let art: ArtSeed
    let aspect: ThumbAspect
    let cornerRadius: CGFloat
    let showsText: Bool
    let isDecorative: Bool

    init(
        _ art: ArtSeed,
        aspect: ThumbAspect = .portrait,
        cornerRadius: CGFloat = FlowdRadius.lg,
        showsText: Bool = true,
        isDecorative: Bool = false
    ) {
        self.art = art
        self.aspect = aspect
        self.cornerRadius = cornerRadius
        self.showsText = showsText
        self.isDecorative = isDecorative
    }

    var body: some View {
        let angle: Double = art.angle ?? 135
        let seedValue: Int = art.seed
        let motifValue: ArtMotif = art.motif
        return GeometryReader { (proxy: GeometryProxy) in
            let size: CGSize = proxy.size
            ZStack {
                LinearGradient(
                    colors: art.palette.colors,
                    startPoint: FlowdKit.start(angle: angle),
                    endPoint: FlowdKit.end(angle: angle)
                )
                Canvas { (context: inout GraphicsContext, canvasSize: CGSize) in
                    ThumbArtPainter.paint(context: &context, size: canvasSize, seed: seedValue, motif: motifValue)
                }
                if showsText && size.width >= 72 {
                    textLayer(size: size)
                }
            }
            .frame(width: size.width, height: size.height)
        }
        .aspectRatio(aspect.ratio, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(FlowdColor.rim, lineWidth: 1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(art.title ?? "Video thumbnail")
        .accessibilityHidden(isDecorative)
    }

    // MARK: Text layer

    private func textLayer(size: CGSize) -> some View {
        let unit: CGFloat = size.width
        let padding: CGFloat = unit * 0.07
        let titleSize: CGFloat = unit * (aspect == ThumbAspect.landscape ? 0.075 : 0.14)
        return ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [Color.clear, FlowdPrimitive.abyss975.opacity(0.8)],
                startPoint: UnitPoint(x: 0.5, y: 0.3),
                endPoint: UnitPoint.bottom
            )
            VStack(alignment: .leading, spacing: unit * 0.04) {
                if let title = art.title {
                    Text(title)
                        .font(.system(size: titleSize, weight: .heavy, design: .rounded))
                        .tracking(-titleSize * 0.03)
                        .lineSpacing(-titleSize * 0.1)
                        .foregroundStyle(FlowdPrimitive.white)
                        .shadow(color: Color.black.opacity(0.35), radius: 3, x: 0, y: 1)
                        .minimumScaleFactor(0.5)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                }
                if let caption = art.caption {
                    Text(caption)
                        .font(.system(size: max(9, unit * 0.055), weight: .semibold, design: .rounded))
                        .foregroundStyle(FlowdPrimitive.white)
                        .padding(.horizontal, unit * 0.04)
                        .padding(.vertical, unit * 0.018)
                        .background { Capsule(style: .continuous).fill(Color.black.opacity(0.4)) }
                        .lineLimit(1)
                }
            }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .overlay(alignment: .topLeading) {
            glyph(unit: unit)
                .padding(padding)
        }
    }

    @ViewBuilder
    private func glyph(unit: CGFloat) -> some View {
        let side: CGFloat = max(16, unit * 0.13)
        RoundedRectangle(cornerRadius: side * 0.28, style: .continuous)
            .fill(FlowdPrimitive.white.opacity(0.24))
            .frame(width: side, height: side)
            .overlay {
                Image(systemName: art.glyph ?? "sparkles")
                    .font(.system(size: side * 0.52, weight: .bold))
                    .foregroundStyle(FlowdPrimitive.white)
            }
            .overlay {
                RoundedRectangle(cornerRadius: side * 0.28, style: .continuous)
                    .strokeBorder(FlowdPrimitive.white.opacity(0.35), lineWidth: 1)
            }
    }
}

// MARK: - Painter (nonisolated: safe to call from the Canvas renderer)

enum ThumbArtPainter {
    static func paint(context: inout GraphicsContext, size: CGSize, seed: Int, motif: ArtMotif) {
        let mixed: UInt64 = UInt64(truncatingIfNeeded: seed) &* 0x9E3779B97F4A7C15 &+ 0x1234567
        var random: FlowdSeededRandom = FlowdSeededRandom(seed: mixed)
        switch motif {
        case .orbs: paintOrbs(context: &context, size: size, random: &random)
        case .rings: paintRings(context: &context, size: size, random: &random)
        case .ribbon: paintRibbon(context: &context, size: size, random: &random)
        case .grid: paintGrid(context: &context, size: size, random: &random)
        case .burst: paintBurst(context: &context, size: size, random: &random)
        case .waves: paintWaves(context: &context, size: size, random: &random)
        case .stripes: paintStripes(context: &context, size: size, random: &random)
        }
    }

    private static func paintOrbs(context: inout GraphicsContext, size: CGSize, random: inout FlowdSeededRandom) {
        let longSide: CGFloat = max(size.width, size.height)
        var index: Int = 0
        while index < 4 {
            let cx: CGFloat = CGFloat(random.range(-0.1, 1.1)) * size.width
            let cy: CGFloat = CGFloat(random.range(-0.05, 1.0)) * size.height
            let radius: CGFloat = CGFloat(random.range(0.28, 0.55)) * longSide * 0.8
            let opacity: Double = random.range(0.2, 0.42)
            let gradient: Gradient = Gradient(colors: [
                FlowdPrimitive.white.opacity(opacity),
                FlowdPrimitive.white.opacity(0)
            ])
            let rect: CGRect = CGRect(x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2)
            context.fill(
                Path(ellipseIn: rect),
                with: .radialGradient(gradient, center: CGPoint(x: cx, y: cy), startRadius: 0, endRadius: radius)
            )
            index += 1
        }
    }

    private static func paintRings(context: inout GraphicsContext, size: CGSize, random: inout FlowdSeededRandom) {
        let cx: CGFloat = CGFloat(random.range(0.15, 0.85)) * size.width
        let cy: CGFloat = CGFloat(random.range(0.1, 0.6)) * size.height
        let step: CGFloat = max(size.width, size.height) * 0.11
        var index: Int = 1
        while index <= 8 {
            let radius: CGFloat = step * CGFloat(index)
            let rect: CGRect = CGRect(x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2)
            let alpha: Double = 0.22 - Double(index) * 0.02
            context.stroke(
                Path(ellipseIn: rect),
                with: .color(FlowdPrimitive.white.opacity(max(alpha, 0.04))),
                lineWidth: 1.5 + CGFloat(index % 3)
            )
            index += 1
        }
    }

    private static func paintRibbon(context: inout GraphicsContext, size: CGSize, random: inout FlowdSeededRandom) {
        var index: Int = 0
        while index < 3 {
            var path: Path = Path()
            let startY: CGFloat = CGFloat(random.range(0.1, 0.9)) * size.height
            let endY: CGFloat = CGFloat(random.range(0.1, 0.9)) * size.height
            let c1: CGPoint = CGPoint(x: size.width * 0.3, y: CGFloat(random.range(-0.1, 1.1)) * size.height)
            let c2: CGPoint = CGPoint(x: size.width * 0.7, y: CGFloat(random.range(-0.1, 1.1)) * size.height)
            path.move(to: CGPoint(x: -size.width * 0.1, y: startY))
            path.addCurve(to: CGPoint(x: size.width * 1.1, y: endY), control1: c1, control2: c2)
            context.stroke(
                path,
                with: .color(FlowdPrimitive.white.opacity(0.16 + Double(index) * 0.04)),
                style: StrokeStyle(lineWidth: size.width * (0.16 - CGFloat(index) * 0.04), lineCap: .round)
            )
            index += 1
        }
    }

    private static func paintGrid(context: inout GraphicsContext, size: CGSize, random: inout FlowdSeededRandom) {
        let spacing: CGFloat = max(size.width, size.height) * 0.06
        let offsetX: CGFloat = CGFloat(random.range(0, 1)) * spacing
        let offsetY: CGFloat = CGFloat(random.range(0, 1)) * spacing
        var dots: Path = Path()
        var y: CGFloat = offsetY
        while y < size.height {
            var x: CGFloat = offsetX
            while x < size.width {
                dots.addEllipse(in: CGRect(x: x - 1.6, y: y - 1.6, width: 3.2, height: 3.2))
                x += spacing
            }
            y += spacing
        }
        context.fill(dots, with: .color(FlowdPrimitive.white.opacity(0.26)))
    }

    private static func paintBurst(context: inout GraphicsContext, size: CGSize, random: inout FlowdSeededRandom) {
        let cx: CGFloat = CGFloat(random.range(0.25, 0.75)) * size.width
        let cy: CGFloat = CGFloat(random.range(0.15, 0.5)) * size.height
        let reach: CGFloat = max(size.width, size.height) * 1.2
        let rays: Int = 16
        var index: Int = 0
        while index < rays {
            let angle: Double = Double(index) / Double(rays) * Double.pi * 2
            let halfWidth: Double = Double.pi / Double(rays) * 0.5
            let a1: Double = angle - halfWidth
            let a2: Double = angle + halfWidth
            let p1: CGPoint = CGPoint(x: cx + reach * CGFloat(cos(a1)), y: cy + reach * CGFloat(sin(a1)))
            let p2: CGPoint = CGPoint(x: cx + reach * CGFloat(cos(a2)), y: cy + reach * CGFloat(sin(a2)))
            var path: Path = Path()
            path.move(to: CGPoint(x: cx, y: cy))
            path.addLine(to: p1)
            path.addLine(to: p2)
            path.closeSubpath()
            if index % 2 == 0 {
                context.fill(path, with: .color(FlowdPrimitive.white.opacity(0.14)))
            }
            index += 1
        }
    }

    private static func paintWaves(context: inout GraphicsContext, size: CGSize, random: inout FlowdSeededRandom) {
        var layer: Int = 0
        while layer < 4 {
            let baseline: CGFloat = size.height * (0.35 + CGFloat(layer) * 0.14)
            let amplitude: CGFloat = size.height * CGFloat(random.range(0.025, 0.06))
            let frequency: Double = random.range(1.2, 2.4)
            let phase: Double = random.range(0, Double.pi * 2)
            var path: Path = Path()
            path.move(to: CGPoint(x: 0, y: size.height))
            var x: CGFloat = 0
            while x <= size.width + 6 {
                let progress: Double = Double(x / max(size.width, 1))
                let y: CGFloat = baseline + amplitude * CGFloat(sin(progress * Double.pi * 2 * frequency + phase))
                path.addLine(to: CGPoint(x: x, y: y))
                x += 6
            }
            path.addLine(to: CGPoint(x: size.width + 6, y: size.height))
            path.closeSubpath()
            context.fill(path, with: .color(FlowdPrimitive.white.opacity(0.07 + Double(layer) * 0.02)))
            layer += 1
        }
    }

    private static func paintStripes(context: inout GraphicsContext, size: CGSize, random: inout FlowdSeededRandom) {
        let stripe: CGFloat = max(size.width, size.height) * CGFloat(random.range(0.1, 0.17))
        let slant: CGFloat = size.height * 0.5
        var x: CGFloat = -size.height
        var toggle: Bool = false
        while x < size.width + size.height {
            if toggle {
                var path: Path = Path()
                path.move(to: CGPoint(x: x, y: size.height))
                path.addLine(to: CGPoint(x: x + stripe, y: size.height))
                path.addLine(to: CGPoint(x: x + stripe + slant, y: 0))
                path.addLine(to: CGPoint(x: x + slant, y: 0))
                path.closeSubpath()
                context.fill(path, with: .color(FlowdPrimitive.white.opacity(0.1)))
            }
            toggle.toggle()
            x += stripe
        }
    }
}

// MARK: - Preview

#Preview("Thumbnails") {
    FlowdPreviewCanvas {
        VStack(alignment: .leading, spacing: FlowdSpacing.lg) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: FlowdSpacing.sm) {
                    ForEach(0..<ArtSeed.samples.count, id: \.self) { (index: Int) in
                        ThumbArt(ArtSeed.samples[index])
                            .frame(width: 132)
                    }
                }
                .padding(.horizontal, FlowdSpacing.lg)
            }
            ThumbArt(ArtSeed.samples[0], aspect: .landscape, cornerRadius: FlowdRadius.xxl)
                .padding(.horizontal, FlowdSpacing.lg)
            HStack(spacing: FlowdSpacing.sm) {
                ThumbArt(ArtSeed.samples[3], aspect: .card).frame(width: 150)
                ThumbArt(ArtSeed.samples[5], aspect: .square, showsText: false).frame(width: 64)
                ThumbArt(ArtSeed(key: "post_demo_77"), aspect: .square, showsText: false).frame(width: 64)
            }
            .padding(.horizontal, FlowdSpacing.lg)
        }
        .padding(.vertical, FlowdSpacing.lg)
    }
}
