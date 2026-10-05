import Foundation

/// Quiet hours and "numbers off" windows are written as local `HH:mm` pairs ("22:00" to "08:00") that may cross midnight. This answers "is `date` inside the
/// window in the creator's own time zone", with no `Calendar` and no locale (the same integer maths as `FlowdCalendar`).
enum WellbeingClock {
    /// "22:00" gives 1,320; nil for anything that is not `HH:mm`.
    static func minutes(_ text: String) -> Int? {
        let parts: [Substring] = text.split(separator: ":")
        guard parts.count == 2, let hour = Int(parts[0]), let minute = Int(parts[1]), hour >= 0, hour < 24, minute >= 0, minute < 60 else {
            return nil
        }
        return hour * 60 + minute
    }

    /// Minutes since local midnight at `date` in the time zone (0 to 1,439).
    static func localMinutes(_ date: Date, timeZoneIdentifier: String) -> Int {
        let zone: TimeZone = TimeZone(identifier: timeZoneIdentifier) ?? TimeZone(identifier: "UTC") ?? TimeZone.current
        let local: Date = Date(timeIntervalSince1970: date.timeIntervalSince1970 + TimeInterval(zone.secondsFromGMT(for: date)))
        let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = FlowdCalendar.components(local)
        return c.hour * 60 + c.minute
    }

    /// True when `date` falls in the window from `start` to `end` (end exclusive). A window that ends before it starts crosses midnight; equal start and
    /// end is an empty window. Unreadable times are never "inside".
    static func isWithin(start: String, end: String, timeZoneIdentifier: String, at date: Date) -> Bool {
        guard let from = minutes(start), let to = minutes(end), from != to else {
            return false
        }
        let now: Int = localMinutes(date, timeZoneIdentifier: timeZoneIdentifier)
        if from < to {
            return now >= from && now < to
        }
        return now >= from || now < to
    }
}
