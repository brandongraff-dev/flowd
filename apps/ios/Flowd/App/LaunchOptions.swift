import Foundation

// Launch arguments for automated screenshots, demos and QA (docs/SCREENS.md section 0, scripts/ci/ios-screenshots.sh):
//
//   -FlowdDemo YES                     skip onboarding and sign in as the demo user of the persona (no splash, the shell is the first frame)
//   -FlowdPersona creator|brand|admin  which shell opens; defaults to the persona in the screen key's prefix, then creator
//   -FlowdScreen <key>                 open a screen directly (keys below and in apps/ios/Scripts/screenshot-screens.txt); an unknown key, or a
//                                      key of another persona, opens the persona's home
//   -FlowdAppearance dark|light        writes the in-app theme preference
//   -FlowdReduceGlass YES              writes the in-app "Reduce glass" preference
//
// A flag reads `YES`, `true` or `1` (any case), or is bare (no value, or the next argument starts with a dash). The two appearance arguments write the
// real preference keys (`flowd.pref.theme`, `flowd.pref.reduceGlass`) before the first view is built, so `flowdRoot()` and the Settings screens see one
// source of truth; they stay set in that simulator install until the preference is changed in Settings.

// MARK: - Demo ids

/// Ids of the demo world (fixtures, `PreviewHeroes`) used by launch keys, screenshots and demos. Shipping flows never hard-code ids; they get them from
/// the API. Everything here exists in `Resources/Fixtures` at the demo "now" (2026-10-03T14:00:00Z).
enum DemoIDs {
    static let creator: String = "cr_maya"
    static let creatorUser: String = "usr_maya"
    static let creatorHandle: String = "maya.makes"

    static let brand: String = "br_lumi"
    static let brandApp: String = "app_lumi"
    static let brandMember: String = "bm_lumi_jordan"
    static let brandUser: String = "usr_jordan"
    static let adminUser: String = "usr_ops"

    /// A live, funded view-and-conversion bounty from Lumi ("glow up").
    static let bounty: String = "bnty_lumi_glowup"
    /// A flowd-funded starter bounty (the First-Dollar Path).
    static let starterBounty: String = "bnty_flowd_starter_1"

    static let livePost: String = "post_0418"
    static let clearedPost: String = "post_0384"
    static let paidPost: String = "post_0293"

    static let approvedSubmission: String = "sub_0664"
    static let inReviewSubmission: String = "sub_0685"
    static let changesSubmission: String = "sub_0646"
    static let rejectedSubmission: String = "sub_0644"
    /// A submission to Lumi waiting on Jordan (Brand mode review detail).
    static let lumiReviewSubmission: String = "sub_0634"

    static let scheduledPayout: String = "pay_0330"
    static let inTransitPayout: String = "pay_0292"
    static let offer: String = "offer_0033"
    static let thread: String = "thr_0006"

    static let liveTournament: String = "tour_screen_record_sprint"
    static let crew: String = "crew_sunday_resetters"
    static let lessonSlug: String = "first-video-in-15-minutes"
    static let openAuction: String = "auc_005"

    static let fraudFlag: String = "flag_001"
    static let dispute: String = "disp_001"
    static let verification: String = "ver_001"
    static let payoutRun: String = "run_2026-10-09"
    /// A creator with a submission in Lumi's queue.
    static let otherCreator: String = "cr_gigi_glow"
}

// MARK: - Launch screens

enum LaunchAppearance: String, Hashable, Sendable {
    case dark
    case light
}

/// A screen a launch key opens. The persona is part of the value.
enum LaunchScreen: Hashable, Sendable {
    /// The design-system catalogue (`DesignGallery`).
    case designGallery
    /// The first-run onboarding flow.
    case onboarding
    /// A creator tab, optionally with a route on top (pushed, or presented when it is a sheet or a cover).
    case creator(tab: AppTab, route: Route?)
    case brand(tab: BrandTab, route: BrandRoute?)
    case admin(tab: AdminTab, route: AdminRoute?)

    var persona: AppPersona {
        switch self {
        case .designGallery, .onboarding, .creator:
            return AppPersona.creator
        case .brand:
            return AppPersona.brand
        case .admin:
            return AppPersona.admin
        }
    }

    /// Every stable key. The first twenty are the screenshot set (`Scripts/screenshot-screens.txt`); the rest are for QA and demos.
    static let keys: [String] = [
        "design-gallery",
        "creator-home", "creator-bounties", "creator-bounty-detail", "creator-studio-capture", "creator-hook-score", "creator-wallet",
        "creator-earnings-card", "creator-leaderboard", "creator-profile",
        "brand-overview", "brand-review", "brand-bounty-detail", "brand-insights", "brand-wallet",
        "admin-control", "admin-queues", "admin-fraud-case", "admin-payouts", "admin-market",
        "creator-onboarding", "creator-studio", "creator-daily-drop", "creator-streak", "creator-inbox", "creator-thread", "creator-flo",
        "creator-offers", "creator-offer-detail", "creator-rate-card", "creator-pay-math", "creator-rights-card", "creator-submissions",
        "creator-submission-detail", "creator-drafts", "creator-money-clock", "creator-earnings", "creator-posts", "creator-post-detail",
        "creator-view-ledger", "creator-payouts", "creator-instant-cashout", "creator-tax", "creator-rights", "creator-wrapped",
        "creator-tiers", "creator-settings", "creator-wellbeing", "creator-safety", "creator-referrals", "creator-academy", "creator-lesson",
        "creator-remix", "creator-tournaments", "creator-tournament-detail", "creator-crew", "creator-storefront", "creator-specs",
        "creator-auctions",
        "brand-review-detail", "brand-creators", "brand-fund",
        "admin-more", "admin-ml", "admin-dispute", "admin-audit"
    ]

    /// The screen for a key, or nil for an unknown key.
    static func parse(key: String) -> LaunchScreen? {
        let id: String = DemoIDs.bounty
        switch key {
        case "design-gallery":
            return LaunchScreen.designGallery
        case "creator-onboarding":
            return LaunchScreen.onboarding
        // Creator tab roots
        case "creator-home":
            return LaunchScreen.creator(tab: AppTab.home, route: nil)
        case "creator-bounties":
            return LaunchScreen.creator(tab: AppTab.bounties, route: nil)
        case "creator-wallet":
            return LaunchScreen.creator(tab: AppTab.wallet, route: nil)
        case "creator-profile":
            return LaunchScreen.creator(tab: AppTab.profile, route: nil)
        // Creator: bounties
        case "creator-bounty-detail":
            return LaunchScreen.creator(tab: AppTab.bounties, route: Route.bounty(id: id))
        case "creator-pay-math":
            return LaunchScreen.creator(tab: AppTab.bounties, route: Route.payMath(bountyID: id))
        case "creator-rights-card":
            return LaunchScreen.creator(tab: AppTab.bounties, route: Route.rightsCard(bountyID: id))
        case "creator-offers":
            return LaunchScreen.creator(tab: AppTab.bounties, route: Route.offers)
        case "creator-offer-detail":
            return LaunchScreen.creator(tab: AppTab.bounties, route: Route.offer(id: DemoIDs.offer))
        case "creator-rate-card":
            return LaunchScreen.creator(tab: AppTab.bounties, route: Route.rateCard)
        // Creator: Studio
        case "creator-studio":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.studio(StudioEntry.launcher))
        case "creator-studio-capture":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.studio(StudioEntry.capture(bountyID: id)))
        case "creator-hook-score":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.hookScoreTool)
        // Creator: home
        case "creator-daily-drop":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.dailyDrop)
        case "creator-streak":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.streak)
        case "creator-inbox":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.inbox)
        case "creator-thread":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.thread(id: DemoIDs.thread))
        case "creator-flo":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.flo(FloLaunchContext.home))
        case "creator-submissions":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.submissions)
        case "creator-submission-detail":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.submission(id: DemoIDs.changesSubmission))
        case "creator-drafts":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.drafts)
        case "creator-leaderboard":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.leaderboard)
        case "creator-academy":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.academy)
        case "creator-lesson":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.lesson(slug: DemoIDs.lessonSlug))
        case "creator-remix":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.remix)
        case "creator-tournaments":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.tournaments)
        case "creator-tournament-detail":
            return LaunchScreen.creator(tab: AppTab.home, route: Route.tournament(id: DemoIDs.liveTournament))
        // Creator: wallet
        case "creator-earnings-card":
            return LaunchScreen.creator(tab: AppTab.wallet, route: Route.earningsCard(EarningsCardSource.latest))
        case "creator-money-clock":
            return LaunchScreen.creator(tab: AppTab.wallet, route: Route.moneyClock)
        case "creator-earnings":
            return LaunchScreen.creator(tab: AppTab.wallet, route: Route.earnings)
        case "creator-posts":
            return LaunchScreen.creator(tab: AppTab.wallet, route: Route.posts)
        case "creator-post-detail":
            return LaunchScreen.creator(tab: AppTab.wallet, route: Route.post(id: DemoIDs.livePost))
        case "creator-view-ledger":
            return LaunchScreen.creator(tab: AppTab.wallet, route: Route.viewLedger(postID: DemoIDs.livePost))
        case "creator-payouts":
            return LaunchScreen.creator(tab: AppTab.wallet, route: Route.payouts)
        case "creator-instant-cashout":
            return LaunchScreen.creator(tab: AppTab.wallet, route: Route.instantCashOut)
        case "creator-tax":
            return LaunchScreen.creator(tab: AppTab.wallet, route: Route.tax)
        case "creator-rights":
            return LaunchScreen.creator(tab: AppTab.wallet, route: Route.rights)
        case "creator-wrapped":
            return LaunchScreen.creator(tab: AppTab.wallet, route: Route.wrapped(WrappedPeriod.month))
        // Creator: profile
        case "creator-tiers":
            return LaunchScreen.creator(tab: AppTab.profile, route: Route.tiers)
        case "creator-settings":
            return LaunchScreen.creator(tab: AppTab.profile, route: Route.settings(nil))
        case "creator-wellbeing":
            return LaunchScreen.creator(tab: AppTab.profile, route: Route.wellbeing)
        case "creator-safety":
            return LaunchScreen.creator(tab: AppTab.profile, route: Route.safety)
        case "creator-referrals":
            return LaunchScreen.creator(tab: AppTab.profile, route: Route.referrals)
        case "creator-crew":
            return LaunchScreen.creator(tab: AppTab.profile, route: Route.crew(id: DemoIDs.crew))
        case "creator-storefront":
            return LaunchScreen.creator(tab: AppTab.profile, route: Route.storefront(handle: nil))
        case "creator-specs":
            return LaunchScreen.creator(tab: AppTab.profile, route: Route.specs)
        case "creator-auctions":
            return LaunchScreen.creator(tab: AppTab.profile, route: Route.auctions)
        // Brand
        case "brand-overview":
            return LaunchScreen.brand(tab: BrandTab.overview, route: nil)
        case "brand-review":
            return LaunchScreen.brand(tab: BrandTab.review, route: nil)
        case "brand-bounty-detail":
            return LaunchScreen.brand(tab: BrandTab.bounties, route: BrandRoute.bountyDetail(bountyID: id))
        case "brand-insights":
            return LaunchScreen.brand(tab: BrandTab.insights, route: nil)
        case "brand-wallet":
            return LaunchScreen.brand(tab: BrandTab.wallet, route: nil)
        case "brand-review-detail":
            return LaunchScreen.brand(tab: BrandTab.review, route: BrandRoute.reviewDetail(submissionID: DemoIDs.lumiReviewSubmission))
        case "brand-creators":
            return LaunchScreen.brand(tab: BrandTab.bounties, route: BrandRoute.creators)
        case "brand-fund":
            return LaunchScreen.brand(tab: BrandTab.wallet, route: BrandRoute.fundEscrow)
        // Admin
        case "admin-control":
            return LaunchScreen.admin(tab: AdminTab.control, route: nil)
        case "admin-queues":
            return LaunchScreen.admin(tab: AdminTab.queues, route: nil)
        case "admin-fraud-case":
            return LaunchScreen.admin(tab: AdminTab.queues, route: AdminRoute.fraudCase(flagID: DemoIDs.fraudFlag))
        case "admin-payouts":
            return LaunchScreen.admin(tab: AdminTab.money, route: nil)
        case "admin-market":
            return LaunchScreen.admin(tab: AdminTab.market, route: nil)
        case "admin-more":
            return LaunchScreen.admin(tab: AdminTab.more, route: nil)
        case "admin-ml":
            return LaunchScreen.admin(tab: AdminTab.more, route: AdminRoute.mlCalibration)
        case "admin-dispute":
            return LaunchScreen.admin(tab: AdminTab.queues, route: AdminRoute.dispute(disputeID: DemoIDs.dispute))
        case "admin-audit":
            return LaunchScreen.admin(tab: AdminTab.more, route: AdminRoute.auditLog)
        default:
            return nil
        }
    }
}

// MARK: - Options

struct LaunchOptions: Equatable, Sendable {
    var isDemo: Bool
    /// The persona asked for with `-FlowdPersona`, if any.
    var requestedPersona: AppPersona?
    var screenKey: String?
    var appearance: LaunchAppearance?
    var reduceGlass: Bool

    init(isDemo: Bool = false, requestedPersona: AppPersona? = nil, screenKey: String? = nil, appearance: LaunchAppearance? = nil, reduceGlass: Bool = false) {
        self.isDemo = isDemo
        self.requestedPersona = requestedPersona
        self.screenKey = screenKey
        self.appearance = appearance
        self.reduceGlass = reduceGlass
    }

    /// No launch arguments: a normal launch.
    static let none: LaunchOptions = LaunchOptions()

    /// The arguments of this process.
    static let current: LaunchOptions = LaunchOptions.parse(arguments: ProcessInfo.processInfo.arguments)

    /// The screen the key names, if the key is known.
    var keyedScreen: LaunchScreen? {
        guard let key = screenKey else {
            return nil
        }
        return LaunchScreen.parse(key: key)
    }

    /// The persona that opens: `-FlowdPersona` wins, then the key's persona, then creator.
    var persona: AppPersona {
        if let requested = requestedPersona {
            return requested
        }
        return keyedScreen?.persona ?? AppPersona.creator
    }

    /// The screen to open: the keyed screen when it belongs to the persona that opens. Nil means the persona's home.
    var screen: LaunchScreen? {
        guard let screen = keyedScreen else {
            return nil
        }
        return screen.persona == persona ? screen : nil
    }

    /// True when the launch asks for the design-system catalogue.
    var showsDesignGallery: Bool {
        return screen == LaunchScreen.designGallery
    }

    /// True when the launch asks for the first-run flow even though the demo skips it.
    var forcesOnboarding: Bool {
        return screen == LaunchScreen.onboarding
    }

    // MARK: Parsing

    /// Reads the launch arguments (pure: tests pass their own).
    static func parse(arguments: [String]) -> LaunchOptions {
        func value(_ name: String) -> String? {
            guard let index = arguments.firstIndex(of: name) else {
                return nil
            }
            let next: Int = index + 1
            if next < arguments.count && !arguments[next].hasPrefix("-") {
                return arguments[next]
            }
            return ""
        }
        func isOn(_ name: String) -> Bool {
            guard let raw = value(name) else {
                return false
            }
            let text: String = raw.lowercased()
            return text.isEmpty || text == "yes" || text == "true" || text == "1"
        }
        var options: LaunchOptions = LaunchOptions()
        options.isDemo = isOn("-FlowdDemo")
        if let raw = value("-FlowdPersona"), !raw.isEmpty {
            options.requestedPersona = AppPersona(rawValue: raw.lowercased())
        }
        if let raw = value("-FlowdScreen"), !raw.isEmpty {
            options.screenKey = raw
        }
        if let raw = value("-FlowdAppearance"), !raw.isEmpty {
            options.appearance = LaunchAppearance(rawValue: raw.lowercased())
        }
        options.reduceGlass = isOn("-FlowdReduceGlass")
        return options
    }

    // MARK: Preferences

    /// Writes the appearance and Reduce glass launch arguments into the in-app preferences (see the note at the top of this file).
    func applyPreferences(to defaults: UserDefaults = UserDefaults.standard) {
        if let appearance = appearance {
            defaults.set(appearance.rawValue, forKey: FlowdPreferenceKey.theme)
        }
        if reduceGlass {
            defaults.set(true, forKey: FlowdPreferenceKey.reduceGlass)
        }
    }
}
