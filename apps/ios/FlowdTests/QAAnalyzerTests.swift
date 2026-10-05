import XCTest
@testable import Flowd

/// Auto-QA (disclosure, claims, duplicates), the mocked clip analysis that feeds the Studio and the review queue, the pre-flight card, and the brief TL;DR.
final class QAAnalyzerTests: XCTestCase {
    // MARK: Fixtures

    private struct StarterWorld {
        var bounty: Bounty
        var app: BrandApp
        var brand: Brand
    }

    private func starterWorld() throws -> StarterWorld {
        let loader: FixtureLoader = TestSupport.loader()
        let bounties: [Bounty] = try loader.load([Bounty].self, named: "bounties")
        let apps: [BrandApp] = try loader.load([BrandApp].self, named: "apps")
        let brands: [Brand] = try loader.load([Brand].self, named: "brands")
        let bounty: Bounty = try XCTUnwrap(bounties.first(where: { (b: Bounty) -> Bool in return b.id == "bnty_flowd_starter_2" }))
        let app: BrandApp = try XCTUnwrap(apps.first(where: { (a: BrandApp) -> Bool in return a.id == bounty.appId }))
        let brand: Brand = try XCTUnwrap(brands.first(where: { (b: Brand) -> Bool in return b.id == bounty.brandId }))
        return StarterWorld(bounty: bounty, app: app, brand: brand)
    }

    private func analyze(_ world: StarterWorld, clip: ClipInput, title: String = "Honest review") -> ClipAnalysis {
        return ClipAnalyzer.analyze(clip: clip, bounty: world.bounty, app: world.app, brand: world.brand, format: nil, creatorId: "cr_test", title: title)
    }

    private func segment(_ start: Int, _ end: Int, _ text: String) -> TranscriptSegment {
        return TranscriptSegment(tStartMs: start, tEndMs: end, text: text)
    }

    private func shown(_ start: Int, _ end: Int, _ text: String) -> OnScreenText {
        return OnScreenText(tStartMs: start, tEndMs: end, text: text, inSafeZone: true)
    }

    // MARK: Disclosure

    func testASpokenDisclosureIsFoundByItsWordsEvenAcrossTwoSegments() {
        XCTAssertNotNil(QAEngine.findSpokenDisclosure([segment(500, 2_500, "This is a paid partnership with flowd.")]))
        XCTAssertNotNil(QAEngine.findSpokenDisclosure([segment(0, 900, "Hashtag ad, by the way")]))
        XCTAssertNil(QAEngine.findSpokenDisclosure([segment(0, 2_000, "I love paying for apps that save me time.")]))
        let split: TranscriptSegment? = QAEngine.findSpokenDisclosure([segment(0, 800, "okay, this is a"), segment(800, 1_800, "paid partnership"), segment(1_800, 3_000, "so here we go")])
        XCTAssertEqual(split?.tStartMs, 0, "The disclosure starts in the first of the two segments.")
    }

    func testAWrittenDisclosureNeedsAHashtagNotAWordInsideAnotherWord() {
        XCTAssertNotNil(QAEngine.findWrittenDisclosure([shown(0, 2_600, "#AD Paid partnership with flowd")]))
        XCTAssertNotNil(QAEngine.findWrittenDisclosure([shown(0, 2_600, "Ad: my honest review")]))
        XCTAssertNotNil(QAEngine.findWrittenDisclosure([shown(0, 2_600, "Sponsored by flowd")]))
        XCTAssertNil(QAEngine.findWrittenDisclosure([shown(0, 2_600, "#adventure time")]))
        XCTAssertNil(QAEngine.findWrittenDisclosure([shown(0, 2_600, "Already ready")]))
    }

    func testTheSpokenDisclosurePassesEarlyWarnsLateAndFailsWhenMissingAndBlocksSettlement() {
        let early: QaFinding = QAEngine.checkDisclosureAudio(transcript: [segment(500, 2_500, "This is a paid partnership with flowd.")], durationMs: 20_000)
        XCTAssertEqual(early.result, .pass)
        XCTAssertFalse(early.blocksSettlement)
        let late: QaFinding = QAEngine.checkDisclosureAudio(transcript: [segment(15_000, 17_000, "This is a paid partnership with flowd.")], durationMs: 20_000)
        XCTAssertEqual(late.result, .warn)
        XCTAssertFalse(late.blocksSettlement)
        XCTAssertEqual(late.reasonCode, .missingDisclosure)
        let missing: QaFinding = QAEngine.checkDisclosureAudio(transcript: [segment(500, 2_500, "I really like this app.")], durationMs: 20_000)
        XCTAssertEqual(missing.result, .fail)
        XCTAssertTrue(missing.blocksSettlement, "A missing disclosure blocks settlement: the FTC wants it in the video itself.")
        XCTAssertEqual(missing.reasonCode, .missingDisclosure)
        XCTAssertNotNil(missing.fix)
    }

    func testTheOnScreenDisclosureNeedsTwoSecondsOnScreen() {
        XCTAssertEqual(QAEngine.checkDisclosureOnScreen(onScreenText: [shown(5_000, 7_600, "#ad Paid partnership with flowd")]).result, .pass)
        let brief: QaFinding = QAEngine.checkDisclosureOnScreen(onScreenText: [shown(5_000, 6_500, "#ad Paid partnership with flowd")])
        XCTAssertEqual(brief.result, .warn)
        XCTAssertFalse(brief.blocksSettlement)
        let none: QaFinding = QAEngine.checkDisclosureOnScreen(onScreenText: [shown(0, 3_000, "Subscriptions are sneaky")])
        XCTAssertEqual(none.result, .fail)
        XCTAssertTrue(none.blocksSettlement)
    }

    // MARK: Claims, duplicates, audio

    func testBannedClaimsAndCompetitorsAreFoundWhereTheyAppear() {
        let hits: [QAEngine.BannedClaimHit] = QAEngine.findBannedClaims(
            transcript: [segment(1_000, 3_000, "This is guaranteed income for everyone")],
            onScreenText: [shown(1_000, 3_000, "GUARANTEED INCOME")],
            caption: "No guaranteed income here, just honest tips",
            bannedClaims: ["guaranteed income", "get rich"]
        )
        XCTAssertEqual(hits.map { (h: QAEngine.BannedClaimHit) -> String in return h.source }, ["transcript", "on_screen", "caption"])
        XCTAssertEqual(hits[0].tMs, 1_000)
        XCTAssertTrue(hits.allSatisfy { (h: QAEngine.BannedClaimHit) -> Bool in return h.claim == "guaranteed income" })
        let mentions: [CompetitorMention] = QAEngine.findCompetitors(
            transcript: [segment(2_000, 4_000, "I switched from Rival Budget last year")],
            onScreenText: [],
            caption: nil,
            names: ["Rival Budget", "Other App"]
        )
        XCTAssertEqual(mentions.count, 1)
        XCTAssertEqual(mentions.first?.name, "Rival Budget")
        XCTAssertEqual(mentions.first?.source, "transcript")
    }

    func testPerceptualHashesCompareByDifferingBits() {
        XCTAssertTrue(QAEngine.isValidPhash("0123456789abcdef"))
        XCTAssertFalse(QAEngine.isValidPhash("0123456789abcde"))
        XCTAssertFalse(QAEngine.isValidPhash("0123456789abcdeg"))
        XCTAssertEqual(QAEngine.phashDistance("0000000000000000", "000000000000000f"), 4)
        XCTAssertEqual(QAEngine.phashDistance("ffffffffffffffff", "0000000000000000"), 64)
        XCTAssertEqual(QAEngine.phashDistance("abcdefabcdefabcd", "abcdefabcdefabcd"), 0)
        XCTAssertNil(QAEngine.phashDistance("xyz", "0000000000000000"))
    }

    func testNearDuplicatesWithinSixBitsAreListedNearestFirstAndBadHashesAreSkipped() {
        let known: [KnownHash] = [
            KnownHash(id: "sub_far", phash: "00000000000000ff", creatorId: "cr_a"),
            KnownHash(id: "sub_near", phash: "000000000000003f", creatorId: "cr_b"),
            KnownHash(id: "sub_exact", phash: "0000000000000000", creatorId: "cr_c"),
            KnownHash(id: "sub_bad", phash: "not-a-hash", creatorId: nil)
        ]
        let matches: [DuplicateMatch] = QAEngine.findDuplicates(phash: "0000000000000000", known: known)
        XCTAssertEqual(matches.map { (m: DuplicateMatch) -> String in return m.id }, ["sub_exact", "sub_near"])
        XCTAssertEqual(matches[0].distance, 0)
        XCTAssertTrue(matches[0].exact)
        XCTAssertEqual(matches[1].distance, 6)
        XCTAssertFalse(matches[1].exact)
        XCTAssertTrue(QAEngine.findDuplicates(phash: "garbage", known: known).isEmpty)
    }

    func testDeadAirIsAGapBetweenSpokenSegmentsOfMoreThanASecond() {
        let gaps: [QAEngine.DeadAirGap] = QAEngine.deadAirGaps([segment(0, 1_000, "one"), segment(3_000, 4_000, "two"), segment(4_500, 5_500, "three")])
        XCTAssertEqual(gaps.count, 1)
        XCTAssertEqual(gaps.first?.startMs, 1_000)
        XCTAssertEqual(gaps.first?.endMs, 3_000)
        XCTAssertEqual(gaps.first?.lengthMs, 2_000)
        XCTAssertTrue(QAEngine.deadAirGaps([]).isEmpty)
    }

    func testAspectRatiosParseAndFallBackToNineBySixteen() {
        XCTAssertEqual(QAEngine.aspectRatio(of: "9:16"), 0.5625, accuracy: 0.0001)
        XCTAssertEqual(QAEngine.aspectRatio(of: "16:9"), 16.0 / 9.0, accuracy: 0.0001)
        XCTAssertEqual(QAEngine.aspectRatio(of: "square"), 0.5625, accuracy: 0.0001)
    }

    func testARunWithNothingInItFailsBothDisclosuresAndRunsEveryCheck() {
        let report: QaReport = QAEngine.run(QaInput(durationMs: 20_000, brandName: "flowd"))
        XCTAssertEqual(report.findings.count, 14)
        XCTAssertEqual(report.pass + report.warn + report.fail, 14)
        XCTAssertGreaterThanOrEqual(report.fail, 2)
        XCTAssertTrue(report.blocksSettlement)
        XCTAssertTrue(report.reasonCodes.contains(.missingDisclosure))
        XCTAssertFalse(report.isClean)
        XCTAssertEqual(Set(report.findings.map { (f: QaFinding) -> String in return f.id }).count, 14, "One finding per check.")
        XCTAssertEqual(report.checks.count, 14)
    }

    // MARK: The mocked clip analysis

    func testAnAnalysisIsDeterministicAndScoredOnTheSameChecklistsTheReviewQueueUses() throws {
        let world: StarterWorld = try starterWorld()
        let clip: ClipInput = ClipInput(hookText: "I stopped losing money on subscriptions.", durationS: 22)
        let first: ClipAnalysis = analyze(world, clip: clip)
        let second: ClipAnalysis = analyze(world, clip: clip)
        XCTAssertEqual(first, second, "The same clip always gives the same analysis.")
        XCTAssertTrue(QAEngine.isValidPhash(first.phash))
        XCTAssertGreaterThanOrEqual(first.durationMs, 22_000)
        XCTAssertEqual(first.hook.text, "I stopped losing money on subscriptions.")
        XCTAssertGreaterThan(first.hookScore.points, 0)
        XCTAssertLessThanOrEqual(first.hookScore.points, 100)
        XCTAssertLessThanOrEqual(first.flowScore.points, 100)
        XCTAssertEqual(first.hookScore.band, ScoringEngine.band(for: first.hookScore.points))
        XCTAssertEqual(first.flowScore.band, ScoringEngine.band(for: first.flowScore.points))
        XCTAssertEqual(first.hookScore.label, FlowdConstants.checklistLabel)
        XCTAssertTrue(first.beats.contains(where: { (b: BeatHit) -> Bool in return b.beat == .hook && b.found }))
        XCTAssertFalse(first.scenes.isEmpty)
        let other: ClipAnalysis = analyze(world, clip: clip, title: "A different title")
        XCTAssertNotEqual(first.phash, other.phash)
    }

    func testTheStudioAddsTheSpokenAndWrittenDisclosureSoACleanTakeCanBeSubmitted() throws {
        let world: StarterWorld = try starterWorld()
        let result: ClipAnalysis = analyze(world, clip: ClipInput(hookText: "I stopped losing money on subscriptions.", durationS: 22))
        XCTAssertNotNil(QAEngine.findSpokenDisclosure(result.transcript))
        XCTAssertNotNil(QAEngine.findWrittenDisclosure(result.onScreenText))
        XCTAssertFalse(result.qa.blocksSettlement)
        let spoken: String = result.transcript.map { (s: TranscriptSegment) -> String in return s.text }.joined(separator: " ")
        XCTAssertTrue(spoken.contains("This is a paid partnership with " + world.brand.name + "."), spoken)
        let times: [Int] = result.transcript.map { (s: TranscriptSegment) -> Int in return s.tStartMs }
        XCTAssertEqual(times, times.sorted())
    }

    func testATakeWithoutADisclosureIsBlockedAndSaysWhy() throws {
        let world: StarterWorld = try starterWorld()
        let result: ClipAnalysis = analyze(world, clip: ClipInput(hookText: "I stopped losing money on subscriptions.", durationS: 22, includeDisclosure: false))
        XCTAssertTrue(result.qa.blocksSettlement)
        XCTAssertTrue(result.qa.reasonCodes.contains(.missingDisclosure))
        XCTAssertGreaterThanOrEqual(result.qa.fail, 2)
    }

    func testTheSameVideoTwiceIsAnExactDuplicate() throws {
        let world: StarterWorld = try starterWorld()
        let clip: ClipInput = ClipInput(hookText: "I stopped losing money on subscriptions.", durationS: 22)
        let original: ClipAnalysis = analyze(world, clip: clip)
        var again: ClipInput = clip
        again.knownHashes = [KnownHash(id: "sub_0001", phash: original.phash, creatorId: "cr_other")]
        let duplicate: ClipAnalysis = analyze(world, clip: again)
        XCTAssertEqual(duplicate.qa.duplicates.first?.id, "sub_0001")
        XCTAssertEqual(duplicate.qa.duplicates.first?.exact, true)
        XCTAssertEqual(duplicate.qa.duplicates.first?.distance, 0)
    }

    func testAnAnalysisBecomesTheStoredVideoAnalysisOfASubmissionVersion() throws {
        let world: StarterWorld = try starterWorld()
        let result: ClipAnalysis = analyze(world, clip: ClipInput(hookText: "I stopped losing money on subscriptions.", durationS: 22))
        let stored: VideoAnalysis = result.videoAnalysis(id: "va_0001_v1", submissionId: "sub_0001", version: 1, analysedAt: FlowdClock.demoNow)
        XCTAssertEqual(stored.id, "va_0001_v1")
        XCTAssertEqual(stored.submissionId, "sub_0001")
        XCTAssertEqual(stored.version, 1)
        XCTAssertEqual(stored.hookScore.points, result.hookScore.points)
        XCTAssertEqual(stored.flowScore.band, result.flowScore.band)
        XCTAssertEqual(stored.checks.count, result.qa.findings.count)
        XCTAssertEqual(stored.transcriptText, result.transcript.map { (s: TranscriptSegment) -> String in return s.text }.joined(separator: " "))
        XCTAssertNil(stored.duplicateOfSubmissionId)
        XCTAssertEqual(stored.phash, result.phash)
    }

    func testClipHelpersSplitSentencesAndNameTheCallToAction() {
        XCTAssertEqual(ClipAnalyzer.splitSentences("One. Two? Three!  Four"), ["One.", "Two?", "Three!", "Four"])
        XCTAssertEqual(ClipAnalyzer.spokenDisclosure(brandName: "Lumi"), "This is a paid partnership with Lumi.")
        XCTAssertEqual(ClipAnalyzer.ctaType(for: "Link in bio"), .linkInBio)
        XCTAssertEqual(ClipAnalyzer.ctaType(for: "Use code FLOWD for a free week"), .useCode)
        XCTAssertEqual(ClipAnalyzer.ctaType(for: "Search the App Store"), .searchAppStore)
        XCTAssertEqual(ClipAnalyzer.ctaType(for: "Download now"), .downloadNow)
        XCTAssertEqual(ClipAnalyzer.ctaType(for: "Comment LINK below"), .commentForLink)
        XCTAssertEqual(ClipAnalyzer.ctaType(for: "Give it a go"), .tryFree)
    }

    // MARK: Pre-flight

    func testAPassingTakeCanBeSubmittedWithTheDisclosureLockedFirstInTheCaption() throws {
        let world: StarterWorld = try starterWorld()
        let result: ClipAnalysis = analyze(world, clip: ClipInput(hookText: "I stopped losing money on subscriptions.", durationS: 22))
        let card: PreflightResult = PreflightBuilder.build(
            report: result.qa,
            bounty: world.bounty,
            brandName: world.brand.name,
            captionBody: "My honest take",
            trackingLine: "Try it: joinflowd.io/r/abc"
        )
        XCTAssertTrue(card.canSubmit)
        XCTAssertEqual(card.blockingCount, 0)
        XCTAssertEqual(card.checks.count, 14)
        XCTAssertEqual(card.captionDraft, "#ad Paid partnership with flowd\nMy honest take\nTry it: joinflowd.io/r/abc\n#flowd #getpaid #ad")
    }

    func testAMissingDisclosureBlocksSubmitAndFailuresComeFirstWithTheirFix() throws {
        let world: StarterWorld = try starterWorld()
        let result: ClipAnalysis = analyze(world, clip: ClipInput(hookText: "I stopped losing money on subscriptions.", durationS: 22, includeDisclosure: false))
        let card: PreflightResult = PreflightBuilder.build(report: result.qa, bounty: world.bounty, brandName: world.brand.name)
        XCTAssertFalse(card.canSubmit)
        XCTAssertGreaterThanOrEqual(card.blockingCount, 2)
        let first: PreflightCheck = try XCTUnwrap(card.checks.first)
        XCTAssertEqual(first.result, .fail)
        XCTAssertTrue(first.blocking)
        XCTAssertNotNil(first.fix)
        var seenPass: Bool = false
        for check in card.checks {
            if check.result == .pass {
                seenPass = true
            } else {
                XCTAssertFalse(seenPass, "Failures and warnings come before passes.")
            }
        }
        XCTAssertEqual(PreflightBuilder.title(for: .disclosureAudio), "Spoken #ad")
        XCTAssertEqual(PreflightBuilder.title(for: .disclosureOnscreen), "On-screen #ad")
    }

    // MARK: Brief TL;DR and captions

    func testTheBriefTldrLaysOutWhatACreatorNeedsInTheOrderTheyNeedIt() throws {
        let world: StarterWorld = try starterWorld()
        let tldr: BriefTLDR = BriefHelpers.tldr(for: world.bounty)
        XCTAssertEqual(tldr.headline, "Your first flowd video.")
        XCTAssertEqual(tldr.talkingPoints.count, 3, "Up to three talking points.")
        XCTAssertEqual(tldr.dos.count, 3)
        XCTAssertEqual(tldr.donts.count, 3)
        XCTAssertEqual(tldr.mustSay.map { (m: BriefMustSay) -> String in return m.id }, ["hook", "app_reveal", "payoff", "cta"])
        XCTAssertEqual(tldr.cta, "Use my code YOURCODE for the trial.")
        XCTAssertEqual(tldr.disclosure, "#ad Paid partnership with flowd")
        XCTAssertEqual(tldr.lengthLine, "10 to 25 seconds, 9:16, one video")
        XCTAssertEqual(tldr.platformsLine, "TikTok, Instagram and YouTube")
        XCTAssertEqual(tldr.rightsLine, "Organic posting always included.")
        XCTAssertGreaterThanOrEqual(tldr.estimatedFilmMinutes, 8)
        XCTAssertEqual(BriefHelpers.tldr(for: world.bounty), tldr, "Same brief in, same TL;DR out.")
    }

    func testTheCaptionAlwaysStartsWithTheDisclosureAndNeverDropsIt() {
        XCTAssertEqual(
            BriefHelpers.caption(disclosure: "#ad Paid partnership with Lumi", body: "", trackingLine: nil, hashtags: ["#lumi"]),
            "#ad Paid partnership with Lumi\n#lumi #ad"
        )
        XCTAssertEqual(BriefHelpers.disclosureLine(brandName: "Lumi"), "#ad Paid partnership with Lumi")
        XCTAssertEqual(BriefHelpers.firstSentence("No punctuation here"), "No punctuation here")
        XCTAssertEqual(BriefHelpers.firstSentence("First one. Second one."), "First one.")
    }
}
