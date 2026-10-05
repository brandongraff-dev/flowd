import XCTest
@testable import Flowd

/// Text helpers, the hook text checklist (checklist scores, never predictions), the shot-level score fixes and Scam Shield.
final class ScoringTextTests: XCTestCase {
    // MARK: Text tools

    func testNormalizeLowercasesStraightensQuotesAndCollapsesWhitespace() {
        XCTAssertEqual(TextTools.normalize("  Hello\u{2019}s   WORLD \n"), "hello's world")
        XCTAssertEqual(TextTools.normalize("\u{201C}Wow\u{201D} \u{2014} really"), "\"wow\" - really")
    }

    func testTokensKeepHashtagsApostrophesAndNumbers() {
        XCTAssertEqual(TextTools.tokenize("I can't believe #ad 3 apps!"), ["i", "can't", "believe", "#ad", "3", "apps"])
        XCTAssertEqual(TextTools.wordCount("Stop scrolling. This saves hours."), 5)
        XCTAssertEqual(TextTools.wordCount("   "), 0)
    }

    func testSpokenAndOnScreenTextCountAsTheSameHookWhenTheShorterOneIsContained() {
        XCTAssertEqual(TextTools.textParity(spoken: "I stopped losing money on subscriptions", onscreen: "STOPPED LOSING MONEY"), 1, accuracy: 0.0001)
        XCTAssertEqual(TextTools.textParity(spoken: "I stopped losing money", onscreen: "Totally different words"), 0, accuracy: 0.0001)
        XCTAssertEqual(TextTools.textParity(spoken: "", onscreen: "anything"), 0)
        XCTAssertEqual(TextTools.jaccard(["a", "b"], ["b", "c"]), 1.0 / 3.0, accuracy: 0.0001)
        XCTAssertEqual(TextTools.jaccard([], ["a"]), 0)
        XCTAssertEqual(TextTools.containment(["a", "b"], ["a", "c", "d"]), 0.5, accuracy: 0.0001)
    }

    func testPhraseSearchIsWholePhraseAndCaseInsensitive() throws {
        let hit: (phrase: String, index: Int)? = TextTools.findPhrase(in: "This will GUARANTEE income for you", phrases: ["guarantee income", "get rich"])
        XCTAssertEqual(hit?.phrase, "guarantee income")
        XCTAssertEqual(hit?.index, 10)
        XCTAssertNil(TextTools.findPhrase(in: "guaranteed incomes", phrases: ["guarantee income"]), "Partial words do not match.")
        XCTAssertEqual(TextTools.findPhrases(in: "free trial, no card needed", phrases: ["free trial", "no card", "cancel anytime"]), ["free trial", "no card"])
    }

    func testSlugsAreUrlSafe() {
        XCTAssertEqual(TextTools.slugify("Stridely & Co. \u{2014} Run Club!"), "stridely-and-co-run-club")
        XCTAssertEqual(TextTools.slugify("  --Hello--  "), "hello")
        XCTAssertEqual(TextTools.slugify(""), "")
        XCTAssertEqual(TextTools.capitalize("flowd"), "Flowd")
        XCTAssertEqual(TextTools.capitalize(""), "")
    }

    func testACallToActionIsOneAskNotSeveral() {
        XCTAssertEqual(TextTools.callsToAction("Link in bio"), [.getTheApp])
        XCTAssertEqual(TextTools.callsToAction("Use my code YOURCODE for the trial and follow me"), [.getTheApp, .follow])
        XCTAssertEqual(TextTools.callsToAction("This was fun"), [])
    }

    func testStableHashesDoNotChangeBetweenLaunches() {
        XCTAssertEqual(StableHash.fnv1a(""), 2_166_136_261)
        XCTAssertEqual(StableHash.fnv1a("a"), 0xE40C292C)
        XCTAssertEqual(StableHash.hex8("a"), "e40c292c")
        XCTAssertEqual(StableHash.bucket("maya", modulus: 1), 0)
        XCTAssertEqual(StableHash.bucket("maya", modulus: 0), 0)
        XCTAssertEqual(StableHash.bucket("maya", modulus: 100), StableHash.bucket("maya", modulus: 100))
        XCTAssertEqual(StableHash.hex8("anything").count, 8)
    }

    // MARK: The hook text checklist

    func testTheTwoSecondRuleReadsTheFirstSentenceAtThreeWordsASecond() {
        let quick: TwoSecondRule = HookTextEngine.twoSecondRule("Stop scrolling. This saves hours every single week.")
        XCTAssertEqual(quick.sentence, "Stop scrolling.")
        XCTAssertEqual(quick.words, 2)
        XCTAssertEqual(quick.estSeconds, 0.7, accuracy: 0.0001)
        XCTAssertTrue(quick.passes)
        XCTAssertEqual(quick.targetWords, 6)
        let slow: TwoSecondRule = HookTextEngine.twoSecondRule("So today I am going to show you something that changed how I plan every single week of my life.")
        XCTAssertFalse(slow.passes)
        XCTAssertGreaterThan(slow.estSeconds, 2)
        let six: TwoSecondRule = HookTextEngine.twoSecondRule("Why is nobody talking about Dozely?")
        XCTAssertEqual(six.words, 6)
        XCTAssertTrue(six.passes, "Six words is exactly two seconds.")
        XCTAssertFalse(HookTextEngine.twoSecondRule("").passes)
    }

    func testHookPatternsAreDetectedFromThePhrasing() {
        XCTAssertTrue(HookTextEngine.detectPatterns("Okay, I owe this app an apology.").contains(.confession))
        XCTAssertTrue(HookTextEngine.detectPatterns("Why is nobody talking about Dozely?").contains(.directQuestion))
        XCTAssertTrue(HookTextEngine.detectPatterns("7 days with one app. Here's the result.").contains(.specificNumber))
        XCTAssertTrue(HookTextEngine.detectPatterns("POV: you finally found the one app.").contains(.pov))
        XCTAssertTrue(HookTextEngine.detectPatterns("Free for 7 days, no card needed.").contains(.riskReversal))
        XCTAssertTrue(HookTextEngine.detectPatterns("Wait, that did what?").contains(.patternInterrupt))
        XCTAssertEqual(HookTextEngine.detectPatterns("Today we are going to talk about dinner."), [])
    }

    func testATemplateIsFilledFromTheAppsOwnWords() {
        XCTAssertEqual(HookTextEngine.fillHook("Why is nobody talking about {app}?", slots: HookSlots(app: "Dozely")), "Why is nobody talking about Dozely?")
        XCTAssertEqual(HookTextEngine.fillHook("{number} days with {app}.", slots: HookSlots(app: "Dozely", number: "7")), "7 days with Dozely.")
        XCTAssertEqual(HookTextEngine.fillHook("{app} {feature}"), "this app one feature", "Missing slots read as neutral words.")
    }

    func testAnEmptyHookScoresZeroAndAskForAHook() {
        let result: HookTextResult = HookTextEngine.scoreText("")
        XCTAssertEqual(result.score, 0)
        XCTAssertEqual(result.band, .e)
        XCTAssertEqual(result.label, FlowdConstants.checklistLabel)
        XCTAssertFalse(result.suggestions.isEmpty)
    }

    func testALibraryStyleHookOutscoresAFillerOpening() {
        let strong: HookTextResult = HookTextEngine.scoreText("I deleted every other budgeting app. Here is why.")
        let weak: HookTextResult = HookTextEngine.scoreText("Hey guys, so today I am going to show you a really amazing app that I found recently and I think you will like it")
        XCTAssertGreaterThan(strong.score, weak.score)
        XCTAssertTrue(strong.patterns.contains(.confession))
        XCTAssertEqual(strong.primaryPattern, .confession)
        XCTAssertTrue(strong.rule.passes)
        XCTAssertFalse(weak.rule.passes)
        XCTAssertEqual(strong.items.map { (i: HookTextItem) -> Int in return i.max }.reduce(0, +), 100, "The weights add up to 100.")
        XCTAssertEqual(strong.items.reduce(0) { (sum: Int, i: HookTextItem) -> Int in return sum + i.points }, strong.score)
        XCTAssertEqual(strong.band, ScoringEngine.band(for: strong.score))
        XCTAssertEqual(strong.label, FlowdConstants.checklistLabel)
        for item in strong.items where !item.passed {
            XCTAssertNotNil(item.fix, item.id.rawValue + " lost points with no fix.")
        }
    }

    func testARiskyClaimCapsTheScoreAtADAndSaysSo() {
        let result: HookTextResult = HookTextEngine.scoreText("Guaranteed passive income! I made $500 a week with one app. Wait until you see this.")
        XCTAssertTrue(result.capped)
        XCTAssertLessThanOrEqual(result.score, HookTextEngine.maxScoreWithRiskyClaim)
        XCTAssertFalse(result.flags.isEmpty)
        let band: ScoreBand = ScoringEngine.band(for: result.score)
        XCTAssertTrue(band == .d || band == .e, "Never better than a D.")
    }

    func testRewritesAvoidTheRequestedPatternsAndStayWithinTheLimit() {
        let rewrites: [HookRewrite] = HookTextEngine.suggestRewrites(slots: HookSlots(app: "Dozely", category: "sleep", feature: "wind-down", goal: "falling asleep", number: "7"), avoidTypes: [.confession, .pov], limit: 4)
        XCTAssertLessThanOrEqual(rewrites.count, 4)
        XCTAssertFalse(rewrites.isEmpty)
        for rewrite in rewrites {
            XCTAssertFalse([HookType.confession, HookType.pov].contains(rewrite.pattern), rewrite.text)
            XCTAssertFalse(rewrite.text.contains("{"), "Every slot is filled: " + rewrite.text)
        }
        let scores: [Int] = rewrites.map { (r: HookRewrite) -> Int in
            return r.score
        }
        XCTAssertEqual(scores, scores.sorted(by: >), "Best first.")
    }

    // MARK: Hook coaching

    func testTheOnDeviceHookCoachTurnsFeaturesIntoAChecklist() {
        let features: HookFeatures = HookFeatures(
            hookText: "I deleted every other budgeting app.",
            hookStartMs: 0,
            hookEndMs: 1_900,
            speechStartMs: 300,
            onscreenText: "I deleted every other budgeting app",
            onscreenMs: 500,
            faceMs: 200,
            appMs: 2_400,
            firstCutMs: 1_100,
            hookType: .confession,
            hookTypeTrialRates: [.confession: 0.09, .pov: 0.04],
            captionsInSafeZone: true
        )
        let result: HookFeatureResult = ScoringEngine.scoreHookFeatures(features)
        XCTAssertTrue(result.observations.spokenMatchesOnscreen)
        XCTAssertEqual(result.observations.landsMs, 1_900)
        XCTAssertEqual(result.card.points, 100, "Every checklist line is met.")
        XCTAssertEqual(result.card.band, .a)
        XCTAssertEqual(result.card.label, FlowdConstants.checklistLabel)
    }

    func testEveryLostPointComesWithAReasonAndAOneTapFix() {
        let weak: HookObservations = HookObservations(landsMs: 4_200, onscreenMs: nil, spokenMatchesOnscreen: false, faceMs: 2_600, appMs: 6_000, interruptMs: nil, hookTypeKnown: false, speechMs: 2_400, captionsInSafeZone: false)
        let before: ScoredCard = ScoringEngine.scoreHook(weak)
        XCTAssertLessThan(before.points, 40)
        for item in before.items where !item.passed {
            XCTAssertFalse(item.reason.isEmpty)
            XCTAssertNotNil(item.fix)
        }
        let fixes: [ScoreFix] = ScoringEngine.suggestHookFixes(weak)
        XCTAssertFalse(fixes.isEmpty)
        let better: HookObservations = ScoringEngine.applyAllHookFixes(weak)
        XCTAssertGreaterThan(ScoringEngine.scoreHook(better).points, before.points)
        let eachBetter: Bool = fixes.allSatisfy { (fix: ScoreFix) -> Bool in
            return fix.gainPoints > 0
        }
        XCTAssertTrue(eachBetter, "A fix is only offered when it gains points.")
    }

    func testBandsExplainTheDistanceToTheNextOne() {
        let next: (next: ScoreBand?, needed: Int) = ScoringEngine.pointsToNextBand(80)
        XCTAssertEqual(next.next, .a)
        XCTAssertEqual(next.needed, 5)
        let top: (next: ScoreBand?, needed: Int) = ScoringEngine.pointsToNextBand(92)
        XCTAssertNil(top.next)
        XCTAssertEqual(top.needed, 0)
    }

    // MARK: Scam Shield

    func testScamShieldNamesTheRuleAMessageTrips() {
        XCTAssertEqual(ScamShield.warning(for: "There is a small entry fee to join the campaign"), .payToJoin)
        XCTAssertEqual(ScamShield.warning(for: "Please send $50 first"), .payToJoin)
        XCTAssertEqual(ScamShield.warning(for: "Can we continue on WhatsApp?"), .offPlatformChat)
        XCTAssertEqual(ScamShield.warning(for: "dm me on telegram"), .offPlatformChat)
        XCTAssertEqual(ScamShield.warning(for: "You will need a new TikTok account for this"), .burnerAccountDemand)
        XCTAssertEqual(ScamShield.warning(for: "Claim your prize at bit.ly/free"), .suspiciousLink)
        XCTAssertEqual(ScamShield.warning(for: "We pay via PayPal outside the platform"), .noEscrowClaim)
    }

    func testScamShieldLeavesNormalConversationAlone() {
        XCTAssertNil(ScamShield.warning(for: "Thanks for the quick review. I will post it tomorrow morning."))
        XCTAssertNil(ScamShield.warning(for: "Could you share the brief again?"))
        XCTAssertNil(ScamShield.warning(for: ""))
    }

    func testEveryWarningSaysWhatToDoAboutTheMessageNeverTheSender() {
        for reason in ScamReason.allCases {
            let copy: String = ScamShield.copy(for: reason)
            XCTAssertFalse(copy.isEmpty, reason.rawValue)
            XCTAssertFalse(copy.lowercased().contains("you are a"), copy)
        }
        XCTAssertEqual(ScamShield.copy(for: .payToJoin), "flowd never asks creators to pay to take part. If someone asks, report it.")
    }
}
