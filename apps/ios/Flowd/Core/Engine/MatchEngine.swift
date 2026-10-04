import Foundation

// Matching: which bounties a creator sees first. Mirrors apps/web/src/lib/engine/matching.ts and the contract's FORMULAS (match score).
//
// Gates first: any failure hides the bounty or shows it locked, with the reason. Then
//   match = niche overlap x 40 + platform fit x 15 + audience-region fit x 15 + price fit x 15 + brand reliability x 10 + recency x 5
// with every factor 0 to 1. Price fit = min(bounty expected pay / the creator's usual pay, 1.5) / 1.5. Recency halves every 14 days.
// Early access: higher tiers see a new bounty before everyone else (Silver 1 h, Gold 3 h, Platinum 6 h, Elite 12 h).

/// The five gates. A bounty failing any is hidden or shown locked.
enum MatchGate: String, Codable, Hashable, Sendable, CaseIterable {
    case eligibilityTier = "eligibility_tier"
    case country
    case platformAccountLinked = "platform_account_linked"
    case funded
    case notAlreadySubmitted = "not_already_submitted"

    /// What a failed gate says, in words about the situation, never the person.
    var text: String {
        switch self {
        case .eligibilityTier: return "Needs a higher tier or more followers."
        case .country: return "Not open in your country."
        case .platformAccountLinked: return "Needs a linked account on one of its platforms."
        case .funded: return "Not live yet. It is not fully funded or has not started."
        case .notAlreadySubmitted: return "You have already submitted to this bounty."
        }
    }
}

/// The six factors, each 0 to 1 (or points when used for `points`).
struct MatchFactors: Codable, Hashable, Sendable {
    var niche: Double
    var platform: Double
    var region: Double
    var price: Double
    var brandReliability: Double
    var recency: Double
}

struct MatchInput: Hashable, Sendable {
    /// Every gate must be true.
    var gates: [Bool]
    var nicheOverlap: Double
    var platformFit: Double
    var regionFit: Double
    /// Bounty expected pay / the creator's usual pay. Capped at 1.5 in the score.
    var priceRatio: Double
    /// 0 to 100.
    var brandReliability: Double
    var bountyAgeDays: Double
}

/// Expected pay per video at p25, median and p75 for one creator on one bounty (an estimate).
struct ExpectedPayCents: Codable, Hashable, Sendable {
    var p25: Int
    var median: Int
    var p75: Int
}

/// How one bounty fits one creator.
struct BountyMatch: Codable, Hashable, Identifiable, Sendable {
    var bountyId: String
    /// Nil when a gate failed (the bounty is locked).
    var score: Int?
    var locked: Bool
    var gateFailures: [MatchGate]
    /// Why it is locked, in words.
    var lockReasons: [String]
    var factors: MatchFactors
    var points: MatchFactors
    var expectedPay: ExpectedPayCents
    /// Why it ranks where it does.
    var reasons: [String]
    /// When this creator's tier first sees it (release minus the tier's head start).
    var visibleAt: Date
    var visible: Bool

    var id: String {
        return bountyId
    }
}

enum MatchEngine {
    // MARK: The score

    /// The six factors, each 0 to 1. Price is capped: price fit = min(ratio, 1.5) / 1.5.
    static func factors(_ input: MatchInput) -> MatchFactors {
        let cap: Double = FlowdConstants.Matching.priceRatioCap
        return MatchFactors(
            niche: MoneyMath.clamp01(input.nicheOverlap),
            platform: MoneyMath.clamp01(input.platformFit),
            region: MoneyMath.clamp01(input.regionFit),
            price: MoneyMath.clamp(input.priceRatio, 0, cap) / cap,
            brandReliability: MoneyMath.clamp01(input.brandReliability / 100),
            recency: pow(0.5, Swift.max(0, input.bountyAgeDays) / Double(FlowdConstants.Matching.recencyHalfLifeDays))
        )
    }

    /// Points each factor contributes (weight x factor); they add up to the score before rounding.
    static func points(_ f: MatchFactors) -> MatchFactors {
        return MatchFactors(
            niche: f.niche * FlowdConstants.Matching.Weights.niche,
            platform: f.platform * FlowdConstants.Matching.Weights.platform,
            region: f.region * FlowdConstants.Matching.Weights.region,
            price: f.price * FlowdConstants.Matching.Weights.price,
            brandReliability: f.brandReliability * FlowdConstants.Matching.Weights.brandReliability,
            recency: f.recency * FlowdConstants.Matching.Weights.recency
        )
    }

    /// Match score 0 to 100, or nil when a gate fails.
    static func score(_ input: MatchInput) -> Int? {
        if input.gates.contains(false) {
            return nil
        }
        let p: MatchFactors = points(factors(input))
        return MoneyMath.roundHalfUp(p.niche + p.platform + p.region + p.price + p.brandReliability + p.recency)
    }

    /// Matches at or above this rank first and read as "top picks".
    static func isTopPick(_ score: Int?) -> Bool {
        guard let score = score else {
            return false
        }
        return score >= FlowdConstants.Matching.minMatchToRankFirst
    }

    // MARK: Inputs

    /// Share of the bounty's niches the creator covers. A bounty open to any niche is a neutral 0.6.
    static func nicheOverlap(creatorNiches: [Niche], bountyNiches: [Niche]) -> Double {
        if bountyNiches.isEmpty {
            return 0.6
        }
        let covered: Int = bountyNiches.filter { (n: Niche) -> Bool in
            return creatorNiches.contains(n)
        }.count
        return Double(covered) / Double(bountyNiches.count)
    }

    /// Audience-region fit: against a stated minimum US share, or by country when the bounty names regions.
    static func regionFit(creatorCountry: Country, usAudienceRatio: Double, minUsAudienceRatio: Double?, regions: [Country]) -> Double {
        if let minimum = minUsAudienceRatio, minimum > 0 {
            return MoneyMath.clamp01(usAudienceRatio / minimum)
        }
        if regions.isEmpty {
            return 1
        }
        return regions.contains(creatorCountry) ? 1 : 0.3
    }

    private static func connected(_ accounts: [SocialAccount], on platforms: [Platform]) -> [SocialAccount] {
        return accounts.filter { (a: SocialAccount) -> Bool in
            return a.status == .connected && platforms.contains(a.platform)
        }
    }

    /// Ranks the bounties for a creator's feed. Unlocked matches come first by score, then by expected median pay; locked bounties follow, the ones
    /// closest to unlocking (fewest failed gates) first, each with its reasons. Bounties the creator's tier cannot see yet (early access) are left
    /// out unless `includeHidden` is set. `brandReliability` maps a brand id to its Scorecard score (0 to 100; missing = 70).
    static func rank(
        creator: Creator,
        accounts: [SocialAccount],
        bounties: [Bounty],
        brandReliability: [String: Int],
        submittedBountyIds: Set<String>,
        now: Date,
        includeHidden: Bool = false
    ) -> [BountyMatch] {
        var out: [BountyMatch] = []
        for bounty in bounties {
            let linked: [SocialAccount] = connected(accounts, on: bounty.deliverables.platforms)
            let best: SocialAccount? = linked.sorted { (x: SocialAccount, y: SocialAccount) -> Bool in
                return x.medianViews28d > y.medianViews28d
            }.first
            let el: Eligibility = bounty.eligibility
            let followersOk: Bool
            if let minimum = el.minFollowers {
                followersOk = linked.contains(where: { (a: SocialAccount) -> Bool in
                    return a.followers >= minimum
                })
            } else {
                followersOk = true
            }
            let tierOk: Bool
            if let minTier = el.minTier {
                tierOk = creator.tier.atLeast(minTier) && followersOk
            } else {
                tierOk = followersOk
            }
            let gateTier: Bool = tierOk
            let gateCountry: Bool = el.countries.isEmpty || el.countries.contains(creator.country)
            let gateLinked: Bool = !linked.isEmpty
            let gateFunded: Bool = bounty.funded && bounty.status == .live
            let gateNotSubmitted: Bool = !submittedBountyIds.contains(bounty.id)
            let gateResults: [(MatchGate, Bool)] = [
                (.eligibilityTier, gateTier),
                (.country, gateCountry),
                (.platformAccountLinked, gateLinked),
                (.funded, gateFunded),
                (.notAlreadySubmitted, gateNotSubmitted)
            ]
            let failures: [MatchGate] = gateResults.filter { (entry: (MatchGate, Bool)) -> Bool in
                return !entry.1
            }.map { (entry: (MatchGate, Bool)) -> MatchGate in
                return entry.0
            }

            let medianViews: Int = best?.medianViews28d ?? (accounts.map { (a: SocialAccount) -> Int in return a.medianViews28d }.max() ?? 0)
            let expected: ExpectedEarnings = EarningsEngine.expectedEarnings(
                baseMedianViews: medianViews,
                cpmCents: bounty.cpmCents,
                rates: bounty.cpaRates,
                perVideoCapCents: bounty.perVideoCapCents
            )
            let flat: Int = bounty.flatFeeCents
            let pay: ExpectedPayCents = ExpectedPayCents(
                p25: expected.p25.payCents + flat,
                median: expected.median.payCents + flat,
                p75: expected.p75.payCents + flat
            )
            let usual: Int = Swift.max(1, MoneyMath.roundHalfUp(Double(medianViews * FlowdConstants.Pay.defaultCpmCents) / 1000))
            let priceRatio: Double = Double(pay.median) / Double(usual)
            let ageDays: Double = Swift.max(0, now.timeIntervalSince(bounty.publishedAt ?? bounty.createdAt) / 86_400)
            let input: MatchInput = MatchInput(
                gates: [gateTier, gateCountry, gateLinked, gateFunded, gateNotSubmitted],
                nicheOverlap: nicheOverlap(creatorNiches: creator.niches, bountyNiches: el.niches),
                platformFit: best != nil ? ((best?.primary ?? false) ? 1 : 0.8) : 0,
                regionFit: regionFit(
                    creatorCountry: creator.country,
                    usAudienceRatio: best?.usAudienceRatio ?? 0,
                    minUsAudienceRatio: el.minUsAudienceRatio,
                    regions: bounty.deliverables.regions
                ),
                priceRatio: priceRatio,
                brandReliability: Double(brandReliability[bounty.brandId] ?? 70),
                bountyAgeDays: ageDays
            )
            let f: MatchFactors = factors(input)
            let visibleAt: Date = TierEngine.earlyAccessAt(releaseAt: bounty.startsAt, tier: creator.tier)
            let visible: Bool = now >= visibleAt
            if !visible && !includeHidden {
                continue
            }
            var reasons: [String] = []
            if f.niche >= 0.99 {
                reasons.append("Matches your niche.")
            } else if f.niche > 0 {
                reasons.append("Partly matches your niche.")
            }
            if Double(pay.median) / Double(usual) >= 1 {
                reasons.append("Pays at or above what you usually earn.")
            }
            if f.brandReliability >= 0.9 {
                reasons.append("The brand decides fast and pays on time.")
            }
            if f.recency >= 0.8 {
                reasons.append("Just posted.")
            }
            out.append(BountyMatch(
                bountyId: bounty.id,
                score: score(input),
                locked: !failures.isEmpty,
                gateFailures: failures,
                lockReasons: failures.map { (g: MatchGate) -> String in return g.text },
                factors: f,
                points: points(f),
                expectedPay: pay,
                reasons: reasons,
                visibleAt: visibleAt,
                visible: visible
            ))
        }
        return out.sorted { (a: BountyMatch, b: BountyMatch) -> Bool in
            if a.locked != b.locked {
                return !a.locked
            }
            if a.locked {
                if a.gateFailures.count != b.gateFailures.count {
                    return a.gateFailures.count < b.gateFailures.count
                }
                return a.bountyId < b.bountyId
            }
            let sa: Int = a.score ?? 0
            let sb: Int = b.score ?? 0
            if sa != sb {
                return sa > sb
            }
            if a.expectedPay.median != b.expectedPay.median {
                return a.expectedPay.median > b.expectedPay.median
            }
            return a.bountyId < b.bountyId
        }
    }
}
