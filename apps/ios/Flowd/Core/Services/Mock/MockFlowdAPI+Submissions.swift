import Foundation

// SubmissionsAPI: submit a take (a Reserved Slot is taken from the pool), revise after "changes requested", withdraw, appeal a rejection once, resolve
// timecoded notes, and attach the post URL to open the 72-hour view window. Mirrors apps/web/src/lib/store/core/{submissions,posts,escrow,review}.ts.

extension MockFlowdAPI {
    // MARK: Escrow helpers (the bounty's pool)

    /// One Reserved Slot: the per-video cap plus the fee on it. Throws `poolExhausted` when the pool cannot cover one more video.
    func reserveSlot(bountyId: String) throws -> Int {
        let bounty: Bounty = try bountyRow(bountyId)
        let unit: Int = bounty.reservationUnitCents
        if unit <= 0 || bounty.remainingCents < unit {
            throw FlowdAPIError.poolExhausted
        }
        try store.bounties.update(bountyId) { (b: inout Bounty) in
            b.reservedCents += unit
            b.remainingCents -= unit
        }
        try syncCapacity(bountyId: bountyId)
        return unit
    }

    /// A rejection, withdrawal, release or posting gives the reservation back to the pool.
    func releaseSlot(bountyId: String, cents: Int) throws {
        if cents <= 0 {
            return
        }
        try store.bounties.update(bountyId) { (b: inout Bounty) in
            let given: Int = Swift.min(cents, b.reservedCents)
            b.reservedCents -= given
            b.remainingCents += given
        }
        try syncCapacity(bountyId: bountyId)
    }

    /// A settled post spends from the pool. An approved post is always paid: when the pool has run dry the brand's wallet covers the rest (the escrow
    /// funded total grows by the shortfall, so the identity escrow = reserved + spent + remaining + refunded always holds).
    func spendFromPool(bountyId: String, costCents: Int) throws {
        if costCents <= 0 {
            return
        }
        try store.bounties.update(bountyId) { (b: inout Bounty) in
            let fromPool: Int = Swift.min(costCents, b.remainingCents)
            b.remainingCents -= fromPool
            b.spentCents += costCents
            if costCents > fromPool {
                b.escrowFundedCents += costCents - fromPool
            }
        }
        try syncCapacity(bountyId: bountyId)
    }

    /// live to filled when no spot is left, filled back to live when one frees up (and the bounty has not ended).
    func syncCapacity(bountyId: String) throws {
        let bounty: Bounty = try bountyRow(bountyId)
        let spots: Int = bounty.spotsLeft
        if bounty.status == .live && spots == 0 {
            let from: Date = bounty.publishedAt ?? bounty.startsAt
            let moment: Date = now
            try store.bounties.update(bountyId) { (b: inout Bounty) in
                b.status = .filled
                b.filledAt = moment
                b.timeToFillHours = (FlowdCalendar.hoursBetween(from, moment) * 10).rounded() / 10
                b.updatedAt = moment
            }
        } else if bounty.status == .filled && spots >= 1 && bounty.endsAt > now {
            let moment: Date = now
            try store.bounties.update(bountyId) { (b: inout Bounty) in
                b.status = .live
                b.updatedAt = moment
            }
        }
    }

    /// Recomputes a bounty's counters and lifetime funnel from the rows they summarise (never incremented, so they cannot drift).
    func recountBounty(_ bountyId: String) throws {
        let subs: [Submission] = try store.submissions.all().filter { (s: Submission) -> Bool in
            return s.bountyId == bountyId
        }
        let posts: [Post] = try store.posts.all().filter { (p: Post) -> Bool in
            return p.bountyId == bountyId
        }
        let counts: BountyCounts = BountyCounts(
            creators: Set(subs.map { (s: Submission) -> String in return s.creatorId }).count,
            submissions: subs.count,
            inReview: subs.filter { (s: Submission) -> Bool in return s.status == .inReview }.count,
            approved: subs.filter { (s: Submission) -> Bool in
                return s.status == .approved || s.status == .posted || s.status == .released
            }.count,
            rejected: subs.filter { (s: Submission) -> Bool in return s.status == .rejected }.count,
            posts: posts.count,
            livePosts: posts.filter { (p: Post) -> Bool in return p.status == .live }.count
        )
        var funnel: FunnelCounts = FunnelCounts(views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, estInstalls: 0, estTrials: 0, estPaid: 0)
        for post in posts {
            funnel.views += post.funnel.views
            funnel.clicks += post.funnel.clicks
            funnel.installs += post.funnel.installs
            funnel.trials += post.funnel.trials
            funnel.paid += post.funnel.paid
            funnel.estInstalls += post.funnel.estInstalls
            funnel.estTrials += post.funnel.estTrials
            funnel.estPaid += post.funnel.estPaid
        }
        let first: Date? = subs.map { (s: Submission) -> Date in
            return s.submittedAt
        }.min()
        let moment: Date = now
        try store.bounties.update(bountyId) { (b: inout Bounty) in
            b.counts = counts
            if posts.count > 0 {
                b.funnel = funnel
            }
            if b.firstSubmissionAt == nil {
                b.firstSubmissionAt = first
            }
            b.updatedAt = moment
        }
    }

    // MARK: Reading

    func submissions(filter: SubmissionFilter) async throws -> [SubmissionListItem] {
        try requireSignedIn()
        try reconcileIfNeeded()
        let rows: [Submission] = try mySubmissions().filter { (s: Submission) -> Bool in
            switch filter {
            case .all:
                return true
            case .inReview:
                return s.status == .qaPending || s.status == .inReview
            case .needsChanges:
                return s.status == .changesRequested
            case .approved:
                return s.status == .approved
            case .rejected:
                return s.status == .rejected || s.status == .appealed
            case .posted:
                return s.status == .posted
            case .closed:
                return s.status == .withdrawn || s.status == .expired || s.status == .released
            }
        }.sorted { (a: Submission, b: Submission) -> Bool in
            return a.updatedAt > b.updatedAt
        }
        var out: [SubmissionListItem] = []
        for row in rows {
            out.append(try submissionListItem(row))
        }
        return out
    }

    /// The stored analysis of a submission version (the latest when `version` is nil).
    func analysisRow(submissionId: String, version: Int?) throws -> VideoAnalysis? {
        let rows: [VideoAnalysis] = try store.videoAnalyses.all().filter { (a: VideoAnalysis) -> Bool in
            return a.submissionId == submissionId
        }
        if let wanted = version {
            return rows.first(where: { (a: VideoAnalysis) -> Bool in
                return a.version == wanted
            })
        }
        return rows.max(by: { (a: VideoAnalysis, b: VideoAnalysis) -> Bool in
            return a.version < b.version
        })
    }

    func canAppeal(_ submission: Submission) -> Bool {
        return submission.canAppeal(now: now)
    }

    func trackingLine(link: AttributionLink?) -> String? {
        guard let link = link else {
            return nil
        }
        var line: String = "Try it: " + link.shortUrl
        if let code = link.promoCode, !code.isEmpty {
            line += " or use code " + code
        }
        return line
    }

    func submissionDetail(id: String) async throws -> SubmissionDetail {
        try requireSignedIn()
        try reconcileIfNeeded()
        let submission: Submission = try submissionRow(id)
        let bounty: Bounty = try bountyRow(submission.bountyId)
        let notes: [FeedbackNote] = try store.feedbackNotes.all().filter { (n: FeedbackNote) -> Bool in
            return n.submissionId == id
        }.sorted { (a: FeedbackNote, b: FeedbackNote) -> Bool in
            if a.version != b.version {
                return a.version > b.version
            }
            return a.tMs < b.tMs
        }
        var post: Post? = nil
        if let postId = submission.postId {
            post = try store.posts.find(postId)
        }
        var link: AttributionLink? = nil
        if let linkId = submission.linkId {
            link = try store.links.find(linkId)
        }
        var code: OfferCode? = nil
        if let promo = link?.promoCode {
            code = try store.offerCodes.all().first(where: { (c: OfferCode) -> Bool in
                return c.code == promo && c.assignedCreatorId == meId
            })
        }
        let clock: ReviewClock? = reviewClock(for: submission, bounty: bounty)
        let appealable: Bool = canAppeal(submission)
        var deadline: Date? = nil
        if appealable, let decided = submission.decision?.decidedAt {
            deadline = FlowdCalendar.addDays(decided, Double(FlowdConstants.Review.appealWindowDays))
        }
        let tracking: String? = trackingLine(link: link)
        var caption: String? = nil
        if submission.status == .approved || submission.status == .posted {
            caption = BriefHelpers.caption(disclosure: bounty.brief.disclosureText, body: "", trackingLine: tracking, hashtags: bounty.brief.hashtags)
        }
        return SubmissionDetail(
            submission: submission,
            bounty: bounty,
            brand: try brandCard(bounty.brandId),
            notes: notes,
            analysis: try analysisRow(submissionId: id, version: nil),
            post: post,
            link: link,
            offerCode: code,
            clock: clock,
            roundsLeft: submission.revisionRoundsLeft,
            canRevise: submission.canRevise,
            canAppeal: appealable,
            canWithdraw: submission.canWithdraw,
            canPost: submission.canPost,
            appealDeadline: deadline,
            captionDraft: caption,
            trackingLine: tracking
        )
    }

    func videoAnalysis(submissionId: String, version: Int?) async throws -> VideoAnalysis? {
        try requireSignedIn()
        _ = try submissionRow(submissionId)
        return try analysisRow(submissionId: submissionId, version: version)
    }

    // MARK: Uploading (simulated chunks)

    func beginUpload(_ request: UploadRequest) async throws -> UploadSession {
        try requireSignedIn()
        if request.sizeBytes <= 0 || request.durationMs <= 0 {
            throw FlowdAPIError.validationFailed("That file looks empty. Pick the video again.")
        }
        if request.sizeBytes > 512_000_000 {
            throw FlowdAPIError.validationFailed("Videos can be up to 512 MB. Trim it or lower the quality and try again.")
        }
        let assetId: String = try nextIdLazy("vid", width: 4, existing: { () throws -> [String] in
            var ids: [String] = []
            for submission in try self.store.submissions.all() {
                for version in submission.versions {
                    ids.append(version.video.assetId)
                }
            }
            for spec in try self.store.specs.all() {
                ids.append(spec.video.assetId)
            }
            return ids
        })
        let uploadId: String = "upl_" + StableHash.hex8(assetId + "|" + request.fileName)
        return UploadSession(
            uploadId: uploadId,
            assetId: assetId,
            uploadUrl: nil,
            chunkSizeBytes: 4_194_304,
            expiresAt: FlowdCalendar.addHours(now, 24)
        )
    }

    // MARK: Scoring a take

    /// What the brand's review sees for a take: the device's scores when the Studio sent them, otherwise the engine's own analysis of the take.
    struct TakeScores {
        var hookBand: ScoreBand
        var hookPoints: Int
        var flowBand: ScoreBand
        var flowPoints: Int
        var qaPass: Int
        var qaWarn: Int
        var qaFail: Int
        var analysis: ClipAnalysis?
    }

    /// Hashes of videos already analysed (other creators' and this creator's own) for duplicate detection.
    func knownHashes(excluding submissionId: String?) throws -> [KnownHash] {
        let owners: [String: String] = Dictionary(uniqueKeysWithValues: try store.submissions.all().map { (s: Submission) -> (String, String) in
            return (s.id, s.creatorId)
        })
        return try store.videoAnalyses.all().filter { (a: VideoAnalysis) -> Bool in
            return a.submissionId != submissionId
        }.map { (a: VideoAnalysis) -> KnownHash in
            return KnownHash(id: a.submissionId, phash: a.phash, creatorId: owners[a.submissionId])
        }
    }

    func scoreTake(
        bounty: Bounty,
        title: String,
        formatId: FormatId?,
        hookText: String?,
        video: VideoMeta,
        hookBand: ScoreBand,
        hookPoints: Int,
        flowBand: ScoreBand,
        flowPoints: Int,
        qaPass: Int,
        qaWarn: Int,
        qaFail: Int,
        excluding submissionId: String?
    ) throws -> TakeScores {
        if hookPoints > 0 || flowPoints > 0 {
            return TakeScores(hookBand: hookBand, hookPoints: hookPoints, flowBand: flowBand, flowPoints: flowPoints, qaPass: qaPass, qaWarn: qaWarn, qaFail: qaFail, analysis: nil)
        }
        let app: BrandApp = try appRow(bounty.appId)
        let brand: Brand = try brandRow(bounty.brandId)
        var format: Format? = nil
        if let id = formatId {
            format = try store.formats.find(id.rawValue)
        }
        let clip: ClipInput = ClipInput(
            script: nil,
            hookText: hookText,
            durationS: Double(video.durationMs) / 1_000,
            faceAtMs: (format?.faceless ?? false) ? nil : 300,
            appAtMs: 2_200,
            hasCaptions: video.hasCaptions,
            width: video.width,
            height: video.height,
            knownHashes: try knownHashes(excluding: submissionId)
        )
        let result: ClipAnalysis = ClipAnalyzer.analyze(clip: clip, bounty: bounty, app: app, brand: brand, format: format, creatorId: meId, title: title)
        return TakeScores(
            hookBand: result.hookScore.band,
            hookPoints: result.hookScore.points,
            flowBand: result.flowScore.band,
            flowPoints: result.flowScore.points,
            qaPass: result.qa.pass,
            qaWarn: result.qa.warn,
            qaFail: result.qa.fail,
            analysis: result
        )
    }

    /// What a reviewer sees about the creator before approving: recent fraud scores, audience share and follower quality.
    func fraudEvidence(duplicate: DuplicateMatch?) throws -> FraudEvidence {
        let recent: [Post] = Array(try myPosts().sorted { (a: Post, b: Post) -> Bool in
            return a.postedAt > b.postedAt
        }.prefix(5))
        let scores: [Int] = recent.map { (p: Post) -> Int in
            return p.fraud.score
        }
        let average: Int = scores.isEmpty ? 0 : MoneyMath.roundHalfUp(Double(scores.reduce(0, +)) / Double(scores.count))
        let best: SocialAccount? = try myAccounts().filter { (a: SocialAccount) -> Bool in
            return a.status == .connected
        }.max(by: { (a: SocialAccount, b: SocialAccount) -> Bool in
            return a.medianViews28d < b.medianViews28d
        })
        let quality: Double = MoneyMath.round2(MoneyMath.clamp(0.5 + (best?.engagementRate ?? 0.04) * 8, 0, 1))
        return FraudEvidence(
            creatorFraudScore: average,
            creatorFraudBand: MarketEngine.fraudBand(average),
            audienceUsRatio: best?.usAudienceRatio ?? 0.5,
            viewCurveShape: .organic,
            duplicateOfSubmissionId: duplicate?.id,
            phashDistance: duplicate?.distance,
            followerQuality: quality
        )
    }

    // MARK: Submit

    func submit(_ request: SubmitRequest) async throws -> Submission {
        try requireSignedIn()
        try reconcileIfNeeded()
        if let known = remembered(request.idempotencyKey, operation: "submit"), let again = try store.submissions.find(known) {
            return again
        }
        guard request.rightsAccepted else {
            throw FlowdAPIError.validationFailed("Accept the Rights Card to submit. It is a snapshot of exactly what you agree to.")
        }
        let bounty: Bounty = try bountyRow(request.bountyId)
        try ensureEligible(bounty)
        let moment: Date = now
        let existingIds: [String] = try store.submissions.all().map { (s: Submission) -> String in
            return s.id
        }
        let submissionId: String = nextId("sub", width: 4, existing: existingIds)
        let title: String = request.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Take 1" : request.title
        let scores: TakeScores = try scoreTake(
            bounty: bounty,
            title: title,
            formatId: request.formatId,
            hookText: request.hookText,
            video: request.video,
            hookBand: request.hookBand,
            hookPoints: request.hookPoints,
            flowBand: request.flowBand,
            flowPoints: request.flowPoints,
            qaPass: request.qaPass,
            qaWarn: request.qaWarn,
            qaFail: request.qaFail,
            excluding: nil
        )
        let duplicate: DuplicateMatch? = scores.analysis?.qa.duplicates.first
        let hardFail: Bool = duplicate?.exact ?? false
        var reserved: Int = 0
        if !hardFail {
            reserved = try reserveSlot(bountyId: bounty.id)
        }
        let evidence: FraudEvidence = try fraudEvidence(duplicate: duplicate)
        let version: SubmissionVersion = SubmissionVersion(
            version: 1,
            submittedAt: moment,
            video: request.video,
            flowBand: scores.flowBand,
            flowPoints: scores.flowPoints,
            hookBand: scores.hookBand,
            hookPoints: scores.hookPoints,
            qaPass: scores.qaPass,
            qaWarn: scores.qaWarn,
            qaFail: scores.qaFail,
            changesSummary: nil
        )
        var decision: Decision? = nil
        if hardFail {
            decision = Decision(
                action: .autoReject,
                decidedAt: moment,
                decidedByUserId: nil,
                reasonCode: .duplicateContent,
                evidence: Evidence(kind: .qaCheck, ref: "duplicate", excerpt: "This video matches one that was already submitted.", tMs: nil),
                summary: "This exact video was already submitted. Film a new original take.",
                slaMet: true,
                appealUsed: false
            )
        }
        let submission: Submission = Submission(
            id: submissionId,
            bountyId: bounty.id,
            creatorId: meId,
            brandId: bounty.brandId,
            appId: bounty.appId,
            status: hardFail ? .rejected : .inReview,
            version: 1,
            versions: [version],
            source: request.source,
            formatId: request.formatId,
            title: title,
            revisionRound: 0,
            reservedCents: reserved,
            flowBand: scores.flowBand,
            flowPoints: scores.flowPoints,
            hookBand: scores.hookBand,
            hookPoints: scores.hookPoints,
            rightsCard: bounty.rightsCard,
            rightsAcceptedAt: moment,
            fraudEvidence: evidence,
            submittedAt: moment,
            slaDueAt: hardFail ? nil : FlowdCalendar.addHours(moment, Double(bounty.reviewSlaHours)),
            slaState: hardFail ? .met : .onTrack,
            slaBreachedAt: nil,
            decision: decision,
            autoApproved: false,
            approvedAt: nil,
            postId: nil,
            linkId: nil,
            postedAt: nil,
            releasedAt: nil,
            updatedAt: moment
        )
        try store.submissions.append(submission)
        if let result = scores.analysis {
            try store.videoAnalyses.append(result.videoAnalysis(id: "va_" + String(submissionId.dropFirst(4)) + "_v1", submissionId: submissionId, version: 1, analysedAt: moment))
        }
        simulatedSubmissionIds.insert(submissionId)
        try upsertSave(bountyId: bounty.id, stage: .submitted, claimedUntil: nil, dropId: request.dropId, submissionId: submissionId, at: moment)
        try recountBounty(bounty.id)
        try refreshCreatorStats(at: moment)
        if hardFail {
            try notify(
                .rejection,
                title: "Not accepted: " + bounty.title,
                body: "This exact video was already submitted. Film a new original take; your reservation is released.",
                deepLink: "flowd://submission/" + submissionId,
                refKind: "submission",
                refId: submissionId
            )
        }
        try advanceOnboarding(to: .firstSubmission)
        remember(request.idempotencyKey, operation: "submit", resourceId: submissionId)
        return submission
    }

    // MARK: Revise, withdraw, appeal, notes

    func revise(submissionId: String, _ request: ReviseRequest) async throws -> Submission {
        try requireSignedIn()
        try reconcileIfNeeded()
        if let known = remembered(request.idempotencyKey, operation: "revise"), let again = try store.submissions.find(known) {
            return again
        }
        let submission: Submission = try submissionRow(submissionId)
        guard submission.status == .changesRequested else {
            throw FlowdAPIError.conflict("This video is " + submission.status.label.lowercased() + ", so it cannot be revised now.")
        }
        let decidedAt: Date = submission.decision?.decidedAt ?? submission.updatedAt
        if FlowdCalendar.hoursBetween(decidedAt, now) > Double(FlowdConstants.Review.revisionExpiryDays * 24) {
            throw FlowdAPIError.revisionLimit
        }
        let bounty: Bounty = try bountyRow(submission.bountyId)
        let moment: Date = now
        let nextVersion: Int = submission.version + 1
        let scores: TakeScores = try scoreTake(
            bounty: bounty,
            title: submission.title + " v" + String(nextVersion),
            formatId: submission.formatId,
            hookText: nil,
            video: request.video,
            hookBand: request.hookBand,
            hookPoints: request.hookPoints,
            flowBand: request.flowBand,
            flowPoints: request.flowPoints,
            qaPass: request.qaPass,
            qaWarn: request.qaWarn,
            qaFail: request.qaFail,
            excluding: submissionId
        )
        let version: SubmissionVersion = SubmissionVersion(
            version: nextVersion,
            submittedAt: moment,
            video: request.video,
            flowBand: scores.flowBand,
            flowPoints: scores.flowPoints,
            hookBand: scores.hookBand,
            hookPoints: scores.hookPoints,
            qaPass: scores.qaPass,
            qaWarn: scores.qaWarn,
            qaFail: scores.qaFail,
            changesSummary: request.changesSummary
        )
        let updated: Submission = try store.submissions.update(submissionId) { (s: inout Submission) in
            s.status = .inReview
            s.version = nextVersion
            s.versions.append(version)
            s.flowBand = scores.flowBand
            s.flowPoints = scores.flowPoints
            s.hookBand = scores.hookBand
            s.hookPoints = scores.hookPoints
            s.slaDueAt = FlowdCalendar.addHours(moment, Double(bounty.reviewSlaHours))
            s.slaState = .onTrack
            s.slaBreachedAt = nil
            s.updatedAt = moment
        }
        for noteId in request.resolvedNoteIds {
            if let note = try store.feedbackNotes.find(noteId), note.submissionId == submissionId, note.status == .open {
                try store.feedbackNotes.update(noteId) { (n: inout FeedbackNote) in
                    n.status = .resolved
                    n.resolvedInVersion = nextVersion
                    n.resolvedAt = moment
                }
            }
        }
        if let result = scores.analysis {
            try store.videoAnalyses.append(result.videoAnalysis(id: "va_" + String(submissionId.dropFirst(4)) + "_v" + String(nextVersion), submissionId: submissionId, version: nextVersion, analysedAt: moment))
        }
        simulatedSubmissionIds.insert(submissionId)
        try recountBounty(bounty.id)
        remember(request.idempotencyKey, operation: "revise", resourceId: submissionId)
        return updated
    }

    func withdraw(submissionId: String) async throws -> Submission {
        try requireSignedIn()
        let submission: Submission = try submissionRow(submissionId)
        guard submission.canWithdraw else {
            throw FlowdAPIError.conflict("This video is " + submission.status.label.lowercased() + ", so it cannot be withdrawn. A posted video stays posted; you can remove the post itself.")
        }
        let moment: Date = now
        try releaseSlot(bountyId: submission.bountyId, cents: submission.reservedCents)
        let updated: Submission = try store.submissions.update(submissionId) { (s: inout Submission) in
            s.status = .withdrawn
            s.reservedCents = 0
            s.slaDueAt = nil
            s.updatedAt = moment
        }
        try upsertSave(bountyId: submission.bountyId, stage: .joined, claimedUntil: nil, dropId: nil, submissionId: nil, at: moment)
        try recountBounty(submission.bountyId)
        try refreshCreatorStats(at: moment)
        return updated
    }

    func appeal(submissionId: String, _ request: AppealRequest) async throws -> Dispute {
        try requireSignedIn()
        if let known = remembered(request.idempotencyKey, operation: "appeal"), let again = try store.disputes.find(known) {
            return again
        }
        let submission: Submission = try submissionRow(submissionId)
        guard submission.status == .rejected, let decision = submission.decision, decision.action == .reject else {
            throw FlowdAPIError.conflict("Only a rejected video can be appealed. A system rejection for a duplicate is not appealable here; resubmit an original take.")
        }
        if decision.appealUsed {
            throw FlowdAPIError.appealUsed
        }
        if !submission.canAppeal(now: now) {
            throw FlowdAPIError.appealUsed
        }
        let explanation: String = (request.note ?? request.reason).trimmingCharacters(in: .whitespacesAndNewlines)
        if explanation.count < 10 {
            throw FlowdAPIError.validationFailed("Say in a sentence or two why the reason does not match the brief.")
        }
        let moment: Date = now
        var reserved: Int = 0
        do {
            reserved = try reserveSlot(bountyId: submission.bountyId)
        } catch {
            reserved = 0
        }
        var evidence: [Evidence] = request.evidence
        if let original = decision.evidence {
            evidence.append(original)
        }
        let disputeIds: [String] = try store.disputes.all().map { (d: Dispute) -> String in
            return d.id
        }
        let dispute: Dispute = Dispute(
            id: nextId("disp", width: 3, existing: disputeIds),
            kind: .rejectionAppeal,
            status: .open,
            openedBy: .creator,
            creatorId: meId,
            brandId: submission.brandId,
            bountyId: submission.bountyId,
            submissionId: submission.id,
            postId: nil,
            payoutId: nil,
            rejectionReasonCode: decision.reasonCode,
            rangeFrom: nil,
            rangeTo: nil,
            reason: request.reason.isEmpty ? "The reason does not match the brief." : request.reason,
            note: explanation,
            evidence: evidence,
            amountInDisputeCents: 0,
            events: [DisputeEvent(at: moment, actor: .creator, action: .opened, text: "Appeal opened from the rejection. One appeal is allowed per rejection.", userId: meUserId)],
            openedAt: moment,
            replyDueAt: FlowdCalendar.addHours(moment, 24),
            firstReplyAt: nil,
            resolutionDueAt: FlowdCalendar.addHours(moment, Double(FlowdConstants.Review.appealDecisionSlaHours)),
            resolvedAt: nil,
            outcome: nil,
            outcomeText: nil,
            adjustmentCents: nil,
            assignedAdminUserId: nil,
            updatedAt: moment
        )
        try store.disputes.append(dispute)
        try store.submissions.update(submissionId) { (s: inout Submission) in
            s.status = .appealed
            s.reservedCents = reserved
            if var d = s.decision {
                d.appealUsed = true
                s.decision = d
            }
            s.updatedAt = moment
        }
        try recountBounty(submission.bountyId)
        remember(request.idempotencyKey, operation: "appeal", resourceId: dispute.id)
        return dispute
    }

    func resolveNote(id: String) async throws -> FeedbackNote {
        try requireSignedIn()
        guard let note = try store.feedbackNotes.find(id), note.creatorId == meId else {
            throw FlowdAPIError.notFound("that note")
        }
        if note.status != .open {
            throw FlowdAPIError.conflict("That note is already closed.")
        }
        let submission: Submission = try submissionRow(note.submissionId)
        let moment: Date = now
        return try store.feedbackNotes.update(id) { (n: inout FeedbackNote) in
            n.status = .resolved
            n.resolvedInVersion = submission.version
            n.resolvedAt = moment
        }
    }

    // MARK: Posting

    /// The caption a creator posts: their own words plus the locked auto-disclosure (#ad and the brand wording) and the brief's hashtags.
    func composeCaption(own: String?, disclosure: String, hashtags: [String]) -> String {
        let text: String = (own ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let hasAd: Bool = Rx.test(#"(^|[^a-z0-9])#ad(?![a-z0-9])"#, in: text, caseInsensitive: true)
        var parts: [String] = [text]
        if !hasAd {
            parts.append(disclosure)
        }
        for tag in hashtags {
            if tag.lowercased() == "#ad" || text.lowercased().contains(tag.lowercased()) {
                continue
            }
            parts.append(tag)
        }
        let joined: String = parts.filter { (p: String) -> Bool in
            return !p.isEmpty
        }.joined(separator: " ")
        return Rx.replace(#"\s+"#, in: joined, with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func attachPost(submissionId: String, _ request: AttachPostRequest) async throws -> Post {
        try requireSignedIn()
        try reconcileIfNeeded()
        if let known = remembered(request.idempotencyKey, operation: "attach_post"), let again = try store.posts.find(known) {
            return again
        }
        let submission: Submission = try submissionRow(submissionId)
        guard submission.status == .approved else {
            if submission.status == .posted {
                throw FlowdAPIError.conflict("This video is already posted.")
            }
            throw FlowdAPIError.conflict("This video is " + submission.status.label.lowercased() + ", so it cannot be posted yet. Only an approved video can be posted.")
        }
        let bounty: Bounty = try bountyRow(submission.bountyId)
        guard let linkId = submission.linkId, let link = try store.links.find(linkId) else {
            throw FlowdAPIError.notFound("the tracking link")
        }
        if !bounty.deliverables.platforms.contains(request.platform) {
            throw FlowdAPIError.validationFailed("This bounty is for " + Fmt.joinList(bounty.deliverables.platforms.map { (p: Platform) -> String in return p.label }) + ".")
        }
        let accounts: [SocialAccount] = try myAccounts().filter { (a: SocialAccount) -> Bool in
            return a.platform == request.platform && a.status == .connected
        }
        let chosen: SocialAccount? = accounts.first(where: { (a: SocialAccount) -> Bool in
            return a.id == request.socialAccountId
        }) ?? accounts.first(where: { (a: SocialAccount) -> Bool in
            return a.primary
        }) ?? accounts.first
        guard let account = chosen else {
            throw FlowdAPIError.conflict("Link a " + request.platform.label + " account first. Open Settings and connect it (read-only).")
        }
        let url: String = request.url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard Rx.test(#"^https?://"#, in: url, caseInsensitive: true) else {
            throw FlowdAPIError.validationFailed("Paste the full link to your post.")
        }
        let moment: Date = now
        let postIds: [String] = try store.posts.all().map { (p: Post) -> String in
            return p.id
        }
        let postId: String = nextId("post", width: 4, existing: postIds)
        let platformPostId: String = String(UInt64(StableHash.fnv1a(postId + "|" + meId)) * 1_000_003 + 7_000_000_000, radix: 36)
        let caption: String = composeCaption(own: request.caption, disclosure: bounty.brief.disclosureText, hashtags: bounty.brief.hashtags)
        let version: SubmissionVersion? = submission.versions.last
        let analysis: VideoAnalysis? = try analysisRow(submissionId: submissionId, version: submission.version)
        let fallbackTags: VideoTags = VideoTags(
            formatId: submission.formatId,
            hookType: .directQuestion,
            hookWords: submission.title.split(separator: " ").prefix(4).joined(separator: " "),
            timeToAppRevealMs: 2_500,
            ctaType: .linkInBio
        )
        let windowEnd: Date = MoneyClockEngine.windowEndsAt(postedAt: moment)
        let post: Post = Post(
            id: postId,
            submissionId: submission.id,
            creatorId: meId,
            brandId: submission.brandId,
            appId: submission.appId,
            bountyId: submission.bountyId,
            socialAccountId: account.id,
            platform: request.platform,
            platformPostId: platformPostId,
            url: url,
            caption: caption,
            hashtags: Rx.matches(#"#[a-z0-9_]+"#, in: caption, caseInsensitive: true),
            thumb: version?.video.art ?? bounty.art,
            durationMs: version?.video.durationMs ?? 0,
            postedAt: moment,
            windowEndsAt: windowEnd,
            status: .live,
            holdReason: nil,
            clearedAt: nil,
            paidAt: nil,
            removedAt: nil,
            trackingLinkId: link.id,
            promoCode: link.promoCode,
            views: 0,
            windowViews: 0,
            viewsInvalid: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            retention: Retention(curve: [1, 0.86, 0.76, 0.69, 0.63, 0.58, 0.54, 0.5, 0.47, 0.44], avgWatchRatio: 0.56, biggestDropAtS: nil),
            funnel: FunnelCounts(views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, estInstalls: 0, estTrials: 0, estPaid: 0),
            earnings: EarningsBreakdown(cpmCents: 0, cpaCents: 0, commissionCents: 0, flatCents: 0, totalCents: 0, capped: false, capRemainingCents: bounty.perVideoCapCents),
            fraud: FraudAssessment(score: 0, band: .clean, signals: [], assessedAt: moment),
            flowBand: submission.flowBand,
            adId: nil,
            isWinner: false,
            whyItWon: nil,
            tags: analysis?.tags ?? fallbackTags
        )
        try store.posts.append(post)
        try releaseSlot(bountyId: submission.bountyId, cents: submission.reservedCents)
        try store.submissions.update(submissionId) { (s: inout Submission) in
            s.status = .posted
            s.postId = postId
            s.postedAt = moment
            s.reservedCents = 0
            s.updatedAt = moment
        }
        try store.links.update(link.id) { (l: inout AttributionLink) in
            l.postId = postId
        }
        try grantRights(post: post, submission: submission, bounty: bounty, at: moment)
        let expectedViews: Int = EarningsEngine.predictedViews(medianViews: account.medianViews28d, band: submission.flowBand)
        let estimate: Int = Swift.min(bounty.perVideoCapCents, MoneyMath.roundHalfUp(Double(expectedViews * bounty.cpmCents) / 1_000)) + bounty.flatFeeCents
        try openAccrual(post: post, bounty: bounty, estimateCents: estimate)
        try upsertSave(bountyId: submission.bountyId, stage: .submitted, claimedUntil: nil, dropId: nil, submissionId: submissionId, at: moment)
        try recountBounty(submission.bountyId)
        simulatedPostIds.insert(postId)
        try recordPostInStreak(at: moment)
        try refreshCreatorStats(at: moment)
        remember(request.idempotencyKey, operation: "attach_post", resourceId: postId)
        return post
    }

    /// The Rights Card becomes grants: organic posting always, a paid-ads term when the card includes one.
    func grantRights(post: Post, submission: Submission, bounty: Bounty, at moment: Date) throws {
        let ids: [String] = try store.rightsGrants.all().map { (g: RightsGrant) -> String in
            return g.id
        }
        let base: Int = bounty.flatFeeCents
        let renewal: Int = RightsEngine.renewalPricePer30(baseFeeCents: base, renewalPct: submission.rightsCard.renewalPctPer30d)
        let organic: RightsGrant = RightsGrant(
            id: nextId("rg", width: 4, existing: ids),
            postId: post.id,
            submissionId: submission.id,
            bountyId: bounty.id,
            brandId: bounty.brandId,
            appId: bounty.appId,
            creatorId: meId,
            scope: .organic,
            status: .active,
            platform: nil,
            sparkCode: nil,
            codeDurationDays: nil,
            startsAt: moment,
            endsAt: nil,
            baseFeeCents: base,
            renewalPctPer30d: submission.rightsCard.renewalPctPer30d,
            renewalPriceCents: renewal,
            renewals: [],
            alertsSent: [],
            adId: nil,
            aiLikeness: false,
            revokedAt: nil,
            revokeReason: nil,
            createdAt: moment,
            updatedAt: moment
        )
        try store.rightsGrants.append(organic)
        if submission.rightsCard.paidAdsDays > 0 {
            let paid: RightsGrant = RightsGrant(
                id: nextId("rg", width: 4, existing: ids + [organic.id]),
                postId: post.id,
                submissionId: submission.id,
                bountyId: bounty.id,
                brandId: bounty.brandId,
                appId: bounty.appId,
                creatorId: meId,
                scope: .paidAds,
                status: .active,
                platform: submission.rightsCard.adPlatforms.first,
                sparkCode: nil,
                codeDurationDays: nil,
                startsAt: moment,
                endsAt: FlowdCalendar.addDays(moment, Double(submission.rightsCard.paidAdsDays)),
                baseFeeCents: base,
                renewalPctPer30d: submission.rightsCard.renewalPctPer30d,
                renewalPriceCents: renewal,
                renewals: [],
                alertsSent: [],
                adId: nil,
                aiLikeness: false,
                revokedAt: nil,
                revokeReason: nil,
                createdAt: moment,
                updatedAt: moment
            )
            try store.rightsGrants.append(paid)
        }
    }
}
