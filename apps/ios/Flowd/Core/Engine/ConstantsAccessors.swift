import Foundation

// Typed lookups over the generated `FlowdConstants` (Constants.swift). The generated file holds every number by name; this file answers
// "what is the threshold for this tier" or "what is the take rate for this plan" without any other file hard-coding a value.

extension FlowdConstants {
    /// The honest label every Hook Score, Flow Score and brief check carries: "Checklist score. It gets smarter as bounties settle."
    static let checklistLabel: String = FlowdConstants.Scores.checklistLabel

    /// Bronze to Elite.
    static let tierOrder: [Tier] = [.bronze, .silver, .gold, .platinum, .elite]

    // MARK: Plans and take rates

    /// Plan take rate on bounty, offer and spec spend: Free 12%, Pro 10%, Scale 8%.
    static func takeRate(plan: Plan) -> Double {
        switch plan {
        case .free: return FlowdConstants.Plans.Free.takeRate
        case .pro: return FlowdConstants.Plans.Pro.takeRate
        case .scale: return FlowdConstants.Plans.Scale.takeRate
        case .unknown: return FlowdConstants.Plans.Free.takeRate
        }
    }

    /// The take rate that applies to a bounty: 0 on the first bounty (fee waived), a flat 6% for CPA-only and install-only bounties, else the plan rate.
    static func takeRate(plan: Plan, type: BountyType, firstBountyWaived: Bool) -> Double {
        if firstBountyWaived {
            return 0
        }
        if type == .cpa || type == .installOnly {
            return FlowdConstants.Fees.cpaOnlyTakeRate
        }
        return takeRate(plan: plan)
    }

    // MARK: Tiers

    static func tierThresholds(_ tier: Tier) -> TierThresholds {
        switch tier {
        case .bronze, .unknown:
            return TierThresholds(
                lifetimeClearedCents: FlowdConstants.Tiers.Thresholds.Bronze.lifetimeClearedCents,
                approvedCount: FlowdConstants.Tiers.Thresholds.Bronze.approvedCount,
                approvalRateMin: FlowdConstants.Tiers.Thresholds.Bronze.approvalRateMin,
                reliabilityMin: FlowdConstants.Tiers.Thresholds.Bronze.reliabilityMin,
                manualReview: FlowdConstants.Tiers.Thresholds.Bronze.manualReview
            )
        case .silver:
            return TierThresholds(
                lifetimeClearedCents: FlowdConstants.Tiers.Thresholds.Silver.lifetimeClearedCents,
                approvedCount: FlowdConstants.Tiers.Thresholds.Silver.approvedCount,
                approvalRateMin: FlowdConstants.Tiers.Thresholds.Silver.approvalRateMin,
                reliabilityMin: FlowdConstants.Tiers.Thresholds.Silver.reliabilityMin,
                manualReview: FlowdConstants.Tiers.Thresholds.Silver.manualReview
            )
        case .gold:
            return TierThresholds(
                lifetimeClearedCents: FlowdConstants.Tiers.Thresholds.Gold.lifetimeClearedCents,
                approvedCount: FlowdConstants.Tiers.Thresholds.Gold.approvedCount,
                approvalRateMin: FlowdConstants.Tiers.Thresholds.Gold.approvalRateMin,
                reliabilityMin: FlowdConstants.Tiers.Thresholds.Gold.reliabilityMin,
                manualReview: FlowdConstants.Tiers.Thresholds.Gold.manualReview
            )
        case .platinum:
            return TierThresholds(
                lifetimeClearedCents: FlowdConstants.Tiers.Thresholds.Platinum.lifetimeClearedCents,
                approvedCount: FlowdConstants.Tiers.Thresholds.Platinum.approvedCount,
                approvalRateMin: FlowdConstants.Tiers.Thresholds.Platinum.approvalRateMin,
                reliabilityMin: FlowdConstants.Tiers.Thresholds.Platinum.reliabilityMin,
                manualReview: FlowdConstants.Tiers.Thresholds.Platinum.manualReview
            )
        case .elite:
            return TierThresholds(
                lifetimeClearedCents: FlowdConstants.Tiers.Thresholds.Elite.lifetimeClearedCents,
                approvedCount: FlowdConstants.Tiers.Thresholds.Elite.approvedCount,
                approvalRateMin: FlowdConstants.Tiers.Thresholds.Elite.approvalRateMin,
                reliabilityMin: FlowdConstants.Tiers.Thresholds.Elite.reliabilityMin,
                manualReview: FlowdConstants.Tiers.Thresholds.Elite.manualReview
            )
        }
    }

    static func tierPerks(_ tier: Tier) -> TierPerks {
        switch tier {
        case .bronze, .unknown:
            return TierPerks(
                earlyAccessHours: FlowdConstants.Tiers.Perks.Bronze.earlyAccessHours,
                rateCard: FlowdConstants.Tiers.Perks.Bronze.rateCard,
                instantCashoutFreePerWeek: FlowdConstants.Tiers.Perks.Bronze.instantCashoutFreePerWeek,
                instantCashoutUnlimited: FlowdConstants.Tiers.Perks.Bronze.instantCashoutUnlimited,
                crewsLead: FlowdConstants.Tiers.Perks.Bronze.crewsLead,
                auctions: FlowdConstants.Tiers.Perks.Bronze.auctions,
                featuredProfile: FlowdConstants.Tiers.Perks.Bronze.featuredProfile
            )
        case .silver:
            return TierPerks(
                earlyAccessHours: FlowdConstants.Tiers.Perks.Silver.earlyAccessHours,
                rateCard: FlowdConstants.Tiers.Perks.Silver.rateCard,
                instantCashoutFreePerWeek: FlowdConstants.Tiers.Perks.Silver.instantCashoutFreePerWeek,
                instantCashoutUnlimited: FlowdConstants.Tiers.Perks.Silver.instantCashoutUnlimited,
                crewsLead: FlowdConstants.Tiers.Perks.Silver.crewsLead,
                auctions: FlowdConstants.Tiers.Perks.Silver.auctions,
                featuredProfile: FlowdConstants.Tiers.Perks.Silver.featuredProfile
            )
        case .gold:
            return TierPerks(
                earlyAccessHours: FlowdConstants.Tiers.Perks.Gold.earlyAccessHours,
                rateCard: FlowdConstants.Tiers.Perks.Gold.rateCard,
                instantCashoutFreePerWeek: FlowdConstants.Tiers.Perks.Gold.instantCashoutFreePerWeek,
                instantCashoutUnlimited: FlowdConstants.Tiers.Perks.Gold.instantCashoutUnlimited,
                crewsLead: FlowdConstants.Tiers.Perks.Gold.crewsLead,
                auctions: FlowdConstants.Tiers.Perks.Gold.auctions,
                featuredProfile: FlowdConstants.Tiers.Perks.Gold.featuredProfile
            )
        case .platinum:
            return TierPerks(
                earlyAccessHours: FlowdConstants.Tiers.Perks.Platinum.earlyAccessHours,
                rateCard: FlowdConstants.Tiers.Perks.Platinum.rateCard,
                instantCashoutFreePerWeek: FlowdConstants.Tiers.Perks.Platinum.instantCashoutFreePerWeek,
                instantCashoutUnlimited: FlowdConstants.Tiers.Perks.Platinum.instantCashoutUnlimited,
                crewsLead: FlowdConstants.Tiers.Perks.Platinum.crewsLead,
                auctions: FlowdConstants.Tiers.Perks.Platinum.auctions,
                featuredProfile: FlowdConstants.Tiers.Perks.Platinum.featuredProfile
            )
        case .elite:
            return TierPerks(
                earlyAccessHours: FlowdConstants.Tiers.Perks.Elite.earlyAccessHours,
                rateCard: FlowdConstants.Tiers.Perks.Elite.rateCard,
                instantCashoutFreePerWeek: FlowdConstants.Tiers.Perks.Elite.instantCashoutFreePerWeek,
                instantCashoutUnlimited: FlowdConstants.Tiers.Perks.Elite.instantCashoutUnlimited,
                crewsLead: FlowdConstants.Tiers.Perks.Elite.crewsLead,
                auctions: FlowdConstants.Tiers.Perks.Elite.auctions,
                featuredProfile: FlowdConstants.Tiers.Perks.Elite.featuredProfile
            )
        }
    }

    // MARK: Scores

    /// Lowest points that still earn a band (A 85, B 70, C 55, D 40, E 0).
    static func bandFloor(_ band: ScoreBand) -> Int {
        switch band {
        case .a: return FlowdConstants.Scores.Bands.a
        case .b: return FlowdConstants.Scores.Bands.b
        case .c: return FlowdConstants.Scores.Bands.c
        case .d: return FlowdConstants.Scores.Bands.d
        case .e, .unknown: return FlowdConstants.Scores.Bands.e
        }
    }

    /// Predicted-views multiplier of a Flow Score band (A 1.6 ... E 0.3).
    static func bandViewMultiplier(_ band: ScoreBand) -> Double {
        switch band {
        case .a: return FlowdConstants.Scores.BandViewMultiplier.a
        case .b: return FlowdConstants.Scores.BandViewMultiplier.b
        case .c: return FlowdConstants.Scores.BandViewMultiplier.c
        case .d: return FlowdConstants.Scores.BandViewMultiplier.d
        case .e, .unknown: return FlowdConstants.Scores.BandViewMultiplier.e
        }
    }

    // MARK: Windows

    /// Hours before a conversion of this kind clears (install 24, trial 72, paid 168).
    static func cpaClearHours(_ kind: ConversionKind) -> Int {
        switch kind {
        case .install: return FlowdConstants.Windows.CpaClearHours.install
        case .trial: return FlowdConstants.Windows.CpaClearHours.trial
        case .paid, .unknown: return FlowdConstants.Windows.CpaClearHours.paid
        }
    }

    // MARK: Attribution

    /// CPA pays only on `link` and `code` conversions; MMP, survey and modelled numbers are reported and never paid.
    static func isPayable(source: ConversionSource) -> Bool {
        return source == .link || source == .code
    }

    // MARK: Fraud

    static func fraudMaxPoints(_ signal: FraudSignal) -> Int {
        switch signal {
        case .viewSpikeNoEngagement: return FlowdConstants.Fraud.Signals.ViewSpikeNoEngagement.maxPoints
        case .capClustering: return FlowdConstants.Fraud.Signals.CapClustering.maxPoints
        case .boughtViewsPattern: return FlowdConstants.Fraud.Signals.BoughtViewsPattern.maxPoints
        case .geoMismatch: return FlowdConstants.Fraud.Signals.GeoMismatch.maxPoints
        case .viewToFollowerOutlier: return FlowdConstants.Fraud.Signals.ViewToFollowerOutlier.maxPoints
        case .newAccount: return FlowdConstants.Fraud.Signals.NewAccount.maxPoints
        case .duplicateHash: return FlowdConstants.Fraud.Signals.DuplicateHash.maxPoints
        case .engagementAnomaly: return FlowdConstants.Fraud.Signals.EngagementAnomaly.maxPoints
        case .trafficSourceAnomaly: return FlowdConstants.Fraud.Signals.TrafficSourceAnomaly.maxPoints
        case .curveShape: return FlowdConstants.Fraud.Signals.CurveShape.maxPoints
        case .unknown: return 0
        }
    }

    static func fraudRule(_ signal: FraudSignal) -> String {
        switch signal {
        case .viewSpikeNoEngagement: return FlowdConstants.Fraud.Signals.ViewSpikeNoEngagement.rule
        case .capClustering: return FlowdConstants.Fraud.Signals.CapClustering.rule
        case .boughtViewsPattern: return FlowdConstants.Fraud.Signals.BoughtViewsPattern.rule
        case .geoMismatch: return FlowdConstants.Fraud.Signals.GeoMismatch.rule
        case .viewToFollowerOutlier: return FlowdConstants.Fraud.Signals.ViewToFollowerOutlier.rule
        case .newAccount: return FlowdConstants.Fraud.Signals.NewAccount.rule
        case .duplicateHash: return FlowdConstants.Fraud.Signals.DuplicateHash.rule
        case .engagementAnomaly: return FlowdConstants.Fraud.Signals.EngagementAnomaly.rule
        case .trafficSourceAnomaly: return FlowdConstants.Fraud.Signals.TrafficSourceAnomaly.rule
        case .curveShape: return FlowdConstants.Fraud.Signals.CurveShape.rule
        case .unknown: return ""
        }
    }
}

/// The funnel the earnings estimates assume per view: 0.45% visit, 38% of visits install, 6.2% of installs start a trial, 34.8% of trials pay.
struct FunnelAssumptions: Hashable, Sendable {
    var viewToVisit: Double
    var visitToInstall: Double
    var installToTrial: Double
    var trialToPaid: Double
    var quantileP25: Double
    var quantileMedian: Double
    var quantileP75: Double
    var bandLow: Double
    var bandMedian: Double
    var bandHigh: Double

    static let defaults: FunnelAssumptions = FunnelAssumptions(
        viewToVisit: FlowdConstants.FunnelDefaults.viewToVisit,
        visitToInstall: FlowdConstants.FunnelDefaults.visitToInstall,
        installToTrial: FlowdConstants.FunnelDefaults.installToTrial,
        trialToPaid: FlowdConstants.FunnelDefaults.trialToPaid,
        quantileP25: FlowdConstants.FunnelDefaults.ViewsQuantileRatio.p25,
        quantileMedian: FlowdConstants.FunnelDefaults.ViewsQuantileRatio.median,
        quantileP75: FlowdConstants.FunnelDefaults.ViewsQuantileRatio.p75,
        bandLow: FlowdConstants.FunnelDefaults.ConversionBandRatio.low,
        bandMedian: FlowdConstants.FunnelDefaults.ConversionBandRatio.median,
        bandHigh: FlowdConstants.FunnelDefaults.ConversionBandRatio.high
    )
}
