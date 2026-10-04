import Foundation

// Auto-QA over a video's transcript and metadata, before a human looks: the Studio pre-flight and the Score step run exactly this. Mirrors
// apps/web/src/lib/engine/qa.ts.
//
// Required beats, spoken and on-screen disclosure, banned claims, competitor mentions, music licence, AI labels, duplicates by perceptual-hash
// distance, watermarks, safe zones, aspect, length, resolution and audio clarity. Each check returns pass, warn or fail with plain-English text,
// evidence (a timecode, a transcript line, a QA check) and the reason code a rejection would use.
//
// A missing disclosure blocks settlement (FTC: the disclosure must be in the video itself, audio and visual). Nothing else does. Rejections are
// about the video, never the person.

enum MusicKind: String, Codable, Hashable, Sendable {
    case original
    case commercialLibrary = "commercial_library"
    case trendingSound = "trending_sound"
    case unknown
}

struct MusicDetection: Codable, Hashable, Sendable {
    var detected: Bool
    var kind: MusicKind

    init(detected: Bool, kind: MusicKind = .unknown) {
        self.detected = detected
        self.kind = kind
    }
}

struct AiContentFlag: Codable, Hashable, Sendable {
    var generated: Bool
    var labelled: Bool
}

struct AudioInfo: Codable, Hashable, Sendable {
    var snrDb: Double?
    var clipping: Bool

    init(snrDb: Double? = nil, clipping: Bool = false) {
        self.snrDb = snrDb
        self.clipping = clipping
    }
}

struct KnownHash: Codable, Hashable, Sendable {
    var id: String
    var phash: String
    var creatorId: String?
}

/// Everything the QA checks read.
struct QaInput: Hashable, Sendable {
    var transcript: [TranscriptSegment]
    var onScreenText: [OnScreenText]
    var durationMs: Int
    var width: Int
    var height: Int
    /// The post caption, when there is one (for the caption disclosure).
    var caption: String?
    var briefBeats: [BriefBeat]
    var bannedClaims: [String]
    var disclosureText: String
    var offerLine: String?
    var cta: String
    var minDurationS: Int
    var maxDurationS: Int
    var aspect: String
    var musicPolicy: MusicPolicy
    var aiPolicy: AiContentPolicy
    /// Hits already found by a vision model. When nil, a transcript heuristic stands in.
    var beats: [BeatHit]?
    /// The brand or app name the creator should say.
    var brandName: String
    var appFeatures: [String]
    var competitorNames: [String]
    var music: MusicDetection?
    var aiContent: AiContentFlag?
    var watermarkDetected: Bool
    var moderationFlags: [String]
    var audio: AudioInfo?
    var phash: String?
    var knownHashes: [KnownHash]

    init(
        transcript: [TranscriptSegment] = [],
        onScreenText: [OnScreenText] = [],
        durationMs: Int,
        width: Int = 1080,
        height: Int = 1920,
        caption: String? = nil,
        briefBeats: [BriefBeat] = [],
        bannedClaims: [String] = [],
        disclosureText: String = "",
        offerLine: String? = nil,
        cta: String = "",
        minDurationS: Int = FlowdConstants.Studio.minDurationS,
        maxDurationS: Int = FlowdConstants.Studio.maxDurationS,
        aspect: String = FlowdConstants.Studio.aspect,
        musicPolicy: MusicPolicy = .commercialLibrary,
        aiPolicy: AiContentPolicy = .allowedDisclosed,
        beats: [BeatHit]? = nil,
        brandName: String,
        appFeatures: [String] = [],
        competitorNames: [String] = [],
        music: MusicDetection? = nil,
        aiContent: AiContentFlag? = nil,
        watermarkDetected: Bool = false,
        moderationFlags: [String] = [],
        audio: AudioInfo? = nil,
        phash: String? = nil,
        knownHashes: [KnownHash] = []
    ) {
        self.transcript = transcript
        self.onScreenText = onScreenText
        self.durationMs = durationMs
        self.width = width
        self.height = height
        self.caption = caption
        self.briefBeats = briefBeats
        self.bannedClaims = bannedClaims
        self.disclosureText = disclosureText
        self.offerLine = offerLine
        self.cta = cta
        self.minDurationS = minDurationS
        self.maxDurationS = maxDurationS
        self.aspect = aspect
        self.musicPolicy = musicPolicy
        self.aiPolicy = aiPolicy
        self.beats = beats
        self.brandName = brandName
        self.appFeatures = appFeatures
        self.competitorNames = competitorNames
        self.music = music
        self.aiContent = aiContent
        self.watermarkDetected = watermarkDetected
        self.moderationFlags = moderationFlags
        self.audio = audio
        self.phash = phash
        self.knownHashes = knownHashes
    }

    /// Builds the input from a bounty's brief and deliverables: the usual way to run pre-flight for a take.
    init(bounty: Bounty, brandName: String, durationMs: Int, transcript: [TranscriptSegment] = [], onScreenText: [OnScreenText] = [], caption: String? = nil) {
        self.init(
            transcript: transcript,
            onScreenText: onScreenText,
            durationMs: durationMs,
            width: FlowdConstants.Studio.width,
            height: FlowdConstants.Studio.height,
            caption: caption,
            briefBeats: bounty.brief.beats,
            bannedClaims: bounty.brief.bannedClaims,
            disclosureText: bounty.brief.disclosureText,
            offerLine: bounty.brief.offerLine,
            cta: bounty.brief.cta,
            minDurationS: bounty.deliverables.minDurationS,
            maxDurationS: bounty.deliverables.maxDurationS,
            aspect: bounty.deliverables.aspect,
            musicPolicy: bounty.deliverables.musicPolicy,
            aiPolicy: bounty.deliverables.aiPolicy,
            brandName: brandName
        )
    }
}

/// A QA check with the extras the Studio needs: the reason code a rejection would carry, and a fix.
struct QaFinding: Codable, Hashable, Identifiable, Sendable {
    var check: QaCheckType
    var result: QaResult
    var message: String
    var evidence: Evidence?
    var blocksSettlement: Bool
    var reasonCode: ReasonCode?
    var fix: String?

    var id: String {
        return check.rawValue
    }

    /// The contract's QaCheck shape (extra fields dropped).
    var asQaCheck: QaCheck {
        return QaCheck(check: check, result: result, message: message, evidence: evidence, blocksSettlement: blocksSettlement, waivedByUserId: nil)
    }
}

struct CompetitorMention: Codable, Hashable, Sendable {
    var name: String
    var tMs: Int?
    var source: String
    var excerpt: String
}

struct DuplicateMatch: Codable, Hashable, Sendable {
    var id: String
    var creatorId: String?
    var distance: Int
    var exact: Bool
}

struct QaReport: Codable, Hashable, Sendable {
    /// One finding per check that ran, in a stable order.
    var findings: [QaFinding]
    var pass: Int
    var warn: Int
    var fail: Int
    /// True when a disclosure failed: settlement waits until it is fixed or waived with a logged reason.
    var blocksSettlement: Bool
    /// Reason codes that apply to failed or warned checks, most serious first, without duplicates.
    var reasonCodes: [ReasonCode]
    var beats: [BeatHit]
    var competitors: [CompetitorMention]
    var duplicates: [DuplicateMatch]

    /// True when every check passed (what approve-if-clean and auto-approve mean by clean).
    var isClean: Bool {
        return warn == 0 && fail == 0
    }

    /// The contract's QaCheck rows.
    var checks: [QaCheck] {
        return findings.map { (finding: QaFinding) -> QaCheck in
            return finding.asQaCheck
        }
    }
}

enum QAEngine {
    // MARK: Disclosure

    private static let spokenDisclosure: [String] = [
        #"\bhashtag ad\b"#,
        #"\b(?:this|it) is (?:an? )?(?:paid )?(?:ad|advert|advertisement|sponsored|partnership|promotion)\b"#,
        #"\b(?:this|it)'?s (?:an? )?(?:paid )?(?:ad|advert|advertisement|sponsored|partnership|promotion)\b"#,
        #"\bpaid (?:partnership|promotion|ad|advertisement)\b"#,
        #"\bsponsored (?:by|content|post|video)\b"#,
        #"\b(?:i'?m|i am|we are|we're) (?:partnering|partnered|working) with\b"#,
        #"\bpartnered with\b"#,
        #"\bin partnership with\b"#,
        #"\bthanks to .{1,30} for (?:sponsoring|partnering)\b"#
    ]

    private static let writtenDisclosure: [String] = [
        #"(^|[^a-z0-9])#ad(?![a-z0-9])"#,
        #"^ad(?:$|[\s:.|])"#,
        #"paid partnership"#,
        #"\bsponsored\b"#,
        #"#paidpartnership"#
    ]

    /// The first transcript segment that contains a spoken disclosure, or nil.
    static func findSpokenDisclosure(_ transcript: [TranscriptSegment]) -> TranscriptSegment? {
        for segment in transcript {
            if Rx.testAny(spokenDisclosure, in: TextTools.normalize(segment.text)) {
                return segment
            }
        }
        // A disclosure split across two segments ("this is a" / "paid partnership").
        var index: Int = 0
        while index + 1 < transcript.count {
            let joined: String = TextTools.normalize(transcript[index].text + " " + transcript[index + 1].text)
            if Rx.testAny(spokenDisclosure, in: joined) {
                return transcript[index]
            }
            index += 1
        }
        return nil
    }

    /// The first on-screen text that carries a written disclosure, or nil.
    static func findWrittenDisclosure(_ texts: [OnScreenText]) -> OnScreenText? {
        for text in texts {
            if Rx.testAny(writtenDisclosure, in: TextTools.normalize(text.text)) {
                return text
            }
        }
        return nil
    }

    private static let minOnscreenDisclosureMs: Int = 2_000

    private static func qaEvidence(_ check: QaCheckType) -> Evidence {
        return Evidence(kind: .qaCheck, ref: check.rawValue, excerpt: nil, tMs: nil)
    }

    /// Spoken disclosure: pass when said in the first half, warn when it comes late, fail (and block settlement) when it is never said.
    static func checkDisclosureAudio(transcript: [TranscriptSegment], durationMs: Int) -> QaFinding {
        guard let segment = findSpokenDisclosure(transcript) else {
            return QaFinding(
                check: .disclosureAudio,
                result: .fail,
                message: "#ad needs to be spoken and shown on screen. No spoken disclosure was found.",
                evidence: qaEvidence(.disclosureAudio),
                blocksSettlement: true,
                reasonCode: .missingDisclosure,
                fix: "Say \"this is a paid partnership\" near the start."
            )
        }
        let late: Bool = durationMs > 0 && Double(segment.tStartMs) > Double(durationMs) * 0.5
        let evidence: Evidence = Evidence(kind: .transcript, ref: Fmt.timecode(ms: segment.tStartMs), excerpt: segment.text, tMs: segment.tStartMs)
        if late {
            return QaFinding(
                check: .disclosureAudio,
                result: .warn,
                message: "The spoken disclosure comes late (" + Fmt.timecode(ms: segment.tStartMs) + "). Say it in the first half.",
                evidence: evidence,
                blocksSettlement: false,
                reasonCode: .missingDisclosure,
                fix: "Move the disclosure line into the first half of the video."
            )
        }
        return QaFinding(
            check: .disclosureAudio,
            result: .pass,
            message: "Spoken disclosure at " + Fmt.timecode(ms: segment.tStartMs) + ".",
            evidence: evidence,
            blocksSettlement: false,
            reasonCode: nil,
            fix: nil
        )
    }

    /// On-screen disclosure: pass at 2 seconds or more, warn when shorter, fail (and block settlement) when absent.
    static func checkDisclosureOnScreen(onScreenText: [OnScreenText]) -> QaFinding {
        guard let text = findWrittenDisclosure(onScreenText) else {
            return QaFinding(
                check: .disclosureOnscreen,
                result: .fail,
                message: "#ad needs to be spoken and shown on screen. No on-screen disclosure was found.",
                evidence: qaEvidence(.disclosureOnscreen),
                blocksSettlement: true,
                reasonCode: .missingDisclosure,
                fix: "Keep #ad on screen for at least 2 seconds."
            )
        }
        let visible: Int = text.tEndMs - text.tStartMs
        let short: Bool = visible < minOnscreenDisclosureMs
        let evidence: Evidence = Evidence(kind: .timecode, ref: Fmt.timecode(ms: text.tStartMs), excerpt: text.text, tMs: text.tStartMs)
        if short {
            return QaFinding(
                check: .disclosureOnscreen,
                result: .warn,
                message: "#ad is on screen for " + Fmt.decimal(Double(visible) / 1_000) + "s. Keep it up for 2 seconds.",
                evidence: evidence,
                blocksSettlement: false,
                reasonCode: .missingDisclosure,
                fix: "Keep #ad on screen for 2 seconds."
            )
        }
        return QaFinding(
            check: .disclosureOnscreen,
            result: .pass,
            message: "On-screen disclosure at " + Fmt.timecode(ms: text.tStartMs) + ".",
            evidence: evidence,
            blocksSettlement: false,
            reasonCode: nil,
            fix: nil
        )
    }

    /// The caption must carry #ad and the brand wording ("Paid partnership with Lumi"). Returns the compliance item for the post-level audit.
    static func checkCaptionDisclosure(caption: String?, brandName: String) -> ComplianceCheckItem {
        guard let caption = caption, !caption.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return ComplianceCheckItem(
                type: .captionDisclosure,
                result: .fail,
                message: "The caption is empty. It needs #ad and the brand wording.",
                evidence: nil,
                blocksSettlement: true
            )
        }
        let text: String = TextTools.normalize(caption)
        let hasAd: Bool = Rx.test(#"(^|[^a-z0-9])#ad(?![a-z0-9])"#, in: text) || Rx.test(#"#paidpartnership|#sponsored"#, in: text)
        let hasBrand: Bool = text.contains(TextTools.normalize(brandName))
        if hasAd && hasBrand {
            return ComplianceCheckItem(type: .captionDisclosure, result: .pass, message: "Caption carries #ad and " + brandName + ".", evidence: nil, blocksSettlement: false)
        }
        if hasAd {
            return ComplianceCheckItem(
                type: .captionDisclosure,
                result: .warn,
                message: "Caption has #ad but not the brand wording (\"Paid partnership with " + brandName + "\").",
                evidence: nil,
                blocksSettlement: false
            )
        }
        return ComplianceCheckItem(
            type: .captionDisclosure,
            result: .fail,
            message: "The caption has no #ad. Add \"#ad Paid partnership with " + brandName + "\".",
            evidence: nil,
            blocksSettlement: true
        )
    }

    // MARK: Claims, competitors, duplicates

    struct BannedClaimHit: Hashable, Sendable {
        var claim: String
        var source: String
        var tMs: Int?
        var excerpt: String
    }

    /// Every banned claim from the brief that appears in the transcript, on-screen text or caption.
    static func findBannedClaims(transcript: [TranscriptSegment], onScreenText: [OnScreenText], caption: String?, bannedClaims: [String]) -> [BannedClaimHit] {
        var out: [BannedClaimHit] = []
        for claim in bannedClaims {
            if let segment = transcript.first(where: { (s: TranscriptSegment) -> Bool in
                return TextTools.findPhrase(in: s.text, phrases: [claim]) != nil
            }) {
                out.append(BannedClaimHit(claim: claim, source: "transcript", tMs: segment.tStartMs, excerpt: segment.text))
            }
            if let shown = onScreenText.first(where: { (s: OnScreenText) -> Bool in
                return TextTools.findPhrase(in: s.text, phrases: [claim]) != nil
            }) {
                out.append(BannedClaimHit(claim: claim, source: "on_screen", tMs: shown.tStartMs, excerpt: shown.text))
            }
            if let caption = caption, TextTools.findPhrase(in: caption, phrases: [claim]) != nil {
                out.append(BannedClaimHit(claim: claim, source: "caption", tMs: nil, excerpt: caption))
            }
        }
        return out
    }

    /// Competitor names spoken, shown or captioned.
    static func findCompetitors(transcript: [TranscriptSegment], onScreenText: [OnScreenText], caption: String?, names: [String]) -> [CompetitorMention] {
        var out: [CompetitorMention] = []
        for name in names {
            if let segment = transcript.first(where: { (s: TranscriptSegment) -> Bool in
                return TextTools.findPhrase(in: s.text, phrases: [name]) != nil
            }) {
                out.append(CompetitorMention(name: name, tMs: segment.tStartMs, source: "transcript", excerpt: segment.text))
            }
            if let shown = onScreenText.first(where: { (s: OnScreenText) -> Bool in
                return TextTools.findPhrase(in: s.text, phrases: [name]) != nil
            }) {
                out.append(CompetitorMention(name: name, tMs: shown.tStartMs, source: "on_screen", excerpt: shown.text))
            }
            if let caption = caption, TextTools.findPhrase(in: caption, phrases: [name]) != nil {
                out.append(CompetitorMention(name: name, tMs: nil, source: "caption", excerpt: caption))
            }
        }
        return out
    }

    /// True for a 16-character hex perceptual hash.
    static func isValidPhash(_ hash: String) -> Bool {
        return Rx.test(#"^[0-9a-fA-F]{16}$"#, in: hash)
    }

    private static let nibbleBits: [Int] = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]

    /// Hamming distance between two perceptual hashes (differing bits out of 64), or nil when either is malformed.
    static func phashDistance(_ a: String, _ b: String) -> Int? {
        guard isValidPhash(a), isValidPhash(b) else {
            return nil
        }
        let left: [Character] = Array(a)
        let right: [Character] = Array(b)
        var bits: Int = 0
        var i: Int = 0
        while i < 16 {
            guard let x = Int(String(left[i]), radix: 16), let y = Int(String(right[i]), radix: 16) else {
                return nil
            }
            bits += nibbleBits[x ^ y]
            i += 1
        }
        return bits
    }

    /// Videos within `max` bits of this one (default 6), nearest first. Malformed hashes are skipped.
    static func findDuplicates(phash: String, known: [KnownHash], max maxDistance: Int = FlowdConstants.Fraud.duplicatePhashMaxDistance) -> [DuplicateMatch] {
        guard isValidPhash(phash) else {
            return []
        }
        var out: [DuplicateMatch] = []
        for entry in known {
            guard let distance = phashDistance(phash, entry.phash), distance <= maxDistance else {
                continue
            }
            out.append(DuplicateMatch(id: entry.id, creatorId: entry.creatorId, distance: distance, exact: distance == 0))
        }
        return out.sorted { (a: DuplicateMatch, b: DuplicateMatch) -> Bool in
            if a.distance != b.distance {
                return a.distance < b.distance
            }
            return a.id < b.id
        }
    }

    // MARK: Audio

    struct DeadAirGap: Hashable, Sendable {
        var startMs: Int
        var endMs: Int
        var lengthMs: Int
    }

    /// Dead-air gaps between spoken segments longer than `minMs` (default 1,000 ms). Leading and trailing silence are not counted here.
    static func deadAirGaps(_ transcript: [TranscriptSegment], minMs: Int = 1_000) -> [DeadAirGap] {
        let sorted: [TranscriptSegment] = transcript.sorted { (a: TranscriptSegment, b: TranscriptSegment) -> Bool in
            return a.tStartMs < b.tStartMs
        }
        var out: [DeadAirGap] = []
        var i: Int = 1
        while i < sorted.count {
            let gap: Int = sorted[i].tStartMs - sorted[i - 1].tEndMs
            if gap > minMs {
                out.append(DeadAirGap(startMs: sorted[i - 1].tEndMs, endMs: sorted[i].tStartMs, lengthMs: gap))
            }
            i += 1
        }
        return out
    }

    // MARK: Beats

    private static let problemWords: String = #"\b(?:struggl|hate|hated|tired of|annoying|problem|can'?t|cannot|never|why (?:is|do|does|can'?t)|used to|so (?:slow|hard|long)|stuck|waste)"#
    private static let payoffWords: String = #"\b(?:result|results|now|after|finally|turned out|boom|look at|here'?s (?:what|the)|done|ready|perfect|love|wow|worked)\b"#
    private static let reactionWords: String = #"\b(?:wow|omg|oh my|no way|what|insane|crazy|unreal|are you kidding|i can'?t believe)\b"#
    private static let demoWords: String = #"\b(?:watch|look|see how|here'?s|tap|just|open|upload|type|press|swipe|scan|record|then it|and it)\b"#
    private static let offerWords: String = #"\b(?:free trial|free for|try (?:it )?free|\d+ days? free|% off|first (?:week|month) free|no card|cancel anytime|no payment)\b"#

    /// A day-one stand-in for the vision model: finds each beat of the brief from the transcript and on-screen text. A beat that is in the brief
    /// but not detectable from text alone (a pure visual) is reported as not found, so a person decides.
    static func detectBeats(_ input: QaInput) -> [BeatHit] {
        let brand: String = TextTools.normalize(input.brandName)
        let segments: [TranscriptSegment] = input.transcript.sorted { (a: TranscriptSegment, b: TranscriptSegment) -> Bool in
            return a.tStartMs < b.tStartMs
        }
        let endCut: Double = Double(input.durationMs) * 0.7
        let offerTokens: [String] = input.offerLine.map { (line: String) -> [String] in
            return TextTools.contentTokens(line)
        } ?? []
        let ctaTokens: [String] = TextTools.contentTokens(input.cta)

        func firstSegment(_ pattern: String, after: Double = 0) -> TranscriptSegment? {
            return segments.first(where: { (s: TranscriptSegment) -> Bool in
                return Double(s.tStartMs) >= after && Rx.test(pattern, in: TextTools.normalize(s.text))
            })
        }

        func find(_ beat: BeatId) -> (found: Bool, tMs: Int?) {
            switch beat {
            case .hook:
                if let first = segments.first, first.tStartMs <= 3_000 {
                    return (true, first.tStartMs)
                }
                return (false, nil)
            case .problem:
                if let s = firstSegment(problemWords) {
                    return (true, s.tStartMs)
                }
                return (false, nil)
            case .appReveal:
                var times: [Int] = []
                if !brand.isEmpty {
                    if let s = segments.first(where: { (x: TranscriptSegment) -> Bool in
                        return TextTools.findPhrase(in: x.text, phrases: [input.brandName]) != nil
                    }) {
                        times.append(s.tStartMs)
                    }
                    if let o = input.onScreenText.first(where: { (x: OnScreenText) -> Bool in
                        return TextTools.findPhrase(in: x.text, phrases: [input.brandName]) != nil
                    }) {
                        times.append(o.tStartMs)
                    }
                }
                if let earliest = times.min() {
                    return (true, earliest)
                }
                return (false, nil)
            case .demo:
                if let s = firstSegment(demoWords, after: 1_500) {
                    return (true, s.tStartMs)
                }
                return (false, nil)
            case .keyFeature:
                if let s = segments.first(where: { (x: TranscriptSegment) -> Bool in
                    return input.appFeatures.contains(where: { (f: String) -> Bool in
                        return TextTools.findPhrase(in: x.text, phrases: [f]) != nil
                    })
                }) {
                    return (true, s.tStartMs)
                }
                return (false, nil)
            case .payoff, .proof:
                if let s = firstSegment(payoffWords, after: 2_000) {
                    return (true, s.tStartMs)
                }
                return (false, nil)
            case .winState:
                if let s = firstSegment(payoffWords, after: endCut * 0.8) {
                    return (true, s.tStartMs)
                }
                return (false, nil)
            case .reaction:
                if let s = firstSegment(reactionWords) {
                    return (true, s.tStartMs)
                }
                return (false, nil)
            case .offer:
                if let s = segments.first(where: { (x: TranscriptSegment) -> Bool in
                    if Rx.test(offerWords, in: TextTools.normalize(x.text)) {
                        return true
                    }
                    return !offerTokens.isEmpty && TextTools.containment(offerTokens, TextTools.tokenize(x.text)) >= 0.6
                }) {
                    return (true, s.tStartMs)
                }
                return (false, nil)
            case .cta:
                if let s = segments.first(where: { (x: TranscriptSegment) -> Bool in
                    guard Double(x.tStartMs) >= endCut else {
                        return false
                    }
                    if !TextTools.callsToAction(x.text).isEmpty {
                        return true
                    }
                    return !ctaTokens.isEmpty && TextTools.containment(ctaTokens, TextTools.tokenize(x.text)) >= 0.6
                }) {
                    return (true, s.tStartMs)
                }
                return (false, nil)
            case .endCard:
                if let o = input.onScreenText.first(where: { (x: OnScreenText) -> Bool in
                    guard Double(x.tStartMs) >= endCut else {
                        return false
                    }
                    if !brand.isEmpty && TextTools.findPhrase(in: x.text, phrases: [input.brandName]) != nil {
                        return true
                    }
                    return Rx.test(#"\.[a-z]{2,}\b|app store|link in bio"#, in: x.text, caseInsensitive: true)
                }) {
                    return (true, o.tStartMs)
                }
                return (false, nil)
            case .unknown:
                return (false, nil)
            }
        }

        return input.briefBeats.map { (b: BriefBeat) -> BeatHit in
            let result: (found: Bool, tMs: Int?) = find(b.beat)
            return BeatHit(beat: b.beat, required: b.required, found: result.found, tMs: result.tMs)
        }
    }

    // MARK: The checks

    /// Parses "9:16" into a width / height ratio. Falls back to 9:16 for anything unreadable.
    static func aspectRatio(of aspect: String) -> Double {
        let parts: [Substring] = aspect.trimmingCharacters(in: .whitespaces).split(separator: ":")
        guard parts.count == 2, let w = Double(parts[0]), let h = Double(parts[1]), h > 0 else {
            return 9.0 / 16.0
        }
        return w / h
    }

    private static func checkBeats(_ beats: [BeatHit]) -> QaFinding {
        let required: [BeatHit] = beats.filter { (b: BeatHit) -> Bool in
            return b.required
        }
        let missing: [BeatHit] = required.filter { (b: BeatHit) -> Bool in
            return !b.found
        }
        if required.isEmpty || missing.isEmpty {
            let message: String = required.isEmpty ? "The brief has no required beats." : "All " + String(required.count) + " required beats found."
            return QaFinding(check: .briefBeats, result: .pass, message: message, evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
        }
        let first: BeatHit = missing[0]
        let label: String = first.beat.rawValue.replacingOccurrences(of: "_", with: " ")
        let names: String = missing.map { (m: BeatHit) -> String in
            return m.beat.rawValue.replacingOccurrences(of: "_", with: " ")
        }.joined(separator: ", ")
        let code: ReasonCode
        switch first.beat {
        case .appReveal: code = .appNotShownEarly
        case .offer: code = .offerNotStated
        default: code = .missingRequiredBeat
        }
        return QaFinding(
            check: .briefBeats,
            result: .fail,
            message: String(required.count - missing.count) + " of " + String(required.count) + " required beats found. Missing: " + names + ".",
            evidence: Evidence(kind: .briefRequirement, ref: "beat:" + first.beat.rawValue, excerpt: "Required beat: " + label, tMs: nil),
            blocksSettlement: false,
            reasonCode: code,
            fix: "Add the missing beat from the shot checklist, then re-check the score."
        )
    }

    private static func evidenceFor(source: String, tMs: Int?, excerpt: String) -> Evidence {
        let kind: EvidenceKind = source == "transcript" ? .transcript : .timecode
        let ref: String = tMs.map { (t: Int) -> String in
            return Fmt.timecode(ms: t)
        } ?? "caption"
        return Evidence(kind: kind, ref: ref, excerpt: excerpt, tMs: tMs)
    }

    private static func checkBannedClaims(_ input: QaInput, competitors: [CompetitorMention]) -> QaFinding {
        let claims: [BannedClaimHit] = findBannedClaims(
            transcript: input.transcript,
            onScreenText: input.onScreenText,
            caption: input.caption,
            bannedClaims: input.bannedClaims
        )
        if let c = claims.first {
            let how: String = c.source == "caption" ? "written in the caption" : (c.source == "on_screen" ? "shown on screen" : "said")
            return QaFinding(
                check: .bannedClaims,
                result: .fail,
                message: "A banned claim was " + how + ": \"" + c.claim + "\".",
                evidence: evidenceFor(source: c.source, tMs: c.tMs, excerpt: c.excerpt),
                blocksSettlement: false,
                reasonCode: .bannedClaim,
                fix: "Rephrase using the approved wording in the brief."
            )
        }
        if let c = competitors.first {
            var message: String = "A competitor is mentioned: " + c.name
            if let t = c.tMs {
                message += " at " + Fmt.timecode(ms: t)
            }
            message += "."
            return QaFinding(
                check: .bannedClaims,
                result: .warn,
                message: message,
                evidence: evidenceFor(source: c.source, tMs: c.tMs, excerpt: c.excerpt),
                blocksSettlement: false,
                reasonCode: .competitorShown,
                fix: "Crop or re-record the section."
            )
        }
        return QaFinding(check: .bannedClaims, result: .pass, message: "No banned claims or competitor names found.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
    }

    private static func checkMusic(_ input: QaInput) -> QaFinding {
        guard let music = input.music, music.detected, music.kind != .original else {
            let detected: Bool = input.music?.detected ?? false
            return QaFinding(check: .musicLicence, result: .pass, message: detected ? "Original music." : "No music detected.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
        }
        switch music.kind {
        case .commercialLibrary:
            if input.musicPolicy == .originalOnly {
                return QaFinding(
                    check: .musicLicence,
                    result: .fail,
                    message: "This bounty allows original music only. Library music was found.",
                    evidence: nil,
                    blocksSettlement: false,
                    reasonCode: .musicNotLicensed,
                    fix: "Swap it for your own sound or remove the music."
                )
            }
            return QaFinding(check: .musicLicence, result: .pass, message: "Commercial Music Library track.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
        case .trendingSound:
            return QaFinding(
                check: .musicLicence,
                result: .fail,
                message: "A trending sound was found. It is not licensed for ads.",
                evidence: nil,
                blocksSettlement: false,
                reasonCode: .musicNotLicensed,
                fix: "Swap it for a commercial-library track or remove the music."
            )
        case .original, .unknown:
            return QaFinding(
                check: .musicLicence,
                result: .warn,
                message: "Music was detected but its licence is unknown. Use a commercial-library track.",
                evidence: nil,
                blocksSettlement: false,
                reasonCode: .musicNotLicensed,
                fix: "Swap it for a commercial-library track or remove the music."
            )
        }
    }

    private static func checkAi(_ input: QaInput) -> QaFinding {
        guard let ai = input.aiContent, ai.generated else {
            return QaFinding(check: .aiContent, result: .pass, message: "No AI-generated media flagged.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
        }
        if input.aiPolicy == .notAllowed {
            return QaFinding(
                check: .aiContent,
                result: .fail,
                message: "This bounty does not allow AI-generated media.",
                evidence: nil,
                blocksSettlement: false,
                reasonCode: .otherRequirement,
                fix: "Use your own footage and screen recordings."
            )
        }
        if !ai.labelled {
            return QaFinding(
                check: .aiContent,
                result: .fail,
                message: "AI-generated media needs a visible AI label.",
                evidence: nil,
                blocksSettlement: false,
                reasonCode: .aiContentUndisclosed,
                fix: "Add the \"AI-generated\" label on screen."
            )
        }
        return QaFinding(check: .aiContent, result: .pass, message: "AI-generated media is labelled.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
    }

    private static func checkDuplicate(_ input: QaInput, matches: [DuplicateMatch]) -> QaFinding {
        guard let phash = input.phash, isValidPhash(phash) else {
            return QaFinding(check: .duplicate, result: .pass, message: "No fingerprint to compare yet.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
        }
        guard let m = matches.first else {
            return QaFinding(check: .duplicate, result: .pass, message: "No matching video found.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
        }
        let message: String
        if m.exact {
            message = "An identical video was already submitted (" + m.id + ")."
        } else {
            message = "This video closely matches " + m.id + " (distance " + String(m.distance) + " of " + String(FlowdConstants.Fraud.duplicatePhashMaxDistance) + ")."
        }
        return QaFinding(
            check: .duplicate,
            result: .fail,
            message: message,
            evidence: Evidence(kind: .qaCheck, ref: QaCheckType.duplicate.rawValue, excerpt: m.id + ", distance " + String(m.distance), tMs: nil),
            blocksSettlement: false,
            reasonCode: .duplicateContent,
            fix: "Film a new original take."
        )
    }

    private static func checkAspect(_ input: QaInput) -> QaFinding {
        let target: Double = aspectRatio(of: input.aspect)
        let actual: Double = input.height > 0 ? Double(input.width) / Double(input.height) : 0
        let size: String = String(input.width) + "x" + String(input.height)
        if abs(actual - target) <= 0.02 {
            return QaFinding(check: .aspectRatio, result: .pass, message: size + " (" + input.aspect + ").", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
        }
        return QaFinding(
            check: .aspectRatio,
            result: .fail,
            message: "The video is " + size + ", not " + input.aspect + ".",
            evidence: nil,
            blocksSettlement: false,
            reasonCode: .wrongFormat,
            fix: "Re-export at 1080x1920."
        )
    }

    private static func checkLength(_ input: QaInput) -> QaFinding {
        let seconds: Double = Double(input.durationMs) / 1_000
        let shown: String = String(Int(seconds.rounded()))
        let window: String = String(input.minDurationS) + " to " + String(input.maxDurationS)
        if seconds >= Double(input.minDurationS) && seconds <= Double(input.maxDurationS) {
            return QaFinding(check: .length, result: .pass, message: shown + "s, inside the " + window + " second window.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
        }
        return QaFinding(
            check: .length,
            result: .fail,
            message: "The video is " + shown + "s. This bounty asks for " + window + " seconds.",
            evidence: nil,
            blocksSettlement: false,
            reasonCode: .wrongFormat,
            fix: "Keep it between " + String(input.minDurationS) + " and " + String(input.maxDurationS) + " seconds."
        )
    }

    private static func checkResolution(_ input: QaInput) -> QaFinding {
        let shortSide: Int = min(input.width, input.height)
        let size: String = String(input.width) + "x" + String(input.height)
        if shortSide >= FlowdConstants.Studio.width {
            return QaFinding(check: .resolution, result: .pass, message: size + ".", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
        }
        if shortSide >= 720 {
            return QaFinding(
                check: .resolution,
                result: .warn,
                message: size + " is under 1080p. It will look soft in ads.",
                evidence: nil,
                blocksSettlement: false,
                reasonCode: .lowVideoQuality,
                fix: "Film at 1080x1920."
            )
        }
        return QaFinding(
            check: .resolution,
            result: .fail,
            message: size + " is too low resolution.",
            evidence: nil,
            blocksSettlement: false,
            reasonCode: .lowVideoQuality,
            fix: "Film near a window, hold steady, and export at 1080x1920."
        )
    }

    private static func checkAudio(_ input: QaInput) -> QaFinding {
        let gaps: [DeadAirGap] = deadAirGaps(input.transcript)
        let snr: Double? = input.audio?.snrDb
        let clipping: Bool = input.audio?.clipping ?? false
        let noisy: Bool = snr.map { (value: Double) -> Bool in
            return value < 12
        } ?? false
        if gaps.count >= 3 || noisy {
            let message: String = noisy ? "The speech is hard to hear over background noise." : String(gaps.count) + " dead-air gaps over 1 second."
            return QaFinding(
                check: .audioClarity,
                result: .fail,
                message: message,
                evidence: nil,
                blocksSettlement: false,
                reasonCode: .audioUnclear,
                fix: "Move closer to the mic, cut silences, and re-export."
            )
        }
        let slightlyNoisy: Bool = snr.map { (value: Double) -> Bool in
            return value < 20
        } ?? false
        if !gaps.isEmpty || clipping || slightlyNoisy {
            let first: DeadAirGap? = gaps.first
            let message: String
            var evidence: Evidence? = nil
            if let gap = first {
                message = "A " + Fmt.decimal(Double(gap.lengthMs) / 1_000) + "s pause at " + Fmt.timecode(ms: gap.startMs) + "."
                evidence = Evidence(kind: .timecode, ref: Fmt.timecode(ms: gap.startMs), excerpt: nil, tMs: gap.startMs)
            } else if clipping {
                message = "The audio clips (too loud)."
            } else {
                message = "Some background noise."
            }
            return QaFinding(
                check: .audioClarity,
                result: .warn,
                message: message,
                evidence: evidence,
                blocksSettlement: false,
                reasonCode: .audioUnclear,
                fix: "Cut the silences and keep the mic level steady."
            )
        }
        return QaFinding(check: .audioClarity, result: .pass, message: "Clear audio, no dead air over 1 second.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
    }

    private static func checkSafeZone(_ input: QaInput) -> QaFinding {
        let outside: [OnScreenText] = input.onScreenText.filter { (t: OnScreenText) -> Bool in
            return !t.inSafeZone
        }
        guard let first = outside.first else {
            return QaFinding(check: .safeZone, result: .pass, message: "All text is inside the platform safe zones.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
        }
        let plural: String = outside.count == 1 ? " is" : "s are"
        return QaFinding(
            check: .safeZone,
            result: .warn,
            message: String(outside.count) + " text overlay" + plural + " outside the safe zones, first at " + Fmt.timecode(ms: first.tStartMs) + ".",
            evidence: Evidence(kind: .timecode, ref: Fmt.timecode(ms: first.tStartMs), excerpt: first.text, tMs: first.tStartMs),
            blocksSettlement: false,
            reasonCode: nil,
            fix: "Move captions above the platform UI."
        )
    }

    private static func checkWatermark(_ input: QaInput) -> QaFinding {
        if input.watermarkDetected {
            return QaFinding(
                check: .watermark,
                result: .fail,
                message: "Another app's watermark or logo is visible.",
                evidence: nil,
                blocksSettlement: false,
                reasonCode: .watermarkPresent,
                fix: "Re-export your screen recording without overlays."
            )
        }
        return QaFinding(check: .watermark, result: .pass, message: "No watermark found.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
    }

    private static func checkModeration(_ input: QaInput) -> QaFinding {
        if !input.moderationFlags.isEmpty {
            return QaFinding(
                check: .moderation,
                result: .fail,
                message: "Brand-safety flags: " + input.moderationFlags.joined(separator: ", ") + ".",
                evidence: nil,
                blocksSettlement: false,
                reasonCode: .brandSafety,
                fix: "Review the do and don't list in the brief."
            )
        }
        return QaFinding(check: .moderation, result: .pass, message: "Nothing flagged.", evidence: nil, blocksSettlement: false, reasonCode: nil, fix: nil)
    }

    private static func severity(_ result: QaResult) -> Int {
        switch result {
        case .fail: return 2
        case .warn: return 1
        case .pass: return 0
        case .unknown: return 0
        }
    }

    /// Runs every QA check over a video and its metadata. `blocksSettlement` is true only when a disclosure (spoken or on screen) is missing;
    /// `reasonCodes` lists the codes a rejection or request-changes would carry. Deterministic: the same input gives the same report.
    static func run(_ input: QaInput) -> QaReport {
        let beats: [BeatHit] = input.beats ?? detectBeats(input)
        let competitors: [CompetitorMention] = findCompetitors(
            transcript: input.transcript,
            onScreenText: input.onScreenText,
            caption: input.caption,
            names: input.competitorNames
        )
        var duplicates: [DuplicateMatch] = []
        if let phash = input.phash {
            duplicates = findDuplicates(phash: phash, known: input.knownHashes)
        }
        let findings: [QaFinding] = [
            checkDisclosureAudio(transcript: input.transcript, durationMs: input.durationMs),
            checkDisclosureOnScreen(onScreenText: input.onScreenText),
            checkBeats(beats),
            checkBannedClaims(input, competitors: competitors),
            checkMusic(input),
            checkAi(input),
            checkDuplicate(input, matches: duplicates),
            checkWatermark(input),
            checkSafeZone(input),
            checkAspect(input),
            checkLength(input),
            checkResolution(input),
            checkAudio(input),
            checkModeration(input)
        ]
        var reasonCodes: [ReasonCode] = []
        let ordered: [QaFinding] = findings.sorted { (a: QaFinding, b: QaFinding) -> Bool in
            return severity(a.result) > severity(b.result)
        }
        for finding in ordered where finding.result != .pass {
            if let code = finding.reasonCode, !reasonCodes.contains(code) {
                reasonCodes.append(code)
            }
        }
        return QaReport(
            findings: findings,
            pass: findings.filter { (f: QaFinding) -> Bool in return f.result == .pass }.count,
            warn: findings.filter { (f: QaFinding) -> Bool in return f.result == .warn }.count,
            fail: findings.filter { (f: QaFinding) -> Bool in return f.result == .fail }.count,
            blocksSettlement: findings.contains(where: { (f: QaFinding) -> Bool in
                return f.blocksSettlement && f.result == .fail
            }),
            reasonCodes: reasonCodes,
            beats: beats,
            competitors: competitors,
            duplicates: duplicates
        )
    }
}
