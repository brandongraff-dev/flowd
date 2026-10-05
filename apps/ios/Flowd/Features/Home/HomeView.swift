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
        .flowdNavigationTitle("Home", large: false)
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
            AvatarView(seed: s.creator.id, name: s.creator.displayName, size: 44, tier: s.creator.tier.flowdLevel)
            Text(first).flowdDisplay(.title2)
            Spacer(minLength: 0)
            if weeks > 0 {
                HStack(spacing: FlowdSpacing.xs) {
                    FlowdIconBadge("flame.fill", tone: .ember, size: 36)
                    Text("\(weeks)").flowdFigure(.sm)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(weeks)-week streak")
            }
        }
    }

    // MARK: Earnings

    private func earningsCard(_ w: WalletSummary) -> some View {
        let pending: Int = w.pendingCents + w.accruingCents
        return Button {
            router?.open(.wallet)
        } label: {
            FlowdCard(padding: FlowdSpacing.lg) {
                VStack(alignment: .leading, spacing: FlowdSpacing.md) {
                    if numbersHidden {
                        HStack(spacing: FlowdSpacing.sm) {
                            FlowdIconBadge("eye.slash.fill", tone: .neutral, size: 44)
                            Text("Numbers are off").flowdBody(.callout).flowdInk(.muted)
                        }
                    } else {
                        HStack(alignment: .center, spacing: FlowdSpacing.sm) {
                            FlowdIconBadge("checkmark.seal.fill", tone: .mint, size: 52)
                            MoneyText(cents: w.clearedCents, style: FlowdFont.figureXL, state: .cleared, showsGlyph: false)
                            Spacer(minLength: 0)
                        }
                        HStack(spacing: FlowdSpacing.sm) {
                            earningsTile(icon: "clock.fill", tone: .info, cents: pending,
                                         state: .pending, caption: w.nextClearsAt.map { Fmt.clockLabel($0) })
                            earningsTile(icon: "arrow.down.circle.fill", tone: .mint, cents: w.nextClearsCents,
                                         state: .neutral, caption: nil)
                        }
                    }
                }
            }
        }
        .buttonStyle(FlowdPressStyle())
    }

    private func earningsTile(icon: String, tone: FlowdTone, cents: Int, state: FlowdMoneyState, caption: String?) -> some View {
        return HStack(spacing: FlowdSpacing.xs) {
            FlowdIconBadge(icon, tone: tone, size: 34)
            VStack(alignment: .leading, spacing: 0) {
                MoneyText(cents: cents, style: FlowdFont.figureSm, state: state, showsGlyph: false)
                if let caption = caption {
                    Text(caption).flowdCaption(.caption2).flowdInk(.muted)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(FlowdSpacing.sm)
        .background {
            RoundedRectangle(cornerRadius: FlowdRadius.lg, style: .continuous).fill(FlowdColor.surfaceField)
        }
    }

    // MARK: Daily Drop

    private func dropCard(_ d: DailyDropView) -> some View {
        let isLive: Bool = d.state == .live
        let target: Date = isLive ? d.claimWindowEndsAt : d.releaseAt
        let total: Int = max(d.drop.spotsTotal, 1)
        let left: Int = d.drop.spotsLeft
        return Button {
            router?.push(.dailyDrop)
        } label: {
            FlowdCard(padding: FlowdSpacing.md, tint: FlowdColor.emberSolid) {
                HStack(spacing: FlowdSpacing.md) {
                    ProgressRing(progress: Double(left) / Double(total), size: 76, lineWidth: 7, tone: .ember) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(FlowdColor.ember)
                    }
                    VStack(alignment: .leading, spacing: FlowdSpacing.xxs) {
                        CountdownLabel(to: target, style: .compact, textStyle: FlowdFont.figureMd, tone: .ember)
                        HStack(spacing: FlowdSpacing.xxs) {
                            Image(systemName: "person.2.fill").font(.system(size: 13, weight: .semibold))
                            Text("\(left)").flowdBody(.subheadline)
                        }
                        .flowdInk(.muted)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.system(size: 14, weight: .bold)).flowdInk(.muted)
                }
            }
        }
        .buttonStyle(FlowdPressStyle())
        .accessibilityLabel("Daily Drop, \(left) spots left")
    }

    // MARK: Matched bounties

    @ViewBuilder
    private func matchedSection(_ items: [FeedItem]) -> some View {
        SectionHeader("For you", actionTitle: "See all") {
            router?.open(.bounties)
        }
        if items.isEmpty {
            EmptyStateView(systemImage: "target", title: "No matches yet",
                           message: "Link an account and pick niches to see bounties that fit.")
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: FlowdSpacing.sm) {
                    ForEach(items.prefix(6)) { (item: FeedItem) in
                        matchedCard(item)
                    }
                }
                .padding(.horizontal, FlowdLayout.gutter)
            }
            .padding(.horizontal, -FlowdLayout.gutter)
        }
    }

    private func matchedCard(_ item: FeedItem) -> some View {
        return Button {
            router?.push(.bounty(id: item.bounty.id))
        } label: {
            ZStack(alignment: .bottomLeading) {
                ThumbArt(item.bounty.art, aspect: .card, cornerRadius: FlowdRadius.xl, showsText: false, isDecorative: true)
                LinearGradient(colors: [Color.clear, FlowdPrimitive.black.opacity(0.78)], startPoint: .center, endPoint: .bottom)
                    .clipShape(RoundedRectangle(cornerRadius: FlowdRadius.xl, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    MoneyText(cents: item.expectedPay.medianCents, style: FlowdFont.figureMd, state: .neutral, showsCents: false, showsGlyph: false)
                    Text(item.bounty.title).flowdCaption(.footnote).flowdInk(.muted).lineLimit(1)
                }
                .padding(FlowdSpacing.sm)
            }
            .frame(width: 176)
            .overlay {
                RoundedRectangle(cornerRadius: FlowdRadius.xl, style: .continuous)
                    .strokeBorder(FlowdColor.rim, lineWidth: 1)
            }
        }
        .buttonStyle(FlowdPressStyle())
        .accessibilityLabel("\(item.bounty.title), \(Fmt.money(item.expectedPay.medianCents)) typical")
    }
}

#Preview {
    NavigationStack {
        HomeView()
    }
    .flowdPreviewEnvironment()
}
