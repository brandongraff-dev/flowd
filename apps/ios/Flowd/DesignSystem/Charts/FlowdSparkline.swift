import SwiftUI
import Charts

// FlowdSparkline: a tiny trend line with a soft area and an end dot, no axes, no grid. For stat tiles, list rows and wallet rows.
// 2 pt line, monotone interpolation, domain padded so the end dot is never clipped. It reads as one VoiceOver element ("Up 12% over the
// period"); pass `label` to name it. A sparkline is context, never the only place a number appears.

/// `FlowdSparkline(values: [12, 14, 13, 18, 22, 21, 27], tone: .azure)`
struct FlowdSparkline: View {
    let values: [Double]
    let tone: FlowdChartTone
    let height: CGFloat
    let showsArea: Bool
    let showsEndDot: Bool
    let label: String?

    init(
        values: [Double],
        tone: FlowdChartTone = .azure,
        height: CGFloat = 28,
        showsArea: Bool = true,
        showsEndDot: Bool = true,
        label: String? = nil
    ) {
        self.values = values
        self.tone = tone
        self.height = height
        self.showsArea = showsArea
        self.showsEndDot = showsEndDot
        self.label = label
    }

    var body: some View {
        Chart {
            ForEach(0..<values.count, id: \.self) { (index: Int) in
                if showsArea {
                    AreaMark(
                        x: .value("Step", Double(index)),
                        yStart: .value("Floor", yDomain.lowerBound),
                        yEnd: .value("Value", values[index])
                    )
                    .foregroundStyle(FlowdChartStyle.areaFill(tone.color))
                    .interpolationMethod(.monotone)
                }
                LineMark(
                    x: .value("Step", Double(index)),
                    y: .value("Value", values[index])
                )
                .foregroundStyle(tone.color)
                .lineStyle(StrokeStyle(lineWidth: FlowdChart.lineWidth, lineCap: .round, lineJoin: .round))
                .interpolationMethod(.monotone)
            }
            if showsEndDot, values.count > 1, let last = values.last {
                PointMark(
                    x: .value("Step", Double(values.count - 1)),
                    y: .value("Value", last)
                )
                .symbolSize(CGFloat(36))
                .foregroundStyle(tone.color)
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartLegend(.hidden)
        .chartXScale(domain: xDomain)
        .chartYScale(domain: yDomain)
        .frame(height: height)
        .accessibilityLabel(label ?? "Trend")
        .accessibilityValue(FlowdChartStyle.trendSummary(values))
    }

    /// Padded by 0.35 of a step on both sides so the end dot sits fully inside the plot.
    private var xDomain: ClosedRange<Double> {
        let last: Double = Double(max(values.count - 1, 1))
        return -0.35...(last + 0.35)
    }

    /// Padded by 18 percent of the range so the line never touches the frame.
    private var yDomain: ClosedRange<Double> {
        guard let low = values.min(), let high = values.max() else {
            return 0...1
        }
        if high - low < 0.000_001 {
            return (low - 1)...(high + 1)
        }
        let pad: Double = (high - low) * 0.18
        return (low - pad)...(high + pad)
    }
}

// MARK: - Preview

#Preview("Sparklines") {
    FlowdPreviewCanvas {
        VStack(alignment: .leading, spacing: FlowdSpacing.lg) {
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.md) {
                    HStack {
                        Text("Views, 7 days").flowdBody(.subheadline).flowdInk(.muted)
                        Spacer()
                        FlowdSparkline(values: [12, 14, 13, 18, 22, 21, 27], tone: .azure)
                            .frame(width: 96)
                    }
                    HStack {
                        Text("Cleared, 7 days").flowdBody(.subheadline).flowdInk(.muted)
                        Spacer()
                        FlowdSparkline(values: [0, 0, 62, 62, 110, 240, 312], tone: .good)
                            .frame(width: 96)
                    }
                    HStack {
                        Text("Cost per trial").flowdBody(.subheadline).flowdInk(.muted)
                        Spacer()
                        FlowdSparkline(values: [8.2, 7.9, 7.4, 7.6, 6.8, 6.4], tone: .lagoon, showsArea: false)
                            .frame(width: 96)
                    }
                }
            }
        }
        .padding(FlowdSpacing.lg)
    }
}
