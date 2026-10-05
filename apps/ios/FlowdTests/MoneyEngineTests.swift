import XCTest
@testable import Flowd

/// The money engines beyond the formula vectors: integer money maths, the Reserved Slot, Pay Math, the Money Clock schedule and its words, the income
/// calendar and the Tax Desk. Every number here is checked against the DOMAIN.md worked examples or computed by hand in the comment beside it.
final class MoneyEngineTests: XCTestCase {
    // MARK: Integer money maths

    func testBasisPointsAndRateMultiplicationRoundHalfAwayFromZero() {
        XCTAssertEqual(MoneyMath.bps(0.12), 1_200)
        XCTAssertEqual(MoneyMath.bps(0.015), 150)
        XCTAssertEqual(MoneyMath.bps(0.029), 290)
        XCTAssertEqual(MoneyMath.mulRate(25_000, 0.10), 2_500)
        XCTAssertEqual(MoneyMath.mulRate(333, 0.10), 33, "33.3 rounds down")
        XCTAssertEqual(MoneyMath.mulRate(335, 0.10), 34, "33.5 rounds up")
        XCTAssertEqual(MoneyMath.mulRate(-335, 0.10), -34, "A clawback is exactly the negative of the pay.")
        XCTAssertEqual(MoneyMath.mulRate(0, 0.12), 0)
    }

    func testIntegerDivisionHelpers() {
        XCTAssertEqual(MoneyMath.divRound(7, 2), 4)
        XCTAssertEqual(MoneyMath.divRound(5, 2), 3)
        XCTAssertEqual(MoneyMath.divRound(-5, 2), -3)
        XCTAssertEqual(MoneyMath.divRound(5, 0), 0, "A zero denominator is 0, never a crash.")
        XCTAssertEqual(MoneyMath.floorDiv(7, 2), 3)
        XCTAssertEqual(MoneyMath.floorDiv(-7, 2), -4)
        XCTAssertEqual(MoneyMath.floorDiv(-8, 2), -4)
    }

    func testRoundingAndClamping() {
        XCTAssertEqual(MoneyMath.roundHalfUp(2.5), 3)
        XCTAssertEqual(MoneyMath.roundHalfUp(-2.5), -3)
        XCTAssertEqual(MoneyMath.roundHalfUp(2.4999), 2)
        XCTAssertEqual(MoneyMath.round2(0.125), 0.13, accuracy: 0.0000001)
        XCTAssertEqual(MoneyMath.round2(1.005), 1.0, accuracy: 0.0000001, "Matches JavaScript's Math.round(x * 100) / 100.")
        XCTAssertEqual(MoneyMath.clamp(5, 0, 3), 3)
        XCTAssertEqual(MoneyMath.clamp(-1, 0, 3), 0)
        XCTAssertEqual(MoneyMath.clamp(-1.5, 0.0, 1.0), 0.0, accuracy: 0.0000001)
        XCTAssertEqual(MoneyMath.clamp01(1.2), 1.0, accuracy: 0.0000001)
        XCTAssertEqual(MoneyMath.sum([100, 250, -50]), 300)
    }

    func testQuantilesAndTheTypicalBand() {
        XCTAssertEqual(MoneyMath.quantile([1, 2, 3, 4], 0.5), 2.5, accuracy: 0.0000001)
        XCTAssertEqual(MoneyMath.quantile([10], 0.9), 10, accuracy: 0.0000001)
        XCTAssertEqual(MoneyMath.quantile([], 0.5), 0, accuracy: 0.0000001)
        XCTAssertEqual(MoneyMath.median([5, 1, 3]), 3, accuracy: 0.0000001)
        XCTAssertEqual(MoneyMath.quantile([1, 2, 3, 4, 5], 0.25), 2, accuracy: 0.0000001)
        let band: TypicalBand = MoneyMath.typicalBand([100, 200, 300, 400, 1_000])
        XCTAssertEqual(band.n, 5)
        XCTAssertEqual(band.p25Cents, 200)
        XCTAssertEqual(band.medianCents, 300)
        XCTAssertEqual(band.p75Cents, 400)
        XCTAssertEqual(band.p90Cents, 760)
    }

    func testTheCpaRatesDefaultToFortyOneFiftyAndFourDollars() {
        XCTAssertEqual(CpaRates.defaults, CpaRates(install: 40, trial: 150, paid: 400))
        XCTAssertEqual(CpaRates.defaults.rate(for: .trial), 150)
        XCTAssertEqual(CpaRates.defaults.rate(for: .unknown), 0)
        XCTAssertTrue(CpaRates.defaults.paysAnything)
        XCTAssertFalse(CpaRates().paysAnything)
    }

    // MARK: Escrow and the Reserved Slot

    func testCardProcessingIsTwoPointNinePercentPlusThirtyCents() {
        XCTAssertEqual(SettlementEngine.cardProcessing(0), 0)
        XCTAssertEqual(SettlementEngine.cardProcessing(100_000), 2_930)
        XCTAssertEqual(SettlementEngine.cardProcessing(1), 30)
    }

    func testAFirstBountyWaivesTheFeeAndFlowdMatchesDollarForDollarUpToFiveHundred() {
        let big: FundingBreakdown = SettlementEngine.firstBountyFunding(brandFundsCents: 1_000_000)
        XCTAssertEqual(big.matchedCents, 50_000)
        XCTAssertEqual(big.budgetCents, 1_050_000)
        XCTAssertEqual(big.feeReserveCents, 0)
        XCTAssertEqual(big.brandFundedCents, 1_000_000)
        let small: FundingBreakdown = SettlementEngine.firstBountyFunding(brandFundsCents: 30_000)
        XCTAssertEqual(small.matchedCents, 30_000)
        XCTAssertEqual(small.budgetCents, 60_000)
    }

    func testTheReservationUnitIsTheCapPlusItsFeeAndSpotsLeftIsAFlooredCount() {
        XCTAssertEqual(SettlementEngine.reservationUnit(perVideoCapCents: 25_000, takeRate: 0.12), 28_000)
        XCTAssertEqual(SettlementEngine.spotsLeft(remainingCents: 100_000, perVideoCapCents: 25_000, takeRate: 0.12), 3)
        XCTAssertEqual(SettlementEngine.spotsLeft(remainingCents: 27_999, perVideoCapCents: 25_000, takeRate: 0.12), 0)
        XCTAssertEqual(SettlementEngine.spotsLeft(remainingCents: 28_000, perVideoCapCents: 25_000, takeRate: 0.12), 1)
        XCTAssertEqual(SettlementEngine.spotsLeft(remainingCents: -1, perVideoCapCents: 25_000, takeRate: 0.12), 0)
        XCTAssertEqual(SettlementEngine.spotsLeft(remainingCents: 5_000, perVideoCapCents: 0, takeRate: 0.12), 0, "No cap, no unit, no spots.")
    }

    func testAllInPricesIncludeTheTakeRateAndCardProcessing() {
        XCTAssertEqual(SettlementEngine.allInRate(rateCents: 100, takeRate: 0.10), 113, "100 x 1.10 x 1.029 = 113.19")
        XCTAssertEqual(SettlementEngine.allInCpm(cpmCents: 200, budgetCents: 500_000, cardChargeCents: 576_270), 231)
        XCTAssertEqual(SettlementEngine.allInCpm(cpmCents: 0, budgetCents: 500_000, cardChargeCents: 576_270), 0)
    }

    func testAdCommissionIsTenPercentAndThePromotionFeeOnePercentOfSpend() {
        XCTAssertEqual(SettlementEngine.adCommission(revenueInWindowCents: 100_000), 10_000)
        XCTAssertEqual(SettlementEngine.adPlatformFee(spendCents: 100_000), 1_000)
    }

    func testTheCapAppliesToViewsThenConversionsAndNeverToAFlatFee() {
        let result: SettlementResult = SettlementEngine.settlePost(
            windowViews: 500_000,
            cpmCents: 200,
            installs: 40,
            trials: 10,
            paid: 3,
            rates: CpaRates.defaults,
            perVideoCapCents: 25_000,
            takeRate: 0.10
        )
        XCTAssertEqual(result.cpmUncappedCents, 100_000)
        XCTAssertEqual(result.cpmPayCents, 25_000, "Views fill the cap first.")
        XCTAssertEqual(result.cpaPayCents, 0, "Nothing is left under the cap for conversions.")
        XCTAssertTrue(result.capped)
        XCTAssertEqual(result.capRemainingCents, 0)
        XCTAssertEqual(result.feeCents, 2_500)
        XCTAssertEqual(result.brandCostCents, 27_500)

        let alreadyPaid: SettlementResult = SettlementEngine.settlePost(
            windowViews: 10_000,
            cpmCents: 200,
            rates: CpaRates(),
            perVideoCapCents: 25_000,
            takeRate: 0,
            alreadyPaidCents: 24_000
        )
        XCTAssertEqual(alreadyPaid.cpmPayCents, 1_000, "Only the cap that is left can be paid.")
    }

    // MARK: Pay Math

    func testPayMathForAFlatFeeBountyIsTheFlatFeeAtEveryQuantile() {
        let math: PayMath = EarningsEngine.payMath(
            cpmCents: 0,
            perVideoCapCents: 500,
            type: .direct,
            takeRate: 0,
            flatFeeCents: 500,
            medianViews: 14_200,
            basis: "Starter bounty"
        )
        XCTAssertEqual(math.p25Cents, 500)
        XCTAssertEqual(math.medianCents, 500)
        XCTAssertEqual(math.p75Cents, 500)
        XCTAssertEqual(math.expectedViewsMedian, 14_200)
        XCTAssertEqual(math.expectedViewsP25, 5_680)
        XCTAssertEqual(math.expectedViewsP75, 36_210)
        XCTAssertEqual(math.creatorCpmCents, 35, "$5.00 over 14,200 views is $0.35 per 1,000.")
        XCTAssertEqual(math.allInCpmCents, 36, "With the card fee: 500 x 1.029 / 14.2 = 36.2")
    }

    func testPredictedViewsFollowTheFlowScoreBand() {
        XCTAssertEqual(EarningsEngine.predictedViews(medianViews: 10_000, band: .a), 16_000)
        XCTAssertEqual(EarningsEngine.predictedViews(medianViews: 10_000, band: .b), 11_500)
        XCTAssertEqual(EarningsEngine.predictedViews(medianViews: 10_000, band: .c), 8_500)
        XCTAssertEqual(EarningsEngine.predictedViews(medianViews: 10_000, band: .d), 5_000)
        XCTAssertEqual(EarningsEngine.predictedViews(medianViews: 10_000, band: .e), 3_000)
    }

    func testEveryTopFigureIsShownBesideTheTypicalAndTheDisclaimer() {
        let line: String = EarningsEngine.typicalVsTop(typicalCents: 6_200, topCents: 64_000)
        XCTAssertEqual(line, "The typical creator earned $62 in 30 days. The top 10% earned $640. Results vary. Based on creators' cleared earnings; not a guarantee.")
        XCTAssertFalse(line.lowercased().contains("guaranteed"), "Never promise income.")
    }

    func testTheMonthlyCalculatorCountsOnlyApprovedPosts() {
        let range: MonthlyEarningsRange = EarningsEngine.monthlyEarningsRange(
            medianViews: 14_200,
            postsPerMonth: 10,
            approvalRate: 0.5,
            cpmCents: 210,
            rates: CpaRates.defaults,
            perVideoCapCents: 25_000
        )
        XCTAssertEqual(range.approvedPosts, 5, accuracy: 0.0001)
        XCTAssertEqual(range.p25Cents, MoneyMath.roundHalfUp(Double(range.perVideo.p25.payCents) * 5))
        XCTAssertEqual(range.medianCents, MoneyMath.roundHalfUp(Double(range.perVideo.median.payCents) * 5))
        XCTAssertLessThanOrEqual(range.p25Cents, range.medianCents)
        XCTAssertLessThanOrEqual(range.medianCents, range.p75Cents)
        XCTAssertTrue(range.label.hasPrefix("Estimate."))
    }

    // MARK: The Money Clock schedule

    func testTheNextWeeklyPayoutIsStrictlyAfterNowOnAFridayAtSixPm() {
        XCTAssertEqual(MoneyClockEngine.nextWeeklyPayout(after: FlowdClock.demoNow), TestSupport.date("2026-10-09T18:00:00Z"))
        XCTAssertEqual(MoneyClockEngine.nextWeeklyPayout(after: TestSupport.date("2026-10-09T17:59:59Z")), TestSupport.date("2026-10-09T18:00:00Z"))
        XCTAssertEqual(MoneyClockEngine.nextWeeklyPayout(after: TestSupport.date("2026-10-09T18:00:00Z")), TestSupport.date("2026-10-16T18:00:00Z"))
        XCTAssertEqual(MoneyClockEngine.hoursToNextPayout(now: FlowdClock.demoNow), 148)
    }

    func testMoneyClearedAtTheFridayRunIsPaidThatSameRun() {
        XCTAssertEqual(MoneyClockEngine.weeklyPayoutFor(clearedAt: TestSupport.date("2026-10-09T18:00:00Z")), TestSupport.date("2026-10-09T18:00:00Z"))
        XCTAssertEqual(MoneyClockEngine.weeklyPayoutFor(clearedAt: TestSupport.date("2026-10-09T18:00:01Z")), TestSupport.date("2026-10-16T18:00:00Z"))
        XCTAssertEqual(MoneyClockEngine.weeklyPayoutFor(clearedAt: TestSupport.date("2026-10-07T14:00:00Z")), TestSupport.date("2026-10-09T18:00:00Z"))
    }

    func testThePayoutScheduleListsConsecutiveFridays() {
        let schedule: [Date] = MoneyClockEngine.payoutSchedule(after: FlowdClock.demoNow, count: 3)
        XCTAssertEqual(schedule.map { (d: Date) -> String in return FlowdDates.string(from: d) }, [
            "2026-10-09T18:00:00Z",
            "2026-10-16T18:00:00Z",
            "2026-10-23T18:00:00Z"
        ])
        XCTAssertEqual(MoneyClockEngine.payoutRunId(schedule[0]), "run_2026-10-09")
    }

    func testTheDailyClearingRunIsAt1400Utc() {
        XCTAssertEqual(MoneyClockEngine.firstRunAtOrAfter(TestSupport.date("2026-10-03T13:59:59Z")), TestSupport.date("2026-10-03T14:00:00Z"))
        XCTAssertEqual(MoneyClockEngine.firstRunAtOrAfter(TestSupport.date("2026-10-03T14:00:00Z")), TestSupport.date("2026-10-03T14:00:00Z"))
        XCTAssertEqual(MoneyClockEngine.firstRunAtOrAfter(TestSupport.date("2026-10-03T14:00:01Z")), TestSupport.date("2026-10-04T14:00:00Z"))
        XCTAssertEqual(MoneyClockEngine.nextClearingRun(after: FlowdClock.demoNow), TestSupport.date("2026-10-04T14:00:00Z"))
    }

    func testAWeeklyPayoutArrivesOnTheNextBankingDayAndAnInstantOneInHalfAnHour() {
        let friday: Date = TestSupport.date("2026-10-09T18:00:00Z")
        XCTAssertEqual(MoneyClockEngine.estimatePayoutArrival(kind: .weekly, initiatedAt: friday), TestSupport.date("2026-10-12T15:00:00Z"), "A Friday run lands on Monday.")
        XCTAssertEqual(MoneyClockEngine.estimatePayoutArrival(kind: .weekly, initiatedAt: TestSupport.date("2026-10-07T14:00:00Z")), TestSupport.date("2026-10-08T15:00:00Z"))
        XCTAssertEqual(MoneyClockEngine.estimatePayoutArrival(kind: .instant, initiatedAt: friday), TestSupport.date("2026-10-09T18:30:00Z"))
    }

    func testAPostTimelineNamesEveryStepWithItsDate() {
        let steps: [TimelineStep] = MoneyClockEngine.postTimeline(postedAt: FlowdClock.demoNow, now: FlowdClock.demoNow)
        XCTAssertEqual(steps.map { (s: TimelineStep) -> String in return s.id }, ["posted", "window_closes", "fraud_check", "cleared", "paid"])
        XCTAssertEqual(steps.map { (s: TimelineStep) -> Bool in return s.done }, [true, false, false, false, false])
        XCTAssertEqual(steps[1].at, TestSupport.date("2026-10-06T14:00:00Z"))
        XCTAssertEqual(steps[2].at, TestSupport.date("2026-10-07T02:00:00Z"))
        XCTAssertEqual(steps[3].at, TestSupport.date("2026-10-07T14:00:00Z"))
        XCTAssertEqual(steps[4].at, TestSupport.date("2026-10-09T18:00:00Z"))
        let later: [TimelineStep] = MoneyClockEngine.postTimeline(postedAt: FlowdClock.demoNow, now: TestSupport.date("2026-10-08T00:00:00Z"))
        XCTAssertEqual(later.map { (s: TimelineStep) -> Bool in return s.done }, [true, true, true, true, false])
    }

    func testEveryReasonReadsAsPlainEnglishWithItsDate() {
        let eta: Date = TestSupport.date("2026-10-09T18:00:00Z")
        XCTAssertEqual(
            MoneyClockEngine.reasonText(reason: .awaitingWeeklyPayout, etaAt: eta),
            "Cleared. Pays out Fri 6:00 PM UTC (weekly payout, free)."
        )
        XCTAssertEqual(
            MoneyClockEngine.reasonText(reason: .windowOpen, etaAt: TestSupport.date("2026-10-07T14:00:00Z"), windowEndsAt: TestSupport.date("2026-10-06T14:00:00Z")),
            "Views still counting until Tue 2:00 PM UTC. Clears Wed 2:00 PM UTC after the view check."
        )
        XCTAssertEqual(MoneyClockEngine.reasonText(reason: .heldTaxInfo), "Add your W-9 to release this payout.")
        XCTAssertEqual(MoneyClockEngine.reasonText(reason: .paidOut), "Paid out.")
        XCTAssertEqual(MoneyClockEngine.reasonText(reason: .unknown), "Waiting on a check.")
        for reason in MoneyClockReason.allCases where MoneyClockEngine.isHoldReason(reason) {
            XCTAssertNotNil(MoneyClockEngine.holdStep(reason), reason.rawValue + " must name what releases it.")
        }
    }

    func testDescribingAClockGivesAStateChipADatedEtaAndAReason() {
        let clock: EarningClock = MoneyClockEngine.postClock(postedAt: TestSupport.date("2026-09-29T21:00:00Z"), now: FlowdClock.demoNow)
        let description: EarningDescription = MoneyClockEngine.describe(clock)
        XCTAssertEqual(description.state, .cleared)
        XCTAssertEqual(description.etaLabel, "Pays Fri 6:00 PM UTC")
        XCTAssertEqual(description.reasonText, "Cleared. Pays out Fri 6:00 PM UTC (weekly payout, free).")
        XCTAssertFalse(description.uiTitle.isEmpty)
    }

    func testAHeldOrReversedClockHasNoEtaButNamesItsReason() {
        let posted: Date = TestSupport.date("2026-09-29T21:00:00Z")
        let held: EarningClock = MoneyClockEngine.postClock(postedAt: posted, now: FlowdClock.demoNow, held: true, holdReason: .disputeOpen)
        XCTAssertEqual(held.state, .held)
        XCTAssertEqual(held.reason, .heldDispute)
        XCTAssertNil(held.etaAt)
        let reversed: EarningClock = MoneyClockEngine.postClock(postedAt: posted, now: FlowdClock.demoNow, reversed: true)
        XCTAssertEqual(reversed.state, .reversed)
        XCTAssertEqual(reversed.reason, .reversedClawback)
    }

    func testAPaidClockShowsTheTransferInTransitUntilItLands() {
        let posted: Date = TestSupport.date("2026-09-25T10:00:00Z")
        let paidAt: Date = TestSupport.date("2026-10-02T18:00:00Z")
        let arrives: Date = TestSupport.date("2026-10-05T15:00:00Z")
        let transit: EarningClock = MoneyClockEngine.postClock(postedAt: posted, now: FlowdClock.demoNow, paidAt: paidAt, payoutArrivesAt: arrives)
        XCTAssertEqual(transit.state, .paid)
        XCTAssertEqual(transit.reason, .payoutInTransit)
        XCTAssertEqual(transit.arrivesAt, arrives)
        let landed: EarningClock = MoneyClockEngine.postClock(postedAt: posted, now: TestSupport.date("2026-10-06T00:00:00Z"), paidAt: paidAt, payoutArrivesAt: arrives)
        XCTAssertEqual(landed.reason, .paidOut)
    }

    func testAConversionOnAPostNeverClearsBeforeThePostItself() {
        let posted: Date = TestSupport.date("2026-10-03T14:00:00Z")
        let early: Date = MoneyClockEngine.conversionRunOnPost(kind: .install, occurredAt: TestSupport.date("2026-10-03T20:00:00Z"), postedAt: posted)
        XCTAssertEqual(early, TestSupport.date("2026-10-07T14:00:00Z"), "An install clears in 24 hours, but the post's own run (Oct 7) comes later.")
        let late: Date = MoneyClockEngine.conversionRunOnPost(kind: .paid, occurredAt: TestSupport.date("2026-10-06T10:00:00Z"), postedAt: posted)
        XCTAssertEqual(late, TestSupport.date("2026-10-13T14:00:00Z"), "A paid conversion clears 168 hours after it happened.")
        let clock: EarningClock = MoneyClockEngine.conversionClock(kind: .install, occurredAt: TestSupport.date("2026-10-03T20:00:00Z"), now: FlowdClock.demoNow, postPostedAt: posted)
        XCTAssertEqual(clock.state, .accruing)
        XCTAssertEqual(clock.reason, .windowOpen)
    }

    // MARK: Summaries

    func testTheSummaryKeepsPendingAndClearedSeparate() {
        func row(_ id: String, _ state: MoneyClockState, _ cents: Int, eta: Date?) -> MoneyClockRow {
            return MoneyClockRow(
                id: id,
                creatorId: "cr_maya",
                bountyId: "bnty_x",
                appId: "app_x",
                postId: nil,
                conversionId: nil,
                source: .cpm,
                state: state,
                amountCents: cents,
                estimated: state == .accruing,
                earnedAt: FlowdClock.demoNow,
                etaAt: eta,
                reason: state == .cleared ? .awaitingWeeklyPayout : .windowOpen,
                reasonText: "x",
                label: "x",
                ledgerId: nil,
                payoutId: nil,
                clearedAt: nil,
                paidAt: nil
            )
        }
        let early: Date = TestSupport.date("2026-10-04T14:00:00Z")
        let later: Date = TestSupport.date("2026-10-05T14:00:00Z")
        let summary: MoneyClockSummary = MoneyClockEngine.summarize([
            row("a", .accruing, 1_000, eta: later),
            row("b", .pending, 2_000, eta: early),
            row("c", .cleared, 4_000, eta: TestSupport.date("2026-10-09T18:00:00Z")),
            row("d", .held, 800, eta: nil),
            row("e", .paid, 9_000, eta: nil)
        ], now: FlowdClock.demoNow)
        XCTAssertEqual(summary.accruingCents, 1_000)
        XCTAssertEqual(summary.pendingCents, 3_000, "Pending is accruing plus pending.")
        XCTAssertEqual(summary.clearedCents, 4_000)
        XCTAssertEqual(summary.heldCents, 800)
        XCTAssertEqual(summary.paidCents, 9_000)
        XCTAssertEqual(summary.nextClearingAt, early)
        XCTAssertEqual(summary.nextPayoutAt, TestSupport.date("2026-10-09T18:00:00Z"))
    }

    func testABareStateIsFlaggedAndAHeldRowMustCarryAHeldReason() {
        let bare: MoneyClockRow = MoneyClockRow(
            id: "x", creatorId: "c", bountyId: "b", appId: "a", postId: nil, conversionId: nil, source: .cpm, state: .pending, amountCents: 1,
            estimated: false, earnedAt: FlowdClock.demoNow, etaAt: nil, reason: .fraudCheck, reasonText: "", label: "", ledgerId: nil, payoutId: nil, clearedAt: nil, paidAt: nil
        )
        XCTAssertNotNil(MoneyClockEngine.bareStateProblem(bare))
        var fixed: MoneyClockRow = bare
        fixed.etaAt = TestSupport.date("2026-10-04T14:00:00Z")
        XCTAssertNil(MoneyClockEngine.bareStateProblem(fixed))
        var wrongHold: MoneyClockRow = fixed
        wrongHold.state = .held
        wrongHold.reason = .awaitingWeeklyPayout
        XCTAssertNotNil(MoneyClockEngine.bareStateProblem(wrongHold))
    }

    // MARK: Income calendar and the Tax Desk

    func testTheIncomeCalendarShowsWhenMoneyClearsAndWhenItPaysWithoutSummingThem() {
        let rows: [CalendarRow] = [
            CalendarRow(amountCents: 2_000, state: .pending, etaAt: TestSupport.date("2026-10-04T14:00:00Z")),
            CalendarRow(amountCents: 8_600, state: .cleared, etaAt: TestSupport.date("2026-10-09T18:00:00Z")),
            CalendarRow(amountCents: 500, state: .held)
        ]
        let calendar: IncomeCalendar = EarningsEngine.incomeCalendar(rows: rows, now: FlowdClock.demoNow)
        XCTAssertEqual(calendar.heldCents, 500)
        XCTAssertEqual(calendar.toClearCents, 2_000)
        XCTAssertEqual(calendar.nextPayoutAt, TestSupport.date("2026-10-09T18:00:00Z"))
        XCTAssertEqual(calendar.nextPayoutCents, 8_600 + 2_000, "Both the cleared money and the pending money that clears first pay on the same Friday.")
        let dates: [String] = calendar.days.map { (d: CalendarDay) -> String in return d.date }
        XCTAssertEqual(dates, dates.sorted())
    }

    func testTheTaxDeskSetsAsideAQuarterAndTracksTheTwoThousandDollarThreshold() {
        let half: TaxDeskNumbers = EarningsEngine.taxDesk(ytdClearedCents: 100_000)
        XCTAssertEqual(half.setAsideCents, 25_000)
        XCTAssertEqual(half.progressToThreshold, 0.5, accuracy: 0.0001)
        XCTAssertEqual(half.remainingToThresholdCents, 100_000)
        XCTAssertFalse(half.overThreshold)
        XCTAssertTrue(half.disclaimer.contains("Not tax advice."))
        let over: TaxDeskNumbers = EarningsEngine.taxDesk(ytdClearedCents: 250_000, setAsideRate: 0.30)
        XCTAssertTrue(over.overThreshold)
        XCTAssertEqual(over.progressToThreshold, 1, accuracy: 0.0001)
        XCTAssertEqual(over.remainingToThresholdCents, 0)
        XCTAssertEqual(over.setAsideCents, 75_000)
        XCTAssertEqual(EarningsEngine.taxDesk(ytdClearedCents: -500).setAsideCents, 0)
    }
}
