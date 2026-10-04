import SwiftUI

// Numbers are heroes. Money is integer cents everywhere in data and formatted only here, at the edge: tabular SF Pro Rounded,
// animated with a numeric roll when it changes, Mint when it is earned and up, Lagoon with a clock when pending, Rose with a minus
// when it is down. Colour is never the only cue: every state also carries a glyph. Pending and cleared are always separate numbers.

// MARK: - State

/// Where a dollar is. Drives colour, glyph and the spoken label.
enum FlowdMoneyState: String, CaseIterable, Hashable, Sendable {
    /// Earned and cleared. Mint, check.
    case cleared
    /// Earned, on the clock. Lagoon (info), clock. Always show the clear date beside it.
    case pending
    /// Left the Wallet for the bank. Neutral ink.
    case paid
    /// Held in escrow (brand money). Neutral ink, lock.
    case escrowed
    /// Down, refunded or clawed back. Rose, minus sign.
    case down
    /// CPA bonus. Mint, plus.
    case bonus
    /// Plain figure with no money meaning.
    case neutral

    var tone: FlowdTone {
        switch self {
        case .cleared, .bonus: return FlowdTone.mint
        case .pending: return FlowdTone.info
        case .down: return FlowdTone.rose
        case .paid, .escrowed, .neutral: return FlowdTone.neutral
        }
    }

    var systemImage: String? {
        switch self {
        case .cleared: return "checkmark.circle.fill"
        case .pending: return "clock.fill"
        case .paid: return "building.columns.fill"
        case .escrowed: return "lock.fill"
        case .down: return "minus.circle.fill"
        case .bonus: return "plus.circle.fill"
        case .neutral: return nil
        }
    }

    /// Spoken prefix for VoiceOver ("Cleared $62.40").
    var label: String {
        switch self {
        case .cleared: return "Cleared"
        case .pending: return "Pending"
        case .paid: return "Paid out"
        case .escrowed: return "In escrow"
        case .down: return "Down"
        case .bonus: return "Bonus"
        case .neutral: return ""
        }
    }
}

// MARK: - Formatting (the edge)

/// Money formatting. USD only for v1. Pure, locale-independent, thread-safe.
enum FlowdMoneyFormat {
    /// `$1,284.60`, `-$12.00` (with a true minus sign), `+$1.50`.
    static func string(cents: Int, showsCents: Bool = true, signed: Bool = false) -> String {
        let negative: Bool = cents < 0
        let magnitude: Int = cents == Int.min ? Int.max : abs(cents)
        var dollars: Int = magnitude / 100
        let remainder: Int = magnitude % 100
        if !showsCents && remainder >= 50 {
            dollars += 1
        }
        var body: String = "$" + FlowdNumberFormat.grouped(dollars)
        if showsCents {
            body += "." + (remainder < 10 ? "0" : "") + String(remainder)
        }
        if negative {
            return "\u{2212}" + body
        }
        if signed && cents > 0 {
            return "+" + body
        }
        return body
    }

    /// `$1.2K`, `$4.8M`, `$62`. For chart axes and dense tiles.
    static func compact(cents: Int) -> String {
        let negative: Bool = cents < 0
        let dollars: Double = Double(cents == Int.min ? Int.max : abs(cents)) / 100
        let text: String = "$" + FlowdNumberFormat.compact(dollars)
        return negative ? "\u{2212}" + text : text
    }

    /// A per-1,000-views rate: `$2.40 per 1,000 views`. Rates are cents per 1,000 verified views (CPM).
    static func rate(cpmCents: Int) -> String {
        return string(cents: cpmCents) + " per 1,000 views"
    }

    /// Short rate for tight spaces: `$2.40 / 1k`.
    static func rateShort(cpmCents: Int) -> String {
        return string(cents: cpmCents) + " / 1k"
    }
}

/// Number formatting for counts and percentages. Pure and locale-independent (en-US conventions).
enum FlowdNumberFormat {
    /// `1,284,600`
    static func grouped(_ value: Int) -> String {
        let negative: Bool = value < 0
        let magnitude: Int = value == Int.min ? Int.max : abs(value)
        let digits: [Character] = Array(String(magnitude))
        var reversed: [Character] = []
        var counter: Int = 0
        for character in digits.reversed() {
            if counter > 0 && counter % 3 == 0 {
                reversed.append(",")
            }
            reversed.append(character)
            counter += 1
        }
        let text: String = String(reversed.reversed())
        return negative ? "\u{2212}" + text : text
    }

    /// `999`, `1.2K`, `4.8M`, `1.1B`.
    static func compact(_ value: Double) -> String {
        let negative: Bool = value < 0
        let magnitude: Double = abs(value)
        var text: String
        if magnitude >= 1_000_000_000 {
            text = trimmed(magnitude / 1_000_000_000) + "B"
        } else if magnitude >= 1_000_000 {
            text = trimmed(magnitude / 1_000_000) + "M"
        } else if magnitude >= 1_000 {
            text = trimmed(magnitude / 1_000) + "K"
        } else {
            text = trimmed(magnitude)
        }
        if negative {
            text = "\u{2212}" + text
        }
        return text
    }

    /// `0.184` becomes `18.4%`; `0.5` becomes `50%`.
    static func percent(_ fraction: Double, fractionDigits: Int = 0) -> String {
        let scaled: Double = fraction * 100
        if fractionDigits <= 0 {
            return String(Int(scaled.rounded())) + "%"
        }
        return trimmed(scaled, digits: fractionDigits) + "%"
    }

    private static func trimmed(_ value: Double, digits: Int = 1) -> String {
        var factor: Double = 1
        var step: Int = 0
        while step < digits {
            factor *= 10
            step += 1
        }
        let rounded: Double = (value * factor).rounded() / factor
        if rounded == rounded.rounded() {
            return String(Int(rounded))
        }
        return String(rounded)
    }
}

// MARK: - MoneyText

/// Animated money figure.
///
///     MoneyText(cents: 128460, style: FlowdFont.figureXL, state: .cleared)                  // $1,284.60 in Mint with a check
///     MoneyText(cents: 18620, style: FlowdFont.figureMd, state: .pending)                   // $186.20 in Lagoon with a clock
///     MoneyText(cents: 24000, style: FlowdFont.figureHero, state: .cleared, countsUpOnAppear: true)   // payout hero
///
/// When `cents` changes the digits roll (numeric text transition on a smooth spring; a short fade under Reduce Motion).
/// `.down` always renders a minus sign. Pass `signed: true` for `+$1.50` style bonuses.
struct MoneyText: View {
    let cents: Int
    let style: FlowdTextStyle
    let state: FlowdMoneyState
    let showsCents: Bool
    let signed: Bool
    let showsGlyph: Bool
    let countsUpOnAppear: Bool
    let animates: Bool

    @State private var displayed: Int
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(
        cents: Int,
        style: FlowdTextStyle = FlowdFont.figureLg,
        state: FlowdMoneyState = .neutral,
        showsCents: Bool = true,
        signed: Bool = false,
        showsGlyph: Bool = true,
        countsUpOnAppear: Bool = false,
        animates: Bool = true
    ) {
        self.cents = cents
        self.style = style
        self.state = state
        self.showsCents = showsCents
        self.signed = signed
        self.showsGlyph = showsGlyph
        self.countsUpOnAppear = countsUpOnAppear
        self.animates = animates
        self._displayed = State(initialValue: countsUpOnAppear ? 0 : cents)
    }

    var body: some View {
        HStack(spacing: glyphSpacing) {
            if showsGlyph, let symbol = state.systemImage {
                Image(systemName: symbol)
                    .flowdText(glyphStyle)
                    .foregroundStyle(state.tone.ink)
                    .accessibilityHidden(true)
            }
            Text(formatted)
                .flowdText(style)
                .foregroundStyle(state.tone.ink)
                .contentTransition(.numericText(value: Double(displayed)))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
        .animation(animates ? appearance.animation(.smooth) : nil, value: displayed)
        .onAppear {
            if countsUpOnAppear && displayed != cents {
                withAnimation(appearance.animation(.gentle)) {
                    displayed = cents
                }
            }
        }
        .onChange(of: cents) { _, newValue in
            displayed = newValue
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenText)
    }

    private var shownCents: Int {
        return state == FlowdMoneyState.down ? -abs(displayed) : displayed
    }

    private var formatted: String {
        let showSign: Bool = signed || state == FlowdMoneyState.bonus
        return FlowdMoneyFormat.string(cents: shownCents, showsCents: showsCents, signed: showSign)
    }

    private var spokenText: String {
        let amount: String = FlowdMoneyFormat.string(
            cents: state == FlowdMoneyState.down ? -abs(cents) : cents,
            showsCents: showsCents,
            signed: signed || state == FlowdMoneyState.bonus
        )
        if state.label.isEmpty {
            return amount
        }
        return state.label + " " + amount
    }

    /// A smaller glyph beside big figures so a 64 pt hero is not shouted by a 64 pt clock.
    private var glyphStyle: FlowdTextStyle {
        return style.size >= 40 ? FlowdFont.title3 : style
    }

    private var glyphSpacing: CGFloat {
        return style.size >= 40 ? FlowdSpacing.xs : FlowdSpacing.xxs
    }
}

// MARK: - Earnings pair

/// Cleared and pending, always as two separate numbers. The standard Home / Wallet hero.
///
///     FlowdEarningsPair(clearedCents: 128460, pendingCents: 18620, pendingNote: "clears Sat 2:00 PM")
struct FlowdEarningsPair: View {
    let clearedCents: Int
    let pendingCents: Int
    let pendingNote: String?
    let heroStyle: FlowdTextStyle
    let countsUpOnAppear: Bool

    init(
        clearedCents: Int,
        pendingCents: Int,
        pendingNote: String? = nil,
        heroStyle: FlowdTextStyle = FlowdFont.figureXL,
        countsUpOnAppear: Bool = false
    ) {
        self.clearedCents = clearedCents
        self.pendingCents = pendingCents
        self.pendingNote = pendingNote
        self.heroStyle = heroStyle
        self.countsUpOnAppear = countsUpOnAppear
    }

    var body: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.xxs) {
            Text("Cleared")
                .flowdCaption(.overline)
                .foregroundStyle(FlowdColor.fgSubtle)
                .accessibilityHidden(true)
            MoneyText(cents: clearedCents, style: heroStyle, state: .cleared, countsUpOnAppear: countsUpOnAppear)
            HStack(spacing: FlowdSpacing.xs) {
                MoneyText(cents: pendingCents, style: FlowdFont.figureSm, state: .pending)
                if let note = pendingNote {
                    Text(note)
                        .flowdCaption(.footnote)
                        .foregroundStyle(FlowdColor.fgMuted)
                        .lineLimit(1)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Preview

private struct MoneyPreview: View {
    @State private var cents: Int = 128460

    var body: some View {
        FlowdPreviewCanvas {
            VStack(alignment: .leading, spacing: FlowdSpacing.lg) {
                FlowdCard {
                    FlowdEarningsPair(clearedCents: cents, pendingCents: 18620, pendingNote: "clears Sat 2:00 PM")
                }
                FlowdCard {
                    VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                        MoneyText(cents: 6240, state: .cleared)
                        MoneyText(cents: 18620, state: .pending)
                        MoneyText(cents: 500000, state: .escrowed, showsCents: false)
                        MoneyText(cents: 1200, state: .down)
                        MoneyText(cents: 150, state: .bonus)
                        MoneyText(cents: 24000, state: .paid)
                        Text(FlowdMoneyFormat.rate(cpmCents: 240)).flowdBody(.subheadline).flowdInk(.muted)
                        Text(FlowdMoneyFormat.compact(cents: 1_284_600)).flowdFigure(.md).flowdInk(.primary)
                    }
                }
                FlowdButton("Add $24.10", variant: .secondary) {
                    cents += 2410
                }
            }
            .padding(FlowdSpacing.lg)
        }
    }
}

#Preview("Money") {
    MoneyPreview()
}
