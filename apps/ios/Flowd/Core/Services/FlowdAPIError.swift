import Foundation

/// Every way a `FlowdAPI` call can fail, mapped from the contract's error codes (DOMAIN.md section 16: `{ code, message, hint }`). View models catch
/// `FlowdAPIError`, show `userMessage` (plain English, about the situation never the person) and, for `isRetryable`, offer to try again.
enum FlowdAPIError: Error, Hashable, Sendable {
    /// 422 validation_failed.
    case validationFailed(String)
    /// 422 reason_required (a rejection needs a reason code and evidence).
    case reasonRequired
    /// 404 not_found.
    case notFound(String)
    /// 403 forbidden.
    case forbidden(String)
    /// 403 tier_locked: the action needs a higher tier.
    case tierLocked(required: Tier?, message: String)
    /// 409 bounty_not_funded.
    case bountyNotFunded
    /// 409 pool_exhausted: no Reserved Slot left in the pool.
    case poolExhausted
    /// 409 sla_not_started.
    case slaNotStarted
    /// 409 revision_limit.
    case revisionLimit
    /// 409 appeal_used (or the 7-day window has passed).
    case appealUsed
    /// 422 below_minimum.
    case belowMinimum(minimumCents: Int)
    /// 409 method_missing: add a bank account or debit card.
    case methodMissing
    /// 409 tax_info_missing: add the W-9.
    case taxInfoMissing
    /// 409 identity_check_required.
    case identityCheckRequired
    /// 409 idempotency_conflict.
    case idempotencyConflict
    /// 429 rate_limited.
    case rateLimited(retryAfterSeconds: Int?)
    /// 409 conflict: the action is not allowed in the current state.
    case conflict(String)
    /// 401: not signed in, or the session expired.
    case unauthorized
    /// No network.
    case offline
    /// Any other server error.
    case server(status: Int, code: String?, message: String?)
    /// The response could not be decoded.
    case decoding(String)
    /// A bundled fixture is missing or malformed (mock mode).
    case fixture(table: String, detail: String)
    /// The call is not available on this API (for example demo controls on the live API).
    case unsupported(String)
    case cancelled

    /// The stable snake_case code of the contract (`tier_locked`), or a local one.
    var code: String {
        switch self {
        case .validationFailed: return "validation_failed"
        case .reasonRequired: return "reason_required"
        case .notFound: return "not_found"
        case .forbidden: return "forbidden"
        case .tierLocked: return "tier_locked"
        case .bountyNotFunded: return "bounty_not_funded"
        case .poolExhausted: return "pool_exhausted"
        case .slaNotStarted: return "sla_not_started"
        case .revisionLimit: return "revision_limit"
        case .appealUsed: return "appeal_used"
        case .belowMinimum: return "below_minimum"
        case .methodMissing: return "method_missing"
        case .taxInfoMissing: return "tax_info_missing"
        case .identityCheckRequired: return "identity_check_required"
        case .idempotencyConflict: return "idempotency_conflict"
        case .rateLimited: return "rate_limited"
        case .conflict: return "conflict"
        case .unauthorized: return "unauthorized"
        case .offline: return "offline"
        case .server(_, let code, _): return code ?? "server_error"
        case .decoding: return "decoding_failed"
        case .fixture: return "fixture_failed"
        case .unsupported: return "unsupported"
        case .cancelled: return "cancelled"
        }
    }

    /// Plain-English copy for a toast or an inline error. Names the situation and the next step; never blames the creator.
    var userMessage: String {
        switch self {
        case .validationFailed(let message):
            return message.isEmpty ? "Something in that form needs another look." : message
        case .reasonRequired:
            return "A decision needs a reason."
        case .notFound(let what):
            return what.isEmpty ? "We couldn't find that." : "We couldn't find " + what + "."
        case .forbidden(let message):
            return message.isEmpty ? "That isn't available on your account." : message
        case .tierLocked(let required, let message):
            if !message.isEmpty {
                return message
            }
            if let required = required {
                return "This unlocks at " + required.label + "."
            }
            return "This unlocks at a higher tier."
        case .bountyNotFunded:
            return "This bounty isn't funded yet, so it can't take videos."
        case .poolExhausted:
            return "That bounty's pool is fully reserved. Check the Daily Drop or the feed for the next one."
        case .slaNotStarted:
            return "The review clock hasn't started yet."
        case .revisionLimit:
            return "The two included revision rounds are used."
        case .appealUsed:
            return "That rejection can't be appealed any more."
        case .belowMinimum(let minimum):
            return "The minimum is " + Fmt.money(minimum) + ". Your weekly payout is free and has no minimum."
        case .methodMissing:
            return "Add a bank account or debit card to cash out."
        case .taxInfoMissing:
            return "Add your W-9 to cash out. It takes about two minutes."
        case .identityCheckRequired:
            return "Verify your identity to cash out. It takes about two minutes."
        case .idempotencyConflict:
            return "That was already sent with different details. Start it again."
        case .rateLimited:
            return "Too many requests. Try again in a moment."
        case .conflict(let message):
            return message.isEmpty ? "That isn't possible right now." : message
        case .unauthorized:
            return "Sign in again to continue."
        case .offline:
            return "You're offline. Everything you made is saved. We'll sync when you're back."
        case .server(_, _, let message):
            return (message?.isEmpty ?? true) ? "Something went wrong on our side. Try again." : (message ?? "")
        case .decoding:
            return "We couldn't read the answer from the server. Try again."
        case .fixture(let table, _):
            return "The demo data for " + table + " couldn't be loaded."
        case .unsupported(let what):
            return what.isEmpty ? "That isn't available here." : what
        case .cancelled:
            return "Cancelled."
        }
    }

    /// True when trying again can help (network, rate limit, server).
    var isRetryable: Bool {
        switch self {
        case .offline, .rateLimited, .server, .decoding:
            return true
        default:
            return false
        }
    }

    /// True when the session is gone and the app should return to sign-in.
    var requiresSignIn: Bool {
        return self == .unauthorized
    }

    /// Maps a contract error body and HTTP status to an error.
    static func from(status: Int, code: String?, message: String?, hint: String? = nil) -> FlowdAPIError {
        let text: String = message ?? hint ?? ""
        switch code ?? "" {
        case "validation_failed": return .validationFailed(text)
        case "reason_required": return .reasonRequired
        case "not_found": return .notFound(text)
        case "forbidden": return .forbidden(text)
        case "tier_locked": return .tierLocked(required: nil, message: text)
        case "bounty_not_funded": return .bountyNotFunded
        case "pool_exhausted": return .poolExhausted
        case "sla_not_started": return .slaNotStarted
        case "revision_limit": return .revisionLimit
        case "appeal_used": return .appealUsed
        case "below_minimum": return .belowMinimum(minimumCents: FlowdConstants.Fees.instantMinAmountCents)
        case "method_missing": return .methodMissing
        case "tax_info_missing": return .taxInfoMissing
        case "identity_check_required": return .identityCheckRequired
        case "idempotency_conflict": return .idempotencyConflict
        case "rate_limited": return .rateLimited(retryAfterSeconds: nil)
        case "conflict": return .conflict(text)
        default:
            break
        }
        switch status {
        case 401: return .unauthorized
        case 403: return .forbidden(text)
        case 404: return .notFound(text)
        case 409: return .conflict(text)
        case 422: return .validationFailed(text)
        case 429: return .rateLimited(retryAfterSeconds: nil)
        default: return .server(status: status, code: code, message: message)
        }
    }
}

extension FlowdAPIError: LocalizedError {
    var errorDescription: String? {
        return userMessage
    }
}
