import Foundation

// CompeteAPI: peer-cohort leaderboards (about 30 creators by tier and niche, a promotion zone, no demotion zone), Tournaments, Crews, referrals,
// weekly streaks (earned freezes, rest weeks, no guilt), the Academy, the Remix library, the Spec Market and auctions.

extension MockFlowdAPI {
    // MARK: Leaderboards

    /// The board for a scope and metric in the current ISO week (the latest week when the clock has moved past the seeded one).
    private func pickLeaderboard(scope: LeaderboardScope, metric: LeaderboardMetric, niche: Niche?, tier: Tier, myNiches: [Niche]) throws -> Leaderboard? {
        let all: [Leaderboard] = try store.leaderboards.all().filter { (b: Leaderboard) -> Bool in
            return b.scope == scope && b.metric == metric
        }
        if all.isEmpty {
            return nil
        }
        let week: String = FlowdCalendar.isoWeek(now)
        let inWeek: [Leaderboard] = all.filter { (b: Leaderboard) -> Bool in
            return b.isoWeek == week
        }
        let pool: [Leaderboard] = inWeek.isEmpty ? all : inWeek
        let mine: [Leaderboard] = pool.filter { (b: Leaderboard) -> Bool in
            return b.entries.contains(where: { (e: LeaderboardEntry) -> Bool in return e.creatorId == meId })
        }
        switch scope {
        case .cohort:
            let wanted: Niche? = niche ?? myNiches.first
            if let exact = mine.first(where: { (b: Leaderboard) -> Bool in return b.tier == tier && (wanted == nil || b.niche == wanted) }) {
                return exact
            }
            return mine.first ?? pool.first(where: { (b: Leaderboard) -> Bool in return b.tier == tier }) ?? pool.first
        case .niche:
            let wanted: Niche? = niche ?? myNiches.first
            if let exact = pool.first(where: { (b: Leaderboard) -> Bool in return b.niche == wanted }) {
                return exact
            }
            return mine.first ?? pool.first
        case .global, .unknown:
            return mine.first ?? pool.first
        }
    }

    func leaderboard(scope: LeaderboardScope, metric: LeaderboardMetric, niche: Niche?) async throws -> LeaderboardStanding {
        try requireSignedIn()
        try reconcileIfNeeded()
        let creator: Creator = try meRow()
        let settings: WellbeingSettings = try wellbeingRow()
        guard var board = try pickLeaderboard(scope: scope, metric: metric, niche: niche, tier: creator.tier, myNiches: creator.niches) else {
            throw FlowdAPIError.notFound("that leaderboard")
        }
        // Earnings boards move with the creator: what cleared since the board was last written is added to their value, and everyone is re-ranked.
        if metric == .earnings {
            let since: Date = board.updatedAt
            let weekStart: Date = FlowdCalendar.isoWeekStart(now)
            var added: Int = 0
            for row in try myMoneyRows() {
                if let cleared = row.clearedAt, cleared > since, cleared >= weekStart {
                    added += row.amountCents
                }
            }
            if added > 0, let index = board.entries.firstIndex(where: { (e: LeaderboardEntry) -> Bool in return e.creatorId == meId }) {
                board.entries[index].value += Double(added)
                board = reranked(board)
            }
        }
        var rows: [LeaderboardRow] = []
        for entry in board.entries.sorted(by: { (a: LeaderboardEntry, b: LeaderboardEntry) -> Bool in return a.rank < b.rank }) {
            guard let summary = try creatorSummary(entry.creatorId) else {
                continue
            }
            rows.append(LeaderboardRow(entry: entry, creator: summary, isMe: entry.creatorId == meId))
        }
        let me: LeaderboardRow? = rows.first(where: { (r: LeaderboardRow) -> Bool in
            return r.isMe
        })
        return LeaderboardStanding(
            leaderboard: board,
            rows: rows,
            me: settings.leaderboardOptOut ? nil : me,
            resetsAt: FlowdCalendar.nextWeekStart(now),
            unranked: me == nil,
            optedOut: settings.leaderboardOptOut
        )
    }

    /// Re-sorts a board by value (ties keep their old order), recomputes ranks, rank change and the promotion zone.
    private func reranked(_ board: Leaderboard) -> Leaderboard {
        var copy: Leaderboard = board
        let order: [LeaderboardEntry] = board.entries.sorted { (a: LeaderboardEntry, b: LeaderboardEntry) -> Bool in
            if a.value != b.value {
                return a.value > b.value
            }
            return a.rank < b.rank
        }
        var out: [LeaderboardEntry] = []
        for (index, entry) in order.enumerated() {
            var next: LeaderboardEntry = entry
            let rank: Int = index + 1
            next.deltaRank = entry.deltaRank + (entry.rank - rank)
            next.rank = rank
            next.zone = rank <= board.promotionZoneSize ? .promotion : .steady
            out.append(next)
        }
        copy.entries = out
        copy.updatedAt = now
        return copy
    }

    // MARK: Streak

    func streakRow() throws -> Streak {
        if let row = try store.streaks.all().first(where: { (s: Streak) -> Bool in
            return s.creatorId == meId
        }) {
            return row
        }
        let creator: Creator = try meRow()
        let moment: Date = now
        let row: Streak = Streak(
            id: "stk_" + creator.handle.replacingOccurrences(of: ".", with: "_"),
            creatorId: meId,
            status: .new,
            currentWeeks: 0,
            bestWeeks: 0,
            freezesBanked: 0,
            freezesEarnedTotal: 0,
            freezesUsedTotal: 0,
            restWeeksUsedQuarter: 0,
            isoWeek: FlowdCalendar.isoWeek(moment),
            postsThisWeek: 0,
            postedThisWeek: false,
            weekEndsAt: FlowdCalendar.isoWeekEnd(moment),
            nextFreezeInWeeks: 0,
            history: [],
            updatedAt: moment
        )
        try store.streaks.append(row)
        return row
    }

    func streakSummary() throws -> StreakSummary {
        try rolloverStreak(at: now)
        let row: Streak = try streakRow()
        let settings: WellbeingSettings = try wellbeingRow()
        let week: String = FlowdCalendar.isoWeek(now)
        let used: Int = StreakEngine.restWeeksUsedInQuarter(settings.restWeeks, week: week)
        let quota: Int = FlowdConstants.Streaks.restWeeksPerQuarter
        let check: RestWeekCheck = StreakEngine.canDeclareRestWeek(restWeeks: settings.restWeeks, week: week)
        let toNext: Int = row.nextFreezeInWeeks == 0 ? FlowdConstants.Streaks.freezeEarnedEveryWeeks : row.nextFreezeInWeeks
        let copy: StreakCopy = StreakEngine.copy(
            status: row.status,
            currentWeeks: row.currentWeeks,
            bestWeeks: row.bestWeeks,
            freezesBanked: row.freezesBanked,
            weeksToNextFreeze: toNext,
            postedThisWeek: row.postedThisWeek
        )
        var reason: String? = check.reason
        if check.ok && row.postedThisWeek {
            reason = "You already posted this week, so this week counts."
        }
        return StreakSummary(
            streak: row,
            copy: copy,
            restWeeksRemainingThisQuarter: Swift.max(0, quota - used),
            canDeclareRestWeek: check.ok && !row.postedThisWeek,
            restWeekReason: reason
        )
    }

    func streak() async throws -> StreakSummary {
        try requireSignedIn()
        try reconcileIfNeeded()
        return try streakSummary()
    }

    func declareRestWeek() async throws -> StreakSummary {
        try requireSignedIn()
        let settings: WellbeingSettings = try wellbeingRow()
        let week: String = FlowdCalendar.isoWeek(now)
        let check: RestWeekCheck = StreakEngine.canDeclareRestWeek(restWeeks: settings.restWeeks, week: week)
        if !check.ok {
            throw FlowdAPIError.conflict(check.reason ?? "That week can't be a rest week.")
        }
        let moment: Date = now
        try store.wellbeing.update(settings.id) { (w: inout WellbeingSettings) in
            w.restWeeks.append(week)
            w.updatedAt = moment
        }
        let row: Streak = try streakRow()
        try store.streaks.update(row.id) { (s: inout Streak) in
            if !s.postedThisWeek {
                s.status = .resting
            }
            s.restWeeksUsedQuarter += 1
            s.updatedAt = moment
        }
        return try streakSummary()
    }

    /// A post counts for the current ISO week. The first post of a week adds a week to the streak; every fourth consecutive week earns a freeze (at most two
    /// are banked).
    func recordPostInStreak(at moment: Date) throws {
        try rolloverStreak(at: moment)
        let row: Streak = try streakRow()
        let currentWeek: String = FlowdCalendar.isoWeek(moment)
        try store.streaks.update(row.id) { (s: inout Streak) in
            s.isoWeek = currentWeek
            s.weekEndsAt = FlowdCalendar.isoWeekEnd(moment)
            s.postsThisWeek += 1
            if !s.postedThisWeek {
                s.postedThisWeek = true
                s.currentWeeks += 1
                s.bestWeeks = Swift.max(s.bestWeeks, s.currentWeeks)
                s.status = .active
                if s.currentWeeks % FlowdConstants.Streaks.freezeEarnedEveryWeeks == 0 && s.freezesBanked < FlowdConstants.Streaks.freezeBankMax {
                    s.freezesBanked += 1
                    s.freezesEarnedTotal += 1
                }
            }
            let every: Int = FlowdConstants.Streaks.freezeEarnedEveryWeeks
            s.nextFreezeInWeeks = (every - (s.currentWeeks % every)) % every
            let record: WeekRecord = WeekRecord(isoWeek: currentWeek, outcome: .posted, posts: s.postsThisWeek)
            if let last = s.history.last, last.isoWeek == currentWeek {
                s.history[s.history.count - 1] = record
            } else {
                s.history.append(record)
            }
            if s.history.count > 12 {
                s.history.removeFirst(s.history.count - 12)
            }
            s.updatedAt = moment
        }
        let weeks: Int = try streakRow().currentWeeks
        try store.creators.update(meId) { (c: inout Creator) in
            c.streakWeeks = weeks
        }
    }

    /// When the ISO week changes, the week that ended is settled: a posted week stands; a rest week keeps the streak; otherwise a banked freeze covers it,
    /// or the streak starts again (the best is kept). Nothing here ever says a streak was "lost".
    func rolloverStreak(at moment: Date) throws {
        let row: Streak = try streakRow()
        let currentWeek: String = FlowdCalendar.isoWeek(moment)
        if row.isoWeek >= currentWeek {
            return
        }
        let settings: WellbeingSettings = try wellbeingRow()
        let creator: Creator = try meRow()
        var state: Streak = row
        var week: String = row.isoWeek
        var guardCount: Int = 0
        while week < currentWeek && guardCount < 60 {
            guardCount += 1
            let posted: Bool = state.postsThisWeek >= FlowdConstants.Streaks.minPostsPerWeek
            var outcome: WeekOutcome = .posted
            let paused: Bool = (creator.pausedUntil ?? Date.distantPast) > (FlowdCalendar.isoWeekToStart(week) ?? moment)
            if posted {
                outcome = .posted
                state.status = .active
            } else if settings.restWeeks.contains(week) || paused {
                outcome = .rest
                state.status = .resting
            } else if settings.slackMode && trailingRestWeeks(state.history) < FlowdConstants.Streaks.slackModeWeeks {
                outcome = .rest
                state.status = .resting
            } else if state.freezesBanked > 0 {
                outcome = .freezeUsed
                state.freezesBanked -= 1
                state.freezesUsedTotal += 1
                state.status = .frozen
            } else {
                outcome = .missed
                state.currentWeeks = 0
                state.status = .broken
            }
            let record: WeekRecord = WeekRecord(isoWeek: week, outcome: outcome, posts: state.postsThisWeek)
            if let last = state.history.last, last.isoWeek == week {
                state.history[state.history.count - 1] = record
            } else {
                state.history.append(record)
            }
            guard let next = FlowdCalendar.isoWeekAdd(week, 1) else {
                break
            }
            week = next
            state.isoWeek = week
            state.postsThisWeek = 0
            state.postedThisWeek = false
        }
        if state.history.count > 12 {
            state.history.removeFirst(state.history.count - 12)
        }
        let every: Int = FlowdConstants.Streaks.freezeEarnedEveryWeeks
        state.nextFreezeInWeeks = state.currentWeeks == 0 ? 0 : (every - (state.currentWeeks % every)) % every
        state.isoWeek = currentWeek
        state.weekEndsAt = FlowdCalendar.isoWeekEnd(moment)
        state.restWeeksUsedQuarter = StreakEngine.restWeeksUsedInQuarter(settings.restWeeks, week: currentWeek)
        state.updatedAt = moment
        let saved: Streak = state
        try store.streaks.update(row.id) { (s: inout Streak) in
            s = saved
        }
        try store.creators.update(meId) { (c: inout Creator) in
            c.streakWeeks = saved.currentWeeks
        }
    }

    private func trailingRestWeeks(_ history: [WeekRecord]) -> Int {
        var count: Int = 0
        for record in history.reversed() {
            if record.outcome == .rest {
                count += 1
            } else {
                break
            }
        }
        return count
    }

    // MARK: Academy

    private func badgeCriteria(_ badge: BadgeId) -> String {
        switch badge {
        case .foundingCreator: return "One of the first 200 creators."
        case .firstDollar: return "Your first dollar cleared."
        case .streak4: return "Post in 4 weeks in a row."
        case .streak8: return "Post in 8 weeks in a row."
        case .streak12: return "Post in 12 weeks in a row."
        case .academyGraduate: return "Finish all ten Academy lessons."
        case .crewLead: return "Lead a crew."
        case .tournamentWinner: return "Win a Tournament."
        case .top10Week: return "Finish a week in the top 10 of your cohort."
        case .hookMaster: return "Hook Score A on five takes."
        case .idVerified: return "Verify your identity."
        case .alwaysOnTime: return "Every revision and deadline on time."
        case .millionViews: return "One million verified views."
        case .firstTrial: return "A trial started through your link."
        case .unknown: return ""
        }
    }

    func academy() async throws -> AcademyOverview {
        try requireSignedIn()
        try reconcileIfNeeded()
        let creator: Creator = try meRow()
        let lessons: [Lesson] = try store.lessons.all().sorted { (a: Lesson, b: Lesson) -> Bool in
            return a.order < b.order
        }
        let progress: [LessonProgress] = try store.lessonProgress.all().filter { (p: LessonProgress) -> Bool in
            return p.creatorId == meId
        }
        let byLesson: [String: LessonProgress] = Dictionary(progress.map { (p: LessonProgress) -> (String, LessonProgress) in
            return (p.lessonId, p)
        }, uniquingKeysWith: { (first: LessonProgress, second: LessonProgress) -> LessonProgress in
            return first
        })
        let items: [LessonItem] = lessons.map { (l: Lesson) -> LessonItem in
            return LessonItem(lesson: l, progress: byLesson[l.id])
        }
        let completed: Int = items.filter { (i: LessonItem) -> Bool in
            return i.progress?.status == .completed
        }.count
        let badges: [BadgeItem] = BadgeId.allCases.map { (b: BadgeId) -> BadgeItem in
            return BadgeItem(badge: b, earned: creator.badges.contains(b), criteria: badgeCriteria(b))
        }
        let bonus: Double = Swift.min(Double(FlowdConstants.Reliability.Creator.academyBonusCap), FlowdConstants.Reliability.Creator.academyBonusPerLesson * Double(completed))
        let next: Lesson? = items.first(where: { (i: LessonItem) -> Bool in
            return i.progress?.status != .completed
        })?.lesson
        return AcademyOverview(lessons: items, completedCount: completed, badges: badges, reliabilityBonusPoints: bonus, nextLesson: next)
    }

    func lessonRow(slug: String) throws -> Lesson {
        guard let lesson = try store.lessons.all().first(where: { (l: Lesson) -> Bool in
            return l.slug == slug || l.id == slug
        }) else {
            throw FlowdAPIError.notFound("that lesson")
        }
        return lesson
    }

    func lesson(slug: String) async throws -> LessonItem {
        try requireSignedIn()
        let lesson: Lesson = try lessonRow(slug: slug)
        let progress: LessonProgress? = try store.lessonProgress.all().first(where: { (p: LessonProgress) -> Bool in
            return p.creatorId == meId && p.lessonId == lesson.id
        })
        return LessonItem(lesson: lesson, progress: progress)
    }

    func completeLesson(slug: String, answers: [Int]) async throws -> LessonResult {
        try requireSignedIn()
        let lesson: Lesson = try lessonRow(slug: slug)
        if answers.count != lesson.quiz.count {
            throw FlowdAPIError.validationFailed("Answer all " + String(lesson.quiz.count) + " questions.")
        }
        var correct: [Bool] = []
        for (index, question) in lesson.quiz.enumerated() {
            correct.append(answers[index] == question.answerIndex)
        }
        let rightCount: Int = correct.filter { (c: Bool) -> Bool in
            return c
        }.count
        let score: Double = MoneyMath.round2(Double(rightCount) / Double(Swift.max(1, lesson.quiz.count)))
        let passed: Bool = score >= 0.66
        let moment: Date = now
        let existing: LessonProgress? = try store.lessonProgress.all().first(where: { (p: LessonProgress) -> Bool in
            return p.creatorId == meId && p.lessonId == lesson.id
        })
        let wasDone: Bool = existing?.status == .completed
        var progress: LessonProgress
        if let row = existing {
            progress = try store.lessonProgress.update(row.id) { (p: inout LessonProgress) in
                if passed {
                    p.status = .completed
                    p.quizScore = Swift.max(score, p.quizScore ?? 0)
                    p.completedAt = p.completedAt ?? moment
                    p.badgeAwarded = true
                } else if p.status != .completed {
                    p.status = .inProgress
                }
                p.startedAt = p.startedAt ?? moment
            }
        } else {
            let ids: [String] = try store.lessonProgress.all().map { (p: LessonProgress) -> String in
                return p.id
            }
            let created: LessonProgress = LessonProgress(
                id: nextId("lsp", width: 4, existing: ids),
                creatorId: meId,
                lessonId: lesson.id,
                status: passed ? .completed : .inProgress,
                quizScore: passed ? score : nil,
                startedAt: moment,
                completedAt: passed ? moment : nil,
                badgeAwarded: passed
            )
            try store.lessonProgress.append(created)
            progress = created
        }
        var awarded: Bool = false
        if passed && !wasDone {
            awarded = true
            let mine: Int = try store.lessonProgress.all().filter { (p: LessonProgress) -> Bool in
                return p.creatorId == meId && p.status == .completed
            }.count
            let total: Int = try store.lessons.all().count
            let creator: Creator = try meRow()
            if mine >= total && !creator.badges.contains(.academyGraduate) {
                try store.creators.update(meId) { (c: inout Creator) in
                    c.badges.append(.academyGraduate)
                }
            }
            let bonusPer: Double = FlowdConstants.Reliability.Creator.academyBonusPerLesson
            try notify(
                .academyBadge,
                title: "Badge earned: " + lesson.badgeLabel,
                body: lesson.title + " is done. Your reliability score gets +" + Fmt.decimal(bonusPer, digits: 1) + " for it (up to " + String(FlowdConstants.Reliability.Creator.academyBonusCap) + " across the Academy).",
                deepLink: "flowd://lesson/" + lesson.slug,
                refKind: "lesson",
                refId: lesson.id
            )
            try refreshCreatorStats()
        }
        progress = try store.lessonProgress.find(progress.id) ?? progress
        return LessonResult(lesson: lesson, progress: progress, correct: correct, score: score, passed: passed, badgeAwarded: awarded)
    }

    // MARK: Remix library

    func remixLibrary() async throws -> RemixLibrary {
        try requireSignedIn()
        let formats: [Format] = try store.formats.all().sorted { (a: Format, b: Format) -> Bool in
            return a.rank < b.rank
        }
        let hooks: [Hook] = try store.hooks.all().sorted { (a: Hook, b: Hook) -> Bool in
            if a.stats.trialRate != b.stats.trialRate {
                return a.stats.trialRate > b.stats.trialRate
            }
            return a.id < b.id
        }
        let trends: [Trend] = try store.trends.all().sorted { (a: Trend, b: Trend) -> Bool in
            if a.weeklyChangeRatio != b.weeklyChangeRatio {
                return a.weeklyChangeRatio > b.weeklyChangeRatio
            }
            return a.id < b.id
        }
        return RemixLibrary(formats: formats, hooks: hooks, trends: trends)
    }

    // MARK: Tournaments

    func tournamentView(_ tournament: Tournament) throws -> TournamentView {
        let creator: Creator = try meRow()
        let entries: [TournamentEntry] = try store.tournamentEntries.all().filter { (e: TournamentEntry) -> Bool in
            return e.tournamentId == tournament.id
        }.sorted { (a: TournamentEntry, b: TournamentEntry) -> Bool in
            return a.seed < b.seed
        }
        var rows: [TournamentEntryRow] = []
        for entry in entries {
            guard let summary = try creatorSummary(entry.creatorId) else {
                continue
            }
            rows.append(TournamentEntryRow(entry: entry, creator: summary, isMe: entry.creatorId == meId))
        }
        let mine: TournamentEntry? = entries.first(where: { (e: TournamentEntry) -> Bool in
            return e.creatorId == meId
        })
        var lock: String? = nil
        switch tournament.status {
        case .complete, .judging, .cancelled:
            lock = tournament.status == .cancelled ? "This tournament was cancelled." : "Entries are closed. This tournament is over."
        case .announced:
            if tournament.entriesOpenAt > now {
                lock = "Entries open " + Fmt.datedClockLabelUTC(tournament.entriesOpenAt) + "."
            }
        case .open, .live, .unknown:
            break
        }
        if lock == nil, let minTier = tournament.minTier, !creator.tier.atLeast(minTier) {
            lock = "This tournament is for " + minTier.label + " creators and above."
        }
        if lock == nil, let niche = tournament.niche, !creator.niches.contains(niche) {
            lock = "This tournament is for " + niche.label + " creators."
        }
        if lock == nil && mine != nil {
            lock = "You are in. Your hook is entered."
        }
        return TournamentView(tournament: tournament, myEntry: mine, canEnter: lock == nil, lockReason: lock, entries: rows)
    }

    private func tournamentOrder(_ status: TournamentStatus) -> Int {
        switch status {
        case .live: return 0
        case .open: return 1
        case .announced: return 2
        case .judging: return 3
        case .complete: return 4
        case .cancelled: return 5
        case .unknown: return 6
        }
    }

    func tournaments() async throws -> [TournamentView] {
        try requireSignedIn()
        try reconcileIfNeeded()
        let rows: [Tournament] = try store.tournaments.all().sorted { (a: Tournament, b: Tournament) -> Bool in
            let oa: Int = tournamentOrder(a.status)
            let ob: Int = tournamentOrder(b.status)
            if oa != ob {
                return oa < ob
            }
            return a.startsAt > b.startsAt
        }
        var out: [TournamentView] = []
        for row in rows {
            out.append(try tournamentView(row))
        }
        return out
    }

    func tournament(id: String) async throws -> TournamentView {
        try requireSignedIn()
        try reconcileIfNeeded()
        guard let row = try store.tournaments.find(id) else {
            throw FlowdAPIError.notFound("that tournament")
        }
        return try tournamentView(row)
    }

    func joinTournament(id: String, _ request: TournamentEntryRequest) async throws -> TournamentEntry {
        try requireSignedIn()
        try reconcileIfNeeded()
        guard let row = try store.tournaments.find(id) else {
            throw FlowdAPIError.notFound("that tournament")
        }
        let view: TournamentView = try tournamentView(row)
        let me: Creator = try meRow()
        if !view.canEnter {
            if view.myEntry != nil {
                throw FlowdAPIError.conflict("You already entered this tournament.")
            }
            if let minTier = row.minTier, !me.tier.atLeast(minTier) {
                throw FlowdAPIError.tierLocked(required: minTier, message: view.lockReason ?? "")
            }
            throw FlowdAPIError.conflict(view.lockReason ?? "Entries are closed.")
        }
        let hook: String = request.hookText.trimmingCharacters(in: .whitespacesAndNewlines)
        if hook.count < 8 {
            throw FlowdAPIError.validationFailed("Write your hook line (a sentence).")
        }
        let scored: HookTextResult = HookTextEngine.scoreText(hook)
        let moment: Date = now
        let ids: [String] = try store.tournamentEntries.all().map { (e: TournamentEntry) -> String in
            return e.id
        }
        let title: String = hook.split(separator: " ").prefix(3).joined(separator: " ")
        let entry: TournamentEntry = TournamentEntry(
            id: nextId("tent", width: 4, existing: ids),
            tournamentId: id,
            creatorId: meId,
            status: .entered,
            hookText: hook,
            submissionId: request.submissionId,
            thumb: ArtSeed(key: id + "|" + meId, title: title, caption: row.sponsorLabel, glyph: "bolt.fill"),
            hookPoints: scored.score,
            hookBand: scored.band,
            seed: row.entriesCount + 1,
            roundReached: 1,
            placement: nil,
            prizeCents: nil,
            enteredAt: moment,
            updatedAt: moment
        )
        try store.tournamentEntries.append(entry)
        try store.tournaments.update(id) { (t: inout Tournament) in
            t.entriesCount += 1
        }
        return entry
    }

    /// Tournaments move through their stages on the clock: announced, open, live, judging.
    func advanceTournaments(at moment: Date) throws {
        for tournament in try store.tournaments.all() {
            var next: TournamentStatus = tournament.status
            switch tournament.status {
            case .announced:
                if moment >= tournament.entriesOpenAt {
                    next = .open
                }
            case .open:
                if moment >= tournament.startsAt {
                    next = .live
                }
            case .live:
                if moment >= tournament.endsAt {
                    next = .judging
                }
            case .judging, .complete, .cancelled, .unknown:
                break
            }
            if next != tournament.status {
                try store.tournaments.update(tournament.id) { (t: inout Tournament) in
                    t.status = next
                }
            }
        }
    }

    // MARK: Crews

    private func crewView(_ crew: Crew) throws -> CrewView {
        let members: [CrewMember] = try store.crewMembers.all().filter { (m: CrewMember) -> Bool in
            return m.crewId == crew.id
        }.sorted { (a: CrewMember, b: CrewMember) -> Bool in
            if a.weekClearedCents != b.weekClearedCents {
                return a.weekClearedCents > b.weekClearedCents
            }
            return a.joinedAt < b.joinedAt
        }
        var rows: [CrewMemberRow] = []
        for member in members {
            guard let summary = try creatorSummary(member.creatorId) else {
                continue
            }
            rows.append(CrewMemberRow(member: member, creator: summary, isMe: member.creatorId == meId))
        }
        let mine: CrewMember? = members.first(where: { (m: CrewMember) -> Bool in
            return m.creatorId == meId
        })
        let progress: Double = crew.weeklyGoalCents > 0 ? MoneyMath.clamp01(Double(crew.weekClearedCents) / Double(crew.weeklyGoalCents)) : 0
        let bonus: String = "Crew bonus: " + Fmt.percent(FlowdConstants.Crews.weeklyGoalBonusRate, digits: 0) + " of the weekly goal when you hit it, up to " + Fmt.money(FlowdConstants.Crews.weeklyGoalBonusCapCents) + ", paid by flowd."
        return CrewView(crew: crew, members: rows, isMine: mine != nil, myRole: mine?.role, goalProgress: progress, bonusNote: bonus)
    }

    private func myCrewMembership() throws -> CrewMember? {
        return try store.crewMembers.all().first(where: { (m: CrewMember) -> Bool in
            return m.creatorId == meId
        })
    }

    func crews() async throws -> CrewDirectory {
        try requireSignedIn()
        try reconcileIfNeeded()
        let creator: Creator = try meRow()
        let membership: CrewMember? = try myCrewMembership()
        var mine: CrewView? = nil
        if let member = membership, let crew = try store.crews.find(member.crewId) {
            mine = try crewView(crew)
        }
        var discover: [CrewView] = []
        let all: [Crew] = try store.crews.all().filter { (c: Crew) -> Bool in
            return c.id != membership?.crewId
        }.sorted { (a: Crew, b: Crew) -> Bool in
            let na: Int = creator.niches.contains(a.niche) ? 0 : 1
            let nb: Int = creator.niches.contains(b.niche) ? 0 : 1
            if na != nb {
                return na < nb
            }
            return a.weekRank < b.weekRank
        }
        for crew in all {
            discover.append(try crewView(crew))
        }
        let canLead: Bool = creator.tier.atLeast(.gold) && membership == nil
        var lock: String? = nil
        if !creator.tier.atLeast(.gold) {
            lock = "Leading a crew opens at Gold. You can join any open crew now."
        } else if membership != nil {
            lock = "Leave your crew before starting a new one."
        }
        return CrewDirectory(mine: mine, discover: discover, canCreate: canLead, createLockText: lock)
    }

    func crew(id: String) async throws -> CrewView {
        try requireSignedIn()
        guard let row = try store.crews.find(id) else {
            throw FlowdAPIError.notFound("that crew")
        }
        return try crewView(row)
    }

    func createCrew(_ request: CreateCrewRequest) async throws -> CrewView {
        try requireSignedIn()
        let creator: Creator = try meRow()
        if !creator.tier.atLeast(.gold) {
            throw FlowdAPIError.tierLocked(required: .gold, message: "Leading a crew opens at Gold. You can join any open crew now.")
        }
        if try myCrewMembership() != nil {
            throw FlowdAPIError.conflict("Leave your current crew before starting a new one.")
        }
        let name: String = request.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.count < 3 || name.count > 32 {
            throw FlowdAPIError.validationFailed("A crew name is 3 to 32 characters.")
        }
        let id: String = "crew_" + TextTools.slugify(name).replacingOccurrences(of: "-", with: "_")
        if try store.crews.find(id) != nil {
            throw FlowdAPIError.conflict("A crew with that name exists.")
        }
        let moment: Date = now
        let code: String = String(name.filter { (c: Character) -> Bool in return c.isLetter || c.isNumber }.uppercased().prefix(6)) + String(StableHash.bucket(name, modulus: 90) + 10)
        let crew: Crew = Crew(
            id: id,
            name: name,
            tagline: request.tagline.trimmingCharacters(in: .whitespacesAndNewlines),
            art: ArtSeed(key: id, title: String(name.prefix(2)).uppercased(), caption: nil, glyph: "person.3.fill"),
            niche: request.niche,
            leadCreatorId: meId,
            memberCount: 1,
            open: request.isOpen,
            inviteCode: code,
            weeklyGoalCents: 25_000,
            weekClearedCents: 0,
            weekRank: try store.crews.all().count + 1,
            bonusEarnedTotalCents: 0,
            lifetimeClearedCents: 0,
            createdAt: moment
        )
        try store.crews.append(crew)
        let ids: [String] = try store.crewMembers.all().map { (m: CrewMember) -> String in
            return m.id
        }
        try store.crewMembers.append(CrewMember(id: nextId("cmem", width: 4, existing: ids), crewId: id, creatorId: meId, role: .lead, joinedAt: moment, weekClearedCents: 0, lifetimeClearedCents: 0))
        return try crewView(crew)
    }

    func joinCrew(id: String) async throws -> CrewView {
        try requireSignedIn()
        let creator: Creator = try meRow()
        guard let crew = try store.crews.find(id) else {
            throw FlowdAPIError.notFound("that crew")
        }
        if try myCrewMembership() != nil {
            throw FlowdAPIError.conflict("You are already in a crew. Leave it first.")
        }
        if crew.memberCount >= FlowdConstants.Crews.maxMembers {
            throw FlowdAPIError.conflict("Crews hold " + String(FlowdConstants.Crews.maxMembers) + " creators at most.")
        }
        if !crew.open {
            throw FlowdAPIError.forbidden("This crew is invite-only. Ask the lead for the code.")
        }
        let moment: Date = now
        let ids: [String] = try store.crewMembers.all().map { (m: CrewMember) -> String in
            return m.id
        }
        try store.crewMembers.append(CrewMember(id: nextId("cmem", width: 4, existing: ids), crewId: id, creatorId: meId, role: .member, joinedAt: moment, weekClearedCents: 0, lifetimeClearedCents: creator.lifetimeClearedCents))
        let updated: Crew = try store.crews.update(id) { (c: inout Crew) in
            c.memberCount += 1
        }
        return try crewView(updated)
    }

    func leaveCrew(id: String) async throws {
        try requireSignedIn()
        guard let membership = try myCrewMembership(), membership.crewId == id else {
            throw FlowdAPIError.conflict("You are not in that crew.")
        }
        try store.crewMembers.remove(membership.id)
        let rest: [CrewMember] = try store.crewMembers.all().filter { (m: CrewMember) -> Bool in
            return m.crewId == id
        }
        if rest.isEmpty {
            try store.crews.remove(id)
            return
        }
        if membership.role == .lead {
            let next: CrewMember = rest.sorted { (a: CrewMember, b: CrewMember) -> Bool in
                return a.joinedAt < b.joinedAt
            }[0]
            try store.crewMembers.update(next.id) { (m: inout CrewMember) in
                m.role = .lead
            }
            try store.crews.update(id) { (c: inout Crew) in
                c.memberCount = rest.count
                c.leadCreatorId = next.creatorId
            }
        } else {
            try store.crews.update(id) { (c: inout Crew) in
                c.memberCount = rest.count
            }
        }
    }

    // MARK: Referrals

    func referrals() async throws -> ReferralSummary {
        try requireSignedIn()
        let creator: Creator = try meRow()
        let rows: [Referral] = try store.referrals.all().filter { (r: Referral) -> Bool in
            return r.referrerCreatorId == meId
        }.sorted { (a: Referral, b: Referral) -> Bool in
            return a.invitedAt > b.invitedAt
        }
        let joined: Int = rows.filter { (r: Referral) -> Bool in
            return r.status != .invited && r.status != .expired
        }.count
        let earned: Int = rows.reduce(0) { (total: Int, r: Referral) -> Int in
            return total + r.rewardEarnedCents
        }
        let rules: [String] = [
            "One level only: you earn on the creators you invite, never on the people they invite.",
            "You earn " + Fmt.percent(FlowdConstants.Referrals.creatorShareRate, digits: 0) + " of what they clear in their first " + String(FlowdConstants.Referrals.creatorShareDays) + " days, up to " + Fmt.money(FlowdConstants.Referrals.creatorShareCapPerRefereeCents) + " each.",
            "flowd pays it. Nothing is taken from the creator you invite, and it never touches their pay.",
            "Pending until their first dollar clears, then it clears with your next daily run."
        ]
        return ReferralSummary(
            code: creator.referralCode,
            link: "joinflowd.io/c/" + creator.handle + "?ref=" + creator.referralCode,
            referrals: rows,
            joinedCount: joined,
            earnedCents: earned,
            rules: rules
        )
    }

    func createReferralInvite(channel: String) async throws -> Referral {
        try requireSignedIn()
        let creator: Creator = try meRow()
        let moment: Date = now
        let ids: [String] = try store.referrals.all().map { (r: Referral) -> String in
            return r.id
        }
        let id: String = nextId("ref", width: 4, existing: ids)
        let referral: Referral = Referral(
            id: id,
            kind: .creator,
            status: .invited,
            code: creator.referralCode,
            referrerCreatorId: meId,
            referrerBrandId: nil,
            refereeCreatorId: nil,
            refereeBrandId: nil,
            refereeLabel: "Invite " + String(id.suffix(4)),
            channel: channel.isEmpty ? "link" : channel,
            invitedAt: moment,
            joinedAt: nil,
            firstDollarAt: nil,
            rewardWindowEndsAt: nil,
            rewardRate: FlowdConstants.Referrals.creatorShareRate,
            rewardCapCents: FlowdConstants.Referrals.creatorShareCapPerRefereeCents,
            rewardEarnedCents: 0,
            createdAt: moment,
            updatedAt: moment
        )
        try store.referrals.append(referral)
        return referral
    }

    // MARK: Specs (pre-made, pre-scored videos brands can license)

    func specs() async throws -> [Spec] {
        try requireSignedIn()
        return try store.specs.all().filter { (s: Spec) -> Bool in
            return s.creatorId == meId
        }.sorted { (a: Spec, b: Spec) -> Bool in
            return a.createdAt > b.createdAt
        }
    }

    func createSpec(_ request: CreateSpecRequest) async throws -> Spec {
        try requireSignedIn()
        let title: String = request.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if title.count < 3 {
            throw FlowdAPIError.validationFailed("Give the spec a title brands will recognise.")
        }
        let hook: String = request.hookText.trimmingCharacters(in: .whitespacesAndNewlines)
        if hook.count < 8 {
            throw FlowdAPIError.validationFailed("Write the hook line the video opens with.")
        }
        if request.priceCents < FlowdConstants.Specs.priceFloorCents || request.priceCents > FlowdConstants.Specs.priceCapCents {
            throw FlowdAPIError.validationFailed("A spec's price is between " + Fmt.money(FlowdConstants.Specs.priceFloorCents) + " and " + Fmt.money(FlowdConstants.Specs.priceCapCents) + ".")
        }
        let scored: HookTextResult = HookTextEngine.scoreText(hook)
        let moment: Date = now
        let ids: [String] = try store.specs.all().map { (s: Spec) -> String in
            return s.id
        }
        var card: RightsCard = RightsCard(
            organic: true,
            paidAdsDays: request.paidAdsDays,
            adPlatforms: [.tiktok, .meta],
            whitelisting: false,
            renewalPctPer30d: FlowdConstants.Rights.renewalFeePctOfBasePer30d,
            exclusivityDays: request.exclusive ? 30 : 0,
            aiLikeness: false,
            territory: "Worldwide",
            summary: ""
        )
        card.summary = RightsEngine.summary(card)
        let spec: Spec = Spec(
            id: nextId("spec", width: 3, existing: ids),
            creatorId: meId,
            title: title,
            description: request.description,
            status: .scoring,
            source: .creatorUpload,
            art: request.video.art,
            video: request.video,
            formatId: request.formatId,
            hookText: hook,
            hookType: request.hookType,
            category: request.category,
            flowBand: .c,
            flowPoints: 0,
            hookBand: scored.band,
            hookPoints: scored.score,
            qaPass: 0,
            qaWarn: 0,
            qaFail: 0,
            tags: VideoTags(formatId: request.formatId, hookType: request.hookType, hookWords: hook.split(separator: " ").prefix(4).joined(separator: " "), timeToAppRevealMs: 2_500, ctaType: .tryFree),
            priceCents: request.priceCents,
            paidAdsDays: request.paidAdsDays,
            exclusive: request.exclusive,
            rightsCard: card,
            stats: SpecStats(previews: 0, saves: 0, licenses: 0),
            licenses: [],
            sourceSubmissionId: nil,
            sourceBountyId: nil,
            sourceBrandId: nil,
            firstRefusalEndsAt: nil,
            listedAt: nil,
            createdAt: moment,
            updatedAt: moment
        )
        try store.specs.append(spec)
        return spec
    }

    func scoreSpec(id: String) async throws -> Spec {
        try requireSignedIn()
        guard let row = try store.specs.find(id), row.creatorId == meId else {
            throw FlowdAPIError.notFound("that spec")
        }
        if row.status != .scoring && row.status != .draft {
            return row
        }
        let moment: Date = now
        // Flow Score of a spec: the hook carries 30, the rest follows the clip's length and caption support; deterministic.
        let seconds: Double = Double(row.video.durationMs) / 1_000
        var points: Int = Int((Double(row.hookPoints) * 0.30).rounded())
        points += seconds >= 15 && seconds <= 45 ? 22 : 12
        points += row.video.hasCaptions ? 18 : 8
        points += 15
        points += row.video.height >= 1_920 ? 5 : 2
        let flowPoints: Int = Swift.min(100, points + 8)
        let listable: Bool = flowPoints >= FlowdConstants.Specs.minFlowPointsToList
        return try store.specs.update(id) { (s: inout Spec) in
            s.flowPoints = flowPoints
            s.flowBand = ScoringEngine.band(for: flowPoints)
            s.qaPass = listable ? 13 : 10
            s.qaWarn = listable ? 1 : 3
            s.qaFail = 0
            s.status = listable ? .listed : .draft
            s.listedAt = listable ? moment : nil
            s.updatedAt = moment
        }
    }

    func withdrawSpec(id: String) async throws -> Spec {
        try requireSignedIn()
        guard let row = try store.specs.find(id), row.creatorId == meId else {
            throw FlowdAPIError.notFound("that spec")
        }
        if row.status == .licensed {
            throw FlowdAPIError.conflict("A licensed spec can't be withdrawn. The licence stays with the brand.")
        }
        let moment: Date = now
        return try store.specs.update(id) { (s: inout Spec) in
            s.status = .withdrawn
            s.updatedAt = moment
        }
    }

    // MARK: Auctions (sealed-bid, Platinum and above)

    func auctions() async throws -> [Auction] {
        try requireSignedIn()
        try reconcileIfNeeded()
        return try store.auctions.all().filter { (a: Auction) -> Bool in
            return a.creatorId == meId
        }.sorted { (a: Auction, b: Auction) -> Bool in
            return a.closesAt > b.closesAt
        }
    }

    func createAuction(_ request: CreateAuctionRequest) async throws -> Auction {
        try requireSignedIn()
        let creator: Creator = try meRow()
        if !FlowdConstants.tierPerks(creator.tier).auctions {
            throw FlowdAPIError.tierLocked(required: .platinum, message: "Running an auction opens at Platinum.")
        }
        if request.slots < FlowdConstants.Auctions.minSlots || request.slots > FlowdConstants.Auctions.maxSlots {
            throw FlowdAPIError.validationFailed("An auction has " + String(FlowdConstants.Auctions.minSlots) + " to " + String(FlowdConstants.Auctions.maxSlots) + " slots.")
        }
        if request.reserveCents < FlowdConstants.Auctions.reserveFloorCents {
            throw FlowdAPIError.validationFailed("The reserve is at least " + Fmt.money(FlowdConstants.Auctions.reserveFloorCents) + " a slot.")
        }
        let hours: Double = FlowdCalendar.hoursBetween(request.opensAt, request.closesAt)
        if hours < Double(FlowdConstants.Auctions.minDurationHours) || hours > Double(FlowdConstants.Auctions.maxDurationDays * 24) {
            throw FlowdAPIError.validationFailed("An auction runs at least " + String(FlowdConstants.Auctions.minDurationHours) + " hours and at most " + String(FlowdConstants.Auctions.maxDurationDays) + " days.")
        }
        let moment: Date = now
        let ids: [String] = try store.auctions.all().map { (a: Auction) -> String in
            return a.id
        }
        let id: String = nextId("auc", width: 3, existing: ids)
        let rate: RateCard? = try store.rateCards.all().first(where: { (r: RateCard) -> Bool in
            return r.creatorId == meId
        })
        let deliverables: Deliverables = Deliverables(
            videosPerCreator: 1,
            minDurationS: 15,
            maxDurationS: 45,
            aspect: "9:16",
            platforms: rate?.platforms ?? [.tiktok],
            regions: [creator.country],
            requireFace: true,
            musicPolicy: .commercialLibrary,
            aiPolicy: .notAllowed
        )
        var card: RightsCard = RightsCard(
            organic: true,
            paidAdsDays: FlowdConstants.Rights.paidAdsDefaultDays,
            adPlatforms: [.tiktok, .meta],
            whitelisting: true,
            renewalPctPer30d: FlowdConstants.Rights.renewalFeePctOfBasePer30d,
            exclusivityDays: 0,
            aiLikeness: false,
            territory: "Worldwide",
            summary: ""
        )
        card.summary = RightsEngine.summary(card)
        let auction: Auction = Auction(
            id: id,
            creatorId: meId,
            title: request.title,
            description: request.description,
            status: request.opensAt <= moment ? .open : .scheduled,
            slots: request.slots,
            reserveCents: request.reserveCents,
            deliverables: deliverables,
            rightsCard: card,
            opensAt: request.opensAt,
            closesAt: request.closesAt,
            art: ArtSeed(key: id, title: request.title, caption: "@" + creator.handle, glyph: "hammer.fill"),
            bids: [],
            bidsCount: 0,
            clearingPriceCents: nil,
            winningBidIds: nil,
            resultingBountyIds: nil,
            awardedAt: nil,
            createdAt: moment,
            updatedAt: moment
        )
        try store.auctions.append(auction)
        return auction
    }

    func cancelAuction(id: String) async throws -> Auction {
        try requireSignedIn()
        guard let row = try store.auctions.find(id), row.creatorId == meId else {
            throw FlowdAPIError.notFound("that auction")
        }
        if row.status != .scheduled && row.status != .open {
            throw FlowdAPIError.conflict("This auction is " + row.status.label.lowercased() + ".")
        }
        if row.bidsCount > 0 {
            throw FlowdAPIError.conflict("Sealed bids are in, so this auction can't be cancelled. It closes " + Fmt.datedClockLabelUTC(row.closesAt) + ".")
        }
        let moment: Date = now
        return try store.auctions.update(id) { (a: inout Auction) in
            a.status = .cancelled
            a.updatedAt = moment
        }
    }
}
