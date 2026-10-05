# Core (apps/ios/Flowd/Core)

The data layer of the flowd creator app: models that mirror `packages/contract/DOMAIN.md`, the `FlowdAPI` service contract with its offline `MockFlowdAPI` and its `LiveFlowdAPI`, Swift mirrors of the pricing, money-clock, scoring, tier and QA engines, formatters and time helpers, SwiftData drafts, the upload queue and a disk cache. Feature code (`Features/**`) consumes this folder and never reaches around it. This file is the public-API index: read it before you write a view model, then open the source file it names for exact signatures.

See also `Flowd/App/FEATURE_CONTRACT.md` (the screens, their files and initialisers, the router and shell API) and `Flowd/DesignSystem/README.md` (components).

There is no Swift compiler on the Windows dev machines; the macOS CI job compiles everything here and the unit tests in `FlowdTests` cover it. Everything below was written by reading the sources, so a name here is a name in the code.

---

## 0. Rules of the road

1. **Depend on the protocol.** View models take `any FlowdAPI` (or one slice: `WalletAPI`, `BountiesAPI`, ...). Views read it with `@Environment(\.flowdAPI)` (defined in `App/Environment+Flowd.swift`; the root injects the real one, `#Preview` gets a frozen-clock mock). Never construct `MockFlowdAPI` or `LiveFlowdAPI` in a feature, never read fixture JSON directly.
2. **Isolation.** The target default isolation is nonisolated (Swift 5 language mode). Core types are plain value types (`Sendable`), `MockFlowdAPI` is an `actor`, `LiveFlowdAPI` is a `struct`, `FlowdClock` is a lock-guarded `final class`. Only these are main-actor: `DraftStore`, `FlowdHaptics`, `EarningsActivityController`, `WidgetSnapshotPublisher.publish/clear` and everything in the DesignSystem that touches UIKit. Put `@MainActor` on every view model and call Core from `async` methods; use `async let` for independent calls.
3. **Money is `Int` cents.** Rates are cents per 1,000 verified views (`cpmCents`). Format at the edge: `MoneyText` in views, `Fmt.money` in strings. Percentages are 0...1 `Double` unless the name says otherwise. IDs are `<prefix>_<slug-or-number>` strings.
4. **Time is UTC and injectable.** Never call `Date()` for product logic: read `FlowdClock.shared.now` (the demo world is **2026-10-03T14:00:00Z, a Saturday**, and ticks forward in real time). Every contract rule is UTC; show the creator's own zone with `Fmt.clockLabel`, the contract wording (`Sat 2:00 PM UTC`) with the `...UTC` variants.
5. **Errors.** Every `FlowdAPI` call throws only `FlowdAPIError`. Show `error.userMessage` (plain English, never blames the creator); offer "Try again" when `error.isRetryable`; return to sign-in when `error.requiresSignIn`. `FlowdAPIError.cancelled` is silent.
6. **Unknown enum values never crash.** Every contract enum decodes unknown strings to `.unknown`. A `switch` over a contract enum must handle `.unknown` (usually with the neutral treatment).
7. **Terminology** is fixed (bounty, creator, payout, Wallet, Studio, Hook Score, Flow Score, Flo, Daily Drop, Crews, Tournaments, Tiers Bronze to Elite). Earning states are `accruing/pending -> cleared -> paid` (+ `held`, `reversed`); the UI says "Pending" for accruing and pending together and always shows the dated ETA, never a bare "pending".
8. **No new global state.** Anything shared across screens (the signed-in creator, wellbeing mode, unread count, the bounty feed filters, the draft store) lives on `AppState` (`App/AppState.swift`), not in a singleton you invent.
9. **Previews.** `PreviewData` (fixture-backed, frozen clock) is for `#Preview` and tests only. Wrap previews in `.flowdPreviewEnvironment()` (App/) so `AppState`, `Router`, the API and the toast host are present.

---

## 1. File map

```
Core/
  Models/       Primitives.swift (ContractTone, Page, APIErrorBody)
                Enums<Area>.swift      generated: every contract enum (Identity, Bounties, Submissions, Posts, Money, Rights, Market,
                                       Growth, Trust, Content, Catalogues, Platform, Ads, Attribution)
                Entities<Area>.swift   generated: every contract entity (Identity, Bounties, Submissions, Posts, Money, Rights, Market,
                                       Growth, Trust, Content, Platform, Public, Admin, Ads, Attribution, Meta, Misc)
                ReadModels.swift       composed screen shapes (FeedItem, WalletSummary, SubmissionDetail ...)
                Requests.swift         request bodies of the mutating calls
                ModelExtensions.swift  small hand-written helpers on the generated types (Tier order, Bounty.spotsLeft ...)
  Services/     FlowdAPI.swift (the protocol, split by area)  FlowdAPIError.swift  APIClientFactory.swift  FixtureLoader.swift
                FloEngine.swift (AIProvider, MockAIProvider)
                Mock/   MockFlowdAPI (actor) + extensions per area, MockStore (fixture tables in memory)
                Live/   LiveFlowdAPI, APIClient, APIConfiguration (APIMode), TokenStore (Keychain)
  Engine/       Constants.swift (FlowdConstants) + ConstantsAccessors.swift, MoneyMath, EarningsEngine, MoneyClockEngine, SettlementEngine,
                TierEngine, ReputationEngine, StreakEngine, RightsEngine, MatchEngine, MarketEngine, ScoringEngine, HookTextEngine,
                ClipAnalyzer, QAEngine, Preflight, BriefHelpers, ScamShield, TextTools
  Persistence/  DraftModels.swift (DraftSnapshot, DraftRecord) DraftStore.swift UploadQueue.swift DiskCache.swift FlowdDirectories.swift
  Preview/      PreviewData.swift  PreviewHeroes.swift (generated)
  Utilities/    FlowdJSON  Formatters (Fmt)  FlowdCalendar  FlowdClock  WellbeingClock  StableHash  FlowdLog  DeepLink  DesignBridge
                LiveActivityBridge  WidgetSnapshotPublisher
```

Generated files (`Enums*`, `Entities*`, `PreviewHeroes`) say so in their header and are rewritten by `scripts/gen-ios-models.mjs` / `scripts/gen-ios-preview.mjs`. Do not edit them; change `packages/contract` and regenerate.

---

## 2. The service contract: `FlowdAPI`

`Services/FlowdAPI.swift`. `protocol FlowdAPI: SessionAPI, ProfileAPI, BountiesAPI, OffersAPI, SubmissionsAPI, PostsAPI, WalletAPI, CompeteAPI, InboxAPI, DemoAPI` plus `homeSummary()` and `var isDemo: Bool`. Every method is `async throws` (throws `FlowdAPIError`). Every protocol is `Sendable`. Money-moving mutations take an `idempotencyKey: String`; a repeated key returns the original result (a double tap never pays twice).

### 2.1 Methods by area

**SessionAPI**
- `signIn(_ credential: SignInCredential) -> CreatorSession` (`.demo` = Maya; `.apple(identityToken:authorizationCode:fullName:email:)` = a brand-new Bronze creator at the start of the First-Dollar Path)
- `currentSession() -> CreatorSession?` (nil = signed out)
- `signOut()`
- `world() -> World` (the manifest: `now`, `personas` creator/brand/admin ids, row `counts`)
- `health() -> HealthStatus`

**ProfileAPI**
- `me() -> Creator`, `updateProfile(_ update: ProfileUpdate) -> Creator`, `confirmAge() -> User`, `acceptCreatorAgreement(version: String)`
- `creatorProfile(handleOrId: String) -> CreatorProfile` (public storefront)
- `socialAccounts() -> [SocialAccount]`, `linkSocialAccount(_ request: LinkAccountRequest) -> SocialAccount`, `reconnectSocialAccount(id:) -> SocialAccount`, `disconnectSocialAccount(id:)`
- `reputation() -> CreatorReputation` (reliability score with reasons), `tierStatus() -> TierStatus` (progress, remaining, perks, ladder, history)
- `verifications() -> [Verification]`, `startVerification(kind: VerificationKind) -> Verification`
- `notificationPrefs() -> NotificationPrefs`, `updateNotificationPrefs(_:) -> NotificationPrefs`
- `wellbeing() -> WellbeingSettings`, `updateWellbeing(_:) -> WellbeingSettings`
- `requestDataExport()`, `deleteAccount()`
- `earningsPreview(niche: Niche) -> EarningsPreview` (typical p25/median/p75 beside a top example, plus a sample bounty)
- `firstDollarPath() -> FirstDollarPath` (scored take, submitted, approved, cleared, with ETAs; `retired` once the first dollar cleared)

**BountiesAPI**
- `feed(_ query: FeedQuery) -> Page<FeedItem>` (ranked by match; locked bounties last when included), `bountyDetail(id:) -> BountyDetail`, `payMath(bountyId:) -> PayMathBreakdown`, `brandScorecard(brandId:) -> BrandScorecardView`
- `savedBounties() -> [SavedBounty]`, `saveBounty(id:) -> BountySave`, `unsaveBounty(id:)`, `joinBounty(id:) -> BountySave` (claims: a 24-hour window to submit)
- `todayDrop() -> DailyDropView`, `dropHistory() -> [DailyDrop]`, `claimDropSpot(dropId:bountyId:idempotencyKey:) -> BountySave`

**OffersAPI**
- `offers() -> [OfferSummary]`, `offerDetail(id:) -> OfferDetail`, `acceptOffer(id:idempotencyKey:) -> Offer`, `counterOffer(id:_ request: OfferCounterRequest) -> Offer`, `declineOffer(id:) -> Offer`, `sendOfferMessage(id:body:) -> Offer`
- `rateCard() -> RateCardView`, `updateRateCard(_ update: RateCardUpdate) -> RateCardView`

**SubmissionsAPI**
- `submissions(filter: SubmissionFilter) -> [SubmissionListItem]`, `submissionDetail(id:) -> SubmissionDetail`, `videoAnalysis(submissionId:version:) -> VideoAnalysis?`
- `beginUpload(_ request: UploadRequest) -> UploadSession`, `submit(_ request: SubmitRequest) -> Submission` (creates v1, takes a Reserved Slot), `revise(submissionId:_ request: ReviseRequest) -> Submission`, `appeal(submissionId:_ request: AppealRequest) -> Dispute` (one per rejection, 7 days), `withdraw(submissionId:) -> Submission`, `resolveNote(id:) -> FeedbackNote`, `attachPost(submissionId:_ request: AttachPostRequest) -> Post` (opens the 72-hour window)

**PostsAPI**
- `posts(filter: PostFilter) -> [PostListItem]`, `postDetail(id:) -> PostDetail`, `viewLedger(postId:) -> ViewLedger`
- `openDispute(_ request: DisputeRequest) -> Dispute`, `disputes() -> [Dispute]`, `dispute(id:) -> Dispute`, `replyToDispute(id:text:evidence:) -> Dispute`, `removePost(id:) -> Post`

**WalletAPI**
- `wallet() -> WalletSummary`, `moneyClock() -> [MoneyClockRow]`, `ledger(limit: Int) -> [LedgerEntry]`, `earnings(period: EarningsPeriod) -> EarningsReport`
- `payouts() -> [Payout]`, `payoutDetail(id:) -> PayoutDetail`, `payoutPreview(amountCents: Int?) -> PayoutPreview` (fee, net and arrival before confirm; nil = everything cleared), `instantPayout(_ request: InstantPayoutRequest) -> Payout`
- `payoutMethods() -> [PayoutMethod]`, `addPayoutMethod(_:) -> PayoutMethod`, `removePayoutMethod(id:)`
- `proofs() -> [Proof]`, `createProof(_ request: ProofRequest) -> Proof`, `revokeProof(id:)`, `wrapped() -> [Wrapped]`
- `taxSummary() -> TaxSummary`, `submitW9(_ request: W9Request) -> TaxProfile`, `setTaxSetAside(rate: Double) -> TaxProfile`, `taxCSV(year: Int) -> String`
- `rights() -> RightsOverview`, `respondToRightsPermission(grantId:grant:) -> RightsGrant`, `respondToRenewal(grantId:accept:) -> RightsGrant`, `revokeRights(grantId:) -> RightsGrant`

**CompeteAPI**
- `leaderboard(scope: LeaderboardScope, metric: LeaderboardMetric, niche: Niche?) -> LeaderboardStanding`
- `tournaments() -> [TournamentView]`, `tournament(id:) -> TournamentView`, `joinTournament(id:_ request: TournamentEntryRequest) -> TournamentEntry`
- `crews() -> CrewDirectory`, `crew(id:) -> CrewView`, `createCrew(_:) -> CrewView`, `joinCrew(id:) -> CrewView`, `leaveCrew(id:)`
- `referrals() -> ReferralSummary`, `createReferralInvite(channel: String) -> Referral`
- `streak() -> StreakSummary`, `declareRestWeek() -> StreakSummary`
- `academy() -> AcademyOverview`, `lesson(slug:) -> LessonItem`, `completeLesson(slug:answers: [Int]) -> LessonResult`, `remixLibrary() -> RemixLibrary`
- `specs() -> [Spec]`, `createSpec(_:) -> Spec`, `scoreSpec(id:) -> Spec`, `withdrawSpec(id:) -> Spec`, `auctions() -> [Auction]`, `createAuction(_:) -> Auction`, `cancelAuction(id:) -> Auction`

**InboxAPI**
- `notifications(filter: ActivityFilter) -> [AppNotification]`, `markNotificationsRead(ids: [String])`
- `threads() -> [InboxThread]`, `thread(id:) -> InboxThread`, `sendMessage(threadId:body:) -> InboxThread` (in-app only; Scam Shield screens it)
- `reportScam(_ request: ScamReportRequest) -> ScamReport`, `myReports() -> [ScamReport]`
- `flo(_ request: FloRequest) -> FloSuggestion`, `floHistory() -> [FloSuggestion]`, `rateFloSuggestion(id:helpful:) -> FloSuggestion`

**DemoAPI** (mock only; the live API throws `.unsupported`)
- `advanceDemoClock(hours: Int) -> World` (1 to 840 hours; runs window close, fraud check, clearing, the Friday payout, expiries, brand decisions), `resetDemo()`, `simulateDecision(submissionId:decision: DemoDecision) -> Submission` where `DemoDecision` is `.approve`, `.requestChanges(notes: [String])`, `.reject(reason: ReasonCode, summary: String)`

**FlowdAPI itself**: `homeSummary() -> HomeSummary` (everything Home shows: creator, wallet, drop, streak, active submissions, matched bounties, trends, first-dollar tracker, unread count, next lesson, recent activity, `liveDemo`), `var isDemo: Bool`.

### 2.2 Default-argument overloads (extension on `FlowdAPI`)

`claimDropSpot(dropId:bountyId:)`, `acceptOffer(id:)`, `feed()`, `submissions()`, `posts()`, `ledger()` (200 rows), `payoutPreview()`, `notifications()`, `leaderboard()` (cohort, earnings, no niche), `videoAnalysis(submissionId:)`.

### 2.3 Factory and modes

`APIClientFactory` (`Services/APIClientFactory.swift`): `makeDefault()` (mode from launch args / environment / Info.plist), `make(mode:clock:loader:tokens:)`, `makeMock(clock:loader:persona:signedIn:autoBrandDecisions:)`, `makePreviewMock(signedIn:)` (frozen clock at the demo "now"). `APIMode` is `.mock` or `.live(APIConfiguration)`; launch args `-FlowdAPI live|demo|mock`, `-FlowdAPIURL <url>`. Switching to `.live` switches `FlowdClock.shared` to the device clock. `APIConfiguration.production` is `https://api.joinflowd.io/api/v1`; `.localDemo` is `http://localhost:3000/api/v1`. The session token lives only in the Keychain (`KeychainTokenStore`; `MemoryTokenStore` for tests).

### 2.4 Errors

`FlowdAPIError` (`Services/FlowdAPIError.swift`), `Hashable, Sendable, LocalizedError`: `validationFailed(String)`, `reasonRequired`, `notFound(String)`, `forbidden(String)`, `tierLocked(required: Tier?, message:)`, `bountyNotFunded`, `poolExhausted`, `slaNotStarted`, `revisionLimit`, `appealUsed`, `belowMinimum(minimumCents:)`, `methodMissing`, `taxInfoMissing`, `identityCheckRequired`, `idempotencyConflict`, `rateLimited(retryAfterSeconds:)`, `conflict(String)`, `unauthorized`, `offline`, `server(status:code:message:)`, `decoding(String)`, `fixture(table:detail:)`, `unsupported(String)`, `cancelled`. Members: `code` (stable snake_case), `userMessage`, `isRetryable` (offline, rateLimited, server, decoding), `requiresSignIn` (unauthorized), `static from(status:code:message:hint:)`. Money-moving blockers surface as `methodMissing`, `taxInfoMissing`, `identityCheckRequired`: route the creator to the W-9 flow, ID verification or payout methods rather than showing a dead-end alert.

---

## 3. MockFlowdAPI (the demo world)

`Services/Mock/`. An `actor`, so calls are serialised. Built from the bundled fixtures (`Resources/Fixtures`, synced from `packages/contract/fixtures`), mutated in memory, reset by `resetDemo()`. It is the default API in the simulator, previews, CI and a fresh clone.

- **Who you are.** Signed in, you are **Maya Reyes** (`cr_maya`, user `usr_maya`, handle `maya.makes`, Austin, niches lifestyle and AI tools). The fixtures put her at **Silver** (docs written earlier say Gold: the fixtures win). `signIn(.apple(...))` instead creates a fresh Bronze creator with onboarding stage `signed_up`, no history, no payout method (the start of the First-Dollar Path); a signed-out mock (`signedIn: false`) answers `currentSession()` with nil and the data calls with `.unauthorized` until `signIn` is called (the app's first run starts there; the demo and returning creators start signed in).
- **Time.** `clock: FlowdClock`, "now" = 2026-10-03T14:00:00Z ticking in real time. `advanceDemoClock(hours:)` moves it and runs the scheduled jobs in order: hourly view growth (View Ledger snapshots every 6 h inside the 72-hour window), window close at 72 h (pay settled; a flagged post is held with a named reason), the **14:00 UTC clearing run**, the **Friday 18:00 UTC weekly payout** (free), the **16:00 UTC Daily Drop** (state follows the clock), offer expiry (7 days), disputes (reply 24 h, resolution 5 days), tournaments, rights expiry alerts at 30, 14 and 7 days, ISO-week streak rollover. Jobs also run lazily on any call after 30 s of real time.
- **Brand answers.** With `autoBrandDecisions` (default), a submitted video gets the brand's decision (approve, request changes with timecoded notes, or reject with a reason code and evidence) once the brand's median decision time has passed on the demo clock; `simulateDecision` forces one now. Counters get an answer on the demo clock too. Accepting a direct offer turns it into a private, funded direct bounty.
- **Money rules enforced** (they match the web engine): Reserved Slot on submit and `poolExhausted` when none is left, per-video cap, escrow-funded gate (`bountyNotFunded`), CPA pays only `link` and `code` conversions, instant cash-out fee 1.5% (min $0.50, max $15) shown by `payoutPreview` before `instantPayout`, free instant allowance by tier (Gold x1 a week, Platinum and up unlimited, Founding free for 12 months), `belowMinimum` under $5 for an instant payout, holds with named reasons (`fraud_review`, `awaiting_tax_info`, `dispute_open`, ...) and what releases them, two included revision rounds, one appeal per rejection within 7 days, tier gates (`tierLocked`) and head-start visibility (Silver 1 h, Gold 3 h, Platinum 6 h, Elite 12 h).
- **Idempotency.** `claimDropSpot`, `submit`, `revise`, `appeal`, `attachPost`, `acceptOffer`, `counterOffer`, `instantPayout`, `reportScam` and `openDispute` remember their `idempotencyKey` for the session.
- **Ids.** New rows continue the fixture numbering (prefix plus a zero-padded number past the highest existing one: `sub_`, `post_`, `save_`, `disp_`, `ntf_`, `note_`, `flo_`, `scam_`, `ref_`, `rg_`, ...). `World.counts` lists table sizes.
- **Notifications.** Non-cash notifications raised inside the creator's quiet hours (default 22:00 to 08:00 in their zone) are batched (`batched: true`, `deliveredAt: nil`); cash events always deliver. Every notification carries `deepLink` (`flowd://...`, parse with `DeepLink.parse`).
- **Persona.** The mock is creator-scoped. Brand mode and Admin mode (`Features/BrandMode`, `Features/AdminMode`) read the same fixture tables with `FixtureLoader` through their own stores; `World.personas` names Jordan Ellis (`usr_jordan`, member `bm_lumi_jordan`, brand `br_lumi`, app `app_lumi`) and Ops (`usr_ops`).
- **Third-party integrations** (TikTok and Instagram OAuth, Stripe Connect and payout rails, ID checks, tax provider, Apple sign-in) are realistic mocks marked in code; flowd never posts for the creator.

---

## 4. Models

Everything is `Codable, Hashable, Sendable`; ids are `String`; decoding is snake_case with tolerant ISO-8601 (`FlowdJSON.makeDecoder()`). Identifiable read-models derive `id` from their primary child (`FeedItem.id == bounty.id`, `SubmissionListItem.id == submission.id`, `PostListItem.id == post.id`, `SavedBounty.id == save.id`, `LeaderboardRow.id == creator.id`, ...). `ArtSeed` (DesignSystem) is the generated-art descriptor every entity uses for avatars, logos, thumbnails and covers (no remote images exist).

`Page<Element>`: `data: [Element]`, `nextCursor: String?`, `total: Int?`, `isEmpty`, `Page.single(_:)`. `ContractTone` (`neutral accent violet info mint ember sun rose`) is what `.tone` returns on every enum; map it to a design-system tone with `.flowdTone` (`Utilities/DesignBridge.swift`).

### 4.1 Read-models and requests (what the screens consume and send)

Composed in `ReadModels.swift` and `Requests.swift`; every one is `Codable, Hashable, Sendable`. A screen needs one call, not N. Request structs encode with `FlowdJSON.makeAPIEncoder()` and carry an `idempotencyKey: String` (default `UUID().uuidString`) when the call moves money or creates a settlement artefact.

**`ReadModels.swift`**

- `enum SignInCredential`: demo, apple
- `CreatorSession` (5): user: User, creator: Creator, token: String?, isDemo: Bool, now: Date
- `HealthStatus` (2): ok: Bool, now: Date
- `BrandCard` (11): id: String, name: String, logo: ArtSeed, kind: BrandKind, verification: VerificationStatus, reliabilityScore: Int?, band: BrandBand?, decisionHoursMedian: Double?, decidesInLabel: String?, badges: [BrandBadge], fundedAlways: Bool
- `CreatorSummary` (7): id: String, handle: String, displayName: String, avatar: ArtSeed, tier: Tier, founding: Bool, niches: [Niche]
- `ExpectedPay` (10): p25Cents: Int, medianCents: Int, p75Cents: Int, medianViews: Int, cpmPartCents: Int, cpaPartCents: Int, flatFeeCents: Int, capped: Bool, basis: String, disclaimer: String
- `WalletHold` (4): reason: MoneyClockReason, cents: Int, rows: Int, nextStep: String
- `enum PayoutBlocker`: taxInfo, identity, payoutMethod
- `WalletSummary` (17): asOf: Date, tier: Tier, accruingCents: Int, pendingCents: Int, clearedCents: Int, heldCents: Int, paidOutCents: Int, lifetimeClearedCents: Int, nextClearsAt: Date?, nextClearsCents: Int, nextPayoutAt: Date, nextPayoutCents: Int, holds: [WalletHold], blockers: [PayoutBlocker], payoutMethod: PayoutMethod?, instantPreview: PayoutPreview?, freeInstantUsedThisWeek: Int
- `PayoutPreview` (14): amountCents: Int, clearedCents: Int, ok: Bool, feeCents: Int, netCents: Int, listFeeCents: Int, freeInstant: Bool, freeReason: String?, summary: String, refusal: InstantRefusal?, blockers: [PayoutBlocker], methodLabel: String?, arrivesAtEstimate: Date, nextWeeklyPayoutAt: Date
- `PayoutDetail` (4): payout: Payout, rows: [MoneyClockRow], proof: Proof?, arrivesAt: Date?
- `enum EarningsPeriod`: day, week, month
- `EarningsBucket` (5): label: String, start: Date, earnedCents: Int, clearedCents: Int, pendingCents: Int
- `EarningsBreakdownRow` (6): id: String, title: String, subtitle: String?, art: ArtSeed?, cents: Int, posts: Int
- `EarningsReport` (14): period: EarningsPeriod, from: Date, to: Date, buckets: [EarningsBucket], grossCents: Int, feesCents: Int, netCents: Int, clearedCents: Int, pendingCents: Int, paidCents: Int, byBounty: [EarningsBreakdownRow], byBrand: [EarningsBreakdownRow], typical: TypicalBand?, disclaimer: String
- `FeedLock` (2): gates: [MatchGate], reasons: [String]
- `FeedItem` (18): bounty: Bounty, brand: BrandCard, appName: String, appIcon: ArtSeed, matchScore: Int?, isTopPick: Bool, reasons: [String], locked: Bool, lockReasons: [String], gateFailures: [MatchGate], visibleAt: Date, expectedPay: ExpectedPay, spotsLeft: Int, saved: Bool, joined: Bool, claimedUntil: Date?, submissionId: String?, decidesInLabel: String?
- `enum FeedSort`: match, pay, endingSoon, newest
- `FeedQuery` (11): search: String?, types: [BountyType], platforms: [Platform], niches: [Niche], organicOnly: Bool, minCpmCents: Int?, includeLocked: Bool, savedOnly: Bool, sort: FeedSort, cursor: String?, limit: Int
- `BountyCreatorState` (6): saved: Bool, joined: Bool, claimedUntil: Date?, claimedFromDrop: Bool, submissionId: String?, submissionStatus: SubmissionStatus?
- `BountyDetail` (10): item: FeedItem, app: BrandApp, scorecard: BrandScorecard?, typicalEarnings: TypicalBand?, topExampleCents: Int?, tldr: BriefTLDR, rightsLines: [RightsLine], state: BountyCreatorState, examplePosts: [Post], scamCues: [String]
- `PayMathBreakdown` (10): bountyId: String, expected: ExpectedPay, bountyPayMath: PayMath, perVideoCapCents: Int, rates: [String], typical: TypicalBand?, topExampleCents: Int?, typicalVsTopLine: String?, assumptions: [String], disclaimer: String
- `BrandScorecardView` (7): brand: BrandCard, scorecard: BrandScorecard?, isNew: Bool, sampleLabel: String, trendLabel: String?, components: [ReliabilityComponent], recentBounties: [FeedItem]
- `SavedBounty` (2): save: BountySave, item: FeedItem
- `DropItemView` (4): item: FeedItem, spotsTotal: Int, spotsLeft: Int, claimedByMe: Bool
- `DailyDropView` (7): drop: DailyDrop, state: DropStatus, items: [DropItemView], releaseAt: Date, claimWindowEndsAt: Date, nextDropAt: Date, headStartNote: String?
- `enum FirstDollarStepKind`: scoredTake, submitted, approved, cleared
- `FirstDollarStep` (5): kind: FirstDollarStepKind, title: String, detail: String, done: Bool, etaAt: Date?
- `FirstDollarPath` (5): steps: [FirstDollarStep], starter: FeedItem?, clearedByEstimate: Date?, retired: Bool, note: String
- `EarningsPreview` (5): niche: Niche, typical: TypicalBand, topExampleCents: Int, sample: FeedItem?, footnote: String
- `SubmissionListItem` (7): submission: Submission, bountyTitle: String, brand: BrandCard, thumb: ArtSeed, clock: ReviewClock?, statusLine: String, openNotes: Int
- `SubmissionDetail` (17): submission: Submission, bounty: Bounty, brand: BrandCard, notes: [FeedbackNote], analysis: VideoAnalysis?, post: Post?, link: AttributionLink?, offerCode: OfferCode?, clock: ReviewClock?, roundsLeft: Int, canRevise: Bool, canAppeal: Bool, canWithdraw: Bool, canPost: Bool, appealDeadline: Date?, captionDraft: String?, trackingLine: String?
- `enum SubmissionFilter`: all, inReview, needsChanges, approved, rejected, posted, closed
- `UploadSession` (5): uploadId: String, assetId: String, uploadUrl: String?, chunkSizeBytes: Int, expiresAt: Date
- `PostListItem` (12): post: Post, bountyTitle: String, brand: BrandCard, appName: String, earningsCents: Int, pendingCents: Int, clearedCents: Int, paidCents: Int, heldCents: Int, moneyState: MoneyClockState, clearsAt: Date?, reasonLabel: String
- `enum PostFilter`: all, live, clearing, cleared, paid, held
- `PostDetail` (13): post: Post, bounty: Bounty, brand: BrandCard, appName: String, moneyRows: [MoneyClockRow], conversions: [Conversion], link: AttributionLink?, rights: [RightsGrant], disputes: [Dispute], timeline: [TimelineStep], clock: EarningDescription?, capProgress: Double, canDispute: Bool
- `TrafficShare` (2): source: String, share: Double
- `ViewLedger` (9): post: Post, snapshots: [ViewSnapshot], verifiedViews: Int, invalidViews: Int, reportedViews: Int, exclusions: [ViewExclusion], sourceSplit: [TrafficShare], disputes: [Dispute], canDispute: Bool
- `TierLadderRow` (6): tier: Tier, thresholds: TierThresholds, perks: TierPerks, perkLines: [String], isCurrent: Bool, isReached: Bool
- `TierStatus` (14): current: Tier, basis: TierBasis, since: Date, holdUntil: Date?, graceDaysLeft: Int?, progress: TierProgress, remaining: [TierRemaining], perks: TierPerks, perkLines: [String], unlocksNext: [String], ladder: [TierLadderRow], history: [TierEvent], stats: TierStatsSnapshot, graceNote: String
- `OfferSummary` (6): offer: Offer, brand: BrandCard, appName: String, appIcon: ArtSeed, awaitingMe: Bool, expiresLabel: String
- `OfferDetail` (9): summary: OfferSummary, scorecard: BrandScorecard?, rightsLines: [RightsLine], payContext: ExpectedPay?, counterRoundsLeft: Int, canAccept: Bool, canCounter: Bool, canDecline: Bool, marketBand: RateSuggestion?
- `RateCardView` (6): card: RateCard?, tier: Tier, unlocked: Bool, lockText: String?, suggested: RateSuggestion?, storefrontURL: String
- `RightsItem` (7): grant: RightsGrant, brand: BrandCard, postTitle: String, thumb: ArtSeed?, daysLeft: Double?, statusLabel: String, renewal: RenewalQuote?
- `RightsOverview` (3): items: [RightsItem], alertsDue: [RightsAlert], renewalExposureCents: Int
- `RightsAlert` (2): grantId: String, days: Int
- `TaxSummary` (6): profile: TaxProfile, docs: [TaxDoc], numbers: TaxDeskNumbers, w9Needed: Bool, nextStep: String?, disclaimer: String
- `InboxThread` (6): thread: ChatThread, counterpart: String, counterpartArt: ArtSeed?, preview: String, unread: Int, kindLabel: String
- `enum ActivityFilter`: all, money, reviews, offers, tier
- `LeaderboardRow` (3): entry: LeaderboardEntry, creator: CreatorSummary, isMe: Bool
- `LeaderboardStanding` (6): leaderboard: Leaderboard, rows: [LeaderboardRow], me: LeaderboardRow?, resetsAt: Date, unranked: Bool, optedOut: Bool
- `TournamentEntryRow` (3): entry: TournamentEntry, creator: CreatorSummary, isMe: Bool
- `TournamentView` (5): tournament: Tournament, myEntry: TournamentEntry?, canEnter: Bool, lockReason: String?, entries: [TournamentEntryRow]
- `CrewMemberRow` (3): member: CrewMember, creator: CreatorSummary, isMe: Bool
- `CrewView` (6): crew: Crew, members: [CrewMemberRow], isMine: Bool, myRole: CrewRole?, goalProgress: Double, bonusNote: String
- `CrewDirectory` (4): mine: CrewView?, discover: [CrewView], canCreate: Bool, createLockText: String?
- `ReferralSummary` (6): code: String, link: String, referrals: [Referral], joinedCount: Int, earnedCents: Int, rules: [String]
- `StreakSummary` (5): streak: Streak, copy: StreakCopy, restWeeksRemainingThisQuarter: Int, canDeclareRestWeek: Bool, restWeekReason: String?
- `LessonItem` (2): lesson: Lesson, progress: LessonProgress?
- `BadgeItem` (3): badge: BadgeId, earned: Bool, criteria: String
- `AcademyOverview` (5): lessons: [LessonItem], completedCount: Int, badges: [BadgeItem], reliabilityBonusPoints: Double, nextLesson: Lesson?
- `LessonResult` (6): lesson: Lesson, progress: LessonProgress, correct: [Bool], score: Double, passed: Bool, badgeAwarded: Bool
- `RemixLibrary` (3): formats: [Format], hooks: [Hook], trends: [Trend]
- `CreatorProfile` (6): creator: Creator, accounts: [SocialAccount], featuredPosts: [Post], rateCard: RateCard?, shareURL: String, typicalMedianCents: Int?
- `PreflightCheck` (7): check: QaCheckType, result: QaResult, title: String, message: String, blocking: Bool, fix: String?, evidence: Evidence?
- `PreflightResult` (5): checks: [PreflightCheck], canSubmit: Bool, blockingCount: Int, warningCount: Int, captionDraft: String
- `FloRequest` (8): surface: FloSurface, kind: FloKind, prompt: String, contextKind: String?, contextId: String?, bountyId: String?, formatId: FormatId?, hookText: String?
- `HomeSummary` (12): creator: Creator, wallet: WalletSummary, drop: DailyDropView?, streak: StreakSummary, activeSubmissions: [SubmissionListItem], matched: [FeedItem], trends: [Trend], firstDollar: FirstDollarPath?, unreadCount: Int, nextLesson: Lesson?, recentActivity: [AppNotification], liveDemo: Bool

**`Requests.swift`**

- `ProfileUpdate` (10): displayName: String?, handle: String?, bio: String?, niches: [Niche]?, country: Country?, languages: [String]?, storefront: Storefront?, portfolio: [PortfolioItem]?, openToOffers: Bool?, onboardingStage: OnboardingStage?
- `LinkAccountRequest` (2): platform: Platform, handle: String
- `SubmitRequest` (17): bountyId: String, title: String, formatId: FormatId?, source: SubmissionSource, video: VideoMeta, hookText: String?, hookBand: ScoreBand, hookPoints: Int, flowBand: ScoreBand, flowPoints: Int, qaPass: Int, qaWarn: Int, qaFail: Int, rightsAccepted: Bool, caption: String?, dropId: String?, idempotencyKey: String
- `ReviseRequest` (11): video: VideoMeta, hookBand: ScoreBand, hookPoints: Int, flowBand: ScoreBand, flowPoints: Int, qaPass: Int, qaWarn: Int, qaFail: Int, changesSummary: String?, resolvedNoteIds: [String], idempotencyKey: String
- `AppealRequest` (4): reason: String, note: String?, evidence: [Evidence], idempotencyKey: String
- `AttachPostRequest` (5): url: String, platform: Platform, socialAccountId: String?, caption: String?, idempotencyKey: String
- `UploadRequest` (6): fileName: String, sizeBytes: Int, durationMs: Int, width: Int, height: Int, contentType: String
- `DisputeRequest` (8): postId: String, kind: DisputeKind, rangeFrom: Date?, rangeTo: Date?, reason: String, note: String, evidence: [Evidence], idempotencyKey: String
- `InstantPayoutRequest` (3): amountCents: Int, methodId: String?, idempotencyKey: String
- `AddPayoutMethodRequest` (3): kind: PayoutMethodKind, label: String, last4: String
- `W9Request` (6): form: TaxForm, legalName: String, entityType: TaxEntityType, tinLast4: String, address: Address, signedName: String
- `ProofRequest` (8): kind: ProofKind, payoutId: String?, periodLabel: String, periodStart: String, periodEnd: String, amountCents: Int, postsCount: Int, anonymous: Bool
- `OfferCounterRequest` (4): amountCents: Int, rightsDays: Int?, message: String?, idempotencyKey: String
- `RateCardUpdate` (10): pricePerVideoCents: Int, minCpmCents: Int, paidUsageDays: Int, turnaroundDays: Int, maxVideosPerMonth: Int, platforms: [Platform], formatIds: [FormatId], categoriesExcluded: [AppCategory], acceptsDirectOffers: Bool, packages: [RatePackage]
- `ScamReportRequest` (6): targetKind: ReportTargetKind, targetId: String, reason: ScamReason, description: String, evidenceRefs: [String], idempotencyKey: String
- `TournamentEntryRequest` (2): hookText: String, submissionId: String?
- `CreateCrewRequest` (4): name: String, tagline: String, niche: Niche, isOpen: Bool
- `CreateSpecRequest` (10): title: String, description: String, video: VideoMeta, formatId: FormatId?, hookText: String, hookType: HookType, category: AppCategory, priceCents: Int, paidAdsDays: Int, exclusive: Bool
- `CreateAuctionRequest` (6): title: String, description: String, slots: Int, reserveCents: Int, opensAt: Date, closesAt: Date
### 4.2 Entities (one line each: name, then stored fields with types)

Every entity is `struct X: Codable, Hashable, Sendable` (most are `Identifiable`); fields are `var`, names are the camelCase of the contract snake_case key (`created_at` is `createdAt`, `cpm_cents` is `cpmCents`). `...Cents` is `Int` cents, `...At` is `Date`, `...Id` / `...Ids` are `String` / `[String]`. Nested structs and enums have the field's type name and live in the file named in the heading.

**`EntitiesAdmin.swift`**

- `AdminMetrics` (8): asOf: Date, targets: [MetricTarget], marketHealth: MarketHealth, queues: QueueCounts, nextPayoutRun: NextPayoutRun, summary: AdminSummary, promiseMetrics: [PromiseMetric], alerts: [String]
- `MetricTarget` (9): id: String, label: String, target: Double, targetMax: Double?, op: String, unit: String, actual: Double, status: MetricStatus, series: [ChartPoint]
- `PromiseMetric` (8): number: Int, key: String, label: String, value: Double, unit: String, display: String, target: Double?, note: String
- `MarketHealth` (9): fillRate48h: Double, medianFillHours: Double, medianDecisionHours: Double, decidedInSlaRatio: Double, clearedOnEtaRatio: Double, disputesResolved48hRatio: Double, fundedLiveRatio: Double, firstDollarMedianHours: Double, activeCreatorsPerLiveBounty: Double
- `QueueCounts` (7): fraudOpen: Int, disputesOpen: Int, verificationOpen: Int, safetyNew: Int, slaStale: Int, slaBreached: Int, payoutsHeld: Int
- `NextPayoutRun` (6): runId: String, scheduledFor: Date, creators: Int, totalCents: Int, holds: Int, heldCents: Int
- `AdminSummary` (6): gmv30dCents: Int, fees30dCents: Int, paidTotalCents: Int, activeCreators30d: Int, liveBounties: Int, brandsActive30d: Int

**`EntitiesAds.swift`**

- `Ad` (32): id: String, postId: String, brandId: String, appId: String, bountyId: String, creatorId: String, platform: AdPlatform, kind: AdKind, status: AdStatus, externalAdId: String?, sparkCode: String?, codeDurationDays: Int?, codeExpiresAt: Date?, permissionRequestedAt: Date, permissionGrantedAt: Date?, startedAt: Date?, endedAt: Date?, dailyBudgetCents: Int, spendCents: Int, impressions: Int, clicks: Int, installs: Int, trials: Int, paid: Int, revenueCents: Int, commissionRate: Double, commissionWindowEndsAt: Date?, commissionCents: Int, platformFeeCents: Int, daily: [AdDaily], fatigue: FatigueInfo?, rightsEndsAt: Date?
- `AdDaily` (8): date: String, spendCents: Int, impressions: Int, clicks: Int, installs: Int, trials: Int, paid: Int, revenueCents: Int
- `FatigueInfo` (4): peakTrialRate: Double, currentTrialRate: Double, dropRatio: Double, flaggedAt: Date?

**`EntitiesAttribution.swift`**

- `Conversion` (20): id: String, postId: String, linkId: String, appId: String, bountyId: String, creatorId: String, kind: ConversionKind, source: ConversionSource, confidence: ConversionConfidence, quantity: Int, occurredOn: String, firstAt: Date, revenueCents: Int, country: Country?, status: ConversionStatus, payable: Bool, capped: Bool, clearedAt: Date?, ledgerTxnId: String?, rejectReason: String?
- `AttributionLink` (16): id: String, creatorId: String, bountyId: String, appId: String, postId: String?, code: String, shortUrl: String, deepLink: String, promoCode: String?, status: AttributionLinkStatus, createdAt: Date, clicks: Int, installs: Int, trials: Int, paid: Int, lastClickAt: Date?
- `RevenueCatEvent` (20): id: String, appId: String, eventType: RcEventType, periodType: PeriodType, appUserId: String, productId: String, priceCents: Int, currency: String, isTrialConversion: Bool, offerCode: String?, subscriberAttributes: [String: String], environment: String, purchasedAt: Date, expirationAt: Date?, receivedAt: Date, matchStatus: RcMatchStatus, matchedConversionId: String?, matchedLinkId: String?, matchedCreatorId: String?, idempotencyKey: String
- `OfferCode` (16): id: String, appId: String, sku: String, offerName: String, code: String, status: OfferCodeStatus, assignedCreatorId: String?, assignedBountyId: String?, assignedLinkId: String?, assignedAt: Date?, redemptions: Int, maxRedemptions: Int, validFrom: Date, validUntil: Date, rotationDueAt: Date?, createdAt: Date

**`EntitiesBounties.swift`**

- `Bounty` (56): id: String, appId: String, brandId: String, ownerMemberId: String?, createdByMemberId: String?, title: String, type: BountyType, status: BountyStatus, visibility: BountyVisibility, fundingSource: FundingSource, isFirstBounty: Bool, isStarter: Bool, featured: Bool, featuredUntil: Date?, cpmCents: Int, cpaInstallCents: Int, cpaTrialCents: Int, cpaPaidCents: Int, flatFeeCents: Int, adCommissionRate: Double, perVideoCapCents: Int, perCreatorCapCents: Int?, budgetCents: Int, takeRate: Double, feeReserveCents: Int, escrowFundedCents: Int, matchedCents: Int, funded: Bool, fundedAt: Date?, reservedCents: Int, spentCents: Int, remainingCents: Int, refundedCents: Int, brief: Brief, rightsCard: RightsCard, deliverables: Deliverables, eligibility: Eligibility, briefLint: BriefLint, lintOverrides: [LintOverride]?, payMath: PayMath, formatIds: [FormatId], art: ArtSeed, startsAt: Date, endsAt: Date, publishedAt: Date?, firstSubmissionAt: Date?, filledAt: Date?, timeToFillHours: Double?, endedAt: Date?, settledAt: Date?, reviewSlaHours: Int, counts: BountyCounts, funnel: FunnelCounts, allInCpmCents: Int, createdAt: Date, updatedAt: Date
- `BriefBeat` (4): beat: BeatId, label: String, required: Bool, hint: String?
- `Brief` (14): summary: String, talkingPoints: [String], dos: [String], donts: [String], beats: [BriefBeat], cta: String, offerLine: String?, hashtags: [String], mentions: [String], tone: String, disclosureText: String, bannedClaims: [String], examplePostIds: [String]?, referenceArt: [ArtSeed]?
- `RightsCard` (9): organic: Bool, paidAdsDays: Int, adPlatforms: [AdPlatform], whitelisting: Bool, renewalPctPer30d: Double, exclusivityDays: Int, aiLikeness: Bool, territory: String, summary: String
- `Deliverables` (9): videosPerCreator: Int, minDurationS: Int, maxDurationS: Int, aspect: String, platforms: [Platform], regions: [Country], requireFace: Bool, musicPolicy: MusicPolicy, aiPolicy: AiContentPolicy
- `Eligibility` (6): minTier: Tier?, minFollowers: Int?, countries: [Country], niches: [Niche], minUsAudienceRatio: Double?, burnerAccountsAllowed: Bool
- `BriefLintIssue` (4): code: BriefLintCode, severity: LintSeverity, message: String, field: String?
- `BriefLint` (3): passed: Bool, checkedAt: Date, issues: [BriefLintIssue]
- `PayMath` (9): expectedViewsP25: Int, expectedViewsMedian: Int, expectedViewsP75: Int, p25Cents: Int, medianCents: Int, p75Cents: Int, creatorCpmCents: Int, allInCpmCents: Int, basis: String
- `BountyCounts` (7): creators: Int, submissions: Int, inReview: Int, approved: Int, rejected: Int, posts: Int, livePosts: Int
- `FunnelCounts` (8): views: Int, clicks: Int, installs: Int, trials: Int, paid: Int, estInstalls: Int, estTrials: Int, estPaid: Int
- `LintOverride` (4): code: BriefLintCode, byUserId: String, reason: String, at: Date

**`EntitiesContent.swift`**

- `Format` (19): id: String, name: String, summary: String, rank: Int, mvp: Bool, beats: [FormatBeat], minDurationS: Int, maxDurationS: Int, difficulty: Difficulty, faceless: Bool, bestForCategories: [AppCategory], bestForNiches: [Niche], hookTypes: [HookType], recommendedCta: [CtaType], exampleScript: String, shotList: [String], whyItWorks: String, stats: FormatStats, art: ArtSeed
- `Hook` (8): id: String, hookType: HookType, template: String, fillSlots: [String], appliesTo: [FormatId], examples: [HookExample], whenToUse: String, stats: HookStats
- `FormatBeat` (6): beat: BeatId, label: String, tStartS: Double, tEndS: Double, required: Bool, tip: String
- `CategoryRate` (2): category: AppCategory, value: Double
- `FormatStats` (5): settledPosts: Int, medianViews: Int, trialRate: Double, approvalRate: Double, trialRateByCategory: [CategoryRate]
- `HookStats` (4): uses: Int, medianViews: Int, trialRate: Double, avgHookScore: Int
- `HookExample` (2): category: AppCategory, text: String

**`EntitiesGrowth.swift`**

- `DailyDrop` (11): id: String, date: String, releaseAt: Date, claimWindowEndsAt: Date, status: DropStatus, headline: String, items: [DropItem], spotsTotal: Int, spotsLeft: Int, claimsTotal: Int, createdAt: Date
- `Tournament` (23): id: String, title: String, tagline: String, description: String, status: TournamentStatus, format: TournamentFormat, art: ArtSeed, sponsorBrandId: String?, sponsorLabel: String, prizePoolCents: Int, prizes: [Prize], rounds: [TournamentRound], rules: [String], minTier: Tier?, niche: Niche?, bountyId: String?, entriesCount: Int, announcedAt: Date, entriesOpenAt: Date, startsAt: Date, endsAt: Date, winnerCreatorIds: [String]?, createdAt: Date
- `TournamentEntry` (15): id: String, tournamentId: String, creatorId: String, status: EntryStatus, hookText: String, submissionId: String?, thumb: ArtSeed, hookPoints: Int, hookBand: ScoreBand, seed: Int, roundReached: Int, placement: Int?, prizeCents: Int?, enteredAt: Date, updatedAt: Date
- `Crew` (15): id: String, name: String, tagline: String, art: ArtSeed, niche: Niche, leadCreatorId: String, memberCount: Int, open: Bool, inviteCode: String, weeklyGoalCents: Int, weekClearedCents: Int, weekRank: Int, bonusEarnedTotalCents: Int, lifetimeClearedCents: Int, createdAt: Date
- `CrewMember` (7): id: String, crewId: String, creatorId: String, role: CrewRole, joinedAt: Date, weekClearedCents: Int, lifetimeClearedCents: Int
- `Streak` (16): id: String, creatorId: String, status: StreakStatus, currentWeeks: Int, bestWeeks: Int, freezesBanked: Int, freezesEarnedTotal: Int, freezesUsedTotal: Int, restWeeksUsedQuarter: Int, isoWeek: String, postsThisWeek: Int, postedThisWeek: Bool, weekEndsAt: Date, nextFreezeInWeeks: Int, history: [WeekRecord], updatedAt: Date
- `Leaderboard` (13): id: String, scope: LeaderboardScope, isoWeek: String, weekStartsAt: Date, resetAt: Date, metric: LeaderboardMetric, tier: Tier?, niche: Niche?, label: String, cohortSize: Int, promotionZoneSize: Int, entries: [LeaderboardEntry], updatedAt: Date
- `Referral` (19): id: String, kind: ReferralKind, status: ReferralStatus, code: String, referrerCreatorId: String?, referrerBrandId: String?, refereeCreatorId: String?, refereeBrandId: String?, refereeLabel: String, channel: String, invitedAt: Date, joinedAt: Date?, firstDollarAt: Date?, rewardWindowEndsAt: Date?, rewardRate: Double, rewardCapCents: Int, rewardEarnedCents: Int, createdAt: Date, updatedAt: Date
- `Lesson` (15): id: String, slug: String, topic: LessonTopic, order: Int, title: String, summary: String, readMinutes: Int, blocks: [LessonBlock], quiz: [QuizQuestion], badgeLabel: String, badgeArt: ArtSeed, reliabilityBonusPoints: Double, completions: Int, avgQuizScore: Double, updatedAt: Date
- `LessonProgress` (8): id: String, creatorId: String, lessonId: String, status: LessonStatus, quizScore: Double?, startedAt: Date?, completedAt: Date?, badgeAwarded: Bool
- `Trend` (17): id: String, kind: TrendKind, label: String, description: String, whyItWorks: String, direction: TrendDirection, weeklyChangeRatio: Double, sparkline: [Double], formatId: FormatId?, hookType: HookType?, categories: [AppCategory], niches: [Niche], samplePosts: Int, soundLicensedForAds: Bool?, art: ArtSeed, firstSeenAt: Date, updatedAt: Date
- `Wrapped` (20): id: String, creatorId: String, period: WrappedPeriod, label: String, periodStart: String, periodEnd: String, totalClearedCents: Int, viewsTotal: Int, postsCount: Int, trialsTotal: Int, bestPostId: String?, bestHookText: String?, bestHookType: HookType?, topBrandId: String?, streakWeeks: Int, tier: Tier, tierMedianCents: Int, cards: [WrappedCard], proofId: String?, createdAt: Date
- `Proof` (20): id: String, kind: ProofKind, creatorId: String, handle: String, anonymous: Bool, payoutId: String?, periodLabel: String, periodStart: String, periodEnd: String, amountCents: Int, tier: Tier, postsCount: Int, typicalMedianCents: Int, typicalP25Cents: Int, typicalP75Cents: Int, ledgerHash: String, art: ArtSeed, revoked: Bool, pageViews: Int, createdAt: Date
- `BountySave` (9): id: String, creatorId: String, bountyId: String, stage: SaveStage, savedAt: Date, claimedUntil: Date?, dropId: String?, submissionId: String?, updatedAt: Date
- `WeekRecord` (3): isoWeek: String, outcome: WeekOutcome, posts: Int
- `DropItem` (4): bountyId: String, spotsTotal: Int, spotsLeft: Int, claims: [DropClaim]
- `DropClaim` (2): creatorId: String, claimedAt: Date
- `Prize` (3): place: Int, amountCents: Int, label: String?
- `LeaderboardEntry` (5): creatorId: String, rank: Int, value: Double, deltaRank: Int, zone: LeaderboardZone
- `QuizQuestion` (4): prompt: String, options: [String], answerIndex: Int, explanation: String
- `LessonBlock` (3): kind: LessonBlockKind, title: String?, body: String
- `Matchup` (7): id: String, entryAId: String, entryBId: String, winnerEntryId: String?, scoreA: Double?, scoreB: Double?, metric: String
- `TournamentRound` (5): round: Int, name: String, startsAt: Date, endsAt: Date, matchups: [Matchup]
- `WrappedCard` (5): kind: WrappedCardKind, title: String, figure: String?, caption: String, art: ArtSeed

**`EntitiesIdentity.swift`**

- `User` (13): id: String, role: Role, email: String, displayName: String, avatar: ArtSeed, authProviders: [AuthProvider], status: UserStatus, ageVerified: Bool, locale: String, timezone: String, createdAt: Date, lastSeenAt: Date?, title: String?
- `Creator` (40): id: String, userId: String, handle: String, displayName: String, bio: String, avatar: ArtSeed, niches: [Niche], country: Country, languages: [String], tier: Tier, tierBasis: TierBasis, tierSince: Date, tierHoldUntil: Date?, tierReview: TierReview?, lifetimeClearedCents: Int, approvedCount: Int, decidedCount: Int, approvalRate: Double, reliabilityScore: Int, postsCount: Int, livePostsCount: Int, firstDollarAt: Date?, joinedAt: Date, lastActiveAt: Date, founding: Bool, foundingPerksUntil: Date?, badges: [BadgeId], verificationStatus: VerificationStatus, onboardingStage: OnboardingStage, payoutReady: Bool, payoutMethod: PayoutMethod?, stripeAccountId: String?, referralCode: String, referredByCreatorId: String?, streakWeeks: Int, carryOver: CarryOver?, storefront: Storefront, portfolio: [PortfolioItem], openToOffers: Bool, pausedUntil: Date?
- `SocialAccount` (16): id: String, creatorId: String, platform: Platform, handle: String, followers: Int, avgViews28d: Int, medianViews28d: Int, engagementRate: Double, usAudienceRatio: Double, status: LinkStatus, verifiedByPlatform: Bool, primary: Bool, accountCreatedAt: Date, connectedAt: Date, lastSyncedAt: Date, health: AccountHealth
- `RateCard` (17): id: String, creatorId: String, status: RateCardStatus, pricePerVideoCents: Int, minCpmCents: Int, paidUsageDays: Int, paidUsagePctPer30d: Double, turnaroundDays: Int, maxVideosPerMonth: Int, platforms: [Platform], formatIds: [FormatId], categoriesExcluded: [AppCategory], acceptsDirectOffers: Bool, suggested: RateSuggestion?, packages: [RatePackage], stats: RateCardStats, updatedAt: Date
- `Brand` (22): id: String, kind: BrandKind, name: String, slug: String, tagline: String, logo: ArtSeed, website: String, country: Country, plan: Plan, planRenewsAt: Date?, verification: VerificationStatus, createdAt: Date, agencyId: String?, firstBountyWaiverUsed: Bool, matchedBudgetUsedCents: Int, walletBalanceCents: Int, autoTopUp: AutoTopUp?, billing: BillingProfile, timeoutPolicy: TimeoutPolicy, reviewSlaHours: Int, complianceDefaults: ComplianceDefaults, referralPartnerBrandId: String?
- `BrandMember` (9): id: String, brandId: String, userId: String, role: BrandMemberRole, status: MemberStatus, invitedByMemberId: String?, approvalLinkCode: String?, joinedAt: Date, lastActiveAt: Date?
- `BrandApp` (21): id: String, brandId: String, name: String, tagline: String, category: AppCategory, icon: ArtSeed, brandColors: BrandColors, features: [String], appStoreId: String, bundleId: String, storeUrl: String, pricing: AppPricing, avgFirstPaymentCents: Int, rating: Double, ratingCount: Int, status: AppStatus, connectedAt: Date, revenuecatProjectId: String?, mmp: MmpKind, sdkStatus: SdkStatus, defaultHashtags: [String]
- `TierEvent` (9): id: String, creatorId: String, kind: TierEventKind, fromTier: Tier?, toTier: Tier, basis: TierBasis, at: Date, stats: TierStatsSnapshot, note: String
- `WellbeingSettings` (11): id: String, creatorId: String, enabled: Bool, quietHours: QuietHours, numbersOff: NumbersOff, paceGoal: PaceGoal, pausedUntil: Date?, restWeeks: [String], leaderboardOptOut: Bool, slackMode: Bool, updatedAt: Date
- `NotificationPrefs` (9): id: String, userId: String, push: Bool, emailDigest: Bool, categories: [String: Bool], quietHours: QuietHours, batchNonCash: Bool, dropReminder: Bool, updatedAt: Date
- `Address` (6): line1: String, line2: String?, city: String, region: String, postalCode: String, country: Country
- `PaymentMethod` (4): kind: PaymentKind, label: String, last4: String, exp: String?
- `PayoutMethod` (7): id: String, kind: PayoutMethodKind, label: String, last4: String, status: PayoutMethodStatus, instantCapable: Bool, verifiedAt: Date?
- `AutoTopUp` (3): enabled: Bool, thresholdCents: Int, amountCents: Int
- `BillingProfile` (7): legalName: String, billingEmail: String, paymentMethod: PaymentMethod?, vatId: String?, poRequired: Bool, costCenter: String?, address: Address?
- `ComplianceDefaults` (5): disclosureText: String, bannedClaims: [String], competitorNames: [String], musicPolicy: MusicPolicy, aiPolicy: AiContentPolicy
- `Storefront` (7): slug: String, headline: String, about: String?, featuredPostIds: [String], showStats: Bool, ctaLabel: String, theme: StorefrontTheme
- `PortfolioItem` (5): title: String, art: ArtSeed, durationS: Int, platform: Platform, views: Int?
- `CarryOver` (6): source: String, clearedCents: Int, approvedCount: Int, decidedCount: Int, verifiedByUserId: String, verifiedAt: Date
- `TierReview` (4): status: String, reviewerUserId: String, reviewedAt: Date, note: String?
- `AccountHealth` (5): score: Int, status: AccountHealthStatus, strikes: Int, unoriginalFlags: Int, notes: [String]
- `RateSuggestion` (6): priceCents: Int, lowCents: Int, highCents: Int, basis: String, confidence: Double, computedAt: Date
- `RatePackage` (3): label: String, videos: Int, pricePerVideoCents: Int
- `RateCardStats` (3): offersReceived: Int, accepted: Int, medianResponseHours: Double
- `AppPricing` (4): weeklyCents: Int?, monthlyCents: Int, annualCents: Int, trialDays: Int
- `BrandColors` (3): primary: String, secondary: String, accent: String
- `QuietHours` (4): enabled: Bool, start: String, end: String, timezone: String
- `NumbersOff` (3): enabled: Bool, from: String?, to: String?
- `PaceGoal` (2): enabled: Bool, postsPerWeek: Int?
- `TierStatsSnapshot` (4): lifetimeClearedCents: Int, approvedCount: Int, approvalRate: Double, reliabilityScore: Int

**`EntitiesMarket.swift`**

- `MarketSeriesPoint` (14): id: String, category: AppCategory, date: String, clearingCpmCents: Int, p25CpmCents: Int, p75CpmCents: Int, openBounties: Int, openBudgetCents: Int, newBounties: Int, submissions: Int, medianFillHours: Double, medianViews: Int, trialRate: Double, sampleN: Int
- `Ticker` (2): totals: TickerTotals, events: [TickerEvent]
- `Offer` (29): id: String, kind: OfferKind, status: OfferStatus, brandId: String, appId: String, creatorId: String, createdByMemberId: String, title: String, bountyId: String?, rateCardId: String?, rebuyOfPostId: String?, amountCents: Int, originalAmountCents: Int, askCents: Int?, suggested: RateSuggestion?, takeRate: Double, allInCents: Int, deliverables: Deliverables, rightsCard: RightsCard, turnaroundDays: Int, message: String, rounds: Int, escrowFunded: Bool, thread: [OfferMessage], expiresAt: Date, createdAt: Date, updatedAt: Date, acceptedAt: Date?, closedAt: Date?
- `Auction` (20): id: String, creatorId: String, title: String, description: String, status: AuctionStatus, slots: Int, reserveCents: Int, deliverables: Deliverables, rightsCard: RightsCard, opensAt: Date, closesAt: Date, art: ArtSeed, bids: [Bid], bidsCount: Int, clearingPriceCents: Int?, winningBidIds: [String]?, resultingBountyIds: [String]?, awardedAt: Date?, createdAt: Date, updatedAt: Date
- `Spec` (33): id: String, creatorId: String, title: String, description: String, status: SpecStatus, source: SpecSource, art: ArtSeed, video: VideoMeta, formatId: FormatId?, hookText: String, hookType: HookType, category: AppCategory, flowBand: ScoreBand, flowPoints: Int, hookBand: ScoreBand, hookPoints: Int, qaPass: Int, qaWarn: Int, qaFail: Int, tags: VideoTags, priceCents: Int, paidAdsDays: Int, exclusive: Bool, rightsCard: RightsCard, stats: SpecStats, licenses: [SpecLicense], sourceSubmissionId: String?, sourceBountyId: String?, sourceBrandId: String?, firstRefusalEndsAt: Date?, listedAt: Date?, createdAt: Date, updatedAt: Date
- `TickerTotals` (12): totalPaidCents: Int, paidTodayCents: Int, paid7dCents: Int, creatorsPaid: Int, payoutsCount: Int, postsCleared: Int, typicalCreator30dCents: Int, p25Creator30dCents: Int, p75Creator30dCents: Int, topDecileCreator30dCents: Int, activeCreators30d: Int, updatedAt: Date
- `OfferMessage` (9): id: String, authorRole: AuthorRole, authorUserId: String?, type: OfferMessageType, amountCents: Int?, rightsDays: Int?, body: String?, at: Date, warningCode: ScamReason?
- `SpecStats` (3): previews: Int, saves: Int, licenses: Int
- `TickerEvent` (11): id: String, kind: TickerKind, at: Date, text: String, amountCents: Int?, creatorId: String?, handle: String?, tier: Tier?, bountyId: String?, appName: String?, proofId: String?
- `Bid` (9): id: String, brandId: String, bidderMemberId: String, amountCents: Int, status: BidStatus, placedAt: Date, escrowHoldCents: Int, paysCents: Int?, note: String?
- `SpecLicense` (6): brandId: String, licensedAt: Date, priceCents: Int, paidAdsDays: Int, endsAt: Date?, ledgerTxnId: String?

**`EntitiesMeta.swift`**

- `World` (7): id: String, now: Date, launchDate: String, seed: Int, contractVersion: String, personas: Personas, counts: [String: Int]
- `PersonaCreator` (3): userId: String, creatorId: String, handle: String
- `PersonaBrand` (4): userId: String, memberId: String, brandId: String, appId: String
- `PersonaAdmin` (1): userId: String
- `Personas` (3): creator: PersonaCreator, brand: PersonaBrand, admin: PersonaAdmin

**`EntitiesMisc.swift`**

- `TierThresholds` (5): lifetimeClearedCents: Int, approvedCount: Int, approvalRateMin: Double, reliabilityMin: Int, manualReview: Bool
- `TierPerks` (7): earlyAccessHours: Int, rateCard: Bool, instantCashoutFreePerWeek: Int, instantCashoutUnlimited: Bool, crewsLead: Bool, auctions: Bool, featuredProfile: Bool

**`EntitiesMoney.swift`**

- `LedgerEntry` (20): id: String, txnId: String, entryType: LedgerType, account: String, amountCents: Int, status: LedgerStatus, postedAt: Date, clearedAt: Date?, paidAt: Date?, brandId: String?, bountyId: String?, postId: String?, submissionId: String?, creatorId: String?, conversionId: String?, adId: String?, payoutId: String?, invoiceId: String?, reversesTxnId: String?, memo: String
- `Payout` (21): id: String, creatorId: String, kind: PayoutKind, status: PayoutStatus, grossCents: Int, feeCents: Int, netCents: Int, runId: String?, requestedAt: Date, scheduledFor: Date, initiatedAt: Date?, paidAt: Date?, failedReason: String?, holdReason: HoldReason?, methodLabel: String, stripeTransferId: String?, ledgerTxnId: String?, itemCount: Int, tierAtPayout: Tier, freeInstant: Bool, proofId: String
- `Invoice` (20): id: String, brandId: String, number: String, kind: InvoiceKind, status: InvoiceStatus, bountyId: String?, lineItems: [LineItem], subtotalCents: Int, processingCents: Int, taxCents: Int, totalCents: Int, poNumber: String?, costCenter: String?, vatId: String?, reverseCharge: Bool, issuedAt: Date, dueAt: Date, paidAt: Date?, ledgerTxnId: String?, pdfRef: String
- `MoneyClockRow` (19): id: String, creatorId: String, bountyId: String, appId: String, postId: String?, conversionId: String?, source: MoneyClockSource, state: MoneyClockState, amountCents: Int, estimated: Bool, earnedAt: Date, etaAt: Date?, reason: MoneyClockReason, reasonText: String, label: String, ledgerId: String?, payoutId: String?, clearedAt: Date?, paidAt: Date?
- `PayoutRun` (15): id: String, runDate: String, scheduledFor: Date, status: RunStatus, payoutsCount: Int, totalGrossCents: Int, totalFeeCents: Int, totalNetCents: Int, paidCount: Int, failedCount: Int, heldCount: Int, heldCents: Int, holds: [HoldSummary], initiatedAt: Date?, completedAt: Date?
- `LineItem` (6): description: String, quantity: Int, unitCents: Int, amountCents: Int, bountyId: String?, adId: String?
- `HoldSummary` (3): reason: HoldReason, count: Int, cents: Int

**`EntitiesPlatform.swift`**

- `AppNotification` (15): id: String, recipientUserId: String, audience: ActorKind, kind: NotificationKind, priority: NotificationPriority, title: String, body: String, amountCents: Int?, deepLink: String, refKind: String?, refId: String?, batched: Bool, createdAt: Date, deliveredAt: Date?, readAt: Date?
- `Integration` (16): id: String, brandId: String, appId: String?, kind: IntegrationKind, status: IntegrationStatus, label: String, scopes: [String], config: [String: String], webhookUrl: String?, secretLast4: String?, coverageRatio: Double?, events24h: Int, healthNote: String, connectedAt: Date?, lastSyncAt: Date?, lastEventAt: Date?
- `ApiKey` (14): id: String, brandId: String, name: String, mode: KeyMode, scopes: [ApiScope], prefix: String, last4: String, createdByMemberId: String, rateLimitPerMinute: Int, requests30d: Int, createdAt: Date, lastUsedAt: Date?, expiresAt: Date?, revokedAt: Date?
- `Webhook` (10): id: String, brandId: String, url: String, events: [WebhookEventType], status: WebhookStatus, secretLast4: String, failureCount: Int, deliveries: [WebhookDelivery], createdAt: Date, lastSuccessAt: Date?
- `ActivityEntry` (9): id: String, brandId: String, actorMemberId: String?, action: ActivityAction, summary: String, targetKind: String?, targetId: String?, metadata: [String: String], at: Date
- `AutoApproveRule` (17): id: String, brandId: String, name: String, status: RuleStatus, conditions: AutoApproveConditions, scope: AutoApproveScope, guardrails: RuleGuardrails, timeoutPolicy: TimeoutPolicy, dryRun: DryRun?, stats: RuleStats, audit: [RuleAuditEntry], createdByMemberId: String, createdAt: Date, updatedAt: Date, enabledAt: Date?, killedAt: Date?, killReason: String?
- `TestPlan` (19): id: String, brandId: String, appId: String, name: String, status: TestPlanStatus, spendTier: SpendTier, budgetCents: Int, hooks: [TestAxisItem], bodies: [TestAxisItem], ctas: [CtaType], cells: [TestCell], bountyIds: [String], offerIds: [String], winnerCellId: String?, liftRatio: Double?, confidence: Double?, caution: String, createdAt: Date, updatedAt: Date
- `FatigueAlert` (18): id: String, brandId: String, appId: String, bountyId: String, postId: String, adId: String?, creatorId: String, metric: FatigueMetric, status: FatigueStatus, peakValue: Double, currentValue: Double, dropRatio: Double, peakOn: String, series: [ChartPoint], message: String, detectedAt: Date, acknowledgedAt: Date?, refreshBountyId: String?
- `FloSuggestion` (15): id: String, surface: FloSurface, kind: FloKind, creatorId: String?, brandId: String?, contextKind: String?, contextId: String?, prompt: String, title: String, outputs: [String], actions: [FloAction], model: String, latencyMs: Int, helpful: Bool?, createdAt: Date
- `MlModel` (15): id: String, kind: ModelKind, name: String, version: String, stage: ModelStage, description: String, trainedOnN: Int, metrics: [ModelMetric], calibration: [CalibrationBin], driftScore: Double, jobs: ModelJobStats, tagCoverage: [String: Double], learnedReadyAtPosts: Int, lastRunAt: Date, updatedAt: Date
- `ChatThread` (14): id: String, kind: ThreadKind, title: String, creatorId: String?, brandId: String?, offerId: String?, submissionId: String?, bountyId: String?, messages: [ChatMessage], unreadCreator: Int, unreadBrand: Int, rateLimited: Bool, lastMessageAt: Date, createdAt: Date
- `BrandList` (8): id: String, brandId: String, name: String, isFavourites: Bool, members: [ListMember], createdByMemberId: String, createdAt: Date, updatedAt: Date
- `ChartPoint` (2): date: String, value: Double
- `WebhookDelivery` (6): id: String, event: WebhookEventType, status: DeliveryStatus, statusCode: Int?, at: Date, latencyMs: Int
- `AutoApproveConditions` (9): minFlowBand: ScoreBand, requireAllBeats: Bool, requireDisclosurePass: Bool, requireNoDuplicate: Bool, requireMusicPass: Bool, maxFraudScore: Int, minUsAudienceRatio: Double, minCreatorApprovedPosts: Int, minCreatorApprovalRate: Double
- `AutoApproveScope` (3): bountyIds: [String], tiers: [Tier], platforms: [Platform]
- `RuleGuardrails` (4): dailyCap: Int, budgetCapCents: Int, spotCheckRatio: Double, pauseOnFraud: Bool
- `DryRun` (5): ranAt: Date, sampleSize: Int, wouldApprove: Int, wouldSendToHuman: Int, wouldBlock: Int
- `RuleStats` (4): autoApproved: Int, spotChecked: Int, spotCheckOverturned: Int, lastTriggeredAt: Date?
- `CellResults` (5): views: Int, installs: Int, trials: Int, paid: Int, trialRate: Double
- `TestCell` (8): id: String, hookRef: String, bodyRef: String, cta: CtaType, status: TestCellStatus, submissionId: String?, postId: String?, results: CellResults?
- `TestAxisItem` (2): id: String, label: String
- `ModelMetric` (3): label: String, value: Double, unit: String
- `CalibrationBin` (4): band: ScoreBand, count: Int, medianViews: Int, trialRate: Double
- `FloAction` (3): label: String, kind: String, payload: String?
- `ChatMessage` (8): id: String, authorRole: AuthorRole, authorUserId: String?, kind: MessageKind, body: String, at: Date, warningCode: ScamReason?, readAt: Date?
- `RuleAuditEntry` (4): at: Date, actorMemberId: String?, action: RuleAuditAction, note: String
- `ListMember` (4): creatorId: String, note: String?, tags: [String], addedAt: Date
- `ModelJobStats` (4): queueDepth: Int, jobs24h: Int, failed24h: Int, medianLatencyS: Double

**`EntitiesPosts.swift`**

- `Post` (39): id: String, submissionId: String, creatorId: String, brandId: String, appId: String, bountyId: String, socialAccountId: String, platform: Platform, platformPostId: String, url: String, caption: String, hashtags: [String], thumb: ArtSeed, durationMs: Int, postedAt: Date, windowEndsAt: Date, status: PostStatus, holdReason: HoldReason?, clearedAt: Date?, paidAt: Date?, removedAt: Date?, trackingLinkId: String, promoCode: String?, views: Int, windowViews: Int, viewsInvalid: Int, likes: Int, comments: Int, shares: Int, saves: Int, retention: Retention, funnel: FunnelCounts, earnings: EarningsBreakdown, fraud: FraudAssessment, flowBand: ScoreBand, adId: String?, isWinner: Bool, whyItWon: [String]?, tags: VideoTags
- `ViewSnapshot` (14): id: String, postId: String, takenAt: Date, viewsReported: Int, viewsVerified: Int, viewsInvalid: Int, exclusions: [ViewExclusion]?, deltaVerified: Int, source: SnapshotSource, sources: [String: Double]?, geo: [String: Double]?, flags: [SnapshotFlag], fraudScore: Int, note: String?
- `PostMetricsDaily` (14): postId: String, date: String, views: Int, likes: Int, comments: Int, shares: Int, saves: Int, clicks: Int, installs: Int, trials: Int, paid: Int, estInstalls: Int, estTrials: Int, estPaid: Int
- `PostMetricsHourly` (7): postId: String, ts: Date, views: Int, likes: Int, comments: Int, shares: Int, fraudScore: Int
- `AppMetricsDaily` (17): appId: String, date: String, views: Int, clicks: Int, installs: Int, trials: Int, paid: Int, estInstalls: Int, estTrials: Int, estPaid: Int, revenueCents: Int, postsLive: Int, newPosts: Int, newSubmissions: Int, approvals: Int, creatorPayCents: Int, feeCents: Int
- `FraudSignalHit` (4): signal: FraudSignal, points: Int, severity: Double, detail: String
- `FraudAssessment` (4): score: Int, band: FraudBand, signals: [FraudSignalHit], assessedAt: Date
- `EarningsBreakdown` (7): cpmCents: Int, cpaCents: Int, commissionCents: Int, flatCents: Int, totalCents: Int, capped: Bool, capRemainingCents: Int
- `Retention` (3): curve: [Double], avgWatchRatio: Double, biggestDropAtS: Double?
- `ViewExclusion` (3): cause: ExclusionCause, views: Int, detail: String

**`EntitiesPublic.swift`**

- `Waitlist` (4): totals: WaitlistTotals, leaders: [WaitlistLeader], demoPosition: Int, demoReferrals: Int
- `StateOfAppUgc` (12): quarter: String, quarters: [String], publishedAt: Date, title: String, settledPosts: Int, totalViews: Int, totalPaidCents: Int, categories: [StateCategoryRow], hooks: [StateHookRow], formats: [StateFormatRow], methodology: String, caveats: [String]
- `CaseStudy` (12): id: String, appId: String, brandId: String, title: String, summary: String, quote: String, quoteAuthor: String, quoteRole: String, metrics: CaseMetrics, art: ArtSeed, fictional: Bool, publishedAt: Date
- `Testimonial` (11): id: String, kind: PartyKind, quote: String, author: String, role: String, creatorId: String?, brandId: String?, statLabel: String?, statValue: String?, avatar: ArtSeed, fictional: Bool
- `ChangelogEntry` (7): id: String, date: String, title: String, body: String, tags: [ChangelogTag], audience: [PartyKind], version: String?
- `AuditReport` (22): id: String, slug: String, appName: String, tagline: String, category: AppCategory, storeUrl: String, icon: ArtSeed, ogArt: ArtSeed, brief: Brief, hooks: [AuditHook], suggestedFormatIds: [FormatId], predictedCpmCents: AuditBand, expectedViewsPerPost: AuditBand, expectedCostPerTrialCents: AuditBand, confidence: Double, priceCurve: [CurvePoint], creatorsReady: [String], assumptions: [String], createdBy: PartyKind, claimedByBrandId: String?, pageViews: Int, generatedAt: Date
- `CurvePoint` (5): cpmCents: Int, fillHoursP50: Double, fillHoursP80: Double, confidence: Double, sampleN: Int
- `AuditHook` (4): text: String, hookType: HookType, formatId: FormatId, hookPoints: Int
- `AuditBand` (3): low: Int, median: Int, high: Int
- `StateCategoryRow` (7): category: AppCategory, clearingCpmCents: Int, medianViews: Int, installToTrial: Double, trialToPaid: Double, medianFillHours: Double, settledPosts: Int
- `StateHookRow` (4): hookType: HookType, shareOfPosts: Double, medianViews: Int, trialRate: Double
- `StateFormatRow` (4): formatId: FormatId, shareOfPosts: Double, medianViews: Int, trialRate: Double
- `WaitlistTotals` (4): creators: Int, brands: Int, invitesAccepted: Int, updatedAt: Date
- `WaitlistLeader` (5): position: Int, kind: PartyKind, handle: String, referrals: Int, joinedAt: Date
- `CaseMetrics` (8): views: Int, installs: Int, trials: Int, paid: Int, spendCents: Int, costPerTrialCents: Int, creators: Int, periodDays: Int

**`EntitiesRights.swift`**

- `RightsGrant` (25): id: String, postId: String, submissionId: String, bountyId: String, brandId: String, appId: String, creatorId: String, scope: RightsScope, status: RightsGrantStatus, platform: AdPlatform?, sparkCode: String?, codeDurationDays: Int?, startsAt: Date, endsAt: Date?, baseFeeCents: Int, renewalPctPer30d: Double, renewalPriceCents: Int, renewals: [Renewal], alertsSent: [Int], adId: String?, aiLikeness: Bool, revokedAt: Date?, revokeReason: String?, createdAt: Date, updatedAt: Date
- `Renewal` (5): at: Date, days: Int, feeCents: Int, ledgerTxnId: String?, requestedByMemberId: String?

**`EntitiesSubmissions.swift`**

- `Submission` (32): id: String, bountyId: String, creatorId: String, brandId: String, appId: String, status: SubmissionStatus, version: Int, versions: [SubmissionVersion], source: SubmissionSource, formatId: FormatId?, title: String, revisionRound: Int, reservedCents: Int, flowBand: ScoreBand, flowPoints: Int, hookBand: ScoreBand, hookPoints: Int, rightsCard: RightsCard, rightsAcceptedAt: Date, fraudEvidence: FraudEvidence, submittedAt: Date, slaDueAt: Date?, slaState: SlaState, slaBreachedAt: Date?, decision: Decision?, autoApproved: Bool, approvedAt: Date?, postId: String?, linkId: String?, postedAt: Date?, releasedAt: Date?, updatedAt: Date
- `VideoAnalysis` (18): id: String, submissionId: String, version: Int, durationMs: Int, language: String, transcript: [TranscriptSegment], transcriptText: String, onScreenText: [OnScreenText], scenes: [SceneCut], hook: HookAnalysis, beats: [BeatHit], tags: VideoTags, checks: [QaCheck], hookScore: ScoreCard, flowScore: ScoreCard, phash: String, duplicateOfSubmissionId: String?, analysedAt: Date
- `FeedbackNote` (16): id: String, submissionId: String, bountyId: String, creatorId: String, version: Int, authorMemberId: String, tMs: Int, tEndMs: Int?, category: FeedbackCategory, severity: FeedbackSeverity, status: FeedbackStatus, body: String, reasonCode: ReasonCode?, resolvedInVersion: Int?, resolvedAt: Date?, createdAt: Date
- `Evidence` (4): kind: EvidenceKind, ref: String, excerpt: String?, tMs: Int?
- `VideoMeta` (10): assetId: String, durationMs: Int, width: Int, height: Int, sizeBytes: Int, fps: Int, hasCaptions: Bool, language: String, art: ArtSeed, uploadedAt: Date
- `SubmissionVersion` (11): version: Int, submittedAt: Date, video: VideoMeta, flowBand: ScoreBand, flowPoints: Int, hookBand: ScoreBand, hookPoints: Int, qaPass: Int, qaWarn: Int, qaFail: Int, changesSummary: String?
- `Decision` (8): action: DecisionAction, decidedAt: Date, decidedByUserId: String?, reasonCode: ReasonCode?, evidence: Evidence?, summary: String?, slaMet: Bool, appealUsed: Bool
- `FraudEvidence` (7): creatorFraudScore: Int, creatorFraudBand: FraudBand, audienceUsRatio: Double, viewCurveShape: CurveShape, duplicateOfSubmissionId: String?, phashDistance: Int?, followerQuality: Double
- `TranscriptSegment` (3): tStartMs: Int, tEndMs: Int, text: String
- `OnScreenText` (4): tStartMs: Int, tEndMs: Int, text: String, inSafeZone: Bool
- `SceneCut` (3): tStartMs: Int, tEndMs: Int, kind: SceneKind
- `BeatHit` (4): beat: BeatId, required: Bool, found: Bool, tMs: Int?
- `HookAnalysis` (7): text: String, hookType: HookType, landsAtMs: Int, faceAtMs: Int?, appAtMs: Int?, captionAtMs: Int?, spokenMatchesOnscreen: Bool
- `VideoTags` (5): formatId: FormatId?, hookType: HookType, hookWords: String, timeToAppRevealMs: Int, ctaType: CtaType
- `QaCheck` (6): check: QaCheckType, result: QaResult, message: String, evidence: Evidence?, blocksSettlement: Bool, waivedByUserId: String?
- `ScoreItem` (7): id: ScoreItemId, label: String, points: Int, max: Int, passed: Bool, reason: String, fix: String?
- `ScoreCard` (4): band: ScoreBand, points: Int, items: [ScoreItem], label: String

**`EntitiesTrust.swift`**

- `BrandScorecard` (22): id: String, brandId: String, windowDays: Int, asOf: Date, decisionsN: Int, approvedN: Int, decisionHoursMedian: Double, decisionHoursP90: Double, slaBreaches: Int, approvalRate: Double, rejectionRate: Double, appealsN: Int, appealsOverturned: Int, runRate: Double, paysOnTimeRatio: Double, paySpeedHoursMedian: Double, replyHoursMedian: Double, fundedAlways: Bool, reliabilityScore: Int, band: BrandBand, badges: [BrandBadge], trend30d: Double
- `CreatorReputation` (19): id: String, creatorId: String, asOf: Date, provisional: Bool, reliabilityScore: Int, approvalRateFinished: Double, approvalRateRaw: Double, onTimeRatio: Double, postThroughRatio: Double, complianceRatio: Double, cleanRecordRatio: Double, finishedN: Int, fraudFlags90d: Int, clawbacks90d: Int, disputesLost90d: Int, academyBonusPoints: Double, components: [ReliabilityComponent], reasons: [String], tierProgress: TierProgress
- `Dispute` (28): id: String, kind: DisputeKind, status: DisputeStatus, openedBy: PartyKind, creatorId: String?, brandId: String, bountyId: String?, submissionId: String?, postId: String?, payoutId: String?, rejectionReasonCode: ReasonCode?, rangeFrom: Date?, rangeTo: Date?, reason: String, note: String, evidence: [Evidence], amountInDisputeCents: Int, events: [DisputeEvent], openedAt: Date, replyDueAt: Date, firstReplyAt: Date?, resolutionDueAt: Date, resolvedAt: Date?, outcome: DisputeOutcome?, outcomeText: String?, adjustmentCents: Int?, assignedAdminUserId: String?, updatedAt: Date
- `ScamReport` (17): id: String, caseId: String, reporterKind: PartyKind, reporterCreatorId: String?, reporterBrandId: String?, targetKind: ReportTargetKind, targetId: String, reason: ScamReason, description: String, evidenceRefs: [String], status: ReportStatus, createdAt: Date, slaDueAt: Date, triagedAt: Date?, resolvedAt: Date?, actionTaken: String?, assignedAdminUserId: String?
- `FraudFlag` (22): id: String, postId: String, creatorId: String, brandId: String, bountyId: String, status: FraudFlagStatus, score: Int, band: FraudBand, signals: [FraudSignalHit], curveShape: CurveShape, curve: HourlyEnvelope, moneyAtStakeCents: Int, holdPlaced: Bool, duplicateOfPostId: String?, audienceUsRatio: Double, accountAgeDays: Int, openedAt: Date, slaDueAt: Date, reviewedAt: Date?, reviewedByUserId: String?, decisionNote: String?, invalidViews: Int?
- `Verification` (15): id: String, subjectKind: PartyKind, creatorId: String?, brandId: String?, kind: VerificationKind, status: VerificationStatus, provider: String, documents: [DocRef], submittedAt: Date, slaDueAt: Date, decidedAt: Date?, decidedByUserId: String?, reason: VerificationReason?, note: String?, blocksPayout: Bool
- `TaxProfile` (22): id: String, creatorId: String, status: TaxStatus, form: TaxForm?, legalName: String?, entityType: TaxEntityType?, tinLast4: String?, address: Address?, country: Country, taxYear: Int, ytdClearedCents: Int, ytdPaidCents: Int, thresholdCents: Int, thresholdProgress: Double, form1099Required: Bool, setAsideRate: Double, setAsideCents: Int, requestedAt: Date?, submittedAt: Date?, verifiedAt: Date?, expiresAt: Date?, updatedAt: Date
- `TaxDoc` (9): id: String, creatorId: String, kind: TaxDocKind, status: TaxDocStatus, taxYear: Int, amountCents: Int?, fileRef: String, createdAt: Date, issuedAt: Date?
- `ComplianceAudit` (13): id: String, postId: String, submissionId: String, bountyId: String, brandId: String, creatorId: String, checks: [ComplianceCheckItem], overall: ComplianceResult, blocksSettlement: Bool, checkedAt: Date, waivedByMemberId: String?, waiveReason: String?, fixedAt: Date?
- `ReliabilityComponent` (6): key: String, label: String, value: Double, weight: Double, points: Double, reason: String
- `TierCriterion` (5): key: String, label: String, have: Double, need: Double, met: Bool
- `TierProgress` (4): current: Tier, next: Tier?, criteria: [TierCriterion], progress: Double
- `DisputeEvent` (5): at: Date, actor: ActorKind, action: DisputeAction, text: String, userId: String?
- `HourlyEnvelope` (3): views: [Int], expectedLow: [Int], expectedHigh: [Int]
- `DocRef` (3): label: String, fileName: String, art: ArtSeed
- `ComplianceCheckItem` (5): type: ComplianceCheckType, result: ComplianceResult, message: String, evidence: Evidence?, blocksSettlement: Bool

### 4.3 Enums (every enum has `.unknown`, `label`, `tone`, `meaning`, `isKnown`, `allCases` without `.unknown`)

**`EnumsAds.swift`**

- `AdKind`: sparkAd, partnershipAd
- `AdStatus`: requested, authorised, live, paused, fatigued, ended, expired, declined

**`EnumsAttribution.swift`**

- `ConversionKind`: install, trial, paid
- `ConversionSource`: link, code, mmp, survey, modelled
- `ConversionConfidence`: deterministic, matched, selfReported, modelled
- `ConversionStatus`: pending, cleared, rejected, refunded
- `AttributionLinkStatus`: active, paused, expired
- `OfferCodeStatus`: available, assigned, exhausted, expired, retired
- `RcEventType`: initialPurchase, renewal, cancellation, uncancellation, expiration, billingIssue, productChange, nonRenewingPurchase, test
- `PeriodType`: trial, intro, normal
- `RcMatchStatus`: matched, unmatched, duplicate, ignored

**`EnumsBounties.swift`**

- `BountyType`: cpm, cpa, stacked, direct, installOnly
- `BountyStatus`: draft, awaitingFunding, scheduled, live, paused, filled, ended, settled, cancelled
- `BountyVisibility`: open, inviteOnly, `private`, drop
- `FundingSource`: brand, brandMatched, platform
- `LintSeverity`: blocker, warning, info
- `BriefLintCode`: missingDeliverables, missingPlatforms, missingRegions, viewMinimumBase, unpaidTrial, burnerAccount, freshAccountDemand, forcedPostingCount, perpetualRights, aiLikenessRequested, payToJoin, belowFloorCpm, noDisclosureText, unclearCta, capTooLow, lowEffectivePay, budgetBelowMinimum, shortWindow
- `TimeoutPolicy`: escalate, approveIfClean
- `MusicPolicy`: originalOnly, commercialLibrary
- `AiContentPolicy`: notAllowed, allowedDisclosed

**`EnumsCatalogues.swift`**

- `Platform`: tiktok, instagram, youtube
- `AdPlatform`: tiktok, meta
- `AppCategory`: aiPhoto, aiAssistant, fitness, language, productivity, finance, sleepMind, musicAudio, lifestyle
- `Niche`: aiTools, tech, fitness, wellness, productivity, study, money, lifestyle, beauty, travel, food, parenting
- `Country`: us, ca, gb, au, ie, de, fr, es, nl, br, mx, ph

**`EnumsContent.swift`**

- `BeatId`: hook, problem, appReveal, demo, keyFeature, payoff, proof, offer, cta, winState, reaction, endCard
- `FormatId`: tmplScreenReaction, tmplHiddenGem, tmplConfession, tmplProblemSolution, tmplFacelessSlideshow, tmplGreenScreen, tmplResultsUpdate, tmplIdentityShift, tmplFreeTrialLead, tmplReplyComment, tmplCarouselVideo
- `HookType`: confession, curiosityGap, specificNumber, pov, directQuestion, riskReversal, patternInterrupt
- `CtaType`: linkInBio, useCode, tryFree, downloadNow, searchAppStore, commentForLink
- `ScoreBand`: a, b, c, d, e
- `ScoreItemId`: hookLands2s, onscreenTextMatches, faceEarly, appVisible3s, patternInterrupt, provenHookType, speechStartsFast, captionsSafeZone, hookScore, requiredBeats, appVisibleEarly, disclosure, lengthOk, singleCtaWinState, audioClear, formatFit
- `SceneKind`: face, screenRecording, broll, textCard, slide
- `Difficulty`: easy, medium, hard

**`EnumsGrowth.swift`**

- `DropStatus`: upcoming, live, soldOut, closed
- `TournamentStatus`: announced, open, live, judging, complete, cancelled
- `TournamentFormat`: bracket, leaderboard, hookBattle
- `EntryStatus`: entered, advancing, eliminated, won, disqualified
- `CrewRole`: lead, coLead, member
- `StreakStatus`: new, active, frozen, resting, broken
- `WeekOutcome`: posted, freezeUsed, rest, missed
- `LeaderboardMetric`: earnings, conversionRate, scoreAccuracy
- `LeaderboardZone`: promotion, steady
- `ReferralKind`: creator, brand, agency
- `ReferralStatus`: invited, joined, firstDollar, earning, complete, expired
- `LessonTopic`: firstVideo, briefsAndRights, usageRights, contractRedFlags, platformRules, taxes, scams, rateCards, analytics, sustainableCadence
- `LessonBlockKind`: text, tip, warning, example, steps
- `LessonStatus`: notStarted, inProgress, completed
- `TrendKind`: format, hook, topic, sound
- `TrendDirection`: rising, steady, fading
- `BadgeId`: foundingCreator, firstDollar, streak4, streak8, streak12, academyGraduate, crewLead, tournamentWinner, top10Week, hookMaster, idVerified, alwaysOnTime, millionViews, firstTrial
- `WrappedPeriod`: month, year
- `ProofKind`: payout, month, tierUp, wrapped
- `LeaderboardScope`: cohort, niche, global
- `WrappedCardKind`: earnings, views, bestPost, winningHook, trials, streak, tier, topBrand, typical, share

**`EnumsIdentity.swift`**

- `Role`: creator, brandMember, admin
- `ActorKind`: creator, brand, admin, system
- `UserStatus`: active, invited, suspended, deleted
- `AuthProvider`: apple, google, email
- `Tier`: bronze, silver, gold, platinum, elite
- `TierBasis`: earned, graceHold
- `LinkStatus`: connected, needsReauth, revoked, pending
- `AccountHealthStatus`: good, watch, atRisk
- `OnboardingStage`: signedUp, nichesPicked, accountsLinked, firstSubmission, firstApproval, verified, firstDollar
- `BrandKind`: brand, agency, platform
- `BrandMemberRole`: owner, admin, reviewer, finance, viewer, clientApprover
- `MemberStatus`: active, invited, removed
- `AppStatus`: connected, pending, error
- `MmpKind`: noMmp, appsflyer, adjust, branch
- `SdkStatus`: notInstalled, installed, verified
- `StorefrontTheme`: aurora, ink, sunrise, lagoon
- `PartyKind`: creator, brand
- `TierEventKind`: promoted, granted, holdStarted, holdCleared, demoted, carryOverApplied

**`EnumsMarket.swift`**

- `OfferKind`: invite, direct, rebuy
- `OfferStatus`: awaitingCreator, awaitingBrand, accepted, declined, expired, withdrawn, completed
- `OfferMessageType`: offer, counter, message, accept, decline, withdraw, system
- `AuthorRole`: brand, creator, system
- `AuctionStatus`: scheduled, open, closed, awarded, noBids, cancelled
- `BidStatus`: sealed, won, lost, withdrawn
- `SpecStatus`: draft, scoring, firstRefusal, listed, licensed, withdrawn
- `SpecSource`: creatorUpload, releasedFromBounty
- `RateCardStatus`: open, limited, paused

**`EnumsMoney.swift`**

- `Plan`: free, pro, scale
- `PlanFeature`: escrow, reviewQueue, funnel, creatorDiscovery, rightsCard, freeTools, briefLint, attributionKit, learnedScorer, guardedAutoApprove, marketView, rightsVault, testPlanner, slack, api, winnerPromotion, multiApp, agencyWorkspaces, roles, financePack, slas, whiteLabelReports
- `LedgerType`: walletTopup, escrowFund, matchedBudget, escrowRefund, cpm, cpa, flatFee, commission, rightsFee, fee, adFee, subscriptionFee, processing, payout, payoutFee, bonus, prize, referral, clawback, adjustment
- `LedgerStatus`: pending, cleared, paid, held, reversed
- `LedgerAccountKind`: wallet, escrow, creator, platform, external
- `PayoutKind`: weekly, instant
- `PayoutStatus`: scheduled, processing, inTransit, paid, failed, held, cancelled
- `PayoutMethodKind`: bank, debitCard
- `PayoutMethodStatus`: active, pending, failed
- `PaymentKind`: card, ach
- `InvoiceKind`: funding, subscription, adFee, rightsRenewal, specLicense, adjustment
- `InvoiceStatus`: draft, open, paid, void, refunded
- `MoneyClockSource`: cpm, cpaInstall, cpaTrial, cpaPaid, adCommission, flatFee, rightsFee, prize, bonus, referral
- `MoneyClockState`: accruing, pending, cleared, paid, held, reversed
- `MoneyClockReason`: windowOpen, fraudCheck, awaitingClearingRun, conversionClearing, awaitingWeeklyPayout, payoutInTransit, heldFraudReview, heldDispute, heldTaxInfo, heldIdentityCheck, heldPayoutMethod, heldCompliance, paidOut, reversedClawback
- `TickerKind`: payout, firstDollar, tierUp, bountyFilled, milestone, promoted
- `RunStatus`: scheduled, running, complete

**`EnumsPlatform.swift`**

- `NotificationKind`: approval, changesRequested, rejection, appealDecided, postLive, viewsMilestone, cashEvent, payoutCleared, payoutPaid, payoutHeld, tierUp, streakMilestone, streakFreezeUsed, dropLive, dropReminder, offerReceived, offerCountered, offerAccepted, tournamentUpdate, crewInvite, rightsExpiring, rightsRenewed, fatigueAlert, reviewWaiting, reviewSlaWarning, bountyFilled, bountyFunded, fundingNeeded, autoApprovePaused, adLive, disputeUpdate, taxInfoNeeded, scamWarning, floTip, academyBadge, referralJoined, systemNotice
- `NotificationPriority`: cash, normal, digest
- `IntegrationKind`: revenuecat, appsflyer, adjust, branch, metaAds, tiktokAds, slack, zapier, appStoreConnect
- `IntegrationStatus`: connected, needsAttention, disconnected, error
- `ApiScope`: read, write, financial
- `KeyMode`: live, test
- `WebhookStatus`: active, paused, failing, disabled
- `DeliveryStatus`: delivered, failed, retrying
- `WebhookEventType`: bountyFunded, bountyLive, bountyFilled, bountyEnded, submissionCreated, submissionApproved, submissionChangesRequested, submissionRejected, postLive, postWindowClosed, postCleared, conversionTracked, adLive, adFatigued, rightsExpiring, disputeOpened, invoicePaid, walletLow
- `ActivityAction`: bountyCreated, bountyPublished, bountyFunded, bountyPaused, bountyEnded, submissionApproved, submissionChangesRequested, submissionRejected, ruleCreated, ruleEnabled, ruleKilled, memberInvited, memberRoleChanged, memberRemoved, apiKeyCreated, apiKeyRevoked, webhookCreated, integrationConnected, integrationDisconnected, planChanged, walletToppedUp, autoTopupChanged, adPromoted, rightsRenewed, offerSent, offerAccepted, disputeResponded, exportCreated, invoiceDownloaded
- `RuleStatus`: draft, dryRun, active, paused, killed
- `TestPlanStatus`: draft, running, complete, archived
- `TestCellStatus`: planned, briefed, submitted, live, measured
- `FatigueStatus`: open, acknowledged, refreshing, resolved, dismissed
- `FatigueMetric`: trialRate, ctr, installRate
- `FloKind`: script, hookRewrite, briefTldr, caption, scoreFix, rateAdvice, nextAction, bountyDraft
- `FloSurface`: studio, bountyDetail, home, wallet, rateCard, builder, review
- `ModelKind`: videoUnderstanding, hookCoach, autoQa, fraud, creativeScorer, matching, pricing, fatigue
- `ModelStage`: heuristic, shadow, learned
- `ThreadKind`: offer, submission, bounty, support
- `MessageKind`: text, system, warning
- `SaveStage`: saved, joined, submitted
- `ChangelogTag`: new, improved, fix, trust, money
- `MetricStatus`: achieved, onTrack, atRisk, offTrack
- `SpendTier`: starter, growth, scale
- `RuleAuditAction`: created, edited, dryRun, enabled, paused, resumed, killed, spotCheck, spotCheckOverturned

**`EnumsPosts.swift`**

- `PostStatus`: live, windowClosed, held, cleared, paid, removed, clawedBack
- `HoldReason`: fraudReview, disputeOpen, taxInfoMissing, identityCheck, payoutMethodMissing, complianceFail, adminHold
- `TrafficSource`: fyp, following, profile, search, sound, share, other
- `SnapshotSource`: platformApi, creatorScreenshot, manualAdjust
- `SnapshotFlag`: spike, plateau, botPattern, geoShift, reconciled
- `ExclusionCause`: botPattern, capClustering, duplicate, geoOutlier, removedPost, platformAdjustment

**`EnumsRights.swift`**

- `RightsScope`: organic, paidAds, sparkCode, partnershipPermission, aiLikeness
- `RightsGrantStatus`: pendingPermission, active, expiring, renewalRequested, expired, revoked

**`EnumsSubmissions.swift`**

- `SubmissionSource`: studio, webStudio, cameraRoll, capcut
- `SubmissionStatus`: qaPending, inReview, changesRequested, approved, posted, rejected, appealed, withdrawn, expired, released
- `DecisionAction`: approve, requestChanges, reject, autoApprove, timeoutApprove, autoReject, appealOverturn, appealUphold
- `SlaState`: onTrack, stale, breached, met
- `ReasonCode`: appNotShownEarly, hookTooLate, missingRequiredBeat, missingDisclosure, offerNotStated, faceNotShown, audioUnclear, musicNotLicensed, bannedClaim, offBrief, lowVideoQuality, wrongFormat, duplicateContent, unoriginalClip, watermarkPresent, competitorShown, aiContentUndisclosed, brandSafety, regionMismatch, otherRequirement, suspectedFraud
- `QaCheckType`: disclosureAudio, disclosureOnscreen, musicLicence, bannedClaims, aiContent, duplicate, watermark, briefBeats, safeZone, aspectRatio, length, resolution, audioClarity, moderation
- `QaResult`: pass, warn, fail
- `FeedbackCategory`: hook, offer, disclosure, audio, brand, pacing, captions, claims
- `FeedbackSeverity`: mustFix, suggestion
- `FeedbackStatus`: open, resolved, dismissed
- `EvidenceKind`: timecode, qaCheck, briefRequirement, transcript

**`EnumsTrust.swift`**

- `VerificationStatus`: notStarted, pending, needsInfo, verified, rejected, expired
- `VerificationKind`: identity, age, business, tax, payoutMethod
- `BrandBand`: new, excellent, good, fair, poor
- `BrandBadge`: fastDecisions, fundedAlways, paysOnTime, fairReviews, runsWhatItApproves
- `DisputeKind`: viewCount, flaggedBotting, latePayment, rightsMisuse, wrongAttribution, rejectionAppeal, heldFunds, other
- `DisputeStatus`: open, evidenceRequested, underReview, resolved, withdrawn
- `DisputeOutcome`: upheld, partiallyUpheld, rejected
- `ScamReason`: payToJoin, offPlatformChat, fakeBrand, burnerAccountDemand, noEscrowClaim, suspiciousLink, harassment, other
- `ReportTargetKind`: brand, bounty, creator, message, offer
- `ReportStatus`: new, triaged, confirmed, actioned, dismissed
- `FraudFlagStatus`: open, monitoring, cleared, confirmed
- `ComplianceCheckType`: captionDisclosure, spokenDisclosure, onscreenDisclosure, platformLabel, musicLicence, bannedClaims, aiLabel, trackingLink
- `ComplianceResult`: pass, warn, fail, pending
- `TaxForm`: w9, w8ben
- `TaxStatus`: notStarted, requested, submitted, verified, rejected, expired
- `TaxDocKind`: w9, w8ben, form1099Nec
- `TaxDocStatus`: draft, issued, corrected, void
- `FraudSignal`: viewSpikeNoEngagement, capClustering, boughtViewsPattern, geoMismatch, viewToFollowerOutlier, newAccount, duplicateHash, engagementAnomaly, trafficSourceAnomaly, curveShape
- `FraudBand`: clean, watch, review, high
- `CurveShape`: organic, spiky, flat, stepped
- `TaxEntityType`: individual, llc, sCorp, cCorp, partnership
- `VerificationReason`: documentUnreadable, nameMismatch, underage, selfieMismatch, businessNotFound, bankNameMismatch, tinMismatch, other
- `DisputeAction`: opened, reply, evidenceRequested, evidenceAdded, reviewStarted, decision, withdrawn
### 4.4 Hand-written model helpers (`Models/ModelExtensions.swift`, `Utilities/DesignBridge.swift`)

| On | Helper |
|---|---|
| `Tier` | `Comparable` (`rank` 0 Bronze to 4 Elite, `.unknown` is -1), `next`, `previous`, `atLeast(_:)`; `label` (generated); `flowdLevel -> FlowdTierLevel` (DesignBridge, `.unknown` reads as Bronze). `FlowdTierLevel.contractTier -> Tier` |
| `ScoreBand` | `descriptor` ("Strong", "Solid", "Fair", "Weak", "Needs a rework", "Not scored": the word that always goes beside a band), `order` (0 A to 4 E), `atLeast(_:)`, `letter`; `flowdTone` (A mint, B accent, C info, D and E ember, never a red flash) |
| `Bounty` | `reservationUnitCents` (per-video cap + fee on it), `spotsLeft` (a TRUE count: floor(remaining / unit)), `acceptsSubmissions`, `paysViews`, `paysConversions`, `rateLines -> [String]` (`$2.10 per 1,000 views`, `+ $1.50 per trial`, `$5.00 flat`), `cpaRates -> CpaRates`, `usedFraction` (0...1 budget used) |
| `Submission` | `isWaitingOnBrand`, `isOpen`, `Submission.includedRevisionRounds` (2), `revisionRoundsLeft`, `canRevise`, `canAppeal(now:)` (one per rejection within 7 days), `canWithdraw`, `canPost` |
| `Post` | `isWindowOpen(now:)`, `windowProgress(now:)` 0...1 over the 72 hours, `capReachedFraction`, `title` (caption without the disclosure hashtags) |
| `MoneyClockRow` / `MoneyClockState` | `isPendingLike`, `isHeld`; `uiTitle` ("Pending" for accruing and pending, "Cleared", "Paid", "Held", "Reversed"); `flowdStatus: FlowdStatus`, `flowdMoneyState: FlowdMoneyState` |
| status enums | `SubmissionStatus.flowdStatus`, `BountyStatus.flowdStatus`, `PostStatus.flowdStatus`, `PayoutStatus.flowdStatus` -> `FlowdStatus` (the pill), `ContractTone.flowdTone` |
| `Creator` | `foundingFreeActive(now:)`, `handleLabel` ("@maya.makes"), `storefrontURL` ("joinflowd.io/c/maya.makes") |
| `Offer` | `awaitingCreator`, `isOpen`, `counterRoundsLeft` (3 rounds max) |
| `NotificationKind` / `NotificationCategory` | `category` (money, reviews, drop, offers, tournaments, tips, safety), `title`, `isCash` (only money is never batched into quiet hours) |
| `Date` | `isoString` (`2026-10-03T14:00:00Z`) |

---

## 5. Engine mirrors (`Engine/`)

Pure functions, no I/O, no clock reads (every function takes `now`), `Sendable`. They mirror `apps/web/src/lib/engine` line for line and are covered by the formula vectors in `FlowdTests`. The mock API is built on them; features call them directly for live, offline answers (Studio scoring, Pay Math previews, the cash-out fee preview).

**`FlowdConstants`** (`Constants.swift`, generated from `DOMAIN.md` CONSTANTS; never hard-code a number that lives here). Namespaces: `WorldInfo` (publicDomain `joinflowd.io`, contactEmail, minAge 18), `Plans` (`Free/Pro/Scale`: `label`, `priceCentsMonth`, `takeRate`, `features`), `Fees` (cpaOnlyTakeRate 6%, matchedFirstBountyCapCents 50_000, adSpendFeeRate 1%, instantPayoutRate 1.5%, instantPayoutMinCents 50, instantPayoutMaxCents 1_500, instantMinAmountCents 500, card processing 2.9% + 30c), `Pay` (defaultCpmCents 200, floorCpmCents 50, defaultPerVideoCapCents 25_000, default CPA 40/150/400 cents, adCommissionRate 10% for 60 days), `Windows` (viewWindowHours 72, clearingRunHourUtc 14, weeklyPayoutWeekdayUtc 5 = Friday, weeklyPayoutHourUtc 18, `CpaClearHours` 24/72/168, snapshotIntervalHours 6, offerExpiryDays 7, maxCounterRounds 3), `Review` (slaHours 72, staleAfterHours 48, revisionRoundsIncluded 2, appealWindowDays 7, unusedReleaseDays 30), `AutoApprove`, `Rights` (paidAdsDefaultDays 90, renewalFeePctOfBasePer30d 0.25, expiryAlertDays [30, 14, 7], aiLikenessDefault false), `Tiers` (`Thresholds.<Tier>` and `Perks.<Tier>`, demotionGraceDays 30), `Founding`, `Streaks` (freezeEarnedEveryWeeks 4, freezeBankMax 2, restWeeksPerQuarter 2, no inactivity penalty), `Leaderboards` (cohort about 30, promotionZoneSize 5, no demotion zone), `DailyDropRules` (hourUtc 16, claimWindowHours 24), `Tournaments`, `Crews` (max 20, lead at Gold+), `Referrals` (5% for 90 days, single level), `Auctions` (second-price, Platinum+), `Specs`, `Fraud`, `Scores` (`Bands` A 85 / B 70 / C 55 / D 40 / E 0, `BandViewMultiplier` 1.6 / 1.15 / 0.85 / 0.5 / 0.3, `checklistLabel` = "Checklist score. It gets smarter as bounties settle.", `hookChecklist` and `flowChecklist` specs), `Reliability` (creator and brand weights), `FunnelDefaults`, `Matching`, `PricingModel`, `Attribution`, `Tax` (setAsideRate 25%, "Not tax advice."), `Compliance` (disclosureTag `#ad`), `Studio` (aspect 9:16, 1080x1920, min 15 s, max 60 s, hookMustLandS 2, appVisibleByS 3), `Lint`, `Disputes` (reply 24 h, resolution 5 days), `Wellbeing` (quiet hours 22:00 to 08:00), `Api`. Accessors in `ConstantsAccessors.swift`: `FlowdConstants.checklistLabel`, `tierOrder`, `takeRate(plan:)`, `takeRate(plan:type:firstBountyWaived:)`, `tierThresholds(_:)`, `tierPerks(_:)`, `bandFloor(_:)`, `bandViewMultiplier(_:)`, `cpaClearHours(_:)`, `isPayable(source:)`, `fraudMaxPoints(_:)`, `fraudRule(_:)`; `FunnelAssumptions.defaults`.

**`MoneyMath`**: `bps`, `mulRate(cents, rate)` (round half up with integer basis points: `mulRate(25_000, 0.10) == 2_500`), `divRound`, `floorDiv`, `roundHalfUp`, `clamp` (Double and Int), `clamp01`, `round2`, `sum`, `quantile(values, q)`, `median`, `typicalBand([Int]) -> TypicalBand` (`n`, `p25Cents`, `medianCents`, `p75Cents`, `p90Cents`). `CpaRates(install:trial:paid:)` (`.defaults`, `rate(for: ConversionKind)`, `paysAnything`).

**`EarningsEngine`**: `expectedEarnings(baseMedianViews:cpmCents:rates:perVideoCapCents:funnel:) -> ExpectedEarnings` (`p25`, `median`, `p75` each an `EarningsEstimatePoint` with views, installs, trials, paid, `cpmPayCents`, `cpaPayCents`, `payCents`, `capped`; p25 is 0.40x and p75 is 2.55x of the median views); `predictedViews(medianViews:band:)` (median x band multiplier); `payMath(cpmCents:rates:perVideoCapCents:plan:type:firstBounty:takeRate:flatFeeCents:medianViews:basis:funnel:) -> PayMath` (creator CPM, all-in CPM); `typicalVsTop(typicalCents:topCents:topLabel:period:) -> String` ("typical creators earn $62 here (30 days). The top 10% earned $640."); `monthlyEarningsRange(medianViews:postsPerMonth:approvalRate:cpmCents:rates:perVideoCapCents:) -> MonthlyEarningsRange`; `incomeCalendar(rows: [CalendarRow], now:horizonDays:) -> IncomeCalendar` (clears and pays per day); `taxDesk(ytdClearedCents:setAsideRate:) -> TaxDeskNumbers` (set-aside, progress to the $2,000 1099-NEC threshold); `EarningsEngine.disclaimer` ("Results vary. Based on creators' cleared earnings; not a guarantee."). Show it beside every estimate.

**`MoneyClockEngine`** (the Money Clock): `windowEndsAt(postedAt:)`, `postClearingRun(windowEnd:)`, `conversionClearingRun(kind:occurredAt:)`, `conversionRunOnPost(kind:occurredAt:postedAt:)`, `firstRunAtOrAfter(_:hourUtc:)`, `nextClearingRun(after:)`, `weeklyPayoutFor(clearedAt:)`, `nextWeeklyPayout(after:)`, `payoutSchedule(after:count:)`, `payoutRunId(_:)`, `hoursToNextPayout(now:)`, `estimatePayoutArrival(kind:initiatedAt:)`; clocks: `postClock(postedAt:now:held:holdReason:paidAt:payoutArrivesAt:reversed:assumeWeeklyPayout:) -> EarningClock`, `conversionClock(kind:occurredAt:now:postPostedAt:held:holdReason:paidAt:payoutArrivesAt:reversed:) -> EarningClock`, `describe(_ clock:timeZone:) -> EarningDescription` (`uiTitle`, `reasonLabel`, `reasonText`, `etaLabel`: "Clears Sat 2:00 PM UTC"), `reasonText(reason:etaAt:windowEndsAt:arrivesAt:timeZone:) -> String`, `reason(for: HoldReason)`, `holdStep(_:)`, `isHoldReason(_:)`, `bareStateProblem(_ row:) -> String?` (a message when a row would render as a bare "pending": no dated ETA or no reason; nil when fine); `summarize(_ rows:now:) -> MoneyClockSummary` (`pendingCents`, `accruingCents`, `clearedCents`, `heldCents`, `paidCents`, `nextClearingAt`, `nextPayoutAt`); `postTimeline(postedAt:now:) -> [TimelineStep]` (posted, window closes, fraud check, cleared, payout: each with `at` and `done`); instant cash-out: `instantPayout(amountCents:tier:foundingFree:freeInstantUsedThisWeek:clearedCents:) -> InstantPayoutQuote` (`ok`, `refusal: InstantRefusal?` belowMinimum / exceedsCleared / nothingCleared, `feeCents`, `netCents`, `freeInstant`, `listFeeCents`), `instantCashOutPreview(...) -> InstantCashOutPreview` (`quote`, `summary` "Fee $2.40 (1.5%). You get $157.60.", `freeReason`), `foundingFreeActive(founding:perksUntil:now:)`, `freeInstantUsedThisWeek(payouts:now:)`.

**`SettlementEngine`**: `cardProcessing(_:)`, `funding(budgetCents:takeRate:matchedCents:) -> FundingBreakdown`, `firstBountyFunding(brandFundsCents:)`, `allInCpm(cpmCents:budgetCents:cardChargeCents:)`, `allInRate(rateCents:takeRate:)`, `reservationUnit(perVideoCapCents:takeRate:)`, `spotsLeft(remainingCents:perVideoCapCents:takeRate:)`, `escrowIdentityHolds(_ bounty:)`, `settlePost(windowViews:cpmCents:installs:trials:paid:rates:perVideoCapCents:takeRate:alreadyPaidCents:) -> SettlementResult` (`cpmPayCents`, `cpaPayCents`, `payCents`, `capped`, `capRemainingCents`, `feeCents`, `brandCostCents`), `adCommission(revenueInWindowCents:rate:)`, `adPlatformFee(spendCents:)`.

**`TierEngine`**: `TierStats(lifetimeClearedCents:approvedCount:approvalRate:reliabilityScore:eliteReviewed:)` and `TierStats(creator:)`; `approvalRate(approved:decided:)`, `meetsTier(_:_:)`, `tierFor(_:)`, `withCarryOver(lifetimeClearedCents:approvedCount:decidedCount:reliabilityScore:eliteReviewed:carry:)`, `progress(_ s:current:) -> TierProgress`, `remainingToNext(_ s:current:) -> [TierRemaining]` (each with `text`: "$360.00 more cleared", "4 more approved posts", empty when met), `perkLines(_ tier:)`, `whatUnlocksNext(_:)`, `earlyAccessAt(releaseAt:tier:)`, `canSeeBounty(releaseAt:tier:now:)`, `evaluate(stats:heldTier:heldBasis:dipStartedAt:now:paused:) -> TierEvaluation` (30-day no-drop grace), `tierWithGrace(heldTier:computedTier:dipStartedAt:now:)`, `graceDaysLeft(holdUntil:now:)`.

**`ReputationEngine`**: `creatorReliability(decisions:now:onTimeOk:onTimeTotal:postThroughPosted:postThroughApproved:compliancePassed:complianceTotal:fraudConfirmed90d:clawbacks90d:disputesLost90d:academyLessons:) -> CreatorReliabilityResult` (score, provisional, components with reasons; finished work only, recency-weighted, 45-day half-life), `brandReliability(decisionsN:approvedN:decisionHoursMedian:appealsOverturned:paysOnTimeRatio:runRate:replyHoursMedian:) -> BrandReliabilityResult` (bands excellent 90 / good 75 / fair 60), `brandBandLabel(_:)`, `decidesInAbout(band:decisionHoursMedian:) -> String?` ("Decides in about 11 h"; nil for a new brand), `slaState(hoursInQueue:decided:slaHours:)`, `slaDueAt(enteredReviewAt:slaHours:)`, `reviewClock(enteredReviewAt:now:slaHours:timeZone:) -> ReviewClock` (`state: SlaState` onTrack / stale from 48 h / breached from 72 h, `dueAt`, `hoursInQueue`, `hoursLeft`, `escalate`, `label` "Decide by Fri 2:00 PM UTC" or "Overdue by 3 h"; the SLA chip is neutral, amber when stale, rose when breached).

**`StreakEngine`**: `evaluate(postTimes:now:restWeeks:pauses:slackMode:startingFreezes:startWeek:) -> StreakEvaluation`, `canDeclareRestWeek(restWeeks:week:) -> RestWeekCheck`, `restWeeksUsedInQuarter(_:week:)`, `quarterOfWeek(_:)`, `copy(for:) -> StreakCopy` and `copy(status:currentWeeks:bestWeeks:freezesBanked:weeksToNextFreeze:postedThisWeek:)` (calm copy, no guilt).

**`RightsEngine`**: `summary(_ card:)`, `lines(_ card:) -> [RightsLine]` (the plain-language "What this means for you" rows), `renewalPricePer30(baseFeeCents:renewalPct:)`, `renewalQuote(baseFeeCents:renewalPct:extraDays:takeRate:currentEndsAt:) -> RenewalQuote`, `daysLeft(endsAt:now:)`, `dueExpiryAlerts(endsAt:alertsSent:now:) -> RightsAlertsDue`, `deriveGrantStatus(status:endsAt:revokedAt:now:)`.

**`MatchEngine`**: `rank(creator:accounts:bounties:brandReliability:submittedBountyIds:now:includeHidden:) -> [BountyMatch]`, `factors(_:)`, `points(_:)`, `score(_:)`, `isTopPick(_:)`, `nicheOverlap(creatorNiches:bountyNiches:)`, `regionFit(...)`; `MatchGate` (eligibilityTier, country, platformAccountLinked, funded, notAlreadySubmitted) with `text`.

**`MarketEngine`**: `fillTime(cpmCents:clearingCpmCents:medianFillHours:sampleN:) -> FillTime`, `priceCurve(...) -> [PriceCurvePoint]`, `fraudBand(_:)`, `fraudScore(_ signals: [FraudSignalInput]) -> FraudScoreResult`, `fraudAction(_:) -> FraudAction`.

**Scoring and Studio** (Hook Score and Flow Score are CHECKLIST scores; always show the band, the timecoded reasons and `FlowdConstants.checklistLabel`, never a bare number):
- `ScoringEngine`: `band(for points:)`, `pointsToNextBand(_:)`, `scoreHook(_ obs: HookObservations) -> ScoredCard`, `scoreFlow(_ obs: FlowObservations) -> ScoredCard`, `observations(from: HookFeatures)`, `scoreHookFeatures(_ f: HookFeatures) -> HookFeatureResult`, `hookLengthAdvice(hookText:hookStartMs:hookEndMs:)`, `suggestHookFixes(_:) -> [ScoreFix]`, `apply(_ kind: HookFixKind, to:)`, `applyAllHookFixes(_:)`, `suggestFlowFixes(_:hookObs:)`, `apply(_ kind: FlowFixKind, to:)`, `explain(_ card:) -> ScoreExplanation` (headline, strengths, fixFirst), `hookObservations(from: VideoAnalysis, faceless:hookTrialRates:)`, `flowObservations(from:hookPoints:formatBeats:)`, `scoreAnalysis(_ analysis:faceless:hookTrialRates:formatBeats:) -> (hook, flow, hookObservations, flowObservations)`, `formatOrder(formatBeats:hits:)`, `endsOnWinState(hits:durationMs:)`. `ScoredCard` has `band`, `points`, `items: [ScoredItem]` (each with `label`, `points`, `max`, `passed`, `reason`, `fix`, `atMs`, `pointsLost`), `label`, `asScoreCard`. `HookFixKind` (addHookLine, trimIntro, burnInHookText, startOnFace, moveAppReveal, addCut, useProvenHook, cutDeadAir, moveCaptions) and `FlowFixKind` are the one-tap fixes.
- `HookTextEngine` (type or pick a hook, no video needed): `scoreText(_:) -> HookTextResult` (score, band, items with fixes, `patterns`, `rule: TwoSecondRule`, `suggestions`), `suggestRewrites(slots:avoidTypes:limit:) -> [HookRewrite]`, `fillHook(_ template:slots: HookSlots)`, `detectPatterns(_:)`, `twoSecondRule(_:)`, `firstSentence(_:)`, `library` (templates per `HookType`); `HookSlots(app:category:feature:goal:number:)`.
- `ClipAnalyzer.analyze(clip: ClipInput, bounty:app:brand:format:creatorId:title:) -> ClipAnalysis` (transcript, on-screen text, scenes, hook, beats, tags, QA report, hook and flow `ScoredCard`s, phash; `videoAnalysis(id:submissionId:version:analysedAt:)` converts to the contract shape); `ClipInput(script:hookText:onScreenText:captionHook:durationS:speechStartMs:faceAtMs:appAtMs:includeDisclosure:hasCaptions:width:height:music:aiContent:watermarkDetected:knownHashes:)`; `spokenDisclosure(brandName:)`, `phash(_:)`, `ctaType(for:)`, `splitSentences(_:)`.
- `QAEngine.run(_ input: QaInput) -> QaReport` (findings with `reasonCode`, `fix`, `blocksSettlement`; `pass/warn/fail`, `beats`, `competitors`, `duplicates`); `QaInput(bounty:brandName:durationMs:transcript:onScreenText:caption:)`; helpers `checkDisclosureAudio`, `checkDisclosureOnScreen`, `checkCaptionDisclosure`, `findBannedClaims`, `findCompetitors`, `phashDistance`, `findDuplicates`, `deadAirGaps`, `detectBeats`.
- `PreflightBuilder.build(report:bounty:brandName:captionBody:trackingLine:) -> PreflightResult` (`checks`, `canSubmit`, `blockingCount`, `warningCount`, `captionDraft` with the disclosure locked first); `PreflightBuilder.title(for:)`, `check(from:)`.
- `BriefHelpers`: `tldr(for bounty:) -> BriefTLDR` and `tldr(brief:deliverables:rightsCard:)` (headline, talking points, must-say beats, dos and don'ts, CTA, offer line, disclosure, length, platforms, rights line, `estimatedFilmMinutes`), `caption(disclosure:body:trackingLine:hashtags:)` (disclosure first, cannot be removed), `disclosureLine(brandName:)`, `firstSentence(_:)`.
- `ScamShield.warning(for text:) -> ScamReason?` and `copy(for:)` (screens in-app messages for pay-to-join, off-platform chat, burner demands).
- `TextTools` and `Rx` (regex helpers, `wordCount`, `slugify`, `jaccard`, `textParity`, `callsToAction`).

---

## 6. Utilities (`Utilities/`)

- **`Fmt`** (`Formatters.swift`), pure, en-US, USD: `money(_:showsCents:signed:)` (`$1,284.60`, true minus sign U+2212), `moneyAuto`, `moneyCompact`, `cpm` ("$2.10 per 1,000 views"), `cpmShort`, `cpmLabel`, `moneyRange(low:high:)`, `grouped`, `compact` (`1.2K`), `percent(_:digits:)`, `decimal`, `multiple`, `hours(_:)` ("2.5 h", "3 days"), `count(_:_:plural:)`, `ratioText`, `timecode(ms:)` ("0:03"), `secondsLabel(ms:)`, `clock(seconds:)`, `bytes(_:)`, `clockLabelUTC` ("Sat 2:00 PM UTC"), `clockLabel(_:timeZone:)` ("Sat 2:00 PM" in the device zone), `timeLabel`, `dayLabel`, `datedClockLabelUTC`, `relative(_:now:)` ("in 2 hours"), `timeLeft(until:now:)` ("41 h"), `etaLine(state:etaAt:arrivesAt:timeZone:)` ("Clears Sat 2:00 PM"), `joinList`, `handle(_:)`. Views draw money with `MoneyText`; `Fmt` is for accessibility labels, notification copy, CSV and tests.
- **`FlowdClock`**: `FlowdClock.shared` (`now`, `set(_:mode:)`, `advance(byHours:)`, `useSystemTime()`, `resetToDemoNow()`), `FlowdClock.demoNow`, `FlowdClock.frozen(at:)`. Pass `{ FlowdClock.shared.now }` to `.flowdClock` (the app root already does).
- **`FlowdCalendar`**: UTC maths on epoch seconds (`components`, `make`, `addHours/Days/Minutes/Months`, `dayStart`, `dayString`, `weekday` 0 = Sunday, `isoWeek` ("2026-W40"), `isoWeekStart`, `nextWeekStart` (the leaderboard reset), `isoWeekEnd`, `isoWeekToStart`, `isoWeekAdd`, `nextDailyAt(after:hourUtc:)`, `nextWeeklyAt(after:weekday:hourUtc:)`, `prevWeeklyAt`, `clockLabelUTC`, `dayLabelUTC`, `pad`). `FlowdDates.parse(_:)` / `string(from:)` for ISO-8601.
- **`FlowdJSON`**: `makeDecoder()` (snake_case via `flowdCamelFromSnake`, tolerant ISO-8601), `makeEncoder()` (local persistence: camelCase, sorted keys), `makeAPIEncoder()` (request bodies: snake_case), `decode(_:from:)`, `encode(_:)`; `LossyArray<Element>` skips bad rows in live pages.
- **`WellbeingClock`**: `isWithin(start:end:timeZoneIdentifier:at:)` (quiet hours and numbers-off windows as local `HH:mm`, may cross midnight), `minutes(_:)`, `localMinutes(_:timeZoneIdentifier:)`. `WidgetSnapshotBuilder.numbersHidden(_ settings: WellbeingSettings?, at:) -> Bool` is the one rule for "numbers off"; `AppState.numbersHidden` wraps it: every screen that shows live money or views reads that.
- **`StableHash`**: `fnv1a`, `bucket(_:modulus:)`, `hex8` (Swift's `hashValue` is randomised per launch; never use it for anything that must repeat).
- **`FlowdLog`**: `Logger`s (`api`, `fixtures`, `engine`, `persistence`, `upload`, `deepLink`, `analytics`, `widget`, `studio`). Never `print`.
- **`DeepLink`** (`DeepLink.swift`): `parse(_ text: String)` and `parse(_ url: URL)` for `flowd://...` and the joinflowd.io universal links (`/b/<id>`, `/c/<handle>`, `/p/<proof>`); cases `home bounty(id:) submission(id:) post(id:) payout(id:) offer(id:) dispute(id:) tournament(id:) lesson(slug:) scorecard(brandId:) creator(handle:) proof(id:) drop wallet moneyClock inbox studio tiers rights streak referrals tax safety wellbeing remix crew academy leaderboard changelog settings(section:) unknown(String)`; `url`, `universalURL`, `requiresSession`. `App/Router.swift` maps a `DeepLink` to a `Route`.
- **`DesignBridge`**: `ContractTone.flowdTone`, `Tier.flowdLevel`, `FlowdTierLevel.contractTier`, `SubmissionStatus/BountyStatus/PostStatus/PayoutStatus.flowdStatus`, `MoneyClockState.flowdStatus/flowdMoneyState`, `ScoreBand.flowdTone`. Use these; never switch on a contract value to pick a colour yourself.
- **`LiveActivityBridge`** (ActivityKit, main actor): `EarningsActivityBuilder.attributes(post:bounty:brandName:)` / `state(post:rows:now:)` (pure), `EarningsActivityController.shared.start(post:bounty:brandName:rows:now:)`, `update(post:rows:now:)`, `end(post:rows:now:)`, `endAll()`, `isAvailable`. One activity per post while its 72-hour window is open; the card lingers one hour after money clears. The attributes live in `Shared/FlowdEarningsActivityAttributes.swift`.
- **`WidgetSnapshotPublisher`** (WidgetKit, main actor): `WidgetSnapshotBuilder.snapshot(creator:wallet:streak:drop:wellbeing:isDemo:now:) -> FlowdWidgetSnapshot`, `WidgetSnapshotPublisher.publish(_:)` (writes the App Group file and reloads timelines; silent without the entitlement), `clear()` (sign-out).

---

## 7. Persistence (`Persistence/`)

- **`DraftStore`** (`@MainActor final class`, SwiftData): `DraftStore.make(inMemory:)`, `DraftStore.makeResilient() -> DraftStore?` (on disk, falls back to memory; the app creates one and exposes it as `AppState.draftStore`), `drafts(bountyId:) -> [DraftSnapshot]` (newest first), `draft(id:)`, `count`, `save(_ snapshot:) -> DraftSnapshot` (stamps `updatedAt`), `delete(id:)` (also removes the video file), `deleteAll()`. Schema `FlowdPersistence.schema` is `[DraftRecord.self]`.
- **`DraftSnapshot`** (`Codable, Hashable, Identifiable, Sendable`): `id` ("draft_<uuid>"), `bountyId`, `title`, `script`, `hookText`, `caption` (creator words only; `BriefHelpers.caption` adds the locked disclosure), `formatId: FormatId?`, `stage: DraftStage` (`script capture edit score submit`, `title`, `index` 0 to 4), `videoFileName` (a file name in `FlowdDirectories.drafts`, never an absolute path), `durationMs`, `width`, `height`, `hookBand`, `hookPoints`, `flowBand`, `flowPoints`, `qaPass`, `qaWarn`, `qaFail`, `checklist: [String: Bool]` (shot checklist ticks by beat id), `createdAt`, `updatedAt`; `hasVideo`, `summaryLine` ("Capture. 0:24 recorded."), `videoURL`. Both Studio agents read and write drafts through this; the stage is how a draft resumes.
- **`UploadQueueStore`** (`actor`, JSON file in Application Support): `UploadQueueStore.makeDefault()`, `UploadQueueStore(fileURL: nil)` (in memory); `all()`, `job(id:)`, `pending()`, `next(at:)`, `enqueue(draftId:bountyId:fileName:sizeBytes:chunkSizeBytes:idempotencyKey:now:)`, `update`, `recordSession`, `recordProgress`, `markDone`, `markFailed(id:message:now:)` (backoff 5 s doubling to 5 min, gives up after 8 attempts), `pause`, `resume` ("Try again"), `remove`, `clearFinished`. `UploadJob` has `progress`, `state: UploadState` (`queued uploading paused failed done`), `statusLine`, `isRunnable(at:)`, and an `idempotencyKey` that is sent with the final `submit` so a retry never double-submits.
- **`DiskCache`** (`actor`): `load(_:key:maxAge:now:)`, `savedAt(key:)`, `save(_:key:now:)`, `remove(key:)`, `clear()` (sign-out). The last good answer of a screen, shown with its age when offline (never passed off as live).
- **`FlowdDirectories`**: `drafts`, `uploads`, `cache`, `draftVideo(_ fileName:)`.

---

## 8. Previews and tests (`Preview/`)

`PreviewData` (previews and tests only): hero rows `creator` (Maya), `user`, `brand` (Lumi), `app`, `scorecard`, `bounty` (`bnty_lumi_glowup`, a live funded view-and-conversion bounty), `starterBounty` (`bnty_flowd_starter_1`), `livePost` (`post_0418`), `clearedPost` (`post_0384`), `paidPost` (`post_0293`), `approvedSubmission` (`sub_0664`), `inReviewSubmission` (`sub_0685`), `changesSubmission` (`sub_0646`), `rejectedSubmission` (`sub_0644`), `clearedMoneyRow` (`mc_0208`), `pendingMoneyRow` (`mc_0209`), `scheduledPayout` (`pay_0330`), `inTransitPayout` (`pay_0292`), `offer` (`offer_0033`, waiting on Maya), `notification` (`ntf_0125`); fixture tables `creators`, `brands`, `apps`, `scorecards`, `bounties`, `formats`, `hooks`, `trends`, `lessons`, `tournaments`, `crews`, derived `liveBounties`, `mayaPosts`, `mayaSubmissions`, `mayaMoneyRows`, `mayaPayouts`, `mayaOffers`, `mayaNotifications`; builders `brandCard(_:)`, `expectedPay(for:medianViews:)`, `feedItem(_:matchScore:locked:saved:joined:)`, `feedItems`, `walletSummary`; `PreviewData.api(signedIn:) -> MockFlowdAPI` (fresh frozen-clock mock per preview, so previews never leak state); `table(_ name:as:)` for any other fixture table. `PreviewHeroes` is the generated embedded data behind the hero rows.

---

## 9. Flo (`Services/FloEngine.swift`)

`protocol AIProvider: Sendable { func respond(to request: FloRequest, context: FloContext) async throws -> FloOutput }`. `MockAIProvider` (`modelName` "flo-checklist-1") is deterministic and offline: same request and context, same words out. `FloRequest(surface:kind:prompt:contextKind:contextId:bountyId:formatId:hookText:)` with `FloKind` (`script hookRewrite briefTldr caption scoreFix rateAdvice nextAction`; `bountyDraft` is brand-only) and `FloSurface` (`studio bountyDetail home wallet rateCard`; `builder` and `review` are brand-side). `FloOutput`/`FloSuggestion` carry `title`, `outputs: [String]`, `actions: [FloAction]` (`label`, `kind`, `payload`), `model`, `latencyMs`. The creator-facing note is always "checklist-based, can be wrong". Call it through `FlowdAPI.flo(_:)`, which builds the context (bounty, brand, app, format, hooks, creator niches) from real state.

---

## 10. The demo world in numbers (fixture facts the screenshots and previews rely on)

- Now `2026-10-03T14:00:00Z` (Saturday, ISO week 2026-W40); the 14:00 clearing run has just run; the next weekly payout is Friday 2026-10-09 18:00 UTC.
- Creator `cr_maya` (@maya.makes, Silver, onboarding stage `first_dollar`); brand `br_lumi` (Lumi, app `app_lumi`); flowd's own brand `br_flowd` runs the starter bounties `bnty_flowd_starter_1` and `bnty_flowd_starter_2` and the pinned "content-about-us" bounty `bnty_flowd_about_us`.
- Maya's submissions include one of each state: approved `sub_0664`, in review `sub_0685` and `sub_0699`, changes requested `sub_0646`, rejected `sub_0644`, `sub_0051`, `sub_0082`; live posts `post_0399`, `post_0408`, `post_0418`; payouts `pay_0330` (scheduled) and `pay_0292` (in transit) beside paid history; offers `offer_0033` (awaiting her) and `offer_0032` (awaiting the brand); proofs `prf_be182114` (tier up), `prf_h3ktei4q` (payout), `prf_25086bca` (wrapped).
- Lesson slugs: `first-video-in-15-minutes`, `reading-a-brief-and-a-rights-card`, `usage-rights-and-what-to-charge`, `contract-red-flags`, `platform-rules-and-ad-disclosure`, `taxes-w9-and-1099`, `spotting-scams`, `rate-cards-and-negotiating`, `reading-analytics-and-retention`, `sustainable-cadence-and-burnout`. Crews `crew_sunday_resetters`, `crew_screen_time_club`, `crew_late_night_edits`. Fraud flags (for example `flag_001`) and disputes (`disp_001`) exist for Admin mode.
- `App/LaunchOptions.swift` holds the same ids as `DemoIDs` for screenshots and demos.

---

## 11. The view-model pattern

```swift
@MainActor
@Observable
final class BountyDetailViewModel {
    enum Phase { case loading, loaded(BountyDetail), failed(FlowdAPIError) }
    private(set) var phase: Phase = .loading
    private let api: any FlowdAPI
    private let bountyID: String

    init(api: any FlowdAPI, bountyID: String) { self.api = api; self.bountyID = bountyID }

    func load() async {
        do {
            phase = .loaded(try await api.bountyDetail(id: bountyID))
        } catch let error as FlowdAPIError {
            if error != .cancelled { phase = .failed(error) }
        } catch {
            phase = .failed(.server(status: 0, code: nil, message: error.localizedDescription))
        }
    }
}
```

The view owns the model with `@State private var model: BountyDetailViewModel?` created in `.task { model = BountyDetailViewModel(api: api, bountyID: bountyID); await model?.load() }` (the API comes from `@Environment(\.flowdAPI)`), shows `SkeletonRow`s while loading, `ErrorStateView(message: error.userMessage) { reload }` on failure (with `error.isRetryable` deciding whether to offer retry), and `EmptyStateView` for an empty list. Mutations call the API, then re-load or patch the model, then raise a calm toast (`@Environment(\.flowdToasts)`) or, for an earned outcome only (cleared money, an approval, a tier-up), `appState.celebrate(...)`.
