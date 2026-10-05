import Foundation

// OffersAPI: direct offers, invites and re-buys with at most three counter rounds and seven days to answer, plus the creator's rate card. Accepting a
// direct offer turns it into a private, fully funded direct bounty (the brand's money goes into escrow the moment the creator says yes). In the demo
// the brand answers counters on the demo clock, like production would.

extension MockFlowdAPI {
    // MARK: Helpers

    func offerMessage(role: AuthorRole, type: OfferMessageType, amountCents: Int? = nil, rightsDays: Int? = nil, body: String? = nil, at moment: Date? = nil) throws -> OfferMessage {
        let id: String = try nextIdLazy("omsg", width: 0, existing: { () throws -> [String] in
            var ids: [String] = []
            for offer in try self.store.offers.all() {
                for message in offer.thread {
                    ids.append(message.id)
                }
            }
            return ids
        })
        var warning: ScamReason? = nil
        if let text = body {
            warning = ScamShield.warning(for: text)
        }
        let userId: String? = role == .creator ? meUserId : nil
        return OfferMessage(
            id: id,
            authorRole: role,
            authorUserId: userId,
            type: type,
            amountCents: amountCents,
            rightsDays: rightsDays,
            body: body,
            at: moment ?? now,
            warningCode: warning
        )
    }

    func offerSummary(_ offer: Offer) throws -> OfferSummary {
        let app: BrandApp = try appRow(offer.appId)
        let open: Bool = offer.isOpen
        let label: String = open ? "Expires " + Fmt.relative(offer.expiresAt, now: now) : (offer.status == .expired ? "Expired" : "Closed")
        return OfferSummary(
            offer: offer,
            brand: try brandCard(offer.brandId),
            appName: app.name,
            appIcon: app.icon,
            awaitingMe: offer.awaitingCreator,
            expiresLabel: label
        )
    }

    /// Where a notification about an accepted offer leads: the bounty when there is one, the offer otherwise.
    func offerDeepLink(_ offer: Offer) -> String {
        if let bountyId = offer.bountyId {
            return "flowd://bounty/" + bountyId
        }
        return "flowd://offer/" + offer.id
    }

    func offerRow(_ id: String) throws -> Offer {
        guard let offer = try store.offers.find(id), offer.creatorId == meId else {
            throw FlowdAPIError.notFound("that offer")
        }
        return offer
    }

    // MARK: Reading

    func offers() async throws -> [OfferSummary] {
        try requireSignedIn()
        try reconcileIfNeeded()
        let rows: [Offer] = try myOffers().sorted { (a: Offer, b: Offer) -> Bool in
            if a.awaitingCreator != b.awaitingCreator {
                return a.awaitingCreator
            }
            if a.isOpen != b.isOpen {
                return a.isOpen
            }
            return a.updatedAt > b.updatedAt
        }
        var out: [OfferSummary] = []
        for row in rows {
            out.append(try offerSummary(row))
        }
        return out
    }

    func offerDetail(id: String) async throws -> OfferDetail {
        try requireSignedIn()
        try reconcileIfNeeded()
        let offer: Offer = try offerRow(id)
        let views: Int = try medianViews()
        var context: ExpectedPay? = nil
        if views > 0 {
            let e: ExpectedEarnings = EarningsEngine.expectedEarnings(
                baseMedianViews: views,
                cpmCents: FlowdConstants.Pay.defaultCpmCents,
                rates: CpaRates(),
                perVideoCapCents: FlowdConstants.Pay.defaultPerVideoCapCents
            )
            context = ExpectedPay(
                p25Cents: e.p25.payCents,
                medianCents: e.median.payCents,
                p75Cents: e.p75.payCents,
                medianViews: views,
                cpmPartCents: e.median.cpmPayCents,
                cpaPartCents: 0,
                flatFeeCents: 0,
                capped: e.median.capped,
                basis: "At your 28-day median of " + Fmt.grouped(views) + " views and the default " + Fmt.cpm(FlowdConstants.Pay.defaultCpmCents) + ", for context against this price.",
                disclaimer: EarningsEngine.disclaimer
            )
        }
        return OfferDetail(
            summary: try offerSummary(offer),
            scorecard: try scorecard(for: offer.brandId),
            rightsLines: RightsEngine.lines(offer.rightsCard),
            payContext: context,
            counterRoundsLeft: offer.counterRoundsLeft,
            canAccept: offer.awaitingCreator,
            canCounter: offer.awaitingCreator && offer.kind != .invite && offer.counterRoundsLeft > 0,
            canDecline: offer.awaitingCreator,
            marketBand: offer.suggested
        )
    }

    // MARK: Direct bounty

    /// The private, fully funded bounty a direct offer becomes when it is accepted (the web store's `createDirectBounty`).
    func makeDirectBounty(from offer: Offer) throws -> Bounty {
        let app: BrandApp = try appRow(offer.appId)
        let brand: Brand = try brandRow(offer.brandId)
        let creator: Creator = try meRow()
        let moment: Date = now
        let videos: Int = Swift.max(1, offer.deliverables.videosPerCreator)
        let flat: Int = MoneyMath.divRound(offer.amountCents, videos)
        let budget: Int = flat * videos
        let fee: Int = MoneyMath.mulRate(budget, offer.takeRate)
        let existingIds: Set<String> = Set(try store.bounties.all().map { (b: Bounty) -> String in
            return b.id
        })
        var id: String = "bnty_" + TextTools.slugify(app.name).replacingOccurrences(of: "-", with: "") + "_direct"
        var suffix: Int = 2
        let stem: String = id
        while existingIds.contains(id) {
            id = stem + String(suffix)
            suffix += 1
        }
        let views: Int = Swift.max(1, try medianViews())
        let beats: [BriefBeat] = [
            BriefBeat(beat: .hook, label: "Hook", required: true, hint: "Say why it matters in the first two seconds."),
            BriefBeat(beat: .appReveal, label: "Show the app", required: true, hint: "The app on screen by second three."),
            BriefBeat(beat: .keyFeature, label: "One feature", required: false, hint: "Show the one thing you use most."),
            BriefBeat(beat: .cta, label: "Call to action", required: true, hint: "One clear next step.")
        ]
        let brief: Brief = Brief(
            summary: offer.message,
            talkingPoints: [],
            dos: ["Film it in your own voice and your own place.", "Show the app working on screen."],
            donts: ["Do not make claims the app does not make.", "Do not move this conversation off flowd."],
            beats: beats,
            cta: "Try it free.",
            offerLine: nil,
            hashtags: app.defaultHashtags,
            mentions: [],
            tone: "Your own voice.",
            disclosureText: BriefHelpers.disclosureLine(brandName: brand.name),
            bannedClaims: brand.complianceDefaults.bannedClaims,
            examplePostIds: nil,
            referenceArt: nil
        )
        let rate: RateCard? = try store.rateCards.all().first(where: { (r: RateCard) -> Bool in
            return r.creatorId == meId
        })
        let bounty: Bounty = Bounty(
            id: id,
            appId: app.id,
            brandId: brand.id,
            ownerMemberId: offer.createdByMemberId,
            createdByMemberId: offer.createdByMemberId,
            title: offer.title,
            type: .direct,
            status: .live,
            visibility: .private,
            fundingSource: .brand,
            isFirstBounty: false,
            isStarter: false,
            featured: false,
            featuredUntil: nil,
            cpmCents: 0,
            cpaInstallCents: 0,
            cpaTrialCents: 0,
            cpaPaidCents: 0,
            flatFeeCents: flat,
            adCommissionRate: FlowdConstants.Pay.adCommissionRate,
            perVideoCapCents: flat,
            perCreatorCapCents: nil,
            budgetCents: budget,
            takeRate: offer.takeRate,
            feeReserveCents: fee,
            escrowFundedCents: budget + fee,
            matchedCents: 0,
            funded: true,
            fundedAt: moment,
            reservedCents: 0,
            spentCents: 0,
            remainingCents: budget + fee,
            refundedCents: 0,
            brief: brief,
            rightsCard: offer.rightsCard,
            deliverables: offer.deliverables,
            eligibility: Eligibility(minTier: creator.tier, minFollowers: nil, countries: offer.deliverables.regions, niches: creator.niches, minUsAudienceRatio: nil, burnerAccountsAllowed: false),
            briefLint: BriefLint(passed: true, checkedAt: moment, issues: []),
            lintOverrides: nil,
            payMath: EarningsEngine.payMath(
                cpmCents: 0,
                rates: CpaRates(),
                perVideoCapCents: flat,
                plan: brand.plan,
                type: .direct,
                firstBounty: false,
                takeRate: offer.takeRate,
                flatFeeCents: flat,
                medianViews: views,
                basis: "Direct offer: " + Fmt.money(flat) + " flat per video, agreed in the app."
            ),
            formatIds: rate?.formatIds ?? [],
            art: ArtSeed(key: id, title: offer.title, caption: app.name, glyph: app.icon.glyph),
            startsAt: moment,
            endsAt: FlowdCalendar.addDays(moment, 45),
            publishedAt: moment,
            firstSubmissionAt: nil,
            filledAt: nil,
            timeToFillHours: nil,
            endedAt: nil,
            settledAt: nil,
            reviewSlaHours: brand.reviewSlaHours,
            counts: BountyCounts(creators: 0, submissions: 0, inReview: 0, approved: 0, rejected: 0, posts: 0, livePosts: 0),
            funnel: FunnelCounts(views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, estInstalls: 0, estTrials: 0, estPaid: 0),
            allInCpmCents: 0,
            createdAt: moment,
            updatedAt: moment
        )
        try store.bounties.append(bounty)
        return bounty
    }

    /// Accepts an offer on the creator's side (or the brand's acceptance of a counter): an invite joins the open bounty, a direct offer funds a private
    /// bounty and opens it.
    func confirmOffer(_ offer: Offer, by role: AuthorRole, at moment: Date) throws -> Offer {
        var bountyId: String? = offer.bountyId
        if offer.kind == .invite {
            guard let target = bountyId else {
                throw FlowdAPIError.conflict("This invite has no bounty.")
            }
            try upsertSave(bountyId: target, stage: .joined, claimedUntil: nil, dropId: nil, submissionId: nil, at: moment)
        } else if bountyId == nil {
            let bounty: Bounty = try makeDirectBounty(from: offer)
            bountyId = bounty.id
            try upsertSave(bountyId: bounty.id, stage: .joined, claimedUntil: nil, dropId: nil, submissionId: nil, at: moment)
        }
        let message: OfferMessage = try offerMessage(role: role, type: .accept, at: moment)
        let funded: Bool = offer.kind != .invite
        let resolvedBountyId: String? = bountyId
        return try store.offers.update(offer.id) { (o: inout Offer) in
            o.status = .accepted
            o.acceptedAt = moment
            o.bountyId = resolvedBountyId
            o.escrowFunded = funded
            o.thread.append(message)
            o.updatedAt = moment
        }
    }

    // MARK: Answering

    func acceptOffer(id: String, idempotencyKey: String) async throws -> Offer {
        try requireSignedIn()
        try reconcileIfNeeded()
        if let known = remembered(idempotencyKey, operation: "accept_offer"), let again = try store.offers.find(known) {
            return again
        }
        let offer: Offer = try offerRow(id)
        guard offer.status == .awaitingCreator else {
            throw FlowdAPIError.conflict(offer.isOpen ? "It is the brand's turn to answer." : "This offer is " + offer.status.label.lowercased() + ".")
        }
        let accepted: Offer = try confirmOffer(offer, by: .creator, at: now)
        let amount: Int? = accepted.amountCents > 0 ? accepted.amountCents : nil
        var text: String = "You are in. Open the brief and make it."
        if accepted.kind != .invite {
            text = Fmt.money(accepted.amountCents) + " is in escrow. You have " + String(accepted.turnaroundDays) + " days to submit."
        }
        try notify(
            .offerAccepted,
            title: "You accepted " + accepted.title,
            body: text,
            amountCents: amount,
            deepLink: offerDeepLink(accepted),
            refKind: "offer",
            refId: accepted.id
        )
        remember(idempotencyKey, operation: "accept_offer", resourceId: accepted.id)
        return accepted
    }

    func counterOffer(id: String, _ request: OfferCounterRequest) async throws -> Offer {
        try requireSignedIn()
        try reconcileIfNeeded()
        if let known = remembered(request.idempotencyKey, operation: "counter_offer"), let again = try store.offers.find(known) {
            return again
        }
        let offer: Offer = try offerRow(id)
        guard offer.status == .awaitingCreator else {
            throw FlowdAPIError.conflict("It is the brand's turn to answer.")
        }
        if offer.kind == .invite {
            throw FlowdAPIError.conflict("An invite pays the bounty's own rates. Accept it or decline it.")
        }
        if offer.rounds >= FlowdConstants.Windows.maxCounterRounds {
            throw FlowdAPIError.conflict("Offers allow " + String(FlowdConstants.Windows.maxCounterRounds) + " counter rounds. Accept or decline this one.")
        }
        if request.amountCents < 2_500 {
            throw FlowdAPIError.validationFailed("The smallest price is $25.")
        }
        let moment: Date = now
        let trimmed: String? = request.message?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body: String? = (trimmed?.isEmpty ?? true) ? nil : trimmed
        let message: OfferMessage = try offerMessage(role: .creator, type: .counter, amountCents: request.amountCents, rightsDays: request.rightsDays, body: body, at: moment)
        let take: Double = offer.takeRate
        let updated: Offer = try store.offers.update(id) { (o: inout Offer) in
            o.status = .awaitingBrand
            o.amountCents = request.amountCents
            o.allInCents = request.amountCents + MoneyMath.mulRate(request.amountCents, take)
            o.rounds += 1
            o.thread.append(message)
            o.expiresAt = FlowdCalendar.addDays(moment, Double(FlowdConstants.Windows.offerExpiryDays))
            o.updatedAt = moment
        }
        remember(request.idempotencyKey, operation: "counter_offer", resourceId: updated.id)
        return updated
    }

    func declineOffer(id: String) async throws -> Offer {
        try requireSignedIn()
        let offer: Offer = try offerRow(id)
        guard offer.status == .awaitingCreator else {
            throw FlowdAPIError.conflict("It is the brand's turn to answer.")
        }
        let moment: Date = now
        let message: OfferMessage = try offerMessage(role: .creator, type: .decline, at: moment)
        return try store.offers.update(id) { (o: inout Offer) in
            o.status = .declined
            o.closedAt = moment
            o.thread.append(message)
            o.updatedAt = moment
        }
    }

    func sendOfferMessage(id: String, body: String) async throws -> Offer {
        try requireSignedIn()
        let offer: Offer = try offerRow(id)
        let text: String = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty {
            throw FlowdAPIError.validationFailed("Write a message first.")
        }
        switch offer.status {
        case .declined, .expired, .withdrawn:
            throw FlowdAPIError.conflict("This offer is " + offer.status.label.lowercased() + ".")
        case .awaitingCreator, .awaitingBrand, .accepted, .completed, .unknown:
            break
        }
        let moment: Date = now
        let message: OfferMessage = try offerMessage(role: .creator, type: .message, body: text, at: moment)
        return try store.offers.update(id) { (o: inout Offer) in
            o.thread.append(message)
            o.updatedAt = moment
        }
    }

    // MARK: The brand answers on the demo clock

    /// How long the brand takes to answer a counter: its median reply time, between 1 and 24 hours.
    func brandReplyHours(_ brandId: String) -> Double {
        let hours: Double = ((try? scorecard(for: brandId))?.replyHoursMedian) ?? 8
        return MoneyMath.clamp(hours, 1, 24)
    }

    /// Plays the brand's answer to a counter once its reply time has passed: it accepts a counter inside what it will pay, otherwise it meets in the middle,
    /// and after the last round it declines.
    func brandRespondsToOffers(at moment: Date) throws {
        for offer in try myOffers() where offer.status == .awaitingBrand {
            let due: Date = FlowdCalendar.addHours(offer.updatedAt, brandReplyHours(offer.brandId))
            if moment < due {
                continue
            }
            let ask: Int = offer.askCents ?? offer.originalAmountCents
            let ceiling: Int = Swift.max(ask, MoneyMath.mulRate(offer.originalAmountCents, 1.3))
            if offer.amountCents <= ceiling {
                let accepted: Offer = try confirmOffer(offer, by: .brand, at: due)
                try notify(
                    .offerAccepted,
                    title: "Your counter was accepted",
                    body: accepted.title + ": " + Fmt.money(accepted.amountCents) + " is in escrow. Open the brief and make it.",
                    amountCents: accepted.amountCents,
                    deepLink: offerDeepLink(accepted),
                    refKind: "offer",
                    refId: accepted.id,
                    at: due
                )
            } else if offer.rounds >= FlowdConstants.Windows.maxCounterRounds {
                let message: OfferMessage = try offerMessage(role: .brand, type: .decline, body: "We cannot go that high on this one. Thank you for the quick answer.", at: due)
                try store.offers.update(offer.id) { (o: inout Offer) in
                    o.status = .declined
                    o.closedAt = due
                    o.thread.append(message)
                    o.updatedAt = due
                }
                try notify(.offerCountered, title: offer.title, body: "The brand declined your counter. Everything you said is kept in the thread.", deepLink: "flowd://offer/" + offer.id, refKind: "offer", refId: offer.id, at: due)
            } else {
                let middle: Int = ((offer.originalAmountCents + offer.amountCents) / 2 / 500) * 500
                let meet: Int = Swift.max(2_500, middle)
                let take: Double = offer.takeRate
                let message: OfferMessage = try offerMessage(role: .brand, type: .counter, amountCents: meet, body: "We can meet in the middle at " + Fmt.money(meet) + ".", at: due)
                try store.offers.update(offer.id) { (o: inout Offer) in
                    o.status = .awaitingCreator
                    o.amountCents = meet
                    o.allInCents = meet + MoneyMath.mulRate(meet, take)
                    o.rounds += 1
                    o.thread.append(message)
                    o.expiresAt = FlowdCalendar.addDays(due, Double(FlowdConstants.Windows.offerExpiryDays))
                    o.updatedAt = due
                }
                try notify(.offerCountered, title: "The brand countered: " + Fmt.money(meet), body: offer.title + ". Reply by " + Fmt.clockLabelUTC(FlowdCalendar.addDays(due, Double(FlowdConstants.Windows.offerExpiryDays))) + ".", amountCents: meet, deepLink: "flowd://offer/" + offer.id, refKind: "offer", refId: offer.id, at: due)
            }
        }
    }

    /// Offers nobody answered in seven days close.
    func expireOffers(at moment: Date) throws {
        for offer in try myOffers() where offer.isOpen && offer.expiresAt <= moment {
            let expiry: Date = offer.expiresAt
            try store.offers.update(offer.id) { (o: inout Offer) in
                o.status = .expired
                o.closedAt = expiry
                o.updatedAt = moment
            }
        }
    }

    // MARK: Rate card

    private func nicheCategory(_ niche: Niche) -> AppCategory {
        switch niche {
        case .aiTools: return .aiPhoto
        case .tech: return .aiAssistant
        case .fitness: return .fitness
        case .wellness: return .sleepMind
        case .productivity: return .productivity
        case .study: return .language
        case .money: return .finance
        case .lifestyle: return .lifestyle
        case .beauty: return .aiPhoto
        case .travel: return .language
        case .food: return .lifestyle
        case .parenting: return .sleepMind
        case .unknown: return .lifestyle
        }
    }

    private func tierPriceMultiplier(_ tier: Tier) -> Double {
        switch tier {
        case .bronze, .unknown: return 1.0
        case .silver: return 1.3
        case .gold: return 1.55
        case .platinum: return 1.8
        case .elite: return 2.1
        }
    }

    /// The market-suggested price for one video: the median views times the category's clearing CPM, scaled by tier, with a p25 to p75 band.
    func suggestRate() throws -> RateSuggestion {
        let creator: Creator = try meRow()
        let views: Int = try medianViews()
        let category: AppCategory = nicheCategory(creator.niches.first ?? .lifestyle)
        let cutoff: Date = FlowdCalendar.addDays(now, -14)
        let rows: [MarketSeriesPoint] = try store.marketSeries.all().filter { (p: MarketSeriesPoint) -> Bool in
            return p.category == category
        }
        let recent: [MarketSeriesPoint] = rows.filter { (p: MarketSeriesPoint) -> Bool in
            return (FlowdCalendar.parseDay(p.date) ?? Date.distantPast) >= cutoff
        }
        let sample: [MarketSeriesPoint] = recent.isEmpty ? rows : recent
        let clearing: Int = sample.isEmpty ? FlowdConstants.Pay.defaultCpmCents : MoneyMath.roundHalfUp(MoneyMath.median(sample.map { (p: MarketSeriesPoint) -> Double in
            return Double(p.clearingCpmCents)
        }))
        let p25: Int = sample.isEmpty ? clearing * 3 / 4 : MoneyMath.roundHalfUp(MoneyMath.median(sample.map { (p: MarketSeriesPoint) -> Double in
            return Double(p.p25CpmCents)
        }))
        let p75: Int = sample.isEmpty ? clearing * 5 / 4 : MoneyMath.roundHalfUp(MoneyMath.median(sample.map { (p: MarketSeriesPoint) -> Double in
            return Double(p.p75CpmCents)
        }))
        let n: Int = sample.reduce(0) { (total: Int, p: MarketSeriesPoint) -> Int in
            return total + p.sampleN
        }
        let multiplier: Double = tierPriceMultiplier(creator.tier)
        func rounded(_ cpm: Int) -> Int {
            let raw: Double = Double(views) * Double(cpm) * multiplier / 1_000 / 100
            return Int(raw.rounded()) * 100
        }
        let price: Int = Swift.max(2_500, rounded(clearing))
        let low: Int = Swift.max(2_500, Swift.min(rounded(p25), price))
        let high: Int = Swift.max(price, rounded(p75))
        let confidence: Double = MoneyMath.round2(Swift.min(0.85, Double(n) / Double(n + FlowdConstants.PricingModel.confidenceK)))
        return RateSuggestion(
            priceCents: price,
            lowCents: low,
            highCents: high,
            basis: "Median " + Fmt.compact(views) + " views x " + Fmt.money(clearing) + " " + category.label + " CPM, " + Fmt.decimal(multiplier, digits: 2) + "x " + creator.tier.label,
            confidence: confidence,
            computedAt: now
        )
    }

    func rateCard() async throws -> RateCardView {
        try requireSignedIn()
        let creator: Creator = try meRow()
        let unlocked: Bool = FlowdConstants.tierPerks(creator.tier).rateCard
        let card: RateCard? = try store.rateCards.all().first(where: { (r: RateCard) -> Bool in
            return r.creatorId == meId
        })
        let suggestion: RateSuggestion? = unlocked ? (card?.suggested ?? (try? suggestRate())) : nil
        let lock: String? = unlocked ? nil : "Rate cards open at Silver: " + Fmt.money(FlowdConstants.Tiers.Thresholds.Silver.lifetimeClearedCents) + " cleared and " + String(FlowdConstants.Tiers.Thresholds.Silver.approvedCount) + " approved posts."
        return RateCardView(
            card: card,
            tier: creator.tier,
            unlocked: unlocked,
            lockText: lock,
            suggested: suggestion,
            storefrontURL: creator.storefrontURL
        )
    }

    func updateRateCard(_ update: RateCardUpdate) async throws -> RateCardView {
        try requireSignedIn()
        let creator: Creator = try meRow()
        guard FlowdConstants.tierPerks(creator.tier).rateCard else {
            throw FlowdAPIError.tierLocked(required: .silver, message: "Rate cards open at Silver. Keep clearing approved work.")
        }
        if update.pricePerVideoCents < 2_500 {
            throw FlowdAPIError.validationFailed("The smallest price is $25 a video.")
        }
        if update.minCpmCents < FlowdConstants.Pay.floorCpmCents {
            throw FlowdAPIError.validationFailed("The minimum CPM is at least " + Fmt.money(FlowdConstants.Pay.floorCpmCents) + ".")
        }
        if update.platforms.isEmpty {
            throw FlowdAPIError.validationFailed("Pick at least one platform.")
        }
        let suggestion: RateSuggestion = try suggestRate()
        let moment: Date = now
        let existing: RateCard? = try store.rateCards.all().first(where: { (r: RateCard) -> Bool in
            return r.creatorId == meId
        })
        if let card = existing {
            try store.rateCards.update(card.id) { (r: inout RateCard) in
                r.pricePerVideoCents = update.pricePerVideoCents
                r.minCpmCents = update.minCpmCents
                r.paidUsageDays = update.paidUsageDays
                r.turnaroundDays = update.turnaroundDays
                r.maxVideosPerMonth = update.maxVideosPerMonth
                r.platforms = update.platforms
                r.formatIds = update.formatIds
                r.categoriesExcluded = update.categoriesExcluded
                r.acceptsDirectOffers = update.acceptsDirectOffers
                r.packages = update.packages
                r.suggested = suggestion
                r.updatedAt = moment
            }
        } else {
            let card: RateCard = RateCard(
                id: "rate_" + creator.handle.replacingOccurrences(of: ".", with: "_"),
                creatorId: meId,
                status: .open,
                pricePerVideoCents: update.pricePerVideoCents,
                minCpmCents: update.minCpmCents,
                paidUsageDays: update.paidUsageDays,
                paidUsagePctPer30d: FlowdConstants.Rights.renewalFeePctOfBasePer30d,
                turnaroundDays: update.turnaroundDays,
                maxVideosPerMonth: update.maxVideosPerMonth,
                platforms: update.platforms,
                formatIds: update.formatIds,
                categoriesExcluded: update.categoriesExcluded,
                acceptsDirectOffers: update.acceptsDirectOffers,
                suggested: suggestion,
                packages: update.packages,
                stats: RateCardStats(offersReceived: 0, accepted: 0, medianResponseHours: 0),
                updatedAt: moment
            )
            try store.rateCards.append(card)
        }
        try store.creators.update(meId) { (c: inout Creator) in
            c.openToOffers = update.acceptsDirectOffers
        }
        return try await rateCard()
    }
}
