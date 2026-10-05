import XCTest
@testable import Flowd

/// The feed, a bounty's detail and Pay Math, saves, claiming a place ("Make it") and the Daily Drop with its true inventory.
final class MockBountyTests: XCTestCase {
    // MARK: The feed

    func testTheFeedRanksUnlockedBountiesByMatchScoreAndPutsLockedOnesLast() async throws {
        let h: MockHarness = TestSupport.harness()
        let page: Page<FeedItem> = try await h.api.feed(FeedQuery(limit: 200))
        XCTAssertFalse(page.data.isEmpty)
        XCTAssertEqual(page.total, page.data.count, "One page holds the whole demo feed.")
        XCTAssertNil(page.nextCursor)
        var seenLocked: Bool = false
        var lastScore: Int = 101
        for item in page.data {
            if item.locked {
                seenLocked = true
                continue
            }
            XCTAssertFalse(seenLocked, item.id + ": an unlocked bounty came after a locked one.")
            let score: Int = item.matchScore ?? -1
            XCTAssertGreaterThanOrEqual(score, 0, item.id)
            XCTAssertLessThanOrEqual(score, lastScore, item.id + ": scores must not increase down the feed.")
            lastScore = score
        }
    }

    func testEveryItemExplainsItselfWithScoreReasonsAndAnEstimateNeverAGuarantee() async throws {
        let h: MockHarness = TestSupport.harness()
        let page: Page<FeedItem> = try await h.api.feed(FeedQuery(limit: 200))
        for item in page.data {
            XCTAssertLessThanOrEqual(item.expectedPay.p25Cents, item.expectedPay.medianCents, item.id)
            XCTAssertLessThanOrEqual(item.expectedPay.medianCents, item.expectedPay.p75Cents, item.id)
            XCTAssertFalse(item.expectedPay.disclaimer.isEmpty, item.id + " shows pay without the estimate disclaimer.")
            if item.locked {
                XCTAssertNil(item.matchScore, item.id)
                XCTAssertFalse(item.gateFailures.isEmpty, item.id)
                XCTAssertFalse(item.lockReasons.isEmpty, item.id + " is locked with no reason.")
            } else {
                XCTAssertNotNil(item.matchScore, item.id)
                XCTAssertTrue(item.gateFailures.isEmpty, item.id)
            }
        }
    }

    func testSpotsLeftIsATrueCountOfWhatThePoolCanStillReserve() async throws {
        let h: MockHarness = TestSupport.harness()
        let page: Page<FeedItem> = try await h.api.feed(FeedQuery(limit: 200))
        for item in page.data {
            let expected: Int = SettlementEngine.spotsLeft(
                remainingCents: item.bounty.remainingCents,
                perVideoCapCents: item.bounty.perVideoCapCents,
                takeRate: item.bounty.takeRate
            )
            XCTAssertEqual(item.spotsLeft, expected, item.id + ": floor(remaining / reservation unit)")
        }
    }

    func testFeedFiltersNarrowTheList() async throws {
        let h: MockHarness = TestSupport.harness()
        let direct: Page<FeedItem> = try await h.api.feed(FeedQuery(types: [.direct], limit: 200))
        XCTAssertFalse(direct.data.isEmpty)
        XCTAssertTrue(direct.data.allSatisfy { (item: FeedItem) -> Bool in
            return item.bounty.type == .direct
        })
        let searched: Page<FeedItem> = try await h.api.feed(FeedQuery(search: "starter", limit: 200))
        XCTAssertTrue(searched.data.contains(where: { (item: FeedItem) -> Bool in
            return item.bounty.id == "bnty_flowd_starter_2"
        }))
        let saved: Page<FeedItem> = try await h.api.feed(FeedQuery(savedOnly: true, limit: 200))
        XCTAssertFalse(saved.data.isEmpty)
        XCTAssertTrue(saved.data.allSatisfy { (item: FeedItem) -> Bool in
            return item.saved
        })
        let unlockedOnly: Page<FeedItem> = try await h.api.feed(FeedQuery(includeLocked: false, limit: 200))
        XCTAssertTrue(unlockedOnly.data.allSatisfy { (item: FeedItem) -> Bool in
            return !item.locked
        })
    }

    func testTheFeedPagesWithACursor() async throws {
        let h: MockHarness = TestSupport.harness()
        let all: Page<FeedItem> = try await h.api.feed(FeedQuery(limit: 200))
        let first: Page<FeedItem> = try await h.api.feed(FeedQuery(limit: 5))
        XCTAssertEqual(first.data.count, 5)
        let cursor: String = try XCTUnwrap(first.nextCursor)
        let second: Page<FeedItem> = try await h.api.feed(FeedQuery(cursor: cursor, limit: 5))
        XCTAssertEqual(second.data.map { (item: FeedItem) -> String in return item.id }, Array(all.data[5..<10]).map { (item: FeedItem) -> String in return item.id })
        XCTAssertEqual(first.total, all.total)
    }

    // MARK: Detail and Pay Math

    func testTheDetailComposesTheBriefTheRightsCardAndTheCreatorsOwnState() async throws {
        let h: MockHarness = TestSupport.harness()
        let detail: BountyDetail = try await h.api.bountyDetail(id: "bnty_stridely_plantopr")
        XCTAssertEqual(detail.item.bounty.id, "bnty_stridely_plantopr")
        XCTAssertTrue(detail.state.saved)
        XCTAssertTrue(detail.state.joined, "Maya joined this bounty.")
        XCTAssertNil(detail.state.submissionId)
        XCTAssertFalse(detail.tldr.headline.isEmpty)
        XCTAssertFalse(detail.rightsLines.isEmpty)
        XCTAssertFalse(detail.scamCues.isEmpty)
        XCTAssertTrue(detail.scamCues.contains(where: { (cue: String) -> Bool in
            return cue.contains("never asks you to pay")
        }), "Every bounty says flowd never asks creators to pay.")
        XCTAssertEqual(detail.app.id, detail.item.bounty.appId)
    }

    func testTheDetailOfAnUnknownBountyIsNotFound() async throws {
        let h: MockHarness = TestSupport.harness()
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.bountyDetail(id: "bnty_nope")
        }
        guard case .notFound? = error as? FlowdAPIError else {
            XCTFail("Expected not found, got " + String(describing: error))
            return
        }
    }

    func testPayMathUsesTheCreatorsOwnMedianAndShowsTypicalBesideTop() async throws {
        let h: MockHarness = TestSupport.harness()
        let math: PayMathBreakdown = try await h.api.payMath(bountyId: "bnty_stridely_runclub")
        let bounty: Bounty = try await h.api.bountyDetail(id: "bnty_stridely_runclub").item.bounty
        XCTAssertEqual(math.bountyId, bounty.id)
        XCTAssertEqual(math.perVideoCapCents, bounty.perVideoCapCents)
        XCTAssertEqual(math.expected.medianViews, 14_200, "Maya's best connected account: her TikTok 28-day median.")
        XCTAssertLessThanOrEqual(math.expected.p25Cents, math.expected.medianCents)
        XCTAssertLessThanOrEqual(math.expected.medianCents, math.expected.p75Cents)
        XCTAssertLessThanOrEqual(math.expected.p75Cents, bounty.perVideoCapCents + bounty.flatFeeCents)
        XCTAssertNotNil(math.typical)
        XCTAssertNotNil(math.typicalVsTopLine)
        XCTAssertEqual(math.disclaimer, EarningsEngine.disclaimer)
        XCTAssertFalse(math.assumptions.isEmpty)
        XCTAssertFalse(math.rates.isEmpty)
    }

    func testTheBrandScorecardShowsNewBrandsHonestlyAndEstablishedBrandsWithComponents() async throws {
        let h: MockHarness = TestSupport.harness()
        let established: BrandScorecardView = try await h.api.brandScorecard(brandId: "br_lumi")
        XCTAssertFalse(established.isNew)
        XCTAssertEqual(established.components.count, 5)
        XCTAssertNotNil(established.scorecard)
        let flowd: BrandScorecardView = try await h.api.brandScorecard(brandId: "br_flowd")
        XCTAssertTrue(flowd.isNew, "A brand with no Scorecard reads as new, never as a made-up number.")
        XCTAssertNil(flowd.scorecard)
        XCTAssertTrue(flowd.components.isEmpty)
    }

    // MARK: Saves

    func testSavingAndUnsavingABounty() async throws {
        let h: MockHarness = TestSupport.harness()
        let id: String = "bnty_flowd_starter_3"
        let save: BountySave = try await h.api.saveBounty(id: id)
        XCTAssertEqual(save.stage, .saved)
        let again: BountySave = try await h.api.saveBounty(id: id)
        XCTAssertEqual(again.id, save.id, "Saving twice keeps one row.")
        let saved: [SavedBounty] = try await h.api.savedBounties()
        XCTAssertTrue(saved.contains(where: { (s: SavedBounty) -> Bool in
            return s.save.bountyId == id
        }))
        try await h.api.unsaveBounty(id: id)
        let after: [SavedBounty] = try await h.api.savedBounties()
        XCTAssertFalse(after.contains(where: { (s: SavedBounty) -> Bool in
            return s.save.bountyId == id
        }))
    }

    func testAJoinedBountyStaysSavedWhenUnsavedBecauseTheClaimIsNotASave() async throws {
        let h: MockHarness = TestSupport.harness()
        try await h.api.unsaveBounty(id: "bnty_stridely_plantopr")
        let saved: [SavedBounty] = try await h.api.savedBounties()
        XCTAssertTrue(saved.contains(where: { (s: SavedBounty) -> Bool in
            return s.save.bountyId == "bnty_stridely_plantopr" && s.save.stage == .joined
        }))
    }

    // MARK: Making it (claiming a place)

    func testJoiningReservesAPlaceForTwentyFourHours() async throws {
        let h: MockHarness = TestSupport.harness()
        let save: BountySave = try await h.api.joinBounty(id: "bnty_flowd_starter_3")
        XCTAssertEqual(save.stage, .joined)
        XCTAssertEqual(save.claimedUntil, FlowdCalendar.addHours(FlowdClock.demoNow, 24))
        let detail: BountyDetail = try await h.api.bountyDetail(id: "bnty_flowd_starter_3")
        XCTAssertTrue(detail.state.joined)
        XCTAssertEqual(detail.state.claimedUntil, save.claimedUntil)
    }

    func testAClaimThatIsNotUsedWithinTwentyFourHoursGoesBackToSaved() async throws {
        let h: MockHarness = TestSupport.harness()
        _ = try await h.api.joinBounty(id: "bnty_flowd_starter_3")
        _ = try await h.api.advanceDemoClock(hours: 25)
        let saved: [SavedBounty] = try await h.api.savedBounties()
        let row: SavedBounty? = saved.first(where: { (s: SavedBounty) -> Bool in
            return s.save.bountyId == "bnty_flowd_starter_3"
        })
        XCTAssertEqual(row?.save.stage, .saved)
        XCTAssertNil(row?.save.claimedUntil)
    }

    func testJoiningAfterSubmittingIsRefused() async throws {
        let h: MockHarness = TestSupport.harness()
        _ = try await TestSupport.submitTake(h.api, bountyId: "bnty_flowd_starter_2")
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.joinBounty(id: "bnty_flowd_starter_2")
        }
        guard case .conflict? = error as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: error))
            return
        }
    }

    // MARK: The Daily Drop

    func testTodaysDropIsUpcomingBeforeSixteenHundredUtcWithTrueInventory() async throws {
        let h: MockHarness = TestSupport.harness()
        let drop: DailyDropView = try await h.api.todayDrop()
        XCTAssertEqual(drop.drop.date, "2026-10-03")
        XCTAssertEqual(drop.state, .upcoming)
        XCTAssertEqual(drop.releaseAt, TestSupport.date("2026-10-03T16:00:00Z"))
        XCTAssertEqual(drop.claimWindowEndsAt, TestSupport.date("2026-10-04T16:00:00Z"))
        XCTAssertEqual(drop.nextDropAt, TestSupport.date("2026-10-04T16:00:00Z"))
        XCTAssertFalse(drop.items.isEmpty)
        let total: Int = drop.items.reduce(0) { (sum: Int, item: DropItemView) -> Int in
            return sum + item.spotsLeft
        }
        XCTAssertEqual(total, drop.drop.spotsLeft, "The headline count is the sum of the real per-bounty spots.")
        for item in drop.items {
            XCTAssertLessThanOrEqual(item.spotsLeft, item.spotsTotal)
            XCTAssertFalse(item.claimedByMe)
        }
    }

    func testAClaimBeforeTheDropIsLiveIsRefusedWithTheReleaseTime() async throws {
        let h: MockHarness = TestSupport.harness()
        let drop: DailyDropView = try await h.api.todayDrop()
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.claimDropSpot(dropId: drop.drop.id, bountyId: "bnty_dozely_winddown")
        }
        guard case .conflict(let message)? = error as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: error))
            return
        }
        XCTAssertTrue(message.contains("opens at"), message)
    }

    func testClaimingASpotWhenTheDropGoesLiveTakesOneRealSpotAndIsIdempotent() async throws {
        let h: MockHarness = TestSupport.harness()
        let upcoming: DailyDropView = try await h.api.todayDrop()
        _ = try await h.api.advanceDemoClock(hours: 3)
        let live: DailyDropView = try await h.api.todayDrop()
        XCTAssertEqual(live.state, .live)
        let before: DropItemView = try XCTUnwrap(live.items.first(where: { (item: DropItemView) -> Bool in
            return item.item.bounty.id == "bnty_dozely_winddown"
        }))
        let save: BountySave = try await h.api.claimDropSpot(dropId: live.drop.id, bountyId: "bnty_dozely_winddown", idempotencyKey: "claim-1")
        XCTAssertEqual(save.stage, .joined)
        XCTAssertEqual(save.dropId, live.drop.id)
        XCTAssertEqual(save.claimedUntil, FlowdCalendar.addHours(h.clock.now, 24))
        let again: BountySave = try await h.api.claimDropSpot(dropId: live.drop.id, bountyId: "bnty_dozely_winddown", idempotencyKey: "claim-1")
        XCTAssertEqual(again.id, save.id)

        let after: DailyDropView = try await h.api.todayDrop()
        let item: DropItemView = try XCTUnwrap(after.items.first(where: { (i: DropItemView) -> Bool in
            return i.item.bounty.id == "bnty_dozely_winddown"
        }))
        XCTAssertEqual(item.spotsLeft, before.spotsLeft - 1, "One claim takes exactly one real spot.")
        XCTAssertTrue(item.claimedByMe)
        XCTAssertEqual(after.drop.spotsLeft, live.drop.spotsLeft - 1)
        XCTAssertEqual(after.drop.id, upcoming.drop.id)

        let second: Error? = await TestSupport.thrownError {
            _ = try await h.api.claimDropSpot(dropId: live.drop.id, bountyId: "bnty_dozely_winddown", idempotencyKey: "claim-2")
        }
        guard case .conflict? = second as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: second))
            return
        }
    }

    func testAClaimOnABountyThatIsNotInTheDropIsNotFound() async throws {
        let h: MockHarness = TestSupport.harness()
        _ = try await h.api.advanceDemoClock(hours: 3)
        let live: DailyDropView = try await h.api.todayDrop()
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.claimDropSpot(dropId: live.drop.id, bountyId: "bnty_flowd_starter_2")
        }
        guard case .notFound? = error as? FlowdAPIError else {
            XCTFail("Expected not found, got " + String(describing: error))
            return
        }
    }

    func testYesterdaysDropClosesAndTheNextOneGoesLiveAtSixteenHundredUtc() async throws {
        let h: MockHarness = TestSupport.harness()
        _ = try await h.api.advanceDemoClock(hours: 27)
        let drop: DailyDropView = try await h.api.todayDrop()
        XCTAssertEqual(drop.drop.date, "2026-10-04")
        XCTAssertEqual(drop.state, .live)
        let history: [DailyDrop] = try await h.api.dropHistory()
        XCTAssertTrue(history.allSatisfy { (d: DailyDrop) -> Bool in
            return d.releaseAt <= h.clock.now
        })
        let yesterday: DailyDrop? = history.first(where: { (d: DailyDrop) -> Bool in
            return d.date == "2026-10-03"
        })
        XCTAssertEqual(yesterday?.status, .closed, "A drop whose 24-hour claim window ended is closed; its unclaimed spots are back in the open feed.")
    }
}
