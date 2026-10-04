import Foundation

/// A stable, platform-independent hash (FNV-1a, 32-bit). Swift's own `hashValue` is randomised per launch, so anything that must come out the same
/// on every run (mock follower counts, generated ids, seeds) uses this instead.
enum StableHash {
    static func fnv1a(_ text: String) -> UInt32 {
        var hash: UInt32 = 2_166_136_261
        for byte in text.utf8 {
            hash ^= UInt32(byte)
            hash = hash &* 16_777_619
        }
        return hash
    }

    /// A deterministic Int in 0..<modulus derived from `text`.
    static func bucket(_ text: String, modulus: Int) -> Int {
        guard modulus > 0 else {
            return 0
        }
        return Int(fnv1a(text) % UInt32(modulus))
    }

    /// Eight lowercase hex digits ("a1b2c3d4"), for ids such as `prf_a1b2c3d4`.
    static func hex8(_ text: String) -> String {
        let value: UInt32 = fnv1a(text)
        let digits: String = String(value, radix: 16)
        if digits.count >= 8 {
            return String(digits.suffix(8))
        }
        return String(repeating: "0", count: 8 - digits.count) + digits
    }
}
