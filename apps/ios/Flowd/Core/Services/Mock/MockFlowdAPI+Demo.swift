import Foundation

// The demo clock. Advancing it runs the platform's scheduled jobs in order, exactly as production would:
//
//   hourly       views accrue; a View Ledger snapshot every 6 hours inside the 72-hour window
//   at 72 h      a post's window closes: its pay is settled; a flagged post is held with a named reason
//   daily 14:00  the clearing run: posts that passed the check clear, conversions clear after their own windows
//   Fri 18:00    the weekly payout run: cleared money is paid (free); holds stay held with their reason
//   continuous   review SLAs and decisions, offers, appeals and disputes, expiries, rights alerts, the Daily Drop, tournaments, streak weeks
//
// The mock's clock ticks in real time from 2026-10-03T14:00:00Z; `reconcileIfNeeded` runs whatever has come due since the last call.

extension MockFlowdAPI {
    /// The most the clock moves in one call (about five weeks): enough for a month-end demo, small enough to stay instant.
    static let maxAdvanceHours: Int = 24 * 35

    // MARK: Schedule

    /// Every scheduled instant in (start, end]: midnight, the 14:00 clearing run, the 16:00 Daily Drop and the Friday 18:00 payout.
    func scheduledInstants(from start: Date, to end: Date) -> [Date] {
        var found: Set<Int> = []
        let startSeconds: Int = FlowdCalendar.epochSeconds(start)
        let endSeconds: Int = FlowdCalendar.epochSeconds(end)
        var day: Int = FlowdCalendar.epochSeconds(FlowdCalendar.dayStart(start))
        while day <= endSeconds {
            var hours: [Int] = [0, FlowdConstants.Windows.clearingRunHourUtc, FlowdConstants.DailyDropRules.hourUtc]
            let weekday: Int = FlowdCalendar.weekday(FlowdCalendar.date(epochSeconds: day))
            if weekday == FlowdConstants.Windows.weeklyPayoutWeekdayUtc {
                hours.append(FlowdConstants.Windows.weeklyPayoutHourUtc)
            }
            for hour in hours {
                let at: Int = day + hour * 3_600
                if at > startSeconds && at <= endSeconds {
                    found.insert(at)
                }
            }
            day += 86_400
        }
        return found.sorted().map { (seconds: Int) -> Date in
            return FlowdCalendar.date(epochSeconds: seconds)
        }
    }

    private func isClearingRun(_ moment: Date) -> Bool {
        let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = FlowdCalendar.components(moment)
        return c.hour == FlowdConstants.Windows.clearingRunHourUtc && c.minute == 0 && c.second == 0
    }

    private func isPayoutRun(_ moment: Date) -> Bool {
        let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = FlowdCalendar.components(moment)
        return FlowdCalendar.weekday(moment) == FlowdConstants.Windows.weeklyPayoutWeekdayUtc && c.hour == FlowdConstants.Windows.weeklyPayoutHourUtc && c.minute == 0 && c.second == 0
    }

    // MARK: Running the jobs

    /// Runs whatever has come due since the last call (the clock ticks in real time, so most calls do almost nothing).
    func reconcileIfNeeded() throws {
        let current: Date = now
        guard let last = lastReconcile else {
            lastReconcile = current
            return
        }
        if current.timeIntervalSince(last) < 30 {
            return
        }
        try runJobs(from: last, to: current)
        lastReconcile = current
    }

    /// Runs every scheduled job in (start, end], in order, then the state-only steps at `end`.
    func runJobs(from start: Date, to end: Date) throws {
        if end <= start {
            return
        }
        var stops: [Date] = scheduledInstants(from: start, to: end)
        if stops.last != end {
            stops.append(end)
        }
        var cursor: Date = start
        for at in stops {
            try growPosts(from: cursor, to: at)
            try closeWindows(at: at)
            if isClearingRun(at) {
                try clearingRun(at: at)
            }
            if isPayoutRun(at) {
                try payoutRun(at: at)
            }
            try everyInstant(at: at, previous: cursor)
            cursor = at
        }
        try completeTransfers(at: end)
    }

    /// The state-only steps that run at every instant.
    func everyInstant(at moment: Date, previous: Date) throws {
        try brandDecisions(at: moment)
        try advanceReviewSla(at: moment)
        try brandRespondsToOffers(at: moment)
        try expireOffers(at: moment)
        try resolveDisputes(at: moment)
        try expireStale(at: moment)
        try resolveVerifications(at: moment)
        try lapseClaims(at: moment)
        try advanceDrops(at: moment, previous: previous)
        try advanceTournaments(at: moment)
        try advanceRights(at: moment)
        if FlowdCalendar.isoWeek(previous) != FlowdCalendar.isoWeek(moment) {
            try rolloverStreak(at: moment)
        }
        try completeTransfers(at: moment)
    }

    // MARK: Claims, the Daily Drop, rights

    /// A claimed place that was not used inside its 24 hours goes back to "saved"; unclaimed spots return to the open feed.
    func lapseClaims(at moment: Date) throws {
        for save in try mySaves() where save.stage == .joined && save.submissionId == nil {
            guard let until = save.claimedUntil, until <= moment else {
                continue
            }
            try store.saves.update(save.id) { (s: inout BountySave) in
                s.stage = .saved
                s.claimedUntil = nil
                s.dropId = nil
                s.updatedAt = moment
            }
        }
    }

    /// Drops move through their states on the clock; the moment one goes live the creator gets the single Daily Drop reminder (when they want it).
    func advanceDrops(at moment: Date, previous: Date) throws {
        let prefs: NotificationPrefs = try notificationPrefsRow()
        for drop in try store.drops.all() {
            let next: DropStatus = dropState(drop, at: moment)
            if next != drop.status {
                try store.drops.update(drop.id) { (d: inout DailyDrop) in
                    d.status = next
                }
            }
            if drop.releaseAt > previous && drop.releaseAt <= moment && prefs.dropReminder && (prefs.categories["drop"] ?? true) {
                let seen: Bool = try myNotifications().contains(where: { (n: AppNotification) -> Bool in
                    return n.refId == drop.id && n.kind == .dropLive
                })
                if !seen {
                    try notify(
                        .dropLive,
                        title: "Today's Daily Drop is live",
                        body: String(drop.items.count) + " bounties, " + String(drop.spotsLeft) + " real spots. A claim holds your place for " + String(FlowdConstants.DailyDropRules.claimWindowHours) + " hours.",
                        deepLink: "flowd://drop",
                        refKind: "daily_drop",
                        refId: drop.id,
                        at: drop.releaseAt
                    )
                }
            }
        }
    }

    /// Paid-ad rights end on their date: the status follows the clock, and an expiry alert goes out at 30, 14 and 7 days (the most urgent one due).
    func advanceRights(at moment: Date) throws {
        for grant in try myGrants() {
            let derived: RightsGrantStatus = RightsEngine.deriveGrantStatus(status: grant.status, endsAt: grant.endsAt, revokedAt: grant.revokedAt, now: moment)
            var sent: [Int] = grant.alertsSent
            if let end = grant.endsAt, derived != .revoked, derived != .expired {
                let due: RightsAlertsDue = RightsEngine.dueExpiryAlerts(endsAt: end, alertsSent: grant.alertsSent, now: moment)
                if let days = due.send {
                    sent = grant.alertsSent + due.due
                    let bounty: Bounty? = try store.bounties.find(grant.bountyId)
                    let brandName: String = try store.brands.find(grant.brandId)?.name ?? "the brand"
                    let quote: RenewalQuote = RightsEngine.renewalQuote(
                        baseFeeCents: grant.baseFeeCents,
                        renewalPct: grant.renewalPctPer30d,
                        extraDays: 30,
                        takeRate: bounty?.takeRate ?? 0,
                        currentEndsAt: end
                    )
                    var body: String = "Paid-ad usage of \"" + (bounty?.title ?? grant.bountyId) + "\" ends " + FlowdCalendar.dayLabelUTC(end) + "."
                    if quote.priceCents > 0 {
                        body += " If " + brandName + " renews, you earn " + Fmt.money(quote.priceCents) + " for each extra 30 days."
                    }
                    try notify(
                        .rightsExpiring,
                        title: "Rights end in " + String(days) + " days",
                        body: body,
                        deepLink: "flowd://rights",
                        refKind: "rights_grant",
                        refId: grant.id,
                        at: moment
                    )
                }
            }
            if derived != grant.status || sent != grant.alertsSent {
                let status: RightsGrantStatus = derived
                let alerts: [Int] = sent
                try store.rightsGrants.update(grant.id) { (g: inout RightsGrant) in
                    g.status = status
                    g.alertsSent = alerts
                    g.updatedAt = moment
                }
            }
        }
    }

    // MARK: DemoAPI

    func advanceDemoClock(hours: Int) async throws -> World {
        try requireSignedIn()
        if hours <= 0 {
            throw FlowdAPIError.validationFailed("The demo clock only moves forward.")
        }
        if hours > MockFlowdAPI.maxAdvanceHours {
            throw FlowdAPIError.validationFailed("Advance at most " + String(MockFlowdAPI.maxAdvanceHours / 24) + " days at a time.")
        }
        try reconcileIfNeeded()
        let start: Date = now
        clock.advance(byHours: Double(hours))
        try runJobs(from: start, to: now)
        lastReconcile = now
        return try await world()
    }

    func resetDemo() async throws {
        store.reset()
        idCounters = [:]
        idempotencyIndex = [:]
        simulatedPostIds = []
        simulatedSubmissionIds = []
        postFinalViews = [:]
        lastReconcile = nil
        acceptedAgreement = nil
        dataExportRequested = false
        accountDeleted = false
        persona = .maya
        let world: World = try store.world()
        meId = world.personas.creator.creatorId
        meUserId = world.personas.creator.userId
        clock.resetToDemoNow()
    }
}
