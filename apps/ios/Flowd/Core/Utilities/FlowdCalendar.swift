import Foundation

// Pure UTC time maths for the whole app. Every rule in flowd is stated in UTC (the 72-hour window, the 14:00 clearing run, the Friday
// 18:00 payout, ISO weeks), so the engine never touches `Calendar.current`, time zones or locale: it works on whole epoch seconds and
// civil dates computed with integer arithmetic. Mirrors apps/web/src/lib/engine/time.ts and packages/contract/schema/time.mjs.

enum FlowdCalendar {
    static let hour: TimeInterval = 3_600
    static let day: TimeInterval = 86_400
    static let week: TimeInterval = 604_800

    // MARK: Civil dates

    /// Days since 1970-01-01 for a proleptic Gregorian civil date (Howard Hinnant's algorithm).
    static func daysFromCivil(year: Int, month: Int, day: Int) -> Int {
        let y: Int = month <= 2 ? year - 1 : year
        let era: Int = (y >= 0 ? y : y - 399) / 400
        let yoe: Int = y - era * 400
        let mp: Int = month > 2 ? month - 3 : month + 9
        let doy: Int = (153 * mp + 2) / 5 + day - 1
        let doe: Int = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }

    /// The civil date of a day count since 1970-01-01.
    static func civilFromDays(_ days: Int) -> (year: Int, month: Int, day: Int) {
        let z: Int = days + 719_468
        let era: Int = (z >= 0 ? z : z - 146_096) / 146_097
        let doe: Int = z - era * 146_097
        let yoe: Int = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365
        let y: Int = yoe + era * 400
        let doy: Int = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp: Int = (5 * doy + 2) / 153
        let d: Int = doy - (153 * mp + 2) / 5 + 1
        let m: Int = mp < 10 ? mp + 3 : mp - 9
        return (year: m <= 2 ? y + 1 : y, month: m, day: d)
    }

    /// Floor division that is correct for negative numerators.
    static func floorDiv(_ a: Int, _ b: Int) -> Int {
        let q: Int = a / b
        return (a % b != 0 && ((a < 0) != (b < 0))) ? q - 1 : q
    }

    /// Whole seconds since the epoch, floored (every contract timestamp has second precision).
    static func epochSeconds(_ date: Date) -> Int {
        return Int(date.timeIntervalSince1970.rounded(.down))
    }

    static func date(epochSeconds: Int) -> Date {
        return Date(timeIntervalSince1970: TimeInterval(epochSeconds))
    }

    /// Year, month, day, hour, minute, second in UTC.
    static func components(_ date: Date) -> (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) {
        let seconds: Int = epochSeconds(date)
        let days: Int = floorDiv(seconds, 86_400)
        let rest: Int = seconds - days * 86_400
        let civil: (year: Int, month: Int, day: Int) = civilFromDays(days)
        return (civil.year, civil.month, civil.day, rest / 3_600, (rest % 3_600) / 60, rest % 60)
    }

    /// A UTC date from civil parts.
    static func make(year: Int, month: Int, day: Int, hour: Int = 0, minute: Int = 0, second: Int = 0) -> Date {
        let days: Int = daysFromCivil(year: year, month: month, day: day)
        return date(epochSeconds: days * 86_400 + hour * 3_600 + minute * 60 + second)
    }

    // MARK: Arithmetic

    static func addHours(_ date: Date, _ hours: Double) -> Date {
        return Date(timeIntervalSince1970: (date.timeIntervalSince1970 + hours * hour).rounded(.down))
    }

    static func addDays(_ date: Date, _ days: Double) -> Date {
        return Date(timeIntervalSince1970: (date.timeIntervalSince1970 + days * day).rounded(.down))
    }

    static func addMinutes(_ date: Date, _ minutes: Double) -> Date {
        return Date(timeIntervalSince1970: (date.timeIntervalSince1970 + minutes * 60).rounded(.down))
    }

    /// Adds calendar months in UTC, clamping the day to the end of the target month.
    static func addMonths(_ date: Date, _ months: Int) -> Date {
        let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = components(date)
        let total: Int = c.year * 12 + (c.month - 1) + months
        let year: Int = floorDiv(total, 12)
        let month: Int = total - year * 12 + 1
        let lastDay: Int = daysInMonth(year: year, month: month)
        return make(year: year, month: month, day: min(c.day, lastDay), hour: c.hour, minute: c.minute, second: c.second)
    }

    static func daysInMonth(year: Int, month: Int) -> Int {
        let next: Int = month == 12 ? daysFromCivil(year: year + 1, month: 1, day: 1) : daysFromCivil(year: year, month: month + 1, day: 1)
        return next - daysFromCivil(year: year, month: month, day: 1)
    }

    static func hoursBetween(_ from: Date, _ to: Date) -> Double {
        return to.timeIntervalSince(from) / hour
    }

    static func daysBetween(_ from: Date, _ to: Date) -> Double {
        return to.timeIntervalSince(from) / day
    }

    /// Midnight UTC of the day containing `date`.
    static func dayStart(_ date: Date) -> Date {
        let days: Int = floorDiv(epochSeconds(date), 86_400)
        return Self.date(epochSeconds: days * 86_400)
    }

    /// Calendar date "YYYY-MM-DD" (UTC).
    static func dayString(_ date: Date) -> String {
        let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = components(date)
        return pad(c.year, 4) + "-" + pad(c.month, 2) + "-" + pad(c.day, 2)
    }

    /// Midnight UTC of a "YYYY-MM-DD" string, or nil.
    static func parseDay(_ text: String) -> Date? {
        guard text.count >= 10 else { return nil }
        return FlowdDates.parse(String(text.prefix(10)))
    }

    /// UTC weekday: 0 = Sunday ... 6 = Saturday.
    static func weekday(_ date: Date) -> Int {
        let days: Int = floorDiv(epochSeconds(date), 86_400)
        // 1970-01-01 was a Thursday (4).
        let value: Int = (days + 4) % 7
        return value < 0 ? value + 7 : value
    }

    // MARK: ISO weeks

    /// ISO weekday: 1 = Monday ... 7 = Sunday.
    static func isoWeekday(_ date: Date) -> Int {
        let w: Int = weekday(date)
        return w == 0 ? 7 : w
    }

    /// ISO week label "2026-W40" (Monday to Sunday, UTC).
    static func isoWeek(_ date: Date) -> String {
        let days: Int = floorDiv(epochSeconds(date), 86_400)
        let isoDay: Int = isoWeekday(date)
        let thursday: Int = days + (4 - isoDay)
        let year: Int = civilFromDays(thursday).year
        let jan1: Int = daysFromCivil(year: year, month: 1, day: 1)
        let week: Int = ((thursday - jan1) + 7) / 7
        return String(year) + "-W" + pad(week, 2)
    }

    /// Monday 00:00:00Z of the ISO week containing `date`.
    static func isoWeekStart(_ date: Date) -> Date {
        let days: Int = floorDiv(epochSeconds(date), 86_400)
        let monday: Int = days - (isoWeekday(date) - 1)
        return Self.date(epochSeconds: monday * 86_400)
    }

    /// Monday 00:00:00Z of the next ISO week (the leaderboard reset).
    static func nextWeekStart(_ date: Date) -> Date {
        return addDays(isoWeekStart(date), 7)
    }

    /// Sunday 23:59:59Z of the ISO week containing `date`.
    static func isoWeekEnd(_ date: Date) -> Date {
        return Date(timeIntervalSince1970: nextWeekStart(date).timeIntervalSince1970 - 1)
    }

    /// Monday 00:00:00Z of "2026-W40", or nil for a malformed label.
    static func isoWeekToStart(_ label: String) -> Date? {
        let parts: [Substring] = label.split(separator: "-")
        guard parts.count == 2, let year = Int(parts[0]), parts[1].hasPrefix("W"), let week = Int(parts[1].dropFirst()) else {
            return nil
        }
        let jan4: Int = daysFromCivil(year: year, month: 1, day: 4)
        let jan4Weekday: Int = {
            let value: Int = (jan4 + 4) % 7
            let w: Int = value < 0 ? value + 7 : value
            return w == 0 ? 7 : w
        }()
        let week1Monday: Int = jan4 - (jan4Weekday - 1)
        return date(epochSeconds: (week1Monday + (week - 1) * 7) * 86_400)
    }

    /// "2026-W40" plus `weeks` (negative allowed).
    static func isoWeekAdd(_ label: String, _ weeks: Int) -> String? {
        guard let start = isoWeekToStart(label) else { return nil }
        return isoWeek(addDays(start, Double(weeks * 7)))
    }

    // MARK: Recurring runs

    /// First time strictly after `after` that is HH:00:00Z on any day.
    static func nextDailyAt(after: Date, hourUtc: Int) -> Date {
        let base: Int = epochSeconds(dayStart(after)) + hourUtc * 3_600
        let afterSeconds: Int = epochSeconds(after)
        return date(epochSeconds: base > afterSeconds ? base : base + 86_400)
    }

    /// First time strictly after `after` that is `weekday` (0 = Sunday) at HH:00:00Z.
    static func nextWeeklyAt(after: Date, weekday target: Int, hourUtc: Int) -> Date {
        var t: Int = epochSeconds(nextDailyAt(after: after, hourUtc: hourUtc))
        while weekday(date(epochSeconds: t)) != target {
            t += 86_400
        }
        return date(epochSeconds: t)
    }

    /// Most recent time at or before `atOrBefore` that is `weekday` at HH:00:00Z.
    static func prevWeeklyAt(atOrBefore: Date, weekday target: Int, hourUtc: Int) -> Date {
        var t: Int = epochSeconds(dayStart(atOrBefore)) + hourUtc * 3_600
        if t > epochSeconds(atOrBefore) {
            t -= 86_400
        }
        while weekday(date(epochSeconds: t)) != target {
            t -= 86_400
        }
        return date(epochSeconds: t)
    }

    // MARK: Labels

    private static let dayNames: [String] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    private static let monthNames: [String] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    /// "Sat 2:00 PM" in UTC (the contract's Money Clock wording).
    static func clockLabelUTC(_ date: Date) -> String {
        let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = components(date)
        let h12: Int = c.hour % 12 == 0 ? 12 : c.hour % 12
        return dayNames[weekday(date)] + " " + String(h12) + ":" + pad(c.minute, 2) + " " + (c.hour < 12 ? "AM" : "PM")
    }

    /// "Sat Oct 3" in UTC.
    static func dayLabelUTC(_ date: Date) -> String {
        let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = components(date)
        return dayNames[weekday(date)] + " " + monthNames[max(0, min(11, c.month - 1))] + " " + String(c.day)
    }

    static func pad(_ value: Int, _ width: Int) -> String {
        let text: String = String(value)
        if text.count >= width {
            return text
        }
        return String(repeating: "0", count: width - text.count) + text
    }
}
