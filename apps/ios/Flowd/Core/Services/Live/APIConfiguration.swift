import Foundation

/// Where and how the live API is reached. The app talks to `/api/v1` (packages/contract/openapi.yaml): bearer session token, `Idempotency-Key` on
/// every call that moves money, `{ code, message, hint }` errors.
struct APIConfiguration: Hashable, Sendable {
    /// `https://api.joinflowd.io/api/v1` (no trailing slash).
    var baseURL: URL
    /// Seconds before a request gives up.
    var requestTimeout: TimeInterval
    /// Extra attempts for requests that are safe to repeat (reads, and writes that carry an idempotency key) after a network error, a 429 or a 5xx.
    var maxRetries: Int
    /// Sent as `X-Flowd-Client` on every request.
    var clientName: String

    init(baseURL: URL, requestTimeout: TimeInterval = 30, maxRetries: Int = 2, clientName: String = "flowd-ios/1.0") {
        self.baseURL = baseURL
        self.requestTimeout = requestTimeout
        self.maxRetries = maxRetries
        self.clientName = clientName
    }

    /// The production API.
    static let production: APIConfiguration = APIConfiguration(baseURL: URL(string: "https://api.joinflowd.io/api/v1") ?? URL(fileURLWithPath: "/"))

    /// The web app's in-memory demo server (`npm run web:dev`); on the Simulator `localhost` is the Mac.
    static let localDemo: APIConfiguration = APIConfiguration(baseURL: URL(string: "http://localhost:3000/api/v1") ?? URL(fileURLWithPath: "/"))

    /// A configuration for a custom base URL (a staging server). Nil when the text is not an http(s) URL.
    static func custom(_ text: String) -> APIConfiguration? {
        var trimmed: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasSuffix("/") {
            trimmed.removeLast()
        }
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http", url.host != nil else {
            return nil
        }
        return APIConfiguration(baseURL: url)
    }
}

/// Which API the app runs against.
enum APIMode: Hashable, Sendable {
    /// The bundled demo world with in-memory mutations: works offline, in the simulator, in previews and in tests.
    case mock
    /// The live API.
    case live(APIConfiguration)

    var isLive: Bool {
        switch self {
        case .mock: return false
        case .live: return true
        }
    }

    /// Reads the mode from the process: launch arguments, environment, then the Info.plist. Mock unless live is asked for.
    ///
    ///   -FlowdAPI live | demo | mock            launch argument (also `FLOWD_API=live` in the environment, `FlowdAPIMode` in Info.plist)
    ///   -FlowdAPIURL https://staging.example    base URL for `live` (also `FLOWD_API_URL`, `FlowdAPIBaseURL`); defaults to production
    ///
    /// `demo` means the web app's local demo server (`http://localhost:3000/api/v1`).
    static func resolve(arguments: [String] = ProcessInfo.processInfo.arguments, environment: [String: String] = ProcessInfo.processInfo.environment, info: [String: Any]? = Bundle.main.infoDictionary) -> APIMode {
        func argument(_ name: String) -> String? {
            guard let index = arguments.firstIndex(of: name), index + 1 < arguments.count else {
                return nil
            }
            return arguments[index + 1]
        }
        let mode: String = (argument("-FlowdAPI") ?? environment["FLOWD_API"] ?? (info?["FlowdAPIMode"] as? String) ?? "mock").lowercased()
        let urlText: String? = argument("-FlowdAPIURL") ?? environment["FLOWD_API_URL"] ?? (info?["FlowdAPIBaseURL"] as? String)
        switch mode {
        case "live":
            if let text = urlText, !text.isEmpty, let custom = APIConfiguration.custom(text) {
                return .live(custom)
            }
            return .live(APIConfiguration.production)
        case "demo":
            if let text = urlText, !text.isEmpty, let custom = APIConfiguration.custom(text) {
                return .live(custom)
            }
            return .live(APIConfiguration.localDemo)
        default:
            return .mock
        }
    }
}
