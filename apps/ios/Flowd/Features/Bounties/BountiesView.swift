import SwiftUI

/// The ranked bounty feed: rate and cap, expected earnings, budget bar, Funded badge, tier locks.
struct BountiesView: View {
    @Environment(\.flowdAPI) private var api
    @Environment(Router.self) private var router: Router?
    @Environment(AppState.self) private var appState: AppState?

    @State private var items: [FeedItem] = []
    @State private var loaded: Bool = false
    @State private var errorText: String?
    @State private var sort: FeedSort = FeedSort.match

    var body: some View {
        FlowdScreen {
            header
            if !loaded && errorText == nil {
                FlowdCard {
                    VStack(spacing: 0) {
                        SkeletonRow()
                        SkeletonRow()
                        SkeletonRow()
                    }
                }
            } else if let errorText = errorText, items.isEmpty {
                ErrorStateView(title: "Couldn't load bounties", message: errorText) {
                    Task { await load() }
                }
            } else if items.isEmpty {
                EmptyStateView(systemImage: "target", title: "No bounties match right now",
                               message: "New funded bounties land every day. Check back after the Daily Drop.")
            } else {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    bountyCard(item, rank: index + 1)
                }
            }
        }
        .flowdNavigationTitle("Bounties", large: true)
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: sort) { _, _ in
            Task { await load() }
        }
    }

    private func load() async {
        var query: FeedQuery = appState?.feedQuery ?? FeedQuery()
        query.sort = sort
        do {
            let page: Page<FeedItem> = try await api.feed(query)
            items = page.data
            errorText = nil
        } catch let error as FlowdAPIError {
            errorText = error.userMessage
        } catch {
            errorText = "Check your connection and try again."
        }
        loaded = true
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
            Text("Ranked by how well each one fits you. Only funded bounties pay.")
                .flowdBody(.callout).flowdInk(.muted)
            SegmentedPicker(selection: $sort, values: [FeedSort.match, FeedSort.pay, FeedSort.endingSoon, FeedSort.newest]) { value in
                sortTitle(value)
            }
        }
    }

    private func sortTitle(_ s: FeedSort) -> String {
        switch s {
        case .match: return "Best match"
        case .pay: return "Pay"
        case .endingSoon: return "Ending"
        case .newest: return "Newest"
        }
    }

    // MARK: Card

    private func bountyCard(_ item: FeedItem, rank: Int) -> some View {
        Button {
            router?.push(.bounty(id: item.bounty.id))
        } label: {
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                    topRow(item, rank: rank)
                    rateRow(item)
                    budgetBar(item.bounty)
                    footer(item)
                }
            }
        }
        .buttonStyle(FlowdPressStyle())
    }

    private func topRow(_ item: FeedItem, rank: Int) -> some View {
        HStack(alignment: .top, spacing: FlowdSpacing.sm) {
            ThumbArt(item.bounty.art, aspect: .square, cornerRadius: FlowdRadius.md, showsText: false, isDecorative: true)
                .frame(width: 56, height: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text("#\(rank) \u{00B7} \(item.brand.name)").flowdCaption(.footnote).flowdInk(.muted)
                Text(item.bounty.title).flowdBody(.headline).lineLimit(2)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: FlowdSpacing.xxs) {
                if item.bounty.funded {
                    StatusPill(.funded, size: .small)
                }
                if item.isTopPick {
                    Pill("Top pick", systemImage: "star.fill", tone: .sun, style: .soft, size: .small)
                }
            }
        }
    }

    private func rateRow(_ item: FeedItem) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: FlowdSpacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Typical pay").flowdCaption(.caption1).flowdInk(.muted)
                MoneyText(cents: item.expectedPay.medianCents, style: FlowdFont.figureMd, state: .neutral, showsCents: false)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Rate").flowdCaption(.caption1).flowdInk(.muted)
                Text(Fmt.cpm(item.bounty.cpmCents)).flowdFigure(.xs)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Cap per video").flowdCaption(.caption1).flowdInk(.muted)
                Text(Fmt.money(item.bounty.perVideoCapCents, showsCents: false)).flowdFigure(.xs)
            }
            Spacer(minLength: 0)
        }
    }

    private func budgetBar(_ b: Bounty) -> some View {
        let total: Int = max(b.budgetCents, 1)
        let used: Double = min(max(1.0 - Double(b.remainingCents) / Double(total), 0.0), 1.0)
        return VStack(alignment: .leading, spacing: FlowdSpacing.xxs) {
            FlowdProgressBar(progress: used, tone: .accent, height: 6, label: "Budget used")
            Text("\(Fmt.moneyCompact(b.remainingCents)) of \(Fmt.moneyCompact(b.budgetCents)) left")
                .flowdCaption(.caption1).flowdInk(.muted)
        }
    }

    @ViewBuilder
    private func footer(_ item: FeedItem) -> some View {
        HStack(spacing: FlowdSpacing.xs) {
            if item.locked {
                Pill(item.lockReasons.first ?? "Locked for your tier", systemImage: "lock.fill", tone: .neutral, style: .outline, size: .small)
            } else {
                Pill("\(item.spotsLeft) spots left", systemImage: "person.2.fill", tone: .neutral, style: .soft, size: .small)
            }
            if let decides = item.decidesInLabel {
                Pill(decides, systemImage: "clock", tone: .info, style: .soft, size: .small)
            }
            Spacer(minLength: 0)
        }
    }
}

#Preview {
    NavigationStack {
        BountiesView()
    }
    .flowdPreviewEnvironment()
}
