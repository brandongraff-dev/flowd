import SwiftUI

// StatTile: one number, named, with a signed change against a NAMED period and an optional 12-point sparkline. The standard tile for
// Home, Earnings, Profile and the stats strip on a bounty. Numbers are heroes: tabular rounded figures that roll when they change.
// Colour follows the audience (DECISIONS 5): creators see Mint for earned money and up, Rose for down; brand surfaces use neutral
// ink and arrows only (`.neutral`). The delta always carries an arrow glyph and a word, so colour is never the only cue.

// MARK: - Delta

/// A change against a named comparison period. `FlowdDelta(0.38, vs: "Aug")` reads "+38% vs Aug".
struct FlowdDelta: Hashable, Sendable {
    enum Direction: Hashable, Sendable {
        case up
        case down
        case flat
    }

    /// 0.38 means +38 percent. Negative is down.
    let fraction: Double
    /// Always name the period: "vs Aug", "vs last 7 days". A bare percentage is not allowed.
    let comparedTo: String

    init(_ fraction: Double, vs comparedTo: String) {
        self.fraction = fraction
        self.comparedTo = comparedTo
    }

    var direction: Direction {
        if abs(fraction) < 0.0005 {
            return Direction.flat
        }
        return fraction > 0 ? Direction.up : Direction.down
    }

    /// `+38%`, `+4.2%`, `\u{2212}12%`, `0%`.
    var text: String {
        let magnitude: Double = abs(fraction)
        let digits: Int = magnitude < 0.1 ? 1 : 0
        let body: String = FlowdNumberFormat.percent(magnitude, fractionDigits: digits)
        switch direction {
        case .up: return "+" + body
        case .down: return "\u{2212}" + body
        case .flat: return "0%"
        }
    }

    var systemImage: String {
        switch direction {
        case .up: return "arrow.up.right"
        case .down: return "arrow.down.right"
        case .flat: return "minus"
        }
    }

    /// "Up 38 percent versus Aug" for VoiceOver.
    var spoken: String {
        let magnitude: Double = abs(fraction)
        let percent: String = FlowdNumberFormat.percent(magnitude, fractionDigits: magnitude < 0.1 ? 1 : 0)
        switch direction {
        case .up: return "Up " + percent + " versus " + comparedTo
        case .down: return "Down " + percent + " versus " + comparedTo
        case .flat: return "Unchanged versus " + comparedTo
        }
    }
}

/// How a delta is coloured.
enum FlowdDeltaStyle: CaseIterable, Hashable, Sendable {
    /// Creator surfaces: up is Mint, down is Rose.
    case creator
    /// Brand and neutral surfaces: ink and arrows only.
    case neutral
}

// MARK: - Value

/// What the tile shows. Money goes through `MoneyText` (animated, state-coloured); everything else through a rolling tabular figure.
enum FlowdStatValue: Hashable, Sendable {
    case money(cents: Int, state: FlowdMoneyState)
    case count(Int)
    /// `4.2M`, `1.1K`
    case compact(Double)
    /// 0.184 becomes `18.4%`
    case percent(Double)
    case text(String)

    /// The formatted string the tile shows.
    var displayText: String {
        switch self {
        case .money(let cents, _): return FlowdMoneyFormat.string(cents: cents)
        case .count(let number): return FlowdNumberFormat.grouped(number)
        case .compact(let number): return FlowdNumberFormat.compact(number)
        case .percent(let fraction): return FlowdNumberFormat.percent(fraction, fractionDigits: 1)
        case .text(let string): return string
        }
    }

    var numeric: Double {
        switch self {
        case .money(let cents, _): return Double(cents)
        case .count(let number): return Double(number)
        case .compact(let number): return number
        case .percent(let fraction): return fraction
        case .text: return 0
        }
    }
}

// MARK: - Tile

/// A statistic tile.
///
///     StatTile("Cleared this month", value: .money(cents: 128460, state: .cleared), delta: FlowdDelta(0.38, vs: "Aug"), sparkline: [..12 values..])
///     StatTile("Posts", value: .count(62), systemImage: "play.rectangle.fill")
///     StatTile("Cost per trial", value: .money(cents: 640, state: .neutral), delta: FlowdDelta(-0.07, vs: "last 30 days"), deltaStyle: .neutral)
///
/// Two across: `LazyVGrid(columns: FlowdGridColumns.two, spacing: FlowdSpacing.sm) { StatTile(...); StatTile(...) }`.
struct StatTile: View {
    let title: String
    let value: FlowdStatValue
    let delta: FlowdDelta?
    let deltaStyle: FlowdDeltaStyle
    let sparkline: [Double]
    let systemImage: String?
    let valueStyle: FlowdTextStyle
    let chartTone: FlowdChartTone

    init(
        _ title: String,
        value: FlowdStatValue,
        delta: FlowdDelta? = nil,
        deltaStyle: FlowdDeltaStyle = .creator,
        sparkline: [Double] = [],
        systemImage: String? = nil,
        valueStyle: FlowdTextStyle = FlowdFont.figureLg,
        chartTone: FlowdChartTone = .azure
    ) {
        self.title = title
        self.value = value
        self.delta = delta
        self.deltaStyle = deltaStyle
        self.sparkline = sparkline
        self.systemImage = systemImage
        self.valueStyle = valueStyle
        self.chartTone = chartTone
    }

    var body: some View {
        FlowdCard(padding: FlowdSpacing.md, radius: FlowdRadius.xl) {
            VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
                titleRow
                valueRow
                footerRow
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel)
    }

    // MARK: Rows

    private var titleRow: some View {
        HStack(spacing: FlowdSpacing.xs) {
            if let systemImage = systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(FlowdColor.fgSubtle)
                    .accessibilityHidden(true)
            }
            Text(title)
                .flowdCaption(.caption1)
                .foregroundStyle(FlowdColor.fgMuted)
                .lineLimit(1)
        }
    }

    private var valueRow: some View {
        HStack(alignment: .bottom, spacing: FlowdSpacing.sm) {
            valueView
            Spacer(minLength: 0)
            if sparkline.count > 1 {
                FlowdSparkline(values: sparkline, tone: chartTone, height: 30)
                    .frame(width: 72)
            }
        }
    }

    @ViewBuilder
    private var valueView: some View {
        switch value {
        case .money(let cents, let state):
            MoneyText(cents: cents, style: valueStyle, state: state, showsGlyph: false)
        default:
            StatValueText(value: value, style: valueStyle)
        }
    }

    @ViewBuilder
    private var footerRow: some View {
        if let delta = delta {
            HStack(spacing: FlowdSpacing.xxs) {
                Image(systemName: delta.systemImage)
                    .font(.system(size: 11, weight: .bold))
                    .accessibilityHidden(true)
                Text(delta.text)
                    .flowdFigure(.xs)
                Text(delta.comparedTo)
                    .flowdCaption(.caption1)
                    .foregroundStyle(FlowdColor.fgSubtle)
                    .lineLimit(1)
            }
            .foregroundStyle(deltaColor(delta))
        }
    }

    // MARK: Helpers

    private func deltaColor(_ delta: FlowdDelta) -> Color {
        if deltaStyle == FlowdDeltaStyle.neutral {
            return FlowdColor.fgMuted
        }
        switch delta.direction {
        case .up: return FlowdColor.mint
        case .down: return FlowdColor.rose
        case .flat: return FlowdColor.fgMuted
        }
    }

    private var spokenLabel: String {
        var parts: [String] = [title, spokenValue]
        if let delta = delta {
            parts.append(delta.spoken)
        }
        return parts.joined(separator: ", ")
    }

    private var spokenValue: String {
        switch value {
        case .money(let cents, let state):
            let amount: String = FlowdMoneyFormat.string(cents: cents)
            return state.label.isEmpty ? amount : state.label + " " + amount
        default:
            return value.displayText
        }
    }
}

/// A rolling tabular figure for non-money values.
private struct StatValueText: View {
    let value: FlowdStatValue
    let style: FlowdTextStyle
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(value: FlowdStatValue, style: FlowdTextStyle) {
        self.value = value
        self.style = style
    }

    var body: some View {
        Text(value.displayText)
            .flowdText(style)
            .foregroundStyle(FlowdColor.fg)
            .contentTransition(.numericText(value: value.numeric))
            .animation(appearance.animation(.smooth), value: value.displayText)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

// MARK: - Grid helper

/// Column sets for stat grids.
enum FlowdGridColumns {
    /// Two equal columns with a 12 pt gutter.
    static let two: [GridItem] = [
        GridItem(.flexible(), spacing: FlowdSpacing.sm),
        GridItem(.flexible(), spacing: FlowdSpacing.sm)
    ]

    /// Three equal columns with an 8 pt gutter (compact tiles).
    static let three: [GridItem] = [
        GridItem(.flexible(), spacing: FlowdSpacing.xs),
        GridItem(.flexible(), spacing: FlowdSpacing.xs),
        GridItem(.flexible(), spacing: FlowdSpacing.xs)
    ]
}

// MARK: - Preview

#Preview("Stat tiles") {
    FlowdPreviewCanvas {
        VStack(spacing: FlowdSpacing.sm) {
            LazyVGrid(columns: FlowdGridColumns.two, spacing: FlowdSpacing.sm) {
                StatTile(
                    "Cleared this month",
                    value: .money(cents: 128_460, state: .cleared),
                    delta: FlowdDelta(0.38, vs: "Aug"),
                    sparkline: [12, 18, 15, 24, 31, 28, 40, 52, 49, 61, 70, 84],
                    chartTone: .good
                )
                StatTile(
                    "Pending",
                    value: .money(cents: 18_620, state: .pending),
                    delta: FlowdDelta(-0.07, vs: "last week"),
                    sparkline: [9, 8, 12, 11, 10, 9, 14, 13, 12, 11, 9, 8],
                    chartTone: .lagoon
                )
                StatTile(
                    "Verified views",
                    value: .compact(412_000),
                    delta: FlowdDelta(0.124, vs: "last 7 days"),
                    systemImage: "eye.fill"
                )
                StatTile(
                    "Approval rate",
                    value: .percent(0.91),
                    delta: FlowdDelta(0.0, vs: "last 30 days"),
                    systemImage: "checkmark.seal.fill"
                )
            }
            StatTile(
                "Cost per trial",
                value: .money(cents: 640, state: .neutral),
                delta: FlowdDelta(-0.07, vs: "last 30 days"),
                deltaStyle: .neutral,
                sparkline: [8.2, 7.9, 7.4, 7.6, 6.8, 6.4],
                systemImage: "target"
            )
        }
        .padding(FlowdSpacing.lg)
    }
}
