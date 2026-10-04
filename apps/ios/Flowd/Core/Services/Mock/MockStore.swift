import Foundation

/// One fixture table, loaded on first use and then held in memory. Mutations replace the cached rows, so every screen sees the same world until
/// `reset()` drops the cache and the next read decodes the bundled JSON again. Only `MockFlowdAPI` touches tables, and always from inside its actor.
final class MockTable<Row: Decodable> {
    let name: String
    private let loader: FixtureLoader
    private var storage: [Row]?

    init(_ name: String, loader: FixtureLoader) {
        self.name = name
        self.loader = loader
        self.storage = nil
    }

    /// Every row (decoded from the bundled fixture on the first call).
    func all() throws -> [Row] {
        if let cached = storage {
            return cached
        }
        let rows: [Row] = try loader.load([Row].self, named: name)
        storage = rows
        return rows
    }

    /// Replaces the table's rows.
    func set(_ rows: [Row]) {
        storage = rows
    }

    /// Appends one row.
    func append(_ row: Row) throws {
        var rows: [Row] = try all()
        rows.append(row)
        storage = rows
    }

    /// Drops the cache: the next read decodes the fixture again.
    func reset() {
        storage = nil
    }

    var isLoaded: Bool {
        return storage != nil
    }
}

extension MockTable where Row: Identifiable, Row.ID == String {
    /// The row with this id, or nil.
    func find(_ id: String) throws -> Row? {
        let rows: [Row] = try all()
        return rows.first(where: { (row: Row) -> Bool in
            return row.id == id
        })
    }

    /// Changes one row in place and returns the changed copy. Throws `notFound` when the id is unknown.
    @discardableResult
    func update(_ id: String, what: String = "that item", _ change: (inout Row) throws -> Void) throws -> Row {
        var rows: [Row] = try all()
        guard let index = rows.firstIndex(where: { (row: Row) -> Bool in
            return row.id == id
        }) else {
            throw FlowdAPIError.notFound(what)
        }
        var copy: Row = rows[index]
        try change(&copy)
        rows[index] = copy
        storage = rows
        return copy
    }

    /// Removes the row with this id.
    func remove(_ id: String) throws {
        let rows: [Row] = try all()
        storage = rows.filter { (row: Row) -> Bool in
            return row.id != id
        }
    }
}

/// Every table the mock API reads or writes, keyed by the fixture file it comes from.
final class MockStore {
    let loader: FixtureLoader

    // Identity
    let users: MockTable<User>
    let creators: MockTable<Creator>
    let socialAccounts: MockTable<SocialAccount>
    let rateCards: MockTable<RateCard>
    let brands: MockTable<Brand>
    let apps: MockTable<BrandApp>
    let tierHistory: MockTable<TierEvent>
    let wellbeing: MockTable<WellbeingSettings>
    let notificationPrefs: MockTable<NotificationPrefs>
    // Trust
    let scorecards: MockTable<BrandScorecard>
    let reputations: MockTable<CreatorReputation>
    let disputes: MockTable<Dispute>
    let scamReports: MockTable<ScamReport>
    let verifications: MockTable<Verification>
    let taxProfiles: MockTable<TaxProfile>
    let taxDocs: MockTable<TaxDoc>
    // Work
    let bounties: MockTable<Bounty>
    let submissions: MockTable<Submission>
    let feedbackNotes: MockTable<FeedbackNote>
    let videoAnalyses: MockTable<VideoAnalysis>
    let posts: MockTable<Post>
    let viewSnapshots: MockTable<ViewSnapshot>
    let conversions: MockTable<Conversion>
    let links: MockTable<AttributionLink>
    let offerCodes: MockTable<OfferCode>
    let ads: MockTable<Ad>
    let saves: MockTable<BountySave>
    // Money
    let moneyClock: MockTable<MoneyClockRow>
    let ledger: MockTable<LedgerEntry>
    let payouts: MockTable<Payout>
    let proofs: MockTable<Proof>
    // Market
    let offers: MockTable<Offer>
    let rightsGrants: MockTable<RightsGrant>
    let specs: MockTable<Spec>
    let auctions: MockTable<Auction>
    // Growth
    let drops: MockTable<DailyDrop>
    let tournaments: MockTable<Tournament>
    let tournamentEntries: MockTable<TournamentEntry>
    let crews: MockTable<Crew>
    let crewMembers: MockTable<CrewMember>
    let streaks: MockTable<Streak>
    let leaderboards: MockTable<Leaderboard>
    let referrals: MockTable<Referral>
    let lessons: MockTable<Lesson>
    let lessonProgress: MockTable<LessonProgress>
    let trends: MockTable<Trend>
    let formats: MockTable<Format>
    let hooks: MockTable<Hook>
    let wrapped: MockTable<Wrapped>
    // Platform
    let notifications: MockTable<AppNotification>
    let threads: MockTable<ChatThread>
    let floSuggestions: MockTable<FloSuggestion>

    // Object-shaped fixtures
    private var worldRow: World?
    private var tickerRow: Ticker?

    init(loader: FixtureLoader) {
        self.loader = loader
        users = MockTable<User>("users", loader: loader)
        creators = MockTable<Creator>("creators", loader: loader)
        socialAccounts = MockTable<SocialAccount>("social_accounts", loader: loader)
        rateCards = MockTable<RateCard>("rate_cards", loader: loader)
        brands = MockTable<Brand>("brands", loader: loader)
        apps = MockTable<BrandApp>("apps", loader: loader)
        tierHistory = MockTable<TierEvent>("tier_history", loader: loader)
        wellbeing = MockTable<WellbeingSettings>("wellbeing_settings", loader: loader)
        notificationPrefs = MockTable<NotificationPrefs>("notification_prefs", loader: loader)
        scorecards = MockTable<BrandScorecard>("brand_scorecards", loader: loader)
        reputations = MockTable<CreatorReputation>("creator_reputation", loader: loader)
        disputes = MockTable<Dispute>("disputes", loader: loader)
        scamReports = MockTable<ScamReport>("scam_reports", loader: loader)
        verifications = MockTable<Verification>("verifications", loader: loader)
        taxProfiles = MockTable<TaxProfile>("tax_profiles", loader: loader)
        taxDocs = MockTable<TaxDoc>("tax_docs", loader: loader)
        bounties = MockTable<Bounty>("bounties", loader: loader)
        submissions = MockTable<Submission>("submissions", loader: loader)
        feedbackNotes = MockTable<FeedbackNote>("feedback_notes", loader: loader)
        videoAnalyses = MockTable<VideoAnalysis>("video_analyses", loader: loader)
        posts = MockTable<Post>("posts", loader: loader)
        viewSnapshots = MockTable<ViewSnapshot>("view_snapshots", loader: loader)
        conversions = MockTable<Conversion>("conversions", loader: loader)
        links = MockTable<AttributionLink>("attribution_links", loader: loader)
        offerCodes = MockTable<OfferCode>("offer_code_pool", loader: loader)
        ads = MockTable<Ad>("ads", loader: loader)
        saves = MockTable<BountySave>("bounty_saves", loader: loader)
        moneyClock = MockTable<MoneyClockRow>("money_clock", loader: loader)
        ledger = MockTable<LedgerEntry>("ledger", loader: loader)
        payouts = MockTable<Payout>("payouts", loader: loader)
        proofs = MockTable<Proof>("proofs", loader: loader)
        offers = MockTable<Offer>("offers", loader: loader)
        rightsGrants = MockTable<RightsGrant>("rights_grants", loader: loader)
        specs = MockTable<Spec>("specs", loader: loader)
        auctions = MockTable<Auction>("auctions", loader: loader)
        drops = MockTable<DailyDrop>("daily_drops", loader: loader)
        tournaments = MockTable<Tournament>("tournaments", loader: loader)
        tournamentEntries = MockTable<TournamentEntry>("tournament_entries", loader: loader)
        crews = MockTable<Crew>("crews", loader: loader)
        crewMembers = MockTable<CrewMember>("crew_members", loader: loader)
        streaks = MockTable<Streak>("streaks", loader: loader)
        leaderboards = MockTable<Leaderboard>("leaderboards", loader: loader)
        referrals = MockTable<Referral>("referrals", loader: loader)
        lessons = MockTable<Lesson>("lessons", loader: loader)
        lessonProgress = MockTable<LessonProgress>("lesson_progress", loader: loader)
        trends = MockTable<Trend>("trends", loader: loader)
        formats = MockTable<Format>("formats", loader: loader)
        hooks = MockTable<Hook>("hooks", loader: loader)
        wrapped = MockTable<Wrapped>("wrapped", loader: loader)
        notifications = MockTable<AppNotification>("notifications", loader: loader)
        threads = MockTable<ChatThread>("threads", loader: loader)
        floSuggestions = MockTable<FloSuggestion>("flo_suggestions", loader: loader)
        worldRow = nil
        tickerRow = nil
    }

    /// The world manifest (persona ids, "now").
    func world() throws -> World {
        if let cached = worldRow {
            return cached
        }
        let row: World = try loader.load(World.self, named: "world")
        worldRow = row
        return row
    }

    func setWorld(_ world: World) {
        worldRow = world
    }

    /// The public payout ticker (typical earnings totals).
    func ticker() throws -> Ticker {
        if let cached = tickerRow {
            return cached
        }
        let row: Ticker = try loader.load(Ticker.self, named: "ticker")
        tickerRow = row
        return row
    }

    /// Forgets every cached and mutated row: the next read decodes the bundled fixtures again.
    func reset() {
        users.reset()
        creators.reset()
        socialAccounts.reset()
        rateCards.reset()
        brands.reset()
        apps.reset()
        tierHistory.reset()
        wellbeing.reset()
        notificationPrefs.reset()
        scorecards.reset()
        reputations.reset()
        disputes.reset()
        scamReports.reset()
        verifications.reset()
        taxProfiles.reset()
        taxDocs.reset()
        bounties.reset()
        submissions.reset()
        feedbackNotes.reset()
        videoAnalyses.reset()
        posts.reset()
        viewSnapshots.reset()
        conversions.reset()
        links.reset()
        offerCodes.reset()
        ads.reset()
        saves.reset()
        moneyClock.reset()
        ledger.reset()
        payouts.reset()
        proofs.reset()
        offers.reset()
        rightsGrants.reset()
        specs.reset()
        auctions.reset()
        drops.reset()
        tournaments.reset()
        tournamentEntries.reset()
        crews.reset()
        crewMembers.reset()
        streaks.reset()
        leaderboards.reset()
        referrals.reset()
        lessons.reset()
        lessonProgress.reset()
        trends.reset()
        formats.reset()
        hooks.reset()
        wrapped.reset()
        notifications.reset()
        threads.reset()
        floSuggestions.reset()
        worldRow = nil
        tickerRow = nil
    }
}
