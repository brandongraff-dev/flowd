import Foundation

// Shared plumbing of the mock API: ids, ledger legs, the creator's counters and tier, and the labels every list row reads.

extension MockFlowdAPI {
    // MARK: Ids

    /// Like `nextId`, but the table scan runs only the first time a prefix is used.
    func nextIdLazy(_ prefix: String, width: Int, existing: () throws -> [String]) rethrows -> String {
        let number: Int
        if let current = idCounters[prefix] {
            number = current + 1
        } else {
            var highest: Int = 0
            let lead: String = prefix + "_"
            for id in try existing() where id.hasPrefix(lead) {
                if let value = Int(id.dropFirst(lead.count)) {
                    highest = Swift.max(highest, value)
                }
            }
            number = highest + 1
        }
        idCounters[prefix] = number
        return prefix + "_" + FlowdCalendar.pad(number, width)
    }

    func nextLedgerId() throws -> String {
        return try nextIdLazy("ledg", width: 6, existing: { () throws -> [String] in
            return try self.store.ledger.all().map { (e: LedgerEntry) -> String in
                return e.id
            }
        })
    }

    func nextTxnId() throws -> String {
        return try nextIdLazy("txn", width: 6, existing: { () throws -> [String] in
            return try self.store.ledger.all().map { (e: LedgerEntry) -> String in
                return e.txnId
            }
        })
    }

    func nextMoneyRowId() throws -> String {
        return try nextIdLazy("mc", width: 4, existing: { () throws -> [String] in
            return try self.store.moneyClock.all().map { (r: MoneyClockRow) -> String in
                return r.id
            }
        })
    }

    func nextPayoutId() throws -> String {
        return try nextIdLazy("pay", width: 4, existing: { () throws -> [String] in
            return try self.store.payouts.all().map { (p: Payout) -> String in
                return p.id
            }
        })
    }

    /// `prf_a1b2c3d4`: a proof id derived from the payout id.
    func proofId(for payoutId: String) -> String {
        return "prf_" + StableHash.hex8("proof|" + payoutId)
    }

    // MARK: Ledger

    /// Appends one leg to the creator's ledger.
    @discardableResult
    func addLedger(
        type: LedgerType,
        amountCents: Int,
        status: LedgerStatus,
        memo: String,
        postedAt: Date,
        clearedAt: Date? = nil,
        paidAt: Date? = nil,
        txnId: String? = nil,
        bounty: Bounty? = nil,
        postId: String? = nil,
        submissionId: String? = nil,
        payoutId: String? = nil,
        account: String? = nil
    ) throws -> LedgerEntry {
        let legAccount: String = account ?? "creator:" + meId
        let ownedByCreator: Bool = legAccount.hasPrefix("creator:") || legAccount == "platform:fees"
        let txn: String
        if let given = txnId {
            txn = given
        } else {
            txn = try nextTxnId()
        }
        let entry: LedgerEntry = LedgerEntry(
            id: try nextLedgerId(),
            txnId: txn,
            entryType: type,
            account: legAccount,
            amountCents: amountCents,
            status: status,
            postedAt: postedAt,
            clearedAt: clearedAt,
            paidAt: paidAt,
            brandId: bounty?.brandId,
            bountyId: bounty?.id,
            postId: postId,
            submissionId: submissionId,
            creatorId: ownedByCreator ? meId : nil,
            conversionId: nil,
            adId: nil,
            payoutId: payoutId,
            invoiceId: nil,
            reversesTxnId: nil,
            memo: memo
        )
        try store.ledger.append(entry)
        return entry
    }

    /// The signed-in creator's own earning legs and payout legs.
    func myLedger() throws -> [LedgerEntry] {
        let account: String = "creator:" + meId
        return try store.ledger.all().filter { (e: LedgerEntry) -> Bool in
            return e.account == account
        }
    }

    // MARK: Creator counters and tier

    /// Recomputes the creator's counters from their submissions and posts, then re-evaluates the tier. A promotion writes the tier history and tells
    /// the creator; a dip starts the 30-day grace hold (no tier drop for 30 days). Called after every decision, post and clearing run.
    func refreshCreatorStats(at date: Date? = nil) throws {
        let moment: Date = date ?? now
        let subs: [Submission] = try mySubmissions()
        var approved: Int = 0
        var rejected: Int = 0
        for s in subs {
            switch s.status {
            case .approved, .posted:
                approved += 1
            case .rejected:
                rejected += 1
            case .qaPending, .inReview, .changesRequested, .appealed, .withdrawn, .expired, .released, .unknown:
                break
            }
        }
        let posts: [Post] = try myPosts().filter { (p: Post) -> Bool in
            return p.status != .removed
        }
        let live: Int = posts.filter { (p: Post) -> Bool in
            return p.status == .live
        }.count
        let creator: Creator = try meRow()
        let carry: CarryOver? = creator.carryOver
        let totalApproved: Int = approved + (carry?.approvedCount ?? 0)
        let totalDecided: Int = approved + rejected + (carry?.decidedCount ?? 0)
        let rate: Double = TierEngine.approvalRate(approved: totalApproved, decided: totalDecided)
        var reliability: Int = creator.reliabilityScore
        if persona == .newCreator {
            let decisions: [FinishedDecision] = subs.compactMap { (s: Submission) -> FinishedDecision? in
                guard let decision = s.decision else {
                    return nil
                }
                switch s.status {
                case .approved, .posted:
                    return FinishedDecision(approved: true, decidedAt: decision.decidedAt)
                case .rejected:
                    return FinishedDecision(approved: false, decidedAt: decision.decidedAt)
                default:
                    return nil
                }
            }
            let result: CreatorReliabilityResult = ReputationEngine.creatorReliability(
                decisions: decisions,
                now: moment,
                onTimeOk: 1,
                onTimeTotal: 1,
                postThroughPosted: posts.count,
                postThroughApproved: Swift.max(posts.count, approved),
                compliancePassed: posts.count,
                complianceTotal: posts.count,
                fraudConfirmed90d: 0,
                clawbacks90d: 0,
                disputesLost90d: 0,
                academyLessons: completedLessonCount()
            )
            reliability = result.score
        }
        let paused: Bool = (creator.pausedUntil ?? Date.distantPast) > moment
        let stats: TierStats = TierStats(
            lifetimeClearedCents: creator.lifetimeClearedCents,
            approvedCount: totalApproved,
            approvalRate: rate,
            reliabilityScore: reliability,
            eliteReviewed: creator.tierReview != nil
        )
        var dipStart: Date? = nil
        if creator.tierBasis == .graceHold, let until = creator.tierHoldUntil {
            dipStart = FlowdCalendar.addDays(until, -Double(FlowdConstants.Tiers.demotionGraceDays))
        }
        let evaluation: TierEvaluation = TierEngine.evaluate(
            stats: stats,
            heldTier: creator.tier,
            heldBasis: creator.tierBasis,
            dipStartedAt: dipStart,
            now: moment,
            paused: paused
        )
        let before: Tier = creator.tier
        try store.creators.update(meId) { (c: inout Creator) in
            c.approvedCount = approved
            c.decidedCount = approved + rejected
            c.approvalRate = rate
            c.reliabilityScore = reliability
            c.postsCount = posts.count
            c.livePostsCount = live
            c.lastActiveAt = moment
            if evaluation.tier != c.tier {
                c.tierSince = moment
            }
            c.tier = evaluation.tier
            c.tierBasis = evaluation.tierBasis
            c.tierHoldUntil = evaluation.tierHoldUntil
        }
        if let kind = evaluation.event, kind != .holdCleared || before != evaluation.tier || creator.tierBasis != evaluation.tierBasis {
            try recordTierEvent(kind: kind, from: before, to: evaluation.tier, basis: evaluation.tierBasis, stats: stats, at: moment)
        }
    }

    private func recordTierEvent(kind: TierEventKind, from: Tier, to: Tier, basis: TierBasis, stats: TierStats, at moment: Date) throws {
        let id: String = try nextIdLazy("tev", width: 4, existing: { () throws -> [String] in
            return try self.store.tierHistory.all().map { (e: TierEvent) -> String in
                return e.id
            }
        })
        let perks: [String] = TierEngine.perkLines(to)
        var note: String
        switch kind {
        case .promoted, .granted:
            note = "Reached " + to.label + ": " + Fmt.money(stats.lifetimeClearedCents) + " cleared, " + String(stats.approvedCount) + " approved, " + Fmt.percent(stats.approvalRate, digits: 0) + " approval."
            if !perks.isEmpty {
                note += " Unlocked " + Fmt.joinList(perks).lowercased() + "."
            }
        case .holdStarted:
            note = "Numbers dipped below " + from.label + ". No tier drop for " + String(FlowdConstants.Tiers.demotionGraceDays) + " days."
        case .holdCleared:
            note = "Back above the " + from.label + " thresholds. The hold is lifted."
        case .demoted:
            note = "The numbers support " + to.label + " after the 30-day hold."
        case .carryOverApplied:
            note = "Verified earlier history counts toward your tier."
        case .unknown:
            note = ""
        }
        let event: TierEvent = TierEvent(
            id: id,
            creatorId: meId,
            kind: kind,
            fromTier: from == to ? nil : from,
            toTier: to,
            basis: basis,
            at: moment,
            stats: TierStatsSnapshot(
                lifetimeClearedCents: stats.lifetimeClearedCents,
                approvedCount: stats.approvedCount,
                approvalRate: stats.approvalRate,
                reliabilityScore: stats.reliabilityScore
            ),
            note: note
        )
        try store.tierHistory.append(event)
        if kind == .promoted {
            try notify(
                .tierUp,
                title: "You reached " + to.label,
                body: perks.isEmpty ? "Your new tier is on your profile." : "Unlocked: " + Fmt.joinList(perks).lowercased() + ". See what changed on your Tiers screen.",
                deepLink: "flowd://tiers",
                refKind: "tier_event",
                refId: id,
                at: moment
            )
        }
    }

    func completedLessonCount() -> Int {
        let rows: [LessonProgress] = (try? store.lessonProgress.all()) ?? []
        return rows.filter { (p: LessonProgress) -> Bool in
            return p.creatorId == meId && p.status == .completed
        }.count
    }

    // MARK: Review clock and labels

    /// When the current version entered review.
    func enteredReviewAt(_ submission: Submission) -> Date {
        if let version = submission.versions.last {
            return version.submittedAt
        }
        return submission.submittedAt
    }

    /// The review countdown while the brand has the video.
    func reviewClock(for submission: Submission, bounty: Bounty) -> ReviewClock? {
        guard submission.isWaitingOnBrand else {
            return nil
        }
        return ReputationEngine.reviewClock(enteredReviewAt: enteredReviewAt(submission), now: now, slaHours: bounty.reviewSlaHours)
    }

    /// "In review. Decide by Fri 2:00 PM UTC": one calm line about where a submission stands and what happens next.
    func statusLine(for submission: Submission, bounty: Bounty, clock: ReviewClock?) -> String {
        switch submission.status {
        case .qaPending:
            return "Checking your video before the brand sees it."
        case .inReview:
            if let c = clock {
                return "In review. " + c.label
            }
            return "In review."
        case .changesRequested:
            let left: Int = submission.revisionRoundsLeft
            let round: String = "Round " + String(submission.revisionRound) + " of " + String(Submission.includedRevisionRounds) + "."
            return "Changes requested. " + round + (left > 0 ? " Upload a new version." : " Further rounds are paid by the brand.")
        case .approved:
            return "Approved. Post it to open the 72-hour view window."
        case .posted:
            return "Posted. Views are counting."
        case .rejected:
            if let reason = submission.decision?.reasonCode {
                return "Not approved: " + reason.label + "."
            }
            return "Not approved."
        case .appealed:
            return "Appeal with Ops. A decision follows within 72 hours."
        case .withdrawn:
            return "Withdrawn. Your reservation went back to the pool."
        case .expired:
            return "Expired. The window to resubmit passed."
        case .released:
            return "Released to the Spec Market after " + String(FlowdConstants.Review.unusedReleaseDays) + " days unused."
        case .unknown:
            return ""
        }
    }

    func openNoteCount(_ submissionId: String) -> Int {
        let rows: [FeedbackNote] = (try? store.feedbackNotes.all()) ?? []
        return rows.filter { (n: FeedbackNote) -> Bool in
            return n.submissionId == submissionId && n.status == .open
        }.count
    }

    /// One row of the submissions list.
    func submissionListItem(_ submission: Submission) throws -> SubmissionListItem {
        let bounty: Bounty = try bountyRow(submission.bountyId)
        let clock: ReviewClock? = reviewClock(for: submission, bounty: bounty)
        let thumb: ArtSeed = submission.versions.last?.video.art ?? bounty.art
        return SubmissionListItem(
            submission: submission,
            bountyTitle: bounty.title,
            brand: try brandCard(bounty.brandId),
            thumb: thumb,
            clock: clock,
            statusLine: statusLine(for: submission, bounty: bounty, clock: clock),
            openNotes: openNoteCount(submission.id)
        )
    }

    // MARK: Money rows of a post

    func moneyRows(forPost postId: String) throws -> [MoneyClockRow] {
        return try myMoneyRows().filter { (r: MoneyClockRow) -> Bool in
            return r.postId == postId
        }
    }

    /// The label of an app and bounty on a Money Clock row: "Lumi: Fix a bad photo live".
    func earningLabel(_ bounty: Bounty) throws -> String {
        let app: BrandApp = try appRow(bounty.appId)
        return app.name + ": " + bounty.title
    }
}
