import SwiftUI
import Charts

// FlowdRetentionChart: the viewer-retention curve of a video (fraction still watching, second by second) with the first-3-seconds
// "hook window" shaded, a dashed "typical for this format" benchmark, and the retained share at the hook line called out directly.
// Y is always 0 to 100 percent. Honest by default: when the curve is modelled rather than measured say so in the title or summary
// ("Checklist estimate"), never "predicts viral".

/// ```
/// FlowdRetentionChart(
///     title: "Viewer retention",
///     points: video.retention,            // [FlowdRetentionPoint(second:retained:)]
///     benchmark: formatMedian,            // optional, drawn dashed as "Typical"
///     hookSecond: 3
/// )
/// ```
struct FlowdRetentionChart: View {
    let title: String
    let points: [FlowdRetentionPoint]
    let benchmark: [FlowdRetentionPoint]
    let hookSecond: Double
    let tone: FlowdChartTone
    let height: CGFloat
    let summary: String?
    let allowsTable: Bool

    init(
        title: String,
        points: [FlowdRetentionPoint],
        benchmark: [FlowdRetentionPoint] = [],
        hookSecond: Double = 3,
        tone: FlowdChartTone = .violet,
        height: CGFloat = 200,
        summary: String? = nil,
        allowsTable: Bool = true
    ) {
        self.title = title
        self.points = points
        self.benchmark = benchmark
        self.hookSecond = hookSecond
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

    private var chart: some View {
        Chart {
            RectangleMark(
                xStart: .value("Hook start", 0.0),
                xEnd: .value("Hook end", hookSecond),
                yStart: .value("Floor", 0.0),
                yEnd: .value("Ceiling", 1.0)
            )
            .foregroundStyle(FlowdColor.accentSoft)
            ForEach(points) { (point: FlowdRetentionPoint) in
                AreaMark(
                    x: .value("Second", point.second),
                    yStart: .value("Floor", 0.0),
                    yEnd: .value("Retained", point.retained)
                )
                .foregroundStyle(FlowdChartStyle.areaFill(tone.color))
                .interpolationMethod(.monotone)
                LineMark(
                    x: .value("Second", point.second),
                    y: .value("Retained", point.retained),
                    series: .value("Series", "This video")
                )
                .foregroundStyle(tone.color)
                .lineStyle(StrokeStyle(lineWidth: FlowdChart.lineWidth, lineCap: .round, lineJoin: .round))
                .interpolationMethod(.monotone)
            }
            ForEach(benchmark) { (point: FlowdRetentionPoint) in
                LineMark(
                    x: .value("Second", point.second),
                    y: .value("Retained", point.retained),
                    series: .value("Series", "Typical")
                )
                .foregroundStyle(FlowdColor.fgSubtle)
                .lineStyle(StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round, dash: [4, 4]))
                .interpolationMethod(.monotone)
            }
            RuleMark(x: .value("Hook", hookSecond))
                .foregroundStyle(FlowdChart.axis)
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                .annotation(position: .top, alignment: .leading, spacing: 2) {
                    Text("First " + String(Int(hookSecond.rounded())) + " seconds")
                        .font(FlowdChartStyle.axisFont)
                        .foregroundStyle(FlowdColor.fgMuted)
                }
            if let atHook = retainedAtHook {
                PointMark(
                    x: .value("Hook", hookSecond),
                    y: .value("Retained", atHook)
                )
                .symbolSize(CGFloat(70))
                .foregroundStyle(tone.color)
                .annotation(position: .trailing, spacing: 6) {
                    Text(FlowdNumberFormat.percent(atHook))
                        .font(FlowdChartStyle.labelFont)
                        .foregroundStyle(FlowdColor.fg)
                }
            }
        }
        .chartXScale(domain: 0...xMax)
        .chartYScale(domain: 0.0...1.0)
        .chartLegend(.hidden)
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 5)) { (value: AxisValue) in
                AxisValueLabel {
                    if let second = value.as(Double.self) {
                        Text(String(Int(second.rounded())) + "s")
                            .font(FlowdChartStyle.axisFont)
                            .foregroundStyle(FlowdColor.fgSubtle)
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { (value: AxisValue) in
                AxisGridLine().foregroundStyle(FlowdChart.grid)
                AxisValueLabel {
                    if let fraction = value.as(Double.self) {
                        Text(FlowdNumberFormat.percent(fraction))
                            .font(FlowdChartStyle.axisFont)
                            .foregroundStyle(FlowdColor.fgSubtle)
                    }
                }
            }
        }
        .frame(height: height)
        .accessibilityLabel(title)
        .accessibilityValue(resolvedSummary)
    }

    // MARK: Data

    private var xMax: Double {
        var longest: Double = hookSecond + 1
        for point in points {
            longest = max(longest, point.second)
        }
        for point in benchmark {
            longest = max(longest, point.second)
        }
        return longest
    }

    private var retainedAtHook: Double? {
        return FlowdRetentionChart.retained(at: hookSecond, in: points)
    }

    /// Linear interpolation of the curve at `second`. Nil when there are no points.
    static func retained(at second: Double, in points: [FlowdRetentionPoint]) -> Double? {
        let sorted: [FlowdRetentionPoint] = points.sorted { (lhs: FlowdRetentionPoint, rhs: FlowdRetentionPoint) -> Bool in
            return lhs.second < rhs.second
        }
        guard let first = sorted.first, let last = sorted.last else {
            return nil
        }
        if second <= first.second {
            return first.retained
        }
        if second >= last.second {
            return last.retained
        }
        var index: Int = 1
        while index < sorted.count {
            let after: FlowdRetentionPoint = sorted[index]
            if second <= after.second {
                let before: FlowdRetentionPoint = sorted[index - 1]
                let span: Double = after.second - before.second
                if span <= 0 {
                    return after.retained
                }
                let progress: Double = (second - before.second) / span
                return before.retained + (after.retained - before.retained) * progress
            }
            index += 1
        }
        return last.retained
    }

    private var resolvedSummary: String {
        if let summary = summary {
            return summary
        }
        guard let atHook = retainedAtHook else {
            return "No retention data yet."
        }
        let hookText: String = String(Int(hookSecond.rounded()))
        var text: String = FlowdNumberFormat.percent(atHook) + " still watching at " + hookText + "s"
        if let typical = FlowdRetentionChart.retained(at: hookSecond, in: benchmark) {
            text += ". Typical for this format: " + FlowdNumberFormat.percent(typical)
        }
        if let end = points.last {
            text += ". " + FlowdNumberFormat.percent(end.retained) + " at the end"
        }
        return text + "."
    }

    private var tableRows: [FlowdChartRow] {
        var rows: [FlowdChartRow] = []
        for point in points {
            rows.append(
                FlowdChartRow(
                    label: String(Int(point.second.rounded())) + "s",
                    value: FlowdNumberFormat.percent(point.retained, fractionDigits: 1)
                )
            )
        }
        return rows
    }
}

// MARK: - Preview

#Preview("Retention chart") {
    FlowdPreviewCanvas {
        VStack(spacing: FlowdSpacing.lg) {
            FlowdCard {
                FlowdRetentionChart(
                    title: "Viewer retention",
                    points: [
                        FlowdRetentionPoint(second: 0, retained: 1.0),
                        FlowdRetentionPoint(second: 1, retained: 0.86),
                        FlowdRetentionPoint(second: 2, retained: 0.74),
                        FlowdRetentionPoint(second: 3, retained: 0.66),
                        FlowdRetentionPoint(second: 6, retained: 0.52),
                        FlowdRetentionPoint(second: 10, retained: 0.41),
                        FlowdRetentionPoint(second: 15, retained: 0.33),
                        FlowdRetentionPoint(second: 22, retained: 0.27)
                    ],
                    benchmark: [
                        FlowdRetentionPoint(second: 0, retained: 1.0),
                        FlowdRetentionPoint(second: 3, retained: 0.7),
                        FlowdRetentionPoint(second: 10, retained: 0.38),
                        FlowdRetentionPoint(second: 22, retained: 0.2)
                    ]
                )
            }
        }
        .padding(FlowdSpacing.lg)
    }
}
