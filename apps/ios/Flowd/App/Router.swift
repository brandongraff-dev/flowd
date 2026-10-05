import SwiftUI
import Observation
import os

// The router: one `NavigationStack` path per tab (creator, brand and admin shells each have their own), sheets, the full-screen cover and deep
// links. A feature screen reaches it with `@Environment(Router.self)`:
//
//     router.push(.bounty(id: item.id))          // from inside a screen: pushes on the current tab (sheets and covers present themselves)
//     router.open(.wallet)                       // from anywhere: switch tab, pop to its root
//     router.open(.studio(.makeIt(bountyID: id, formatID: nil, hook: nil)))
//     NavigationLink(value: Route.moneyClock) { ... }     // also fine: every tab root registers the same destinations
//
// Sheets opened while the Studio cover is up are hosted by the cover (a sheet cannot be presented from a view that is covered), and a sheet opened
// from a sheet becomes a nested sheet; the registry (`ScreenRegistry`) maps every `Route` to its view.

/// One tab's navigation state.
@MainActor
@Observable
final class TabNav {
    /// The pushed screens above the tab root, oldest first.
    var path: [Route] = []
    /// Bumped when the selected tab is tapped again at its root; `FlowdScreen` scrolls to the top on every change.
    var scrollTick: Int = 0

    init() {
    }
}

/// A full-screen presentation: a routed cover (Studio, Wrapped) or one of the two celebration screens for earned outcomes.
enum CoverRoute: Hashable, Identifiable, Sendable {
    case route(Route)
    case payoutArrived(amountCents: Int, methodTitle: String, arrivalNote: String?, isInstant: Bool)
    case tierUp(to: Tier, from: Tier?)

    var id: CoverRoute {
        return self
    }
}

@MainActor
@Observable
final class Router {
    /// The persona whose shell is on screen. `AppState.setPersona` keeps it in step.
    var persona: AppPersona = AppPersona.creator
    var selectedTab: AppTab = AppTab.home
    var selectedBrandTab: BrandTab = BrandTab.overview
    var selectedAdminTab: AdminTab = AdminTab.control

    /// The sheet over the shell.
    var sheet: Route? = nil
    /// A sheet opened from a sheet.
    var nestedSheet: Route? = nil
    /// A sheet opened while the cover is up (hosted by the cover).
    var coverSheet: Route? = nil
    var cover: CoverRoute? = nil
    /// Bumped whenever a sheet is dismissed; a screen that opened one can reload on `.onChange(of: router.sheetDismissTick)`.
    var sheetDismissTick: Int = 0
    /// Bumped whenever the cover is dismissed.
    var coverDismissTick: Int = 0

    private let creatorNavs: [AppTab: TabNav]
    private let brandNavs: [BrandTab: TabNav]
    private let adminNavs: [AdminTab: TabNav]
    private let fallbackNav: TabNav

    init() {
        var creator: [AppTab: TabNav] = [:]
        for tab in AppTab.allCases {
            creator[tab] = TabNav()
        }
        var brand: [BrandTab: TabNav] = [:]
        for tab in BrandTab.allCases {
            brand[tab] = TabNav()
        }
        var admin: [AdminTab: TabNav] = [:]
        for tab in AdminTab.allCases {
            admin[tab] = TabNav()
        }
        self.creatorNavs = creator
        self.brandNavs = brand
        self.adminNavs = admin
        self.fallbackNav = TabNav()
    }

    // MARK: Navigation state

    func nav(_ tab: AppTab) -> TabNav {
        return creatorNavs[tab] ?? fallbackNav
    }

    func brandNav(_ tab: BrandTab) -> TabNav {
        return brandNavs[tab] ?? fallbackNav
    }

    func adminNav(_ tab: AdminTab) -> TabNav {
        return adminNavs[tab] ?? fallbackNav
    }

    /// The navigation state of the tab that is on screen in the current persona's shell.
    var activeNav: TabNav {
        switch persona {
        case .creator:
            return nav(selectedTab)
        case .brand:
            return brandNav(selectedBrandTab)
        case .admin:
            return adminNav(selectedAdminTab)
        }
    }

    /// True when any sheet or cover is up.
    var isPresenting: Bool {
        return sheet != nil || cover != nil || nestedSheet != nil || coverSheet != nil
    }

    // MARK: Tab selection

    /// A binding for the creator `TabView`/`FlowdTabBar`. Tapping the selected tab again pops it to its root, or scrolls it to the top.
    var creatorSelection: Binding<AppTab> {
        return Binding<AppTab>(
            get: { () -> AppTab in
                return MainActor.assumeIsolated { () -> AppTab in
                    return self.selectedTab
                }
            },
            set: { (tab: AppTab) in
                MainActor.assumeIsolated {
                    self.tabTapped(tab)
                }
            }
        )
    }

    var brandSelection: Binding<BrandTab> {
        return Binding<BrandTab>(
            get: { () -> BrandTab in
                return MainActor.assumeIsolated { () -> BrandTab in
                    return self.selectedBrandTab
                }
            },
            set: { (tab: BrandTab) in
                MainActor.assumeIsolated {
                    self.brandTabTapped(tab)
                }
            }
        )
    }

    var adminSelection: Binding<AdminTab> {
        return Binding<AdminTab>(
            get: { () -> AdminTab in
                return MainActor.assumeIsolated { () -> AdminTab in
                    return self.selectedAdminTab
                }
            },
            set: { (tab: AdminTab) in
                MainActor.assumeIsolated {
                    self.adminTabTapped(tab)
                }
            }
        )
    }

    func tabTapped(_ tab: AppTab) {
        if tab == selectedTab {
            retap(nav(tab))
        } else {
            selectedTab = tab
        }
    }

    func brandTabTapped(_ tab: BrandTab) {
        if tab == selectedBrandTab {
            retap(brandNav(tab))
        } else {
            selectedBrandTab = tab
        }
    }

    func adminTabTapped(_ tab: AdminTab) {
        if tab == selectedAdminTab {
            retap(adminNav(tab))
        } else {
            selectedAdminTab = tab
        }
    }

    private func retap(_ nav: TabNav) {
        if nav.path.isEmpty {
            nav.scrollTick &+= 1
        } else {
            nav.path.removeAll()
        }
    }

    // MARK: Push

    /// Shows a route from inside a screen. Pushes go on the current tab's stack; sheets and covers present themselves.
    func push(_ route: Route) {
        switch route.presentation {
        case .push:
            activeNav.path.append(route)
        case .tabRoot, .sheet, .cover:
            open(route)
        }
    }

    func pop() {
        let nav: TabNav = activeNav
        if !nav.path.isEmpty {
            nav.path.removeLast()
        }
    }

    func popToRoot() {
        activeNav.path.removeAll()
    }

    // MARK: Open (from anywhere)

    /// Shows a route from anywhere (a deep link, a notification, a widget, another tab): switches to the route's tab, replaces its stack with the
    /// route and shows sheets and covers over everything. A route for another persona is ignored (the caller toasts).
    func open(_ route: Route) {
        if route.persona != persona {
            return
        }
        switch route.presentation {
        case .tabRoot:
            openTabRoot(route)
        case .push:
            openPush(route)
        case .sheet:
            present(route)
        case .cover:
            presentCover(CoverRoute.route(route))
        }
    }

    private func openTabRoot(_ route: Route) {
        switch route {
        case .home:
            selectedTab = AppTab.home
            nav(AppTab.home).path.removeAll()
        case .bounties:
            selectedTab = AppTab.bounties
            nav(AppTab.bounties).path.removeAll()
        case .wallet:
            selectedTab = AppTab.wallet
            nav(AppTab.wallet).path.removeAll()
        case .profile:
            selectedTab = AppTab.profile
            nav(AppTab.profile).path.removeAll()
        default:
            break
        }
    }

    private func openPush(_ route: Route) {
        switch route {
        case .brand:
            activeNav.path.append(route)
        case .admin:
            activeNav.path.append(route)
        default:
            let tab: AppTab = route.creatorTab
            selectedTab = tab
            let target: TabNav = nav(tab)
            target.path = [route]
        }
    }

    // MARK: Sheets

    /// Presents a sheet over whatever is on screen.
    func present(_ route: Route) {
        let resolved: Route = route
        if cover != nil {
            if coverSheet == nil {
                coverSheet = resolved
            } else {
                nestedSheet = resolved
            }
        } else if sheet == nil {
            sheet = resolved
        } else {
            nestedSheet = resolved
        }
    }

    /// Dismisses the top-most sheet.
    func dismissSheet() {
        if nestedSheet != nil {
            nestedSheet = nil
        } else if coverSheet != nil {
            coverSheet = nil
        } else {
            sheet = nil
        }
    }

    /// Call from `.sheet(onDismiss:)`.
    func sheetDidDismiss() {
        sheetDismissTick &+= 1
    }

    // MARK: Covers

    func presentCover(_ route: CoverRoute) {
        cover = route
    }

    /// Dismisses the Studio (or any other) cover together with the sheets it hosts.
    func dismissCover() {
        nestedSheet = nil
        coverSheet = nil
        cover = nil
    }

    /// The Studio cover is the one cover with its own name in call sites.
    func dismissStudio() {
        dismissCover()
    }

    /// Call from `.fullScreenCover(onDismiss:)`.
    func coverDidDismiss() {
        coverDismissTick &+= 1
        coverSheet = nil
        nestedSheet = nil
    }

    // MARK: Deep links

    /// Opens a deep link. Returns false (and tells the creator calmly) when the link has no screen here; the caller queues links that need a
    /// session before one exists (`AppState.open(_:)`).
    @discardableResult
    func handle(_ link: DeepLink) -> Bool {
        guard let route = Route.from(link) else {
            ToastCenter.shared.info("That link doesn't open anything in the app.")
            FlowdLog.deepLink.notice("Unhandled deep link")
            return false
        }
        if persona != AppPersona.creator {
            ToastCenter.shared.info("Switch to the creator app to open that link.")
            return false
        }
        open(route)
        return true
    }

    // MARK: Reset and launch

    /// Back to a clean shell for `persona` (sign-out, persona switch, demo reset).
    func reset(for persona: AppPersona) {
        self.persona = persona
        selectedTab = AppTab.home
        selectedBrandTab = BrandTab.overview
        selectedAdminTab = AdminTab.control
        for tab in AppTab.allCases {
            nav(tab).path.removeAll()
        }
        for tab in BrandTab.allCases {
            brandNav(tab).path.removeAll()
        }
        for tab in AdminTab.allCases {
            adminNav(tab).path.removeAll()
        }
        sheet = nil
        nestedSheet = nil
        coverSheet = nil
        cover = nil
    }

    /// Applies a launch screen (`-FlowdScreen`). Tabs and pushes are applied at once; a sheet or cover is returned so the caller can present it a
    /// moment after the first frame (presenting during the first render is unreliable).
    func apply(_ screen: LaunchScreen) -> Route? {
        switch screen {
        case .designGallery, .onboarding:
            return nil
        case .creator(let tab, let target):
            persona = AppPersona.creator
            selectedTab = tab
            guard let route = target else {
                return nil
            }
            switch route.presentation {
            case .push:
                nav(tab).path = [route]
                return nil
            case .tabRoot:
                return nil
            case .sheet, .cover:
                return route
            }
        case .brand(let tab, let target):
            persona = AppPersona.brand
            selectedBrandTab = tab
            guard let route = target else {
                return nil
            }
            switch route.presentation {
            case .push:
                brandNav(tab).path = [Route.brand(route)]
                return nil
            case .tabRoot, .cover:
                return nil
            case .sheet:
                return Route.brand(route)
            }
        case .admin(let tab, let target):
            persona = AppPersona.admin
            selectedAdminTab = tab
            guard let route = target else {
                return nil
            }
            adminNav(tab).path = [Route.admin(route)]
            return nil
        }
    }
}
