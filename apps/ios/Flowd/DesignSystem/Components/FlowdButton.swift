import SwiftUI

// FlowdButton: the text button. FlowdIconButton: the icon-only glass button (nav bars, toolbars, floating actions).
// Both sit on `FlowdGlassButtonStyle`, so glass, press feedback, Dynamic Type, Reduce Transparency and hit targets are handled.

/// Text button with an optional leading symbol, a second line (`subtitle`) and a loading state.
///
///     FlowdButton("Make a take", systemImage: "video.fill") { startStudio() }            // primary, the one hero action
///     FlowdButton("Cash out $240.00", subtitle: "Instant · $2.40 fee", variant: .mint, fullWidth: true) { cashOut() }
///     FlowdButton("Claim a spot", subtitle: "5 left", variant: .ember, size: .large) { claim() }
///     FlowdButton("Not now", variant: .ghost) { dismiss() }
struct FlowdButton: View {
    let title: String
    let subtitle: String?
    let systemImage: String?
    let variant: FlowdButtonVariant
    let size: FlowdButtonSize
    let isLoading: Bool
    let fullWidth: Bool
    let haptic: FlowdHapticKind?
    let action: () -> Void

    init(
        _ title: String,
        subtitle: String? = nil,
        systemImage: String? = nil,
        variant: FlowdButtonVariant = .primary,
        size: FlowdButtonSize = .regular,
        isLoading: Bool = false,
        fullWidth: Bool = false,
        haptic: FlowdHapticKind? = nil,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.subtitle = subtitle
        self.systemImage = systemImage
        self.variant = variant
        self.size = size
        self.isLoading = isLoading
        self.fullWidth = fullWidth
        self.haptic = haptic
        self.action = action
    }

    var body: some View {
        Button {
            if !isLoading {
                action()
            }
        } label: {
            label
        }
        .buttonStyle(
            FlowdGlassButtonStyle(variant, size: size, fullWidth: fullWidth, isIconOnly: false, haptic: resolvedHaptic)
        )
        .accessibilityLabel(accessibilityTitle)
        .accessibilityAddTraits(isLoading ? AccessibilityTraits.updatesFrequently : AccessibilityTraits())
    }

    private var resolvedHaptic: FlowdHapticKind? {
        if let haptic = haptic {
            return haptic
        }
        switch variant {
        case .primary, .ember, .mint, .destructive: return FlowdHapticKind.tap
        case .secondary, .ghost: return nil
        }
    }

    private var accessibilityTitle: String {
        var parts: [String] = [title]
        if let subtitle = subtitle {
            parts.append(subtitle)
        }
        if isLoading {
            parts.append("Loading")
        }
        return parts.joined(separator: ", ")
    }

    private var label: some View {
        HStack(spacing: FlowdSpacing.xs) {
            leadingGlyph
            VStack(spacing: 1) {
                Text(title)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                if let subtitle = subtitle {
                    Text(subtitle)
                        .flowdCaption(.caption1)
                        .opacity(0.82)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
            }
        }
    }

    @ViewBuilder
    private var leadingGlyph: some View {
        if isLoading {
            ProgressView()
                .progressViewStyle(.circular)
                .controlSize(.small)
                .tint(loadingTint)
        } else if let systemImage = systemImage {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .semibold))
                .accessibilityHidden(true)
        }
    }

    private var loadingTint: Color {
        switch variant {
        case .primary: return FlowdColor.onAccent
        case .ember: return FlowdColor.onEmber
        case .mint: return FlowdColor.onMint
        case .destructive: return FlowdColor.onRose
        case .secondary: return FlowdColor.fg
        case .ghost: return FlowdColor.accent
        }
    }
}

/// Icon-only glass button, always >= 44 x 44 with a mandatory accessibility label.
///
///     FlowdIconButton(systemImage: "chevron.left", label: "Back") { dismiss() }
///     FlowdIconButton(systemImage: "bell", label: "Inbox", badge: 3) { openInbox() }
struct FlowdIconButton: View {
    let systemImage: String
    let label: String
    let variant: FlowdButtonVariant
    let size: FlowdButtonSize
    let badge: Int?
    let action: () -> Void

    init(
        systemImage: String,
        label: String,
        variant: FlowdButtonVariant = .secondary,
        size: FlowdButtonSize = .compact,
        badge: Int? = nil,
        action: @escaping () -> Void
    ) {
        self.systemImage = systemImage
        self.label = label
        self.variant = variant
        self.size = size
        self.badge = badge
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: glyphSize, weight: .semibold))
        }
        .buttonStyle(FlowdGlassButtonStyle(variant, size: size, fullWidth: false, isIconOnly: true, haptic: nil))
        .overlay(alignment: .topTrailing) {
            if let badge = badge, badge > 0 {
                FlowdBadgeDot(count: badge)
                    .offset(x: 4, y: -4)
                    .allowsHitTesting(false)
            }
        }
        .accessibilityLabel(badgeLabel)
    }

    private var glyphSize: CGFloat {
        switch size {
        case .compact: return 17
        case .regular: return 19
        case .large: return 22
        }
    }

    private var badgeLabel: String {
        if let badge = badge, badge > 0 {
            return "\(label), \(badge) new"
        }
        return label
    }
}

/// Small count badge (tab bar, icon buttons). Accent fill with an on-accent numeral.
struct FlowdBadgeDot: View {
    let count: Int

    var body: some View {
        Text(count > 99 ? "99+" : String(count))
            .flowdCaption(.caption2)
            .foregroundStyle(FlowdColor.onAccent)
            .padding(.horizontal, 5)
            .frame(minWidth: 18, minHeight: 18)
            .background { Capsule(style: .continuous).fill(FlowdColor.accentSolid) }
            .overlay { Capsule(style: .continuous).strokeBorder(FlowdColor.bg, lineWidth: 1.5) }
            .accessibilityHidden(true)
    }
}

// MARK: - Preview

private struct ButtonPreview: View {
    @State private var loading: Bool = false

    var body: some View {
        FlowdPreviewCanvas {
            VStack(spacing: FlowdSpacing.md) {
                FlowdButton("Make a take", systemImage: "video.fill", fullWidth: true) {}
                FlowdButton("Claim a spot", subtitle: "5 left", variant: .ember, size: .large, fullWidth: true) {}
                FlowdButton("Cash out $240.00", subtitle: "Instant · $2.40 fee", variant: .mint, fullWidth: true) {}
                FlowdButton("Save draft", systemImage: "tray.and.arrow.down", variant: .secondary, fullWidth: true) {}
                FlowdButton(loading ? "Submitting" : "Submit for review", isLoading: loading, fullWidth: true) {
                    loading = true
                }
                FlowdButton("Remove post", variant: .destructive, size: .compact) {}
                FlowdButton("Not now", variant: .ghost) {}
                HStack(spacing: FlowdSpacing.sm) {
                    FlowdIconButton(systemImage: "chevron.left", label: "Back") {}
                    FlowdIconButton(systemImage: "bell", label: "Inbox", badge: 3) {}
                    FlowdIconButton(systemImage: "plus", label: "New", variant: .primary) {}
                    FlowdIconButton(systemImage: "bolt.fill", label: "Daily Drop", variant: .ember) {}
                }
            }
            .padding(FlowdSpacing.lg)
        }
    }
}

#Preview("Buttons") {
    ButtonPreview()
}
