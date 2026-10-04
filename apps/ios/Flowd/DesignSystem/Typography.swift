import SwiftUI

// Typography is generated in Tokens.swift (`FlowdFont`, `FlowdTextStyle`, `.flowdText(_:)`): SF Pro Rounded for display and every
// number, SF Pro for text, SF Mono for code, all Dynamic Type safe through `ScaledMetric`. This file adds the four role modifiers
// feature code should reach for, plus a few extra button sizes and an ink (text colour) vocabulary.

// MARK: - Extra styles built from the same recipe

extension FlowdFont {
    /// Large button label (58 pt controls).
    static let buttonLarge: FlowdTextStyle = FlowdTextStyle(
        size: 18, weight: .semibold, design: .rounded, relativeTo: .body,
        trackingPt: 0, lineHeight: 1.2, uppercase: false, monospacedDigit: false, fixed: false
    )

    /// Compact button label (44 pt controls, pills).
    static let buttonCompact: FlowdTextStyle = FlowdTextStyle(
        size: 15, weight: .semibold, design: .rounded, relativeTo: .subheadline,
        trackingPt: 0, lineHeight: 1.2, uppercase: false, monospacedDigit: false, fixed: false
    )

    /// Small tabular figure for dense columns (ledger rows, chart tooltips).
    static let figureXS: FlowdTextStyle = FlowdTextStyle(
        size: 13, weight: .semibold, design: .rounded, relativeTo: .footnote,
        trackingPt: 0, lineHeight: 1.3, uppercase: false, monospacedDigit: true, fixed: false
    )

    /// Tab bar label. Medium weight on glass (one step up from regular).
    static let tabLabel: FlowdTextStyle = FlowdTextStyle(
        size: 11, weight: .semibold, design: .default, relativeTo: .caption2,
        trackingPt: 0.1, lineHeight: 1.2, uppercase: false, monospacedDigit: false, fixed: false
    )
}

// MARK: - Role vocabularies

/// Display type: titles, hero words. SF Pro Rounded, tight tracking, scales with Dynamic Type except `.hero`.
enum FlowdDisplayStyle: CaseIterable, Sendable {
    case hero
    case largeTitle
    case title1
    case title2
    case title3

    var style: FlowdTextStyle {
        switch self {
        case .hero: return FlowdFont.hero
        case .largeTitle: return FlowdFont.largeTitle
        case .title1: return FlowdFont.title1
        case .title2: return FlowdFont.title2
        case .title3: return FlowdFont.title3
        }
    }
}

/// Figure type: money and counts. SF Pro Rounded with tabular digits so values never jitter.
enum FlowdFigureStyle: CaseIterable, Sendable {
    case hero
    case xl
    case lg
    case md
    case sm
    case xs

    var style: FlowdTextStyle {
        switch self {
        case .hero: return FlowdFont.figureHero
        case .xl: return FlowdFont.figureXL
        case .lg: return FlowdFont.figureLg
        case .md: return FlowdFont.figureMd
        case .sm: return FlowdFont.figureSm
        case .xs: return FlowdFont.figureXS
        }
    }
}

/// Body type: reading text and UI labels. SF Pro.
enum FlowdBodyStyle: CaseIterable, Sendable {
    case headline
    case body
    case callout
    case subheadline
    case button

    var style: FlowdTextStyle {
        switch self {
        case .headline: return FlowdFont.headline
        case .body: return FlowdFont.body
        case .callout: return FlowdFont.callout
        case .subheadline: return FlowdFont.subheadline
        case .button: return FlowdFont.button
        }
    }
}

/// Caption type: metadata, helper text, overlines, code and IDs.
enum FlowdCaptionStyle: CaseIterable, Sendable {
    case footnote
    case caption1
    case caption2
    case overline
    case code

    var style: FlowdTextStyle {
        switch self {
        case .footnote: return FlowdFont.footnote
        case .caption1: return FlowdFont.caption1
        case .caption2: return FlowdFont.caption2
        case .overline: return FlowdFont.overline
        case .code: return FlowdFont.code
        }
    }
}

/// Text colour vocabulary. All values are AA-safe on every surface and on glass; never use `disabled` for readable text.
enum FlowdInk: Hashable, Sendable {
    case primary
    case muted
    case subtle
    case disabled
    case inverse
    case tone(FlowdTone)

    var color: Color {
        switch self {
        case .primary: return FlowdColor.fg
        case .muted: return FlowdColor.fgMuted
        case .subtle: return FlowdColor.fgSubtle
        case .disabled: return FlowdColor.fgDisabled
        case .inverse: return FlowdColor.fgInverse
        case .tone(let tone): return tone.ink
        }
    }
}

// MARK: - Modifiers

extension View {
    /// Titles and hero words. `Text("Wallet").flowdDisplay(.title1)`
    func flowdDisplay(_ style: FlowdDisplayStyle = .title1) -> some View {
        return flowdText(style.style)
    }

    /// Money and counts, tabular digits. `Text("$1,284.60").flowdFigure(.xl)`. Use `MoneyText` for animated money.
    func flowdFigure(_ style: FlowdFigureStyle = .lg) -> some View {
        return flowdText(style.style)
    }

    /// Reading text and UI labels. `Text(brief).flowdBody(.callout)`
    func flowdBody(_ style: FlowdBodyStyle = .body) -> some View {
        return flowdText(style.style)
    }

    /// Metadata, helper text, overlines. `Text("Decides by Fri 2 PM").flowdCaption(.footnote)`
    func flowdCaption(_ style: FlowdCaptionStyle = .caption1) -> some View {
        return flowdText(style.style)
    }

    /// Text colour from the ink vocabulary. `.flowdInk(.muted)`, `.flowdInk(.tone(.mint))`
    func flowdInk(_ ink: FlowdInk) -> some View {
        return foregroundStyle(ink.color)
    }

    /// Cap Dynamic Type where a layout cannot reflow (tab bar, hero figures). Default caps at the first accessibility size.
    func flowdDynamicTypeCap(_ maxSize: DynamicTypeSize = .accessibility1) -> some View {
        return dynamicTypeSize(...maxSize)
    }
}

// MARK: - Preview

#Preview("Typography") {
    FlowdPreviewCanvas {
        VStack(alignment: .leading, spacing: FlowdSpacing.md) {
            Text("Money follows what works.").flowdDisplay(.largeTitle).flowdInk(.primary)
            Text("Wallet").flowdDisplay(.title1).flowdInk(.primary)
            Text("$1,284.60").flowdFigure(.xl).flowdInk(.tone(.mint))
            Text("Pending $186.20 clears Fri 2:00 PM").flowdBody(.callout).flowdInk(.muted)
            Text("Checklist score. It gets smarter as bounties settle.").flowdCaption(.footnote).flowdInk(.subtle)
            Text("Daily Drop").flowdCaption(.overline).flowdInk(.tone(.ember))
            Text("bnty_8f2c1a").flowdCaption(.code).flowdInk(.muted)
        }
        .padding(FlowdSpacing.lg)
    }
}
