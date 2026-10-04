import SwiftUI

// SegmentedPicker: a glass segmented control. The track is a content-layer fill (not glass); the selected pill is the single glass
// layer and morphs between segments (iOS 26 `glassEffectID`, `matchedGeometryEffect` before). Equal-width segments, 44 pt tall,
// a selection haptic on change, VoiceOver traits per segment.

/// `SegmentedPicker(selection: $range, options: [.init(value: .week, title: "7 days"), .init(value: .month, title: "30 days")])`
/// or `SegmentedPicker(selection: $range, values: Range.allCases) { $0.title }`.
struct SegmentedPicker<Value: Hashable>: View {
    struct Option: Identifiable {
        let value: Value
        let title: String
        var systemImage: String? = nil
        var id: Value { return value }
    }

    let options: [Option]
    @Binding var selection: Value
    let fillsWidth: Bool

    @Namespace private var segmentNamespace
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(selection: Binding<Value>, options: [Option], fillsWidth: Bool = true) {
        self._selection = selection
        self.options = options
        self.fillsWidth = fillsWidth
    }

    init(
        selection: Binding<Value>,
        values: [Value],
        fillsWidth: Bool = true,
        title: (Value) -> String
    ) {
        self._selection = selection
        var built: [Option] = []
        for value in values {
            built.append(Option(value: value, title: title(value)))
        }
        self.options = built
        self.fillsWidth = fillsWidth
    }

    var body: some View {
        FlowdGlassContainer(spacing: 10) {
            HStack(spacing: 2) {
                ForEach(options) { (option: Option) in
                    segment(option)
                }
            }
            .padding(4)
            .background { track }
        }
        .frame(maxWidth: fillsWidth ? CGFloat.infinity : nil)
        .flowdHaptic(.selection, trigger: selection)
        .accessibilityElement(children: .contain)
    }

    private var track: some View {
        Capsule(style: .continuous)
            .fill(FlowdColor.surfaceField)
            .overlay {
                Capsule(style: .continuous).strokeBorder(FlowdColor.rim, lineWidth: appearance.rimWidth)
            }
    }

    private func segment(_ option: Option) -> some View {
        let isSelected: Bool = option.value == selection
        return Button {
            withAnimation(appearance.animation(.snappy)) {
                selection = option.value
            }
        } label: {
            HStack(spacing: 6) {
                if let symbol = option.systemImage {
                    Image(systemName: symbol)
                        .font(.system(size: 13, weight: .semibold))
                        .accessibilityHidden(true)
                }
                Text(option.title)
                    .flowdText(FlowdFont.buttonCompact)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(isSelected ? FlowdColor.fg : FlowdColor.fgMuted)
            .padding(.horizontal, 14)
            .frame(maxWidth: fillsWidth ? CGFloat.infinity : nil, minHeight: 36)
            .frame(minHeight: FlowdLayout.hitTarget - 8)
            .contentShape(Capsule(style: .continuous))
        }
        .buttonStyle(.plain)
        .background {
            if isSelected {
                Color.clear
                    .flowdGlass(.l2, interactive: true, elevated: false, in: Capsule(style: .continuous))
                    .flowdGlassID("flowd-segment-selection", in: segmentNamespace)
            }
        }
        .accessibilityLabel(option.title)
        .accessibilityAddTraits(isSelected ? AccessibilityTraits.isSelected : AccessibilityTraits())
    }
}

// MARK: - Preview

private enum PreviewRange: String, CaseIterable, Hashable {
    case week
    case month
    case quarter

    var title: String {
        switch self {
        case .week: return "7 days"
        case .month: return "30 days"
        case .quarter: return "90 days"
        }
    }
}

private struct SegmentedPreview: View {
    @State private var range: PreviewRange = .month
    @State private var tab: Int = 0

    var body: some View {
        FlowdPreviewCanvas {
            VStack(spacing: FlowdSpacing.lg) {
                SegmentedPicker(selection: $range, values: PreviewRange.allCases) { (value: PreviewRange) -> String in
                    return value.title
                }
                SegmentedPicker(
                    selection: $tab,
                    options: [
                        SegmentedPicker<Int>.Option(value: 0, title: "Hot", systemImage: "flame.fill"),
                        SegmentedPicker<Int>.Option(value: 1, title: "New", systemImage: "sparkles"),
                        SegmentedPicker<Int>.Option(value: 2, title: "Saved", systemImage: "bookmark.fill")
                    ],
                    fillsWidth: false
                )
            }
            .padding(FlowdSpacing.lg)
        }
    }
}

#Preview("Segmented picker") {
    SegmentedPreview()
}
