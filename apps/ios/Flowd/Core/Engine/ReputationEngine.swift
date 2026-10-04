import Foundation

// Reliability for creators (finished work only, recency-weighted) and Brand Scorecards, plus the review SLA clock. Mirrors
// apps/web/src/lib/engine/reputation.ts and the contract's FORMULAS (creator reliability, brand reliability, review SLA).

/// One finished decision on a creator's work.
struct FinishedDecision: Hashable, Sendable {
    var approved: Bool
    var decidedAt: Date
}

struct CreatorReliabilityResult: Codable, Hashable, Sendable {
    var score: Int
    /// Fewer than 5 finished decisions: shown as "Building history", never a verdict.
    var provisional: Bool
    var finishedN: Int
    var components: [ReliabilityComponent]
    var academyBonusPoints: Double
    var approvalRateFinished: Double
    var approvalRateRaw: Double
}

struct BrandReliabilityResult: Codable, Hashable, Sendable {
    var score: Int
    var band: BrandBand
    var components: [ReliabilityComponent]
    var rejectionRate: Double
}

/// The countdown shown on every submission to both sides. Amber at 48 h, breached at 72 h.
struct ReviewClock: Codable, Hashable, Sendable {
    var state: SlaState
    var dueAt: Date
    var hoursInQueue: Double
    /// Hours until the deadline; negative once it has passed.
    var hoursLeft: Double
    /// True once the SLA is breached: escalate to the owner and the SLA desk.
    var escalate: Bool
    /// "Decide by Fri 2:00 PM UTC" or "Overdue by 5 h".
    var label: String
}

enum ReputationEngine {
    // MARK: Creator reliability

    /// Creator reliability 0 to 100 from finished work only (never penalises multi-brand work or pending samples). Recency half-life 45 days. Fewer
    /// than 5 finished decisions is provisional (70).
    static func creatorReliability(
        decisions: [FinishedDecision],
        now: Date,
        onTimeOk: Int,
        onTimeTotal: Int,
        postThroughPosted: Int,
        postThroughApproved: Int,
        compliancePassed: Int,
        complianceTotal: Int,
        fraudConfirmed90d: Int,
        clawbacks90d: Int,
        disputesLost90d: Int,
        academyLessons: Int
    ) -> CreatorReliabilityResult {
        let halfLife: Double = Double(FlowdConstants.Reliability.Creator.recencyHalfLifeDays)
        func weight(_ d: FinishedDecision) -> Double {
            return pow(0.5, now.timeIntervalSince(d.decidedAt) / 86_400 / halfLife)
        }
        var sumW: Double = 0
        var approvedW: Double = 0
        for d in decisions {
            let w: Double = weight(d)
            sumW += w
            if d.approved {
                approvedW += w
            }
        }
        let finishedN: Int = decisions.count
        func ratio(_ ok: Int, _ total: Int) -> Double {
            return total > 0 ? Double(ok) / Double(total) : 1
        }
        let finishedApproval: Double = sumW > 0 ? approvedW / sumW : 0
        let onTime: Double = ratio(onTimeOk, onTimeTotal)
        let postThrough: Double = ratio(postThroughPosted, postThroughApproved)
        let compliance: Double = ratio(compliancePassed, complianceTotal)
        let cleanRecord: Double = MoneyMath.clamp(1 - 0.4 * Double(fraudConfirmed90d) - 0.3 * Double(clawbacks90d) - 0.15 * Double(disputesLost90d), 0, 1)

        let rows: [(key: String, label: String, value: Double, weight: Double, reason: String)] = [
            (
                "finished_approval",
                "Finished-work approval (recency-weighted)",
                finishedApproval,
                FlowdConstants.Reliability.Creator.Weights.finishedApproval,
                String(Int((finishedApproval * 100).rounded())) + "% of " + String(finishedN) + " finished posts approved, recent ones count more."
            ),
            (
                "on_time",
                "Revisions and deadlines on time",
                onTime,
                FlowdConstants.Reliability.Creator.Weights.onTime,
                String(onTimeOk) + " of " + String(onTimeTotal) + " on time."
            ),
            (
                "post_through",
                "Approved videos posted within 7 days",
                postThrough,
                FlowdConstants.Reliability.Creator.Weights.postThrough,
                String(postThroughPosted) + " of " + String(postThroughApproved) + " approved videos posted within " + String(FlowdConstants.Reliability.Creator.postThroughDays) + " days."
            ),
            (
                "compliance",
                "Disclosure right first time",
                compliance,
                FlowdConstants.Reliability.Creator.Weights.compliance,
                String(compliancePassed) + " of " + String(complianceTotal) + " posts passed the disclosure check first time."
            ),
            (
                "clean_record",
                "Clean record (90 days)",
                cleanRecord,
                FlowdConstants.Reliability.Creator.Weights.cleanRecord,
                String(fraudConfirmed90d) + " confirmed fraud, " + String(clawbacks90d) + " clawbacks, " + String(disputesLost90d) + " lost disputes."
            )
        ]
        var components: [ReliabilityComponent] = []
        var base: Double = 0
        for row in rows {
            components.append(ReliabilityComponent(
                key: row.key,
                label: row.label,
                value: MoneyMath.round2(row.value),
                weight: row.weight,
                points: MoneyMath.round2(100 * row.weight * row.value),
                reason: row.reason
            ))
            base += 100 * row.weight * row.value
        }
        let academyBonus: Double = Swift.min(Double(FlowdConstants.Reliability.Creator.academyBonusCap), FlowdConstants.Reliability.Creator.academyBonusPerLesson * Double(academyLessons))
        let provisional: Bool = finishedN < FlowdConstants.Reliability.Creator.minFinishedForScore
        let score: Int = provisional ? FlowdConstants.Reliability.Creator.provisionalScore : Swift.min(100, MoneyMath.roundHalfUp(base + academyBonus))
        let approvedCount: Int = decisions.filter { (d: FinishedDecision) -> Bool in
            return d.approved
        }.count
        return CreatorReliabilityResult(
            score: score,
            provisional: provisional,
            finishedN: finishedN,
            components: components,
            academyBonusPoints: academyBonus,
            approvalRateFinished: MoneyMath.round2(finishedApproval),
            approvalRateRaw: MoneyMath.round2(Double(approvedCount) / Double(Swift.max(1, finishedN)))
        )
    }

    // MARK: Brand reliability

    /// Brand reliability 0 to 100 (the Brand Scorecard). Decisions are approvals and rejections (request-changes excluded). Fewer than 10 decisions
    /// is the band "new": shown as "New brand", never a misleading figure.
    static func brandReliability(
        decisionsN: Int,
        approvedN: Int,
        decisionHoursMedian: Double,
        appealsOverturned: Int,
        paysOnTimeRatio: Double,
        runRate: Double,
        replyHoursMedian: Double
    ) -> BrandReliabilityResult {
        let rejectedN: Int = decisionsN - approvedN
        let rejectionRate: Double = decisionsN > 0 ? Double(rejectedN) / Double(decisionsN) : 0
        let best: Double = Double(FlowdConstants.Reliability.Brand.decisionBestHours)
        let worst: Double = Double(FlowdConstants.Reliability.Brand.decisionWorstHours)
        let decisionSpeed: Double = MoneyMath.clamp((worst - decisionHoursMedian) / (worst - best), 0, 1)
        let freePass: Double = FlowdConstants.Reliability.Brand.rejectionRateFreePass
        let zeroAt: Double = FlowdConstants.Reliability.Brand.rejectionRateZeroAt
        let base: Double = MoneyMath.clamp(1 - (rejectionRate - freePass) / (zeroAt - freePass), 0, 1)
        let overturnShare: Double = Double(appealsOverturned) / Double(Swift.max(1, rejectedN))
        let approvalFairness: Double = MoneyMath.clamp(base - 0.5 * overturnShare, 0, 1)
        let replyBest: Double = Double(FlowdConstants.Reliability.Brand.replyBestHours)
        let replyWorst: Double = Double(FlowdConstants.Reliability.Brand.replyWorstHours)
        let replySpeed: Double = MoneyMath.clamp((replyWorst - replyHoursMedian) / (replyWorst - replyBest), 0, 1)

        let rows: [(key: String, label: String, value: Double, weight: Double, reason: String)] = [
            (
                "decision_speed",
                "Decision speed",
                decisionSpeed,
                FlowdConstants.Reliability.Brand.Weights.decisionSpeed,
                "Median " + Fmt.decimal(decisionHoursMedian) + " h to decide (best " + String(FlowdConstants.Reliability.Brand.decisionBestHours) + " h, worst " + String(FlowdConstants.Reliability.Brand.decisionWorstHours) + " h)."
            ),
            (
                "approval_fairness",
                "Approval fairness",
                approvalFairness,
                FlowdConstants.Reliability.Brand.Weights.approvalFairness,
                String(Int((rejectionRate * 100).rounded())) + "% of decisions were rejections; " + String(appealsOverturned) + " overturned on appeal."
            ),
            (
                "pays_on_time",
                "Pays on time",
                paysOnTimeRatio,
                FlowdConstants.Reliability.Brand.Weights.paysOnTime,
                String(Int((paysOnTimeRatio * 100).rounded())) + "% of commissions, offers and top-ups funded on time."
            ),
            (
                "run_rate",
                "Runs what it approves",
                runRate,
                FlowdConstants.Reliability.Brand.Weights.runRate,
                String(Int((runRate * 100).rounded())) + "% of approved work was posted or used within 30 days."
            ),
            (
                "reply_speed",
                "Reply speed",
                replySpeed,
                FlowdConstants.Reliability.Brand.Weights.replySpeed,
                "Median " + Fmt.decimal(replyHoursMedian) + " h to reply."
            )
        ]
        var components: [ReliabilityComponent] = []
        var total: Double = 0
        for row in rows {
            components.append(ReliabilityComponent(
                key: row.key,
                label: row.label,
                value: MoneyMath.round2(row.value),
                weight: row.weight,
                points: MoneyMath.round2(100 * row.weight * row.value),
                reason: row.reason
            ))
            total += 100 * row.weight * row.value
        }
        let score: Int = MoneyMath.roundHalfUp(total)
        let band: BrandBand
        if decisionsN < FlowdConstants.Reliability.Brand.minDecisionsForScore {
            band = .new
        } else if score >= FlowdConstants.Reliability.Brand.Bands.excellent {
            band = .excellent
        } else if score >= FlowdConstants.Reliability.Brand.Bands.good {
            band = .good
        } else if score >= FlowdConstants.Reliability.Brand.Bands.fair {
            band = .fair
        } else {
            band = .poor
        }
        return BrandReliabilityResult(score: score, band: band, components: components, rejectionRate: MoneyMath.round2(rejectionRate))
    }

    /// "New brand", "Excellent", ... : the label beside a Brand Scorecard band.
    static func brandBandLabel(_ band: BrandBand) -> String {
        switch band {
        case .new: return "New brand"
        case .excellent: return "Excellent"
        case .good: return "Good"
        case .fair: return "Fair"
        case .poor: return "Poor"
        case .unknown: return "Not rated"
        }
    }

    /// "Decides in about 11 h": the line on a bounty card. Nil for a new brand, which has no honest figure yet.
    static func decidesInAbout(band: BrandBand, decisionHoursMedian: Double) -> String? {
        if band == .new {
            return nil
        }
        return "Decides in about " + Fmt.hours(decisionHoursMedian)
    }

    // MARK: Review SLA

    /// Position in the 72 h review SLA by hours since the current version entered review.
    static func slaState(hoursInQueue: Double, decided: Bool = false, slaHours: Int = FlowdConstants.Review.slaHours) -> SlaState {
        let staleAfter: Double = Double(slaHours * FlowdConstants.Review.staleAfterHours) / Double(FlowdConstants.Review.slaHours)
        if decided {
            return hoursInQueue <= Double(slaHours) ? .met : .breached
        }
        if hoursInQueue < staleAfter {
            return .onTrack
        }
        return hoursInQueue <= Double(slaHours) ? .stale : .breached
    }

    /// When the current version must be decided: entered review + 72 h.
    static func slaDueAt(enteredReviewAt: Date, slaHours: Int = FlowdConstants.Review.slaHours) -> Date {
        return FlowdCalendar.addHours(enteredReviewAt, Double(slaHours))
    }

    /// The countdown shown on every submission to both sides.
    static func reviewClock(enteredReviewAt: Date, now: Date, slaHours: Int = FlowdConstants.Review.slaHours, timeZone: TimeZone? = nil) -> ReviewClock {
        let hoursInQueue: Double = FlowdCalendar.hoursBetween(enteredReviewAt, now)
        let due: Date = slaDueAt(enteredReviewAt: enteredReviewAt, slaHours: slaHours)
        let hoursLeft: Double = Double(slaHours) - hoursInQueue
        let state: SlaState = slaState(hoursInQueue: hoursInQueue, decided: false, slaHours: slaHours)
        let label: String
        if hoursLeft >= 0 {
            if let zone = timeZone {
                label = "Decides by " + Fmt.clockLabel(due, timeZone: zone)
            } else {
                label = "Decide by " + Fmt.clockLabelUTC(due)
            }
        } else {
            label = "Overdue by " + Fmt.hours(-hoursLeft)
        }
        return ReviewClock(state: state, dueAt: due, hoursInQueue: hoursInQueue, hoursLeft: hoursLeft, escalate: state == .breached, label: label)
    }
}
