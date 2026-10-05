import SwiftUI

// FlowdTabBar: the floating glass tab bar, identical on iOS 17 to 26. Two capsule clusters of tabs with an optional centre action
// between them (the Studio "make a take" button), all inside ONE `FlowdGlassContainer` so the glass samples together and, on iOS 26,
// blends and morphs. The selected marker is a FILL (never glass on glass) that slides between tabs on a snappy spring; the selected tab
// also swaps to its filled symbol and carries the `isSelected` trait, so selection is never colour alone. The centre action is the one
// hero control, so it is a solid Flow-gradient disc with white glyph (AA by construction) rather than tinted glass.
//
// Wire it with the system bar hidden and the bar inset above the scroll content:
//
//     TabView(selection: $tab) {
//         HomeRoot().tag(AppTab.home).flowdHideSystemTabBar()
//         ...
//     }
//     .flowdBottomBar {
//         FlowdTabBar(leading: [home, bounties], trailing: [wallet, profile], selection: $tab,
//                     center: FlowdTabCenterAction(systemImage: "video.fill", label: "Make a take") { showStudio = true })
//     }

/// A small status dot on a tab, without a number ("Daily Drop is live", "Money cleared"). The label is read by VoiceOver.
struct FlowdTabDot: Hashable {
    let tone: FlowdTone
    let label: String

    init(tone: FlowdTone, label: String) {
        self.tone = tone
        self.label = label
    }
}

/// One tab. `ID` is usually a `String` or a small enum.
struct FlowdTabItem<ID: Hashable>: Identifiable {
    let id: ID
    let title: String
    let systemImage: String
    /// The symbol shown while selected (usually the `.fill` variant). Defaults to `systemImage`.
    let selectedSystemImage: String?
    let badge: Int?
    /// A status dot at the leading top corner of the glyph (independent of the numeric badge).
    let dot: FlowdTabDot?

    init(id: ID, title: String, systemImage: String, selectedSystemImage: String? = nil, badge: Int? = nil, dot: FlowdTabDot? = nil) {
        self.id = id
        self.title = title
        self.systemImage = systemImage
        self.selectedSystemImage = selectedSystemImage
        self.badge = badge
        self.dot = dot
    }
}

/// The centre action (Studio). Always labelled for VoiceOver.
struct FlowdTabCenterAction {
    let systemImage: String
    let label: String
    let action: () -> Void

    init(systemImage: String, label: String, action: @escaping () -> Void) {
        self.systemImage = systemImage
        self.label = label
        self.action = action
    }
}

enum FlowdTabBarStyle: CaseIterable, Hashable, Sendable {
    /// Icon and label.
    case full
    /// Icon only (use while scrolling down; labels return when scrolling up).
    case compact
}

struct FlowdTabBar<ID: Hashable>: View {
    let leading: [FlowdTabItem<ID>]
    let trailing: [FlowdTabItem<ID>]
    @Binding var selection: ID
    let center: FlowdTabCenterAction?
    let style: FlowdTabBarStyle

    @Namespace private var selectionNamespace
    private var appearance: FlowdAppearance = FlowdAppearance()

    /// Two clusters with a centre action.
    init(
        leading: [FlowdTabItem<ID>],
        trailing: [FlowdTabItem<ID>],
        selection: Binding<ID>,
        center: FlowdTabCenterAction?,
        style: FlowdTabBarStyle = .full
    ) {
        self.leading = leading
        self.trailing = trailing
        self._selection = selection
        self.center = center
        self.style = style
    }

    /// One cluster, no centre action.
    init(items: [FlowdTabItem<ID>], selection: Binding<ID>, style: FlowdTabBarStyle = .full) {
        self.leading = items
        self.trailing = []
        self._selection = selection
        self.center = nil
        self.style = style
    }

    var body: some View {
        FlowdGlassContainer(spacing: 8) {
            HStack(spacing: 8) {
                cluster(leading)
                if let center = center {
                    centerButton(center)
                }
                if !trailing.isEmpty {
                    cluster(trailing)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, FlowdSpacing.md)
        .padding(.bottom, FlowdSpacing.xs)
        .flowdHaptic(.selection, trigger: selection)
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityElement(children: .contain)
    }

    // MARK: Cluster

    private func cluster(_ items: [FlowdTabItem<ID>]) -> some View {
        HStack(spacing: 2) {
            ForEach(items) { (item: FlowdTabItem<ID>) in
                tabButton(item)
            }
        }
        .padding(4)
        .flowdGlassCapsule(.l2)
    }

    private func tabButton(_ item: FlowdTabItem<ID>) -> some View {
        let isSelected: Bool = item.id == selection
        return Button {
            withAnimation(appearance.animation(.snappy)) {
                selection = item.id
            }
        } label: {
            VStack(spacing: 2) {
                glyph(item, isSelected: isSelected)
                if style == FlowdTabBarStyle.full {
                    Text(item.title)
                        .flowdText(FlowdFont.tabLabel)
                        .lineLimit(1)
                }
            }
            .foregroundStyle(isSelected ? FlowdColor.fg : FlowdColor.fgMuted)
            .frame(minWidth: style == FlowdTabBarStyle.full ? 52 : 44, minHeight: 52)
            .padding(.horizontal, 2)
            .background {
                if isSelected {
                    Capsule(style: .continuous)
                        .fill(FlowdColor.surfaceActive)
                        .matchedGeometryEffect(id: "flowd-tab-selection", in: selectionNamespace)
                }
            }
            .contentShape(Capsule(style: .continuous))
        }
        .buttonStyle(FlowdPressStyle(scale: 0.94))
        .accessibilityLabel(item.title)
        .accessibilityValue(badgeValue(item))
        .accessibilityAddTraits(isSelected ? AccessibilityTraits.isSelected : AccessibilityTraits())
    }

    private func glyph(_ item: FlowdTabItem<ID>, isSelected: Bool) -> some View {
        let name: String = isSelected ? (item.selectedSystemImage ?? item.systemImage) : item.systemImage
        return ZStack(alignment: .topTrailing) {
            Image(systemName: name)
                .font(.system(size: 21, weight: .semibold))
                .frame(height: 24)
            if let badge = item.badge, badge > 0 {
                FlowdBadgeDot(count: badge)
                    .offset(x: 12, y: -6)
            }
        }
        .overlay(alignment: .topLeading) {
            if let dot = item.dot {
                Circle()
                    .fill(dot.tone.solid)
                    .frame(width: 9, height: 9)
                    .overlay { Circle().strokeBorder(FlowdColor.bg, lineWidth: 1.5) }
                    .offset(x: -5, y: -3)
                    .accessibilityHidden(true)
            }
        }
    }

    private func badgeValue(_ item: FlowdTabItem<ID>) -> String {
        var parts: [String] = []
        if let badge = item.badge, badge > 0 {
            parts.append(String(badge) + " new")
        }
        if let dot = item.dot {
            parts.append(dot.label)
        }
        return parts.joined(separator: ", ")
    }

    // MARK: Centre action

    private func centerButton(_ action: FlowdTabCenterAction) -> some View {
        return Button {
            FlowdHaptics.play(.press)
            action.action()
        } label: {
            Image(systemName: action.systemImage)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(FlowdColor.onAccent)
                .frame(width: 60, height: 60)
                .background { Circle().fill(FlowdGradient.flowButton) }
                .overlay { centerRim }
                .shadow(color: FlowdElevation.glowFlow, radius: 14, x: 0, y: 6)
                .contentShape(Circle())
        }
        .buttonStyle(FlowdPressStyle(scale: 0.92))
        .accessibilityLabel(action.label)
    }

    private var centerRim: some View {
        Circle()
            .strokeBorder(
                LinearGradient(
                    colors: [FlowdPrimitive.white.opacity(0.55), FlowdPrimitive.white.opacity(0.06)],
                    startPoint: .top,
                    endPoint: .bottom
                ),
                lineWidth: 1
            )
            .allowsHitTesting(false)
    }
}

// MARK: - Preview

private enum PreviewTab: String, Hashable {
    case home
    case bounties
    case wallet
    case profile
}

private struct TabBarPreview: View {
    @State private var tab: PreviewTab = .home
    @State private var compact: Bool = false

    var body: some View {
        ZStack {
            AuroraBackground()
            VStack {
                Spacer()
                Text("Selected: " + tab.rawValue)
                    .flowdBody(.headline)
                    .flowdInk(.primary)
                Button(compact ? "Show labels" : "Icons only") {
                    compact.toggle()
                }
                .buttonStyle(FlowdGlassButtonStyle(.secondary, size: .compact))
                .padding(.top, FlowdSpacing.sm)
                Spacer()
                FlowdTabBar(
                    leading: [
                        FlowdTabItem(id: PreviewTab.home, title: "Home", systemImage: "house", selectedSystemImage: "house.fill"),
                        FlowdTabItem(id: PreviewTab.bounties, title: "Bounties", systemImage: "target", badge: 3)
                    ],
                    trailing: [
                        FlowdTabItem(id: PreviewTab.wallet, title: "Wallet", systemImage: "creditcard", selectedSystemImage: "creditcard.fill"),
                        FlowdTabItem(id: PreviewTab.profile, title: "Profile", systemImage: "person.crop.circle", selectedSystemImage: "person.crop.circle.fill")
                    ],
                    selection: $tab,
                    center: FlowdTabCenterAction(systemImage: "video.fill", label: "Make a take") {},
                    style: compact ? .compact : .full
                )
            }
        }
    }
}

#Preview("Tab bar") {
    TabBarPreview()
}
