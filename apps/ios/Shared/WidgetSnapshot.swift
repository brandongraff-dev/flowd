import Foundation

// What the Home Screen widget shows, written by the app and read by the widget extension through the App Group container (`group.app.flowd.creator`). The
// widget never talks to the network: it renders the last snapshot the app wrote, and says how old it is. Foundation only (this file is compiled into
// both targets); Core's `WidgetSnapshotPublisher` builds a snapshot from the Wallet, the streak and the Daily Drop and asks WidgetKit to reload.

enum FlowdAppGroup {
    static let identifier: String = "group.app.flowd.creator"

    /// The shared container, or nil when the entitlement is missing (a simulator build without signing, a unit test).
    static var containerURL: URL? {
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }
}

/// The numbers and dates the widget draws. Money is integer cents; every date is a real instant (the widget shows "Clears Sat 2:00 PM" from `nextClearsAt`).
struct FlowdWidgetSnapshot: Codable, Hashable {
    /// Bumped when the shape changes, so an old widget never misreads a new file.
    var schemaVersion: Int
    /// When the app wrote this snapshot.
    var updatedAt: Date
    var handle: String
    /// The contract tier string ("bronze" ... "elite").
    var tier: String
    /// Cleared and waiting for the weekly payout. Never summed with pending.
    var clearedCents: Int
    /// Accruing plus pending: the UI's "Pending".
    var pendingCents: Int
    var heldCents: Int
    /// The next 14:00 UTC clearing run that matters, and what clears then.
    var nextClearsAt: Date?
    var nextClearsCents: Int
    /// The next Friday 18:00 UTC weekly payout, and what it will carry.
    var nextPayoutAt: Date?
    var nextPayoutCents: Int
    var streakWeeks: Int
    var postedThisWeek: Bool
    /// Today's Daily Drop (16:00 UTC): when it opens, whether it is live, and the true count of spots left.
    var dropReleaseAt: Date?
    var dropIsLive: Bool
    var dropSpotsLeft: Int?
    /// True for the offline demo world ("Demo data").
    var isDemo: Bool
    /// Wellbeing Mode "numbers off": the widget shows words instead of amounts.
    var numbersHidden: Bool

    static let currentSchemaVersion: Int = 1

    init(
        schemaVersion: Int = FlowdWidgetSnapshot.currentSchemaVersion,
        updatedAt: Date,
        handle: String,
        tier: String,
        clearedCents: Int,
        pendingCents: Int,
        heldCents: Int = 0,
        nextClearsAt: Date? = nil,
        nextClearsCents: Int = 0,
        nextPayoutAt: Date? = nil,
        nextPayoutCents: Int = 0,
        streakWeeks: Int = 0,
        postedThisWeek: Bool = false,
        dropReleaseAt: Date? = nil,
        dropIsLive: Bool = false,
        dropSpotsLeft: Int? = nil,
        isDemo: Bool = false,
        numbersHidden: Bool = false
    ) {
        self.schemaVersion = schemaVersion
        self.updatedAt = updatedAt
        self.handle = handle
        self.tier = tier
        self.clearedCents = clearedCents
        self.pendingCents = pendingCents
        self.heldCents = heldCents
        self.nextClearsAt = nextClearsAt
        self.nextClearsCents = nextClearsCents
        self.nextPayoutAt = nextPayoutAt
        self.nextPayoutCents = nextPayoutCents
        self.streakWeeks = streakWeeks
        self.postedThisWeek = postedThisWeek
        self.dropReleaseAt = dropReleaseAt
        self.dropIsLive = dropIsLive
        self.dropSpotsLeft = dropSpotsLeft
        self.isDemo = isDemo
        self.numbersHidden = numbersHidden
    }

    /// What the widget shows before the app has ever written a snapshot (the widget gallery, a fresh install).
    static let placeholder: FlowdWidgetSnapshot = FlowdWidgetSnapshot(
        updatedAt: Date(timeIntervalSince1970: 1_791_036_000),
        handle: "maya.makes",
        tier: "silver",
        clearedCents: 8_600,
        pendingCents: 21_200,
        nextClearsAt: Date(timeIntervalSince1970: 1_791_122_400),
        nextClearsCents: 8_815,
        nextPayoutAt: Date(timeIntervalSince1970: 1_791_568_800),
        nextPayoutCents: 8_600,
        streakWeeks: 6,
        postedThisWeek: true,
        dropReleaseAt: Date(timeIntervalSince1970: 1_791_043_200),
        dropIsLive: false,
        dropSpotsLeft: 32,
        isDemo: true,
        numbersHidden: false
    )

    /// "Cleared $86.00" or, with numbers off, "Cleared".
    func clearedText() -> String {
        return numbersHidden ? "Cleared" : SharedMoney.string(clearedCents)
    }

    func pendingText() -> String {
        return numbersHidden ? "Pending" : SharedMoney.string(pendingCents)
    }

    /// How old the snapshot is at `now`, in whole minutes (the widget says "Updated 12 min ago" when it is stale).
    func ageMinutes(at now: Date) -> Int {
        return Swift.max(0, Int(now.timeIntervalSince(updatedAt) / 60))
    }

    /// True when the snapshot is older than `limitMinutes` (default 6 hours) and the widget should say so.
    func isStale(at now: Date, limitMinutes: Int = 360) -> Bool {
        return ageMinutes(at: now) > limitMinutes
    }
}

/// Reads and writes the snapshot file in the App Group container.
enum WidgetSnapshotStore {
    static let fileName: String = "widget-snapshot.json"

    static func fileURL(directory: URL? = nil) -> URL? {
        guard let base = directory ?? FlowdAppGroup.containerURL else {
            return nil
        }
        return base.appendingPathComponent(fileName, isDirectory: false)
    }

    private static func encoder() -> JSONEncoder {
        let encoder: JSONEncoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    private static func decoder() -> JSONDecoder {
        let decoder: JSONDecoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    /// The last snapshot the app wrote, or nil when there is none or it is from a newer app (a newer schema this widget cannot read).
    static func read(directory: URL? = nil) -> FlowdWidgetSnapshot? {
        guard let url = fileURL(directory: directory), let data = try? Data(contentsOf: url) else {
            return nil
        }
        guard let snapshot = try? decoder().decode(FlowdWidgetSnapshot.self, from: data) else {
            return nil
        }
        return snapshot.schemaVersion <= FlowdWidgetSnapshot.currentSchemaVersion ? snapshot : nil
    }

    /// Writes the snapshot atomically. Returns false when there is no container to write to.
    @discardableResult
    static func write(_ snapshot: FlowdWidgetSnapshot, directory: URL? = nil) throws -> Bool {
        guard let url = fileURL(directory: directory) else {
            return false
        }
        let data: Data = try encoder().encode(snapshot)
        try data.write(to: url, options: [.atomic])
        return true
    }

    static func remove(directory: URL? = nil) {
        guard let url = fileURL(directory: directory) else {
            return
        }
        try? FileManager.default.removeItem(at: url)
    }
}
