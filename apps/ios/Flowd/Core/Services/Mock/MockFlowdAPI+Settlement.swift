import Foundation

// How a post turns into money, step by step, on the ledger and the Money Clock (mirrors apps/web/src/lib/store/core/earnings.ts):
//
//   attach post    an accruing Money Clock row (a live estimate)
//   window closes  the views leg is settled (ledger leg pending), the row is pending with a dated ETA; a flagged post is held with a named reason
//   clearing run   14:00 UTC: after the view and disclosure check the creator's rows clear
//   weekly run     Friday 18:00 UTC: cleared rows become paid in one payout (free); an instant cash-out does it now for a fee shown first
//
// Every state change writes the ledger leg, the Money Clock row and the post together, so the three never disagree.

extension MockFlowdAPI {
    // MARK: Payout holds

    /// What stops cleared money from paying out: no payout method, identity not verified, or no tax form (collected just in time).
    func payoutHold() throws -> HoldReason? {
        let creator: Creator = try meRow()
        guard let method = creator.payoutMethod, method.status == .active else {
            return .payoutMethodMissing
        }
        if creator.verificationStatus != .verified {
            return .identityCheck
        }
        if FlowdConstants.Tax.holdPayoutWithoutTaxInfo {
            let profile: TaxProfile? = try store.taxProfiles.all().first(where: { (t: TaxProfile) -> Bool in
                return t.creatorId == meId
            })
            if profile == nil || profile?.status != .verified {
                return .taxInfoMissing
            }
        }
        return nil
    }

    // MARK: Accrual

    /// Opens the Money Clock for a new post: an accruing row with the estimate, the end of the 72-hour window and the clearing run after it.
    func openAccrual(post: Post, bounty: Bounty, estimateCents: Int) throws {
        let eta: Date = MoneyClockEngine.postClearingRun(windowEnd: post.windowEndsAt)
        let row: MoneyClockRow = MoneyClockRow(
            id: try nextMoneyRowId(),
            creatorId: meId,
            bountyId: bounty.id,
            appId: bounty.appId,
            postId: post.id,
            conversionId: nil,
            source: bounty.type == .direct ? .flatFee : .cpm,
            state: .accruing,
            amountCents: estimateCents,
            estimated: true,
            earnedAt: post.postedAt,
            etaAt: eta,
            reason: .windowOpen,
            reasonText: MoneyClockEngine.reasonText(reason: .windowOpen, etaAt: eta, windowEndsAt: post.windowEndsAt),
            label: try earningLabel(bounty),
            ledgerId: nil,
            payoutId: nil,
            clearedAt: nil,
            paidAt: nil
        )
        try store.moneyClock.append(row)
    }

    // MARK: Views grow over the window

    /// The share of a post's window views that have arrived `hours` after posting: a steady decay, most views in the first day.
    func viewShare(hours: Double) -> Double {
        let h: Double = Swift.min(72, Swift.max(0, hours))
        return (1 - exp(-h / 18)) / (1 - exp(-4))
    }

    /// Where a post's views will end up at the close of its window. Decided once per post; a post already partway keeps its pace.
    func finalViews(for post: Post, ageHours: Double) throws -> Int {
        if let known = postFinalViews[post.id] {
            return known
        }
        let account: SocialAccount? = try store.socialAccounts.find(post.socialAccountId)
        let median: Int = account?.medianViews28d ?? 5_000
        let multiplier: Double = FlowdConstants.bandViewMultiplier(post.flowBand)
        let jitter: Double = 0.75 + Double(StableHash.bucket(post.id, modulus: 50)) / 100
        var final: Int = Int((Double(median) * multiplier * jitter).rounded())
        let share: Double = viewShare(hours: ageHours)
        if post.views > 0 && share > 0.02 {
            final = Swift.max(final, Int((Double(post.views) / share).rounded()))
        }
        postFinalViews[post.id] = final
        return final
    }

    private func trackedFunnel(views: Int, current: FunnelCounts) -> FunnelCounts {
        let f: FunnelAssumptions = FunnelAssumptions.defaults
        let clicks: Int = Swift.max(current.clicks, MoneyMath.roundHalfUp(Double(views) * f.viewToVisit))
        let installs: Int = Swift.max(current.installs, MoneyMath.roundHalfUp(Double(clicks) * f.visitToInstall))
        let trials: Int = Swift.max(current.trials, MoneyMath.roundHalfUp(Double(installs) * f.installToTrial))
        let paid: Int = Swift.max(current.paid, MoneyMath.roundHalfUp(Double(trials) * f.trialToPaid))
        return FunnelCounts(
            views: views,
            clicks: clicks,
            installs: installs,
            trials: trials,
            paid: paid,
            estInstalls: current.estInstalls,
            estTrials: current.estTrials,
            estPaid: current.estPaid
        )
    }

    /// A View Ledger snapshot every 6 hours inside the window: verified views, the source split, nothing excluded for a clean post.
    private func writeSnapshots(post: Post, final: Int, from start: Date, to end: Date, previousVerified: Int) throws {
        let interval: TimeInterval = Double(FlowdConstants.Windows.snapshotIntervalHours) * 3_600
        var k: Int = Int((start.timeIntervalSince(post.postedAt) / interval).rounded(.down)) + 1
        var previous: Int = previousVerified
        let existing: Int = try store.viewSnapshots.all().filter { (s: ViewSnapshot) -> Bool in
            return s.postId == post.id
        }.count
        var sequence: Int = existing
        let number: String = String(post.id.dropFirst(5))
        while true {
            let at: Date = post.postedAt.addingTimeInterval(interval * Double(k))
            if at > end || at > post.windowEndsAt {
                break
            }
            if at > start {
                let verified: Int = Int((Double(final) * viewShare(hours: at.timeIntervalSince(post.postedAt) / 3_600)).rounded())
                sequence += 1
                let snapshot: ViewSnapshot = ViewSnapshot(
                    id: "vsn_" + number + "_" + FlowdCalendar.pad(sequence, 3),
                    postId: post.id,
                    takenAt: at,
                    viewsReported: verified,
                    viewsVerified: verified,
                    viewsInvalid: 0,
                    exclusions: nil,
                    deltaVerified: Swift.max(0, verified - previous),
                    source: .platformApi,
                    sources: ["fyp": 0.62, "following": 0.14, "profile": 0.08, "search": 0.05, "sound": 0.04, "share": 0.05, "other": 0.02],
                    geo: nil,
                    flags: [],
                    fraudScore: 0,
                    note: nil
                )
                try store.viewSnapshots.append(snapshot)
                previous = verified
            }
            k += 1
        }
    }

    /// Lets every live post of the creator gather views between two instants, with the likes, saves and tracked funnel that come with them, and keeps the
    /// accruing Money Clock row at the live estimate.
    func growPosts(from start: Date, to end: Date) throws {
        for post in try myPosts() where post.status == .live && end > post.postedAt {
            let ageFrom: Double = Swift.min(72, Swift.max(0, FlowdCalendar.hoursBetween(post.postedAt, start)))
            let ageTo: Double = Swift.min(72, Swift.max(0, FlowdCalendar.hoursBetween(post.postedAt, end)))
            let final: Int = try finalViews(for: post, ageHours: ageFrom)
            let target: Int = Int((Double(final) * viewShare(hours: ageTo)).rounded())
            let views: Int = Swift.max(post.views, target)
            if views == post.views {
                continue
            }
            let bounty: Bounty = try bountyRow(post.bountyId)
            let delta: Int = views - post.views
            let funnel: FunnelCounts = trackedFunnel(views: views, current: post.funnel)
            let result: SettlementResult = SettlementEngine.settlePost(
                windowViews: views,
                cpmCents: bounty.cpmCents,
                installs: funnel.installs,
                trials: funnel.trials,
                paid: funnel.paid,
                rates: bounty.cpaRates,
                perVideoCapCents: bounty.perVideoCapCents,
                takeRate: bounty.takeRate
            )
            let flat: Int = bounty.flatFeeCents
            let previousVerified: Int = post.windowViews
            try store.posts.update(post.id) { (p: inout Post) in
                p.views = views
                p.windowViews = views
                p.likes += MoneyMath.roundHalfUp(Double(delta) * 0.06)
                p.comments += MoneyMath.roundHalfUp(Double(delta) * 0.004)
                p.shares += MoneyMath.roundHalfUp(Double(delta) * 0.01)
                p.saves += MoneyMath.roundHalfUp(Double(delta) * 0.015)
                p.funnel = funnel
                p.earnings = EarningsBreakdown(
                    cpmCents: result.cpmPayCents,
                    cpaCents: result.cpaPayCents,
                    commissionCents: p.earnings.commissionCents,
                    flatCents: flat,
                    totalCents: result.cpmPayCents + result.cpaPayCents + flat + p.earnings.commissionCents,
                    capped: result.capped,
                    capRemainingCents: result.capRemainingCents
                )
            }
            for row in try moneyRows(forPost: post.id) where row.state == .accruing && (row.source == .cpm || row.source == .flatFee) {
                let estimate: Int = row.source == .flatFee ? flat : result.cpmPayCents + flat
                try store.moneyClock.update(row.id) { (r: inout MoneyClockRow) in
                    r.amountCents = estimate
                }
            }
            try writeSnapshots(post: post, final: final, from: start, to: end, previousVerified: previousVerified)
        }
    }

    // MARK: The window closes

    func closeWindows(at moment: Date) throws {
        for post in try myPosts() where post.status == .live && post.windowEndsAt <= moment {
            try settlePostWindow(postId: post.id, at: moment)
        }
    }

    /// Pool pay already settled on a post: the legs that count against the per-video cap.
    func poolPaidOnPost(_ postId: String) throws -> Int {
        var sum: Int = 0
        for entry in try myLedger() where entry.postId == postId && (entry.entryType == .cpm || entry.entryType == .cpa) && entry.status != .reversed {
            sum += entry.amountCents
        }
        return sum
    }

    /// The 72-hour window of a post closes: its views are final and the views leg (and any flat fee) is settled. A flagged post is held with a named reason.
    func settlePostWindow(postId: String, at moment: Date) throws {
        let post: Post = try postRow(postId)
        let bounty: Bounty = try bountyRow(post.bountyId)
        let windowEnd: Date = post.windowEndsAt
        let run: Date = MoneyClockEngine.postClearingRun(windowEnd: windowEnd)
        let held: HoldReason? = post.fraud.score >= FlowdConstants.Fraud.reviewThreshold ? .fraudReview : nil
        let rows: [MoneyClockRow] = try moneyRows(forPost: postId)
        let conversionRows: Bool = rows.contains(where: { (r: MoneyClockRow) -> Bool in
            return r.conversionId != nil
        })
        let alreadyPaid: Int = try poolPaidOnPost(postId)
        let flatSettled: Bool = try myLedger().contains(where: { (e: LedgerEntry) -> Bool in
            return e.postId == postId && e.entryType == .flatFee
        })
        let views: Int = post.views
        let funnel: FunnelCounts = post.funnel
        let result: SettlementResult = SettlementEngine.settlePost(
            windowViews: views,
            cpmCents: bounty.cpmCents,
            installs: conversionRows ? 0 : funnel.installs,
            trials: conversionRows ? 0 : funnel.trials,
            paid: conversionRows ? 0 : funnel.paid,
            rates: bounty.cpaRates,
            perVideoCapCents: bounty.perVideoCapCents,
            takeRate: bounty.takeRate,
            alreadyPaidCents: alreadyPaid
        )
        let flat: Int = flatSettled ? 0 : bounty.flatFeeCents
        let feeOnFlat: Int = MoneyMath.mulRate(flat, bounty.takeRate)
        let viewsPay: Int = bounty.type == .direct ? 0 : result.cpmPayCents
        let creatorLegStatus: LedgerStatus = held == nil ? .pending : .held
        let title: String = try earningLabel(bounty)
        var cpmLeg: LedgerEntry? = nil
        if viewsPay > 0 {
            cpmLeg = try addLedger(
                type: .cpm,
                amountCents: viewsPay,
                status: creatorLegStatus,
                memo: "Views pay: " + bounty.title + " (" + Fmt.grouped(views) + " verified views)",
                postedAt: windowEnd,
                bounty: bounty,
                postId: postId,
                submissionId: post.submissionId
            )
        }
        var flatLeg: LedgerEntry? = nil
        if flat > 0 {
            flatLeg = try addLedger(
                type: .flatFee,
                amountCents: flat,
                status: creatorLegStatus,
                memo: bounty.isStarter ? "Starter bounty: " + bounty.title : "Flat fee: " + bounty.title,
                postedAt: windowEnd,
                bounty: bounty,
                postId: postId,
                submissionId: post.submissionId
            )
        }
        var cpaLeg: LedgerEntry? = nil
        let cpaPay: Int = conversionRows ? 0 : result.cpaPayCents
        if cpaPay > 0 {
            cpaLeg = try addLedger(
                type: .cpa,
                amountCents: cpaPay,
                status: creatorLegStatus,
                memo: "Conversion pay: " + bounty.title + " (" + String(funnel.installs) + " installs, " + String(funnel.trials) + " trials)",
                postedAt: windowEnd,
                bounty: bounty,
                postId: postId,
                submissionId: post.submissionId
            )
        }
        let totalViewsLeg: Int = viewsPay + flat
        let fraudDeadline: Date = FlowdCalendar.addHours(windowEnd, Double(FlowdConstants.Windows.fraudCheckMaxHours))
        let reasonNow: MoneyClockReason = moment >= fraudDeadline ? .awaitingClearingRun : .fraudCheck
        let leadLedgerId: String? = cpmLeg?.id ?? flatLeg?.id
        let accruing: MoneyClockRow? = rows.first(where: { (r: MoneyClockRow) -> Bool in
            return r.state == .accruing && (r.source == .cpm || r.source == .flatFee)
        })
        if let row = accruing {
            if totalViewsLeg > 0 {
                try store.moneyClock.update(row.id) { (r: inout MoneyClockRow) in
                    r.amountCents = totalViewsLeg
                    r.estimated = false
                    r.ledgerId = leadLedgerId
                    if let reason = held {
                        r.state = .held
                        r.reason = MoneyClockEngine.reason(for: reason)
                        r.etaAt = nil
                        r.reasonText = MoneyClockEngine.holdStep(r.reason) ?? ""
                    } else {
                        r.state = .pending
                        r.reason = reasonNow
                        r.etaAt = run
                        r.reasonText = MoneyClockEngine.reasonText(reason: reasonNow, etaAt: run, windowEndsAt: windowEnd)
                    }
                }
            } else {
                try store.moneyClock.remove(row.id)
            }
        }
        if cpaPay > 0 {
            let kindForRun: ConversionKind = funnel.paid > 0 ? .paid : (funnel.trials > 0 ? .trial : .install)
            let cpaRun: Date = MoneyClockEngine.conversionRunOnPost(
                kind: kindForRun,
                occurredAt: FlowdCalendar.addHours(post.postedAt, 36),
                postedAt: post.postedAt
            )
            let source: MoneyClockSource = funnel.paid > 0 ? .cpaPaid : (funnel.trials > 0 ? .cpaTrial : .cpaInstall)
            let cpaRow: MoneyClockRow = MoneyClockRow(
                id: try nextMoneyRowId(),
                creatorId: meId,
                bountyId: bounty.id,
                appId: bounty.appId,
                postId: postId,
                conversionId: nil,
                source: source,
                state: held == nil ? .pending : .held,
                amountCents: cpaPay,
                estimated: false,
                earnedAt: windowEnd,
                etaAt: held == nil ? cpaRun : nil,
                reason: held == nil ? .conversionClearing : MoneyClockEngine.reason(for: held ?? .fraudReview),
                reasonText: held == nil ? MoneyClockEngine.reasonText(reason: .conversionClearing, etaAt: cpaRun) : (MoneyClockEngine.holdStep(MoneyClockEngine.reason(for: held ?? .fraudReview)) ?? ""),
                label: title,
                ledgerId: cpaLeg?.id,
                payoutId: nil,
                clearedAt: nil,
                paidAt: nil
            )
            try store.moneyClock.append(cpaRow)
        }
        let capPaid: Int = alreadyPaid + viewsPay + cpaPay
        try store.posts.update(postId) { (p: inout Post) in
            p.status = held == nil ? .windowClosed : .held
            p.holdReason = held
            p.windowViews = views
            p.earnings = EarningsBreakdown(
                cpmCents: viewsPay,
                cpaCents: cpaPay,
                commissionCents: p.earnings.commissionCents,
                flatCents: flat,
                totalCents: viewsPay + cpaPay + flat + p.earnings.commissionCents,
                capped: result.capped,
                capRemainingCents: Swift.max(0, bounty.perVideoCapCents - capPaid)
            )
        }
        let cost: Int = viewsPay + cpaPay + MoneyMath.mulRate(viewsPay, bounty.takeRate) + MoneyMath.mulRate(cpaPay, bounty.takeRate) + flat + feeOnFlat
        try spendFromPool(bountyId: bounty.id, costCents: cost)
        try recountBounty(bounty.id)
        try refreshCreatorStats(at: moment)
        if held == nil {
            try notify(
                .viewsMilestone,
                title: "72 hours done: " + Fmt.grouped(views) + " views",
                body: "Verified views are final. " + Fmt.money(totalViewsLeg + cpaPay) + " clears " + Fmt.clockLabelUTC(run) + " after the view check.",
                deepLink: "flowd://post/" + postId,
                refKind: "post",
                refId: postId,
                at: moment
            )
        } else {
            try notify(
                .payoutHeld,
                title: "A post is on hold",
                body: MoneyClockEngine.holdStep(MoneyClockEngine.reason(for: held ?? .fraudReview)) ?? "A person is reviewing the views.",
                amountCents: totalViewsLeg + cpaPay,
                deepLink: "flowd://post/" + postId,
                refKind: "post",
                refId: postId,
                at: moment
            )
        }
    }

    // MARK: Clearing run (14:00 UTC)

    private func ledgerType(for source: MoneyClockSource) -> LedgerType {
        switch source {
        case .cpm: return .cpm
        case .cpaInstall, .cpaTrial, .cpaPaid: return .cpa
        case .adCommission: return .commission
        case .flatFee: return .flatFee
        case .rightsFee: return .rightsFee
        case .prize: return .prize
        case .bonus: return .bonus
        case .referral: return .referral
        case .unknown: return .adjustment
        }
    }

    /// The daily 14:00 UTC run: posts that passed the check clear, conversions clear after their own windows, platform earnings clear.
    func clearingRun(at moment: Date) throws {
        for post in try myPosts() where post.status == .windowClosed && MoneyClockEngine.postClearingRun(windowEnd: post.windowEndsAt) <= moment {
            try store.posts.update(post.id) { (p: inout Post) in
                p.status = .cleared
                p.clearedAt = moment
            }
        }
        let payAt: Date = MoneyClockEngine.weeklyPayoutFor(clearedAt: moment)
        var clearedTotal: Int = 0
        var clearedRows: Int = 0
        let postStatus: [String: PostStatus] = Dictionary(uniqueKeysWithValues: try myPosts().map { (p: Post) -> (String, PostStatus) in
            return (p.id, p.status)
        })
        for row in try myMoneyRows() {
            let waitingOnWindow: Bool = row.reason == .windowOpen
            let isDue: Bool = (row.state == .pending || (row.state == .accruing && !waitingOnWindow)) && (row.etaAt ?? Date.distantFuture) <= moment
            if !isDue {
                continue
            }
            if let postId = row.postId, let status = postStatus[postId], status == .live || status == .held || status == .removed || status == .clawedBack {
                continue
            }
            var ledgerId: String? = row.ledgerId
            if let id = ledgerId, let entry = try store.ledger.find(id), entry.status == .pending || entry.status == .held {
                try store.ledger.update(id) { (e: inout LedgerEntry) in
                    e.status = .cleared
                    e.clearedAt = moment
                }
            } else if ledgerId == nil {
                let bounty: Bounty? = try store.bounties.find(row.bountyId)
                let leg: LedgerEntry = try addLedger(
                    type: ledgerType(for: row.source),
                    amountCents: row.amountCents,
                    status: .cleared,
                    memo: row.label,
                    postedAt: row.earnedAt,
                    clearedAt: moment,
                    bounty: bounty,
                    postId: row.postId
                )
                ledgerId = leg.id
            }
            let resolvedLedgerId: String? = ledgerId
            try store.moneyClock.update(row.id) { (r: inout MoneyClockRow) in
                r.state = .cleared
                r.reason = .awaitingWeeklyPayout
                r.etaAt = payAt
                r.clearedAt = moment
                r.estimated = false
                r.ledgerId = resolvedLedgerId
                r.reasonText = MoneyClockEngine.reasonText(reason: .awaitingWeeklyPayout, etaAt: payAt)
            }
            clearedTotal += row.amountCents
            clearedRows += 1
        }
        if clearedTotal > 0 {
            try store.creators.update(meId) { (c: inout Creator) in
                c.lifetimeClearedCents += clearedTotal
                if c.firstDollarAt == nil {
                    c.firstDollarAt = moment
                }
            }
            try updateTaxYearToDate(adding: clearedTotal, at: moment)
            let noun: String = clearedRows == 1 ? "earning" : "earnings"
            try notify(
                .cashEvent,
                title: "+" + Fmt.money(clearedTotal) + " cleared",
                body: String(clearedRows) + " " + noun + " passed the view and disclosure check at the 14:00 UTC run. They pay out " + Fmt.datedClockLabelUTC(payAt) + "; weekly payouts are free.",
                amountCents: clearedTotal,
                deepLink: "flowd://wallet/clock",
                refKind: "payout",
                refId: nil,
                at: moment
            )
            try advanceOnboarding(to: .firstDollar)
        }
        try refreshCreatorStats(at: moment)
        _ = try scheduleWeekly(runAt: payAt)
    }

    func updateTaxYearToDate(adding cents: Int, at moment: Date) throws {
        guard let profile = try store.taxProfiles.all().first(where: { (t: TaxProfile) -> Bool in
            return t.creatorId == meId
        }) else {
            return
        }
        try store.taxProfiles.update(profile.id) { (t: inout TaxProfile) in
            t.ytdClearedCents += cents
            t.setAsideCents = MoneyMath.mulRate(t.ytdClearedCents, t.setAsideRate)
            t.thresholdProgress = MoneyMath.round2(Swift.min(1, Double(t.ytdPaidCents) / Double(Swift.max(1, t.thresholdCents))))
            t.updatedAt = moment
        }
    }

    // MARK: Weekly payout (Friday 18:00 UTC)

    func methodLabel(_ creator: Creator) -> String {
        if let method = creator.payoutMethod {
            return method.label + " " + "\u{2022}\u{2022}" + method.last4
        }
        return "No payout method"
    }

    /// The cleared, unpaid rows a payout can carry.
    func payableRows() throws -> [MoneyClockRow] {
        return try myMoneyRows().filter { (r: MoneyClockRow) -> Bool in
            return r.state == .cleared && r.payoutId == nil
        }
    }

    /// Keeps one scheduled weekly payout for the next run: it carries every cleared earning not yet in a payout, and is `held` with a named reason while a
    /// payout-level hold applies. No cleared money means no scheduled payout.
    @discardableResult
    func scheduleWeekly(runAt: Date? = nil) throws -> Payout? {
        let creator: Creator = try meRow()
        let at: Date = runAt ?? MoneyClockEngine.nextWeeklyPayout(after: now)
        let runId: String = MoneyClockEngine.payoutRunId(at)
        let rows: [MoneyClockRow] = try payableRows()
        let existing: Payout? = try myPayouts().first(where: { (p: Payout) -> Bool in
            return p.kind == .weekly && p.runId == runId && (p.status == .scheduled || p.status == .held)
        })
        if rows.isEmpty {
            if let old = existing {
                try store.payouts.update(old.id) { (p: inout Payout) in
                    p.status = .cancelled
                }
            }
            return nil
        }
        let gross: Int = rows.reduce(0) { (total: Int, r: MoneyClockRow) -> Int in
            return total + r.amountCents
        }
        let hold: HoldReason? = try payoutHold()
        let label: String = methodLabel(creator)
        let tier: Tier = creator.tier
        if let old = existing {
            return try store.payouts.update(old.id) { (p: inout Payout) in
                p.status = hold == nil ? .scheduled : .held
                p.holdReason = hold
                p.grossCents = gross
                p.netCents = gross
                p.itemCount = rows.count
                p.methodLabel = label
                p.tierAtPayout = tier
            }
        }
        let id: String = try nextPayoutId()
        let payout: Payout = Payout(
            id: id,
            creatorId: meId,
            kind: .weekly,
            status: hold == nil ? .scheduled : .held,
            grossCents: gross,
            feeCents: 0,
            netCents: gross,
            runId: runId,
            requestedAt: now,
            scheduledFor: at,
            initiatedAt: nil,
            paidAt: nil,
            failedReason: nil,
            holdReason: hold,
            methodLabel: label,
            stripeTransferId: nil,
            ledgerTxnId: nil,
            itemCount: rows.count,
            tierAtPayout: tier,
            freeInstant: false,
            proofId: proofId(for: id)
        )
        try store.payouts.append(payout)
        return payout
    }

    /// Re-checks payout holds after something changed (a W-9, an ID check, a bank account): held rows go back to cleared, and cleared rows are held
    /// when a hold applies.
    func reevaluatePayoutHolds(at moment: Date? = nil) throws {
        let when: Date = moment ?? now
        let hold: HoldReason? = try payoutHold()
        let payoutLevel: [MoneyClockReason] = [.heldPayoutMethod, .heldIdentityCheck, .heldTaxInfo]
        for row in try myMoneyRows() {
            if row.state == .held && payoutLevel.contains(row.reason) && hold == nil {
                let payAt: Date = MoneyClockEngine.nextWeeklyPayout(after: when)
                try store.moneyClock.update(row.id) { (r: inout MoneyClockRow) in
                    r.state = .cleared
                    r.reason = .awaitingWeeklyPayout
                    r.etaAt = payAt
                    r.reasonText = MoneyClockEngine.reasonText(reason: .awaitingWeeklyPayout, etaAt: payAt)
                }
            } else if row.state == .held && payoutLevel.contains(row.reason), let reason = hold {
                // One payout-level hold replaced by the next one (identity done, now the tax form): the row names the hold that is current.
                let mapped: MoneyClockReason = MoneyClockEngine.reason(for: reason)
                if mapped != row.reason {
                    try store.moneyClock.update(row.id) { (r: inout MoneyClockRow) in
                        r.reason = mapped
                        r.reasonText = MoneyClockEngine.holdStep(mapped) ?? ""
                    }
                }
            } else if row.state == .cleared && row.payoutId == nil, let reason = hold {
                let mapped: MoneyClockReason = MoneyClockEngine.reason(for: reason)
                try store.moneyClock.update(row.id) { (r: inout MoneyClockRow) in
                    r.state = .held
                    r.reason = mapped
                    r.etaAt = nil
                    r.reasonText = MoneyClockEngine.holdStep(mapped) ?? ""
                }
            }
        }
        _ = try scheduleWeekly()
    }

    /// A public proof page for a payout: the verified amount, the tier and the typical creator beside it.
    func createProof(for payout: Payout, rows: [MoneyClockRow], at moment: Date) throws {
        if try store.proofs.find(payout.proofId) != nil {
            return
        }
        let creator: Creator = try meRow()
        let totals: TickerTotals = try store.ticker().totals
        let dates: [Date] = rows.map { (r: MoneyClockRow) -> Date in
            return r.earnedAt
        }.sorted()
        let postIds: Set<String> = Set(rows.compactMap { (r: MoneyClockRow) -> String? in
            return r.postId
        })
        let ids: String = rows.map { (r: MoneyClockRow) -> String in
            return r.id
        }.joined(separator: "|")
        let proof: Proof = Proof(
            id: payout.proofId,
            kind: .payout,
            creatorId: creator.id,
            handle: creator.handle,
            anonymous: false,
            payoutId: payout.id,
            periodLabel: payout.runId != nil ? "Weekly payout " + String((payout.runId ?? "").dropFirst(4)) : "Instant cash-out",
            periodStart: FlowdCalendar.dayString(dates.first ?? payout.requestedAt),
            periodEnd: FlowdCalendar.dayString(payout.requestedAt),
            amountCents: payout.netCents,
            tier: creator.tier,
            postsCount: postIds.count,
            typicalMedianCents: totals.typicalCreator30dCents,
            typicalP25Cents: totals.p25Creator30dCents,
            typicalP75Cents: totals.p75Creator30dCents,
            ledgerHash: StableHash.hex8(ids) + String(StableHash.hex8(payout.id + "|" + String(payout.netCents)).prefix(4)),
            art: ArtSeed(key: payout.proofId, title: "Paid " + Fmt.money(payout.netCents), caption: "@" + creator.handle, glyph: "checkmark.seal.fill"),
            revoked: false,
            pageViews: 0,
            createdAt: moment
        )
        try store.proofs.append(proof)
    }

    /// Marks earning rows paid (in transit until the transfer lands) and their ledger legs paid.
    func payRows(_ rows: [MoneyClockRow], payout: Payout, paidAt moment: Date, arrives: Date) throws {
        for row in rows {
            if let ledgerId = row.ledgerId, let entry = try store.ledger.find(ledgerId), entry.status != .paid {
                try store.ledger.update(ledgerId) { (e: inout LedgerEntry) in
                    e.status = .paid
                    e.paidAt = moment
                    e.payoutId = payout.id
                }
            }
            try store.moneyClock.update(row.id) { (r: inout MoneyClockRow) in
                r.state = .paid
                r.reason = .payoutInTransit
                r.payoutId = payout.id
                r.paidAt = moment
                r.etaAt = nil
                r.reasonText = MoneyClockEngine.reasonText(reason: .payoutInTransit, arrivesAt: arrives)
            }
        }
        // A post whose earnings are all paid reads "paid".
        for post in try myPosts() where post.status == .cleared {
            let open: Bool = try moneyRows(forPost: post.id).contains(where: { (r: MoneyClockRow) -> Bool in
                return r.state == .pending || r.state == .accruing || r.state == .cleared || r.state == .held
            })
            if !open {
                try store.posts.update(post.id) { (p: inout Post) in
                    p.status = .paid
                    p.paidAt = moment
                }
            }
        }
    }

    /// Posts a payout: the payout leg on the ledger, the proof, the payout row and the rows it carries. Shared by the weekly run and the instant cash-out.
    func pay(rows: [MoneyClockRow], payout existing: Payout, grossCents: Int, feeCents: Int, at moment: Date) throws -> Payout {
        let creator: Creator = try meRow()
        let txn: String = try nextTxnId()
        let net: Int = grossCents - feeCents
        var memo: String = "Weekly payout " + (existing.runId ?? "")
        if existing.kind == .instant {
            memo = feeCents > 0 ? "Instant cash-out (fee " + Fmt.money(feeCents) + ")" : "Instant cash-out (free)"
        }
        try addLedger(type: .payout, amountCents: -grossCents, status: .paid, memo: memo, postedAt: moment, paidAt: moment, txnId: txn, payoutId: existing.id)
        try addLedger(type: .payout, amountCents: net, status: .paid, memo: memo, postedAt: moment, paidAt: moment, txnId: txn, payoutId: existing.id, account: "external:bank")
        if feeCents > 0 {
            try addLedger(type: .payoutFee, amountCents: feeCents, status: .cleared, memo: "Instant cash-out fee (" + Fmt.money(feeCents) + ")", postedAt: moment, txnId: txn, payoutId: existing.id, account: "platform:fees")
        }
        let arrives: Date = MoneyClockEngine.estimatePayoutArrival(kind: existing.kind, initiatedAt: moment)
        let label: String = methodLabel(creator)
        let tier: Tier = creator.tier
        let transfer: String = "tr_" + StableHash.hex8(existing.id + "|tr") + String(StableHash.hex8(existing.id + "|id").prefix(4))
        let updated: Payout = try store.payouts.update(existing.id) { (p: inout Payout) in
            p.status = .inTransit
            p.grossCents = grossCents
            p.feeCents = feeCents
            p.netCents = net
            p.itemCount = rows.count
            p.initiatedAt = moment
            p.holdReason = nil
            p.stripeTransferId = transfer
            p.ledgerTxnId = txn
            p.methodLabel = label
            p.tierAtPayout = tier
        }
        try payRows(rows, payout: updated, paidAt: moment, arrives: arrives)
        try createProof(for: updated, rows: rows, at: moment)
        return updated
    }

    /// The Friday 18:00 UTC run: the scheduled payout is paid (free), or stays held with its reason.
    func payoutRun(at moment: Date) throws {
        let runId: String = MoneyClockEngine.payoutRunId(moment)
        _ = try scheduleWeekly(runAt: moment)
        guard let payout = try myPayouts().first(where: { (p: Payout) -> Bool in
            return p.kind == .weekly && p.runId == runId && (p.status == .scheduled || p.status == .held)
        }) else {
            return
        }
        let rows: [MoneyClockRow] = try payableRows()
        if rows.isEmpty {
            try store.payouts.update(payout.id) { (p: inout Payout) in
                p.status = .cancelled
            }
            return
        }
        let gross: Int = rows.reduce(0) { (total: Int, r: MoneyClockRow) -> Int in
            return total + r.amountCents
        }
        if let hold = try payoutHold() {
            try store.payouts.update(payout.id) { (p: inout Payout) in
                p.status = .held
                p.holdReason = hold
            }
            let mapped: MoneyClockReason = MoneyClockEngine.reason(for: hold)
            for row in rows {
                try store.moneyClock.update(row.id) { (r: inout MoneyClockRow) in
                    r.state = .held
                    r.reason = mapped
                    r.etaAt = nil
                    r.reasonText = MoneyClockEngine.holdStep(mapped) ?? ""
                }
            }
            try notify(
                .payoutHeld,
                title: "Your weekly payout is on hold",
                body: MoneyClockEngine.holdStep(mapped) ?? "Open Wallet to fix it; your money is safe in the meantime.",
                amountCents: gross,
                deepLink: "flowd://wallet",
                refKind: "payout",
                refId: payout.id,
                at: moment
            )
            return
        }
        let paid: Payout = try pay(rows: rows, payout: payout, grossCents: gross, feeCents: 0, at: moment)
        let arrives: Date = MoneyClockEngine.estimatePayoutArrival(kind: .weekly, initiatedAt: moment)
        try notify(
            .payoutPaid,
            title: Fmt.money(gross) + " is on its way",
            body: "Your weekly payout left flowd " + Fmt.clockLabelUTC(moment) + " and arrives " + Fmt.clockLabelUTC(arrives) + ". It was free.",
            amountCents: gross,
            deepLink: "flowd://payout/" + paid.id,
            refKind: "payout",
            refId: paid.id,
            at: moment
        )
        try refreshCreatorStats(at: moment)
    }

    /// Transfers that have landed: in-transit payouts whose arrival time has passed become paid, and their rows read "Paid out".
    func completeTransfers(at moment: Date) throws {
        for payout in try myPayouts() where payout.status == .inTransit {
            guard let started = payout.initiatedAt else {
                continue
            }
            let arrives: Date = MoneyClockEngine.estimatePayoutArrival(kind: payout.kind, initiatedAt: started)
            if arrives > moment {
                continue
            }
            try store.payouts.update(payout.id) { (p: inout Payout) in
                p.status = .paid
                p.paidAt = arrives
            }
            for row in try myMoneyRows() where row.payoutId == payout.id && row.reason == .payoutInTransit {
                try store.moneyClock.update(row.id) { (r: inout MoneyClockRow) in
                    r.reason = .paidOut
                    r.reasonText = "Paid out."
                }
            }
        }
    }

    // MARK: Verification (the mock provider answers within its SLA)

    /// The verification partner (a mock) decides a pending check once its 24-hour SLA has passed: identity verifies the creator and releases payout holds.
    func resolveVerifications(at moment: Date) throws {
        for row in try store.verifications.all() where row.creatorId == meId && row.status == .pending && row.slaDueAt <= moment {
            let decided: Date = row.slaDueAt
            try store.verifications.update(row.id) { (v: inout Verification) in
                v.status = .verified
                v.decidedAt = decided
                v.blocksPayout = false
            }
            if row.kind == .identity {
                try store.creators.update(meId) { (c: inout Creator) in
                    c.verificationStatus = .verified
                    if !c.badges.contains(.idVerified) {
                        c.badges.append(.idVerified)
                    }
                }
                try syncPayoutReady()
                try reevaluatePayoutHolds(at: moment)
                try notify(
                    .systemNotice,
                    title: "Identity verified",
                    body: "Your payouts are no longer held for an identity check.",
                    deepLink: "flowd://settings/verification",
                    refKind: "verification",
                    refId: row.id,
                    at: decided
                )
            }
        }
    }

    // MARK: Disputes hold the money

    /// While a dispute on a post is open its unpaid money is held with a named reason; it releases when the dispute is resolved.
    func holdMoney(forPost postId: String, at moment: Date) throws {
        for row in try moneyRows(forPost: postId) where (row.state == .pending || row.state == .cleared) && row.payoutId == nil {
            try store.moneyClock.update(row.id) { (r: inout MoneyClockRow) in
                r.state = .held
                r.reason = .heldDispute
                r.etaAt = nil
                r.reasonText = MoneyClockEngine.holdStep(.heldDispute) ?? ""
            }
            if let ledgerId = row.ledgerId, let entry = try store.ledger.find(ledgerId), entry.status == .pending || entry.status == .cleared {
                try store.ledger.update(ledgerId) { (e: inout LedgerEntry) in
                    e.status = .held
                }
            }
        }
        if let post = try store.posts.find(postId), post.status == .windowClosed || post.status == .cleared {
            try store.posts.update(postId) { (p: inout Post) in
                p.status = .held
                p.holdReason = .disputeOpen
            }
        }
    }

    func releaseHold(forPost postId: String, at moment: Date) throws {
        for row in try moneyRows(forPost: postId) where row.state == .held && row.reason == .heldDispute {
            let wasCleared: Bool = row.clearedAt != nil
            let payAt: Date = MoneyClockEngine.nextWeeklyPayout(after: moment)
            let run: Date = MoneyClockEngine.nextClearingRun(after: moment)
            try store.moneyClock.update(row.id) { (r: inout MoneyClockRow) in
                if wasCleared {
                    r.state = .cleared
                    r.reason = .awaitingWeeklyPayout
                    r.etaAt = payAt
                    r.reasonText = MoneyClockEngine.reasonText(reason: .awaitingWeeklyPayout, etaAt: payAt)
                } else {
                    r.state = .pending
                    r.reason = .awaitingClearingRun
                    r.etaAt = run
                    r.reasonText = MoneyClockEngine.reasonText(reason: .awaitingClearingRun, etaAt: run)
                }
            }
            if let ledgerId = row.ledgerId, let entry = try store.ledger.find(ledgerId), entry.status == .held {
                try store.ledger.update(ledgerId) { (e: inout LedgerEntry) in
                    e.status = wasCleared ? .cleared : .pending
                }
            }
        }
        if let post = try store.posts.find(postId), post.status == .held, post.holdReason == .disputeOpen {
            try store.posts.update(postId) { (p: inout Post) in
                p.status = p.clearedAt != nil ? .cleared : .windowClosed
                p.holdReason = nil
            }
        }
    }
}
