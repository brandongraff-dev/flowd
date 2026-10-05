import SwiftUI

// The one place glass is made. Feature views NEVER call `glassEffect`, `GlassEffectContainer` or `.buttonStyle(.glass)`.
// Every `#available(iOS 26, *)` branch for glass lives in DesignSystem/Glass.
//
// Layers (brand book section 9):
//   .l1     quiet glass: content surfaces (cards, panels). Material + ink scrim + rim on EVERY OS. Never `glassEffect`.
//   .l2     real glass: floating controls (tab bar, pills, FAB, toasts, selection knobs). iOS 26 `glassEffect`, Material fallback.
//   .l3     real glass over a content scrim: sheets, popovers, floating panels.
//   .clear  clear glass (L2 variant) for controls floating over media. Needs bold content; never body text.
//
// Rules the wrapper enforces: glass never samples glass (no `.l2` on `.l2`), Reduce Transparency and the in-app "Reduce glass"
// switch swap every layer for a solid tinted surface, Increase Contrast thickens the rim, and text must stay AA (the fill carries
// the scrim, never reduce blur to gain contrast).

enum FlowdGlassLayer: Hashable, Sendable {
    case l1
    case l2
    case l3
    case clear

    var spec: FlowdGlassLayerSpec {
        switch self {
        case .l1: return FlowdGlassSpec.l1
        case .l2, .clear: return FlowdGlassSpec.l2
        case .l3: return FlowdGlassSpec.l3
        }
    }

    /// Radius used by `flowdGlass(cornerRadius:)` when none is given: L1 28, L2 pill, L3 36.
    var defaultRadius: CGFloat {
        switch self {
        case .l1: return FlowdRadius.xxl
        case .l2, .clear: return FlowdRadius.pill
        case .l3: return FlowdRadius.xxxl
        }
    }
}

// MARK: - Public API

extension View {
    /// Glass in any inset shape. `Label("Cleared", systemImage: "checkmark").padding().flowdGlass(in: Capsule())`
    /// - Parameters:
    ///   - layer: `.l1` quiet content surface, `.l2` controls (default), `.l3` sheets and panels, `.clear` over media.
    ///   - tint: tint the glass (one primary action per view), never the label.
    ///   - interactive: iOS 26 only: the glass flexes and lights up under touch. Use for custom tappable glass.
    ///   - elevated: draw the layer's soft coloured shadow (fallback and solid modes; iOS 26 glass brings its own).
    func flowdGlass<S: InsettableShape>(
        _ layer: FlowdGlassLayer = .l2,
        tint: Color? = nil,
        interactive: Bool = false,
        elevated: Bool = true,
        in shape: S
    ) -> some View {
        return modifier(
            FlowdGlassModifier(layer: layer, tint: tint, interactive: interactive, elevated: elevated, shape: shape)
        )
    }

    /// Glass in a continuous rounded rectangle. `cornerRadius` defaults to the layer's radius (L1 28, L2 pill, L3 36).
    func flowdGlass(
        _ layer: FlowdGlassLayer = .l2,
        tint: Color? = nil,
        interactive: Bool = false,
        elevated: Bool = true,
        cornerRadius: CGFloat? = nil
    ) -> some View {
        let radius: CGFloat = cornerRadius ?? layer.defaultRadius
        return flowdGlass(
            layer,
            tint: tint,
            interactive: interactive,
            elevated: elevated,
            in: RoundedRectangle(cornerRadius: radius, style: .continuous)
        )
    }

    /// Glass capsule (pills, toasts, clusters of tabs).
    func flowdGlassCapsule(
        _ layer: FlowdGlassLayer = .l2,
        tint: Color? = nil,
        interactive: Bool = false,
        elevated: Bool = true
    ) -> some View {
        return flowdGlass(layer, tint: tint, interactive: interactive, elevated: elevated, in: Capsule(style: .continuous))
    }

    /// Glass circle (icon buttons, the centre action).
    func flowdGlassCircle(
        _ layer: FlowdGlassLayer = .l2,
        tint: Color? = nil,
        interactive: Bool = false,
        elevated: Bool = true
    ) -> some View {
        return flowdGlass(layer, tint: tint, interactive: interactive, elevated: elevated, in: Circle())
    }

    /// L1 quiet-glass content surface (cards, panels, grouped rows). Same on every OS.
    /// Concentric radii: a child's radius is `parent - padding` (`FlowdRadius.concentric(outer:padding:)`).
    func flowdSurface(
        cornerRadius: CGFloat = FlowdRadius.xxl,
        tint: Color? = nil,
        elevated: Bool = true
    ) -> some View {
        return flowdGlass(
            .l1,
            tint: tint,
            interactive: false,
            elevated: elevated,
            in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        )
    }
}

// MARK: - Modifier

struct FlowdGlassModifier<S: InsettableShape>: ViewModifier {
    let layer: FlowdGlassLayer
    let tint: Color?
    let interactive: Bool
    let elevated: Bool
    let shape: S

    private var appearance: FlowdAppearance = FlowdAppearance()

    init(layer: FlowdGlassLayer, tint: Color?, interactive: Bool, elevated: Bool, shape: S) {
        self.layer = layer
        self.tint = tint
        self.interactive = interactive
        self.elevated = elevated
        self.shape = shape
    }

    func body(content: Content) -> some View {
        if appearance.reduceGlass {
            content
                .background { solidFill }
                .overlay { solidRim }
        } else {
            glassBody(content)
        }
    }

    // MARK: Layer 2 / 3 / clear

    @ViewBuilder
    private func glassBody(_ content: Content) -> some View {
        if #available(iOS 26.0, *) {
            nativeBody(content)
        } else {
            content
                .background { materialFill }
                .overlay { specularRim }
        }
    }

    @available(iOS 26.0, *)
    @ViewBuilder
    private func nativeBody(_ content: Content) -> some View {
        if layer == FlowdGlassLayer.l3 || layer == FlowdGlassLayer.l1 {
            // Large glass carries content, so an ink scrim sits INSIDE the glass view, under the content, to hold AA.
            content
                .background { shape.fill(layer.spec.fill.opacity(0.5)) }
                .glassEffect(nativeGlass, in: shape)
        } else if layer == FlowdGlassLayer.clear {
            // Clear glass needs a dimming layer BEHIND it.
            content
                .glassEffect(nativeGlass, in: shape)
                .background { shape.fill(FlowdGlassSpec.clearDim) }
        } else {
            content.glassEffect(nativeGlass, in: shape)
        }
    }

    @available(iOS 26.0, *)
    private var nativeGlass: Glass {
        var glass: Glass = layer == FlowdGlassLayer.clear ? Glass.clear : Glass.regular
        if let tint = tint {
            glass = glass.tint(tint)
        }
        if interactive {
            glass = glass.interactive()
        }
        return glass
    }

    // MARK: Fills

    /// iOS 17-25 L2/L3/clear and L1 on every OS: Material + the layer's ink scrim + sheen (+ optional tint).
    private var materialFill: some View {
        ZStack {
            if elevated {
                FlowdShadowBacking(shape: shape, shadows: layer.spec.shadows)
            }
            shape.fill(layer.spec.fallbackMaterial)
            shape.fill(layer.spec.fill)
            shape.fill(sheen)
            if layer == FlowdGlassLayer.clear {
                shape.fill(FlowdGlassSpec.clearDim)
            }
            if let tint = tint {
                shape.fill(tint.opacity(tintStrength))
            }
        }
    }

    /// How strongly a tint washes the fallback fill: a 14 percent wash on quiet L1 surfaces, 42 / 34 percent (dark / light) on controls.
    private var tintStrength: Double {
        if layer == FlowdGlassLayer.l1 {
            return 0.14
        }
        return appearance.isDark ? 0.42 : 0.34
    }

    /// Reduce Transparency / in-app Reduce glass: opaque solid surface, no blur, no sheen.
    private var solidFill: some View {
        ZStack {
            if elevated {
                FlowdShadowBacking(shape: shape, shadows: layer.spec.shadows)
            }
            shape.fill(layer.spec.solid)
            if let tint = tint {
                shape.fill(tint.opacity(0.28))
            }
        }
    }

    private var sheen: LinearGradient {
        return LinearGradient(
            colors: [layer.spec.sheenFrom, layer.spec.sheenTo],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: Rims

    /// 1 pt gradient rim, bright top-leading, dim middle, mid bottom-trailing. 1.5 pt and stronger with Increase Contrast.
    private var specularRim: some View {
        let colors: [Color] = appearance.increasedContrast
            ? [FlowdColor.rimStrong, FlowdColor.rimStrong]
            : [layer.spec.rimFrom, layer.spec.rimMid, layer.spec.rimTo]
        return shape
            .strokeBorder(
                LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing),
                lineWidth: appearance.rimWidth
            )
            .allowsHitTesting(false)
    }

    private var solidRim: some View {
        return shape
            .strokeBorder(
                appearance.increasedContrast ? FlowdColor.rimStrong : FlowdColor.rim,
                lineWidth: appearance.rimWidth
            )
            .allowsHitTesting(false)
    }
}

// MARK: - Shadow that never bleeds through translucent glass

/// A path with a hole: a big rectangle with `inner` cut out (even-odd fill). Used to mask the shadow of a
/// translucent surface so the shadow shows only OUTSIDE the shape and never darkens the glass interior.
struct FlowdKnockoutShape<Inner: Shape>: Shape {
    let inner: Inner

    func path(in rect: CGRect) -> Path {
        var path: Path = Path()
        path.addRect(rect.insetBy(dx: -200, dy: -200))
        path.addPath(inner.path(in: rect))
        return path
    }
}

struct FlowdShadowBacking<S: InsettableShape>: View {
    let shape: S
    let shadows: [FlowdShadow]

    var body: some View {
        ZStack {
            ForEach(0..<shadows.count, id: \.self) { (index: Int) in
                shape
                    .fill(Color.black)
                    .shadow(
                        color: shadows[index].color,
                        radius: shadows[index].radius,
                        x: shadows[index].x,
                        y: shadows[index].y
                    )
            }
        }
        .mask {
            FlowdKnockoutShape(inner: shape)
                .fill(Color.white, style: FillStyle(eoFill: true))
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Preview

#Preview("Glass layers") {
    FlowdPreviewCanvas {
        VStack(spacing: FlowdSpacing.lg) {
            VStack(alignment: .leading, spacing: FlowdSpacing.xxs) {
                Text("L1 quiet glass").flowdBody(.headline).flowdInk(.primary)
                Text("Content surfaces. Material plus an ink scrim, rim, soft shadow.")
                    .flowdBody(.subheadline).flowdInk(.muted)
            }
            .padding(FlowdSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .flowdSurface()

            FlowdGlassContainer(spacing: 12) {
                HStack(spacing: 12) {
                    Label("Cleared", systemImage: "checkmark.circle.fill")
                        .flowdBody(.subheadline).flowdInk(.primary)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .flowdGlassCapsule()
                    Label("Pending", systemImage: "clock")
                        .flowdBody(.subheadline).flowdInk(.primary)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .flowdGlassCapsule()
                }
            }

            VStack(alignment: .leading, spacing: FlowdSpacing.xxs) {
                Text("L3 sheet glass").flowdBody(.headline).flowdInk(.primary)
                Text("Sheets and popovers. Content on top uses fills, not more glass.")
                    .flowdBody(.subheadline).flowdInk(.muted)
            }
            .padding(FlowdSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .flowdGlass(.l3)
        }
        .padding(FlowdSpacing.lg)
    }
}

#Preview("Glass, Reduce glass") {
    FlowdPreviewCanvas {
        VStack(spacing: FlowdSpacing.lg) {
            Text("Solid surface")
                .flowdBody(.headline).flowdInk(.primary)
                .padding(FlowdSpacing.lg)
                .frame(maxWidth: .infinity)
                .flowdSurface()
            Text("Solid pill")
                .flowdBody(.subheadline).flowdInk(.primary)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .flowdGlassCapsule()
        }
        .padding(FlowdSpacing.lg)
    }
    .flowdReduceGlass(true)
}
