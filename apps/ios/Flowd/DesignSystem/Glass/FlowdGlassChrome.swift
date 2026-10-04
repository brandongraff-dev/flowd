import SwiftUI

// Sheets, custom bottom bars, scroll edge effects and navigation chrome. These are the only places that gate iOS 26 bar and
// sheet APIs. On iOS 26 system bars, sheets and menus become glass by themselves (build with Xcode 26, never set
// UIDesignRequiresCompatibility), so the rule is: delete custom backgrounds and let the system draw them.

extension View {
    /// Apply to the ROOT of a sheet's content: `.sheet(isPresented: $show) { OfferSheet().flowdSheetChrome() }`.
    /// iOS 26: the system's inset glass sheet is kept (no custom background). iOS 17-25: a Material background with a 28 pt radius.
    @ViewBuilder
    func flowdSheetChrome(
        detents: Set<PresentationDetent> = [.medium, .large],
        showsGrabber: Bool = true
    ) -> some View {
        if #available(iOS 26.0, *) {
            self
                .presentationDetents(detents)
                .presentationDragIndicator(showsGrabber ? Visibility.visible : Visibility.hidden)
        } else {
            self
                .presentationDetents(detents)
                .presentationDragIndicator(showsGrabber ? Visibility.visible : Visibility.hidden)
                .presentationBackground(Material.regular)
                .presentationCornerRadius(FlowdRadius.xxl)
        }
    }

    /// A custom floating bar over scrolling content (tab bar, sticky "Make it" bar).
    /// iOS 26: `safeAreaBar`, which also extends the scroll edge effect under the bar. Before: `safeAreaInset`.
    @ViewBuilder
    func flowdBottomBar<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
        let built: Bar = bar()
        if #available(iOS 26.0, *) {
            self.safeAreaBar(edge: .bottom, spacing: 0) { built }
        } else {
            self.safeAreaInset(edge: .bottom, spacing: 0) { built }
        }
    }

    /// Same as `flowdBottomBar` for the top edge (custom header bars over a scroll view).
    @ViewBuilder
    func flowdTopBar<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
        let built: Bar = bar()
        if #available(iOS 26.0, *) {
            self.safeAreaBar(edge: .top, spacing: 0) { built }
        } else {
            self.safeAreaInset(edge: .top, spacing: 0) { built }
        }
    }

    /// Scroll edge effect under floating chrome: soft (default) blurs and fades, hard suits dense, pinned UIs.
    /// Use ONE style per screen and only where floating UI really overlaps scrolling content. No-op before iOS 26.
    @ViewBuilder
    func flowdScrollEdgeEffect(hard: Bool = false, edges: Edge.Set = .all) -> some View {
        if #available(iOS 26.0, *) {
            self.scrollEdgeEffectStyle(hard ? ScrollEdgeEffectStyle.hard : ScrollEdgeEffectStyle.soft, for: edges)
        } else {
            self
        }
    }

    /// Lets the aurora show through a navigation bar on iOS 17-25. On iOS 26 the bar is already a floating glass layer
    /// and custom bar backgrounds fight the scroll edge effect, so nothing is applied.
    @ViewBuilder
    func flowdClearNavigationBar() -> some View {
        if #available(iOS 26.0, *) {
            self
        } else {
            self.toolbarBackground(Visibility.hidden, for: .navigationBar)
        }
    }

    /// Hides the system tab bar so a custom `FlowdTabBar` can replace it.
    func flowdHideSystemTabBar() -> some View {
        return toolbar(Visibility.hidden, for: .tabBar)
    }

    /// Marks this view as the SOURCE of a zoom transition, so a card or button visually grows into the screen it opens (iOS 18+).
    /// Pair with `flowdZoomDestination` on the pushed or presented view. Share one `@Namespace` and one id. No-op before iOS 18.
    ///
    ///     BountyCard(bounty).flowdZoomSource(id: bounty.id, in: zoomNamespace)
    @ViewBuilder
    func flowdZoomSource<ID: Hashable>(id: ID, in namespace: Namespace.ID) -> some View {
        if #available(iOS 18.0, *) {
            self.matchedTransitionSource(id: id, in: namespace)
        } else {
            self
        }
    }

    /// The DESTINATION of a zoom transition: apply to the root of the pushed view or a sheet's content (iOS 18+; no-op before).
    ///
    ///     BountyDetailView(bounty).flowdZoomDestination(sourceID: bounty.id, in: zoomNamespace)
    @ViewBuilder
    func flowdZoomDestination<ID: Hashable>(sourceID: ID, in namespace: Namespace.ID) -> some View {
        if #available(iOS 18.0, *) {
            self.navigationTransition(.zoom(sourceID: sourceID, in: namespace))
        } else {
            self
        }
    }
}

// MARK: - Preview

private struct SheetChromePreview: View {
    @State private var showSheet: Bool = true

    var body: some View {
        FlowdPreviewCanvas {
            Button {
                showSheet = true
            } label: {
                Text("Open sheet")
            }
            .buttonStyle(FlowdGlassButtonStyle(.primary))
            .padding(FlowdSpacing.xl)
            .sheet(isPresented: $showSheet) {
                VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                    Text("Make an offer").flowdDisplay(.title2).flowdInk(.primary)
                    Text("Held in escrow. Released only for verified views.")
                        .flowdBody(.callout).flowdInk(.muted)
                    Spacer()
                }
                .padding(FlowdSpacing.xl)
                .frame(maxWidth: .infinity, alignment: .leading)
                .flowdSheetChrome(detents: [.medium])
            }
        }
    }
}

#Preview("Sheet chrome") {
    SheetChromePreview()
}
