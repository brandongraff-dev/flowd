import Foundation

// Tiers: Bronze, Silver, Gold, Platinum, Elite. Earned, shown everywhere, never bought. Mirrors apps/web/src/lib/engine/tiers.ts and the contract's
// FORMULAS (tier, progress and grace).
//
// A creator holds the highest tier whose thresholds are ALL met: lifetime cleared, approved posts, approval rate (approved / finished), reliability
// (Platinum and up) and a manual review (Elite). Progress to the next tier is the bottleneck: the lowest min(1, have / need) over the numeric
// criteria. There is no tier drop for 30 days after a dip (grace hold), and pausing preserves tier.

/// What the thresholds read about a creator.
struct TierStats: Codable, Hashable, Sendable {
    var lifetimeClearedCents: Int
    var approvedCount: Int
    /// approved / finished, 0 to 1. See `TierEngine.approvalRate`.
    var approvalRate: Double
    var reliabilityScore: Int
    /// Elite needs a manual review by flowd on top of the numbers.
    var eliteReviewed: Bool

    init(lifetimeClearedCents: Int, approvedCount: Int, approvalRate: Double, reliabilityScore: Int, eliteReviewed: Bool = false) {
        self.lifetimeClearedCents = lifetimeClearedCents
        self.approvedCount = approvedCount
        self.approvalRate = approvalRate
        self.reliabilityScore = reliabilityScore
        self.eliteReviewed = eliteReviewed
    }

    /// The stats of a creator row (carry-over already included in the row's own counters).
    init(creator: Creator) {
        self.init(
            lifetimeClearedCents: creator.lifetimeClearedCents,
            approvedCount: creator.approvedCount,
            approvalRate: creator.approvalRate,
            reliabilityScore: creator.reliabilityScore,
            eliteReviewed: creator.tierReview != nil
        )
    }
}

/// What is missing for the next tier, in words: the progress ring's list.
struct TierRemaining: Codable, Hashable, Identifiable, Sendable {
    var key: String
    var label: String
    var have: Double
    var need: Double
    var met: Bool
    /// How much is left, in the criterion's own unit (cents, posts, ratio points, score points, 0 or 1 for the review). 0 when met.
    var remaining: Double
    /// "$360.00 more cleared", "4 more approved posts", "Approval rate 75% (you: 70%)". Empty when met.
    var text: String

    var id: String {
        return key
    }
}

/// The result of re-evaluating a creator's tier.
struct TierEvaluation: Hashable, Sendable {
    var tier: Tier
    var tierBasis: TierBasis
    /// Set during a grace hold: no tier drop before this.
    var tierHoldUntil: Date?
    /// When the dip started (kept so the hold can be recomputed). Set during a hold.
    var dipStartedAt: Date?
    /// What changed since the last evaluation, for the tier history and notifications.
    var event: TierEventKind?
    /// The tier the numbers support right now.
    var computedTier: Tier
}

enum TierEngine {
    /// approved / decided (finished work only: approved + rejected; withdrawn and expired excluded), rounded to 2 decimals. 0 with nothing decided.
    static func approvalRate(approved: Int, decided: Int) -> Double {
        guard decided > 0 else {
            return 0
        }
        return Double(MoneyMath.roundHalfUp(Double(approved) / Double(decided) * 100)) / 100
    }

    /// True when every threshold of `tier` is met.
    static func meetsTier(_ tier: Tier, _ s: TierStats) -> Bool {
        let t: TierThresholds = FlowdConstants.tierThresholds(tier)
        return s.lifetimeClearedCents >= t.lifetimeClearedCents
            && s.approvedCount >= t.approvedCount
            && s.approvalRate >= t.approvalRateMin
            && s.reliabilityScore >= t.reliabilityMin
            && (!t.manualReview || s.eliteReviewed)
    }

    /// The highest tier whose thresholds are all met.
    static func tierFor(_ s: TierStats) -> Tier {
        var best: Tier = .bronze
        for tier in FlowdConstants.tierOrder {
            if meetsTier(tier, s) {
                best = tier
            }
        }
        return best
    }

    /// Founding creators' verified prior history counts toward the thresholds: carry-over cleared money and approved and decided counts are added to
    /// what the ledger shows. Approval rate is recomputed on the combined finished work.
    static func withCarryOver(
        lifetimeClearedCents: Int,
        approvedCount: Int,
        decidedCount: Int,
        reliabilityScore: Int,
        eliteReviewed: Bool = false,
        carry: CarryOver?
    ) -> TierStats {
        let approved: Int = approvedCount + (carry?.approvedCount ?? 0)
        let decided: Int = decidedCount + (carry?.decidedCount ?? 0)
        return TierStats(
            lifetimeClearedCents: lifetimeClearedCents + (carry?.clearedCents ?? 0),
            approvedCount: approved,
            approvalRate: approvalRate(approved: approved, decided: decided),
            reliabilityScore: reliabilityScore,
            eliteReviewed: eliteReviewed
        )
    }

    /// Progress toward the next tier: every criterion with have / need, and progress = the bottleneck (the lowest min(1, have/need) over the numeric
    /// criteria, rounded to 2 decimals). At Elite, progress is 1 and there are no criteria.
    static func progress(_ s: TierStats, current: Tier? = nil) -> TierProgress {
        let now: Tier = current ?? tierFor(s)
        guard let next = now.next else {
            return TierProgress(current: now, next: nil, criteria: [], progress: 1)
        }
        let t: TierThresholds = FlowdConstants.tierThresholds(next)
        var criteria: [TierCriterion] = [
            TierCriterion(key: "lifetime_cleared", label: "Lifetime cleared", have: Double(s.lifetimeClearedCents), need: Double(t.lifetimeClearedCents), met: s.lifetimeClearedCents >= t.lifetimeClearedCents),
            TierCriterion(key: "approved", label: "Approved posts", have: Double(s.approvedCount), need: Double(t.approvedCount), met: s.approvedCount >= t.approvedCount),
            TierCriterion(key: "approval_rate", label: "Approval rate", have: s.approvalRate, need: t.approvalRateMin, met: s.approvalRate >= t.approvalRateMin)
        ]
        if t.reliabilityMin > 0 {
            criteria.append(TierCriterion(key: "reliability", label: "Reliability", have: Double(s.reliabilityScore), need: Double(t.reliabilityMin), met: s.reliabilityScore >= t.reliabilityMin))
        }
        if t.manualReview {
            criteria.append(TierCriterion(key: "review", label: "Manual review", have: s.eliteReviewed ? 1 : 0, need: 1, met: s.eliteReviewed))
        }
        let numeric: [TierCriterion] = criteria.filter { (c: TierCriterion) -> Bool in
            return c.key != "review"
        }
        var lowest: Double = 1
        for c in numeric {
            let ratio: Double = c.need > 0 ? MoneyMath.clamp(c.have / c.need, 0, 1) : 1
            lowest = min(lowest, ratio)
        }
        return TierProgress(current: now, next: next, criteria: criteria, progress: MoneyMath.round2(lowest))
    }

    /// What is missing for the next tier, in words. Met criteria are included with empty text.
    static func remainingToNext(_ s: TierStats, current: Tier? = nil) -> [TierRemaining] {
        let p: TierProgress = progress(s, current: current)
        return p.criteria.map { (c: TierCriterion) -> TierRemaining in
            var remaining: Double = 0
            var text: String = ""
            if !c.met {
                remaining = c.key == "approval_rate" ? MoneyMath.round2(c.need - c.have) : c.need - c.have
                switch c.key {
                case "lifetime_cleared":
                    text = Fmt.money(Int(remaining.rounded())) + " more cleared"
                case "approved":
                    let n: Int = Int(remaining.rounded())
                    text = String(n) + " more approved post" + (n == 1 ? "" : "s")
                case "approval_rate":
                    text = "Approval rate " + Fmt.percent(c.need, digits: 0) + " (you: " + Fmt.percent(c.have, digits: 0) + ")"
                case "reliability":
                    text = "Reliability " + String(Int(c.need)) + " (you: " + String(Int(c.have)) + ")"
                default:
                    text = "A short manual review by flowd"
                }
            }
            return TierRemaining(key: c.key, label: c.label, have: c.have, need: c.need, met: c.met, remaining: remaining, text: text)
        }
    }

    // MARK: Perks

    /// The perks of a tier in plain English, one line each. Only the perks the tier actually has.
    static func perkLines(_ tier: Tier) -> [String] {
        let p: TierPerks = FlowdConstants.tierPerks(tier)
        var out: [String] = []
        if p.earlyAccessHours > 0 {
            out.append(String(p.earlyAccessHours) + "-hour head start on new bounties")
        }
        if p.rateCard {
            out.append("Your own rate card")
        }
        if p.instantCashoutUnlimited {
            out.append("Unlimited free instant cash-outs")
        } else if p.instantCashoutFreePerWeek > 0 {
            out.append(String(p.instantCashoutFreePerWeek) + " free instant cash-out a week")
        }
        if p.crewsLead {
            out.append("Lead a crew")
        }
        if p.auctions {
            out.append("Run sealed-bid auctions")
        }
        if p.featuredProfile {
            out.append("Featured on the creator directory")
        }
        return out
    }

    /// What a creator gains by reaching the next tier: the lines that are new or better. Empty at Elite.
    static func whatUnlocksNext(_ current: Tier) -> [String] {
        guard let next = current.next else {
            return []
        }
        let a: TierPerks = FlowdConstants.tierPerks(current)
        let b: TierPerks = FlowdConstants.tierPerks(next)
        var out: [String] = []
        if b.earlyAccessHours > a.earlyAccessHours {
            if a.earlyAccessHours > 0 {
                out.append("Head start grows from " + String(a.earlyAccessHours) + " h to " + String(b.earlyAccessHours) + " h")
            } else {
                out.append(String(b.earlyAccessHours) + "-hour head start on new bounties")
            }
        }
        if b.rateCard && !a.rateCard {
            out.append("Your own rate card")
        }
        if b.instantCashoutUnlimited && !a.instantCashoutUnlimited {
            out.append("Unlimited free instant cash-outs")
        } else if b.instantCashoutFreePerWeek > a.instantCashoutFreePerWeek {
            out.append(String(b.instantCashoutFreePerWeek) + " free instant cash-out a week")
        }
        if b.crewsLead && !a.crewsLead {
            out.append("Lead a crew")
        }
        if b.auctions && !a.auctions {
            out.append("Run sealed-bid auctions")
        }
        if b.featuredProfile && !a.featuredProfile {
            out.append("Featured on the creator directory")
        }
        return out
    }

    /// When a tier first sees a bounty that goes live at `releaseAt`: release minus the tier's head start. Bronze sees it at release.
    static func earlyAccessAt(releaseAt: Date, tier: Tier) -> Date {
        return FlowdCalendar.addHours(releaseAt, -Double(FlowdConstants.tierPerks(tier).earlyAccessHours))
    }

    /// True when a creator of `tier` can already see a bounty released at `releaseAt`.
    static func canSeeBounty(releaseAt: Date, tier: Tier, now: Date) -> Bool {
        return now >= earlyAccessAt(releaseAt: releaseAt, tier: tier)
    }

    // MARK: Grace: no tier drop for 30 days after a dip

    /// Re-evaluates a creator's tier.
    ///  - The numbers support the held tier or higher: the creator holds the earned tier (event `promoted` when higher, `holdCleared` when they
    ///    recovered during a grace hold).
    ///  - The numbers dipped below the held tier: a 30-day grace hold starts (event `holdStarted`); the held tier is kept until `tierHoldUntil`.
    ///    After the hold, the tier drops to what the numbers support (event `demoted`).
    ///  - A paused creator keeps their tier untouched.
    static func evaluate(
        stats: TierStats,
        heldTier: Tier,
        heldBasis: TierBasis = .earned,
        dipStartedAt: Date? = nil,
        now: Date,
        paused: Bool = false
    ) -> TierEvaluation {
        let computed: Tier = tierFor(stats)
        let graceHours: Double = Double(FlowdConstants.Tiers.demotionGraceDays * 24)
        if paused {
            var held: TierEvaluation = TierEvaluation(tier: heldTier, tierBasis: heldBasis, tierHoldUntil: nil, dipStartedAt: nil, event: nil, computedTier: computed)
            if let dip = dipStartedAt {
                held.dipStartedAt = dip
                held.tierHoldUntil = FlowdCalendar.addHours(dip, graceHours)
            }
            return held
        }
        if computed.rank >= heldTier.rank {
            let event: TierEventKind?
            if computed.rank > heldTier.rank {
                event = .promoted
            } else if heldBasis == .graceHold {
                event = .holdCleared
            } else {
                event = nil
            }
            return TierEvaluation(tier: computed, tierBasis: .earned, tierHoldUntil: nil, dipStartedAt: nil, event: event, computedTier: computed)
        }
        let dipStart: Date = dipStartedAt ?? now
        let holdUntil: Date = FlowdCalendar.addHours(dipStart, graceHours)
        if now < holdUntil {
            return TierEvaluation(
                tier: heldTier,
                tierBasis: .graceHold,
                tierHoldUntil: holdUntil,
                dipStartedAt: dipStart,
                event: heldBasis == .graceHold ? nil : .holdStarted,
                computedTier: computed
            )
        }
        return TierEvaluation(tier: computed, tierBasis: .earned, tierHoldUntil: nil, dipStartedAt: nil, event: .demoted, computedTier: computed)
    }

    /// The reference form of the grace rule: a creator whose computed tier is below their held tier keeps it until dip start + 30 days.
    static func tierWithGrace(heldTier: Tier, computedTier: Tier, dipStartedAt: Date, now: Date) -> (tier: Tier, basis: TierBasis, holdUntil: Date?) {
        if computedTier.rank >= heldTier.rank {
            return (computedTier, .earned, nil)
        }
        let holdUntil: Date = FlowdCalendar.addHours(dipStartedAt, Double(FlowdConstants.Tiers.demotionGraceDays * 24))
        if now < holdUntil {
            return (heldTier, .graceHold, holdUntil)
        }
        return (computedTier, .earned, nil)
    }

    /// Days left in a grace hold, rounded up. 0 once it has ended.
    static func graceDaysLeft(holdUntil: Date, now: Date) -> Int {
        return max(0, Int((holdUntil.timeIntervalSince(now) / 86_400).rounded(.up)))
    }
}
