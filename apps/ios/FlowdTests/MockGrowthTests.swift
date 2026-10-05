import XCTest
@testable import Flowd

/// Compete and grow: the weekly streak (freezes and rest weeks, never "lost"), the Academy, leaderboards, Tournaments, Crews, referrals, specs, auctions
/// and the remix library.
final class MockGrowthTests: XCTestCase {
    // MARK: Streak

    func testMayaHasASixWeekStreakThatCountsThisWeekAlready() async throws {
        let h: MockHarness = TestSupport.harness()
        let summary: StreakSummary = try await h.api.streak()
        XCTAssertEqual(summary.streak.currentWeeks, 6)
        XCTAssertEqual(summary.streak.bestWeeks, 6)
        XCTAssertEqual(summary.streak.freezesBanked, 1)
        XCTAssertEqual(summary.streak.isoWeek, "2026-W40")
        XCTAssertTrue(summary.streak.postedThisWeek)
        XCTAssertFalse(summary.canDeclareRestWeek, "A week you posted in already counts.")
        XCTAssertEqual(summary.restWeekReason, "You already posted this week, so this week counts.")
        XCTAssertEqual(summary.restWeeksRemainingThisQuarter, 2)
        XCTAssertEqual(summary.copy.headline, "6-week streak")
        XCTAssertTrue(summary.copy.detail.contains("1 freeze banked."))
    }

    func testAMissedWeekIsCoveredByAFreezeAndASecondMissStartsAFreshStreakWithoutEverSayingLost() async throws {
        let h: MockHarness = TestSupport.harness()
        let seed: StreakSummary = try await h.api.streak()
        _ = try await h.api.advanceDemoClock(hours: 24 * 16)
        let summary: StreakSummary = try await h.api.streak()
        XCTAssertEqual(summary.streak.currentWeeks, 0)
        XCTAssertEqual(summary.streak.bestWeeks, 6, "The best streak is always kept.")
        XCTAssertEqual(summary.streak.freezesBanked, 0)
        XCTAssertEqual(summary.streak.freezesUsedTotal, seed.streak.freezesUsedTotal + 1, "The banked freeze covered the first missed week.")
        XCTAssertEqual(summary.streak.status, .broken)
        XCTAssertEqual(summary.copy.headline, "Fresh start")
        let words: String = (summary.copy.headline + " " + summary.copy.detail).lowercased()
        XCTAssertFalse(words.contains("lost"), "The streak card is calm: it never says lost.")
        XCTAssertFalse(words.contains("failed"))
        let outcomes: [WeekOutcome] = summary.streak.history.suffix(3).map { (record: WeekRecord) -> WeekOutcome in
            return record.outcome
        }
        XCTAssertEqual(outcomes, [.posted, .freezeUsed, .missed])
    }

    func testARestWeekKeepsTheStreakAndTheBankedFreeze() async throws {
        let h: MockHarness = TestSupport.harness()
        _ = try await h.api.advanceDemoClock(hours: 48)
        let declared: StreakSummary = try await h.api.declareRestWeek()
        XCTAssertEqual(declared.streak.status, .resting)
        XCTAssertEqual(declared.restWeeksRemainingThisQuarter, 1)
        XCTAssertFalse(declared.canDeclareRestWeek)
        let again: Error? = await TestSupport.thrownError {
            _ = try await h.api.declareRestWeek()
        }
        guard case .conflict? = again as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: again))
            return
        }
        _ = try await h.api.advanceDemoClock(hours: 24 * 7)
        let after: StreakSummary = try await h.api.streak()
        XCTAssertEqual(after.streak.currentWeeks, 6, "A rest week keeps the streak.")
        XCTAssertEqual(after.streak.freezesBanked, 1, "A rest week does not use a freeze.")
    }

    func testPostingInAWeekAddsToTheStreak() async throws {
        let h: MockHarness = TestSupport.harness()
        _ = try await h.api.advanceDemoClock(hours: 48)
        let before: StreakSummary = try await h.api.streak()
        XCTAssertFalse(before.streak.postedThisWeek)
        let submission: Submission = try await TestSupport.submitTake(h.api, bountyId: "bnty_flowd_starter_2")
        _ = try await h.api.simulateDecision(submissionId: submission.id, decision: .approve)
        _ = try await h.api.attachPost(submissionId: submission.id, TestSupport.postRequest())
        let after: StreakSummary = try await h.api.streak()
        XCTAssertTrue(after.streak.postedThisWeek)
        XCTAssertEqual(after.streak.currentWeeks, before.streak.currentWeeks + 1)
        XCTAssertEqual(after.streak.postsThisWeek, 1)
        let creator: Creator = try await h.api.me()
        XCTAssertEqual(creator.streakWeeks, after.streak.currentWeeks)
    }

    // MARK: Academy

    func testTheAcademyShowsProgressTheNextLessonAndCapsTheReliabilityBonus() async throws {
        let h: MockHarness = TestSupport.harness()
        let academy: AcademyOverview = try await h.api.academy()
        XCTAssertEqual(academy.lessons.count, 10)
        XCTAssertEqual(academy.completedCount, 6)
        XCTAssertEqual(academy.nextLesson?.slug, "usage-rights-and-what-to-charge")
        XCTAssertEqual(academy.reliabilityBonusPoints, 3.0, accuracy: 0.0001, "0.5 per completed lesson.")
        XCTAssertLessThanOrEqual(academy.reliabilityBonusPoints, Double(FlowdConstants.Reliability.Creator.academyBonusCap))
        XCTAssertEqual(academy.lessons.map { (item: LessonItem) -> Int in return item.lesson.order }, Array(1...10))
        XCTAssertTrue(academy.badges.contains(where: { (b: BadgeItem) -> Bool in
            return b.badge == .idVerified && b.earned
        }))
    }

    func testAFailedQuizKeepsTheLessonInProgressAndAPassAwardsTheBadgeOnce() async throws {
        let h: MockHarness = TestSupport.harness()
        let slug: String = "usage-rights-and-what-to-charge"
        let lesson: LessonItem = try await h.api.lesson(slug: slug)
        XCTAssertNil(lesson.progress)
        let quiz: [QuizQuestion] = lesson.lesson.quiz
        XCTAssertEqual(quiz.count, 3)

        let wrong: [Int] = quiz.map { (q: QuizQuestion) -> Int in
            return (q.answerIndex + 1) % q.options.count
        }
        let failed: LessonResult = try await h.api.completeLesson(slug: slug, answers: wrong)
        XCTAssertFalse(failed.passed)
        XCTAssertFalse(failed.badgeAwarded)
        XCTAssertEqual(failed.score, 0, accuracy: 0.0001)
        XCTAssertEqual(failed.correct, [false, false, false])
        XCTAssertEqual(failed.progress.status, .inProgress)

        let right: [Int] = quiz.map { (q: QuizQuestion) -> Int in
            return q.answerIndex
        }
        let passed: LessonResult = try await h.api.completeLesson(slug: slug, answers: right)
        XCTAssertTrue(passed.passed)
        XCTAssertTrue(passed.badgeAwarded)
        XCTAssertEqual(passed.score, 1, accuracy: 0.0001)
        XCTAssertEqual(passed.progress.status, .completed)
        let academy: AcademyOverview = try await h.api.academy()
        XCTAssertEqual(academy.completedCount, 7)
        XCTAssertEqual(academy.reliabilityBonusPoints, 3.5, accuracy: 0.0001)
        XCTAssertNotEqual(academy.nextLesson?.slug, slug)

        let again: LessonResult = try await h.api.completeLesson(slug: slug, answers: right)
        XCTAssertTrue(again.passed)
        XCTAssertFalse(again.badgeAwarded, "The badge and the bonus are awarded once.")
        let notifications: [AppNotification] = try await h.api.notifications(filter: .tier)
        XCTAssertEqual(notifications.filter { (n: AppNotification) -> Bool in
            return n.kind == .academyBadge && n.refId == lesson.lesson.id
        }.count, 1)
    }

    func testAQuizNeedsEveryQuestionAnsweredAndAnUnknownLessonIsNotFound() async throws {
        let h: MockHarness = TestSupport.harness()
        let partial: Error? = await TestSupport.thrownError {
            _ = try await h.api.completeLesson(slug: "usage-rights-and-what-to-charge", answers: [0])
        }
        guard case .validationFailed? = partial as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: partial))
            return
        }
        let missing: Error? = await TestSupport.thrownError {
            _ = try await h.api.lesson(slug: "no-such-lesson")
        }
        guard case .notFound? = missing as? FlowdAPIError else {
            XCTFail("Expected not found, got " + String(describing: missing))
            return
        }
    }

    // MARK: Leaderboards

    func testALeaderboardIsRankedAndResetsOnMondayAndHonoursOptOut() async throws {
        let h: MockHarness = TestSupport.harness()
        let standing: LeaderboardStanding = try await h.api.leaderboard()
        XCTAssertFalse(standing.rows.isEmpty)
        let ranks: [Int] = standing.rows.map { (row: LeaderboardRow) -> Int in
            return row.entry.rank
        }
        XCTAssertEqual(ranks, Array(1...ranks.count), "Ranks run 1...n with no gaps.")
        let values: [Double] = standing.rows.map { (row: LeaderboardRow) -> Double in
            return row.entry.value
        }
        XCTAssertEqual(values, values.sorted(by: >), "Rows are ordered by value, highest first.")
        XCTAssertEqual(standing.resetsAt, TestSupport.date("2026-10-05T00:00:00Z"))
        XCTAssertFalse(standing.optedOut)
        XCTAssertEqual(standing.unranked, standing.me == nil)

        var settings: WellbeingSettings = try await h.api.wellbeing()
        settings.leaderboardOptOut = true
        _ = try await h.api.updateWellbeing(settings)
        let hidden: LeaderboardStanding = try await h.api.leaderboard()
        XCTAssertTrue(hidden.optedOut)
        XCTAssertNil(hidden.me, "An opted-out creator is not shown their own rank.")
    }

    func testEveryScopeAndMetricHasABoard() async throws {
        let h: MockHarness = TestSupport.harness()
        let global: LeaderboardStanding = try await h.api.leaderboard(scope: .global, metric: .earnings, niche: nil)
        XCTAssertEqual(global.leaderboard.scope, .global)
        let conversion: LeaderboardStanding = try await h.api.leaderboard(scope: .global, metric: .conversionRate, niche: nil)
        XCTAssertEqual(conversion.leaderboard.metric, .conversionRate)
        let niche: LeaderboardStanding = try await h.api.leaderboard(scope: .niche, metric: .earnings, niche: .beauty)
        XCTAssertEqual(niche.leaderboard.scope, .niche)
    }

    // MARK: Tournaments

    func testTournamentsAreOrderedLiveOpenAnnouncedJudgingComplete() async throws {
        let h: MockHarness = TestSupport.harness()
        let views: [TournamentView] = try await h.api.tournaments()
        let statuses: [TournamentStatus] = views.map { (v: TournamentView) -> TournamentStatus in
            return v.tournament.status
        }
        XCTAssertEqual(statuses, [.live, .open, .announced, .judging, .complete, .complete, .complete, .cancelled])
        let sprint: TournamentView = try await h.api.tournament(id: "tour_screen_record_sprint")
        XCTAssertNotNil(sprint.myEntry, "Maya is entered in the live sprint.")
        XCTAssertFalse(sprint.canEnter)
        let missing: Error? = await TestSupport.thrownError {
            _ = try await h.api.tournament(id: "tour_nope")
        }
        guard case .notFound? = missing as? FlowdAPIError else {
            XCTFail("Expected not found, got " + String(describing: missing))
            return
        }
    }

    func testEnteringATournamentNeedsTheRightNicheAndAHookThenIsOneEntryPerCreator() async throws {
        let h: MockHarness = TestSupport.harness(signedIn: false)
        _ = try await h.api.signIn(.apple(identityToken: nil, authorizationCode: nil, fullName: "Ada Lovelace", email: nil))
        let id: String = "tour_october_glow_up_brackets"
        let locked: TournamentView = try await h.api.tournament(id: id)
        XCTAssertFalse(locked.canEnter)
        XCTAssertNotNil(locked.lockReason, "A locked tournament says why.")
        let wrongNiche: Error? = await TestSupport.thrownError {
            _ = try await h.api.joinTournament(id: id, TournamentEntryRequest(hookText: "I tried every glow-up routine for a week", submissionId: nil))
        }
        XCTAssertNotNil(wrongNiche)

        _ = try await h.api.updateProfile(ProfileUpdate(niches: [.beauty]))
        let open: TournamentView = try await h.api.tournament(id: id)
        XCTAssertTrue(open.canEnter)
        let short: Error? = await TestSupport.thrownError {
            _ = try await h.api.joinTournament(id: id, TournamentEntryRequest(hookText: "hi", submissionId: nil))
        }
        guard case .validationFailed? = short as? FlowdAPIError else {
            XCTFail("Expected a validation error, got " + String(describing: short))
            return
        }
        let entry: TournamentEntry = try await h.api.joinTournament(id: id, TournamentEntryRequest(hookText: "I tried every glow-up routine for a week", submissionId: nil))
        XCTAssertEqual(entry.status, .entered)
        XCTAssertEqual(entry.tournamentId, id)
        XCTAssertEqual(entry.hookBand, ScoringEngine.band(for: entry.hookPoints))
        let after: TournamentView = try await h.api.tournament(id: id)
        XCTAssertEqual(after.tournament.entriesCount, open.tournament.entriesCount + 1)
        XCTAssertNotNil(after.myEntry)
        XCTAssertFalse(after.canEnter)
        let twice: Error? = await TestSupport.thrownError {
            _ = try await h.api.joinTournament(id: id, TournamentEntryRequest(hookText: "Another hook for the same bracket", submissionId: nil))
        }
        guard case .conflict? = twice as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: twice))
            return
        }
    }

    func testTournamentsMoveThroughTheirStagesOnTheClock() async throws {
        let h: MockHarness = TestSupport.harness()
        _ = try await h.api.advanceDemoClock(hours: 24 * 4)
        let announced: TournamentView = try await h.api.tournament(id: "tour_best_first_trial")
        XCTAssertEqual(announced.tournament.status, .open, "Entries opened on Oct 6 at 14:00 UTC.")
        let glow: TournamentView = try await h.api.tournament(id: "tour_october_glow_up_brackets")
        XCTAssertEqual(glow.tournament.status, .live, "The bracket started on Oct 7 at 14:00 UTC.")
        let sprint: TournamentView = try await h.api.tournament(id: "tour_screen_record_sprint")
        XCTAssertEqual(sprint.tournament.status, .judging, "The sprint ended on Oct 6 at 20:00 UTC.")
    }

    // MARK: Crews

    func testMayaIsInACrewAndCannotLeadOneBeforeGold() async throws {
        let h: MockHarness = TestSupport.harness()
        let directory: CrewDirectory = try await h.api.crews()
        let mine: CrewView = try XCTUnwrap(directory.mine)
        XCTAssertTrue(mine.isMine)
        XCTAssertEqual(directory.discover.count, 7)
        XCTAssertFalse(directory.canCreate)
        XCTAssertNotNil(directory.createLockText)
        XCTAssertFalse(mine.bonusNote.isEmpty)
        XCTAssertGreaterThanOrEqual(mine.goalProgress, 0)
        XCTAssertLessThanOrEqual(mine.goalProgress, 1)
        let tier: Error? = await TestSupport.thrownError {
            _ = try await h.api.createCrew(CreateCrewRequest(name: "Night Owls", tagline: "Late edits", niche: .lifestyle, isOpen: true))
        }
        XCTAssertEqual((tier as? FlowdAPIError)?.code, "tier_locked")
        let already: Error? = await TestSupport.thrownError {
            let target: CrewView = try XCTUnwrap(directory.discover.first)
            _ = try await h.api.joinCrew(id: target.crew.id)
        }
        guard case .conflict? = already as? FlowdAPIError else {
            XCTFail("Expected a conflict, got " + String(describing: already))
            return
        }
    }

    func testLeavingACrewThenJoiningAnOpenOne() async throws {
        let h: MockHarness = TestSupport.harness()
        let directory: CrewDirectory = try await h.api.crews()
        let mine: CrewView = try XCTUnwrap(directory.mine)
        try await h.api.leaveCrew(id: mine.crew.id)
        let afterLeave: CrewDirectory = try await h.api.crews()
        XCTAssertNil(afterLeave.mine)

        let target: CrewView = try XCTUnwrap(afterLeave.discover.first(where: { (c: CrewView) -> Bool in
            return c.crew.open && c.crew.memberCount < FlowdConstants.Crews.maxMembers
        }))
        let joined: CrewView = try await h.api.joinCrew(id: target.crew.id)
        XCTAssertTrue(joined.isMine)
        XCTAssertEqual(joined.myRole, .member)
        XCTAssertEqual(joined.crew.memberCount, target.crew.memberCount + 1)
        let again: Error? = await TestSupport.thrownError {
            _ = try await h.api.leaveCrew(id: "crew_nope")
        }
        XCTAssertNotNil(again)
    }

    // MARK: Referrals

    func testReferralsEarnOnOneLevelOnlyAndInvitesAreRecorded() async throws {
        let h: MockHarness = TestSupport.harness()
        let before: ReferralSummary = try await h.api.referrals()
        XCTAssertFalse(before.code.isEmpty)
        XCTAssertTrue(before.link.hasSuffix("?ref=" + before.code))
        XCTAssertTrue(before.rules.contains(where: { (rule: String) -> Bool in
            return rule.contains("One level only")
        }))
        let invite: Referral = try await h.api.createReferralInvite(channel: "dm")
        XCTAssertEqual(invite.status, .invited)
        XCTAssertEqual(invite.channel, "dm")
        XCTAssertEqual(invite.code, before.code)
        XCTAssertEqual(invite.rewardRate, FlowdConstants.Referrals.creatorShareRate, accuracy: 0.0001)
        XCTAssertEqual(invite.rewardCapCents, FlowdConstants.Referrals.creatorShareCapPerRefereeCents)
        let after: ReferralSummary = try await h.api.referrals()
        XCTAssertEqual(after.referrals.count, before.referrals.count + 1)
        XCTAssertEqual(after.referrals.first?.id, invite.id, "Newest first.")
        XCTAssertEqual(after.earnedCents, before.earnedCents, "An invite earns nothing until the first dollar clears.")
        let linkInvite: Referral = try await h.api.createReferralInvite(channel: "")
        XCTAssertEqual(linkInvite.channel, "link")
    }

    // MARK: Specs and auctions

    private func specRequest(price: Int = FlowdConstants.Specs.priceFloorCents) -> CreateSpecRequest {
        return CreateSpecRequest(
            title: "Subscription audit",
            description: "A 22-second honest review.",
            video: TestSupport.video(assetId: "vid_spec_test"),
            formatId: nil,
            hookText: "I found the app that tracks every subscription I forgot about",
            hookType: .confession,
            category: .finance,
            priceCents: price,
            paidAdsDays: 90,
            exclusive: false
        )
    }

    func testASpecIsScoredBeforeItCanBeListedAndCanBeWithdrawn() async throws {
        let h: MockHarness = TestSupport.harness()
        let spec: Spec = try await h.api.createSpec(specRequest())
        XCTAssertEqual(spec.status, .scoring)
        XCTAssertEqual(spec.priceCents, FlowdConstants.Specs.priceFloorCents)
        XCTAssertEqual(spec.hookBand, ScoringEngine.band(for: spec.hookPoints))

        let scored: Spec = try await h.api.scoreSpec(id: spec.id)
        XCTAssertEqual(scored.flowBand, ScoringEngine.band(for: scored.flowPoints))
        let listable: Bool = scored.flowPoints >= FlowdConstants.Specs.minFlowPointsToList
        XCTAssertEqual(scored.status, listable ? .listed : .draft, "Only a take at Flow Score 55 or more is listed.")
        XCTAssertEqual(scored.listedAt != nil, listable)
        let withdrawn: Spec = try await h.api.withdrawSpec(id: spec.id)
        XCTAssertEqual(withdrawn.status, .withdrawn)
        let mine: [Spec] = try await h.api.specs()
        XCTAssertTrue(mine.contains(where: { (s: Spec) -> Bool in
            return s.id == spec.id && s.status == .withdrawn
        }))
    }

    func testASpecPriceAndHookAreValidated() async throws {
        let h: MockHarness = TestSupport.harness()
        let cheap: Error? = await TestSupport.thrownError {
            _ = try await h.api.createSpec(self.specRequest(price: FlowdConstants.Specs.priceFloorCents - 1))
        }
        let dear: Error? = await TestSupport.thrownError {
            _ = try await h.api.createSpec(self.specRequest(price: FlowdConstants.Specs.priceCapCents + 1))
        }
        for error in [cheap, dear] {
            guard case .validationFailed? = error as? FlowdAPIError else {
                XCTFail("Expected a validation error, got " + String(describing: error))
                return
            }
        }
    }

    func testAnAuctionNeedsPlatinumAndSealedBidsCannotBeCancelled() async throws {
        let h: MockHarness = TestSupport.harness()
        let opens: Date = FlowdClock.demoNow
        let request: CreateAuctionRequest = CreateAuctionRequest(
            title: "Three weeks of hooks",
            description: "Sealed bids for three videos.",
            slots: 3,
            reserveCents: 20_000,
            opensAt: opens,
            closesAt: FlowdCalendar.addDays(opens, 3)
        )
        let error: Error? = await TestSupport.thrownError {
            _ = try await h.api.createAuction(request)
        }
        XCTAssertEqual((error as? FlowdAPIError)?.code, "tier_locked", "Running an auction opens at Platinum.")
        let own: [Auction] = try await h.api.auctions()
        XCTAssertTrue(own.allSatisfy { (a: Auction) -> Bool in
            return a.creatorId == "cr_maya"
        })
        let missing: Error? = await TestSupport.thrownError {
            _ = try await h.api.cancelAuction(id: "auc_nope")
        }
        guard case .notFound? = missing as? FlowdAPIError else {
            XCTFail("Expected not found, got " + String(describing: missing))
            return
        }
    }

    // MARK: Remix library

    func testTheRemixLibraryRanksHooksByTrialRateAndTrendsByMomentum() async throws {
        let h: MockHarness = TestSupport.harness()
        let library: RemixLibrary = try await h.api.remixLibrary()
        XCTAssertFalse(library.formats.isEmpty)
        XCTAssertFalse(library.hooks.isEmpty)
        XCTAssertFalse(library.trends.isEmpty)
        let rates: [Double] = library.hooks.map { (hook: Hook) -> Double in
            return hook.stats.trialRate
        }
        XCTAssertEqual(rates, rates.sorted(by: >))
        let changes: [Double] = library.trends.map { (trend: Trend) -> Double in
            return trend.weeklyChangeRatio
        }
        XCTAssertEqual(changes, changes.sorted(by: >))
        let ranks: [Int] = library.formats.map { (format: Format) -> Int in
            return format.rank
        }
        XCTAssertEqual(ranks, ranks.sorted())
    }
}
