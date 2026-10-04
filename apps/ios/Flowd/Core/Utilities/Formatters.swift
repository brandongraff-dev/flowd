import Foundation

/// String formatting for money, rates, counts, time and ETAs. Pure, locale-independent (en-US conventions, USD only in v1) and thread-safe.
/// Views draw money with the design system's `MoneyText`; use `Fmt` for the strings around it: accessibility labels, notification copy,
/// CSV, the Live Activity and widget text, and tests. The output matches `FlowdMoneyFormat` / `FlowdNumberFormat` (a true minus sign, U+2212).
///
/// Time labels come in two flavours. The contract states every rule in UTC ("clears Sat 2:00 PM UTC"), so the `…UTC` functions are exact and
/// deterministic. The plain versions take a `TimeZone` (default: the device's) so a creator in Lisbon reads "Clears Sat 3:00 PM".
enum Fmt {
    static let minus: String = "\u{2212}"

    // MARK: Money

    /// `$1,284.60`, `−$12.00`, `+$1.50`. `showsCents: false` rounds to whole dollars.
    static func money(_ cents: Int, showsCents: Bool = true, signed: Bool = false) -> String {
        let negative: Bool = cents < 0
        let magnitude: Int = cents == Int.min ? Int.max : abs(cents)
        var dollars: Int = magnitude / 100
        let remainder: Int = magnitude % 100
        if !showsCents && remainder >= 50 {
            dollars += 1
        }
        var body: String = "$" + grouped(dollars)
        if showsCents {
            body += "." + (remainder < 10 ? "0" : "") + String(remainder)
        }
        if negative {
            return minus + body
        }
        if signed && cents > 0 {
            return "+" + body
        }
        return body
    }

    /// `$62`, `$1,284.60`: whole dollars when there are no cents (copy such as "The typical creator earned $62").
    static func moneyAuto(_ cents: Int) -> String {
        if cents % 100 == 0 {
            return money(cents, showsCents: false)
        }
        return money(cents)
    }

    /// `$1.2K`, `$4.8M`, `$62`.
    static func moneyCompact(_ cents: Int) -> String {
        let negative: Bool = cents < 0
        let dollars: Double = Double(cents == Int.min ? Int.max : abs(cents)) / 100
        let text: String = "$" + compact(dollars)
        return negative ? minus + text : text
    }

    /// A rate in cents per 1,000 verified views: `$2.10 per 1,000 views`.
    static func cpm(_ cents: Int) -> String {
        return money(cents) + " per 1,000 views"
    }

    /// `$2.10 / 1k`.
    static func cpmShort(_ cents: Int) -> String {
        return money(cents) + " / 1k"
    }

    /// `$2.10 CPM`.
    static func cpmLabel(_ cents: Int) -> String {
        return money(cents) + " CPM"
    }

    /// A pay range: `$17.56 to $111.91`.
    static func moneyRange(low: Int, high: Int) -> String {
        return money(low) + " to " + money(high)
    }

    // MARK: Numbers

    /// `1,284,600`.
    static func grouped(_ value: Int) -> String {
        let negative: Bool = value < 0
        let magnitude: Int = value == Int.min ? Int.max : abs(value)
        let digits: [Character] = Array(String(magnitude))
        var reversed: [Character] = []
        var counter: Int = 0
        for character in digits.reversed() {
            if counter > 0 && counter % 3 == 0 {
                reversed.append(",")
            }
            reversed.append(character)
            counter += 1
        }
        let text: String = String(reversed.reversed())
        return negative ? minus + text : text
    }

    /// `999`, `1K`, `1.2K`, `14.2K`, `142K`, `1.5M`, `2.1B`. One decimal below 100 of a unit, a trailing `.0` dropped.
    static func compact(_ value: Double) -> String {
        guard value.isFinite else {
            return "0"
        }
        let negative: Bool = value < 0
        let magnitude: Double = abs(value)
        let units: [String] = ["", "K", "M", "B", "T"]
        if magnitude < 1_000 {
            let rounded: Double = magnitude.rounded()
            if rounded < 1_000 {
                return (negative ? minus : "") + String(Int(rounded))
            }
        }
        var index: Int = 0
        var scaled: Double = magnitude
        while scaled >= 1_000 && index < units.count - 1 {
            scaled /= 1_000
            index += 1
        }
        while true {
            let rounded: Double = scaled < 100 ? (scaled * 10).rounded() / 10 : scaled.rounded()
            if rounded >= 1_000 && index < units.count - 1 {
                scaled = rounded / 1_000
                index += 1
                continue
            }
            let isWhole: Bool = rounded == rounded.rounded()
            let text: String = isWhole ? String(Int(rounded)) : oneDecimal(rounded)
            return (negative ? minus : "") + text + units[index]
        }
    }

    /// `compact` for an integer count.
    static func compact(_ value: Int) -> String {
        return compact(Double(value))
    }

    /// A ratio as a percentage: 0.12 gives `12%`, 0.015 gives `1.5%`. `digits` fixes the decimals; by default up to two are shown when needed.
    static func percent(_ ratio: Double, digits: Int? = nil) -> String {
        guard ratio.isFinite else {
            return "0%"
        }
        let pct: Double = ratio * 100
        if let digits = digits {
            return decimals(pct, digits) + "%"
        }
        let rounded: Double = (pct * 100).rounded() / 100
        if rounded == rounded.rounded() {
            return String(Int(rounded)) + "%"
        }
        return trimmedDecimal(rounded) + "%"
    }

    /// A fixed number of decimals, no locale: `decimal(1.55)` is `1.6`, `decimal(3, digits: 2)` is `3.00`.
    static func decimal(_ value: Double, digits: Int = 1) -> String {
        return decimals(value, digits)
    }

    /// `1.6x`.
    static func multiple(_ value: Double, digits: Int = 1) -> String {
        return trimmedDecimal((value * pow(10, Double(digits))).rounded() / pow(10, Double(digits))) + "x"
    }

    /// `12 min`, `2.5 h`, `3 days`: fill times, SLAs and decision speed.
    static func hours(_ hours: Double) -> String {
        guard hours.isFinite else {
            return "n/a"
        }
        if hours < 1 {
            return String(max(1, Int((hours * 60).rounded()))) + " min"
        }
        if hours < 36 {
            let rounded: Double = (hours * 10).rounded() / 10
            return trimmedDecimal(rounded) + " h"
        }
        let days: Int = Int((hours / 24).rounded())
        return String(days) + (days == 1 ? " day" : " days")
    }

    /// `1,234 views`, `1 view`.
    static func count(_ value: Int, _ singular: String, plural: String? = nil) -> String {
        return grouped(value) + " " + (value == 1 ? singular : (plural ?? singular + "s"))
    }

    /// `3 of 5`.
    static func ratioText(_ a: Int, of b: Int) -> String {
        return String(a) + " of " + String(b)
    }

    // MARK: Durations and timecodes

    /// `0:03`, `1:25`: a timecode from milliseconds.
    static func timecode(ms: Int) -> String {
        let total: Int = max(0, Int((Double(ms) / 1_000).rounded()))
        return String(total / 60) + ":" + FlowdCalendar.pad(total % 60, 2)
    }

    /// `2.4s`: seconds with one decimal.
    static func secondsLabel(ms: Int?) -> String {
        guard let ms = ms else {
            return "never"
        }
        return oneDecimal(Double(ms) / 1_000) + "s"
    }

    /// `00:24`, `1:02:03`: a clock from seconds (recording length, upload ETA).
    static func clock(seconds: Int) -> String {
        let total: Int = max(0, seconds)
        let h: Int = total / 3_600
        let m: Int = (total % 3_600) / 60
        let s: Int = total % 60
        if h > 0 {
            return String(h) + ":" + FlowdCalendar.pad(m, 2) + ":" + FlowdCalendar.pad(s, 2)
        }
        return FlowdCalendar.pad(m, 2) + ":" + FlowdCalendar.pad(s, 2)
    }

    /// `12.4 MB`.
    static func bytes(_ count: Int) -> String {
        let value: Double = Double(max(0, count))
        if value < 1_000 {
            return String(Int(value)) + " B"
        }
        if value < 1_000_000 {
            return oneDecimal(value / 1_000) + " KB"
        }
        if value < 1_000_000_000 {
            return oneDecimal(value / 1_000_000) + " MB"
        }
        return oneDecimal(value / 1_000_000_000) + " GB"
    }

    // MARK: Dates and ETAs

    /// `Sat 2:00 PM UTC`.
    static func clockLabelUTC(_ date: Date) -> String {
        return FlowdCalendar.clockLabelUTC(date) + " UTC"
    }

    /// `Sat 2:00 PM` in `timeZone` (default: the device's).
    static func clockLabel(_ date: Date, timeZone: TimeZone = TimeZone.current) -> String {
        let (parts, weekdayIndex): (DateComponentsLite, Int) = localParts(date, timeZone)
        let h12: Int = parts.hour % 12 == 0 ? 12 : parts.hour % 12
        let day: String = weekdayNames[weekdayIndex]
        return day + " " + String(h12) + ":" + FlowdCalendar.pad(parts.minute, 2) + " " + (parts.hour < 12 ? "AM" : "PM")
    }

    /// `2:00 PM` in `timeZone`.
    static func timeLabel(_ date: Date, timeZone: TimeZone = TimeZone.current) -> String {
        let (parts, _): (DateComponentsLite, Int) = localParts(date, timeZone)
        let h12: Int = parts.hour % 12 == 0 ? 12 : parts.hour % 12
        return String(h12) + ":" + FlowdCalendar.pad(parts.minute, 2) + " " + (parts.hour < 12 ? "AM" : "PM")
    }

    /// `Oct 9` in `timeZone`.
    static func dayLabel(_ date: Date, timeZone: TimeZone = TimeZone.current) -> String {
        let (parts, _): (DateComponentsLite, Int) = localParts(date, timeZone)
        return monthNames[max(0, min(11, parts.month - 1))] + " " + String(parts.day)
    }

    /// `Fri Oct 9, 6:00 PM UTC`: the fully dated form.
    static func datedClockLabelUTC(_ date: Date) -> String {
        return FlowdCalendar.dayLabelUTC(date) + ", " + FlowdCalendar.clockLabelUTC(date).split(separator: " ").dropFirst().joined(separator: " ") + " UTC"
    }

    /// `in 2 hours`, `in 3 days`, `5 hours ago`, `in a moment`. Minutes under an hour, rounded hours under 48 hours, whole days above.
    static func relative(_ target: Date, now: Date) -> String {
        let diff: TimeInterval = target.timeIntervalSince(now)
        let absolute: TimeInterval = abs(diff)
        var text: String
        if absolute < 90 {
            text = "a moment"
        } else if absolute < 3_600 {
            text = String(max(2, Int((absolute / 60).rounded()))) + " minutes"
        } else if absolute < 48 * 3_600 {
            let h: Int = max(1, Int((absolute / 3_600).rounded()))
            text = String(h) + (h == 1 ? " hour" : " hours")
        } else {
            text = String(Int((absolute / 86_400).rounded())) + " days"
        }
        if text == "a moment" {
            return diff >= 0 ? "in a moment" : "a moment ago"
        }
        return diff >= 0 ? "in " + text : text + " ago"
    }

    /// `41 h`, `2 h 10 min`, `12 min`: time left until `target` for countdown copy (never negative).
    static func timeLeft(until target: Date, now: Date) -> String {
        let seconds: Int = max(0, Int(target.timeIntervalSince(now)))
        let h: Int = seconds / 3_600
        let m: Int = (seconds % 3_600) / 60
        if h >= 48 {
            return String(h / 24) + " days"
        }
        if h >= 10 {
            return String(h) + " h"
        }
        if h >= 1 {
            return m == 0 ? String(h) + " h" : String(h) + " h " + String(m) + " min"
        }
        return String(max(1, m)) + " min"
    }

    /// The dated clear line of a Money Clock row in the creator's own time zone: `Clears Sat 2:00 PM`, `Pays Fri 6:00 PM`, `Arrives Mon 3:00 PM`.
    static func etaLine(state: MoneyClockState, etaAt: Date?, arrivesAt: Date? = nil, timeZone: TimeZone = TimeZone.current) -> String? {
        if let etaAt = etaAt {
            let verb: String = state == .cleared ? "Pays" : "Clears"
            return verb + " " + clockLabel(etaAt, timeZone: timeZone)
        }
        if let arrivesAt = arrivesAt {
            return "Arrives " + clockLabel(arrivesAt, timeZone: timeZone)
        }
        return nil
    }

    // MARK: Text helpers

    /// `a, b and c`.
    static func joinList(_ items: [String]) -> String {
        switch items.count {
        case 0:
            return ""
        case 1:
            return items[0]
        case 2:
            return items[0] + " and " + items[1]
        default:
            return items.dropLast().joined(separator: ", ") + " and " + (items.last ?? "")
        }
    }

    /// `maya.makes` -> `@maya.makes`.
    static func handle(_ handle: String) -> String {
        return handle.hasPrefix("@") ? handle : "@" + handle
    }

    // MARK: Internals

    private static let weekdayNames: [String] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    private static let monthNames: [String] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    struct DateComponentsLite {
        var year: Int
        var month: Int
        var day: Int
        var hour: Int
        var minute: Int
    }

    /// Civil parts of `date` in `timeZone`, computed from epoch seconds plus the zone's offset (no `Calendar`, so no locale or calendar surprises).
    private static func localParts(_ date: Date, _ timeZone: TimeZone) -> (DateComponentsLite, Int) {
        let offset: Int = timeZone.secondsFromGMT(for: date)
        let shifted: Date = Date(timeIntervalSince1970: date.timeIntervalSince1970 + TimeInterval(offset))
        let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = FlowdCalendar.components(shifted)
        let parts: DateComponentsLite = DateComponentsLite(year: c.year, month: c.month, day: c.day, hour: c.hour, minute: c.minute)
        return (parts, FlowdCalendar.weekday(shifted))
    }

    private static func oneDecimal(_ value: Double) -> String {
        return decimals(value, 1)
    }

    /// Fixed decimals, half away from zero, no locale.
    private static func decimals(_ value: Double, _ digits: Int) -> String {
        let places: Int = max(0, digits)
        let factor: Double = pow(10, Double(places))
        let scaled: Int = Int((abs(value) * factor).rounded())
        let sign: String = value < 0 && scaled != 0 ? "-" : ""
        if places == 0 {
            return sign + String(scaled)
        }
        let whole: Int = scaled / Int(factor)
        let fraction: Int = scaled % Int(factor)
        return sign + String(whole) + "." + FlowdCalendar.pad(fraction, places)
    }

    /// 2.5 -> `2.5`, 2.0 -> `2`, 2.25 -> `2.25`.
    private static func trimmedDecimal(_ value: Double) -> String {
        if value == value.rounded() {
            return String(Int(value))
        }
        var text: String = decimals(value, 2)
        while text.hasSuffix("0") {
            text.removeLast()
        }
        if text.hasSuffix(".") {
            text.removeLast()
        }
        return text
    }
}
