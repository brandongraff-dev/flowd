import XCTest
@testable import Flowd

/// The app shell: launch arguments and screen keys, the typed routes and deep links, the router's navigation rules, the Studio's entry points, the
/// launch gate and the tab bar's scroll behaviour. Pure logic only (no views are built).
@MainActor
final class AppShellTests: XCTestCase {
    // MARK: Launch arguments

    func testEveryLaunchKeyParsesAndTheScreenshotKeysAreAllKnown() throws {
        for key in LaunchScreen.keys {
            XCTAssertNotNil(LaunchScreen.parse(key: key), key)
        }
        let screens: [String] = [
            "design-gallery", "creator-home", "creator-bounties", "creator-bounty-detail", "creator-studio-capture", "creator-hook-score",
            "creator-wallet", "creator-earnings-card", "creator-leaderboard", "creator-profile", "brand-overview", "brand-review",
            "brand-bounty-detail", "brand-insights", "brand-wallet", "admin-control", "admin-queues", "admin-fraud-case", "admin-payouts",
            "admin-market"
        ]
        for key in screens {
            XCTAssertTrue(LaunchScreen.keys.contains(key), key)
        }
        XCTAssertNil(LaunchScreen.parse(key: "creator-nowhere"))
    }

    func testLaunchArgumentsParse() {
        let options: LaunchOptions = LaunchOptions.parse(arguments: [
            "Flowd", "-FlowdDemo", "YES", "-FlowdPersona", "brand", "-FlowdScreen", "brand-review", "-FlowdAppearance", "light", "-FlowdReduceGlass", "YES"
        ])
        XCTAssertTrue(options.isDemo)
        XCTAssertEqual(options.persona, AppPersona.brand)
        XCTAssertEqual(options.screen, LaunchScreen.brand(tab: BrandTab.review, route: nil))
        XCTAssertEqual(options.appearance, LaunchAppearance.light)
        XCTAssertTrue(options.reduceGlass)
    }

    func testNoArgumentsIsANormalLaunch() {
        let options: LaunchOptions = LaunchOptions.parse(arguments: ["Flowd"])
        XCTAssertFalse(options.isDemo)
        XCTAssertEqual(options.persona, AppPersona.creator)
        XCTAssertNil(options.screen)
        XCTAssertNil(options.appearance)
        XCTAssertFalse(options.reduceGlass)
    }

    func testThePersonaComesFromTheKeyPrefix() {
        let options: LaunchOptions = LaunchOptions.parse(arguments: ["-FlowdScreen", "admin-fraud-case"])
        XCTAssertEqual(options.persona, AppPersona.admin)
        XCTAssertEqual(
            options.screen,
            LaunchScreen.admin(tab: AdminTab.queues, route: AdminRoute.fraudCase(flagID: DemoIDs.fraudFlag))
        )
    }

    func testAKeyOfAnotherPersonaOpensTheHome() {
        let options: LaunchOptions = LaunchOptions.parse(arguments: ["-FlowdPersona", "creator", "-FlowdScreen", "admin-control"])
        XCTAssertEqual(options.persona, AppPersona.creator)
        XCTAssertNil(options.screen)
    }

    func testTheDesignGalleryAndOnboardingKeys() {
        XCTAssertTrue(LaunchOptions.parse(arguments: ["-FlowdScreen", "design-gallery"]).showsDesignGallery)
        XCTAssertTrue(LaunchOptions.parse(arguments: ["-FlowdDemo", "YES", "-FlowdScreen", "creator-onboarding"]).forcesOnboarding)
    }

    func testAppearanceAndReduceGlassWriteThePreferences() throws {
        let suite: String = "app.flowd.creator.tests.launch"
        let defaults: UserDefaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer {
            defaults.removePersistentDomain(forName: suite)
        }
        LaunchOptions(appearance: LaunchAppearance.dark, reduceGlass: true).applyPreferences(to: defaults)
        XCTAssertEqual(defaults.string(forKey: FlowdPreferenceKey.theme), "dark")
        XCTAssertTrue(defaults.bool(forKey: FlowdPreferenceKey.reduceGlass))
    }

    // MARK: Routes and deep links

    func testDeepLinksMapToRoutes() {
        XCTAssertEqual(Route.from(DeepLink.parse("flowd://bounty/bnty_lumi_glowup")), Route.bounty(id: "bnty_lumi_glowup"))
        XCTAssertEqual(Route.from(DeepLink.parse("flowd://dispute/disp_001")), Route.dispute(DisputeTarget.existing("disp_001")))
        XCTAssertEqual(Route.from(DeepLink.parse("https://joinflowd.io/c/maya.makes")), Route.storefront(handle: "maya.makes"))
        XCTAssertEqual(Route.from(DeepLink.parse("flowd://wallet/clock")), Route.moneyClock)
        XCTAssertEqual(Route.from(DeepLink.parse("flowd://settings/appearance")), Route.settings(SettingsSection.appearance))
        XCTAssertEqual(Route.from(DeepLink.parse("flowd://drop")), Route.dailyDrop)
        XCTAssertNil(Route.from(DeepLink.parse("flowd://nowhere")))
    }

    func testRoutePresentation() {
        XCTAssertEqual(Route.home.presentation, RoutePresentation.tabRoot)
        XCTAssertEqual(Route.bounty(id: "bnty_x").presentation, RoutePresentation.push)
        XCTAssertEqual(Route.payMath(bountyID: "bnty_x").presentation, RoutePresentation.sheet)
        XCTAssertEqual(Route.studio(StudioEntry.launcher).presentation, RoutePresentation.cover)
        XCTAssertEqual(Route.wrapped(WrappedPeriod.month).presentation, RoutePresentation.cover)
        XCTAssertEqual(Route.brand(BrandRoute.fundEscrow).presentation, RoutePresentation.sheet)
        XCTAssertEqual(Route.admin(AdminRoute.auditLog).persona, AppPersona.admin)
        XCTAssertEqual(Route.moneyClock.creatorTab, AppTab.wallet)
    }

    // MARK: Router

    func testOpenSwitchesToTheRoutesTabAndReplacesItsStack() {
        let router: Router = Router()
        router.open(Route.moneyClock)
        XCTAssertEqual(router.selectedTab, AppTab.wallet)
        XCTAssertEqual(router.nav(AppTab.wallet).path, [Route.moneyClock])
    }

    func testPushAppendsToTheCurrentTabAndSheetsPresentThemselves() {
        let router: Router = Router()
        router.selectedTab = AppTab.bounties
        router.push(Route.bounty(id: "bnty_x"))
        router.push(Route.rightsCard(bountyID: "bnty_x"))
        XCTAssertEqual(router.nav(AppTab.bounties).path, [Route.bounty(id: "bnty_x")])
        XCTAssertEqual(router.sheet, Route.rightsCard(bountyID: "bnty_x"))
    }

    func testSheetsNestAndTheCoverHostsItsOwnSheets() {
        let router: Router = Router()
        router.present(Route.payMath(bountyID: "bnty_x"))
        router.present(Route.rightsCard(bountyID: "bnty_x"))
        XCTAssertEqual(router.sheet, Route.payMath(bountyID: "bnty_x"))
        XCTAssertEqual(router.nestedSheet, Route.rightsCard(bountyID: "bnty_x"))
        router.dismissSheet()
        XCTAssertNil(router.nestedSheet)
        XCTAssertNotNil(router.sheet)
        router.dismissSheet()
        XCTAssertNil(router.sheet)

        router.open(Route.studio(StudioEntry.launcher))
        XCTAssertEqual(router.cover, CoverRoute.route(Route.studio(StudioEntry.launcher)))
        router.present(Route.teleprompterSettings)
        XCTAssertEqual(router.coverSheet, Route.teleprompterSettings)
        XCTAssertNil(router.sheet)
        router.dismissCover()
        XCTAssertNil(router.cover)
        XCTAssertNil(router.coverSheet)
    }

    func testTappingTheSelectedTabPopsThenScrollsToTheTop() {
        let router: Router = Router()
        router.selectedTab = AppTab.home
        router.nav(AppTab.home).path = [Route.streak]
        router.tabTapped(AppTab.home)
        XCTAssertTrue(router.nav(AppTab.home).path.isEmpty)
        let before: Int = router.nav(AppTab.home).scrollTick
        router.tabTapped(AppTab.home)
        XCTAssertEqual(router.nav(AppTab.home).scrollTick, before &+ 1)
        router.tabTapped(AppTab.wallet)
        XCTAssertEqual(router.selectedTab, AppTab.wallet)
    }

    func testDeepLinksOpenThroughTheRouter() {
        let router: Router = Router()
        XCTAssertTrue(router.handle(DeepLink.bounty(id: "bnty_lumi_glowup")))
        XCTAssertEqual(router.selectedTab, AppTab.bounties)
        XCTAssertEqual(router.nav(AppTab.bounties).path, [Route.bounty(id: "bnty_lumi_glowup")])
        XCTAssertFalse(router.handle(DeepLink.unknown("flowd://nowhere")))
    }

    func testAnotherPersonasRouteIsIgnored() {
        let router: Router = Router()
        router.open(Route.admin(AdminRoute.auditLog))
        XCTAssertTrue(router.nav(AppTab.home).path.isEmpty)
        router.reset(for: AppPersona.admin)
        router.open(Route.admin(AdminRoute.auditLog))
        XCTAssertEqual(router.adminNav(AdminTab.control).path, [Route.admin(AdminRoute.auditLog)])
    }

    func testLaunchScreenAppliesTabsAndPushes() {
        let router: Router = Router()
        XCTAssertNil(router.apply(LaunchScreen.creator(tab: AppTab.bounties, route: Route.bounty(id: DemoIDs.bounty))))
        XCTAssertEqual(router.selectedTab, AppTab.bounties)
        XCTAssertEqual(router.nav(AppTab.bounties).path, [Route.bounty(id: DemoIDs.bounty)])
        let deferred: Route? = router.apply(LaunchScreen.creator(tab: AppTab.wallet, route: Route.earningsCard(EarningsCardSource.latest)))
        XCTAssertEqual(deferred, Route.earningsCard(EarningsCardSource.latest))
        XCTAssertNil(router.sheet)
    }

    // MARK: Studio

    func testStudioEntriesStartAtTheRightStep() {
        XCTAssertEqual(StudioEntry.launcher.initialPath(draft: nil), [])
        XCTAssertEqual(
            StudioEntry.makeIt(bountyID: "bnty_x", formatID: nil, hook: nil).initialPath(draft: nil),
            [StudioRoute.formatPicker(bountyID: "bnty_x", preselected: nil)]
        )
        XCTAssertEqual(
            StudioEntry.makeIt(bountyID: "bnty_x", formatID: FormatId.tmplConfession, hook: nil).initialPath(draft: nil),
            [StudioRoute.script(bountyID: "bnty_x", formatID: FormatId.tmplConfession, hook: nil, draftID: nil)]
        )
        XCTAssertEqual(
            StudioEntry.capture(bountyID: "bnty_x").initialPath(draft: nil),
            [StudioRoute.capture(bountyID: "bnty_x", draftID: nil)]
        )
        XCTAssertEqual(StudioEntry.resume(draftID: "draft_missing").initialPath(draft: nil), [])
        let draft: DraftSnapshot = DraftSnapshot(id: "draft_1", bountyId: "bnty_x", stage: DraftStage.edit)
        XCTAssertEqual(StudioEntry.resume(draftID: "draft_1").initialPath(draft: draft), [StudioRoute.edit(draftID: "draft_1")])
    }

    func testStudioRouterNavigation() {
        let studio: StudioRouter = StudioRouter(entry: StudioEntry.launcher)
        studio.push(StudioRoute.takeReview(draftID: "draft_1"))
        studio.replaceTop(with: StudioRoute.edit(draftID: "draft_1"))
        XCTAssertEqual(studio.path, [StudioRoute.edit(draftID: "draft_1")])
        studio.pop()
        XCTAssertTrue(studio.path.isEmpty)
    }

    // MARK: Gate and chrome

    func testTheLaunchGate() {
        XCTAssertEqual(AppState().phase, AppState.Phase.launching)
        let demo: AppState = AppState(api: nil, launch: LaunchOptions.parse(arguments: ["-FlowdDemo", "YES"]))
        XCTAssertEqual(demo.phase, AppState.Phase.ready)
        XCTAssertTrue(demo.hasCompletedOnboarding)
        let onboarding: AppState = AppState(api: nil, launch: LaunchOptions.parse(arguments: ["-FlowdDemo", "YES", "-FlowdScreen", "creator-onboarding"]))
        XCTAssertEqual(onboarding.phase, AppState.Phase.onboarding)
        XCTAssertFalse(AppState.needsOnboarding(PreviewData.creator))
    }

    func testTheTabBarCompactsWhileScrollingDownAndRestoresWhenScrollingUp() {
        let chrome: TabBarChrome = TabBarChrome()
        XCTAssertEqual(chrome.style, FlowdTabBarStyle.full)
        chrome.scrolled(to: 20)
        XCTAssertEqual(chrome.style, FlowdTabBarStyle.full)
        chrome.scrolled(to: 80)
        XCTAssertEqual(chrome.style, FlowdTabBarStyle.compact)
        chrome.scrolled(to: 60)
        XCTAssertEqual(chrome.style, FlowdTabBarStyle.full)
        chrome.scrolled(to: 300)
        XCTAssertEqual(chrome.style, FlowdTabBarStyle.compact)
        chrome.scrolled(to: 0)
        XCTAssertEqual(chrome.style, FlowdTabBarStyle.full)
    }
}
