import Foundation

// Read-model builders shared by the mock API's endpoints: brand cards, expected pay, feed items, creator summaries, typical earnings.

extension MockFlowdAPI {
    /// The few facts about a brand every card shows.
    func brandCard(_ brandId: String) throws -> BrandCard {
        let brand: Brand = try brandRow(brandId)
        let card: BrandScorecard? = try scorecard(for: brandId)
        var decides: String? = nil
        if let sc = card {
            decides = ReputationEngine.decidesInAbout(band: sc.band, decisionHoursMedian: sc.decisionHoursMedian)
        }
        return BrandCard(
            id: brand.id,
            name: brand.name,
            logo: brand.logo,
            kind: brand.kind,
            verification: brand.verification,
            reliabilityScore: card?.reliabilityScore,
            band: card?.band,
            decisionHoursMedian: card?.decisionHoursMedian,
            decidesInLabel: decides,
            badges: card?.badges ?? [],
            fundedAlways: card?.fundedAlways ?? false
        )
    }

    /// Expected pay per video for this creator on a bounty. An estimate; the cap applies; results vary.
    func expectedPay(for bounty: Bounty) throws -> ExpectedPay {
        let linked: [SocialAccount] = try myAccounts().filter { (a: SocialAccount) -> Bool in
            return a.status == .connected && bounty.deliverables.platforms.contains(a.platform)
        }
        let best: SocialAccount? = linked.max(by: { (x: SocialAccount, y: SocialAccount) -> Bool in
            return x.medianViews28d < y.medianViews28d
        })
        var views: Int = best?.medianViews28d ?? 0
        let basis: String
        if let account = best, views > 0 {
            basis = "Based on your 28-day median of " + Fmt.grouped(views) + " views on " + account.platform.label + "."
        } else {
            views = bounty.payMath.expectedViewsMedian
            basis = "Based on " + bounty.payMath.basis + ". Link an account for your own estimate."
        }
        let e: ExpectedEarnings = EarningsEngine.expectedEarnings(
            baseMedianViews: views,
            cpmCents: bounty.cpmCents,
            rates: bounty.cpaRates,
            perVideoCapCents: bounty.perVideoCapCents
        )
        let flat: Int = bounty.flatFeeCents
        return ExpectedPay(
            p25Cents: e.p25.payCents + flat,
            medianCents: e.median.payCents + flat,
            p75Cents: e.p75.payCents + flat,
            medianViews: views,
            cpmPartCents: e.median.cpmPayCents,
            cpaPartCents: e.median.cpaPayCents,
            flatFeeCents: flat,
            capped: e.median.capped,
            basis: basis,
            disclaimer: EarningsEngine.disclaimer
        )
    }

    /// Brand id -> Scorecard reliability (0 to 100), for the match score.
    func brandReliabilityMap() throws -> [String: Int] {
        var out: [String: Int] = [:]
        for card in try store.scorecards.all() {
            out[card.brandId] = card.reliabilityScore
        }
        return out
    }

    /// Bounty ids the creator already has work on (a rejected submission still counts; withdrawn and expired do not).
    func submittedBountyIds() throws -> Set<String> {
        var ids: Set<String> = []
        for submission in try mySubmissions() {
            switch submission.status {
            case .withdrawn, .expired, .released:
                continue
            default:
                ids.insert(submission.bountyId)
            }
        }
        return ids
    }

    /// Matches (gates, score, expected pay) for these bounties, keyed by bounty id.
    func matches(for bounties: [Bounty], includeHidden: Bool = true) throws -> [String: BountyMatch] {
        let creator: Creator = try meRow()
        let ranked: [BountyMatch] = MatchEngine.rank(
            creator: creator,
            accounts: try myAccounts(),
            bounties: bounties,
            brandReliability: try brandReliabilityMap(),
            submittedBountyIds: try submittedBountyIds(),
            now: now,
            includeHidden: includeHidden
        )
        var out: [String: BountyMatch] = [:]
        for match in ranked {
            out[match.bountyId] = match
        }
        return out
    }

    /// A feed card for one bounty.
    func feedItem(_ bounty: Bounty, match: BountyMatch?, saves: [BountySave], submissions: [Submission]) throws -> FeedItem {
        let brand: BrandCard = try brandCard(bounty.brandId)
        let app: BrandApp = try appRow(bounty.appId)
        let save: BountySave? = saves.first(where: { (s: BountySave) -> Bool in
            return s.bountyId == bounty.id
        })
        let submission: Submission? = submissions.first(where: { (s: Submission) -> Bool in
            return s.bountyId == bounty.id && s.isOpen
        })
        let pay: ExpectedPay = try expectedPay(for: bounty)
        let resolved: BountyMatch
        if let given = match {
            resolved = given
        } else {
            let found: [String: BountyMatch] = try matches(for: [bounty])
            if let first = found[bounty.id] {
                resolved = first
            } else {
                resolved = BountyMatch(
                    bountyId: bounty.id,
                    score: nil,
                    locked: true,
                    gateFailures: [.funded],
                    lockReasons: [MatchGate.funded.text],
                    factors: MatchFactors(niche: 0, platform: 0, region: 0, price: 0, brandReliability: 0, recency: 0),
                    points: MatchFactors(niche: 0, platform: 0, region: 0, price: 0, brandReliability: 0, recency: 0),
                    expectedPay: ExpectedPayCents(p25: pay.p25Cents, median: pay.medianCents, p75: pay.p75Cents),
                    reasons: [],
                    visibleAt: bounty.startsAt,
                    visible: true
                )
            }
        }
        // A saved or joined bounty that is already submitted is not "locked" by the not-already-submitted gate in the list.
        return FeedItem(
            bounty: bounty,
            brand: brand,
            appName: app.name,
            appIcon: app.icon,
            matchScore: resolved.score,
            isTopPick: MatchEngine.isTopPick(resolved.score),
            reasons: resolved.reasons,
            locked: resolved.locked,
            lockReasons: resolved.lockReasons,
            gateFailures: resolved.gateFailures,
            visibleAt: resolved.visibleAt,
            expectedPay: pay,
            spotsLeft: bounty.spotsLeft,
            saved: save != nil,
            joined: save?.stage == .joined || save?.stage == .submitted,
            claimedUntil: save?.claimedUntil,
            submissionId: submission?.id,
            decidesInLabel: brand.decidesInLabel
        )
    }

    /// A short public card of any creator.
    func creatorSummary(_ creatorId: String) throws -> CreatorSummary? {
        guard let creator = try store.creators.find(creatorId) else {
            return nil
        }
        return CreatorSummary(
            id: creator.id,
            handle: creator.handle,
            displayName: creator.displayName,
            avatar: creator.avatar,
            tier: creator.tier,
            founding: creator.founding,
            niches: creator.niches
        )
    }

    /// What creators typically clear in 30 days, from the public payout ticker. Always shown beside a top example.
    func typicalBand() throws -> TypicalBand {
        let totals: TickerTotals = try store.ticker().totals
        return TypicalBand(
            n: totals.activeCreators30d,
            p25Cents: totals.p25Creator30dCents,
            medianCents: totals.typicalCreator30dCents,
            p75Cents: totals.p75Creator30dCents,
            p90Cents: totals.topDecileCreator30dCents
        )
    }

    /// The Platform-appropriate label of a handle for copy.
    func platformHandleText(_ account: SocialAccount) -> String {
        return account.platform.label + " " + Fmt.handle(account.handle)
    }
}
