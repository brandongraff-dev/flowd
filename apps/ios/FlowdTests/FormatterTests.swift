import XCTest
@testable import Flowd

/// `Fmt`: money, counts, rates, durations and dated ETAs. Pure, locale-independent (en-US, USD only), so every expectation is an exact string.
final class FormatterTests: XCTestCase {
    private let utc: TimeZone = TimeZone.gmt

    // MARK: Money

    func testMoneyIsDollarsAndCentsWithGroupingAndATrueMinus() {
        XCTAssertEqual(Fmt.money(128_460), "$1,284.60")
        XCTAssertEqual(Fmt.money(0), "$0.00")
        XCTAssertEqual(Fmt.money(5), "$0.05")
        XCTAssertEqual(Fmt.money(100_000_000), "$1,000,000.00")
        XCTAssertEqual(Fmt.money(-1_200), "\u{2212}$12.00")
        XCTAssertEqual(Fmt.money(150, signed: true), "+$1.50")
        XCTAssertEqual(Fmt.money(-150, signed: true), "\u{2212}$1.50")
        XCTAssertEqual(Fmt.money(0, signed: true), "$0.00")
    }

    func testWholeDollarsRoundHalfUp() {
        XCTAssertEqual(Fmt.money(12_350, showsCents: false), "$124")
        XCTAssertEqual(Fmt.money(12_349, showsCents: false), "$123")
        XCTAssertEqual(Fmt.moneyAuto(6_200), "$62")
        XCTAssertEqual(Fmt.moneyAuto(6_210), "$62.10")
    }

    func testCompactMoneyAndNumbers() {
        XCTAssertEqual(Fmt.moneyCompact(120_000), "$1.2K")
        XCTAssertEqual(Fmt.moneyCompact(6_200), "$62")
        XCTAssertEqual(Fmt.moneyCompact(480_000_000), "$4.8M")
        XCTAssertEqual(Fmt.moneyCompact(-120_000), "\u{2212}$1.2K")
        XCTAssertEqual(Fmt.compact(999), "999")
        XCTAssertEqual(Fmt.compact(1_000), "1K")
        XCTAssertEqual(Fmt.compact(14_200), "14.2K")
        XCTAssertEqual(Fmt.compact(142_000), "142K")
        XCTAssertEqual(Fmt.compact(1_500_000), "1.5M")
        XCTAssertEqual(Fmt.compact(2_100_000_000), "2.1B")
        XCTAssertEqual(Fmt.compact(999_950), "1M", "Rounding up into the next unit never prints 1,000K.")
        XCTAssertEqual(Fmt.compact(0), "0")
        XCTAssertEqual(Fmt.compact(-1_500), "\u{2212}1.5K")
        XCTAssertEqual(Fmt.compact(Double.infinity), "0")
    }

    func testGroupedNumbers() {
        XCTAssertEqual(Fmt.grouped(0), "0")
        XCTAssertEqual(Fmt.grouped(999), "999")
        XCTAssertEqual(Fmt.grouped(1_000), "1,000")
        XCTAssertEqual(Fmt.grouped(1_284_600), "1,284,600")
        XCTAssertEqual(Fmt.grouped(-1_234), "\u{2212}1,234")
    }

    func testRatesAndRanges() {
        XCTAssertEqual(Fmt.cpm(210), "$2.10 per 1,000 views")
        XCTAssertEqual(Fmt.cpmShort(210), "$2.10 / 1k")
        XCTAssertEqual(Fmt.cpmLabel(210), "$2.10 CPM")
        XCTAssertEqual(Fmt.moneyRange(low: 1_756, high: 11_191), "$17.56 to $111.91")
    }

    // MARK: Percent, decimals, multiples

    func testPercentShowsDecimalsOnlyWhenNeeded() {
        XCTAssertEqual(Fmt.percent(0.12), "12%")
        XCTAssertEqual(Fmt.percent(0.015), "1.5%")
        XCTAssertEqual(Fmt.percent(0.0725), "7.25%")
        XCTAssertEqual(Fmt.percent(0.5, digits: 0), "50%")
        XCTAssertEqual(Fmt.percent(0.123, digits: 1), "12.3%")
        XCTAssertEqual(Fmt.percent(0), "0%")
        XCTAssertEqual(Fmt.percent(Double.nan), "0%")
    }

    func testDecimalsAndMultiplesDoNotDependOnTheLocale() {
        XCTAssertEqual(Fmt.decimal(1.55), "1.6")
        XCTAssertEqual(Fmt.decimal(3, digits: 2), "3.00")
        XCTAssertEqual(Fmt.decimal(-0.04), "0.0")
        XCTAssertEqual(Fmt.decimal(-2.5, digits: 1), "-2.5")
        XCTAssertEqual(Fmt.multiple(1.6), "1.6x")
        XCTAssertEqual(Fmt.multiple(2), "2x")
        XCTAssertEqual(Fmt.multiple(1.15, digits: 2), "1.15x")
    }

    func testHoursReadAsMinutesHoursOrDays() {
        XCTAssertEqual(Fmt.hours(0.2), "12 min")
        XCTAssertEqual(Fmt.hours(0.001), "1 min")
        XCTAssertEqual(Fmt.hours(2.5), "2.5 h")
        XCTAssertEqual(Fmt.hours(11.2), "11.2 h")
        XCTAssertEqual(Fmt.hours(12), "12 h")
        XCTAssertEqual(Fmt.hours(24), "24 h")
        XCTAssertEqual(Fmt.hours(36), "2 days")
        XCTAssertEqual(Fmt.hours(72), "3 days")
        XCTAssertEqual(Fmt.hours(Double.infinity), "n/a")
    }

    func testCountsAndRatios() {
        XCTAssertEqual(Fmt.count(1, "view"), "1 view")
        XCTAssertEqual(Fmt.count(1_234, "view"), "1,234 views")
        XCTAssertEqual(Fmt.count(2, "child", plural: "children"), "2 children")
        XCTAssertEqual(Fmt.ratioText(3, of: 5), "3 of 5")
        XCTAssertEqual(Fmt.joinList([]), "")
        XCTAssertEqual(Fmt.joinList(["TikTok"]), "TikTok")
        XCTAssertEqual(Fmt.joinList(["TikTok", "Instagram"]), "TikTok and Instagram")
        XCTAssertEqual(Fmt.joinList(["TikTok", "Instagram", "YouTube"]), "TikTok, Instagram and YouTube")
        XCTAssertEqual(Fmt.handle("maya.makes"), "@maya.makes")
        XCTAssertEqual(Fmt.handle("@maya.makes"), "@maya.makes")
    }

    // MARK: Timecodes and sizes

    func testTimecodesClocksAndBytes() {
        XCTAssertEqual(Fmt.timecode(ms: 3_000), "0:03")
        XCTAssertEqual(Fmt.timecode(ms: 85_000), "1:25")
        XCTAssertEqual(Fmt.timecode(ms: 2_400), "0:02")
        XCTAssertEqual(Fmt.timecode(ms: -5), "0:00")
        XCTAssertEqual(Fmt.secondsLabel(ms: 2_400), "2.4s")
        XCTAssertEqual(Fmt.secondsLabel(ms: 900), "0.9s")
        XCTAssertEqual(Fmt.secondsLabel(ms: nil), "never")
        XCTAssertEqual(Fmt.clock(seconds: 24), "00:24")
        XCTAssertEqual(Fmt.clock(seconds: 3_723), "1:02:03")
        XCTAssertEqual(Fmt.clock(seconds: -3), "00:00")
        XCTAssertEqual(Fmt.bytes(999), "999 B")
        XCTAssertEqual(Fmt.bytes(1_500), "1.5 KB")
        XCTAssertEqual(Fmt.bytes(12_400_000), "12.4 MB")
        XCTAssertEqual(Fmt.bytes(3_200_000_000), "3.2 GB")
    }

    // MARK: Dates and ETAs

    func testTheContractsMoneyClockWordingInUtc() {
        XCTAssertEqual(Fmt.clockLabelUTC(FlowdClock.demoNow), "Sat 2:00 PM UTC")
        XCTAssertEqual(Fmt.datedClockLabelUTC(TestSupport.date("2026-10-09T18:00:00Z")), "Fri Oct 9, 6:00 PM UTC")
        XCTAssertEqual(Fmt.clockLabelUTC(TestSupport.date("2026-10-04T00:05:00Z")), "Sun 12:05 AM UTC")
        XCTAssertEqual(Fmt.clockLabelUTC(TestSupport.date("2026-10-04T12:00:00Z")), "Sun 12:00 PM UTC")
    }

    func testLocalLabelsFollowTheCreatorsTimeZone() throws {
        let lisbon: TimeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Lisbon"))
        XCTAssertEqual(Fmt.clockLabel(FlowdClock.demoNow, timeZone: lisbon), "Sat 3:00 PM", "Lisbon is UTC+1 in October.")
        XCTAssertEqual(Fmt.clockLabel(FlowdClock.demoNow, timeZone: utc), "Sat 2:00 PM")
        XCTAssertEqual(Fmt.timeLabel(FlowdClock.demoNow, timeZone: lisbon), "3:00 PM")
        XCTAssertEqual(Fmt.dayLabel(FlowdClock.demoNow, timeZone: utc), "Oct 3")
        let tokyo: TimeZone = try XCTUnwrap(TimeZone(identifier: "Asia/Tokyo"))
        XCTAssertEqual(Fmt.dayLabel(TestSupport.date("2026-10-03T20:00:00Z"), timeZone: tokyo), "Oct 4", "Tokyo is already on the next day.")
    }

    func testRelativeTimeUsesMinutesHoursAndDays() {
        let now: Date = FlowdClock.demoNow
        XCTAssertEqual(Fmt.relative(now.addingTimeInterval(30), now: now), "in a moment")
        XCTAssertEqual(Fmt.relative(now.addingTimeInterval(-30), now: now), "a moment ago")
        XCTAssertEqual(Fmt.relative(now.addingTimeInterval(600), now: now), "in 10 minutes")
        XCTAssertEqual(Fmt.relative(now.addingTimeInterval(3_600), now: now), "in 1 hour")
        XCTAssertEqual(Fmt.relative(now.addingTimeInterval(2 * 3_600), now: now), "in 2 hours")
        XCTAssertEqual(Fmt.relative(now.addingTimeInterval(-5 * 3_600), now: now), "5 hours ago")
        XCTAssertEqual(Fmt.relative(now.addingTimeInterval(47 * 3_600), now: now), "in 47 hours")
        XCTAssertEqual(Fmt.relative(now.addingTimeInterval(3 * 86_400), now: now), "in 3 days")
    }

    func testCountdownsNeverGoNegative() {
        let now: Date = FlowdClock.demoNow
        XCTAssertEqual(Fmt.timeLeft(until: now.addingTimeInterval(41 * 3_600), now: now), "41 h")
        XCTAssertEqual(Fmt.timeLeft(until: now.addingTimeInterval(2 * 3_600 + 10 * 60), now: now), "2 h 10 min")
        XCTAssertEqual(Fmt.timeLeft(until: now.addingTimeInterval(3 * 3_600), now: now), "3 h")
        XCTAssertEqual(Fmt.timeLeft(until: now.addingTimeInterval(12 * 60), now: now), "12 min")
        XCTAssertEqual(Fmt.timeLeft(until: now.addingTimeInterval(50 * 3_600), now: now), "2 days")
        XCTAssertEqual(Fmt.timeLeft(until: now.addingTimeInterval(-300), now: now), "1 min")
    }

    func testAMoneyClockRowsEtaLineSaysClearsPaysOrArrives() {
        let friday: Date = TestSupport.date("2026-10-09T18:00:00Z")
        XCTAssertEqual(Fmt.etaLine(state: .cleared, etaAt: friday, timeZone: utc), "Pays Fri 6:00 PM")
        XCTAssertEqual(Fmt.etaLine(state: .pending, etaAt: friday, timeZone: utc), "Clears Fri 6:00 PM")
        XCTAssertEqual(Fmt.etaLine(state: .paid, etaAt: nil, arrivesAt: TestSupport.date("2026-10-12T15:00:00Z"), timeZone: utc), "Arrives Mon 3:00 PM")
        XCTAssertNil(Fmt.etaLine(state: .held, etaAt: nil, timeZone: utc))
    }

    // MARK: Parity with the widget's own formatter

    func testTheWidgetsMoneyFormatterMatchesTheAppsForEveryAmount() {
        let amounts: [Int] = [0, 5, 99, 100, 1_284_60, 8_600, 21_200, 123_456_789, -1_200, -5, 100_000_00, 99_999]
        for cents in amounts {
            XCTAssertEqual(SharedMoney.string(cents), Fmt.money(cents), "cents: " + String(cents))
            XCTAssertEqual(SharedMoney.string(cents, showsCents: false), Fmt.money(cents, showsCents: false), "whole dollars of " + String(cents))
        }
        XCTAssertEqual(SharedMoney.grouped(1_284_600), Fmt.grouped(1_284_600))
    }
}
