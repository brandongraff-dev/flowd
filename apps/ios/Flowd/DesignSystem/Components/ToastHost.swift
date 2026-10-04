import SwiftUI

// ToastHost draws the center's toasts as L2 glass capsules over everything. Apply once at the app root: `RootView().flowdToastHost()`.
// Tap or swipe up to dismiss. Toasts never sit on top of another glass control's backdrop in a way that stacks glass: they float over
// content only, in the safe area, and the stack is capped at three.

enum FlowdToastPlacement: Hashable, Sendable {
    case top
    case bottom
}

struct ToastHost: View {
    let center: ToastCenter
    let placement: FlowdToastPlacement
    let bottomInset: CGFloat

    private var appearance: FlowdAppearance = FlowdAppearance()

    init(center: ToastCenter, placement: FlowdToastPlacement = .top, bottomInset: CGFloat = 0) {
        self.center = center
        self.placement = placement
        self.bottomInset = bottomInset
    }

    var body: some View {
        let items: [FlowdToast] = center.toasts
        return FlowdGlassContainer(spacing: 8) {
            VStack(spacing: FlowdSpacing.xs) {
                ForEach(items) { (toast: FlowdToast) in
                    FlowdToastView(toast: toast) {
                        center.dismiss(toast.id)
                    }
                    .transition(transition)
                }
            }
        }
        .padding(.horizontal, FlowdSpacing.md)
        .padding(.top, placement == FlowdToastPlacement.top ? FlowdSpacing.xs : 0)
        .padding(.bottom, placement == FlowdToastPlacement.bottom ? FlowdSpacing.xs + bottomInset : 0)
        .animation(appearance.animation(.snappy), value: items.map { (toast: FlowdToast) -> UUID in toast.id })
    }

    private var transition: AnyTransition {
        if appearance.reduceMotion {
            return AnyTransition.opacity
        }
        let edge: Edge = placement == FlowdToastPlacement.top ? Edge.top : Edge.bottom
        return AnyTransition.move(edge: edge).combined(with: AnyTransition.opacity)
    }
}

/// One toast: icon, message, optional detail and action, on an L2 glass capsule (radius 22 when it wraps to two lines).
struct FlowdToastView: View {
    let toast: FlowdToast
    let onDismiss: () -> Void

    init(toast: FlowdToast, onDismiss: @escaping () -> Void) {
        self.toast = toast
        self.onDismiss = onDismiss
    }

    var body: some View {
        HStack(spacing: FlowdSpacing.sm) {
            Image(systemName: toast.systemImage)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(toast.kind.tone.ink)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(toast.message)
                    .flowdBody(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(FlowdColor.fg)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = toast.detail {
                    Text(detail)
                        .flowdCaption(.footnote)
                        .foregroundStyle(FlowdColor.fgMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            if let actionTitle = toast.actionTitle {
                Button {
                    toast.action?()
                    onDismiss()
                } label: {
                    Text(actionTitle)
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
        .padding(.trailing, toast.actionTitle == nil ? FlowdSpacing.md : FlowdSpacing.xs)
        .padding(.vertical, FlowdSpacing.sm)
        .frame(maxWidth: 520)
        .flowdGlass(.l2, cornerRadius: FlowdRadius.xl)
        .contentShape(Rectangle())
        .onTapGesture { onDismiss() }
        .gesture(
            DragGesture(minimumDistance: 10)
                .onEnded { (value: DragGesture.Value) in
                    if abs(value.translation.height) > 16 {
                        onDismiss()
                    }
                }
        )
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isStaticText)
        .accessibilityAction(named: "Dismiss") { onDismiss() }
    }
}

// MARK: - Modifier

struct FlowdToastHostModifier: ViewModifier {
    let placement: FlowdToastPlacement
    let bottomInset: CGFloat
    @Environment(\.flowdToasts) private var center: ToastCenter

    func body(content: Content) -> some View {
        content.overlay(alignment: placement == FlowdToastPlacement.top ? Alignment.top : Alignment.bottom) {
            ToastHost(center: center, placement: placement, bottomInset: bottomInset)
        }
    }
}

extension View {
    /// Draw toasts over this view. Apply once at the root. `bottomInset` lifts bottom toasts above a floating tab bar.
    func flowdToastHost(placement: FlowdToastPlacement = .top, bottomInset: CGFloat = 0) -> some View {
        return modifier(FlowdToastHostModifier(placement: placement, bottomInset: bottomInset))
    }
}

// MARK: - Preview

private struct ToastPreview: View {
    @Environment(\.flowdToasts) private var toasts: ToastCenter

    var body: some View {
        FlowdPreviewCanvas {
            VStack(spacing: FlowdSpacing.md) {
                FlowdButton("Success", variant: .secondary, fullWidth: true) { toasts.success("Draft saved") }
                FlowdButton("Money", variant: .secondary, fullWidth: true) { toasts.money("$62.40 cleared to your Wallet") }
                FlowdButton("Warning", variant: .secondary, fullWidth: true) {
                    toasts.warning("You're offline", detail: "Everything you made is saved. We'll sync when you're back.")
                }
                FlowdButton("Error with action", variant: .secondary, fullWidth: true) {
                    toasts.error("Upload stopped at 62%", detail: "Your take is saved on this phone.", actionTitle: "Retry") {}
                }
            }
            .padding(FlowdSpacing.lg)
        }
        .flowdToastHost()
    }
}

#Preview("Toasts") {
    ToastPreview()
}
