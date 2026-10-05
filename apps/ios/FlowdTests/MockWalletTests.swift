import XCTest
@testable import Flowd

/// The wallet: Pending and Cleared side by side (never summed), the fee shown before an instant cash-out, idempotent payouts, payout holds named with a
/// next step, and the Tax Desk. Maya is Silver with a verified identity, an active bank account and a verified W-9, so nothing holds her payouts.
final class MockWalletTests: XCTestCase {
    // MARK: The wallet read-model

    func testThePendingAndClearedBucketsAreSeparateAndConsistentWithTheMoneyClock() async throws {
        let h: MockHarness = TestSupport.harness()
        let wallet: WalletSummary = try await h.api.wallet()
        let rows: [MoneyClockRow] = try await h.api.moneyClock()
        let summary: MoneyClockSummary = MoneyClockEngine.summarize(rows, now: FlowdClock.demoNow)

        XCTAssertEqual(wallet.tier, .silver)
        XCTAssertEqual(wallet.asOf, FlowdClock.demoNow)
        XCTAssertEqual(wallet.clearedCents, summary.clearedCents)
        XCTAssertEqual(wallet.pendingCents, summary.pendingCents, "Pending already includes what is still accruing; it never includes cleared money.")
        XCTAssertEqual(wallet.accruingCents, summary.accruingCents)
        XCTAssertGreaterThanOrEqual(wallet.pendingCents, wallet.accruingCents)
        XCTAssertEqual(wallet.clearedCents, 8_600, "Maya has one cleared earning waiting for the Friday payout.")
        XCTAssertEqual(wallet.heldCents, summary.heldCents)
        XCTAssertGreaterThan(wallet.clearedCents, 0)
        XCTAssertGreaterThan(wallet.pendingCents, 0)
        XCTAssertEqual(wallet.nextPayoutCents, wallet.clearedCents)
        XCTAssertEqual(wallet.nextPayoutAt, TestSupport.date("2026-10-09T18:00:00Z"), "The next Friday 18:00 UTC run.")
        XCTAssertTrue(wallet.blockers.isEmpty)
        XCTAssertEqual(wallet.payoutMethod?.last4, "4821")
    }

    func testEveryNonFinalMoneyClockRowHasADatedEtaOrANamedHoldReason() async throws {
        let h: MockHarness = TestSupport.harness()
        let rows: [MoneyClockRow] = try await h.api.moneyClock()
        XCTAssertFalse(rows.isEmpty)
        for row in rows {
            XCTAssertNil(MoneyClockEngine.bareStateProblem(row), row.id + " is a bare state: " + (MoneyClockEngine.bareStateProblem(row) ?? ""))
            XCTAssertNotEqual(row.reason, .unknown, row.id)
            XCTAssertFalse(row.reasonText.isEmpty, row.id + " has no reason text.")
        }
    }

    func testTheMoneyClockIsOrderedAccruingPendingHeldClearedPaid() async throws {
        let h: MockHarness = TestSupport.harness()
        let rows: [MoneyClockRow] = try await h.api.moneyClock()
        let order: [MoneyClockState] = [.accruing, .pending, .held, .cleared, .paid, .reversed]
        var last: Int = 0
        for row in rows {
            let rank: Int = order.firstIndex(of: row.state) ?? order.count
            XCTAssertGreaterThanOrEqual(rank, last, "Rows must stay grouped by state.")
            last = rank
        }
    }

    func testTheLedgerIsNewestFirstAndEveryAmountIsIntegerCents() async throws {
        let h: MockHarness = TestSupport.harness()
        let ledger: [LedgerEntry] = try await h.api.ledger(limit: 60)
        XCTAssertEqual(ledger.count, 60)
        let dates: [Date] = ledger.map { (e: LedgerEntry) -> Date in
            return e.postedAt
        }
        XCTAssertEqual(dates, dates.sorted(by: >))
        let short: [LedgerEntry] = try await h.api.ledger(limit: 3)
        XCTAssertEqual(short.count, 3)
    }

    // MARK: Instant cash-out

    func testThePreviewShowsTheFeeBeforeTheCreatorConfirms() async throws {
        let h: MockHarness = TestSupport.harness()
        let wallet: WalletSummary = try await h.api.wallet()
        let preview: PayoutPreview = try await h.api.payoutPreview(amountCents: nil)
        let expected: InstantPayoutQuote = MoneyClockEngine.instantPayout(amountCents: wallet.clearedCents, tier: .silver)
        XCTAssertTrue(preview.ok)
        XCTAssertEqual(preview.amountCents, wallet.clearedCents, "Everything cleared by default.")
        XCTAssertEqual(preview.feeCents, expected.feeCents)
        XCTAssertEqual(preview.netCents, expected.netCents)
        XCTAssertEqual(preview.netCents + preview.feeCents, preview.amountCents)
        XCTAssertFalse(preview.freeInstant, "Silver has no free instant cash-out.")
        XCTAssertTrue(preview.summary.contains(Fmt.money(preview.feeCents)), preview.summary)
        XCTAssertTrue(preview.summary.contains(Fmt.money(preview.netCents)), preview.summary)
        XCTAssertEqual(preview.nextWeeklyPayoutAt, TestSupport.date("2026-10-09T18:00:00Z"), "The free alternative is always named.")
        XCTAssertEqual(preview.arrivesAtEstimate, FlowdCalendar.addMinutes(FlowdClock.demoNow, 30))
        XCTAssertEqual(wallet.instantPreview?.feeCents, preview.feeCents)
    }

    func testAnInstantCashOutMovesTheClearedMoneyAndWritesTheLedgerLeg() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: WalletSummary = try await h.api.wallet()
        let expected: InstantPayoutQuote = MoneyClockEngine.instantPayout(amountCents: before.clearedCents, tier: .silver)

        let payout: Payout = try await h.api.instantPayout(InstantPayoutRequest(amountCents: before.clearedCents))
        XCTAssertEqual(payout.kind, .instant)
        XCTAssertEqual(payout.grossCents, before.clearedCents)
        XCTAssertEqual(payout.feeCents, expected.feeCents)
        XCTAssertEqual(payout.netCents, expected.netCents)
        XCTAssertEqual(payout.grossCents, payout.netCents + payout.feeCents)
        XCTAssertEqual(payout.status, .inTransit)
        XCTAssertFalse(payout.freeInstant)
        XCTAssertNotNil(payout.ledgerTxnId)
        XCTAssertNotNil(payout.stripeTransferId)

        let after: WalletSummary = try await h.api.wallet()
        XCTAssertEqual(after.clearedCents, 0)
        XCTAssertEqual(after.paidOutCents, before.paidOutCents + payout.netCents)
        XCTAssertEqual(after.pendingCents, before.pendingCents, "Cashing out cleared money never touches Pending.")

        let detail: PayoutDetail = try await h.api.payoutDetail(id: payout.id)
        XCTAssertEqual(detail.rows.reduce(0) { (total: Int, r: MoneyClockRow) -> Int in
            return total + r.amountCents
        }, payout.grossCents)
        XCTAssertTrue(detail.rows.allSatisfy { (r: MoneyClockRow) -> Bool in
            return r.state == .paid && r.payoutId == payout.id
        })
        XCTAssertNotNil(detail.arrivesAt)

        let legs: [LedgerEntry] = try await h.api.ledger(limit: 500).filter { (e: LedgerEntry) -> Bool in
            return e.payoutId == payout.id && e.entryType == .payout
        }
        XCTAssertEqual(legs.count, 1, "The creator account carries one payout leg.")
        XCTAssertEqual(legs.first?.amountCents, -payout.grossCents, "The payout leaves the creator account in full; the bank leg and the fee leg are the other side of the transaction.")
        XCTAssertEqual(legs.first?.txnId, payout.ledgerTxnId)
    }

    func testAnInstantCashOutIsIdempotent() async throws {
        let h: MockHarness = TestSupport.harness()
        let wallet: WalletSummary = try await h.api.wallet()
        let first: Payout = try await h.api.instantPayout(InstantPayoutRequest(amountCents: wallet.clearedCents, idempotencyKey: "cash-out-1"))
        let second: Payout = try await h.api.instantPayout(InstantPayoutRequest(amountCents: wallet.clearedCents, idempotencyKey: "cash-out-1"))
        XCTAssertEqual(first.id, second.id, "A double tap never pays twice.")
        let payouts: [Payout] = try await h.api.payouts()
        let instant: [Payout] = payouts.filter { (p: Payout) -> Bool in
            return p.kind == .instant && p.requestedAt == FlowdClock.demoNow
        }
        XCTAssertEqual(instant.count, 1)
    }

    func testACashOutBelowTheMinimumOrAboveWhatIsClearedIsRefused() async throws {
        let h: MockHarness = TestSupport.harness()
        let wallet: WalletSummary = try await h.api.wallet()
        let tiny: Error? = await TestSupport.thrownError {
            _ = try await h.api.instantPayout(InstantPayoutRequest(amountCents: 499))
        }
        XCTAssertEqual(tiny as? FlowdAPIError, FlowdAPIError.belowMinimum(minimumCents: 500))
        let tooMuch: Error? = await TestSupport.thrownError {
            _ = try await h.api.instantPayout(InstantPayoutRequest(amountCents: wallet.clearedCents + 1))
        }
        guard case .validationFailed? = tooMuch as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: tooMuch))
            return
        }
    }

    func testACashOutPaysWholeEarningsOnlySoAnAmountSmallerThanTheClearedEarningIsRefused() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: WalletSummary = try await h.api.wallet()
        XCTAssertEqual(before.clearedCents, 8_600)
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.instantPayout(InstantPayoutRequest(amountCents: 5_000))
        }
        XCTAssertEqual(error as? FlowdAPIError, FlowdAPIError.belowMinimum(minimumCents: 500), "No whole earning fits inside $50.00, so nothing is paid.")
        let after: WalletSummary = try await h.api.wallet()
        XCTAssertEqual(after.clearedCents, before.clearedCents)
        XCTAssertEqual(after.paidOutCents, before.paidOutCents)
    }

    func testPlatinumAndEliteCashOutForFreeAndGoldOncePerWeek() {
        let free: InstantPayoutQuote = MoneyClockEngine.instantPayout(amountCents: 16_000, tier: .platinum, freeInstantUsedThisWeek: 5)
        XCTAssertTrue(free.freeInstant)
        XCTAssertEqual(free.feeCents, 0)
        XCTAssertEqual(free.listFeeCents, 240, "The list fee is shown struck through.")
        let gold: InstantCashOutPreview = MoneyClockEngine.instantCashOutPreview(amountCents: 16_000, tier: .gold)
        XCTAssertEqual(gold.freeReason, "Gold: 1 free instant cash-out a week")
        let goldUsed: InstantCashOutPreview = MoneyClockEngine.instantCashOutPreview(amountCents: 16_000, tier: .gold, freeInstantUsedThisWeek: 1)
        XCTAssertFalse(goldUsed.quote.freeInstant)
        XCTAssertEqual(goldUsed.summary, "Fee $2.40 (1.5%). You get $157.60. Or wait for the free weekly payout.")
    }

    // MARK: Payout methods and holds

    func testAddingAPayoutMethodValidatesTheLastFourDigits() async throws {
        let h: MockHarness = TestSupport.harness()
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.addPayoutMethod(AddPayoutMethodRequest(kind: .debitCard, label: "Debit card", last4: "12"))
        }
        guard case .validationFailed? = error as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: error))
            return
        }
        let method: PayoutMethod = try await h.api.addPayoutMethod(AddPayoutMethodRequest(kind: .debitCard, label: "Debit card", last4: "1234"))
        XCTAssertEqual(method.last4, "1234")
        XCTAssertTrue(method.instantCapable, "A debit card supports instant cash-out.")
        let methods: [PayoutMethod] = try await h.api.payoutMethods()
        XCTAssertEqual(methods.count, 1)
        XCTAssertEqual(methods.first?.id, method.id)
    }

    func testRemovingThePayoutMethodHoldsClearedMoneyWithANamedReasonAndAddingItReleasesTheMoney() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: WalletSummary = try await h.api.wallet()
        let method: PayoutMethod = try XCTUnwrap(before.payoutMethod)
        try await h.api.removePayoutMethod(id: method.id)

        let held: WalletSummary = try await h.api.wallet()
        XCTAssertEqual(held.blockers, [.payoutMethod])
        XCTAssertEqual(held.clearedCents, 0, "Cleared money waits as held, with a reason, until the method is back.")
        XCTAssertGreaterThanOrEqual(held.heldCents, before.clearedCents)
        XCTAssertTrue(held.holds.contains(where: { (hold: WalletHold) -> Bool in
            return hold.reason == .heldPayoutMethod && !hold.nextStep.isEmpty
        }))
        let preview: PayoutPreview = try await h.api.payoutPreview(amountCents: nil)
        XCTAssertFalse(preview.ok)
        let refused: Error? = await TestSupport.thrownError {
            _ = try await h.api.instantPayout(InstantPayoutRequest(amountCents: 1_000))
        }
        XCTAssertEqual(refused as? FlowdAPIError, FlowdAPIError.methodMissing)

        _ = try await h.api.addPayoutMethod(AddPayoutMethodRequest(kind: .bank, label: "Bank account", last4: "4821"))
        let restored: WalletSummary = try await h.api.wallet()
        XCTAssertTrue(restored.blockers.isEmpty)
        XCTAssertEqual(restored.clearedCents, before.clearedCents)
        XCTAssertEqual(restored.heldCents, before.heldCents)
    }

    // MARK: Tax Desk

    func testTheTaxDeskReadsTheSeededW9AndItsSetAside() async throws {
        let h: MockHarness = TestSupport.harness()
        let summary: TaxSummary = try await h.api.taxSummary()
        XCTAssertEqual(summary.profile.status, .verified)
        XCTAssertEqual(summary.profile.form, .w9)
        XCTAssertFalse(summary.w9Needed)
        XCTAssertFalse(summary.disclaimer.isEmpty, "Every Tax Desk screen says it is not tax advice.")
        XCTAssertEqual(summary.numbers.ytdClearedCents, summary.profile.ytdClearedCents)
    }

    func testTheSetAsideRateIsBoundedAndRecomputesTheEstimate() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: TaxProfile = try await h.api.taxSummary().profile
        let updated: TaxProfile = try await h.api.setTaxSetAside(rate: 0.3)
        XCTAssertEqual(updated.setAsideRate, 0.3, accuracy: 0.0001)
        XCTAssertEqual(updated.setAsideCents, MoneyMath.mulRate(before.ytdClearedCents, 0.3))
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.setTaxSetAside(rate: 0.75)
        }
        guard case .validationFailed? = error as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: error))
            return
        }
    }

    func testTheTaxCsvListsEveryEarningOfTheYearWithAHeader() async throws {
        let h: MockHarness = TestSupport.harness()
        let csv: String = try await h.api.taxCSV(year: 2026)
        let lines: [String] = csv.split(separator: "\n").map { (line: Substring) -> String in
            return String(line)
        }
        XCTAssertGreaterThan(lines.count, 1)
        XCTAssertTrue((lines.first ?? "").lowercased().contains("date"), "The first line is the header.")
    }

    // MARK: Earnings reports and proofs

    func testEarningsReportsCoverEveryPeriodAndNeverMixPendingIntoCleared() async throws {
        let h: MockHarness = TestSupport.harness()
        for period in EarningsPeriod.allCases {
            let report: EarningsReport = try await h.api.earnings(period: period)
            XCTAssertEqual(report.period, period)
            XCTAssertFalse(report.disclaimer.isEmpty)
            let expectedBuckets: Int = period == .day ? 14 : (period == .week ? 12 : 6)
            XCTAssertEqual(report.buckets.count, expectedBuckets)
            XCTAssertGreaterThanOrEqual(report.grossCents, report.clearedCents + report.pendingCents, "Gross covers every state; cleared and pending are separate buckets.")
            XCTAssertEqual(report.netCents, report.grossCents - report.feesCents)
            XCTAssertNotNil(report.typical, "The typical creator is always drawn beside the creator.")
        }
    }

    func testAProofPageIsCreatedFromAPayoutAndCanBeRevoked() async throws {
        let h: MockHarness = TestSupport.harness()
        let payouts: [Payout] = try await h.api.payouts()
        let paid: Payout = try XCTUnwrap(payouts.first(where: { (p: Payout) -> Bool in
            return p.status == .paid
        }))
        let proof: Proof = try await h.api.createProof(ProofRequest(
            kind: .payout,
            payoutId: paid.id,
            periodLabel: "Weekly payout",
            periodStart: "2026-09-25",
            periodEnd: "2026-10-02",
            amountCents: paid.netCents,
            postsCount: 3,
            anonymous: true
        ))
        XCTAssertTrue(proof.anonymous)
        try await h.api.revokeProof(id: proof.id)
        let proofs: [Proof] = try await h.api.proofs()
        XCTAssertEqual(proofs.first(where: { (p: Proof) -> Bool in return p.id == proof.id })?.revoked, true)
    }
}
