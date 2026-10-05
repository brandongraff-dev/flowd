import SwiftUI

// The Brand mode and Admin mode shells (docs/SCREENS.md sections 10 and 11): the same floating glass tab bar, one `NavigationStack` per tab, no centre
// action. Brand: Overview / Review / Bounties / Insights / Wallet. Admin: Control / Queues / Money / Market / More. Their tab roots and pushed screens are
// built by `ios-brand-mode` and `ios-admin-mode`; the shell only hosts them (ScreenRegistry.brandRoot / adminRoot, `Route.brand(_:)`, `Route.admin(_:)`).

struct BrandShell: View {
    @Environment(Router.self) private var router: Router
    @State private var chrome: TabBarChrome = TabBarChrome()

    var body: some View {
        TabView(selection: router.brandSelection) {
            tabContent(BrandTab.overview)
            tabContent(BrandTab.review)
            tabContent(BrandTab.bounties)
            tabContent(BrandTab.insights)
            tabContent(BrandTab.wallet)
        }
        .tint(FlowdColor.accent)
        .onChange(of: router.selectedBrandTab) { (_: BrandTab, _: BrandTab) in
            chrome.reset()
        }
    }

    @ViewBuilder
    private func tabContent(_ tab: BrandTab) -> some View {
        let nav: TabNav = router.brandNav(tab)
        RoutedStack(nav: nav) {
            ScreenRegistry.brandRoot(tab)
        }
        .environment(\.flowdScrollToTopTick, nav.scrollTick)
        .environment(\.flowdScrollReport, scrollReport(for: tab))
        .tag(tab)
        .tabItem {
            Label(tab.title, systemImage: tab.systemImage)
        }
    }

    private func scrollReport(for tab: BrandTab) -> (CGFloat) -> Void {
        let router: Router = self.router
        let chrome: TabBarChrome = self.chrome
        return { (offset: CGFloat) in
            if router.selectedBrandTab == tab {
                chrome.scrolled(to: offset)
            }
        }
    }

    private var items: [FlowdTabItem<BrandTab>] {
        return BrandTab.allCases.map { (tab: BrandTab) -> FlowdTabItem<BrandTab> in
            return FlowdTabItem(id: tab, title: tab.title, systemImage: tab.systemImage, selectedSystemImage: tab.selectedSystemImage)
        }
    }
}

struct AdminShell: View {
    @Environment(Router.self) private var router: Router
    @State private var chrome: TabBarChrome = TabBarChrome()

    var body: some View {
        TabView(selection: router.adminSelection) {
            tabContent(AdminTab.control)
            tabContent(AdminTab.queues)
            tabContent(AdminTab.money)
            tabContent(AdminTab.market)
            tabContent(AdminTab.more)
        }
        .tint(FlowdColor.accent)
        .onChange(of: router.selectedAdminTab) { (_: AdminTab, _: AdminTab) in
            chrome.reset()
        }
    }

    @ViewBuilder
    private func tabContent(_ tab: AdminTab) -> some View {
        let nav: TabNav = router.adminNav(tab)
        RoutedStack(nav: nav) {
            ScreenRegistry.adminRoot(tab)
        }
        .environment(\.flowdScrollToTopTick, nav.scrollTick)
        .environment(\.flowdScrollReport, scrollReport(for: tab))
        .tag(tab)
        .tabItem {
            Label(tab.title, systemImage: tab.systemImage)
        }
    }

    private func scrollReport(for tab: AdminTab) -> (CGFloat) -> Void {
        let router: Router = self.router
        let chrome: TabBarChrome = self.chrome
        return { (offset: CGFloat) in
            if router.selectedAdminTab == tab {
                chrome.scrolled(to: offset)
            }
        }
    }

    private var items: [FlowdTabItem<AdminTab>] {
        return AdminTab.allCases.map { (tab: AdminTab) -> FlowdTabItem<AdminTab> in
            return FlowdTabItem(id: tab, title: tab.title, systemImage: tab.systemImage, selectedSystemImage: tab.selectedSystemImage)
        }
    }
}

#Preview("Brand shell") {
    BrandShell()
        .flowdPreviewEnvironment(persona: AppPersona.brand)
}

#Preview("Admin shell") {
    AdminShell()
        .flowdPreviewEnvironment(persona: AppPersona.admin)
}
