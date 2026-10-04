import Foundation

// Hook Score and Flow Score: the on-device checklist scores. Mirrors apps/web/src/lib/engine/scoring.ts and the contract's FORMULAS (scores).
//
// Day-one scores are CHECKLIST scores, not predictions: every item is full, half or zero by a published rule, every item carries a plain-English
// reason with a timecode, and every score is labelled "Checklist score. It gets smarter as bounties settle." until a learned model beats it on
// held-out apps. A score is never a bare number: it always comes with a band, reasons and one-tap fixes.
//
// Hook Score (first 3 seconds, weights sum to 100): hook lands by 2.0 s 20, on-screen text mirrors the spoken hook 15, face in the first second 15,
// app by 3 s 15, pattern interrupt 10, proven hook type 10, speech starts fast 10, captions in safe zones 5.
// Flow Score (whole video, weights sum to 100): Hook Score scaled 30, required beats 25, app early 10, disclosure 10, length 5, safe-zone captions
// 5, one CTA and win state 5, clear audio 5, format fit 5. Bands: A 85+, B 70 to 84, C 55 to 69, D 40 to 54, E under 40.

/// A checklist line plus the moment in the video it is about, so the UI can jump to it.
struct ScoredItem: Codable, Hashable, Identifiable, Sendable {
    var id: ScoreItemId
    var label: String
    var points: Int
    var max: Int
    var passed: Bool
    var reason: String
    var fix: String?
    /// The timecode the reason refers to, in milliseconds, when there is one.
    var atMs: Int?

    /// Points lost on this item.
    var pointsLost: Int {
        return self.max - points
    }
}

/// A scored checklist: the band, the points, every item and the honest label.
struct ScoredCard: Codable, Hashable, Sendable {
    var band: ScoreBand
    var points: Int
    var items: [ScoredItem]
    /// Always "Checklist score. It gets smarter as bounties settle."
    var label: String

    /// The contract's ScoreCard shape (what a submission stores).
    var asScoreCard: ScoreCard {
        let rows: [ScoreItem] = items.map { (item: ScoredItem) -> ScoreItem in
            return ScoreItem(id: item.id, label: item.label, points: item.points, max: item.max, passed: item.passed, reason: item.reason, fix: item.fix)
        }
        return ScoreCard(band: band, points: points, items: rows, label: label)
    }
}

/// What the Hook Score reads off the first seconds of a video. Times are milliseconds from the start; nil means it never happens.
/// The on-device hook coach (Vision) and the server-side video analysis both produce this shape.
struct HookObservations: Codable, Hashable, Sendable {
    /// When the hook line has landed (its last word).
    var landsMs: Int?
    /// When the hook appears as on-screen text.
    var onscreenMs: Int?
    /// The on-screen text says what the voice says.
    var spokenMatchesOnscreen: Bool
    /// First face on screen.
    var faceMs: Int?
    /// Faceless formats (slideshow, screen recording only) get the face points.
    var faceless: Bool
    /// The app or product first on screen.
    var appMs: Int?
    /// First cut, zoom or motion burst.
    var interruptMs: Int?
    var hookTypeKnown: Bool
    /// The hook type has an above-median trial rate in the library.
    var hookTypeAboveMedian: Bool
    /// First spoken word.
    var speechMs: Int?
    var captionsInSafeZone: Bool

    init(
        landsMs: Int? = nil,
        onscreenMs: Int? = nil,
        spokenMatchesOnscreen: Bool = false,
        faceMs: Int? = nil,
        faceless: Bool = false,
        appMs: Int? = nil,
        interruptMs: Int? = nil,
        hookTypeKnown: Bool = false,
        hookTypeAboveMedian: Bool = false,
        speechMs: Int? = nil,
        captionsInSafeZone: Bool = false
    ) {
        self.landsMs = landsMs
        self.onscreenMs = onscreenMs
        self.spokenMatchesOnscreen = spokenMatchesOnscreen
        self.faceMs = faceMs
        self.faceless = faceless
        self.appMs = appMs
        self.interruptMs = interruptMs
        self.hookTypeKnown = hookTypeKnown
        self.hookTypeAboveMedian = hookTypeAboveMedian
        self.speechMs = speechMs
        self.captionsInSafeZone = captionsInSafeZone
    }
}

/// Raw features of a hook as the on-device coach (Vision, Speech) measures them, before they become observations. Adds what the checklist alone
/// does not see: the hook's wording, its length, and motion.
struct HookFeatures: Hashable, Sendable {
    /// The spoken hook line.
    var hookText: String
    /// When the line starts and when its last word ends. The hook has "landed" at the end.
    var hookStartMs: Int
    var hookEndMs: Int
    /// First spoken word (nil when silent).
    var speechStartMs: Int?
    /// Text burned in during the hook, and when it first appears.
    var onscreenText: String?
    var onscreenMs: Int?
    var faceMs: Int?
    var faceless: Bool
    var appMs: Int?
    /// First hard cut.
    var firstCutMs: Int?
    /// Mean frame-to-frame change in the first 1.5 s, 0...1. 0.35 or more counts as visual motion.
    var motionScore: Double?
    /// The library hook type the hook uses, when it matches one.
    var hookType: HookType?
    /// Trial rate per hook type from the library, to decide "above median".
    var hookTypeTrialRates: [HookType: Double]
    var captionsInSafeZone: Bool

    init(
        hookText: String,
        hookStartMs: Int = 0,
        hookEndMs: Int,
        speechStartMs: Int? = nil,
        onscreenText: String? = nil,
        onscreenMs: Int? = nil,
        faceMs: Int? = nil,
        faceless: Bool = false,
        appMs: Int? = nil,
        firstCutMs: Int? = nil,
        motionScore: Double? = nil,
        hookType: HookType? = nil,
        hookTypeTrialRates: [HookType: Double] = [:],
        captionsInSafeZone: Bool = false
    ) {
        self.hookText = hookText
        self.hookStartMs = hookStartMs
        self.hookEndMs = hookEndMs
        self.speechStartMs = speechStartMs
        self.onscreenText = onscreenText
        self.onscreenMs = onscreenMs
        self.faceMs = faceMs
        self.faceless = faceless
        self.appMs = appMs
        self.firstCutMs = firstCutMs
        self.motionScore = motionScore
        self.hookType = hookType
        self.hookTypeTrialRates = hookTypeTrialRates
        self.captionsInSafeZone = captionsInSafeZone
    }
}

enum FormatOrder: String, Codable, Hashable, Sendable {
    case inOrder = "in_order"
    case oneOff = "one_off"
    case outOfOrder = "out_of_order"
}

/// What the Flow Score reads off a whole video.
struct FlowObservations: Codable, Hashable, Sendable {
    /// The video's Hook Score points (0 to 100).
    var hookPoints: Int
    var beatsFound: Int
    var beatsRequired: Int
    var appMs: Int?
    var disclosureAudio: Bool
    var disclosureOnscreen: Bool
    var durationS: Double
    var captionsInSafeZone: Bool
    var singleCta: Bool
    var endsOnWinState: Bool
    /// Dead-air gaps over 1 second.
    var audioGaps: Int
    var formatOrder: FormatOrder

    init(
        hookPoints: Int,
        beatsFound: Int,
        beatsRequired: Int,
        appMs: Int? = nil,
        disclosureAudio: Bool,
        disclosureOnscreen: Bool,
        durationS: Double,
        captionsInSafeZone: Bool,
        singleCta: Bool,
        endsOnWinState: Bool,
        audioGaps: Int,
        formatOrder: FormatOrder
    ) {
        self.hookPoints = hookPoints
        self.beatsFound = beatsFound
        self.beatsRequired = beatsRequired
        self.appMs = appMs
        self.disclosureAudio = disclosureAudio
        self.disclosureOnscreen = disclosureOnscreen
        self.durationS = durationS
        self.captionsInSafeZone = captionsInSafeZone
        self.singleCta = singleCta
        self.endsOnWinState = endsOnWinState
        self.audioGaps = audioGaps
        self.formatOrder = formatOrder
    }
}

/// The result of scoring raw hook features: the checklist, the observations behind it, and extra coaching about the hook line itself.
struct HookFeatureResult: Hashable, Sendable {
    var card: ScoredCard
    var observations: HookObservations
    var words: Int
    /// Extra coaching beyond the checklist (hook length).
    var advice: [String]
}

enum HookFixKind: String, Codable, Hashable, Sendable, CaseIterable {
    case addHookLine = "add_hook_line"
    case trimIntro = "trim_intro"
    case burnInHookText = "burn_in_hook_text"
    case startOnFace = "start_on_face"
    case moveAppReveal = "move_app_reveal"
    case addCut = "add_cut"
    case useProvenHook = "use_proven_hook"
    case cutDeadAir = "cut_dead_air"
    case moveCaptions = "move_captions"
}

enum FlowFixKind: String, Codable, Hashable, Sendable, CaseIterable {
    case fixHookFirst = "fix_hook_first"
    case addMissingBeat = "add_missing_beat"
    case showAppEarly = "show_app_early"
    case addDisclosure = "add_disclosure"
    case trimLength = "trim_length"
    case extendLength = "extend_length"
    case moveCaptions = "move_captions"
    case oneCtaWinState = "one_cta_win_state"
    case cutSilences = "cut_silences"
    case reorderBeats = "reorder_beats"
}

/// A one-tap fix: a deterministic edit to the observations, with the points it would earn.
struct ScoreFix: Codable, Hashable, Identifiable, Sendable {
    /// Stable id: the fix kind ("move_app_reveal").
    var id: String
    var itemId: ScoreItemId
    /// Button text: "Move the app reveal to 0:03".
    var label: String
    /// One sentence on what changes.
    var detail: String
    /// Points the checklist gains if the fix is applied and nothing else changes.
    var gainPoints: Int
}

/// Why a score is what it is: what is working and what to fix first (largest points lost first).
struct ScoreExplanation: Hashable, Sendable {
    var headline: String
    var strengths: [ScoredItem]
    var fixFirst: [ScoredItem]
}

enum ScoringEngine {
    // MARK: Bands

    /// A 85+, B 70 to 84, C 55 to 69, D 40 to 54, E under 40.
    static func band(for points: Int) -> ScoreBand {
        if points >= FlowdConstants.Scores.Bands.a {
            return .a
        }
        if points >= FlowdConstants.Scores.Bands.b {
            return .b
        }
        if points >= FlowdConstants.Scores.Bands.c {
            return .c
        }
        if points >= FlowdConstants.Scores.Bands.d {
            return .d
        }
        return .e
    }

    /// The next band up and the points still needed to reach it ("6 points to a B"); `next` is nil at A.
    static func pointsToNextBand(_ points: Int) -> (next: ScoreBand?, needed: Int) {
        let current: ScoreBand = band(for: points)
        let better: ScoreBand?
        switch current {
        case .a, .unknown: better = nil
        case .b: better = .a
        case .c: better = .b
        case .d: better = .c
        case .e: better = .d
        }
        guard let target = better else {
            return (nil, 0)
        }
        return (target, Swift.max(0, FlowdConstants.bandFloor(target) - points))
    }

    // MARK: Items

    private static func grade(_ full: Bool, _ half: Bool, _ maxPoints: Int) -> Int {
        if full {
            return maxPoints
        }
        if half {
            return MoneyMath.roundHalfUp(Double(maxPoints) / 2)
        }
        return 0
    }

    private static func makeItem(
        _ list: [ChecklistSpec],
        _ id: ScoreItemId,
        _ points: Int,
        _ reason: String,
        _ fix: String?,
        _ atMs: Int? = nil
    ) -> ScoredItem {
        let spec: ChecklistSpec? = list.first(where: { (s: ChecklistSpec) -> Bool in
            return s.id == id.rawValue
        })
        let weight: Int = spec?.weight ?? 0
        let passed: Bool = points == weight
        return ScoredItem(
            id: id,
            label: spec?.label ?? id.label,
            points: points,
            max: weight,
            passed: passed,
            reason: reason,
            fix: (passed ? nil : fix),
            atMs: atMs
        )
    }

    private static func finish(_ items: [ScoredItem]) -> ScoredCard {
        let total: Int = items.reduce(0) { (sum: Int, item: ScoredItem) -> Int in
            return sum + item.points
        }
        return ScoredCard(band: band(for: total), points: total, items: items, label: FlowdConstants.checklistLabel)
    }

    private static func sec(_ ms: Int?) -> String {
        return Fmt.secondsLabel(ms: ms)
    }

    // MARK: Hook Score

    /// Hook Score (first 3 seconds), 0 to 100, from checklist weights 20/15/15/15/10/10/10/5. Each item is full, half or zero by its rule; every item
    /// has a timecoded reason and, when it lost points, a one-tap fix. Always labelled a checklist score.
    static func scoreHook(_ obs: HookObservations) -> ScoredCard {
        let list: [ChecklistSpec] = FlowdConstants.Scores.hookChecklist
        var items: [ScoredItem] = []

        // 1. The hook lands by 2.0 s (half by 3.0 s).
        let lands: Int? = obs.landsMs
        let landsFull: Bool = lands != nil && (lands ?? Int.max) <= 2_000
        let landsHalf: Bool = lands != nil && (lands ?? Int.max) <= 3_000
        let landsReason: String = lands == nil ? "The hook never lands." : "Hook lands at " + sec(lands) + "."
        items.append(makeItem(list, .hookLands2s, grade(landsFull, landsHalf, 20), landsReason, "Open on the hook line; trim the intro.", lands))

        // 2. On-screen text mirrors the spoken hook within 1 s (half by 2.0 s).
        let textFull: Bool = obs.onscreenMs != nil && (obs.onscreenMs ?? Int.max) <= 1_000 && obs.spokenMatchesOnscreen
        let textHalf: Bool = obs.onscreenMs != nil && (obs.onscreenMs ?? Int.max) <= 2_000
        var textReason: String = "No on-screen hook text."
        if obs.onscreenMs != nil {
            textReason = "Hook text appears at " + sec(obs.onscreenMs) + (obs.spokenMatchesOnscreen ? "" : " and differs from what you say") + "."
        }
        items.append(makeItem(list, .onscreenTextMatches, grade(textFull, textHalf, 15), textReason, "Burn the spoken hook in as text in the first second.", obs.onscreenMs))

        // 3. A face within the first second (half by 2.0 s). Faceless formats get full points.
        var facePoints: Int = 15
        var faceReason: String = "Faceless format: no face needed."
        if !obs.faceless {
            let faceFull: Bool = obs.faceMs != nil && (obs.faceMs ?? Int.max) <= 1_000
            let faceHalf: Bool = obs.faceMs != nil && (obs.faceMs ?? Int.max) <= 2_000
            facePoints = grade(faceFull, faceHalf, 15)
            if obs.faceMs == nil {
                faceReason = "No face on screen."
            } else if faceFull {
                faceReason = "Face on screen at " + sec(obs.faceMs) + "."
            } else {
                faceReason = "No face until " + sec(obs.faceMs) + "."
            }
        }
        items.append(makeItem(list, .faceEarly, facePoints, faceReason, "Start on your face, then cut to the app.", obs.faceless ? nil : obs.faceMs))

        // 4. The app by 3 s (half by 5 s).
        let appFull: Bool = obs.appMs != nil && (obs.appMs ?? Int.max) <= 3_000
        let appHalf: Bool = obs.appMs != nil && (obs.appMs ?? Int.max) <= 5_000
        let appReason: String = obs.appMs == nil ? "The app never appears." : "App visible at " + sec(obs.appMs) + "."
        items.append(makeItem(list, .appVisible3s, grade(appFull, appHalf, 15), appReason, "Move the app reveal into the first 3 seconds.", obs.appMs))

        // 5. A pattern interrupt in the first 1.5 s.
        let interruptOk: Bool = obs.interruptMs != nil && (obs.interruptMs ?? Int.max) <= 1_500
        let interruptReason: String = obs.interruptMs == nil ? "No cut or motion in the first 1.5s." : "Pattern interrupt at " + sec(obs.interruptMs) + "."
        items.append(makeItem(list, .patternInterrupt, interruptOk ? 10 : 0, interruptReason, "Add a cut or a zoom in the first 1.5 seconds.", obs.interruptMs))

        // 6. A proven hook type.
        let provenFull: Bool = obs.hookTypeKnown && obs.hookTypeAboveMedian
        items.append(makeItem(
            list,
            .provenHookType,
            grade(provenFull, obs.hookTypeKnown, 10),
            obs.hookTypeKnown ? "Library hook type." : "Not a library hook type.",
            "Try a confession, curiosity-gap or specific-number opening."
        ))

        // 7. Speech within 1 s (half within 2 s).
        let speechFull: Bool = obs.speechMs != nil && (obs.speechMs ?? Int.max) <= 1_000
        let speechHalf: Bool = obs.speechMs != nil && (obs.speechMs ?? Int.max) <= 2_000
        let speechReason: String = obs.speechMs == nil ? "No speech found." : "Speech starts at " + sec(obs.speechMs) + "."
        items.append(makeItem(list, .speechStartsFast, grade(speechFull, speechHalf, 10), speechReason, "Cut the dead air before your first word.", obs.speechMs))

        // 8. Captions inside the safe zones.
        items.append(makeItem(
            list,
            .captionsSafeZone,
            obs.captionsInSafeZone ? 5 : 0,
            obs.captionsInSafeZone ? "Captions inside the safe zones." : "Captions outside the safe zones.",
            "Move captions above the platform UI."
        ))
        return finish(items)
    }

    /// On-screen text and voice count as the same hook above this share of overlapping content words.
    static let hookTextParityMin: Double = 0.6
    /// Motion at or above this counts as a pattern interrupt even without a hard cut.
    static let motionInterruptMin: Double = 0.35

    /// Turns raw features into the observations the checklist reads.
    static func observations(from f: HookFeatures) -> HookObservations {
        var parity: Double = 0
        if let shown = f.onscreenText {
            parity = TextTools.textParity(spoken: f.hookText, onscreen: shown)
        }
        let motionAt: Int? = (f.motionScore ?? 0) >= motionInterruptMin ? 500 : nil
        var interrupts: [Int] = []
        if let cut = f.firstCutMs {
            interrupts.append(cut)
        }
        if let motion = motionAt {
            interrupts.append(motion)
        }
        let rates: [Double] = Array(f.hookTypeTrialRates.values)
        var own: Double? = nil
        if let type = f.hookType {
            own = f.hookTypeTrialRates[type]
        }
        var aboveMedian: Bool = false
        if let value = own, !rates.isEmpty {
            aboveMedian = value > MoneyMath.median(rates)
        }
        let trimmed: String = f.hookText.trimmingCharacters(in: .whitespacesAndNewlines)
        return HookObservations(
            landsMs: trimmed.isEmpty ? nil : f.hookEndMs,
            onscreenMs: f.onscreenMs,
            spokenMatchesOnscreen: parity >= hookTextParityMin,
            faceMs: f.faceMs,
            faceless: f.faceless,
            appMs: f.appMs,
            interruptMs: interrupts.min(),
            hookTypeKnown: f.hookType != nil,
            hookTypeAboveMedian: aboveMedian,
            speechMs: f.speechStartMs,
            captionsInSafeZone: f.captionsInSafeZone
        )
    }

    /// Plain-English advice about the hook line itself: its length in words and seconds.
    static func hookLengthAdvice(hookText: String, hookStartMs: Int, hookEndMs: Int) -> (words: Int, seconds: Double, advice: String?) {
        let words: Int = TextTools.wordCount(hookText)
        let seconds: Double = Swift.max(0, Double(hookEndMs - hookStartMs) / 1_000)
        if words > 14 || seconds > 3 {
            let advice: String = "Your hook is " + String(words) + " words and runs " + Fmt.decimal(seconds) + "s. Trim it to one short line (under 12 words) so it lands by 2 seconds."
            return (words, seconds, advice)
        }
        if words > 0 && words < 3 {
            return (words, seconds, "Your hook is very short. Add the specific thing that makes someone stay.")
        }
        return (words, seconds, nil)
    }

    /// Scores a hook from raw features: the checklist, plus advice about length.
    static func scoreHookFeatures(_ f: HookFeatures) -> HookFeatureResult {
        let obs: HookObservations = observations(from: f)
        let length: (words: Int, seconds: Double, advice: String?) = hookLengthAdvice(hookText: f.hookText, hookStartMs: f.hookStartMs, hookEndMs: f.hookEndMs)
        var advice: [String] = []
        if let text = length.advice {
            advice.append(text)
        }
        return HookFeatureResult(card: scoreHook(obs), observations: obs, words: length.words, advice: advice)
    }

    // MARK: Flow Score

    /// Flow Score (overall predicted performance band), 0 to 100, weights 30/25/10/10/5/5/5/5/5. A missing disclosure also blocks settlement,
    /// which auto-QA enforces, not this score.
    static func scoreFlow(_ obs: FlowObservations) -> ScoredCard {
        let list: [ChecklistSpec] = FlowdConstants.Scores.flowChecklist
        var items: [ScoredItem] = []
        let beats: Int = obs.beatsRequired > 0 ? MoneyMath.roundHalfUp(Double(25 * obs.beatsFound) / Double(obs.beatsRequired)) : 25
        let disclosure: Int = (obs.disclosureAudio ? 5 : 0) + (obs.disclosureOnscreen ? 5 : 0)
        let d: Double = obs.durationS

        items.append(makeItem(
            list,
            .hookScore,
            MoneyMath.roundHalfUp(Double(obs.hookPoints) * 0.3),
            "Hook Score " + String(obs.hookPoints) + " scaled to 30.",
            "Fix the Hook Score items first."
        ))
        items.append(makeItem(
            list,
            .requiredBeats,
            beats,
            String(obs.beatsFound) + " of " + String(obs.beatsRequired) + " required beats found.",
            "Add the missing beat from the shot checklist."
        ))
        let appFull: Bool = obs.appMs != nil && (obs.appMs ?? Int.max) <= 3_000
        let appHalf: Bool = obs.appMs != nil && (obs.appMs ?? Int.max) <= 8_000
        items.append(makeItem(
            list,
            .appVisibleEarly,
            grade(appFull, appHalf, 10),
            obs.appMs == nil ? "The app never appears." : "App on screen at " + sec(obs.appMs) + ".",
            "Show the app by 3 seconds.",
            obs.appMs
        ))
        var disclosureReason: String = "No #ad."
        if disclosure == 10 {
            disclosureReason = "#ad spoken and on screen."
        } else if disclosure == 5 {
            disclosureReason = "#ad is only " + (obs.disclosureAudio ? "spoken" : "on screen") + "."
        }
        items.append(makeItem(list, .disclosure, disclosure, disclosureReason, "Say and show #ad."))
        let lengthFull: Bool = d >= 15 && d <= 30
        let lengthHalf: Bool = (d >= 10 && d < 15) || (d > 30 && d <= 45)
        items.append(makeItem(list, .lengthOk, grade(lengthFull, lengthHalf, 5), "Length " + String(Int(d.rounded())) + "s.", "Aim for 15 to 30 seconds."))
        items.append(makeItem(
            list,
            .captionsSafeZone,
            obs.captionsInSafeZone ? 5 : 0,
            obs.captionsInSafeZone ? "Captions inside the safe zones." : "Captions outside the safe zones.",
            "Move captions above the platform UI."
        ))
        var ctaReason: String = "More than one CTA."
        if obs.singleCta {
            ctaReason = obs.endsOnWinState ? "One CTA, ends on a win." : "One CTA but no win state at the end."
        }
        items.append(makeItem(
            list,
            .singleCtaWinState,
            grade(obs.singleCta && obs.endsOnWinState, obs.singleCta || obs.endsOnWinState, 5),
            ctaReason,
            "End on the win, then one CTA."
        ))
        items.append(makeItem(
            list,
            .audioClear,
            grade(obs.audioGaps == 0, obs.audioGaps == 1, 5),
            obs.audioGaps == 0 ? "Clear audio." : String(obs.audioGaps) + " dead-air gap(s) over 1s.",
            "Cut the silences."
        ))
        items.append(makeItem(
            list,
            .formatFit,
            grade(obs.formatOrder == .inOrder, obs.formatOrder == .oneOff, 5),
            obs.formatOrder == .inOrder ? "Follows the format." : "Beats are out of order for the format.",
            "Re-order to the format's beats."
        ))
        return finish(items)
    }

    // MARK: One-tap fixes

    /// Where fixes aim: the hook lands at 1.8 s, the app shows at 2.8 s, a cut at 1.0 s, speech at 0.6 s, text at 0.8 s, a face at 0.3 s.
    private static let targetLandsMs: Int = 1_800
    private static let targetAppMs: Int = 2_800
    private static let targetInterruptMs: Int = 1_000
    private static let targetSpeechMs: Int = 600
    private static let targetOnscreenMs: Int = 800
    private static let targetFaceMs: Int = 300

    /// Shifts every moment earlier by `trim` ms (nothing goes below 0).
    private static func shiftEarlier(_ obs: HookObservations, _ trim: Int) -> HookObservations {
        func shift(_ value: Int?) -> Int? {
            guard let value = value else {
                return nil
            }
            return Swift.max(0, value - trim)
        }
        var out: HookObservations = obs
        out.landsMs = shift(obs.landsMs)
        out.onscreenMs = shift(obs.onscreenMs)
        out.faceMs = shift(obs.faceMs)
        out.appMs = shift(obs.appMs)
        out.interruptMs = shift(obs.interruptMs)
        out.speechMs = shift(obs.speechMs)
        return out
    }

    /// Applies one hook fix to the observations and returns the edited copy.
    static func apply(_ kind: HookFixKind, to obs: HookObservations) -> HookObservations {
        var out: HookObservations = obs
        switch kind {
        case .addHookLine:
            out.landsMs = targetLandsMs
        case .trimIntro:
            if let lands = obs.landsMs {
                return shiftEarlier(obs, Swift.max(0, lands - targetLandsMs))
            }
        case .burnInHookText:
            out.onscreenMs = targetOnscreenMs
            out.spokenMatchesOnscreen = true
        case .startOnFace:
            out.faceMs = targetFaceMs
        case .moveAppReveal:
            out.appMs = Swift.min(obs.appMs ?? targetAppMs, targetAppMs)
        case .addCut:
            out.interruptMs = targetInterruptMs
        case .useProvenHook:
            out.hookTypeKnown = true
            out.hookTypeAboveMedian = true
        case .cutDeadAir:
            out.speechMs = targetSpeechMs
        case .moveCaptions:
            out.captionsInSafeZone = true
        }
        return out
    }

    private static func mmss(_ ms: Int) -> String {
        return "0:" + FlowdCalendar.pad(Int((Double(ms) / 1_000).rounded()), 2)
    }

    /// The fix a failed Hook Score item points at, with its button text. Nil for an item that is already full.
    private static func hookFix(for item: ScoredItem, _ obs: HookObservations) -> (kind: HookFixKind, label: String, detail: String)? {
        if item.points >= item.max {
            return nil
        }
        switch item.id {
        case .hookLands2s:
            if let lands = obs.landsMs {
                let trimmed: String = Fmt.decimal(Double(lands - targetLandsMs) / 1_000)
                return (.trimIntro, "Trim " + trimmed + "s off the intro", "Cutting the lead-in moves the hook from " + sec(lands) + " to " + sec(targetLandsMs) + ".")
            }
            return (.addHookLine, "Add a hook line in the first 2 seconds", "Open with one short line that lands by 1.8s.")
        case .onscreenTextMatches:
            return (.burnInHookText, "Burn the hook in as text", "Show the words you say as on-screen text within the first second.")
        case .faceEarly:
            return (.startOnFace, "Start on your face", "Open with your face in frame, then cut to the app.")
        case .appVisible3s:
            return (.moveAppReveal, "Move the app reveal to " + mmss(targetAppMs), "The app appears at " + sec(obs.appMs) + ". Show it by 3 seconds, then come back to your face.")
        case .patternInterrupt:
            return (.addCut, "Add a cut or zoom at 1 second", "A cut or zoom in the first 1.5 seconds resets attention.")
        case .provenHookType:
            return (.useProvenHook, "Use a proven hook type", "Try a confession, curiosity-gap or specific-number opening.")
        case .speechStartsFast:
            return (.cutDeadAir, "Cut the dead air before your first word", "Speech starts at " + sec(obs.speechMs) + ". Start talking within 1 second.")
        case .captionsSafeZone:
            return (.moveCaptions, "Move captions into the safe zone", "Keep captions above the platform buttons and caption area.")
        default:
            return nil
        }
    }

    /// One-tap fixes for a Hook Score, best first. Each fix is a deterministic edit; its gain is measured by applying it and re-scoring, so the band
    /// chip can update after a tap.
    static func suggestHookFixes(_ obs: HookObservations) -> [ScoreFix] {
        let card: ScoredCard = scoreHook(obs)
        var fixes: [ScoreFix] = []
        for item in card.items {
            guard let fix = hookFix(for: item, obs) else {
                continue
            }
            let gain: Int = scoreHook(apply(fix.kind, to: obs)).points - card.points
            if gain > 0 {
                fixes.append(ScoreFix(id: fix.kind.rawValue, itemId: item.id, label: fix.label, detail: fix.detail, gainPoints: gain))
            }
        }
        return fixes.sorted { (a: ScoreFix, b: ScoreFix) -> Bool in
            if a.gainPoints != b.gainPoints {
                return a.gainPoints > b.gainPoints
            }
            return a.id < b.id
        }
    }

    /// Applies every suggested hook fix in order: the best the video could score from these edits.
    static func applyAllHookFixes(_ obs: HookObservations) -> HookObservations {
        var current: HookObservations = obs
        for fix in suggestHookFixes(obs) {
            if let kind = HookFixKind(rawValue: fix.id) {
                current = apply(kind, to: current)
            }
        }
        return current
    }

    /// Applies one Flow fix to the observations.
    static func apply(_ kind: FlowFixKind, to obs: FlowObservations) -> FlowObservations {
        var out: FlowObservations = obs
        switch kind {
        case .fixHookFirst:
            break
        case .addMissingBeat:
            out.beatsFound = obs.beatsRequired
        case .showAppEarly:
            out.appMs = Swift.min(obs.appMs ?? targetAppMs, targetAppMs)
        case .addDisclosure:
            out.disclosureAudio = true
            out.disclosureOnscreen = true
        case .trimLength:
            out.durationS = Swift.min(obs.durationS, 28)
        case .extendLength:
            out.durationS = Swift.max(obs.durationS, 16)
        case .moveCaptions:
            out.captionsInSafeZone = true
        case .oneCtaWinState:
            out.singleCta = true
            out.endsOnWinState = true
        case .cutSilences:
            out.audioGaps = 0
        case .reorderBeats:
            out.formatOrder = .inOrder
        }
        return out
    }

    private static func flowFix(for item: ScoredItem, _ obs: FlowObservations) -> (kind: FlowFixKind, label: String, detail: String)? {
        if item.points >= item.max {
            return nil
        }
        switch item.id {
        case .hookScore:
            return (.fixHookFirst, "Fix the Hook Score items first", "The hook is 30 of the 100 points. Apply the hook fixes to move this.")
        case .requiredBeats:
            return (.addMissingBeat, "Add the missing beat", String(obs.beatsRequired - obs.beatsFound) + " required beat(s) are missing. Add them from the shot checklist.")
        case .appVisibleEarly:
            return (.showAppEarly, "Show the app by 3 seconds", "The app appears at " + sec(obs.appMs) + ".")
        case .disclosure:
            return (.addDisclosure, "Say and show #ad", "Say it out loud and keep #ad on screen for 2 seconds. A missing disclosure also blocks payment.")
        case .lengthOk:
            let seconds: String = String(Int(obs.durationS.rounded()))
            if obs.durationS > 30 {
                return (.trimLength, "Trim to 28 seconds", "The video is " + seconds + "s. 15 to 30 seconds scores best.")
            }
            return (.extendLength, "Add a shot to reach 15 seconds", "The video is " + seconds + "s. 15 to 30 seconds scores best.")
        case .captionsSafeZone:
            return (.moveCaptions, "Move captions into the safe zone", "Keep captions above the platform UI.")
        case .singleCtaWinState:
            return (.oneCtaWinState, "End on the win, then one CTA", "Finish on the moment the app delivered, then ask for one thing.")
        case .audioClear:
            return (.cutSilences, "Cut the silences", String(obs.audioGaps) + " pause(s) over 1 second. One tap removes them.")
        case .formatFit:
            return (.reorderBeats, "Re-order to the format's beats", "Follow the beat order of the format you picked.")
        default:
            return nil
        }
    }

    /// One-tap fixes for a Flow Score, best first. The hook fix is measured by applying all hook fixes (pass `hookObs`).
    static func suggestFlowFixes(_ obs: FlowObservations, hookObs: HookObservations? = nil) -> [ScoreFix] {
        let card: ScoredCard = scoreFlow(obs)
        var fixes: [ScoreFix] = []
        for item in card.items {
            guard let fix = flowFix(for: item, obs) else {
                continue
            }
            let gain: Int
            if fix.kind == .fixHookFirst {
                guard let hook = hookObs else {
                    continue
                }
                var better: FlowObservations = obs
                better.hookPoints = scoreHook(applyAllHookFixes(hook)).points
                gain = scoreFlow(better).points - card.points
            } else {
                gain = scoreFlow(apply(fix.kind, to: obs)).points - card.points
            }
            if gain > 0 {
                fixes.append(ScoreFix(id: fix.kind.rawValue, itemId: item.id, label: fix.label, detail: fix.detail, gainPoints: gain))
            }
        }
        return fixes.sorted { (a: ScoreFix, b: ScoreFix) -> Bool in
            if a.gainPoints != b.gainPoints {
                return a.gainPoints > b.gainPoints
            }
            return a.id < b.id
        }
    }

    /// The reasons to show in the UI: what is working and what to fix first (largest points lost first).
    static func explain(_ card: ScoredCard) -> ScoreExplanation {
        let strengths: [ScoredItem] = card.items.filter { (item: ScoredItem) -> Bool in
            return item.passed
        }
        let fixFirst: [ScoredItem] = card.items.filter { (item: ScoredItem) -> Bool in
            return !item.passed
        }.sorted { (a: ScoredItem, b: ScoredItem) -> Bool in
            if a.pointsLost != b.pointsLost {
                return a.pointsLost > b.pointsLost
            }
            return a.max > b.max
        }
        let next: (next: ScoreBand?, needed: Int) = pointsToNextBand(card.points)
        var headline: String = card.band.descriptor + " (" + card.band.letter + ")."
        if let target = next.next {
            let article: String = (target == .a || target == .e) ? "an" : "a"
            headline = card.band.descriptor + " (" + card.band.letter + "). " + String(next.needed) + " more point" + (next.needed == 1 ? "" : "s") + " to " + article + " " + target.letter + "."
        }
        return ScoreExplanation(headline: headline, strengths: strengths, fixFirst: fixFirst)
    }

    // MARK: From a video analysis

    /// Every overlay must be safe, and there must be some.
    private static func captionsSafe(_ texts: [OnScreenText]) -> Bool {
        return !texts.isEmpty && texts.allSatisfy { (t: OnScreenText) -> Bool in
            return t.inSafeZone
        }
    }

    /// Hook observations from a stored video analysis. `faceless` comes from the chosen format; `hookTrialRates` (trial rate per hook type from the
    /// library) decides "above median".
    static func hookObservations(from analysis: VideoAnalysis, faceless: Bool = false, hookTrialRates: [HookType: Double] = [:]) -> HookObservations {
        let scenes: [SceneCut] = analysis.scenes.sorted { (a: SceneCut, b: SceneCut) -> Bool in
            return a.tStartMs < b.tStartMs
        }
        let firstCut: Int? = scenes.count > 1 ? scenes[1].tStartMs : nil
        let firstText: Int? = analysis.onScreenText.map { (t: OnScreenText) -> Int in
            return t.tStartMs
        }.min()
        let rates: [Double] = Array(hookTrialRates.values)
        let own: Double? = hookTrialRates[analysis.hook.hookType]
        var aboveMedian: Bool = false
        if let value = own, !rates.isEmpty {
            aboveMedian = value > MoneyMath.median(rates)
        }
        let firstSpeech: Int? = analysis.transcript.map { (t: TranscriptSegment) -> Int in
            return t.tStartMs
        }.min()
        return HookObservations(
            landsMs: analysis.hook.landsAtMs,
            onscreenMs: analysis.hook.captionAtMs ?? firstText,
            spokenMatchesOnscreen: analysis.hook.spokenMatchesOnscreen,
            faceMs: analysis.hook.faceAtMs,
            faceless: faceless,
            appMs: analysis.hook.appAtMs,
            interruptMs: firstCut,
            hookTypeKnown: true,
            hookTypeAboveMedian: aboveMedian,
            speechMs: firstSpeech,
            captionsInSafeZone: captionsSafe(analysis.onScreenText)
        )
    }

    /// How well the found beats follow the format's order: in order, one beat out of place, or out of order.
    static func formatOrder(formatBeats: [BeatId], hits: [BeatHit]) -> FormatOrder {
        let found: [BeatHit] = hits.filter { (h: BeatHit) -> Bool in
            return h.found && h.tMs != nil
        }.sorted { (a: BeatHit, b: BeatHit) -> Bool in
            return (a.tMs ?? 0) < (b.tMs ?? 0)
        }
        var ranks: [Int] = []
        for hit in found {
            if let index = formatBeats.firstIndex(of: hit.beat) {
                ranks.append(index)
            }
        }
        if ranks.count <= 1 {
            return .inOrder
        }
        // Longest strictly increasing subsequence: how many beats are in the right order.
        var tails: [Int] = []
        for rank in ranks {
            var lo: Int = 0
            var hi: Int = tails.count
            while lo < hi {
                let mid: Int = (lo + hi) / 2
                if tails[mid] < rank {
                    lo = mid + 1
                } else {
                    hi = mid
                }
            }
            if lo == tails.count {
                tails.append(rank)
            } else {
                tails[lo] = rank
            }
        }
        let outOfPlace: Int = ranks.count - tails.count
        if outOfPlace == 0 {
            return .inOrder
        }
        return outOfPlace == 1 ? .oneOff : .outOfOrder
    }

    /// True when a video ends on a win state: the win-state or payoff beat is found in the last 40% of the video.
    static func endsOnWinState(hits: [BeatHit], durationMs: Int) -> Bool {
        return hits.contains(where: { (h: BeatHit) -> Bool in
            guard (h.beat == .winState || h.beat == .payoff) && h.found, let t = h.tMs else {
                return false
            }
            return Double(t) >= Double(durationMs) * 0.6
        })
    }

    /// Flow observations from a stored video analysis. Disclosure is read from the transcript and on-screen text (the same detectors auto-QA uses),
    /// the CTA count from the spoken ending, dead air from transcript gaps, and format fit from the format's beat order.
    static func flowObservations(from analysis: VideoAnalysis, hookPoints: Int, formatBeats: [BeatId]? = nil) -> FlowObservations {
        let required: [BeatHit] = analysis.beats.filter { (b: BeatHit) -> Bool in
            return b.required
        }
        let endText: String = analysis.transcript.filter { (t: TranscriptSegment) -> Bool in
            return Double(t.tStartMs) >= Double(analysis.durationMs) * 0.7
        }.map { (t: TranscriptSegment) -> String in
            return t.text
        }.joined(separator: " ")
        let ctas: [TextTools.CtaObjective] = TextTools.callsToAction(endText)
        var appMs: Int? = analysis.hook.appAtMs
        if appMs == nil {
            appMs = analysis.beats.first(where: { (b: BeatHit) -> Bool in
                return b.beat == .appReveal && b.found
            })?.tMs
        }
        let order: FormatOrder
        if let beats = formatBeats {
            order = formatOrder(formatBeats: beats, hits: analysis.beats)
        } else {
            order = .inOrder
        }
        return FlowObservations(
            hookPoints: hookPoints,
            beatsFound: required.filter { (b: BeatHit) -> Bool in return b.found }.count,
            beatsRequired: required.count,
            appMs: appMs,
            disclosureAudio: QAEngine.findSpokenDisclosure(analysis.transcript) != nil,
            disclosureOnscreen: QAEngine.findWrittenDisclosure(analysis.onScreenText) != nil,
            durationS: Double(analysis.durationMs) / 1_000,
            captionsInSafeZone: captionsSafe(analysis.onScreenText),
            singleCta: ctas.count == 1,
            endsOnWinState: endsOnWinState(hits: analysis.beats, durationMs: analysis.durationMs),
            audioGaps: QAEngine.deadAirGaps(analysis.transcript).count,
            formatOrder: order
        )
    }

    /// Hook Score and Flow Score for a stored analysis in one call.
    static func scoreAnalysis(_ analysis: VideoAnalysis, faceless: Bool = false, hookTrialRates: [HookType: Double] = [:], formatBeats: [BeatId]? = nil)
        -> (hook: ScoredCard, flow: ScoredCard, hookObservations: HookObservations, flowObservations: FlowObservations) {
        let hookObs: HookObservations = hookObservations(from: analysis, faceless: faceless, hookTrialRates: hookTrialRates)
        let hook: ScoredCard = scoreHook(hookObs)
        let flowObs: FlowObservations = flowObservations(from: analysis, hookPoints: hook.points, formatBeats: formatBeats)
        return (hook, scoreFlow(flowObs), hookObs, flowObs)
    }
}
