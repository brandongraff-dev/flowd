import SwiftUI

/// Brand Overview: spend pacing, KPI row, mini funnel, "Needs you" list, escrow chip. Reads the fixture tables for the demo brand (Lumi).
struct BrandOverviewView: View {
    private struct Snapshot: Sendable {
        var brand: Brand
        var bounties: [Bounty]
        var submissions: [Submission]
        var metrics: [AppMetricsDaily]
    }

    @State private var snapshot: Snapshot?
    @State private var errorText: String?

    private static let brandID: String = "br_lumi"
    private static let appID: String = "app_lumi"

    var body: some View {
        FlowdScreen {
            if let snap = snapshot {
                content(snap)
            } else if let errorText = errorText {
                ErrorStateView(title: "Couldn't load Overview", message: errorText) {
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
        .flowdNavigationTitle("Overview", large: true)
        .task { await load() }
    }

    private func load() async {
        let result: Result<Snapshot, FlowdAPIError> = await Task.detached { () -> Result<Snapshot, FlowdAPIError> in
            let loader: FixtureLoader = FixtureLoader()
            do {
                let brands: [Brand] = try loader.load([Brand].self, named: "brands")
                let bounties: [Bounty] = try loader.load([Bounty].self, named: "bounties")
                let subs: [Submission] = try loader.load([Submission].self, named: "submissions")
                let metrics: [AppMetricsDaily] = try loader.load([AppMetricsDaily].self, named: "app_metrics_daily")
                guard let brand = brands.first(where: { $0.id == BrandOverviewView.brandID }) else {
                    return .failure(FlowdAPIError.notFound("brand"))
                }
                let snap: Snapshot = Snapshot(
                    brand: brand,
                    bounties: bounties.filter { $0.brandId == BrandOverviewView.brandID },
                    submissions: subs.filter { $0.brandId == BrandOverviewView.brandID },
                    metrics: metrics.filter { $0.appId == BrandOverviewView.appID }.sorted { $0.date < $1.date })
                return .success(snap)
            } catch let error as FlowdAPIError {
                return .failure(error)
            } catch {
                return .failure(FlowdAPIError.decoding(error.localizedDescription))
            }
        }.value
        switch result {
        case .success(let snap):
            snapshot = snap
            errorText = nil
        case .failure(let error):
            errorText = error.userMessage
        }
    }

    // MARK: Content

    @ViewBuilder
    private func content(_ s: Snapshot) -> some View {
        headerRow(s)
        pacingCard(s)
        kpiGrid(s)
        funnelCard(s)
        needsYou(s)
    }

    private func headerRow(_ s: Snapshot) -> some View {
        HStack(spacing: FlowdSpacing.sm) {
            AvatarView(seed: s.brand.id, name: s.brand.name, size: 44, shape: .roundedSquare)
            VStack(alignment: .leading, spacing: 2) {
                Text(s.brand.name).flowdDisplay(.title2)
                Text("Brand overview").flowdCaption(.footnote).flowdInk(.muted)
            }
            Spacer(minLength: 0)
            Pill("Escrow \(Fmt.money(s.brand.walletBalanceCents, showsCents: false))", systemImage: "lock.fill", tone: .info, style: .soft)
        }
    }

    // MARK: Pacing

    private func pacingCard(_ s: Snapshot) -> some View {
        let live: [Bounty] = s.bounties.filter { $0.status == .live || $0.status == .filled }
        let budget: Int = live.reduce(0) { $0 + $1.budgetCents }
        let spent: Int = live.reduce(0) { $0 + $1.spentCents + $1.reservedCents }
        let spentFrac: Double = budget > 0 ? min(Double(spent) / Double(budget), 1.0) : 0.0
        let timeFrac: Double = elapsedFraction(live)
        let gap: Double = spentFrac - timeFrac
        let label: String = gap > 0.12 ? "Spending ahead of schedule" : (gap < -0.12 ? "Spending behind schedule" : "On pace")
        let tone: FlowdTone = abs(gap) <= 0.12 ? .mint : .sun
        return FlowdCard {
            VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                HStack {
                    Text("Spend pacing").flowdBody(.headline)
                    Spacer(minLength: 0)
                    Pill(label, systemImage: abs(gap) <= 0.12 ? "checkmark" : "gauge", tone: tone, style: .soft, size: .small)
                }
                MoneyText(cents: spent, style: FlowdFont.figureXL, state: .neutral, showsCents: false)
                Text("of \(Fmt.money(budget, showsCents: false)) budget across \(live.count) live bounties")
                    .flowdBody(.callout).flowdInk(.muted)
                FlowdProgressBar(progress: spentFrac, tone: .accent, height: 10, label: "Budget committed")
                Text("\(Fmt.percent(spentFrac)) of budget committed, \(Fmt.percent(timeFrac)) of the time window elapsed")
                    .flowdCaption(.footnote).flowdInk(.muted)
            }
        }
    }

    private func elapsedFraction(_ bounties: [Bounty]) -> Double {
        let now: Date = FlowdClock.shared.now
        var total: Double = 0
        var elapsed: Double = 0
        for b in bounties {
            let span: Double = b.endsAt.timeIntervalSince(b.startsAt)
            if span > 0 {
                total += span
                elapsed += min(max(now.timeIntervalSince(b.startsAt), 0), span)
            }
        }
        return total > 0 ? elapsed / total : 0
    }

    // MARK: KPIs

    private func recent(_ s: Snapshot, days: Int, offset: Int) -> [AppMetricsDaily] {
        let all: [AppMetricsDaily] = s.metrics
        let end: Int = max(all.count - offset, 0)
        let start: Int = max(end - days, 0)
        return Array(all[start..<end])
    }

    private func delta(_ now: Double, _ before: Double) -> FlowdDelta? {
        guard before > 0 else { return nil }
        return FlowdDelta((now - before) / before, vs: "prior 14 days")
    }

    private func kpiGrid(_ s: Snapshot) -> some View {
        let cur: [AppMetricsDaily] = recent(s, days: 14, offset: 0)
        let prev: [AppMetricsDaily] = recent(s, days: 14, offset: 14)
        let views: Double = Double(cur.reduce(0) { $0 + $1.views })
        let viewsPrev: Double = Double(prev.reduce(0) { $0 + $1.views })
        let installs: Double = Double(cur.reduce(0) { $0 + $1.installs })
        let installsPrev: Double = Double(prev.reduce(0) { $0 + $1.installs })
        let trials: Double = Double(cur.reduce(0) { $0 + $1.trials })
        let trialsPrev: Double = Double(prev.reduce(0) { $0 + $1.trials })
        let revenue: Int = cur.reduce(0) { $0 + $1.revenueCents }
        let viewSpark: [Double] = cur.map { Double($0.views) }
        let installSpark: [Double] = cur.map { Double($0.installs) }
        return VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
            SectionHeader("Last 14 days", subtitle: "Tracked conversions only")
            LazyVGrid(columns: FlowdGridColumns.two, spacing: FlowdSpacing.sm) {
                StatTile("Views", value: .compact(views), delta: delta(views, viewsPrev), deltaStyle: .neutral,
                         sparkline: viewSpark, systemImage: "eye.fill")
                StatTile("Installs", value: .compact(installs), delta: delta(installs, installsPrev), deltaStyle: .neutral,
                         sparkline: installSpark, systemImage: "arrow.down.app.fill")
                StatTile("Trials", value: .compact(trials), delta: delta(trials, trialsPrev), deltaStyle: .neutral,
                         systemImage: "sparkles")
                StatTile("First-payment revenue", value: .money(cents: revenue, state: .neutral), deltaStyle: .neutral,
                         systemImage: "dollarsign.circle.fill")
            }
        }
    }

    // MARK: Funnel

    private func funnelCard(_ s: Snapshot) -> some View {
        let cur: [AppMetricsDaily] = recent(s, days: 30, offset: 0)
        let views: Double = Double(cur.reduce(0) { $0 + $1.views })
        let clicks: Double = Double(cur.reduce(0) { $0 + $1.clicks })
        let installs: Double = Double(cur.reduce(0) { $0 + $1.installs })
        let estTrials: Double = Double(cur.reduce(0) { $0 + $1.estTrials })
        let estPaid: Double = Double(cur.reduce(0) { $0 + $1.estPaid })
        let stages: [FlowdFunnelStage] = [
            FlowdFunnelStage(label: "Views", value: views, attribution: .tracked),
            FlowdFunnelStage(label: "Clicks", value: clicks, attribution: .tracked),
            FlowdFunnelStage(label: "Installs", value: installs, attribution: .tracked),
            FlowdFunnelStage(label: "Trials (est.)", value: estTrials, attribution: .estimated),
            FlowdFunnelStage(label: "Paid (est.)", value: estPaid, attribution: .estimated)
        ]
        return VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
            SectionHeader("Funnel, last 30 days")
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                    FlowdFunnelChart(title: "Views to paid", stages: stages)
                    FlowdAttributionKey()
                    Text("Creators are paid on tracked link and code conversions only.")
                        .flowdCaption(.footnote).flowdInk(.muted)
                }
            }
        }
    }

    // MARK: Needs you

    @ViewBuilder
    private func needsYou(_ s: Snapshot) -> some View {
        let reviewing: [Submission] = s.submissions.filter { $0.status == .inReview }
        let unfunded: [Bounty] = s.bounties.filter { $0.status == .awaitingFunding }
        SectionHeader("Needs you", subtitle: "\(reviewing.count) in review, \(unfunded.count) awaiting funding")
        if reviewing.isEmpty && unfunded.isEmpty {
            EmptyStateView(systemImage: "checkmark.circle.fill", title: "You're all caught up",
                           message: "New submissions appear here the moment a creator sends one.", tone: .mint)
        } else {
            FlowdCard {
                VStack(spacing: 0) {
                    ForEach(unfunded, id: \.id) { b in
                        ListRow(title: "Fund \(b.title)", subtitle: "Creators can't submit until escrow covers it",
                                systemImage: "lock.open.fill", tone: .sun) {
                            MoneyText(cents: b.budgetCents, style: FlowdFont.figureSm, state: .escrowed, showsCents: false)
                        }
                        FlowdDivider(inset: 52)
                    }
                    ForEach(Array(reviewing.prefix(4).enumerated()), id: \.element.id) { index, sub in
                        if index > 0 { FlowdDivider(inset: 52) }
                        ListRow(title: sub.title, subtitle: bountyTitle(sub, s.bounties),
                                systemImage: "play.rectangle.fill", tone: .info) {
                            StatusPill(.inReview, size: .small)
                        }
                    }
                }
            }
        }
    }

    private func bountyTitle(_ sub: Submission, _ bounties: [Bounty]) -> String {
        let match: Bounty? = bounties.first(where: { $0.id == sub.bountyId })
        return match?.title ?? "Waiting for your decision"
    }
}

#Preview {
    NavigationStack {
        BrandOverviewView()
    }
    .flowdPreviewEnvironment(persona: AppPersona.brand)
}
