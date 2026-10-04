import Foundation

/// Every place a link, a notification tap or a widget tap can send the creator. `DeepLink.parse` understands the app scheme
/// (`flowd://bounty/bnty_x`), the universal links on joinflowd.io (`/b/<id>`, `/c/<handle>`, `/p/<proof>`) and the deep links the contract puts on
/// notifications. The router maps a `DeepLink` to its own `Route`; unknown links come back as `.unknown` so the app can show a calm toast.
enum DeepLink: Hashable, Sendable {
    case home
    case bounty(id: String)
    case submission(id: String)
    case post(id: String)
    case payout(id: String)
    case offer(id: String)
    case dispute(id: String)
    case tournament(id: String)
    case lesson(slug: String)
    case scorecard(brandId: String)
    /// A creator's public storefront (`joinflowd.io/c/<handle>`).
    case creator(handle: String)
    /// A public proof page (`joinflowd.io/p/<id>`).
    case proof(id: String)
    case drop
    case wallet
    case moneyClock
    case inbox
    case studio
    case tiers
    case rights
    case streak
    case referrals
    case tax
    case safety
    case wellbeing
    case remix
    case crew
    case academy
    case leaderboard
    case changelog
    case settings(section: String?)
    case unknown(String)

    static let scheme: String = "flowd"
    static let webHosts: Set<String> = ["joinflowd.io", "www.joinflowd.io", "app.joinflowd.io"]

    /// Parses a link string.
    static func parse(_ text: String) -> DeepLink {
        let trimmed: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed) else {
            return .unknown(text)
        }
        return parse(url)
    }

    /// Parses a URL (app scheme or joinflowd.io universal link).
    static func parse(_ url: URL) -> DeepLink {
        let rawScheme: String = (url.scheme ?? "").lowercased()
        if rawScheme == scheme {
            var parts: [String] = []
            if let host = url.host, !host.isEmpty {
                parts.append(host)
            }
            parts.append(contentsOf: pathParts(url))
            return fromAppParts(parts, original: url.absoluteString)
        }
        if rawScheme == "https" || rawScheme == "http" {
            let host: String = (url.host ?? "").lowercased()
            guard webHosts.contains(host) else {
                return .unknown(url.absoluteString)
            }
            return fromWebParts(pathParts(url), original: url.absoluteString)
        }
        return .unknown(url.absoluteString)
    }

    private static func pathParts(_ url: URL) -> [String] {
        return url.path.split(separator: "/").map { (part: Substring) -> String in
            return String(part).removingPercentEncoding ?? String(part)
        }
    }

    private static func fromAppParts(_ parts: [String], original: String) -> DeepLink {
        guard let head = parts.first?.lowercased() else {
            return .home
        }
        let second: String? = parts.count > 1 ? parts[1] : nil
        switch head {
        case "home":
            return .home
        case "bounty", "bounties":
            if let id = second { return .bounty(id: id) }
            return .unknown(original)
        case "submission", "submissions":
            if let id = second { return .submission(id: id) }
            return .unknown(original)
        case "post", "posts":
            if let id = second { return .post(id: id) }
            return .unknown(original)
        case "payout", "payouts":
            if let id = second { return .payout(id: id) }
            return .wallet
        case "offer", "offers":
            if let id = second { return .offer(id: id) }
            return .inbox
        case "dispute", "disputes":
            if let id = second { return .dispute(id: id) }
            return .safety
        case "tournament", "tournaments":
            if let id = second { return .tournament(id: id) }
            return .unknown(original)
        case "lesson", "academy":
            if let slug = second { return .lesson(slug: slug) }
            return .academy
        case "scorecard":
            if let id = second { return .scorecard(brandId: id) }
            return .unknown(original)
        case "creator", "c":
            if let handle = second { return .creator(handle: handle) }
            return .unknown(original)
        case "proof", "p":
            if let id = second { return .proof(id: id) }
            return .unknown(original)
        case "drop":
            return .drop
        case "wallet":
            if second == "clock" { return .moneyClock }
            return .wallet
        case "money-clock", "moneyclock":
            return .moneyClock
        case "inbox":
            return .inbox
        case "studio":
            return .studio
        case "tiers", "tier":
            return .tiers
        case "rights":
            return .rights
        case "streak":
            return .streak
        case "referrals":
            return .referrals
        case "tax":
            return .tax
        case "safety":
            return .safety
        case "wellbeing":
            return .wellbeing
        case "remix":
            return .remix
        case "crew", "crews":
            return .crew
        case "leaderboard":
            return .leaderboard
        case "changelog":
            return .changelog
        case "settings":
            return .settings(section: second)
        default:
            return .unknown(original)
        }
    }

    private static func fromWebParts(_ parts: [String], original: String) -> DeepLink {
        guard let head = parts.first?.lowercased() else {
            return .home
        }
        let second: String? = parts.count > 1 ? parts[1] : nil
        switch head {
        case "b":
            if let id = second { return .bounty(id: id) }
            return .unknown(original)
        case "c":
            if let handle = second { return .creator(handle: handle) }
            return .unknown(original)
        case "p", "proof":
            if let id = second { return .proof(id: id) }
            return .unknown(original)
        case "creator":
            // The web portal mirrors the app: /creator/bounties/<id>, /creator/wallet ...
            let rest: [String] = Array(parts.dropFirst())
            return fromAppParts(rest, original: original)
        default:
            return .unknown(original)
        }
    }

    /// The app-scheme URL of this destination (`flowd://bounty/bnty_x`), or nil for `.unknown`.
    var url: URL? {
        guard let path = appPath else {
            return nil
        }
        return URL(string: DeepLink.scheme + "://" + path)
    }

    /// The universal link for destinations that have one (`https://joinflowd.io/b/bnty_x`).
    var universalURL: URL? {
        switch self {
        case .bounty(let id):
            return URL(string: "https://joinflowd.io/b/" + id)
        case .creator(let handle):
            return URL(string: "https://joinflowd.io/c/" + handle)
        case .proof(let id):
            return URL(string: "https://joinflowd.io/p/" + id)
        default:
            return nil
        }
    }

    private var appPath: String? {
        switch self {
        case .home: return "home"
        case .bounty(let id): return "bounty/" + id
        case .submission(let id): return "submission/" + id
        case .post(let id): return "post/" + id
        case .payout(let id): return "payout/" + id
        case .offer(let id): return "offer/" + id
        case .dispute(let id): return "dispute/" + id
        case .tournament(let id): return "tournament/" + id
        case .lesson(let slug): return "lesson/" + slug
        case .scorecard(let id): return "scorecard/" + id
        case .creator(let handle): return "creator/" + handle
        case .proof(let id): return "proof/" + id
        case .drop: return "drop"
        case .wallet: return "wallet"
        case .moneyClock: return "wallet/clock"
        case .inbox: return "inbox"
        case .studio: return "studio"
        case .tiers: return "tiers"
        case .rights: return "rights"
        case .streak: return "streak"
        case .referrals: return "referrals"
        case .tax: return "tax"
        case .safety: return "safety"
        case .wellbeing: return "wellbeing"
        case .remix: return "remix"
        case .crew: return "crew"
        case .academy: return "academy"
        case .leaderboard: return "leaderboard"
        case .changelog: return "changelog"
        case .settings(let section):
            if let section = section { return "settings/" + section }
            return "settings"
        case .unknown: return nil
        }
    }

    /// True when the destination needs a signed-in creator (every link except a public storefront or proof).
    var requiresSession: Bool {
        switch self {
        case .creator, .proof, .unknown, .changelog:
            return false
        default:
            return true
        }
    }
}
