import Foundation

// The Money Clock: when earnings clear, when they pay, and why. Mirrors apps/web/src/lib/engine/moneyclock.ts and the contract's
// FORMULAS (money clock, conversion clearing, instant payout).
//
// Post earnings accrue while the 72-hour window is open (a live estimate), then the window closes, an automated fraud and disclosure check runs
// (done within 12 hours), and the money clears at the first daily clearing run (14:00 UTC) at or after window end + 2 hours. Cleared money pays
// out at the next weekly run (Friday 18:00 UTC) or in an instant cash-out. Conversion (CPA) earnings clear after the clearing window of their kind
// (install 24 h, trial 72 h, paid 168 h), then at the next 14:00 UTC run. Every non-final state carries a dated ETA and a named reason: a bare
// "pending" is a bug (`bareStateProblem`).

/// The state, reason and dates of one earning at a given moment.
struct EarningClock: Hashable, Sendable {
    var state: MoneyClockState
    var reason: MoneyClockReason
    /// When it moves to the next state. Nil for held, paid and reversed rows.
    var etaAt: Date?
    /// The 72-hour window end (post earnings only).
    var windowEndsAt: Date?
    var clearedAt: Date?
    /// When the payout that carries this money was initiated.
    var paidAt: Date?
    /// A payout in transit: when it lands in the bank (reason `payoutInTransit`).
    var arrivesAt: Date?

    init(
        state: MoneyClockState,
        reason: MoneyClockReason,
        etaAt: Date? = nil,
        windowEndsAt: Date? = nil,
        clearedAt: Date? = nil,
        paidAt: Date? = nil,
        arrivesAt: Date? = nil
    ) {
        self.state = state
        self.reason = reason
        self.etaAt = etaAt
        self.windowEndsAt = windowEndsAt
        self.clearedAt = clearedAt
        self.paidAt = paidAt
        self.arrivesAt = arrivesAt
    }
}

/// Everything a row needs to render: state chip, dated ETA, named reason.
struct EarningDescription: Codable, Hashable, Sendable {
    var uiTitle: String
    var state: MoneyClockState
    var reason: MoneyClockReason
    /// "Views still counting", "Next weekly payout".
    var reasonLabel: String
    /// The full dated sentence ("Cleared. Pays out Fri 6:00 PM UTC (weekly payout, free).").
    var reasonText: String
    var etaAt: Date?
    /// "Clears Sat 2:00 PM UTC" / "Pays Fri 6:00 PM UTC" / "Arrives Mon 3:00 PM UTC"; nil when there is no date.
    var etaLabel: String?
}

/// Totals per state. Pending and cleared are returned side by side and never summed.
struct MoneyClockSummary: Codable, Hashable, Sendable {
    /// accruing + pending, shown together as Pending (a live estimate while accruing).
    var pendingCents: Int
    var accruingCents: Int
    /// Cleared and waiting for the weekly payout.
    var clearedCents: Int
    var heldCents: Int
    var paidCents: Int
    /// Earliest ETA among accruing and pending rows: the next clearing run that matters.
    var nextClearingAt: Date?
    /// The weekly payout that will carry the cleared money, when there is any.
    var nextPayoutAt: Date?
}

/// One step of a post's timeline: posted, window closes, fraud check, cleared, paid.
struct TimelineStep: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var label: String
    /// The instant, or the planned instant when not done yet.
    var at: Date
    var done: Bool
}

enum InstantRefusal: String, Codable, Hashable, Sendable {
    case belowMinimum = "below_minimum"
    case exceedsCleared = "exceeds_cleared"
    case nothingCleared = "nothing_cleared"
}

/// The fee and net of an instant cash-out.
struct InstantPayoutQuote: Codable, Hashable, Sendable {
    var ok: Bool
    var refusal: InstantRefusal?
    /// What the creator pays: 0 when a perk makes it free.
    var feeCents: Int
    var netCents: Int
    var freeInstant: Bool
    /// The fee without perks: clamp(round(1.5% x amount), $0.50, $15). Shown struck through when free.
    var listFeeCents: Int
}

/// The text and numbers shown before the creator confirms an instant cash-out.
struct InstantCashOutPreview: Codable, Hashable, Sendable {
    var quote: InstantPayoutQuote
    /// "Fee $2.40 (1.5%). You get $157.60." or "Free instant cash-out. You get $160.00."
    var summary: String
    /// Why it is free, when it is ("Gold: 1 free instant cash-out a week").
    var freeReason: String?
}

enum MoneyClockEngine {
    // MARK: The schedule

    /// First daily clearing run (14:00:00Z) at or after an instant.
    static func firstRunAtOrAfter(_ date: Date, hourUtc: Int = FlowdConstants.Windows.clearingRunHourUtc) -> Date {
        let base: Int = FlowdCalendar.epochSeconds(FlowdCalendar.dayStart(date)) + hourUtc * 3_600
        let moment: Int = FlowdCalendar.epochSeconds(date)
        return FlowdCalendar.date(epochSeconds: base >= moment ? base : base + 86_400)
    }

    /// When a post's window closes: posted + 72 hours.
    static func windowEndsAt(postedAt: Date) -> Date {
        return FlowdCalendar.addHours(postedAt, Double(FlowdConstants.Windows.viewWindowHours))
    }

    /// Clearing run for a post: the first daily run at or after window end + 2 hours (if the fraud check passes).
    static func postClearingRun(windowEnd: Date) -> Date {
        return firstRunAtOrAfter(FlowdCalendar.addHours(windowEnd, Double(FlowdConstants.Windows.clearingBufferHours)))
    }

    /// Clearing run for a conversion: occurred + 24 h (install) / 72 h (trial) / 168 h (paid), then the next run.
    static func conversionClearingRun(kind: ConversionKind, occurredAt: Date) -> Date {
        return firstRunAtOrAfter(FlowdCalendar.addHours(occurredAt, Double(FlowdConstants.cpaClearHours(kind))))
    }

    /// Clearing run of a CPA conversion on a post: its own clearing window, but never before the post's own clearing run (the CPM leg settles first
    /// and the per-video cap covers both).
    static func conversionRunOnPost(kind: ConversionKind, occurredAt: Date, postedAt: Date) -> Date {
        let own: Date = conversionClearingRun(kind: kind, occurredAt: occurredAt)
        let post: Date = postClearingRun(windowEnd: windowEndsAt(postedAt: postedAt))
        return own >= post ? own : post
    }

    /// The weekly payout run (Friday 18:00Z) that pays an item cleared at `clearedAt`: the first Friday run at or after it.
    static func weeklyPayoutFor(clearedAt: Date) -> Date {
        return nextWeeklyPayout(after: Date(timeIntervalSince1970: clearedAt.timeIntervalSince1970 - 1))
    }

    /// The next weekly payout run strictly after `now`.
    static func nextWeeklyPayout(after now: Date) -> Date {
        return FlowdCalendar.nextWeeklyAt(
            after: now,
            weekday: FlowdConstants.Windows.weeklyPayoutWeekdayUtc,
            hourUtc: FlowdConstants.Windows.weeklyPayoutHourUtc
        )
    }

    /// The next `count` weekly payout runs after `now`, soonest first.
    static func payoutSchedule(after now: Date, count: Int) -> [Date] {
        var out: [Date] = []
        var cursor: Date = now
        var index: Int = 0
        while index < count {
            let next: Date = nextWeeklyPayout(after: cursor)
            out.append(next)
            cursor = next
            index += 1
        }
        return out
    }

    /// The next daily clearing run strictly after `now`.
    static func nextClearingRun(after now: Date) -> Date {
        return firstRunAtOrAfter(Date(timeIntervalSince1970: now.timeIntervalSince1970 + 1))
    }

    /// The run id of a weekly payout: "run_2026-10-09".
    static func payoutRunId(_ runAt: Date) -> String {
        return "run_" + FlowdCalendar.dayString(runAt)
    }

    // MARK: State of one earning

    /// Maps a hold to the Money Clock reason that names it.
    static func reason(for hold: HoldReason) -> MoneyClockReason {
        switch hold {
        case .fraudReview, .unknown: return .heldFraudReview
        case .disputeOpen: return .heldDispute
        case .taxInfoMissing: return .heldTaxInfo
        case .identityCheck: return .heldIdentityCheck
        case .payoutMethodMissing: return .heldPayoutMethod
        case .complianceFail, .adminHold: return .heldCompliance
        }
    }

    /// Paid, or paid and still on its way: once a payout is initiated the money is `paid`, and the reason reads `payoutInTransit` (with the
    /// arrival) until the transfer lands.
    private static func paidClock(clearedAt: Date, paidAt: Date, now: Date, payoutArrivesAt: Date?) -> EarningClock {
        if let arrives = payoutArrivesAt, arrives > now {
            return EarningClock(state: .paid, reason: .payoutInTransit, clearedAt: clearedAt, paidAt: paidAt, arrivesAt: arrives)
        }
        return EarningClock(state: .paid, reason: .paidOut, clearedAt: clearedAt, paidAt: paidAt)
    }

    /// Money Clock state of a post's CPM earnings at `now`.
    ///  - accruing: while the window is open (reason windowOpen, eta = the clearing run after it)
    ///  - held: when a hold applies (reason names it; no ETA, the next step is named instead)
    ///  - pending: window closed, before the clearing run (fraudCheck for the first 12 h, then awaitingClearingRun)
    ///  - cleared: run executed; waits for the weekly payout (awaitingWeeklyPayout, eta = Friday 18:00 UTC)
    ///  - paid: when `paidAt` is given, or `assumeWeeklyPayout` and the weekly run has executed
    ///  - reversed: after a clawback
    static func postClock(
        postedAt: Date,
        now: Date,
        held: Bool = false,
        holdReason: HoldReason? = nil,
        paidAt: Date? = nil,
        payoutArrivesAt: Date? = nil,
        reversed: Bool = false,
        assumeWeeklyPayout: Bool = false
    ) -> EarningClock {
        let windowEnd: Date = windowEndsAt(postedAt: postedAt)
        if reversed {
            return EarningClock(state: .reversed, reason: .reversedClawback, windowEndsAt: windowEnd)
        }
        if now < windowEnd {
            if held {
                return EarningClock(state: .held, reason: reason(for: holdReason ?? .fraudReview), windowEndsAt: windowEnd)
            }
            return EarningClock(state: .accruing, reason: .windowOpen, etaAt: postClearingRun(windowEnd: windowEnd), windowEndsAt: windowEnd)
        }
        if held {
            return EarningClock(state: .held, reason: reason(for: holdReason ?? .fraudReview), windowEndsAt: windowEnd)
        }
        let run: Date = postClearingRun(windowEnd: windowEnd)
        if run <= now {
            let payAt: Date = weeklyPayoutFor(clearedAt: run)
            if let paidAt = paidAt, paidAt <= now {
                var clock: EarningClock = paidClock(clearedAt: run, paidAt: paidAt, now: now, payoutArrivesAt: payoutArrivesAt)
                clock.windowEndsAt = windowEnd
                return clock
            }
            if assumeWeeklyPayout && payAt <= now {
                return EarningClock(state: .paid, reason: .paidOut, windowEndsAt: windowEnd, clearedAt: run, paidAt: payAt)
            }
            return EarningClock(state: .cleared, reason: .awaitingWeeklyPayout, etaAt: payAt, windowEndsAt: windowEnd, clearedAt: run)
        }
        let fraudDeadline: Date = FlowdCalendar.addHours(windowEnd, Double(FlowdConstants.Windows.fraudCheckMaxHours))
        let why: MoneyClockReason = now < fraudDeadline ? .fraudCheck : .awaitingClearingRun
        return EarningClock(state: .pending, reason: why, etaAt: run, windowEndsAt: windowEnd)
    }

    /// Money Clock state of a CPA conversion at `now`: pending (reason conversionClearing) until the first 14:00 UTC run after its clearing window,
    /// then cleared and waiting for the weekly payout; paid (or in transit) once a payout carries it. Pass `postPostedAt` for a conversion on a post:
    /// it then also waits for the post's own clearing run (accruing, reason windowOpen, while the post's 72-hour window is still open).
    static func conversionClock(
        kind: ConversionKind,
        occurredAt: Date,
        now: Date,
        postPostedAt: Date? = nil,
        held: Bool = false,
        holdReason: HoldReason? = nil,
        paidAt: Date? = nil,
        payoutArrivesAt: Date? = nil,
        reversed: Bool = false
    ) -> EarningClock {
        if reversed {
            return EarningClock(state: .reversed, reason: .reversedClawback)
        }
        if held {
            return EarningClock(state: .held, reason: reason(for: holdReason ?? .fraudReview))
        }
        let run: Date
        if let posted = postPostedAt {
            run = conversionRunOnPost(kind: kind, occurredAt: occurredAt, postedAt: posted)
        } else {
            run = conversionClearingRun(kind: kind, occurredAt: occurredAt)
        }
        if run > now {
            if let posted = postPostedAt {
                let windowEnd: Date = windowEndsAt(postedAt: posted)
                if now < windowEnd {
                    return EarningClock(state: .accruing, reason: .windowOpen, etaAt: run, windowEndsAt: windowEnd)
                }
            }
            return EarningClock(state: .pending, reason: .conversionClearing, etaAt: run)
        }
        if let paidAt = paidAt, paidAt <= now {
            return paidClock(clearedAt: run, paidAt: paidAt, now: now, payoutArrivesAt: payoutArrivesAt)
        }
        return EarningClock(state: .cleared, reason: .awaitingWeeklyPayout, etaAt: weeklyPayoutFor(clearedAt: run), clearedAt: run)
    }

    /// When a payout initiated at `initiatedAt` is expected to land: an instant cash-out in about 30 minutes, a weekly bank payout at 15:00 UTC on
    /// the next banking day (a Friday run arrives Monday). An estimate; the payment partner's own date wins when known.
    static func estimatePayoutArrival(kind: PayoutKind, initiatedAt: Date) -> Date {
        if kind == .instant {
            return FlowdCalendar.addMinutes(initiatedAt, 30)
        }
        var day: Int = FlowdCalendar.epochSeconds(FlowdCalendar.dayStart(initiatedAt)) + 86_400
        while true {
            let weekday: Int = FlowdCalendar.weekday(FlowdCalendar.date(epochSeconds: day))
            if weekday != 0 && weekday != 6 {
                break
            }
            day += 86_400
        }
        return FlowdCalendar.date(epochSeconds: day + 15 * 3_600)
    }

    // MARK: Words

    private static func stamp(_ date: Date, _ timeZone: TimeZone?) -> String {
        if let timeZone = timeZone {
            return Fmt.clockLabel(date, timeZone: timeZone)
        }
        return Fmt.clockLabelUTC(date)
    }

    /// The named next step for a hold. Every hold names what releases it.
    static func holdStep(_ reason: MoneyClockReason) -> String? {
        switch reason {
        case .heldFraudReview: return "A person is reviewing the views and decides within 24 hours."
        case .heldDispute: return "Held while your dispute is open. It releases as soon as the dispute is resolved."
        case .heldTaxInfo: return "Add your W-9 to release this payout."
        case .heldIdentityCheck: return "Verify your identity to release this payout."
        case .heldPayoutMethod: return "Add a bank account or debit card to release this payout."
        case .heldCompliance: return "The posted video failed the disclosure check. Fix the caption to release it."
        default: return nil
        }
    }

    /// Plain English for a Money Clock row, always with the date. Never a bare "pending". Dates read in UTC unless a time zone is given.
    static func reasonText(
        reason: MoneyClockReason,
        etaAt: Date? = nil,
        windowEndsAt: Date? = nil,
        arrivesAt: Date? = nil,
        timeZone: TimeZone? = nil
    ) -> String {
        let eta: String? = etaAt.map { (date: Date) -> String in
            return stamp(date, timeZone)
        }
        func zoned(_ date: Date) -> String {
            return stamp(date, timeZone)
        }
        switch reason {
        case .windowOpen:
            if let end = windowEndsAt, let eta = eta {
                return "Views still counting until " + zoned(end) + ". Clears " + eta + " after the view check."
            }
            if let eta = eta {
                return "Views still counting. Clears " + eta + " after the view check."
            }
            return "Views still counting."
        case .fraudCheck:
            if let eta = eta {
                return "View check running (done within " + String(FlowdConstants.Windows.fraudCheckMaxHours) + " hours). Clears " + eta + "."
            }
            return "View check running."
        case .awaitingClearingRun:
            if let eta = eta {
                return "Clears at the next daily run, " + eta + "."
            }
            return "Waiting for the next daily clearing run."
        case .conversionClearing:
            if let eta = eta {
                return "Conversion in its clearing window. Clears " + eta + "."
            }
            return "Conversion in its clearing window."
        case .awaitingWeeklyPayout:
            if let eta = eta {
                return "Cleared. Pays out " + eta + " (weekly payout, free)."
            }
            return "Cleared. Pays out on the next weekly run."
        case .payoutInTransit:
            if let arrives = arrivesAt {
                return "On its way to your bank. Arrives " + zoned(arrives) + "."
            }
            return "On its way to your bank."
        case .paidOut:
            return "Paid out."
        case .reversedClawback:
            return "Reversed: views or conversions were found invalid. Legitimate views already delivered are still paid."
        case .heldFraudReview, .heldDispute, .heldTaxInfo, .heldIdentityCheck, .heldPayoutMethod, .heldCompliance:
            return holdStep(reason) ?? (reason.meaning ?? reason.label)
        case .unknown:
            return "Waiting on a check."
        }
    }

    static func isHoldReason(_ reason: MoneyClockReason) -> Bool {
        switch reason {
        case .heldFraudReview, .heldDispute, .heldTaxInfo, .heldIdentityCheck, .heldPayoutMethod, .heldCompliance:
            return true
        default:
            return false
        }
    }

    /// Everything a row needs to render: state chip, dated ETA, named reason.
    static func describe(_ clock: EarningClock, timeZone: TimeZone? = nil) -> EarningDescription {
        let verb: String = clock.state == .cleared ? "Pays" : "Clears"
        var etaLabel: String? = nil
        if let eta = clock.etaAt {
            etaLabel = verb + " " + stamp(eta, timeZone)
        } else if let arrives = clock.arrivesAt {
            etaLabel = "Arrives " + stamp(arrives, timeZone)
        }
        return EarningDescription(
            uiTitle: clock.state.uiTitle,
            state: clock.state,
            reason: clock.reason,
            reasonLabel: clock.reason.label,
            reasonText: reasonText(reason: clock.reason, etaAt: clock.etaAt, windowEndsAt: clock.windowEndsAt, arrivesAt: clock.arrivesAt, timeZone: timeZone),
            etaAt: clock.etaAt,
            etaLabel: etaLabel
        )
    }

    /// A violation message when a row would render as a bare "pending" (no ETA or no reason on a non-final state). Nil when fine.
    static func bareStateProblem(_ row: MoneyClockRow) -> String? {
        let needsEta: Bool = row.state == .accruing || row.state == .pending || row.state == .cleared
        if row.reason == .unknown {
            return "A " + row.state.rawValue + " row has no reason."
        }
        if needsEta && row.etaAt == nil {
            return "A " + row.state.rawValue + " row has no dated ETA."
        }
        if row.state == .held && !isHoldReason(row.reason) {
            return "A held row must carry a held_* reason."
        }
        return nil
    }

    // MARK: Totals

    /// Totals per state. Pending and cleared are returned side by side and never summed: the wallet shows them as two numbers.
    static func summarize(_ rows: [MoneyClockRow], now: Date) -> MoneyClockSummary {
        var accruing: Int = 0
        var pending: Int = 0
        var cleared: Int = 0
        var held: Int = 0
        var paid: Int = 0
        var nextClearing: Date? = nil
        for row in rows {
            switch row.state {
            case .accruing:
                accruing += row.amountCents
                pending += row.amountCents
            case .pending:
                pending += row.amountCents
            case .cleared:
                cleared += row.amountCents
            case .held:
                held += row.amountCents
            case .paid:
                paid += row.amountCents
            case .reversed, .unknown:
                break
            }
            if row.state == .accruing || row.state == .pending, let eta = row.etaAt {
                if let current = nextClearing {
                    if eta < current {
                        nextClearing = eta
                    }
                } else {
                    nextClearing = eta
                }
            }
        }
        return MoneyClockSummary(
            pendingCents: pending,
            accruingCents: accruing,
            clearedCents: cleared,
            heldCents: held,
            paidCents: paid,
            nextClearingAt: nextClearing,
            nextPayoutAt: cleared > 0 ? nextWeeklyPayout(after: now) : nil
        )
    }

    // MARK: Timeline of one post

    /// Posted, window closes, fraud check, cleared, payout: each with a timestamp and whether it has happened by `now`.
    static func postTimeline(postedAt: Date, now: Date) -> [TimelineStep] {
        let windowEnd: Date = windowEndsAt(postedAt: postedAt)
        let check: Date = FlowdCalendar.addHours(windowEnd, Double(FlowdConstants.Windows.fraudCheckMaxHours))
        let run: Date = postClearingRun(windowEnd: windowEnd)
        let pay: Date = weeklyPayoutFor(clearedAt: run)
        return [
            TimelineStep(id: "posted", label: "Posted. The 72-hour view window opens.", at: postedAt, done: postedAt <= now),
            TimelineStep(id: "window_closes", label: "View window closes. Verified views are final.", at: windowEnd, done: windowEnd <= now),
            TimelineStep(id: "fraud_check", label: "View and disclosure check finishes (within 12 hours).", at: check, done: check <= now),
            TimelineStep(id: "cleared", label: "Cleared at the daily 14:00 UTC run.", at: run, done: run <= now),
            TimelineStep(id: "paid", label: "Paid in the weekly payout (Friday 18:00 UTC).", at: pay, done: pay <= now)
        ]
    }

    // MARK: Instant cash-out

    /// Instant cash-out: fee = clamp(round(1.5% x amount), $0.50, $15). Free for Platinum and Elite (unlimited), for Gold once per ISO week, and for
    /// founding creators during their first 12 months. Weekly payouts are always free. Minimum cash-out $5.00. When `clearedCents` is given, an
    /// amount above it is refused.
    static func instantPayout(
        amountCents: Int,
        tier: Tier,
        foundingFree: Bool = false,
        freeInstantUsedThisWeek: Int = 0,
        clearedCents: Int? = nil
    ) -> InstantPayoutQuote {
        if amountCents < FlowdConstants.Fees.instantMinAmountCents {
            return InstantPayoutQuote(ok: false, refusal: .belowMinimum, feeCents: 0, netCents: 0, freeInstant: false, listFeeCents: 0)
        }
        if let cleared = clearedCents, amountCents > cleared {
            return InstantPayoutQuote(ok: false, refusal: .exceedsCleared, feeCents: 0, netCents: 0, freeInstant: false, listFeeCents: 0)
        }
        let perks: TierPerks = FlowdConstants.tierPerks(tier)
        let free: Bool = foundingFree || perks.instantCashoutUnlimited || freeInstantUsedThisWeek < perks.instantCashoutFreePerWeek
        let raw: Int = MoneyMath.clamp(
            MoneyMath.mulRate(amountCents, FlowdConstants.Fees.instantPayoutRate),
            FlowdConstants.Fees.instantPayoutMinCents,
            FlowdConstants.Fees.instantPayoutMaxCents
        )
        let fee: Int = free ? 0 : raw
        return InstantPayoutQuote(ok: true, refusal: nil, feeCents: fee, netCents: amountCents - fee, freeInstant: free, listFeeCents: raw)
    }

    /// True while a founding creator's 12 free instant cash-out months run.
    static func foundingFreeActive(founding: Bool, perksUntil: Date?, now: Date) -> Bool {
        guard founding, let until = perksUntil else {
            return false
        }
        return now < until
    }

    /// Free instant cash-outs a creator has already used in the ISO week of `now` (Gold gets one a week).
    static func freeInstantUsedThisWeek(payouts: [Payout], now: Date) -> Int {
        let week: String = FlowdCalendar.isoWeek(now)
        var count: Int = 0
        for payout in payouts {
            if payout.kind == .instant && payout.freeInstant && payout.status != .failed && payout.status != .cancelled && FlowdCalendar.isoWeek(payout.requestedAt) == week {
                count += 1
            }
        }
        return count
    }

    /// The text and numbers shown before the creator confirms an instant cash-out.
    static func instantCashOutPreview(
        amountCents: Int,
        tier: Tier,
        foundingFree: Bool = false,
        freeInstantUsedThisWeek: Int = 0,
        clearedCents: Int? = nil
    ) -> InstantCashOutPreview {
        let quote: InstantPayoutQuote = instantPayout(
            amountCents: amountCents,
            tier: tier,
            foundingFree: foundingFree,
            freeInstantUsedThisWeek: freeInstantUsedThisWeek,
            clearedCents: clearedCents
        )
        if !quote.ok {
            let summary: String
            if quote.refusal == .belowMinimum {
                summary = "The minimum instant cash-out is " + Fmt.money(FlowdConstants.Fees.instantMinAmountCents) + ". Your weekly payout is free and has no minimum."
            } else {
                summary = "That is more than you have cleared."
            }
            return InstantCashOutPreview(quote: quote, summary: summary, freeReason: nil)
        }
        if quote.freeInstant {
            let perks: TierPerks = FlowdConstants.tierPerks(tier)
            let reason: String
            if foundingFree {
                reason = "Founding creator: free instant cash-outs for 12 months"
            } else if perks.instantCashoutUnlimited {
                reason = (tier == .elite ? "Elite" : "Platinum") + ": unlimited free instant cash-outs"
            } else {
                reason = (tier == .gold ? "Gold" : "Your tier") + ": " + String(perks.instantCashoutFreePerWeek) + " free instant cash-out a week"
            }
            return InstantCashOutPreview(quote: quote, summary: "Free instant cash-out. You get " + Fmt.money(quote.netCents) + ".", freeReason: reason)
        }
        var summary: String = "Fee " + Fmt.money(quote.feeCents)
        summary += " (" + Fmt.percent(FlowdConstants.Fees.instantPayoutRate) + "). You get " + Fmt.money(quote.netCents)
        summary += ". Or wait for the free weekly payout."
        return InstantCashOutPreview(quote: quote, summary: summary, freeReason: nil)
    }

    /// Hours until the next weekly payout, rounded down: for countdown copy.
    static func hoursToNextPayout(now: Date) -> Int {
        return max(0, Int(FlowdCalendar.hoursBetween(now, nextWeeklyPayout(after: now)).rounded(.down)))
    }
}
