import Foundation

// PostsAPI: the creator's posts with their money, the View Ledger (per-post, source-labelled snapshots with the cause of any excluded views),
// one-tap disputes with their replies, and removing a post inside its window.

extension MockFlowdAPI {
    // MARK: List rows

    /// One row of the posts list: the post and where its money stands, with the dated ETA.
    func postListItem(_ post: Post) throws -> PostListItem {
        let bounty: Bounty = try bountyRow(post.bountyId)
        let app: BrandApp = try appRow(post.appId)
        let rows: [MoneyClockRow] = try moneyRows(forPost: post.id)
        var pending: Int = 0
        var accruing: Int = 0
        var cleared: Int = 0
        var paid: Int = 0
        var held: Int = 0
        for row in rows {
            switch row.state {
            case .accruing:
                accruing += row.amountCents
                pending += row.amountCents
            case .pending:
                pending += row.amountCents
            case .cleared:
                cleared += row.amountCents
            case .paid:
                paid += row.amountCents
            case .held:
                held += row.amountCents
            case .reversed, .unknown:
                break
            }
        }
        let earned: Int = rows.isEmpty ? post.earnings.totalCents : pending + cleared + paid + held
        let order: [MoneyClockState] = [.accruing, .pending, .held, .cleared, .paid]
        var dominant: MoneyClockState = post.status == .live ? .accruing : .pending
        for state in order {
            if rows.contains(where: { (r: MoneyClockRow) -> Bool in return r.state == state && r.amountCents > 0 }) {
                dominant = state
                break
            }
        }
        let lead: [MoneyClockRow] = rows.filter { (r: MoneyClockRow) -> Bool in
            return r.state == dominant
        }
        let clearsAt: Date? = lead.compactMap { (r: MoneyClockRow) -> Date? in
            return r.etaAt
        }.min()
        let reasonLabel: String = lead.first?.reason.label ?? (post.status == .removed ? "Removed" : "No earnings yet")
        return PostListItem(
            post: post,
            bountyTitle: bounty.title,
            brand: try brandCard(post.brandId),
            appName: app.name,
            earningsCents: earned,
            pendingCents: pending,
            clearedCents: cleared,
            paidCents: paid,
            heldCents: held,
            moneyState: dominant,
            clearsAt: clearsAt,
            reasonLabel: reasonLabel
        )
    }

    func posts(filter: PostFilter) async throws -> [PostListItem] {
        try requireSignedIn()
        try reconcileIfNeeded()
        let rows: [Post] = try myPosts().filter { (p: Post) -> Bool in
            if p.status == .removed {
                return false
            }
            switch filter {
            case .all:
                return true
            case .live:
                return p.status == .live
            case .clearing:
                return p.status == .windowClosed
            case .cleared:
                return p.status == .cleared
            case .paid:
                return p.status == .paid
            case .held:
                return p.status == .held || p.status == .clawedBack
            }
        }.sorted { (a: Post, b: Post) -> Bool in
            return a.postedAt > b.postedAt
        }
        var out: [PostListItem] = []
        for row in rows {
            out.append(try postListItem(row))
        }
        return out
    }

    // MARK: Detail

    func openDispute(forPost postId: String) throws -> Dispute? {
        return try myDisputes().first(where: { (d: Dispute) -> Bool in
            return d.postId == postId && d.status != .resolved && d.status != .withdrawn
        })
    }

    func postDetail(id: String) async throws -> PostDetail {
        try requireSignedIn()
        try reconcileIfNeeded()
        let post: Post = try postRow(id)
        let bounty: Bounty = try bountyRow(post.bountyId)
        let app: BrandApp = try appRow(post.appId)
        let conversions: [Conversion] = try store.conversions.all().filter { (c: Conversion) -> Bool in
            return c.postId == id
        }.sorted { (a: Conversion, b: Conversion) -> Bool in
            return a.firstAt > b.firstAt
        }
        let link: AttributionLink? = try store.links.find(post.trackingLinkId)
        let grants: [RightsGrant] = try myGrants().filter { (g: RightsGrant) -> Bool in
            return g.postId == id
        }
        let disputes: [Dispute] = try myDisputes().filter { (d: Dispute) -> Bool in
            return d.postId == id
        }
        var clock: EarningDescription? = nil
        if post.status != .removed {
            let state: EarningClock = MoneyClockEngine.postClock(
                postedAt: post.postedAt,
                now: now,
                held: post.status == .held,
                holdReason: post.holdReason,
                paidAt: post.paidAt,
                payoutArrivesAt: nil,
                reversed: post.status == .clawedBack,
                assumeWeeklyPayout: post.status == .paid
            )
            clock = MoneyClockEngine.describe(state, timeZone: TimeZone.current)
        }
        let hasOpenDispute: Bool = try openDispute(forPost: id) != nil
        let canDispute: Bool = post.status != .removed && !hasOpenDispute
        return PostDetail(
            post: post,
            bounty: bounty,
            brand: try brandCard(post.brandId),
            appName: app.name,
            moneyRows: try moneyRows(forPost: id),
            conversions: conversions,
            link: link,
            rights: grants,
            disputes: disputes,
            timeline: MoneyClockEngine.postTimeline(postedAt: post.postedAt, now: now),
            clock: clock,
            capProgress: post.capReachedFraction,
            canDispute: canDispute
        )
    }

    // MARK: View Ledger

    func viewLedger(postId: String) async throws -> ViewLedger {
        try requireSignedIn()
        try reconcileIfNeeded()
        let post: Post = try postRow(postId)
        let snapshots: [ViewSnapshot] = try store.viewSnapshots.all().filter { (s: ViewSnapshot) -> Bool in
            return s.postId == postId
        }.sorted { (a: ViewSnapshot, b: ViewSnapshot) -> Bool in
            return a.takenAt < b.takenAt
        }
        let last: ViewSnapshot? = snapshots.last
        let verified: Int = last?.viewsVerified ?? post.windowViews
        let reported: Int = last?.viewsReported ?? post.views
        let invalid: Int = last?.viewsInvalid ?? post.viewsInvalid
        var exclusions: [ViewExclusion] = []
        if let withCause = snapshots.last(where: { (s: ViewSnapshot) -> Bool in
            return !(s.exclusions ?? []).isEmpty
        }) {
            exclusions = withCause.exclusions ?? []
        } else if invalid > 0 {
            exclusions = [ViewExclusion(cause: .platformAdjustment, views: invalid, detail: "The platform adjusted its own count; flowd pays only verified views.")]
        }
        var split: [TrafficShare] = []
        if let withSources = snapshots.last(where: { (s: ViewSnapshot) -> Bool in
            return !(s.sources ?? [:]).isEmpty
        }), let sources = withSources.sources {
            split = sources.map { (entry: (key: String, value: Double)) -> TrafficShare in
                return TrafficShare(source: entry.key, share: entry.value)
            }.sorted { (a: TrafficShare, b: TrafficShare) -> Bool in
                if a.share != b.share {
                    return a.share > b.share
                }
                return a.source < b.source
            }
        }
        let disputes: [Dispute] = try myDisputes().filter { (d: Dispute) -> Bool in
            return d.postId == postId
        }
        let hasOpenDispute: Bool = try openDispute(forPost: postId) != nil
        let canDispute: Bool = post.status != .removed && !hasOpenDispute
        return ViewLedger(
            post: post,
            snapshots: snapshots,
            verifiedViews: verified,
            invalidViews: invalid,
            reportedViews: reported,
            exclusions: exclusions,
            sourceSplit: split,
            disputes: disputes,
            canDispute: canDispute
        )
    }

    // MARK: Disputes

    func openDispute(_ request: DisputeRequest) async throws -> Dispute {
        try requireSignedIn()
        if let known = remembered(request.idempotencyKey, operation: "open_dispute"), let again = try store.disputes.find(known) {
            return again
        }
        let post: Post = try postRow(request.postId)
        if post.status == .removed {
            throw FlowdAPIError.conflict("That post was removed, so there is nothing to dispute.")
        }
        if try openDispute(forPost: post.id) != nil {
            throw FlowdAPIError.conflict("You already have an open dispute on this post. Add to it instead.")
        }
        let reason: String = request.reason.trimmingCharacters(in: .whitespacesAndNewlines)
        if reason.isEmpty {
            throw FlowdAPIError.validationFailed("Say what looks wrong. A sentence is enough.")
        }
        let moment: Date = now
        let ids: [String] = try store.disputes.all().map { (d: Dispute) -> String in
            return d.id
        }
        let inDispute: Int = Swift.min(post.earnings.totalCents, MoneyMath.mulRate(post.earnings.cpmCents + post.earnings.cpaCents, 0.1))
        let dispute: Dispute = Dispute(
            id: nextId("disp", width: 3, existing: ids),
            kind: request.kind,
            status: .open,
            openedBy: .creator,
            creatorId: meId,
            brandId: post.brandId,
            bountyId: post.bountyId,
            submissionId: post.submissionId,
            postId: post.id,
            payoutId: nil,
            rejectionReasonCode: nil,
            rangeFrom: request.rangeFrom ?? post.postedAt,
            rangeTo: request.rangeTo ?? post.windowEndsAt,
            reason: reason,
            note: request.note,
            evidence: request.evidence,
            amountInDisputeCents: inDispute,
            events: [DisputeEvent(at: moment, actor: .creator, action: .opened, text: request.note.isEmpty ? reason : request.note, userId: meUserId)],
            openedAt: moment,
            replyDueAt: FlowdCalendar.addHours(moment, Double(FlowdConstants.Disputes.replySlaHours)),
            firstReplyAt: nil,
            resolutionDueAt: FlowdCalendar.addDays(moment, Double(FlowdConstants.Disputes.resolutionSlaDays)),
            resolvedAt: nil,
            outcome: nil,
            outcomeText: nil,
            adjustmentCents: nil,
            assignedAdminUserId: nil,
            updatedAt: moment
        )
        try store.disputes.append(dispute)
        try holdMoney(forPost: post.id, at: moment)
        remember(request.idempotencyKey, operation: "open_dispute", resourceId: dispute.id)
        return dispute
    }

    func disputes() async throws -> [Dispute] {
        try requireSignedIn()
        try reconcileIfNeeded()
        return try myDisputes().sorted { (a: Dispute, b: Dispute) -> Bool in
            return a.updatedAt > b.updatedAt
        }
    }

    func dispute(id: String) async throws -> Dispute {
        try requireSignedIn()
        guard let row = try store.disputes.find(id), row.creatorId == meId else {
            throw FlowdAPIError.notFound("that dispute")
        }
        return row
    }

    func replyToDispute(id: String, text: String, evidence: [Evidence]) async throws -> Dispute {
        try requireSignedIn()
        guard let row = try store.disputes.find(id), row.creatorId == meId else {
            throw FlowdAPIError.notFound("that dispute")
        }
        if row.status == .resolved || row.status == .withdrawn {
            throw FlowdAPIError.conflict("This dispute is closed.")
        }
        let body: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if body.isEmpty && evidence.isEmpty {
            throw FlowdAPIError.validationFailed("Write a reply or add evidence.")
        }
        let moment: Date = now
        let userId: String = meUserId
        return try store.disputes.update(id) { (d: inout Dispute) in
            d.events.append(DisputeEvent(at: moment, actor: .creator, action: evidence.isEmpty ? .reply : .evidenceAdded, text: body.isEmpty ? "Added evidence." : body, userId: userId))
            d.evidence.append(contentsOf: evidence)
            if d.status == .evidenceRequested && !evidence.isEmpty {
                d.status = .underReview
            }
            d.updatedAt = moment
        }
    }

    func removePost(id: String) async throws -> Post {
        try requireSignedIn()
        let post: Post = try postRow(id)
        guard post.status == .live else {
            throw FlowdAPIError.conflict("Only a post inside its 72-hour window can be removed. After that the views are final and paid.")
        }
        let moment: Date = now
        let removed: Post = try store.posts.update(id) { (p: inout Post) in
            p.status = .removed
            p.removedAt = moment
        }
        for row in try moneyRows(forPost: id) where row.state == .accruing {
            try store.moneyClock.remove(row.id)
        }
        for grant in try myGrants() where grant.postId == id {
            try store.rightsGrants.update(grant.id) { (g: inout RightsGrant) in
                g.status = .revoked
                g.revokedAt = moment
                g.revokeReason = "Post removed by the creator"
                g.updatedAt = moment
            }
        }
        try recountBounty(post.bountyId)
        try refreshCreatorStats(at: moment)
        return removed
    }
}
