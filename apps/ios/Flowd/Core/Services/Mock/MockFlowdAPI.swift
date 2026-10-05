import Foundation

/// The offline `FlowdAPI`: the whole creator app runs against the bundled demo world (`Resources/Fixtures`) with in-memory mutations, so every flow
/// works in the simulator, in previews and in tests without a network. Semantics follow the contract (docs: DOMAIN.md sections 8 to 11): Reserved
/// Slots, the 72-hour view window, the 14:00 UTC clearing run, Friday 18:00 UTC payouts, 72-hour review SLAs, one appeal per rejection, tier gates.
///
/// - The demo creator is Maya (`cr_maya`, @maya.makes, Silver). `signIn(.apple(...))` starts a brand-new creator at the First-Dollar Path instead.
/// - Time comes from a `FlowdClock` (the demo world's "now", 2026-10-03T14:00:00Z, ticking). `advanceDemoClock(hours:)` moves it and runs the due
///   jobs: window close, fraud check, clearing, the Friday payout, offer expiry, brand decisions on submitted videos.
/// - It is an `actor`: every call is serialised, so a mutation never interleaves with another. Reads decode fixtures lazily, off the main actor.
/// - Third-party integrations (TikTok, Instagram, Stripe, ID, tax) are realistic mocks, marked in code.
actor MockFlowdAPI: FlowdAPI {
    /// Who the mock signs in as.
    enum Persona: Sendable {
        /// The seeded demo creator.
        case maya
        /// A fresh creator with no history (the start of the First-Dollar Path).
        case newCreator
    }

    // MARK: State

    let clock: FlowdClock
    let store: MockStore
    let ai: any AIProvider
    /// When true, a submitted video gets the brand's decision once the brand's median decision time has passed on the demo clock.
    var autoBrandDecisions: Bool
    var signedIn: Bool
    var persona: Persona
    var meId: String
    var meUserId: String
    var idCounters: [String: Int] = [:]
    var idempotencyIndex: [String: String] = [:]
    /// Submissions created by this API since the last reset: the brand decides on them as the demo clock passes their decision time.
    var simulatedSubmissionIds: Set<String> = []
    /// Posts created by this API since the last reset (their views grow with the demo clock; fixture posts grow from where they are).
    var simulatedPostIds: Set<String> = []
    /// Where each live post's views are heading over its 72-hour window (decided once per post, so growth is smooth and repeatable).
    var postFinalViews: [String: Int] = [:]
    /// The last instant the scheduled jobs have run to.
    var lastReconcile: Date? = nil
    var lastPayoutRun: Date? = nil
    var acceptedAgreement: String? = nil
    var dataExportRequested: Bool = false
    var accountDeleted: Bool = false

    nonisolated var isDemo: Bool {
        return true
    }

    init(
        clock: FlowdClock = FlowdClock.shared,
        loader: FixtureLoader = FixtureLoader(),
        persona: Persona = .maya,
        signedIn: Bool = true,
        autoBrandDecisions: Bool = true,
        ai: any AIProvider = MockAIProvider()
    ) {
        self.clock = clock
        self.store = MockStore(loader: loader)
        self.ai = ai
        self.persona = persona
        self.signedIn = signedIn
        self.autoBrandDecisions = autoBrandDecisions
        self.meId = "cr_maya"
        self.meUserId = "usr_maya"
    }

    // MARK: Small helpers shared by every extension

    var now: Date {
        return clock.now
    }

    /// The signed-in creator's row.
    func meRow() throws -> Creator {
        guard let creator = try store.creators.find(meId) else {
            throw FlowdAPIError.notFound("your profile")
        }
        return creator
    }

    func meUser() throws -> User {
        guard let user = try store.users.find(meUserId) else {
            throw FlowdAPIError.notFound("your account")
        }
        return user
    }

    func requireSignedIn() throws {
        if !signedIn || accountDeleted {
            throw FlowdAPIError.unauthorized
        }
    }

    /// The next id for a prefix: one past the highest numeric suffix among `existing` (zero padded to `width`).
    func nextId(_ prefix: String, width: Int, existing: [String]) -> String {
        let number: Int
        if let current = idCounters[prefix] {
            number = current + 1
        } else {
            var highest: Int = 0
            let lead: String = prefix + "_"
            for id in existing where id.hasPrefix(lead) {
                if let value = Int(id.dropFirst(lead.count)) {
                    highest = Swift.max(highest, value)
                }
            }
            number = highest + 1
        }
        idCounters[prefix] = number
        return prefix + "_" + FlowdCalendar.pad(number, width)
    }

    /// Looks up the result of an earlier call with the same idempotency key: a repeated key returns the original resource.
    func remembered(_ key: String, operation: String) -> String? {
        return idempotencyIndex[operation + ":" + key]
    }

    func remember(_ key: String, operation: String, resourceId: String) {
        idempotencyIndex[operation + ":" + key] = resourceId
    }

    // MARK: Row lookups

    func brandRow(_ id: String) throws -> Brand {
        guard let brand = try store.brands.find(id) else {
            throw FlowdAPIError.notFound("that brand")
        }
        return brand
    }

    func appRow(_ id: String) throws -> BrandApp {
        guard let app = try store.apps.find(id) else {
            throw FlowdAPIError.notFound("that app")
        }
        return app
    }

    func bountyRow(_ id: String) throws -> Bounty {
        guard let bounty = try store.bounties.find(id) else {
            throw FlowdAPIError.notFound("that bounty")
        }
        return bounty
    }

    func submissionRow(_ id: String) throws -> Submission {
        guard let submission = try store.submissions.find(id), submission.creatorId == meId else {
            throw FlowdAPIError.notFound("that submission")
        }
        return submission
    }

    func postRow(_ id: String) throws -> Post {
        guard let post = try store.posts.find(id), post.creatorId == meId else {
            throw FlowdAPIError.notFound("that post")
        }
        return post
    }

    func scorecard(for brandId: String) throws -> BrandScorecard? {
        let all: [BrandScorecard] = try store.scorecards.all()
        return all.first(where: { (s: BrandScorecard) -> Bool in
            return s.brandId == brandId
        })
    }

    /// The signed-in creator's linked accounts.
    func myAccounts() throws -> [SocialAccount] {
        let all: [SocialAccount] = try store.socialAccounts.all()
        return all.filter { (a: SocialAccount) -> Bool in
            return a.creatorId == meId
        }
    }

    /// The account new posts default to (primary, connected), else any connected one.
    func primaryAccount(for platform: Platform? = nil) throws -> SocialAccount? {
        let accounts: [SocialAccount] = try myAccounts().filter { (a: SocialAccount) -> Bool in
            return a.status == .connected && (platform == nil || a.platform == platform)
        }
        return accounts.first(where: { (a: SocialAccount) -> Bool in
            return a.primary
        }) ?? accounts.first
    }

    /// The creator's 28-day median views: the best connected account, or a category-like default for a creator with no linked account yet.
    func medianViews() throws -> Int {
        let connected: [SocialAccount] = try myAccounts().filter { (a: SocialAccount) -> Bool in
            return a.status == .connected
        }
        return connected.map { (a: SocialAccount) -> Int in
            return a.medianViews28d
        }.max() ?? 0
    }

    func myPosts() throws -> [Post] {
        let all: [Post] = try store.posts.all()
        return all.filter { (p: Post) -> Bool in
            return p.creatorId == meId
        }
    }

    func mySubmissions() throws -> [Submission] {
        let all: [Submission] = try store.submissions.all()
        return all.filter { (s: Submission) -> Bool in
            return s.creatorId == meId
        }
    }

    func myMoneyRows() throws -> [MoneyClockRow] {
        let all: [MoneyClockRow] = try store.moneyClock.all()
        return all.filter { (r: MoneyClockRow) -> Bool in
            return r.creatorId == meId
        }
    }

    func myPayouts() throws -> [Payout] {
        let all: [Payout] = try store.payouts.all()
        return all.filter { (p: Payout) -> Bool in
            return p.creatorId == meId
        }
    }

    func mySaves() throws -> [BountySave] {
        let all: [BountySave] = try store.saves.all()
        return all.filter { (s: BountySave) -> Bool in
            return s.creatorId == meId
        }
    }

    func myOffers() throws -> [Offer] {
        let all: [Offer] = try store.offers.all()
        return all.filter { (o: Offer) -> Bool in
            return o.creatorId == meId
        }
    }

    func myGrants() throws -> [RightsGrant] {
        let all: [RightsGrant] = try store.rightsGrants.all()
        return all.filter { (g: RightsGrant) -> Bool in
            return g.creatorId == meId
        }
    }

    func myDisputes() throws -> [Dispute] {
        let all: [Dispute] = try store.disputes.all()
        return all.filter { (d: Dispute) -> Bool in
            return d.creatorId == meId
        }
    }

    func myNotifications() throws -> [AppNotification] {
        let all: [AppNotification] = try store.notifications.all()
        return all.filter { (n: AppNotification) -> Bool in
            return n.recipientUserId == meUserId
        }
    }

    // MARK: Notifications

    /// True while the creator's quiet hours are on (22:00 to 08:00 in their time zone by default).
    func inQuietHours(_ date: Date) -> Bool {
        let settings: WellbeingSettings? = try? wellbeingRow()
        guard let quiet = settings?.quietHours, quiet.enabled else {
            return false
        }
        return WellbeingClock.isWithin(start: quiet.start, end: quiet.end, timeZoneIdentifier: quiet.timezone, at: date)
    }

    /// Adds a notification for the signed-in creator. Non-cash notifications raised during quiet hours are batched (delivered later) and marked so.
    func notify(
        _ kind: NotificationKind,
        title: String,
        body: String,
        amountCents: Int? = nil,
        deepLink: String,
        refKind: String? = nil,
        refId: String? = nil,
        at date: Date? = nil
    ) throws {
        let moment: Date = date ?? now
        let existing: [String] = try store.notifications.all().map { (n: AppNotification) -> String in
            return n.id
        }
        let isCash: Bool = kind.category.isCash
        let batched: Bool = !isCash && inQuietHours(moment)
        let priority: NotificationPriority = isCash ? .cash : (batched ? .digest : .normal)
        let row: AppNotification = AppNotification(
            id: nextId("ntf", width: 4, existing: existing),
            recipientUserId: meUserId,
            audience: .creator,
            kind: kind,
            priority: priority,
            title: title,
            body: body,
            amountCents: amountCents,
            deepLink: deepLink,
            refKind: refKind,
            refId: refId,
            batched: batched,
            createdAt: moment,
            deliveredAt: batched ? nil : moment,
            readAt: nil
        )
        try store.notifications.append(row)
    }
}
