import SwiftUI

// What floats over the whole app: toasts (calm, one host, three at most), the offline and upload banner, and the celebration layer for earned outcomes.
// `RootView` applies it once; sheets and covers add their own `flowdToastHost()` because a presentation covers the root's overlay, so the root's host
// steps aside while anything is presented (no toast shows twice).
//
// Haptics are not duplicated here: toasts play their own (`success` for money and approvals, `warning`, `error`), the design system's controls play
// theirs, and the confetti pairs with the toast's haptic. Nothing in this file adds a haptic of its own.

struct AppOverlays: ViewModifier {
    @Environment(AppState.self) private var appState: AppState
    @Environment(Router.self) private var router: Router
    @Environment(\.flowdToasts) private var toasts: ToastCenter

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                VStack(spacing: FlowdSpacing.xs) {
                    ConnectionBanner()
                    ToastHost(center: toasts, placement: FlowdToastPlacement.top)
                }
                .frame(maxWidth: .infinity)
                .flowdAnimation(FlowdSpring.snappy, value: appState.connectivity.isOnline)
                .flowdAnimation(FlowdSpring.snappy, value: appState.pendingUploads)
                .opacity(router.isPresenting ? 0 : 1)
                .allowsHitTesting(!router.isPresenting)
            }
            .overlay {
                CelebrationLayer(trigger: appState.confettiTrigger)
            }
    }
}

// MARK: - Connection banner

/// "You're offline. Everything you made is saved. We'll sync when you're back." and "2 uploads waiting". Tapping it opens the upload queue; Retry
/// resumes stopped uploads. It is information, never an alarm: nothing the creator made is lost while it shows.
struct ConnectionBanner: View {
    @Environment(AppState.self) private var appState: AppState
    @Environment(Router.self) private var router: Router

    var body: some View {
        let offline: Bool = !appState.connectivity.isOnline
        let waiting: Int = appState.pendingUploads
        if offline || waiting > 0 {
            banner(offline: offline, waiting: waiting)
                .transition(AnyTransition.flowdRise)
        }
    }

    private func banner(offline: Bool, waiting: Int) -> some View {
        HStack(spacing: FlowdSpacing.sm) {
            Image(systemName: offline ? "wifi.slash" : "arrow.triangle.2.circlepath")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(offline ? FlowdTone.ember.ink : FlowdTone.info.ink)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title(offline: offline, waiting: waiting))
                    .flowdBody(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(FlowdColor.fg)
                Text(detail(offline: offline, waiting: waiting))
                    .flowdCaption(.footnote)
                    .foregroundStyle(FlowdColor.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            if waiting > 0 {
                Button {
                    if offline {
                        router.present(Route.uploadQueue)
                    } else {
                        Task {
                            await appState.retryPendingUploads()
                        }
                    }
                } label: {
                    Text(offline ? "View" : "Retry")
                        .flowdText(FlowdFont.buttonCompact)
                        .foregroundStyle(FlowdColor.accent)
                        .padding(.horizontal, FlowdSpacing.xs)
                        .frame(minHeight: FlowdLayout.hitTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(FlowdPressStyle())
            }
        }
        .padding(.leading, FlowdSpacing.md)
        .padding(.trailing, waiting > 0 ? FlowdSpacing.xs : FlowdSpacing.md)
        .padding(.vertical, FlowdSpacing.sm)
        .frame(maxWidth: 520)
        .flowdGlass(FlowdGlassLayer.l2, cornerRadius: FlowdRadius.xl)
        .padding(.horizontal, FlowdSpacing.md)
        .onTapGesture {
            if waiting > 0 {
                router.present(Route.uploadQueue)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func title(offline: Bool, waiting: Int) -> String {
        if offline {
            return "You're offline"
        }
        return waiting == 1 ? "1 upload waiting" : String(waiting) + " uploads waiting"
    }

    private func detail(offline: Bool, waiting: Int) -> String {
        if offline {
            return "Everything you made is saved. We'll sync when you're back."
        }
        return "Your takes are saved on this phone. Retry sends them now."
    }
}

// MARK: - Celebration layer

/// The Mint bloom for earned outcomes: confetti in money colours, or a short Mint wash under Reduce Motion. It ignores touches and is hidden from
/// VoiceOver (the toast that comes with it is announced).
struct CelebrationLayer: View {
    let trigger: Int
    @State private var wash: Double = 0
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(trigger: Int) {
        self.trigger = trigger
    }

    var body: some View {
        ZStack {
            ConfettiView(trigger: trigger, colors: FlowdConfettiPalette.money)
            Rectangle()
                .fill(FlowdColor.mintSoft)
                .ignoresSafeArea()
                .opacity(wash)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onChange(of: trigger) { (_: Int, _: Int) in
            if appearance.reduceMotion {
                playWash()
            }
        }
    }

    private func playWash() {
        wash = 1
        Task {
            try? await Task.sleep(nanoseconds: 180_000_000)
            withAnimation(FlowdMotion.standard(FlowdMotion.slower)) {
                wash = 0
            }
        }
    }
}
