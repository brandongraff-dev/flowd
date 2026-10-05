import Foundation

// The resumable upload queue. A submitted take is a large video: it must survive a dropped connection, a killed app and a restart. The queue is a small
// JSON file in Application Support (one `UploadJob` per take); the Studio's uploader pulls the next runnable job, sends chunks of
// `chunkSizeBytes` and records progress after each, so a restart resumes at the last confirmed byte instead of from zero. Failures back off (5 s,
// 10 s, 20 s ... up to 5 minutes) and give up after `maxAttempts`, leaving the take safe on the phone with a "Try again" action.

enum UploadState: String, Codable, Hashable, Sendable, CaseIterable {
    case queued
    case uploading
    case paused
    case failed
    case done
}

struct UploadJob: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var draftId: String
    var bountyId: String
    /// The video, by file name in `FlowdDirectories.drafts`.
    var fileName: String
    var sizeBytes: Int
    var uploadedBytes: Int
    var chunkSizeBytes: Int
    /// From `FlowdAPI.beginUpload`: set once the server has opened the upload.
    var uploadId: String?
    var assetId: String?
    var state: UploadState
    var attempts: Int
    var lastError: String?
    /// When a failed job may be tried again.
    var nextAttemptAt: Date?
    /// Sent with the final submit so retrying never double-submits.
    var idempotencyKey: String
    var createdAt: Date
    var updatedAt: Date

    /// 0 to 1.
    var progress: Double {
        guard sizeBytes > 0 else {
            return state == .done ? 1 : 0
        }
        return Swift.min(1, Swift.max(0, Double(uploadedBytes) / Double(sizeBytes)))
    }

    var isFinished: Bool {
        return state == .done
    }

    /// True when the uploader may pick this job up at `now`.
    func isRunnable(at now: Date) -> Bool {
        switch state {
        case .queued:
            return (nextAttemptAt ?? Date.distantPast) <= now
        case .failed:
            return attempts < UploadBackoff.maxAttempts && (nextAttemptAt ?? Date.distantPast) <= now
        case .uploading, .paused, .done:
            return false
        }
    }

    /// "62% sent", "Waiting to retry", "Paused", "Sent".
    var statusLine: String {
        switch state {
        case .queued: return attempts > 0 ? "Waiting to retry" : "Waiting to upload"
        case .uploading: return Fmt.percent(progress, digits: 0) + " sent"
        case .paused: return "Paused"
        case .failed: return attempts >= UploadBackoff.maxAttempts ? "Stopped. Your take is saved on this phone." : "Waiting to retry"
        case .done: return "Sent"
        }
    }
}

enum UploadBackoff {
    static let maxAttempts: Int = 8
    static let baseSeconds: Double = 5
    static let capSeconds: Double = 300

    /// 5 s after the first failure, doubling, capped at 5 minutes.
    static func delay(afterAttempt attempt: Int) -> TimeInterval {
        let exponent: Int = Swift.max(0, Swift.min(10, attempt - 1))
        return Swift.min(capSeconds, baseSeconds * pow(2, Double(exponent)))
    }
}

actor UploadQueueStore {
    private var jobs: [UploadJob]
    private let fileURL: URL?

    /// Loads the queue from `fileURL` (default: Application Support/Flowd/Uploads/queue.json). Pass `nil` for an in-memory queue (tests, previews).
    init(fileURL: URL?) {
        self.fileURL = fileURL
        if let url = fileURL, let data = try? Data(contentsOf: url), let decoded = try? FlowdJSON.makeDecoder().decode([UploadJob].self, from: data) {
            // A job that was uploading when the app died is queued again, and resumes at its last confirmed byte.
            self.jobs = decoded.map { (job: UploadJob) -> UploadJob in
                var copy: UploadJob = job
                if copy.state == .uploading {
                    copy.state = .queued
                }
                return copy
            }
        } else {
            self.jobs = []
        }
    }

    /// The on-disk queue.
    static func makeDefault() -> UploadQueueStore {
        return UploadQueueStore(fileURL: FlowdDirectories.uploads.appendingPathComponent("queue.json", isDirectory: false))
    }

    // MARK: Reading

    func all() -> [UploadJob] {
        return jobs
    }

    func job(id: String) -> UploadJob? {
        return jobs.first(where: { (j: UploadJob) -> Bool in
            return j.id == id
        })
    }

    /// Jobs that are not done, oldest first.
    func pending() -> [UploadJob] {
        return jobs.filter { (j: UploadJob) -> Bool in
            return j.state != .done
        }.sorted { (a: UploadJob, b: UploadJob) -> Bool in
            return a.createdAt < b.createdAt
        }
    }

    /// The oldest job the uploader may run at `now`.
    func next(at now: Date = Date()) -> UploadJob? {
        return pending().first(where: { (j: UploadJob) -> Bool in
            return j.isRunnable(at: now)
        })
    }

    // MARK: Writing

    @discardableResult
    func enqueue(draftId: String, bountyId: String, fileName: String, sizeBytes: Int, chunkSizeBytes: Int = 4_194_304, idempotencyKey: String = UUID().uuidString, now: Date = Date()) -> UploadJob {
        if let existing = jobs.first(where: { (j: UploadJob) -> Bool in
            return j.draftId == draftId && j.state != .done
        }) {
            return existing
        }
        let job: UploadJob = UploadJob(
            id: "upj_" + UUID().uuidString.lowercased(),
            draftId: draftId,
            bountyId: bountyId,
            fileName: fileName,
            sizeBytes: sizeBytes,
            uploadedBytes: 0,
            chunkSizeBytes: chunkSizeBytes,
            uploadId: nil,
            assetId: nil,
            state: .queued,
            attempts: 0,
            lastError: nil,
            nextAttemptAt: nil,
            idempotencyKey: idempotencyKey,
            createdAt: now,
            updatedAt: now
        )
        jobs.append(job)
        persist()
        return job
    }

    @discardableResult
    func update(id: String, now: Date = Date(), _ change: (inout UploadJob) -> Void) -> UploadJob? {
        guard let index = jobs.firstIndex(where: { (j: UploadJob) -> Bool in
            return j.id == id
        }) else {
            return nil
        }
        var copy: UploadJob = jobs[index]
        change(&copy)
        copy.updatedAt = now
        jobs[index] = copy
        persist()
        return copy
    }

    /// The server opened the upload.
    @discardableResult
    func recordSession(id: String, uploadId: String, assetId: String, now: Date = Date()) -> UploadJob? {
        return update(id: id, now: now) { (j: inout UploadJob) in
            j.uploadId = uploadId
            j.assetId = assetId
            j.state = .uploading
        }
    }

    /// A chunk was confirmed.
    @discardableResult
    func recordProgress(id: String, uploadedBytes: Int, now: Date = Date()) -> UploadJob? {
        return update(id: id, now: now) { (j: inout UploadJob) in
            j.uploadedBytes = Swift.min(j.sizeBytes, Swift.max(j.uploadedBytes, uploadedBytes))
            j.state = .uploading
            j.lastError = nil
        }
    }

    @discardableResult
    func markDone(id: String, now: Date = Date()) -> UploadJob? {
        return update(id: id, now: now) { (j: inout UploadJob) in
            j.state = .done
            j.uploadedBytes = j.sizeBytes
            j.lastError = nil
            j.nextAttemptAt = nil
        }
    }

    /// A failure: back off, or give up after `UploadBackoff.maxAttempts`.
    @discardableResult
    func markFailed(id: String, message: String, now: Date = Date()) -> UploadJob? {
        return update(id: id, now: now) { (j: inout UploadJob) in
            j.attempts += 1
            j.lastError = message
            if j.attempts >= UploadBackoff.maxAttempts {
                j.state = .failed
                j.nextAttemptAt = nil
            } else {
                j.state = .queued
                j.nextAttemptAt = now.addingTimeInterval(UploadBackoff.delay(afterAttempt: j.attempts))
            }
        }
    }

    @discardableResult
    func pause(id: String, now: Date = Date()) -> UploadJob? {
        return update(id: id, now: now) { (j: inout UploadJob) in
            if j.state != .done {
                j.state = .paused
            }
        }
    }

    /// "Try again": resumes a paused or stopped job right away, keeping the bytes already sent.
    @discardableResult
    func resume(id: String, now: Date = Date()) -> UploadJob? {
        return update(id: id, now: now) { (j: inout UploadJob) in
            if j.state == .paused || j.state == .failed {
                j.state = .queued
                j.attempts = 0
                j.nextAttemptAt = nil
            }
        }
    }

    func remove(id: String) {
        jobs.removeAll(where: { (j: UploadJob) -> Bool in
            return j.id == id
        })
        persist()
    }

    /// Drops finished jobs.
    func clearFinished() {
        jobs.removeAll(where: { (j: UploadJob) -> Bool in
            return j.state == .done
        })
        persist()
    }

    private func persist() {
        guard let url = fileURL else {
            return
        }
        do {
            let data: Data = try FlowdJSON.makeEncoder().encode(jobs)
            try data.write(to: url, options: [.atomic])
        } catch {
            FlowdLog.upload.error("Could not save the upload queue: \(error.localizedDescription, privacy: .public)")
        }
    }
}
