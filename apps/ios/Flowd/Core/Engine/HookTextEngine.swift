import Foundation

// Text-only Hook Score: the free Hook Score tool, the Studio hook picker and tournament entries. Paste the first line of a video and get a band,
// reasons and rewrites. Mirrors apps/web/src/lib/engine/hooktext.ts.
//
// It scores the words only (no video) against the hook patterns that win for app ads (confession, curiosity gap, specific number, POV, direct
// question, risk reversal, pattern interrupt), specificity, and the 2-second rule: a hook has to land in about two seconds of speech, which is roughly
// six words at an energetic 3 words per second. It is a checklist score, labelled that way, and it never promises results.

enum HookTextItemId: String, Codable, Hashable, Sendable {
    case pattern
    case twoSecondRule = "two_second_rule"
    case specificity
    case personal
    case openLoop = "open_loop"
    case noFillerOpening = "no_filler_opening"
    case safeClaims = "safe_claims"
}

struct HookTextItem: Codable, Hashable, Identifiable, Sendable {
    var id: HookTextItemId
    var label: String
    var points: Int
    var max: Int
    var passed: Bool
    var reason: String
    var fix: String?

    var pointsLost: Int {
        return self.max - points
    }
}

struct TwoSecondRule: Codable, Hashable, Sendable {
    /// The sentence that was timed.
    var sentence: String
    var words: Int
    /// Estimated speaking time at 3 words per second.
    var estSeconds: Double
    /// At most 2.0 s.
    var passes: Bool
    /// Words that fit in 2 seconds.
    var targetWords: Int
}

struct HookTextResult: Codable, Hashable, Sendable {
    /// 0 to 100.
    var score: Int
    var band: ScoreBand
    /// Always "Checklist score. It gets smarter as bounties settle."
    var label: String
    var items: [HookTextItem]
    /// Every library pattern found.
    var patterns: [HookType]
    /// The strongest pattern, or nil.
    var primaryPattern: HookType?
    var rule: TwoSecondRule
    /// Words in the whole hook.
    var words: Int
    /// Things worth a warning that are not about score: hype claims.
    var flags: [String]
    /// True when a risky claim (guaranteed, passive income, a cure) capped the score at a D: such a hook cannot be approved.
    var capped: Bool
    /// Fixes for lost points, biggest first.
    var suggestions: [String]
}

/// The slots a hook template can carry. Missing slots fall back to neutral words so a template always reads.
struct HookSlots: Hashable, Sendable {
    var app: String
    /// The app's category in plain words, e.g. "photo editing".
    var category: String
    var feature: String
    /// What the viewer wants, e.g. "editing photos".
    var goal: String
    var number: String

    init(app: String = "this app", category: String = "photo editing", feature: String = "one feature", goal: String = "editing photos", number: String = "7") {
        self.app = app
        self.category = category
        self.feature = feature
        self.goal = goal
        self.number = number
    }
}

struct HookRewrite: Codable, Hashable, Identifiable, Sendable {
    var text: String
    var pattern: HookType
    var score: Int
    var band: ScoreBand

    var id: String {
        return text
    }
}

enum HookTextEngine {
    /// Energetic UGC speech: about 180 words a minute.
    static let wordsPerSecond: Double = 3
    /// The 2-second rule.
    static let hookTargetSeconds: Double = 2
    /// A hook with a risky claim never scores above this (the top of a D).
    static let maxScoreWithRiskyClaim: Int = 54

    // MARK: The library

    /// Fill-in hooks by type, in library order. First sentences are kept short on purpose: the 2-second rule reads the first sentence.
    static let library: [(type: HookType, templates: [String])] = [
        (.confession, [
            "I was wrong about {category} apps.",
            "I didn't expect {app} to work this well.",
            "Okay, I owe {app} an apology.",
            "I deleted every other {category} app.",
            "I never thought I'd say this about {app}."
        ]),
        (.curiosityGap, [
            "Wait until you see what {app} did.",
            "Nobody told me {app} could do this.",
            "Here's what happened after one week.",
            "I found the one {feature} nobody talks about.",
            "This is why my {goal} changed."
        ]),
        (.specificNumber, [
            "{number} minutes a day. Here's what changed.",
            "{number} days with {app}. Here's the result.",
            "{number} {category} apps tested. One won.",
            "I spent {number} days on {app}.",
            "{number} seconds. That's all {app} needs."
        ]),
        (.pov, [
            "POV: you found the one {category} app.",
            "POV: {goal} takes {number} minutes now.",
            "POV: you stopped paying for {category} apps.",
            "When {app} just does it for you."
        ]),
        (.directQuestion, [
            "Why is nobody talking about {app}?",
            "Still doing {goal} by hand?",
            "What if {goal} took {number} minutes?",
            "Why does {app} feel illegal to use?"
        ]),
        (.riskReversal, [
            "Try {app} free. No card needed.",
            "{app} is free for {number} days.",
            "I didn't pay a cent for week one.",
            "Free for {number} days. No catch."
        ]),
        (.patternInterrupt, [
            "Wait, {app} did that?",
            "Stop scrolling. This saves {goal}.",
            "Hold on. Watch this.",
            "No way {app} is this fast."
        ])
    ]

    /// Fills a template's {slots}. Missing slots use neutral defaults.
    static func fillHook(_ template: String, slots: HookSlots = HookSlots()) -> String {
        var text: String = template
        text = text.replacingOccurrences(of: "{app}", with: slots.app)
        text = text.replacingOccurrences(of: "{category}", with: slots.category)
        text = text.replacingOccurrences(of: "{feature}", with: slots.feature)
        text = text.replacingOccurrences(of: "{goal}", with: slots.goal)
        text = text.replacingOccurrences(of: "{number}", with: slots.number)
        return text
    }

    // MARK: Detection

    private static let patternRules: [(type: HookType, rules: [String])] = [
        (.confession, [
            #"\bi (?:was|am) (?:so )?wrong\b"#,
            #"\bi (?:didn'?t|did not) (?:expect|think|believe|know|see)\b"#,
            #"\bconfession\b"#,
            #"\bi (?:have to|need to|got to|gotta) admit\b"#,
            #"\bi (?:finally )?admit\b"#,
            #"\bi owe\b"#,
            #"\bi (?:never thought|can'?t believe|used to hate|used to think)\b"#,
            #"\bunpopular opinion\b"#,
            #"\bi deleted\b"#,
            #"\bi lied\b"#
        ]),
        (.curiosityGap, [
            #"\bwait until you see\b"#,
            #"\bwait for it\b"#,
            #"\byou won'?t believe\b"#,
            #"\bhere'?s (?:what|why|how|the)\b"#,
            #"\bwhat (?:happened|this app did|it did|\w+ did)\b"#,
            #"\bthe (?:one|only) (?:thing|trick|feature|hack|setting)\b"#,
            #"\b(?:nobody|no one) (?:tells|told|talks|is talking|knows|knew)\b"#,
            #"\bsecret\b"#,
            #"\bturns? out\b"#,
            #"\bthis is why\b"#,
            #"\bwhat they don'?t tell you\b"#,
            #"\bthe catch\b"#,
            #"\.\.\.$"#
        ]),
        (.specificNumber, [
            #"\$\s?\d"#,
            #"\b\d+(?:[.,]\d+)?\s*(?:%|x|k\b|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|hours?|dollars?|bucks|photos?|steps?|ways?|reasons?|tips?|apps?|things?|features?|times?)"#,
            #"\b(?:one|two|three|four|five|six|seven|ten|twelve|thirty) (?:minutes?|seconds?|days?|weeks?|ways?|things?|steps?|apps?)\b"#
        ]),
        (.pov, [
            #"^pov\b"#,
            #"\bpov:"#,
            #"^when you\b"#,
            #"^when (?:\w+ ){0,2}just\b"#,
            #"\bthat moment when\b"#,
            #"^me (?:when|after|trying)\b"#
        ]),
        (.directQuestion, [
            #"\?"#,
            #"^(?:why|how|what|who|which|do you|did you|have you|are you|is it|is there|can you|could you|ever wonder|still)\b"#
        ]),
        (.riskReversal, [
            #"\bfree\b"#,
            #"\bno (?:card|credit card|payment|catch|risk|subscription|strings)\b"#,
            #"\bcancel anytime\b"#,
            #"\b(?:didn'?t|did not|never) pay\b"#,
            #"\bwithout paying\b"#,
            #"\bmoney[- ]back\b"#,
            #"\bnothing to lose\b"#
        ]),
        (.patternInterrupt, [
            #"^(?:wait|stop|hold on|no way|listen|okay stop|ok stop|um what|excuse me|did that just|oh my)\b"#,
            #"^\.\.\."#
        ])
    ]

    /// Every library pattern the hook uses. Order follows the library order, not strength.
    static func detectPatterns(_ text: String) -> [HookType] {
        let t: String = TextTools.normalize(text)
        var out: [HookType] = []
        for entry in patternRules {
            if Rx.testAny(entry.rules, in: t) {
                out.append(entry.type)
            }
        }
        return out
    }

    private static let fillerOpeners: [String] = [
        #"^(?:hey|hi|hello|yo|what'?s up|sup)\b(?:[ ,]+(?:guys|everyone|everybody|friends|y'?all|there|team|fam))?"#,
        #"^(?:so,? )?(?:today|in this video|in today'?s video|welcome|welcome back)\b"#,
        #"^(?:so,? )?(?:i'?m going to|i am going to|let me|i want to|i wanted to|i'?m here to) (?:show|tell|talk|share|introduce)\b"#,
        #"^(?:so basically|okay so|ok so|um|uh)\b"#
    ]

    private static let vagueHype: String = #"\b(?:amazing|incredible|unbelievable|game[- ]changer|game changing|best ever|best app ever|life[- ]changing|must[- ]have|mind[- ]blowing|revolutionary|insane app|literally the best|so good)\b"#

    private static let riskyClaims: [String] = [
        #"\bguarantee(?:d|s)?\b"#,
        #"\bget rich\b"#,
        #"\bpassive income\b"#,
        #"\bquit your (?:job|9[- ]?5)\b"#,
        #"\b(?:make|earn|made|earned)\s+\$?\d[\d,]*(?:k)?\s*(?:a|per|every|\/)\s*(?:day|week|month|hour)\b"#,
        #"\bcures?\b"#,
        #"\blose\s+\d+\s*(?:lbs?|pounds|kg)\b"#,
        #"\b100%\s*(?:safe|effective|accurate|guaranteed|free)\b"#
    ]

    private static let specificityUnits: String = #"(?:\$\s?\d|\b\d+(?:[.,]\d+)?\s*(?:%|x|k\b|minutes?|mins?|seconds?|days?|weeks?|months?|hours?|photos?|steps?|ways?|apps?|times?|dollars?))"#

    /// The first sentence: what the 2-second rule reads. Only . ? ! and an ellipsis end it, so "POV: you finally..." and commas do not.
    static func firstSentence(_ text: String) -> String {
        let collapsed: String = Rx.replace(#"\s+"#, in: text.trimmingCharacters(in: .whitespacesAndNewlines), with: " ")
        if let sentence = Rx.firstGroup(#"^(.*?[.?!…])(?:\s|$)"#, in: collapsed) {
            return sentence.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return collapsed.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The 2-second rule: does the first sentence land in about two seconds of speech?
    static func twoSecondRule(_ text: String) -> TwoSecondRule {
        let sentence: String = firstSentence(text)
        let words: Int = TextTools.wordCount(sentence)
        let estimate: Double = Double(words) / wordsPerSecond
        return TwoSecondRule(
            sentence: sentence,
            words: words,
            estSeconds: (estimate * 10).rounded() / 10,
            passes: words > 0 && estimate <= hookTargetSeconds + 1e-9,
            targetWords: Int((hookTargetSeconds * wordsPerSecond).rounded(.down))
        )
    }

    // MARK: Scoring

    /// Strongest first, for choosing the primary pattern. Library hooks that name a proven pattern beat a bare interrupt.
    private static let patternStrength: [HookType] = [.confession, .curiosityGap, .specificNumber, .riskReversal, .pov, .directQuestion, .patternInterrupt]

    private static func timePoints(_ words: Int) -> Int {
        let t: Double = Double(words) / wordsPerSecond
        if t <= 2.0 + 1e-9 {
            return 25
        }
        if t <= 2.5 + 1e-9 {
            return 19
        }
        if t <= 3.0 + 1e-9 {
            return 12
        }
        if t <= 4.0 + 1e-9 {
            return 6
        }
        return 0
    }

    private static func item(_ id: HookTextItemId, _ label: String, _ maxPoints: Int, _ points: Double, _ reason: String, _ fix: String? = nil) -> HookTextItem {
        let p: Int = MoneyMath.clamp(MoneyMath.roundHalfUp(points), 0, maxPoints)
        let passed: Bool = p == maxPoints
        return HookTextItem(id: id, label: label, points: p, max: maxPoints, passed: passed, reason: reason, fix: passed ? nil : fix)
    }

    private static func label(_ type: HookType) -> String {
        return type.rawValue.replacingOccurrences(of: "_", with: " ")
    }

    /// Scores the text of a hook. Weights (sum 100): proven pattern 25, lands in 2 seconds 25, specific 15, personal 10, open loop 10, no filler
    /// opening 10, safe claims 5. Pure and deterministic. An empty hook scores 0 with an E and one suggestion.
    static func scoreText(_ text: String) -> HookTextResult {
        let patterns: [HookType] = detectPatterns(text)
        let t: String = TextTools.normalize(text)
        let rule: TwoSecondRule = twoSecondRule(text)
        let words: Int = TextTools.wordCount(text)
        var flags: [String] = []
        var items: [HookTextItem] = []

        if words == 0 {
            let none: String = "There is no hook yet."
            items.append(item(.pattern, "Uses a proven hook pattern", 25, 0, none, "Write one line: a confession, a curiosity gap, a number, a POV, a question or a risk reversal."))
            items.append(item(.twoSecondRule, "Lands inside 2 seconds", 25, 0, none))
            items.append(item(.specificity, "Specific, not vague", 15, 0, none))
            items.append(item(.personal, "Sounds like a person", 10, 0, none))
            items.append(item(.openLoop, "Makes you want the next line", 10, 0, none))
            items.append(item(.noFillerOpening, "Starts with the point", 10, 0, none))
            items.append(item(.safeClaims, "No risky claims", 5, 5, "Nothing to flag."))
            return HookTextResult(
                score: 0,
                band: .e,
                label: FlowdConstants.checklistLabel,
                items: items,
                patterns: [],
                primaryPattern: nil,
                rule: rule,
                words: 0,
                flags: flags,
                capped: false,
                suggestions: ["Write the first line of your video, then score it."]
            )
        }

        // 1. pattern
        let strong: [HookType] = patterns.filter { (p: HookType) -> Bool in
            return p != .patternInterrupt
        }
        let primary: HookType? = patternStrength.first(where: { (p: HookType) -> Bool in
            return patterns.contains(p)
        })
        var patternReason: String = "No proven pattern found."
        if !strong.isEmpty {
            patternReason = "Pattern: " + strong.map { (p: HookType) -> String in return label(p) }.joined(separator: ", ") + "."
        } else if !patterns.isEmpty {
            patternReason = "Only an interrupt (\"Wait\", \"Stop\"). Pair it with a real pattern."
        }
        items.append(item(
            .pattern,
            "Uses a proven hook pattern",
            25,
            strong.isEmpty ? (patterns.isEmpty ? 0 : 15) : 25,
            patternReason,
            "Try a confession (\"I was wrong about...\"), a curiosity gap (\"Wait until you see...\"), a number or a question."
        ))

        // 2. two-second rule
        let secondsText: String = Fmt.decimal(rule.estSeconds)
        let ruleReason: String
        if rule.passes {
            ruleReason = "The first line is " + String(rule.words) + " words, about " + secondsText + "s. It lands in time."
        } else {
            ruleReason = "The first line is " + String(rule.words) + " words, about " + secondsText + "s. The target is " + String(Int(hookTargetSeconds)) + "s (about " + String(rule.targetWords) + " words)."
        }
        items.append(item(
            .twoSecondRule,
            "Lands inside 2 seconds",
            25,
            Double(timePoints(rule.words)),
            ruleReason,
            "Cut the first sentence to " + String(rule.targetWords) + " words or fewer, then add the detail after it."
        ))

        // 3. specificity
        let hasUnit: Bool = Rx.test(specificityUnits, in: t)
        let hasDigit: Bool = Rx.test(#"\d"#, in: t)
        let vague: Bool = Rx.test(vagueHype, in: t)
        let specPoints: Int = (hasUnit ? 9 : (hasDigit ? 5 : 0)) + (vague ? 0 : 6)
        var specReason: String = "No number or timeframe. Specific beats clever."
        if vague {
            specReason = "Vague hype words (\"amazing\", \"game changer\") say nothing. Name the result."
        } else if hasUnit {
            specReason = "A specific number or timeframe makes it believable."
        } else if hasDigit {
            specReason = "There is a number, but no unit."
        }
        items.append(item(.specificity, "Specific, not vague", 15, Double(specPoints), specReason, "Add a real number or timeframe: \"12 minutes a day\", \"30 days\", \"$0\"."))

        // 4. personal
        let tokens: [String] = TextTools.tokenize(text)
        let personalWords: Set<String> = ["i", "i'm", "i've", "my", "me", "you", "your", "you're", "pov"]
        let personal: Bool = tokens.contains(where: { (w: String) -> Bool in
            return personalWords.contains(w)
        })
        items.append(item(
            .personal,
            "Sounds like a person",
            10,
            personal ? 10 : 0,
            personal ? "It speaks to one person (I or you)." : "No I or you. It reads like an ad.",
            "Say \"I\" or \"you\": \"I tried...\", \"you finally...\"."
        ))

        // 5. open loop
        let loop: Bool = patterns.contains(.curiosityGap) || patterns.contains(.directQuestion)
        let softLoop: Bool = patterns.contains(.confession) || patterns.contains(.pov) || patterns.contains(.specificNumber)
        var loopReason: String = "Nothing makes the viewer wait for the next line."
        if loop {
            loopReason = "It opens a question the next line answers."
        } else if softLoop {
            loopReason = "It hints at a story, but does not open a gap."
        }
        items.append(item(
            .openLoop,
            "Makes you want the next line",
            10,
            loop ? 10 : (softLoop ? 6 : 0),
            loopReason,
            "Open a gap: \"Here's what happened...\", \"Wait until you see...\", or ask the question."
        ))

        // 6. filler opening
        let filler: Bool = Rx.testAny(fillerOpeners, in: t)
        items.append(item(
            .noFillerOpening,
            "Starts with the point",
            10,
            filler ? 0 : 10,
            filler ? "It opens with a greeting or \"today I will\". Those spend your first seconds on nothing." : "No wasted words at the start.",
            "Cut \"Hey guys\" and \"In this video\". Start on the claim."
        ))

        // 7. risky claims
        let risky: Bool = Rx.testAny(riskyClaims, in: t)
        if risky {
            flags.append("This hook makes a claim that earnings or health rules treat as risky (guaranteed, passive income, a cure). Say what you did, not what anyone will get.")
        }
        items.append(item(
            .safeClaims,
            "No risky claims",
            5,
            risky ? 0 : 5,
            risky ? "A guarantee or earnings or health claim." : "No risky claims.",
            "Say what you did, not what the viewer will get. Never promise income or results."
        ))

        let raw: Int = items.reduce(0) { (sum: Int, i: HookTextItem) -> Int in
            return sum + i.points
        }
        // A hook that promises earnings, a guarantee or a cure cannot be approved, so it never scores above a D.
        let score: Int = risky ? Swift.min(raw, maxScoreWithRiskyClaim) : raw
        let suggestions: [String] = items.filter { (i: HookTextItem) -> Bool in
            return !i.passed && i.fix != nil
        }.sorted { (a: HookTextItem, b: HookTextItem) -> Bool in
            return a.pointsLost > b.pointsLost
        }.compactMap { (i: HookTextItem) -> String? in
            return i.fix
        }
        return HookTextResult(
            score: score,
            band: ScoringEngine.band(for: score),
            label: FlowdConstants.checklistLabel,
            items: items,
            patterns: patterns,
            primaryPattern: primary,
            rule: rule,
            words: words,
            flags: flags,
            capped: risky && raw > score,
            suggestions: suggestions
        )
    }

    // MARK: Rewrites

    /// Rewrites for a hook: fills the library templates with the app's words and scores each, best first. Types already in the original are still
    /// offered (a stronger version of the same pattern is a fine suggestion). `limit` defaults to 5; at most one hook per template; deterministic.
    static func suggestRewrites(slots: HookSlots = HookSlots(), avoidTypes: [HookType] = [], limit: Int = 5) -> [HookRewrite] {
        var out: [HookRewrite] = []
        for entry in library {
            if avoidTypes.contains(entry.type) {
                continue
            }
            for template in entry.templates {
                let text: String = fillHook(template, slots: slots)
                let result: HookTextResult = scoreText(text)
                out.append(HookRewrite(text: text, pattern: entry.type, score: result.score, band: result.band))
            }
        }
        let sorted: [HookRewrite] = out.sorted { (a: HookRewrite, b: HookRewrite) -> Bool in
            if a.score != b.score {
                return a.score > b.score
            }
            return a.text < b.text
        }
        return Array(sorted.prefix(Swift.max(0, limit)))
    }
}
