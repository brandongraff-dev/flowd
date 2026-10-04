import SwiftUI
import Charts

// FlowdAreaChart: one thin line over a soft area, an optional dashed "previous period" line, a hairline grid, and a scrubber (drag
// anywhere on the plot; a selection haptic ticks per point). Follows the dataviz rules: 2 pt marks, recessive grid, axis text in muted
// ink, the area starts at zero (honest baseline), a one-line text summary for VoiceOver, and a chart / table switch.
// Creator earnings use `.good` (Mint family); brand dashboards use `.azure`.

/// ```
/// FlowdAreaChart(
///     title: "Cleared earnings",
///     points: viewModel.dailyCleared,            // [FlowdTimePoint(date:value:)], value in cents
///     previous: viewModel.previousPeriod,        // optional dashed comparison line
///     format: .moneyCents,
///     tone: .good
/// )
/// ```
struct FlowdAreaChart: View {
    let title: String
    let points: [FlowdTimePoint]
    let previous: [FlowdTimePoint]
    let previousLabel: String
    let format: FlowdValueFormat
    let tone: FlowdChartTone
    let height: CGFloat
    let summary: String?
    let allowsTable: Bool

    @State private var selectedDate: Date? = nil

    init(
        title: String,
        points: [FlowdTimePoint],
        previous: [FlowdTimePoint] = [],
        previousLabel: String = "Previous period",
        format: FlowdValueFormat = .number,
        tone: FlowdChartTone = .azure,
        height: CGFloat = 200,
        summary: String? = nil,
        allowsTable: Bool = true
    ) {
        self.title = title
        self.points = points
        self.previous = previous
        self.previousLabel = previousLabel
        self.format = format
        self.tone = tone
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

    // MARK: Chart

    private var chart: some View {
        Chart {
            ForEach(points) { (point: FlowdTimePoint) in
                AreaMark(
                    x: .value("Date", point.date),
                    yStart: .value("Baseline", yDomain.lowerBound),
                    yEnd: .value("Value", point.value)
                )
                .foregroundStyle(FlowdChartStyle.areaFill(tone.color))
                .interpolationMethod(.monotone)
                LineMark(
                    x: .value("Date", point.date),
                    y: .value("Value", point.value),
                    series: .value("Series", "Current")
                )
                .foregroundStyle(tone.color)
                .lineStyle(StrokeStyle(lineWidth: FlowdChart.lineWidth, lineCap: .round, lineJoin: .round))
                .interpolationMethod(.monotone)
            }
            ForEach(previous) { (point: FlowdTimePoint) in
                LineMark(
                    x: .value("Date", point.date),
                    y: .value("Value", point.value),
                    series: .value("Series", "Previous")
                )
                .foregroundStyle(FlowdColor.fgSubtle)
                .lineStyle(StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round, dash: [4, 4]))
                .interpolationMethod(.monotone)
            }
            if let selected = selectedPoint {
                RuleMark(x: .value("Selected", selected.date))
                    .foregroundStyle(FlowdChart.axis)
                    .lineStyle(StrokeStyle(lineWidth: 1))
                    .annotation(
                        position: .top,
                        spacing: 4,
                        overflowResolution: AnnotationOverflowResolution(x: .fit(to: .chart), y: .disabled)
                    ) {
                        FlowdChartCallout(
                            title: FlowdChartSummary.dayString(selected.date),
                            value: format.string(selected.value)
                        )
                    }
                PointMark(
                    x: .value("Selected", selected.date),
                    y: .value("Value", selected.value)
                )
                .symbolSize(CGFloat(70))
                .foregroundStyle(tone.color)
            }
        }
        .chartXSelection(value: $selectedDate)
        .chartYScale(domain: yDomain)
        .chartLegend(.hidden)
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { (value: AxisValue) in
                AxisValueLabel {
                    if let date = value.as(Date.self) {
                        Text(date, format: .dateTime.month(.abbreviated).day())
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
        .frame(height: height)
        .flowdHaptic(.selection, trigger: selectedPoint?.date)
        .accessibilityLabel(title)
        .accessibilityValue(resolvedSummary)
    }

    // MARK: Data

    /// The area starts at zero for non-negative data; the top gets 12 percent of headroom for the scrubber callout.
    private var yDomain: ClosedRange<Double> {
        var all: [Double] = []
        for point in points { all.append(point.value) }
        for point in previous { all.append(point.value) }
        guard let low = all.min(), let high = all.max() else {
            return 0...1
        }
        let lower: Double = min(0, low)
        if high <= lower {
            return lower...(lower + 1)
        }
        return lower...(high + (high - lower) * 0.12)
    }

    /// The point nearest to the finger.
    private var selectedPoint: FlowdTimePoint? {
        guard let target = selectedDate, let first = points.first else {
            return nil
        }
        var best: FlowdTimePoint = first
        var bestDistance: TimeInterval = abs(first.date.timeIntervalSince(target))
        for point in points {
            let distance: TimeInterval = abs(point.date.timeIntervalSince(target))
            if distance < bestDistance {
                best = point
                bestDistance = distance
            }
        }
        return best
    }

    private var resolvedSummary: String {
        if let summary = summary {
            return summary
        }
        return FlowdChartSummary.describe(points: points, format: format)
    }

    private var tableRows: [FlowdChartRow] {
        var rows: [FlowdChartRow] = []
        for point in points {
            rows.append(FlowdChartRow(label: FlowdChartSummary.dayString(point.date), value: format.string(point.value)))
        }
        return rows
    }
}

// MARK: - Preview

private enum AreaPreviewData {
    /// The demo world's "now": 2026-10-03T14:00:00Z.
    static let now: Date = Date(timeIntervalSince1970: 1_791_036_000)

    static func series(_ values: [Double]) -> [FlowdTimePoint] {
        var result: [FlowdTimePoint] = []
        let count: Int = values.count
        var index: Int = 0
        while index < count {
            let daysAgo: Double = Double(count - 1 - index)
            result.append(FlowdTimePoint(date: now.addingTimeInterval(-daysAgo * 86_400), value: values[index]))
            index += 1
        }
        return result
    }

    static let cleared: [FlowdTimePoint] = series([0, 6_240, 6_240, 9_810, 15_300, 15_300, 21_460, 28_400, 28_400, 34_900, 41_250, 52_900, 61_800, 74_600])
    static let previous: [FlowdTimePoint] = series([0, 3_100, 3_100, 5_400, 8_200, 8_200, 12_900, 15_100, 15_100, 20_300, 24_000, 29_500, 38_100, 45_200])
}

#Preview("Area chart") {
    FlowdPreviewCanvas {
        VStack(spacing: FlowdSpacing.lg) {
            FlowdCard {
                FlowdAreaChart(
                    title: "Cleared earnings",
                    points: AreaPreviewData.cleared,
                    previous: AreaPreviewData.previous,
                    format: .moneyCents,
                    tone: .good
                )
            }
            FlowdCard {
                FlowdAreaChart(
                    title: "Installs",
                    points: AreaPreviewData.series([120, 180, 160, 240, 310, 280, 390, 420, 380, 510, 560, 540, 620, 710]),
                    format: .number,
                    tone: .azure,
                    height: 160
                )
            }
        }
        .padding(FlowdSpacing.lg)
    }
}
