import Foundation

// The Studio pre-flight: the auto-QA findings of a take turned into the card the creator reads before submitting. Plain English, about the video and
// never the person; every failure carries the fix. A missing disclosure blocks settlement (the FTC wants it in the video itself, spoken and written),
// so it blocks Submit too; nothing else does. Mirrors the pre-flight step of the web Studio.

enum PreflightBuilder {
    /// The short name of a QA check as the pre-flight list shows it.
    static func title(for check: QaCheckType) -> String {
        switch check {
        case .disclosureAudio: return "Spoken #ad"
        case .disclosureOnscreen: return "On-screen #ad"
        case .musicLicence: return "Music licence"
        case .bannedClaims: return "Brand claims"
        case .aiContent: return "AI content label"
        case .duplicate: return "Original video"
        case .watermark: return "No watermarks"
        case .briefBeats: return "Brief beats"
        case .safeZone: return "Captions in safe zones"
        case .aspectRatio: return "Aspect ratio"
        case .length: return "Length"
        case .resolution: return "Resolution"
        case .audioClarity: return "Audio clarity"
        case .moderation: return "Brand safety"
        case .unknown: return "Check"
        }
    }

    /// One pre-flight row from a QA finding.
    static func check(from finding: QaFinding) -> PreflightCheck {
        return PreflightCheck(
            check: finding.check,
            result: finding.result,
            title: title(for: finding.check),
            message: finding.message,
            blocking: finding.blocksSettlement && finding.result == .fail,
            fix: finding.fix,
            evidence: finding.evidence
        )
    }

    /// The whole pre-flight card. Failures come first, then warnings, then passes; within a group the QA order is kept.
    static func build(report: QaReport, bounty: Bounty, brandName: String, captionBody: String = "", trackingLine: String? = nil) -> PreflightResult {
        let rows: [PreflightCheck] = report.findings.map { (finding: QaFinding) -> PreflightCheck in
            return check(from: finding)
        }
        func rank(_ result: QaResult) -> Int {
            switch result {
            case .fail: return 0
            case .warn: return 1
            case .pass: return 2
            case .unknown: return 3
            }
        }
        var indexed: [(offset: Int, element: PreflightCheck)] = []
        for (offset, element) in rows.enumerated() {
            indexed.append((offset: offset, element: element))
        }
        indexed.sort { (a: (offset: Int, element: PreflightCheck), b: (offset: Int, element: PreflightCheck)) -> Bool in
            let ra: Int = rank(a.element.result)
            let rb: Int = rank(b.element.result)
            if ra != rb {
                return ra < rb
            }
            return a.offset < b.offset
        }
        let ordered: [PreflightCheck] = indexed.map { (entry: (offset: Int, element: PreflightCheck)) -> PreflightCheck in
            return entry.element
        }
        let blocking: Int = ordered.filter { (c: PreflightCheck) -> Bool in
            return c.blocking
        }.count
        let warnings: Int = ordered.filter { (c: PreflightCheck) -> Bool in
            return c.result == .warn || (c.result == .fail && !c.blocking)
        }.count
        let disclosure: String = bounty.brief.disclosureText.isEmpty ? BriefHelpers.disclosureLine(brandName: brandName) : bounty.brief.disclosureText
        return PreflightResult(
            checks: ordered,
            canSubmit: blocking == 0,
            blockingCount: blocking,
            warningCount: warnings,
            captionDraft: BriefHelpers.caption(disclosure: disclosure, body: captionBody, trackingLine: trackingLine, hashtags: bounty.brief.hashtags)
        )
    }
}
