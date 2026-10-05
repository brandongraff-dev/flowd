import SwiftUI

// The root of the view hierarchy: the launch gate and the persona shells.
//
//   launching   the splash (the mark draws itself) while the session is restored
//   onboarding  the first-run flow (`OnboardingFlowView`); it calls `appState.completeOnboarding(session:)` when done
//   ready       the persona's shell: `TabShell` (creator), `BrandShell`, `AdminShell`; or `DesignGallery` for `-FlowdScreen design-gallery`
//   failed / maintenance / updateRequired   calm, specific states with the one next step that exists
//
// The gate swaps with the design system's materialise transition, so the first frame is never the wrong tab. Sheets, the full-screen cover and the
// overlays (toasts, the offline banner, the celebration layer) hang off this view; the deep-link router and the persona switch act on it through
// `AppState` and `Router`.

struct RootView: View {
    @Environment(AppState.self) private var appState: AppState
    @Environment(Router.self) private var router: Router

    var body: some View {
        @Bindable var router = router
        ZStack {
            FlowdColor.bg
                .ignoresSafeArea()
            content
        }
        .flowdAnimation(FlowdSpring.gentle, value: appState.phase)
        .flowdAnimation(FlowdSpring.gentle, value: appState.persona)
        .modifier(AppOverlays())
        .sheet(item: $router.sheet, onDismiss: { router.sheetDidDismiss() }) { (route: Route) in
            SheetHost(route: route)
        }
        .fullScreenCover(item: $router.cover, onDismiss: { coverDismissed() }) { (cover: CoverRoute) in
            CoverHost(cover: cover)
        }
        .task(id: appState.phase) {
            await presentDeferredLaunchRoute()
        }
    }

    // MARK: Gate

    @ViewBuilder
    private var content: some View {
        switch appState.phase {
        case .launching:
            SplashView()
                .transition(AnyTransition.flowdMaterialize)
        case .onboarding:
            OnboardingFlowView()
                .transition(AnyTransition.flowdMaterialize)
        case .ready:
            shell
                .transition(AnyTransition.flowdMaterialize)
        case .failed(let message):
            LaunchProblemView(kind: LaunchProblemView.Kind.failed(message)) {
                Task {
                    await appState.retryLaunch()
                }
            }
            .transition(AnyTransition.flowdMaterialize)
        case .maintenance(let statusLink):
            LaunchProblemView(kind: LaunchProblemView.Kind.maintenance(statusLink)) {
                Task {
                    await appState.retryLaunch()
                }
            }
            .transition(AnyTransition.flowdMaterialize)
        case .updateRequired:
            LaunchProblemView(kind: LaunchProblemView.Kind.updateRequired) {
                Task {
                    await appState.retryLaunch()
                }
            }
            .transition(AnyTransition.flowdMaterialize)
        }
    }

    /// The persona's shell (or the design-system catalogue for the `design-gallery` launch key).
    @ViewBuilder
    private var shell: some View {
        if appState.launch.showsDesignGallery {
            DesignGallery()
        } else {
            switch appState.persona {
            case .creator:
                TabShell()
                    .transition(AnyTransition.flowdMaterialize)
            case .brand:
                BrandShell()
                    .transition(AnyTransition.flowdMaterialize)
            case .admin:
                AdminShell()
                    .transition(AnyTransition.flowdMaterialize)
            }
        }
    }

    // MARK: Presentation

    private func coverDismissed() {
        router.coverDidDismiss()
        appState.refreshDrafts()
        Task {
            await appState.refresh()
        }
    }

    /// A sheet or cover from `-FlowdScreen` is presented a moment after the shell's first frame; presenting during the first render is unreliable.
    private func presentDeferredLaunchRoute() async {
        guard appState.phase == AppState.Phase.ready, let route = appState.deferredLaunchRoute else {
            return
        }
        appState.deferredLaunchRoute = nil
        try? await Task.sleep(nanoseconds: 900_000_000)
        router.open(route)
    }
}

#Preview("Ready") {
    RootView()
        .flowdPreviewEnvironment()
}
