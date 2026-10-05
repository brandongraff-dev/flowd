import Foundation

// Video understanding, mocked. There is no server pipeline in the demo: a "clip" is a script, a few timings and some metadata, and this builds what
// the ML pipeline would return for it (transcript, on-screen text, scenes, beats, hook, QA checks, Hook Score and Flow Score) using the engine's own
// checklists. So the score a creator sees in the Studio is the score the brand sees in the review queue. On a real device the Studio feeds the same
// shape from Speech and Vision and calls `ClipAnalyzer.analyze` for the scoring and QA; `MockFlowdAPI` calls it for every submitted clip.
//
// Deterministic: the same clip always gives the same analysis. Mirrors apps/web/src/lib/store/core/analysis.ts.

/// What the Studio hands the analyzer for one take.
struct ClipInput: Hashable, Sendable {
    /// The spoken script, as sentences. Without one the brief's talking points are used.
    var script: String?
    /// The first line (the hook). Defaults to the first sentence of the script.
    var hookText: String?
    /// Burned-in caption lines (the hook is added automatically unless `captionHook` is false).
    var onScreenText: [String]
    var captionHook: Bool
    var durationS: Double
    /// When speech starts, in milliseconds.
    var speechStartMs: Int
    /// When a face is first on screen. Nil for a faceless format.
    var faceAtMs: Int?
    /// When the app is first on screen.
    var appAtMs: Int?
    /// Add the spoken and on-screen #ad automatically (the Studio does).
    var includeDisclosure: Bool
    var hasCaptions: Bool
    var width: Int
    var height: Int
    var music: MusicDetection?
    var aiContent: AiContentFlag?
    var watermarkDetected: Bool
    /// Hashes of other videos to compare with (other creators' and this creator's own).
    var knownHashes: [KnownHash]

    init(
        script: String? = nil,
        hookText: String? = nil,
        onScreenText: [String] = [],
        captionHook: Bool = true,
        durationS: Double = 0,
        speechStartMs: Int = 450,
        faceAtMs: Int? = 300,
        appAtMs: Int? = 2_200,
        includeDisclosure: Bool = true,
        hasCaptions: Bool = true,
        width: Int = FlowdConstants.Studio.width,
        height: Int = FlowdConstants.Studio.height,
        music: MusicDetection? = nil,
        aiContent: AiContentFlag? = nil,
        watermarkDetected: Bool = false,
        knownHashes: [KnownHash] = []
    ) {
        self.script = script
        self.hookText = hookText
        self.onScreenText = onScreenText
        self.captionHook = captionHook
        self.durationS = durationS
        self.speechStartMs = speechStartMs
        self.faceAtMs = faceAtMs
        self.appAtMs = appAtMs
        self.includeDisclosure = includeDisclosure
        self.hasCaptions = hasCaptions
        self.width = width
        self.height = height
        self.music = music
        self.aiContent = aiContent
        self.watermarkDetected = watermarkDetected
        self.knownHashes = knownHashes
    }
}

/// The analysis of a clip: the stored shape, the QA report and the two scored checklists.
struct ClipAnalysis: Hashable, Sendable {
    var durationMs: Int
    var language: String
    var transcript: [TranscriptSegment]
    var onScreenText: [OnScreenText]
    var scenes: [SceneCut]
    var hook: HookAnalysis
    var beats: [BeatHit]
    var tags: VideoTags
    var qa: QaReport
    var hookScore: ScoredCard
    var flowScore: ScoredCard
    var phash: String

    /// The contract's stored `VideoAnalysis` for a submission version.
    func videoAnalysis(id: String, submissionId: String, version: Int, analysedAt: Date) -> VideoAnalysis {
        return VideoAnalysis(
            id: id,
            submissionId: submissionId,
            version: version,
            durationMs: durationMs,
            language: language,
            transcript: transcript,
            transcriptText: transcript.map { (s: TranscriptSegment) -> String in
                return s.text
            }.joined(separator: " "),
            onScreenText: onScreenText,
            scenes: scenes,
            hook: hook,
            beats: beats,
            tags: tags,
            checks: qa.checks,
            hookScore: hookScore.asScoreCard,
            flowScore: flowScore.asScoreCard,
            phash: phash,
            duplicateOfSubmissionId: qa.duplicates.first?.id,
            analysedAt: analysedAt
        )
    }
}

enum ClipAnalyzer {
    /// The disclosure line a creator says out loud.
    static func spokenDisclosure(brandName: String) -> String {
        return "This is a paid partnership with " + brandName + "."
    }

    /// A 16-character hex perceptual hash derived from the clip's content, so two uploads of the same script collide.
    static func phash(_ parts: [String]) -> String {
        let joined: String = parts.joined(separator: "|")
        let reversed: String = String(joined.reversed())
        return StableHash.hex8(joined) + StableHash.hex8(reversed)
    }

    /// The CTA type a brief's call to action asks for.
    static func ctaType(for cta: String) -> CtaType {
        let t: String = cta.lowercased()
        if Rx.test(#"\bbio\b"#, in: t) {
            return .linkInBio
        }
        if Rx.test(#"\bcode\b"#, in: t) {
            return .useCode
        }
        if Rx.test(#"app store|search"#, in: t) {
            return .searchAppStore
        }
        if Rx.test(#"download"#, in: t) {
            return .downloadNow
        }
        if Rx.test(#"comment"#, in: t) {
            return .commentForLink
        }
        return .tryFree
    }

    /// Sentences in reading order.
    static func splitSentences(_ text: String) -> [String] {
        return Rx.matches(#"[^.?!…]+(?:[.?!…]+|$)"#, in: text).map { (s: String) -> String in
            return s.trimmingCharacters(in: .whitespacesAndNewlines)
        }.filter { (s: String) -> Bool in
            return !s.isEmpty
        }
    }

    /// Builds the analysis of a clip against a bounty.
    static func analyze(
        clip: ClipInput,
        bounty: Bounty,
        app: BrandApp,
        brand: Brand,
        format: Format?,
        creatorId: String,
        title: String
    ) -> ClipAnalysis {
        let brief: Brief = bounty.brief
        let hookInput: String = clip.hookText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let scriptInput: String = clip.script?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        var baseScript: String = scriptInput
        if baseScript.isEmpty {
            var parts: [String] = []
            if !hookInput.isEmpty {
                parts.append(hookInput)
            }
            parts.append(contentsOf: brief.talkingPoints)
            if let offer = brief.offerLine, !offer.isEmpty {
                parts.append(offer)
            }
            if !brief.cta.isEmpty {
                parts.append(brief.cta)
            }
            baseScript = parts.joined(separator: " ")
        }
        var sentences: [String] = splitSentences(baseScript)
        if !hookInput.isEmpty {
            let probe: String = String(hookInput.lowercased().prefix(12))
            let first: String = sentences.first?.lowercased() ?? ""
            if !first.hasPrefix(probe) {
                sentences.insert(hookInput, at: 0)
            }
        }

        // Timeline: three words a second, a short breath between sentences.
        let speechStart: Int = clip.speechStartMs
        var transcript: [TranscriptSegment] = []
        var t: Int = speechStart
        var lines: [String] = sentences
        let hasDisclosure: Bool = sentences.contains(where: { (s: String) -> Bool in
            return Rx.test(#"paid partnership|#ad|hashtag ad"#, in: s, caseInsensitive: true)
        })
        if clip.includeDisclosure && !hasDisclosure {
            let cut: Int = Swift.max(1, sentences.count - 1)
            lines = Array(sentences.prefix(cut)) + [spokenDisclosure(brandName: brand.name)] + Array(sentences.dropFirst(cut))
        }
        for line in lines {
            let ms: Int = Swift.max(900, Int((Double(TextTools.wordCount(line)) / HookTextEngine.wordsPerSecond * 1_000).rounded()))
            transcript.append(TranscriptSegment(tStartMs: t, tEndMs: t + ms, text: line))
            t += ms + 180
        }
        let naturalMs: Int = t + 600
        let durationMs: Int = Swift.max(Int((clip.durationS * 1_000).rounded()), naturalMs)
        let hookLine: String = HookTextEngine.firstSentence(hookInput.isEmpty ? (transcript.first?.text ?? "") : hookInput)
        let landsAt: Int = transcript.first?.tEndMs ?? 0

        // On-screen text.
        var onScreen: [OnScreenText] = []
        if clip.captionHook && !hookLine.isEmpty {
            onScreen.append(OnScreenText(
                tStartMs: Swift.max(0, speechStart - 100),
                tEndMs: Swift.min(landsAt + 1_200, durationMs),
                text: hookLine.uppercased(),
                inSafeZone: true
            ))
        }
        for (index, line) in clip.onScreenText.enumerated() {
            let start: Int = landsAt + 1_600 + index * 2_200
            onScreen.append(OnScreenText(tStartMs: start, tEndMs: Swift.min(start + 2_000, durationMs), text: line, inSafeZone: true))
        }
        if clip.includeDisclosure {
            let spoken: TranscriptSegment? = transcript.first(where: { (s: TranscriptSegment) -> Bool in
                return Rx.test(#"paid partnership"#, in: s.text, caseInsensitive: true)
            })
            let at: Int = spoken?.tStartMs ?? Int((Double(durationMs) * 0.55).rounded())
            let text: String = brief.disclosureText.isEmpty ? "#ad Paid partnership with " + brand.name : brief.disclosureText
            onScreen.append(OnScreenText(tStartMs: at, tEndMs: Swift.min(at + 2_600, durationMs), text: text, inSafeZone: true))
        }
        if !brief.cta.isEmpty {
            onScreen.append(OnScreenText(
                tStartMs: Int((Double(durationMs) * 0.82).rounded()),
                tEndMs: durationMs,
                text: app.name + ": " + brief.cta,
                inSafeZone: true
            ))
        }
        onScreen.sort { (a: OnScreenText, b: OnScreenText) -> Bool in
            return a.tStartMs < b.tStartMs
        }

        // Scenes.
        let faceless: Bool = format?.faceless ?? false
        let faceAt: Int? = faceless ? nil : clip.faceAtMs
        let appAt: Int = clip.appAtMs ?? 2_200
        var scenes: [SceneCut] = [
            SceneCut(tStartMs: 0, tEndMs: appAt, kind: faceless ? .textCard : .face),
            SceneCut(tStartMs: appAt, tEndMs: Swift.min(durationMs, appAt + 6_500), kind: .screenRecording)
        ]
        if durationMs > appAt + 6_500 {
            scenes.append(SceneCut(tStartMs: appAt + 6_500, tEndMs: durationMs, kind: faceless ? .screenRecording : .face))
        }

        // Hook.
        let captionHit: OnScreenText? = onScreen.first(where: { (o: OnScreenText) -> Bool in
            return TextTools.textParity(spoken: hookLine, onscreen: o.text) > 0.4
        })
        let hookType: HookType = HookTextEngine.detectPatterns(hookLine).first ?? .directQuestion
        let hook: HookAnalysis = HookAnalysis(
            text: hookLine,
            hookType: hookType,
            landsAtMs: landsAt,
            faceAtMs: faceAt,
            appAtMs: appAt,
            captionAtMs: captionHit?.tStartMs,
            spokenMatchesOnscreen: captionHit != nil
        )

        // QA, beats and the two checklist scores.
        let phashValue: String = phash([creatorId, title, baseScript])
        let music: MusicDetection = clip.music ?? MusicDetection(
            detected: bounty.deliverables.musicPolicy == .commercialLibrary,
            kind: bounty.deliverables.musicPolicy == .commercialLibrary ? .commercialLibrary : .original
        )
        let qaInput: QaInput = QaInput(
            transcript: transcript,
            onScreenText: onScreen,
            durationMs: durationMs,
            width: clip.width,
            height: clip.height,
            caption: nil,
            briefBeats: brief.beats,
            bannedClaims: brief.bannedClaims,
            disclosureText: brief.disclosureText,
            offerLine: brief.offerLine,
            cta: brief.cta,
            minDurationS: bounty.deliverables.minDurationS,
            maxDurationS: bounty.deliverables.maxDurationS,
            aspect: bounty.deliverables.aspect,
            musicPolicy: bounty.deliverables.musicPolicy,
            aiPolicy: bounty.deliverables.aiPolicy,
            beats: nil,
            brandName: app.name,
            appFeatures: app.features,
            competitorNames: brand.complianceDefaults.competitorNames,
            music: music,
            aiContent: clip.aiContent,
            watermarkDetected: clip.watermarkDetected,
            moderationFlags: [],
            audio: AudioInfo(snrDb: 22, clipping: false),
            phash: phashValue,
            knownHashes: clip.knownHashes
        )
        let qa: QaReport = QAEngine.run(qaInput)
        let tags: VideoTags = VideoTags(
            formatId: format.flatMap { (f: Format) -> FormatId? in
                return FormatId(rawValue: f.id)
            },
            hookType: hookType,
            hookWords: hookLine.split(separator: " ").prefix(4).joined(separator: " "),
            timeToAppRevealMs: appAt,
            ctaType: ctaType(for: brief.cta)
        )
        let empty: ScoreCard = ScoreCard(band: .e, points: 0, items: [], label: FlowdConstants.checklistLabel)
        let draft: VideoAnalysis = VideoAnalysis(
            id: "va_draft",
            submissionId: "sub_draft",
            version: 1,
            durationMs: durationMs,
            language: "en",
            transcript: transcript,
            transcriptText: transcript.map { (s: TranscriptSegment) -> String in
                return s.text
            }.joined(separator: " "),
            onScreenText: onScreen,
            scenes: scenes,
            hook: hook,
            beats: qa.beats,
            tags: tags,
            checks: qa.checks,
            hookScore: empty,
            flowScore: empty,
            phash: phashValue,
            duplicateOfSubmissionId: qa.duplicates.first?.id,
            analysedAt: FlowdClock.demoNow
        )
        let formatBeatIds: [BeatId]? = format.map { (f: Format) -> [BeatId] in
            return f.beats.map { (b: FormatBeat) -> BeatId in
                return b.beat
            }
        }
        let scored = ScoringEngine.scoreAnalysis(draft, faceless: faceless, hookTrialRates: [:], formatBeats: formatBeatIds)
        return ClipAnalysis(
            durationMs: durationMs,
            language: "en",
            transcript: transcript,
            onScreenText: onScreen,
            scenes: scenes,
            hook: hook,
            beats: qa.beats,
            tags: tags,
            qa: qa,
            hookScore: scored.hook,
            flowScore: scored.flow,
            phash: phashValue
        )
    }
}
