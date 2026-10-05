import XCTest
@testable import Flowd

/// A scripted HTTP transport: replies are either queued or computed from the request, and every request is recorded. No test here touches a network.
final class StubTransport: HTTPTransport, @unchecked Sendable {
    struct Reply {
        var status: Int = 200
        var body: Data = Data()
        var headers: [String: String] = [:]
        var error: Error? = nil

        static func json(_ object: Any, status: Int = 200, headers: [String: String] = [:]) -> Reply {
            let data: Data = (try? JSONSerialization.data(withJSONObject: object, options: [])) ?? Data()
            return Reply(status: status, body: data, headers: headers, error: nil)
        }

        static func text(_ text: String, status: Int = 200, headers: [String: String] = [:]) -> Reply {
            return Reply(status: status, body: Data(text.utf8), headers: headers, error: nil)
        }

        static func failing(_ error: Error) -> Reply {
            return Reply(status: 0, body: Data(), headers: [:], error: error)
        }
    }

    private let lock: NSLock = NSLock()
    private var queue: [Reply]
    private var log: [URLRequest] = []
    private let handler: ((URLRequest) -> Reply)?

    init(_ replies: [Reply]) {
        self.queue = replies
        self.handler = nil
    }

    init(handler: @escaping (URLRequest) -> Reply) {
        self.queue = []
        self.handler = handler
    }

    var requests: [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return log
    }

    private func next(for request: URLRequest) -> Reply {
        lock.lock()
        log.append(request)
        let current: [Reply] = queue
        if !current.isEmpty && current.count > 1 {
            queue.removeFirst()
        }
        lock.unlock()
        if let compute = handler {
            return compute(request)
        }
        return current.first ?? Reply(status: 500)
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let reply: Reply = next(for: request)
        if let error = reply.error {
            throw error
        }
        guard let url = request.url, let response = HTTPURLResponse(url: url, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: reply.headers) else {
            throw URLError(.badServerResponse)
        }
        return (reply.body, response)
    }
}

private struct Item: Codable, Hashable, Sendable {
    var id: String
    var cents: Int
}

final class LiveAPITests: XCTestCase {
    private func configuration(retries: Int = 0) throws -> APIConfiguration {
        let url: URL = try XCTUnwrap(URL(string: "https://api.example.test/api/v1"))
        return APIConfiguration(baseURL: url, requestTimeout: 5, maxRetries: retries)
    }

    private func client(_ stub: StubTransport, token: String? = "tok_abc", retries: Int = 0) throws -> (client: APIClient, tokens: MemoryTokenStore) {
        let tokens: MemoryTokenStore = MemoryTokenStore(token: token)
        return (client: APIClient(configuration: try configuration(retries: retries), transport: stub, tokens: tokens), tokens: tokens)
    }

    /// One row of a fixture table as a JSON object (what the real server would send).
    private func fixtureRow(_ table: String, id: String) throws -> [String: Any] {
        let data: Data = try TestSupport.loader().data(named: table)
        let rows: [[String: Any]] = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
        return try XCTUnwrap(rows.first(where: { (row: [String: Any]) -> Bool in
            return (row["id"] as? String) == id
        }))
    }

    private func body(of request: URLRequest) throws -> [String: Any] {
        let data: Data = try XCTUnwrap(request.httpBody)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: Requests

    func testEveryRequestCarriesTheBearerTokenTheClientNameAndAnAcceptHeader() async throws {
        let stub: StubTransport = StubTransport([.json(["ok": true, "now": "2026-10-03T14:00:00Z"])])
        let made = try client(stub)
        let health: HealthStatus = try await made.client.get("/health")
        XCTAssertTrue(health.ok)
        XCTAssertEqual(health.now, FlowdClock.demoNow)
        let request: URLRequest = try XCTUnwrap(stub.requests.first)
        XCTAssertEqual(request.url?.absoluteString, "https://api.example.test/api/v1/health")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer tok_abc")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Flowd-Client"), "flowd-ios/1.0")
        XCTAssertNil(request.value(forHTTPHeaderField: "Idempotency-Key"))
        XCTAssertNil(request.httpBody)
    }

    func testWithoutATokenNothingIsSentAndTheCallIsUnauthorized() async throws {
        let stub: StubTransport = StubTransport([.json(["ok": true, "now": "2026-10-03T14:00:00Z"])])
        let made = try client(stub, token: nil)
        let error: Error? = await TestSupport.thrownError {
            let _: HealthStatus = try await made.client.get("/health")
        }
        XCTAssertEqual(error as? FlowdAPIError, FlowdAPIError.unauthorized)
        XCTAssertTrue(stub.requests.isEmpty)
        let open: HealthStatus = try await made.client.response(HealthStatus.self, APIRequest(method: .get, path: "/health", requiresAuth: false))
        XCTAssertTrue(open.ok, "Health needs no token.")
        XCTAssertNil(stub.requests.first?.value(forHTTPHeaderField: "Authorization"))
    }

    func testAMoneyMovingPostSendsItsIdempotencyKeyAndASnakeCaseJsonBody() async throws {
        let stub: StubTransport = StubTransport([noContent])
        let made = try client(stub)
        try await made.client.perform(.post, "/payouts/instant", body: InstantPayoutRequest(amountCents: 5_000, methodId: nil, idempotencyKey: "key-1"), idempotencyKey: "key-1")
        let request: URLRequest = try XCTUnwrap(stub.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Idempotency-Key"), "key-1")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let json: [String: Any] = try body(of: request)
        XCTAssertEqual(json["amount_cents"] as? Int, 5_000)
        XCTAssertEqual(json["idempotency_key"] as? String, "key-1")
        XCTAssertNil(json["method_id"], "An absent value is left out, not sent as null.")
        XCTAssertNil(json["amountCents"], "No camelCase keys on the wire.")
    }

    private var noContent: StubTransport.Reply {
        return StubTransport.Reply(status: 204)
    }

    func testOnlyRepeatableCallsAreRetriedAfterAServerError() async throws {
        let getStub: StubTransport = StubTransport([.text("", status: 503), .json(["ok": true, "now": "2026-10-03T14:00:00Z"])])
        let getter = try client(getStub, retries: 2)
        let health: HealthStatus = try await getter.client.get("/health")
        XCTAssertTrue(health.ok)
        XCTAssertEqual(getStub.requests.count, 2, "A read is retried once after a 503.")

        let postStub: StubTransport = StubTransport([.text("", status: 503), noContent])
        let poster = try client(postStub, retries: 2)
        let plain: Error? = await TestSupport.thrownError {
            try await poster.client.perform(.post, "/social-accounts")
        }
        guard case .server(let status, _, _)? = plain as? FlowdAPIError else {
            XCTFail("Expected a server error, got " + String(describing: plain))
            return
        }
        XCTAssertEqual(status, 503)
        XCTAssertEqual(postStub.requests.count, 1, "A POST with no idempotency key is never repeated: it might pay twice.")

        let keyedStub: StubTransport = StubTransport([.text("", status: 503), noContent])
        let keyed = try client(keyedStub, retries: 2)
        try await keyed.client.perform(.post, "/payouts/instant", idempotencyKey: "key-9")
        XCTAssertEqual(keyedStub.requests.count, 2, "With a key the retry is safe.")
        XCTAssertEqual(keyedStub.requests.map { (r: URLRequest) -> String? in return r.value(forHTTPHeaderField: "Idempotency-Key") }, ["key-9", "key-9"])
    }

    // MARK: Errors

    private func failure(status: Int, body: String, headers: [String: String] = [:]) async throws -> FlowdAPIError? {
        let stub: StubTransport = StubTransport([.text(body, status: status, headers: headers)])
        let made = try client(stub)
        let error: Error? = await TestSupport.thrownError {
            let _: HealthStatus = try await made.client.get("/health")
        }
        return error as? FlowdAPIError
    }

    func testTheContractsErrorBodiesBecomeTypedErrors() async throws {
        let validation: FlowdAPIError? = try await failure(status: 422, body: #"{"code":"validation_failed","message":"Add a hook line","hint":"One sentence is enough"}"#)
        XCTAssertEqual(validation, .validationFailed("Add a hook line"))
        let locked: FlowdAPIError? = try await failure(status: 403, body: #"{"code":"tier_locked","message":"Opens at Gold"}"#)
        XCTAssertEqual(locked, .tierLocked(required: nil, message: "Opens at Gold"))
        let exhausted: FlowdAPIError? = try await failure(status: 409, body: #"{"code":"pool_exhausted","message":"All spots are reserved"}"#)
        XCTAssertEqual(exhausted, .poolExhausted)
        let notFound: FlowdAPIError? = try await failure(status: 404, body: #"{"code":"not_found","message":"that bounty"}"#)
        XCTAssertEqual(notFound, .notFound("that bounty"))
        let appeal: FlowdAPIError? = try await failure(status: 409, body: #"{"code":"appeal_used"}"#)
        XCTAssertEqual(appeal, .appealUsed)
        let minimum: FlowdAPIError? = try await failure(status: 422, body: #"{"code":"below_minimum","message":"x"}"#)
        XCTAssertEqual(minimum, .belowMinimum(minimumCents: 500))
        let method: FlowdAPIError? = try await failure(status: 409, body: #"{"code":"method_missing"}"#)
        XCTAssertEqual(method, .methodMissing)
    }

    func testBareStatusesStillMapToTheRightKindOfError() async throws {
        let conflict: FlowdAPIError? = try await failure(status: 409, body: "")
        XCTAssertEqual(conflict, .conflict(""))
        let forbidden: FlowdAPIError? = try await failure(status: 403, body: "")
        XCTAssertEqual(forbidden, .forbidden(""))
        let server: FlowdAPIError? = try await failure(status: 500, body: "")
        XCTAssertEqual(server, .server(status: 500, code: nil, message: nil))
        let weird: FlowdAPIError? = try await failure(status: 400, body: #"{"code":"weird","message":"nope"}"#)
        XCTAssertEqual(weird, .server(status: 400, code: "weird", message: "nope"))
        XCTAssertTrue((server ?? .cancelled).isRetryable)
        XCTAssertFalse((conflict ?? .cancelled).isRetryable)
    }

    func testARateLimitCarriesTheServersRetryAfter() async throws {
        let limited: FlowdAPIError? = try await failure(status: 429, body: #"{"code":"rate_limited"}"#, headers: ["Retry-After": "7"])
        XCTAssertEqual(limited, .rateLimited(retryAfterSeconds: 7))
        let noHeader: FlowdAPIError? = try await failure(status: 429, body: "")
        XCTAssertEqual(noHeader, .rateLimited(retryAfterSeconds: nil))
    }

    func testAnExpiredSessionClearsTheStoredToken() async throws {
        let stub: StubTransport = StubTransport([.text("", status: 401)])
        let made = try client(stub)
        let error: Error? = await TestSupport.thrownError {
            let _: HealthStatus = try await made.client.get("/health")
        }
        XCTAssertEqual(error as? FlowdAPIError, FlowdAPIError.unauthorized)
        XCTAssertTrue((error as? FlowdAPIError)?.requiresSignIn ?? false)
        XCTAssertNil(made.tokens.token(), "A 401 drops the dead token so the app returns to sign-in.")
    }

    func testNetworkFailuresAreOfflineOrCancelledOrANamedNetworkError() async throws {
        let cases: [(URLError.Code, String)] = [(.notConnectedToInternet, "offline"), (.timedOut, "offline"), (.cancelled, "cancelled"), (.badURL, "network_error")]
        for (code, expected) in cases {
            let stub: StubTransport = StubTransport([.failing(URLError(code))])
            let made = try client(stub)
            let error: Error? = await TestSupport.thrownError {
                let _: HealthStatus = try await made.client.get("/health")
            }
            XCTAssertEqual((error as? FlowdAPIError)?.code, expected, "URLError " + String(code.rawValue))
        }
    }

    func testAnAnswerThatCannotBeReadIsADecodingErrorNotACrash() async throws {
        let stub: StubTransport = StubTransport([.json(["ok": "yes"])])
        let made = try client(stub)
        let error: Error? = await TestSupport.thrownError {
            let _: HealthStatus = try await made.client.get("/health")
        }
        guard case .decoding? = error as? FlowdAPIError else {
            XCTFail("Expected a decoding error, got " + String(describing: error))
            return
        }
    }

    func testEveryErrorExplainsItselfInPlainEnglish() {
        let errors: [FlowdAPIError] = [
            .validationFailed(""), .reasonRequired, .notFound(""), .forbidden(""), .tierLocked(required: .gold, message: ""), .bountyNotFunded, .poolExhausted,
            .slaNotStarted, .revisionLimit, .appealUsed, .belowMinimum(minimumCents: 500), .methodMissing, .taxInfoMissing, .identityCheckRequired,
            .idempotencyConflict, .rateLimited(retryAfterSeconds: nil), .conflict(""), .unauthorized, .offline, .server(status: 500, code: nil, message: nil),
            .decoding("x"), .fixture(table: "bounties", detail: "x"), .unsupported(""), .cancelled
        ]
        for error in errors {
            XCTAssertFalse(error.userMessage.isEmpty, error.code)
            XCTAssertEqual(error.errorDescription, error.userMessage)
            XCTAssertFalse(error.code.isEmpty)
        }
        XCTAssertEqual(FlowdAPIError.tierLocked(required: .gold, message: "").userMessage, "This unlocks at Gold.")
        XCTAssertEqual(FlowdAPIError.belowMinimum(minimumCents: 500).userMessage, "The minimum is $5.00. Your weekly payout is free and has no minimum.")
        XCTAssertTrue(FlowdAPIError.offline.userMessage.contains("saved"), "Offline copy reassures that nothing is lost.")
    }

    // MARK: Pages and paths

    func testAPageSkipsRowsThatDoNotDecodeInsteadOfBlankingTheScreen() async throws {
        let stub: StubTransport = StubTransport([.json(["data": [["id": "a", "cents": 100], ["id": "b", "cents": "oops"], ["id": "c", "cents": 300]], "next_cursor": "abc", "total": 3])])
        let made = try client(stub)
        let page: Page<Item> = try await made.client.getPage("/items")
        XCTAssertEqual(page.data, [Item(id: "a", cents: 100), Item(id: "c", cents: 300)])
        XCTAssertEqual(page.nextCursor, "abc")
        XCTAssertEqual(page.total, 3)
    }

    func testPathSegmentsAreEncodedSoAnIdCanNeverEscapeItsPlace() {
        XCTAssertEqual(APIClient.segment("maya.makes"), "maya.makes")
        XCTAssertEqual(APIClient.segment("a/b"), "a%2Fb")
        XCTAssertEqual(APIClient.segment("two words"), "two%20words")
        XCTAssertEqual(APIClient.segment("../x"), "..%2Fx")
    }

    // MARK: The live FlowdAPI

    private func session() throws -> [String: Any] {
        return [
            "token": "tok_demo",
            "role": "creator",
            "user": try fixtureRow("users", id: "usr_maya"),
            "creator_id": "cr_maya",
            "demo": true
        ]
    }

    private func liveAPI(retries: Int = 0, token: String? = nil) throws -> (api: LiveFlowdAPI, stub: StubTransport, tokens: MemoryTokenStore) {
        let session: [String: Any] = try self.session()
        let creator: [String: Any] = try fixtureRow("creators", id: "cr_maya")
        let stub: StubTransport = StubTransport(handler: { (request: URLRequest) -> StubTransport.Reply in
            let path: String = request.url?.path ?? ""
            switch (request.httpMethod ?? "", path) {
            case ("POST", "/api/v1/auth/demo-login"):
                return .json(session)
            case ("GET", "/api/v1/me"):
                return .json(session)
            case ("GET", "/api/v1/creators/cr_maya"):
                return .json(creator)
            case ("POST", "/api/v1/auth/logout"):
                return StubTransport.Reply(status: 401)
            default:
                return StubTransport.Reply(status: 404)
            }
        })
        let tokens: MemoryTokenStore = MemoryTokenStore(token: token)
        let api: LiveFlowdAPI = LiveFlowdAPI(configuration: try configuration(retries: retries), tokens: tokens, transport: stub)
        return (api: api, stub: stub, tokens: tokens)
    }

    func testTheDemoSignInStoresTheTokenAndLoadsTheCreator() async throws {
        let made = try liveAPI()
        XCTAssertFalse(made.api.isDemo)
        let session: CreatorSession = try await made.api.signIn(.demo)
        XCTAssertEqual(session.creator.id, "cr_maya")
        XCTAssertEqual(session.user.id, "usr_maya")
        XCTAssertTrue(session.isDemo)
        XCTAssertTrue(made.api.isDemo)
        XCTAssertNil(session.token, "The token lives in the Keychain, never in the model.")
        XCTAssertEqual(made.tokens.token(), "tok_demo")
        let first: URLRequest = try XCTUnwrap(made.stub.requests.first)
        XCTAssertEqual(first.url?.path, "/api/v1/auth/demo-login")
        XCTAssertNil(first.value(forHTTPHeaderField: "Authorization"), "Sign-in happens before there is a token.")
        let json: [String: Any] = try body(of: first)
        XCTAssertEqual(json["role"] as? String, "creator")
        let second: URLRequest = try XCTUnwrap(made.stub.requests.dropFirst().first)
        XCTAssertEqual(second.url?.path, "/api/v1/creators/cr_maya")
        XCTAssertEqual(second.value(forHTTPHeaderField: "Authorization"), "Bearer tok_demo")
    }

    func testARestoredSessionNeedsAStoredToken() async throws {
        let none = try liveAPI(token: nil)
        let missing: CreatorSession? = try await none.api.currentSession()
        XCTAssertNil(missing)
        XCTAssertTrue(none.stub.requests.isEmpty)
        let stored = try liveAPI(token: "tok_demo")
        let restored: CreatorSession? = try await stored.api.currentSession()
        XCTAssertEqual(restored?.creator.id, "cr_maya")
    }

    func testSigningOutClearsTheTokenEvenWhenTheServerAlreadyForgotIt() async throws {
        let made = try liveAPI(token: "tok_demo")
        _ = try await made.api.currentSession()
        try await made.api.signOut()
        XCTAssertNil(made.tokens.token())
        XCTAssertFalse(made.api.isDemo)
    }

    func testWhatTheLiveApiCannotDoYetSaysSoWithoutTouchingTheNetwork() async throws {
        let made = try liveAPI(token: "tok_demo")
        let apple: Error? = await TestSupport.thrownError {
            _ = try await made.api.signIn(.apple(identityToken: "x", authorizationCode: nil, fullName: nil, email: nil))
        }
        let verifications: Error? = await TestSupport.thrownError {
            _ = try await made.api.verifications()
        }
        let deletion: Error? = await TestSupport.thrownError {
            try await made.api.deleteAccount()
        }
        let decision: Error? = await TestSupport.thrownError {
            _ = try await made.api.simulateDecision(submissionId: "sub_1", decision: .approve)
        }
        let history: Error? = await TestSupport.thrownError {
            _ = try await made.api.floHistory()
        }
        for error in [apple, verifications, deletion, decision, history] {
            XCTAssertEqual((error as? FlowdAPIError)?.code, "unsupported", String(describing: error))
        }
        XCTAssertTrue(made.stub.requests.isEmpty)
    }

    func testTheFeedAsksForTheCreatorCompositeWithItsFilters() async throws {
        let stub: StubTransport = StubTransport([.json(["data": [], "total": 0])])
        let tokens: MemoryTokenStore = MemoryTokenStore(token: "tok_abc")
        let api: LiveFlowdAPI = LiveFlowdAPI(configuration: try configuration(), tokens: tokens, transport: stub)
        let page: Page<FeedItem> = try await api.feed(FeedQuery(search: "run", types: [.direct, .cpm], organicOnly: true, minCpmCents: 150, includeLocked: false, limit: 5))
        XCTAssertTrue(page.data.isEmpty)
        let url: URL = try XCTUnwrap(stub.requests.first?.url)
        let items: [URLQueryItem] = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        func value(_ name: String) -> String? {
            return items.first(where: { (i: URLQueryItem) -> Bool in return i.name == name })?.value
        }
        XCTAssertEqual(url.path, "/api/v1/feed")
        XCTAssertEqual(value("view"), "creator")
        XCTAssertEqual(value("q"), "run")
        XCTAssertEqual(value("type"), "direct,cpm")
        XCTAssertEqual(value("organic_only"), "true")
        XCTAssertEqual(value("min_cpm_cents"), "150")
        XCTAssertEqual(value("include_locked"), "false")
        XCTAssertEqual(value("limit"), "5")
        XCTAssertNotNil(value("sort"))
        XCTAssertNil(value("platform"), "An empty filter is left out.")
        XCTAssertNil(value("cursor"))
    }

    func testAnInstantCashOutUsesTheKeyedEndpointAndDecodesThePayout() async throws {
        let payout: [String: Any] = try fixtureRow("payouts", id: "pay_0292")
        let stub: StubTransport = StubTransport([.json(payout)])
        let api: LiveFlowdAPI = LiveFlowdAPI(configuration: try configuration(), tokens: MemoryTokenStore(token: "tok_abc"), transport: stub)
        let result: Payout = try await api.instantPayout(InstantPayoutRequest(amountCents: 5_000, idempotencyKey: "cash-1"))
        XCTAssertEqual(result.id, "pay_0292")
        let request: URLRequest = try XCTUnwrap(stub.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/v1/payouts/instant")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Idempotency-Key"), "cash-1")
    }

    func testTheTaxExportIsFetchedAsCsvText() async throws {
        let stub: StubTransport = StubTransport([.text("Date,Type\n2026-10-03,cpm\n", headers: ["Content-Type": "text/csv"])])
        let api: LiveFlowdAPI = LiveFlowdAPI(configuration: try configuration(), tokens: MemoryTokenStore(token: "tok_abc"), transport: stub)
        let csv: String = try await api.taxCSV(year: 2026)
        XCTAssertEqual(csv, "Date,Type\n2026-10-03,cpm\n")
        let request: URLRequest = try XCTUnwrap(stub.requests.first)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "text/csv")
        XCTAssertEqual(request.url?.query, "year=2026")
    }

    func testTheDemoControlsPostToTheAdminEndpoints() async throws {
        let worldData: Data = try TestSupport.loader().data(named: "world")
        let stub: StubTransport = StubTransport([StubTransport.Reply(status: 200, body: worldData)])
        let api: LiveFlowdAPI = LiveFlowdAPI(configuration: try configuration(), tokens: MemoryTokenStore(token: "tok_abc"), transport: stub)
        let world: World = try await api.advanceDemoClock(hours: 24)
        XCTAssertEqual(world.personas.creator.creatorId, "cr_maya")
        let request: URLRequest = try XCTUnwrap(stub.requests.first)
        XCTAssertEqual(request.url?.path, "/api/v1/admin/demo/advance")
        let json: [String: Any] = try body(of: request)
        XCTAssertEqual(json["hours"] as? Int, 24)
    }

    // MARK: Mode, configuration and the factory

    func testTheModeIsMockUnlessLiveIsAskedForAndTheUrlComesFromTheSameSources() throws {
        XCTAssertEqual(APIMode.resolve(arguments: [], environment: [:], info: nil), .mock)
        XCTAssertEqual(APIMode.resolve(arguments: ["-FlowdAPI", "mock"], environment: [:], info: nil), .mock)
        XCTAssertEqual(APIMode.resolve(arguments: ["-FlowdAPI", "live"], environment: [:], info: nil), .live(APIConfiguration.production))
        XCTAssertEqual(APIMode.resolve(arguments: ["-FlowdAPI", "LIVE"], environment: [:], info: nil), .live(APIConfiguration.production), "The value is case-insensitive.")
        XCTAssertEqual(APIMode.resolve(arguments: ["-FlowdAPI", "demo"], environment: [:], info: nil), .live(APIConfiguration.localDemo))
        XCTAssertEqual(APIMode.resolve(arguments: [], environment: ["FLOWD_API": "live"], info: nil), .live(APIConfiguration.production))
        XCTAssertEqual(APIMode.resolve(arguments: [], environment: [:], info: ["FlowdAPIMode": "live"]), .live(APIConfiguration.production))
        XCTAssertEqual(APIMode.resolve(arguments: ["-FlowdAPI", "mock"], environment: ["FLOWD_API": "live"], info: nil), .mock, "A launch argument beats the environment.")
        let staging: APIMode = APIMode.resolve(arguments: ["-FlowdAPI", "live", "-FlowdAPIURL", "https://staging.example.test/api/v1/"], environment: [:], info: nil)
        let stagingConfiguration: APIConfiguration = try XCTUnwrap(APIConfiguration.custom("https://staging.example.test/api/v1"))
        XCTAssertEqual(staging, .live(stagingConfiguration))
        let invalid: APIMode = APIMode.resolve(arguments: ["-FlowdAPI", "live", "-FlowdAPIURL", "ftp://nope"], environment: [:], info: nil)
        XCTAssertEqual(invalid, .live(APIConfiguration.production), "An unusable URL falls back to production, never to a surprise host.")
        XCTAssertFalse(APIMode.mock.isLive)
        XCTAssertTrue(invalid.isLive)
    }

    func testCustomBaseUrlsAreTrimmedAndMustBeHttp() {
        XCTAssertEqual(APIConfiguration.custom("https://x.test/api/v1/")?.baseURL.absoluteString, "https://x.test/api/v1")
        XCTAssertEqual(APIConfiguration.custom("  http://localhost:3000/api/v1  ")?.baseURL.absoluteString, "http://localhost:3000/api/v1")
        XCTAssertNil(APIConfiguration.custom("ftp://x.test"))
        XCTAssertNil(APIConfiguration.custom("not a url"))
        XCTAssertNil(APIConfiguration.custom(""))
        XCTAssertEqual(APIConfiguration.production.baseURL.absoluteString, "https://api.joinflowd.io/api/v1")
        XCTAssertEqual(APIConfiguration.localDemo.baseURL.absoluteString, "http://localhost:3000/api/v1")
    }

    func testTheFactoryBuildsTheMockByDefaultAndSwitchesTheClockToTheDeviceForLive() async throws {
        let clock: FlowdClock = FlowdClock.frozen()
        let mock: any FlowdAPI = APIClientFactory.make(mode: .mock, clock: clock, loader: TestSupport.loader())
        XCTAssertTrue(mock.isDemo)
        XCTAssertEqual(clock.currentMode, .frozen)
        let session: CreatorSession? = try await mock.currentSession()
        XCTAssertEqual(session?.creator.id, "cr_maya")

        let live: any FlowdAPI = APIClientFactory.make(mode: .live(APIConfiguration.production), clock: clock, tokens: MemoryTokenStore())
        XCTAssertFalse(live.isDemo, "The live API is not the demo until the server says so.")
        XCTAssertEqual(clock.currentMode, .system)
        XCTAssertTrue(live is LiveFlowdAPI)
        XCTAssertTrue(mock is MockFlowdAPI)
        XCTAssertTrue(APIClientFactory.makePreviewMock().isDemo)
    }

    func testTheTokenStoreKeepsOneTokenAndForgetsIt() {
        let store: MemoryTokenStore = MemoryTokenStore()
        XCTAssertNil(store.token())
        store.save("tok_1")
        XCTAssertEqual(store.token(), "tok_1")
        store.save("tok_2")
        XCTAssertEqual(store.token(), "tok_2")
        store.save(nil)
        XCTAssertNil(store.token())
    }

    func testApiErrorsMapFromStatusAndCodeInOneTable() {
        XCTAssertEqual(FlowdAPIError.from(status: 401, code: nil, message: nil), .unauthorized)
        XCTAssertEqual(FlowdAPIError.from(status: 404, code: nil, message: "x"), .notFound("x"))
        XCTAssertEqual(FlowdAPIError.from(status: 422, code: nil, message: nil, hint: "Try again"), .validationFailed("Try again"))
        XCTAssertEqual(FlowdAPIError.from(status: 429, code: nil, message: nil), .rateLimited(retryAfterSeconds: nil))
        XCTAssertEqual(FlowdAPIError.from(status: 500, code: "boom", message: "x"), .server(status: 500, code: "boom", message: "x"))
        XCTAssertEqual(FlowdAPIError.from(status: 409, code: "tax_info_missing", message: nil), .taxInfoMissing)
        XCTAssertEqual(FlowdAPIError.from(status: 409, code: "identity_check_required", message: nil), .identityCheckRequired)
        XCTAssertEqual(FlowdAPIError.from(status: 409, code: "idempotency_conflict", message: nil), .idempotencyConflict)
        XCTAssertEqual(FlowdAPIError.from(status: 409, code: "revision_limit", message: nil), .revisionLimit)
        XCTAssertEqual(FlowdAPIError.from(status: 409, code: "sla_not_started", message: nil), .slaNotStarted)
        XCTAssertEqual(FlowdAPIError.from(status: 409, code: "bounty_not_funded", message: nil), .bountyNotFunded)
        XCTAssertEqual(FlowdAPIError.from(status: 422, code: "reason_required", message: nil), .reasonRequired)
    }
}
