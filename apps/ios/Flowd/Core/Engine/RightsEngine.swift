import Foundation

// Rights: the Rights Card in plain language, renewal pricing, expiry alerts and the status a grant should show. Mirrors
// apps/web/src/lib/engine/rights.ts.
//
// Organic posting is always included. Paid-ad usage defaults to 90 days and is renewable at 25% of the base fee per extra 30 days. AI likeness is off by
// default. Expiry alerts go out at 30, 14 and 7 days. Ads stop automatically when the Spark code or the rights term ends. The Rights Card is plain
// language (about grade 8) and is snapshotted onto a submission when the creator accepts it: later edits never change what was accepted.

/// One row of the Rights Card table (the chip, the bounty page, the submit screen).
struct RightsLine: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var label: String
    var value: String
    /// True when the line is a restriction or a cost the creator should read twice.
    var notable: Bool
}

/// The price of extending paid-ad rights.
struct RenewalQuote: Codable, Hashable, Sendable {
    /// 30-day periods bought: ceil(extra days / 30).
    var periods: Int
    var per30Cents: Int
    /// What the creator earns (outside the per-video cap).
    var priceCents: Int
    /// The platform fee on top, paid by the brand.
    var feeCents: Int
    /// What the brand pays: price + fee.
    var totalCents: Int
    /// The new end of the rights, when the current end is known.
    var newEndsAt: Date?
    /// "Extend 60 days for $38.28 (+ $3.83 fee)".
    var summary: String
}

/// Which expiry alerts are due.
struct RightsAlertsDue: Hashable, Sendable {
    /// Every alert threshold (30, 14, 7) now crossed and not yet sent, soonest threshold last.
    var due: [Int]
    /// The most urgent of them, the one to actually send, or nil.
    var send: Int?
}

enum RightsEngine {
    private static func platformLabel(_ platform: AdPlatform) -> String {
        switch platform {
        case .tiktok: return "TikTok"
        case .meta: return "Meta"
        case .unknown: return "ad platforms"
        }
    }

    /// The plain-English paragraph of a Rights Card. Short sentences, everyday words, no legalese. It always says what is included, what costs extra,
    /// and that AI likeness is off.
    static func summary(_ card: RightsCard) -> String {
        var parts: [String] = ["You post this video on your own account. That is always included."]
        if card.paidAdsDays > 0 {
            let names: [String] = card.adPlatforms.map { (p: AdPlatform) -> String in
                return platformLabel(p)
            }
            let whereText: String = names.isEmpty ? "" : " on " + Fmt.joinList(names)
            parts.append("The brand can also run it as a paid ad" + whereText + " for " + String(card.paidAdsDays) + " days.")
            parts.append(card.whitelisting ? "You will be asked to approve the ad permission when your video is approved." : "The brand cannot run it through your account.")
            let per30: String = Fmt.percent(card.renewalPctPer30d, digits: 0)
            parts.append("After that it stops, unless the brand pays you " + per30 + " of your fee for every extra 30 days.")
        } else {
            parts.append("Paid ads are not included. The brand needs your agreement and a separate price to run it as an ad.")
        }
        if card.exclusivityDays > 0 {
            parts.append("You agree not to make a video for a competing app for " + String(card.exclusivityDays) + " days.")
        } else {
            parts.append("There is no exclusivity.")
        }
        parts.append(card.aiLikeness ? "AI use of your voice or face is included in this licence." : "Your voice and face are never cloned or recreated with AI.")
        let territory: String = card.territory.lowercased() == "worldwide" ? "worldwide" : card.territory
        parts.append("Territory: " + territory + ".")
        return parts.joined(separator: " ")
    }

    /// The Rights Card as table rows.
    static func lines(_ card: RightsCard) -> [RightsLine] {
        var paidValue: String = "Not included"
        if card.paidAdsDays > 0 {
            let names: [String] = card.adPlatforms.map { (p: AdPlatform) -> String in
                return platformLabel(p)
            }
            paidValue = String(card.paidAdsDays) + " days" + (names.isEmpty ? "" : " on " + Fmt.joinList(names))
        }
        return [
            RightsLine(id: "organic", label: "Organic posting", value: "Always included", notable: false),
            RightsLine(id: "paid_ads", label: "Paid ads", value: paidValue, notable: card.paidAdsDays > 0),
            RightsLine(id: "whitelisting", label: "Spark code or partnership permission", value: card.whitelisting ? "Requested when approved" : "No", notable: card.whitelisting),
            RightsLine(id: "exclusivity", label: "Exclusivity", value: card.exclusivityDays > 0 ? String(card.exclusivityDays) + " days" : "None", notable: card.exclusivityDays > 0),
            RightsLine(id: "ai_likeness", label: "AI likeness", value: card.aiLikeness ? "Included" : "Off", notable: card.aiLikeness),
            RightsLine(
                id: "renewal",
                label: "Renewal",
                value: card.paidAdsDays > 0 ? Fmt.percent(card.renewalPctPer30d, digits: 0) + " of your fee per extra 30 days" : "Not applicable",
                notable: false
            ),
            RightsLine(id: "territory", label: "Territory", value: card.territory, notable: false)
        ]
    }

    // MARK: Renewals

    /// Renewal price for one 30-day period: round(base fee x renewal share). Default 25%.
    static func renewalPricePer30(baseFeeCents: Int, renewalPct: Double = FlowdConstants.Rights.renewalFeePctOfBasePer30d) -> Int {
        return MoneyMath.mulRate(baseFeeCents, renewalPct)
    }

    /// Prices extending paid-ad rights. Each started 30 days is one period at round(base fee x 25%); the brand pays the plan fee on top. The base fee
    /// is the post's settled creator pay (or the flat fee for a direct bounty).
    static func renewalQuote(baseFeeCents: Int, renewalPct: Double = FlowdConstants.Rights.renewalFeePctOfBasePer30d, extraDays: Int, takeRate: Double, currentEndsAt: Date? = nil) -> RenewalQuote {
        let periods: Int = Swift.max(0, Int((Double(extraDays) / 30).rounded(.up)))
        let per30: Int = renewalPricePer30(baseFeeCents: baseFeeCents, renewalPct: renewalPct)
        let price: Int = per30 * periods
        let fee: Int = MoneyMath.mulRate(price, takeRate)
        var newEnd: Date? = nil
        if let end = currentEndsAt, periods > 0 {
            newEnd = FlowdCalendar.addDays(end, Double(periods * 30))
        }
        var summary: String = "Nothing to renew."
        if periods > 0 {
            summary = "Extend " + String(periods * 30) + " days for " + Fmt.money(price) + (fee > 0 ? " (+ " + Fmt.money(fee) + " fee)" : "")
        }
        return RenewalQuote(periods: periods, per30Cents: per30, priceCents: price, feeCents: fee, totalCents: price + fee, newEndsAt: newEnd, summary: summary)
    }

    // MARK: Expiry

    /// Days left until `endsAt` (fractional; negative once ended).
    static func daysLeft(endsAt: Date, now: Date) -> Double {
        return endsAt.timeIntervalSince(now) / 86_400
    }

    /// Which expiry alerts are due. Thresholds are 30, 14 and 7 days left; one is due when the days left are at or under it and it has not been sent.
    /// If the job was late and several are due at once, send only the most urgent: `send`.
    static func dueExpiryAlerts(endsAt: Date, alertsSent: [Int], now: Date) -> RightsAlertsDue {
        let left: Double = daysLeft(endsAt: endsAt, now: now)
        if left <= 0 {
            return RightsAlertsDue(due: [], send: nil)
        }
        let due: [Int] = FlowdConstants.Rights.expiryAlertDays.filter { (d: Int) -> Bool in
            return left <= Double(d) && !alertsSent.contains(d)
        }.sorted { (a: Int, b: Int) -> Bool in
            return a > b
        }
        return RightsAlertsDue(due: due, send: due.last)
    }

    /// The status a grant should show now: revoked stays revoked; a permission still waiting stays pending; past its end it is expired; inside 30 days
    /// of its end it is expiring; a renewal request is kept; otherwise active.
    static func deriveGrantStatus(status: RightsGrantStatus, endsAt: Date?, revokedAt: Date?, now: Date) -> RightsGrantStatus {
        if revokedAt != nil || status == .revoked {
            return .revoked
        }
        if status == .pendingPermission {
            return .pendingPermission
        }
        guard let end = endsAt else {
            return .active
        }
        let left: Double = daysLeft(endsAt: end, now: now)
        if left <= 0 {
            return .expired
        }
        if status == .renewalRequested {
            return .renewalRequested
        }
        let widest: Int = FlowdConstants.Rights.expiryAlertDays.max() ?? 30
        return left <= Double(widest) ? .expiring : .active
    }
}
