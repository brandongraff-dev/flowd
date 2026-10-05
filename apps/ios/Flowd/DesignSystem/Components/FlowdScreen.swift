import SwiftUI

// FlowdScreen: the standard scrolling screen. The aurora (L0) behind a vertical scroll view with the 16 pt gutter, a 20 pt rhythm
// between blocks, hidden scroll indicators and the soft scroll edge effect under floating chrome (iOS 26). Content goes in as plain
// sibling views (cards, section headers, rows); keep each block a FlowdCard so text always sits on quiet glass, not on the aurora.
// Pair with `.flowdBottomBar { FlowdTabBar(...) }` and `.flowdNavigationTitle(...)` at the call site.

/// ```
/// FlowdScreen {
///     SectionHeader("Today")
///     FlowdCard { FlowdEarningsPair(clearedCents: 128460, pendingCents: 18620, pendingNote: "clears Sat 2:00 PM") }
///     SectionHeader("For you", actionTitle: "See all") { openAll() }
/// }
/// .flowdNavigationTitle("Home")
/// ```
struct FlowdScreen<Content: View>: View {
    private let aurora: FlowdAuroraIntensity
    private let spacing: CGFloat
    private let content: Content

    /// - Parameters:
    ///   - aurora: `.full` for Home, onboarding and hero screens; `.calm` (60 percent) for dense data screens.
    ///   - spacing: vertical gap between top-level blocks. Defaults to 20 pt.
    init(
        aurora: FlowdAuroraIntensity = .full,
        spacing: CGFloat = FlowdSpacing.lg,
        @ViewBuilder content: () -> Content
    ) {
        self.aurora = aurora
        self.spacing = spacing
        self.content = content()
    }

    var body: some View {
        ScrollViewReader { (proxy: ScrollViewProxy) in
            ScrollView {
                VStack(alignment: .leading, spacing: spacing) {
                    content
                }
                .padding(.horizontal, FlowdLayout.gutter)
                .padding(.top, FlowdSpacing.xs)
                .padding(.bottom, FlowdSpacing.xl)
                .frame(maxWidth: .infinity, alignment: .leading)
                .id(FlowdScrollAnchor.top)
            }
            .scrollIndicators(.hidden)
            .flowdScrollEdgeEffect()
            .flowdScrollChrome(proxy: proxy)
            .flowdAurora(aurora)
        }
    }
}

// MARK: - Preview

#Preview("Screen") {
    NavigationStack {
        FlowdScreen {
            SectionHeader("Today", subtitle: "Friday, Oct 3")
            FlowdCard {
                FlowdEarningsPair(clearedCents: 128_460, pendingCents: 18_620, pendingNote: "clears Sat 2:00 PM")
            }
            SectionHeader("For you", subtitle: "Matched to your niches", actionTitle: "See all") {}
            FlowdCard {
                ListRow(title: "Lumen Sleep", subtitle: "$2.10 per 1,000 views + $1.50 per trial", systemImage: "moon.stars.fill", showsChevron: true)
            }
        }
        .flowdNavigationTitle("Home")
    }
}
