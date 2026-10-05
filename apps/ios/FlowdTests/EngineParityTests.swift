import XCTest
@testable import Flowd

/// Replays every case of `packages/contract/formula-vectors.json` (the reference outputs of `schema/formulas.mjs`) against `Core/Engine`. The web
/// engine proves the same file in Vitest, so a pass here means iOS and web compute the same cents, bands, dates and checklist lines.
final class EngineParityTests: XCTestCase {
    private let tolerance: Double = 0.0051

    // MARK: Helpers

    private func expectInt(_ actual: Int, _ expected: Int?, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
        guard let want = expected else {
            XCTFail(label + ": the vector has no expected value", file: file, line: line)
            return
        }
        XCTAssertEqual(actual, want, label, file: file, line: line)
    }

    private func expectDouble(_ actual: Double, _ expected: Double?, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
        guard let want = expected else {
            XCTFail(label + ": the vector has no expected value", file: file, line: line)
            return
        }
        XCTAssertEqual(actual, want, accuracy: tolerance, label, file: file, line: line)
    }

    private func expectBool(_ actual: Bool, _ expected: Bool?, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
        guard let want = expected else {
            XCTFail(label + ": the vector has no expected value", file: file, line: line)
            return
        }
        XCTAssertEqual(actual, want, label, file: file, line: line)
    }

    private func expectString(_ actual: String, _ expected: String?, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
        guard let want = expected else {
            XCTFail(label + ": the vector has no expected value", file: file, line: line)
            return
        }
        XCTAssertEqual(actual, want, label, file: file, line: line)
    }

    // MARK: The file itself

    func testTheVectorFileCoversEveryFormulaCategory() throws {
        let categories: [String] = try FormulaVectors.categories()
        let expected: [String] = [
            "brand_reliability", "conversion_clearing", "expected_earnings", "flow_score", "fraud", "funding", "hook_score",
            "instant_payout", "match_score", "money_clock", "price_curve", "settle_post", "sla", "tier"
        ]
        for name in expected {
            XCTAssertTrue(categories.contains(name), "formula-vectors.json lost the category " + name)
        }
        let root: [String: Any] = try FormulaVectors.root()
        XCTAssertEqual(root["contract_version"] as? String, "1.0.0")
    }

    // MARK: Funding and settlement

    func testFundingMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("funding")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let name: String = "funding[" + String(index) + "] "
            let input: VectorObject = c.inObject
            let want: VectorObject = c.outObject
            let got: FundingBreakdown
            if let funds = input.int("brand_funds_cents") {
                got = SettlementEngine.firstBountyFunding(brandFundsCents: funds)
            } else {
                got = SettlementEngine.funding(budgetCents: input.int("budget_cents") ?? 0, takeRate: input.double("take_rate") ?? 0)
            }
            expectInt(got.budgetCents, want.int("budget_cents"), name + "budget")
            expectDouble(got.takeRate, want.double("take_rate"), name + "take rate")
            expectInt(got.feeReserveCents, want.int("fee_reserve_cents"), name + "fee reserve")
            expectInt(got.escrowTotalCents, want.int("escrow_total_cents"), name + "escrow total")
            expectInt(got.matchedCents, want.int("matched_cents"), name + "matched")
            expectInt(got.brandFundedCents, want.int("brand_funded_cents"), name + "brand funded")
            expectInt(got.processingCents, want.int("processing_cents"), name + "processing")
            expectInt(got.cardChargeCents, want.int("card_charge_cents"), name + "card charge")
        }
    }

    func testSettlePostMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("settle_post")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let name: String = "settle_post[" + String(index) + "] "
            let input: VectorObject = c.inObject
            let want: VectorObject = c.outObject
            let conv: VectorObject = input.object("conv") ?? VectorObject([:])
            let rates: VectorObject = input.object("rates") ?? VectorObject([:])
            let got: SettlementResult = SettlementEngine.settlePost(
                windowViews: input.int("views") ?? 0,
                cpmCents: input.int("cpm") ?? 0,
                installs: conv.int("install") ?? 0,
                trials: conv.int("trial") ?? 0,
                paid: conv.int("paid") ?? 0,
                rates: CpaRates(install: rates.int("install") ?? 0, trial: rates.int("trial") ?? 0, paid: rates.int("paid") ?? 0),
                perVideoCapCents: input.int("cap") ?? 0,
                takeRate: input.double("take_rate") ?? 0
            )
            expectInt(got.cpmUncappedCents, want.int("cpm_uncapped_cents"), name + "cpm uncapped")
            expectInt(got.cpaUncappedCents, want.int("cpa_uncapped_cents"), name + "cpa uncapped")
            expectInt(got.cpmPayCents, want.int("cpm_pay_cents"), name + "cpm pay")
            expectInt(got.cpaPayCents, want.int("cpa_pay_cents"), name + "cpa pay")
            expectInt(got.payCents, want.int("pay_cents"), name + "pay")
            expectBool(got.capped, want.bool("capped"), name + "capped")
            expectInt(got.capRemainingCents, want.int("cap_remaining_cents"), name + "cap remaining")
            expectInt(got.feeCpmCents, want.int("fee_cpm_cents"), name + "fee cpm")
            expectInt(got.feeCpaCents, want.int("fee_cpa_cents"), name + "fee cpa")
            expectInt(got.feeCents, want.int("fee_cents"), name + "fee")
            expectInt(got.brandCostCents, want.int("brand_cost_cents"), name + "brand cost")
        }
    }

    // MARK: Instant cash-out

    func testInstantPayoutMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("instant_payout")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let name: String = "instant_payout[" + String(index) + "] "
            let input: VectorObject = c.inObject
            let want: VectorObject = c.outObject
            let tier: Tier = Tier(rawValue: input.string("tier") ?? "") ?? .unknown
            let got: InstantPayoutQuote = MoneyClockEngine.instantPayout(
                amountCents: input.int("amount_cents") ?? 0,
                tier: tier,
                foundingFree: input.bool("founding_free") ?? false,
                freeInstantUsedThisWeek: input.int("free_instant_used_this_week") ?? 0
            )
            expectBool(got.ok, want.bool("ok"), name + "ok")
            expectInt(got.feeCents, want.int("fee_cents"), name + "fee")
            expectInt(got.netCents, want.int("net_cents"), name + "net")
            expectBool(got.freeInstant, want.bool("free_instant"), name + "free instant")
            if want.has("list_fee_cents") {
                expectInt(got.listFeeCents, want.int("list_fee_cents"), name + "list fee")
            }
            if want.bool("ok") == false {
                XCTAssertEqual(got.refusal?.rawValue, want.string("reason"), name + "refusal")
            }
        }
    }

    func testTheInstantFeeIsOnePointFivePercentClampedBetweenFiftyCentsAndFifteenDollars() {
        XCTAssertEqual(MoneyClockEngine.instantPayout(amountCents: 8_600, tier: .silver).feeCents, 129)
        XCTAssertEqual(MoneyClockEngine.instantPayout(amountCents: 8_600, tier: .silver).netCents, 8_471)
        XCTAssertEqual(MoneyClockEngine.instantPayout(amountCents: 500, tier: .silver).feeCents, 50, "Below $33.34 the floor of $0.50 applies.")
        XCTAssertEqual(MoneyClockEngine.instantPayout(amountCents: 1_000_000, tier: .silver).feeCents, 1_500, "The cap is $15.")
        XCTAssertFalse(MoneyClockEngine.instantPayout(amountCents: 499, tier: .silver).ok, "The minimum cash-out is $5.00.")
    }

    func testInstantCashOutPerksByTier() {
        XCTAssertTrue(MoneyClockEngine.instantPayout(amountCents: 10_000, tier: .gold, freeInstantUsedThisWeek: 0).freeInstant)
        XCTAssertFalse(MoneyClockEngine.instantPayout(amountCents: 10_000, tier: .gold, freeInstantUsedThisWeek: 1).freeInstant)
        XCTAssertTrue(MoneyClockEngine.instantPayout(amountCents: 10_000, tier: .platinum, freeInstantUsedThisWeek: 9).freeInstant)
        XCTAssertTrue(MoneyClockEngine.instantPayout(amountCents: 10_000, tier: .elite, freeInstantUsedThisWeek: 9).freeInstant)
        XCTAssertFalse(MoneyClockEngine.instantPayout(amountCents: 10_000, tier: .silver).freeInstant)
        XCTAssertTrue(MoneyClockEngine.instantPayout(amountCents: 10_000, tier: .bronze, foundingFree: true).freeInstant)
    }

    func testAnInstantCashOutAboveWhatIsClearedIsRefused() {
        let quote: InstantPayoutQuote = MoneyClockEngine.instantPayout(amountCents: 9_000, tier: .silver, clearedCents: 8_600)
        XCTAssertFalse(quote.ok)
        XCTAssertEqual(quote.refusal, .exceedsCleared)
    }

    // MARK: Expected earnings (Pay Math)

    private func expectPoint(_ got: EarningsEstimatePoint, _ want: VectorObject?, _ name: String) {
        guard let want = want else {
            XCTFail(name + ": missing from the vector")
            return
        }
        expectInt(got.views, want.int("views"), name + " views")
        expectDouble(got.installs, want.double("installs"), name + " installs")
        expectDouble(got.trials, want.double("trials"), name + " trials")
        expectDouble(got.paid, want.double("paid"), name + " paid")
        expectInt(got.cpmPayCents, want.int("cpm_pay_cents"), name + " cpm pay")
        expectInt(got.cpaPayCents, want.int("cpa_pay_cents"), name + " cpa pay")
        expectInt(got.payCents, want.int("pay_cents"), name + " pay")
        expectBool(got.capped, want.bool("capped"), name + " capped")
    }

    func testExpectedEarningsMatchTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("expected_earnings")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let name: String = "expected_earnings[" + String(index) + "] "
            let input: VectorObject = c.inObject
            let rates: VectorObject = input.object("rates") ?? VectorObject([:])
            let got: ExpectedEarnings = EarningsEngine.expectedEarnings(
                baseMedianViews: input.int("base_median_views") ?? 0,
                cpmCents: input.int("cpm_cents") ?? 0,
                rates: CpaRates(install: rates.int("install") ?? 0, trial: rates.int("trial") ?? 0, paid: rates.int("paid") ?? 0),
                perVideoCapCents: input.int("per_video_cap_cents") ?? 0
            )
            let want: VectorObject = c.outObject
            expectPoint(got.p25, want.object("p25"), name + "p25")
            expectPoint(got.median, want.object("median"), name + "median")
            expectPoint(got.p75, want.object("p75"), name + "p75")
        }
    }

    // MARK: Tiers

    func testTierAndProgressMatchTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("tier")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let name: String = "tier[" + String(index) + "] "
            let input: VectorObject = c.inObject
            let stats: TierStats = TierStats(
                lifetimeClearedCents: input.int("lifetime_cleared_cents") ?? 0,
                approvedCount: input.int("approved_count") ?? 0,
                approvalRate: input.double("approval_rate") ?? 0,
                reliabilityScore: input.int("reliability_score") ?? 0,
                eliteReviewed: input.bool("elite_reviewed") ?? false
            )
            let want: VectorObject = c.outObject
            XCTAssertEqual(TierEngine.tierFor(stats).rawValue, want.string("tier"), name + "tier")
            let progress: TierProgress = TierEngine.progress(stats)
            guard let wantProgress = want.object("progress") else {
                XCTFail(name + "the vector has no progress")
                continue
            }
            XCTAssertEqual(progress.current.rawValue, wantProgress.string("current"), name + "current")
            XCTAssertEqual(progress.next?.rawValue, wantProgress.string("next"), name + "next")
            expectDouble(progress.progress, wantProgress.double("progress"), name + "progress")
            let wantCriteria: [VectorObject] = wantProgress.objects("criteria")
            XCTAssertEqual(progress.criteria.count, wantCriteria.count, name + "criteria count")
            for (position, wantCriterion) in wantCriteria.enumerated() where position < progress.criteria.count {
                let got: TierCriterion = progress.criteria[position]
                let label: String = name + "criterion " + String(position) + " "
                XCTAssertEqual(got.key, wantCriterion.string("key"), label + "key")
                XCTAssertEqual(got.label, wantCriterion.string("label"), label + "label")
                expectDouble(got.have, wantCriterion.double("have"), label + "have")
                expectDouble(got.need, wantCriterion.double("need"), label + "need")
                expectBool(got.met, wantCriterion.bool("met"), label + "met")
            }
        }
    }

    // MARK: Fraud

    func testFraudScoreMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("fraud")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let name: String = "fraud[" + String(index) + "] "
            var signals: [FraudSignalInput] = []
            for item in c.inList {
                guard let signal = FraudSignal(rawValue: item.string("signal") ?? "") else {
                    XCTFail(name + "unknown signal " + (item.string("signal") ?? "nil"))
                    continue
                }
                signals.append(FraudSignalInput(signal: signal, severity: item.double("severity") ?? 0))
            }
            let got: FraudScoreResult = MarketEngine.fraudScore(signals)
            let want: VectorObject = c.outObject
            expectInt(got.score, want.int("score"), name + "score")
            XCTAssertEqual(got.band.rawValue, want.string("band"), name + "band")
            let wantSignals: [VectorObject] = want.objects("signals")
            XCTAssertEqual(got.signals.count, wantSignals.count, name + "signal count")
            for (position, wantSignal) in wantSignals.enumerated() where position < got.signals.count {
                let hit: FraudSignalHit = got.signals[position]
                let label: String = name + "signal " + String(position) + " "
                XCTAssertEqual(hit.signal.rawValue, wantSignal.string("signal"), label + "id")
                expectInt(hit.points, wantSignal.int("points"), label + "points")
                expectDouble(hit.severity, wantSignal.double("severity"), label + "severity")
                XCTAssertEqual(hit.detail, wantSignal.string("detail"), label + "detail")
            }
        }
    }

    func testFraudBandsDriveWhatHappensToMoney() {
        XCTAssertEqual(MarketEngine.fraudAction(FlowdConstants.Fraud.holdThreshold), .autoHoldAndQueue)
        XCTAssertEqual(MarketEngine.fraudAction(FlowdConstants.Fraud.reviewThreshold), .holdForHumanReview)
        XCTAssertEqual(MarketEngine.fraudAction(0), .autoClear)
        XCTAssertEqual(MarketEngine.fraudBand(0), .clean)
    }

    // MARK: Hook Score and Flow Score

    private func expectCard(_ got: ScoredCard, _ want: VectorObject, _ name: String) {
        XCTAssertEqual(got.band.rawValue, want.string("band"), name + "band")
        expectInt(got.points, want.int("points"), name + "points")
        XCTAssertEqual(got.label, want.string("label"), name + "label")
        let wantItems: [VectorObject] = want.objects("items")
        XCTAssertEqual(got.items.count, wantItems.count, name + "item count")
        for (position, wantItem) in wantItems.enumerated() where position < got.items.count {
            let item: ScoredItem = got.items[position]
            let label: String = name + "item " + String(position) + " (" + item.id.rawValue + ") "
            XCTAssertEqual(item.id.rawValue, wantItem.string("id"), label + "id")
            XCTAssertEqual(item.label, wantItem.string("label"), label + "label")
            expectInt(item.points, wantItem.int("points"), label + "points")
            expectInt(item.max, wantItem.int("max"), label + "max")
            expectBool(item.passed, wantItem.bool("passed"), label + "passed")
            XCTAssertEqual(item.reason, wantItem.string("reason"), label + "reason")
            XCTAssertEqual(item.fix, wantItem.string("fix"), label + "fix")
        }
    }

    func testHookScoreMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("hook_score")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let input: VectorObject = c.inObject
            let observations: HookObservations = HookObservations(
                landsMs: input.int("lands_ms"),
                onscreenMs: input.int("onscreen_ms"),
                spokenMatchesOnscreen: input.bool("spoken_matches_onscreen") ?? false,
                faceMs: input.int("face_ms"),
                faceless: input.bool("faceless") ?? false,
                appMs: input.int("app_ms"),
                interruptMs: input.int("interrupt_ms"),
                hookTypeKnown: input.bool("hook_type_known") ?? false,
                hookTypeAboveMedian: input.bool("hook_type_above_median") ?? false,
                speechMs: input.int("speech_ms"),
                captionsInSafeZone: input.bool("captions_in_safe_zone") ?? false
            )
            expectCard(ScoringEngine.scoreHook(observations), c.outObject, "hook_score[" + String(index) + "] ")
        }
    }

    func testFlowScoreMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("flow_score")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let input: VectorObject = c.inObject
            let observations: FlowObservations = FlowObservations(
                hookPoints: input.int("hook_points") ?? 0,
                beatsFound: input.int("beats_found") ?? 0,
                beatsRequired: input.int("beats_required") ?? 0,
                appMs: input.int("app_ms"),
                disclosureAudio: input.bool("disclosure_audio") ?? false,
                disclosureOnscreen: input.bool("disclosure_onscreen") ?? false,
                durationS: input.double("duration_s") ?? 0,
                captionsInSafeZone: input.bool("captions_in_safe_zone") ?? false,
                singleCta: input.bool("single_cta") ?? false,
                endsOnWinState: input.bool("ends_on_win_state") ?? false,
                audioGaps: input.int("audio_gaps") ?? 0,
                formatOrder: FormatOrder(rawValue: input.string("format_order") ?? "") ?? .outOfOrder
            )
            expectCard(ScoringEngine.scoreFlow(observations), c.outObject, "flow_score[" + String(index) + "] ")
        }
    }

    func testScoreBandsAreAtEightyFiveSeventyFiftyFiveForty() {
        XCTAssertEqual(ScoringEngine.band(for: 100), .a)
        XCTAssertEqual(ScoringEngine.band(for: 85), .a)
        XCTAssertEqual(ScoringEngine.band(for: 84), .b)
        XCTAssertEqual(ScoringEngine.band(for: 70), .b)
        XCTAssertEqual(ScoringEngine.band(for: 69), .c)
        XCTAssertEqual(ScoringEngine.band(for: 55), .c)
        XCTAssertEqual(ScoringEngine.band(for: 54), .d)
        XCTAssertEqual(ScoringEngine.band(for: 40), .d)
        XCTAssertEqual(ScoringEngine.band(for: 39), .e)
        XCTAssertEqual(ScoringEngine.band(for: 0), .e)
    }

    // MARK: Money Clock

    func testMoneyClockMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("money_clock")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let name: String = "money_clock[" + String(index) + "] "
            let input: VectorObject = c.inObject
            let want: VectorObject = c.outObject
            let postedAt: Date = TestSupport.date(input.string("posted_at") ?? "")
            let now: Date = TestSupport.date(input.string("now") ?? "")
            let clock: EarningClock = MoneyClockEngine.postClock(postedAt: postedAt, now: now)
            XCTAssertEqual(clock.state.rawValue, want.string("state"), name + "state")
            XCTAssertEqual(clock.reason.rawValue, want.string("reason"), name + "reason")
            XCTAssertEqual(clock.etaAt, want.date("eta_at"), name + "eta")
            XCTAssertEqual(clock.clearedAt, want.date("cleared_at"), name + "cleared at")
            XCTAssertEqual(clock.windowEndsAt, want.date("window_ends_at"), name + "window end")
        }
    }

    func testConversionClearingMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("conversion_clearing")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let input: VectorObject = c.inObject
            let kind: ConversionKind = ConversionKind(rawValue: input.string("kind") ?? "") ?? .unknown
            let occurred: Date = TestSupport.date(input.string("occurred_at") ?? "")
            let run: Date = MoneyClockEngine.conversionClearingRun(kind: kind, occurredAt: occurred)
            let want: Date? = (c.output as? String).flatMap { (text: String) -> Date? in
                return FlowdDates.parse(text)
            }
            XCTAssertEqual(run, want, "conversion_clearing[" + String(index) + "]")
        }
    }

    func testAPostedAtTheDemoNowClearsOnTheNextTuesdayRunAndPaysTheFollowingFriday() {
        let postedAt: Date = FlowdClock.demoNow
        let windowEnd: Date = MoneyClockEngine.windowEndsAt(postedAt: postedAt)
        XCTAssertEqual(windowEnd, TestSupport.date("2026-10-06T14:00:00Z"))
        let run: Date = MoneyClockEngine.postClearingRun(windowEnd: windowEnd)
        XCTAssertEqual(run, TestSupport.date("2026-10-07T14:00:00Z"), "Window end plus 2 hours, then the next 14:00 UTC run.")
        XCTAssertEqual(MoneyClockEngine.weeklyPayoutFor(clearedAt: run), TestSupport.date("2026-10-09T18:00:00Z"))
    }

    func testEveryNonFinalMoneyClockStateCarriesADatedEtaAndANamedReason() {
        let posted: Date = TestSupport.date("2026-10-01T10:00:00Z")
        let moments: [String] = ["2026-10-01T12:00:00Z", "2026-10-04T13:00:00Z", "2026-10-04T20:00:00Z", "2026-10-06T00:00:00Z", "2026-10-08T00:00:00Z"]
        for text in moments {
            let clock: EarningClock = MoneyClockEngine.postClock(postedAt: posted, now: TestSupport.date(text))
            if clock.state == .accruing || clock.state == .pending || clock.state == .cleared {
                XCTAssertNotNil(clock.etaAt, "State " + clock.state.rawValue + " at " + text + " has no ETA.")
            }
            XCTAssertNotEqual(clock.reason, .unknown)
        }
    }

    func testConversionClearingWindowsAre24And72And168Hours() {
        XCTAssertEqual(FlowdConstants.cpaClearHours(.install), 24)
        XCTAssertEqual(FlowdConstants.cpaClearHours(.trial), 72)
        XCTAssertEqual(FlowdConstants.cpaClearHours(.paid), 168)
    }

    // MARK: Review SLA

    func testSlaStateMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("sla")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let hours: Double = c.inObject.double("hours") ?? 0
            let state: SlaState = ReputationEngine.slaState(hoursInQueue: hours)
            XCTAssertEqual(state.rawValue, c.output as? String, "sla[" + String(index) + "] at " + String(hours) + " h")
        }
    }

    func testTheReviewClockCountsDownFromTheSeventyTwoHourSla() {
        let entered: Date = TestSupport.date("2026-10-01T09:00:00Z")
        let due: Date = ReputationEngine.slaDueAt(enteredReviewAt: entered)
        XCTAssertEqual(due, TestSupport.date("2026-10-04T09:00:00Z"))
        let early: ReviewClock = ReputationEngine.reviewClock(enteredReviewAt: entered, now: TestSupport.date("2026-10-01T21:00:00Z"))
        XCTAssertEqual(early.state, .onTrack)
        XCTAssertEqual(early.hoursLeft, 60, accuracy: 0.01)
        XCTAssertFalse(early.escalate)
        let late: ReviewClock = ReputationEngine.reviewClock(enteredReviewAt: entered, now: TestSupport.date("2026-10-04T14:00:00Z"))
        XCTAssertEqual(late.state, .breached)
        XCTAssertTrue(late.escalate)
        XCTAssertLessThan(late.hoursLeft, 0)
    }

    // MARK: Brand reliability

    func testBrandReliabilityMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("brand_reliability")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let name: String = "brand_reliability[" + String(index) + "] "
            let input: VectorObject = c.inObject
            let got: BrandReliabilityResult = ReputationEngine.brandReliability(
                decisionsN: input.int("decisions_n") ?? 0,
                approvedN: input.int("approved_n") ?? 0,
                decisionHoursMedian: input.double("decision_hours_median") ?? 0,
                appealsOverturned: input.int("appeals_overturned") ?? 0,
                paysOnTimeRatio: input.double("pays_on_time_ratio") ?? 0,
                runRate: input.double("run_rate") ?? 0,
                replyHoursMedian: input.double("reply_hours_median") ?? 0
            )
            let want: VectorObject = c.outObject
            expectInt(got.score, want.int("score"), name + "score")
            XCTAssertEqual(got.band.rawValue, want.string("band"), name + "band")
            expectDouble(got.rejectionRate, want.double("rejection_rate"), name + "rejection rate")
            let wantComponents: [VectorObject] = want.objects("components")
            XCTAssertEqual(got.components.count, wantComponents.count, name + "component count")
            for (position, wantComponent) in wantComponents.enumerated() where position < got.components.count {
                let component: ReliabilityComponent = got.components[position]
                let label: String = name + "component " + String(position) + " "
                XCTAssertEqual(component.key, wantComponent.string("key"), label + "key")
                XCTAssertEqual(component.label, wantComponent.string("label"), label + "label")
                expectDouble(component.value, wantComponent.double("value"), label + "value")
                expectDouble(component.weight, wantComponent.double("weight"), label + "weight")
                expectDouble(component.points, wantComponent.double("points"), label + "points")
                XCTAssertEqual(component.reason, wantComponent.string("reason"), label + "reason")
            }
        }
    }

    // MARK: Pricing

    func testPriceCurveMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("price_curve")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let name: String = "price_curve[" + String(index) + "] "
            let input: VectorObject = c.inObject
            let got: [PriceCurvePoint] = MarketEngine.priceCurve(
                clearingCpmCents: input.int("clearing_cpm_cents") ?? 0,
                medianFillHours: input.double("median_fill_hours") ?? 0,
                sampleN: input.int("sample_n") ?? 0
            )
            let want: [VectorObject] = c.outList
            XCTAssertEqual(got.count, want.count, name + "point count")
            for (position, wantPoint) in want.enumerated() where position < got.count {
                let point: PriceCurvePoint = got[position]
                let label: String = name + "point " + String(position) + " "
                expectInt(point.cpmCents, wantPoint.int("cpm_cents"), label + "cpm")
                expectDouble(point.fillHoursP50, wantPoint.double("fill_hours_p50"), label + "p50")
                expectDouble(point.fillHoursP80, wantPoint.double("fill_hours_p80"), label + "p80")
                expectDouble(point.confidence, wantPoint.double("confidence"), label + "confidence")
                expectInt(point.sampleN, wantPoint.int("sample_n"), label + "sample")
            }
        }
    }

    // MARK: Match score

    func testMatchScoreMatchesTheReference() throws {
        let cases: [VectorCase] = try FormulaVectors.cases("match_score")
        XCTAssertFalse(cases.isEmpty)
        for (index, c) in cases.enumerated() {
            let input: VectorObject = c.inObject
            var gates: [Bool] = []
            if let gateObject = input.object("gates") {
                for key in gateObject.raw.keys.sorted() {
                    gates.append(gateObject.bool(key) ?? false)
                }
            }
            let match: MatchInput = MatchInput(
                gates: gates,
                nicheOverlap: input.double("niche_overlap") ?? 0,
                platformFit: input.double("platform_fit") ?? 0,
                regionFit: input.double("region_fit") ?? 0,
                priceRatio: input.double("price_ratio") ?? 0,
                brandReliability: input.double("brand_reliability") ?? 0,
                bountyAgeDays: input.double("bounty_age_days") ?? 0
            )
            let score: Int? = MatchEngine.score(match)
            let name: String = "match_score[" + String(index) + "]"
            if let number = c.output as? NSNumber {
                XCTAssertEqual(score, number.intValue, name)
            } else {
                XCTAssertNil(score, name + " must be nil when a gate fails.")
            }
        }
    }

    func testTheMatchWeightsAddUpToOneHundred() {
        let niche: Double = FlowdConstants.Matching.Weights.niche
        let platform: Double = FlowdConstants.Matching.Weights.platform
        let region: Double = FlowdConstants.Matching.Weights.region
        let price: Double = FlowdConstants.Matching.Weights.price
        let reliability: Double = FlowdConstants.Matching.Weights.brandReliability
        let recency: Double = FlowdConstants.Matching.Weights.recency
        XCTAssertEqual(niche + platform + region + price + reliability + recency, 100, accuracy: 0.0001)
    }
}
