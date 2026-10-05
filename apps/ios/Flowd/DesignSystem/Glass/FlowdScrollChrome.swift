import SwiftUI

// Scroll plumbing for floating chrome. Two jobs, both driven by the app shell through the environment so a feature screen needs no code:
//
//   1. Scroll to top. Tapping the already-selected tab bumps `flowdScrollToTopTick`; every `FlowdScreen` under that tab scrolls back to its top.
//   2. Minimise on scroll (iOS 26). `FlowdScreen` reports its scroll offset through `flowdScrollReport`; the shell turns "scrolling down" into the
//      compact (icons only) tab bar and "scrolling up" back into the full one. Before iOS 26 nothing is reported and the bar stays full.
//
// A screen that does not use `FlowdScreen` (its own ScrollView or List) can opt in with `.flowdReportScrollOffset(report)` on the scroll view and
// the `flowdScrollChrome(proxy:)` modifier inside a `ScrollViewReader`, but the standard `FlowdScreen` already does both.

/// The id `FlowdScreen` puts on the top of its content so `ScrollViewProxy.scrollTo` can return to the top.
enum FlowdScrollAnchor {
    static let top: String = "flowd.scroll.top"
}

// MARK: - Environment

private struct FlowdScrollReportKey: EnvironmentKey {
    static let defaultValue: ((CGFloat) -> Void)? = nil
}

private struct FlowdScrollToTopTickKey: EnvironmentKey {
    static let defaultValue: Int = 0
}

extension EnvironmentValues {
    /// Receives the distance scrolled from the top (0 at rest) while a `FlowdScreen` scrolls. Nil outside the app shell.
    var flowdScrollReport: ((CGFloat) -> Void)? {
        get { return self[FlowdScrollReportKey.self] }
        set { self[FlowdScrollReportKey.self] = newValue }
    }

    /// Changes whenever the selected tab is tapped again; `FlowdScreen` scrolls to its top on every change.
    var flowdScrollToTopTick: Int {
        get { return self[FlowdScrollToTopTickKey.self] }
        set { self[FlowdScrollToTopTickKey.self] = newValue }
    }
}

// MARK: - Modifiers

extension View {
    /// Reports the scroll offset (iOS 26 and later; a no-op before) to `report`. Apply to a ScrollView.
    @ViewBuilder
    func flowdReportScrollOffset(_ report: ((CGFloat) -> Void)?) -> some View {
        if #available(iOS 26.0, *) {
            if let report = report {
                self.onScrollGeometryChange(
                    for: CGFloat.self,
                    of: { (geometry: ScrollGeometry) -> CGFloat in
                        return geometry.contentOffset.y + geometry.contentInsets.top
                    },
                    action: { (_: CGFloat, newValue: CGFloat) in
                        report(newValue)
                    }
                )
            } else {
                self
            }
        } else {
            self
        }
    }

    /// Wires a ScrollView to the shell's scroll chrome: scroll to top on a tab re-tap, offset reports for the minimising tab bar.
    /// `FlowdScreen` applies it; use it yourself only on a custom scroll view inside a `ScrollViewReader`.
    func flowdScrollChrome(proxy: ScrollViewProxy) -> some View {
        return modifier(FlowdScrollChromeModifier(proxy: proxy))
    }
}

struct FlowdScrollChromeModifier: ViewModifier {
    let proxy: ScrollViewProxy
    @Environment(\.flowdScrollToTopTick) private var topTick: Int
    @Environment(\.flowdScrollReport) private var report: ((CGFloat) -> Void)?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion: Bool

    func body(content: Content) -> some View {
        content
            .onChange(of: topTick) { (_: Int, _: Int) in
                withAnimation(reduceMotion ? nil : FlowdMotion.smooth) {
                    proxy.scrollTo(FlowdScrollAnchor.top, anchor: UnitPoint.top)
                }
            }
            .flowdReportScrollOffset(report)
    }
}
