import Foundation

// The brand's side of a submission, played in the demo: a decision within 72 hours with a reason code, timecoded notes and evidence (No-Rug Approvals),
// the review SLA and its timeout policy, tracking links and promo codes issued at approval, and the unused-work release. Mirrors
// apps/web/src/lib/store/core/{review,tracking,lifecycle}.ts, reduced to what one creator can see.

extension MockFlowdAPI {
    // MARK: Tracking (issued at approval)

    private func firstToken(_ text: String) -> String {
        let slug: String = TextTools.slugify(text)
        return slug.split(whereSeparator: { (c: Character) -> Bool in
            return c == "-" || c == "." || c == "_"
        }).first.map { (part: Substring) -> String in
            return String(part)
        } ?? slug
    }

    /// The tracking link (always) and a promo code from the app's offer-code pool (when one is free). Apple caps active offer codes at 10 per subscription
    /// SKU, so codes are pooled and rotated; the link is the fallback that always works. Idempotent per creator and bounty.
    func issueTracking(bounty: Bounty, app: BrandApp, at moment: Date) throws -> AttributionLink {
        let creator: Creator = try meRow()
        let links: [AttributionLink] = try store.links.all()
        if let existing = links.first(where: { (l: AttributionLink) -> Bool in
            return l.creatorId == creator.id && l.bountyId == bounty.id
        }) {
            return existing
        }
        let taken: Set<String> = Set(links.map { (l: AttributionLink) -> String in
            return l.code
        })
        let base: String = firstToken(creator.handle) + "-" + firstToken(app.name)
        let start: Int = StableHash.bucket(base, modulus: 9) + 1
        var code: String = base + String(start)
        var attempt: Int = 0
        while taken.contains(code) && attempt < 9 {
            attempt += 1
            code = base + String(((start - 1 + attempt) % 9) + 1)
        }
        var extra: Int = 10
        while taken.contains(code) {
            code = base + String(extra)
            extra += 1
        }
        let linkId: String = "lnk_" + code.replacingOccurrences(of: "-", with: "_")
        var promo: String? = nil
        let pool: [OfferCode] = try store.offerCodes.all().filter { (c: OfferCode) -> Bool in
            return c.appId == app.id
        }
        let sku: (sku: String, name: String)? = mostCommonSku(pool)
        if let chosen = sku {
            let active: [OfferCode] = pool.filter { (c: OfferCode) -> Bool in
                return c.sku == chosen.sku && (c.status == .available || c.status == .assigned)
            }
            let reuse: OfferCode? = active.first(where: { (c: OfferCode) -> Bool in
                return c.status == .assigned && c.assignedCreatorId == creator.id && c.assignedBountyId == bounty.id
            })
            let open: OfferCode? = active.filter { (c: OfferCode) -> Bool in
                return c.status == .available && c.validUntil > moment && c.redemptions < c.maxRedemptions
            }.sorted { (a: OfferCode, b: OfferCode) -> Bool in
                return a.validUntil < b.validUntil
            }.first
            if let found = reuse ?? open {
                promo = found.code
                try store.offerCodes.update(found.id) { (c: inout OfferCode) in
                    c.status = .assigned
                    c.assignedCreatorId = creator.id
                    c.assignedBountyId = bounty.id
                    c.assignedLinkId = linkId
                    c.assignedAt = moment
                }
            } else if active.count < FlowdConstants.Attribution.appleActiveOffersPerSku {
                let desired: String = (firstToken(creator.handle) + "-" + firstToken(app.name)).uppercased()
                let codes: Set<String> = Set(pool.map { (c: OfferCode) -> String in
                    return c.code.uppercased()
                })
                var text: String = desired
                var n: Int = 2
                while codes.contains(text) {
                    text = desired + String(n)
                    n += 1
                }
                let stem: String = "occ_" + TextTools.slugify(app.name).replacingOccurrences(of: "-", with: "") + "_"
                var number: Int = pool.count + 1
                let usedIds: Set<String> = Set(pool.map { (c: OfferCode) -> String in
                    return c.id
                })
                while usedIds.contains(stem + FlowdCalendar.pad(number, 3)) {
                    number += 1
                }
                promo = text
                try store.offerCodes.append(OfferCode(
                    id: stem + FlowdCalendar.pad(number, 3),
                    appId: app.id,
                    sku: chosen.sku,
                    offerName: chosen.name,
                    code: text,
                    status: .assigned,
                    assignedCreatorId: creator.id,
                    assignedBountyId: bounty.id,
                    assignedLinkId: linkId,
                    assignedAt: moment,
                    redemptions: 0,
                    maxRedemptions: FlowdConstants.Attribution.appleCustomCodeMaxRedemptions,
                    validFrom: moment,
                    validUntil: FlowdCalendar.addDays(moment, 365),
                    rotationDueAt: FlowdCalendar.addDays(moment, 90),
                    createdAt: moment
                ))
            }
        }
        let scheme: String = firstToken(app.name).isEmpty ? "app" : firstToken(app.name)
        let link: AttributionLink = AttributionLink(
            id: linkId,
            creatorId: creator.id,
            bountyId: bounty.id,
            appId: app.id,
            postId: nil,
            code: code,
            shortUrl: FlowdConstants.Attribution.linkBase + code,
            deepLink: scheme + "://r/" + code,
            promoCode: promo,
            status: .active,
            createdAt: moment,
            clicks: 0,
            installs: 0,
            trials: 0,
            paid: 0,
            lastClickAt: nil
        )
        try store.links.append(link)
        return link
    }

    private func mostCommonSku(_ pool: [OfferCode]) -> (sku: String, name: String)? {
        var counts: [String: (n: Int, name: String)] = [:]
        for code in pool {
            let current: (n: Int, name: String) = counts[code.sku] ?? (n: 0, name: code.offerName)
            counts[code.sku] = (n: current.n + 1, name: current.name)
        }
        let ordered: [(key: String, value: (n: Int, name: String))] = counts.sorted { (a: (key: String, value: (n: Int, name: String)), b: (key: String, value: (n: Int, name: String))) -> Bool in
            if a.value.n != b.value.n {
                return a.value.n > b.value.n
            }
            return a.key < b.key
        }
        guard let best = ordered.first else {
            return nil
        }
        return (sku: best.key, name: best.value.name)
    }

    // MARK: Just-in-time tax

    /// The first approval asks the creator for a W-9 (or W-8BEN) before the first payout. Approval is paid either way.
    func requestTaxInfoIfNeeded(at moment: Date) throws {
        let creator: Creator = try meRow()
        let existing: TaxProfile? = try store.taxProfiles.all().first(where: { (t: TaxProfile) -> Bool in
            return t.creatorId == meId
        })
        if let profile = existing, profile.status != .notStarted {
            return
        }
        let form: TaxForm = creator.country == .us ? .w9 : .w8ben
        if let profile = existing {
            try store.taxProfiles.update(profile.id) { (t: inout TaxProfile) in
                t.status = .requested
                t.form = form
                t.requestedAt = moment
                t.updatedAt = moment
            }
        } else {
            let row: TaxProfile = TaxProfile(
                id: "taxp_" + creator.handle.replacingOccurrences(of: ".", with: "_"),
                creatorId: meId,
                status: .requested,
                form: form,
                legalName: nil,
                entityType: nil,
                tinLast4: nil,
                address: nil,
                country: creator.country,
                taxYear: FlowdConstants.Tax.taxYear,
                ytdClearedCents: 0,
                ytdPaidCents: 0,
                thresholdCents: FlowdConstants.Tax.form1099NecThresholdCents,
                thresholdProgress: 0,
                form1099Required: false,
                setAsideRate: FlowdConstants.Tax.setAsideRate,
                setAsideCents: 0,
                requestedAt: moment,
                submittedAt: nil,
                verifiedAt: nil,
                expiresAt: nil,
                updatedAt: moment
            )
            try store.taxProfiles.append(row)
        }
        let formName: String = form == .w9 ? "W-9" : "W-8BEN"
        try notify(
            .taxInfoNeeded,
            title: "Add your " + formName + " before your first payout",
            body: "It takes about two minutes. Your approved video is paid either way; we just need this before money leaves flowd.",
            deepLink: "flowd://tax",
            refKind: "tax_profile",
            refId: nil,
            at: moment
        )
    }

    // MARK: Decisions

    /// The brand member who decides in the demo.
    func brandUserId() -> String? {
        return (try? store.world())?.personas.brand.userId
    }

    func hoursInQueue(_ submission: Submission, at moment: Date) -> Double {
        return FlowdCalendar.hoursBetween(enteredReviewAt(submission), moment)
    }

    /// The one place a submission becomes approved: the brand's decision, a timeout approve-if-clean, or an appeal overturn. Issues the link and code,
    /// writes the decision, refreshes the creator's tier path and tells the creator.
    @discardableResult
    func finalizeApproval(_ submissionId: String, action: DecisionAction, summary: String?, at moment: Date) throws -> Submission {
        let submission: Submission = try submissionRow(submissionId)
        let bounty: Bounty = try bountyRow(submission.bountyId)
        let app: BrandApp = try appRow(submission.appId)
        let hours: Double = hoursInQueue(submission, at: moment)
        let link: AttributionLink = try issueTracking(bounty: bounty, app: app, at: moment)
        var text: String = "Approved. The link and code are ready."
        if let given = summary {
            text = given
        } else if action == .autoApprove {
            text = "Approved by a guarded auto-approve rule: every guardrail passed."
        } else if action == .timeoutApprove {
            text = "Approved at the 72-hour limit: the video was clean."
        }
        let decision: Decision = Decision(
            action: action,
            decidedAt: moment,
            decidedByUserId: action == .approve ? brandUserId() : nil,
            reasonCode: nil,
            evidence: nil,
            summary: text,
            slaMet: hours <= Double(bounty.reviewSlaHours),
            appealUsed: submission.decision?.appealUsed ?? false
        )
        let state: SlaState = ReputationEngine.slaState(hoursInQueue: hours, decided: true, slaHours: bounty.reviewSlaHours)
        let updated: Submission = try store.submissions.update(submissionId) { (s: inout Submission) in
            s.status = .approved
            s.approvedAt = moment
            s.linkId = link.id
            s.decision = decision
            s.autoApproved = action == .autoApprove
            s.slaState = state
            s.slaDueAt = nil
            s.updatedAt = moment
        }
        try requestTaxInfoIfNeeded(at: moment)
        try refreshCreatorStats(at: moment)
        try recountBounty(bounty.id)
        try advanceOnboarding(to: .firstApproval)
        var codeText: String = ""
        if let promo = link.promoCode {
            codeText = " and code " + promo
        }
        let overturned: Bool = action == .appealOverturn
        try notify(
            overturned ? .appealDecided : .approval,
            title: overturned ? "Appeal upheld: " + bounty.title + " is approved" : "Approved: " + bounty.title,
            body: "Your link " + link.shortUrl + codeText + " are ready. Post it with the #ad disclosure and the 72-hour view window starts.",
            deepLink: "flowd://submission/" + submissionId,
            refKind: "submission",
            refId: submissionId,
            at: moment
        )
        return updated
    }

    /// One timecoded note a reviewer writes (about the video, never the person).
    struct NoteDraft {
        var tMs: Int
        var body: String
        var category: FeedbackCategory
        var severity: FeedbackSeverity
        var reasonCode: ReasonCode?
    }

    /// Notes spread over the video from plain strings: the first is must-fix, the rest suggestions.
    func noteDrafts(from texts: [String], durationMs: Int, reason: ReasonCode?) -> [NoteDraft] {
        var out: [NoteDraft] = []
        let marks: [Double] = [0.08, 0.35, 0.62, 0.85]
        for (index, text) in texts.enumerated() {
            let mark: Double = marks[Swift.min(index, marks.count - 1)]
            out.append(NoteDraft(
                tMs: Int((Double(durationMs) * mark).rounded()),
                body: text,
                category: index == 0 ? .hook : .pacing,
                severity: index == 0 ? .mustFix : .suggestion,
                reasonCode: index == 0 ? reason : nil
            ))
        }
        return out
    }

    func requestChangesDecision(_ submissionId: String, notes: [NoteDraft], summary: String?, at moment: Date) throws -> Submission {
        let submission: Submission = try submissionRow(submissionId)
        let bounty: Bounty = try bountyRow(submission.bountyId)
        let round: Int = submission.revisionRound + 1
        let memberId: String = (try? store.world())?.personas.brand.memberId ?? "bm_system"
        var written: [FeedbackNote] = []
        let existing: [String] = try store.feedbackNotes.all().map { (n: FeedbackNote) -> String in
            return n.id
        }
        for draft in notes {
            let ids: [String] = existing + written.map { (n: FeedbackNote) -> String in return n.id }
            let note: FeedbackNote = FeedbackNote(
                id: nextId("note", width: 4, existing: ids),
                submissionId: submissionId,
                bountyId: submission.bountyId,
                creatorId: meId,
                version: submission.version,
                authorMemberId: memberId,
                tMs: draft.tMs,
                tEndMs: nil,
                category: draft.category,
                severity: draft.severity,
                status: .open,
                body: draft.body,
                reasonCode: draft.severity == .mustFix ? draft.reasonCode : nil,
                resolvedInVersion: nil,
                resolvedAt: nil,
                createdAt: moment
            )
            try store.feedbackNotes.append(note)
            written.append(note)
        }
        let mustFix: Int = written.filter { (n: FeedbackNote) -> Bool in
            return n.severity == .mustFix
        }.count
        let suggestions: Int = written.count - mustFix
        let hours: Double = hoursInQueue(submission, at: moment)
        let decision: Decision = Decision(
            action: .requestChanges,
            decidedAt: moment,
            decidedByUserId: brandUserId(),
            reasonCode: written.first(where: { (n: FeedbackNote) -> Bool in return n.reasonCode != nil })?.reasonCode,
            evidence: nil,
            summary: summary ?? "Changes requested: " + String(mustFix) + " must-fix, " + String(suggestions) + " suggestions.",
            slaMet: hours <= Double(bounty.reviewSlaHours),
            appealUsed: submission.decision?.appealUsed ?? false
        )
        let updated: Submission = try store.submissions.update(submissionId) { (s: inout Submission) in
            s.status = .changesRequested
            s.revisionRound = round
            s.decision = decision
            s.slaState = .met
            s.slaDueAt = nil
            s.updatedAt = moment
        }
        try recountBounty(bounty.id)
        let last: String = round >= FlowdConstants.Review.revisionRoundsIncluded ? "That was your last included revision round." : "Round " + String(round) + " of " + String(FlowdConstants.Review.revisionRoundsIncluded) + "."
        try notify(
            .changesRequested,
            title: "Changes requested on " + bounty.title,
            body: String(mustFix) + " must-fix " + (mustFix == 1 ? "note" : "notes") + " with timecodes. " + last,
            deepLink: "flowd://submission/" + submissionId,
            refKind: "submission",
            refId: submissionId,
            at: moment
        )
        return updated
    }

    func rejectDecision(_ submissionId: String, reason: ReasonCode, evidence: Evidence, summary: String?, at moment: Date) throws -> Submission {
        let submission: Submission = try submissionRow(submissionId)
        let bounty: Bounty = try bountyRow(submission.bountyId)
        let hours: Double = hoursInQueue(submission, at: moment)
        let text: String = summary ?? reason.label + "."
        let decision: Decision = Decision(
            action: .reject,
            decidedAt: moment,
            decidedByUserId: brandUserId(),
            reasonCode: reason,
            evidence: evidence,
            summary: text,
            slaMet: hours <= Double(bounty.reviewSlaHours),
            appealUsed: false
        )
        try releaseSlot(bountyId: bounty.id, cents: submission.reservedCents)
        let state: SlaState = ReputationEngine.slaState(hoursInQueue: hours, decided: true, slaHours: bounty.reviewSlaHours)
        let updated: Submission = try store.submissions.update(submissionId) { (s: inout Submission) in
            s.status = .rejected
            s.reservedCents = 0
            s.decision = decision
            s.slaState = state
            s.slaDueAt = nil
            s.updatedAt = moment
        }
        try recountBounty(bounty.id)
        try refreshCreatorStats(at: moment)
        try notify(
            .rejection,
            title: "Not approved: " + bounty.title,
            body: reason.label + ". You can appeal once within " + String(FlowdConstants.Review.appealWindowDays) + " days if you think the reason does not match the brief.",
            deepLink: "flowd://submission/" + submissionId,
            refKind: "submission",
            refId: submissionId,
            at: moment
        )
        return updated
    }

    /// Applies a decision to a submission waiting on the brand.
    func decide(_ submissionId: String, decision: DemoDecision, at moment: Date) throws -> Submission {
        let submission: Submission = try submissionRow(submissionId)
        guard submission.isWaitingOnBrand else {
            throw FlowdAPIError.conflict("This video is " + submission.status.label.lowercased() + ", so it cannot be decided now.")
        }
        switch decision {
        case .approve:
            return try finalizeApproval(submissionId, action: .approve, summary: nil, at: moment)
        case .requestChanges(let texts):
            let analysis: VideoAnalysis? = try analysisRow(submissionId: submissionId, version: submission.version)
            let duration: Int = submission.versions.last?.video.durationMs ?? 30_000
            let reason: ReasonCode? = analysis.flatMap { (a: VideoAnalysis) -> ReasonCode? in
                return a.checks.first(where: { (c: QaCheck) -> Bool in return c.result != .pass })?.reasonCodeGuess
            }
            let lines: [String] = texts.isEmpty ? ["Show the app on screen in the first three seconds."] : texts
            return try requestChangesDecision(submissionId, notes: noteDrafts(from: lines, durationMs: duration, reason: reason), summary: nil, at: moment)
        case .reject(let reason, let summary):
            let evidence: Evidence = Evidence(kind: .briefRequirement, ref: reason.label, excerpt: summary, tMs: nil)
            return try rejectDecision(submissionId, reason: reason, evidence: evidence, summary: summary, at: moment)
        }
    }

    func simulateDecision(submissionId: String, decision: DemoDecision) async throws -> Submission {
        try requireSignedIn()
        return try decide(submissionId, decision: decision, at: now)
    }

    // MARK: The brand's own pace (demo clock)

    /// The brand's decision time on a video: its median decision time, between 1 and 70 hours, varied per video.
    func decisionDue(for submission: Submission, bounty: Bounty) -> Date {
        let median: Double = ((try? scorecard(for: bounty.brandId))?.decisionHoursMedian) ?? 24
        let spread: Double = 0.55 + 0.9 * Double(StableHash.bucket(submission.id + "|v" + String(submission.version), modulus: 100)) / 100
        let hours: Double = MoneyMath.clamp(median * spread, 1, Double(bounty.reviewSlaHours - 2))
        return FlowdCalendar.addHours(enteredReviewAt(submission), hours)
    }

    /// What the brand does with a video: approve a take that clears the bar, ask for changes with timecoded notes while rounds are included, otherwise
    /// say no with a reason from the brief.
    func brandPlan(for submission: Submission) throws -> DemoDecision {
        let failures: Int = submission.versions.last?.qaFail ?? 0
        if submission.flowPoints >= FlowdConstants.Scores.Bands.c && failures == 0 {
            return .approve
        }
        if submission.revisionRound < FlowdConstants.Review.revisionRoundsIncluded {
            var lines: [String] = []
            if let analysis = try analysisRow(submissionId: submission.id, version: submission.version) {
                let weak: [ScoreItem] = (analysis.hookScore.items + analysis.flowScore.items).filter { (i: ScoreItem) -> Bool in
                    return !i.passed
                }.sorted { (a: ScoreItem, b: ScoreItem) -> Bool in
                    return (a.max - a.points) > (b.max - b.points)
                }
                for item in weak.prefix(3) {
                    lines.append(item.reason + (item.fix.map { (f: String) -> String in return " " + f } ?? ""))
                }
            }
            if lines.isEmpty {
                lines = ["Show the app on screen in the first three seconds.", "Say the offer once, clearly, near the end."]
            }
            return .requestChanges(notes: lines)
        }
        return .reject(reason: .offBrief, summary: "The video still does not match the brief after two rounds of changes.")
    }

    /// Plays the brand's decision on every video of the creator waiting on it once the brand's decision time has passed, in the order they fall due.
    func brandDecisions(at moment: Date) throws {
        if !autoBrandDecisions {
            return
        }
        var due: [(submission: Submission, at: Date)] = []
        for submission in try mySubmissions() where submission.isWaitingOnBrand {
            let bounty: Bounty = try bountyRow(submission.bountyId)
            let when: Date = decisionDue(for: submission, bounty: bounty)
            if when <= moment {
                due.append((submission: submission, at: when))
            }
        }
        due.sort { (a: (submission: Submission, at: Date), b: (submission: Submission, at: Date)) -> Bool in
            return a.at < b.at
        }
        for entry in due {
            _ = try decide(entry.submission.id, decision: try brandPlan(for: entry.submission), at: entry.at)
        }
    }

    /// The review SLA: a video the brand has not decided in 72 hours is escalated (and the brand's reliability takes the hit); with the approve-if-clean
    /// timeout policy a clean video is approved at the limit.
    func advanceReviewSla(at moment: Date) throws {
        for submission in try mySubmissions() where submission.isWaitingOnBrand {
            let bounty: Bounty = try bountyRow(submission.bountyId)
            let hours: Double = hoursInQueue(submission, at: moment)
            let state: SlaState = ReputationEngine.slaState(hoursInQueue: hours, decided: false, slaHours: bounty.reviewSlaHours)
            if state == .breached && submission.slaBreachedAt == nil {
                let brand: Brand = try brandRow(bounty.brandId)
                let clean: Bool = (submission.versions.last?.qaFail ?? 0) == 0 && (submission.versions.last?.qaWarn ?? 0) == 0
                if brand.timeoutPolicy == .approveIfClean && clean {
                    try finalizeApproval(submission.id, action: .timeoutApprove, summary: nil, at: moment)
                    continue
                }
                let due: Date = FlowdCalendar.addHours(enteredReviewAt(submission), Double(bounty.reviewSlaHours))
                try store.submissions.update(submission.id) { (s: inout Submission) in
                    s.slaState = .breached
                    s.slaBreachedAt = due
                    s.updatedAt = moment
                }
                try notify(
                    .systemNotice,
                    title: "Review is overdue: " + bounty.title,
                    body: "The 72-hour limit passed. The brand's reliability takes the hit and Ops can step in. Your video stays reserved.",
                    deepLink: "flowd://submission/" + submission.id,
                    refKind: "submission",
                    refId: submission.id,
                    at: moment
                )
            } else if state == .stale && submission.slaState == .onTrack {
                try store.submissions.update(submission.id) { (s: inout Submission) in
                    s.slaState = .stale
                }
            }
        }
    }

    /// Approved work nobody used inside 30 days is released to the Spec Market; a changes-requested video that is never revised expires after 14 days.
    func expireStale(at moment: Date) throws {
        for submission in try mySubmissions() {
            if submission.status == .approved, let approved = submission.approvedAt, submission.postId == nil {
                if FlowdCalendar.daysBetween(approved, moment) >= Double(FlowdConstants.Review.unusedReleaseDays) {
                    try releaseSlot(bountyId: submission.bountyId, cents: submission.reservedCents)
                    try store.submissions.update(submission.id) { (s: inout Submission) in
                        s.status = .released
                        s.reservedCents = 0
                        s.releasedAt = moment
                        s.updatedAt = moment
                    }
                    try recountBounty(submission.bountyId)
                    try notify(
                        .systemNotice,
                        title: "Released to the Spec Market",
                        body: "You did not post this approved video within " + String(FlowdConstants.Review.unusedReleaseDays) + " days, so it moved to the Spec Market. The brand keeps first refusal for a week.",
                        deepLink: "flowd://submission/" + submission.id,
                        refKind: "submission",
                        refId: submission.id,
                        at: moment
                    )
                }
            } else if submission.status == .changesRequested {
                let decided: Date = submission.decision?.decidedAt ?? submission.updatedAt
                if FlowdCalendar.hoursBetween(decided, moment) > Double(FlowdConstants.Review.revisionExpiryDays * 24) {
                    try releaseSlot(bountyId: submission.bountyId, cents: submission.reservedCents)
                    try store.submissions.update(submission.id) { (s: inout Submission) in
                        s.status = .expired
                        s.reservedCents = 0
                        s.updatedAt = moment
                    }
                    try recountBounty(submission.bountyId)
                }
            }
        }
    }

    // MARK: Appeals and disputes (Ops decides on the clock)

    /// Ops decides an appeal within 72 hours by comparing the decision with the brief and the video: the rejection is overturned or it stands.
    func resolveDisputes(at moment: Date) throws {
        for dispute in try myDisputes() where dispute.status != .resolved && dispute.status != .withdrawn && dispute.resolutionDueAt <= moment {
            let due: Date = dispute.resolutionDueAt
            if dispute.kind == .rejectionAppeal, let submissionId = dispute.submissionId {
                let overturn: Bool = StableHash.bucket(dispute.id, modulus: 100) < 45
                if overturn {
                    try finalizeApproval(submissionId, action: .appealOverturn, summary: "The reviewer compared the decision with the brief and overturned it.", at: due)
                } else if let submission = try store.submissions.find(submissionId) {
                    try releaseSlot(bountyId: submission.bountyId, cents: submission.reservedCents)
                    try store.submissions.update(submissionId) { (s: inout Submission) in
                        s.status = .rejected
                        s.reservedCents = 0
                        s.updatedAt = due
                    }
                    try recountBounty(submission.bountyId)
                    try notify(
                        .appealDecided,
                        title: "Appeal decided: the rejection stands",
                        body: "A reviewer compared the decision with the brief and the video. The reason matches what the brief asks for. Your next take starts fresh.",
                        deepLink: "flowd://submission/" + submissionId,
                        refKind: "submission",
                        refId: submissionId,
                        at: due
                    )
                }
                try closeDispute(dispute.id, outcome: overturn ? .upheld : .rejected, text: overturn ? "The rejection was overturned and the video is approved." : "The rejection stands. The reason matches the brief.", adjustment: nil, at: due)
            } else {
                let partial: Bool = dispute.kind == .viewCount && dispute.amountInDisputeCents > 0
                let adjustment: Int = partial ? dispute.amountInDisputeCents / 2 : 0
                let text: String = partial
                    ? "Ops compared the 72-hour snapshots with the platform API and adjusted part of the gap. The rest is platform-side duplicates and bot views."
                    : "Ops reviewed the evidence. The decision stands."
                try closeDispute(dispute.id, outcome: partial ? .partiallyUpheld : .rejected, text: text, adjustment: adjustment > 0 ? adjustment : nil, at: due)
                if let postId = dispute.postId {
                    try releaseHold(forPost: postId, at: due)
                    if adjustment > 0 {
                        try addAdjustmentEarning(cents: adjustment, label: "Dispute adjustment: " + (dispute.postId ?? ""), postId: postId, at: due)
                    }
                }
                try notify(
                    .disputeUpdate,
                    title: "Dispute decided",
                    body: text,
                    amountCents: adjustment > 0 ? adjustment : nil,
                    deepLink: "flowd://dispute/" + dispute.id,
                    refKind: "dispute",
                    refId: dispute.id,
                    at: due
                )
            }
        }
    }

    private func closeDispute(_ id: String, outcome: DisputeOutcome, text: String, adjustment: Int?, at moment: Date) throws {
        try store.disputes.update(id) { (d: inout Dispute) in
            d.status = .resolved
            d.outcome = outcome
            d.outcomeText = text
            d.adjustmentCents = adjustment
            d.resolvedAt = moment
            d.events.append(DisputeEvent(at: moment, actor: .admin, action: .decision, text: text, userId: nil))
            d.updatedAt = moment
        }
    }

    /// A platform-funded earning (a dispute adjustment): a pending row that clears at the next daily run like any other.
    func addAdjustmentEarning(cents: Int, label: String, postId: String?, at moment: Date) throws {
        let leg: LedgerEntry = try addLedger(type: .adjustment, amountCents: cents, status: .pending, memo: label, postedAt: moment, postId: postId)
        let run: Date = MoneyClockEngine.nextClearingRun(after: moment)
        var bountyId: String = ""
        var appId: String = ""
        if let id = postId, let post = try store.posts.find(id) {
            bountyId = post.bountyId
            appId = post.appId
        }
        let row: MoneyClockRow = MoneyClockRow(
            id: try nextMoneyRowId(),
            creatorId: meId,
            bountyId: bountyId,
            appId: appId,
            postId: postId,
            conversionId: nil,
            source: .bonus,
            state: .pending,
            amountCents: cents,
            estimated: false,
            earnedAt: moment,
            etaAt: run,
            reason: .awaitingClearingRun,
            reasonText: MoneyClockEngine.reasonText(reason: .awaitingClearingRun, etaAt: run),
            label: label,
            ledgerId: leg.id,
            payoutId: nil,
            clearedAt: nil,
            paidAt: nil
        )
        try store.moneyClock.append(row)
    }
}

extension QaCheck {
    /// The reason code a failed or warned check would carry in a review (a guess for demo notes; the real mapping lives in `QAEngine`).
    var reasonCodeGuess: ReasonCode? {
        switch check {
        case .disclosureAudio, .disclosureOnscreen: return .missingDisclosure
        case .musicLicence: return .musicNotLicensed
        case .bannedClaims: return .bannedClaim
        case .aiContent: return .aiContentUndisclosed
        case .duplicate: return .duplicateContent
        case .watermark: return .watermarkPresent
        case .briefBeats: return .missingRequiredBeat
        case .safeZone, .aspectRatio, .length, .resolution: return .wrongFormat
        case .audioClarity: return .audioUnclear
        case .moderation: return .brandSafety
        case .unknown: return nil
        }
    }
}
