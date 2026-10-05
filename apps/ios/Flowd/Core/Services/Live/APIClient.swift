import Foundation

// The HTTP layer of the live API: builds requests (bearer token, idempotency key, JSON bodies in snake_case), retries what is safe to retry, and maps
// every failure to a `FlowdAPIError` (the contract's `{ code, message, hint }` bodies, 401, 429 with Retry-After, no network, undecodable answers).

enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

/// One request to `/api/v1`, before it becomes a `URLRequest`.
struct APIRequest: Sendable {
    var method: HTTPMethod
    /// Path under the base URL, starting with a slash: `/posts/post_0418`.
    var path: String
    var query: [URLQueryItem]
    var body: Data?
    /// Sent as `Idempotency-Key`; a repeated key returns the original response, so retrying never pays twice.
    var idempotencyKey: String?
    /// False for the calls that happen before there is a token (demo login, health).
    var requiresAuth: Bool
    var accept: String

    init(method: HTTPMethod, path: String, query: [URLQueryItem] = [], body: Data? = nil, idempotencyKey: String? = nil, requiresAuth: Bool = true, accept: String = "application/json") {
        self.method = method
        self.path = path
        self.query = query
        self.body = body
        self.idempotencyKey = idempotencyKey
        self.requiresAuth = requiresAuth
        self.accept = accept
    }

    /// Reads and writes with a key are safe to repeat; a plain POST is not.
    var isRepeatable: Bool {
        switch method {
        case .get, .put, .delete:
            return true
        case .post, .patch:
            return idempotencyKey != nil
        }
    }
}

/// Sends a `URLRequest`. The default is `URLSession`; tests substitute a stub.
protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

struct URLSessionTransport: HTTPTransport {
    private let session: URLSession

    init(timeout: TimeInterval = 30) {
        let configuration: URLSessionConfiguration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = timeout
        configuration.timeoutIntervalForResource = timeout * 4
        configuration.waitsForConnectivity = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: configuration)
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response): (Data, URLResponse) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        return (data, http)
    }
}

/// `{ data: [...], next_cursor: "...", total: 120 }`, decoded leniently: a row that does not decode is skipped instead of failing the page.
struct LivePage<Element: Decodable>: Decodable {
    var data: LossyArray<Element>
    var nextCursor: String?
    var total: Int?
}

struct APIClient: Sendable {
    let configuration: APIConfiguration
    let transport: any HTTPTransport
    let tokens: any TokenStore

    init(configuration: APIConfiguration, transport: (any HTTPTransport)? = nil, tokens: any TokenStore = KeychainTokenStore()) {
        self.configuration = configuration
        self.transport = transport ?? URLSessionTransport(timeout: configuration.requestTimeout)
        self.tokens = tokens
    }

    // MARK: Paths

    /// One path segment, percent-encoded (an id never contains a slash, but a handle might contain a dot).
    static func segment(_ value: String) -> String {
        var allowed: CharacterSet = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    // MARK: Building

    func urlRequest(for request: APIRequest) throws -> URLRequest {
        guard var components = URLComponents(string: configuration.baseURL.absoluteString + request.path) else {
            throw FlowdAPIError.validationFailed("That address isn't valid.")
        }
        if !request.query.isEmpty {
            components.queryItems = request.query
        }
        guard let url = components.url else {
            throw FlowdAPIError.validationFailed("That address isn't valid.")
        }
        var built: URLRequest = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: configuration.requestTimeout)
        built.httpMethod = request.method.rawValue
        built.setValue(request.accept, forHTTPHeaderField: "Accept")
        built.setValue(configuration.clientName, forHTTPHeaderField: "X-Flowd-Client")
        if let body = request.body {
            built.httpBody = body
            built.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let key = request.idempotencyKey {
            built.setValue(key, forHTTPHeaderField: "Idempotency-Key")
        }
        if request.requiresAuth {
            guard let token = tokens.token(), !token.isEmpty else {
                throw FlowdAPIError.unauthorized
            }
            built.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        }
        return built
    }

    // MARK: Sending

    private func map(_ error: Error) -> FlowdAPIError {
        if let known = error as? FlowdAPIError {
            return known
        }
        if let url = error as? URLError {
            switch url.code {
            case .cancelled:
                return .cancelled
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed, .internationalRoamingOff, .dataNotAllowed, .secureConnectionFailed:
                return .offline
            default:
                return .server(status: 0, code: "network_error", message: url.localizedDescription)
            }
        }
        if error is CancellationError {
            return .cancelled
        }
        return .server(status: 0, code: "network_error", message: error.localizedDescription)
    }

    /// The error for a non-2xx answer: the contract's body when there is one, the status otherwise.
    func failure(status: Int, data: Data, response: HTTPURLResponse) -> FlowdAPIError {
        var code: String? = nil
        var message: String? = nil
        var hint: String? = nil
        if let body = try? FlowdJSON.makeDecoder().decode(APIErrorBody.self, from: data) {
            code = body.code
            message = body.message
            hint = body.hint
        }
        let mapped: FlowdAPIError = FlowdAPIError.from(status: status, code: code, message: message, hint: hint)
        if case .rateLimited = mapped {
            let seconds: Int? = Int(response.value(forHTTPHeaderField: "Retry-After") ?? "")
            return .rateLimited(retryAfterSeconds: seconds)
        }
        if case .tierLocked(_, let text) = mapped, let hintText = hint, text.isEmpty {
            return .tierLocked(required: nil, message: hintText)
        }
        return mapped
    }

    private func shouldRetry(_ error: FlowdAPIError) -> Bool {
        switch error {
        case .offline, .rateLimited:
            return true
        case .server(let status, _, _):
            return status == 0 || status >= 500
        default:
            return false
        }
    }

    /// Sends a request and returns the body of a 2xx answer.
    func send(_ request: APIRequest) async throws -> Data {
        var attempt: Int = 0
        while true {
            do {
                try Task.checkCancellation()
                let built: URLRequest = try urlRequest(for: request)
                let (data, response): (Data, HTTPURLResponse) = try await transport.send(built)
                if (200..<300).contains(response.statusCode) {
                    return data
                }
                throw failure(status: response.statusCode, data: data, response: response)
            } catch {
                let mapped: FlowdAPIError = map(error)
                if mapped == .unauthorized {
                    tokens.save(nil)
                }
                if request.isRepeatable && shouldRetry(mapped) && attempt < configuration.maxRetries {
                    attempt += 1
                    var delay: Double = 0.4 * Double(attempt)
                    if case .rateLimited(let after) = mapped, let seconds = after {
                        delay = Swift.min(10, Double(seconds))
                    }
                    FlowdLog.api.info("Retrying \(request.method.rawValue, privacy: .public) \(request.path, privacy: .public) (attempt \(attempt, privacy: .public))")
                    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                    continue
                }
                throw mapped
            }
        }
    }

    // MARK: Decoding

    func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try FlowdJSON.makeDecoder().decode(type, from: data)
        } catch let error as DecodingError {
            throw FlowdAPIError.decoding(FixtureLoader.describe(error))
        } catch {
            throw FlowdAPIError.decoding(error.localizedDescription)
        }
    }

    func response<T: Decodable>(_ type: T.Type, _ request: APIRequest) async throws -> T {
        let data: Data = try await send(request)
        return try decode(type, from: data)
    }

    // MARK: Conveniences

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = [], as type: T.Type = T.self) async throws -> T {
        return try await response(type, APIRequest(method: .get, path: path, query: query))
    }

    func getText(_ path: String, query: [URLQueryItem] = [], accept: String = "text/csv") async throws -> String {
        let data: Data = try await send(APIRequest(method: .get, path: path, query: query, accept: accept))
        return String(data: data, encoding: .utf8) ?? ""
    }

    func getPage<T: Codable & Hashable & Sendable>(_ path: String, query: [URLQueryItem] = [], as type: T.Type = T.self) async throws -> Page<T> {
        let page: LivePage<T> = try await response(LivePage<T>.self, APIRequest(method: .get, path: path, query: query))
        return Page<T>(data: page.data.elements, nextCursor: page.nextCursor, total: page.total)
    }

    func body<B: Encodable>(_ value: B) throws -> Data {
        do {
            return try FlowdJSON.makeAPIEncoder().encode(value)
        } catch {
            throw FlowdAPIError.validationFailed("That couldn't be sent. Check the fields and try again.")
        }
    }

    func send<T: Decodable, B: Encodable>(_ method: HTTPMethod, _ path: String, body value: B, idempotencyKey: String? = nil, query: [URLQueryItem] = [], as type: T.Type = T.self) async throws -> T {
        let request: APIRequest = APIRequest(method: method, path: path, query: query, body: try body(value), idempotencyKey: idempotencyKey)
        return try await response(type, request)
    }

    func send<T: Decodable>(_ method: HTTPMethod, _ path: String, idempotencyKey: String? = nil, query: [URLQueryItem] = [], as type: T.Type = T.self) async throws -> T {
        return try await response(type, APIRequest(method: method, path: path, query: query, idempotencyKey: idempotencyKey))
    }

    /// A call whose answer carries nothing the app needs (204, or a body it ignores).
    func perform<B: Encodable>(_ method: HTTPMethod, _ path: String, body value: B, idempotencyKey: String? = nil) async throws {
        _ = try await send(APIRequest(method: method, path: path, body: try body(value), idempotencyKey: idempotencyKey))
    }

    func perform(_ method: HTTPMethod, _ path: String, idempotencyKey: String? = nil) async throws {
        _ = try await send(APIRequest(method: method, path: path, idempotencyKey: idempotencyKey))
    }
}
