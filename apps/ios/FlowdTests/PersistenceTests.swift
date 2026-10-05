import XCTest
@testable import Flowd

/// Studio drafts (SwiftData), the resumable upload queue and the on-disk answer cache. Drafts use an in-memory container; the queue and the cache write
/// to a fresh temporary folder per test and clean up after themselves.
@MainActor
final class DraftStoreTests: XCTestCase {
    private func makeStore() throws -> DraftStore {
        return try DraftStore.make(inMemory: true)
    }

    private func snapshot(_ id: String, bounty: String = "bnty_flowd_starter_2", title: String = "Honest review") -> DraftSnapshot {
        return DraftSnapshot(
            id: id,
            bountyId: bounty,
            title: title,
            script: "I stopped losing money on subscriptions.",
            hookText: "I stopped losing money on subscriptions.",
            caption: "My honest take",
            formatId: .tmplProblemSolution,
            stage: .score,
            videoFileName: nil,
            durationMs: 22_000,
            hookBand: .b,
            hookPoints: 78,
            flowBand: .b,
            flowPoints: 76,
            qaPass: 9,
            qaWarn: 1,
            qaFail: 0,
            checklist: ["hook": true, "app_reveal": true, "cta": false]
        )
    }

    func testADraftSurvivesASaveAndReadWithEveryField() throws {
        let store: DraftStore = try makeStore()
        let saved: DraftSnapshot = try store.save(snapshot("draft_a"))
        let read: DraftSnapshot = try XCTUnwrap(store.draft(id: "draft_a"))
        XCTAssertEqual(read, saved)
        XCTAssertEqual(read.formatId, .tmplProblemSolution)
        XCTAssertEqual(read.stage, .score)
        XCTAssertEqual(read.checklist["app_reveal"], true)
        XCTAssertEqual(read.checklist["cta"], false)
        XCTAssertEqual(read.hookBand, .b)
        XCTAssertEqual(read.flowPoints, 76)
        XCTAssertEqual(store.count, 1)
    }

    func testDraftsComeBackNewestFirstAndCanBeFilteredByBounty() async throws {
        let store: DraftStore = try makeStore()
        _ = try store.save(snapshot("draft_a", bounty: "bnty_x"))
        try await Task.sleep(nanoseconds: 20_000_000)
        _ = try store.save(snapshot("draft_b", bounty: "bnty_y"))
        try await Task.sleep(nanoseconds: 20_000_000)
        _ = try store.save(snapshot("draft_c", bounty: "bnty_x"))
        XCTAssertEqual(store.drafts().map { (d: DraftSnapshot) -> String in return d.id }, ["draft_c", "draft_b", "draft_a"])
        XCTAssertEqual(store.drafts(bountyId: "bnty_x").map { (d: DraftSnapshot) -> String in return d.id }, ["draft_c", "draft_a"])
        XCTAssertEqual(store.drafts(bountyId: "bnty_none"), [])
        XCTAssertEqual(store.count, 3)
    }

    func testSavingTheSameIdUpdatesTheDraftInPlace() async throws {
        let store: DraftStore = try makeStore()
        let first: DraftSnapshot = try store.save(snapshot("draft_a"))
        try await Task.sleep(nanoseconds: 20_000_000)
        var edited: DraftSnapshot = first
        edited.title = "A better title"
        edited.stage = .submit
        edited.checklist["cta"] = true
        let second: DraftSnapshot = try store.save(edited)
        XCTAssertEqual(store.count, 1, "One draft, edited.")
        let read: DraftSnapshot = try XCTUnwrap(store.draft(id: "draft_a"))
        XCTAssertEqual(read.title, "A better title")
        XCTAssertEqual(read.stage, .submit)
        XCTAssertEqual(read.checklist["cta"], true)
        XCTAssertEqual(read.createdAt, first.createdAt, "An edit never changes when the draft was started.")
        XCTAssertGreaterThan(second.updatedAt, first.updatedAt)
    }

    func testDeletingADraftRemovesItsRecordedVideoToo() throws {
        let store: DraftStore = try makeStore()
        let fileName: String = "test-take-" + UUID().uuidString.lowercased() + ".mp4"
        let url: URL = FlowdDirectories.draftVideo(fileName)
        try Data(repeating: 7, count: 2_048).write(to: url)
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        var draft: DraftSnapshot = snapshot("draft_video")
        draft.videoFileName = fileName
        _ = try store.save(draft)
        XCTAssertEqual(store.draft(id: "draft_video")?.videoURL?.lastPathComponent, fileName)
        try store.delete(id: "draft_video")
        XCTAssertNil(store.draft(id: "draft_video"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path), "The take is deleted with its draft.")
        try store.delete(id: "draft_video")
    }

    func testDeletingEverythingEmptiesTheStore() throws {
        let store: DraftStore = try makeStore()
        for id in ["draft_a", "draft_b", "draft_c"] {
            _ = try store.save(snapshot(id))
        }
        try store.deleteAll()
        XCTAssertEqual(store.count, 0)
        XCTAssertTrue(store.drafts().isEmpty)
    }

    func testTheDraftListLineSaysWhereTheTakeIs() {
        var draft: DraftSnapshot = snapshot("draft_a")
        draft.stage = .script
        draft.durationMs = 0
        XCTAssertFalse(draft.hasVideo)
        XCTAssertEqual(draft.summaryLine, "Script. Nothing recorded yet.")
        draft.stage = .capture
        draft.videoFileName = "take.mp4"
        draft.durationMs = 24_000
        XCTAssertTrue(draft.hasVideo)
        XCTAssertEqual(draft.summaryLine, "Capture. 0:24 recorded.")
        XCTAssertEqual(DraftStage.allCases.map { (s: DraftStage) -> Int in return s.index }, [0, 1, 2, 3, 4])
        XCTAssertEqual(DraftStage.score.title, "Score")
    }

    func testAnUnknownStoredStageOrBandFallsBackSoAnOldDraftStillOpens() throws {
        let record: DraftRecord = DraftRecord(snapshot: snapshot("draft_a"))
        record.stageRaw = "teleport"
        record.hookBandRaw = "Z"
        record.formatIdRaw = "tmpl_from_the_future"
        let read: DraftSnapshot = record.snapshot
        XCTAssertEqual(read.stage, .script)
        XCTAssertEqual(read.hookBand, .c)
        XCTAssertNil(read.formatId, "A format this build does not know reads as no format, never a crash.")
    }
}

final class UploadQueueTests: XCTestCase {
    private let t0: Date = FlowdClock.demoNow

    func testTheBackoffDoublesFromFiveSecondsAndStopsAtFiveMinutes() {
        XCTAssertEqual(UploadBackoff.delay(afterAttempt: 0), 5)
        XCTAssertEqual(UploadBackoff.delay(afterAttempt: 1), 5)
        XCTAssertEqual(UploadBackoff.delay(afterAttempt: 2), 10)
        XCTAssertEqual(UploadBackoff.delay(afterAttempt: 3), 20)
        XCTAssertEqual(UploadBackoff.delay(afterAttempt: 4), 40)
        XCTAssertEqual(UploadBackoff.delay(afterAttempt: 5), 80)
        XCTAssertEqual(UploadBackoff.delay(afterAttempt: 6), 160)
        XCTAssertEqual(UploadBackoff.delay(afterAttempt: 7), 300)
        XCTAssertEqual(UploadBackoff.delay(afterAttempt: 40), 300)
        XCTAssertEqual(UploadBackoff.maxAttempts, 8)
    }

    func testEnqueueingIsIdempotentPerDraftAndTheOldestRunnableJobIsNext() async {
        let queue: UploadQueueStore = UploadQueueStore(fileURL: nil)
        let first: UploadJob = await queue.enqueue(draftId: "d1", bountyId: "b1", fileName: "a.mp4", sizeBytes: 10_000_000, idempotencyKey: "key-1", now: t0)
        let again: UploadJob = await queue.enqueue(draftId: "d1", bountyId: "b1", fileName: "a.mp4", sizeBytes: 10_000_000, idempotencyKey: "key-other", now: t0)
        XCTAssertEqual(again.id, first.id, "One draft, one upload.")
        XCTAssertEqual(again.idempotencyKey, "key-1")
        XCTAssertEqual(first.state, .queued)
        XCTAssertEqual(first.progress, 0, accuracy: 0.0001)
        let second: UploadJob = await queue.enqueue(draftId: "d2", bountyId: "b1", fileName: "b.mp4", sizeBytes: 5_000_000, now: t0.addingTimeInterval(60))
        let next: UploadJob? = await queue.next(at: t0.addingTimeInterval(120))
        XCTAssertEqual(next?.id, first.id)
        let all: [UploadJob] = await queue.all()
        XCTAssertEqual(all.map { (j: UploadJob) -> String in return j.id }, [first.id, second.id])
    }

    func testProgressOnlyMovesForwardAndIsClampedToTheFileSize() async throws {
        let queue: UploadQueueStore = UploadQueueStore(fileURL: nil)
        let job: UploadJob = await queue.enqueue(draftId: "d1", bountyId: "b1", fileName: "a.mp4", sizeBytes: 10_000_000, now: t0)
        let opened: UploadJob? = await queue.recordSession(id: job.id, uploadId: "upl_1", assetId: "vid_0001", now: t0)
        XCTAssertEqual(opened?.state, .uploading)
        XCTAssertEqual(opened?.assetId, "vid_0001")
        let nextWhileUploading: UploadJob? = await queue.next(at: t0)
        XCTAssertNil(nextWhileUploading, "A job that is uploading is not picked up twice.")
        let half: UploadJob? = await queue.recordProgress(id: job.id, uploadedBytes: 4_194_304, now: t0)
        let progress: Double = try XCTUnwrap(half).progress
        XCTAssertEqual(progress, 0.4194304, accuracy: 0.0001)
        XCTAssertEqual(half?.statusLine, "42% sent")
        let backwards: UploadJob? = await queue.recordProgress(id: job.id, uploadedBytes: 1_000, now: t0)
        XCTAssertEqual(backwards?.uploadedBytes, 4_194_304, "A late, smaller report never rewinds the upload.")
        let over: UploadJob? = await queue.recordProgress(id: job.id, uploadedBytes: 50_000_000, now: t0)
        XCTAssertEqual(over?.uploadedBytes, 10_000_000)
        XCTAssertEqual(over?.progress ?? 0, 1, accuracy: 0.0001)
    }

    func testAFailureBacksOffThenGivesUpAfterEightAttemptsAndTryAgainResumesWhereItStopped() async throws {
        let queue: UploadQueueStore = UploadQueueStore(fileURL: nil)
        let job: UploadJob = await queue.enqueue(draftId: "d1", bountyId: "b1", fileName: "a.mp4", sizeBytes: 10_000_000, now: t0)
        _ = await queue.recordProgress(id: job.id, uploadedBytes: 6_000_000, now: t0)
        var expected: [TimeInterval] = [5, 10, 20, 40, 80, 160, 300]
        var clock: Date = t0
        for attempt in 1...7 {
            let result: UploadJob? = await queue.markFailed(id: job.id, message: "Connection lost", now: clock)
            let failed: UploadJob = try XCTUnwrap(result)
            XCTAssertEqual(failed.state, .queued)
            XCTAssertEqual(failed.attempts, attempt)
            let wait: TimeInterval = expected.removeFirst()
            XCTAssertEqual(failed.nextAttemptAt, clock.addingTimeInterval(wait), "After failure " + String(attempt))
            XCTAssertFalse(failed.isRunnable(at: clock))
            XCTAssertTrue(failed.isRunnable(at: clock.addingTimeInterval(wait)))
            XCTAssertEqual(failed.statusLine, "Waiting to retry")
            clock = clock.addingTimeInterval(wait)
        }
        let last: UploadJob? = await queue.markFailed(id: job.id, message: "Connection lost", now: clock)
        let stopped: UploadJob = try XCTUnwrap(last)
        XCTAssertEqual(stopped.state, .failed)
        XCTAssertEqual(stopped.attempts, 8)
        XCTAssertNil(stopped.nextAttemptAt)
        XCTAssertFalse(stopped.isRunnable(at: clock.addingTimeInterval(86_400)))
        XCTAssertEqual(stopped.statusLine, "Stopped. Your take is saved on this phone.")
        XCTAssertEqual(stopped.lastError, "Connection lost")

        let again: UploadJob? = await queue.resume(id: job.id, now: clock)
        let resumed: UploadJob = try XCTUnwrap(again)
        XCTAssertEqual(resumed.state, .queued)
        XCTAssertEqual(resumed.attempts, 0)
        XCTAssertEqual(resumed.uploadedBytes, 6_000_000, "Try again keeps the bytes already sent.")
        XCTAssertTrue(resumed.isRunnable(at: clock))
    }

    func testPausingFinishingAndClearingJobs() async throws {
        let queue: UploadQueueStore = UploadQueueStore(fileURL: nil)
        let job: UploadJob = await queue.enqueue(draftId: "d1", bountyId: "b1", fileName: "a.mp4", sizeBytes: 1_000, now: t0)
        let paused: UploadJob? = await queue.pause(id: job.id, now: t0)
        XCTAssertEqual(paused?.state, .paused)
        XCTAssertEqual(paused?.statusLine, "Paused")
        let none: UploadJob? = await queue.next(at: t0)
        XCTAssertNil(none)
        let resumed: UploadJob? = await queue.resume(id: job.id, now: t0)
        XCTAssertEqual(resumed?.state, .queued)
        let done: UploadJob? = await queue.markDone(id: job.id, now: t0)
        XCTAssertEqual(done?.state, .done)
        XCTAssertEqual(done?.progress ?? 0, 1, accuracy: 0.0001)
        XCTAssertTrue(done?.isFinished ?? false)
        XCTAssertEqual(done?.statusLine, "Sent")
        let pending: [UploadJob] = await queue.pending()
        XCTAssertTrue(pending.isEmpty)
        let stillPaused: UploadJob? = await queue.pause(id: job.id, now: t0)
        XCTAssertEqual(stillPaused?.state, .done, "A finished upload cannot be paused.")
        await queue.clearFinished()
        let all: [UploadJob] = await queue.all()
        XCTAssertTrue(all.isEmpty)
        let missing: UploadJob? = await queue.markDone(id: "upj_nope", now: t0)
        XCTAssertNil(missing)
    }

    func testTheQueueSurvivesARestartAndAJobThatWasUploadingIsQueuedAgain() async throws {
        let folder: URL = FileManager.default.temporaryDirectory.appendingPathComponent("flowd-upload-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer {
            try? FileManager.default.removeItem(at: folder)
        }
        let file: URL = folder.appendingPathComponent("queue.json")
        let before: UploadQueueStore = UploadQueueStore(fileURL: file)
        let job: UploadJob = await before.enqueue(draftId: "d1", bountyId: "b1", fileName: "a.mp4", sizeBytes: 10_000_000, idempotencyKey: "key-1", now: t0)
        _ = await before.recordSession(id: job.id, uploadId: "upl_1", assetId: "vid_0001", now: t0)
        _ = await before.recordProgress(id: job.id, uploadedBytes: 4_194_304, now: t0)
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))

        let after: UploadQueueStore = UploadQueueStore(fileURL: file)
        let found: UploadJob? = await after.job(id: job.id)
        let restored: UploadJob = try XCTUnwrap(found)
        XCTAssertEqual(restored.state, .queued, "The app died mid-upload: the job resumes instead of being lost.")
        XCTAssertEqual(restored.uploadedBytes, 4_194_304)
        XCTAssertEqual(restored.uploadId, "upl_1")
        XCTAssertEqual(restored.assetId, "vid_0001")
        XCTAssertEqual(restored.idempotencyKey, "key-1", "The same key goes with the final submit, so a retry never double-submits.")
        let next: UploadJob? = await after.next(at: t0)
        XCTAssertEqual(next?.id, job.id)
    }
}

final class DiskCacheTests: XCTestCase {
    private struct Sample: Codable, Equatable {
        var name: String
        var cents: Int
        var when: Date
    }

    private func makeCache() throws -> (cache: DiskCache, folder: URL) {
        let folder: URL = FileManager.default.temporaryDirectory.appendingPathComponent("flowd-cache-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return (cache: DiskCache(directory: folder), folder: folder)
    }

    func testAnAnswerIsCachedAndReadBackExactly() async throws {
        let made: (cache: DiskCache, folder: URL) = try makeCache()
        defer {
            try? FileManager.default.removeItem(at: made.folder)
        }
        let sample: Sample = Sample(name: "Wallet", cents: 8_600, when: FlowdClock.demoNow)
        await made.cache.save(sample, key: "home/summary?creator=cr_maya", now: FlowdClock.demoNow)
        let loaded: Sample? = await made.cache.load(Sample.self, key: "home/summary?creator=cr_maya")
        XCTAssertEqual(loaded, sample)
        let savedAt: Date? = await made.cache.savedAt(key: "home/summary?creator=cr_maya")
        XCTAssertEqual(savedAt, FlowdClock.demoNow)
        let other: Sample? = await made.cache.load(Sample.self, key: "something/else")
        XCTAssertNil(other)
    }

    func testAnEntryOlderThanItsMaxAgeReadsAsMissing() async throws {
        let made: (cache: DiskCache, folder: URL) = try makeCache()
        defer {
            try? FileManager.default.removeItem(at: made.folder)
        }
        let sample: Sample = Sample(name: "Feed", cents: 1, when: FlowdClock.demoNow)
        await made.cache.save(sample, key: "feed", now: FlowdClock.demoNow)
        let fresh: Sample? = await made.cache.load(Sample.self, key: "feed", maxAge: 60, now: FlowdClock.demoNow.addingTimeInterval(30))
        XCTAssertEqual(fresh, sample)
        let stale: Sample? = await made.cache.load(Sample.self, key: "feed", maxAge: 60, now: FlowdClock.demoNow.addingTimeInterval(120))
        XCTAssertNil(stale)
        let forever: Sample? = await made.cache.load(Sample.self, key: "feed", now: FlowdClock.demoNow.addingTimeInterval(86_400 * 30))
        XCTAssertEqual(forever, sample, "Without a max age an entry never expires by itself.")
    }

    func testRemovingAndClearingEmptyTheCache() async throws {
        let made: (cache: DiskCache, folder: URL) = try makeCache()
        defer {
            try? FileManager.default.removeItem(at: made.folder)
        }
        let sample: Sample = Sample(name: "x", cents: 2, when: FlowdClock.demoNow)
        await made.cache.save(sample, key: "a", now: FlowdClock.demoNow)
        await made.cache.save(sample, key: "b/c", now: FlowdClock.demoNow)
        let files: [URL] = try FileManager.default.contentsOfDirectory(at: made.folder, includingPropertiesForKeys: nil)
        XCTAssertEqual(files.count, 2)
        XCTAssertTrue(files.allSatisfy { (u: URL) -> Bool in return u.pathExtension == "json" })
        await made.cache.remove(key: "a")
        let removed: Sample? = await made.cache.load(Sample.self, key: "a")
        XCTAssertNil(removed)
        let kept: Sample? = await made.cache.load(Sample.self, key: "b/c")
        XCTAssertEqual(kept, sample)
        await made.cache.clear()
        let cleared: Sample? = await made.cache.load(Sample.self, key: "b/c")
        XCTAssertNil(cleared)
    }

    func testAnEntryThatNoLongerDecodesReadsAsMissingInsteadOfCrashing() async throws {
        let made: (cache: DiskCache, folder: URL) = try makeCache()
        defer {
            try? FileManager.default.removeItem(at: made.folder)
        }
        await made.cache.save(["a", "b"], key: "list", now: FlowdClock.demoNow)
        let wrongShape: Sample? = await made.cache.load(Sample.self, key: "list")
        XCTAssertNil(wrongShape)
        let right: [String]? = await made.cache.load([String].self, key: "list")
        XCTAssertEqual(right, ["a", "b"])
    }
}
