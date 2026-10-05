import XCTest
@testable import Flowd

/// A mock API and the frozen clock it runs on. Tests move the clock through `api.advanceDemoClock(hours:)`, never through the wall clock.
struct MockHarness {
    let api: MockFlowdAPI
    let clock: FlowdClock
}

/// Shared helpers for the Core tests: the bundled fixtures, a frozen-clock mock API, dates and a plausible video.
enum TestSupport {
    /// The app bundle. The unit tests are hosted by the app, so the Fixtures folder is in it.
    static var bundle: Bundle {
        return Bundle(for: FlowdClock.self)
    }

    static func loader() -> FixtureLoader {
        return FixtureLoader(bundle: bundle)
    }

    /// A mock API on a frozen clock at the demo world's "now" (2026-10-03T14:00:00Z). Brand decisions are played by the test unless `autoBrandDecisions`.
    static func harness(
        signedIn: Bool = true,
        persona: MockFlowdAPI.Persona = .maya,
        autoBrandDecisions: Bool = false
    ) -> MockHarness {
        let clock: FlowdClock = FlowdClock.frozen()
        let api: MockFlowdAPI = APIClientFactory.makeMock(
            clock: clock,
            loader: loader(),
            persona: persona,
            signedIn: signedIn,
            autoBrandDecisions: autoBrandDecisions
        )
        return MockHarness(api: api, clock: clock)
    }

    /// Parses an ISO-8601 instant; fails the test (and returns the epoch) when the text is not one.
    static func date(_ text: String, file: StaticString = #filePath, line: UInt = #line) -> Date {
        guard let parsed = FlowdDates.parse(text) else {
            XCTFail("Not an ISO-8601 date: " + text, file: file, line: line)
            return Date(timeIntervalSince1970: 0)
        }
        return parsed
    }

    /// A 22-second 9:16 video, the shape of what the Studio hands to `submit`.
    static func video(assetId: String, durationMs: Int = 22_000, uploadedAt: Date = FlowdClock.demoNow) -> VideoMeta {
        return VideoMeta(
            assetId: assetId,
            durationMs: durationMs,
            width: 1_080,
            height: 1_920,
            sizeBytes: 18_400_000,
            fps: 30,
            hasCaptions: true,
            language: "en",
            art: ArtSeed(key: assetId, title: "Test take", caption: "flowd", glyph: "video.fill"),
            uploadedAt: uploadedAt
        )
    }

    /// A complete US mailing address for the W-9.
    static var address: Address {
        return Address(line1: "1 Main Street", line2: nil, city: "Austin", region: "TX", postalCode: "73301", country: .us)
    }

    /// Uploads (simulated) and submits a clean, pre-scored take to a bounty, the way the Studio does.
    static func submitTake(
        _ api: MockFlowdAPI,
        bountyId: String,
        title: String = "Honest review",
        idempotencyKey: String = UUID().uuidString
    ) async throws -> Submission {
        let upload: UploadSession = try await api.beginUpload(UploadRequest(fileName: "take.mp4", sizeBytes: 18_400_000, durationMs: 22_000))
        let request: SubmitRequest = SubmitRequest(
            bountyId: bountyId,
            title: title,
            video: video(assetId: upload.assetId),
            hookText: "I stopped losing money on subscriptions",
            hookBand: .b,
            hookPoints: 78,
            flowBand: .b,
            flowPoints: 76,
            qaPass: 9,
            qaWarn: 1,
            qaFail: 0,
            idempotencyKey: idempotencyKey
        )
        return try await api.submit(request)
    }

    /// The post URL a creator pastes after posting (the mock only checks that it is a link).
    static func postRequest(platform: Platform = .tiktok, idempotencyKey: String = UUID().uuidString) -> AttachPostRequest {
        return AttachPostRequest(url: "https://www.tiktok.com/@maya.makes/video/7400000000000000001", platform: platform, idempotencyKey: idempotencyKey)
    }

    /// Runs an async throwing body and returns the error it threw (nil when it did not throw).
    static func thrownError(_ operation: () async throws -> Void) async -> Error? {
        do {
            try await operation()
            return nil
        } catch {
            return error
        }
    }

    /// True when `error` is the `FlowdAPIError` the caller expects (compared by case through `isMatch`).
    static func isAPIError(_ error: Error?, _ isMatch: (FlowdAPIError) -> Bool) -> Bool {
        guard let api = error as? FlowdAPIError else {
            return false
        }
        return isMatch(api)
    }
}
