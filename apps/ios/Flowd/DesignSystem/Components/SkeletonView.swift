import SwiftUI

// Loading is a shimmering glass skeleton that stops under Reduce Motion (it stays as a calm static placeholder). Skeletons appear
// after ~200 ms and the real content replaces them in place with no layout jump, so give skeleton blocks the real content's size.

// MARK: - Shimmer

struct FlowdShimmerModifier: ViewModifier {
    let isActive: Bool

    @State private var phase: CGFloat = 0
    @Environment(\.colorScheme) private var colorScheme: ColorScheme
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(isActive: Bool) {
        self.isActive = isActive
    }

    func body(content: Content) -> some View {
        content
            .overlay {
                if isActive {
                    GeometryReader { (proxy: GeometryProxy) in
                        let width: CGFloat = proxy.size.width
                        LinearGradient(
                            colors: [Color.clear, highlight, Color.clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: width * 0.6)
                        .offset(x: -width * 0.6 + phase * width * 1.6)
                    }
                    .mask { content }
                    .allowsHitTesting(false)
                }
            }
            .onAppear { startIfNeeded() }
            .onChange(of: isActive) { _, _ in startIfNeeded() }
    }

    private var highlight: Color {
        return FlowdPrimitive.white.opacity(colorScheme == ColorScheme.dark ? 0.16 : 0.7)
    }

    private func startIfNeeded() {
        if !isActive || appearance.reduceMotion {
            phase = 0.35
            return
        }
        phase = 0
        withAnimation(Animation.linear(duration: 1.4).repeatForever(autoreverses: false)) {
            phase = 1
        }
    }
}

extension View {
    /// Adds a moving glass sheen over any view while `active` (static under Reduce Motion).
    func flowdShimmer(active: Bool = true) -> some View {
        return modifier(FlowdShimmerModifier(isActive: active))
    }

    /// Turns real content into its own skeleton: redacted placeholders plus the shimmer, and no interaction.
    ///
    ///     FeedList(items: items).flowdSkeleton(isLoading: viewModel.isLoading)
    func flowdSkeleton(isLoading: Bool) -> some View {
        return redacted(reason: isLoading ? RedactionReasons.placeholder : RedactionReasons())
            .flowdShimmer(active: isLoading)
            .allowsHitTesting(!isLoading)
            .accessibilityHidden(isLoading)
    }
}

// MARK: - Blocks

/// A skeleton block (text line, thumbnail, avatar, card). `SkeletonView(height: 16)`, `SkeletonView(width: 44, height: 44, radius: 22)`.
struct SkeletonView: View {
    let width: CGFloat?
    let height: CGFloat
    let radius: CGFloat

    init(width: CGFloat? = nil, height: CGFloat = 16, radius: CGFloat = FlowdRadius.sm) {
        self.width = width
        self.height = height
        self.radius = radius
    }

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(FlowdColor.surfaceActive)
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? CGFloat.infinity : nil)
            .flowdShimmer()
            .accessibilityHidden(true)
    }
}

/// Paragraph skeleton: `lines` bars, the last one shorter.
struct SkeletonLines: View {
    let lines: Int
    let lineHeight: CGFloat

    init(lines: Int = 3, lineHeight: CGFloat = 14) {
        self.lines = lines
        self.lineHeight = lineHeight
    }

    var body: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
            ForEach(0..<max(lines, 1), id: \.self) { (index: Int) in
                SkeletonView(height: lineHeight)
                    .padding(.trailing, index == max(lines, 1) - 1 && lines > 1 ? 72 : 0)
            }
        }
    }
}

/// A list-row skeleton: avatar + two lines + trailing figure. Matches `ListRow` metrics.
struct SkeletonRow: View {
    init() {}

    var body: some View {
        HStack(spacing: FlowdSpacing.sm) {
            SkeletonView(width: 44, height: 44, radius: 22)
            VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
                SkeletonView(width: 150, height: 14)
                SkeletonView(width: 96, height: 12)
            }
            Spacer(minLength: 0)
            SkeletonView(width: 56, height: 16)
        }
        .padding(.vertical, FlowdSpacing.xs)
        .accessibilityHidden(true)
    }
}

// MARK: - Preview

#Preview("Skeletons") {
    FlowdPreviewCanvas {
        VStack(spacing: FlowdSpacing.md) {
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.md) {
                    SkeletonView(width: 90, height: 12)
                    SkeletonView(width: 180, height: 40, radius: FlowdRadius.md)
                    SkeletonLines(lines: 3)
                }
            }
            FlowdCard {
                VStack(spacing: FlowdSpacing.xs) {
                    SkeletonRow()
                    SkeletonRow()
                    SkeletonRow()
                }
            }
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
                    Text("Pending $186.20").flowdBody(.headline)
                    Text("Clears Sat 2:00 PM").flowdBody(.subheadline)
                }
            }
            .flowdSkeleton(isLoading: true)
        }
        .padding(FlowdSpacing.lg)
    }
}
