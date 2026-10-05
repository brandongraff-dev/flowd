import SwiftUI

/// Wallet: the Money Clock. Pending, cleared and paid stay separate; earnings chart; per-post rows with dated ETAs.
struct WalletView: View {
    @Environment(\.flowdAPI) private var api
    @Environment(Router.self) private var router: Router?
    @Environment(AppState.self) private var appState: AppState?

    @State private var wallet: WalletSummary?
    @State private var report: EarningsReport?
    @State private var posts: [PostListItem] = []
    @State private var period: EarningsPeriod = EarningsPeriod.week
    @State private var errorText: String?

    var body: some View {
        FlowdScreen {
            if let wallet = wallet {
                content(wallet)
            } else if let errorText = errorText {
                ErrorStateView(title: "Couldn't load your Wallet", message: errorText) {
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
        .flowdNavigationTitle("Wallet", large: true)
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: period) { _, _ in
            Task { await loadReport() }
        }
    }

    private var numbersHidden: Bool { appState?.numbersHidden ?? false }

    // MARK: Loading

    private func load() async {
        do {
            let w: WalletSummary = try await api.wallet()
            wallet = w
            errorText = nil
        } catch let error as FlowdAPIError {
            if wallet == nil { errorText = error.userMessage }
        } catch {
            if wallet == nil { errorText = "Check your connection and try again." }
        }
        await loadReport()
        if let list = try? await api.posts(filter: PostFilter.all) {
            posts = list
        }
    }

    private func loadReport() async {
        if let r = try? await api.earnings(period: period) {
            report = r
        }
    }

    // MARK: Content

    @ViewBuilder
    private func content(_ w: WalletSummary) -> some View {
        clockCard(w)
        if !w.holds.isEmpty || !w.blockers.isEmpty {
            attentionCard(w)
        }
        chartCard
        postsSection
    }

    private func clockCard(_ w: WalletSummary) -> some View {
        let pending: Int = w.pendingCents + w.accruingCents
        let note: String? = Fmt.etaLine(state: .pending, etaAt: w.nextClearsAt)
        return FlowdCard {
            VStack(alignment: .leading, spacing: FlowdSpacing.md) {
                Text("Money Clock").flowdBody(.headline)
                if numbersHidden {
                    Text("Numbers are off. Turn them back on in Wellbeing to see your money.")
                        .flowdBody(.callout).flowdInk(.muted)
                } else {
                    FlowdEarningsPair(clearedCents: w.clearedCents, pendingCents: pending, pendingNote: note)
                    FlowdDivider()
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Paid out").flowdCaption(.footnote).flowdInk(.muted)
                            MoneyText(cents: w.paidOutCents, style: FlowdFont.figureMd, state: .paid)
                        }
                        Spacer(minLength: 0)
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("Next weekly payout").flowdCaption(.footnote).flowdInk(.muted)
                            Text("\(Fmt.money(w.nextPayoutCents)) \u{00B7} \(Fmt.clockLabel(w.nextPayoutAt))")
                                .flowdBody(.subheadline)
                        }
                    }
                }
                FlowdButton("Cash out", systemImage: "bolt.fill", variant: .primary, fullWidth: true) {
                    router?.present(.instantCashOut)
                }
            }
        }
    }

    private func attentionCard(_ w: WalletSummary) -> some View {
        FlowdCard {
            VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
                Text("Needs attention").flowdBody(.headline)
                ForEach(Array(w.holds.enumerated()), id: \.offset) { _, hold in
                    ListRow(title: "\(Fmt.money(hold.cents)) held", subtitle: hold.nextStep,
                            systemImage: "pause.circle.fill", tone: .ember)
                }
                ForEach(Array(w.blockers.enumerated()), id: \.offset) { _, blocker in
                    ListRow(title: blockerTitle(blocker), subtitle: "Needed before your next payout",
                            systemImage: "exclamationmark.circle.fill", tone: .sun)
                }
            }
        }
    }

    private func blockerTitle(_ b: PayoutBlocker) -> String {
        switch b {
        case .taxInfo: return "Add your tax info (W-9)"
        case .identity: return "Verify your identity"
        case .payoutMethod: return "Add a payout method"
        }
    }

    // MARK: Chart

    private var chartCard: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
            SectionHeader("Earnings")
            SegmentedPicker(selection: $period, values: [EarningsPeriod.day, EarningsPeriod.week, EarningsPeriod.month]) { value in
                periodTitle(value)
            }
            FlowdCard {
                chartBody
            }
        }
    }

    @ViewBuilder
    private var chartBody: some View {
        if let r = report, !r.buckets.isEmpty, !numbersHidden {
            let points: [FlowdTimePoint] = r.buckets.map { FlowdTimePoint(date: $0.start, value: Double($0.earnedCents)) }
            VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                FlowdAreaChart(title: "Earned per \(periodTitle(period).lowercased())", points: points,
                               format: .moneyCents, tone: .good, height: 180)
                Text("Net \(Fmt.money(r.netCents)) after \(Fmt.money(r.feesCents)) in fees. \(r.disclaimer)")
                    .flowdCaption(.footnote).flowdInk(.muted)
            }
        } else {
            Text(numbersHidden ? "Numbers are off." : "Your earnings chart appears after your first post clears.")
                .flowdBody(.callout).flowdInk(.muted)
        }
    }

    private func periodTitle(_ p: EarningsPeriod) -> String {
        switch p {
        case .day: return "Day"
        case .week: return "Week"
        case .month: return "Month"
        }
    }

    // MARK: Posts

    @ViewBuilder
    private var postsSection: some View {
        SectionHeader("By post", subtitle: "Pending shows the day it clears")
        if posts.isEmpty {
            EmptyStateView(systemImage: "creditcard", title: "Your first payout lands here",
                           message: "Post a take and its money appears with a clear date.",
                           actionTitle: "Browse bounties") {
                router?.open(.bounties)
            }
        } else {
            FlowdCard {
                VStack(spacing: 0) {
                    ForEach(Array(posts.prefix(8).enumerated()), id: \.element.id) { index, p in
                        if index > 0 { FlowdDivider(inset: 52) }
                        postRow(p)
                    }
                }
            }
        }
    }

    private func postRow(_ p: PostListItem) -> some View {
        let eta: String = Fmt.etaLine(state: p.moneyState, etaAt: p.clearsAt) ?? p.reasonLabel
        return ListRow(title: p.bountyTitle, subtitle: "\(p.brand.name) \u{00B7} \(eta)",
                       systemImage: "play.rectangle.fill", tone: .info) {
            if numbersHidden {
                Text("Hidden").flowdCaption(.footnote).flowdInk(.muted)
            } else {
                MoneyText(cents: p.earningsCents, style: FlowdFont.figureSm, state: p.moneyState.flowdMoneyState)
            }
        }
    }
}

#Preview {
    NavigationStack {
        WalletView()
    }
    .flowdPreviewEnvironment()
}
