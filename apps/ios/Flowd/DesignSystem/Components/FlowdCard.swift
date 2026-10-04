import SwiftUI

// FlowdCard: the L1 content surface ("quiet glass"). Material + ink scrim + rim on every OS, never `glassEffect`, so text always
// passes AA over the aurora. Glass for controls floats ABOVE cards; never put an L2 control on another L2 control.
// Concentric radii: a child's radius is the card radius minus the padding (`FlowdRadius.concentric(outer:padding:)`).

/// A content card.
///
///     FlowdCard { VStack(alignment: .leading) { Text("Pending").flowdBody(.headline); MoneyText(cents: 18620, state: .pending) } }
///     FlowdCard(padding: FlowdSpacing.lg, radius: FlowdRadius.xl) { ... }          // a smaller radius for cards inside cards
///     FlowdCard(tint: FlowdColor.mint) { ... }                                    // a 14 percent mint wash (use rarely)
///
/// To make a card tappable wrap it in a `Button` with `.buttonStyle(FlowdPressStyle())`.
struct FlowdCard<Content: View>: View {
    private let padding: CGFloat
    private let radius: CGFloat
    private let tint: Color?
    private let elevated: Bool
    private let expands: Bool
    private let content: Content

    init(
        padding: CGFloat = FlowdSpacing.md,
        radius: CGFloat = FlowdRadius.xxl,
        tint: Color? = nil,
        elevated: Bool = true,
        expands: Bool = true,
        @ViewBuilder content: () -> Content
    ) {
        self.padding = padding
        self.radius = radius
        self.tint = tint
        self.elevated = elevated
        self.expands = expands
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: expands ? CGFloat.infinity : nil, alignment: .leading)
            .flowdSurface(cornerRadius: radius, tint: tint, elevated: elevated)
    }
}

/// A tinted well for content inside a card (fills, never more glass). Radius is concentric with the card.
struct FlowdWell<Content: View>: View {
    private let padding: CGFloat
    private let radius: CGFloat
    private let content: Content

    init(
        padding: CGFloat = FlowdSpacing.sm,
        radius: CGFloat = FlowdRadius.md,
        @ViewBuilder content: () -> Content
    ) {
        self.padding = padding
        self.radius = radius
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(FlowdColor.surfaceField)
            }
    }
}

// MARK: - Preview

#Preview("Cards") {
    FlowdPreviewCanvas {
        VStack(spacing: FlowdSpacing.md) {
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
                    Text("Lumen Sleep").flowdBody(.headline).flowdInk(.primary)
                    Text("$2.10 per 1,000 views, plus $1.50 per trial started.")
                        .flowdBody(.subheadline).flowdInk(.muted)
                    FlowdWell {
                        Text("Typical creators earn $62 on this bounty (median, 30 days).")
                            .flowdCaption(.footnote).flowdInk(.muted)
                    }
                }
            }
            FlowdCard(tint: FlowdColor.mintSolid) {
                HStack {
                    Text("Cleared").flowdBody(.headline).flowdInk(.primary)
                    Spacer()
                    MoneyText(cents: 128460, style: FlowdFont.figureMd, state: .cleared)
                }
            }
            Button {
            } label: {
                FlowdCard {
                    Text("Tappable card").flowdBody(.headline).flowdInk(.primary)
                }
            }
            .buttonStyle(FlowdPressStyle())
        }
        .padding(FlowdSpacing.lg)
    }
}
