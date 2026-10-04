import Foundation

// Integer money maths, identical to the contract's reference (packages/contract/schema/formulas.mjs): cents are `Int`, rates are basis-point
// integers, and rounding is half up per ledger leg, so there is no float drift between the app, the web engine and the server.

enum MoneyMath {
    /// Basis points of a rate: 0.12 -> 1200.
    static func bps(_ rate: Double) -> Int {
        return Int((rate * 10_000).rounded())
    }

    /// round-half-up(cents x rate) with integer basis-point maths (half away from zero, so a clawback is exactly the negative of the pay).
    /// `mulRate(25_000, 0.10)` is 2,500.
    static func mulRate(_ cents: Int, _ rate: Double) -> Int {
        return divRound(cents * bps(rate), 10_000)
    }

    /// Integer division rounded half away from zero, for a positive denominator.
    static func divRound(_ numerator: Int, _ denominator: Int) -> Int {
        guard denominator > 0 else {
            return 0
        }
        let sign: Int = numerator < 0 ? -1 : 1
        return sign * ((abs(numerator) * 2 + denominator) / (2 * denominator))
    }

    /// Floor division that is correct for negative numerators.
    static func floorDiv(_ a: Int, _ b: Int) -> Int {
        let q: Int = a / b
        return (a % b != 0 && ((a < 0) != (b < 0))) ? q - 1 : q
    }

    /// Rounds half away from zero (identical to half up for the non-negative amounts the ledger stores).
    static func roundHalfUp(_ value: Double) -> Int {
        if value < 0 {
            return -Int((-value + 0.5).rounded(.down))
        }
        return Int((value + 0.5).rounded(.down))
    }

    static func clamp(_ value: Double, _ low: Double, _ high: Double) -> Double {
        return min(high, max(low, value))
    }

    static func clamp(_ value: Int, _ low: Int, _ high: Int) -> Int {
        return min(high, max(low, value))
    }

    static func clamp01(_ value: Double) -> Double {
        return min(1, max(0, value))
    }

    /// Round to 2 decimals the way the contract does (Math.round(x * 100) / 100).
    static func round2(_ value: Double) -> Double {
        return Double(roundHalfUp(value * 100)) / 100
    }

    static func sum(_ values: [Int]) -> Int {
        return values.reduce(0, +)
    }

    /// Linear-interpolation quantile (type 7) of an unsorted list. `q` is 0...1.
    static func quantile(_ values: [Double], _ q: Double) -> Double {
        guard !values.isEmpty else {
            return 0
        }
        let sorted: [Double] = values.sorted()
        let position: Double = Double(sorted.count - 1) * q
        let low: Int = Int(position.rounded(.down))
        let high: Int = Int(position.rounded(.up))
        return sorted[low] + (sorted[high] - sorted[low]) * (position - Double(low))
    }

    static func median(_ values: [Double]) -> Double {
        return quantile(values, 0.5)
    }

    /// The typical-earnings band shown beside any top-earner figure (all in cents).
    static func typicalBand(_ values: [Int]) -> TypicalBand {
        let doubles: [Double] = values.map { (value: Int) -> Double in
            return Double(value)
        }
        return TypicalBand(
            n: values.count,
            p25Cents: roundHalfUp(quantile(doubles, 0.25)),
            medianCents: roundHalfUp(quantile(doubles, 0.5)),
            p75Cents: roundHalfUp(quantile(doubles, 0.75)),
            p90Cents: roundHalfUp(quantile(doubles, 0.9))
        )
    }
}

/// Per-event CPA rates in cents. Zero means "this event is not paid".
struct CpaRates: Codable, Hashable, Sendable {
    var install: Int
    var trial: Int
    var paid: Int

    init(install: Int = 0, trial: Int = 0, paid: Int = 0) {
        self.install = install
        self.trial = trial
        self.paid = paid
    }

    /// The defaults a new stacked bounty starts with: $0.40 install, $1.50 trial, $4.00 paid.
    static let defaults: CpaRates = CpaRates(
        install: FlowdConstants.Pay.defaultCpaInstallCents,
        trial: FlowdConstants.Pay.defaultCpaTrialCents,
        paid: FlowdConstants.Pay.defaultCpaPaidCents
    )

    /// The rate for one kind of conversion; 0 when the bounty does not pay it.
    func rate(for kind: ConversionKind) -> Int {
        switch kind {
        case .install: return install
        case .trial: return trial
        case .paid: return paid
        case .unknown: return 0
        }
    }

    var paysAnything: Bool {
        return install > 0 || trial > 0 || paid > 0
    }
}

/// p25 / median / p75 / p90 of cleared earnings in cents: the band every top-earner number is shown beside.
struct TypicalBand: Codable, Hashable, Sendable {
    var n: Int
    var p25Cents: Int
    var medianCents: Int
    var p75Cents: Int
    var p90Cents: Int
}
