import Foundation

// The live `FlowdAPI`: URLSession against `/api/v1` (packages/contract/openapi.yaml). Entities decode exactly as in packages/contract/types.ts
// (snake_case, ISO-8601 UTC, money in cents). The composite read-models of `ReadModels.swift` (FeedItem, WalletSummary, SubmissionDetail, ...) are what the
// creator app screens consume; the server returns them for the same resources when asked with `?view=creator` (a server work item: docs/SCREENS.md and
// Core/README.md list every endpoint and which ones are still conventions rather than contract paths). Until a server answers in that shape, a call
// fails with `FlowdAPIError.decoding`, which the screens already treat as "try again".
//
// Nothing here moves money without an idempotency key, and no token is ever logged or stored outside the Keychain.

/// Per-process facts the live API learns when it signs in.
final class LiveSessionState: @unchecked Sendable {
    private let lock: NSLock = NSLock()
    private var storedCreatorId: String?
    private var storedDemo: Bool = false

    var creatorId: String? {
        lock.lock()
        defer { lock.unlock() }
        return storedCreatorId
    }

    var isDemo: Bool {
        lock.lock()
        defer { lock.unlock() }
        return storedDemo
    }

    func update(creatorId: String?, demo: Bool) {
        lock.lock()
        defer { lock.unlock() }
        storedCreatorId = creatorId
        storedDemo = demo
    }
}

struct LiveFlowdAPI: FlowdAPI {
    let client: APIClient
    let state: LiveSessionState

    init(client: APIClient, state: LiveSessionState = LiveSessionState()) {
        self.client = client
        self.state = state
    }

    init(configuration: APIConfiguration, tokens: any TokenStore = KeychainTokenStore(), transport: (any HTTPTransport)? = nil) {
        self.init(client: APIClient(configuration: configuration, transport: transport, tokens: tokens))
    }

    var isDemo: Bool {
        return state.isDemo
    }

    // MARK: Wire helpers

    private struct EmptyBody: Encodable {
    }

    private struct SessionDTO: Decodable {
        var token: String
        var role: Role
        var user: User
        var creatorId: String?
        var demo: Bool
    }

    private struct DemoLoginBody: Encodable {
        var role: String
    }

    private struct VerificationBody: Encodable {
        var kind: String
    }

    private struct EventBody: Encodable {
        var name: String
        var properties: [String: String]
    }

    private struct SaveBody: Encodable {
        var stage: String
    }

    private struct ClaimBody: Encodable {
        var bountyId: String
    }

    private struct MessageBody: Encodable {
        var body: String
    }

    private struct NoteBody: Encodable {
        var status: String
    }

    private struct IdsBody: Encodable {
        var ids: [String]
    }

    private struct AnswersBody: Encodable {
        var answers: [Int]
    }

    private struct GrantBody: Encodable {
        var grant: Bool
    }

    private struct AcceptBody: Encodable {
        var accept: Bool
    }

    private struct HoursBody: Encodable {
        var hours: Int
    }

    private struct ChannelBody: Encodable {
        var channel: String
    }

    private struct RateBody: Encodable {
        var rate: Double
    }

    private struct HelpfulBody: Encodable {
        var helpful: Bool
    }

    private struct DropClaimBody: Encodable {
        var bountyId: String
        var dropId: String
    }

    private static let creatorView: URLQueryItem = URLQueryItem(name: "view", value: "creator")

    private func seg(_ value: String) -> String {
        return APIClient.segment(value)
    }

    private func queryItems(_ pairs: [(String, String?)]) -> [URLQueryItem] {
        var out: [URLQueryItem] = []
        for pair in pairs {
            if let value = pair.1, !value.isEmpty {
                out.append(URLQueryItem(name: pair.0, value: value))
            }
        }
        return out
    }

    private func composite(_ pairs: [(String, String?)] = []) -> [URLQueryItem] {
        return [LiveFlowdAPI.creatorView] + queryItems(pairs)
    }

    private func csv<T: RawRepresentable>(_ values: [T]) -> String? where T.RawValue == String {
        if values.isEmpty {
            return nil
        }
        return values.map { (v: T) -> String in
            return v.rawValue
        }.joined(separator: ",")
    }

    private func requireCreatorId() async throws -> String {
        if let known = state.creatorId {
            return known
        }
        let session: SessionDTO = try await client.get("/me")
        state.update(creatorId: session.creatorId, demo: session.demo)
        guard let id = session.creatorId else {
            throw FlowdAPIError.forbidden("This account isn't a creator account.")
        }
        return id
    }

    private func unsupported(_ what: String) -> FlowdAPIError {
        return FlowdAPIError.unsupported(what + " isn't available on the live API yet.")
    }

    // MARK: SessionAPI

    func signIn(_ credential: SignInCredential) async throws -> CreatorSession {
        switch credential {
        case .apple:
            throw FlowdAPIError.unsupported("Sign in with Apple needs the production auth service. Use the demo creator for now.")
        case .demo:
            let request: APIRequest = APIRequest(
                method: .post,
                path: "/auth/demo-login",
                body: try client.body(DemoLoginBody(role: "creator")),
                requiresAuth: false
            )
            let session: SessionDTO = try await client.response(SessionDTO.self, request)
            client.tokens.save(session.token)
            state.update(creatorId: session.creatorId, demo: session.demo)
            let creator: Creator = try await me()
            return CreatorSession(user: session.user, creator: creator, token: nil, isDemo: session.demo, now: Date())
        }
    }

    func currentSession() async throws -> CreatorSession? {
        guard let token = client.tokens.token(), !token.isEmpty else {
            return nil
        }
        do {
            let session: SessionDTO = try await client.get("/me")
            state.update(creatorId: session.creatorId, demo: session.demo)
            let creator: Creator = try await me()
            return CreatorSession(user: session.user, creator: creator, token: nil, isDemo: session.demo, now: Date())
        } catch let error as FlowdAPIError {
            if error == .unauthorized {
                return nil
            }
            throw error
        }
    }

    func signOut() async throws {
        defer {
            client.tokens.save(nil)
            state.update(creatorId: nil, demo: false)
        }
        do {
            try await client.perform(.post, "/auth/logout")
        } catch let error as FlowdAPIError {
            if error != .unauthorized {
                throw error
            }
        }
    }

    func world() async throws -> World {
        return try await client.get("/world")
    }

    func health() async throws -> HealthStatus {
        let request: APIRequest = APIRequest(method: .get, path: "/health", requiresAuth: false)
        return try await client.response(HealthStatus.self, request)
    }

    // MARK: ProfileAPI

    func me() async throws -> Creator {
        let id: String = try await requireCreatorId()
        return try await client.get("/creators/" + seg(id))
    }

    func updateProfile(_ update: ProfileUpdate) async throws -> Creator {
        return try await client.send(.patch, "/me/profile", body: update)
    }

    func confirmAge() async throws -> User {
        try await client.perform(.post, "/verifications", body: VerificationBody(kind: VerificationKind.age.rawValue))
        let session: SessionDTO = try await client.get("/me")
        return session.user
    }

    func acceptCreatorAgreement(version: String) async throws {
        try await client.perform(.post, "/events", body: EventBody(name: "creator_agreement_accepted", properties: ["version": version]))
    }

    func creatorProfile(handleOrId: String) async throws -> CreatorProfile {
        let request: APIRequest = APIRequest(method: .get, path: "/public/creators/" + seg(handleOrId), query: composite(), requiresAuth: false)
        return try await client.response(CreatorProfile.self, request)
    }

    func socialAccounts() async throws -> [SocialAccount] {
        let page: Page<SocialAccount> = try await client.getPage("/social-accounts")
        return page.data
    }

    func linkSocialAccount(_ request: LinkAccountRequest) async throws -> SocialAccount {
        return try await client.send(.post, "/social-accounts", body: request)
    }

    func reconnectSocialAccount(id: String) async throws -> SocialAccount {
        let accounts: [SocialAccount] = try await socialAccounts()
        guard let account = accounts.first(where: { (a: SocialAccount) -> Bool in
            return a.id == id
        }) else {
            throw FlowdAPIError.notFound("that account")
        }
        return try await linkSocialAccount(LinkAccountRequest(platform: account.platform, handle: account.handle))
    }

    func disconnectSocialAccount(id: String) async throws {
        try await client.perform(.delete, "/social-accounts/" + seg(id))
    }

    func reputation() async throws -> CreatorReputation {
        let id: String = try await requireCreatorId()
        return try await client.get("/creators/" + seg(id) + "/reputation", query: composite())
    }

    func tierStatus() async throws -> TierStatus {
        return try await client.get("/tiers/me", query: composite())
    }

    func verifications() async throws -> [Verification] {
        throw unsupported("The verification history")
    }

    func startVerification(kind: VerificationKind) async throws -> Verification {
        return try await client.send(.post, "/verifications", body: VerificationBody(kind: kind.rawValue))
    }

    func notificationPrefs() async throws -> NotificationPrefs {
        return try await client.get("/settings/notifications")
    }

    func updateNotificationPrefs(_ prefs: NotificationPrefs) async throws -> NotificationPrefs {
        return try await client.send(.put, "/settings/notifications", body: prefs)
    }

    func wellbeing() async throws -> WellbeingSettings {
        return try await client.get("/settings/wellbeing")
    }

    func updateWellbeing(_ settings: WellbeingSettings) async throws -> WellbeingSettings {
        return try await client.send(.put, "/settings/wellbeing", body: settings)
    }

    func requestDataExport() async throws {
        try await client.perform(.post, "/events", body: EventBody(name: "data_export_requested", properties: [:]))
    }

    func deleteAccount() async throws {
        throw FlowdAPIError.unsupported("Deleting your account is handled from joinflowd.io until the app can do it directly. Email hello@joinflowd.io and we will do it within 30 days.")
    }

    func earningsPreview(niche: Niche) async throws -> EarningsPreview {
        let request: APIRequest = APIRequest(
            method: .post,
            path: "/tools/earnings",
            query: composite(),
            body: try client.body(["niche": niche.rawValue]),
            requiresAuth: false
        )
        return try await client.response(EarningsPreview.self, request)
    }

    func firstDollarPath() async throws -> FirstDollarPath {
        async let creatorCall: Creator = me()
        async let submissionsCall: [SubmissionListItem] = submissions(filter: .all)
        async let feedCall: Page<FeedItem> = feed(FeedQuery(includeLocked: false, limit: 20))
        let creator: Creator = try await creatorCall
        let subs: [SubmissionListItem] = try await submissionsCall
        let feedPage: Page<FeedItem> = try await feedCall
        let hasSubmission: Bool = !subs.isEmpty
        let approved: SubmissionListItem? = subs.first(where: { (s: SubmissionListItem) -> Bool in
            return s.submission.approvedAt != nil
        })
        let inReview: SubmissionListItem? = subs.first(where: { (s: SubmissionListItem) -> Bool in
            return s.submission.isWaitingOnBrand
        })
        let cleared: Bool = creator.firstDollarAt != nil
        let decideBy: Date? = inReview?.submission.slaDueAt
        var clearedBy: Date? = nil
        if cleared {
            clearedBy = creator.firstDollarAt
        } else if let when = approved?.submission.approvedAt {
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
        let starter: FeedItem? = feedPage.data.first(where: { (i: FeedItem) -> Bool in
            return i.bounty.isStarter
        })
        return FirstDollarPath(
            steps: steps,
            starter: starter,
            clearedByEstimate: clearedBy,
            retired: cleared,
            note: "Approval isn't guaranteed: your video has to meet the brief. No bank, tax or ID is needed until your first approval."
        )
    }

    // MARK: BountiesAPI

    func feed(_ query: FeedQuery) async throws -> Page<FeedItem> {
        var pairs: [(String, String?)] = []
        pairs.append(("q", query.search))
        pairs.append(("type", csv(query.types)))
        pairs.append(("platform", csv(query.platforms)))
        pairs.append(("niche", csv(query.niches)))
        if query.organicOnly {
            pairs.append(("organic_only", "true"))
        }
        if let minimum = query.minCpmCents {
            pairs.append(("min_cpm_cents", String(minimum)))
        }
        if !query.includeLocked {
            pairs.append(("include_locked", "false"))
        }
        if query.savedOnly {
            pairs.append(("saved_only", "true"))
        }
        pairs.append(("sort", query.sort.rawValue))
        pairs.append(("cursor", query.cursor))
        pairs.append(("limit", String(query.limit)))
        return try await client.getPage("/feed", query: composite(pairs))
    }

    func bountyDetail(id: String) async throws -> BountyDetail {
        return try await client.get("/bounties/" + seg(id), query: composite())
    }

    func payMath(bountyId: String) async throws -> PayMathBreakdown {
        let detail: BountyDetail = try await bountyDetail(id: bountyId)
        let bounty: Bounty = detail.item.bounty
        var assumptions: [String] = [
            "Views are your own 28-day median on a linked account; with none linked it is the category median.",
            "Views pay is counted over the 72-hour view window and capped at " + Fmt.money(bounty.perVideoCapCents) + " a video.",
            "A conversion bonus pays only on tracked link and code conversions; survey and modelled numbers are never paid.",
            "Low, typical and high are 0.4x, 1x and 2.55x your median views. Results vary."
        ]
        if bounty.flatFeeCents > 0 {
            assumptions.append("The flat fee of " + Fmt.money(bounty.flatFeeCents) + " is paid on top, outside the cap.")
        }
        var line: String? = nil
        if let band = detail.typicalEarnings {
            line = EarningsEngine.typicalVsTop(typicalCents: band.medianCents, topCents: band.p90Cents)
        }
        return PayMathBreakdown(
            bountyId: bountyId,
            expected: detail.item.expectedPay,
            bountyPayMath: bounty.payMath,
            perVideoCapCents: bounty.perVideoCapCents,
            rates: bounty.rateLines,
            typical: detail.typicalEarnings,
            topExampleCents: detail.topExampleCents,
            typicalVsTopLine: line,
            assumptions: assumptions,
            disclaimer: EarningsEngine.disclaimer
        )
    }

    func brandScorecard(brandId: String) async throws -> BrandScorecardView {
        return try await client.get("/brands/" + seg(brandId) + "/scorecard", query: composite())
    }

    func savedBounties() async throws -> [SavedBounty] {
        let page: Page<SavedBounty> = try await client.getPage("/saves", query: composite())
        return page.data
    }

    func saveBounty(id: String) async throws -> BountySave {
        return try await client.send(.put, "/saves/" + seg(id), body: SaveBody(stage: SaveStage.saved.rawValue))
    }

    func unsaveBounty(id: String) async throws {
        try await client.perform(.delete, "/saves/" + seg(id))
    }

    func joinBounty(id: String) async throws -> BountySave {
        return try await client.send(.put, "/saves/" + seg(id), body: SaveBody(stage: SaveStage.joined.rawValue))
    }

    func todayDrop() async throws -> DailyDropView {
        return try await client.get("/drops/today", query: composite())
    }

    func dropHistory() async throws -> [DailyDrop] {
        throw unsupported("The Daily Drop history")
    }

    func claimDropSpot(dropId: String, bountyId: String, idempotencyKey: String) async throws -> BountySave {
        return try await client.send(.post, "/drops/" + seg(dropId) + "/claim", body: ClaimBody(bountyId: bountyId), idempotencyKey: idempotencyKey)
    }

    // MARK: OffersAPI

    func offers() async throws -> [OfferSummary] {
        let page: Page<OfferSummary> = try await client.getPage("/offers", query: composite())
        return page.data
    }

    func offerDetail(id: String) async throws -> OfferDetail {
        return try await client.get("/offers/" + seg(id), query: composite())
    }

    func acceptOffer(id: String, idempotencyKey: String) async throws -> Offer {
        return try await client.send(.post, "/offers/" + seg(id) + "/accept", idempotencyKey: idempotencyKey)
    }

    func counterOffer(id: String, _ request: OfferCounterRequest) async throws -> Offer {
        return try await client.send(.post, "/offers/" + seg(id) + "/counter", body: request, idempotencyKey: request.idempotencyKey)
    }

    func declineOffer(id: String) async throws -> Offer {
        return try await client.send(.post, "/offers/" + seg(id) + "/decline", idempotencyKey: UUID().uuidString)
    }

    func sendOfferMessage(id: String, body: String) async throws -> Offer {
        return try await client.send(.post, "/offers/" + seg(id) + "/messages", body: MessageBody(body: body))
    }

    func rateCard() async throws -> RateCardView {
        return try await client.get("/rate-card", query: composite())
    }

    func updateRateCard(_ update: RateCardUpdate) async throws -> RateCardView {
        return try await client.send(.put, "/rate-card", body: update, query: composite())
    }

    // MARK: SubmissionsAPI

    func submissions(filter: SubmissionFilter) async throws -> [SubmissionListItem] {
        let page: Page<SubmissionListItem> = try await client.getPage("/submissions", query: composite([("status", filter == .all ? nil : filter.rawValue)]))
        return page.data
    }

    func submissionDetail(id: String) async throws -> SubmissionDetail {
        return try await client.get("/submissions/" + seg(id), query: composite())
    }

    func videoAnalysis(submissionId: String, version: Int?) async throws -> VideoAnalysis? {
        do {
            return try await client.get("/submissions/" + seg(submissionId) + "/analysis", query: queryItems([("version", version.map { (v: Int) -> String in return String(v) })]))
        } catch let error as FlowdAPIError {
            if case .notFound = error {
                return nil
            }
            throw error
        }
    }

    func beginUpload(_ request: UploadRequest) async throws -> UploadSession {
        return try await client.send(.post, "/uploads", body: request)
    }

    func submit(_ request: SubmitRequest) async throws -> Submission {
        return try await client.send(.post, "/submissions", body: request, idempotencyKey: request.idempotencyKey)
    }

    func revise(submissionId: String, _ request: ReviseRequest) async throws -> Submission {
        return try await client.send(.post, "/submissions/" + seg(submissionId) + "/revise", body: request, idempotencyKey: request.idempotencyKey)
    }

    func appeal(submissionId: String, _ request: AppealRequest) async throws -> Dispute {
        return try await client.send(.post, "/submissions/" + seg(submissionId) + "/appeal", body: request, idempotencyKey: request.idempotencyKey)
    }

    func withdraw(submissionId: String) async throws -> Submission {
        return try await client.send(.post, "/submissions/" + seg(submissionId) + "/withdraw", idempotencyKey: UUID().uuidString)
    }

    func resolveNote(id: String) async throws -> FeedbackNote {
        return try await client.send(.patch, "/feedback/" + seg(id), body: NoteBody(status: FeedbackStatus.resolved.rawValue))
    }

    func attachPost(submissionId: String, _ request: AttachPostRequest) async throws -> Post {
        return try await client.send(.post, "/submissions/" + seg(submissionId) + "/post", body: request, idempotencyKey: request.idempotencyKey)
    }

    // MARK: PostsAPI

    func posts(filter: PostFilter) async throws -> [PostListItem] {
        let page: Page<PostListItem> = try await client.getPage("/posts", query: composite([("status", filter == .all ? nil : filter.rawValue)]))
        return page.data
    }

    func postDetail(id: String) async throws -> PostDetail {
        return try await client.get("/posts/" + seg(id), query: composite())
    }

    func viewLedger(postId: String) async throws -> ViewLedger {
        return try await client.get("/posts/" + seg(postId) + "/ledger", query: composite())
    }

    func openDispute(_ request: DisputeRequest) async throws -> Dispute {
        return try await client.send(.post, "/posts/" + seg(request.postId) + "/dispute", body: request, idempotencyKey: request.idempotencyKey)
    }

    func disputes() async throws -> [Dispute] {
        let page: Page<Dispute> = try await client.getPage("/disputes")
        return page.data
    }

    func dispute(id: String) async throws -> Dispute {
        return try await client.get("/disputes/" + seg(id))
    }

    private struct DisputeReplyBody: Encodable {
        var text: String
        var evidence: [Evidence]
    }

    func replyToDispute(id: String, text: String, evidence: [Evidence]) async throws -> Dispute {
        return try await client.send(.post, "/disputes/" + seg(id) + "/events", body: DisputeReplyBody(text: text, evidence: evidence))
    }

    func removePost(id: String) async throws -> Post {
        return try await client.send(.post, "/posts/" + seg(id) + "/remove", idempotencyKey: UUID().uuidString)
    }

    // MARK: WalletAPI

    func wallet() async throws -> WalletSummary {
        return try await client.get("/wallet", query: composite())
    }

    func moneyClock() async throws -> [MoneyClockRow] {
        let page: Page<MoneyClockRow> = try await client.getPage("/money-clock", query: [URLQueryItem(name: "limit", value: "200")])
        return page.data
    }

    func ledger(limit: Int) async throws -> [LedgerEntry] {
        let page: Page<LedgerEntry> = try await client.getPage("/ledger", query: [URLQueryItem(name: "limit", value: String(Swift.min(200, Swift.max(1, limit))))])
        return page.data
    }

    func earnings(period: EarningsPeriod) async throws -> EarningsReport {
        return try await client.get("/wallet", query: composite([("report", period.rawValue)]))
    }

    func payouts() async throws -> [Payout] {
        let page: Page<Payout> = try await client.getPage("/payouts")
        return page.data
    }

    func payoutDetail(id: String) async throws -> PayoutDetail {
        return try await client.get("/payouts/" + seg(id), query: composite())
    }

    func payoutPreview(amountCents: Int?) async throws -> PayoutPreview {
        return try await client.get("/payouts/preview", query: composite([("amount_cents", amountCents.map { (v: Int) -> String in return String(v) })]))
    }

    func instantPayout(_ request: InstantPayoutRequest) async throws -> Payout {
        return try await client.send(.post, "/payouts/instant", body: request, idempotencyKey: request.idempotencyKey)
    }

    func payoutMethods() async throws -> [PayoutMethod] {
        let page: Page<PayoutMethod> = try await client.getPage("/payout-methods")
        return page.data
    }

    func addPayoutMethod(_ request: AddPayoutMethodRequest) async throws -> PayoutMethod {
        return try await client.send(.post, "/payout-methods", body: request)
    }

    func removePayoutMethod(id: String) async throws {
        try await client.perform(.delete, "/payout-methods/" + seg(id))
    }

    func proofs() async throws -> [Proof] {
        let recent: [Payout] = Array(try await payouts().prefix(12))
        var found: [Proof] = []
        try await withThrowingTaskGroup(of: Proof?.self) { (group: inout ThrowingTaskGroup<Proof?, Error>) in
            for payout in recent {
                let path: String = "/public/proofs/" + APIClient.segment(payout.proofId)
                let client: APIClient = self.client
                group.addTask { () -> Proof? in
                    let request: APIRequest = APIRequest(method: .get, path: path, requiresAuth: false)
                    return try? await client.response(Proof.self, request)
                }
            }
            for try await proof in group {
                if let value = proof {
                    found.append(value)
                }
            }
        }
        return found.sorted { (a: Proof, b: Proof) -> Bool in
            return a.createdAt > b.createdAt
        }
    }

    func createProof(_ request: ProofRequest) async throws -> Proof {
        return try await client.send(.post, "/proofs", body: request)
    }

    func revokeProof(id: String) async throws {
        try await client.perform(.delete, "/proofs/" + seg(id))
    }

    func wrapped() async throws -> [Wrapped] {
        let page: Page<Wrapped> = try await client.getPage("/wrapped")
        return page.data
    }

    func taxSummary() async throws -> TaxSummary {
        return try await client.get("/tax/summary", query: composite())
    }

    func submitW9(_ request: W9Request) async throws -> TaxProfile {
        return try await client.send(.post, "/tax/w9", body: request)
    }

    func setTaxSetAside(rate: Double) async throws -> TaxProfile {
        return try await client.send(.patch, "/tax/set-aside", body: RateBody(rate: rate))
    }

    func taxCSV(year: Int) async throws -> String {
        return try await client.getText("/tax/export.csv", query: [URLQueryItem(name: "year", value: String(year))])
    }

    func rights() async throws -> RightsOverview {
        return try await client.get("/rights", query: composite())
    }

    func respondToRightsPermission(grantId: String, grant: Bool) async throws -> RightsGrant {
        return try await client.send(.post, "/rights/" + seg(grantId) + "/permission", body: GrantBody(grant: grant), idempotencyKey: UUID().uuidString)
    }

    func respondToRenewal(grantId: String, accept: Bool) async throws -> RightsGrant {
        return try await client.send(.post, "/rights/" + seg(grantId) + "/renew", body: AcceptBody(accept: accept), idempotencyKey: UUID().uuidString)
    }

    func revokeRights(grantId: String) async throws -> RightsGrant {
        return try await client.send(.post, "/rights/" + seg(grantId) + "/revoke", idempotencyKey: UUID().uuidString)
    }

    // MARK: CompeteAPI

    func leaderboard(scope: LeaderboardScope, metric: LeaderboardMetric, niche: Niche?) async throws -> LeaderboardStanding {
        return try await client.get("/leaderboards", query: composite([("scope", scope.rawValue), ("metric", metric.rawValue), ("niche", niche?.rawValue)]))
    }

    func tournaments() async throws -> [TournamentView] {
        let page: Page<TournamentView> = try await client.getPage("/tournaments", query: composite())
        return page.data
    }

    func tournament(id: String) async throws -> TournamentView {
        return try await client.get("/tournaments/" + seg(id), query: composite())
    }

    func joinTournament(id: String, _ request: TournamentEntryRequest) async throws -> TournamentEntry {
        return try await client.send(.post, "/tournaments/" + seg(id) + "/entries", body: request, idempotencyKey: UUID().uuidString)
    }

    func crews() async throws -> CrewDirectory {
        return try await client.get("/crews", query: composite())
    }

    func crew(id: String) async throws -> CrewView {
        return try await client.get("/crews/" + seg(id), query: composite())
    }

    func createCrew(_ request: CreateCrewRequest) async throws -> CrewView {
        return try await client.send(.post, "/crews", body: request, query: composite())
    }

    func joinCrew(id: String) async throws -> CrewView {
        return try await client.send(.post, "/crews/" + seg(id) + "/join", query: composite())
    }

    func leaveCrew(id: String) async throws {
        try await client.perform(.post, "/crews/" + seg(id) + "/leave")
    }

    func referrals() async throws -> ReferralSummary {
        return try await client.get("/referrals", query: composite())
    }

    func createReferralInvite(channel: String) async throws -> Referral {
        return try await client.send(.post, "/referrals", body: ChannelBody(channel: channel))
    }

    func streak() async throws -> StreakSummary {
        return try await client.get("/streaks/me", query: composite())
    }

    func declareRestWeek() async throws -> StreakSummary {
        return try await client.send(.post, "/streaks/rest-week", query: composite())
    }

    func academy() async throws -> AcademyOverview {
        return try await client.get("/academy", query: composite())
    }

    func lesson(slug: String) async throws -> LessonItem {
        return try await client.get("/academy/" + seg(slug), query: composite())
    }

    func completeLesson(slug: String, answers: [Int]) async throws -> LessonResult {
        return try await client.send(.post, "/academy/" + seg(slug) + "/complete", body: AnswersBody(answers: answers), query: composite())
    }

    func remixLibrary() async throws -> RemixLibrary {
        return try await client.get("/remix")
    }

    func specs() async throws -> [Spec] {
        let page: Page<Spec> = try await client.getPage("/specs", query: [URLQueryItem(name: "mine", value: "true")])
        return page.data
    }

    func createSpec(_ request: CreateSpecRequest) async throws -> Spec {
        return try await client.send(.post, "/specs", body: request)
    }

    func scoreSpec(id: String) async throws -> Spec {
        return try await client.send(.post, "/specs/" + seg(id) + "/score")
    }

    func withdrawSpec(id: String) async throws -> Spec {
        return try await client.send(.delete, "/specs/" + seg(id))
    }

    func auctions() async throws -> [Auction] {
        let page: Page<Auction> = try await client.getPage("/auctions", query: [URLQueryItem(name: "mine", value: "true")])
        return page.data
    }

    func createAuction(_ request: CreateAuctionRequest) async throws -> Auction {
        return try await client.send(.post, "/auctions", body: request)
    }

    func cancelAuction(id: String) async throws -> Auction {
        return try await client.send(.post, "/auctions/" + seg(id) + "/cancel", idempotencyKey: UUID().uuidString)
    }

    // MARK: InboxAPI

    func notifications(filter: ActivityFilter) async throws -> [AppNotification] {
        let page: Page<AppNotification> = try await client.getPage("/notifications", query: queryItems([("filter", filter == .all ? nil : filter.rawValue)]))
        return page.data
    }

    func markNotificationsRead(ids: [String]) async throws {
        try await client.perform(.post, "/notifications/read", body: IdsBody(ids: ids))
    }

    func threads() async throws -> [InboxThread] {
        let page: Page<InboxThread> = try await client.getPage("/threads", query: composite())
        return page.data
    }

    func thread(id: String) async throws -> InboxThread {
        return try await client.get("/threads/" + seg(id), query: composite())
    }

    func sendMessage(threadId: String, body: String) async throws -> InboxThread {
        return try await client.send(.post, "/threads/" + seg(threadId) + "/messages", body: MessageBody(body: body), query: composite())
    }

    func reportScam(_ request: ScamReportRequest) async throws -> ScamReport {
        return try await client.send(.post, "/reports", body: request, idempotencyKey: request.idempotencyKey)
    }

    func myReports() async throws -> [ScamReport] {
        let page: Page<ScamReport> = try await client.getPage("/reports/mine")
        return page.data
    }

    /// Flo is a server-sent-events stream on the web; the app asks for the recorded, non-streaming answer (`Accept: application/json`).
    func flo(_ request: FloRequest) async throws -> FloSuggestion {
        return try await client.send(.post, "/flo/chat", body: request)
    }

    func floHistory() async throws -> [FloSuggestion] {
        throw unsupported("Flo's history")
    }

    func rateFloSuggestion(id: String, helpful: Bool) async throws -> FloSuggestion {
        return try await client.send(.patch, "/flo/suggestions/" + seg(id), body: HelpfulBody(helpful: helpful))
    }

    // MARK: DemoAPI

    func advanceDemoClock(hours: Int) async throws -> World {
        return try await client.send(.post, "/admin/demo/advance", body: HoursBody(hours: hours))
    }

    func resetDemo() async throws {
        try await client.perform(.post, "/admin/demo/reset")
    }

    func simulateDecision(submissionId: String, decision: DemoDecision) async throws -> Submission {
        throw FlowdAPIError.unsupported("Brand decisions are simulated in the offline demo only.")
    }
}
