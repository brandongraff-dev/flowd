import Foundation

// The navigation vocabulary of the whole app: personas and their tabs, the typed `Route` (every screen in docs/SCREENS.md that can be reached from
// somewhere else, from a deep link or from a launch argument), the Studio flow's own `StudioRoute`, and the small payload types the routes carry.
//
// Rules
//  - A `Route` is a value: ids and tiny enums only, never a model or a closure. The destination loads what it needs from `FlowdAPI`.
//  - `Route.presentation` says how it is shown: a tab root, a push on the current tab's stack, a sheet or a full-screen cover.
//  - Add a case here, then give it a view in `ScreenRegistry` and a row in `FEATURE_CONTRACT.md`. The switches below are exhaustive on purpose.

// MARK: - Personas

/// The three demo personas. Creator is the default; Brand and Admin are mobile companions (docs/SCREENS.md sections 10 and 11).
enum AppPersona: String, CaseIterable, Hashable, Sendable, Identifiable {
    case creator
    case brand
    case admin

    var id: String {
        return rawValue
    }

    var title: String {
        switch self {
        case .creator: return "Creator"
        case .brand: return "Brand"
        case .admin: return "Admin"
        }
    }

    /// The demo account behind the persona.
    var demoAccount: String {
        switch self {
        case .creator: return "Maya Reyes, @maya.makes"
        case .brand: return "Jordan Ellis, Lumi"
        case .admin: return "Ops, flowd"
        }
    }

    var systemImage: String {
        switch self {
        case .creator: return "video.fill"
        case .brand: return "building.2.fill"
        case .admin: return "shield.lefthalf.filled"
        }
    }
}

// MARK: - Tabs

/// The creator shell's four tabs. The centre slot is the Studio action, not a tab.
enum AppTab: String, CaseIterable, Hashable, Sendable {
    case home
    case bounties
    case wallet
    case profile

    var title: String {
        switch self {
        case .home: return "Home"
        case .bounties: return "Bounties"
        case .wallet: return "Wallet"
        case .profile: return "Profile"
        }
    }

    var systemImage: String {
        switch self {
        case .home: return "house"
        case .bounties: return "target"
        case .wallet: return "creditcard"
        case .profile: return "person.crop.circle"
        }
    }

    var selectedSystemImage: String {
        switch self {
        case .home: return "house.fill"
        case .bounties: return "target"
        case .wallet: return "creditcard.fill"
        case .profile: return "person.crop.circle.fill"
        }
    }
}

/// Brand mode tabs (docs/SCREENS.md section 10).
enum BrandTab: String, CaseIterable, Hashable, Sendable {
    case overview
    case review
    case bounties
    case insights
    case wallet

    var title: String {
        switch self {
        case .overview: return "Overview"
        case .review: return "Review"
        case .bounties: return "Bounties"
        case .insights: return "Insights"
        case .wallet: return "Wallet"
        }
    }

    var systemImage: String {
        switch self {
        case .overview: return "square.grid.2x2"
        case .review: return "checkmark.seal"
        case .bounties: return "target"
        case .insights: return "chart.line.uptrend.xyaxis"
        case .wallet: return "creditcard"
        }
    }

    var selectedSystemImage: String {
        switch self {
        case .overview: return "square.grid.2x2.fill"
        case .review: return "checkmark.seal.fill"
        case .bounties: return "target"
        case .insights: return "chart.line.uptrend.xyaxis"
        case .wallet: return "creditcard.fill"
        }
    }
}

/// Admin mode tabs (docs/SCREENS.md section 11): Control / Queues / Money / Market / More.
enum AdminTab: String, CaseIterable, Hashable, Sendable {
    case control
    case queues
    case money
    case market
    case more

    var title: String {
        switch self {
        case .control: return "Control"
        case .queues: return "Queues"
        case .money: return "Money"
        case .market: return "Market"
        case .more: return "More"
        }
    }

    var systemImage: String {
        switch self {
        case .control: return "gauge"
        case .queues: return "tray.full"
        case .money: return "banknote"
        case .market: return "chart.bar"
        case .more: return "ellipsis.circle"
        }
    }

    var selectedSystemImage: String {
        switch self {
        case .control: return "gauge"
        case .queues: return "tray.full.fill"
        case .money: return "banknote.fill"
        case .market: return "chart.bar.fill"
        case .more: return "ellipsis.circle.fill"
        }
    }
}

// MARK: - Small payload types

/// What a permission primer or recovery screen is about. Camera, microphone and speech are asked in Studio; notifications after the first
/// submission ("Know the minute you're paid"); photos for the camera-roll import.
enum PermissionKind: String, CaseIterable, Hashable, Sendable {
    case camera
    case microphone
    case speech
    case notifications
    case photos

    var title: String {
        switch self {
        case .camera: return "Camera"
        case .microphone: return "Microphone"
        case .speech: return "Speech recognition"
        case .notifications: return "Notifications"
        case .photos: return "Photos"
        }
    }

    var systemImage: String {
        switch self {
        case .camera: return "camera.fill"
        case .microphone: return "mic.fill"
        case .speech: return "waveform"
        case .notifications: return "bell.fill"
        case .photos: return "photo.on.rectangle"
        }
    }
}

/// Settings screens that `Route.settings(_:)` can open directly (nil is the hub).
enum SettingsSection: String, CaseIterable, Hashable, Sendable {
    case account
    case notifications
    case appearance
    case privacy
    case help

    var title: String {
        switch self {
        case .account: return "Account"
        case .notifications: return "Notifications"
        case .appearance: return "Appearance"
        case .privacy: return "Privacy and data"
        case .help: return "Help and support"
        }
    }
}

/// The in-app legal readers (all "Draft, not legal advice").
enum LegalDocument: String, CaseIterable, Hashable, Sendable {
    case creatorAgreement = "creator-agreement"
    case privacy
    case earningsDisclosure = "earnings-disclosure"
    case usageRights = "usage-rights"
    case communityRules = "community-rules"

    var title: String {
        switch self {
        case .creatorAgreement: return "Creator Agreement"
        case .privacy: return "Privacy policy"
        case .earningsDisclosure: return "Earnings disclosure"
        case .usageRights: return "Usage rights"
        case .communityRules: return "Community rules"
        }
    }
}

/// What the dispute sheet opens on: a new dispute about a post, or an existing case.
enum DisputeTarget: Hashable, Sendable {
    /// Open (or view the open) dispute about a post's views, with its View Ledger evidence attached.
    case post(String)
    /// An existing dispute by id (`disp_...`), from a notification.
    case existing(String)
}

/// What an Earnings Card is made from.
enum EarningsCardSource: Hashable, Sendable {
    /// The most recent period (the current month).
    case latest
    /// A payout (`pay_...`).
    case payout(String)
    /// An existing proof page (`prf_...`), also what `joinflowd.io/p/<id>` opens.
    case proof(String)
}

/// Where Flo is opened from and what it already knows. Everything is optional; Flo falls back to the creator's own context.
struct FloLaunchContext: Hashable, Sendable {
    var surface: FloSurface
    var bountyID: String?
    var formatID: FormatId?
    var hookText: String?
    /// A question to send right away (a chip's text, "Write 3 scripts").
    var prompt: String?

    init(surface: FloSurface = .home, bountyID: String? = nil, formatID: FormatId? = nil, hookText: String? = nil, prompt: String? = nil) {
        self.surface = surface
        self.bountyID = bountyID
        self.formatID = formatID
        self.hookText = hookText
        self.prompt = prompt
    }

    /// Flo from Home.
    static let home: FloLaunchContext = FloLaunchContext(surface: .home)
}

// MARK: - Studio

/// Where the Studio full-screen cover opens (`Route.studio`).
enum StudioEntry: Hashable, Sendable {
    /// The centre action: the launcher (continue a draft, pick a bounty or free practice, suggested formats).
    case launcher
    /// "Make it" on a bounty, or "Remix this": straight into the format picker, or the script step when a format or hook is given.
    case makeIt(bountyID: String, formatID: FormatId?, hook: String?)
    /// The "Record" fan action. With a bounty it starts that bounty's flow; without one the launcher asks which bounty or free practice.
    case record(bountyID: String?)
    /// Opens the capture screen itself for a bounty (a fresh draft is created on the first record).
    case capture(bountyID: String)
    /// The "Upload" fan action: the camera-roll import sheet opens at once (the launcher reacts to this entry).
    case importVideo(bountyID: String?)
    /// The "Script with Flo" fan action: Flo opens first, the chosen script lands in the script step (the launcher reacts to this entry).
    case scriptWithFlo(bountyID: String?)
    /// "Continue draft": resumes at the draft's stage.
    case resume(draftID: String)
    /// Revise a submission after "changes requested".
    case revise(submissionID: String)

    /// The steps already pushed on top of the launcher when the cover opens. `draft` is the stored draft for `.resume` (looked up by the host).
    func initialPath(draft: DraftSnapshot?) -> [StudioRoute] {
        switch self {
        case .launcher:
            return []
        case .makeIt(let bountyID, let formatID, let hook):
            if formatID != nil || hook != nil {
                return [StudioRoute.script(bountyID: bountyID, formatID: formatID, hook: hook, draftID: nil)]
            }
            return [StudioRoute.formatPicker(bountyID: bountyID, preselected: nil)]
        case .record(let bountyID):
            if let id = bountyID {
                return [StudioRoute.formatPicker(bountyID: id, preselected: nil)]
            }
            return []
        case .capture(let bountyID):
            return [StudioRoute.capture(bountyID: bountyID, draftID: nil)]
        case .importVideo, .scriptWithFlo:
            return []
        case .resume:
            guard let draft = draft else {
                return []
            }
            let hook: String? = draft.hookText.isEmpty ? nil : draft.hookText
            switch draft.stage {
            case .script:
                return [StudioRoute.script(bountyID: draft.bountyId, formatID: draft.formatId, hook: hook, draftID: draft.id)]
            case .capture:
                return [StudioRoute.capture(bountyID: draft.bountyId, draftID: draft.id)]
            case .edit:
                return [StudioRoute.edit(draftID: draft.id)]
            case .score:
                return [StudioRoute.score(draftID: draft.id)]
            case .submit:
                return [StudioRoute.submit(draftID: draft.id)]
            }
        case .revise(let submissionID):
            return [StudioRoute.revision(submissionID: submissionID)]
        }
    }
}

/// The steps pushed inside the Studio cover (its own `NavigationStack`, driven by `StudioRouter`). The flow is
/// launcher -> formatPicker -> script -> capture -> hookCoach -> takeReview -> edit -> (captions, silenceCut, screenOverlay) -> score -> preflight
/// -> (variants) -> submit. Every step after the script is keyed by the draft (`DraftSnapshot.id`), which carries the bounty, format, script,
/// stage, scores and the recorded file between the two Studio agents.
enum StudioRoute: Hashable, Sendable {
    // Capture area
    case formatPicker(bountyID: String, preselected: FormatId?)
    case script(bountyID: String, formatID: FormatId?, hook: String?, draftID: String?)
    case capture(bountyID: String, draftID: String?)
    case hookCoach(draftID: String)
    case permissionRecovery(PermissionKind)
    case takeReview(draftID: String)
    // Edit area
    case edit(draftID: String)
    case captions(draftID: String)
    case silenceCut(draftID: String)
    case screenOverlay(draftID: String)
    case score(draftID: String)
    case preflight(draftID: String)
    case variants(draftID: String)
    case submit(draftID: String)
    case revision(submissionID: String)
}

// MARK: - Brand and Admin modes

/// Brand mode destinations (docs/SCREENS.md section 10). The five tab roots are `BrandTab`s, not routes.
enum BrandRoute: Hashable, Sendable {
    case reviewDetail(submissionID: String)
    case bountyDetail(bountyID: String)
    case creators
    case creatorProfile(creatorID: String)
    case autoApproveRules
    case notificationsAndSettings
    /// Fund escrow (a calm sheet, card mock).
    case fundEscrow
    /// Send a direct offer to a creator.
    case sendOffer(creatorID: String)

    var presentation: RoutePresentation {
        switch self {
        case .fundEscrow, .sendOffer:
            return .sheet
        case .reviewDetail, .bountyDetail, .creators, .creatorProfile, .autoApproveRules, .notificationsAndSettings:
            return .push
        }
    }
}

/// Admin mode destinations (docs/SCREENS.md section 11). The five tab roots are `AdminTab`s, not routes.
enum AdminRoute: Hashable, Sendable {
    case fraudCase(flagID: String)
    case dispute(disputeID: String)
    case verification(verificationID: String)
    case payoutRun(runID: String)
    case mlCalibration
    case auditLog
    case lookup(query: String?)
    case creatorDetail(creatorID: String)
    case brandDetail(brandID: String)

    var presentation: RoutePresentation {
        return .push
    }
}

// MARK: - Presentation

enum RoutePresentation: Hashable, Sendable {
    /// A root of one of the tabs: selecting it pops that tab to its root.
    case tabRoot
    /// Pushed on the current tab's `NavigationStack`.
    case push
    /// A sheet (L3 glass on iOS 26, Material before) with a close button, hosted by `SheetHost`.
    case sheet
    /// A full-screen cover (Studio, Wrapped).
    case cover
}

enum RouteSheetSize: Hashable, Sendable {
    /// Medium and large detents.
    case mediumLarge
    /// Large only (forms).
    case large
    /// Medium only (a primer, a small settings sheet).
    case medium
}

// MARK: - Route

/// Every screen of the creator app that has a name, an id or a deep link, plus the Brand and Admin mode destinations. See
/// `ScreenRegistry` for the view each case opens and `FEATURE_CONTRACT.md` for the file, type and initialiser behind it.
enum Route: Hashable, Sendable, Identifiable {
    // Tab roots (creator)
    case home
    case bounties
    case wallet
    case profile

    // Home, Inbox, Flo
    case dailyDrop
    case streak
    case whatToPostToday
    case activity
    case firstDollarTracker
    case inbox
    case thread(id: String)
    case flo(FloLaunchContext)
    case floSheet(FloLaunchContext)

    // Bounties and offers
    case bountyFilters
    case savedBounties
    case bounty(id: String)
    case rightsCard(bountyID: String)
    case payMath(bountyID: String)
    case brandScorecard(brandID: String)
    case offers
    case offer(id: String)
    case counterOffer(offerID: String)
    case rateCard
    case scamReport(kind: ReportTargetKind, targetID: String?)

    // Studio, drafts, submissions
    case studio(StudioEntry)
    case briefPanel(bountyID: String, draftID: String?)
    case hookLibrary(bountyID: String?, formatID: FormatId?)
    case teleprompterSettings
    case importVideo(bountyID: String?)
    case drafts
    case submissions
    case submission(id: String)
    case revise(submissionID: String)
    case appeal(submissionID: String)
    case postComposer(submissionID: String)

    // Wallet, earnings, rights
    case moneyClock
    case earnings
    case posts
    case post(id: String)
    case viewLedger(postID: String)
    case dispute(DisputeTarget)
    case payouts
    case payout(id: String)
    case instantCashOut
    case payoutMethods
    case tax
    case w9
    case rights
    case earningsCard(EarningsCardSource)
    case wrapped(WrappedPeriod)

    // Profile, settings, safety, onboarding sheets
    case editProfile
    case tiers
    case linkedAccounts
    case accountHealth
    case idVerification
    case settings(SettingsSection?)
    case wellbeing
    case safety
    case legal(LegalDocument?)
    case foundingBadge
    case permissionPrimer(PermissionKind)

    // Compete and grow
    case leaderboard
    case tournaments
    case tournament(id: String)
    case crew(id: String?)
    case crewLeaderboard
    case crewDiscover
    case referrals
    case academy
    case lesson(slug: String)
    case badges
    case remix
    case hookScoreTool
    case specs
    case specUpload
    case spec(id: String)
    case auctions
    case auction(id: String)
    case storefront(handle: String?)

    // Shell
    case uploadQueue

    // Personas
    case brand(BrandRoute)
    case admin(AdminRoute)

    var id: Route {
        return self
    }

    /// How the route is shown. Exhaustive: adding a case without deciding this does not compile.
    var presentation: RoutePresentation {
        switch self {
        case .home, .bounties, .wallet, .profile:
            return .tabRoot
        case .bountyFilters, .brandScorecard, .rightsCard, .payMath, .counterOffer, .scamReport, .floSheet, .briefPanel, .hookLibrary,
             .teleprompterSettings, .importVideo, .appeal, .dispute, .instantCashOut, .w9, .earningsCard, .idVerification, .permissionPrimer,
             .uploadQueue:
            return .sheet
        case .studio, .wrapped:
            return .cover
        case .brand(let inner):
            return inner.presentation
        case .admin(let inner):
            return inner.presentation
        case .dailyDrop, .streak, .whatToPostToday, .activity, .firstDollarTracker, .inbox, .thread, .flo, .savedBounties, .bounty, .offers,
             .offer, .rateCard, .drafts, .submissions, .submission, .revise, .postComposer, .moneyClock, .earnings, .posts, .post, .viewLedger,
             .payouts, .payout, .payoutMethods, .tax, .rights, .editProfile, .tiers, .linkedAccounts, .accountHealth, .settings, .wellbeing,
             .safety, .legal, .foundingBadge, .leaderboard, .tournaments, .tournament, .crew, .crewLeaderboard, .crewDiscover, .referrals,
             .academy, .lesson, .badges, .remix, .hookScoreTool, .specs, .specUpload, .spec, .auctions, .auction, .storefront:
            return .push
        }
    }

    /// The detents of a sheet route.
    var sheetSize: RouteSheetSize {
        switch self {
        case .counterOffer, .scamReport, .appeal, .dispute, .w9, .idVerification, .importVideo, .earningsCard, .floSheet, .bountyFilters:
            return .large
        case .permissionPrimer, .teleprompterSettings:
            return .medium
        case .brand(let inner):
            switch inner {
            case .sendOffer:
                return .large
            case .fundEscrow:
                return .mediumLarge
            case .reviewDetail, .bountyDetail, .creators, .creatorProfile, .autoApproveRules, .notificationsAndSettings:
                return .mediumLarge
            }
        case .brandScorecard, .rightsCard, .payMath, .briefPanel, .hookLibrary, .instantCashOut, .uploadQueue:
            return .mediumLarge
        default:
            return .mediumLarge
        }
    }

    /// The creator tab a deep link to this route lands on. Brand and Admin routes return `.home` (they use their own tab bars).
    var creatorTab: AppTab {
        switch self {
        case .bounties, .savedBounties, .bounty, .offers, .offer, .rateCard, .bountyFilters, .rightsCard, .payMath, .brandScorecard, .counterOffer,
             .scamReport:
            return .bounties
        case .wallet, .moneyClock, .earnings, .posts, .post, .viewLedger, .dispute, .payouts, .payout, .instantCashOut, .payoutMethods, .tax,
             .w9, .rights, .earningsCard, .wrapped:
            return .wallet
        case .profile, .editProfile, .tiers, .linkedAccounts, .accountHealth, .idVerification, .settings, .wellbeing, .safety, .legal,
             .foundingBadge, .referrals, .crew, .crewLeaderboard, .crewDiscover, .storefront, .specs, .specUpload, .spec, .auctions, .auction:
            return .profile
        case .home, .dailyDrop, .streak, .whatToPostToday, .activity, .firstDollarTracker, .inbox, .thread, .flo, .floSheet, .studio,
             .briefPanel, .hookLibrary, .teleprompterSettings, .importVideo, .drafts, .submissions, .submission, .revise, .appeal,
             .postComposer, .permissionPrimer, .leaderboard, .tournaments, .tournament, .academy, .lesson, .badges, .remix, .hookScoreTool,
             .uploadQueue, .brand, .admin:
            return .home
        }
    }

    /// The persona whose shell shows the route.
    var persona: AppPersona {
        switch self {
        case .brand:
            return .brand
        case .admin:
            return .admin
        default:
            return .creator
        }
    }

    /// The route a deep link opens (`flowd://bounty/<id>`, `joinflowd.io/b/<id>`, a notification's `deep_link`). Nil when the link has no screen
    /// in the app; the caller shows a calm toast.
    static func from(_ link: DeepLink) -> Route? {
        switch link {
        case .home:
            return Route.home
        case .bounty(let id):
            return Route.bounty(id: id)
        case .submission(let id):
            return Route.submission(id: id)
        case .post(let id):
            return Route.post(id: id)
        case .payout(let id):
            return Route.payout(id: id)
        case .offer(let id):
            return Route.offer(id: id)
        case .dispute(let id):
            return Route.dispute(DisputeTarget.existing(id))
        case .tournament(let id):
            return Route.tournament(id: id)
        case .lesson(let slug):
            return Route.lesson(slug: slug)
        case .scorecard(let brandId):
            return Route.brandScorecard(brandID: brandId)
        case .creator(let handle):
            return Route.storefront(handle: handle)
        case .proof(let id):
            return Route.earningsCard(EarningsCardSource.proof(id))
        case .drop:
            return Route.dailyDrop
        case .wallet:
            return Route.wallet
        case .moneyClock:
            return Route.moneyClock
        case .inbox:
            return Route.inbox
        case .studio:
            return Route.studio(StudioEntry.launcher)
        case .tiers:
            return Route.tiers
        case .rights:
            return Route.rights
        case .streak:
            return Route.streak
        case .referrals:
            return Route.referrals
        case .tax:
            return Route.tax
        case .safety:
            return Route.safety
        case .wellbeing:
            return Route.wellbeing
        case .remix:
            return Route.remix
        case .crew:
            return Route.crew(id: nil)
        case .academy:
            return Route.academy
        case .leaderboard:
            return Route.leaderboard
        case .settings(let section):
            if let section = section {
                return Route.settings(SettingsSection(rawValue: section))
            }
            return Route.settings(nil)
        case .changelog, .unknown:
            return nil
        }
    }
}
