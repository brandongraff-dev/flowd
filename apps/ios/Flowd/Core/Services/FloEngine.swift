import Foundation

// Flo, the in-app copilot. The product talks to an `AIProvider`; the day-one provider (`MockAIProvider`) is a deterministic, rules-based engine over the
// brief, the format's beats, the hook library and the checklist scores, so the whole Flo experience works offline and always gives the same answer to
// the same question. A live provider can replace it behind the same protocol without touching a screen.

/// What Flo knows when it answers.
struct FloContext: Hashable, Sendable {
    var creatorHandle: String
    var creatorNiches: [Niche]
    var bounty: Bounty?
    var brandName: String?
    var appName: String?
    var appFeatures: [String]
    var appCategory: AppCategory?
    var format: Format?
    var hooks: [Hook]
    /// A sentence about what the creator could do next (built by the API from real state), for the "next action" prompt.
    var nextActionHint: String?
    /// The creator's rate suggestion line, for rate advice.
    var rateAdviceHint: String?

    init(
        creatorHandle: String,
        creatorNiches: [Niche] = [],
        bounty: Bounty? = nil,
        brandName: String? = nil,
        appName: String? = nil,
        appFeatures: [String] = [],
        appCategory: AppCategory? = nil,
        format: Format? = nil,
        hooks: [Hook] = [],
        nextActionHint: String? = nil,
        rateAdviceHint: String? = nil
    ) {
        self.creatorHandle = creatorHandle
        self.creatorNiches = creatorNiches
        self.bounty = bounty
        self.brandName = brandName
        self.appName = appName
        self.appFeatures = appFeatures
        self.appCategory = appCategory
        self.format = format
        self.hooks = hooks
        self.nextActionHint = nextActionHint
        self.rateAdviceHint = rateAdviceHint
    }
}

/// What a provider returns: the suggestion text and the buttons under it.
struct FloOutput: Hashable, Sendable {
    var title: String
    var outputs: [String]
    var actions: [FloAction]
    var model: String
    var latencyMs: Int
}

protocol AIProvider: Sendable {
    func respond(to request: FloRequest, context: FloContext) async throws -> FloOutput
}

/// The offline, deterministic provider. Same request and context in, same words out.
struct MockAIProvider: AIProvider {
    static let modelName: String = "flo-checklist-1"

    init() {}

    func respond(to request: FloRequest, context: FloContext) async throws -> FloOutput {
        return MockAIProvider.generate(request, context: context)
    }

    // MARK: Generation

    static func generate(_ request: FloRequest, context: FloContext) -> FloOutput {
        switch request.kind {
        case .script:
            return scripts(request, context)
        case .hookRewrite:
            return hookRewrite(request, context)
        case .briefTldr:
            return briefTldr(context)
        case .caption:
            return captions(request, context)
        case .scoreFix:
            return scoreFix(request, context)
        case .rateAdvice:
            return rateAdvice(context)
        case .nextAction:
            return nextAction(context)
        case .bountyDraft, .unknown:
            return FloOutput(
                title: "That one is for brands",
                outputs: ["Bounty drafts are part of flowd for Brands. In the creator app I can write scripts, rewrite hooks, summarise a brief and suggest captions."],
                actions: [],
                model: modelName,
                latencyMs: 180
            )
        }
    }

    private static func slots(_ context: FloContext) -> HookSlots {
        var s: HookSlots = HookSlots()
        if let app = context.appName {
            s.app = app
        }
        if let category = context.appCategory {
            s.category = categoryWords(category)
        }
        if let feature = context.appFeatures.first {
            s.feature = feature
        }
        return s
    }

    private static func categoryWords(_ category: AppCategory) -> String {
        switch category {
        case .aiPhoto: return "photo editing"
        case .aiAssistant: return "AI assistant"
        case .fitness: return "fitness"
        case .language: return "language learning"
        case .productivity: return "productivity"
        case .finance: return "budgeting"
        case .sleepMind: return "sleep"
        case .musicAudio: return "music"
        case .lifestyle: return "lifestyle"
        case .unknown: return "app"
        }
    }

    private static func clock(_ seconds: Double) -> String {
        let total: Int = Int(seconds.rounded())
        return String(total / 60) + ":" + FlowdCalendar.pad(total % 60, 2)
    }

    private static func scripts(_ request: FloRequest, _ context: FloContext) -> FloOutput {
        let appName: String = context.appName ?? "the app"
        let rewrites: [HookRewrite] = HookTextEngine.suggestRewrites(slots: slots(context), avoidTypes: [], limit: 3)
        let beats: [FormatBeat] = context.format?.beats ?? []
        var outputs: [String] = []
        let talking: [String] = context.bounty?.brief.talkingPoints ?? []
        let cta: String = context.bounty?.brief.cta ?? "Try it free."
        for (index, hook) in rewrites.enumerated() {
            var lines: [String] = []
            if beats.isEmpty {
                lines.append("0:00  Hook: " + hook.text)
                lines.append("0:03  Show " + appName + " on screen: one tap, the result.")
                lines.append("0:12  Say the one thing that surprised you" + (talking.isEmpty ? "." : ": " + talking[index % talking.count]))
                lines.append("0:22  Win state, then: " + cta)
            } else {
                for (beatIndex, beat) in beats.enumerated() {
                    let text: String
                    if beatIndex == 0 {
                        text = hook.text
                    } else if beat.beat == .cta {
                        text = cta
                    } else if !talking.isEmpty {
                        text = talking[(beatIndex + index) % talking.count]
                    } else {
                        text = beat.tip
                    }
                    lines.append(clock(beat.tStartS) + "  " + beat.label + ": " + text)
                }
            }
            lines.append("Say \"#ad\" out loud and keep it on screen for 2 seconds.")
            outputs.append(lines.joined(separator: "\n"))
        }
        var actions: [FloAction] = []
        if let bounty = context.bounty {
            actions.append(FloAction(label: "Send to Studio", kind: "open_studio", payload: bounty.id))
        }
        return FloOutput(
            title: "Three scripts for " + appName,
            outputs: outputs,
            actions: actions,
            model: modelName,
            latencyMs: 620
        )
    }

    private static func hookRewrite(_ request: FloRequest, _ context: FloContext) -> FloOutput {
        let original: String = (request.hookText ?? request.prompt).trimmingCharacters(in: .whitespacesAndNewlines)
        let current: HookTextResult = HookTextEngine.scoreText(original)
        let rewrites: [HookRewrite] = HookTextEngine.suggestRewrites(slots: slots(context), avoidTypes: [], limit: 5)
        var outputs: [String] = rewrites.map { (r: HookRewrite) -> String in
            return r.text + "  (" + r.band.letter + ", " + String(r.score) + ")"
        }
        if !original.isEmpty {
            outputs.insert("Yours: " + original + "  (" + current.band.letter + ", " + String(current.score) + "). " + (current.suggestions.first ?? "It already works."), at: 0)
        }
        return FloOutput(
            title: "Five ways to open",
            outputs: outputs,
            actions: [FloAction(label: "Use in Studio", kind: "use_hook", payload: rewrites.first?.text)],
            model: modelName,
            latencyMs: 380
        )
    }

    private static func briefTldr(_ context: FloContext) -> FloOutput {
        guard let bounty = context.bounty else {
            return FloOutput(title: "Pick a bounty first", outputs: ["Open a bounty and ask again. I'll summarise its brief in five lines."], actions: [], model: modelName, latencyMs: 150)
        }
        let tldr: BriefTLDR = BriefHelpers.tldr(for: bounty)
        var outputs: [String] = [tldr.headline]
        if !tldr.mustSay.isEmpty {
            outputs.append("Must hit: " + tldr.mustSay.map { (m: BriefMustSay) -> String in return m.label }.joined(separator: ", ") + ".")
        }
        if let first = tldr.dos.first {
            outputs.append("Do: " + first)
        }
        if let first = tldr.donts.first {
            outputs.append("Don't: " + first)
        }
        outputs.append("Length: " + tldr.lengthLine + ". " + tldr.rightsLine)
        outputs.append("End with: " + tldr.cta + (tldr.offerLine.map { (line: String) -> String in return " (" + line + ")" } ?? ""))
        return FloOutput(
            title: "The brief in " + String(outputs.count) + " lines",
            outputs: outputs,
            actions: [FloAction(label: "Make it", kind: "open_studio", payload: bounty.id)],
            model: modelName,
            latencyMs: 300
        )
    }

    private static func captions(_ request: FloRequest, _ context: FloContext) -> FloOutput {
        let brand: String = context.brandName ?? context.appName ?? "the brand"
        let disclosure: String = BriefHelpers.disclosureLine(brandName: brand)
        let tags: [String] = context.bounty?.brief.hashtags ?? []
        let appName: String = context.appName ?? "this app"
        let bodies: [String] = [
            "I tested " + appName + " for a week. Here's what stuck.",
            "The one thing I didn't expect from " + appName + ".",
            "My honest take on " + appName + " after day seven."
        ]
        let outputs: [String] = bodies.map { (body: String) -> String in
            return BriefHelpers.caption(disclosure: disclosure, body: body, trackingLine: nil, hashtags: tags)
        }
        return FloOutput(
            title: "Three captions with the disclosure locked in",
            outputs: outputs,
            actions: [FloAction(label: "Copy", kind: "copy", payload: outputs.first)],
            model: modelName,
            latencyMs: 260
        )
    }

    private static func scoreFix(_ request: FloRequest, _ context: FloContext) -> FloOutput {
        let text: String = (request.hookText ?? request.prompt).trimmingCharacters(in: .whitespacesAndNewlines)
        let result: HookTextResult = HookTextEngine.scoreText(text)
        var outputs: [String] = ["Checklist score: " + result.band.letter + " (" + String(result.score) + "). " + FlowdConstants.checklistLabel]
        outputs.append(contentsOf: result.suggestions.prefix(3))
        if result.suggestions.isEmpty {
            outputs.append("Nothing to fix in the words. Check the first 3 seconds on camera next.")
        }
        return FloOutput(title: "How to lift this hook", outputs: outputs, actions: [], model: modelName, latencyMs: 240)
    }

    private static func rateAdvice(_ context: FloContext) -> FloOutput {
        let hint: String = context.rateAdviceHint ?? "Your rate card sets your own price. Start near the market band and raise it as your approval rate holds."
        return FloOutput(
            title: "Pricing your videos",
            outputs: [hint, "A counter within the market band usually lands. Outside it, add a reason: usage days, turnaround or a bundle."],
            actions: [FloAction(label: "Open rate card", kind: "open_rate_card", payload: nil)],
            model: modelName,
            latencyMs: 280
        )
    }

    private static func nextAction(_ context: FloContext) -> FloOutput {
        let hint: String = context.nextActionHint ?? "Make one scored take today. A week counts when you post at least once."
        return FloOutput(
            title: "Your next move",
            outputs: [hint],
            actions: [],
            model: modelName,
            latencyMs: 200
        )
    }
}
