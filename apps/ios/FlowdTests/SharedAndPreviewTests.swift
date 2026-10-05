import XCTest
@testable import Flowd

/// The code compiled into both the app and the widget (Live Activity attributes, the App Group snapshot), the bridges that feed them, and the embedded
/// preview rows (which must stay identical to the fixtures they were cut from).
final class SharedTests: XCTestCase {
    private func temporaryFolder() throws -> URL {
        let folder: URL = FileManager.default.temporaryDirectory.appendingPathComponent("flowd-widget-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    // MARK: Widget snapshot

    func testTheSnapshotSurvivesAWriteAndReadThroughTheSharedFolder() throws {
        let folder: URL = try temporaryFolder()
        defer {
            try? FileManager.default.removeItem(at: folder)
        }
        let snapshot: FlowdWidgetSnapshot = FlowdWidgetSnapshot.placeholder
        XCTAssertNil(WidgetSnapshotStore.read(directory: folder), "Nothing was written yet.")
        let written: Bool = try WidgetSnapshotStore.write(snapshot, directory: folder)
        XCTAssertTrue(written)
        XCTAssertEqual(WidgetSnapshotStore.read(directory: folder), snapshot)
        XCTAssertEqual(WidgetSnapshotStore.fileURL(directory: folder)?.lastPathComponent, "widget-snapshot.json")
        WidgetSnapshotStore.remove(directory: folder)
        XCTAssertNil(WidgetSnapshotStore.read(directory: folder))
    }

    func testAnOlderWidgetNeverMisreadsASnapshotFromANewerApp() throws {
        let folder: URL = try temporaryFolder()
        defer {
            try? FileManager.default.removeItem(at: folder)
        }
        var future: FlowdWidgetSnapshot = FlowdWidgetSnapshot.placeholder
        future.schemaVersion = FlowdWidgetSnapshot.currentSchemaVersion + 1
        _ = try WidgetSnapshotStore.write(future, directory: folder)
        XCTAssertNil(WidgetSnapshotStore.read(directory: folder))
        try Data("not json".utf8).write(to: try XCTUnwrap(WidgetSnapshotStore.fileURL(directory: folder)))
        XCTAssertNil(WidgetSnapshotStore.read(directory: folder), "A corrupt file reads as no snapshot.")
    }

    func testThePlaceholderIsTheDemoWorldAtItsNow() {
        let p: FlowdWidgetSnapshot = FlowdWidgetSnapshot.placeholder
        XCTAssertEqual(p.updatedAt, FlowdClock.demoNow)
        XCTAssertEqual(p.nextClearsAt, TestSupport.date("2026-10-04T14:00:00Z"))
        XCTAssertEqual(p.nextPayoutAt, TestSupport.date("2026-10-09T18:00:00Z"))
        XCTAssertEqual(p.dropReleaseAt, TestSupport.date("2026-10-03T16:00:00Z"))
        XCTAssertEqual(p.handle, "maya.makes")
        XCTAssertEqual(p.tier, "silver")
        XCTAssertTrue(p.isDemo)
        XCTAssertEqual(p.schemaVersion, FlowdWidgetSnapshot.currentSchemaVersion)
    }

    func testThePlaceholderMatchesWhatTheMockWorldActuallyShows() async throws {
        let h: MockHarness = TestSupport.harness()
        let wallet: WalletSummary = try await h.api.wallet()
        let streak: StreakSummary = try await h.api.streak()
        let drop: DailyDropView = try await h.api.todayDrop()
        let creator: Creator = try await h.api.me()
        let wellbeing: WellbeingSettings = try await h.api.wellbeing()
        let built: FlowdWidgetSnapshot = WidgetSnapshotBuilder.snapshot(
            creator: creator, wallet: wallet, streak: streak, drop: drop, wellbeing: wellbeing, isDemo: true, now: FlowdClock.demoNow
        )
        XCTAssertEqual(built, FlowdWidgetSnapshot.placeholder, "The widget gallery shows the same numbers the running demo does.")
    }

    func testClearedAndPendingAreTwoNumbersAndNumbersOffHidesBoth() {
        var p: FlowdWidgetSnapshot = FlowdWidgetSnapshot.placeholder
        XCTAssertEqual(p.clearedText(), "$86.00")
        XCTAssertEqual(p.pendingText(), "$212.00")
        p.numbersHidden = true
        XCTAssertEqual(p.clearedText(), "Cleared")
        XCTAssertEqual(p.pendingText(), "Pending")
    }

    func testASnapshotGrowsStaleAfterSixHoursAndTheWidgetSaysSo() {
        let p: FlowdWidgetSnapshot = FlowdWidgetSnapshot.placeholder
        XCTAssertEqual(p.ageMinutes(at: p.updatedAt.addingTimeInterval(90 * 60)), 90)
        XCTAssertEqual(p.ageMinutes(at: p.updatedAt.addingTimeInterval(-600)), 0)
        XCTAssertFalse(p.isStale(at: p.updatedAt.addingTimeInterval(360 * 60)))
        XCTAssertTrue(p.isStale(at: p.updatedAt.addingTimeInterval(361 * 60)))
    }

    func testNumbersOffFollowsTheWellbeingWindowInTheCreatorsTimeZone() {
        var settings: WellbeingSettings = WellbeingSettings(
            id: "wb_x", creatorId: "cr_x", enabled: true,
            quietHours: QuietHours(enabled: true, start: "22:00", end: "08:00", timezone: "America/Chicago"),
            numbersOff: NumbersOff(enabled: true, from: nil, to: nil),
            paceGoal: PaceGoal(enabled: false, postsPerWeek: nil),
            pausedUntil: nil, restWeeks: [], leaderboardOptOut: false, slackMode: false, updatedAt: FlowdClock.demoNow
        )
        XCTAssertTrue(WidgetSnapshotBuilder.numbersHidden(settings, at: FlowdClock.demoNow), "No hours set: always hidden while on.")
        settings.numbersOff = NumbersOff(enabled: true, from: "20:00", to: "08:00")
        XCTAssertFalse(WidgetSnapshotBuilder.numbersHidden(settings, at: FlowdClock.demoNow), "09:00 in Chicago is outside the window.")
        XCTAssertTrue(WidgetSnapshotBuilder.numbersHidden(settings, at: TestSupport.date("2026-10-04T03:00:00Z")))
        settings.enabled = false
        XCTAssertFalse(WidgetSnapshotBuilder.numbersHidden(settings, at: TestSupport.date("2026-10-04T03:00:00Z")))
        XCTAssertFalse(WidgetSnapshotBuilder.numbersHidden(nil, at: FlowdClock.demoNow))
    }

    // MARK: Live Activity

    func testTheActivityAttributesCarryTheWindowAndDeepLinkToThePost() {
        let post: Post = PreviewData.livePost
        let bounty: Bounty = PreviewData.bounty
        let attributes: FlowdEarningsActivityAttributes = EarningsActivityBuilder.attributes(post: post, bounty: bounty, brandName: PreviewData.brand.name)
        XCTAssertEqual(attributes.postId, post.id)
        XCTAssertEqual(attributes.deepLink, "flowd://post/" + post.id)
        XCTAssertEqual(DeepLink.parse(attributes.deepLink), .post(id: post.id))
        XCTAssertEqual(attributes.windowEndsAt, post.windowEndsAt)
        XCTAssertEqual(attributes.perVideoCapCents, bounty.perVideoCapCents)
        XCTAssertEqual(attributes.platformName, post.platform.label)
        XCTAssertEqual(attributes.windowProgress(at: post.postedAt), 0, accuracy: 0.0001)
        XCTAssertEqual(attributes.windowProgress(at: post.windowEndsAt), 1, accuracy: 0.0001)
        let middle: Date = post.postedAt.addingTimeInterval(post.windowEndsAt.timeIntervalSince(post.postedAt) / 2)
        XCTAssertEqual(attributes.windowProgress(at: middle), 0.5, accuracy: 0.0001)
        XCTAssertEqual(attributes.windowProgress(at: post.windowEndsAt.addingTimeInterval(3_600)), 1, accuracy: 0.0001, "Never past 100%.")
    }

    func testTheActivityStateNamesTheDatedReasonInEveryPhase() {
        let post: Post = PreviewData.livePost
        let live: FlowdEarningsActivityAttributes.ContentState = EarningsActivityBuilder.state(post: post, rows: [], now: post.postedAt.addingTimeInterval(3_600))
        XCTAssertEqual(live.phase, .counting)
        XCTAssertFalse(live.phase.isFinal)
        XCTAssertFalse(live.reason.isEmpty, "Never a bare pending.")
        XCTAssertEqual(live.etaAt, MoneyClockEngine.postClearingRun(windowEnd: post.windowEndsAt))

        let cleared: MoneyClockRow = PreviewData.clearedMoneyRow
        let done: FlowdEarningsActivityAttributes.ContentState = EarningsActivityBuilder.state(post: PreviewData.clearedPost, rows: [cleared], now: FlowdClock.demoNow)
        XCTAssertEqual(done.phase, .cleared)
        XCTAssertTrue(done.phase.isFinal)
        XCTAssertEqual(done.earnedCents, cleared.amountCents)
        XCTAssertTrue(done.reason.hasPrefix("Cleared. Pays out"), done.reason)

        let pending: MoneyClockRow = PreviewData.pendingMoneyRow
        let checking: FlowdEarningsActivityAttributes.ContentState = EarningsActivityBuilder.state(post: PreviewData.clearedPost, rows: [pending], now: FlowdClock.demoNow)
        XCTAssertTrue(checking.phase == .checking || checking.phase == .awaitingClearingRun)
        XCTAssertEqual(checking.etaAt, pending.etaAt)
    }

    func testEveryPhaseHasACalmShortTitleAndTheContractsRawValue() {
        let phases: [FlowdEarningsActivityAttributes.ContentState.Phase] = [.counting, .checking, .awaitingClearingRun, .cleared, .paid, .held]
        XCTAssertEqual(phases.map { (p: FlowdEarningsActivityAttributes.ContentState.Phase) -> String in return p.shortTitle }, ["Counting", "Checking", "Clearing soon", "Cleared", "Paid", "On hold"])
        XCTAssertEqual(FlowdEarningsActivityAttributes.ContentState.Phase.awaitingClearingRun.rawValue, "awaiting_clearing_run")
        XCTAssertEqual(phases.filter { (p: FlowdEarningsActivityAttributes.ContentState.Phase) -> Bool in return p.isFinal }.count, 5)
    }

    func testTheActivityStateRoundTripsThroughJson() throws {
        let state: FlowdEarningsActivityAttributes.ContentState = FlowdEarningsActivityAttributes.ContentState(
            earnedCents: 4_389, views: 14_200, phase: .counting, etaAt: TestSupport.date("2026-10-07T14:00:00Z"), reason: "Views still counting.", updatedAt: FlowdClock.demoNow
        )
        let data: Data = try JSONEncoder().encode(state)
        let back: FlowdEarningsActivityAttributes.ContentState = try JSONDecoder().decode(FlowdEarningsActivityAttributes.ContentState.self, from: data)
        XCTAssertEqual(back, state)
    }
}

/// The hero rows embedded for previews (`PreviewHeroes`, generated) must equal the fixture rows they were cut from; if the contract moves, this fails first.
final class PreviewDataTests: XCTestCase {
    private func expectHero<T: Codable & Identifiable & Equatable>(_ hero: T, table: String, file: StaticString = #filePath, line: UInt = #line) throws where T.ID == String {
        let rows: [T] = try TestSupport.loader().load([T].self, named: table)
        guard let match = rows.first(where: { (row: T) -> Bool in return row.id == hero.id }) else {
            XCTFail("PreviewHeroes holds " + hero.id + ", which is not in " + table, file: file, line: line)
            return
        }
        XCTAssertEqual(match, hero, table + " row " + hero.id + " drifted from the embedded hero. Run node scripts/gen-ios-preview.mjs.", file: file, line: line)
    }

    func testEveryEmbeddedHeroRowEqualsItsFixtureRow() throws {
        try expectHero(PreviewData.creator, table: "creators")
        try expectHero(PreviewData.user, table: "users")
        try expectHero(PreviewData.brand, table: "brands")
        try expectHero(PreviewData.app, table: "apps")
        try expectHero(PreviewData.scorecard, table: "brand_scorecards")
        try expectHero(PreviewData.bounty, table: "bounties")
        try expectHero(PreviewData.starterBounty, table: "bounties")
        try expectHero(PreviewData.livePost, table: "posts")
        try expectHero(PreviewData.clearedPost, table: "posts")
        try expectHero(PreviewData.paidPost, table: "posts")
        try expectHero(PreviewData.approvedSubmission, table: "submissions")
        try expectHero(PreviewData.inReviewSubmission, table: "submissions")
        try expectHero(PreviewData.changesSubmission, table: "submissions")
        try expectHero(PreviewData.rejectedSubmission, table: "submissions")
        try expectHero(PreviewData.clearedMoneyRow, table: "money_clock")
        try expectHero(PreviewData.pendingMoneyRow, table: "money_clock")
        try expectHero(PreviewData.scheduledPayout, table: "payouts")
        try expectHero(PreviewData.inTransitPayout, table: "payouts")
        try expectHero(PreviewData.offer, table: "offers")
        try expectHero(PreviewData.notification, table: "notifications")
    }

    func testTheHeroesTellTheStatesTheirNamesPromise() {
        XCTAssertEqual(PreviewData.creator.tier, .silver)
        XCTAssertEqual(PreviewData.livePost.status, .live)
        XCTAssertEqual(PreviewData.clearedPost.status, .cleared)
        XCTAssertEqual(PreviewData.paidPost.status, .paid)
        XCTAssertEqual(PreviewData.approvedSubmission.status, .approved)
        XCTAssertEqual(PreviewData.inReviewSubmission.status, .inReview)
        XCTAssertEqual(PreviewData.changesSubmission.status, .changesRequested)
        XCTAssertEqual(PreviewData.rejectedSubmission.status, .rejected)
        XCTAssertEqual(PreviewData.clearedMoneyRow.state, .cleared)
        XCTAssertEqual(PreviewData.pendingMoneyRow.state, .pending)
        XCTAssertEqual(PreviewData.scheduledPayout.status, .scheduled)
        XCTAssertEqual(PreviewData.inTransitPayout.status, .inTransit)
        XCTAssertEqual(PreviewData.offer.status, .awaitingCreator)
        XCTAssertTrue(PreviewData.starterBounty.isStarter)
    }

    func testThePreviewTablesAreTheDemoWorldAndTheWalletMatchesTheMock() async throws {
        XCTAssertEqual(PreviewData.creators.count, 90)
        XCTAssertEqual(PreviewData.bounties.count, 49)
        XCTAssertFalse(PreviewData.liveBounties.isEmpty)
        XCTAssertFalse(PreviewData.feedItems.isEmpty)
        XCTAssertLessThanOrEqual(PreviewData.feedItems.count, 8)
        let preview: WalletSummary = PreviewData.walletSummary
        let mock: WalletSummary = try await TestSupport.harness().api.wallet()
        XCTAssertEqual(preview.clearedCents, mock.clearedCents)
        XCTAssertEqual(preview.pendingCents, mock.pendingCents)
        XCTAssertEqual(preview.accruingCents, mock.accruingCents)
        XCTAssertEqual(preview.paidOutCents, mock.paidOutCents)
        XCTAssertEqual(preview.nextClearsCents, mock.nextClearsCents)
        XCTAssertEqual(preview.nextPayoutAt, mock.nextPayoutAt)
    }

    func testAFeedCardShowsTheEstimateNeverAGuarantee() {
        let item: FeedItem = PreviewData.feedItem()
        XCTAssertEqual(item.expectedPay.disclaimer, EarningsEngine.disclaimer)
        XCTAssertEqual(item.spotsLeft, item.bounty.spotsLeft)
        let locked: FeedItem = PreviewData.feedItem(locked: true)
        XCTAssertNil(locked.matchScore)
        XCTAssertFalse(locked.lockReasons.isEmpty)
    }

    func testAPreviewMockStartsSignedInOnAFrozenClock() async throws {
        let api: MockFlowdAPI = PreviewData.api()
        let me: Creator = try await api.me()
        XCTAssertEqual(me.id, "cr_maya")
        let signedOut: MockFlowdAPI = PreviewData.api(signedIn: false)
        let none: CreatorSession? = try await signedOut.currentSession()
        XCTAssertNil(none)
    }
}
