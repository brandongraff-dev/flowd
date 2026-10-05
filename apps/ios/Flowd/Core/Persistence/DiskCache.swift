import Foundation

/// A simple Codable cache on disk (Caches/Flowd/Cache): the last good answer to a screen, so Home and the Wallet open instantly and still show something
/// useful offline (marked with its age, never passed off as live). Entries older than `maxAge` read as missing. The system may clear Caches at any time;
/// nothing here is the only copy of anything.
actor DiskCache {
    private struct Envelope<Value: Codable>: Codable {
        var savedAt: Date
        var value: Value
    }

    private let directory: URL

    init(directory: URL? = nil) {
        self.directory = directory ?? FlowdDirectories.cache
    }

    private func fileURL(for key: String) -> URL {
        var safe: String = ""
        for scalar in key.unicodeScalars {
            if (scalar.value >= 48 && scalar.value <= 57) || (scalar.value >= 97 && scalar.value <= 122) || (scalar.value >= 65 && scalar.value <= 90) || scalar == "-" || scalar == "_" {
                safe.unicodeScalars.append(scalar)
            } else {
                safe += "_"
            }
        }
        return directory.appendingPathComponent(String(safe.prefix(48)) + "-" + StableHash.hex8(key) + ".json", isDirectory: false)
    }

    /// The cached value, or nil when there is none, it is older than `maxAge`, or it no longer decodes.
    func load<Value: Codable>(_ type: Value.Type, key: String, maxAge: TimeInterval? = nil, now: Date = Date()) -> Value? {
        guard let data = try? Data(contentsOf: fileURL(for: key)) else {
            return nil
        }
        guard let envelope = try? FlowdJSON.makeDecoder().decode(Envelope<Value>.self, from: data) else {
            return nil
        }
        if let limit = maxAge, now.timeIntervalSince(envelope.savedAt) > limit {
            return nil
        }
        return envelope.value
    }

    /// When a cached value was saved.
    func savedAt(key: String) -> Date? {
        guard let data = try? Data(contentsOf: fileURL(for: key)) else {
            return nil
        }
        struct Stamp: Decodable {
            var savedAt: Date
        }
        return (try? FlowdJSON.makeDecoder().decode(Stamp.self, from: data))?.savedAt
    }

    func save<Value: Codable>(_ value: Value, key: String, now: Date = Date()) {
        do {
            let data: Data = try FlowdJSON.makeEncoder().encode(Envelope<Value>(savedAt: now, value: value))
            try data.write(to: fileURL(for: key), options: [.atomic])
        } catch {
            FlowdLog.persistence.error("Could not cache \(key, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    func remove(key: String) {
        try? FileManager.default.removeItem(at: fileURL(for: key))
    }

    /// Empties the cache (sign-out).
    func clear() {
        let manager: FileManager = FileManager.default
        guard let files = try? manager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else {
            return
        }
        for file in files where file.pathExtension == "json" {
            try? manager.removeItem(at: file)
        }
    }
}
