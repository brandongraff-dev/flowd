import Foundation

// Session, profile, linked accounts, reputation, tiers, verification, preferences and Wellbeing Mode.

extension MockFlowdAPI {
    // MARK: Session

    func session() throws -> CreatorSession {
        return CreatorSession(
            user: try meUser(),
            creator: try meRow(),
            token: "demo-token-" + meId,
            isDemo: true,
            now: now
        )
    }

    func signIn(_ credential: SignInCredential) async throws -> CreatorSession {
        switch credential {
        case .demo:
            let world: World = try store.world()
            persona = .maya
            meId = world.personas.creator.creatorId
            meUserId = world.personas.creator.userId
        case .apple(_, _, let fullName, let email):
            try startNewCreator(fullName: fullName, email: email)
        }
        signedIn = true
        accountDeleted = false
        return try session()
    }

    func currentSession() async throws -> CreatorSession? {
        if !signedIn || accountDeleted {
            return nil
        }
        return try session()
    }

    func signOut() async throws {
        signedIn = false
    }

    func world() async throws -> World {
        var world: World = try store.world()
        world.now = now
        return world
    }

    func health() async throws -> HealthStatus {
        return HealthStatus(ok: true, now: now)
    }

    /// Creates a brand-new creator (Bronze, no history, onboarding at "signed up") and signs in as them. Mock Sign in with Apple.
    func startNewCreator(fullName: String?, email: String?) throws {
        let world: World = try store.world()
        let templateUser: User? = try store.users.find(world.personas.creator.userId)
        let templateCreator: Creator? = try store.creators.find(world.personas.creator.creatorId)
        guard let baseUser = templateUser, let baseCreator = templateCreator else {
            throw FlowdAPIError.notFound("the demo creator")
        }
        let existingIds: [String] = try store.creators.all().map { (c: Creator) -> String in
            return c.id
        }
        // Reuse the fresh creator if one was already started in this session.
        if persona == .newCreator, existingIds.contains(meId), meId != world.personas.creator.creatorId {
            return
        }
        let display: String = (fullName?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { (name: String) -> String? in
            return name.isEmpty ? nil : name
        } ?? "New creator"
        let slug: String = TextTools.slugify(display).replacingOccurrences(of: "-", with: ".")
        var handle: String = (slug.isEmpty ? "new.creator" : slug)
        let takenHandles: Set<String> = Set(try store.creators.all().map { (c: Creator) -> String in
            return c.handle
        })
        var suffix: Int = 2
        let baseHandle: String = handle
        while takenHandles.contains(handle) {
            handle = baseHandle + String(suffix)
            suffix += 1
        }
        let id: String = "cr_" + handle.replacingOccurrences(of: ".", with: "_")
        let userId: String = "usr_" + handle.replacingOccurrences(of: ".", with: "_")
        let initials: String = display.split(separator: " ").prefix(2).compactMap { (part: Substring) -> String? in
            return part.first.map { (c: Character) -> String in return String(c).uppercased() }
        }.joined()

        var user: User = baseUser
        user.id = userId
        user.email = email ?? (handle + "@example.com")
        user.displayName = display
        user.authProviders = [.apple]
        user.ageVerified = false
        user.createdAt = now
        user.lastSeenAt = now
        user.title = nil
        try store.users.append(user)

        var creator: Creator = baseCreator
        creator.id = id
        creator.userId = userId
        creator.handle = handle
        creator.displayName = display
        creator.bio = ""
        creator.niches = []
        creator.languages = ["en"]
        creator.tier = .bronze
        creator.tierBasis = .earned
        creator.tierSince = now
        creator.tierHoldUntil = nil
        creator.tierReview = nil
        creator.lifetimeClearedCents = 0
        creator.approvedCount = 0
        creator.decidedCount = 0
        creator.approvalRate = 0
        creator.reliabilityScore = FlowdConstants.Reliability.Creator.provisionalScore
        creator.postsCount = 0
        creator.livePostsCount = 0
        creator.firstDollarAt = nil
        creator.joinedAt = now
        creator.lastActiveAt = now
        creator.founding = false
        creator.foundingPerksUntil = nil
        creator.badges = []
        creator.verificationStatus = .notStarted
        creator.onboardingStage = .signedUp
        creator.payoutReady = false
        creator.payoutMethod = nil
        creator.stripeAccountId = nil
        creator.referralCode = (initials.isEmpty ? "NEW" : initials) + String(StableHash.bucket(handle, modulus: 90) + 10)
        creator.referredByCreatorId = nil
        creator.streakWeeks = 0
        creator.carryOver = nil
        creator.storefront = Storefront(slug: handle, headline: "", about: nil, featuredPostIds: [], showStats: true, ctaLabel: "Work with me", theme: .aurora)
        creator.portfolio = []
        creator.openToOffers = false
        creator.pausedUntil = nil
        try store.creators.append(creator)

        persona = .newCreator
        meId = id
        meUserId = userId
        idCounters = [:]
    }

    // MARK: Profile

    func me() async throws -> Creator {
        try requireSignedIn()
        try reconcileIfNeeded()
        return try meRow()
    }

    private static func stageRank(_ stage: OnboardingStage) -> Int {
        switch stage {
        case .signedUp, .unknown: return 0
        case .nichesPicked: return 1
        case .accountsLinked: return 2
        case .firstSubmission: return 3
        case .firstApproval: return 4
        case .verified: return 5
        case .firstDollar: return 6
        }
    }

    /// Moves the onboarding stage forward (never back).
    func advanceOnboarding(to stage: OnboardingStage) throws {
        let current: Creator = try meRow()
        if MockFlowdAPI.stageRank(stage) > MockFlowdAPI.stageRank(current.onboardingStage) {
            try store.creators.update(meId) { (c: inout Creator) in
                c.onboardingStage = stage
            }
        }
    }

    func updateProfile(_ update: ProfileUpdate) async throws -> Creator {
        try requireSignedIn()
        let current: Creator = try meRow()
        if let handle = update.handle, handle != current.handle {
            let cleaned: String = handle.lowercased().replacingOccurrences(of: "@", with: "")
            guard Rx.test(#"^[a-z0-9._]{3,24}$"#, in: cleaned) else {
                throw FlowdAPIError.validationFailed("Handles use 3 to 24 letters, numbers, dots and underscores.")
            }
            let taken: Bool = try store.creators.all().contains(where: { (c: Creator) -> Bool in
                return c.handle == cleaned && c.id != meId
            })
            if taken {
                throw FlowdAPIError.validationFailed("That handle is taken. Try another.")
            }
        }
        if let bio = update.bio, bio.count > 160 {
            throw FlowdAPIError.validationFailed("Keep your bio to 160 characters or fewer.")
        }
        if let niches = update.niches, niches.isEmpty || niches.count > 3 {
            throw FlowdAPIError.validationFailed("Pick between one and three niches.")
        }
        if let portfolio = update.portfolio, portfolio.count > 5 {
            throw FlowdAPIError.validationFailed("A portfolio holds up to five videos.")
        }
        let updated: Creator = try store.creators.update(meId) { (c: inout Creator) in
            if let name = update.displayName {
                c.displayName = name
            }
            if let handle = update.handle {
                let cleaned: String = handle.lowercased().replacingOccurrences(of: "@", with: "")
                c.handle = cleaned
                c.storefront.slug = cleaned
            }
            if let bio = update.bio {
                c.bio = bio
            }
            if let niches = update.niches {
                c.niches = niches
            }
            if let country = update.country {
                c.country = country
            }
            if let languages = update.languages {
                c.languages = languages
            }
            if let storefront = update.storefront {
                c.storefront = storefront
            }
            if let portfolio = update.portfolio {
                c.portfolio = portfolio
            }
            if let open = update.openToOffers {
                c.openToOffers = open
            }
        }
        if update.niches != nil {
            try advanceOnboarding(to: .nichesPicked)
        }
        if let stage = update.onboardingStage {
            try advanceOnboarding(to: stage)
        }
        if let name = update.displayName {
            try store.users.update(meUserId) { (u: inout User) in
                u.displayName = name
            }
        }
        _ = updated
        return try meRow()
    }

    func confirmAge() async throws -> User {
        try requireSignedIn()
        let user: User = try store.users.update(meUserId) { (u: inout User) in
            u.ageVerified = true
        }
        return user
    }

    func acceptCreatorAgreement(version: String) async throws {
        try requireSignedIn()
        acceptedAgreement = version
    }

    func creatorProfile(handleOrId: String) async throws -> CreatorProfile {
        let key: String = handleOrId.lowercased().replacingOccurrences(of: "@", with: "")
        let creators: [Creator] = try store.creators.all()
        guard let creator = creators.first(where: { (c: Creator) -> Bool in
            return c.id == handleOrId || c.handle == key
        }) else {
            throw FlowdAPIError.notFound("that creator")
        }
        let accounts: [SocialAccount] = try store.socialAccounts.all().filter { (a: SocialAccount) -> Bool in
            return a.creatorId == creator.id && a.status == .connected
        }
        let featuredIds: Set<String> = Set(creator.storefront.featuredPostIds)
        let featured: [Post] = try store.posts.all().filter { (p: Post) -> Bool in
            return featuredIds.contains(p.id)
        }
        let cards: [RateCard] = try store.rateCards.all()
        let card: RateCard? = cards.first(where: { (r: RateCard) -> Bool in
            return r.creatorId == creator.id && r.status != .paused
        })
        return CreatorProfile(
            creator: creator,
            accounts: accounts,
            featuredPosts: featured,
            rateCard: creator.tier.atLeast(.silver) ? card : nil,
            shareURL: "https://joinflowd.io/c/" + creator.handle,
            typicalMedianCents: try? typicalBand().medianCents
        )
    }

    // MARK: Linked accounts (mock OAuth, read-only)

    func socialAccounts() async throws -> [SocialAccount] {
        try requireSignedIn()
        return try myAccounts()
    }

    /// Mock OAuth: links a TikTok, Instagram or YouTube account with plausible, deterministic stats. flowd reads views and never posts for you.
    func linkSocialAccount(_ request: LinkAccountRequest) async throws -> SocialAccount {
        try requireSignedIn()
        let cleaned: String = request.handle.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "@", with: "")
        guard Rx.test(#"^[A-Za-z0-9._]{2,30}$"#, in: cleaned) else {
            throw FlowdAPIError.validationFailed("That doesn't look like a " + request.platform.label + " handle.")
        }
        let existing: [SocialAccount] = try myAccounts()
        if let same = existing.first(where: { (a: SocialAccount) -> Bool in
            return a.platform == request.platform
        }) {
            return try store.socialAccounts.update(same.id) { (a: inout SocialAccount) in
                a.handle = cleaned
                a.status = .connected
                a.lastSyncedAt = self.now
            }
        }
        let creator: Creator = try meRow()
        let seed: String = cleaned + request.platform.rawValue
        let followers: Int = 900 + StableHash.bucket(seed, modulus: 28_000)
        let account: SocialAccount = SocialAccount(
            id: "sa_" + creator.handle.replacingOccurrences(of: ".", with: "_") + "_" + request.platform.rawValue,
            creatorId: meId,
            platform: request.platform,
            handle: cleaned,
            followers: followers,
            avgViews28d: Int(Double(followers) * 0.26),
            medianViews28d: Int(Double(followers) * 0.18),
            engagementRate: 0.045,
            usAudienceRatio: 0.62,
            status: .connected,
            verifiedByPlatform: false,
            primary: existing.isEmpty,
            accountCreatedAt: FlowdCalendar.addDays(now, -420),
            connectedAt: now,
            lastSyncedAt: now,
            health: AccountHealth(score: 92, status: .good, strikes: 0, unoriginalFlags: 0, notes: [])
        )
        try store.socialAccounts.append(account)
        try advanceOnboarding(to: .accountsLinked)
        return account
    }

    func reconnectSocialAccount(id: String) async throws -> SocialAccount {
        try requireSignedIn()
        guard let account = try store.socialAccounts.find(id), account.creatorId == meId else {
            throw FlowdAPIError.notFound("that account")
        }
        return try store.socialAccounts.update(id) { (a: inout SocialAccount) in
            a.status = .connected
            a.lastSyncedAt = self.now
        }
    }

    func disconnectSocialAccount(id: String) async throws {
        try requireSignedIn()
        guard let account = try store.socialAccounts.find(id), account.creatorId == meId else {
            throw FlowdAPIError.notFound("that account")
        }
        try store.socialAccounts.remove(id)
        if account.primary {
            let remaining: [SocialAccount] = try myAccounts()
            if let next = remaining.first {
                try store.socialAccounts.update(next.id) { (a: inout SocialAccount) in
                    a.primary = true
                }
            }
        }
    }

    // MARK: Reputation and tier

    func reputation() async throws -> CreatorReputation {
        try requireSignedIn()
        try reconcileIfNeeded()
        let rows: [CreatorReputation] = try store.reputations.all()
        if let row = rows.first(where: { (r: CreatorReputation) -> Bool in
            return r.creatorId == meId
        }) {
            return row
        }
        let creator: Creator = try meRow()
        let result: CreatorReliabilityResult = ReputationEngine.creatorReliability(
            decisions: [],
            now: now,
            onTimeOk: 0,
            onTimeTotal: 0,
            postThroughPosted: 0,
            postThroughApproved: 0,
            compliancePassed: 0,
            complianceTotal: 0,
            fraudConfirmed90d: 0,
            clawbacks90d: 0,
            disputesLost90d: 0,
            academyLessons: 0
        )
        return CreatorReputation(
            id: "rep_" + meId,
            creatorId: meId,
            asOf: now,
            provisional: true,
            reliabilityScore: result.score,
            approvalRateFinished: 0,
            approvalRateRaw: 0,
            onTimeRatio: 1,
            postThroughRatio: 1,
            complianceRatio: 1,
            cleanRecordRatio: 1,
            finishedN: 0,
            fraudFlags90d: 0,
            clawbacks90d: 0,
            disputesLost90d: 0,
            academyBonusPoints: 0,
            components: result.components,
            reasons: ["Building history: your first five finished videos set your reliability. Until then it reads 70."],
            tierProgress: TierEngine.progress(TierStats(creator: creator), current: creator.tier)
        )
    }

    func tierStatus() async throws -> TierStatus {
        try requireSignedIn()
        try reconcileIfNeeded()
        let creator: Creator = try meRow()
        let stats: TierStats = TierStats(creator: creator)
        let progress: TierProgress = TierEngine.progress(stats, current: creator.tier)
        let history: [TierEvent] = try store.tierHistory.all().filter { (e: TierEvent) -> Bool in
            return e.creatorId == meId
        }.sorted { (a: TierEvent, b: TierEvent) -> Bool in
            return a.at > b.at
        }
        let ladder: [TierLadderRow] = FlowdConstants.tierOrder.map { (tier: Tier) -> TierLadderRow in
            return TierLadderRow(
                tier: tier,
                thresholds: FlowdConstants.tierThresholds(tier),
                perks: FlowdConstants.tierPerks(tier),
                perkLines: TierEngine.perkLines(tier),
                isCurrent: tier == creator.tier,
                isReached: tier.rank <= creator.tier.rank
            )
        }
        var graceDays: Int? = nil
        if creator.tierBasis == .graceHold, let until = creator.tierHoldUntil {
            graceDays = TierEngine.graceDaysLeft(holdUntil: until, now: now)
        }
        return TierStatus(
            current: creator.tier,
            basis: creator.tierBasis,
            since: creator.tierSince,
            holdUntil: creator.tierHoldUntil,
            graceDaysLeft: graceDays,
            progress: progress,
            remaining: TierEngine.remainingToNext(stats, current: creator.tier),
            perks: FlowdConstants.tierPerks(creator.tier),
            perkLines: TierEngine.perkLines(creator.tier),
            unlocksNext: TierEngine.whatUnlocksNext(creator.tier),
            ladder: ladder,
            history: history,
            stats: TierStatsSnapshot(
                lifetimeClearedCents: creator.lifetimeClearedCents,
                approvedCount: creator.approvedCount,
                approvalRate: creator.approvalRate,
                reliabilityScore: creator.reliabilityScore
            ),
            graceNote: "No tier drop for " + String(FlowdConstants.Tiers.demotionGraceDays) + " days after a dip. Pausing keeps your tier and streak."
        )
    }

    // MARK: Verification (mock provider)

    func verifications() async throws -> [Verification] {
        try requireSignedIn()
        try reconcileIfNeeded()
        return try store.verifications.all().filter { (v: Verification) -> Bool in
            return v.creatorId == meId
        }.sorted { (a: Verification, b: Verification) -> Bool in
            return a.submittedAt > b.submittedAt
        }
    }

    func startVerification(kind: VerificationKind) async throws -> Verification {
        try requireSignedIn()
        let existing: [Verification] = try store.verifications.all()
        if let open = existing.first(where: { (v: Verification) -> Bool in
            return v.creatorId == meId && v.kind == kind && (v.status == .pending || v.status == .verified)
        }) {
            return open
        }
        // A creator whose identity is already verified is never asked twice: the check is recorded as done.
        let current: Creator = try meRow()
        let alreadyVerified: Bool = kind == .identity && current.verificationStatus == .verified
        let row: Verification = Verification(
            id: nextId("ver", width: 3, existing: existing.map { (v: Verification) -> String in return v.id }),
            subjectKind: .creator,
            creatorId: meId,
            brandId: nil,
            kind: kind,
            status: alreadyVerified ? .verified : .pending,
            provider: "Verification partner (demo)",
            documents: [],
            submittedAt: now,
            slaDueAt: FlowdCalendar.addHours(now, 24),
            decidedAt: alreadyVerified ? now : nil,
            decidedByUserId: nil,
            reason: nil,
            note: nil,
            blocksPayout: !alreadyVerified && (kind == .identity || kind == .tax || kind == .payoutMethod)
        )
        try store.verifications.append(row)
        if kind == .age {
            _ = try await confirmAge()
        }
        if kind == .identity {
            try store.creators.update(meId) { (c: inout Creator) in
                if c.verificationStatus != .verified {
                    c.verificationStatus = .pending
                }
            }
        }
        return row
    }

    // MARK: Preferences

    func wellbeingRow() throws -> WellbeingSettings {
        let rows: [WellbeingSettings] = try store.wellbeing.all()
        if let row = rows.first(where: { (w: WellbeingSettings) -> Bool in
            return w.creatorId == meId
        }) {
            return row
        }
        let user: User = try meUser()
        let row: WellbeingSettings = WellbeingSettings(
            id: "wb_" + meId.replacingOccurrences(of: "cr_", with: ""),
            creatorId: meId,
            enabled: false,
            quietHours: QuietHours(enabled: true, start: FlowdConstants.Wellbeing.quietHoursStart, end: FlowdConstants.Wellbeing.quietHoursEnd, timezone: user.timezone),
            numbersOff: NumbersOff(enabled: false, from: nil, to: nil),
            paceGoal: PaceGoal(enabled: false, postsPerWeek: nil),
            pausedUntil: nil,
            restWeeks: [],
            leaderboardOptOut: false,
            slackMode: false,
            updatedAt: now
        )
        try store.wellbeing.append(row)
        return row
    }

    func wellbeing() async throws -> WellbeingSettings {
        try requireSignedIn()
        return try wellbeingRow()
    }

    func updateWellbeing(_ settings: WellbeingSettings) async throws -> WellbeingSettings {
        try requireSignedIn()
        let current: WellbeingSettings = try wellbeingRow()
        if let until = settings.pausedUntil {
            let limit: Date = FlowdCalendar.addDays(now, Double(FlowdConstants.Wellbeing.pauseMaxDays))
            if until > limit {
                throw FlowdAPIError.validationFailed("A pause can last up to " + String(FlowdConstants.Wellbeing.pauseMaxDays) + " days.")
            }
        }
        let saved: WellbeingSettings = try store.wellbeing.update(current.id) { (w: inout WellbeingSettings) in
            w.enabled = settings.enabled
            w.quietHours = settings.quietHours
            w.numbersOff = settings.numbersOff
            w.paceGoal = settings.paceGoal
            w.pausedUntil = settings.pausedUntil
            w.restWeeks = settings.restWeeks
            w.leaderboardOptOut = settings.leaderboardOptOut
            w.slackMode = settings.slackMode
            w.updatedAt = self.now
        }
        // Pausing keeps tier and streak: mirror the pause on the creator row.
        try store.creators.update(meId) { (c: inout Creator) in
            c.pausedUntil = saved.pausedUntil
        }
        return saved
    }

    func notificationPrefs() async throws -> NotificationPrefs {
        try requireSignedIn()
        return try notificationPrefsRow()
    }

    func notificationPrefsRow() throws -> NotificationPrefs {
        let rows: [NotificationPrefs] = try store.notificationPrefs.all()
        if let row = rows.first(where: { (p: NotificationPrefs) -> Bool in
            return p.userId == meUserId
        }) {
            return row
        }
        let user: User = try meUser()
        var categories: [String: Bool] = [:]
        for category in NotificationCategory.allCases {
            categories[category.rawValue] = category != .tips
        }
        let row: NotificationPrefs = NotificationPrefs(
            id: "npref_" + meUserId.replacingOccurrences(of: "usr_", with: ""),
            userId: meUserId,
            push: true,
            emailDigest: false,
            categories: categories,
            quietHours: QuietHours(enabled: true, start: FlowdConstants.Wellbeing.quietHoursStart, end: FlowdConstants.Wellbeing.quietHoursEnd, timezone: user.timezone),
            batchNonCash: true,
            dropReminder: true,
            updatedAt: now
        )
        try store.notificationPrefs.append(row)
        return row
    }

    func updateNotificationPrefs(_ prefs: NotificationPrefs) async throws -> NotificationPrefs {
        try requireSignedIn()
        let current: NotificationPrefs = try notificationPrefsRow()
        return try store.notificationPrefs.update(current.id) { (p: inout NotificationPrefs) in
            p.push = prefs.push
            p.emailDigest = prefs.emailDigest
            p.categories = prefs.categories
            p.quietHours = prefs.quietHours
            p.batchNonCash = prefs.batchNonCash
            p.dropReminder = prefs.dropReminder
            p.updatedAt = self.now
        }
    }

    func requestDataExport() async throws {
        try requireSignedIn()
        dataExportRequested = true
    }

    func deleteAccount() async throws {
        try requireSignedIn()
        accountDeleted = true
        signedIn = false
    }

    // MARK: Onboarding read-models

    func earningsPreview(niche: Niche) async throws -> EarningsPreview {
        let typical: TypicalBand = try typicalBand()
        let starters: [Bounty] = try store.bounties.all().filter { (b: Bounty) -> Bool in
            return b.isStarter && b.status == .live && b.funded
        }
        var sample: FeedItem? = nil
        if let starter = starters.first {
            sample = try feedItem(starter, match: nil, saves: [], submissions: [])
        }
        let footnote: String = EarningsEngine.typicalVsTop(typicalCents: typical.medianCents, topCents: typical.p90Cents) + " " + niche.label + " creators land near the typical."
        return EarningsPreview(niche: niche, typical: typical, topExampleCents: typical.p90Cents, sample: sample, footnote: footnote)
    }

    func firstDollarPath() async throws -> FirstDollarPath {
        try requireSignedIn()
        try reconcileIfNeeded()
        let creator: Creator = try meRow()
        let subs: [Submission] = try mySubmissions()
        let hasSubmission: Bool = !subs.isEmpty
        let approved: Submission? = subs.first(where: { (s: Submission) -> Bool in
            return s.approvedAt != nil
        })
        let inReview: Submission? = subs.first(where: { (s: Submission) -> Bool in
            return s.isWaitingOnBrand
        })
        let cleared: Bool = creator.firstDollarAt != nil
        let decideBy: Date? = inReview?.slaDueAt
        var clearedBy: Date? = nil
        if cleared {
            clearedBy = creator.firstDollarAt
        } else if let when = approved?.approvedAt {
            clearedBy = MoneyClockEngine.firstRunAtOrAfter(FlowdCalendar.addHours(when, 48))
        } else if let due = decideBy {
            clearedBy = MoneyClockEngine.firstRunAtOrAfter(FlowdCalendar.addHours(due, 48))
        }
        let steps: [FirstDollarStep] = [
            FirstDollarStep(kind: .scoredTake, title: "Score a take", detail: "Film one take and check its Hook Score. It's a checklist score: it gets smarter as bounties settle.", done: hasSubmission, etaAt: nil),
            FirstDollarStep(kind: .submitted, title: "Submit it", detail: "A Reserved Slot is taken from the pool, so approved work is paid.", done: hasSubmission, etaAt: nil),
            FirstDollarStep(kind: .approved, title: "Get a decision", detail: "The brand decides within 72 hours, with a reason either way.", done: approved != nil, etaAt: decideBy),
            FirstDollarStep(kind: .cleared, title: "Money clears", detail: "Earnings clear at the next 14:00 UTC run after the 72-hour view window.", done: cleared, etaAt: clearedBy)
        ]
        let starters: [Bounty] = try store.bounties.all().filter { (b: Bounty) -> Bool in
            return b.isStarter && b.status == .live && b.funded
        }
        var starterItem: FeedItem? = nil
        if let starter = starters.first {
            starterItem = try feedItem(starter, match: nil, saves: try mySaves(), submissions: subs)
        }
        return FirstDollarPath(
            steps: steps,
            starter: starterItem,
            clearedByEstimate: clearedBy,
            retired: cleared,
            note: "Approval isn't guaranteed: your video has to meet the brief. No bank, tax or ID is needed until your first approval."
        )
    }
}
