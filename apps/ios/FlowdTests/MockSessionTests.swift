import XCTest
@testable import Flowd

/// Sign-in, the demo world and its clock, profile edits, linked accounts, verification, tiers, and a brand-new creator's whole First-Dollar journey
/// (the just-in-time bank, ID and W-9 steps that only appear once there is money to pay out).
final class MockSessionTests: XCTestCase {
    // MARK: Session

    func testTheSignedInHarnessIsMayaOnTheFrozenDemoClock() async throws {
        let h: MockHarness = TestSupport.harness()
        let current: CreatorSession? = try await h.api.currentSession()
        let session: CreatorSession = try XCTUnwrap(current)
        XCTAssertEqual(session.creator.id, "cr_maya")
        XCTAssertEqual(session.creator.handle, "maya.makes")
        XCTAssertEqual(session.creator.tier, .silver)
        XCTAssertTrue(session.isDemo)
        XCTAssertEqual(session.now, FlowdClock.demoNow)
        XCTAssertTrue(h.api.isDemo)
    }

    func testASignedOutAPIRefusesReadsUntilSignIn() async throws {
        let h: MockHarness = TestSupport.harness(signedIn: false)
        let none: CreatorSession? = try await h.api.currentSession()
        XCTAssertNil(none)
        let refused: Error? = await TestSupport.thrownError {
            _ = try await h.api.me()
        }
        XCTAssertEqual(refused as? FlowdAPIError, FlowdAPIError.unauthorized)
        let session: CreatorSession = try await h.api.signIn(.demo)
        XCTAssertEqual(session.creator.id, "cr_maya")
        let me: Creator = try await h.api.me()
        XCTAssertEqual(me.id, "cr_maya")
    }

    func testSigningOutEndsTheSession() async throws {
        let h: MockHarness = TestSupport.harness()
        try await h.api.signOut()
        let none: CreatorSession? = try await h.api.currentSession()
        XCTAssertNil(none)
        let refused: Error? = await TestSupport.thrownError {
            _ = try await h.api.wallet()
        }
        XCTAssertEqual(refused as? FlowdAPIError, FlowdAPIError.unauthorized)
    }

    func testTheWorldAndHealthReportTheDemoNow() async throws {
        let h: MockHarness = TestSupport.harness()
        let world: World = try await h.api.world()
        XCTAssertEqual(world.now, FlowdClock.demoNow)
        XCTAssertEqual(world.counts["bounties"], 49)
        let health: HealthStatus = try await h.api.health()
        XCTAssertTrue(health.ok)
        XCTAssertEqual(health.now, FlowdClock.demoNow)
    }

    func testDeletingTheAccountSignsOutForGood() async throws {
        let h: MockHarness = TestSupport.harness()
        try await h.api.deleteAccount()
        let none: CreatorSession? = try await h.api.currentSession()
        XCTAssertNil(none)
        let refused: Error? = await TestSupport.thrownError {
            _ = try await h.api.me()
        }
        XCTAssertEqual(refused as? FlowdAPIError, FlowdAPIError.unauthorized)
    }

    // MARK: The demo clock

    func testTheDemoClockOnlyMovesForwardAndByAtMostFiveWeeks() async throws {
        let h: MockHarness = TestSupport.harness()
        for hours in [0, -5] {
            let error: Error? = await TestSupport.thrownError {
                _ = try await h.api.advanceDemoClock(hours: hours)
            }
            guard case .validationFailed? = error as? FlowdAPIError else {
                XCTFail("Expected a validation error for " + String(hours) + ", got " + String(describing: error))
                return
            }
        }
        let tooFar: Error? = await TestSupport.thrownError {
            _ = try await h.api.advanceDemoClock(hours: MockFlowdAPI.maxAdvanceHours + 1)
        }
        guard case .validationFailed? = tooFar as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: tooFar))
            return
        }
        let world: World = try await h.api.advanceDemoClock(hours: 24)
        XCTAssertEqual(world.now, FlowdCalendar.addHours(FlowdClock.demoNow, 24))
    }

    func testScheduledInstantsAreMidnightTheClearingRunTheDropAndTheFridayPayout() async {
        let h: MockHarness = TestSupport.harness()
        let start: Date = TestSupport.date("2026-10-08T12:00:00Z")
        let end: Date = TestSupport.date("2026-10-10T00:00:00Z")
        let instants: [Date] = await h.api.scheduledInstants(from: start, to: end)
        let labels: [String] = instants.map { (d: Date) -> String in
            return FlowdDates.string(from: d)
        }
        XCTAssertEqual(labels, [
            "2026-10-08T14:00:00Z",
            "2026-10-08T16:00:00Z",
            "2026-10-09T00:00:00Z",
            "2026-10-09T14:00:00Z",
            "2026-10-09T16:00:00Z",
            "2026-10-09T18:00:00Z",
            "2026-10-10T00:00:00Z"
        ])
    }

    func testResettingTheDemoRestoresTheSeed() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: WalletSummary = try await h.api.wallet()
        _ = try await h.api.instantPayout(InstantPayoutRequest(amountCents: before.clearedCents))
        _ = try await h.api.saveBounty(id: "bnty_flowd_starter_3")
        _ = try await h.api.advanceDemoClock(hours: 30)
        try await h.api.resetDemo()
        XCTAssertEqual(h.clock.now.timeIntervalSince(FlowdClock.demoNow), 0, accuracy: 5, "The reset puts the clock back at the demo now (and it ticks from there).")
        let after: WalletSummary = try await h.api.wallet()
        XCTAssertEqual(after.clearedCents, before.clearedCents)
        XCTAssertEqual(after.pendingCents, before.pendingCents)
        XCTAssertEqual(after.paidOutCents, before.paidOutCents)
        let saved: [SavedBounty] = try await h.api.savedBounties()
        XCTAssertFalse(saved.contains(where: { (s: SavedBounty) -> Bool in
            return s.save.bountyId == "bnty_flowd_starter_3"
        }))
        let me: Creator = try await h.api.me()
        XCTAssertEqual(me.id, "cr_maya")
    }

    // MARK: Profile and accounts

    func testProfileEditsAreValidated() async throws {
        let h: MockHarness = TestSupport.harness()
        let long: Error? = await TestSupport.thrownError {
            _ = try await h.api.updateProfile(ProfileUpdate(bio: String(repeating: "a", count: 161)))
        }
        guard case .validationFailed? = long as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: long))
            return
        }
        let taken: Error? = await TestSupport.thrownError {
            _ = try await h.api.updateProfile(ProfileUpdate(handle: "x"))
        }
        XCTAssertNotNil(taken, "Handles use 3 to 24 letters, numbers, dots and underscores.")
        let tooMany: Error? = await TestSupport.thrownError {
            _ = try await h.api.updateProfile(ProfileUpdate(niches: [.fitness, .beauty, .food, .travel]))
        }
        XCTAssertNotNil(tooMany, "Between one and three niches.")
        let updated: Creator = try await h.api.updateProfile(ProfileUpdate(displayName: "Maya Makes", bio: "Honest app reviews.", openToOffers: true))
        XCTAssertEqual(updated.displayName, "Maya Makes")
        XCTAssertEqual(updated.bio, "Honest app reviews.")
        XCTAssertTrue(updated.openToOffers)
        let user: Creator = try await h.api.me()
        XCTAssertEqual(user.displayName, "Maya Makes")
    }

    func testLinkingAnAccountIsReadOnlyAndTheFirstOneIsPrimary() async throws {
        let h: MockHarness = TestSupport.harness(signedIn: false, persona: .newCreator)
        _ = try await h.api.signIn(.apple(identityToken: nil, authorizationCode: nil, fullName: "Ada Lovelace", email: "ada@example.com"))
        let bad: Error? = await TestSupport.thrownError {
            _ = try await h.api.linkSocialAccount(LinkAccountRequest(platform: .tiktok, handle: "!"))
        }
        guard case .validationFailed? = bad as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: bad))
            return
        }
        let tiktok: SocialAccount = try await h.api.linkSocialAccount(LinkAccountRequest(platform: .tiktok, handle: "@ada.lovelace"))
        XCTAssertEqual(tiktok.handle, "ada.lovelace")
        XCTAssertEqual(tiktok.status, .connected)
        XCTAssertTrue(tiktok.primary)
        let instagram: SocialAccount = try await h.api.linkSocialAccount(LinkAccountRequest(platform: .instagram, handle: "ada.lovelace"))
        XCTAssertFalse(instagram.primary)
        let linked: [SocialAccount] = try await h.api.socialAccounts()
        XCTAssertEqual(linked.count, 2)
        try await h.api.disconnectSocialAccount(id: tiktok.id)
        let remaining: [SocialAccount] = try await h.api.socialAccounts()
        XCTAssertEqual(remaining.count, 1)
        XCTAssertTrue(remaining.first?.primary ?? false, "Disconnecting the primary account promotes the next one.")
    }

    // MARK: Tier and reputation

    func testMayaIsSilverWithAnHonestProgressToGold() async throws {
        let h: MockHarness = TestSupport.harness()
        let status: TierStatus = try await h.api.tierStatus()
        XCTAssertEqual(status.current, .silver)
        XCTAssertEqual(status.progress.next, .gold)
        XCTAssertEqual(status.ladder.map { (row: TierLadderRow) -> Tier in return row.tier }, [.bronze, .silver, .gold, .platinum, .elite])
        XCTAssertTrue(status.ladder.first(where: { (row: TierLadderRow) -> Bool in return row.tier == .silver })?.isCurrent ?? false)
        XCTAssertFalse(status.remaining.isEmpty)
        XCTAssertFalse(status.perkLines.isEmpty)
        let reputation: CreatorReputation = try await h.api.reputation()
        XCTAssertEqual(reputation.creatorId, "cr_maya")
        XCTAssertFalse(reputation.provisional)
    }

    // MARK: Preferences and Wellbeing

    func testNotificationPreferencesRoundTrip() async throws {
        let h: MockHarness = TestSupport.harness()
        var prefs: NotificationPrefs = try await h.api.notificationPrefs()
        prefs.emailDigest = true
        prefs.dropReminder = false
        prefs.categories["tips"] = false
        let saved: NotificationPrefs = try await h.api.updateNotificationPrefs(prefs)
        XCTAssertTrue(saved.emailDigest)
        XCTAssertFalse(saved.dropReminder)
        let again: NotificationPrefs = try await h.api.notificationPrefs()
        XCTAssertEqual(again.categories["tips"], false)
        XCTAssertEqual(again.id, prefs.id)
    }

    func testWellbeingModeRoundTripsAndAPauseIsCapped() async throws {
        let h: MockHarness = TestSupport.harness()
        var settings: WellbeingSettings = try await h.api.wellbeing()
        settings.enabled = true
        settings.numbersOff = NumbersOff(enabled: true, from: "20:00", to: "08:00")
        settings.paceGoal = PaceGoal(enabled: true, postsPerWeek: 3)
        let saved: WellbeingSettings = try await h.api.updateWellbeing(settings)
        XCTAssertTrue(saved.enabled)
        XCTAssertEqual(saved.paceGoal.postsPerWeek, 3)
        XCTAssertTrue(saved.numbersOff.enabled)

        var pause: WellbeingSettings = saved
        pause.pausedUntil = FlowdCalendar.addDays(FlowdClock.demoNow, 5)
        let paused: WellbeingSettings = try await h.api.updateWellbeing(pause)
        XCTAssertEqual(paused.pausedUntil, pause.pausedUntil)
        let creator: Creator = try await h.api.me()
        XCTAssertEqual(creator.pausedUntil, pause.pausedUntil, "A pause is mirrored on the creator so tier and streak are kept.")

        var tooLong: WellbeingSettings = saved
        tooLong.pausedUntil = FlowdCalendar.addDays(FlowdClock.demoNow, 400)
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.updateWellbeing(tooLong)
        }
        guard case .validationFailed? = error as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: error))
            return
        }
    }

    func testQuietHoursBatchNonCashNotificationsButNeverCash() async throws {
        let h: MockHarness = TestSupport.harness()
        var settings: WellbeingSettings = try await h.api.wellbeing()
        settings.quietHours = QuietHours(enabled: true, start: "13:00", end: "15:00", timezone: "UTC")
        _ = try await h.api.updateWellbeing(settings)
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: "bnty_flowd_starter_2")
        _ = try await h.api.simulateDecision(submissionId: submission.id, decision: .approve)
        let notifications: [AppNotification] = try await h.api.notifications(filter: .all)
        let approval: AppNotification? = notifications.first(where: { (n: AppNotification) -> Bool in
            return n.kind == .approval && n.refId == submission.id
        })
        XCTAssertEqual(approval?.batched, true, "A non-cash notice inside quiet hours is batched for later.")
        XCTAssertEqual(approval?.priority, .digest)
        XCTAssertNil(approval?.deliveredAt)
    }

    func testDataExportAndTheCreatorAgreementCanBeSentWhileSignedIn() async throws {
        let h: MockHarness = TestSupport.harness()
        try await h.api.requestDataExport()
        try await h.api.acceptCreatorAgreement(version: "2026-10")
        try await h.api.signOut()
        let refused: Error? = await TestSupport.thrownError {
            try await h.api.requestDataExport()
        }
        XCTAssertEqual(refused as? FlowdAPIError, FlowdAPIError.unauthorized)
    }

    // MARK: Verification

    func testAnAlreadyVerifiedCreatorIsNeverAskedForIdentityTwice() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: Creator = try await h.api.me()
        XCTAssertEqual(before.verificationStatus, .verified)
        let check: Verification = try await h.api.startVerification(kind: .identity)
        XCTAssertEqual(check.status, .verified)
        XCTAssertFalse(check.blocksPayout)
        XCTAssertNotNil(check.decidedAt)
        let again: Verification = try await h.api.startVerification(kind: .identity)
        XCTAssertEqual(again.id, check.id)
        let after: Creator = try await h.api.me()
        XCTAssertEqual(after.verificationStatus, .verified)
        let wallet: WalletSummary = try await h.api.wallet()
        XCTAssertTrue(wallet.blockers.isEmpty)
    }

    func testAnIdentityCheckIsDecidedInsideItsTwentyFourHourSla() async throws {
        let h: MockHarness = TestSupport.harness(signedIn: false, persona: .newCreator)
        _ = try await h.api.signIn(.apple(identityToken: nil, authorizationCode: nil, fullName: "Grace Hopper", email: "grace@example.com"))
        let check: Verification = try await h.api.startVerification(kind: .identity)
        XCTAssertEqual(check.status, .pending)
        XCTAssertTrue(check.blocksPayout)
        XCTAssertEqual(check.slaDueAt, FlowdCalendar.addHours(FlowdClock.demoNow, 24))
        let pending: Creator = try await h.api.me()
        XCTAssertEqual(pending.verificationStatus, .pending)
        let again: Verification = try await h.api.startVerification(kind: .identity)
        XCTAssertEqual(again.id, check.id, "Starting twice keeps one check.")

        _ = try await h.api.advanceDemoClock(hours: 25)
        let verified: Creator = try await h.api.me()
        XCTAssertEqual(verified.verificationStatus, .verified)
        XCTAssertTrue(verified.badges.contains(.idVerified))
        let rows: [Verification] = try await h.api.verifications()
        XCTAssertEqual(rows.first(where: { (v: Verification) -> Bool in return v.id == check.id })?.status, .verified)
    }

    // MARK: A brand-new creator

    func testSignInWithAppleStartsAFreshBronzeCreatorAtTheStartOfTheFirstDollarPath() async throws {
        let h: MockHarness = TestSupport.harness(signedIn: false)
        let session: CreatorSession = try await h.api.signIn(.apple(identityToken: nil, authorizationCode: nil, fullName: "Ada Lovelace", email: "ada@example.com"))
        XCTAssertEqual(session.creator.tier, .bronze)
        XCTAssertEqual(session.creator.displayName, "Ada Lovelace")
        XCTAssertEqual(session.creator.handle, "ada.lovelace")
        XCTAssertEqual(session.creator.lifetimeClearedCents, 0)
        XCTAssertEqual(session.creator.onboardingStage, .signedUp)
        XCTAssertFalse(session.creator.payoutReady)
        XCTAssertEqual(session.user.email, "ada@example.com")

        let path: FirstDollarPath = try await h.api.firstDollarPath()
        XCTAssertEqual(path.steps.map { (s: FirstDollarStep) -> FirstDollarStepKind in return s.kind }, [.scoredTake, .submitted, .approved, .cleared])
        XCTAssertTrue(path.steps.allSatisfy { (s: FirstDollarStep) -> Bool in return !s.done })
        XCTAssertFalse(path.retired)
        XCTAssertNotNil(path.starter, "The flowd-funded starter bounty is always offered.")
        XCTAssertEqual(path.starter?.bounty.isStarter, true)
        XCTAssertTrue(path.note.contains("No bank, tax or ID"), "Nothing is asked until the first approval.")

        let wallet: WalletSummary = try await h.api.wallet()
        XCTAssertEqual(wallet.clearedCents, 0)
        XCTAssertEqual(wallet.pendingCents, 0)
        XCTAssertEqual(wallet.tier, .bronze)
    }

    func testANewCreatorWithNoLinkedAccountCannotTakeABountyUntilTheyLinkOne() async throws {
        let h: MockHarness = TestSupport.harness(signedIn: false)
        _ = try await h.api.signIn(.apple(identityToken: nil, authorizationCode: nil, fullName: "Ada Lovelace", email: nil))
        let blocked: Error? = await TestSupport.thrownError {
            _ = try await h.api.joinBounty(id: "bnty_flowd_starter_2")
        }
        guard case .forbidden? = blocked as? FlowdAPIError else {
            XCTFail("Expected forbidden, got " + String(describing: blocked))
            return
        }
        _ = try await h.api.linkSocialAccount(LinkAccountRequest(platform: .tiktok, handle: "ada.lovelace"))
        let save: BountySave = try await h.api.joinBounty(id: "bnty_flowd_starter_2")
        XCTAssertEqual(save.stage, .joined)
    }

    /// The whole story of a first dollar, with every just-in-time step: a bank account, then identity, then the W-9 are only asked for once there is
    /// cleared money, each hold names the next step, and the Friday run pays it the moment the last one is done.
    func testAFirstDollarClearsWithoutAnyPaperworkAndPaysOnlyAfterTheBankIdentityAndW9AreInPlace() async throws {
        let h: MockHarness = TestSupport.harness(signedIn: false)
        let api: MockFlowdAPI = h.api
        _ = try await api.signIn(.apple(identityToken: nil, authorizationCode: nil, fullName: "Ada Lovelace", email: "ada@example.com"))
        _ = try await api.linkSocialAccount(LinkAccountRequest(platform: .tiktok, handle: "ada.lovelace"))

        // Submit, get approved, post. Approval is the moment the W-9 is asked for (not before).
        let take: Submission = try await TestSupport.submitTake(api, bountyId: "bnty_flowd_starter_2")
        XCTAssertEqual(take.status, .inReview)
        let approved: Submission = try await api.simulateDecision(submissionId: take.id, decision: .approve)
        XCTAssertEqual(approved.status, .approved)
        let tax: TaxSummary = try await api.taxSummary()
        XCTAssertEqual(tax.profile.status, .requested)
        XCTAssertTrue(tax.w9Needed)
        let asked: [AppNotification] = try await api.notifications(filter: .money)
        XCTAssertTrue(asked.contains(where: { (n: AppNotification) -> Bool in return n.kind == .taxInfoNeeded }))
        let post: Post = try await api.attachPost(submissionId: take.id, AttachPostRequest(url: "https://www.tiktok.com/@ada.lovelace/video/1", platform: .tiktok))
        XCTAssertEqual(post.status, .live)

        // The window closes and the 14:00 UTC run clears the first dollar. Clearing needs no bank, ID or tax form.
        _ = try await api.advanceDemoClock(hours: 80)
        _ = try await api.advanceDemoClock(hours: 24)
        let cleared: WalletSummary = try await api.wallet()
        XCTAssertEqual(cleared.clearedCents, 500)
        XCTAssertEqual(cleared.lifetimeClearedCents, 500)
        XCTAssertEqual(cleared.blockers, [.payoutMethod], "The first blocker is the missing bank account.")
        let creator: Creator = try await api.me()
        XCTAssertEqual(creator.onboardingStage, .firstDollar)
        XCTAssertNotNil(creator.firstDollarAt)
        let path: FirstDollarPath = try await api.firstDollarPath()
        XCTAssertTrue(path.retired, "The First-Dollar tracker retires once the first dollar clears.")
        let refused: Error? = await TestSupport.thrownError {
            _ = try await api.instantPayout(InstantPayoutRequest(amountCents: 500))
        }
        XCTAssertEqual(refused as? FlowdAPIError, FlowdAPIError.methodMissing)

        // A bank account moves the hold to the next blocker: identity.
        _ = try await api.addPayoutMethod(AddPayoutMethodRequest(kind: .bank, label: "", last4: "4821"))
        let needsId: WalletSummary = try await api.wallet()
        XCTAssertEqual(needsId.blockers, [.identity])
        XCTAssertEqual(needsId.clearedCents, 0)
        XCTAssertEqual(needsId.heldCents, 500)
        XCTAssertEqual(needsId.holds.first?.reason, .heldIdentityCheck)

        // Identity is decided inside its 24 hours; the hold then names the tax form.
        let check: Verification = try await api.startVerification(kind: .identity)
        XCTAssertEqual(check.status, .pending)
        _ = try await api.advanceDemoClock(hours: 25)
        let needsTax: WalletSummary = try await api.wallet()
        XCTAssertEqual(needsTax.blockers, [.taxInfo])
        XCTAssertEqual(needsTax.holds.first?.reason, .heldTaxInfo, "The row names the hold that is current, not the one that was just cleared.")
        let idDone: Creator = try await api.me()
        XCTAssertEqual(idDone.verificationStatus, .verified)

        // The W-9 releases the money to the next weekly run.
        let notEnough: Error? = await TestSupport.thrownError {
            _ = try await api.submitW9(W9Request(legalName: "Ada", tinLast4: "1234", address: TestSupport.address, signedName: "Ada"))
        }
        guard case .validationFailed? = notEnough as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: notEnough))
            return
        }
        let profile: TaxProfile = try await api.submitW9(W9Request(legalName: "Ada Lovelace", tinLast4: "1234", address: TestSupport.address, signedName: "Ada Lovelace"))
        XCTAssertEqual(profile.status, .verified)
        XCTAssertEqual(profile.tinLast4, "1234", "Only the last four digits are ever stored.")
        let released: WalletSummary = try await api.wallet()
        XCTAssertTrue(released.blockers.isEmpty)
        XCTAssertEqual(released.clearedCents, 500)
        XCTAssertEqual(released.heldCents, 0)
        let ready: Creator = try await api.me()
        XCTAssertTrue(ready.payoutReady)

        // Friday 18:00 UTC pays it, free.
        _ = try await api.advanceDemoClock(hours: 24)
        let paid: WalletSummary = try await api.wallet()
        XCTAssertEqual(paid.clearedCents, 0)
        XCTAssertEqual(paid.paidOutCents, 500)
        let payouts: [Payout] = try await api.payouts()
        let weekly: Payout? = payouts.first(where: { (p: Payout) -> Bool in return p.kind == .weekly && p.grossCents == 500 })
        XCTAssertNotNil(weekly)
        XCTAssertEqual(weekly?.feeCents, 0)
    }
}
