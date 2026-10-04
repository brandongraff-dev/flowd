import Foundation

// Market maths the creator app shows or checks: price vs fill time (the rate-card price band), fraud score composition (the evidence on a post) and
// the Brief TL;DR. Mirrors packages/contract/schema/formulas.mjs (pricing, fraud) and apps/web/src/lib/engine/{market,fraud}.ts.

/// How long a bounty takes to fill at a CPM.
struct FillTime: Codable, Hashable, Sendable {
    var fillHoursP50: Double
    var fillHoursP80: Double
    var confidence: Double
    var thinMarket: Bool
}

struct PriceCurvePoint: Codable, Hashable, Identifiable, Sendable {
    var cpmCents: Int
    var fillHoursP50: Double
    var fillHoursP80: Double
    var confidence: Double
    var sampleN: Int

    var id: Int {
        return cpmCents
    }
}

struct FraudSignalInput: Hashable, Sendable {
    var signal: FraudSignal
    /// 0...1.
    var severity: Double
    var detail: String?

    init(signal: FraudSignal, severity: Double, detail: String? = nil) {
        self.signal = signal
        self.severity = severity
        self.detail = detail
    }
}

struct FraudScoreResult: Codable, Hashable, Sendable {
    var score: Int
    var band: FraudBand
    var signals: [FraudSignalHit]
}

enum FraudAction: String, Codable, Hashable, Sendable {
    case autoHoldAndQueue = "auto_hold_and_queue"
    case holdForHumanReview = "hold_for_human_review"
    case autoClear = "auto_clear"
}

enum MarketEngine {
    // MARK: Price vs fill time

    /// Day-one pricing heuristic. clearing = the category's clearing CPM; H = the category's median fill hours at that price.
    ///   p50 = max(6, H x (clearing / cpm)^1.6)     p80 = p50 x 1.8
    ///   confidence = sample / (sample + 20), damped by distance from the clearing price: x (1 - min(0.5, |ln(cpm / clearing)|))
    static func fillTime(cpmCents: Int, clearingCpmCents: Int, medianFillHours: Double, sampleN: Int) -> FillTime {
        let p50: Double = Swift.max(
            Double(FlowdConstants.PricingModel.minFillHours),
            medianFillHours * pow(Double(clearingCpmCents) / Double(cpmCents), FlowdConstants.PricingModel.fillExponent)
        )
        let distance: Double = Swift.min(0.5, abs(log(Double(cpmCents) / Double(clearingCpmCents))))
        let confidence: Double = MoneyMath.round2((Double(sampleN) / Double(sampleN + FlowdConstants.PricingModel.confidenceK)) * (1 - distance))
        return FillTime(
            fillHoursP50: MoneyMath.round2(p50),
            fillHoursP80: MoneyMath.round2(p50 * FlowdConstants.PricingModel.p80Multiplier),
            confidence: confidence,
            thinMarket: sampleN < FlowdConstants.PricingModel.thinMarketMinSample
        )
    }

    /// The price-vs-fill curve: six CPM points at 0.6x .. 2.0x of the clearing CPM.
    static func priceCurve(clearingCpmCents: Int, medianFillHours: Double, sampleN: Int) -> [PriceCurvePoint] {
        return FlowdConstants.PricingModel.curveCpmMultipliers.map { (m: Double) -> PriceCurvePoint in
            let cpm: Int = MoneyMath.roundHalfUp(Double(clearingCpmCents) * m)
            let f: FillTime = fillTime(cpmCents: cpm, clearingCpmCents: clearingCpmCents, medianFillHours: medianFillHours, sampleN: sampleN)
            return PriceCurvePoint(cpmCents: cpm, fillHoursP50: f.fillHoursP50, fillHoursP80: f.fillHoursP80, confidence: f.confidence, sampleN: sampleN)
        }
    }

    // MARK: Fraud

    static func fraudBand(_ score: Int) -> FraudBand {
        if score <= FlowdConstants.Fraud.Bands.clean[1] {
            return .clean
        }
        if score <= FlowdConstants.Fraud.Bands.watch[1] {
            return .watch
        }
        if score <= FlowdConstants.Fraud.Bands.review[1] {
            return .review
        }
        return .high
    }

    /// Fraud score = min(100, sum over signals of round(max points x severity)). Every score shows its signals as evidence.
    static func fraudScore(_ signals: [FraudSignalInput]) -> FraudScoreResult {
        var hits: [FraudSignalHit] = []
        for s in signals {
            let points: Int = MoneyMath.roundHalfUp(Double(FlowdConstants.fraudMaxPoints(s.signal)) * s.severity)
            if points > 0 {
                hits.append(FraudSignalHit(signal: s.signal, points: points, severity: s.severity, detail: s.detail ?? FlowdConstants.fraudRule(s.signal)))
            }
        }
        let total: Int = Swift.min(100, hits.reduce(0) { (sum: Int, h: FraudSignalHit) -> Int in
            return sum + h.points
        })
        return FraudScoreResult(score: total, band: fraudBand(total), signals: hits)
    }

    /// What a fraud band does to money.
    static func fraudAction(_ score: Int) -> FraudAction {
        if score >= FlowdConstants.Fraud.holdThreshold {
            return .autoHoldAndQueue
        }
        if score >= FlowdConstants.Fraud.reviewThreshold {
            return .holdForHumanReview
        }
        return .autoClear
    }
}
