import ActivityKit
import Foundation

// The app side of the earnings Live Activity: turns a post and its Money Clock rows into the shared `FlowdEarningsActivityAttributes` and keeps one activity
// per post running while its 72-hour window is open (and a moment after, so the clears-at time stays on the Lock Screen). Pure mapping first, ActivityKit
// second, so the mapping is unit-tested without a device.

enum EarningsActivityBuilder {
    /// The static half: who and when.
    static func attributes(post: Post, bounty: Bounty, brandName: String) -> FlowdEarningsActivityAttributes {
        return FlowdEarningsActivityAttributes(
            postId: post.id,
            postTitle: bounty.title,
            brandName: brandName,
            platformName: post.platform.label,
            postedAt: post.postedAt,
            windowEndsAt: post.windowEndsAt,
            perVideoCapCents: bounty.perVideoCapCents
        )
    }

    /// The moving half: earnings so far, the phase and its dated ETA with a named reason.
    static func state(post: Post, rows: [MoneyClockRow], now: Date) -> FlowdEarningsActivityAttributes.ContentState {
        let live: [MoneyClockRow] = rows.filter { (r: MoneyClockRow) -> Bool in
            return r.state != .reversed
        }
        let earned: Int = live.isEmpty ? post.earnings.totalCents : live.reduce(0) { (total: Int, r: MoneyClockRow) -> Int in
            return total + r.amountCents
        }
        func has(_ state: MoneyClockState) -> Bool {
            return live.contains(where: { (r: MoneyClockRow) -> Bool in return r.state == state && r.amountCents > 0 })
        }
        let run: Date = MoneyClockEngine.postClearingRun(windowEnd: post.windowEndsAt)
        var phase: FlowdEarningsActivityAttributes.ContentState.Phase
        var eta: Date = run
        var reason: MoneyClockReason = .windowOpen
        if post.status == .held || has(.held) {
            phase = .held
            reason = live.first(where: { (r: MoneyClockRow) -> Bool in return r.state == .held })?.reason ?? .heldFraudReview
        } else if has(.accruing) || post.status == .live {
            phase = .counting
            reason = .windowOpen
        } else if has(.pending) {
            let pending: MoneyClockRow? = live.first(where: { (r: MoneyClockRow) -> Bool in return r.state == .pending })
            reason = pending?.reason ?? .fraudCheck
            phase = reason == .awaitingClearingRun ? .awaitingClearingRun : .checking
            eta = pending?.etaAt ?? run
        } else if has(.cleared) {
            phase = .cleared
            reason = .awaitingWeeklyPayout
            eta = live.first(where: { (r: MoneyClockRow) -> Bool in return r.state == .cleared })?.etaAt ?? MoneyClockEngine.nextWeeklyPayout(after: now)
        } else if has(.paid) {
            phase = .paid
            reason = live.first(where: { (r: MoneyClockRow) -> Bool in return r.state == .paid })?.reason ?? .paidOut
            eta = live.first(where: { (r: MoneyClockRow) -> Bool in return r.state == .paid })?.paidAt ?? now
        } else {
            phase = .counting
        }
        let text: String = MoneyClockEngine.reasonText(
            reason: reason,
            etaAt: phase == .paid || phase == .held ? nil : eta,
            windowEndsAt: post.windowEndsAt,
            arrivesAt: nil
        )
        return FlowdEarningsActivityAttributes.ContentState(
            earnedCents: earned,
            views: post.windowViews > 0 ? post.windowViews : post.views,
            phase: phase,
            etaAt: eta,
            reason: text,
            updatedAt: now
        )
    }
}

/// Starts, updates and ends the earnings Live Activity. Main-actor, like the screens that call it.
@MainActor
final class EarningsActivityController {
    static let shared: EarningsActivityController = EarningsActivityController()

    private init() {
    }

    /// False when the user switched Live Activities off for flowd.
    var isAvailable: Bool {
        return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    private func running(postId: String) -> Activity<FlowdEarningsActivityAttributes>? {
        return Activity<FlowdEarningsActivityAttributes>.activities.first(where: { (a: Activity<FlowdEarningsActivityAttributes>) -> Bool in
            return a.attributes.postId == postId
        })
    }

    /// Starts the activity for a post, or updates it when one is already running. Returns false when Live Activities are off or the request failed (the post
    /// and its money are unaffected).
    @discardableResult
    func start(post: Post, bounty: Bounty, brandName: String, rows: [MoneyClockRow], now: Date = Date()) -> Bool {
        guard isAvailable else {
            return false
        }
        let state: FlowdEarningsActivityAttributes.ContentState = EarningsActivityBuilder.state(post: post, rows: rows, now: now)
        if running(postId: post.id) != nil {
            update(post: post, rows: rows, now: now)
            return true
        }
        let attributes: FlowdEarningsActivityAttributes = EarningsActivityBuilder.attributes(post: post, bounty: bounty, brandName: brandName)
        let content: ActivityContent<FlowdEarningsActivityAttributes.ContentState> = ActivityContent(state: state, staleDate: now.addingTimeInterval(3 * 3_600))
        do {
            _ = try Activity<FlowdEarningsActivityAttributes>.request(attributes: attributes, content: content, pushType: nil)
            return true
        } catch {
            FlowdLog.widget.error("Could not start the earnings Live Activity: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    func update(post: Post, rows: [MoneyClockRow], now: Date = Date()) {
        guard let activity = running(postId: post.id) else {
            return
        }
        let state: FlowdEarningsActivityAttributes.ContentState = EarningsActivityBuilder.state(post: post, rows: rows, now: now)
        let content: ActivityContent<FlowdEarningsActivityAttributes.ContentState> = ActivityContent(state: state, staleDate: now.addingTimeInterval(3 * 3_600))
        Task {
            await activity.update(content)
        }
    }

    /// Ends the activity. When the money has cleared the card lingers for an hour so the creator sees the result; otherwise it goes at once.
    func end(post: Post, rows: [MoneyClockRow], now: Date = Date()) {
        guard let activity = running(postId: post.id) else {
            return
        }
        let state: FlowdEarningsActivityAttributes.ContentState = EarningsActivityBuilder.state(post: post, rows: rows, now: now)
        let content: ActivityContent<FlowdEarningsActivityAttributes.ContentState> = ActivityContent(state: state, staleDate: nil)
        let policy: ActivityUIDismissalPolicy = state.phase == .cleared || state.phase == .paid ? .after(now.addingTimeInterval(3_600)) : .immediate
        Task {
            await activity.end(content, dismissalPolicy: policy)
        }
    }

    /// Ends every earnings activity (sign-out).
    func endAll() {
        for activity in Activity<FlowdEarningsActivityAttributes>.activities {
            Task {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
