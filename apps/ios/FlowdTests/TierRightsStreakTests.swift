import XCTest
@testable import Flowd

/// Tiers (earned, never bought, with a 30-day grace), the Rights Card in plain language, weekly streaks without guilt, and reliability.
final class TierRightsStreakTests: XCTestCase {
    // MARK: Tiers

    func testApprovalRateCountsFinishedWorkOnlyAndRoundsToTwoDecimals() {
        XCTAssertEqual(TierEngine.approvalRate(approved: 21, decided: 27), 0.78, accuracy: 0.0001)
        XCTAssertEqual(TierEngine.approvalRate(approved: 0, decided: 0), 0)
        XCTAssertEqual(TierEngine.approvalRate(approved: 5, decided: 5), 1, accuracy: 0.0001)
    }

    func testEveryThresholdMustBeMetToHoldATier() {
        let exactlySilver: TierStats = TierStats(lifetimeClearedCents: 25_000, approvedCount: 5, approvalRate: 0.70, reliabilityScore: 0)
        XCTAssertTrue(TierEngine.meetsTier(.silver, exactlySilver))
        XCTAssertEqual(TierEngine.tierFor(exactlySilver), .silver)
        let shortOfCash: TierStats = TierStats(lifetimeClearedCents: 24_999, approvedCount: 5, approvalRate: 0.70, reliabilityScore: 0)
        XCTAssertEqual(TierEngine.tierFor(shortOfCash), .bronze)
        let shortOfRate: TierStats = TierStats(lifetimeClearedCents: 25_000, approvedCount: 5, approvalRate: 0.69, reliabilityScore: 0)
        XCTAssertEqual(TierEngine.tierFor(shortOfRate), .bronze)
        let strongButUnreliable: TierStats = TierStats(lifetimeClearedCents: 1_200_000, approvedCount: 90, approvalRate: 0.82, reliabilityScore: 89)
        XCTAssertEqual(TierEngine.tierFor(strongButUnreliable), .gold, "Platinum needs a reliability score of 90.")
        let needsReview: TierStats = TierStats(lifetimeClearedCents: 6_000_000, approvedCount: 300, approvalRate: 0.9, reliabilityScore: 97)
        XCTAssertEqual(TierEngine.tierFor(needsReview), .platinum, "Elite also needs a manual review by flowd.")
    }

    func testFoundingCarryOverCountsTowardTheThresholds() {
        let carry: CarryOver = CarryOver(
            source: "Verified earnings statements (other platforms)",
            clearedCents: 20_000,
            approvedCount: 6,
            decidedCount: 6,
            verifiedByUserId: "usr_ops",
            verifiedAt: FlowdClock.demoNow
        )
        let stats: TierStats = TierEngine.withCarryOver(lifetimeClearedCents: 10_000, approvedCount: 2, decidedCount: 4, reliabilityScore: 70, carry: carry)
        XCTAssertEqual(stats.lifetimeClearedCents, 30_000)
        XCTAssertEqual(stats.approvedCount, 8)
        XCTAssertEqual(stats.approvalRate, 0.8, accuracy: 0.0001, "8 approved of 10 finished.")
        XCTAssertEqual(TierEngine.tierFor(stats), .silver)
        let plain: TierStats = TierEngine.withCarryOver(lifetimeClearedCents: 10_000, approvedCount: 2, decidedCount: 4, reliabilityScore: 70, carry: nil)
        XCTAssertEqual(plain.lifetimeClearedCents, 10_000)
        XCTAssertEqual(TierEngine.tierFor(plain), .bronze)
    }

    func testTheRemainingListSaysWhatIsMissingInWords() {
        let maya: TierStats = TierStats(lifetimeClearedCents: 164_000, approvedCount: 21, approvalRate: 0.78, reliabilityScore: 93)
        let remaining: [TierRemaining] = TierEngine.remainingToNext(maya)
        XCTAssertEqual(remaining.map { (r: TierRemaining) -> String in return r.key }, ["lifetime_cleared", "approved", "approval_rate"])
        XCTAssertEqual(remaining[0].text, "$360.00 more cleared")
        XCTAssertEqual(remaining[0].remaining, 36_000, accuracy: 0.0001)
        XCTAssertEqual(remaining[1].text, "4 more approved posts")
        XCTAssertTrue(remaining[2].met)
        XCTAssertEqual(remaining[2].text, "", "A met criterion has no text.")
        XCTAssertEqual(remaining[2].remaining, 0, accuracy: 0.0001)
    }

    func testPerksAreListedPerTierAndTheNextTierShowsOnlyWhatIsNew() {
        XCTAssertEqual(TierEngine.perkLines(.bronze), [])
        XCTAssertEqual(TierEngine.perkLines(.silver), ["1-hour head start on new bounties", "Your own rate card"])
        XCTAssertTrue(TierEngine.perkLines(.gold).contains("1 free instant cash-out a week"))
        XCTAssertTrue(TierEngine.perkLines(.platinum).contains("Unlimited free instant cash-outs"))
        XCTAssertTrue(TierEngine.perkLines(.elite).contains("Featured on the creator directory"))
        XCTAssertEqual(TierEngine.whatUnlocksNext(.silver), ["Head start grows from 1 h to 3 h", "1 free instant cash-out a week", "Lead a crew"])
        XCTAssertEqual(TierEngine.whatUnlocksNext(.elite), [])
    }

    func testHigherTiersSeeANewBountyBeforeEveryoneElse() {
        let release: Date = TestSupport.date("2026-10-05T16:00:00Z")
        XCTAssertEqual(TierEngine.earlyAccessAt(releaseAt: release, tier: .bronze), release)
        XCTAssertEqual(TierEngine.earlyAccessAt(releaseAt: release, tier: .silver), TestSupport.date("2026-10-05T15:00:00Z"))
        XCTAssertEqual(TierEngine.earlyAccessAt(releaseAt: release, tier: .gold), TestSupport.date("2026-10-05T13:00:00Z"))
        XCTAssertEqual(TierEngine.earlyAccessAt(releaseAt: release, tier: .platinum), TestSupport.date("2026-10-05T10:00:00Z"))
        XCTAssertEqual(TierEngine.earlyAccessAt(releaseAt: release, tier: .elite), TestSupport.date("2026-10-05T04:00:00Z"))
        let at14: Date = TestSupport.date("2026-10-05T14:00:00Z")
        XCTAssertFalse(TierEngine.canSeeBounty(releaseAt: release, tier: .silver, now: at14))
        XCTAssertTrue(TierEngine.canSeeBounty(releaseAt: release, tier: .gold, now: at14))
    }

    func testThereIsNoTierDropForThirtyDaysAfterADip() {
        let dip: Date = TestSupport.date("2026-09-20T00:00:00Z")
        let held: (tier: Tier, basis: TierBasis, holdUntil: Date?) = TierEngine.tierWithGrace(heldTier: .gold, computedTier: .silver, dipStartedAt: dip, now: TestSupport.date("2026-10-03T14:00:00Z"))
        XCTAssertEqual(held.tier, .gold)
        XCTAssertEqual(held.basis, .graceHold)
        XCTAssertEqual(held.holdUntil, TestSupport.date("2026-10-20T00:00:00Z"))
        XCTAssertEqual(TierEngine.graceDaysLeft(holdUntil: TestSupport.date("2026-10-20T00:00:00Z"), now: TestSupport.date("2026-10-03T14:00:00Z")), 17)
        let after: (tier: Tier, basis: TierBasis, holdUntil: Date?) = TierEngine.tierWithGrace(heldTier: .gold, computedTier: .silver, dipStartedAt: dip, now: TestSupport.date("2026-10-21T00:00:00Z"))
        XCTAssertEqual(after.tier, .silver)
        XCTAssertEqual(after.basis, .earned)
        XCTAssertNil(after.holdUntil)
        let recovered: (tier: Tier, basis: TierBasis, holdUntil: Date?) = TierEngine.tierWithGrace(heldTier: .gold, computedTier: .gold, dipStartedAt: dip, now: TestSupport.date("2026-10-03T14:00:00Z"))
        XCTAssertEqual(recovered.basis, .earned)
        XCTAssertEqual(TierEngine.graceDaysLeft(holdUntil: dip, now: TestSupport.date("2026-10-03T14:00:00Z")), 0)
    }

    func testEvaluatingATierPromotesHoldsAndPausesWithoutGuilt() {
        let now: Date = TestSupport.date("2026-10-03T14:00:00Z")
        let goldStats: TierStats = TierStats(lifetimeClearedCents: 250_000, approvedCount: 30, approvalRate: 0.8, reliabilityScore: 80)
        let promoted: TierEvaluation = TierEngine.evaluate(stats: goldStats, heldTier: .silver, now: now)
        XCTAssertEqual(promoted.tier, .gold)
        XCTAssertEqual(promoted.event, .promoted)

        let silverStats: TierStats = TierStats(lifetimeClearedCents: 100_000, approvedCount: 20, approvalRate: 0.8, reliabilityScore: 80)
        let dip: TierEvaluation = TierEngine.evaluate(stats: silverStats, heldTier: .gold, now: now)
        XCTAssertEqual(dip.tier, .gold, "A dip starts a grace hold; the tier is kept.")
        XCTAssertEqual(dip.tierBasis, .graceHold)
        XCTAssertEqual(dip.event, .holdStarted)
        XCTAssertEqual(dip.tierHoldUntil, FlowdCalendar.addDays(now, 30))
        XCTAssertEqual(dip.computedTier, .silver)

        let later: TierEvaluation = TierEngine.evaluate(stats: silverStats, heldTier: .gold, heldBasis: .graceHold, dipStartedAt: dip.dipStartedAt, now: FlowdCalendar.addDays(now, 31))
        XCTAssertEqual(later.tier, .silver)
        XCTAssertEqual(later.event, .demoted)

        let recovered: TierEvaluation = TierEngine.evaluate(stats: goldStats, heldTier: .gold, heldBasis: .graceHold, dipStartedAt: dip.dipStartedAt, now: FlowdCalendar.addDays(now, 5))
        XCTAssertEqual(recovered.tier, .gold)
        XCTAssertEqual(recovered.event, .holdCleared)

        let paused: TierEvaluation = TierEngine.evaluate(stats: silverStats, heldTier: .gold, now: FlowdCalendar.addDays(now, 90), paused: true)
        XCTAssertEqual(paused.tier, .gold, "Pausing keeps your tier.")
        XCTAssertNil(paused.event)
    }

    // MARK: Rights

    private func organicCard() -> RightsCard {
        return RightsCard(organic: true, paidAdsDays: 0, adPlatforms: [], whitelisting: false, renewalPctPer30d: 0.25, exclusivityDays: 14, aiLikeness: false, territory: "Worldwide", summary: "")
    }

    private func paidCard() -> RightsCard {
        return RightsCard(organic: true, paidAdsDays: 90, adPlatforms: [.tiktok, .meta], whitelisting: true, renewalPctPer30d: 0.25, exclusivityDays: 0, aiLikeness: false, territory: "Worldwide", summary: "")
    }

    func testTheRightsCardReadsInPlainLanguageForAnOrganicOnlyBounty() {
        XCTAssertEqual(
            RightsEngine.summary(organicCard()),
            "You post this video on your own account. That is always included. Paid ads are not included. The brand needs your agreement and a separate price to run it as an ad. You agree not to make a video for a competing app for 14 days. Your voice and face are never cloned or recreated with AI. Territory: worldwide."
        )
    }

    func testTheRightsCardSaysWhatPaidAdsCostAndWhereTheyRun() {
        XCTAssertEqual(
            RightsEngine.summary(paidCard()),
            "You post this video on your own account. That is always included. The brand can also run it as a paid ad on TikTok and Meta for 90 days. You will be asked to approve the ad permission when your video is approved. After that it stops, unless the brand pays you 25% of your fee for every extra 30 days. There is no exclusivity. Your voice and face are never cloned or recreated with AI. Territory: worldwide."
        )
    }

    func testTheRightsLinesAreATableOfSevenRows() {
        let lines: [RightsLine] = RightsEngine.lines(paidCard())
        XCTAssertEqual(lines.map { (l: RightsLine) -> String in return l.id }, ["organic", "paid_ads", "whitelisting", "exclusivity", "ai_likeness", "renewal", "territory"])
        XCTAssertEqual(lines[1].value, "90 days on TikTok and Meta")
        XCTAssertTrue(lines[1].notable)
        XCTAssertEqual(lines[2].value, "Requested when approved")
        XCTAssertEqual(lines[4].value, "Off")
        XCTAssertFalse(lines[4].notable)
        XCTAssertEqual(lines[5].value, "25% of your fee per extra 30 days")
        let organic: [RightsLine] = RightsEngine.lines(organicCard())
        XCTAssertEqual(organic[1].value, "Not included")
        XCTAssertEqual(organic[3].value, "14 days")
        XCTAssertEqual(organic[5].value, "Not applicable")
    }

    func testARenewalIsPricedPerStartedThirtyDaysWithTheBrandPayingTheFee() {
        XCTAssertEqual(RightsEngine.renewalPricePer30(baseFeeCents: 15_300), 3_825)
        let end: Date = TestSupport.date("2026-12-01T00:00:00Z")
        let quote: RenewalQuote = RightsEngine.renewalQuote(baseFeeCents: 15_300, extraDays: 60, takeRate: 0.10, currentEndsAt: end)
        XCTAssertEqual(quote.periods, 2)
        XCTAssertEqual(quote.per30Cents, 3_825)
        XCTAssertEqual(quote.priceCents, 7_650)
        XCTAssertEqual(quote.feeCents, 765)
        XCTAssertEqual(quote.totalCents, 8_415)
        XCTAssertEqual(quote.newEndsAt, TestSupport.date("2027-01-30T00:00:00Z"), "Two more 30-day periods after December 1.")
        XCTAssertEqual(quote.summary, "Extend 60 days for $76.50 (+ $7.65 fee)")
        XCTAssertEqual(RightsEngine.renewalQuote(baseFeeCents: 15_300, extraDays: 31, takeRate: 0.10).periods, 2, "Each started 30 days counts.")
        let none: RenewalQuote = RightsEngine.renewalQuote(baseFeeCents: 15_300, extraDays: 0, takeRate: 0.10)
        XCTAssertEqual(none.summary, "Nothing to renew.")
        XCTAssertEqual(none.totalCents, 0)
    }

    func testExpiryAlertsGoOutAtThirtyFourteenAndSevenDaysAndOnlyTheMostUrgentIsSent() {
        let end: Date = TestSupport.date("2026-11-01T00:00:00Z")
        let at20: RightsAlertsDue = RightsEngine.dueExpiryAlerts(endsAt: end, alertsSent: [], now: FlowdCalendar.addDays(end, -20))
        XCTAssertEqual(at20.due, [30])
        XCTAssertEqual(at20.send, 30)
        let late: RightsAlertsDue = RightsEngine.dueExpiryAlerts(endsAt: end, alertsSent: [30], now: FlowdCalendar.addDays(end, -6))
        XCTAssertEqual(late.due, [14, 7])
        XCTAssertEqual(late.send, 7, "A late job sends only the most urgent alert.")
        let done: RightsAlertsDue = RightsEngine.dueExpiryAlerts(endsAt: end, alertsSent: [30, 14, 7], now: FlowdCalendar.addDays(end, -1))
        XCTAssertTrue(done.due.isEmpty)
        XCTAssertNil(done.send)
        let ended: RightsAlertsDue = RightsEngine.dueExpiryAlerts(endsAt: end, alertsSent: [], now: FlowdCalendar.addDays(end, 1))
        XCTAssertNil(ended.send)
        XCTAssertEqual(RightsEngine.daysLeft(endsAt: end, now: FlowdCalendar.addDays(end, -10)), 10, accuracy: 0.0001)
    }

    func testAGrantsStatusFollowsTheClockAndRevokedStaysRevoked() {
        let end: Date = TestSupport.date("2026-11-01T00:00:00Z")
        XCTAssertEqual(RightsEngine.deriveGrantStatus(status: .active, endsAt: end, revokedAt: nil, now: FlowdCalendar.addDays(end, -60)), .active)
        XCTAssertEqual(RightsEngine.deriveGrantStatus(status: .active, endsAt: end, revokedAt: nil, now: FlowdCalendar.addDays(end, -10)), .expiring)
        XCTAssertEqual(RightsEngine.deriveGrantStatus(status: .active, endsAt: end, revokedAt: nil, now: FlowdCalendar.addDays(end, 1)), .expired)
        XCTAssertEqual(RightsEngine.deriveGrantStatus(status: .active, endsAt: end, revokedAt: FlowdClock.demoNow, now: FlowdCalendar.addDays(end, -60)), .revoked)
        XCTAssertEqual(RightsEngine.deriveGrantStatus(status: .pendingPermission, endsAt: end, revokedAt: nil, now: FlowdCalendar.addDays(end, 10)), .pendingPermission)
        XCTAssertEqual(RightsEngine.deriveGrantStatus(status: .renewalRequested, endsAt: end, revokedAt: nil, now: FlowdCalendar.addDays(end, -5)), .renewalRequested)
        XCTAssertEqual(RightsEngine.deriveGrantStatus(status: .active, endsAt: nil, revokedAt: nil, now: FlowdClock.demoNow), .active)
    }

    // MARK: Streaks

    private func day(_ text: String) -> Date {
        return TestSupport.date(text + "T12:00:00Z")
    }

    func testWeeksAreNamedByTheirIsoWeekAndQuarter() {
        XCTAssertEqual(StreakEngine.quarterOfWeek("2026-W40"), "2026-Q4")
        XCTAssertEqual(StreakEngine.quarterOfWeek("2026-W01"), "2026-Q1")
        XCTAssertEqual(StreakEngine.quarterOfWeek("2026-W13"), "2026-Q1")
        XCTAssertEqual(StreakEngine.quarterOfWeek("2026-W14"), "2026-Q2")
        XCTAssertEqual(StreakEngine.quarterOfWeek("2026-W53"), "2026-Q4")
        XCTAssertEqual(StreakEngine.restWeeksUsedInQuarter(["2026-W13", "2026-W14", "2026-W15"], week: "2026-W14"), 2)
        XCTAssertEqual(FlowdCalendar.isoWeek(day("2027-01-01")), "2026-W53", "The first Friday of 2027 is still in ISO week 53 of 2026.")
        XCTAssertEqual(FlowdCalendar.isoWeekAdd("2026-W53", 1), "2027-W01")
    }

    func testTwoRestWeeksAPerQuarterAndNeverTheSameWeekTwice() {
        let first: RestWeekCheck = StreakEngine.canDeclareRestWeek(restWeeks: [], week: "2026-W40")
        XCTAssertTrue(first.ok)
        XCTAssertEqual(first.remaining, 1)
        let second: RestWeekCheck = StreakEngine.canDeclareRestWeek(restWeeks: ["2026-W40"], week: "2026-W41")
        XCTAssertTrue(second.ok)
        XCTAssertEqual(second.remaining, 0)
        let third: RestWeekCheck = StreakEngine.canDeclareRestWeek(restWeeks: ["2026-W40", "2026-W41"], week: "2026-W42")
        XCTAssertFalse(third.ok)
        XCTAssertTrue((third.reason ?? "").contains("both rest weeks"))
        let again: RestWeekCheck = StreakEngine.canDeclareRestWeek(restWeeks: ["2026-W40"], week: "2026-W40")
        XCTAssertFalse(again.ok)
        XCTAssertEqual(again.reason, "That week is already a rest week.")
        let nextQuarter: RestWeekCheck = StreakEngine.canDeclareRestWeek(restWeeks: ["2026-W40", "2026-W41"], week: "2027-W02")
        XCTAssertTrue(nextQuarter.ok, "The quota resets every quarter.")
    }

    func testFourPostedWeeksEarnAFreezeAndTheStreakCountsOnlyPostedWeeks() {
        let posts: [Date] = [day("2026-09-08"), day("2026-09-15"), day("2026-09-22"), day("2026-09-29")]
        let result: StreakEvaluation = StreakEngine.evaluate(postTimes: posts, now: FlowdClock.demoNow)
        XCTAssertEqual(result.currentWeeks, 4)
        XCTAssertEqual(result.bestWeeks, 4)
        XCTAssertEqual(result.freezesBanked, 1)
        XCTAssertEqual(result.freezesEarnedTotal, 1)
        XCTAssertEqual(result.status, .active)
        XCTAssertTrue(result.postedThisWeek)
        XCTAssertEqual(result.isoWeek, "2026-W40")
        XCTAssertEqual(result.weekEndsAt, TestSupport.date("2026-10-04T23:59:59Z"))
        XCTAssertEqual(result.history.count, 4)
        XCTAssertEqual(result.weeksToNextFreeze, 4)
    }

    func testAWeekThatIsStillRunningIsNeverCountedAsMissed() {
        let posts: [Date] = [day("2026-09-08"), day("2026-09-15")]
        let result: StreakEvaluation = StreakEngine.evaluate(postTimes: posts, now: TestSupport.date("2026-09-24T12:00:00Z"))
        XCTAssertEqual(result.isoWeek, "2026-W39")
        XCTAssertEqual(result.currentWeeks, 2, "W39 is still open, so the streak stands.")
        XCTAssertFalse(result.postedThisWeek)
        XCTAssertEqual(result.status, .active)
    }

    func testAMissedWeekSpendsAFreezeAndASecondMissStartsFreshKeepingTheBest() {
        let posts: [Date] = [day("2026-09-08"), day("2026-09-15"), day("2026-09-22"), day("2026-09-29")]
        let frozen: StreakEvaluation = StreakEngine.evaluate(postTimes: posts, now: day("2026-10-14"))
        XCTAssertEqual(frozen.isoWeek, "2026-W42")
        XCTAssertEqual(frozen.currentWeeks, 4)
        XCTAssertEqual(frozen.freezesBanked, 0)
        XCTAssertEqual(frozen.freezesUsedTotal, 1)
        XCTAssertEqual(frozen.status, .frozen)
        let broken: StreakEvaluation = StreakEngine.evaluate(postTimes: posts, now: day("2026-10-21"))
        XCTAssertEqual(broken.currentWeeks, 0)
        XCTAssertEqual(broken.bestWeeks, 4)
        XCTAssertEqual(broken.status, .broken)
    }

    func testARestWeekPausesAndSlackModeKeepTheStreakWithoutSpendingFreezes() {
        let posts: [Date] = [day("2026-09-08"), day("2026-09-15"), day("2026-09-22"), day("2026-09-29")]
        let rest: StreakEvaluation = StreakEngine.evaluate(postTimes: posts, now: day("2026-10-14"), restWeeks: ["2026-W41"])
        XCTAssertEqual(rest.currentWeeks, 4)
        XCTAssertEqual(rest.freezesBanked, 1, "A rest week does not spend the freeze.")
        XCTAssertEqual(rest.status, .resting)

        let pause: StreakPause = StreakPause(from: day("2026-10-05"), until: day("2026-10-12"))
        let paused: StreakEvaluation = StreakEngine.evaluate(postTimes: posts, now: day("2026-10-14"), pauses: [pause])
        XCTAssertEqual(paused.currentWeeks, 4)
        XCTAssertEqual(paused.freezesBanked, 1)

        let two: [Date] = [day("2026-09-08"), day("2026-09-15")]
        let slack: StreakEvaluation = StreakEngine.evaluate(postTimes: two, now: day("2026-10-07"), slackMode: true)
        XCTAssertEqual(slack.currentWeeks, 2, "Slack mode covers two quiet weeks automatically.")
        let tooLong: StreakEvaluation = StreakEngine.evaluate(postTimes: two, now: day("2026-10-14"), slackMode: true)
        XCTAssertEqual(tooLong.currentWeeks, 0)
    }

    func testStreakCopyIsCalmAndNeverThreatensALoss() {
        let statuses: [StreakStatus] = [.new, .active, .frozen, .resting, .broken]
        for status in statuses {
            for posted in [true, false] {
                let copy: StreakCopy = StreakEngine.copy(status: status, currentWeeks: 6, bestWeeks: 8, freezesBanked: 1, weeksToNextFreeze: 2, postedThisWeek: posted)
                let words: String = (copy.headline + " " + copy.detail).lowercased()
                XCTAssertFalse(words.contains("lose"), words)
                XCTAssertFalse(words.contains("lost"), words)
                XCTAssertFalse(words.contains("don't break"), words)
                XCTAssertFalse(copy.headline.isEmpty)
                XCTAssertFalse(copy.detail.isEmpty)
            }
        }
        XCTAssertFalse(FlowdConstants.Streaks.inactivityPenalty)
        XCTAssertFalse(FlowdConstants.Streaks.guiltNotifications)
    }

    // MARK: Reliability

    func testFewerThanFiveFinishedDecisionsIsProvisionalAtSeventy() {
        let decisions: [FinishedDecision] = [
            FinishedDecision(approved: true, decidedAt: FlowdClock.demoNow),
            FinishedDecision(approved: true, decidedAt: FlowdClock.demoNow),
            FinishedDecision(approved: false, decidedAt: FlowdClock.demoNow)
        ]
        let result: CreatorReliabilityResult = ReputationEngine.creatorReliability(
            decisions: decisions, now: FlowdClock.demoNow, onTimeOk: 3, onTimeTotal: 3, postThroughPosted: 2, postThroughApproved: 2,
            compliancePassed: 3, complianceTotal: 3, fraudConfirmed90d: 0, clawbacks90d: 0, disputesLost90d: 0, academyLessons: 0
        )
        XCTAssertTrue(result.provisional)
        XCTAssertEqual(result.score, 70)
        XCTAssertEqual(result.finishedN, 3)
        XCTAssertEqual(result.components.count, 5)
    }

    func testAPerfectRecordScoresOneHundredAndAClawbackCostsThreePoints() {
        let decisions: [FinishedDecision] = (0..<6).map { (_: Int) -> FinishedDecision in
            return FinishedDecision(approved: true, decidedAt: FlowdClock.demoNow)
        }
        let perfect: CreatorReliabilityResult = ReputationEngine.creatorReliability(
            decisions: decisions, now: FlowdClock.demoNow, onTimeOk: 6, onTimeTotal: 6, postThroughPosted: 6, postThroughApproved: 6,
            compliancePassed: 6, complianceTotal: 6, fraudConfirmed90d: 0, clawbacks90d: 0, disputesLost90d: 0, academyLessons: 0
        )
        XCTAssertFalse(perfect.provisional)
        XCTAssertEqual(perfect.score, 100)
        let clawed: CreatorReliabilityResult = ReputationEngine.creatorReliability(
            decisions: decisions, now: FlowdClock.demoNow, onTimeOk: 6, onTimeTotal: 6, postThroughPosted: 6, postThroughApproved: 6,
            compliancePassed: 6, complianceTotal: 6, fraudConfirmed90d: 0, clawbacks90d: 1, disputesLost90d: 0, academyLessons: 0
        )
        XCTAssertEqual(clawed.score, 97, "Clean record is worth 10 points; one clawback takes 30% of them.")
        let withAcademy: CreatorReliabilityResult = ReputationEngine.creatorReliability(
            decisions: decisions, now: FlowdClock.demoNow, onTimeOk: 6, onTimeTotal: 6, postThroughPosted: 6, postThroughApproved: 6,
            compliancePassed: 6, complianceTotal: 6, fraudConfirmed90d: 0, clawbacks90d: 1, disputesLost90d: 0, academyLessons: 4
        )
        XCTAssertEqual(withAcademy.score, 99, "Four Academy lessons add 2 points.")
        XCTAssertEqual(withAcademy.academyBonusPoints, 2, accuracy: 0.0001)
    }

    func testAnApprovalRateOfOneInFiveShowsUpInTheScoreAndTheRawRate() {
        var decisions: [FinishedDecision] = [FinishedDecision(approved: true, decidedAt: FlowdClock.demoNow)]
        for _ in 0..<4 {
            decisions.append(FinishedDecision(approved: false, decidedAt: FlowdClock.demoNow))
        }
        let result: CreatorReliabilityResult = ReputationEngine.creatorReliability(
            decisions: decisions, now: FlowdClock.demoNow, onTimeOk: 5, onTimeTotal: 5, postThroughPosted: 1, postThroughApproved: 1,
            compliancePassed: 5, complianceTotal: 5, fraudConfirmed90d: 0, clawbacks90d: 0, disputesLost90d: 0, academyLessons: 0
        )
        XCTAssertEqual(result.approvalRateRaw, 0.2, accuracy: 0.0001)
        XCTAssertEqual(result.score, 76, "30 x 0.2 + 20 + 20 + 20 + 10")
    }

    func testOlderDecisionsCountForLessThanRecentOnes() {
        let recent: FinishedDecision = FinishedDecision(approved: true, decidedAt: FlowdClock.demoNow)
        let old: FinishedDecision = FinishedDecision(approved: false, decidedAt: FlowdCalendar.addDays(FlowdClock.demoNow, -90))
        var decisions: [FinishedDecision] = [recent, old]
        for _ in 0..<4 {
            decisions.append(recent)
        }
        let result: CreatorReliabilityResult = ReputationEngine.creatorReliability(
            decisions: decisions, now: FlowdClock.demoNow, onTimeOk: 1, onTimeTotal: 1, postThroughPosted: 1, postThroughApproved: 1,
            compliancePassed: 1, complianceTotal: 1, fraudConfirmed90d: 0, clawbacks90d: 0, disputesLost90d: 0, academyLessons: 0
        )
        XCTAssertEqual(result.approvalRateRaw, 0.83, accuracy: 0.0001, "5 of 6 by count.")
        XCTAssertGreaterThan(result.approvalRateFinished, result.approvalRateRaw, "A 90-day-old rejection weighs a quarter of a recent one (half-life 45 days).")
    }
}
