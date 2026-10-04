import Foundation

// Hand-written model primitives shared by the generated entities (Enums*.swift, Entities*.swift) and the read models (ReadModels.swift).
// Money is always `Int` cents, rates are `Int` cents per 1,000 verified views, ratios are `Double` in 0...1, timestamps are `Date`
// (decoded from ISO-8601 UTC), calendar days are `String` ("YYYY-MM-DD"). See packages/contract/DOMAIN.md section 2.

/// The eight colour tones the contract gives every status-like enum value. Map to a design-system tone with `.flowdTone`
/// (Core/Utilities/DesignBridge.swift).
enum ContractTone: String, Codable, Hashable, Sendable, CaseIterable {
    case neutral
    case accent
    case violet
    case info
    case mint
    case ember
    case sun
    case rose

    init(from decoder: Decoder) throws {
        let container: SingleValueDecodingContainer = try decoder.singleValueContainer()
        let raw: String = try container.decode(String.self)
        self = ContractTone(rawValue: raw) ?? .neutral
    }
}

/// A cursor-paginated list as the API returns it: `{ "data": [...], "next_cursor": "...", "total": 120 }`.
struct Page<Element: Codable & Hashable & Sendable>: Codable, Hashable, Sendable {
    var data: [Element]
    var nextCursor: String?
    var total: Int?

    init(data: [Element], nextCursor: String? = nil, total: Int? = nil) {
        self.data = data
        self.nextCursor = nextCursor
        self.total = total
    }

    /// One page that holds everything (the mock API).
    static func single(_ data: [Element]) -> Page<Element> {
        return Page<Element>(data: data, nextCursor: nil, total: data.count)
    }

    var isEmpty: Bool {
        return data.isEmpty
    }
}

/// The server's error body: `{ "code": "tier_locked", "message": "...", "hint": "..." }`.
struct APIErrorBody: Codable, Hashable, Sendable {
    var code: String
    var message: String?
    var hint: String?
}
