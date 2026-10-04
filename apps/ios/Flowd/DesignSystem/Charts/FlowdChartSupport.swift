import SwiftUI
import Charts

// Shared pieces of the chart wrappers. Follow the dataviz rules: fixed hue order from the token palette (never cycled), thin 2 pt marks,
// 4 pt rounded data ends anchored at the baseline, a recessive hairline grid, axis text in the muted ink (text never wears the series
// colour), direct labels, a text summary for VoiceOver, and an optional table view. Mint stays reserved for money: brand dashboards use
// azure; creator earnings charts may use `.good`.

// MARK: - Tones

/// A chart series colour from the validated token palette. Slots are in fixed order; the ninth series folds into "Other".
enum FlowdChartTone: CaseIterable, Hashable, Sendable {
    case azure
    case ember
    case lagoon
    case rose
    case violet
    case sun
    case magenta
    case green
    /// Mint-family "good" status colour: earned money on creator charts.
    case good

    var color: Color {
        switch self {
        case .azure: return FlowdChartTone.slot(0)
        case .ember: return FlowdChartTone.slot(1)
        case .lagoon: return FlowdChartTone.slot(2)
        case .rose: return FlowdChartTone.slot(3)
        case .violet: return FlowdChartTone.slot(4)
        case .sun: return FlowdChartTone.slot(5)
        case .magenta: return FlowdChartTone.slot(6)
        case .green: return FlowdChartTone.slot(7)
        case .good: return FlowdChart.good
        }
    }

    private static func slot(_ index: Int) -> Color {
        let palette: [Color] = FlowdChart.categorical
        if index >= 0 && index < palette.count {
            return palette[index]
        }
        return FlowdColor.accentBright
    }
}

// MARK: - Value formatting

/// How a chart value is written (axis labels, callouts, the table view).
enum FlowdValueFormat: Hashable, Sendable {
    /// `1,284`
    case number
    /// `1.2K`
    case compact
    /// Cents as dollars: `$1,284.60`
    case moneyCents
    /// Cents as compact dollars: `$1.2K`
    case moneyCompactCents
    /// A 0-1 fraction as a percent: `18%`
    case percent
    /// Seconds: `12s`
    case seconds

    /// Full precision (callouts, table).
    func string(_ value: Double) -> String {
        switch self {
        case .number: return FlowdNumberFormat.grouped(Int(value.rounded()))
        case .compact: return FlowdNumberFormat.compact(value)
        case .moneyCents: return FlowdMoneyFormat.string(cents: Int(value.rounded()))
        case .moneyCompactCents: return FlowdMoneyFormat.string(cents: Int(value.rounded()), showsCents: false)
        case .percent: return FlowdNumberFormat.percent(value, fractionDigits: 1)
        case .seconds: return String(Int(value.rounded())) + "s"
        }
    }

    /// Short form for axis ticks.
    func axis(_ value: Double) -> String {
        switch self {
        case .number: return FlowdNumberFormat.compact(value)
        case .compact: return FlowdNumberFormat.compact(value)
        case .moneyCents: return FlowdMoneyFormat.compact(cents: Int(value.rounded()))
        case .moneyCompactCents: return FlowdMoneyFormat.compact(cents: Int(value.rounded()))
        case .percent: return FlowdNumberFormat.percent(value)
        case .seconds: return String(Int(value.rounded())) + "s"
        }
    }
}

// MARK: - Data

struct FlowdTimePoint: Identifiable, Hashable, Sendable {
    let date: Date
    let value: Double

    var id: Date { return date }

    init(date: Date, value: Double) {
        self.date = date
        self.value = value
    }
}

struct FlowdBarDatum: Identifiable, Hashable, Sendable {
    let label: String
    let value: Double
    let isHighlighted: Bool

    var id: String { return label }

    init(label: String, value: Double, isHighlighted: Bool = false) {
        self.label = label
        self.value = value
        self.isHighlighted = isHighlighted
    }
}

/// How a figure was attributed. CPA pays only on tracked (link, code); estimated is modelled and always labelled.
enum FlowdAttribution: String, CaseIterable, Hashable, Sendable {
    case tracked
    case estimated

    var title: String {
        switch self {
        case .tracked: return "Tracked"
        case .estimated: return "Estimated"
        }
    }

    var systemImage: String {
        switch self {
        case .tracked: return "link"
        case .estimated: return "info.circle"
        }
    }

    var tone: FlowdTone {
        switch self {
        case .tracked: return FlowdTone.accent
        case .estimated: return FlowdTone.neutral
        }
    }
}

struct FlowdFunnelStage: Identifiable, Hashable, Sendable {
    let label: String
    let value: Double
    let attribution: FlowdAttribution

    var id: String { return label }

    init(label: String, value: Double, attribution: FlowdAttribution = .tracked) {
        self.label = label
        self.value = value
        self.attribution = attribution
    }
}

struct FlowdRetentionPoint: Identifiable, Hashable, Sendable {
    /// Seconds into the video.
    let second: Double
    /// Fraction of viewers still watching, 0 to 1.
    let retained: Double

    var id: Double { return second }

    init(second: Double, retained: Double) {
        self.second = second
        self.retained = retained
    }
}

struct FlowdChartRow: Identifiable, Hashable, Sendable {
    let label: String
    let value: String

    var id: String { return label + "|" + value }

    init(label: String, value: String) {
        self.label = label
        self.value = value
    }
}

// MARK: - Summary

enum FlowdChartSummary {
    /// "Latest $1.2K, high $1.8K on Sep 12, low $312 on Sep 3." for VoiceOver and the caption under a chart.
    static func describe(points: [FlowdTimePoint], format: FlowdValueFormat) -> String {
        guard let last = points.last, let high = points.max(by: { $0.value < $1.value }), let low = points.min(by: { $0.value < $1.value }) else {
            return "No data yet."
        }
        let latestText: String = "Latest " + format.string(last.value)
        let highText: String = "high " + format.string(high.value) + " on " + dayString(high.date)
        let lowText: String = "low " + format.string(low.value) + " on " + dayString(low.date)
        return latestText + ", " + highText + ", " + lowText + "."
    }

    static func describe(bars: [FlowdBarDatum], format: FlowdValueFormat) -> String {
        guard let high = bars.max(by: { $0.value < $1.value }), let low = bars.min(by: { $0.value < $1.value }) else {
            return "No data yet."
        }
        let highText: String = "Highest " + high.label + " at " + format.string(high.value)
        let lowText: String = "lowest " + low.label + " at " + format.string(low.value)
        return highText + ", " + lowText + "."
    }

    static func dayString(_ date: Date) -> String {
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}

// MARK: - Table view

/// The accessible table view of a chart: label and value rows.
struct FlowdChartTable: View {
    let rows: [FlowdChartRow]

    init(rows: [FlowdChartRow]) {
        self.rows = rows
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(rows) { (row: FlowdChartRow) in
                HStack {
                    Text(row.label)
                        .flowdBody(.subheadline)
                        .foregroundStyle(FlowdColor.fgMuted)
                    Spacer(minLength: FlowdSpacing.sm)
                    Text(row.value)
                        .flowdFigure(.sm)
                        .foregroundStyle(FlowdColor.fg)
                }
                .padding(.vertical, FlowdSpacing.xs)
                .accessibilityElement(children: .combine)
                if row.id != rows.last?.id {
                    FlowdDivider()
                }
            }
        }
    }
}

// MARK: - Frame (title, summary, optional table toggle)

/// The standard chrome around a chart: title, one-line text summary, and an optional chart / table switch.
struct FlowdChartFrame<ChartBody: View>: View {
    let title: String
    let summary: String?
    let rows: [FlowdChartRow]
    let allowsTable: Bool
    private let chartBody: ChartBody

    @State private var showsTable: Bool = false

    init(
        title: String,
        summary: String?,
        rows: [FlowdChartRow],
        allowsTable: Bool,
        @ViewBuilder chart: () -> ChartBody
    ) {
        self.title = title
        self.summary = summary
        self.rows = rows
        self.allowsTable = allowsTable
        self.chartBody = chart()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
            HStack(alignment: .top, spacing: FlowdSpacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .flowdBody(.headline)
                        .foregroundStyle(FlowdColor.fg)
                        .accessibilityAddTraits(.isHeader)
                    if let summary = summary {
                        Text(summary)
                            .flowdCaption(.footnote)
                            .foregroundStyle(FlowdColor.fgMuted)
                    }
                }
                Spacer(minLength: 0)
                if allowsTable {
                    Button {
                        showsTable.toggle()
                    } label: {
                        Image(systemName: showsTable ? "chart.xyaxis.line" : "tablecells")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(FlowdColor.accent)
                            .frame(width: FlowdLayout.hitTarget, height: FlowdLayout.hitTarget)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(FlowdPressStyle())
                    .accessibilityLabel(showsTable ? "Show chart" : "Show data as a table")
                    .padding(.top, -FlowdSpacing.xs)
                }
            }
            if showsTable {
                FlowdChartTable(rows: rows)
            } else {
                chartBody
            }
        }
    }
}

// MARK: - Axis styling shared by the wrappers

extension View {
    /// Fixed-height plot area with the brand's recessive plot style (no background, clipped to the chart).
    func flowdChartPlot(height: CGFloat) -> some View {
        return self
            .frame(height: height)
            .chartLegend(.hidden)
    }
}

// MARK: - Shared style

/// Fonts and fills every chart wrapper shares. Axis text is always the muted ink and scales with Dynamic Type (system text style).
enum FlowdChartStyle {
    /// Axis tick labels: caption2, rounded, medium. Never wears the series colour.
    static let axisFont: Font = Font.system(.caption2, design: .rounded, weight: .medium)

    /// Direct labels and callouts: caption, rounded, semibold.
    static let labelFont: Font = Font.system(.caption, design: .rounded, weight: .semibold)

    /// The soft gradient under a line (28 percent at the line, fading to 2 percent at the baseline).
    static func areaFill(_ color: Color) -> LinearGradient {
        return LinearGradient(
            colors: [color.opacity(0.28), color.opacity(0.02)],
            startPoint: UnitPoint.top,
            endPoint: UnitPoint.bottom
        )
    }

    /// Trend wording for VoiceOver ("Up 12% over the period", "Flat", "Down 4% over the period").
    static func trendSummary(_ values: [Double]) -> String {
        guard let first = values.first, let last = values.last, values.count > 1 else {
            return "Not enough data yet"
        }
        if abs(first) < 0.000_001 {
            if last > first { return "Trending up" }
            if last < first { return "Trending down" }
            return "Flat"
        }
        let change: Double = (last - first) / abs(first)
        if abs(change) < 0.005 {
            return "Flat"
        }
        let direction: String = change > 0 ? "Up " : "Down "
        return direction + FlowdNumberFormat.percent(abs(change)) + " over the period"
    }
}

// MARK: - Callout

/// The small tooltip shown while scrubbing a chart: a caption and a tabular value on a solid raised fill (not glass).
struct FlowdChartCallout: View {
    let title: String
    let value: String

    init(title: String, value: String) {
        self.title = title
        self.value = value
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(FlowdChartStyle.axisFont)
                .foregroundStyle(FlowdColor.fgMuted)
            Text(value)
                .flowdFigure(.xs)
                .foregroundStyle(FlowdColor.fg)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background {
            RoundedRectangle(cornerRadius: FlowdRadius.md, style: .continuous).fill(FlowdColor.surfaceRaised)
        }
        .overlay {
            RoundedRectangle(cornerRadius: FlowdRadius.md, style: .continuous).strokeBorder(FlowdColor.rimStrong, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Preview

#Preview("Chart pieces") {
    FlowdPreviewCanvas {
        VStack(alignment: .leading, spacing: FlowdSpacing.lg) {
            FlowdChartCallout(title: "Oct 3", value: "$746.00")
            FlowdCard {
                FlowdChartTable(
                    rows: [
                        FlowdChartRow(label: "Views", value: "4,200,000"),
                        FlowdChartRow(label: "Link clicks", value: "75,600, 1.8% of the stage above, Tracked"),
                        FlowdChartRow(label: "Installs", value: "3,310, 4.4% of the stage above, Tracked")
                    ]
                )
            }
            HStack(spacing: FlowdSpacing.sm) {
                ForEach(FlowdChartTone.allCases, id: \.self) { (tone: FlowdChartTone) in
                    Circle().fill(tone.color).frame(width: 20, height: 20)
                }
            }
        }
        .padding(FlowdSpacing.lg)
    }
}
