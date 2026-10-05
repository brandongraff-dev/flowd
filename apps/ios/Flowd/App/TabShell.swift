import SwiftUI
import Observation

// The creator shell: a floating glass tab bar (Home, Bounties, Studio action, Wallet, Profile) from the design system over a `TabView` whose system bar
// is hidden, one `NavigationStack` per tab (paths live on the `Router`), a centre action that fans out into Record, Upload and Script with Flo, a
// "Continue draft" accessory above the bar, badge counts and dots, and a bar that shrinks to icons while the creator scrolls down (iOS 26).
//
//   - Re-tapping the selected tab pops it to its root, or scrolls it to the top (`Router.tabTapped`, `FlowdScreen`).
//   - Home shows the Inbox unread count and an Ember dot only while today's Daily Drop is live with real spots left.
//   - Wallet shows a Mint dot while cleared money is above what the creator last saw there.
//   - The Studio action never changes the selected tab: it presents the Studio cover over the shell.

/// Hosts one tab: its `NavigationStack` and the destinations of every `Route`.
struct RoutedStack<Root: View>: View {
    @Bindable var nav: TabNav
    private let root: Root

    init(nav: TabNav, @ViewBuilder root: () -> Root) {
        self.nav = nav
        self.root = root()
    }

    var body: some View {
        NavigationStack(path: $nav.path) {
            root
                .navigationDestination(for: Route.self) { (route: Route) in
                    ScreenRegistry.view(for: route)
                }
        }
    }
}

/// Whether the tab bar shows labels (`full`) or only icons (`compact`). Scrolling down on iOS 26 compacts it, scrolling up (or reaching the top)
/// restores it; before iOS 26 nothing reports scrolling and it stays full. `FlowdScreen` feeds it through `\.flowdScrollReport`.
@MainActor
@Observable
final class TabBarChrome {
    private(set) var style: FlowdTabBarStyle = FlowdTabBarStyle.full
    @ObservationIgnored private var lastOffset: CGFloat = 0
    @ObservationIgnored private var travel: CGFloat = 0

    init() {
    }

    /// Called with the distance scrolled from the top (0 at rest).
    func scrolled(to offset: CGFloat) {
        let delta: CGFloat = offset - lastOffset
        lastOffset = offset
        if offset <= 12 {
            travel = 0
            setStyle(FlowdTabBarStyle.full)
            return
        }
        if delta == 0 {
            return
        }
        if (delta > 0) == (travel >= 0) {
            travel += delta
        } else {
            travel = delta
        }
        if travel > 36 {
            setStyle(FlowdTabBarStyle.compact)
        } else if travel < -16 {
            setStyle(FlowdTabBarStyle.full)
        }
    }

    /// Back to the full bar (a tab switch).
    func reset() {
        lastOffset = 0
        travel = 0
        setStyle(FlowdTabBarStyle.full)
    }

    private func setStyle(_ newStyle: FlowdTabBarStyle) {
        if style != newStyle {
            style = newStyle
        }
    }
}

struct TabShell: View {
    @Environment(AppState.self) private var appState: AppState
    @Environment(Router.self) private var router: Router
    @State private var chrome: TabBarChrome = TabBarChrome()
    @State private var fanOpen: Bool = false
    private var appearance: FlowdAppearance = FlowdAppearance()

    var body: some View {
        TabView(selection: router.creatorSelection) {
            tabContent(AppTab.home, root: Route.home)
            tabContent(AppTab.bounties, root: Route.bounties)
            tabContent(AppTab.wallet, root: Route.wallet)
            tabContent(AppTab.profile, root: Route.profile)
        }
        .tint(FlowdColor.accent)
        .overlay(alignment: .bottomTrailing) {
            captureChrome
        }
        .overlay {
            fanOverlay
        }
        .onChange(of: router.selectedTab) { (_: AppTab, newTab: AppTab) in
            fanOpen = false
            chrome.reset()
            if newTab == AppTab.wallet {
                appState.markWalletSeen()
            }
        }
        .onAppear {
            if router.selectedTab == AppTab.wallet {
                appState.markWalletSeen()
            }
        }
    }

    // MARK: Tabs

    @ViewBuilder
    private func tabContent(_ tab: AppTab, root: Route) -> some View {
        let nav: TabNav = router.nav(tab)
        RoutedStack(nav: nav) {
            ScreenRegistry.view(for: root)
        }
        .environment(\.flowdScrollToTopTick, nav.scrollTick)
        .environment(\.flowdScrollReport, scrollReport(for: tab))
        .tag(tab)
        .tabItem {
            Label(tab.title, systemImage: tab.systemImage)
        }
        .badge(tab == AppTab.home ? appState.unreadCount : 0)
    }

    /// Scroll offsets from the selected tab's screens drive the compact bar; the other tabs (kept alive by `TabView`) are ignored.
    private func scrollReport(for tab: AppTab) -> (CGFloat) -> Void {
        let router: Router = self.router
        let chrome: TabBarChrome = self.chrome
        return { (offset: CGFloat) in
            if router.selectedTab == tab {
                chrome.scrolled(to: offset)
            }
        }
    }

    // MARK: Bottom chrome

    /// The system tab bar (Liquid Glass on iOS 26) stays untouched. Making a take is a floating action above it.
    private var captureChrome: some View {
        VStack(alignment: .trailing, spacing: FlowdSpacing.sm) {
            if let draft = appState.latestDraft, !fanOpen {
                ContinueDraftAccessory(draft: draft, isCompact: true) {
                    router.open(Route.studio(StudioEntry.resume(draftID: draft.id)))
                }
                .transition(AnyTransition.flowdRise)
            }
            Button {
                toggleFan()
            } label: {
                Image(systemName: "video.fill")
            }
            .buttonStyle(FlowdGlassButtonStyle(.primary, size: .large, isIconOnly: true, haptic: .tap))
            .accessibilityLabel("Make a take")
        }
        .padding(.trailing, FlowdLayout.gutter)
        .padding(.bottom, 84)
        .flowdAnimation(FlowdSpring.smooth, value: appState.latestDraft?.id)
    }

    private var leadingItems: [FlowdTabItem<AppTab>] {
        let unread: Int? = appState.unreadCount > 0 ? appState.unreadCount : nil
        let drop: FlowdTabDot? = appState.dropIsLive ? FlowdTabDot(tone: FlowdTone.ember, label: "Daily Drop is live") : nil
        return [
            FlowdTabItem(
                id: AppTab.home,
                title: AppTab.home.title,
                systemImage: AppTab.home.systemImage,
                selectedSystemImage: AppTab.home.selectedSystemImage,
                badge: unread,
                dot: drop
            ),
            FlowdTabItem(
                id: AppTab.bounties,
                title: AppTab.bounties.title,
                systemImage: AppTab.bounties.systemImage,
                selectedSystemImage: AppTab.bounties.selectedSystemImage
            )
        ]
    }

    private var trailingItems: [FlowdTabItem<AppTab>] {
        let cleared: FlowdTabDot? = appState.walletDot ? FlowdTabDot(tone: FlowdTone.mint, label: "Money cleared") : nil
        return [
            FlowdTabItem(
                id: AppTab.wallet,
                title: AppTab.wallet.title,
                systemImage: AppTab.wallet.systemImage,
                selectedSystemImage: AppTab.wallet.selectedSystemImage,
                dot: cleared
            ),
            FlowdTabItem(
                id: AppTab.profile,
                title: AppTab.profile.title,
                systemImage: AppTab.profile.systemImage,
                selectedSystemImage: AppTab.profile.selectedSystemImage
            )
        ]
    }

    // MARK: Studio action fan

    @ViewBuilder
    private var fanOverlay: some View {
        if fanOpen {
            ActionFanOverlay(actions: fanActions) {
                closeFan()
            }
            .transition(AnyTransition.opacity)
        }
    }

    private var fanActions: [ActionFanAction] {
        return [
            ActionFanAction(id: "record", title: "Record", systemImage: "video.fill", tone: FlowdTone.accent) {
                openStudio(StudioEntry.record(bountyID: nil))
            },
            ActionFanAction(id: "upload", title: "Upload", systemImage: "square.and.arrow.up", tone: FlowdTone.info) {
                openStudio(StudioEntry.importVideo(bountyID: nil))
            },
            ActionFanAction(id: "script", title: "Script with Flo", systemImage: "sparkles", tone: FlowdTone.violet) {
                openStudio(StudioEntry.scriptWithFlo(bountyID: nil))
            }
        ]
    }

    private func toggleFan() {
        withAnimation(appearance.animation(FlowdSpring.snappy)) {
            fanOpen.toggle()
        }
    }

    private func closeFan() {
        withAnimation(appearance.animation(FlowdSpring.snappy)) {
            fanOpen = false
        }
    }

    private func openStudio(_ entry: StudioEntry) {
        fanOpen = false
        router.open(Route.studio(entry))
    }
}

#Preview {
    TabShell()
        .flowdPreviewEnvironment()
}
