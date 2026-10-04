import Foundation
import os

/// Loads the bundled demo world (`Resources/Fixtures/*.json`, synced from `packages/contract/fixtures` by `npm run sync`) and decodes it with the
/// app's JSON rules (snake_case keys, ISO-8601 dates). Decoding is strict: a malformed row throws a `FlowdAPIError.fixture` naming the table and the
/// coding path, so a drifted fixture fails loudly in the first test run instead of blanking a screen.
///
/// The folder is bundled as a blue folder reference named `Fixtures`; the lookup also falls back to the bundle root so unit tests and previews work
/// whichever way the resources were copied.
struct FixtureLoader: Sendable {
    /// The bundle that holds the fixtures. `Bundle.main` is the app (also when hosting the unit tests).
    let bundleURL: URL?
    let subdirectory: String

    init(bundle: Bundle = Bundle.main, subdirectory: String = "Fixtures") {
        self.bundleURL = bundle.bundleURL
        self.subdirectory = subdirectory
    }

    private var bundle: Bundle? {
        guard let url = bundleURL else {
            return nil
        }
        return Bundle(url: url)
    }

    /// The URL of `<name>.json`, looking in the Fixtures folder first and the bundle root second.
    func url(for name: String) -> URL? {
        guard let bundle = bundle else {
            return nil
        }
        if let inFolder = bundle.url(forResource: name, withExtension: "json", subdirectory: subdirectory) {
            return inFolder
        }
        return bundle.url(forResource: name, withExtension: "json")
    }

    /// True when the fixture exists in the bundle.
    func exists(_ name: String) -> Bool {
        return url(for: name) != nil
    }

    /// Raw bytes of a fixture.
    func data(named name: String) throws -> Data {
        guard let location = url(for: name) else {
            throw FlowdAPIError.fixture(table: name, detail: "Fixtures/" + name + ".json is not in the app bundle. Run `npm run sync` and rebuild.")
        }
        do {
            return try Data(contentsOf: location, options: [.mappedIfSafe])
        } catch {
            throw FlowdAPIError.fixture(table: name, detail: "Could not read the file: " + error.localizedDescription)
        }
    }

    /// Decodes a fixture (an array of rows, or one object for the object-shaped files: world, ticker, waitlist, state_of_app_ugc, admin_metrics).
    func load<T: Decodable>(_ type: T.Type, named name: String) throws -> T {
        let bytes: Data = try data(named: name)
        do {
            return try FlowdJSON.makeDecoder().decode(type, from: bytes)
        } catch let error as DecodingError {
            let detail: String = FixtureLoader.describe(error)
            FlowdLog.fixtures.error("Fixture \(name, privacy: .public) failed to decode: \(detail, privacy: .public)")
            throw FlowdAPIError.fixture(table: name, detail: detail)
        } catch {
            throw FlowdAPIError.fixture(table: name, detail: error.localizedDescription)
        }
    }

    /// Decodes a fixture and returns an empty list when the file is not bundled (optional tables).
    func loadIfPresent<T: Decodable>(_ type: [T].Type, named name: String) throws -> [T] {
        guard exists(name) else {
            return []
        }
        return try load(type, named: name)
    }

    /// A one-line description of a decoding failure: the coding path and what was wrong.
    static func describe(_ error: DecodingError) -> String {
        switch error {
        case .keyNotFound(let key, let context):
            return "Missing key \"" + key.stringValue + "\" at " + path(context.codingPath)
        case .valueNotFound(_, let context):
            return "Missing value at " + path(context.codingPath)
        case .typeMismatch(_, let context):
            return "Wrong type at " + path(context.codingPath) + ": " + context.debugDescription
        case .dataCorrupted(let context):
            return "Corrupted data at " + path(context.codingPath) + ": " + context.debugDescription
        @unknown default:
            return "Unknown decoding failure"
        }
    }

    private static func path(_ keys: [CodingKey]) -> String {
        if keys.isEmpty {
            return "$"
        }
        var out: String = "$"
        for key in keys {
            if let index = key.intValue {
                out += "[" + String(index) + "]"
            } else {
                out += "." + key.stringValue
            }
        }
        return out
    }

    /// Every fixture file name the contract defines (one per entity).
    static let allTables: [String] = [
        "activity_log", "admin_metrics", "ads", "api_keys", "app_metrics_daily", "apps", "attribution_links", "auctions", "audit_reports",
        "auto_approve_rules", "bounties", "bounty_saves", "brand_lists", "brand_members", "brand_scorecards", "brands", "case_studies", "changelog",
        "compliance_checks", "conversions", "creator_reputation", "creators", "crew_members", "crews", "daily_drops", "disputes", "fatigue_alerts",
        "feedback_notes", "flo_suggestions", "formats", "fraud_flags", "hooks", "integrations", "invoices", "leaderboards", "ledger", "lesson_progress",
        "lessons", "market_series", "ml_models", "money_clock", "notification_prefs", "notifications", "offer_code_pool", "offers", "payout_runs",
        "payouts", "post_metrics_daily", "post_metrics_hourly", "posts", "proofs", "rate_cards", "referrals", "revenuecat_events", "rights_grants",
        "scam_reports", "social_accounts", "specs", "state_of_app_ugc", "streaks", "submissions", "tax_docs", "tax_profiles", "test_plans",
        "testimonials", "threads", "ticker", "tier_history", "tournament_entries", "tournaments", "trends", "users", "verifications",
        "video_analyses", "view_snapshots", "waitlist", "webhooks", "wellbeing_settings", "world", "wrapped"
    ]
}
