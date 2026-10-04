import SwiftUI

// Navigation chrome helpers. On iOS 26 the system navigation bar, toolbar, sheets and menus are Liquid Glass by themselves, so the
// rule is: use the SYSTEM bar (`flowdNavigationTitle`, `FlowdCloseToolbarItem`), give toolbar items plain buttons (the system draws
// their glass; a glass button inside a toolbar would be glass on glass) and never paint a custom bar background. `FlowdNavBar` is for
// the few screens that hide the system bar and draw their own header over the aurora (onboarding, Studio, full-screen takeovers):
// its buttons are `FlowdIconButton` glass circles, so the header itself stays glass-free and the buttons are the single glass layer.

// MARK: - System bar helpers

extension View {
    /// Sets the navigation title and lets the aurora show through the bar on iOS 17 to 25 (iOS 26 draws the glass bar itself).
    ///
    ///     ScrollView { ... }.flowdNavigationTitle("Wallet")                // large title
    ///     DetailView().flowdNavigationTitle("Lumen Sleep", large: false)   // inline title
    func flowdNavigationTitle(_ title: String, large: Bool = true) -> some View {
        return self
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(large ? NavigationBarItem.TitleDisplayMode.large : NavigationBarItem.TitleDisplayMode.inline)
            .flowdClearNavigationBar()
    }
}

/// A close ("x") button for the leading edge of a sheet or full-screen cover toolbar. A plain system button, so iOS 26 gives it its own
/// glass and iOS 17 to 25 draw it as a normal bar item.
///
///     .toolbar { FlowdCloseToolbarItem { dismiss() } }
struct FlowdCloseToolbarItem: ToolbarContent {
    let action: () -> Void

    init(action: @escaping () -> Void) {
        self.action = action
    }

    var body: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button(action: action) {
                Label("Close", systemImage: "xmark")
                    .labelStyle(.iconOnly)
            }
        }
    }
}

// MARK: - Back button

/// A glass back button for custom headers: dismisses the current navigation or presentation. `FlowdBackButton()`.
struct FlowdBackButton: View {
    let label: String
    @Environment(\.dismiss) private var dismiss: DismissAction

    init(label: String = "Back") {
        self.label = label
    }

    var body: some View {
        FlowdIconButton(systemImage: "chevron.left", label: label) {
            dismiss()
        }
    }
}

// MARK: - Custom header

/// A header drawn over the aurora for screens that hide the system bar: leading control, title (large and left-aligned, or centred
/// and compact), trailing control. Buttons should be `FlowdIconButton`s (one glass circle each, never a glass bar behind them).
///
///     FlowdNavBar("Studio", subtitle: "Lumen Sleep, hook B", leading: { FlowdBackButton() }, trailing: { FlowdIconButton(systemImage: "gearshape", label: "Settings") {} })
///     FlowdNavBar("Wallet")                                               // large title, no buttons
///     FlowdNavBar("Take 3", isLarge: false, leading: { FlowdBackButton() })
struct FlowdNavBar<Leading: View, Trailing: View>: View {
    let title: String
    let subtitle: String?
    let isLarge: Bool
    private let leading: Leading
    private let trailing: Trailing

    init(
        _ title: String,
        subtitle: String? = nil,
        isLarge: Bool = true,
        @ViewBuilder leading: () -> Leading,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.title = title
        self.subtitle = subtitle
        self.isLarge = isLarge
        self.leading = leading()
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .center, spacing: FlowdSpacing.sm) {
            leading
            titleBlock
            trailing
        }
        .padding(.horizontal, FlowdLayout.gutter)
        .frame(minHeight: FlowdLayout.headerHeight)
    }

    private var titleBlock: some View {
        VStack(alignment: isLarge ? HorizontalAlignment.leading : HorizontalAlignment.center, spacing: 2) {
            Text(title)
                .flowdDisplay(isLarge ? FlowdDisplayStyle.largeTitle : FlowdDisplayStyle.title3)
                .foregroundStyle(FlowdColor.fg)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
            if let subtitle = subtitle {
                Text(subtitle)
                    .flowdBody(.subheadline)
                    .foregroundStyle(FlowdColor.fgMuted)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: isLarge ? Alignment.leading : Alignment.center)
    }
}

extension FlowdNavBar where Leading == EmptyView, Trailing == EmptyView {
    /// Title only.
    init(_ title: String, subtitle: String? = nil, isLarge: Bool = true) {
        self.init(title, subtitle: subtitle, isLarge: isLarge, leading: { EmptyView() }, trailing: { EmptyView() })
    }
}

extension FlowdNavBar where Trailing == EmptyView {
    /// Leading control only.
    init(
        _ title: String,
        subtitle: String? = nil,
        isLarge: Bool = true,
        @ViewBuilder leading: () -> Leading
    ) {
        self.init(title, subtitle: subtitle, isLarge: isLarge, leading: leading, trailing: { EmptyView() })
    }
}

extension FlowdNavBar where Leading == EmptyView {
    /// Trailing control only.
    init(
        _ title: String,
        subtitle: String? = nil,
        isLarge: Bool = true,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.init(title, subtitle: subtitle, isLarge: isLarge, leading: { EmptyView() }, trailing: trailing)
    }
}

// MARK: - Preview

#Preview("Nav bars") {
    FlowdPreviewCanvas {
        VStack(alignment: .leading, spacing: FlowdSpacing.lg) {
            FlowdNavBar(
                "Studio",
                subtitle: "Lumen Sleep, hook B",
                leading: { FlowdBackButton() },
                trailing: { FlowdIconButton(systemImage: "gearshape", label: "Settings") {} }
            )
            FlowdNavBar("Wallet")
            FlowdNavBar("Take 3", isLarge: false, leading: { FlowdBackButton() })
            FlowdNavBar("Inbox", trailing: { FlowdIconButton(systemImage: "bell", label: "Notifications", badge: 2) {} })
        }
    }
}

#Preview("Navigation stack title") {
    NavigationStack {
        FlowdScreen {
            FlowdCard {
                Text("The system bar draws the glass on iOS 26.")
                    .flowdBody(.callout)
                    .flowdInk(.muted)
            }
        }
        .flowdNavigationTitle("Wallet")
        .toolbar {
            FlowdCloseToolbarItem {}
        }
    }
}
