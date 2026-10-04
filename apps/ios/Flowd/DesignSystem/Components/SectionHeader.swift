import SwiftUI

// SectionHeader: a title (with an optional subtitle) and one optional trailing action such as "See all". Sentence case, title3
// rounded, marked as a heading for VoiceOver. The action keeps a 44 pt hit height.

/// `SectionHeader("For you", subtitle: "Matched to your niches", actionTitle: "See all") { openAll() }`
struct SectionHeader: View {
    let title: String
    let subtitle: String?
    let actionTitle: String?
    let action: (() -> Void)?

    init(
        _ title: String,
        subtitle: String? = nil,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: FlowdSpacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .flowdDisplay(.title3)
                    .foregroundStyle(FlowdColor.fg)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle = subtitle {
                    Text(subtitle)
                        .flowdBody(.subheadline)
                        .foregroundStyle(FlowdColor.fgMuted)
                }
            }
            Spacer(minLength: FlowdSpacing.xs)
            if let actionTitle = actionTitle, let action = action {
                Button(action: action) {
                    HStack(spacing: 4) {
                        Text(actionTitle)
                            .flowdText(FlowdFont.buttonCompact)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .bold))
                            .accessibilityHidden(true)
                    }
                    .foregroundStyle(FlowdColor.accent)
                    .frame(minHeight: FlowdLayout.hitTarget)
                    .contentShape(Rectangle())
                }
                .buttonStyle(FlowdPressStyle())
            }
        }
    }
}

// MARK: - Preview

#Preview("Section headers") {
    FlowdPreviewCanvas {
        VStack(alignment: .leading, spacing: FlowdSpacing.xl) {
            SectionHeader("For you", subtitle: "Matched to your niches", actionTitle: "See all") {}
            SectionHeader("Recent activity")
            SectionHeader("Leaderboard", actionTitle: "This week") {}
        }
        .padding(FlowdSpacing.lg)
    }
}
