import Foundation

// API read-models: the shapes the creator app screens consume, composed from the contract entities (Entities*.swift). The contract never adds
// money fields here: every amount is reproducible from the entities (DOMAIN.md section 16). `MockFlowdAPI` builds them from the fixtures and the
// engine; `LiveFlowdAPI` decodes the same shapes from `/api/v1`. All are `Codable, Hashable, Sendable` and decode with `.convertFromSnakeCase`.

// MARK: - Session

enum SignInCredential: Hashable, Sendable {
    /// The demo creator (Maya). The only credential the mock accepts without a mock Apple sheet.
    case demo
    /// Sign in with Apple. The mock accepts any values; the live API verifies the identity token.
    case apple(identityToken: String?, authorizationCode: String?, fullName: String?, email: String?)
}

struct CreatorSession: Codable, Hashable, Sendable {
    var user: User
    var creator: Creator
    var token: String?
    var isDemo: Bool
    /// The server's clock (the demo world's "now" in mock mode).
    var now: Date
}

struct HealthStatus: Codable, Hashable, Sendable {
    var ok: Bool
    var now: Date
}

// MARK: - Brand card

/// The few facts about a brand every card shows: name, glyph, verification and the Scorecard headline.
struct BrandCard: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var name: String
    var logo: ArtSeed
    var kind: BrandKind
    var verification: VerificationStatus
    /// Brand Scorecard reliability, 0 to 100. Nil for a brand with no Scorecard yet.
    var reliabilityScore: Int?
    var band: BrandBand?
    var decisionHoursMedian: Double?
    /// "Decides in about 11 h". Nil for a new brand, which has no honest figure yet.
    var decidesInLabel: String?
    var badges: [BrandBadge]
    var fundedAlways: Bool
}

/// A short public card of another creator (leaderboards, crews, tournaments, threads).
struct CreatorSummary: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var handle: String
    var displayName: String
    var avatar: ArtSeed
    var tier: Tier
    var founding: Bool
    var niches: [Niche]
}

// MARK: - Earnings estimates

/// Expected pay per video for this creator on a bounty. An estimate; the cap applies; results vary.
struct ExpectedPay: Codable, Hashable, Sendable {
    var p25Cents: Int
    var medianCents: Int
    var p75Cents: Int
    var medianViews: Int
    /// The CPM part and the CPA part of the median estimate.
    var cpmPartCents: Int
    var cpaPartCents: Int
    var flatFeeCents: Int
    var capped: Bool
    /// "Based on your 28-day median of 14,200 views."
    var basis: String
    /// "Results vary. Based on creators' cleared earnings; not a guarantee."
    var disclaimer: String
}

// MARK: - Wallet and Money Clock

/// A named hold on part of the creator's money, with what releases it.
struct WalletHold: Codable, Hashable, Identifiable, Sendable {
    var reason: MoneyClockReason
    var cents: Int
    var rows: Int
    /// "Add your W-9 to release this payout."
    var nextStep: String

    var id: String {
        return reason.rawValue
    }
}

/// Why an instant cash-out is blocked right now (separate from the amount rules).
enum PayoutBlocker: String, Codable, Hashable, Sendable, CaseIterable {
    case taxInfo = "tax_info_missing"
    case identity = "identity_check_required"
    case payoutMethod = "method_missing"

    var text: String {
        switch self {
        case .taxInfo: return "Add your W-9 first. It takes about two minutes."
        case .identity: return "Verify your identity first. It takes about two minutes."
        case .payoutMethod: return "Add a bank account or debit card first."
        }
    }
}

/// The creator's money at a glance: Cleared and Pending side by side, never summed.
struct WalletSummary: Codable, Hashable, Sendable {
    var asOf: Date
    var tier: Tier
    /// Live posts' estimate while the window is open (part of `pendingCents`).
    var accruingCents: Int
    /// accruing + pending: the UI's "Pending".
    var pendingCents: Int
    /// Cleared and waiting for the weekly payout.
    var clearedCents: Int
    var heldCents: Int
    /// Lifetime paid out.
    var paidOutCents: Int
    var lifetimeClearedCents: Int
    /// The earliest clearing run that matters, with what clears then.
    var nextClearsAt: Date?
    var nextClearsCents: Int
    /// The weekly payout that carries the cleared money, and whether it is free (it always is).
    var nextPayoutAt: Date
    var nextPayoutCents: Int
    var holds: [WalletHold]
    var blockers: [PayoutBlocker]
    var payoutMethod: PayoutMethod?
    /// What an instant cash-out of everything cleared would cost; nil when nothing is cleared.
    var instantPreview: PayoutPreview?
    var freeInstantUsedThisWeek: Int
}

/// The fee, net and arrival of an instant cash-out, shown before the creator confirms.
struct PayoutPreview: Codable, Hashable, Sendable {
    var amountCents: Int
    var clearedCents: Int
    var ok: Bool
    var feeCents: Int
    var netCents: Int
    /// The fee without perks, shown struck through when free.
    var listFeeCents: Int
    var freeInstant: Bool
    var freeReason: String?
    /// "Fee $2.40 (1.5%). You get $157.60." or "Free instant cash-out. You get $160.00."
    var summary: String
    var refusal: InstantRefusal?
    var blockers: [PayoutBlocker]
    var methodLabel: String?
    /// When an instant payout lands (about 30 minutes).
    var arrivesAtEstimate: Date
    /// The free alternative: the next weekly run.
    var nextWeeklyPayoutAt: Date
}

/// A payout with the earning rows it carries.
struct PayoutDetail: Codable, Hashable, Identifiable, Sendable {
    var payout: Payout
    var rows: [MoneyClockRow]
    var proof: Proof?
    var arrivesAt: Date?

    var id: String {
        return payout.id
    }
}

// MARK: - Earnings report

enum EarningsPeriod: String, Codable, Hashable, Sendable, CaseIterable {
    case day
    case week
    case month

    var title: String {
        switch self {
        case .day: return "Day"
        case .week: return "Week"
        case .month: return "Month"
        }
    }
}

struct EarningsBucket: Codable, Hashable, Identifiable, Sendable {
    /// "Oct 3", "W40", "Oct".
    var label: String
    var start: Date
    var earnedCents: Int
    var clearedCents: Int
    var pendingCents: Int

    var id: Date {
        return start
    }
}

struct EarningsBreakdownRow: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var title: String
    var subtitle: String?
    var art: ArtSeed?
    var cents: Int
    var posts: Int
}

struct EarningsReport: Codable, Hashable, Sendable {
    var period: EarningsPeriod
    var from: Date
    var to: Date
    var buckets: [EarningsBucket]
    /// Everything earned in the period (all states except reversed).
    var grossCents: Int
    /// Instant cash-out fees paid in the period.
    var feesCents: Int
    var netCents: Int
    var clearedCents: Int
    var pendingCents: Int
    var paidCents: Int
    var byBounty: [EarningsBreakdownRow]
    var byBrand: [EarningsBreakdownRow]
    /// The typical creator's earnings in the period, drawn as a line beside the creator's own.
    var typical: TypicalBand?
    var disclaimer: String
}

// MARK: - Bounties

/// Why a bounty is locked for this creator, and the way to unlock it.
struct FeedLock: Codable, Hashable, Sendable {
    var gates: [MatchGate]
    var reasons: [String]
}

struct FeedItem: Codable, Hashable, Identifiable, Sendable {
    var bounty: Bounty
    var brand: BrandCard
    var appName: String
    var appIcon: ArtSeed
    /// 0 to 100, nil when locked.
    var matchScore: Int?
    var isTopPick: Bool
    var reasons: [String]
    var locked: Bool
    var lockReasons: [String]
    var gateFailures: [MatchGate]
    /// When this creator's tier first sees the bounty.
    var visibleAt: Date
    var expectedPay: ExpectedPay
    /// A true count: floor(remaining / reservation unit).
    var spotsLeft: Int
    var saved: Bool
    var joined: Bool
    var claimedUntil: Date?
    var submissionId: String?
    /// "Decides in about 11 h". Nil for a new brand.
    var decidesInLabel: String?

    var id: String {
        return bounty.id
    }
}

enum FeedSort: String, Codable, Hashable, Sendable, CaseIterable {
    case match
    case pay
    case endingSoon = "ending_soon"
    case newest

    var title: String {
        switch self {
        case .match: return "Best match"
        case .pay: return "Highest pay"
        case .endingSoon: return "Ending soon"
        case .newest: return "Newest"
        }
    }
}

/// Filters and sort for the bounty feed.
struct FeedQuery: Codable, Hashable, Sendable {
    var search: String?
    var types: [BountyType]
    var platforms: [Platform]
    var niches: [Niche]
    /// Only bounties that ask for organic posting and no paid-ad usage.
    var organicOnly: Bool
    var minCpmCents: Int?
    /// Locked bounties come last when included.
    var includeLocked: Bool
    var savedOnly: Bool
    var sort: FeedSort
    var cursor: String?
    var limit: Int

    init(
        search: String? = nil,
        types: [BountyType] = [],
        platforms: [Platform] = [],
        niches: [Niche] = [],
        organicOnly: Bool = false,
        minCpmCents: Int? = nil,
        includeLocked: Bool = true,
        savedOnly: Bool = false,
        sort: FeedSort = .match,
        cursor: String? = nil,
        limit: Int = 50
    ) {
        self.search = search
        self.types = types
        self.platforms = platforms
        self.niches = niches
        self.organicOnly = organicOnly
        self.minCpmCents = minCpmCents
        self.includeLocked = includeLocked
        self.savedOnly = savedOnly
        self.sort = sort
        self.cursor = cursor
        self.limit = limit
    }

    static let `default`: FeedQuery = FeedQuery()
}

/// What this creator has done with a bounty.
struct BountyCreatorState: Codable, Hashable, Sendable {
    var saved: Bool
    var joined: Bool
    var claimedUntil: Date?
    var claimedFromDrop: Bool
    var submissionId: String?
    var submissionStatus: SubmissionStatus?
}

struct BountyDetail: Codable, Hashable, Identifiable, Sendable {
    var item: FeedItem
    var app: BrandApp
    var scorecard: BrandScorecard?
    /// What creators typically cleared on bounties like this in 30 days (beside any top example).
    var typicalEarnings: TypicalBand?
    /// The best a creator earned per video on this bounty so far, in the same size class (beside the typical).
    var topExampleCents: Int?
    var tldr: BriefTLDR
    var rightsLines: [RightsLine]
    var state: BountyCreatorState
    /// Winning posts to study (their hooks), best first.
    var examplePosts: [Post]
    /// Scam Shield cues for this bounty ("flowd never asks you to pay", "Funded: the money is in escrow").
    var scamCues: [String]

    var id: String {
        return item.bounty.id
    }
}

/// The Pay Math sheet.
struct PayMathBreakdown: Codable, Hashable, Sendable {
    var bountyId: String
    var expected: ExpectedPay
    /// The bounty's own stored Pay Math (category median basis), for comparison with the creator's own estimate.
    var bountyPayMath: PayMath
    var perVideoCapCents: Int
    var rates: [String]
    var typical: TypicalBand?
    var topExampleCents: Int?
    /// "typical creators earn $62 here (30 days). The top 10% earned $640."
    var typicalVsTopLine: String?
    var assumptions: [String]
    var disclaimer: String
}

struct BrandScorecardView: Codable, Hashable, Sendable {
    var brand: BrandCard
    var scorecard: BrandScorecard?
    /// A brand under 10 decisions is "New brand": no verdict, no figure.
    var isNew: Bool
    /// "64 decisions in the last 90 days."
    var sampleLabel: String
    var trendLabel: String?
    var components: [ReliabilityComponent]
    var recentBounties: [FeedItem]
}

struct SavedBounty: Codable, Hashable, Identifiable, Sendable {
    var save: BountySave
    var item: FeedItem

    var id: String {
        return save.id
    }
}

// MARK: - Daily Drop

struct DropItemView: Codable, Hashable, Identifiable, Sendable {
    var item: FeedItem
    var spotsTotal: Int
    /// A true count.
    var spotsLeft: Int
    var claimedByMe: Bool

    var id: String {
        return item.bounty.id
    }
}

/// Today's Daily Drop: pre-drop, live or sold out, always with true inventory.
struct DailyDropView: Codable, Hashable, Identifiable, Sendable {
    var drop: DailyDrop
    var state: DropStatus
    var items: [DropItemView]
    var releaseAt: Date
    var claimWindowEndsAt: Date
    /// The next drop after this one (16:00 UTC the next day).
    var nextDropAt: Date
    /// "Gold gets a 3 hour head start" when the tier has one.
    var headStartNote: String?

    var id: String {
        return drop.id
    }
}

// MARK: - First-Dollar Path

enum FirstDollarStepKind: String, Codable, Hashable, Sendable, CaseIterable {
    case scoredTake = "scored_take"
    case submitted
    case approved
    case cleared
}

struct FirstDollarStep: Codable, Hashable, Identifiable, Sendable {
    var kind: FirstDollarStepKind
    var title: String
    var detail: String
    var done: Bool
    var etaAt: Date?

    var id: String {
        return kind.rawValue
    }
}

struct FirstDollarPath: Codable, Hashable, Sendable {
    var steps: [FirstDollarStep]
    /// The flowd-funded starter bounty.
    var starter: FeedItem?
    /// "Cleared by Tue 2:00 PM" (an estimate: approval is not guaranteed).
    var clearedByEstimate: Date?
    /// True once the first dollar has cleared: the tracker retires.
    var retired: Bool
    var note: String
}

/// The earnings preview shown before sign-up.
struct EarningsPreview: Codable, Hashable, Sendable {
    var niche: Niche
    var typical: TypicalBand
    /// A top example in the same size class, always shown beside the typical.
    var topExampleCents: Int
    var sample: FeedItem?
    var footnote: String
}

// MARK: - Submissions

struct SubmissionListItem: Codable, Hashable, Identifiable, Sendable {
    var submission: Submission
    var bountyTitle: String
    var brand: BrandCard
    var thumb: ArtSeed
    /// The review clock while the brand has it (nil once decided).
    var clock: ReviewClock?
    /// "In review. Decide by Fri 2:00 PM".
    var statusLine: String
    var openNotes: Int

    var id: String {
        return submission.id
    }
}

struct SubmissionDetail: Codable, Hashable, Identifiable, Sendable {
    var submission: Submission
    var bounty: Bounty
    var brand: BrandCard
    var notes: [FeedbackNote]
    var analysis: VideoAnalysis?
    var post: Post?
    var link: AttributionLink?
    var offerCode: OfferCode?
    var clock: ReviewClock?
    var roundsLeft: Int
    var canRevise: Bool
    var canAppeal: Bool
    var canWithdraw: Bool
    var canPost: Bool
    var appealDeadline: Date?
    /// The locked caption with the disclosure first, the tracking link and the hashtags.
    var captionDraft: String?
    var trackingLine: String?

    var id: String {
        return submission.id
    }
}

enum SubmissionFilter: String, Codable, Hashable, Sendable, CaseIterable {
    case all
    case inReview = "in_review"
    case needsChanges = "needs_changes"
    case approved
    case rejected
    case posted
    case closed

    var title: String {
        switch self {
        case .all: return "All"
        case .inReview: return "In review"
        case .needsChanges: return "Needs changes"
        case .approved: return "Approved"
        case .rejected: return "Not approved"
        case .posted: return "Posted"
        case .closed: return "Closed"
        }
    }
}

/// A resumable upload session (mock: simulated chunks).
struct UploadSession: Codable, Hashable, Identifiable, Sendable {
    var uploadId: String
    var assetId: String
    var uploadUrl: String?
    var chunkSizeBytes: Int
    var expiresAt: Date

    var id: String {
        return uploadId
    }
}

// MARK: - Posts

struct PostListItem: Codable, Hashable, Identifiable, Sendable {
    var post: Post
    var bountyTitle: String
    var brand: BrandCard
    var appName: String
    var earningsCents: Int
    var pendingCents: Int
    var clearedCents: Int
    var paidCents: Int
    var heldCents: Int
    /// The state of the post's money, with the dated ETA.
    var moneyState: MoneyClockState
    var clearsAt: Date?
    var reasonLabel: String

    var id: String {
        return post.id
    }
}

enum PostFilter: String, Codable, Hashable, Sendable, CaseIterable {
    case all
    case live
    case clearing
    case cleared
    case paid
    case held

    var title: String {
        switch self {
        case .all: return "All"
        case .live: return "Live"
        case .clearing: return "Clearing"
        case .cleared: return "Cleared"
        case .paid: return "Paid"
        case .held: return "Held"
        }
    }
}

struct PostDetail: Codable, Hashable, Identifiable, Sendable {
    var post: Post
    var bounty: Bounty
    var brand: BrandCard
    var appName: String
    var moneyRows: [MoneyClockRow]
    var conversions: [Conversion]
    var link: AttributionLink?
    var rights: [RightsGrant]
    var disputes: [Dispute]
    var timeline: [TimelineStep]
    var clock: EarningDescription?
    /// 0 to 1: how much of the per-video cap the post's pay has used.
    var capProgress: Double
    var canDispute: Bool

    var id: String {
        return post.id
    }
}

/// A source's share of a post's views.
struct TrafficShare: Codable, Hashable, Identifiable, Sendable {
    var source: String
    var share: Double

    var id: String {
        return source
    }
}

struct ViewLedger: Codable, Hashable, Sendable {
    var post: Post
    /// Snapshots every 6 hours inside the 72-hour window, oldest first.
    var snapshots: [ViewSnapshot]
    var verifiedViews: Int
    var invalidViews: Int
    var reportedViews: Int
    /// Excluded views with the plain-language cause.
    var exclusions: [ViewExclusion]
    var sourceSplit: [TrafficShare]
    var disputes: [Dispute]
    var canDispute: Bool
}

// MARK: - Tier

struct TierLadderRow: Codable, Hashable, Identifiable, Sendable {
    var tier: Tier
    var thresholds: TierThresholds
    var perks: TierPerks
    var perkLines: [String]
    var isCurrent: Bool
    var isReached: Bool

    var id: String {
        return tier.rawValue
    }
}

struct TierStatus: Codable, Hashable, Sendable {
    var current: Tier
    var basis: TierBasis
    var since: Date
    /// During a grace hold: no tier drop before this.
    var holdUntil: Date?
    var graceDaysLeft: Int?
    var progress: TierProgress
    var remaining: [TierRemaining]
    var perks: TierPerks
    var perkLines: [String]
    var unlocksNext: [String]
    var ladder: [TierLadderRow]
    var history: [TierEvent]
    var stats: TierStatsSnapshot
    /// "No tier drop for 30 days after a dip."
    var graceNote: String
}

// MARK: - Offers and rate card

struct OfferSummary: Codable, Hashable, Identifiable, Sendable {
    var offer: Offer
    var brand: BrandCard
    var appName: String
    var appIcon: ArtSeed
    /// The ball is in the creator's court.
    var awaitingMe: Bool
    /// "Expires in 5 days".
    var expiresLabel: String

    var id: String {
        return offer.id
    }
}

struct OfferDetail: Codable, Hashable, Identifiable, Sendable {
    var summary: OfferSummary
    var scorecard: BrandScorecard?
    var rightsLines: [RightsLine]
    /// What the creator would earn at their own median views if this were a view-based bounty (for context against the flat price).
    var payContext: ExpectedPay?
    var counterRoundsLeft: Int
    var canAccept: Bool
    var canCounter: Bool
    var canDecline: Bool
    var marketBand: RateSuggestion?

    var id: String {
        return summary.offer.id
    }
}

struct RateCardView: Codable, Hashable, Sendable {
    var card: RateCard?
    var tier: Tier
    /// Silver and above.
    var unlocked: Bool
    var lockText: String?
    var suggested: RateSuggestion?
    /// How a brand sees the card.
    var storefrontURL: String
}

// MARK: - Rights

struct RightsItem: Codable, Hashable, Identifiable, Sendable {
    var grant: RightsGrant
    var brand: BrandCard
    var postTitle: String
    var thumb: ArtSeed?
    var daysLeft: Double?
    var statusLabel: String
    var renewal: RenewalQuote?

    var id: String {
        return grant.id
    }
}

struct RightsOverview: Codable, Hashable, Sendable {
    var items: [RightsItem]
    /// Alerts that should go out now: the most urgent per grant.
    var alertsDue: [RightsAlert]
    /// What renewing everything that ends inside 30 days for one more period would pay the creator.
    var renewalExposureCents: Int
}

struct RightsAlert: Codable, Hashable, Identifiable, Sendable {
    var grantId: String
    var days: Int

    var id: String {
        return grantId
    }
}

// MARK: - Tax

struct TaxSummary: Codable, Hashable, Sendable {
    var profile: TaxProfile
    var docs: [TaxDoc]
    var numbers: TaxDeskNumbers
    var w9Needed: Bool
    var nextStep: String?
    /// "Not tax advice."
    var disclaimer: String
}

// MARK: - Inbox

struct InboxThread: Codable, Hashable, Identifiable, Sendable {
    var thread: ChatThread
    var counterpart: String
    var counterpartArt: ArtSeed?
    var preview: String
    var unread: Int
    var kindLabel: String

    var id: String {
        return thread.id
    }
}

enum ActivityFilter: String, Codable, Hashable, Sendable, CaseIterable {
    case all
    case money
    case reviews
    case offers
    case tier

    var title: String {
        switch self {
        case .all: return "All"
        case .money: return "Money"
        case .reviews: return "Reviews"
        case .offers: return "Offers"
        case .tier: return "Tier"
        }
    }
}

// MARK: - Compete and grow

struct LeaderboardRow: Codable, Hashable, Identifiable, Sendable {
    var entry: LeaderboardEntry
    var creator: CreatorSummary
    var isMe: Bool

    var id: String {
        return creator.id
    }
}

struct LeaderboardStanding: Codable, Hashable, Sendable {
    var leaderboard: Leaderboard
    var rows: [LeaderboardRow]
    var me: LeaderboardRow?
    var resetsAt: Date
    /// "Earn your first $1" state: not ranked yet.
    var unranked: Bool
    var optedOut: Bool
}

struct TournamentEntryRow: Codable, Hashable, Identifiable, Sendable {
    var entry: TournamentEntry
    var creator: CreatorSummary
    var isMe: Bool

    var id: String {
        return entry.id
    }
}

struct TournamentView: Codable, Hashable, Identifiable, Sendable {
    var tournament: Tournament
    var myEntry: TournamentEntry?
    var canEnter: Bool
    var lockReason: String?
    var entries: [TournamentEntryRow]

    var id: String {
        return tournament.id
    }
}

struct CrewMemberRow: Codable, Hashable, Identifiable, Sendable {
    var member: CrewMember
    var creator: CreatorSummary
    var isMe: Bool

    var id: String {
        return member.id
    }
}

struct CrewView: Codable, Hashable, Identifiable, Sendable {
    var crew: Crew
    var members: [CrewMemberRow]
    var isMine: Bool
    var myRole: CrewRole?
    /// 0 to 1: this week's cleared money over the weekly goal.
    var goalProgress: Double
    /// "Crew bonus: 3% of the goal, up to $250, paid by flowd".
    var bonusNote: String

    var id: String {
        return crew.id
    }
}

struct CrewDirectory: Codable, Hashable, Sendable {
    var mine: CrewView?
    var discover: [CrewView]
    var canCreate: Bool
    var createLockText: String?
}

struct ReferralSummary: Codable, Hashable, Sendable {
    var code: String
    /// "joinflowd.io/c/maya.makes?ref=MAYA6".
    var link: String
    var referrals: [Referral]
    var joinedCount: Int
    var earnedCents: Int
    var rules: [String]
}

struct StreakSummary: Codable, Hashable, Sendable {
    var streak: Streak
    var copy: StreakCopy
    var restWeeksRemainingThisQuarter: Int
    var canDeclareRestWeek: Bool
    var restWeekReason: String?
}

struct LessonItem: Codable, Hashable, Identifiable, Sendable {
    var lesson: Lesson
    var progress: LessonProgress?

    var id: String {
        return lesson.id
    }
}

struct BadgeItem: Codable, Hashable, Identifiable, Sendable {
    var badge: BadgeId
    var earned: Bool
    var criteria: String

    var id: String {
        return badge.rawValue
    }
}

struct AcademyOverview: Codable, Hashable, Sendable {
    var lessons: [LessonItem]
    var completedCount: Int
    var badges: [BadgeItem]
    /// Reliability points earned from lessons (0.5 each, up to 5).
    var reliabilityBonusPoints: Double
    var nextLesson: Lesson?
}

struct LessonResult: Codable, Hashable, Sendable {
    var lesson: Lesson
    var progress: LessonProgress
    var correct: [Bool]
    var score: Double
    var passed: Bool
    var badgeAwarded: Bool
}

struct RemixLibrary: Codable, Hashable, Sendable {
    var formats: [Format]
    var hooks: [Hook]
    var trends: [Trend]
}

// MARK: - Profile

/// A creator's public storefront: verified stats beside the creator's own words.
struct CreatorProfile: Codable, Hashable, Identifiable, Sendable {
    var creator: Creator
    var accounts: [SocialAccount]
    var featuredPosts: [Post]
    var rateCard: RateCard?
    var shareURL: String
    var typicalMedianCents: Int?

    var id: String {
        return creator.id
    }
}

// MARK: - Studio

struct PreflightCheck: Codable, Hashable, Identifiable, Sendable {
    var check: QaCheckType
    var result: QaResult
    var title: String
    var message: String
    /// A missing disclosure blocks settlement.
    var blocking: Bool
    var fix: String?
    var evidence: Evidence?

    var id: String {
        return check.rawValue
    }
}

struct PreflightResult: Codable, Hashable, Sendable {
    var checks: [PreflightCheck]
    var canSubmit: Bool
    var blockingCount: Int
    var warningCount: Int
    /// The caption with the disclosure locked first.
    var captionDraft: String
}

/// A request to Flo, the in-app copilot (a mock engine behind an `AIProvider` interface).
struct FloRequest: Codable, Hashable, Sendable {
    var surface: FloSurface
    var kind: FloKind
    var prompt: String
    var contextKind: String?
    var contextId: String?
    var bountyId: String?
    var formatId: FormatId?
    var hookText: String?

    init(
        surface: FloSurface,
        kind: FloKind,
        prompt: String,
        contextKind: String? = nil,
        contextId: String? = nil,
        bountyId: String? = nil,
        formatId: FormatId? = nil,
        hookText: String? = nil
    ) {
        self.surface = surface
        self.kind = kind
        self.prompt = prompt
        self.contextKind = contextKind
        self.contextId = contextId
        self.bountyId = bountyId
        self.formatId = formatId
        self.hookText = hookText
    }
}

// MARK: - Home

struct HomeSummary: Codable, Hashable, Sendable {
    var creator: Creator
    var wallet: WalletSummary
    var drop: DailyDropView?
    var streak: StreakSummary
    var activeSubmissions: [SubmissionListItem]
    var matched: [FeedItem]
    var trends: [Trend]
    var firstDollar: FirstDollarPath?
    var unreadCount: Int
    var nextLesson: Lesson?
    var recentActivity: [AppNotification]
    var liveDemo: Bool
}
