import ActivityKit
import Foundation

// The Live Activity of a post in its 72-hour view window: the earnings tick up while views count, then the activity says when the money clears and what is
// happening in between (a view and disclosure check). Compiled into both the app (which starts, updates and ends it) and the widget extension (which draws
// it), so it uses Foundation and ActivityKit only: nothing from Core, Theme, Glass or Components.
//
// Money is integer cents; dates are real instants. The widget formats them itself (`SharedMoney`), and every state carries a dated ETA and a named reason:
// never a bare "pending".

struct FlowdEarningsActivityAttributes: ActivityAttributes {
    /// What changes while the activity runs.
    struct ContentState: Codable, Hashable {
        /// Where the post's money stands. The raw values match the Money Clock vocabulary.
        enum Phase: String, Codable, Hashable {
            /// The window is open: views are counting and the estimate ticks up.
            case counting
            /// The window closed: the automated view and disclosure check runs (done within 12 hours).
            case checking
            /// Waiting for the next 14:00 UTC clearing run.
            case awaitingClearingRun = "awaiting_clearing_run"
            /// Cleared: waiting for the Friday weekly payout.
            case cleared
            /// Paid: on its way to the bank or landed.
            case paid
            /// A named hold; `reason` says which.
            case held

            /// A calm word for the compact presentations.
            var shortTitle: String {
                switch self {
                case .counting: return "Counting"
                case .checking: return "Checking"
                case .awaitingClearingRun: return "Clearing soon"
                case .cleared: return "Cleared"
                case .paid: return "Paid"
                case .held: return "On hold"
                }
            }

            /// True once the numbers are final (no more ticking).
            var isFinal: Bool {
                switch self {
                case .counting:
                    return false
                case .checking, .awaitingClearingRun, .cleared, .paid, .held:
                    return true
                }
            }
        }

        /// The post's earnings so far in cents: a live estimate while counting, final afterwards.
        var earnedCents: Int
        /// Verified views so far.
        var views: Int
        var phase: Phase
        /// When the money clears (the next 14:00 UTC run after the window and the check), or when it pays out once cleared.
        var etaAt: Date
        /// The named reason in plain English ("Views still counting until Mon 1:05 PM UTC"). Never empty.
        var reason: String
        var updatedAt: Date
    }

    /// The post's id (`post_0418`); the Live Activity deep-links to `flowd://post/<id>`.
    var postId: String
    var postTitle: String
    var brandName: String
    /// "TikTok", "Instagram" or "YouTube".
    var platformName: String
    var postedAt: Date
    var windowEndsAt: Date
    /// The per-video cap, so the widget can show how much of it the post has used.
    var perVideoCapCents: Int

    /// `flowd://post/<id>`.
    var deepLink: String {
        return "flowd://post/" + postId
    }

    /// 0 to 1: how far through the 72-hour window `now` is.
    func windowProgress(at now: Date) -> Double {
        let total: TimeInterval = windowEndsAt.timeIntervalSince(postedAt)
        guard total > 0 else {
            return 1
        }
        return Swift.min(1, Swift.max(0, now.timeIntervalSince(postedAt) / total))
    }
}

/// The widget-side money formatting: `$1,284.60`, true minus sign, USD only. Core's `Fmt.money` is the app-side twin (`SharedFormatTests` keeps them equal).
enum SharedMoney {
    static func string(_ cents: Int, showsCents: Bool = true) -> String {
        let negative: Bool = cents < 0
        let magnitude: Int = cents == Int.min ? Int.max : abs(cents)
        var dollars: Int = magnitude / 100
        let remainder: Int = magnitude % 100
        if !showsCents && remainder >= 50 {
            dollars += 1
        }
        var body: String = "$" + grouped(dollars)
        if showsCents {
            body += "." + (remainder < 10 ? "0" : "") + String(remainder)
        }
        return negative ? "\u{2212}" + body : body
    }

    static func grouped(_ value: Int) -> String {
        let digits: [Character] = Array(String(value))
        var reversed: [Character] = []
        var counter: Int = 0
        for character in digits.reversed() {
            if counter > 0 && counter % 3 == 0 {
                reversed.append(",")
            }
            reversed.append(character)
            counter += 1
        }
        return String(reversed.reversed())
    }
}
