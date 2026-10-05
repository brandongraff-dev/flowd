import Foundation
import SwiftData

/// Creates the app's SwiftData container. One schema (`DraftRecord`); the store file lives in Application Support/Flowd/Drafts. Tests and previews use an
/// in-memory container.
enum FlowdPersistence {
    static var schema: Schema {
        return Schema([DraftRecord.self])
    }

    /// An on-disk container (the app), or an in-memory one (previews and tests).
    static func makeContainer(inMemory: Bool = false) throws -> ModelContainer {
        let schema: Schema = FlowdPersistence.schema
        if inMemory {
            let configuration: ModelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            return try ModelContainer(for: schema, configurations: [configuration])
        }
        let url: URL = FlowdDirectories.drafts.appendingPathComponent("drafts.store", isDirectory: false)
        let configuration: ModelConfiguration = ModelConfiguration(schema: schema, url: url)
        return try ModelContainer(for: schema, configurations: [configuration])
    }
}

/// Reads and writes Studio drafts. Main-actor, because SwiftData's main context is; features call it from their `@MainActor` view models.
@MainActor
final class DraftStore {
    private let container: ModelContainer

    init(container: ModelContainer) {
        self.container = container
    }

    /// A store on the on-disk container.
    static func make(inMemory: Bool = false) throws -> DraftStore {
        return DraftStore(container: try FlowdPersistence.makeContainer(inMemory: inMemory))
    }

    /// A store that always exists: on disk when it can be opened, in memory when it cannot (the Studio still works, drafts just don't survive a restart),
    /// and nil only when SwiftData itself is unavailable (the Studio then runs without saved drafts).
    static func makeResilient() -> DraftStore? {
        do {
            return try make(inMemory: false)
        } catch {
            FlowdLog.persistence.error("Draft store fell back to memory: \(error.localizedDescription, privacy: .public)")
            return try? make(inMemory: true)
        }
    }

    private var context: ModelContext {
        return container.mainContext
    }

    // MARK: Reading

    /// Drafts, newest first; only those for one bounty when `bountyId` is given.
    func drafts(bountyId: String? = nil) -> [DraftSnapshot] {
        var descriptor: FetchDescriptor<DraftRecord> = FetchDescriptor<DraftRecord>(sortBy: [SortDescriptor<DraftRecord>(\.updatedAt, order: .reverse)])
        if let wanted = bountyId {
            descriptor.predicate = #Predicate<DraftRecord> { record in
                record.bountyId == wanted
            }
        }
        do {
            return try context.fetch(descriptor).map { (record: DraftRecord) -> DraftSnapshot in
                return record.snapshot
            }
        } catch {
            FlowdLog.persistence.error("Could not read drafts: \(error.localizedDescription, privacy: .public)")
            return []
        }
    }

    func draft(id: String) -> DraftSnapshot? {
        return record(id: id)?.snapshot
    }

    var count: Int {
        let descriptor: FetchDescriptor<DraftRecord> = FetchDescriptor<DraftRecord>()
        return (try? context.fetchCount(descriptor)) ?? 0
    }

    private func record(id: String) -> DraftRecord? {
        var descriptor: FetchDescriptor<DraftRecord> = FetchDescriptor<DraftRecord>(predicate: #Predicate<DraftRecord> { record in
            record.id == id
        })
        descriptor.fetchLimit = 1
        let found: [DraftRecord] = (try? context.fetch(descriptor)) ?? []
        return found.first
    }

    // MARK: Writing

    /// Inserts a new draft or updates the one with the same id. `updatedAt` is stamped now.
    @discardableResult
    func save(_ snapshot: DraftSnapshot) throws -> DraftSnapshot {
        var stamped: DraftSnapshot = snapshot
        stamped.updatedAt = Date()
        if let existing = record(id: snapshot.id) {
            existing.apply(stamped)
        } else {
            context.insert(DraftRecord(snapshot: stamped))
        }
        try context.save()
        return stamped
    }

    /// Removes a draft and its recorded video file.
    func delete(id: String) throws {
        guard let existing = record(id: id) else {
            return
        }
        if let name = existing.videoFileName {
            removeVideo(named: name)
        }
        context.delete(existing)
        try context.save()
    }

    /// Removes every draft (sign-out, "delete my data").
    func deleteAll() throws {
        for snapshot in drafts() {
            try delete(id: snapshot.id)
        }
    }

    private func removeVideo(named name: String) {
        let url: URL = FlowdDirectories.draftVideo(name)
        do {
            if FileManager.default.fileExists(atPath: url.path) {
                try FileManager.default.removeItem(at: url)
            }
        } catch {
            FlowdLog.persistence.error("Could not delete a draft video: \(error.localizedDescription, privacy: .public)")
        }
    }
}
