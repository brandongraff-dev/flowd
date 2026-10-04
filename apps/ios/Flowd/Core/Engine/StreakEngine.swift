import Foundation

// Weekly streaks, with freezes and rest weeks, and no guilt. Mirrors apps/web/src/lib/engine/streaks.ts.
//
// A week counts when the creator posts at least once in the ISO week (Monday to Sunday, UTC). Earned freezes: one for every 4 weeks of streak, at most
// 2 banked. A missed week spends a freeze if one is banked; otherwise the streak starts again (the best streak is kept). Declared rest weeks (2 per
// quarter), paused periods and Wellbeing "slack mode" keep the streak without counting a week. There is no inactivity penalty and no guilt copy:
// nothing here ever says "you'll lose your streak".

struct StreakPause: Hashable, Sendable {
    var from: Date
    var until: Date
}

/// The evaluated state of a weekly streak.
struct StreakEvaluation: Codable, Hashable, Sendable {
    var status: StreakStatus
    /// Weeks of streak: posted weeks since the last break. Rest, pause and freeze weeks neither add nor break.
    var currentWeeks: Int
    var bestWeeks: Int
    /// 0 to 2.
    var freezesBanked: Int
    var freezesEarnedTotal: Int
    var freezesUsedTotal: Int
    /// The ISO week of `now`.
    var isoWeek: String
    var postsThisWeek: Int
    var postedThisWeek: Bool
    /// Sunday 23:59:59Z of the current week.
    var weekEndsAt: Date
    /// Weeks until the next freeze is earned, 0 to 3 as the contract defines it (0 right after one is earned or with no streak).
    var nextFreezeInWeeks: Int
    /// The same on a 1 to 4 scale, for copy ("next freeze in 2 weeks").
    var weeksToNextFreeze: Int
    /// The last 12 weeks, oldest first, ending at the current week (an unposted current week is left out).
    var history: [WeekRecord]
    /// Declared rest weeks used in the current quarter (at most 2).
    var restWeeksUsedQuarter: Int
}

struct StreakCopy: Codable, Hashable, Sendable {
    var headline: String
    var detail: String
}

/// Whether a creator may declare a week as a rest week.
struct RestWeekCheck: Hashable, Sendable {
    var ok: Bool
    var used: Int
    var remaining: Int
    var reason: String?
}

enum StreakEngine {
    private static let historyWeeks: Int = 12

    /// "2026-Q4": the calendar quarter an ISO week belongs to (decided by its Thursday, as ISO weeks are).
    static func quarterOfWeek(_ week: String) -> String {
        guard let start = FlowdCalendar.isoWeekToStart(week) else {
            return week
        }
        let thursday: Date = FlowdCalendar.addDays(start, 3)
        let c: (year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int) = FlowdCalendar.components(thursday)
        return String(c.year) + "-Q" + String((c.month - 1) / 3 + 1)
    }

    /// How many of the declared rest weeks fall in the same quarter as `week`.
    static func restWeeksUsedInQuarter(_ restWeeks: [String], week: String) -> Int {
        let quarter: String = quarterOfWeek(week)
        return restWeeks.filter { (w: String) -> Bool in
            return quarterOfWeek(w) == quarter
        }.count
    }

    /// Whether a creator may declare `week` as a rest week: 2 per quarter, and not twice.
    static func canDeclareRestWeek(restWeeks: [String], week: String) -> RestWeekCheck {
        let quota: Int = FlowdConstants.Streaks.restWeeksPerQuarter
        let used: Int = restWeeksUsedInQuarter(restWeeks, week: week)
        if restWeeks.contains(week) {
            return RestWeekCheck(ok: false, used: used, remaining: Swift.max(0, quota - used), reason: "That week is already a rest week.")
        }
        if used >= quota {
            return RestWeekCheck(ok: false, used: used, remaining: 0, reason: "You have used both rest weeks for this quarter (" + String(quota) + " per quarter).")
        }
        return RestWeekCheck(ok: true, used: used, remaining: quota - used - 1, reason: nil)
    }

    private enum WeekMark {
        case posted
        case rest
        case open
        case freezeUsed
        case missed
    }

    /// Evaluates a weekly streak from posting times. Completed weeks are settled in order; the current week is open until it ends, so a creator is
    /// never marked as having missed a week that is still running.
    static func evaluate(
        postTimes: [Date],
        now: Date,
        restWeeks: [String] = [],
        pauses: [StreakPause] = [],
        slackMode: Bool = false,
        startingFreezes: Int = 0,
        startWeek: String? = nil
    ) -> StreakEvaluation {
        let currentWeek: String = FlowdCalendar.isoWeek(now)
        let weekEndsAt: Date = FlowdCalendar.isoWeekEnd(now)
        var posts: [String: Int] = [:]
        for time in postTimes where time <= now {
            let w: String = FlowdCalendar.isoWeek(time)
            posts[w] = (posts[w] ?? 0) + 1
        }
        let rest: Set<String> = Set(restWeeks)

        func isPaused(_ week: String) -> Bool {
            guard let monday = FlowdCalendar.isoWeekToStart(week) else {
                return false
            }
            let start: Date = monday
            let end: Date = FlowdCalendar.isoWeekEnd(monday)
            for pause in pauses {
                if pause.from < end && pause.until > start {
                    return true
                }
            }
            return false
        }

        let postedWeeks: [String] = posts.keys.sorted()
        let firstWeek: String? = startWeek ?? postedWeeks.first
        let postsThisWeek: Int = posts[currentWeek] ?? 0
        let postedThisWeek: Bool = postsThisWeek >= FlowdConstants.Streaks.minPostsPerWeek
        let restUsed: Int = restWeeksUsedInQuarter(Array(rest), week: currentWeek)
        let startBanked: Int = Swift.min(FlowdConstants.Streaks.freezeBankMax, startingFreezes)

        guard let first = firstWeek, first <= currentWeek else {
            return StreakEvaluation(
                status: .new,
                currentWeeks: 0,
                bestWeeks: 0,
                freezesBanked: startBanked,
                freezesEarnedTotal: 0,
                freezesUsedTotal: 0,
                isoWeek: currentWeek,
                postsThisWeek: postsThisWeek,
                postedThisWeek: postedThisWeek,
                weekEndsAt: weekEndsAt,
                nextFreezeInWeeks: 0,
                weeksToNextFreeze: FlowdConstants.Streaks.freezeEarnedEveryWeeks,
                history: [],
                restWeeksUsedQuarter: restUsed
            )
        }

        var streak: Int = 0
        var best: Int = 0
        var run: Int = 0
        var banked: Int = startBanked
        var earned: Int = 0
        var used: Int = 0
        var slackRun: Int = 0
        var weeks: [(week: String, mark: WeekMark, posts: Int)] = []

        var week: String = first
        var guardCount: Int = 0
        while week <= currentWeek && guardCount < 400 {
            guardCount += 1
            let count: Int = posts[week] ?? 0
            let isCurrent: Bool = week == currentWeek
            if count >= FlowdConstants.Streaks.minPostsPerWeek {
                streak += 1
                run += 1
                best = Swift.max(best, streak)
                slackRun = 0
                if run > 0 && run % FlowdConstants.Streaks.freezeEarnedEveryWeeks == 0 && banked < FlowdConstants.Streaks.freezeBankMax {
                    banked += 1
                    earned += 1
                }
                weeks.append((week: week, mark: .posted, posts: count))
            } else if rest.contains(week) || isPaused(week) {
                weeks.append((week: week, mark: .rest, posts: count))
            } else if isCurrent {
                weeks.append((week: week, mark: .open, posts: count))
            } else if slackMode && slackRun < FlowdConstants.Streaks.slackModeWeeks {
                slackRun += 1
                weeks.append((week: week, mark: .rest, posts: count))
            } else if banked > 0 {
                banked -= 1
                used += 1
                weeks.append((week: week, mark: .freezeUsed, posts: count))
            } else {
                streak = 0
                run = 0
                weeks.append((week: week, mark: .missed, posts: count))
            }
            guard let next = FlowdCalendar.isoWeekAdd(week, 1) else {
                break
            }
            week = next
        }

        let current: (week: String, mark: WeekMark, posts: Int)? = weeks.last
        let lastCompleted: (week: String, mark: WeekMark, posts: Int)? = weeks.count >= 2 ? weeks[weeks.count - 2] : nil
        var status: StreakStatus = .active
        if let current = current {
            if current.mark == .posted {
                status = .active
            } else if current.mark == .rest {
                status = .resting
            } else if lastCompleted == nil {
                status = streak > 0 ? .active : .new
            } else if let last = lastCompleted {
                switch last.mark {
                case .freezeUsed: status = .frozen
                case .rest: status = .resting
                case .missed: status = .broken
                case .posted, .open: status = .active
                }
            }
        }

        let records: [WeekRecord] = weeks.filter { (entry: (week: String, mark: WeekMark, posts: Int)) -> Bool in
            return !(entry.week == currentWeek && entry.mark == .open)
        }.compactMap { (entry: (week: String, mark: WeekMark, posts: Int)) -> WeekRecord? in
            switch entry.mark {
            case .posted: return WeekRecord(isoWeek: entry.week, outcome: .posted, posts: entry.posts)
            case .rest: return WeekRecord(isoWeek: entry.week, outcome: .rest, posts: entry.posts)
            case .freezeUsed: return WeekRecord(isoWeek: entry.week, outcome: .freezeUsed, posts: entry.posts)
            case .missed: return WeekRecord(isoWeek: entry.week, outcome: .missed, posts: entry.posts)
            case .open: return nil
            }
        }
        let history: [WeekRecord] = Array(records.suffix(historyWeeks))
        let toNext: Int = (FlowdConstants.Streaks.freezeEarnedEveryWeeks - (run % FlowdConstants.Streaks.freezeEarnedEveryWeeks)) % FlowdConstants.Streaks.freezeEarnedEveryWeeks
        return StreakEvaluation(
            status: status,
            currentWeeks: streak,
            bestWeeks: best,
            freezesBanked: banked,
            freezesEarnedTotal: earned,
            freezesUsedTotal: used,
            isoWeek: currentWeek,
            postsThisWeek: postsThisWeek,
            postedThisWeek: postedThisWeek,
            weekEndsAt: weekEndsAt,
            nextFreezeInWeeks: toNext,
            weeksToNextFreeze: toNext == 0 ? FlowdConstants.Streaks.freezeEarnedEveryWeeks : toNext,
            history: history,
            restWeeksUsedQuarter: restUsed
        )
    }

    /// Copy for the streak card. Calm and factual: it never says a streak can be "lost" and never nags.
    static func copy(status: StreakStatus, currentWeeks: Int, bestWeeks: Int, freezesBanked: Int, weeksToNextFreeze: Int, postedThisWeek: Bool) -> StreakCopy {
        let weeks: String = String(currentWeeks) + "-week streak"
        let freeze: String = freezesBanked > 0 ? String(freezesBanked) + " freeze" + (freezesBanked == 1 ? "" : "s") + " banked." : "No freezes banked yet."
        let next: String = "Next freeze in " + String(weeksToNextFreeze) + " week" + (weeksToNextFreeze == 1 ? "" : "s") + "."
        switch status {
        case .new, .unknown:
            return StreakCopy(headline: "Start a streak", detail: "Post once this week to begin. A week counts when you post at least once.")
        case .active:
            if postedThisWeek {
                return StreakCopy(headline: weeks, detail: "You have posted this week. " + freeze + " " + next)
            }
            return StreakCopy(headline: weeks, detail: "Post any time before the week ends to add a week. " + freeze)
        case .frozen:
            return StreakCopy(headline: weeks, detail: "A freeze covered last week, so your streak carried on. " + freeze)
        case .resting:
            return StreakCopy(headline: weeks + ", resting", detail: "Rest weeks keep your streak safe. Come back whenever you like.")
        case .broken:
            return StreakCopy(headline: "Fresh start", detail: "Your best was " + String(bestWeeks) + " week" + (bestWeeks == 1 ? "" : "s") + ". Post once this week to begin a new streak.")
        }
    }

    static func copy(for evaluation: StreakEvaluation) -> StreakCopy {
        return copy(
            status: evaluation.status,
            currentWeeks: evaluation.currentWeeks,
            bestWeeks: evaluation.bestWeeks,
            freezesBanked: evaluation.freezesBanked,
            weeksToNextFreeze: evaluation.weeksToNextFreeze,
            postedThisWeek: evaluation.postedThisWeek
        )
    }
}
