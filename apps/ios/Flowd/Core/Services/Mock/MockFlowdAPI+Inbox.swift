import Foundation

// InboxAPI: the activity feed (money, reviews, offers, tier), in-app message threads with Scam Shield, scam reports, and Flo, the in-app copilot (a
// deterministic mock engine behind the `AIProvider` interface).

extension MockFlowdAPI {
    // MARK: Notifications

    func notifications(filter: ActivityFilter) async throws -> [AppNotification] {
        try requireSignedIn()
        try reconcileIfNeeded()
        let moment: Date = now
        return try myNotifications().filter { (n: AppNotification) -> Bool in
            if n.createdAt > moment {
                return false
            }
            switch filter {
            case .all:
                return true
            case .money:
                return n.kind.category == .money
            case .reviews:
                return n.kind.category == .reviews
            case .offers:
                return n.kind.category == .offers
            case .tier:
                return n.kind == .tierUp || n.kind == .streakMilestone || n.kind == .academyBadge
            }
        }.sorted { (a: AppNotification, b: AppNotification) -> Bool in
            if a.createdAt != b.createdAt {
                return a.createdAt > b.createdAt
            }
            return a.id > b.id
        }
    }

    func markNotificationsRead(ids: [String]) async throws {
        try requireSignedIn()
        let moment: Date = now
        let wanted: Set<String> = Set(ids)
        for row in try myNotifications() where row.readAt == nil && (wanted.isEmpty || wanted.contains(row.id)) {
            try store.notifications.update(row.id) { (n: inout AppNotification) in
                n.readAt = moment
                if n.deliveredAt == nil {
                    n.deliveredAt = moment
                }
            }
        }
    }

    // MARK: Threads (in-app only)

    private func kindLabel(_ kind: ThreadKind) -> String {
        switch kind {
        case .offer: return "Offer"
        case .submission: return "Review"
        case .bounty: return "Bounty"
        case .support: return "Support"
        case .unknown: return "Message"
        }
    }

    private func inboxThread(_ thread: ChatThread) throws -> InboxThread {
        var name: String = "flowd Support"
        var art: ArtSeed? = nil
        if let brandId = thread.brandId, let brand = try store.brands.find(brandId) {
            name = brand.name
            art = brand.logo
        }
        var preview: String = ""
        if let last = thread.messages.last {
            preview = last.body.count > 96 ? String(last.body.prefix(95)) + "\u{2026}" : last.body
        }
        return InboxThread(
            thread: thread,
            counterpart: name,
            counterpartArt: art,
            preview: preview,
            unread: thread.unreadCreator,
            kindLabel: kindLabel(thread.kind)
        )
    }

    private func myThreads() throws -> [ChatThread] {
        return try store.threads.all().filter { (t: ChatThread) -> Bool in
            return t.creatorId == meId
        }
    }

    func threads() async throws -> [InboxThread] {
        try requireSignedIn()
        try reconcileIfNeeded()
        var out: [InboxThread] = []
        let rows: [ChatThread] = try myThreads().sorted { (a: ChatThread, b: ChatThread) -> Bool in
            return a.lastMessageAt > b.lastMessageAt
        }
        for row in rows {
            out.append(try inboxThread(row))
        }
        return out
    }

    func thread(id: String) async throws -> InboxThread {
        try requireSignedIn()
        guard let row = try store.threads.find(id), row.creatorId == meId else {
            throw FlowdAPIError.notFound("that conversation")
        }
        let moment: Date = now
        let read: ChatThread = try store.threads.update(id) { (t: inout ChatThread) in
            t.unreadCreator = 0
            for index in t.messages.indices where t.messages[index].authorRole != .creator && t.messages[index].readAt == nil {
                t.messages[index].readAt = moment
            }
        }
        return try inboxThread(read)
    }

    func sendMessage(threadId: String, body: String) async throws -> InboxThread {
        try requireSignedIn()
        guard let row = try store.threads.find(threadId), row.creatorId == meId else {
            throw FlowdAPIError.notFound("that conversation")
        }
        let text: String = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty {
            throw FlowdAPIError.validationFailed("Write a message first.")
        }
        if row.rateLimited {
            throw FlowdAPIError.rateLimited(retryAfterSeconds: 60)
        }
        let moment: Date = now
        let warning: ScamReason? = ScamShield.warning(for: text)
        let ids: [String] = try store.threads.all().flatMap { (t: ChatThread) -> [String] in
            return t.messages.map { (m: ChatMessage) -> String in return m.id }
        }
        let first: String = nextId("msg", width: 0, existing: ids)
        var added: [ChatMessage] = [
            ChatMessage(id: first, authorRole: .creator, authorUserId: meUserId, kind: .text, body: text, at: moment, warningCode: warning, readAt: nil)
        ]
        if let reason = warning {
            let second: String = nextId("msg", width: 0, existing: ids)
            added.append(ChatMessage(id: second, authorRole: .system, authorUserId: nil, kind: .warning, body: ScamShield.copy(for: reason), at: moment, warningCode: reason, readAt: nil))
        }
        let appended: [ChatMessage] = added
        let updated: ChatThread = try store.threads.update(threadId) { (t: inout ChatThread) in
            t.messages.append(contentsOf: appended)
            t.lastMessageAt = moment
        }
        return try inboxThread(updated)
    }

    // MARK: Scam Shield reports

    func reportScam(_ request: ScamReportRequest) async throws -> ScamReport {
        try requireSignedIn()
        if let known = remembered(request.idempotencyKey, operation: "report_scam"), let again = try store.scamReports.find(known) {
            return again
        }
        let text: String = request.description.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.count < 10 {
            throw FlowdAPIError.validationFailed("Say what happened in a sentence or two so the safety team can act.")
        }
        let moment: Date = now
        let ids: [String] = try store.scamReports.all().map { (r: ScamReport) -> String in
            return r.id
        }
        let id: String = nextId("scam", width: 3, existing: ids)
        let number: String = FlowdCalendar.pad(Int(id.dropFirst(5)) ?? 1, 4)
        let year: Int = FlowdCalendar.components(moment).year
        let report: ScamReport = ScamReport(
            id: id,
            caseId: "SR-" + String(year) + "-" + number,
            reporterKind: .creator,
            reporterCreatorId: meId,
            reporterBrandId: nil,
            targetKind: request.targetKind,
            targetId: request.targetId,
            reason: request.reason,
            description: text,
            evidenceRefs: request.evidenceRefs,
            status: .new,
            createdAt: moment,
            slaDueAt: FlowdCalendar.addHours(moment, 48),
            triagedAt: nil,
            resolvedAt: nil,
            actionTaken: nil,
            assignedAdminUserId: nil
        )
        try store.scamReports.append(report)
        remember(request.idempotencyKey, operation: "report_scam", resourceId: id)
        return report
    }

    func myReports() async throws -> [ScamReport] {
        try requireSignedIn()
        return try store.scamReports.all().filter { (r: ScamReport) -> Bool in
            return r.reporterCreatorId == meId
        }.sorted { (a: ScamReport, b: ScamReport) -> Bool in
            return a.createdAt > b.createdAt
        }
    }

    // MARK: Flo

    /// A sentence about the most useful next move, built from the creator's real state.
    func nextActionHint() throws -> String {
        let subs: [Submission] = try mySubmissions()
        if let approved = subs.first(where: { (s: Submission) -> Bool in return s.canPost }) {
            return "Post \"" + approved.title + "\". It is approved and your link and #ad line are ready; posting opens the 72-hour view window."
        }
        if let revise = subs.first(where: { (s: Submission) -> Bool in return s.canRevise }) {
            return "Revise \"" + revise.title + "\": " + String(openNoteCount(revise.id)) + " open notes with timecodes. Fix the must-fix ones first."
        }
        let week: String = FlowdCalendar.isoWeek(now)
        let postedThisWeek: Bool = try myPosts().contains(where: { (p: Post) -> Bool in
            return p.status != .removed && FlowdCalendar.isoWeek(p.postedAt) == week
        })
        if !postedThisWeek {
            return "Make one scored take today. A week counts when you post at least once."
        }
        return "You have posted this week. If you want one more, pick a bounty from your top matches and score a take."
    }

    func flo(_ request: FloRequest) async throws -> FloSuggestion {
        try requireSignedIn()
        let creator: Creator = try meRow()
        var bounty: Bounty? = nil
        if let id = request.bountyId {
            bounty = try store.bounties.find(id)
        }
        var app: BrandApp? = nil
        var brand: Brand? = nil
        if let b = bounty {
            app = try store.apps.find(b.appId)
            brand = try store.brands.find(b.brandId)
        }
        var format: Format? = nil
        if let id = request.formatId {
            format = try store.formats.find(id.rawValue)
        } else if let first = bounty?.formatIds.first {
            format = try store.formats.find(first.rawValue)
        }
        var hooks: [Hook] = []
        if let category = app?.category {
            hooks = try store.hooks.all().filter { (h: Hook) -> Bool in
                return h.examples.contains(where: { (e: HookExample) -> Bool in return e.category == category })
            }.sorted { (a: Hook, b: Hook) -> Bool in
                return a.stats.trialRate > b.stats.trialRate
            }
        }
        var rateHint: String? = nil
        if request.kind == .rateAdvice, let suggestion = try? suggestRate() {
            rateHint = "Your market band is " + Fmt.moneyRange(low: suggestion.lowCents, high: suggestion.highCents) + " a video, centred on " + Fmt.money(suggestion.priceCents) + ". " + suggestion.basis + "."
        }
        let context: FloContext = FloContext(
            creatorHandle: creator.handle,
            creatorNiches: creator.niches,
            bounty: bounty,
            brandName: brand?.name,
            appName: app?.name,
            appFeatures: app?.features ?? [],
            appCategory: app?.category,
            format: format,
            hooks: Array(hooks.prefix(12)),
            nextActionHint: try nextActionHint(),
            rateAdviceHint: rateHint
        )
        let output: FloOutput = try await ai.respond(to: request, context: context)
        let ids: [String] = try store.floSuggestions.all().map { (f: FloSuggestion) -> String in
            return f.id
        }
        let suggestion: FloSuggestion = FloSuggestion(
            id: nextId("flo", width: 4, existing: ids),
            surface: request.surface,
            kind: request.kind,
            creatorId: meId,
            brandId: nil,
            contextKind: request.contextKind,
            contextId: request.contextId ?? request.bountyId,
            prompt: request.prompt,
            title: output.title,
            outputs: output.outputs,
            actions: output.actions,
            model: output.model,
            latencyMs: output.latencyMs,
            helpful: nil,
            createdAt: now
        )
        try store.floSuggestions.append(suggestion)
        return suggestion
    }

    func floHistory() async throws -> [FloSuggestion] {
        try requireSignedIn()
        return try store.floSuggestions.all().filter { (f: FloSuggestion) -> Bool in
            return f.creatorId == meId
        }.sorted { (a: FloSuggestion, b: FloSuggestion) -> Bool in
            if a.createdAt != b.createdAt {
                return a.createdAt > b.createdAt
            }
            return a.id > b.id
        }
    }

    func rateFloSuggestion(id: String, helpful: Bool) async throws -> FloSuggestion {
        try requireSignedIn()
        guard let row = try store.floSuggestions.find(id), row.creatorId == meId else {
            throw FlowdAPIError.notFound("that suggestion")
        }
        return try store.floSuggestions.update(id) { (f: inout FloSuggestion) in
            f.helpful = helpful
        }
    }
}
