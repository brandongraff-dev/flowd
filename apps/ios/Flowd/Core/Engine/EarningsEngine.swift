import Foundation

// Expected earnings (Pay Math), typical-vs-top copy, the income calendar and the Tax Desk numbers. Mirrors
// apps/web/src/lib/engine/earnings.ts and the contract's FORMULAS (expected earnings).
//
// Everything here is an ESTIMATE and is labelled that way. The typical (median) is always shown beside any top-earner figure; there is no
// "guaranteed income" anywhere. Tracked conversions follow the funnel defaults: 0.45% of views visit, 38% of visits install, 6.2% of installs
// start a trial, 34.8% of trials pay.

/// Expected pay for one video at one view quantile.
struct EarningsEstimatePoint: Codable, Hashable, Sendable {
    var views: Int
    /// Expected tracked installs, trials and paid at these views (fractional: they are expectations).
    var installs: Double
    var trials: Double
    var paid: Double
    var cpmPayCents: Int
    var cpaPayCents: Int
    /// min(cap, CPM pay + CPA pay).
    var payCents: Int
    /// True when the per-video cap limits the estimate.
    var capped: Bool
}

/// p25 / median / p75 expected pay for one video.
struct ExpectedEarnings: Codable, Hashable, Sendable {
    var p25: EarningsEstimatePoint
    var median: EarningsEstimatePoint
    var p75: EarningsEstimatePoint
}

/// The Tax Desk numbers: year-to-date earnings, a set-aside estimate and progress to the 1099-NEC threshold. "Not tax advice."
struct TaxDeskNumbers: Codable, Hashable, Sendable {
    var ytdClearedCents: Int
    /// What to set aside, an estimate at the chosen rate (default 25%).
    var setAsideCents: Int
    var setAsideRate: Double
    /// The 1099-NEC threshold for 2026 payments ($2,000).
    var thresholdCents: Int
    /// Progress toward the threshold, 0 to 1 (capped).
    var progressToThreshold: Double
    var remainingToThresholdCents: Int
    var overThreshold: Bool
    var disclaimer: String
}

/// An earning row reduced to what the income calendar needs.
struct CalendarRow: Hashable, Sendable {
    var amountCents: Int
    var state: MoneyClockState
    /// The next date it moves: the clearing run for accruing and pending, the payout for cleared.
    var etaAt: Date?
    /// True while accruing: the amount is a live estimate.
    var estimated: Bool

    init(amountCents: Int, state: MoneyClockState, etaAt: Date? = nil, estimated: Bool = false) {
        self.amountCents = amountCents
        self.state = state
        self.etaAt = etaAt
        self.estimated = estimated
    }
}

struct CalendarDay: Codable, Hashable, Identifiable, Sendable {
    /// "2026-10-10".
    var date: String
    /// "Sat Oct 10".
    var label: String
    /// Money clearing at the 14:00 UTC run that day.
    var clearsCents: Int
    /// Money paying out that day (Friday 18:00 UTC).
    var paysCents: Int
    /// How much of the day's flows are estimates (still accruing).
    var estimatedCents: Int

    var id: String {
        return date
    }
}

struct IncomeCalendar: Codable, Hashable, Sendable {
    /// Only days with something happening, soonest first.
    var days: [CalendarDay]
    /// The next weekly payout and what it will carry (everything cleared by then).
    var nextPayoutAt: Date?
    var nextPayoutCents: Int
    /// Pending money that will clear inside the horizon.
    var toClearCents: Int
    /// Everything that will have paid out by the end of the horizon.
    var toPayCents: Int
    /// Held money: it has no date, only a named next step.
    var heldCents: Int
}

enum EarningsEngine {
    static let disclaimer: String = "Results vary. Based on creators' cleared earnings; not a guarantee."

    /// Expected pay per video at the three view quantiles. Views at the median are the creator's own 28-day median (or the category median for a new
    /// creator); p25 = 0.40x and p75 = 2.55x. pay = min(cap, round(views x cpm / 1000) + round(installs x r_i + trials x r_t + paid x r_p)).
    /// Always labelled "estimate"; the cap applies.
    static func expectedEarnings(
        baseMedianViews: Int,
        cpmCents: Int,
        rates: CpaRates = CpaRates(),
        perVideoCapCents: Int,
        funnel: FunnelAssumptions = FunnelAssumptions.defaults
    ) -> ExpectedEarnings {
        func point(_ ratio: Double) -> EarningsEstimatePoint {
            let views: Int = MoneyMath.roundHalfUp(Double(baseMedianViews) * ratio)
            let installs: Double = Double(views) * funnel.viewToVisit * funnel.visitToInstall
            let trials: Double = installs * funnel.installToTrial
            let paid: Double = trials * funnel.trialToPaid
            let cpmPay: Int = MoneyMath.roundHalfUp(Double(views * cpmCents) / 1000)
            let cpaRaw: Double = installs * Double(rates.install) + trials * Double(rates.trial) + paid * Double(rates.paid)
            let cpaPay: Int = MoneyMath.roundHalfUp(cpaRaw)
            let gross: Int = cpmPay + cpaPay
            return EarningsEstimatePoint(
                views: views,
                installs: MoneyMath.round2(installs),
                trials: MoneyMath.round2(trials),
                paid: MoneyMath.round2(paid),
                cpmPayCents: cpmPay,
                cpaPayCents: cpaPay,
                payCents: min(gross, perVideoCapCents),
                capped: gross > perVideoCapCents
            )
        }
        return ExpectedEarnings(
            p25: point(funnel.quantileP25),
            median: point(funnel.quantileMedian),
            p75: point(funnel.quantileP75)
        )
    }

    /// Predicted views for a take: the creator's median views x the Flow Score band multiplier (A 1.6, B 1.15, C 0.85, D 0.5, E 0.3).
    static func predictedViews(medianViews: Int, band: ScoreBand) -> Int {
        return MoneyMath.roundHalfUp(Double(medianViews) * FlowdConstants.bandViewMultiplier(band))
    }

    /// Pay Math for a bounty, in the shape the contract stores. The take rate is the bounty's own when `takeRate` is given. A flat fee (direct
    /// bounty) is paid on top of any view pay, sits outside the per-video cap, and is the whole pay when the bounty has no CPM.
    ///   creator CPM = round(median pay / median views x 1,000)
    ///   all-in CPM  = round(creator CPM x (1 + take rate) x 1.029); for a flat fee: round(median pay x (1 + take) x 1.029 x 1,000 / median views)
    static func payMath(
        cpmCents: Int,
        rates: CpaRates = CpaRates(),
        perVideoCapCents: Int,
        plan: Plan = .free,
        type: BountyType = .cpm,
        firstBounty: Bool = false,
        takeRate: Double? = nil,
        flatFeeCents: Int = 0,
        medianViews: Int,
        basis: String,
        funnel: FunnelAssumptions = FunnelAssumptions.defaults
    ) -> PayMath {
        let e: ExpectedEarnings = expectedEarnings(
            baseMedianViews: medianViews,
            cpmCents: cpmCents,
            rates: rates,
            perVideoCapCents: perVideoCapCents,
            funnel: funnel
        )
        let take: Double = takeRate ?? FlowdConstants.takeRate(plan: plan, type: type, firstBountyWaived: firstBounty)
        let flat: Int = max(0, flatFeeCents)
        let median: Int = e.median.payCents + flat
        let creatorCpm: Int = e.median.views > 0 ? MoneyMath.roundHalfUp(Double(median) / Double(e.median.views) * 1000) : 0
        let allIn: Int
        if flat > 0 && e.median.views > 0 {
            let numerator: Int = median * (10_000 + MoneyMath.bps(take)) * (10_000 + MoneyMath.bps(FlowdConstants.Fees.cardProcessingRate))
            allIn = MoneyMath.divRound(numerator, 100_000 * e.median.views)
        } else {
            allIn = SettlementEngine.allInRate(rateCents: creatorCpm, takeRate: take)
        }
        return PayMath(
            expectedViewsP25: e.p25.views,
            expectedViewsMedian: e.median.views,
            expectedViewsP75: e.p75.views,
            p25Cents: e.p25.payCents + flat,
            medianCents: median,
            p75Cents: e.p75.payCents + flat,
            creatorCpmCents: creatorCpm,
            allInCpmCents: allIn,
            basis: basis
        )
    }

    // MARK: Typical beside top

    /// The FTC-careful sentence for any top-earner figure: the typical (median) first, the top beside it, and the disclaimer. Never "guaranteed",
    /// never a bare top number.
    static func typicalVsTop(typicalCents: Int, topCents: Int, topLabel: String = "10%", period: String = "30 days") -> String {
        var text: String = "The typical creator earned " + Fmt.moneyAuto(typicalCents) + " in " + period + "."
        text += " The top " + topLabel + " earned " + Fmt.moneyAuto(topCents) + "."
        text += " " + disclaimer
        return text
    }

    /// The creator earnings calculator (free tool): a monthly range from posts per month, approval rate and the per-video quantiles. Posts that are
    /// not approved earn nothing, so the expected approved posts are posts x approval rate. Labelled an estimate.
    static func monthlyEarningsRange(
        medianViews: Int,
        postsPerMonth: Int,
        approvalRate: Double = 0.78,
        cpmCents: Int,
        rates: CpaRates = CpaRates(),
        perVideoCapCents: Int
    ) -> MonthlyEarningsRange {
        let approvedPosts: Double = MoneyMath.round2(Double(postsPerMonth) * approvalRate)
        let perVideo: ExpectedEarnings = expectedEarnings(
            baseMedianViews: medianViews,
            cpmCents: cpmCents,
            rates: rates,
            perVideoCapCents: perVideoCapCents
        )
        return MonthlyEarningsRange(
            approvedPosts: approvedPosts,
            perVideo: perVideo,
            p25Cents: MoneyMath.roundHalfUp(Double(perVideo.p25.payCents) * approvedPosts),
            medianCents: MoneyMath.roundHalfUp(Double(perVideo.median.payCents) * approvedPosts),
            p75Cents: MoneyMath.roundHalfUp(Double(perVideo.p75.payCents) * approvedPosts),
            label: "Estimate. " + disclaimer
        )
    }

    // MARK: Income calendar

    /// The income calendar: when pending money clears (14:00 UTC runs) and when cleared money pays out (Friday 18:00 UTC), for the next
    /// `horizonDays`. Held money has no date and is reported separately. Pending and cleared are never summed into one number.
    static func incomeCalendar(rows: [CalendarRow], now: Date, horizonDays: Int = 14) -> IncomeCalendar {
        let start: Date = FlowdCalendar.dayStart(now)
        let end: Date = FlowdCalendar.addDays(start, Double(horizonDays))
        let nextPay: Date = MoneyClockEngine.nextWeeklyPayout(after: now)
        var byDate: [String: CalendarDay] = [:]
        func day(_ date: Date) -> CalendarDay {
            let key: String = FlowdCalendar.dayString(date)
            if let existing = byDate[key] {
                return existing
            }
            let startOfDay: Date = FlowdCalendar.dayStart(date)
            return CalendarDay(date: key, label: FlowdCalendar.dayLabelUTC(startOfDay), clearsCents: 0, paysCents: 0, estimatedCents: 0)
        }
        var held: Int = 0
        var toClear: Int = 0
        var paid: Int = 0
        var nextPayAmount: Int = 0
        for row in rows {
            if row.state == .held {
                held += row.amountCents
                continue
            }
            if row.state == .paid || row.state == .reversed || row.state == .unknown {
                continue
            }
            let payAt: Date
            if row.state == .cleared {
                payAt = row.etaAt ?? MoneyClockEngine.weeklyPayoutFor(clearedAt: now)
            } else {
                let clearAt: Date = row.etaAt ?? now
                if clearAt < end {
                    var d: CalendarDay = day(clearAt)
                    d.clearsCents += row.amountCents
                    if row.estimated {
                        d.estimatedCents += row.amountCents
                    }
                    byDate[d.date] = d
                    toClear += row.amountCents
                }
                payAt = MoneyClockEngine.weeklyPayoutFor(clearedAt: clearAt)
            }
            if payAt < end {
                var d: CalendarDay = day(payAt)
                d.paysCents += row.amountCents
                if row.state != .cleared && row.estimated {
                    d.estimatedCents += row.amountCents
                }
                byDate[d.date] = d
                paid += row.amountCents
            }
            if payAt == nextPay {
                nextPayAmount += row.amountCents
            }
        }
        let days: [CalendarDay] = byDate.values.sorted { (a: CalendarDay, b: CalendarDay) -> Bool in
            return a.date < b.date
        }
        return IncomeCalendar(
            days: days,
            nextPayoutAt: nextPayAmount > 0 ? nextPay : nil,
            nextPayoutCents: nextPayAmount,
            toClearCents: toClear,
            toPayCents: paid,
            heldCents: held
        )
    }

    // MARK: Tax Desk

    /// Tax Desk: year-to-date earnings, a set-aside estimate and progress to the 1099-NEC threshold. "Not tax advice." Free products and gifting are
    /// taxable income too; the set-aside rate is the creator's to adjust.
    static func taxDesk(ytdClearedCents: Int, setAsideRate: Double = FlowdConstants.Tax.setAsideRate) -> TaxDeskNumbers {
        let threshold: Int = FlowdConstants.Tax.form1099NecThresholdCents
        return TaxDeskNumbers(
            ytdClearedCents: ytdClearedCents,
            setAsideCents: MoneyMath.mulRate(max(0, ytdClearedCents), setAsideRate),
            setAsideRate: setAsideRate,
            thresholdCents: threshold,
            progressToThreshold: min(1, max(0, Double(ytdClearedCents) / Double(threshold))),
            remainingToThresholdCents: max(0, threshold - ytdClearedCents),
            overThreshold: ytdClearedCents >= threshold,
            disclaimer: FlowdConstants.Tax.disclaimer + " Estimate only."
        )
    }
}

/// A monthly earnings range for the calculator.
struct MonthlyEarningsRange: Codable, Hashable, Sendable {
    var approvedPosts: Double
    var perVideo: ExpectedEarnings
    var p25Cents: Int
    var medianCents: Int
    var p75Cents: Int
    var label: String
}
