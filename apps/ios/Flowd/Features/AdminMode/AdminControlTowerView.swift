import SwiftUI

/// Admin Control tower: 90-day targets vs actuals, market health, queues and live alerts. Reads the admin_metrics fixture.
struct AdminControlTowerView: View {
    @State private var metrics: AdminMetrics?
    @State private var errorText: String?

    var body: some View {
        FlowdScreen {
            if let m = metrics {
                content(m)
            } else if let errorText = errorText {
                ErrorStateView(title: "Couldn't load the Control tower", message: errorText) {
                    Task { await load() }
                }
            } else {
                FlowdCard {
                    VStack(spacing: 0) {
                        SkeletonRow()
                        SkeletonRow()
                        SkeletonRow()
                    }
                }
            }
        }
        .flowdNavigationTitle("Control", large: true)
        .task { await load() }
    }

    private func load() async {
        let result: Result<AdminMetrics, FlowdAPIError> = await Task.detached { () -> Result<AdminMetrics, FlowdAPIError> in
            do {
                let value: AdminMetrics = try FixtureLoader().load(AdminMetrics.self, named: "admin_metrics")
                return .success(value)
            } catch let error as FlowdAPIError {
                return .failure(error)
            } catch {
                return .failure(FlowdAPIError.decoding(error.localizedDescription))
            }
        }.value
        switch result {
        case .success(let value):
            metrics = value
            errorText = nil
        case .failure(let error):
            errorText = error.userMessage
        }
    }

    // MARK: Content

    @ViewBuilder
    private func content(_ m: AdminMetrics) -> some View {
        summaryRow(m.summary)
        alertsCard(m.alerts)
        targetsSection(m.targets)
        healthSection(m.marketHealth)
        queuesCard(m.queues, m.nextPayoutRun)
    }

    private func summaryRow(_ s: AdminSummary) -> some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
            SectionHeader("Marketplace, last 30 days")
            LazyVGrid(columns: FlowdGridColumns.two, spacing: FlowdSpacing.sm) {
                StatTile("GMV", value: .money(cents: s.gmv30dCents, state: .neutral), deltaStyle: .neutral,
                         systemImage: "chart.line.uptrend.xyaxis", valueStyle: FlowdFont.figureMd)
                StatTile("Platform fees", value: .money(cents: s.fees30dCents, state: .neutral), deltaStyle: .neutral,
                         systemImage: "percent", valueStyle: FlowdFont.figureMd)
                StatTile("Active creators", value: .count(s.activeCreators30d), deltaStyle: .neutral,
                         systemImage: "person.2.fill", valueStyle: FlowdFont.figureMd)
                StatTile("Live bounties", value: .count(s.liveBounties), deltaStyle: .neutral,
                         systemImage: "target", valueStyle: FlowdFont.figureMd)
            }
        }
    }

    // MARK: Alerts

    @ViewBuilder
    private func alertsCard(_ alerts: [String]) -> some View {
        if !alerts.isEmpty {
            VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                SectionHeader("Live alerts", subtitle: "\(alerts.count) need a look")
                FlowdCard {
                    VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                        ForEach(Array(alerts.enumerated()), id: \.offset) { _, text in
                            HStack(alignment: .top, spacing: FlowdSpacing.sm) {
                                FlowdIconTile(systemImage: "exclamationmark.triangle.fill", tone: .ember, size: 32)
                                Text(text).flowdBody(.subheadline)
                                Spacer(minLength: 0)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: Targets

    private func targetsSection(_ targets: [MetricTarget]) -> some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
            SectionHeader("90-day targets", subtitle: "Actual against the launch goals")
            FlowdCard {
                VStack(spacing: 0) {
                    ForEach(Array(targets.enumerated()), id: \.element.id) { index, t in
                        if index > 0 { FlowdDivider() }
                        targetRow(t)
                    }
                }
            }
        }
    }

    private func targetRow(_ t: MetricTarget) -> some View {
        let values: [Double] = t.series.map { $0.value }
        return VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
            HStack(alignment: .top) {
                Text(t.label).flowdBody(.subheadline)
                Spacer(minLength: FlowdSpacing.xs)
                Pill(statusTitle(t.status), systemImage: statusIcon(t.status), tone: statusTone(t.status), style: .soft, size: .small)
            }
            HStack(alignment: .firstTextBaseline, spacing: FlowdSpacing.sm) {
                Text(valueText(t.actual, unit: t.unit)).flowdFigure(.md)
                Text("target \(targetText(t))").flowdCaption(.footnote).flowdInk(.muted)
                Spacer(minLength: 0)
                if values.count > 1 {
                    FlowdSparkline(values: values, tone: sparkTone(t.status), height: 28, label: t.label)
                        .frame(width: 96)
                }
            }
        }
        .padding(.vertical, FlowdSpacing.sm)
        .accessibilityElement(children: .combine)
    }

    private func targetText(_ t: MetricTarget) -> String {
        if let upper = t.targetMax {
            return "\(valueText(t.target, unit: t.unit)) to \(valueText(upper, unit: t.unit))"
        }
        let prefix: String = t.op == "lt" ? "under " : (t.op == "gt" ? "over " : "")
        return prefix + valueText(t.target, unit: t.unit)
    }

    private func valueText(_ v: Double, unit: String) -> String {
        switch unit {
        case "ratio": return Fmt.percent(v)
        case "hours": return Fmt.hours(v)
        default: return Fmt.decimal(v, digits: v < 10 ? 2 : 0)
        }
    }

    private func statusTitle(_ s: MetricStatus) -> String {
        switch s {
        case .achieved: return "Achieved"
        case .onTrack: return "On track"
        case .atRisk: return "At risk"
        case .offTrack: return "Off track"
        case .unknown: return "No status"
        }
    }

    private func statusIcon(_ s: MetricStatus) -> String {
        switch s {
        case .achieved: return "checkmark.circle.fill"
        case .onTrack: return "arrow.up.right"
        case .atRisk: return "exclamationmark.triangle.fill"
        case .offTrack: return "xmark.octagon.fill"
        case .unknown: return "questionmark.circle"
        }
    }

    private func statusTone(_ s: MetricStatus) -> FlowdTone {
        switch s {
        case .achieved: return .mint
        case .onTrack: return .accent
        case .atRisk: return .sun
        case .offTrack: return .rose
        case .unknown: return .neutral
        }
    }

    private func sparkTone(_ s: MetricStatus) -> FlowdChartTone {
        switch s {
        case .achieved, .onTrack: return .azure
        case .atRisk: return .sun
        case .offTrack: return .rose
        case .unknown: return .azure
        }
    }

    // MARK: Market health

    private func healthSection(_ h: MarketHealth) -> some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
            SectionHeader("Market health")
            FlowdCard {
                VStack(spacing: FlowdSpacing.sm) {
                    healthBar("Filled within 48 hours", h.fillRate48h)
                    healthBar("Decided within SLA", h.decidedInSlaRatio)
                    healthBar("Cleared on ETA", h.clearedOnEtaRatio)
                    healthBar("Disputes resolved in 48 hours", h.disputesResolved48hRatio)
                    healthBar("Live bounties funded", h.fundedLiveRatio)
                    FlowdDivider()
                    HStack {
                        healthFact("Median fill", Fmt.hours(h.medianFillHours))
                        healthFact("Median decision", Fmt.hours(h.medianDecisionHours))
                        healthFact("First dollar", Fmt.hours(h.firstDollarMedianHours))
                    }
                }
            }
        }
    }

    private func healthBar(_ title: String, _ ratio: Double) -> some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.xxs) {
            HStack {
                Text(title).flowdBody(.subheadline)
                Spacer(minLength: 0)
                Text(Fmt.percent(ratio)).flowdFigure(.xs)
            }
            FlowdProgressBar(progress: min(max(ratio, 0), 1), tone: ratio >= 0.9 ? .mint : (ratio >= 0.75 ? .accent : .sun), height: 6, label: title)
        }
    }

    private func healthFact(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).flowdCaption(.caption1).flowdInk(.muted)
            Text(value).flowdFigure(.xs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Queues

    private func queuesCard(_ q: QueueCounts, _ run: NextPayoutRun) -> some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
            SectionHeader("Queues and next payout run")
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                    FlowdWrap(spacing: FlowdSpacing.xs, lineSpacing: FlowdSpacing.xs) {
                        Pill("\(q.fraudOpen) fraud", systemImage: "shield.lefthalf.filled", tone: q.fraudOpen > 0 ? .ember : .neutral, style: .soft)
                        Pill("\(q.disputesOpen) disputes", systemImage: "exclamationmark.bubble.fill", tone: .neutral, style: .soft)
                        Pill("\(q.verificationOpen) verifications", systemImage: "person.badge.shield.checkmark.fill", tone: .neutral, style: .soft)
                        Pill("\(q.slaStale + q.slaBreached) past SLA", systemImage: "clock.badge.exclamationmark", tone: q.slaBreached > 0 ? .rose : .neutral, style: .soft)
                    }
                    FlowdDivider()
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Runs \(Fmt.clockLabelUTC(run.scheduledFor))").flowdCaption(.footnote).flowdInk(.muted)
                            MoneyText(cents: run.totalCents, style: FlowdFont.figureMd, state: .paid)
                        }
                        Spacer(minLength: 0)
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(run.creators) creators").flowdBody(.subheadline)
                            Text("\(run.holds) held \u{00B7} \(Fmt.money(run.heldCents))").flowdCaption(.footnote).flowdInk(.muted)
                        }
                    }
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        AdminControlTowerView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.admin)
}
