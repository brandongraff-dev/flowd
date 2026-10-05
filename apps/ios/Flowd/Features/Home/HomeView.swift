import SwiftUI

/// Creator Home: greeting, earnings (Cleared and Pending side by side, never summed), Daily Drop, matched bounties.
struct HomeView: View {
    @Environment(\.flowdAPI) private var api
    @Environment(Router.self) private var router: Router?
    @Environment(AppState.self) private var appState: AppState?

    @State private var summary: HomeSummary?
    @State private var errorText: String?

    var body: some View {
        FlowdScreen {
            if let summary = summary {
                content(summary)
            } else if let errorText = errorText {
                ErrorStateView(title: "Couldn't load Home", message: errorText) {
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
        .flowdNavigationTitle("Home", large: true)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let result: HomeSummary = try await api.homeSummary()
            summary = result
            errorText = nil
        } catch let error as FlowdAPIError {
            if summary == nil { errorText = error.userMessage }
        } catch {
            if summary == nil { errorText = "Check your connection and try again." }
        }
    }

    private var numbersHidden: Bool { appState?.numbersHidden ?? false }

    @ViewBuilder
    private func content(_ s: HomeSummary) -> some View {
        greeting(s)
        earningsCard(s.wallet)
        if let drop = s.drop {
            dropCard(drop)
        }
        matchedSection(s.matched)
    }

    // MARK: Greeting

    private func greeting(_ s: HomeSummary) -> some View {
        let first: String = s.creator.displayName.split(separator: " ").first.map(String.init) ?? s.creator.displayName
        let weeks: Int = s.streak.streak.currentWeeks
        return HStack(spacing: FlowdSpacing.sm) {
            AvatarView(seed: s.creator.id, name: s.creator.displayName, size: 48, tier: s.creator.tier.flowdLevel)
            VStack(alignment: .leading, spacing: 2) {
                Text("Hi, \(first)").flowdDisplay(.title2)
                Text("\(s.creator.tier.label) tier").flowdCaption(.footnote).flowdInk(.muted)
            }
            Spacer(minLength: 0)
            if weeks > 0 {
                Pill("\(weeks)-week streak", systemImage: "flame.fill", tone: .ember, style: .soft)
            }
        }
    }

    // MARK: Earnings

    private func earningsCard(_ w: WalletSummary) -> some View {
        let pending: Int = w.pendingCents + w.accruingCents
        let note: String? = Fmt.etaLine(state: .pending, etaAt: w.nextClearsAt)
        return Button {
            router?.open(.wallet)
        } label: {
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                    Text("Your earnings").flowdBody(.headline)
                    if numbersHidden {
                        Text("Numbers are off. Open Wallet to see your money.").flowdBody(.callout).flowdInk(.muted)
                    } else {
                        FlowdEarningsPair(clearedCents: w.clearedCents, pendingCents: pending, pendingNote: note)
                        if w.nextClearsCents > 0, let at = w.nextClearsAt {
                            Text("Next up: \(Fmt.money(w.nextClearsCents)) clears \(Fmt.clockLabel(at))")
                                .flowdCaption(.footnote).flowdInk(.muted)
                        }
                    }
                }
            }
        }
        .buttonStyle(FlowdPressStyle())
    }

    // MARK: Daily Drop

    private func dropCard(_ d: DailyDropView) -> some View {
        let isLive: Bool = d.state == .live
        let target: Date = isLive ? d.claimWindowEndsAt : d.releaseAt
        let spotsLeft: Int = d.drop.spotsLeft
        return Button {
            router?.push(.dailyDrop)
        } label: {
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                    HStack {
                        Pill("Daily Drop", systemImage: "sparkles", tone: .ember, style: .soft)
                        Spacer(minLength: 0)
                        if isLive {
                            Pill("\(spotsLeft) spots left", tone: .neutral, style: .outline, size: .small)
                        }
                    }
                    Text(d.drop.headline).flowdDisplay(.title3)
                    HStack(spacing: FlowdSpacing.xxs) {
                        Text(isLive ? "Claim window closes in" : "Next drop in").flowdBody(.callout).flowdInk(.muted)
                        CountdownLabel(to: target, style: .compact, textStyle: FlowdFont.figureSm, tone: .ember)
                    }
                    if let note = d.headStartNote {
                        Text(note).flowdCaption(.footnote).flowdInk(.muted)
                    }
                }
            }
        }
        .buttonStyle(FlowdPressStyle())
    }

    // MARK: Matched bounties

    @ViewBuilder
    private func matchedSection(_ items: [FeedItem]) -> some View {
        SectionHeader("Matched for you", subtitle: "Ranked by how well they fit your niches", actionTitle: "See all") {
            router?.open(.bounties)
        }
        if items.isEmpty {
            EmptyStateView(systemImage: "target", title: "No matches yet",
                           message: "Link an account and pick niches to see bounties that fit.")
        } else {
            FlowdCard {
                VStack(spacing: 0) {
                    ForEach(Array(items.prefix(4).enumerated()), id: \.element.id) { index, item in
                        if index > 0 { FlowdDivider(inset: 52) }
                        matchedRow(item)
                    }
                }
            }
        }
    }

    private func matchedRow(_ item: FeedItem) -> some View {
        Button {
            router?.push(.bounty(id: item.bounty.id))
        } label: {
            ListRow(title: item.bounty.title,
                    subtitle: "\(item.brand.name) \u{00B7} \(Fmt.cpm(item.bounty.cpmCents))",
                    systemImage: "target", tone: .accent) {
                VStack(alignment: .trailing, spacing: 2) {
                    MoneyText(cents: item.expectedPay.medianCents, style: FlowdFont.figureSm, state: .neutral, showsCents: false)
                    Text("typical").flowdCaption(.caption2).flowdInk(.muted)
                }
            }
        }
        .buttonStyle(FlowdPressStyle())
    }
}

#Preview {
    NavigationStack {
        HomeView()
    }
    .flowdPreviewEnvironment()
}
