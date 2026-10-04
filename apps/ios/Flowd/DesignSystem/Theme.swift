import SwiftUI

// MARK: - Preference keys

/// Keys for the three in-app appearance preferences. Settings writes them with `@AppStorage`
/// (for example `@AppStorage(FlowdPreferenceKey.reduceGlass) private var reduceGlass = false`);
/// `flowdRoot()` reads them once at the root and publishes them to the whole tree.
enum FlowdPreferenceKey {
    static let reduceGlass: String = "flowd.pref.reduceGlass"
    static let hapticsEnabled: String = "flowd.pref.hapticsEnabled"
    static let theme: String = "flowd.pref.theme"
}

// MARK: - Theme preference

/// In-app colour scheme choice. `.system` follows iOS (Info.plist is `Automatic`).
enum FlowdThemePreference: String, CaseIterable, Identifiable, Sendable {
    case system
    case dark
    case light

    var id: String { return rawValue }

    var title: String {
        switch self {
        case .system: return "System"
        case .dark: return "Dark"
        case .light: return "Light"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .dark: return ColorScheme.dark
        case .light: return ColorScheme.light
        }
    }
}

// MARK: - Environment keys

private struct FlowdReduceGlassKey: EnvironmentKey {
    static let defaultValue: Bool = false
}

private struct FlowdHapticsEnabledKey: EnvironmentKey {
    static let defaultValue: Bool = true
}

private struct FlowdNowKey: EnvironmentKey {
    static let defaultValue: @Sendable () -> Date = { Date() }
}

extension EnvironmentValues {
    /// The in-app "Reduce glass" switch. Combined with the system setting inside `FlowdAppearance.reduceGlass`.
    var flowdReduceGlass: Bool {
        get { return self[FlowdReduceGlassKey.self] }
        set { self[FlowdReduceGlassKey.self] = newValue }
    }

    /// The in-app haptics switch (Wellbeing Mode, Settings).
    var flowdHapticsEnabled: Bool {
        get { return self[FlowdHapticsEnabledKey.self] }
        set { self[FlowdHapticsEnabledKey.self] = newValue }
    }

    /// The clock the design system reads for countdowns. Override to pin the demo world's "now".
    var flowdNow: @Sendable () -> Date {
        get { return self[FlowdNowKey.self] }
        set { self[FlowdNowKey.self] = newValue }
    }
}

// MARK: - Appearance (reads every accessibility setting in one place)

/// Declare once per view: `private var appearance = FlowdAppearance()`.
/// It re-evaluates the view whenever colour scheme, Reduce Transparency, Reduce Motion, Increase Contrast,
/// Differentiate Without Color or the in-app "Reduce glass" switch changes.
struct FlowdAppearance: DynamicProperty {
    @Environment(\.colorScheme) private var colorScheme: ColorScheme
    @Environment(\.accessibilityReduceTransparency) private var systemReduceTransparency: Bool
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion: Bool
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast: ColorSchemeContrast
    @Environment(\.accessibilityDifferentiateWithoutColor) private var systemDifferentiate: Bool
    @Environment(\.flowdReduceGlass) private var inAppReduceGlass: Bool

    init() {}

    var isDark: Bool { return colorScheme == ColorScheme.dark }

    /// True when glass must become solid, opaque, tinted surfaces (system Reduce Transparency or the in-app switch).
    var reduceGlass: Bool { return systemReduceTransparency || inAppReduceGlass }

    /// True when springs, drift, sheen and parallax must be replaced by short fades.
    var reduceMotion: Bool { return systemReduceMotion }

    /// True when Increase Contrast is on: thicker rims, near-solid fills.
    var increasedContrast: Bool { return colorSchemeContrast == ColorSchemeContrast.increased }

    /// True when state must also be carried by shape or glyph (it always should be; this lets you add extra cues).
    var differentiateWithoutColor: Bool { return systemDifferentiate }

    /// Rim width: 1 pt normally, 1.5 pt with Increase Contrast.
    var rimWidth: CGFloat { return increasedContrast ? 1.5 : 1 }

    /// The spring (or, under Reduce Motion, a 150 ms fade) to use for a change.
    func animation(_ spring: FlowdSpring) -> Animation {
        return spring.resolved(reduceMotion: reduceMotion)
    }
}

// MARK: - Tone (semantic colour roles)

/// Semantic colour role. Maps to the AA-safe text colour (`ink`), the fill (`solid`) with its label colour (`onSolid`),
/// and the tinted background (`soft`). One colour, one meaning: accent = interactive, mint = money earned,
/// info = pending, ember = urgency, sun = featured / Elite, rose = danger, violet = Flo.
enum FlowdTone: CaseIterable, Hashable, Sendable {
    case neutral
    case accent
    case violet
    case mint
    case ember
    case sun
    case rose
    case info

    /// Readable text / icon colour on any surface (AA-verified in the token build).
    var ink: Color {
        switch self {
        case .neutral: return FlowdColor.fg
        case .accent: return FlowdColor.accent
        case .violet: return FlowdColor.violet
        case .mint: return FlowdColor.mint
        case .ember: return FlowdColor.ember
        case .sun: return FlowdColor.sun
        case .rose: return FlowdColor.rose
        case .info: return FlowdColor.info
        }
    }

    /// Solid fill. Pair with `onSolid` for the label.
    var solid: Color {
        switch self {
        case .neutral: return FlowdColor.fg
        case .accent: return FlowdColor.accentSolid
        case .violet: return FlowdColor.violetSolid
        case .mint: return FlowdColor.mintSolid
        case .ember: return FlowdColor.emberSolid
        case .sun: return FlowdColor.sunSolid
        case .rose: return FlowdColor.roseSolid
        case .info: return FlowdColor.infoSolid
        }
    }

    /// Label colour on `solid`.
    var onSolid: Color {
        switch self {
        case .neutral: return FlowdColor.fgInverse
        case .accent: return FlowdColor.onAccent
        case .violet: return FlowdColor.onViolet
        case .mint: return FlowdColor.onMint
        case .ember: return FlowdColor.onEmber
        case .sun: return FlowdColor.onSun
        case .rose: return FlowdColor.onRose
        case .info: return FlowdColor.onInfo
        }
    }

    /// Tinted pill / selected background.
    var soft: Color {
        switch self {
        case .neutral: return FlowdColor.surfaceField
        case .accent: return FlowdColor.accentSoft
        case .violet: return FlowdColor.violetSoft
        case .mint: return FlowdColor.mintSoft
        case .ember: return FlowdColor.emberSoft
        case .sun: return FlowdColor.sunSoft
        case .rose: return FlowdColor.roseSoft
        case .info: return FlowdColor.infoSoft
        }
    }

    /// Brand gradient for fills (progress, buttons, hero accents). `nil` for tones that have no gradient.
    var gradient: LinearGradient? {
        switch self {
        case .accent: return FlowdGradient.flowButton
        case .violet: return FlowdGradient.flo
        case .mint: return FlowdGradient.money
        case .ember: return FlowdGradient.ember
        case .sun: return FlowdGradient.sun
        case .neutral, .rose, .info: return nil
        }
    }

    /// Decorative glow colour (never the only cue).
    var glow: Color {
        switch self {
        case .neutral: return FlowdElevation.glowFlow
        case .accent: return FlowdElevation.glowFlow
        case .violet: return FlowdElevation.glowViolet
        case .mint: return FlowdElevation.glowMint
        case .ember: return FlowdElevation.glowEmber
        case .sun: return FlowdElevation.glowSun
        case .rose: return FlowdElevation.glowEmber
        case .info: return FlowdElevation.glowFlow
        }
    }
}

// MARK: - Root modifier

/// Applied once at the root of the app (`RootView`). Reads the three in-app preferences, publishes them to the
/// environment, applies the colour scheme preference and the accent tint, and syncs the imperative haptics switch.
struct FlowdRootModifier: ViewModifier {
    @AppStorage(FlowdPreferenceKey.reduceGlass) private var reduceGlass: Bool = false
    @AppStorage(FlowdPreferenceKey.hapticsEnabled) private var hapticsEnabled: Bool = true
    @AppStorage(FlowdPreferenceKey.theme) private var themeRaw: String = FlowdThemePreference.system.rawValue

    func body(content: Content) -> some View {
        let theme: FlowdThemePreference = FlowdThemePreference(rawValue: themeRaw) ?? FlowdThemePreference.system
        return content
            .environment(\.flowdReduceGlass, reduceGlass)
            .environment(\.flowdHapticsEnabled, hapticsEnabled)
            .preferredColorScheme(theme.colorScheme)
            .tint(FlowdColor.accentBright)
            .onAppear {
                FlowdHaptics.isEnabled = hapticsEnabled
            }
            .onChange(of: hapticsEnabled) { _, newValue in
                FlowdHaptics.isEnabled = newValue
            }
    }
}

extension View {
    /// Apply once at the app root. Wires "Reduce glass", haptics and theme preferences, the accent tint,
    /// and the default toast host is added separately with `flowdToastHost()`.
    func flowdRoot() -> some View {
        return modifier(FlowdRootModifier())
    }

    /// Pin the clock the design system uses for countdowns (demo world "now", previews, tests).
    func flowdClock(_ now: @escaping @Sendable () -> Date) -> some View {
        return environment(\.flowdNow, now)
    }

    /// Force the in-app "Reduce glass" mode for a subtree (previews, tests).
    func flowdReduceGlass(_ enabled: Bool) -> some View {
        return environment(\.flowdReduceGlass, enabled)
    }
}

// MARK: - Preview

private struct ThemePreview: View {
    private var appearance: FlowdAppearance = FlowdAppearance()

    var body: some View {
        FlowdPreviewCanvas {
            VStack(alignment: .leading, spacing: FlowdSpacing.md) {
                Text("Tones").flowdDisplay(.title2).flowdInk(.primary)
                VStack(spacing: FlowdSpacing.xs) {
                    ForEach(FlowdTone.allCases, id: \.self) { (tone: FlowdTone) in
                        toneRow(tone)
                    }
                }
                .padding(FlowdSpacing.md)
                .flowdSurface()
                Text("Appearance").flowdDisplay(.title2).flowdInk(.primary)
                VStack(alignment: .leading, spacing: FlowdSpacing.xxs) {
                    Text("dark: " + String(appearance.isDark))
                    Text("reduce glass: " + String(appearance.reduceGlass))
                    Text("reduce motion: " + String(appearance.reduceMotion))
                    Text("increased contrast: " + String(appearance.increasedContrast))
                    Text("differentiate without colour: " + String(appearance.differentiateWithoutColor))
                }
                .flowdCaption(.code)
                .flowdInk(.muted)
                .padding(FlowdSpacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .flowdSurface()
            }
            .padding(FlowdSpacing.lg)
        }
    }

    private func toneRow(_ tone: FlowdTone) -> some View {
        HStack(spacing: FlowdSpacing.sm) {
            Text(String(describing: tone).capitalized)
                .flowdBody(.subheadline)
                .foregroundStyle(tone.ink)
                .frame(width: 84, alignment: .leading)
            Text("Solid")
                .flowdCaption(.caption1)
                .foregroundStyle(tone.onSolid)
                .padding(.horizontal, FlowdSpacing.sm)
                .frame(minHeight: 28)
                .background { Capsule(style: .continuous).fill(tone.solid) }
            Text("Soft")
                .flowdCaption(.caption1)
                .foregroundStyle(tone.ink)
                .padding(.horizontal, FlowdSpacing.sm)
                .frame(minHeight: 28)
                .background { Capsule(style: .continuous).fill(tone.soft) }
            Spacer(minLength: 0)
        }
    }
}

#Preview("Tones and appearance") {
    ThemePreview()
}

#Preview("Tones, Reduce glass") {
    ThemePreview()
        .flowdReduceGlass(true)
}
