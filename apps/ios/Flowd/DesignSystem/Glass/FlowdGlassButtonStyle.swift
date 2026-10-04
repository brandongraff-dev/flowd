import SwiftUI

// Button variants. One primary gradient button per view; peers are glass or ghost. Press feedback is instant (scale 0.96 on
// press-down, spring back), the label keeps >= 44 pt hit height, and disabled controls dim to 45 percent.
//
//   .primary      Flow gradient (ultraviolet to azure), white label. The one hero action.
//   .secondary    L2 glass capsule (iOS 26 `glassEffect`, Material fallback), primary label.
//   .ember        Ember gradient, ink label. The single most urgent action (Daily Drop, Submit).
//   .mint         Money gradient, ink label. Cash out, claim earnings.
//   .destructive  Solid rose, on-rose label.
//   .ghost        No fill, accent label. Tertiary actions.

enum FlowdButtonVariant: CaseIterable, Hashable, Sendable {
    case primary
    case secondary
    case ember
    case mint
    case destructive
    case ghost
}

enum FlowdButtonSize: CaseIterable, Hashable, Sendable {
    case compact
    case regular
    case large

    /// Minimum control height. Never below the 44 pt hit target.
    var minHeight: CGFloat {
        switch self {
        case .compact: return FlowdLayout.hitTarget
        case .regular: return 50
        case .large: return 58
        }
    }

    var horizontalPadding: CGFloat {
        switch self {
        case .compact: return 16
        case .regular: return 22
        case .large: return 28
        }
    }

    var textStyle: FlowdTextStyle {
        switch self {
        case .compact: return FlowdFont.buttonCompact
        case .regular: return FlowdFont.button
        case .large: return FlowdFont.buttonLarge
        }
    }
}

/// `Button { } label: { Text("Claim a spot") }.buttonStyle(FlowdGlassButtonStyle(.primary))`.
/// Prefer `FlowdButton` for text buttons and `FlowdIconButton` for icon-only buttons; use the style directly for custom labels.
struct FlowdGlassButtonStyle: ButtonStyle {
    let variant: FlowdButtonVariant
    let size: FlowdButtonSize
    let fullWidth: Bool
    let isIconOnly: Bool
    let haptic: FlowdHapticKind?

    init(
        _ variant: FlowdButtonVariant = .secondary,
        size: FlowdButtonSize = .regular,
        fullWidth: Bool = false,
        isIconOnly: Bool = false,
        haptic: FlowdHapticKind? = nil
    ) {
        self.variant = variant
        self.size = size
        self.fullWidth = fullWidth
        self.isIconOnly = isIconOnly
        self.haptic = haptic
    }

    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        return FlowdGlassButtonBody(
            configuration: configuration,
            variant: variant,
            size: size,
            fullWidth: fullWidth,
            isIconOnly: isIconOnly,
            haptic: haptic
        )
    }
}

extension ButtonStyle where Self == FlowdGlassButtonStyle {
    /// `.buttonStyle(.flowdGlass(.primary))`
    static func flowdGlass(
        _ variant: FlowdButtonVariant = .secondary,
        size: FlowdButtonSize = .regular,
        fullWidth: Bool = false
    ) -> FlowdGlassButtonStyle {
        return FlowdGlassButtonStyle(variant, size: size, fullWidth: fullWidth)
    }
}

private struct FlowdGlassButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let variant: FlowdButtonVariant
    let size: FlowdButtonSize
    let fullWidth: Bool
    let isIconOnly: Bool
    let haptic: FlowdHapticKind?

    @Environment(\.isEnabled) private var isEnabled: Bool
    @Environment(\.flowdHapticsEnabled) private var hapticsEnabled: Bool
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(
        configuration: ButtonStyleConfiguration,
        variant: FlowdButtonVariant,
        size: FlowdButtonSize,
        fullWidth: Bool,
        isIconOnly: Bool,
        haptic: FlowdHapticKind?
    ) {
        self.configuration = configuration
        self.variant = variant
        self.size = size
        self.fullWidth = fullWidth
        self.isIconOnly = isIconOnly
        self.haptic = haptic
    }

    var body: some View {
        let pressed: Bool = configuration.isPressed
        let feedback: SensoryFeedback? = hapticsEnabled ? haptic?.sensoryFeedback : nil
        return shaped
            .scaleEffect(pressed && !appearance.reduceMotion ? pressScale : 1)
            .animation(appearance.animation(.tap), value: pressed)
            .opacity(isEnabled ? 1 : 0.45)
            .sensoryFeedback(trigger: pressed) { (_: Bool, isPressed: Bool) -> SensoryFeedback? in
                return isPressed ? feedback : nil
            }
    }

    private var pressScale: CGFloat {
        return variant == FlowdButtonVariant.secondary ? 0.97 : 0.96
    }

    @ViewBuilder
    private var shaped: some View {
        if isIconOnly {
            chrome(Circle())
        } else {
            chrome(Capsule(style: .continuous))
        }
    }

    // MARK: Chrome per variant

    @ViewBuilder
    private func chrome<S: InsettableShape>(_ shape: S) -> some View {
        switch variant {
        case .primary:
            gradientChrome(shape, fill: FlowdGradient.flowButton, label: FlowdColor.onAccent, glow: FlowdElevation.glowFlow)
        case .ember:
            gradientChrome(shape, fill: FlowdGradient.ember, label: FlowdColor.onEmber, glow: FlowdElevation.glowEmber)
        case .mint:
            gradientChrome(shape, fill: FlowdGradient.money, label: FlowdColor.onMint, glow: FlowdElevation.glowMint)
        case .secondary:
            styledLabel(foreground: FlowdColor.fg)
                .flowdGlass(.l2, interactive: true, in: shape)
                .contentShape(shape)
        case .destructive:
            styledLabel(foreground: FlowdColor.onRose)
                .background { shape.fill(FlowdColor.roseSolid) }
                .overlay { pressedVeil(shape) }
                .contentShape(shape)
        case .ghost:
            styledLabel(foreground: FlowdColor.accent)
                .background { shape.fill(configuration.isPressed ? FlowdColor.surfaceActive : Color.clear) }
                .contentShape(shape)
        }
    }

    private func gradientChrome<S: InsettableShape>(
        _ shape: S,
        fill: LinearGradient,
        label: Color,
        glow: Color
    ) -> some View {
        return styledLabel(foreground: label)
            .background { shape.fill(fill) }
            .overlay { shape.strokeBorder(specularRim, lineWidth: 1).allowsHitTesting(false) }
            .overlay { pressedVeil(shape) }
            .shadow(color: glow, radius: 12, x: 0, y: 6)
            .contentShape(shape)
    }

    private var specularRim: LinearGradient {
        return LinearGradient(
            colors: [FlowdPrimitive.white.opacity(0.55), FlowdPrimitive.white.opacity(0.06)],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private func pressedVeil<S: InsettableShape>(_ shape: S) -> some View {
        return shape
            .fill(Color.black.opacity(configuration.isPressed ? 0.14 : 0))
            .allowsHitTesting(false)
    }

    private func styledLabel(foreground: Color) -> some View {
        return configuration.label
            .flowdText(size.textStyle)
            .foregroundStyle(foreground)
            .multilineTextAlignment(.center)
            .padding(.horizontal, isIconOnly ? 0 : size.horizontalPadding)
            .padding(.vertical, isIconOnly ? 0 : 8)
            .frame(minWidth: isIconOnly ? size.minHeight : nil, minHeight: size.minHeight)
            .frame(maxWidth: fullWidth ? CGFloat.infinity : nil)
    }
}

// MARK: - Preview

#Preview("Button styles") {
    FlowdPreviewCanvas {
        VStack(spacing: FlowdSpacing.md) {
            ForEach(FlowdButtonVariant.allCases, id: \.self) { (variant: FlowdButtonVariant) in
                Button {
                } label: {
                    Text(String(describing: variant).capitalized)
                }
                .buttonStyle(FlowdGlassButtonStyle(variant, fullWidth: true, haptic: .tap))
            }
            Button {
            } label: {
                Text("Disabled")
            }
            .buttonStyle(FlowdGlassButtonStyle(.primary, fullWidth: true))
            .disabled(true)
        }
        .padding(FlowdSpacing.lg)
    }
}
