import Foundation

// The Brief TL;DR and caption helpers. Flo's "TL;DR this brief" is a mock AI provider, but the day-one summary is rules, not a model: it reads the
// brief the brand wrote (summary, talking points, beats, do and don't, CTA, offer, disclosure) and lays it out in the order a creator needs it. Same
// brief in, same TL;DR out.

/// One beat the video must hit.
struct BriefMustSay: Codable, Hashable, Identifiable, Sendable {
    var beat: BeatId
    var label: String
    var hint: String?

    var id: String {
        return beat.rawValue
    }
}

/// The brief in one screen.
struct BriefTLDR: Codable, Hashable, Sendable {
    /// The first sentence of the brief.
    var headline: String
    /// Up to three talking points.
    var talkingPoints: [String]
    /// The required beats, in brief order.
    var mustSay: [BriefMustSay]
    /// Up to three each.
    var dos: [String]
    var donts: [String]
    var cta: String
    var offerLine: String?
    /// The wording the caption must carry.
    var disclosure: String
    /// "15 to 30 seconds, 9:16, one video".
    var lengthLine: String
    /// "TikTok and Instagram".
    var platformsLine: String
    /// "Organic posting always included. Paid ads for 90 days."
    var rightsLine: String
    /// A planning number: about how long the take takes to film.
    var estimatedFilmMinutes: Int
}

enum BriefHelpers {
    private static func platformName(_ platform: Platform) -> String {
        switch platform {
        case .tiktok: return "TikTok"
        case .instagram: return "Instagram"
        case .youtube: return "YouTube"
        case .unknown: return "your platform"
        }
    }

    /// The first sentence of a paragraph.
    static func firstSentence(_ text: String) -> String {
        let trimmed: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let sentence = Rx.firstGroup(#"^(.*?[.?!])(?:\s|$)"#, in: trimmed) {
            return sentence
        }
        return trimmed
    }

    /// The Brief TL;DR for a bounty.
    static func tldr(brief: Brief, deliverables: Deliverables, rightsCard: RightsCard) -> BriefTLDR {
        let required: [BriefBeat] = brief.beats.filter { (b: BriefBeat) -> Bool in
            return b.required
        }
        let mustSay: [BriefMustSay] = required.map { (b: BriefBeat) -> BriefMustSay in
            return BriefMustSay(beat: b.beat, label: b.label, hint: b.hint)
        }
        let platforms: [String] = deliverables.platforms.map { (p: Platform) -> String in
            return platformName(p)
        }
        var length: String = String(deliverables.minDurationS) + " to " + String(deliverables.maxDurationS) + " seconds, " + deliverables.aspect
        length += ", " + (deliverables.videosPerCreator == 1 ? "one video" : String(deliverables.videosPerCreator) + " videos")
        var rights: String = "Organic posting always included."
        if rightsCard.paidAdsDays > 0 {
            rights += " Paid ads for " + String(rightsCard.paidAdsDays) + " days."
        }
        let minutes: Int = 12 + 4 * required.count + (deliverables.requireFace ? 0 : -3)
        return BriefTLDR(
            headline: firstSentence(brief.summary),
            talkingPoints: Array(brief.talkingPoints.prefix(3)),
            mustSay: mustSay,
            dos: Array(brief.dos.prefix(3)),
            donts: Array(brief.donts.prefix(3)),
            cta: brief.cta,
            offerLine: brief.offerLine,
            disclosure: brief.disclosureText,
            lengthLine: length,
            platformsLine: platforms.isEmpty ? "Any platform" : Fmt.joinList(platforms),
            rightsLine: rights,
            estimatedFilmMinutes: Swift.max(8, minutes)
        )
    }

    /// The TL;DR for a bounty row.
    static func tldr(for bounty: Bounty) -> BriefTLDR {
        return tldr(brief: bounty.brief, deliverables: bounty.deliverables, rightsCard: bounty.rightsCard)
    }

    /// The locked caption: the disclosure line, then the creator's own words, the tracking line and the hashtags. The disclosure is always first and
    /// can never be removed in the Studio.
    static func caption(disclosure: String, body: String, trackingLine: String?, hashtags: [String]) -> String {
        var lines: [String] = [disclosure]
        let trimmed: String = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            lines.append(trimmed)
        }
        if let tracking = trackingLine, !tracking.isEmpty {
            lines.append(tracking)
        }
        var tags: [String] = hashtags
        if !tags.contains(where: { (t: String) -> Bool in return t.lowercased() == "#ad" }) {
            tags.append("#ad")
        }
        lines.append(tags.joined(separator: " "))
        return lines.joined(separator: "\n")
    }

    /// "#ad Paid partnership with Lumi".
    static func disclosureLine(brandName: String) -> String {
        return FlowdConstants.Compliance.defaultDisclosureText.replacingOccurrences(of: "{brand}", with: brandName)
    }
}
