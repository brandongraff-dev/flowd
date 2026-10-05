import SwiftUI

// The one place contract enums meet the design system. Models know nothing about SwiftUI (they live in Foundation-only files); features call
// `.flowdTone`, `.flowdLevel`, `.flowdStatus` and `.flowdMoneyState` here instead of switching on contract values themselves, so a colour or a status
// word never drifts between screens.

extension ContractTone {
    /// The design-system tone for a contract tone. One colour, one meaning: accent = interactive, mint = money earned, info = pending, ember = urgency,
    /// sun = featured or Elite, rose = danger, violet = Flo.
    var flowdTone: FlowdTone {
        switch self {
        case .neutral: return FlowdTone.neutral
        case .accent: return FlowdTone.accent
        case .violet: return FlowdTone.violet
        case .info: return FlowdTone.info
        case .mint: return FlowdTone.mint
        case .ember: return FlowdTone.ember
        case .sun: return FlowdTone.sun
        case .rose: return FlowdTone.rose
        }
    }
}

extension Tier {
    /// The badge level. An unknown tier reads as Bronze.
    var flowdLevel: FlowdTierLevel {
        switch self {
        case .bronze, .unknown: return FlowdTierLevel.bronze
        case .silver: return FlowdTierLevel.silver
        case .gold: return FlowdTierLevel.gold
        case .platinum: return FlowdTierLevel.platinum
        case .elite: return FlowdTierLevel.elite
        }
    }
}

extension FlowdTierLevel {
    /// The contract tier for a badge level.
    var contractTier: Tier {
        switch self {
        case .bronze: return Tier.bronze
        case .silver: return Tier.silver
        case .gold: return Tier.gold
        case .platinum: return Tier.platinum
        case .elite: return Tier.elite
        }
    }
}

extension SubmissionStatus {
    /// The status pill of a submission. Rejected reads "Not approved": always show the reason and the next step beside it.
    var flowdStatus: FlowdStatus {
        switch self {
        case .qaPending, .inReview: return FlowdStatus.inReview
        case .changesRequested: return FlowdStatus.revision
        case .approved, .posted: return FlowdStatus.approved
        case .rejected: return FlowdStatus.rejected
        case .appealed: return FlowdStatus.appealed
        case .withdrawn, .released: return FlowdStatus.closed
        case .expired: return FlowdStatus.expired
        case .unknown: return FlowdStatus.draft
        }
    }
}

extension BountyStatus {
    var flowdStatus: FlowdStatus {
        switch self {
        case .live: return FlowdStatus.live
        case .draft, .awaitingFunding, .unknown: return FlowdStatus.draft
        case .scheduled: return FlowdStatus.scheduled
        case .filled: return FlowdStatus.soldOut
        case .paused, .ended, .settled, .cancelled: return FlowdStatus.closed
        }
    }
}

extension PostStatus {
    var flowdStatus: FlowdStatus {
        switch self {
        case .live: return FlowdStatus.live
        case .windowClosed: return FlowdStatus.pending
        case .held, .clawedBack: return FlowdStatus.held
        case .cleared: return FlowdStatus.cleared
        case .paid: return FlowdStatus.paid
        case .removed, .unknown: return FlowdStatus.closed
        }
    }
}

extension MoneyClockState {
    /// The status pill of an earning: accruing and pending are both "Pending" (with the dated ETA beside it).
    var flowdStatus: FlowdStatus {
        switch self {
        case .accruing, .pending, .unknown: return FlowdStatus.pending
        case .cleared: return FlowdStatus.cleared
        case .paid: return FlowdStatus.paid
        case .held, .reversed: return FlowdStatus.held
        }
    }

    /// How `MoneyText` draws an amount in this state.
    var flowdMoneyState: FlowdMoneyState {
        switch self {
        case .accruing, .pending, .unknown: return FlowdMoneyState.pending
        case .cleared: return FlowdMoneyState.cleared
        case .paid: return FlowdMoneyState.paid
        case .held: return FlowdMoneyState.neutral
        case .reversed: return FlowdMoneyState.down
        }
    }
}

extension PayoutStatus {
    var flowdStatus: FlowdStatus {
        switch self {
        case .scheduled, .processing, .inTransit, .unknown: return FlowdStatus.pending
        case .paid: return FlowdStatus.paid
        case .failed, .held: return FlowdStatus.held
        case .cancelled: return FlowdStatus.closed
        }
    }
}

extension ScoreBand {
    /// Weak bands are Ember, never a red flash; strong bands are Mint.
    var flowdTone: FlowdTone {
        switch self {
        case .a: return FlowdTone.mint
        case .b: return FlowdTone.accent
        case .c: return FlowdTone.info
        case .d, .e: return FlowdTone.ember
        case .unknown: return FlowdTone.neutral
        }
    }
}
