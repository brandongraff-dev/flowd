import Foundation

// Sample data for `#Preview` and view tests. Everything is a real row of the demo world: the hero rows are embedded (PreviewHeroes.swift, generated), the
// tables are decoded from the bundled fixtures, and the read-models a screen needs are either built synchronously here (feed card, wallet) or come from a
// frozen-clock `MockFlowdAPI` (`PreviewData.api()`), so a preview shows the same numbers the running app does. Only previews and tests read this file;
// shipping code never does.
//
//     #Preview { BountyCardView(item: PreviewData.feedItem) }
//     #Preview("Wallet") { WalletView(viewModel: WalletViewModel(api: PreviewData.api())) }

enum PreviewData {
    /// The demo world's "now": 2026-10-03T14:00:00Z.
    static let now: Date = FlowdClock.demoNow

    // MARK: Hero rows (embedded)

    /// Maya Reyes (@maya.makes), Silver, in Austin.
    static var creator: Creator {
        return PreviewHeroes.creator
    }

    static var user: User {
        return PreviewHeroes.user
    }

    /// Lumi, a verified brand.
    static var brand: Brand {
        return PreviewHeroes.brand
    }

    static var app: BrandApp {
        return PreviewHeroes.app
    }

    static var scorecard: BrandScorecard {
        return PreviewHeroes.scorecard
    }

    /// A live, funded view-and-conversion bounty ("glow up").
    static var bounty: Bounty {
        return PreviewHeroes.bounty
    }

    /// A flowd-funded starter bounty (the First-Dollar Path).
    static var starterBounty: Bounty {
        return PreviewHeroes.starterBounty
    }

    static var livePost: Post {
        return PreviewHeroes.livePost
    }

    static var clearedPost: Post {
        return PreviewHeroes.clearedPost
    }

    static var paidPost: Post {
        return PreviewHeroes.paidPost
    }

    static var approvedSubmission: Submission {
        return PreviewHeroes.approvedSubmission
    }

    static var inReviewSubmission: Submission {
        return PreviewHeroes.inReviewSubmission
    }

    static var changesSubmission: Submission {
        return PreviewHeroes.changesSubmission
    }

    static var rejectedSubmission: Submission {
        return PreviewHeroes.rejectedSubmission
    }

    static var clearedMoneyRow: MoneyClockRow {
        return PreviewHeroes.clearedMoneyRow
    }

    static var pendingMoneyRow: MoneyClockRow {
        return PreviewHeroes.pendingMoneyRow
    }

    static var scheduledPayout: Payout {
        return PreviewHeroes.scheduledPayout
    }

    static var inTransitPayout: Payout {
        return PreviewHeroes.inTransitPayout
    }

    /// A direct offer waiting on Maya.
    static var offer: Offer {
        return PreviewHeroes.offer
    }

    static var notification: AppNotification {
        return PreviewHeroes.notification
    }

    // MARK: Fixture tables

    static let loader: FixtureLoader = FixtureLoader()

    /// A fixture table, or an empty list (logged) when it cannot be read: a preview then shows its empty state instead of crashing.
    static func table<Row: Decodable>(_ name: String, as type: [Row].Type) -> [Row] {
        do {
            return try loader.load(type, named: name)
        } catch {
            FlowdLog.fixtures.error("PreviewData could not read \(name, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return []
        }
    }

    static let creators: [Creator] = table("creators", as: [Creator].self)
    static let brands: [Brand] = table("brands", as: [Brand].self)
    static let apps: [BrandApp] = table("apps", as: [BrandApp].self)
    static let scorecards: [BrandScorecard] = table("brand_scorecards", as: [BrandScorecard].self)
    static let bounties: [Bounty] = table("bounties", as: [Bounty].self)
    static let formats: [Format] = table("formats", as: [Format].self)
    static let hooks: [Hook] = table("hooks", as: [Hook].self)
    static let trends: [Trend] = table("trends", as: [Trend].self)
    static let lessons: [Lesson] = table("lessons", as: [Lesson].self)
    static let tournaments: [Tournament] = table("tournaments", as: [Tournament].self)
    static let crews: [Crew] = table("crews", as: [Crew].self)

    /// Live bounties, best-funded first.
    static var liveBounties: [Bounty] {
        return bounties.filter { (b: Bounty) -> Bool in
            return b.status == .live && b.funded && b.visibility == .open
        }.sorted { (a: Bounty, b: Bounty) -> Bool in
            return a.remainingCents > b.remainingCents
        }
    }

    /// Maya's posts, newest first.
    static var mayaPosts: [Post] {
        return table("posts", as: [Post].self).filter { (p: Post) -> Bool in
            return p.creatorId == creator.id
        }.sorted { (a: Post, b: Post) -> Bool in
            return a.postedAt > b.postedAt
        }
    }

    static var mayaSubmissions: [Submission] {
        return table("submissions", as: [Submission].self).filter { (s: Submission) -> Bool in
            return s.creatorId == creator.id
        }.sorted { (a: Submission, b: Submission) -> Bool in
            return a.updatedAt > b.updatedAt
        }
    }

    static var mayaMoneyRows: [MoneyClockRow] {
        return table("money_clock", as: [MoneyClockRow].self).filter { (r: MoneyClockRow) -> Bool in
            return r.creatorId == creator.id
        }
    }

    static var mayaPayouts: [Payout] {
        return table("payouts", as: [Payout].self).filter { (p: Payout) -> Bool in
            return p.creatorId == creator.id
        }.sorted { (a: Payout, b: Payout) -> Bool in
            return a.scheduledFor > b.scheduledFor
        }
    }

    static var mayaOffers: [Offer] {
        return table("offers", as: [Offer].self).filter { (o: Offer) -> Bool in
            return o.creatorId == creator.id
        }
    }

    static var mayaNotifications: [AppNotification] {
        return table("notifications", as: [AppNotification].self).filter { (n: AppNotification) -> Bool in
            return n.recipientUserId == user.id
        }.sorted { (a: AppNotification, b: AppNotification) -> Bool in
            return a.createdAt > b.createdAt
        }
    }

    // MARK: Read-models, built synchronously

    /// The few facts about a brand every card shows.
    static func brandCard(_ row: Brand = PreviewData.brand) -> BrandCard {
        let card: BrandScorecard? = scorecards.first(where: { (s: BrandScorecard) -> Bool in
            return s.brandId == row.id
        }) ?? (row.id == PreviewData.brand.id ? PreviewData.scorecard : nil)
        return BrandCard(
            id: row.id,
            name: row.name,
            logo: row.logo,
            kind: row.kind,
            verification: row.verification,
            reliabilityScore: card?.reliabilityScore,
            band: card?.band,
            decisionHoursMedian: card?.decisionHoursMedian,
            decidesInLabel: card.flatMap { (c: BrandScorecard) -> String? in
                return ReputationEngine.decidesInAbout(band: c.band, decisionHoursMedian: c.decisionHoursMedian)
            },
            badges: card?.badges ?? [],
            fundedAlways: card?.fundedAlways ?? false
        )
    }

    /// Expected pay per video at Maya's 28-day median of 14,200 views.
    static func expectedPay(for row: Bounty = PreviewData.bounty, medianViews: Int = 14_200) -> ExpectedPay {
        let e: ExpectedEarnings = EarningsEngine.expectedEarnings(
            baseMedianViews: medianViews,
            cpmCents: row.cpmCents,
            rates: row.cpaRates,
            perVideoCapCents: row.perVideoCapCents
        )
        return ExpectedPay(
            p25Cents: e.p25.payCents + row.flatFeeCents,
            medianCents: e.median.payCents + row.flatFeeCents,
            p75Cents: e.p75.payCents + row.flatFeeCents,
            medianViews: medianViews,
            cpmPartCents: e.median.cpmPayCents,
            cpaPartCents: e.median.cpaPayCents,
            flatFeeCents: row.flatFeeCents,
            capped: e.median.capped,
            basis: "Based on your 28-day median of " + Fmt.grouped(medianViews) + " views on TikTok.",
            disclaimer: EarningsEngine.disclaimer
        )
    }

    /// A bounty feed card for a bounty (a top match for Maya by default).
    static func feedItem(_ row: Bounty = PreviewData.bounty, matchScore: Int? = 82, locked: Bool = false, saved: Bool = false, joined: Bool = false) -> FeedItem {
        let brandRow: Brand = brands.first(where: { (b: Brand) -> Bool in
            return b.id == row.brandId
        }) ?? PreviewData.brand
        let appRow: BrandApp = apps.first(where: { (a: BrandApp) -> Bool in
            return a.id == row.appId
        }) ?? PreviewData.app
        let card: BrandCard = brandCard(brandRow)
        return FeedItem(
            bounty: row,
            brand: card,
            appName: appRow.name,
            appIcon: appRow.icon,
            matchScore: locked ? nil : matchScore,
            isTopPick: !locked && MatchEngine.isTopPick(matchScore),
            reasons: locked ? [] : ["Matches your niche.", "Pays at or above what you usually earn.", "The brand decides fast and pays on time."],
            locked: locked,
            lockReasons: locked ? [MatchGate.eligibilityTier.text] : [],
            gateFailures: locked ? [.eligibilityTier] : [],
            visibleAt: row.startsAt,
            expectedPay: expectedPay(for: row),
            spotsLeft: row.spotsLeft,
            saved: saved,
            joined: joined,
            claimedUntil: nil,
            submissionId: nil,
            decidesInLabel: card.decidesInLabel
        )
    }

    /// A handful of live bounties as feed cards.
    static var feedItems: [FeedItem] {
        return Array(liveBounties.prefix(8)).enumerated().map { (entry: (offset: Int, element: Bounty)) -> FeedItem in
            return feedItem(entry.element, matchScore: Swift.max(48, 91 - entry.offset * 6), locked: false, saved: entry.offset == 2, joined: false)
        }
    }

    /// The Wallet at the demo world's "now": Cleared and Pending side by side.
    static var walletSummary: WalletSummary {
        let rows: [MoneyClockRow] = mayaMoneyRows
        let summary: MoneyClockSummary = MoneyClockEngine.summarize(rows, now: now)
        var nextCents: Int = 0
        if let next = summary.nextClearingAt {
            for row in rows where (row.state == .accruing || row.state == .pending) && row.etaAt == next {
                nextCents += row.amountCents
            }
        }
        let paidOut: Int = mayaPayouts.filter { (p: Payout) -> Bool in
            return p.status == .paid || p.status == .inTransit
        }.reduce(0) { (total: Int, p: Payout) -> Int in
            return total + p.netCents
        }
        return WalletSummary(
            asOf: now,
            tier: creator.tier,
            accruingCents: summary.accruingCents,
            pendingCents: summary.pendingCents,
            clearedCents: summary.clearedCents,
            heldCents: summary.heldCents,
            paidOutCents: paidOut,
            lifetimeClearedCents: creator.lifetimeClearedCents,
            nextClearsAt: summary.nextClearingAt,
            nextClearsCents: nextCents,
            nextPayoutAt: MoneyClockEngine.nextWeeklyPayout(after: now),
            nextPayoutCents: summary.clearedCents,
            holds: [],
            blockers: [],
            payoutMethod: creator.payoutMethod,
            instantPreview: nil,
            freeInstantUsedThisWeek: 0
        )
    }

    // MARK: APIs

    /// A fresh, signed-in mock API on a frozen clock at the demo "now". Every preview that mutates gets its own, so previews never leak state into each other.
    static func api(signedIn: Bool = true) -> MockFlowdAPI {
        return APIClientFactory.makePreviewMock(signedIn: signedIn)
    }
}
