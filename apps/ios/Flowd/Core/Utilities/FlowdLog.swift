import Foundation
import os

/// Loggers for the app (never `print`). One subsystem, one category per area. Messages are redacted by default; mark a value
/// `privacy: .public` only when it is not personal (ids are pseudonymous and fine).
enum FlowdLog {
    static let subsystem: String = "app.flowd.creator"

    static let api: Logger = Logger(subsystem: subsystem, category: "api")
    static let fixtures: Logger = Logger(subsystem: subsystem, category: "fixtures")
    static let engine: Logger = Logger(subsystem: subsystem, category: "engine")
    static let persistence: Logger = Logger(subsystem: subsystem, category: "persistence")
    static let upload: Logger = Logger(subsystem: subsystem, category: "upload")
    static let deepLink: Logger = Logger(subsystem: subsystem, category: "deeplink")
    static let analytics: Logger = Logger(subsystem: subsystem, category: "analytics")
    static let widget: Logger = Logger(subsystem: subsystem, category: "widget")
    static let studio: Logger = Logger(subsystem: subsystem, category: "studio")
}
