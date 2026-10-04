import SwiftUI

// Chip: a selectable filter / niche / tag button. Visual height 36, hit height 44. A selected chip carries a check glyph, an accent
// tint and a stronger rim, so selection never relies on colour alone. FlowdWrap lays chips out in rows that wrap.

/// A selectable chip.
///
///     FlowdWrap(lineSpacing: 0) {
///         ForEach(niches) { niche in Chip(niche.title, isSelected: selected.contains(niche.id)) { toggle(niche.id) } }
///     }
struct Chip: View {
    let title: String
    let systemImage: String?
    let count: Int?
    let isSelected: Bool
    let action: () -> Void

    init(
        _ title: String,
        systemImage: String? = nil,
        count: Int? = nil,
        isSelected: Bool,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.count = count
        self.isSelected = isSelected
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            visual
                .frame(minHeight: FlowdLayout.hitTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(FlowdPressStyle(scale: 0.96))
        .flowdHaptic(.selection, trigger: isSelected)
        .accessibilityLabel(accessibilityTitle)
        .accessibilityAddTraits(isSelected ? AccessibilityTraits.isSelected : AccessibilityTraits())
    }

    private var visual: some View {
        HStack(spacing: 6) {
            if let glyph = glyphName {
                Image(systemName: glyph)
                    .font(.system(size: 12, weight: .bold))
                    .accessibilityHidden(true)
            }
            Text(title)
                .flowdText(FlowdFont.buttonCompact)
                .lineLimit(1)
            if let count = count {
                Text(FlowdNumberFormat.grouped(count))
                    .flowdCaption(.caption1)
                    .foregroundStyle(FlowdColor.fgSubtle)
            }
        }
        .foregroundStyle(isSelected ? FlowdColor.accent : FlowdColor.fg)
        .padding(.horizontal, 14)
        .frame(minHeight: 36)
        .background {
            Capsule(style: .continuous).fill(isSelected ? FlowdColor.accentSoft : FlowdColor.surfaceField)
        }
        .overlay {
            Capsule(style: .continuous)
                .strokeBorder(
                    isSelected ? FlowdColor.accent.opacity(0.6) : FlowdColor.rim,
                    lineWidth: isSelected ? 1.5 : 1
                )
        }
    }

    private var glyphName: String? {
        if isSelected {
            return "checkmark"
        }
        return systemImage
    }

    private var accessibilityTitle: String {
        if let count = count {
            return title + ", " + String(count)
        }
        return title
    }
}

// MARK: - Wrapping layout

/// Flows subviews left to right and wraps to a new row when the proposed width runs out.
struct FlowdWrapLayout: Layout {
    var spacing: CGFloat
    var lineSpacing: CGFloat

    init(spacing: CGFloat = 8, lineSpacing: CGFloat = 8) {
        self.spacing = spacing
        self.lineSpacing = lineSpacing
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth: CGFloat = proposal.width ?? CGFloat.infinity
        let arranged: (frames: [CGRect], size: CGSize) = arrange(maxWidth: maxWidth, subviews: subviews)
        return arranged.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let arranged: (frames: [CGRect], size: CGSize) = arrange(maxWidth: bounds.width, subviews: subviews)
        var index: Int = 0
        for subview in subviews {
            let frame: CGRect = arranged.frames[index]
            subview.place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: frame.width, height: frame.height)
            )
            index += 1
        }
    }

    private func arrange(maxWidth: CGFloat, subviews: Subviews) -> (frames: [CGRect], size: CGSize) {
        var frames: [CGRect] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var usedWidth: CGFloat = 0
        for subview in subviews {
            let size: CGSize = subview.sizeThatFits(ProposedViewSize.unspecified)
            if x > 0 && x + size.width > maxWidth {
                x = 0
                y += rowHeight + lineSpacing
                rowHeight = 0
            }
            frames.append(CGRect(x: x, y: y, width: size.width, height: size.height))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            usedWidth = max(usedWidth, x - spacing)
        }
        return (frames, CGSize(width: usedWidth, height: y + rowHeight))
    }
}

/// Wrapping row container: `FlowdWrap { Chip(...); Chip(...) }`. Chips already have a 44 pt hit height, so use `lineSpacing: 0` for them.
struct FlowdWrap<Content: View>: View {
    private let spacing: CGFloat
    private let lineSpacing: CGFloat
    private let content: Content

    init(
        spacing: CGFloat = FlowdSpacing.xs,
        lineSpacing: CGFloat = FlowdSpacing.xs,
        @ViewBuilder content: () -> Content
    ) {
        self.spacing = spacing
        self.lineSpacing = lineSpacing
        self.content = content()
    }

    var body: some View {
        FlowdWrapLayout(spacing: spacing, lineSpacing: lineSpacing) {
            content
        }
    }
}

// MARK: - Preview

private struct ChipPreview: View {
    @State private var selected: Set<String> = ["Fitness", "AI tools"]
    private let niches: [String] = ["Fitness", "AI tools", "Study", "Sleep", "Finance", "Language learning", "Meditation", "Cooking", "Parenting", "Travel"]

    var body: some View {
        FlowdPreviewCanvas {
            VStack(alignment: .leading, spacing: FlowdSpacing.md) {
                Text("Pick 3 niches").flowdDisplay(.title2).flowdInk(.primary)
                FlowdWrap(lineSpacing: 0) {
                    ForEach(niches, id: \.self) { (niche: String) in
                        Chip(niche, isSelected: selected.contains(niche)) {
                            if selected.contains(niche) {
                                selected.remove(niche)
                            } else {
                                selected.insert(niche)
                            }
                        }
                    }
                }
            }
            .padding(FlowdSpacing.lg)
        }
    }
}

#Preview("Chips") {
    ChipPreview()
}
