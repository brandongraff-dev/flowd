import Foundation

// Small, dependency-free helpers on the generated models. Anything a feature needs more than once (a tier's rank, a bounty's open spots, a
// submission's allowed actions) lives here so features never re-derive a rule and drift from the engine.

// MARK: - Tier

extension Tier: Comparable {
    /// 0 (Bronze) to 4 (Elite); `.unknown` sorts below Bronze.
    var rank: Int {
        switch self {
        case .bronze: return 0
        case .silver: return 1
        case .gold: return 2
        case .platinum: return 3
        case .elite: return 4
        case .unknown: return -1
        }
    }

    static func < (lhs: Tier, rhs: Tier) -> Bool {
        return lhs.rank < rhs.rank
    }

    /// The tier above, nil at Elite.
    var next: Tier? {
        switch self {
        case .bronze: return .silver
        case .silver: return .gold
        case .gold: return .platinum
        case .platinum: return .elite
        case .elite, .unknown: return nil
        }
    }

    /// The tier below, nil at Bronze.
    var previous: Tier? {
        switch self {
        case .silver: return .bronze
        case .gold: return .silver
        case .platinum: return .gold
        case .elite: return .platinum
        case .bronze, .unknown: return nil
        }
    }

    func atLeast(_ minimum: Tier) -> Bool {
        return rank >= minimum.rank
    }
}

// MARK: - ScoreBand

extension ScoreBand {
    /// The word that always goes beside a band: never a bare letter.
    var descriptor: String {
        switch self {
        case .a: return "Strong"
        case .b: return "Solid"
        case .c: return "Fair"
        case .d: return "Weak"
        case .e: return "Needs a rework"
        case .unknown: return "Not scored"
        }
    }

    /// 0 (A) to 4 (E). `.unknown` is worst.
    var order: Int {
        switch self {
        case .a: return 0
        case .b: return 1
        case .c: return 2
        case .d: return 3
        case .e: return 4
        case .unknown: return 5
        }
    }

    /// True when this band is at least as good as `minimum` (A is best).
    func atLeast(_ minimum: ScoreBand) -> Bool {
        return order <= minimum.order
    }

    /// The letter, as the contract writes it ("A").
    var letter: String {
        return rawValue
    }
}

// MARK: - Bounty

extension Bounty {
    /// One Reserved Slot: the per-video cap plus the fee on it (rounded half up). A submission reserves one unit.
    var reservationUnitCents: Int {
        return perVideoCapCents + MoneyMath.mulRate(perVideoCapCents, takeRate)
    }

    /// True spots left in the pool: floor(remaining / reservation unit). Never a made-up number.
    var spotsLeft: Int {
        let unit: Int = reservationUnitCents
        guard unit > 0 else {
            return 0
        }
        return max(0, remainingCents / unit)
    }

    /// Live, funded and with room for at least one more reservation.
    var acceptsSubmissions: Bool {
        return status == .live && funded && spotsLeft > 0
    }

    var paysViews: Bool {
        return cpmCents > 0
    }

    var paysConversions: Bool {
        return cpaInstallCents > 0 || cpaTrialCents > 0 || cpaPaidCents > 0
    }

    /// The pay lines for a card: `$2.10 per 1,000 views`, `+ $1.50 per trial`, `$5.00 flat`.
    var rateLines: [String] {
        var lines: [String] = []
        if cpmCents > 0 {
            lines.append(Fmt.cpm(cpmCents))
        }
        if flatFeeCents > 0 {
            lines.append(Fmt.money(flatFeeCents) + " flat")
        }
        var cpa: [String] = []
        if cpaInstallCents > 0 {
            cpa.append(Fmt.money(cpaInstallCents) + " per install")
        }
        if cpaTrialCents > 0 {
            cpa.append(Fmt.money(cpaTrialCents) + " per trial")
        }
        if cpaPaidCents > 0 {
            cpa.append(Fmt.money(cpaPaidCents) + " per paid")
        }
        for (index, line) in cpa.enumerated() {
            lines.append((index == 0 && lines.isEmpty ? "" : "+ ") + line)
        }
        return lines
    }

    /// The CPA rates as the engine reads them.
    var cpaRates: CpaRates {
        return CpaRates(install: cpaInstallCents, trial: cpaTrialCents, paid: cpaPaidCents)
    }

    /// Budget used so far, 0...1 (spent + reserved over the pool plus fee reserve).
    var usedFraction: Double {
        let total: Int = budgetCents + feeReserveCents
        guard total > 0 else {
            return 0
        }
        return min(1, max(0, Double(spentCents + reservedCents) / Double(total)))
    }
}

// MARK: - Submission

extension Submission {
    /// Waiting on the brand (QA or review).
    var isWaitingOnBrand: Bool {
        return status == .qaPending || status == .inReview
    }

    /// Still moving: anything that is not a final state.
    var isOpen: Bool {
        switch status {
        case .qaPending, .inReview, .changesRequested, .approved, .appealed:
            return true
        case .posted, .rejected, .withdrawn, .expired, .released, .unknown:
            return false
        }
    }

    /// Two revision rounds are included; the brand pays for extra rounds.
    static let includedRevisionRounds: Int = 2

    var revisionRoundsLeft: Int {
        return max(0, Submission.includedRevisionRounds - revisionRound)
    }

    /// The creator can upload the next version.
    var canRevise: Bool {
        return status == .changesRequested
    }

    /// One appeal per rejection, within 7 days of the decision.
    func canAppeal(now: Date) -> Bool {
        guard status == .rejected, let decision = decision, decision.action == .reject, !decision.appealUsed else {
            return false
        }
        return now.timeIntervalSince(decision.decidedAt) <= 7 * 86_400
    }

    var canWithdraw: Bool {
        return status == .inReview || status == .qaPending || status == .changesRequested || status == .approved
    }

    /// Approved and not posted yet: the creator can post and attach the URL.
    var canPost: Bool {
        return status == .approved && postId == nil
    }
}

// MARK: - Post

extension Post {
    /// The 72-hour window is still open at `now`.
    func isWindowOpen(now: Date) -> Bool {
        return status == .live && now < windowEndsAt
    }

    /// 0...1 progress through the 72-hour window.
    func windowProgress(now: Date) -> Double {
        let total: TimeInterval = windowEndsAt.timeIntervalSince(postedAt)
        guard total > 0 else {
            return 1
        }
        return min(1, max(0, now.timeIntervalSince(postedAt) / total))
    }

    /// Share of the per-video cap used, 0...1 (capRemaining is stored on the earnings).
    var capReachedFraction: Double {
        let used: Int = earnings.totalCents - earnings.commissionCents
        let cap: Int = used + earnings.capRemainingCents
        guard cap > 0 else {
            return 0
        }
        return min(1, max(0, Double(used) / Double(cap)))
    }

    /// The first line of the caption, without the disclosure hashtags (for lists).
    var title: String {
        let firstLine: String = caption.split(separator: "\n", omittingEmptySubsequences: true).map(String.init).dropFirst().first ?? caption
        return firstLine
    }
}

// MARK: - Money Clock

extension MoneyClockRow {
    /// The Money Clock shows accruing and pending together as Pending.
    var isPendingLike: Bool {
        return state == .accruing || state == .pending
    }

    var isHeld: Bool {
        return state == .held
    }
}

extension MoneyClockState {
    /// What the UI calls this state: accruing and pending read as "Pending".
    var uiTitle: String {
        switch self {
        case .accruing, .pending: return "Pending"
        case .cleared: return "Cleared"
        case .paid: return "Paid"
        case .held: return "Held"
        case .reversed: return "Reversed"
        case .unknown: return "Unknown"
        }
    }
}

// MARK: - Notification categories

/// The seven notification categories of `notification_prefs.categories`.
enum NotificationCategory: String, Codable, Hashable, Sendable, CaseIterable {
    case money
    case reviews
    case drop
    case offers
    case tournaments
    case tips
    case safety

    var title: String {
        switch self {
        case .money: return "Money"
        case .reviews: return "Reviews"
        case .drop: return "Daily Drop"
        case .offers: return "Offers"
        case .tournaments: return "Tournaments"
        case .tips: return "Tips"
        case .safety: return "Safety"
        }
    }

    /// True for the categories that are never batched into quiet hours (cash events always reach you; the rest wait).
    var isCash: Bool {
        return self == .money
    }
}

extension NotificationKind {
    /// Which preference toggle governs this kind of notification.
    var category: NotificationCategory {
        switch self {
        case .cashEvent, .payoutCleared, .payoutPaid, .payoutHeld, .taxInfoNeeded, .fundingNeeded:
            return .money
        case .approval, .changesRequested, .rejection, .appealDecided, .reviewWaiting, .reviewSlaWarning, .postLive, .viewsMilestone, .disputeUpdate:
            return .reviews
        case .dropLive, .dropReminder:
            return .drop
        case .offerReceived, .offerCountered, .offerAccepted:
            return .offers
        case .tournamentUpdate, .crewInvite:
            return .tournaments
        case .scamWarning:
            return .safety
        case .tierUp, .streakMilestone, .streakFreezeUsed, .rightsExpiring, .rightsRenewed, .fatigueAlert, .bountyFilled, .bountyFunded,
             .autoApprovePaused, .adLive, .floTip, .academyBadge, .referralJoined, .systemNotice, .unknown:
            return .tips
        }
    }
}

// MARK: - Creator

extension Creator {
    /// Free instant cash-outs for founding creators run for 12 months.
    func foundingFreeActive(now: Date) -> Bool {
        guard founding, let until = foundingPerksUntil else {
            return false
        }
        return now < until
    }

    var handleLabel: String {
        return Fmt.handle(handle)
    }

    /// The public share link.
    var storefrontURL: String {
        return "joinflowd.io/c/" + handle
    }
}

// MARK: - Offer

extension Offer {
    /// The ball is in the creator's court.
    var awaitingCreator: Bool {
        return status == .awaitingCreator
    }

    var isOpen: Bool {
        return status == .awaitingCreator || status == .awaitingBrand
    }

    /// Up to three counter rounds.
    var counterRoundsLeft: Int {
        return max(0, FlowdConstants.Windows.maxCounterRounds - rounds)
    }
}

// MARK: - Dates in fixtures

extension Date {
    /// `2026-10-03T14:00:00Z`.
    var isoString: String {
        return FlowdDates.string(from: self)
    }
}
