import Foundation

// Request payloads for the mutating calls of `FlowdAPI`. Every struct encodes with the API encoder (`FlowdJSON.makeAPIEncoder()`: snake_case keys,
// ISO-8601 dates). Calls that move money or create a settlement artefact carry an `idempotencyKey` (sent as the `Idempotency-Key` header): a repeated
// key returns the original response, so a double tap or a retry never pays twice. Privacy: the contract never carries tokens, full card or bank numbers
// or a full TIN, only the last four digits.

// MARK: - Profile

/// Fields a creator can change on their profile. Only the non-nil fields change.
struct ProfileUpdate: Codable, Hashable, Sendable {
    var displayName: String?
    var handle: String?
    var bio: String?
    var niches: [Niche]?
    var country: Country?
    var languages: [String]?
    var storefront: Storefront?
    var portfolio: [PortfolioItem]?
    var openToOffers: Bool?
    var onboardingStage: OnboardingStage?

    init(
        displayName: String? = nil,
        handle: String? = nil,
        bio: String? = nil,
        niches: [Niche]? = nil,
        country: Country? = nil,
        languages: [String]? = nil,
        storefront: Storefront? = nil,
        portfolio: [PortfolioItem]? = nil,
        openToOffers: Bool? = nil,
        onboardingStage: OnboardingStage? = nil
    ) {
        self.displayName = displayName
        self.handle = handle
        self.bio = bio
        self.niches = niches
        self.country = country
        self.languages = languages
        self.storefront = storefront
        self.portfolio = portfolio
        self.openToOffers = openToOffers
        self.onboardingStage = onboardingStage
    }
}

/// Mock OAuth: link a TikTok, Instagram or YouTube account (read-only; flowd never posts for you).
struct LinkAccountRequest: Codable, Hashable, Sendable {
    var platform: Platform
    var handle: String
}

// MARK: - Submissions

/// Submit a take to a bounty. Creates v1 and takes a Reserved Slot from the pool.
struct SubmitRequest: Codable, Hashable, Sendable {
    var bountyId: String
    var title: String
    var formatId: FormatId?
    var source: SubmissionSource
    var video: VideoMeta
    var hookText: String?
    var hookBand: ScoreBand
    var hookPoints: Int
    var flowBand: ScoreBand
    var flowPoints: Int
    var qaPass: Int
    var qaWarn: Int
    var qaFail: Int
    /// The Rights Card the creator accepted (a snapshot; later edits to the bounty never change it).
    var rightsAccepted: Bool
    var caption: String?
    /// A claimed Daily Drop spot this submission uses.
    var dropId: String?
    var idempotencyKey: String

    init(
        bountyId: String,
        title: String,
        formatId: FormatId? = nil,
        source: SubmissionSource = .studio,
        video: VideoMeta,
        hookText: String? = nil,
        hookBand: ScoreBand = .c,
        hookPoints: Int = 0,
        flowBand: ScoreBand = .c,
        flowPoints: Int = 0,
        qaPass: Int = 0,
        qaWarn: Int = 0,
        qaFail: Int = 0,
        rightsAccepted: Bool = true,
        caption: String? = nil,
        dropId: String? = nil,
        idempotencyKey: String = UUID().uuidString
    ) {
        self.bountyId = bountyId
        self.title = title
        self.formatId = formatId
        self.source = source
        self.video = video
        self.hookText = hookText
        self.hookBand = hookBand
        self.hookPoints = hookPoints
        self.flowBand = flowBand
        self.flowPoints = flowPoints
        self.qaPass = qaPass
        self.qaWarn = qaWarn
        self.qaFail = qaFail
        self.rightsAccepted = rightsAccepted
        self.caption = caption
        self.dropId = dropId
        self.idempotencyKey = idempotencyKey
    }
}

/// Upload the next version after a "changes requested" decision.
struct ReviseRequest: Codable, Hashable, Sendable {
    var video: VideoMeta
    var hookBand: ScoreBand
    var hookPoints: Int
    var flowBand: ScoreBand
    var flowPoints: Int
    var qaPass: Int
    var qaWarn: Int
    var qaFail: Int
    var changesSummary: String?
    /// Must-fix notes the creator ticked off in this version.
    var resolvedNoteIds: [String]
    var idempotencyKey: String

    init(
        video: VideoMeta,
        hookBand: ScoreBand = .c,
        hookPoints: Int = 0,
        flowBand: ScoreBand = .c,
        flowPoints: Int = 0,
        qaPass: Int = 0,
        qaWarn: Int = 0,
        qaFail: Int = 0,
        changesSummary: String? = nil,
        resolvedNoteIds: [String] = [],
        idempotencyKey: String = UUID().uuidString
    ) {
        self.video = video
        self.hookBand = hookBand
        self.hookPoints = hookPoints
        self.flowBand = flowBand
        self.flowPoints = flowPoints
        self.qaPass = qaPass
        self.qaWarn = qaWarn
        self.qaFail = qaFail
        self.changesSummary = changesSummary
        self.resolvedNoteIds = resolvedNoteIds
        self.idempotencyKey = idempotencyKey
    }
}

/// One appeal per rejection, within 7 days.
struct AppealRequest: Codable, Hashable, Sendable {
    var reason: String
    var note: String?
    var evidence: [Evidence]
    var idempotencyKey: String

    init(reason: String, note: String? = nil, evidence: [Evidence] = [], idempotencyKey: String = UUID().uuidString) {
        self.reason = reason
        self.note = note
        self.evidence = evidence
        self.idempotencyKey = idempotencyKey
    }
}

/// Attach the post URL; opens the 72-hour window.
struct AttachPostRequest: Codable, Hashable, Sendable {
    var url: String
    var platform: Platform
    var socialAccountId: String?
    var caption: String?
    var idempotencyKey: String

    init(url: String, platform: Platform, socialAccountId: String? = nil, caption: String? = nil, idempotencyKey: String = UUID().uuidString) {
        self.url = url
        self.platform = platform
        self.socialAccountId = socialAccountId
        self.caption = caption
        self.idempotencyKey = idempotencyKey
    }
}

/// Start a resumable upload.
struct UploadRequest: Codable, Hashable, Sendable {
    var fileName: String
    var sizeBytes: Int
    var durationMs: Int
    var width: Int
    var height: Int
    var contentType: String

    init(fileName: String, sizeBytes: Int, durationMs: Int, width: Int = 1080, height: Int = 1920, contentType: String = "video/mp4") {
        self.fileName = fileName
        self.sizeBytes = sizeBytes
        self.durationMs = durationMs
        self.width = width
        self.height = height
        self.contentType = contentType
    }
}

// MARK: - Posts and disputes

/// One-tap dispute about a post's views (or anything else money-related).
struct DisputeRequest: Codable, Hashable, Sendable {
    var postId: String
    var kind: DisputeKind
    var rangeFrom: Date?
    var rangeTo: Date?
    var reason: String
    var note: String
    var evidence: [Evidence]
    var idempotencyKey: String

    init(
        postId: String,
        kind: DisputeKind = .viewCount,
        rangeFrom: Date? = nil,
        rangeTo: Date? = nil,
        reason: String,
        note: String = "",
        evidence: [Evidence] = [],
        idempotencyKey: String = UUID().uuidString
    ) {
        self.postId = postId
        self.kind = kind
        self.rangeFrom = rangeFrom
        self.rangeTo = rangeTo
        self.reason = reason
        self.note = note
        self.evidence = evidence
        self.idempotencyKey = idempotencyKey
    }
}

// MARK: - Money

struct InstantPayoutRequest: Codable, Hashable, Sendable {
    var amountCents: Int
    var methodId: String?
    var idempotencyKey: String

    init(amountCents: Int, methodId: String? = nil, idempotencyKey: String = UUID().uuidString) {
        self.amountCents = amountCents
        self.methodId = methodId
        self.idempotencyKey = idempotencyKey
    }
}

/// Add a bank account or debit card (a mock Connect sheet; only the last four digits are ever stored).
struct AddPayoutMethodRequest: Codable, Hashable, Sendable {
    var kind: PayoutMethodKind
    var label: String
    var last4: String
}

/// The W-9 form, collected just in time at the first approval. The full TIN goes to the tax provider, never into flowd data: only the last four
/// digits travel here.
struct W9Request: Codable, Hashable, Sendable {
    var form: TaxForm
    var legalName: String
    var entityType: TaxEntityType
    var tinLast4: String
    var address: Address
    var signedName: String

    init(form: TaxForm = .w9, legalName: String, entityType: TaxEntityType = .individual, tinLast4: String, address: Address, signedName: String) {
        self.form = form
        self.legalName = legalName
        self.entityType = entityType
        self.tinLast4 = tinLast4
        self.address = address
        self.signedName = signedName
    }
}

/// Create a public proof page: an Earnings Card, a month recap, a tier-up or a Wrapped.
struct ProofRequest: Codable, Hashable, Sendable {
    var kind: ProofKind
    var payoutId: String?
    var periodLabel: String
    var periodStart: String
    var periodEnd: String
    var amountCents: Int
    var postsCount: Int
    /// Hide the amount on the card (the proof page still shows the typical median line).
    var anonymous: Bool
}

// MARK: - Offers and rate card

struct OfferCounterRequest: Codable, Hashable, Sendable {
    var amountCents: Int
    var rightsDays: Int?
    var message: String?
    var idempotencyKey: String

    init(amountCents: Int, rightsDays: Int? = nil, message: String? = nil, idempotencyKey: String = UUID().uuidString) {
        self.amountCents = amountCents
        self.rightsDays = rightsDays
        self.message = message
        self.idempotencyKey = idempotencyKey
    }
}

/// Edit the rate card (Silver and above).
struct RateCardUpdate: Codable, Hashable, Sendable {
    var pricePerVideoCents: Int
    var minCpmCents: Int
    var paidUsageDays: Int
    var turnaroundDays: Int
    var maxVideosPerMonth: Int
    var platforms: [Platform]
    var formatIds: [FormatId]
    var categoriesExcluded: [AppCategory]
    var acceptsDirectOffers: Bool
    var packages: [RatePackage]
}

// MARK: - Safety

struct ScamReportRequest: Codable, Hashable, Sendable {
    var targetKind: ReportTargetKind
    var targetId: String
    var reason: ScamReason
    var description: String
    var evidenceRefs: [String]
    var idempotencyKey: String

    init(targetKind: ReportTargetKind, targetId: String, reason: ScamReason, description: String, evidenceRefs: [String] = [], idempotencyKey: String = UUID().uuidString) {
        self.targetKind = targetKind
        self.targetId = targetId
        self.reason = reason
        self.description = description
        self.evidenceRefs = evidenceRefs
        self.idempotencyKey = idempotencyKey
    }
}

// MARK: - Compete and grow

struct TournamentEntryRequest: Codable, Hashable, Sendable {
    var hookText: String
    var submissionId: String?
}

struct CreateCrewRequest: Codable, Hashable, Sendable {
    var name: String
    var tagline: String
    var niche: Niche
    var isOpen: Bool
}

struct CreateSpecRequest: Codable, Hashable, Sendable {
    var title: String
    var description: String
    var video: VideoMeta
    var formatId: FormatId?
    var hookText: String
    var hookType: HookType
    var category: AppCategory
    var priceCents: Int
    var paidAdsDays: Int
    var exclusive: Bool
}

struct CreateAuctionRequest: Codable, Hashable, Sendable {
    var title: String
    var description: String
    var slots: Int
    var reserveCents: Int
    var opensAt: Date
    var closesAt: Date
}
