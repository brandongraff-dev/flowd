import SwiftUI
import Charts

// FlowdFunnelChart: a plain funnel (views to clicks to installs to trials to paid) as horizontal bars in ONE sequential hue, each bar
// at most 24 pt with a 4 pt rounded end. Beside every bar: the count, and for stages after the first, the conversion from the stage
// above. Stages that are modelled rather than measured are drawn lighter, tagged "est." with an info glyph, and the table view names
// them "Estimated" (CPA pays only on tracked link and code conversions, so tracked vs estimated is never colour alone).

/// ```
/// FlowdFunnelChart(
///     title: "Install to paid",
///     stages: [
///         FlowdFunnelStage(label: "Views", value: 4_200_000),
///         FlowdFunnelStage(label: "Link clicks", value: 75_600),
///         FlowdFunnelStage(label: "Installs", value: 3_310),
///         FlowdFunnelStage(label: "Trials", value: 1_026, attribution: .estimated),
///         FlowdFunnelStage(label: "Paid", value: 214, attribution: .estimated)
///     ]
/// )
/// ```
struct FlowdFunnelChart: View {
    let title: String
    let stages: [FlowdFunnelStage]
    let summary: String?
    let allowsTable: Bool

    private let barHeight: CGFloat = 24

    init(
        title: String,
        stages: [FlowdFunnelStage],
        summary: String? = nil,
        allowsTable: Bool = true
    ) {
        self.title = title
        self.stages = stages
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
            ForEach(0..<stages.count, id: \.self) { (index: Int) in
                BarMark(
                    x: .value("Count", stages[index].value),
                    y: .value("Stage", stages[index].label),
                    height: .fixed(barHeight)
                )
                .foregroundStyle(barColor(index))
                .cornerRadius(FlowdChart.barRadius)
                .annotation(position: .trailing, spacing: 8) {
                    countLabel(index)
                }
            }
        }
        .chartXScale(domain: 0...xMax)
        .chartYScale(domain: stages.map { (stage: FlowdFunnelStage) -> String in stage.label })
        .chartLegend(.hidden)
        .chartXAxis(.hidden)
        .chartYAxis {
            AxisMarks(position: .leading) { (value: AxisValue) in
                AxisValueLabel {
                    if let label = value.as(String.self) {
                        stageLabel(label)
                    }
                }
            }
        }
        .frame(height: CGFloat(stages.count) * (barHeight + 24) + 8)
        .accessibilityLabel(title)
        .accessibilityValue(resolvedSummary)
    }

    // MARK: Labels

    private func stageLabel(_ label: String) -> some View {
        let index: Int = indexOfStage(label)
        return VStack(alignment: .trailing, spacing: 1) {
            Text(label)
                .font(FlowdChartStyle.axisFont)
                .foregroundStyle(FlowdColor.fgMuted)
                .lineLimit(1)
            if let conversion = conversionText(index) {
                HStack(spacing: 2) {
                    Image(systemName: "arrow.down")
                        .font(.system(size: 8, weight: .bold))
                        .accessibilityHidden(true)
                    Text(conversion)
                        .font(FlowdChartStyle.axisFont)
                }
                .foregroundStyle(FlowdColor.fgSubtle)
            }
        }
    }

    @ViewBuilder
    private func countLabel(_ index: Int) -> some View {
        let stage: FlowdFunnelStage = stages[index]
        HStack(spacing: 4) {
            Text(FlowdNumberFormat.compact(stage.value))
                .font(FlowdChartStyle.labelFont)
                .foregroundStyle(FlowdColor.fg)
            if stage.attribution == FlowdAttribution.estimated {
                Image(systemName: stage.attribution.systemImage)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(FlowdColor.fgSubtle)
                    .accessibilityHidden(true)
                Text("est.")
                    .font(FlowdChartStyle.axisFont)
                    .foregroundStyle(FlowdColor.fgSubtle)
            }
        }
    }

    // MARK: Data

    /// One hue from light to deep so the order reads without colour. Estimated stages are lighter and tagged.
    private func barColor(_ index: Int) -> Color {
        let palette: [Color] = FlowdChart.ordinal
        let step: Color = palette[min(index, palette.count - 1)]
        if stages[index].attribution == FlowdAttribution.estimated {
            return step.opacity(0.5)
        }
        return step
    }

    private var xMax: Double {
        var highest: Double = 0
        for stage in stages {
            highest = max(highest, stage.value)
        }
        return highest <= 0 ? 1 : highest * 1.38
    }

    private func indexOfStage(_ label: String) -> Int {
        var index: Int = 0
        for stage in stages {
            if stage.label == label {
                return index
            }
            index += 1
        }
        return 0
    }

    /// Conversion from the stage above: `4.4%`. Nil for the first stage or when the stage above is zero.
    private func conversionText(_ index: Int) -> String? {
        if index <= 0 || index >= stages.count {
            return nil
        }
        let above: Double = stages[index - 1].value
        if above <= 0 {
            return nil
        }
        return FlowdNumberFormat.percent(stages[index].value / above, fractionDigits: 1)
    }

    private var resolvedSummary: String {
        if let summary = summary {
            return summary
        }
        guard let first = stages.first, let last = stages.last, stages.count > 1, first.value > 0 else {
            return "No funnel data yet."
        }
        let overall: String = FlowdNumberFormat.percent(last.value / first.value, fractionDigits: 2)
        let start: String = FlowdNumberFormat.compact(first.value) + " " + first.label.lowercased()
        let end: String = FlowdNumberFormat.compact(last.value) + " " + last.label.lowercased()
        return start + " became " + end + " (" + overall + ")."
    }

    private var tableRows: [FlowdChartRow] {
        var rows: [FlowdChartRow] = []
        var index: Int = 0
        for stage in stages {
            var value: String = FlowdNumberFormat.grouped(Int(stage.value.rounded()))
            if let conversion = conversionText(index) {
                value += ", " + conversion + " of the stage above"
            }
            value += ", " + stage.attribution.title
            rows.append(FlowdChartRow(label: stage.label, value: value))
            index += 1
        }
        return rows
    }
}

// MARK: - Attribution key

/// The "Tracked" / "Estimated" chips shown above a funnel. CPA bonuses pay only on tracked conversions.
struct FlowdAttributionKey: View {
    init() {}

    var body: some View {
        HStack(spacing: FlowdSpacing.xs) {
            ForEach(FlowdAttribution.allCases, id: \.self) { (attribution: FlowdAttribution) in
                Pill(attribution.title, systemImage: attribution.systemImage, tone: attribution.tone, style: .soft, size: .small)
            }
        }
    }
}

// MARK: - Preview

#Preview("Funnel chart") {
    FlowdPreviewCanvas {
        VStack(alignment: .leading, spacing: FlowdSpacing.md) {
            FlowdAttributionKey()
            FlowdCard {
                FlowdFunnelChart(
                    title: "Install to paid",
                    stages: [
                        FlowdFunnelStage(label: "Views", value: 4_200_000),
                        FlowdFunnelStage(label: "Link clicks", value: 75_600),
                        FlowdFunnelStage(label: "Installs", value: 3_310),
                        FlowdFunnelStage(label: "Trials", value: 1_026, attribution: .estimated),
                        FlowdFunnelStage(label: "Paid", value: 214, attribution: .estimated)
                    ]
                )
            }
            Text("CPA bonuses pay only on tracked installs.")
                .flowdCaption(.footnote)
                .flowdInk(.subtle)
        }
        .padding(FlowdSpacing.lg)
    }
}
