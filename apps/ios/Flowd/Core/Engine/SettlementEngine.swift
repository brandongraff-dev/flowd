import Foundation

// Escrow, Reserved Slot and the stacked-pay settlement of a post. Mirrors packages/contract/schema/formulas.mjs (funding, reservation,
// settle) and apps/web/src/lib/engine/{pricing,settlement}.ts. The creator app uses it to show true spots left, "Funded", the all-in price a
// brand pays, and exactly how a post's pay is built (CPM first, then CPA, inside the per-video cap).

/// What a bounty budget needs in escrow and what the brand's card is charged.
struct FundingBreakdown: Codable, Hashable, Sendable {
    var budgetCents: Int
    var takeRate: Double
    /// round(budget x take rate). Held in escrow with the budget; only the used part is ever taken.
    var feeReserveCents: Int
    /// budget + fee reserve. The Funded badge needs escrow funded >= this.
    var escrowTotalCents: Int
    /// flowd's match on a first bounty.
    var matchedCents: Int
    var brandFundedCents: Int
    /// 2.9% + $0.30 card processing, passed through at cost.
    var processingCents: Int
    var cardChargeCents: Int
}

/// How one post's pay is built.
struct SettlementResult: Codable, Hashable, Sendable {
    var cpmUncappedCents: Int
    var cpaUncappedCents: Int
    var cpmPayCents: Int
    var cpaPayCents: Int
    var payCents: Int
    var capped: Bool
    var capRemainingCents: Int
    var feeCpmCents: Int
    var feeCpaCents: Int
    var feeCents: Int
    var brandCostCents: Int
}

enum SettlementEngine {
    // MARK: Funding

    /// Card processing passed through at cost: round(2.9% x amount) + $0.30 (0 for no amount).
    static func cardProcessing(_ amountCents: Int) -> Int {
        guard amountCents > 0 else {
            return 0
        }
        return MoneyMath.mulRate(amountCents, FlowdConstants.Fees.cardProcessingRate) + FlowdConstants.Fees.cardProcessingFixedCents
    }

    /// Escrow funding for a bounty budget B (the creator-pay pool).
    static func funding(budgetCents: Int, takeRate: Double, matchedCents: Int = 0) -> FundingBreakdown {
        let feeReserve: Int = MoneyMath.mulRate(budgetCents, takeRate)
        let escrowTotal: Int = budgetCents + feeReserve
        let brandFunded: Int = escrowTotal - matchedCents
        let processing: Int = cardProcessing(brandFunded)
        return FundingBreakdown(
            budgetCents: budgetCents,
            takeRate: takeRate,
            feeReserveCents: feeReserve,
            escrowTotalCents: escrowTotal,
            matchedCents: matchedCents,
            brandFundedCents: brandFunded,
            processingCents: processing,
            cardChargeCents: brandFunded + processing
        )
    }

    /// First bounty: the fee is waived and flowd matches dollar for dollar up to $500, on top of what the brand funds.
    static func firstBountyFunding(brandFundsCents: Int) -> FundingBreakdown {
        let matched: Int = min(FlowdConstants.Fees.matchedFirstBountyCapCents, brandFundsCents)
        return funding(budgetCents: brandFundsCents + matched, takeRate: 0, matchedCents: matched)
    }

    /// Bounty-level all-in effective CPM: card charge x cpm / budget (what the brand pays per 1,000 views when the pool is used). 0 when cpm is 0.
    static func allInCpm(cpmCents: Int, budgetCents: Int, cardChargeCents: Int) -> Int {
        guard cpmCents > 0 && budgetCents > 0 else {
            return 0
        }
        return MoneyMath.roundHalfUp(Double(cardChargeCents * cpmCents) / Double(budgetCents))
    }

    /// All-in price of a flat rate or a CPA event: rate x (1 + take rate) x (1 + 2.9%). The $0.30 fixed fee is excluded (it amortises over the top-up).
    static func allInRate(rateCents: Int, takeRate: Double) -> Int {
        let product: Int = rateCents * (10_000 + MoneyMath.bps(takeRate)) * (10_000 + MoneyMath.bps(FlowdConstants.Fees.cardProcessingRate))
        return MoneyMath.roundHalfUp(Double(product) / 1e8)
    }

    // MARK: Reserved Slot

    /// One reservation unit: per-video cap + the fee on it.
    static func reservationUnit(perVideoCapCents: Int, takeRate: Double) -> Int {
        return perVideoCapCents + MoneyMath.mulRate(perVideoCapCents, takeRate)
    }

    /// Spots a pool can still take: floor(remaining / reservation unit).
    static func spotsLeft(remainingCents: Int, perVideoCapCents: Int, takeRate: Double) -> Int {
        let unit: Int = reservationUnit(perVideoCapCents: perVideoCapCents, takeRate: takeRate)
        guard unit > 0 else {
            return 0
        }
        return max(0, MoneyMath.floorDiv(remainingCents, unit))
    }

    /// The escrow identity every bounty must satisfy: escrow funded = reserved + spent + remaining + refunded.
    static func escrowIdentityHolds(_ bounty: Bounty) -> Bool {
        return bounty.escrowFundedCents == bounty.reservedCents + bounty.spentCents + bounty.remainingCents + bounty.refundedCents
    }

    // MARK: Settlement of a post

    /// Pool pay for one post. CPM leg first, then CPA legs, both inside the per-video cap.
    ///  - cpm pay = min(round(window views x cpm / 1000), cap left)
    ///  - cpa pay = min(installs x r_i + trials x r_t + paid x r_p, cap left - cpm pay)   (payable = link and code only)
    ///  - fee = round(cpm pay x take rate) + round(cpa pay x take rate)                    (per ledger leg)
    ///  - brand cost = pay + fee. Ad commission and flat fees sit outside the cap.
    static func settlePost(
        windowViews: Int,
        cpmCents: Int,
        installs: Int = 0,
        trials: Int = 0,
        paid: Int = 0,
        rates: CpaRates,
        perVideoCapCents: Int,
        takeRate: Double,
        alreadyPaidCents: Int = 0
    ) -> SettlementResult {
        let capLeft: Int = max(0, perVideoCapCents - alreadyPaidCents)
        let cpmUncapped: Int = MoneyMath.roundHalfUp(Double(windowViews * cpmCents) / 1000)
        let cpaUncapped: Int = installs * rates.install + trials * rates.trial + paid * rates.paid
        let cpmPay: Int = min(cpmUncapped, capLeft)
        let cpaPay: Int = min(cpaUncapped, capLeft - cpmPay)
        let pay: Int = cpmPay + cpaPay
        let feeCpm: Int = MoneyMath.mulRate(cpmPay, takeRate)
        let feeCpa: Int = MoneyMath.mulRate(cpaPay, takeRate)
        return SettlementResult(
            cpmUncappedCents: cpmUncapped,
            cpaUncappedCents: cpaUncapped,
            cpmPayCents: cpmPay,
            cpaPayCents: cpaPay,
            payCents: pay,
            capped: cpmUncapped + cpaUncapped > capLeft,
            capRemainingCents: capLeft - pay,
            feeCpmCents: feeCpm,
            feeCpaCents: feeCpa,
            feeCents: feeCpm + feeCpa,
            brandCostCents: pay + feeCpm + feeCpa
        )
    }

    /// Ad commission: 10% of ad-attributed revenue earned in the 60 days after the ad first goes live; paid by the brand, outside the cap.
    static func adCommission(revenueInWindowCents: Int, rate: Double = FlowdConstants.Pay.adCommissionRate) -> Int {
        return MoneyMath.mulRate(revenueInWindowCents, rate)
    }

    /// Winner promotion platform fee: 1% of ad spend. The creator is never charged.
    static func adPlatformFee(spendCents: Int) -> Int {
        return MoneyMath.mulRate(spendCents, FlowdConstants.Fees.adSpendFeeRate)
    }
}
