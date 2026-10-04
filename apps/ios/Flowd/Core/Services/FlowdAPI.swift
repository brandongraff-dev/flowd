import Foundation

// The creator app's data contract: `FlowdAPI`. Feature view models take `any FlowdAPI` (never a concrete type), and `APIClientFactory` supplies
// `MockFlowdAPI` (bundled fixtures, in-memory mutations, works offline in the simulator) or `LiveFlowdAPI` (URLSession against `/api/v1`).
//
// Rules for every method:
//  - `async throws`; throws only `FlowdAPIError`;
//  - money is `Int` cents, rates are cents per 1,000 verified views, timestamps are `Date`;
//  - mutating calls that move money or create a settlement artefact take an `idempotencyKey` (default: a fresh UUID); a repeated key returns the
//    original result, so a double tap never pays twice;
//  - read-models (`FeedItem`, `WalletSummary`, `SubmissionDetail`, ...) are fully composed: a screen needs one call, not N.
//
// The protocol is split by area so a view model can depend on the slice it uses; `FlowdAPI` is the union.

// MARK: - Session

protocol SessionAPI: Sendable {
    /// Signs in. The mock always returns the demo creator (Maya, Silver) or, for `.apple`, a fresh creator at the start of the First-Dollar Path.
    func signIn(_ credential: SignInCredential) async throws -> CreatorSession
    /// The restored session, or nil when signed out.
    func currentSession() async throws -> CreatorSession?
    func signOut() async throws
    /// The world manifest: "now", personas, row counts.
    func world() async throws -> World
    func health() async throws -> HealthStatus
}

// MARK: - Profile, accounts, trust

protocol ProfileAPI: Sendable {
    func me() async throws -> Creator
    func updateProfile(_ update: ProfileUpdate) async throws -> Creator
    /// 18+ confirmation (ID comes later, just in time before the first payout).
    func confirmAge() async throws -> User
    func acceptCreatorAgreement(version: String) async throws
    /// A public storefront by handle or creator id.
    func creatorProfile(handleOrId: String) async throws -> CreatorProfile
    func socialAccounts() async throws -> [SocialAccount]
    func linkSocialAccount(_ request: LinkAccountRequest) async throws -> SocialAccount
    func reconnectSocialAccount(id: String) async throws -> SocialAccount
    func disconnectSocialAccount(id: String) async throws
    func reputation() async throws -> CreatorReputation
    func tierStatus() async throws -> TierStatus
    func verifications() async throws -> [Verification]
    func startVerification(kind: VerificationKind) async throws -> Verification
    func notificationPrefs() async throws -> NotificationPrefs
    func updateNotificationPrefs(_ prefs: NotificationPrefs) async throws -> NotificationPrefs
    func wellbeing() async throws -> WellbeingSettings
    func updateWellbeing(_ settings: WellbeingSettings) async throws -> WellbeingSettings
    func requestDataExport() async throws
    func deleteAccount() async throws
    /// The earnings preview shown before sign-up: typical (p25 to p75) beside a top example, and a sample bounty.
    func earningsPreview(niche: Niche) async throws -> EarningsPreview
    /// The First-Dollar Path tracker: scored take, submitted, approved, cleared, with dated ETAs.
    func firstDollarPath() async throws -> FirstDollarPath
}

// MARK: - Bounties, Daily Drop

protocol BountiesAPI: Sendable {
    func feed(_ query: FeedQuery) async throws -> Page<FeedItem>
    func bountyDetail(id: String) async throws -> BountyDetail
    func payMath(bountyId: String) async throws -> PayMathBreakdown
    func brandScorecard(brandId: String) async throws -> BrandScorecardView
    func savedBounties() async throws -> [SavedBounty]
    func saveBounty(id: String) async throws -> BountySave
    func unsaveBounty(id: String) async throws
    /// Joins ("claims") a bounty: reserves the creator a 24-hour window to submit.
    func joinBounty(id: String) async throws -> BountySave
    /// Today's Daily Drop (16:00 UTC): pre-drop, live or sold out, always with true inventory.
    func todayDrop() async throws -> DailyDropView
    func dropHistory() async throws -> [DailyDrop]
    func claimDropSpot(dropId: String, bountyId: String, idempotencyKey: String) async throws -> BountySave
}

// MARK: - Offers and rate card

protocol OffersAPI: Sendable {
    func offers() async throws -> [OfferSummary]
    func offerDetail(id: String) async throws -> OfferDetail
    func acceptOffer(id: String, idempotencyKey: String) async throws -> Offer
    func counterOffer(id: String, _ request: OfferCounterRequest) async throws -> Offer
    func declineOffer(id: String) async throws -> Offer
    func sendOfferMessage(id: String, body: String) async throws -> Offer
    func rateCard() async throws -> RateCardView
    func updateRateCard(_ update: RateCardUpdate) async throws -> RateCardView
}

// MARK: - Submissions

protocol SubmissionsAPI: Sendable {
    func submissions(filter: SubmissionFilter) async throws -> [SubmissionListItem]
    func submissionDetail(id: String) async throws -> SubmissionDetail
    func videoAnalysis(submissionId: String, version: Int?) async throws -> VideoAnalysis?
    /// Starts a resumable upload (mock: simulated chunks).
    func beginUpload(_ request: UploadRequest) async throws -> UploadSession
    /// Creates v1 and takes a Reserved Slot from the pool.
    func submit(_ request: SubmitRequest) async throws -> Submission
    /// Uploads the next version after "changes requested".
    func revise(submissionId: String, _ request: ReviseRequest) async throws -> Submission
    /// One appeal per rejection, within 7 days.
    func appeal(submissionId: String, _ request: AppealRequest) async throws -> Dispute
    func withdraw(submissionId: String) async throws -> Submission
    /// The creator marks a timecoded note as done.
    func resolveNote(id: String) async throws -> FeedbackNote
    /// Attaches the post URL; opens the 72-hour window.
    func attachPost(submissionId: String, _ request: AttachPostRequest) async throws -> Post
}

// MARK: - Posts, View Ledger, disputes

protocol PostsAPI: Sendable {
    func posts(filter: PostFilter) async throws -> [PostListItem]
    func postDetail(id: String) async throws -> PostDetail
    func viewLedger(postId: String) async throws -> ViewLedger
    func openDispute(_ request: DisputeRequest) async throws -> Dispute
    func disputes() async throws -> [Dispute]
    func dispute(id: String) async throws -> Dispute
    func replyToDispute(id: String, text: String, evidence: [Evidence]) async throws -> Dispute
    /// Records a deletion (a post removed before its window closes earns nothing).
    func removePost(id: String) async throws -> Post
}

// MARK: - Wallet, Money Clock, payouts, tax, rights

protocol WalletAPI: Sendable {
    func wallet() async throws -> WalletSummary
    /// Every earning row with its state, dated ETA and named reason.
    func moneyClock() async throws -> [MoneyClockRow]
    /// The creator's own ledger legs, newest first.
    func ledger(limit: Int) async throws -> [LedgerEntry]
    func earnings(period: EarningsPeriod) async throws -> EarningsReport
    func payouts() async throws -> [Payout]
    func payoutDetail(id: String) async throws -> PayoutDetail
    /// Fee, net and arrival of an instant cash-out of `amountCents` (nil = everything cleared).
    func payoutPreview(amountCents: Int?) async throws -> PayoutPreview
    func instantPayout(_ request: InstantPayoutRequest) async throws -> Payout
    func payoutMethods() async throws -> [PayoutMethod]
    func addPayoutMethod(_ request: AddPayoutMethodRequest) async throws -> PayoutMethod
    func removePayoutMethod(id: String) async throws
    func proofs() async throws -> [Proof]
    func createProof(_ request: ProofRequest) async throws -> Proof
    func revokeProof(id: String) async throws
    func wrapped() async throws -> [Wrapped]
    func taxSummary() async throws -> TaxSummary
    func submitW9(_ request: W9Request) async throws -> TaxProfile
    func setTaxSetAside(rate: Double) async throws -> TaxProfile
    /// The earnings CSV for a tax year ("Not tax advice").
    func taxCSV(year: Int) async throws -> String
    func rights() async throws -> RightsOverview
    /// Grants or declines a Spark code or partnership permission.
    func respondToRightsPermission(grantId: String, grant: Bool) async throws -> RightsGrant
    func respondToRenewal(grantId: String, accept: Bool) async throws -> RightsGrant
    /// Revokes a licence for misuse beyond the Rights Card.
    func revokeRights(grantId: String) async throws -> RightsGrant
}

// MARK: - Compete and grow

protocol CompeteAPI: Sendable {
    func leaderboard(scope: LeaderboardScope, metric: LeaderboardMetric, niche: Niche?) async throws -> LeaderboardStanding
    func tournaments() async throws -> [TournamentView]
    func tournament(id: String) async throws -> TournamentView
    func joinTournament(id: String, _ request: TournamentEntryRequest) async throws -> TournamentEntry
    func crews() async throws -> CrewDirectory
    func crew(id: String) async throws -> CrewView
    func createCrew(_ request: CreateCrewRequest) async throws -> CrewView
    func joinCrew(id: String) async throws -> CrewView
    func leaveCrew(id: String) async throws
    func referrals() async throws -> ReferralSummary
    func createReferralInvite(channel: String) async throws -> Referral
    func streak() async throws -> StreakSummary
    func declareRestWeek() async throws -> StreakSummary
    func academy() async throws -> AcademyOverview
    func lesson(slug: String) async throws -> LessonItem
    func completeLesson(slug: String, answers: [Int]) async throws -> LessonResult
    func remixLibrary() async throws -> RemixLibrary
    func specs() async throws -> [Spec]
    func createSpec(_ request: CreateSpecRequest) async throws -> Spec
    func scoreSpec(id: String) async throws -> Spec
    func withdrawSpec(id: String) async throws -> Spec
    func auctions() async throws -> [Auction]
    func createAuction(_ request: CreateAuctionRequest) async throws -> Auction
    func cancelAuction(id: String) async throws -> Auction
}

// MARK: - Inbox, safety, Flo

protocol InboxAPI: Sendable {
    func notifications(filter: ActivityFilter) async throws -> [AppNotification]
    func markNotificationsRead(ids: [String]) async throws
    func threads() async throws -> [InboxThread]
    func thread(id: String) async throws -> InboxThread
    /// Sends a message (in-app only; Scam Shield screens it).
    func sendMessage(threadId: String, body: String) async throws -> InboxThread
    func reportScam(_ request: ScamReportRequest) async throws -> ScamReport
    func myReports() async throws -> [ScamReport]
    /// Flo, the in-app copilot (a mock engine behind an `AIProvider`).
    func flo(_ request: FloRequest) async throws -> FloSuggestion
    func floHistory() async throws -> [FloSuggestion]
    func rateFloSuggestion(id: String, helpful: Bool) async throws -> FloSuggestion
}

// MARK: - Demo controls

/// What a brand decides in the demo ("simulate the brand").
enum DemoDecision: Hashable, Sendable {
    case approve
    case requestChanges(notes: [String])
    case reject(reason: ReasonCode, summary: String)
}

protocol DemoAPI: Sendable {
    /// Moves the demo clock forward and runs window close, the fraud check, clearing and the Friday payout when due. Mock only.
    func advanceDemoClock(hours: Int) async throws -> World
    /// Restores the seed. Mock only.
    func resetDemo() async throws
    /// Plays the brand's decision on one of the creator's submissions. Mock only.
    func simulateDecision(submissionId: String, decision: DemoDecision) async throws -> Submission
}

// MARK: - The union

protocol FlowdAPI: SessionAPI, ProfileAPI, BountiesAPI, OffersAPI, SubmissionsAPI, PostsAPI, WalletAPI, CompeteAPI, InboxAPI, DemoAPI {
    /// Everything Home shows, in one pull-to-refresh.
    func homeSummary() async throws -> HomeSummary
    /// True for the in-memory fixture API (the UI shows its "Demo data" affordance).
    var isDemo: Bool { get }
}

// MARK: - Defaults

extension FlowdAPI {
    func claimDropSpot(dropId: String, bountyId: String) async throws -> BountySave {
        return try await claimDropSpot(dropId: dropId, bountyId: bountyId, idempotencyKey: UUID().uuidString)
    }

    func acceptOffer(id: String) async throws -> Offer {
        return try await acceptOffer(id: id, idempotencyKey: UUID().uuidString)
    }

    func feed() async throws -> Page<FeedItem> {
        return try await feed(FeedQuery())
    }

    func submissions() async throws -> [SubmissionListItem] {
        return try await submissions(filter: .all)
    }

    func posts() async throws -> [PostListItem] {
        return try await posts(filter: .all)
    }

    func ledger() async throws -> [LedgerEntry] {
        return try await ledger(limit: 200)
    }

    func payoutPreview() async throws -> PayoutPreview {
        return try await payoutPreview(amountCents: nil)
    }

    func notifications() async throws -> [AppNotification] {
        return try await notifications(filter: .all)
    }

    func leaderboard() async throws -> LeaderboardStanding {
        return try await leaderboard(scope: .cohort, metric: .earnings, niche: nil)
    }

    func videoAnalysis(submissionId: String) async throws -> VideoAnalysis? {
        return try await videoAnalysis(submissionId: submissionId, version: nil)
    }

    /// The default Home pull: the granular calls, run in parallel. Implementations may override with a single endpoint.
    func homeSummary() async throws -> HomeSummary {
        async let creatorCall: Creator = me()
        async let walletCall: WalletSummary = wallet()
        async let streakCall: StreakSummary = streak()
        async let submissionsCall: [SubmissionListItem] = submissions(filter: .all)
        async let feedCall: Page<FeedItem> = feed(FeedQuery(includeLocked: false, limit: 8))
        async let remixCall: RemixLibrary = remixLibrary()
        async let pathCall: FirstDollarPath = firstDollarPath()
        async let notificationsCall: [AppNotification] = notifications(filter: .all)
        async let academyCall: AcademyOverview = academy()
        let creatorValue: Creator = try await creatorCall
        let walletValue: WalletSummary = try await walletCall
        let streakValue: StreakSummary = try await streakCall
        let submissionValues: [SubmissionListItem] = try await submissionsCall
        let feedValue: Page<FeedItem> = try await feedCall
        let remixValue: RemixLibrary = try await remixCall
        let pathValue: FirstDollarPath = try await pathCall
        let inboxValues: [AppNotification] = try await notificationsCall
        let academyValue: AcademyOverview = try await academyCall
        var dropValue: DailyDropView? = nil
        do {
            dropValue = try await todayDrop()
        } catch {
            dropValue = nil
        }
        let active: [SubmissionListItem] = submissionValues.filter { (item: SubmissionListItem) -> Bool in
            return item.submission.isOpen
        }
        let unread: Int = inboxValues.filter { (n: AppNotification) -> Bool in
            return n.readAt == nil
        }.count
        return HomeSummary(
            creator: creatorValue,
            wallet: walletValue,
            drop: dropValue,
            streak: streakValue,
            activeSubmissions: Array(active.prefix(6)),
            matched: Array(feedValue.data.prefix(8)),
            trends: Array(remixValue.trends.prefix(4)),
            firstDollar: pathValue.retired ? nil : pathValue,
            unreadCount: unread,
            nextLesson: academyValue.nextLesson,
            recentActivity: Array(inboxValues.prefix(5)),
            liveDemo: isDemo
        )
    }
}
