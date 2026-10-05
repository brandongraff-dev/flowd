import XCTest
@testable import Flowd

/// A read-only view of one JSON object from `formula-vectors.json` (the reference outputs of `schema/formulas.mjs`). Absent keys and JSON nulls both
/// read as nil, so an expectation "no ETA" and a missing key are the same thing.
struct VectorObject {
    let raw: [String: Any]

    init(_ raw: [String: Any]) {
        self.raw = raw
    }

    func has(_ key: String) -> Bool {
        guard let value = raw[key] else {
            return false
        }
        return !(value is NSNull)
    }

    func int(_ key: String) -> Int? {
        guard let number = raw[key] as? NSNumber else {
            return nil
        }
        return number.intValue
    }

    func double(_ key: String) -> Double? {
        guard let number = raw[key] as? NSNumber else {
            return nil
        }
        return number.doubleValue
    }

    func bool(_ key: String) -> Bool? {
        guard let number = raw[key] as? NSNumber else {
            return nil
        }
        return number.boolValue
    }

    func string(_ key: String) -> String? {
        return raw[key] as? String
    }

    func date(_ key: String) -> Date? {
        guard let text = raw[key] as? String else {
            return nil
        }
        return FlowdDates.parse(text)
    }

    func object(_ key: String) -> VectorObject? {
        guard let inner = raw[key] as? [String: Any] else {
            return nil
        }
        return VectorObject(inner)
    }

    func objects(_ key: String) -> [VectorObject] {
        guard let list = raw[key] as? [[String: Any]] else {
            return []
        }
        return list.map { (item: [String: Any]) -> VectorObject in
            return VectorObject(item)
        }
    }
}

/// One vector: an input and the expected output. The input of `fraud` is an array, so both are kept as raw values.
struct VectorCase {
    let input: Any
    let output: Any

    var inObject: VectorObject {
        return VectorObject((input as? [String: Any]) ?? [:])
    }

    var outObject: VectorObject {
        return VectorObject((output as? [String: Any]) ?? [:])
    }

    var inList: [VectorObject] {
        let list: [[String: Any]] = (input as? [[String: Any]]) ?? []
        return list.map { (item: [String: Any]) -> VectorObject in
            return VectorObject(item)
        }
    }

    var outList: [VectorObject] {
        let list: [[String: Any]] = (output as? [[String: Any]]) ?? []
        return list.map { (item: [String: Any]) -> VectorObject in
            return VectorObject(item)
        }
    }
}

/// `packages/contract/formula-vectors.json`, embedded in the test target by `scripts/gen-ios-models.mjs`.
enum FormulaVectors {
    static func root() throws -> [String: Any] {
        let object: Any = try JSONSerialization.jsonObject(with: Data(FormulaVectorsData.json.utf8), options: [])
        guard let dictionary = object as? [String: Any] else {
            throw FlowdAPIError.decoding("formula-vectors.json is not an object")
        }
        return dictionary
    }

    /// The cases of one category ("funding", "settle_post", ...).
    static func cases(_ category: String) throws -> [VectorCase] {
        let all: [String: Any] = try root()
        guard let list = all[category] as? [[String: Any]] else {
            throw FlowdAPIError.decoding("formula-vectors.json has no category " + category)
        }
        return list.map { (entry: [String: Any]) -> VectorCase in
            return VectorCase(input: entry["in"] ?? NSNull(), output: entry["out"] ?? NSNull())
        }
    }

    static func categories() throws -> [String] {
        let all: [String: Any] = try root()
        return all.keys.filter { (key: String) -> Bool in
            return all[key] is [Any]
        }.sorted()
    }
}
