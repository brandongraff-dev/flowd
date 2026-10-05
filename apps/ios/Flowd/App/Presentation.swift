import SwiftUI

// How the shell presents routes: sheets (`SheetHost`), full-screen covers (`CoverHost`) and the host that lets the Studio cover show sheets
// (`CoverSheetHost`). `RootView` attaches the root sheet and cover; the Studio attaches its own sheet host.

/// A sheet over the shell: a `NavigationStack` (so the content can set a title and toolbar items), a close button, L3 chrome from the design system,
/// its own toast host, and a nested sheet for a sheet opened from this sheet. Content views set `.flowdNavigationTitle(_, large: false)` and add
/// their own toolbar items (a primary "Done" or "Send"); the close button is added here.
struct SheetHost: View {
    let route: Route
    @Environment(Router.self) private var router: Router
    @Environment(\.dismiss) private var dismiss: DismissAction

    var body: some View {
        @Bindable var router = router
        NavigationStack {
            ScreenRegistry.view(for: route)
                .toolbar {
                    FlowdCloseToolbarItem {
                        dismiss()
                    }
                }
        }
        .flowdSheetChrome(detents: detents)
        .flowdToastHost()
        .sheet(item: $router.nestedSheet, onDismiss: { router.sheetDidDismiss() }) { (nested: Route) in
            SheetHost(route: nested)
        }
    }

    private var detents: Set<PresentationDetent> {
        switch route.sheetSize {
        case .mediumLarge:
            return [PresentationDetent.medium, PresentationDetent.large]
        case .large:
            return [PresentationDetent.large]
        case .medium:
            return [PresentationDetent.medium]
        }
    }
}

/// Lets a full-screen cover show sheets: a sheet cannot be presented from a view that is covered, so the cover hosts the sheets that
/// `Router.present` routes to `coverSheet`.
struct CoverSheetHost: ViewModifier {
    @Environment(Router.self) private var router: Router

    func body(content: Content) -> some View {
        @Bindable var router = router
        content
            .sheet(item: $router.coverSheet, onDismiss: { router.sheetDidDismiss() }) { (route: Route) in
                SheetHost(route: route)
            }
    }
}

/// A full-screen presentation: Studio, Wrapped, any other routed cover, and the two celebration screens (tier-up, payout arrived).
struct CoverHost: View {
    let cover: CoverRoute
    @Environment(AppState.self) private var appState: AppState
    @Environment(Router.self) private var router: Router

    var body: some View {
        content
            .flowdToastHost()
            .flowdRoot()
    }

    @ViewBuilder
    private var content: some View {
        switch cover {
        case .route(let route):
            routed(route)
        case .payoutArrived(let amountCents, let methodTitle, let arrivalNote, let isInstant):
            PayoutArriveView(amountCents: amountCents, methodTitle: methodTitle, arrivalNote: arrivalNote, isInstant: isInstant) {
                router.dismissCover()
            }
        case .tierUp(let to, let from):
            TierUpView(to: to.flowdLevel, from: from?.flowdLevel, showsConfetti: to == Tier.elite) {
                router.dismissCover()
            }
        }
    }

    @ViewBuilder
    private func routed(_ route: Route) -> some View {
        switch route {
        case .studio(let entry):
            StudioHostView(entry: entry, draft: draft(for: entry))
        case .wrapped:
            ScreenRegistry.view(for: route)
                .modifier(CoverSheetHost())
        default:
            NavigationStack {
                ScreenRegistry.view(for: route)
            }
            .modifier(CoverSheetHost())
        }
    }

    /// The stored draft behind a `.resume` entry.
    private func draft(for entry: StudioEntry) -> DraftSnapshot? {
        if case .resume(let draftID) = entry {
            return appState.draftStore?.draft(id: draftID)
        }
        return nil
    }
}
