import Foundation

// BountiesAPI: the feed, a bounty's detail, Pay Math, Brand Scorecards, saves, joining ("Make it") and the Daily Drop. Matching, gates and Reserved Slot
// maths come from the engine; nothing here invents a number.

extension MockFlowdAPI {
    // MARK: Eligibility

    /// An accepted offer on a bounty makes a private or invite-only bounty open to this creator.
    func holdsAcceptedOffer(_ bountyId: String) -> Bool {
        let offers: [Offer] = (try? myOffers()) ?? []
        return offers.contains(where: { (o: Offer) -> Bool in
            return o.bountyId == bountyId && (o.status == .accepted || o.status == .completed)
        })
    }

    /// Throws unless this creator may take this bounty now: funded and live, invited when it is private, past their tier's head start, all five gates
    /// open, no video already in play, and a Reserved Slot left in the pool.
    func ensureEligible(_ bounty: Bounty) throws {
        guard bounty.status == .live, bounty.funded else {
            throw FlowdAPIError.bountyNotFunded
        }
        if bounty.visibility == .private || bounty.visibility == .inviteOnly {
            if !holdsAcceptedOffer(bounty.id) {
                let text: String = bounty.visibility == .private ? "This bounty is private to the creator it was offered to." : "This bounty is invite-only. Brands send invites from their creator list."
                throw FlowdAPIError.forbidden(text)
            }
        }
        let found: [String: BountyMatch] = try matches(for: [bounty], includeHidden: true)
        if let match = found[bounty.id] {
            if !match.visible {
                let when: String = Fmt.clockLabelUTC(match.visibleAt)
                throw FlowdAPIError.tierLocked(required: nil, message: "This bounty opens to your tier at " + when + ". Higher tiers get a head start: Silver 1 hour, Gold 3, Platinum 6, Elite 12.")
            }
            if match.gateFailures.contains(.notAlreadySubmitted) {
                throw FlowdAPIError.conflict("You have already submitted to this bounty. Open your submission to see where it stands.")
            }
            if match.gateFailures.contains(.eligibilityTier) {
                throw FlowdAPIError.tierLocked(required: bounty.eligibility.minTier, message: match.lockReasons.first ?? MatchGate.eligibilityTier.text)
            }
            if match.locked {
                throw FlowdAPIError.forbidden(match.lockReasons.first ?? "You are not eligible for this bounty.")
            }
        }
        if bounty.spotsLeft <= 0 {
            throw FlowdAPIError.poolExhausted
        }
    }

    // MARK: Feed

    private func matchesSearch(_ bounty: Bounty, text: String, appName: String, brandName: String) -> Bool {
        let needle: String = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if needle.isEmpty {
            return true
        }
        let hay: String = [bounty.title, appName, brandName, bounty.brief.summary].joined(separator: " ").lowercased()
        return hay.contains(needle)
    }

    func feed(_ query: FeedQuery) async throws -> Page<FeedItem> {
        try requireSignedIn()
        try reconcileIfNeeded()
        let creator: Creator = try meRow()
        let accounts: [SocialAccount] = try myAccounts()
        let saves: [BountySave] = try mySaves()
        let submissions: [Submission] = try mySubmissions()
        let reliability: [String: Int] = try brandReliabilityMap()
        let submitted: Set<String> = try submittedBountyIds()
        let appNames: [String: String] = Dictionary(uniqueKeysWithValues: try store.apps.all().map { (a: BrandApp) -> (String, String) in
            return (a.id, a.name)
        })
        let brandNames: [String: String] = Dictionary(uniqueKeysWithValues: try store.brands.all().map { (b: Brand) -> (String, String) in
            return (b.id, b.name)
        })
        let savedIds: Set<String> = Set(saves.map { (s: BountySave) -> String in
            return s.bountyId
        })
        var candidates: [Bounty] = []
        for bounty in try store.bounties.all() {
            guard bounty.status == .live else {
                continue
            }
            if bounty.visibility == .private || bounty.visibility == .inviteOnly {
                if !savedIds.contains(bounty.id) && !submitted.contains(bounty.id) && !holdsAcceptedOffer(bounty.id) {
                    continue
                }
            }
            if !matchesSearch(bounty, text: query.search ?? "", appName: appNames[bounty.appId] ?? "", brandName: brandNames[bounty.brandId] ?? "") {
                continue
            }
            if !query.types.isEmpty && !query.types.contains(bounty.type) {
                continue
            }
            if !query.platforms.isEmpty && !bounty.deliverables.platforms.contains(where: { (p: Platform) -> Bool in
                return query.platforms.contains(p)
            }) {
                continue
            }
            if !query.niches.isEmpty && !bounty.eligibility.niches.contains(where: { (n: Niche) -> Bool in
                return query.niches.contains(n)
            }) {
                continue
            }
            if query.organicOnly && bounty.rightsCard.paidAdsDays > 0 {
                continue
            }
            if let minimum = query.minCpmCents, bounty.cpmCents < minimum {
                continue
            }
            if query.savedOnly && !savedIds.contains(bounty.id) {
                continue
            }
            candidates.append(bounty)
        }
        let ranked: [BountyMatch] = MatchEngine.rank(
            creator: creator,
            accounts: accounts,
            bounties: candidates,
            brandReliability: reliability,
            submittedBountyIds: submitted,
            now: now,
            includeHidden: false
        )
        let byId: [String: Bounty] = Dictionary(uniqueKeysWithValues: candidates.map { (b: Bounty) -> (String, Bounty) in
            return (b.id, b)
        })
        var items: [FeedItem] = []
        for match in ranked {
            guard let bounty = byId[match.bountyId] else {
                continue
            }
            if match.locked && !query.includeLocked {
                continue
            }
            items.append(try feedItem(bounty, match: match, saves: saves, submissions: submissions))
        }
        switch query.sort {
        case .match:
            break
        case .pay:
            items.sort { (a: FeedItem, b: FeedItem) -> Bool in
                if a.locked != b.locked {
                    return !a.locked
                }
                return a.expectedPay.medianCents > b.expectedPay.medianCents
            }
        case .endingSoon:
            items.sort { (a: FeedItem, b: FeedItem) -> Bool in
                if a.locked != b.locked {
                    return !a.locked
                }
                return a.bounty.endsAt < b.bounty.endsAt
            }
        case .newest:
            items.sort { (a: FeedItem, b: FeedItem) -> Bool in
                if a.locked != b.locked {
                    return !a.locked
                }
                return (a.bounty.publishedAt ?? a.bounty.createdAt) > (b.bounty.publishedAt ?? b.bounty.createdAt)
            }
        }
        let offset: Int = Int(query.cursor ?? "0") ?? 0
        let limit: Int = Swift.max(1, query.limit)
        let end: Int = Swift.min(items.count, offset + limit)
        let slice: [FeedItem] = offset < items.count ? Array(items[offset..<end]) : []
        return Page<FeedItem>(data: slice, nextCursor: end < items.count ? String(end) : nil, total: items.count)
    }

    // MARK: Detail

    func bountyDetail(id: String) async throws -> BountyDetail {
        try requireSignedIn()
        try reconcileIfNeeded()
        let bounty: Bounty = try bountyRow(id)
        let saves: [BountySave] = try mySaves()
        let submissions: [Submission] = try mySubmissions()
        let item: FeedItem = try feedItem(bounty, match: nil, saves: saves, submissions: submissions)
        let app: BrandApp = try appRow(bounty.appId)
        let card: BrandScorecard? = try scorecard(for: bounty.brandId)
        let band: TypicalBand = try typicalBand()
        let save: BountySave? = saves.first(where: { (s: BountySave) -> Bool in
            return s.bountyId == bounty.id
        })
        let mine: Submission? = submissions.first(where: { (s: Submission) -> Bool in
            return s.bountyId == bounty.id && s.status != .withdrawn
        })
        let state: BountyCreatorState = BountyCreatorState(
            saved: save != nil,
            joined: save?.stage == .joined || save?.stage == .submitted,
            claimedUntil: save?.claimedUntil,
            claimedFromDrop: save?.dropId != nil,
            submissionId: mine?.id,
            submissionStatus: mine?.status
        )
        var examples: [Post] = []
        if let ids = bounty.brief.examplePostIds, !ids.isEmpty {
            let wanted: Set<String> = Set(ids)
            examples = try store.posts.all().filter { (p: Post) -> Bool in
                return wanted.contains(p.id)
            }
        }
        if examples.isEmpty {
            examples = try store.posts.all().filter { (p: Post) -> Bool in
                return p.bountyId == bounty.id && p.isWinner
            }
        }
        examples.sort { (a: Post, b: Post) -> Bool in
            return a.views > b.views
        }
        var cues: [String] = [
            "flowd never asks you to pay to join a bounty. If anyone does, report it.",
            bounty.funded ? "Funded: the full budget and fee are in escrow, so approved videos are paid." : "Not funded yet, so it can't take videos.",
            "Keep every message in the app. A brand that asks you to move to WhatsApp or Telegram breaks the rules."
        ]
        if let sc = card, sc.band != .new {
            cues.append("Decisions come with a reason. This brand's median decision time is " + Fmt.hours(sc.decisionHoursMedian) + ".")
        }
        return BountyDetail(
            item: item,
            app: app,
            scorecard: card,
            typicalEarnings: band,
            topExampleCents: band.p90Cents,
            tldr: BriefHelpers.tldr(for: bounty),
            rightsLines: RightsEngine.lines(bounty.rightsCard),
            state: state,
            examplePosts: Array(examples.prefix(3)),
            scamCues: cues
        )
    }

    func payMath(bountyId: String) async throws -> PayMathBreakdown {
        try requireSignedIn()
        let bounty: Bounty = try bountyRow(bountyId)
        let pay: ExpectedPay = try expectedPay(for: bounty)
        let band: TypicalBand = try typicalBand()
        let typicalLine: String = EarningsEngine.typicalVsTop(typicalCents: band.medianCents, topCents: band.p90Cents)
        var assumptions: [String] = [
            "Views are your own 28-day median on a linked account; with none linked it is the category median.",
            "Views pay is counted over the 72-hour view window and capped at " + Fmt.money(bounty.perVideoCapCents) + " a video.",
            "A conversion bonus pays only on tracked link and code conversions; survey and modelled numbers are never paid.",
            "Low, typical and high are 0.4x, 1x and 2.55x your median views. Results vary."
        ]
        if bounty.flatFeeCents > 0 {
            assumptions.append("The flat fee of " + Fmt.money(bounty.flatFeeCents) + " is paid on top, outside the cap.")
        }
        return PayMathBreakdown(
            bountyId: bounty.id,
            expected: pay,
            bountyPayMath: bounty.payMath,
            perVideoCapCents: bounty.perVideoCapCents,
            rates: bounty.rateLines,
            typical: band,
            topExampleCents: band.p90Cents,
            typicalVsTopLine: typicalLine,
            assumptions: assumptions,
            disclaimer: EarningsEngine.disclaimer
        )
    }

    func brandScorecard(brandId: String) async throws -> BrandScorecardView {
        try requireSignedIn()
        let card: BrandCard = try brandCard(brandId)
        let sc: BrandScorecard? = try scorecard(for: brandId)
        let isNew: Bool = sc == nil || sc?.band == .new
        var sample: String = "No decisions yet. A brand under " + String(FlowdConstants.Reliability.Brand.minDecisionsForScore) + " decisions is shown as new."
        var trend: String? = nil
        var components: [ReliabilityComponent] = []
        if let s = sc {
            sample = String(s.decisionsN) + " decisions in the last " + String(s.windowDays) + " days."
            if s.trend30d > 0.5 {
                trend = "Up " + Fmt.decimal(s.trend30d, digits: 0) + " points in 30 days."
            } else if s.trend30d < -0.5 {
                trend = "Down " + Fmt.decimal(abs(s.trend30d), digits: 0) + " points in 30 days."
            } else {
                trend = "Steady over 30 days."
            }
            let result: BrandReliabilityResult = ReputationEngine.brandReliability(
                decisionsN: s.decisionsN,
                approvedN: s.approvedN,
                decisionHoursMedian: s.decisionHoursMedian,
                appealsOverturned: s.appealsOverturned,
                paysOnTimeRatio: s.paysOnTimeRatio,
                runRate: s.runRate,
                replyHoursMedian: s.replyHoursMedian
            )
            components = result.components
        }
        let saves: [BountySave] = try mySaves()
        let submissions: [Submission] = try mySubmissions()
        var recent: [FeedItem] = []
        for bounty in try store.bounties.all() where bounty.brandId == brandId && bounty.status == .live && bounty.visibility != .private && bounty.visibility != .inviteOnly {
            if recent.count >= 5 {
                break
            }
            recent.append(try feedItem(bounty, match: nil, saves: saves, submissions: submissions))
        }
        return BrandScorecardView(
            brand: card,
            scorecard: sc,
            isNew: isNew,
            sampleLabel: sample,
            trendLabel: trend,
            components: components,
            recentBounties: recent
        )
    }

    // MARK: Saves and joining

    func savedBounties() async throws -> [SavedBounty] {
        try requireSignedIn()
        let saves: [BountySave] = try mySaves().sorted { (a: BountySave, b: BountySave) -> Bool in
            return a.updatedAt > b.updatedAt
        }
        let submissions: [Submission] = try mySubmissions()
        var out: [SavedBounty] = []
        for save in saves {
            guard let bounty = try store.bounties.find(save.bountyId) else {
                continue
            }
            out.append(SavedBounty(save: save, item: try feedItem(bounty, match: nil, saves: saves, submissions: submissions)))
        }
        return out
    }

    func saveBounty(id: String) async throws -> BountySave {
        try requireSignedIn()
        _ = try bountyRow(id)
        if let existing = try mySaves().first(where: { (s: BountySave) -> Bool in
            return s.bountyId == id
        }) {
            return existing
        }
        let existingIds: [String] = try store.saves.all().map { (s: BountySave) -> String in
            return s.id
        }
        let save: BountySave = BountySave(
            id: nextId("save", width: 4, existing: existingIds),
            creatorId: meId,
            bountyId: id,
            stage: .saved,
            savedAt: now,
            claimedUntil: nil,
            dropId: nil,
            submissionId: nil,
            updatedAt: now
        )
        try store.saves.append(save)
        return save
    }

    func unsaveBounty(id: String) async throws {
        try requireSignedIn()
        guard let existing = try mySaves().first(where: { (s: BountySave) -> Bool in
            return s.bountyId == id
        }) else {
            return
        }
        if existing.stage == .saved {
            try store.saves.remove(existing.id)
        }
    }

    /// Creates or updates this creator's save row for a bounty.
    @discardableResult
    func upsertSave(bountyId: String, stage: SaveStage, claimedUntil: Date?, dropId: String?, submissionId: String?, at moment: Date? = nil) throws -> BountySave {
        let when: Date = moment ?? now
        if let existing = try mySaves().first(where: { (s: BountySave) -> Bool in
            return s.bountyId == bountyId
        }) {
            return try store.saves.update(existing.id) { (s: inout BountySave) in
                s.stage = stage
                if let until = claimedUntil {
                    s.claimedUntil = until
                } else if stage != .joined {
                    s.claimedUntil = nil
                }
                if let drop = dropId {
                    s.dropId = drop
                }
                if let sub = submissionId {
                    s.submissionId = sub
                }
                s.updatedAt = when
            }
        }
        let ids: [String] = try store.saves.all().map { (s: BountySave) -> String in
            return s.id
        }
        let save: BountySave = BountySave(
            id: nextId("save", width: 4, existing: ids),
            creatorId: meId,
            bountyId: bountyId,
            stage: stage,
            savedAt: when,
            claimedUntil: claimedUntil,
            dropId: dropId,
            submissionId: submissionId,
            updatedAt: when
        )
        try store.saves.append(save)
        return save
    }

    func joinBounty(id: String) async throws -> BountySave {
        try requireSignedIn()
        try reconcileIfNeeded()
        let bounty: Bounty = try bountyRow(id)
        if let existing = try mySaves().first(where: { (s: BountySave) -> Bool in
            return s.bountyId == id
        }), existing.stage == .submitted {
            throw FlowdAPIError.conflict("You have already submitted to this bounty.")
        }
        try ensureEligible(bounty)
        let until: Date = FlowdCalendar.addHours(now, Double(FlowdConstants.DailyDropRules.claimWindowHours))
        return try upsertSave(bountyId: id, stage: .joined, claimedUntil: until, dropId: nil, submissionId: nil)
    }

    // MARK: Daily Drop

    /// The state a drop is in at `moment`: upcoming before 16:00 UTC, live while there are spots and the claim window runs, sold out when the last spot
    /// goes, closed when the window ends. Inventory is a true count; it is never faked.
    func dropState(_ drop: DailyDrop, at moment: Date) -> DropStatus {
        if moment < drop.releaseAt {
            return .upcoming
        }
        if drop.spotsLeft <= 0 {
            return .soldOut
        }
        if moment >= drop.claimWindowEndsAt {
            return .closed
        }
        return .live
    }

    func dropItemView(_ item: DropItem, saves: [BountySave], submissions: [Submission]) throws -> DropItemView? {
        guard let bounty = try store.bounties.find(item.bountyId) else {
            return nil
        }
        let feed: FeedItem = try feedItem(bounty, match: nil, saves: saves, submissions: submissions)
        let mine: Bool = item.claims.contains(where: { (c: DropClaim) -> Bool in
            return c.creatorId == meId
        })
        return DropItemView(item: feed, spotsTotal: item.spotsTotal, spotsLeft: item.spotsLeft, claimedByMe: mine)
    }

    func todayDrop() async throws -> DailyDropView {
        try requireSignedIn()
        try reconcileIfNeeded()
        let moment: Date = now
        let drops: [DailyDrop] = try store.drops.all().sorted { (a: DailyDrop, b: DailyDrop) -> Bool in
            return a.releaseAt < b.releaseAt
        }
        let today: String = FlowdCalendar.dayString(moment)
        guard let drop = drops.first(where: { (d: DailyDrop) -> Bool in
            return d.date == today
        }) ?? drops.last(where: { (d: DailyDrop) -> Bool in
            return d.releaseAt <= moment
        }) ?? drops.first else {
            throw FlowdAPIError.notFound("today's Daily Drop")
        }
        let saves: [BountySave] = try mySaves()
        let submissions: [Submission] = try mySubmissions()
        var items: [DropItemView] = []
        for item in drop.items {
            if let view = try dropItemView(item, saves: saves, submissions: submissions) {
                items.append(view)
            }
        }
        let state: DropStatus = dropState(drop, at: moment)
        var shown: DailyDrop = drop
        shown.status = state
        let next: Date = drops.first(where: { (d: DailyDrop) -> Bool in
            return d.releaseAt > drop.releaseAt
        })?.releaseAt ?? FlowdCalendar.addDays(drop.releaseAt, 1)
        let creator: Creator = try meRow()
        let head: Int = FlowdConstants.tierPerks(creator.tier).earlyAccessHours
        let note: String? = head > 0 ? creator.tier.label + " gets a " + String(head) + " hour head start on new bounties." : nil
        return DailyDropView(
            drop: shown,
            state: state,
            items: items,
            releaseAt: drop.releaseAt,
            claimWindowEndsAt: drop.claimWindowEndsAt,
            nextDropAt: next,
            headStartNote: note
        )
    }

    func dropHistory() async throws -> [DailyDrop] {
        try requireSignedIn()
        let moment: Date = now
        let past: [DailyDrop] = try store.drops.all().filter { (d: DailyDrop) -> Bool in
            return d.releaseAt <= moment
        }.sorted { (a: DailyDrop, b: DailyDrop) -> Bool in
            return a.releaseAt > b.releaseAt
        }
        return Array(past.prefix(14)).map { (d: DailyDrop) -> DailyDrop in
            var copy: DailyDrop = d
            copy.status = self.dropState(d, at: moment)
            return copy
        }
    }

    func claimDropSpot(dropId: String, bountyId: String, idempotencyKey: String) async throws -> BountySave {
        try requireSignedIn()
        try reconcileIfNeeded()
        if let saveId = remembered(idempotencyKey, operation: "claim_drop"), let again = try store.saves.find(saveId) {
            return again
        }
        guard let drop = try store.drops.find(dropId) else {
            throw FlowdAPIError.notFound("that Daily Drop")
        }
        let moment: Date = now
        switch dropState(drop, at: moment) {
        case .upcoming:
            throw FlowdAPIError.conflict("Today's drop opens at " + Fmt.clockLabelUTC(drop.releaseAt) + ".")
        case .soldOut:
            throw FlowdAPIError.conflict("Everything in this drop is claimed. Spots are real: when they are gone, they are gone.")
        case .closed, .unknown:
            throw FlowdAPIError.conflict("This drop is closed. Unclaimed spots are back in the open feed.")
        case .live:
            break
        }
        guard let item = drop.items.first(where: { (i: DropItem) -> Bool in
            return i.bountyId == bountyId
        }) else {
            throw FlowdAPIError.notFound("that bounty in this drop")
        }
        if item.spotsLeft <= 0 {
            throw FlowdAPIError.conflict("That bounty is sold out. Spots are real: when they are gone, they are gone.")
        }
        if item.claims.contains(where: { (c: DropClaim) -> Bool in
            return c.creatorId == meId
        }) {
            throw FlowdAPIError.conflict("You already claimed a spot on this bounty.")
        }
        let bounty: Bounty = try bountyRow(bountyId)
        try ensureEligible(bounty)
        let until: Date = FlowdCalendar.addHours(moment, Double(FlowdConstants.DailyDropRules.claimWindowHours))
        let creatorId: String = meId
        try store.drops.update(dropId) { (d: inout DailyDrop) in
            var left: Int = 0
            for index in d.items.indices {
                if d.items[index].bountyId == bountyId {
                    d.items[index].spotsLeft -= 1
                    d.items[index].claims.append(DropClaim(creatorId: creatorId, claimedAt: moment))
                }
                left += d.items[index].spotsLeft
            }
            d.spotsLeft = left
            d.claimsTotal = d.spotsTotal - left
            if left == 0 {
                d.status = .soldOut
            }
        }
        let save: BountySave = try upsertSave(bountyId: bountyId, stage: .joined, claimedUntil: until, dropId: dropId, submissionId: nil)
        remember(idempotencyKey, operation: "claim_drop", resourceId: save.id)
        return save
    }
}
