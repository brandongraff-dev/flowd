import Foundation

// WalletAPI: Cleared and Pending side by side (never summed), the Money Clock (every earning with its state, dated ETA and named reason), the ledger,
// earnings reports, weekly and instant payouts (the fee is shown before the creator confirms), payout methods, proofs and Wrapped, the Tax Desk
// ("Not tax advice") and the Rights Vault.

extension MockFlowdAPI {
    // MARK: Wallet

    private func blockers(for hold: HoldReason?) -> [PayoutBlocker] {
        switch hold {
        case .some(.taxInfoMissing): return [.taxInfo]
        case .some(.identityCheck): return [.identity]
        case .some(.payoutMethodMissing): return [.payoutMethod]
        default: return []
        }
    }

    /// The fee, net and arrival of an instant cash-out, shown before the creator confirms.
    func buildPreview(amountCents: Int?) throws -> PayoutPreview {
        let creator: Creator = try meRow()
        let cleared: Int = try payableRows().reduce(0) { (total: Int, r: MoneyClockRow) -> Int in
            return total + r.amountCents
        }
        let amount: Int = amountCents ?? cleared
        let founding: Bool = MoneyClockEngine.foundingFreeActive(founding: creator.founding, perksUntil: creator.foundingPerksUntil, now: now)
        let used: Int = MoneyClockEngine.freeInstantUsedThisWeek(payouts: try myPayouts(), now: now)
        let preview: InstantCashOutPreview = MoneyClockEngine.instantCashOutPreview(
            amountCents: amount,
            tier: creator.tier,
            foundingFree: founding,
            freeInstantUsedThisWeek: used,
            clearedCents: cleared
        )
        let hold: HoldReason? = try payoutHold()
        let blocking: [PayoutBlocker] = blockers(for: hold)
        let capable: Bool = creator.payoutMethod?.instantCapable ?? false
        var summary: String = preview.summary
        let payoutMethodText: String? = creator.payoutMethod == nil ? nil : methodLabel(creator)
        var ok: Bool = preview.quote.ok && blocking.isEmpty
        if preview.quote.ok && blocking.isEmpty && !capable {
            ok = false
            summary = "Your payout method doesn't support instant cash-out. Add a debit card to cash out instantly, or wait for the free weekly payout."
        }
        return PayoutPreview(
            amountCents: amount,
            clearedCents: cleared,
            ok: ok,
            feeCents: preview.quote.feeCents,
            netCents: preview.quote.netCents,
            listFeeCents: preview.quote.listFeeCents,
            freeInstant: preview.quote.freeInstant,
            freeReason: preview.freeReason,
            summary: summary,
            refusal: preview.quote.refusal,
            blockers: blocking,
            methodLabel: payoutMethodText,
            arrivesAtEstimate: MoneyClockEngine.estimatePayoutArrival(kind: .instant, initiatedAt: now),
            nextWeeklyPayoutAt: MoneyClockEngine.nextWeeklyPayout(after: now)
        )
    }

    func wallet() async throws -> WalletSummary {
        try requireSignedIn()
        try reconcileIfNeeded()
        let creator: Creator = try meRow()
        let rows: [MoneyClockRow] = try myMoneyRows()
        let summary: MoneyClockSummary = MoneyClockEngine.summarize(rows, now: now)
        var nextCents: Int = 0
        if let next = summary.nextClearingAt {
            for row in rows where (row.state == .accruing || row.state == .pending) && row.etaAt == next {
                nextCents += row.amountCents
            }
        }
        var heldByReason: [MoneyClockReason: (cents: Int, rows: Int)] = [:]
        for row in rows where row.state == .held {
            let current: (cents: Int, rows: Int) = heldByReason[row.reason] ?? (cents: 0, rows: 0)
            heldByReason[row.reason] = (cents: current.cents + row.amountCents, rows: current.rows + 1)
        }
        let holds: [WalletHold] = heldByReason.map { (entry: (key: MoneyClockReason, value: (cents: Int, rows: Int))) -> WalletHold in
            return WalletHold(reason: entry.key, cents: entry.value.cents, rows: entry.value.rows, nextStep: MoneyClockEngine.holdStep(entry.key) ?? "")
        }.sorted { (a: WalletHold, b: WalletHold) -> Bool in
            return a.cents > b.cents
        }
        let hold: HoldReason? = try payoutHold()
        let paidOut: Int = try myPayouts().filter { (p: Payout) -> Bool in
            return p.status == .paid || p.status == .inTransit
        }.reduce(0) { (total: Int, p: Payout) -> Int in
            return total + p.netCents
        }
        var preview: PayoutPreview? = nil
        if summary.clearedCents > 0 {
            preview = try buildPreview(amountCents: nil)
        }
        return WalletSummary(
            asOf: now,
            tier: creator.tier,
            accruingCents: summary.accruingCents,
            pendingCents: summary.pendingCents,
            clearedCents: summary.clearedCents,
            heldCents: summary.heldCents,
            paidOutCents: paidOut,
            lifetimeClearedCents: creator.lifetimeClearedCents,
            nextClearsAt: summary.nextClearingAt,
            nextClearsCents: nextCents,
            nextPayoutAt: MoneyClockEngine.nextWeeklyPayout(after: now),
            nextPayoutCents: summary.clearedCents,
            holds: holds,
            blockers: blockers(for: hold),
            payoutMethod: creator.payoutMethod,
            instantPreview: preview,
            freeInstantUsedThisWeek: MoneyClockEngine.freeInstantUsedThisWeek(payouts: try myPayouts(), now: now)
        )
    }

    // MARK: Money Clock and ledger

    private func stateOrder(_ state: MoneyClockState) -> Int {
        switch state {
        case .accruing: return 0
        case .pending: return 1
        case .held: return 2
        case .cleared: return 3
        case .paid: return 4
        case .reversed: return 5
        case .unknown: return 6
        }
    }

    func moneyClock() async throws -> [MoneyClockRow] {
        try requireSignedIn()
        try reconcileIfNeeded()
        return try myMoneyRows().sorted { (a: MoneyClockRow, b: MoneyClockRow) -> Bool in
            let oa: Int = stateOrder(a.state)
            let ob: Int = stateOrder(b.state)
            if oa != ob {
                return oa < ob
            }
            if a.state == .paid {
                return (a.paidAt ?? a.earnedAt) > (b.paidAt ?? b.earnedAt)
            }
            let ea: Date = a.etaAt ?? Date.distantFuture
            let eb: Date = b.etaAt ?? Date.distantFuture
            if ea != eb {
                return ea < eb
            }
            return a.earnedAt > b.earnedAt
        }
    }

    func ledger(limit: Int) async throws -> [LedgerEntry] {
        try requireSignedIn()
        try reconcileIfNeeded()
        let rows: [LedgerEntry] = try myLedger().sorted { (a: LedgerEntry, b: LedgerEntry) -> Bool in
            if a.postedAt != b.postedAt {
                return a.postedAt > b.postedAt
            }
            return a.id > b.id
        }
        return Array(rows.prefix(Swift.max(0, limit)))
    }

    // MARK: Earnings report

    func earnings(period: EarningsPeriod) async throws -> EarningsReport {
        try requireSignedIn()
        try reconcileIfNeeded()
        let moment: Date = now
        var starts: [Date] = []
        switch period {
        case .day:
            let today: Date = FlowdCalendar.dayStart(moment)
            for offset in stride(from: 13, through: 0, by: -1) {
                starts.append(FlowdCalendar.addDays(today, -Double(offset)))
            }
        case .week:
            let thisWeek: Date = FlowdCalendar.isoWeekStart(moment)
            for offset in stride(from: 11, through: 0, by: -1) {
                starts.append(FlowdCalendar.addDays(thisWeek, -Double(offset * 7)))
            }
        case .month:
            let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = FlowdCalendar.components(moment)
            let thisMonth: Date = FlowdCalendar.make(year: c.year, month: c.month, day: 1)
            for offset in stride(from: 5, through: 0, by: -1) {
                starts.append(FlowdCalendar.addMonths(thisMonth, -offset))
            }
        }
        func end(of index: Int) -> Date {
            if index + 1 < starts.count {
                return starts[index + 1]
            }
            switch period {
            case .day: return FlowdCalendar.addDays(starts[index], 1)
            case .week: return FlowdCalendar.addDays(starts[index], 7)
            case .month: return FlowdCalendar.addMonths(starts[index], 1)
            }
        }
        func label(_ date: Date) -> String {
            let utc: TimeZone = TimeZone(identifier: "UTC") ?? TimeZone.current
            switch period {
            case .day: return Fmt.dayLabel(date, timeZone: utc)
            case .week:
                let week: String = FlowdCalendar.isoWeek(date)
                return "W" + String(week.suffix(2))
            case .month:
                let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = FlowdCalendar.components(date)
                let names: [String] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                return names[Swift.max(0, Swift.min(11, c.month - 1))]
            }
        }
        let from: Date = starts.first ?? moment
        let to: Date = end(of: Swift.max(0, starts.count - 1))
        let rows: [MoneyClockRow] = try myMoneyRows().filter { (r: MoneyClockRow) -> Bool in
            return r.state != .reversed && r.earnedAt >= from && r.earnedAt < to
        }
        var buckets: [EarningsBucket] = []
        for (index, start) in starts.enumerated() {
            let finish: Date = end(of: index)
            var earned: Int = 0
            var cleared: Int = 0
            var pending: Int = 0
            for row in rows where row.earnedAt >= start && row.earnedAt < finish {
                earned += row.amountCents
                switch row.state {
                case .cleared, .paid:
                    cleared += row.amountCents
                case .accruing, .pending:
                    pending += row.amountCents
                case .held, .reversed, .unknown:
                    break
                }
            }
            buckets.append(EarningsBucket(label: label(start), start: start, earnedCents: earned, clearedCents: cleared, pendingCents: pending))
        }
        let fees: Int = try myPayouts().filter { (p: Payout) -> Bool in
            return p.requestedAt >= from && p.requestedAt < to && p.status != .failed && p.status != .cancelled
        }.reduce(0) { (total: Int, p: Payout) -> Int in
            return total + p.feeCents
        }
        let gross: Int = rows.reduce(0) { (total: Int, r: MoneyClockRow) -> Int in
            return total + r.amountCents
        }
        let bounties: [String: Bounty] = Dictionary(uniqueKeysWithValues: try store.bounties.all().map { (b: Bounty) -> (String, Bounty) in
            return (b.id, b)
        })
        var byBountyCents: [String: Int] = [:]
        var byBountyPosts: [String: Set<String>] = [:]
        var byBrandCents: [String: Int] = [:]
        var byBrandPosts: [String: Set<String>] = [:]
        for row in rows where !row.bountyId.isEmpty {
            byBountyCents[row.bountyId, default: 0] += row.amountCents
            byBountyPosts[row.bountyId, default: []].insert(row.postId ?? row.id)
            if let bounty = bounties[row.bountyId] {
                byBrandCents[bounty.brandId, default: 0] += row.amountCents
                byBrandPosts[bounty.brandId, default: []].insert(row.postId ?? row.id)
            }
        }
        var byBounty: [EarningsBreakdownRow] = []
        for (id, cents) in byBountyCents {
            guard let bounty = bounties[id] else {
                continue
            }
            let app: BrandApp? = try store.apps.find(bounty.appId)
            byBounty.append(EarningsBreakdownRow(id: id, title: bounty.title, subtitle: app?.name, art: bounty.art, cents: cents, posts: byBountyPosts[id]?.count ?? 0))
        }
        byBounty.sort { (a: EarningsBreakdownRow, b: EarningsBreakdownRow) -> Bool in
            if a.cents != b.cents {
                return a.cents > b.cents
            }
            return a.id < b.id
        }
        var byBrand: [EarningsBreakdownRow] = []
        for (id, cents) in byBrandCents {
            guard let brand = try store.brands.find(id) else {
                continue
            }
            byBrand.append(EarningsBreakdownRow(id: id, title: brand.name, subtitle: brand.tagline, art: brand.logo, cents: cents, posts: byBrandPosts[id]?.count ?? 0))
        }
        byBrand.sort { (a: EarningsBreakdownRow, b: EarningsBreakdownRow) -> Bool in
            if a.cents != b.cents {
                return a.cents > b.cents
            }
            return a.id < b.id
        }
        func sum(_ states: [MoneyClockState]) -> Int {
            return rows.filter { (r: MoneyClockRow) -> Bool in
                return states.contains(r.state)
            }.reduce(0) { (total: Int, r: MoneyClockRow) -> Int in
                return total + r.amountCents
            }
        }
        let monthly: TypicalBand = try typicalBand()
        let scale: Double
        switch period {
        case .day: scale = 1.0 / 30.0
        case .week: scale = 7.0 / 30.0
        case .month: scale = 1.0
        }
        let typical: TypicalBand = TypicalBand(
            n: monthly.n,
            p25Cents: MoneyMath.roundHalfUp(Double(monthly.p25Cents) * scale),
            medianCents: MoneyMath.roundHalfUp(Double(monthly.medianCents) * scale),
            p75Cents: MoneyMath.roundHalfUp(Double(monthly.p75Cents) * scale),
            p90Cents: MoneyMath.roundHalfUp(Double(monthly.p90Cents) * scale)
        )
        return EarningsReport(
            period: period,
            from: from,
            to: to,
            buckets: buckets,
            grossCents: gross,
            feesCents: fees,
            netCents: gross - fees,
            clearedCents: sum([.cleared, .paid]),
            pendingCents: sum([.accruing, .pending]),
            paidCents: sum([.paid]),
            byBounty: Array(byBounty.prefix(8)),
            byBrand: Array(byBrand.prefix(8)),
            typical: typical,
            disclaimer: EarningsEngine.disclaimer
        )
    }

    // MARK: Payouts

    func payouts() async throws -> [Payout] {
        try requireSignedIn()
        try reconcileIfNeeded()
        return try myPayouts().filter { (p: Payout) -> Bool in
            return p.status != .cancelled
        }.sorted { (a: Payout, b: Payout) -> Bool in
            let da: Date = a.initiatedAt ?? a.scheduledFor
            let db: Date = b.initiatedAt ?? b.scheduledFor
            if da != db {
                return da > db
            }
            return a.id > b.id
        }
    }

    func payoutDetail(id: String) async throws -> PayoutDetail {
        try requireSignedIn()
        try reconcileIfNeeded()
        guard let payout = try store.payouts.find(id), payout.creatorId == meId else {
            throw FlowdAPIError.notFound("that payout")
        }
        var rows: [MoneyClockRow] = try myMoneyRows().filter { (r: MoneyClockRow) -> Bool in
            return r.payoutId == id
        }
        if rows.isEmpty && (payout.status == .scheduled || payout.status == .held) {
            rows = try payableRows()
            if payout.status == .held {
                rows.append(contentsOf: try myMoneyRows().filter { (r: MoneyClockRow) -> Bool in
                    return r.state == .held && r.payoutId == nil && MoneyClockEngine.isHoldReason(r.reason)
                })
            }
        }
        var arrives: Date? = nil
        if let started = payout.initiatedAt {
            arrives = MoneyClockEngine.estimatePayoutArrival(kind: payout.kind, initiatedAt: started)
        }
        return PayoutDetail(payout: payout, rows: rows, proof: try store.proofs.find(payout.proofId), arrivesAt: arrives)
    }

    func payoutPreview(amountCents: Int?) async throws -> PayoutPreview {
        try requireSignedIn()
        try reconcileIfNeeded()
        return try buildPreview(amountCents: amountCents)
    }

    func instantPayout(_ request: InstantPayoutRequest) async throws -> Payout {
        try requireSignedIn()
        try reconcileIfNeeded()
        if let known = remembered(request.idempotencyKey, operation: "instant_payout"), let again = try store.payouts.find(known) {
            return again
        }
        let creator: Creator = try meRow()
        if let hold = try payoutHold() {
            switch hold {
            case .taxInfoMissing: throw FlowdAPIError.taxInfoMissing
            case .identityCheck: throw FlowdAPIError.identityCheckRequired
            default: throw FlowdAPIError.methodMissing
            }
        }
        guard let method = creator.payoutMethod, method.instantCapable else {
            throw FlowdAPIError.conflict("Your payout method does not support instant cash-out. Add a debit card to cash out instantly, or wait for the free weekly payout.")
        }
        if request.amountCents < FlowdConstants.Fees.instantMinAmountCents {
            throw FlowdAPIError.belowMinimum(minimumCents: FlowdConstants.Fees.instantMinAmountCents)
        }
        let rows: [MoneyClockRow] = try payableRows().sorted { (a: MoneyClockRow, b: MoneyClockRow) -> Bool in
            return (a.clearedAt ?? a.earnedAt) < (b.clearedAt ?? b.earnedAt)
        }
        let cleared: Int = rows.reduce(0) { (total: Int, r: MoneyClockRow) -> Int in
            return total + r.amountCents
        }
        if request.amountCents > cleared {
            throw FlowdAPIError.validationFailed("That is more than you have cleared.")
        }
        // Whole earnings only: the oldest cleared rows that fit inside the amount.
        var picked: [MoneyClockRow] = []
        var gross: Int = 0
        for row in rows {
            if gross + row.amountCents <= request.amountCents {
                picked.append(row)
                gross += row.amountCents
            }
        }
        if gross < FlowdConstants.Fees.instantMinAmountCents {
            throw FlowdAPIError.belowMinimum(minimumCents: FlowdConstants.Fees.instantMinAmountCents)
        }
        let moment: Date = now
        let founding: Bool = MoneyClockEngine.foundingFreeActive(founding: creator.founding, perksUntil: creator.foundingPerksUntil, now: moment)
        let used: Int = MoneyClockEngine.freeInstantUsedThisWeek(payouts: try myPayouts(), now: moment)
        let quote: InstantPayoutQuote = MoneyClockEngine.instantPayout(
            amountCents: gross,
            tier: creator.tier,
            foundingFree: founding,
            freeInstantUsedThisWeek: used,
            clearedCents: cleared
        )
        if !quote.ok {
            throw FlowdAPIError.validationFailed("That cash-out can't go through. Check the amount and try again.")
        }
        let id: String = try nextPayoutId()
        let draft: Payout = Payout(
            id: id,
            creatorId: meId,
            kind: .instant,
            status: .processing,
            grossCents: gross,
            feeCents: quote.feeCents,
            netCents: quote.netCents,
            runId: nil,
            requestedAt: moment,
            scheduledFor: moment,
            initiatedAt: nil,
            paidAt: nil,
            failedReason: nil,
            holdReason: nil,
            methodLabel: methodLabel(creator),
            stripeTransferId: nil,
            ledgerTxnId: nil,
            itemCount: picked.count,
            tierAtPayout: creator.tier,
            freeInstant: quote.freeInstant,
            proofId: proofId(for: id)
        )
        try store.payouts.append(draft)
        let paid: Payout = try pay(rows: picked, payout: draft, grossCents: gross, feeCents: quote.feeCents, at: moment)
        let arrives: Date = MoneyClockEngine.estimatePayoutArrival(kind: .instant, initiatedAt: moment)
        try notify(
            .payoutPaid,
            title: Fmt.money(quote.netCents) + " is on its way",
            body: quote.freeInstant ? "Instant cash-out, free. It arrives about " + Fmt.timeLabel(arrives, timeZone: TimeZone.current) + "." : "Fee " + Fmt.money(quote.feeCents) + ". It arrives within 30 minutes.",
            amountCents: quote.netCents,
            deepLink: "flowd://payout/" + paid.id,
            refKind: "payout",
            refId: paid.id
        )
        _ = try scheduleWeekly()
        try refreshCreatorStats(at: moment)
        remember(request.idempotencyKey, operation: "instant_payout", resourceId: paid.id)
        return paid
    }

    // MARK: Payout methods (mock Connect; only the last four digits are ever stored)

    func payoutMethods() async throws -> [PayoutMethod] {
        try requireSignedIn()
        let creator: Creator = try meRow()
        if let method = creator.payoutMethod {
            return [method]
        }
        return []
    }

    func addPayoutMethod(_ request: AddPayoutMethodRequest) async throws -> PayoutMethod {
        try requireSignedIn()
        if !Rx.test(#"^\d{4}$"#, in: request.last4) {
            throw FlowdAPIError.validationFailed("Enter the last four digits of the account or card.")
        }
        let id: String = try nextIdLazy("pm", width: 0, existing: { () throws -> [String] in
            return try self.store.creators.all().compactMap { (c: Creator) -> String? in
                return c.payoutMethod?.id
            }
        })
        let label: String = request.label.isEmpty ? (request.kind == .bank ? "Bank account" : "Debit card") : request.label
        let moment: Date = now
        let method: PayoutMethod = PayoutMethod(
            id: id,
            kind: request.kind,
            label: label,
            last4: request.last4,
            status: .active,
            instantCapable: request.kind == .debitCard,
            verifiedAt: moment
        )
        let account: String = "acct_" + String(100_000 + StableHash.bucket(meId, modulus: 900_000))
        try store.creators.update(meId) { (c: inout Creator) in
            c.payoutMethod = method
            c.stripeAccountId = c.stripeAccountId ?? account
        }
        try syncPayoutReady()
        try reevaluatePayoutHolds(at: moment)
        return method
    }

    func removePayoutMethod(id: String) async throws {
        try requireSignedIn()
        let creator: Creator = try meRow()
        guard creator.payoutMethod?.id == id else {
            throw FlowdAPIError.notFound("that payout method")
        }
        try store.creators.update(meId) { (c: inout Creator) in
            c.payoutMethod = nil
            c.payoutReady = false
        }
        try reevaluatePayoutHolds()
    }

    /// `payoutReady` is true once identity, a payout method and the tax form are all in place.
    func syncPayoutReady() throws {
        let creator: Creator = try meRow()
        let taxed: Bool = try store.taxProfiles.all().contains(where: { (t: TaxProfile) -> Bool in
            return t.creatorId == meId && t.status == .verified
        })
        let ready: Bool = creator.verificationStatus == .verified && creator.payoutMethod?.status == .active && taxed
        try store.creators.update(meId) { (c: inout Creator) in
            c.payoutReady = ready
        }
    }

    // MARK: Proofs and Wrapped

    func proofs() async throws -> [Proof] {
        try requireSignedIn()
        return try store.proofs.all().filter { (p: Proof) -> Bool in
            return p.creatorId == meId
        }.sorted { (a: Proof, b: Proof) -> Bool in
            return a.createdAt > b.createdAt
        }
    }

    func createProof(_ request: ProofRequest) async throws -> Proof {
        try requireSignedIn()
        let creator: Creator = try meRow()
        let totals: TickerTotals = try store.ticker().totals
        if request.kind == .payout, let payoutId = request.payoutId, let payout = try store.payouts.find(payoutId), payout.creatorId == meId {
            if let existing = try store.proofs.find(payout.proofId) {
                return try store.proofs.update(existing.id) { (p: inout Proof) in
                    p.anonymous = request.anonymous
                    p.revoked = false
                }
            }
        }
        let key: String = request.kind.rawValue + "|" + request.periodLabel + "|" + String(request.amountCents) + "|" + meId
        let id: String = "prf_" + StableHash.hex8(key)
        if let existing = try store.proofs.find(id) {
            return existing
        }
        let proof: Proof = Proof(
            id: id,
            kind: request.kind,
            creatorId: meId,
            handle: creator.handle,
            anonymous: request.anonymous,
            payoutId: request.payoutId,
            periodLabel: request.periodLabel,
            periodStart: request.periodStart,
            periodEnd: request.periodEnd,
            amountCents: request.amountCents,
            tier: creator.tier,
            postsCount: request.postsCount,
            typicalMedianCents: totals.typicalCreator30dCents,
            typicalP25Cents: totals.p25Creator30dCents,
            typicalP75Cents: totals.p75Creator30dCents,
            ledgerHash: StableHash.hex8(key + "|ledger") + String(StableHash.hex8(key + "|hash").prefix(4)),
            art: ArtSeed(key: id, title: request.kind == .tierUp ? "Reached " + creator.tier.label : "Earned " + Fmt.money(request.amountCents), caption: "@" + creator.handle, glyph: "checkmark.seal.fill"),
            revoked: false,
            pageViews: 0,
            createdAt: now
        )
        try store.proofs.append(proof)
        return proof
    }

    func revokeProof(id: String) async throws {
        try requireSignedIn()
        guard let proof = try store.proofs.find(id), proof.creatorId == meId else {
            throw FlowdAPIError.notFound("that proof")
        }
        try store.proofs.update(id) { (p: inout Proof) in
            p.revoked = true
        }
    }

    func wrapped() async throws -> [Wrapped] {
        try requireSignedIn()
        return try store.wrapped.all().filter { (w: Wrapped) -> Bool in
            return w.creatorId == meId
        }.sorted { (a: Wrapped, b: Wrapped) -> Bool in
            return a.periodEnd > b.periodEnd
        }
    }

    // MARK: Tax Desk

    func taxProfileRow() throws -> TaxProfile {
        if let row = try store.taxProfiles.all().first(where: { (t: TaxProfile) -> Bool in
            return t.creatorId == meId
        }) {
            return row
        }
        let creator: Creator = try meRow()
        return TaxProfile(
            id: "taxp_" + creator.handle.replacingOccurrences(of: ".", with: "_"),
            creatorId: meId,
            status: .notStarted,
            form: nil,
            legalName: nil,
            entityType: nil,
            tinLast4: nil,
            address: nil,
            country: creator.country,
            taxYear: FlowdConstants.Tax.taxYear,
            ytdClearedCents: 0,
            ytdPaidCents: 0,
            thresholdCents: FlowdConstants.Tax.form1099NecThresholdCents,
            thresholdProgress: 0,
            form1099Required: false,
            setAsideRate: FlowdConstants.Tax.setAsideRate,
            setAsideCents: 0,
            requestedAt: nil,
            submittedAt: nil,
            verifiedAt: nil,
            expiresAt: nil,
            updatedAt: now
        )
    }

    func taxSummary() async throws -> TaxSummary {
        try requireSignedIn()
        try reconcileIfNeeded()
        let profile: TaxProfile = try taxProfileRow()
        let creator: Creator = try meRow()
        let docs: [TaxDoc] = try store.taxDocs.all().filter { (d: TaxDoc) -> Bool in
            return d.creatorId == meId
        }.sorted { (a: TaxDoc, b: TaxDoc) -> Bool in
            return a.createdAt > b.createdAt
        }
        let numbers: TaxDeskNumbers = EarningsEngine.taxDesk(ytdClearedCents: profile.ytdClearedCents, setAsideRate: profile.setAsideRate)
        let needed: Bool = profile.status != .verified && (creator.approvedCount > 0 || profile.status == .requested)
        var next: String? = nil
        switch profile.status {
        case .notStarted:
            next = creator.approvedCount > 0 ? "Add your W-9 before your first payout. It takes about two minutes." : "You will add a W-9 when your first video is approved. Nothing is needed before then."
        case .requested:
            next = "Add your " + (profile.form == .w8ben ? "W-8BEN" : "W-9") + " to release your payouts. Your approved work is paid either way."
        case .submitted:
            next = "Your form is with the tax provider. This usually takes a few minutes."
        case .rejected:
            next = "The form needs another look. Check your legal name and the last four digits."
        case .expired:
            next = "Your form has expired. Add a new one to keep payouts flowing."
        case .verified, .unknown:
            next = nil
        }
        return TaxSummary(profile: profile, docs: docs, numbers: numbers, w9Needed: needed, nextStep: next, disclaimer: FlowdConstants.Tax.disclaimer)
    }

    func submitW9(_ request: W9Request) async throws -> TaxProfile {
        try requireSignedIn()
        let creator: Creator = try meRow()
        let legal: String = request.legalName.trimmingCharacters(in: .whitespacesAndNewlines)
        if legal.split(separator: " ").count < 2 {
            throw FlowdAPIError.validationFailed("Enter your full legal name as it appears on your tax return.")
        }
        if !Rx.test(#"^\d{4}$"#, in: request.tinLast4) {
            throw FlowdAPIError.validationFailed("Enter the last four digits of your SSN or tax ID. We never ask for the full number here.")
        }
        if request.address.line1.trimmingCharacters(in: .whitespaces).isEmpty || request.address.city.trimmingCharacters(in: .whitespaces).isEmpty || request.address.postalCode.trimmingCharacters(in: .whitespaces).isEmpty {
            throw FlowdAPIError.validationFailed("Add your full mailing address.")
        }
        let moment: Date = now
        let base: TaxProfile = try taxProfileRow()
        let ledger: [LedgerEntry] = try myLedger().filter { (e: LedgerEntry) -> Bool in
            return e.amountCents > 0 && (e.status == .cleared || e.status == .paid) && e.entryType != .payout
        }
        let ytd: Int = ledger.reduce(0) { (total: Int, e: LedgerEntry) -> Int in
            return total + e.amountCents
        }
        let paid: Int = ledger.filter { (e: LedgerEntry) -> Bool in
            return e.status == .paid
        }.reduce(0) { (total: Int, e: LedgerEntry) -> Int in
            return total + e.amountCents
        }
        var profile: TaxProfile = base
        profile.status = .verified
        profile.form = request.form
        profile.legalName = legal
        profile.entityType = request.entityType
        profile.tinLast4 = request.tinLast4
        profile.address = request.address
        profile.country = creator.country
        profile.ytdClearedCents = Swift.max(base.ytdClearedCents, ytd)
        profile.ytdPaidCents = Swift.max(base.ytdPaidCents, paid)
        profile.thresholdProgress = MoneyMath.round2(Swift.min(1, Double(profile.ytdPaidCents) / Double(Swift.max(1, base.thresholdCents))))
        profile.form1099Required = creator.country == .us && profile.ytdPaidCents >= base.thresholdCents
        profile.setAsideCents = MoneyMath.mulRate(profile.ytdClearedCents, base.setAsideRate)
        profile.requestedAt = base.requestedAt ?? moment
        profile.submittedAt = moment
        profile.verifiedAt = moment
        profile.expiresAt = request.form == .w8ben ? FlowdCalendar.addDays(moment, 365 * 3) : nil
        profile.updatedAt = moment
        if try store.taxProfiles.find(profile.id) != nil {
            let saved: TaxProfile = profile
            try store.taxProfiles.update(profile.id) { (t: inout TaxProfile) in
                t = saved
            }
        } else {
            try store.taxProfiles.append(profile)
        }
        try syncPayoutReady()
        try reevaluatePayoutHolds(at: moment)
        try notify(
            .systemNotice,
            title: (request.form == .w9 ? "W-9" : "W-8BEN") + " verified",
            body: "Your payouts are no longer held for tax info. This is not tax advice.",
            deepLink: "flowd://tax",
            refKind: "tax_profile",
            refId: profile.id
        )
        return profile
    }

    func setTaxSetAside(rate: Double) async throws -> TaxProfile {
        try requireSignedIn()
        if rate < 0 || rate > 0.5 {
            throw FlowdAPIError.validationFailed("Pick a set-aside between 0% and 50%.")
        }
        var profile: TaxProfile = try taxProfileRow()
        profile.setAsideRate = rate
        profile.setAsideCents = MoneyMath.mulRate(profile.ytdClearedCents, rate)
        profile.updatedAt = now
        if try store.taxProfiles.find(profile.id) != nil {
            let saved: TaxProfile = profile
            try store.taxProfiles.update(profile.id) { (t: inout TaxProfile) in
                t = saved
            }
        } else {
            try store.taxProfiles.append(profile)
        }
        return profile
    }

    func taxCSV(year: Int) async throws -> String {
        try requireSignedIn()
        let start: Date = FlowdCalendar.make(year: year, month: 1, day: 1)
        let end: Date = FlowdCalendar.make(year: year + 1, month: 1, day: 1)
        let legs: [LedgerEntry] = try myLedger().filter { (e: LedgerEntry) -> Bool in
            return e.amountCents > 0 && e.entryType != .payout && e.postedAt >= start && e.postedAt < end
        }.sorted { (a: LedgerEntry, b: LedgerEntry) -> Bool in
            return a.postedAt < b.postedAt
        }
        func cell(_ text: String) -> String {
            return "\"" + text.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        var lines: [String] = ["Date,Type,Description,Amount (USD),Status"]
        var total: Int = 0
        for leg in legs {
            total += leg.amountCents
            lines.append([FlowdCalendar.dayString(leg.postedAt), leg.entryType.rawValue, cell(leg.memo), Fmt.decimal(Double(leg.amountCents) / 100, digits: 2), leg.status.rawValue].joined(separator: ","))
        }
        lines.append(["", "", cell("Total earnings " + String(year) + ". " + FlowdConstants.Tax.disclaimer), Fmt.decimal(Double(total) / 100, digits: 2), ""].joined(separator: ","))
        return lines.joined(separator: "\n") + "\n"
    }

    // MARK: Rights Vault

    private func rightsStatusLabel(_ grant: RightsGrant, derived: RightsGrantStatus, daysLeft: Double?, renewal: RenewalQuote?) -> String {
        switch derived {
        case .pendingPermission:
            return "Waiting for your permission"
        case .renewalRequested:
            if let quote = renewal, quote.priceCents > 0 {
                return "Renewal requested: you earn " + Fmt.money(quote.priceCents)
            }
            return "Renewal requested"
        case .expired:
            return "Ended"
        case .revoked:
            return "Revoked"
        case .expiring:
            if let days = daysLeft {
                return "Ends in " + String(Swift.max(0, Int(days.rounded(.up)))) + " days"
            }
            return "Ending soon"
        case .active, .unknown:
            if grant.scope == .organic {
                return "Organic posting: always included"
            }
            if let days = daysLeft {
                return "Active for " + String(Swift.max(0, Int(days.rounded(.up)))) + " more days"
            }
            return "Active"
        }
    }

    func rights() async throws -> RightsOverview {
        try requireSignedIn()
        try reconcileIfNeeded()
        let moment: Date = now
        let posts: [String: Post] = Dictionary(uniqueKeysWithValues: try myPosts().map { (p: Post) -> (String, Post) in
            return (p.id, p)
        })
        var items: [RightsItem] = []
        var alerts: [RightsAlert] = []
        var exposure: Int = 0
        for grant in try myGrants() {
            let derived: RightsGrantStatus = RightsEngine.deriveGrantStatus(status: grant.status, endsAt: grant.endsAt, revokedAt: grant.revokedAt, now: moment)
            var left: Double? = nil
            var quote: RenewalQuote? = nil
            if let end = grant.endsAt {
                left = RightsEngine.daysLeft(endsAt: end, now: moment)
                let bounty: Bounty? = try store.bounties.find(grant.bountyId)
                if derived == .expiring || derived == .renewalRequested {
                    let q: RenewalQuote = RightsEngine.renewalQuote(
                        baseFeeCents: grant.baseFeeCents,
                        renewalPct: grant.renewalPctPer30d,
                        extraDays: 30,
                        takeRate: bounty?.takeRate ?? 0,
                        currentEndsAt: end
                    )
                    quote = q
                    exposure += q.priceCents
                }
                if let send = RightsEngine.dueExpiryAlerts(endsAt: end, alertsSent: grant.alertsSent, now: moment).send {
                    alerts.append(RightsAlert(grantId: grant.id, days: send))
                }
            }
            let post: Post? = posts[grant.postId]
            let bounty: Bounty? = try store.bounties.find(grant.bountyId)
            items.append(RightsItem(
                grant: grant,
                brand: try brandCard(grant.brandId),
                postTitle: post?.title ?? bounty?.title ?? grant.postId,
                thumb: post?.thumb,
                daysLeft: left,
                statusLabel: rightsStatusLabel(grant, derived: derived, daysLeft: left, renewal: quote),
                renewal: quote
            ))
        }
        items.sort { (a: RightsItem, b: RightsItem) -> Bool in
            let ra: Int = a.renewal != nil ? 0 : (a.grant.endsAt != nil ? 1 : 2)
            let rb: Int = b.renewal != nil ? 0 : (b.grant.endsAt != nil ? 1 : 2)
            if ra != rb {
                return ra < rb
            }
            return (a.grant.endsAt ?? Date.distantFuture) < (b.grant.endsAt ?? Date.distantFuture)
        }
        return RightsOverview(items: items, alertsDue: alerts, renewalExposureCents: exposure)
    }

    private func grantRow(_ id: String) throws -> RightsGrant {
        guard let grant = try store.rightsGrants.find(id), grant.creatorId == meId else {
            throw FlowdAPIError.notFound("that licence")
        }
        return grant
    }

    func respondToRightsPermission(grantId: String, grant: Bool) async throws -> RightsGrant {
        try requireSignedIn()
        let row: RightsGrant = try grantRow(grantId)
        guard row.status == .pendingPermission else {
            throw FlowdAPIError.conflict("There is nothing to approve on this licence.")
        }
        let moment: Date = now
        let code: String = "SPK-" + StableHash.hex8(grantId + "|spark").uppercased()
        return try store.rightsGrants.update(grantId) { (g: inout RightsGrant) in
            if grant {
                g.status = .active
                if g.scope == .sparkCode {
                    g.sparkCode = code
                    g.codeDurationDays = g.codeDurationDays ?? 30
                }
                if g.endsAt == nil && g.scope != .organic {
                    g.endsAt = FlowdCalendar.addDays(moment, Double(g.codeDurationDays ?? 30))
                }
            } else {
                g.status = .revoked
                g.revokedAt = moment
                g.revokeReason = "Permission declined by the creator."
            }
            g.updatedAt = moment
        }
    }

    func respondToRenewal(grantId: String, accept: Bool) async throws -> RightsGrant {
        try requireSignedIn()
        let row: RightsGrant = try grantRow(grantId)
        guard row.status == .renewalRequested || row.status == .expiring else {
            throw FlowdAPIError.conflict("There is no renewal to answer on this licence.")
        }
        let moment: Date = now
        guard accept, let end = row.endsAt else {
            return try store.rightsGrants.update(grantId) { (g: inout RightsGrant) in
                g.status = RightsEngine.deriveGrantStatus(status: .active, endsAt: g.endsAt, revokedAt: g.revokedAt, now: moment)
                g.updatedAt = moment
            }
        }
        let bounty: Bounty? = try store.bounties.find(row.bountyId)
        let quote: RenewalQuote = RightsEngine.renewalQuote(
            baseFeeCents: row.baseFeeCents,
            renewalPct: row.renewalPctPer30d,
            extraDays: 30,
            takeRate: bounty?.takeRate ?? 0,
            currentEndsAt: end
        )
        let newEnd: Date = quote.newEndsAt ?? FlowdCalendar.addDays(end, 30)
        let updated: RightsGrant = try store.rightsGrants.update(grantId) { (g: inout RightsGrant) in
            g.status = .active
            g.endsAt = newEnd
            g.renewals.append(Renewal(at: moment, days: 30, feeCents: quote.priceCents, ledgerTxnId: nil, requestedByMemberId: nil))
            g.alertsSent = []
            g.updatedAt = moment
        }
        if quote.priceCents > 0 {
            try addAdjustmentEarning(cents: quote.priceCents, label: "Rights renewal: 30 more days", postId: row.postId, at: moment)
        }
        try notify(
            .rightsRenewed,
            title: "Renewal accepted",
            body: quote.priceCents > 0 ? "You earn " + Fmt.money(quote.priceCents) + " for 30 more days. It clears at the next daily run." : "Paid-ad usage runs 30 more days.",
            amountCents: quote.priceCents > 0 ? quote.priceCents : nil,
            deepLink: "flowd://rights",
            refKind: "rights_grant",
            refId: grantId
        )
        return updated
    }

    func revokeRights(grantId: String) async throws -> RightsGrant {
        try requireSignedIn()
        let row: RightsGrant = try grantRow(grantId)
        if row.status == .revoked {
            return row
        }
        let moment: Date = now
        return try store.rightsGrants.update(grantId) { (g: inout RightsGrant) in
            g.status = .revoked
            g.revokedAt = moment
            g.revokeReason = "Revoked by the creator: use beyond the Rights Card."
            g.updatedAt = moment
        }
    }
}
