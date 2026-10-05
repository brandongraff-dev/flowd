import XCTest
@testable import Flowd

/// UTC calendar maths, the demo clock, wellbeing windows and deep links. Every rule in flowd is stated in UTC, so these tests never touch the device's
/// time zone or locale.
final class TimeAndLinkTests: XCTestCase {
    // MARK: Civil dates

    func testCivilDatesRoundTripThroughDayCounts() {
        XCTAssertEqual(FlowdCalendar.daysFromCivil(year: 1970, month: 1, day: 1), 0)
        XCTAssertEqual(FlowdCalendar.daysFromCivil(year: 2000, month: 3, day: 1), 11_017)
        let civil: (year: Int, month: Int, day: Int) = FlowdCalendar.civilFromDays(0)
        XCTAssertEqual(civil.year, 1970)
        XCTAssertEqual(civil.month, 1)
        XCTAssertEqual(civil.day, 1)
        var day: Int = -800
        while day <= 25_000 {
            let back: (year: Int, month: Int, day: Int) = FlowdCalendar.civilFromDays(day)
            XCTAssertEqual(FlowdCalendar.daysFromCivil(year: back.year, month: back.month, day: back.day), day)
            day += 37
        }
    }

    func testTheDemoNowIsASaturdayInIsoWeekForty() {
        let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = FlowdCalendar.components(FlowdClock.demoNow)
        XCTAssertEqual(c.year, 2026)
        XCTAssertEqual(c.month, 10)
        XCTAssertEqual(c.day, 3)
        XCTAssertEqual(c.hour, 14)
        XCTAssertEqual(c.minute, 0)
        XCTAssertEqual(c.second, 0)
        XCTAssertEqual(FlowdCalendar.weekday(FlowdClock.demoNow), 6)
        XCTAssertEqual(FlowdCalendar.isoWeekday(FlowdClock.demoNow), 6)
        XCTAssertEqual(FlowdCalendar.isoWeekday(TestSupport.date("2026-10-04T10:00:00Z")), 7, "Sunday is ISO day 7.")
        XCTAssertEqual(FlowdCalendar.weekday(TestSupport.date("2026-10-04T10:00:00Z")), 0)
        XCTAssertEqual(FlowdCalendar.isoWeek(FlowdClock.demoNow), "2026-W40")
        XCTAssertEqual(FlowdCalendar.make(year: 2026, month: 10, day: 3, hour: 14), FlowdClock.demoNow)
    }

    func testIsoWeeksRunMondayToSunday() {
        XCTAssertEqual(FlowdCalendar.isoWeekStart(FlowdClock.demoNow), TestSupport.date("2026-09-28T00:00:00Z"))
        XCTAssertEqual(FlowdCalendar.nextWeekStart(FlowdClock.demoNow), TestSupport.date("2026-10-05T00:00:00Z"))
        XCTAssertEqual(FlowdCalendar.isoWeekEnd(FlowdClock.demoNow), TestSupport.date("2026-10-04T23:59:59Z"))
        XCTAssertEqual(FlowdCalendar.isoWeekToStart("2026-W40"), TestSupport.date("2026-09-28T00:00:00Z"))
        XCTAssertEqual(FlowdCalendar.isoWeekAdd("2026-W40", -4), "2026-W36")
        XCTAssertEqual(FlowdCalendar.isoWeekAdd("2026-W40", 14), "2027-W01", "2026 has 53 ISO weeks, so week 40 + 14 weeks is the first week of 2027.")
        XCTAssertNil(FlowdCalendar.isoWeekToStart("not-a-week"))
        XCTAssertEqual(FlowdCalendar.isoWeek(TestSupport.date("2025-12-29T00:00:00Z")), "2026-W01", "The Monday before 2026 already belongs to ISO week 1 of 2026.")
        XCTAssertEqual(FlowdCalendar.isoWeek(TestSupport.date("2026-01-01T00:00:00Z")), "2026-W01")
    }

    func testRecurringRunsAreStrictlyAfterOrAtOrBefore() {
        XCTAssertEqual(FlowdCalendar.nextDailyAt(after: FlowdClock.demoNow, hourUtc: 14), TestSupport.date("2026-10-04T14:00:00Z"), "Strictly after 14:00:00.")
        XCTAssertEqual(FlowdCalendar.nextDailyAt(after: FlowdClock.demoNow, hourUtc: 16), TestSupport.date("2026-10-03T16:00:00Z"))
        XCTAssertEqual(FlowdCalendar.nextWeeklyAt(after: FlowdClock.demoNow, weekday: 5, hourUtc: 18), TestSupport.date("2026-10-09T18:00:00Z"))
        XCTAssertEqual(FlowdCalendar.prevWeeklyAt(atOrBefore: FlowdClock.demoNow, weekday: 5, hourUtc: 18), TestSupport.date("2026-10-02T18:00:00Z"))
        XCTAssertEqual(FlowdCalendar.prevWeeklyAt(atOrBefore: TestSupport.date("2026-10-09T18:00:00Z"), weekday: 5, hourUtc: 18), TestSupport.date("2026-10-09T18:00:00Z"))
    }

    func testMonthMathClampsToTheEndOfTheMonth() {
        XCTAssertEqual(FlowdCalendar.addMonths(TestSupport.date("2026-01-31T10:00:00Z"), 1), TestSupport.date("2026-02-28T10:00:00Z"))
        XCTAssertEqual(FlowdCalendar.addMonths(TestSupport.date("2026-10-31T10:00:00Z"), 4), TestSupport.date("2027-02-28T10:00:00Z"))
        XCTAssertEqual(FlowdCalendar.addMonths(TestSupport.date("2026-03-15T00:00:00Z"), -3), TestSupport.date("2025-12-15T00:00:00Z"))
        XCTAssertEqual(FlowdCalendar.daysInMonth(year: 2028, month: 2), 29)
        XCTAssertEqual(FlowdCalendar.daysInMonth(year: 2026, month: 2), 28)
        XCTAssertEqual(FlowdCalendar.daysInMonth(year: 2026, month: 12), 31)
    }

    func testDayStringsAndLabels() {
        XCTAssertEqual(FlowdCalendar.dayString(FlowdClock.demoNow), "2026-10-03")
        XCTAssertEqual(FlowdCalendar.parseDay("2026-10-03T14:00:00Z"), TestSupport.date("2026-10-03T00:00:00Z"))
        XCTAssertNil(FlowdCalendar.parseDay("soon"))
        XCTAssertEqual(FlowdCalendar.dayStart(FlowdClock.demoNow), TestSupport.date("2026-10-03T00:00:00Z"))
        XCTAssertEqual(FlowdCalendar.clockLabelUTC(FlowdClock.demoNow), "Sat 2:00 PM")
        XCTAssertEqual(FlowdCalendar.dayLabelUTC(FlowdClock.demoNow), "Sat Oct 3")
        XCTAssertEqual(FlowdCalendar.pad(7, 2), "07")
        XCTAssertEqual(FlowdCalendar.pad(2026, 2), "2026")
    }

    func testHoursAndEpochSecondsFloor() {
        XCTAssertEqual(FlowdCalendar.hoursBetween(FlowdClock.demoNow, TestSupport.date("2026-10-04T02:00:00Z")), 12, accuracy: 0.0001)
        XCTAssertEqual(FlowdCalendar.daysBetween(FlowdClock.demoNow, TestSupport.date("2026-10-10T14:00:00Z")), 7, accuracy: 0.0001)
        XCTAssertEqual(FlowdCalendar.epochSeconds(Date(timeIntervalSince1970: 1_791_036_000.9)), 1_791_036_000)
        XCTAssertEqual(FlowdCalendar.epochSeconds(Date(timeIntervalSince1970: -0.5)), -1)
        XCTAssertEqual(FlowdCalendar.addHours(FlowdClock.demoNow, 0.5), TestSupport.date("2026-10-03T14:30:00Z"))
        XCTAssertEqual(FlowdCalendar.addMinutes(FlowdClock.demoNow, 30), TestSupport.date("2026-10-03T14:30:00Z"))
        XCTAssertEqual(FlowdCalendar.addDays(FlowdClock.demoNow, 1.5), TestSupport.date("2026-10-05T02:00:00Z"))
    }

    // MARK: The demo clock

    func testTheDemoNowIsTheEpochTheFixturesAreBuiltAround() {
        XCTAssertEqual(FlowdClock.demoNow.timeIntervalSince1970, 1_791_036_000)
        XCTAssertEqual(FlowdDates.string(from: FlowdClock.demoNow), "2026-10-03T14:00:00Z")
    }

    func testAFrozenClockNeverMovesUntilItIsToldTo() {
        let clock: FlowdClock = FlowdClock.frozen()
        XCTAssertEqual(clock.currentMode, .frozen)
        XCTAssertEqual(clock.now, FlowdClock.demoNow)
        clock.advance(byHours: 80)
        XCTAssertEqual(clock.now, TestSupport.date("2026-10-06T22:00:00Z"))
        XCTAssertEqual(clock.currentMode, .frozen, "Advancing keeps a frozen clock frozen.")
        clock.set(TestSupport.date("2026-12-01T00:00:00Z"), mode: .frozen)
        XCTAssertEqual(clock.now, TestSupport.date("2026-12-01T00:00:00Z"))
    }

    func testATickingClockStartsAtItsBaseAndOnlyMovesForward() {
        let clock: FlowdClock = FlowdClock(mode: .ticking, base: FlowdClock.demoNow)
        let first: Date = clock.now
        XCTAssertGreaterThanOrEqual(first, FlowdClock.demoNow)
        XCTAssertLessThan(first.timeIntervalSince(FlowdClock.demoNow), 5)
        let second: Date = clock.now
        XCTAssertGreaterThanOrEqual(second, first)
        clock.advance(byHours: 24)
        XCTAssertGreaterThanOrEqual(clock.now.timeIntervalSince(FlowdClock.demoNow), 86_400)
        clock.resetToDemoNow()
        XCTAssertLessThan(clock.now.timeIntervalSince(FlowdClock.demoNow), 5)
        XCTAssertEqual(clock.currentMode, .ticking)
    }

    func testTheSystemClockIsTheDeviceClock() {
        let clock: FlowdClock = FlowdClock.frozen()
        clock.useSystemTime()
        XCTAssertEqual(clock.currentMode, .system)
        XCTAssertLessThan(abs(clock.now.timeIntervalSinceNow), 5)
        clock.advance(byHours: 1)
        XCTAssertEqual(clock.currentMode, .ticking, "Advancing the demo clock leaves the system clock behind.")
    }

    // MARK: Wellbeing windows

    func testClockTimesParseAsMinutesSinceMidnight() {
        XCTAssertEqual(WellbeingClock.minutes("22:00"), 1_320)
        XCTAssertEqual(WellbeingClock.minutes("08:30"), 510)
        XCTAssertEqual(WellbeingClock.minutes("00:00"), 0)
        XCTAssertNil(WellbeingClock.minutes("24:00"))
        XCTAssertNil(WellbeingClock.minutes("8"))
        XCTAssertNil(WellbeingClock.minutes("ab:cd"))
        XCTAssertNil(WellbeingClock.minutes("12:60"))
    }

    func testAQuietHoursWindowCanCrossMidnightInTheCreatorsOwnTimeZone() {
        let chicago: String = "America/Chicago"
        // 2026-10-03 14:00 UTC is 09:00 in Chicago (UTC-5).
        XCTAssertEqual(WellbeingClock.localMinutes(FlowdClock.demoNow, timeZoneIdentifier: chicago), 540)
        XCTAssertFalse(WellbeingClock.isWithin(start: "22:00", end: "08:00", timeZoneIdentifier: chicago, at: FlowdClock.demoNow))
        XCTAssertTrue(WellbeingClock.isWithin(start: "22:00", end: "08:00", timeZoneIdentifier: chicago, at: TestSupport.date("2026-10-04T03:30:00Z")), "22:30 in Chicago.")
        XCTAssertTrue(WellbeingClock.isWithin(start: "22:00", end: "08:00", timeZoneIdentifier: chicago, at: TestSupport.date("2026-10-03T12:30:00Z")), "07:30 in Chicago.")
        XCTAssertFalse(WellbeingClock.isWithin(start: "22:00", end: "08:00", timeZoneIdentifier: chicago, at: TestSupport.date("2026-10-03T13:00:00Z")), "The end of the window is exclusive.")
        XCTAssertTrue(WellbeingClock.isWithin(start: "22:00", end: "08:00", timeZoneIdentifier: chicago, at: TestSupport.date("2026-10-04T03:00:00Z")), "The start is inclusive.")
    }

    func testASameDayWindowAndTheEdgeCases() {
        XCTAssertTrue(WellbeingClock.isWithin(start: "13:00", end: "15:00", timeZoneIdentifier: "UTC", at: FlowdClock.demoNow))
        XCTAssertFalse(WellbeingClock.isWithin(start: "15:00", end: "16:00", timeZoneIdentifier: "UTC", at: FlowdClock.demoNow))
        XCTAssertFalse(WellbeingClock.isWithin(start: "10:00", end: "10:00", timeZoneIdentifier: "UTC", at: FlowdClock.demoNow), "Equal start and end is an empty window.")
        XCTAssertFalse(WellbeingClock.isWithin(start: "bad", end: "15:00", timeZoneIdentifier: "UTC", at: FlowdClock.demoNow))
        XCTAssertTrue(WellbeingClock.isWithin(start: "13:00", end: "15:00", timeZoneIdentifier: "Not/AZone", at: FlowdClock.demoNow), "An unknown zone reads as UTC.")
    }

    // MARK: Deep links

    func testAppSchemeLinksOpenTheirDestination() {
        XCTAssertEqual(DeepLink.parse("flowd://home"), .home)
        XCTAssertEqual(DeepLink.parse("flowd://bounty/bnty_stridely_runclub"), .bounty(id: "bnty_stridely_runclub"))
        XCTAssertEqual(DeepLink.parse("flowd://submission/sub_0664"), .submission(id: "sub_0664"))
        XCTAssertEqual(DeepLink.parse("flowd://post/post_0418"), .post(id: "post_0418"))
        XCTAssertEqual(DeepLink.parse("flowd://payout/pay_0330"), .payout(id: "pay_0330"))
        XCTAssertEqual(DeepLink.parse("flowd://payout"), .wallet)
        XCTAssertEqual(DeepLink.parse("flowd://offer/offer_0033"), .offer(id: "offer_0033"))
        XCTAssertEqual(DeepLink.parse("flowd://offer"), .inbox)
        XCTAssertEqual(DeepLink.parse("flowd://dispute/disp_001"), .dispute(id: "disp_001"))
        XCTAssertEqual(DeepLink.parse("flowd://tournament/tour_screen_record_sprint"), .tournament(id: "tour_screen_record_sprint"))
        XCTAssertEqual(DeepLink.parse("flowd://lesson/spotting-scams"), .lesson(slug: "spotting-scams"))
        XCTAssertEqual(DeepLink.parse("flowd://academy"), .academy)
        XCTAssertEqual(DeepLink.parse("flowd://drop"), .drop)
        XCTAssertEqual(DeepLink.parse("flowd://wallet"), .wallet)
        XCTAssertEqual(DeepLink.parse("flowd://wallet/clock"), .moneyClock)
        XCTAssertEqual(DeepLink.parse("flowd://moneyClock"), .moneyClock, "The fixtures spell it moneyClock.")
        XCTAssertEqual(DeepLink.parse("flowd://tiers"), .tiers)
        XCTAssertEqual(DeepLink.parse("flowd://settings/verification"), .settings(section: "verification"))
        XCTAssertEqual(DeepLink.parse("flowd://settings"), .settings(section: nil))
        XCTAssertEqual(DeepLink.parse("flowd://"), .home)
    }

    func testUniversalLinksOnJoinflowdIoOpenPublicPages() {
        XCTAssertEqual(DeepLink.parse("https://joinflowd.io/b/bnty_flowd_starter_2"), .bounty(id: "bnty_flowd_starter_2"))
        XCTAssertEqual(DeepLink.parse("https://joinflowd.io/c/maya.makes"), .creator(handle: "maya.makes"))
        XCTAssertEqual(DeepLink.parse("https://www.joinflowd.io/p/prf_h3ktei4q"), .proof(id: "prf_h3ktei4q"))
        XCTAssertEqual(DeepLink.parse("https://app.joinflowd.io/creator/wallet"), .wallet)
        XCTAssertEqual(DeepLink.parse("https://joinflowd.io/"), .home)
    }

    func testUnknownLinksAreKeptSoTheAppCanShowACalmToast() {
        XCTAssertEqual(DeepLink.parse("https://evil.example/b/bnty_x"), .unknown("https://evil.example/b/bnty_x"))
        XCTAssertEqual(DeepLink.parse("flowd://bounty"), .unknown("flowd://bounty"))
        XCTAssertEqual(DeepLink.parse("flowd://nonsense/1"), .unknown("flowd://nonsense/1"))
        XCTAssertEqual(DeepLink.parse("mailto:hello@joinflowd.io"), .unknown("mailto:hello@joinflowd.io"))
    }

    func testEveryDestinationHasAnAppUrlThatParsesBackToItself() {
        let links: [DeepLink] = [
            .home, .bounty(id: "bnty_x"), .submission(id: "sub_1"), .post(id: "post_1"), .payout(id: "pay_1"), .offer(id: "offer_1"), .dispute(id: "d_1"),
            .tournament(id: "tour_1"), .lesson(slug: "a-b"), .scorecard(brandId: "br_x"), .creator(handle: "maya.makes"), .proof(id: "prf_1"), .drop, .wallet,
            .moneyClock, .inbox, .studio, .tiers, .rights, .streak, .referrals, .tax, .safety, .wellbeing, .remix, .crew, .academy, .leaderboard, .changelog,
            .settings(section: nil), .settings(section: "notifications")
        ]
        for link in links {
            guard let url = link.url else {
                XCTFail("No URL for " + String(describing: link))
                continue
            }
            XCTAssertEqual(DeepLink.parse(url), link, url.absoluteString)
        }
        XCTAssertNil(DeepLink.unknown("x").url)
    }

    func testOnlyPublicPagesWorkWithoutASession() {
        XCTAssertFalse(DeepLink.creator(handle: "maya.makes").requiresSession)
        XCTAssertFalse(DeepLink.proof(id: "prf_1").requiresSession)
        XCTAssertFalse(DeepLink.unknown("x").requiresSession)
        XCTAssertTrue(DeepLink.wallet.requiresSession)
        XCTAssertTrue(DeepLink.bounty(id: "bnty_x").requiresSession)
        XCTAssertEqual(DeepLink.bounty(id: "bnty_x").universalURL?.absoluteString, "https://joinflowd.io/b/bnty_x")
        XCTAssertNil(DeepLink.wallet.universalURL)
    }

    func testEveryNotificationInTheDemoWorldOpensSomewhereReal() throws {
        let rows: [AppNotification] = try TestSupport.loader().load([AppNotification].self, named: "notifications").filter { (n: AppNotification) -> Bool in
            return n.audience == .creator
        }
        XCTAssertFalse(rows.isEmpty)
        for row in rows {
            let link: DeepLink = DeepLink.parse(row.deepLink)
            if case .unknown = link {
                XCTFail(row.id + " links to " + row.deepLink + ", which the app cannot open.")
            }
        }
    }
}
