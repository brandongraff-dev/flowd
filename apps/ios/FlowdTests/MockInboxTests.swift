import XCTest
@testable import Flowd

/// The activity feed, in-app threads with Scam Shield, scam reports, and Flo (a deterministic mock engine behind `AIProvider`).
final class MockInboxTests: XCTestCase {
    // MARK: Activity

    func testActivityIsNewestFirstAndNeverContainsTheFuture() async throws {
        let h: MockHarness = TestSupport.harness()
        let all: [AppNotification] = try await h.api.notifications()
        XCTAssertEqual(all.count, 60)
        let dates: [Date] = all.map { (n: AppNotification) -> Date in
            return n.createdAt
        }
        XCTAssertEqual(dates, dates.sorted(by: >))
        XCTAssertTrue(all.allSatisfy { (n: AppNotification) -> Bool in
            return n.createdAt <= FlowdClock.demoNow
        })
        XCTAssertTrue(all.allSatisfy { (n: AppNotification) -> Bool in
            return n.recipientUserId == "usr_maya"
        })
    }

    func testEachFilterShowsOnlyItsOwnCategory() async throws {
        let h: MockHarness = TestSupport.harness()
        let money: [AppNotification] = try await h.api.notifications(filter: .money)
        XCTAssertFalse(money.isEmpty)
        XCTAssertTrue(money.allSatisfy { (n: AppNotification) -> Bool in return n.kind.category == .money })
        let reviews: [AppNotification] = try await h.api.notifications(filter: .reviews)
        XCTAssertFalse(reviews.isEmpty)
        XCTAssertTrue(reviews.allSatisfy { (n: AppNotification) -> Bool in return n.kind.category == .reviews })
        let offers: [AppNotification] = try await h.api.notifications(filter: .offers)
        XCTAssertTrue(offers.allSatisfy { (n: AppNotification) -> Bool in return n.kind.category == .offers })
        let tier: [AppNotification] = try await h.api.notifications(filter: .tier)
        XCTAssertTrue(tier.allSatisfy { (n: AppNotification) -> Bool in
            return n.kind == .tierUp || n.kind == .streakMilestone || n.kind == .academyBadge
        })
    }

    func testMarkingReadTouchesOnlyTheGivenIdsAndAnEmptyListMarksEverything() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: [AppNotification] = try await h.api.notifications()
        let unread: [AppNotification] = before.filter { (n: AppNotification) -> Bool in
            return n.readAt == nil
        }
        XCTAssertEqual(unread.count, 8)
        let first: AppNotification = try XCTUnwrap(unread.first)
        try await h.api.markNotificationsRead(ids: [first.id])
        let middle: [AppNotification] = try await h.api.notifications()
        XCTAssertEqual(middle.filter { (n: AppNotification) -> Bool in return n.readAt == nil }.count, 7)
        XCTAssertNotNil(middle.first(where: { (n: AppNotification) -> Bool in return n.id == first.id })?.readAt)
        try await h.api.markNotificationsRead(ids: [])
        let after: [AppNotification] = try await h.api.notifications()
        XCTAssertTrue(after.allSatisfy { (n: AppNotification) -> Bool in return n.readAt != nil })
    }

    func testHomeSummaryComposesEverythingOnePullNeedsAndCountsUnreadFromActivity() async throws {
        let h: MockHarness = TestSupport.harness()
        let home: HomeSummary = try await h.api.homeSummary()
        XCTAssertEqual(home.creator.id, "cr_maya")
        XCTAssertEqual(home.unreadCount, 8)
        XCTAssertTrue(home.liveDemo)
        XCTAssertLessThanOrEqual(home.activeSubmissions.count, 6)
        XCTAssertLessThanOrEqual(home.matched.count, 8)
        XCTAssertLessThanOrEqual(home.recentActivity.count, 5)
        XCTAssertNotNil(home.drop)
        XCTAssertEqual(home.wallet.tier, .silver)
        XCTAssertEqual(home.streak.streak.currentWeeks, 6)
        XCTAssertNil(home.firstDollar, "Maya's First-Dollar tracker is retired.")
        XCTAssertNotNil(home.nextLesson)
    }

    // MARK: Threads and Scam Shield

    func testThreadsListACounterpartAndTheirUnreadCount() async throws {
        let h: MockHarness = TestSupport.harness()
        let threads: [InboxThread] = try await h.api.threads()
        XCTAssertEqual(threads.count, 9)
        for item in threads {
            XCTAssertFalse(item.counterpart.isEmpty, item.id)
            XCTAssertFalse(item.kindLabel.isEmpty, item.id)
        }
        let first: InboxThread = try XCTUnwrap(threads.first)
        let same: InboxThread = try await h.api.thread(id: first.thread.id)
        XCTAssertEqual(same.thread.id, first.thread.id)
        let missing: Error? = await TestSupport.thrownError {
            _ = try await h.api.thread(id: "thr_nope")
        }
        guard case .notFound? = missing as? FlowdAPIError else {
            XCTFail("Expected not found, got " + String(describing: missing))
            return
        }
    }

    func testACleanMessageIsAppendedAndAMessageThatLeavesTheAppIsAnnotatedNeverDeleted() async throws {
        let h: MockHarness = TestSupport.harness()
        let listed: [InboxThread] = try await h.api.threads()
        let thread: InboxThread = try XCTUnwrap(listed.first)
        let start: Int = thread.thread.messages.count

        let clean: InboxThread = try await h.api.sendMessage(threadId: thread.thread.id, body: "Thanks, I will send the second take tomorrow.")
        XCTAssertEqual(clean.thread.messages.count, start + 1)
        XCTAssertNil(clean.thread.messages.last?.warningCode)

        let risky: InboxThread = try await h.api.sendMessage(threadId: thread.thread.id, body: "Can we move this chat to WhatsApp instead?")
        XCTAssertEqual(risky.thread.messages.count, start + 3, "The message stays, and a warning is added next to it.")
        let messages: [ChatMessage] = risky.thread.messages
        let original: ChatMessage = messages[messages.count - 2]
        let warning: ChatMessage = messages[messages.count - 1]
        XCTAssertEqual(original.body, "Can we move this chat to WhatsApp instead?")
        XCTAssertEqual(original.warningCode, .offPlatformChat)
        XCTAssertEqual(warning.kind, .warning)
        XCTAssertEqual(warning.authorRole, .system)
        XCTAssertEqual(warning.body, ScamShield.copy(for: .offPlatformChat))
        XCTAssertTrue(warning.body.contains("Keep this conversation in flowd"))
    }

    func testAnEmptyMessageIsRefusedAndAnUnknownThreadIsNotFound() async throws {
        let h: MockHarness = TestSupport.harness()
        let listed: [InboxThread] = try await h.api.threads()
        let thread: InboxThread = try XCTUnwrap(listed.first)
        let empty: Error? = await TestSupport.thrownError {
            _ = try await h.api.sendMessage(threadId: thread.thread.id, body: "   ")
        }
        guard case .validationFailed? = empty as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: empty))
            return
        }
        let missing: Error? = await TestSupport.thrownError {
            _ = try await h.api.sendMessage(threadId: "thr_nope", body: "Hello")
        }
        guard case .notFound? = missing as? FlowdAPIError else {
            XCTFail("Expected not found, got " + String(describing: missing))
            return
        }
    }

    // MARK: Scam reports

    func testAScamReportGetsACaseIdAndAFortyEightHourSla() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: [ScamReport] = try await h.api.myReports()
        let report: ScamReport = try await h.api.reportScam(ScamReportRequest(
            targetKind: .message,
            targetId: "msg_0001",
            reason: .offPlatformChat,
            description: "They asked me to continue on WhatsApp and send my bank details.",
            evidenceRefs: ["screenshot-1.png"],
            idempotencyKey: "report-1"
        ))
        XCTAssertEqual(report.status, .new)
        XCTAssertEqual(report.reporterCreatorId, "cr_maya")
        XCTAssertTrue(report.caseId.hasPrefix("SR-2026-"), report.caseId)
        XCTAssertEqual(report.slaDueAt, FlowdCalendar.addHours(FlowdClock.demoNow, 48))
        XCTAssertEqual(report.evidenceRefs, ["screenshot-1.png"])

        let again: ScamReport = try await h.api.reportScam(ScamReportRequest(
            targetKind: .message,
            targetId: "msg_0001",
            reason: .offPlatformChat,
            description: "They asked me to continue on WhatsApp and send my bank details.",
            idempotencyKey: "report-1"
        ))
        XCTAssertEqual(again.id, report.id, "A double tap files one report.")
        let after: [ScamReport] = try await h.api.myReports()
        XCTAssertEqual(after.count, before.count + 1)
        XCTAssertEqual(after.first?.id, report.id, "Newest first.")
    }

    func testAScamReportNeedsASentenceOfExplanation() async throws {
        let h: MockHarness = TestSupport.harness()
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.reportScam(ScamReportRequest(targetKind: .brand, targetId: "br_lumi", reason: .other, description: "bad"))
        }
        guard case .validationFailed? = error as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: error))
            return
        }
    }

    // MARK: Flo

    func testFloAnswersDeterministicallyAndKeepsAHistoryTheCreatorCanRate() async throws {
        let h: MockHarness = TestSupport.harness()
        let request: FloRequest = FloRequest(
            surface: .bountyDetail,
            kind: .script,
            prompt: "Write me a 20-second script",
            bountyId: "bnty_flowd_starter_2"
        )
        let first: FloSuggestion = try await h.api.flo(request)
        let second: FloSuggestion = try await h.api.flo(request)
        XCTAssertFalse(first.outputs.isEmpty)
        XCTAssertEqual(first.outputs, second.outputs, "Same request in, same answer out.")
        XCTAssertEqual(first.model, MockAIProvider.modelName)
        XCTAssertEqual(first.creatorId, "cr_maya")
        XCTAssertEqual(first.contextId, "bnty_flowd_starter_2")
        XCTAssertNotEqual(first.id, second.id)
        XCTAssertNil(first.helpful)

        let history: [FloSuggestion] = try await h.api.floHistory()
        XCTAssertEqual(history.first?.id, second.id, "Newest first.")
        let rated: FloSuggestion = try await h.api.rateFloSuggestion(id: first.id, helpful: true)
        XCTAssertEqual(rated.helpful, true)
        let missing: Error? = await TestSupport.thrownError {
            _ = try await h.api.rateFloSuggestion(id: "flo_nope", helpful: false)
        }
        guard case .notFound? = missing as? FlowdAPIError else {
            XCTFail("Expected not found, got " + String(describing: missing))
            return
        }
    }

    func testFloKeepsBrandOnlyRequestsOutOfTheCreatorApp() async throws {
        let h: MockHarness = TestSupport.harness()
        let answer: FloSuggestion = try await h.api.flo(FloRequest(surface: .builder, kind: .bountyDraft, prompt: "Draft a bounty"))
        XCTAssertEqual(answer.title, "That one is for brands")
        XCTAssertTrue(answer.actions.isEmpty)
    }

    func testFloSuggestsTheNextActionFromWhatIsApprovedAndWaiting() async throws {
        let h: MockHarness = TestSupport.harness()
        let answer: FloSuggestion = try await h.api.flo(FloRequest(surface: .home, kind: .nextAction, prompt: "What should I do next?"))
        XCTAssertFalse(answer.outputs.isEmpty)
        let joined: String = answer.outputs.joined(separator: " ")
        XCTAssertTrue(joined.contains("Post"), "Maya has an approved video waiting to be posted: " + joined)
    }
}
