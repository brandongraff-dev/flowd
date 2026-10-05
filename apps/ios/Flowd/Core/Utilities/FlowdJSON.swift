import Foundation

// JSON coding for the whole app. The contract is snake_case with ISO-8601 UTC timestamps (`2026-10-03T14:00:00Z`); the app decodes with
// `.convertFromSnakeCase` and a tolerant date strategy (Foundation's `.iso8601` rejects fractional seconds, which a live server may send).
// Fixtures, the persistence layer and LiveFlowdAPI all go through here so a model decodes the same way everywhere.

/// Fast, locale-independent ISO-8601 parsing and printing for contract timestamps.
enum FlowdDates {
    /// `2026-10-03T14:00:00Z`, with an optional `.123` fraction and an optional numeric offset; a bare `2026-10-03` is midnight UTC.
    static func parse(_ text: String) -> Date? {
        let b: [UInt8] = Array(text.utf8)
        let n: Int = b.count
        guard n >= 10 else {
            return nil
        }
        guard let year = digits(b, 0, 4), b[4] == 45, let month = digits(b, 5, 2), b[7] == 45, let day = digits(b, 8, 2) else {
            return nil
        }
        guard month >= 1, month <= 12, day >= 1, day <= 31 else {
            return nil
        }
        let days: Int = FlowdCalendar.daysFromCivil(year: year, month: month, day: day)
        if n == 10 {
            return FlowdCalendar.date(epochSeconds: days * 86_400)
        }
        guard n >= 19, b[10] == 84 || b[10] == 32 else {
            return nil
        }
        guard let hour = digits(b, 11, 2), b[13] == 58, let minute = digits(b, 14, 2), b[16] == 58, let second = digits(b, 17, 2) else {
            return nil
        }
        guard hour < 24, minute < 60, second < 61 else {
            return nil
        }
        var index: Int = 19
        var fraction: Double = 0
        if index < n && b[index] == 46 {
            index += 1
            var scale: Double = 0.1
            while index < n && b[index] >= 48 && b[index] <= 57 {
                fraction += Double(b[index] - 48) * scale
                scale /= 10
                index += 1
            }
        }
        var offsetSeconds: Int = 0
        if index < n {
            let marker: UInt8 = b[index]
            if marker == 90 {
                index += 1
            } else if marker == 43 || marker == 45 {
                guard let offsetHours = digits(b, index + 1, 2) else {
                    return nil
                }
                var offsetMinutes: Int = 0
                var next: Int = index + 3
                if next < n && b[next] == 58 {
                    next += 1
                }
                if let parsed = digits(b, next, 2) {
                    offsetMinutes = parsed
                    next += 2
                }
                let magnitude: Int = offsetHours * 3_600 + offsetMinutes * 60
                offsetSeconds = marker == 45 ? -magnitude : magnitude
                index = next
            } else {
                return nil
            }
        }
        guard index == n else {
            return nil
        }
        let seconds: Int = days * 86_400 + hour * 3_600 + minute * 60 + second - offsetSeconds
        return Date(timeIntervalSince1970: TimeInterval(seconds) + fraction)
    }

    /// `2026-10-03T14:00:00Z` (second precision, UTC).
    static func string(from date: Date) -> String {
        let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = FlowdCalendar.components(date)
        let datePart: String = FlowdCalendar.pad(c.year, 4) + "-" + FlowdCalendar.pad(c.month, 2) + "-" + FlowdCalendar.pad(c.day, 2)
        let timePart: String = FlowdCalendar.pad(c.hour, 2) + ":" + FlowdCalendar.pad(c.minute, 2) + ":" + FlowdCalendar.pad(c.second, 2)
        return datePart + "T" + timePart + "Z"
    }

    private static func digits(_ b: [UInt8], _ start: Int, _ count: Int) -> Int? {
        guard start >= 0, start + count <= b.count else {
            return nil
        }
        var value: Int = 0
        var i: Int = start
        while i < start + count {
            let c: UInt8 = b[i]
            guard c >= 48 && c <= 57 else {
                return nil
            }
            value = value * 10 + Int(c - 48)
            i += 1
        }
        return value
    }
}

/// A `CodingKey` that carries whatever string (or index) it is given. Used by the custom key strategy below.
struct FlowdAnyKey: CodingKey {
    var stringValue: String
    var intValue: Int?

    init(stringValue: String) {
        self.stringValue = stringValue
        self.intValue = nil
    }

    init?(intValue: Int) {
        self.stringValue = String(intValue)
        self.intValue = intValue
    }
}

/// snake_case to camelCase exactly as `scripts/lib/ios-names.mjs` `camelFromSnake` produces the Swift property names.
///
/// Foundation's `.convertFromSnakeCase` capitalises the first LETTER of each word, so `renewal_pct_per_30d` becomes `renewalPctPer30D`
/// and never matches the property `renewalPctPer30d`. Here only the first CHARACTER of each later segment is upper-cased (a digit stays a
/// digit) and the rest of the segment is lower-cased, so `30d` stays `30d`.
func flowdCamelFromSnake(_ key: String) -> String {
    if !key.contains("_") {
        return key
    }
    let chars: [Character] = Array(key)
    var start: Int = 0
    while start < chars.count && chars[start] == "_" {
        start += 1
    }
    if start == chars.count {
        return key
    }
    var end: Int = chars.count - 1
    while end > start && chars[end] == "_" {
        end -= 1
    }
    let lead: String = String(chars[0..<start])
    let trail: String = String(chars[(end + 1)...])
    let body: String = String(chars[start...end])
    let parts: [String] = body.split(separator: "_", omittingEmptySubsequences: true).map { (part: Substring) -> String in
        return String(part)
    }
    if parts.count <= 1 {
        return lead + body + trail
    }
    var out: String = parts[0].lowercased()
    for part in parts.dropFirst() {
        guard let first: Character = part.first else {
            continue
        }
        out += String(first).uppercased() + String(part.dropFirst()).lowercased()
    }
    return lead + out + trail
}

/// The app's JSON coders.
enum FlowdJSON {
    /// Decoder for contract JSON: snake_case keys, tolerant ISO-8601 dates. A fresh instance per call (decoders are cheap).
    static func makeDecoder() -> JSONDecoder {
        let decoder: JSONDecoder = JSONDecoder()
        decoder.keyDecodingStrategy = .custom { (codingPath: [CodingKey]) -> CodingKey in
            guard let last: CodingKey = codingPath.last else {
                return FlowdAnyKey(stringValue: "")
            }
            if last.intValue != nil {
                return last
            }
            return FlowdAnyKey(stringValue: flowdCamelFromSnake(last.stringValue))
        }
        decoder.dateDecodingStrategy = .custom { (inner: Decoder) -> Date in
            let container: SingleValueDecodingContainer = try inner.singleValueContainer()
            let text: String = try container.decode(String.self)
            if let date = FlowdDates.parse(text) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Not an ISO-8601 date: \(text)")
        }
        return decoder
    }

    /// Encoder for local persistence (drafts, caches, widget snapshots): camelCase keys exactly as the Swift properties, ISO-8601 dates.
    /// `makeDecoder()` reads these back (keys without an underscore are left alone by `.convertFromSnakeCase`).
    static func makeEncoder() -> JSONEncoder {
        let encoder: JSONEncoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { (date: Date, inner: Encoder) throws -> Void in
            var container: SingleValueEncodingContainer = inner.singleValueContainer()
            try container.encode(FlowdDates.string(from: date))
        }
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    /// Encoder for API request bodies: snake_case keys, ISO-8601 dates.
    static func makeAPIEncoder() -> JSONEncoder {
        let encoder: JSONEncoder = makeEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }

    static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        return try makeDecoder().decode(type, from: data)
    }

    static func encode<T: Encodable>(_ value: T) throws -> Data {
        return try makeEncoder().encode(value)
    }
}

/// An array that skips elements that fail to decode instead of failing the whole list. Used for live API pages so one bad row never blanks a
/// screen; fixtures are decoded strictly (the tests and `scripts/check-ios-models.mjs` guarantee every row is valid).
struct LossyArray<Element: Decodable>: Decodable {
    var elements: [Element]
    var skipped: Int

    init(from decoder: Decoder) throws {
        var container: UnkeyedDecodingContainer = try decoder.unkeyedContainer()
        var result: [Element] = []
        var failures: Int = 0
        while !container.isAtEnd {
            if let element = try? container.decode(Element.self) {
                result.append(element)
            } else {
                failures += 1
                // A failed decode does not advance an unkeyed container: decode a throwaway value to move past the bad element.
                if (try? container.decode(DiscardedValue.self)) == nil {
                    break
                }
            }
        }
        self.elements = result
        self.skipped = failures
    }
}

/// Decodes (and ignores) any JSON value.
struct DiscardedValue: Decodable {
    init(from decoder: Decoder) throws {
    }
}
