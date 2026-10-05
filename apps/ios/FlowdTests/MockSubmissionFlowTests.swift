import XCTest
@testable import Flowd

/// The creator's core loop against the offline API: submit a take (a Reserved Slot is taken), the brand decides, the post opens the 72-hour window,
/// the window closes, the 14:00 UTC run clears the money and the Friday 18:00 UTC run pays it.
final class MockSubmissionFlowTests: XCTestCase {
    /// The flowd-funded starter bounty: a flat $5.00 on approval, no take rate, 25 videos' worth of pool left.
    private let starter: String = "bnty_flowd_starter_2"

    // MARK: Submitting

    func testSubmittingTakesAReservedSlotAndStartsTheSeventyTwoHourReview() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: Bounty = try await h.api.bountyDetail(id: starter).item.bounty
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        XCTAssertEqual(submission.status, .inReview)
        XCTAssertEqual(submission.version, 1)
        XCTAssertEqual(submission.creatorId, "cr_maya")
        XCTAssertEqual(submission.reservedCents, before.reservationUnitCents)
        XCTAssertEqual(submission.reservedCents, 500)
        XCTAssertEqual(submission.slaDueAt, FlowdCalendar.addHours(FlowdClock.demoNow, 72))
        XCTAssertEqual(submission.slaState, .onTrack)
        XCTAssertEqual(submission.hookPoints, 78)
        XCTAssertEqual(submission.flowBand, .b)

        let after: Bounty = try await h.api.bountyDetail(id: starter).item.bounty
        XCTAssertEqual(after.reservedCents, before.reservedCents + 500)
        XCTAssertEqual(after.remainingCents, before.remainingCents - 500)
        XCTAssertTrue(SettlementEngine.escrowIdentityHolds(after), "escrow funded = reserved + spent + remaining + refunded")
        XCTAssertEqual(after.spotsLeft, before.spotsLeft - 1)
    }

    func testSubmittingWithoutScoresRunsTheOnDeviceStyleAnalysisAndStoresIt() async throws {
        let h: MockHarness = TestSupport.harness()
        let upload: UploadSession = try await h.api.beginUpload(UploadRequest(fileName: "raw.mp4", sizeBytes: 9_000_000, durationMs: 21_000))
        let submission: Submission = try await h.api.submit(SubmitRequest(
            bountyId: starter,
            title: "Unscored take",
            video: TestSupport.video(assetId: upload.assetId, durationMs: 21_000),
            hookText: "I found the app that tracks every subscription I forgot about"
        ))
        XCTAssertLessThanOrEqual(submission.hookPoints, 100)
        XCTAssertLessThanOrEqual(submission.flowPoints, 100)
        XCTAssertGreaterThan(submission.flowPoints, 0)
        XCTAssertEqual(submission.hookBand, ScoringEngine.band(for: submission.hookPoints))
        XCTAssertEqual(submission.flowBand, ScoringEngine.band(for: submission.flowPoints))
        let analysis: VideoAnalysis? = try await h.api.videoAnalysis(submissionId: submission.id)
        XCTAssertNotNil(analysis, "A take submitted without device scores is analysed so the brand always sees a scored video.")
        XCTAssertEqual(analysis?.hookScore.label, FlowdConstants.checklistLabel)
    }

    func testASubmitIsIdempotent() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: Bounty = try await h.api.bountyDetail(id: starter).item.bounty
        let first: Submission = try await TestSupport.submitTake(h.api, bountyId: starter, idempotencyKey: "key-submit-1")
        let second: Submission = try await TestSupport.submitTake(h.api, bountyId: starter, idempotencyKey: "key-submit-1")
        XCTAssertEqual(first.id, second.id)
        let bounty: Bounty = try await h.api.bountyDetail(id: starter).item.bounty
        let list: [SubmissionListItem] = try await h.api.submissions(filter: .all)
        let mine: [SubmissionListItem] = list.filter { (item: SubmissionListItem) -> Bool in
            return item.submission.bountyId == starter
        }
        XCTAssertEqual(mine.count, 1, "A double tap must not create two submissions.")
        XCTAssertEqual(bounty.reservedCents, before.reservedCents + 500, "The slot is reserved once.")
    }

    func testSubmittingTwiceToTheSameBountyIsRefusedWithAReason() async throws {
        let h: MockHarness = TestSupport.harness()
        _ = try await TestSupport.submitTake(h.api, bountyId: starter)
        let error: Error? = await TestSupport.thrownError {
            _ = try await TestSupport.submitTake(h.api, bountyId: self.starter, title: "Second try")
        }
        guard case .conflict(let message)? = error as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: error))
            return
        }
        XCTAssertTrue(message.contains("already submitted"), message)
    }

    func testTheRightsCardMustBeAcceptedToSubmit() async throws {
        let h: MockHarness = TestSupport.harness()
        let upload: UploadSession = try await h.api.beginUpload(UploadRequest(fileName: "take.mp4", sizeBytes: 9_000_000, durationMs: 20_000))
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.submit(SubmitRequest(bountyId: self.starter, title: "No rights", video: TestSupport.video(assetId: upload.assetId), rightsAccepted: false))
        }
        guard case .validationFailed? = error as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: error))
            return
        }
    }

    func testSubmittingToAnUnknownBountyIsNotFound() async throws {
        let h: MockHarness = TestSupport.harness()
        let error: Error? = await TestSupport.thrownError {
            _ = try await TestSupport.submitTake(h.api, bountyId: "bnty_does_not_exist")
        }
        guard case .notFound? = error as? FlowdAPIError else {
            XCTFail("Expected not found, got " + String(describing: error))
            return
        }
    }

    func testAnEmptyUploadIsRefusedBeforeAnythingIsCreated() async throws {
        let h: MockHarness = TestSupport.harness()
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.beginUpload(UploadRequest(fileName: "empty.mp4", sizeBytes: 0, durationMs: 0))
        }
        guard case .validationFailed? = error as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: error))
            return
        }
    }

    // MARK: Decisions

    func testApprovingIssuesTheTrackingLinkAndUnlocksPosting() async throws {
        let h: MockHarness = TestSupport.harness()
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        let approved: Submission = try await h.api.simulateDecision(submissionId: submission.id, decision: .approve)
        XCTAssertEqual(approved.status, .approved)
        XCTAssertNotNil(approved.linkId)
        XCTAssertNotNil(approved.approvedAt)
        XCTAssertEqual(approved.decision?.action, .approve)
        XCTAssertEqual(approved.decision?.slaMet, true)

        let detail: SubmissionDetail = try await h.api.submissionDetail(id: submission.id)
        XCTAssertTrue(detail.canPost)
        XCTAssertNotNil(detail.link)
        XCTAssertNotNil(detail.trackingLine)
        XCTAssertEqual(detail.captionDraft?.hasPrefix("#ad"), true, "The disclosure always comes first.")
        let notifications: [AppNotification] = try await h.api.notifications(filter: .reviews)
        XCTAssertTrue(notifications.contains(where: { (n: AppNotification) -> Bool in
            return n.kind == .approval && n.refId == submission.id
        }))
    }

    func testARejectionNeedsAReasonAndGivesTheSlotBackToThePool() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: Bounty = try await h.api.bountyDetail(id: starter).item.bounty
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        let rejected: Submission = try await h.api.simulateDecision(
            submissionId: submission.id,
            decision: .reject(reason: .offBrief, summary: "The video does not show the app in the first three seconds.")
        )
        XCTAssertEqual(rejected.status, .rejected)
        XCTAssertEqual(rejected.decision?.reasonCode, .offBrief)
        XCTAssertNotNil(rejected.decision?.evidence, "A rejection carries evidence.")
        XCTAssertEqual(rejected.reservedCents, 0)
        let after: Bounty = try await h.api.bountyDetail(id: starter).item.bounty
        XCTAssertEqual(after.reservedCents, before.reservedCents)
        XCTAssertEqual(after.remainingCents, before.remainingCents)
        let detail: SubmissionDetail = try await h.api.submissionDetail(id: submission.id)
        XCTAssertTrue(detail.canAppeal)
        XCTAssertNotNil(detail.appealDeadline)
    }

    func testOnlyOneAppealIsAllowedPerRejection() async throws {
        let h: MockHarness = TestSupport.harness()
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        _ = try await h.api.simulateDecision(submissionId: submission.id, decision: .reject(reason: .offBrief, summary: "Off brief."))

        let tooShort: Error? = await TestSupport.thrownError {
            _ = try await h.api.appeal(submissionId: submission.id, AppealRequest(reason: "No", note: "no"))
        }
        XCTAssertNotNil(tooShort, "An appeal needs a sentence of explanation.")

        let dispute: Dispute = try await h.api.appeal(
            submissionId: submission.id,
            AppealRequest(reason: "The reason does not match the brief", note: "The brief asks for the app on screen by second three and mine shows it at 2.2 seconds.")
        )
        XCTAssertEqual(dispute.kind, .rejectionAppeal)
        XCTAssertEqual(dispute.status, .open)
        XCTAssertEqual(dispute.submissionId, submission.id)
        let appealed: SubmissionDetail = try await h.api.submissionDetail(id: submission.id)
        XCTAssertEqual(appealed.submission.status, .appealed)
        XCTAssertEqual(appealed.submission.decision?.appealUsed, true)

        let again: Error? = await TestSupport.thrownError {
            _ = try await h.api.appeal(submissionId: submission.id, AppealRequest(reason: "Again", note: "Please look at this one more time, it follows the brief."))
        }
        XCTAssertNotNil(again, "One appeal per rejection.")
    }

    func testChangesRequestedThenARevisionThenApproval() async throws {
        let h: MockHarness = TestSupport.harness()
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        let asked: Submission = try await h.api.simulateDecision(
            submissionId: submission.id,
            decision: .requestChanges(notes: ["Show the app on screen by 0:03.", "Say the offer once, near the end."])
        )
        XCTAssertEqual(asked.status, .changesRequested)
        let detail: SubmissionDetail = try await h.api.submissionDetail(id: submission.id)
        XCTAssertEqual(detail.notes.count, 2)
        XCTAssertTrue(detail.canRevise)
        XCTAssertGreaterThan(detail.roundsLeft, 0)

        let upload: UploadSession = try await h.api.beginUpload(UploadRequest(fileName: "take-v2.mp4", sizeBytes: 17_000_000, durationMs: 21_000))
        let revised: Submission = try await h.api.revise(
            submissionId: submission.id,
            ReviseRequest(
                video: TestSupport.video(assetId: upload.assetId, durationMs: 21_000),
                hookBand: .a,
                hookPoints: 90,
                flowBand: .a,
                flowPoints: 88,
                qaPass: 10,
                changesSummary: "Moved the app reveal to 2 seconds and said the offer once."
            )
        )
        XCTAssertEqual(revised.status, .inReview)
        XCTAssertEqual(revised.version, 2)
        XCTAssertEqual(revised.versions.count, 2, "Submissions are versioned, never overwritten.")
        XCTAssertEqual(revised.flowPoints, 88)

        let approved: Submission = try await h.api.simulateDecision(submissionId: submission.id, decision: .approve)
        XCTAssertEqual(approved.status, .approved)
    }

    func testReviseIsRefusedWhenNoChangesWereRequested() async throws {
        let h: MockHarness = TestSupport.harness()
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        let upload: UploadSession = try await h.api.beginUpload(UploadRequest(fileName: "take-v2.mp4", sizeBytes: 17_000_000, durationMs: 21_000))
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.revise(submissionId: submission.id, ReviseRequest(video: TestSupport.video(assetId: upload.assetId)))
        }
        guard case .conflict? = error as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: error))
            return
        }
    }

    func testWithdrawingGivesTheReservationBack() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: Bounty = try await h.api.bountyDetail(id: starter).item.bounty
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        let withdrawn: Submission = try await h.api.withdraw(submissionId: submission.id)
        XCTAssertEqual(withdrawn.status, .withdrawn)
        XCTAssertEqual(withdrawn.reservedCents, 0)
        let after: Bounty = try await h.api.bountyDetail(id: starter).item.bounty
        XCTAssertEqual(after.reservedCents, before.reservedCents)
        XCTAssertEqual(after.remainingCents, before.remainingCents)
        let again: Error? = await TestSupport.thrownError {
            _ = try await h.api.withdraw(submissionId: submission.id)
        }
        XCTAssertNotNil(again, "A withdrawn video cannot be withdrawn again.")
    }

    func testTheBrandDecidesOnItsOwnClockWhenAutoDecisionsAreOn() async throws {
        let h: MockHarness = TestSupport.harness(autoBrandDecisions: true)
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        XCTAssertEqual(submission.status, .inReview)
        _ = try await h.api.advanceDemoClock(hours: 72)
        let detail: SubmissionDetail = try await h.api.submissionDetail(id: submission.id)
        XCTAssertFalse(detail.submission.isWaitingOnBrand, "Every video is decided inside the 72-hour SLA, with a reason either way.")
        XCTAssertNotNil(detail.submission.decision)
        XCTAssertEqual(detail.submission.status, .approved, "A clean, pre-scored take is approved.")
    }

    // MARK: Posting

    func testOnlyAnApprovedVideoCanBePosted() async throws {
        let h: MockHarness = TestSupport.harness()
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.attachPost(submissionId: submission.id, TestSupport.postRequest())
        }
        guard case .conflict? = error as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: error))
            return
        }
    }

    func testPostingNeedsALinkAndAConnectedAccountOnThatPlatform() async throws {
        let h: MockHarness = TestSupport.harness()
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        _ = try await h.api.simulateDecision(submissionId: submission.id, decision: .approve)

        let notALink: Error? = await TestSupport.thrownError {
            _ = try await h.api.attachPost(submissionId: submission.id, AttachPostRequest(url: "my video", platform: .tiktok))
        }
        guard case .validationFailed? = notALink as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: notALink))
            return
        }
        let noAccount: Error? = await TestSupport.thrownError {
            _ = try await h.api.attachPost(submissionId: submission.id, AttachPostRequest(url: "https://youtube.com/shorts/abc", platform: .youtube))
        }
        guard case .conflict? = noAccount as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: noAccount))
            return
        }
    }

    func testAttachingAPostOpensTheWindowAndAnAccruingClock() async throws {
        let h: MockHarness = TestSupport.harness()
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        _ = try await h.api.simulateDecision(submissionId: submission.id, decision: .approve)
        let post: Post = try await h.api.attachPost(submissionId: submission.id, TestSupport.postRequest())

        XCTAssertEqual(post.status, .live)
        XCTAssertEqual(post.postedAt, FlowdClock.demoNow)
        XCTAssertEqual(post.windowEndsAt, TestSupport.date("2026-10-06T14:00:00Z"), "Posted + 72 hours.")
        XCTAssertEqual(post.platform, .tiktok)
        XCTAssertEqual(post.socialAccountId, "sa_maya_tiktok", "The primary account is the default.")
        XCTAssertTrue(post.caption.hasPrefix("#ad"))
        XCTAssertTrue(post.caption.contains("#flowd"))

        let detail: PostDetail = try await h.api.postDetail(id: post.id)
        XCTAssertEqual(detail.moneyRows.count, 1)
        let row: MoneyClockRow? = detail.moneyRows.first
        XCTAssertEqual(row?.state, .accruing)
        XCTAssertEqual(row?.reason, .windowOpen)
        XCTAssertEqual(row?.estimated, true)
        XCTAssertEqual(row?.amountCents, 500, "The flat $5.00 is the estimate while the window is open.")
        XCTAssertEqual(row?.etaAt, TestSupport.date("2026-10-07T14:00:00Z"), "The 14:00 UTC run after window end plus 2 hours.")
        XCTAssertEqual(detail.clock?.state, .accruing)

        let submissionAfter: SubmissionDetail = try await h.api.submissionDetail(id: submission.id)
        XCTAssertEqual(submissionAfter.submission.status, .posted)
        XCTAssertEqual(submissionAfter.submission.postId, post.id)
        XCTAssertEqual(submissionAfter.submission.reservedCents, 0, "Posting releases the reservation; the real pay settles at window close.")
        let again: Error? = await TestSupport.thrownError {
            _ = try await h.api.attachPost(submissionId: submission.id, TestSupport.postRequest())
        }
        XCTAssertNotNil(again, "A video is posted once.")
    }

    func testAPostRemovedInsideItsWindowEarnsNothing() async throws {
        let h: MockHarness = TestSupport.harness()
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        _ = try await h.api.simulateDecision(submissionId: submission.id, decision: .approve)
        let post: Post = try await h.api.attachPost(submissionId: submission.id, TestSupport.postRequest())
        let removed: Post = try await h.api.removePost(id: post.id)
        XCTAssertEqual(removed.status, .removed)
        XCTAssertNotNil(removed.removedAt)
        let detail: PostDetail = try await h.api.postDetail(id: post.id)
        XCTAssertTrue(detail.moneyRows.isEmpty, "A post removed before its window closes earns nothing.")
        let listed: [PostListItem] = try await h.api.posts(filter: .all)
        XCTAssertFalse(listed.contains(where: { (item: PostListItem) -> Bool in
            return item.post.id == post.id
        }))
        let again: Error? = await TestSupport.thrownError {
            _ = try await h.api.removePost(id: post.id)
        }
        XCTAssertNotNil(again)
    }

    func testADisputeOnALivePostIsOnePerPost() async throws {
        let h: MockHarness = TestSupport.harness()
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        _ = try await h.api.simulateDecision(submissionId: submission.id, decision: .approve)
        let post: Post = try await h.api.attachPost(submissionId: submission.id, TestSupport.postRequest())
        let dispute: Dispute = try await h.api.openDispute(DisputeRequest(postId: post.id, reason: "The platform shows more views than the ledger counts."))
        XCTAssertEqual(dispute.kind, .viewCount)
        XCTAssertEqual(dispute.status, .open)
        XCTAssertEqual(dispute.postId, post.id)
        XCTAssertGreaterThan(FlowdCalendar.hoursBetween(dispute.openedAt, dispute.replyDueAt), 0)
        let detail: PostDetail = try await h.api.postDetail(id: post.id)
        XCTAssertFalse(detail.canDispute)
        let again: Error? = await TestSupport.thrownError {
            _ = try await h.api.openDispute(DisputeRequest(postId: post.id, reason: "Same again."))
        }
        guard case .conflict? = again as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: again))
            return
        }
        let reply: Dispute = try await h.api.replyToDispute(id: dispute.id, text: "Here is the analytics screenshot.", evidence: [])
        XCTAssertGreaterThan(reply.events.count, dispute.events.count)
    }

    // MARK: From a take to money in the bank

    func testAnApprovedVideoBecomesPaidMoneyThroughTheWindowTheClearingRunAndTheWeeklyPayout() async throws {
        let h: MockHarness = TestSupport.harness()
        let api: MockFlowdAPI = h.api
        let before: WalletSummary = try await api.wallet()
        let submission: Submission = try await TestSupport.submitTake(api, bountyId: starter)
        _ = try await api.simulateDecision(submissionId: submission.id, decision: .approve)
        let post: Post = try await api.attachPost(submissionId: submission.id, TestSupport.postRequest())

        // 1. The window closes at Oct 6 14:00. Views are final, the flat fee is settled, the money is pending with a dated ETA.
        _ = try await api.advanceDemoClock(hours: 80)
        var detail: PostDetail = try await api.postDetail(id: post.id)
        XCTAssertEqual(detail.post.status, .windowClosed)
        XCTAssertGreaterThan(detail.post.windowViews, 0)
        var row: MoneyClockRow? = detail.moneyRows.first
        XCTAssertEqual(detail.moneyRows.count, 1)
        XCTAssertEqual(row?.state, .pending)
        XCTAssertEqual(row?.amountCents, 500)
        XCTAssertEqual(row?.estimated, false)
        XCTAssertEqual(row?.etaAt, TestSupport.date("2026-10-07T14:00:00Z"))
        XCTAssertNotNil(row?.ledgerId, "The leg is on the ledger the moment the window closes.")
        let pendingRow: MoneyClockRow = try XCTUnwrap(row)
        XCTAssertNil(MoneyClockEngine.bareStateProblem(pendingRow), "Pending always carries a date and a reason.")

        // 2. The 14:00 UTC clearing run on Oct 7 clears it. Cleared waits for the Friday payout; it is never summed into Pending.
        _ = try await api.advanceDemoClock(hours: 24)
        detail = try await api.postDetail(id: post.id)
        row = detail.moneyRows.first
        XCTAssertEqual(detail.post.status, .cleared)
        XCTAssertEqual(row?.state, .cleared)
        XCTAssertEqual(row?.reason, .awaitingWeeklyPayout)
        XCTAssertEqual(row?.clearedAt, TestSupport.date("2026-10-07T14:00:00Z"))
        XCTAssertEqual(row?.etaAt, TestSupport.date("2026-10-09T18:00:00Z"))
        let cleared: WalletSummary = try await api.wallet()
        XCTAssertGreaterThanOrEqual(cleared.clearedCents, before.clearedCents + 500)
        XCTAssertGreaterThanOrEqual(cleared.lifetimeClearedCents, before.lifetimeClearedCents + 500)
        XCTAssertEqual(cleared.nextPayoutAt, TestSupport.date("2026-10-09T18:00:00Z"))

        // 3. Friday 18:00 UTC pays it, free.
        _ = try await api.advanceDemoClock(hours: 48)
        detail = try await api.postDetail(id: post.id)
        row = detail.moneyRows.first
        XCTAssertEqual(row?.state, .paid)
        let payoutId: String = try XCTUnwrap(row?.payoutId)
        let payouts: [Payout] = try await api.payouts()
        let payout: Payout = try XCTUnwrap(payouts.first(where: { (p: Payout) -> Bool in
            return p.id == payoutId
        }))
        XCTAssertEqual(payout.kind, .weekly)
        XCTAssertEqual(payout.feeCents, 0, "Weekly payouts are always free.")
        XCTAssertEqual(payout.netCents, payout.grossCents)
        XCTAssertGreaterThanOrEqual(payout.grossCents, 500)
        XCTAssertTrue(payout.status == .inTransit || payout.status == .paid, "Status was " + payout.status.rawValue)
        XCTAssertEqual(payout.scheduledFor, TestSupport.date("2026-10-09T18:00:00Z"))
        let paid: WalletSummary = try await api.wallet()
        XCTAssertGreaterThanOrEqual(paid.paidOutCents, 500)
        let payoutDetail: PayoutDetail = try await api.payoutDetail(id: payoutId)
        XCTAssertTrue(payoutDetail.rows.contains(where: { (r: MoneyClockRow) -> Bool in
            return r.postId == post.id
        }))
        XCTAssertNotNil(payoutDetail.proof, "A public proof page is created for every payout.")

        // The pool is accounted for: the identity escrow = reserved + spent + remaining + refunded still holds, and the flat fee left the pool.
        let bounty: Bounty = try await api.bountyDetail(id: starter).item.bounty
        XCTAssertTrue(SettlementEngine.escrowIdentityHolds(bounty))
        XCTAssertGreaterThanOrEqual(bounty.spentCents, 6_000)
    }

    func testViewsGrowDuringTheWindowAndTheLedgerKeepsSnapshots() async throws {
        let h: MockHarness = TestSupport.harness()
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: starter)
        _ = try await h.api.simulateDecision(submissionId: submission.id, decision: .approve)
        let post: Post = try await h.api.attachPost(submissionId: submission.id, TestSupport.postRequest())
        _ = try await h.api.advanceDemoClock(hours: 12)
        let early: Post = try await h.api.postDetail(id: post.id).post
        XCTAssertGreaterThan(early.views, 0)
        _ = try await h.api.advanceDemoClock(hours: 24)
        let later: Post = try await h.api.postDetail(id: post.id).post
        XCTAssertGreaterThan(later.views, early.views, "Views only go up while the window is open.")
        let ledger: ViewLedger = try await h.api.viewLedger(postId: post.id)
        XCTAssertGreaterThanOrEqual(ledger.snapshots.count, 4, "A snapshot every 6 hours inside the window.")
        let times: [Date] = ledger.snapshots.map { (s: ViewSnapshot) -> Date in
            return s.takenAt
        }
        XCTAssertEqual(times, times.sorted())
        XCTAssertEqual(ledger.verifiedViews, ledger.snapshots.last?.viewsVerified)
    }

    func testTheStarterBountyKeepsTheFirstDollarOffTheCreatorTakeRate() async throws {
        let bounty: Bounty = try await TestSupport.harness().api.bountyDetail(id: starter).item.bounty
        XCTAssertTrue(bounty.isStarter)
        XCTAssertEqual(bounty.takeRate, 0)
        XCTAssertEqual(bounty.flatFeeCents, 500)
        XCTAssertEqual(bounty.type, .direct)
    }
}
