import Foundation
import WidgetKit

// The app side of the Home Screen widget: builds the snapshot the widget draws (cleared and pending side by side, the next clearing run and payout, the
// streak, today's Daily Drop) and writes it to the App Group container. Pure builder first, so it is unit-tested without WidgetKit.

enum WidgetSnapshotBuilder {
    /// "Numbers off" hides amounts while its window is on: always when no hours are set, otherwise inside the local `from`-`to` window.
    static func numbersHidden(_ settings: WellbeingSettings?, at now: Date) -> Bool {
        guard let settings = settings, settings.enabled, settings.numbersOff.enabled else {
            return false
        }
        guard let from = settings.numbersOff.from, let to = settings.numbersOff.to else {
            return true
        }
        return WellbeingClock.isWithin(start: from, end: to, timeZoneIdentifier: settings.quietHours.timezone, at: now)
    }

    static func snapshot(
        creator: Creator,
        wallet: WalletSummary,
        streak: StreakSummary?,
        drop: DailyDropView?,
        wellbeing: WellbeingSettings?,
        isDemo: Bool,
        now: Date
    ) -> FlowdWidgetSnapshot {
        return FlowdWidgetSnapshot(
            updatedAt: now,
            handle: creator.handle,
            tier: creator.tier.rawValue,
            clearedCents: wallet.clearedCents,
            pendingCents: wallet.pendingCents,
            heldCents: wallet.heldCents,
            nextClearsAt: wallet.nextClearsAt,
            nextClearsCents: wallet.nextClearsCents,
            nextPayoutAt: wallet.clearedCents > 0 ? wallet.nextPayoutAt : nil,
            nextPayoutCents: wallet.nextPayoutCents,
            streakWeeks: streak?.streak.currentWeeks ?? creator.streakWeeks,
            postedThisWeek: streak?.streak.postedThisWeek ?? false,
            dropReleaseAt: drop?.releaseAt,
            dropIsLive: drop?.state == .live,
            dropSpotsLeft: drop?.drop.spotsLeft,
            isDemo: isDemo,
            numbersHidden: numbersHidden(wellbeing, at: now)
        )
    }
}

enum WidgetSnapshotPublisher {
    /// Writes the snapshot and asks WidgetKit to redraw. Silent when there is no App Group container (an unsigned simulator build).
    @MainActor
    static func publish(_ snapshot: FlowdWidgetSnapshot) {
        do {
            let written: Bool = try WidgetSnapshotStore.write(snapshot)
            if written {
                WidgetCenter.shared.reloadAllTimelines()
            }
        } catch {
            FlowdLog.widget.error("Could not write the widget snapshot: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Clears the snapshot on sign-out so the widget never shows the previous creator's money.
    @MainActor
    static func clear() {
        WidgetSnapshotStore.remove()
        WidgetCenter.shared.reloadAllTimelines()
    }
}
