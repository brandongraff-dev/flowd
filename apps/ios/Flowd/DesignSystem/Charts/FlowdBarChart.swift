import SwiftUI
import Charts

// FlowdBarChart: vertical columns or horizontal ranked bars. One hue, 4 pt rounded data ends, direct value labels, a recessive grid.
// When any bar is `isHighlighted` the others recede to 45 percent, so the eye lands on the story (best hook, this week). Bars never
// use red and green to mean good and bad. A text summary and a table view ship with it.

enum FlowdBarOrientation: CaseIterable, Hashable, Sendable {
    /// Columns: time buckets and short labels (Mon to Sun).
    case vertical
    /// Ranked rows: long labels (hook names, crews, apps).
    case horizontal
}

/// ```
/// FlowdBarChart(title: "Views by hook", bars: hooks.map { FlowdBarDatum(label: $0.name, value: Double($0.views)) }, format: .compact, orientation: .horizontal)
/// ```
struct FlowdBarChart: View {
    let title: String
    let bars: [FlowdBarDatum]
    let format: FlowdValueFormat
    let tone: FlowdChartTone
    let orientation: FlowdBarOrientation
    let showsValues: Bool
    let height: CGFloat?
    let summary: String?
    let allowsTable: Bool

    init(
        title: String,
        bars: [FlowdBarDatum],
        format: FlowdValueFormat = .number,
        tone: FlowdChartTone = .azure,
        orientation: FlowdBarOrientation = .vertical,
        showsValues: Bool = true,
        height: CGFloat? = nil,
        summary: String? = nil,
        allowsTable: Bool = true
    ) {
        self.title = title
        self.bars = bars
        self.format = format
        self.tone = tone
        self.orientation = orientation
        self.showsValues = showsValues
        self.height = height
        self.summary = summary
        self.allowsTable = allowsTable
    }

    var body: some View {
        FlowdChartFrame(
            title: title,
            summary: resolvedSummary,
            rows: tableRows,
            allowsTable: allowsTable
        ) {
            chart
        }
    }

    @ViewBuilder
    private var chart: some View {
        switch orientation {
        case .vertical:
            verticalChart
        case .horizontal:
            horizontalChart
        }
    }

    // MARK: Vertical

    private var verticalChart: some View {
        Chart(bars) { (bar: FlowdBarDatum) in
            BarMark(
                x: .value("Label", bar.label),
                y: .value("Value", bar.value),
                width: .ratio(0.6)
            )
            .foregroundStyle(barColor(bar))
            .cornerRadius(FlowdChart.barRadius)
            .annotation(position: .top, spacing: 4) {
                valueLabel(bar)
            }
        }
        .chartYScale(domain: 0...yMax)
        .chartLegend(.hidden)
        .chartXAxis {
            AxisMarks { (value: AxisValue) in
                AxisValueLabel {
                    if let label = value.as(String.self) {
                        Text(label)
                            .font(FlowdChartStyle.axisFont)
                            .foregroundStyle(FlowdColor.fgSubtle)
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { (value: AxisValue) in
                AxisGridLine().foregroundStyle(FlowdChart.grid)
                AxisValueLabel {
                    if let number = value.as(Double.self) {
                        Text(format.axis(number))
                            .font(FlowdChartStyle.axisFont)
                            .foregroundStyle(FlowdColor.fgSubtle)
                    }
                }
            }
        }
        .frame(height: height ?? 200)
        .accessibilityLabel(title)
        .accessibilityValue(resolvedSummary)
    }

    // MARK: Horizontal

    private var horizontalChart: some View {
        Chart(bars) { (bar: FlowdBarDatum) in
            BarMark(
                x: .value("Value", bar.value),
                y: .value("Label", bar.label),
                height: .fixed(22)
            )
            .foregroundStyle(barColor(bar))
            .cornerRadius(FlowdChart.barRadius)
            .annotation(position: .trailing, spacing: 6) {
                valueLabel(bar)
            }
        }
        .chartXScale(domain: 0...(yMax * 1.18))
        .chartYScale(domain: bars.map { (bar: FlowdBarDatum) -> String in bar.label })
        .chartLegend(.hidden)
        .chartXAxis(.hidden)
        .chartYAxis {
            AxisMarks(position: .leading) { (value: AxisValue) in
                AxisValueLabel {
                    if let label = value.as(String.self) {
                        Text(label)
                            .font(FlowdChartStyle.axisFont)
                            .foregroundStyle(FlowdColor.fgMuted)
                            .lineLimit(1)
                    }
                }
            }
        }
        .frame(height: height ?? max(CGFloat(bars.count) * 36 + 8, 80))
        .accessibilityLabel(title)
        .accessibilityValue(resolvedSummary)
    }

    // MARK: Pieces

    @ViewBuilder
    private func valueLabel(_ bar: FlowdBarDatum) -> some View {
        if showsValues {
            Text(format.axis(bar.value))
                .font(FlowdChartStyle.labelFont)
                .foregroundStyle(FlowdColor.fg)
        }
    }

    private func barColor(_ bar: FlowdBarDatum) -> Color {
        if anyHighlighted && !bar.isHighlighted {
            return tone.color.opacity(0.45)
        }
        return tone.color
    }

    private var anyHighlighted: Bool {
        for bar in bars {
            if bar.isHighlighted {
                return true
            }
        }
        return false
    }

    private var yMax: Double {
        var highest: Double = 0
        for bar in bars {
            highest = max(highest, bar.value)
        }
        return highest <= 0 ? 1 : highest * 1.12
    }

    private var resolvedSummary: String {
        if let summary = summary {
            return summary
        }
        return FlowdChartSummary.describe(bars: bars, format: format)
    }

    private var tableRows: [FlowdChartRow] {
        var rows: [FlowdChartRow] = []
        for bar in bars {
            rows.append(FlowdChartRow(label: bar.label, value: format.string(bar.value)))
        }
        return rows
    }
}

// MARK: - Preview

#Preview("Bar charts") {
    FlowdPreviewCanvas {
        VStack(spacing: FlowdSpacing.lg) {
            FlowdCard {
                FlowdBarChart(
                    title: "Posts this week",
                    bars: [
                        FlowdBarDatum(label: "Mon", value: 1),
                        FlowdBarDatum(label: "Tue", value: 2),
                        FlowdBarDatum(label: "Wed", value: 0),
                        FlowdBarDatum(label: "Thu", value: 3, isHighlighted: true),
                        FlowdBarDatum(label: "Fri", value: 2),
                        FlowdBarDatum(label: "Sat", value: 1),
                        FlowdBarDatum(label: "Sun", value: 0)
                    ],
                    tone: .azure,
                    height: 180
                )
            }
            FlowdCard {
                FlowdBarChart(
                    title: "Views by hook",
                    bars: [
                        FlowdBarDatum(label: "Stop scrolling", value: 412_000, isHighlighted: true),
                        FlowdBarDatum(label: "I tried it for 7 days", value: 268_000),
                        FlowdBarDatum(label: "POV: you sleep badly", value: 191_000),
                        FlowdBarDatum(label: "Nobody tells you", value: 96_000)
                    ],
                    format: .compact,
                    tone: .violet,
                    orientation: .horizontal
                )
            }
        }
        .padding(FlowdSpacing.lg)
    }
}
