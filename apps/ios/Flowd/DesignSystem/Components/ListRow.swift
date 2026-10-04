import SwiftUI

// ListRow: a 56 pt+ row with a leading visual, a title and subtitle, a trailing visual and an optional chevron. Rows sit inside a
// FlowdCard (or directly on the aurora) and are separated by `FlowdDivider(inset:)`, never by boxes within boxes. The whole row is the
// hit target; wrap it in a `Button` with `FlowdPressStyle` when it navigates.

/// Rounded-square icon tile (soft tone fill, tone ink glyph). Radius is concentric with its size.
struct FlowdIconTile: View {
    let systemImage: String
    let tone: FlowdTone
    let size: CGFloat

    init(systemImage: String, tone: FlowdTone = .accent, size: CGFloat = 40) {
        self.systemImage = systemImage
        self.tone = tone
        self.size = size
    }

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
            .fill(tone.soft)
            .frame(width: size, height: size)
            .overlay {
                Image(systemName: systemImage)
                    .font(.system(size: size * 0.45, weight: .semibold))
                    .foregroundStyle(tone.ink)
                    .accessibilityHidden(true)
            }
    }
}

/// Hairline separator. `inset` aligns it with the text column (leading visual width plus spacing).
struct FlowdDivider: View {
    let inset: CGFloat

    init(inset: CGFloat = 0) {
        self.inset = inset
    }

    var body: some View {
        Rectangle()
            .fill(FlowdColor.divider)
            .frame(height: 1)
            .padding(.leading, inset)
            .accessibilityHidden(true)
    }
}

/// A list row.
///
///     ListRow(title: "Lumen hook B", subtitle: "Clears in 41 h", systemImage: "play.rectangle.fill") { MoneyText(cents: 3820, state: .pending, style: FlowdFont.figureSm) }
///     ListRow(title: "Payout methods", subtitle: "Bank ending 4417", systemImage: "building.columns", showsChevron: true)
///     ListRow(title: "Maya Kim", subtitle: "Gold", showsChevron: true) { AvatarView(seed: "cr_maya", name: "Maya Kim", size: 44) }
struct ListRow<Leading: View, Trailing: View>: View {
    let title: String
    let subtitle: String?
    let showsChevron: Bool
    private let leading: Leading
    private let trailing: Trailing

    init(
        title: String,
        subtitle: String? = nil,
        showsChevron: Bool = false,
        @ViewBuilder leading: () -> Leading,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.title = title
        self.subtitle = subtitle
        self.showsChevron = showsChevron
        self.leading = leading()
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: FlowdSpacing.sm) {
            leading
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .flowdBody(.body)
                    .foregroundStyle(FlowdColor.fg)
                    .lineLimit(2)
                if let subtitle = subtitle {
                    Text(subtitle)
                        .flowdBody(.subheadline)
                        .foregroundStyle(FlowdColor.fgMuted)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: FlowdSpacing.xs)
            trailing
            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(FlowdColor.fgSubtle)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, FlowdSpacing.xs)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }
}

// Icon-tile leading visual.
extension ListRow where Leading == FlowdIconTile {
    init(
        title: String,
        subtitle: String? = nil,
        systemImage: String,
        tone: FlowdTone = .accent,
        showsChevron: Bool = false,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.init(
            title: title,
            subtitle: subtitle,
            showsChevron: showsChevron,
            leading: { FlowdIconTile(systemImage: systemImage, tone: tone) },
            trailing: trailing
        )
    }
}

// Icon tile, no trailing visual.
extension ListRow where Leading == FlowdIconTile, Trailing == EmptyView {
    init(
        title: String,
        subtitle: String? = nil,
        systemImage: String,
        tone: FlowdTone = .accent,
        showsChevron: Bool = false
    ) {
        self.init(
            title: title,
            subtitle: subtitle,
            showsChevron: showsChevron,
            leading: { FlowdIconTile(systemImage: systemImage, tone: tone) },
            trailing: { EmptyView() }
        )
    }
}

// Custom leading visual, no trailing visual.
extension ListRow where Trailing == EmptyView {
    init(
        title: String,
        subtitle: String? = nil,
        showsChevron: Bool = false,
        @ViewBuilder leading: () -> Leading
    ) {
        self.init(
            title: title,
            subtitle: subtitle,
            showsChevron: showsChevron,
            leading: leading,
            trailing: { EmptyView() }
        )
    }
}

// MARK: - Preview

#Preview("List rows") {
    FlowdPreviewCanvas {
        VStack(spacing: FlowdSpacing.md) {
            FlowdCard(padding: FlowdSpacing.md) {
                VStack(spacing: 0) {
                    ListRow(title: "Lumen hook B", subtitle: "Clears in 41 h", systemImage: "play.rectangle.fill", tone: .info) {
                        MoneyText(cents: 3820, style: FlowdFont.figureSm, state: .pending)
                    }
                    FlowdDivider(inset: 52)
                    ListRow(title: "Fernlingo day-3 reaction", subtitle: "Cleared Tue", systemImage: "checkmark.circle.fill", tone: .mint) {
                        MoneyText(cents: 6240, style: FlowdFont.figureSm, state: .cleared)
                    }
                    FlowdDivider(inset: 52)
                    ListRow(title: "Payout methods", subtitle: "Bank ending 4417", systemImage: "building.columns", showsChevron: true)
                }
            }
            FlowdCard(padding: FlowdSpacing.md) {
                ListRow(title: "Maya Kim", subtitle: "Gold, 62 posts", showsChevron: true) {
                    AvatarView(seed: "cr_maya", name: "Maya Kim", size: 44, tier: .gold)
                }
            }
        }
        .padding(FlowdSpacing.lg)
    }
}
