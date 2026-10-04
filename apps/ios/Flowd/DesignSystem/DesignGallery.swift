import SwiftUI

// DesignGallery: the scrollable catalogue of every FlowdKit piece on its real backdrop (aurora), with live switches for the colour
// scheme and "Reduce glass" so each component is judged in dark, light and solid mode. Open the `#Preview("Design gallery")` at the
// bottom in Xcode, or push `DesignGallery()` from a debug menu. Not shipped in feature flows; it exists so the design system can be
// reviewed in one place and so feature agents can copy real usage.

// MARK: - Demo data (fictional apps and creators, demo "now" 2026-10-03T14:00:00Z)

private enum GalleryData {
    static let now: Date = Date(timeIntervalSince1970: 1_791_036_000)

    static func series(_ values: [Double]) -> [FlowdTimePoint] {
        var result: [FlowdTimePoint] = []
        let count: Int = values.count
        var index: Int = 0
        while index < count {
            let daysAgo: Double = Double(count - 1 - index)
            result.append(FlowdTimePoint(date: now.addingTimeInterval(-daysAgo * 86_400), value: values[index]))
            index += 1
        }
        return result
    }

    static let cleared: [FlowdTimePoint] = series([0, 6_240, 6_240, 9_810, 15_300, 15_300, 21_460, 28_400, 28_400, 34_900, 41_250, 52_900, 61_800, 74_600])
    static let previousCleared: [FlowdTimePoint] = series([0, 3_100, 3_100, 5_400, 8_200, 8_200, 12_900, 15_100, 15_100, 20_300, 24_000, 29_500, 38_100, 45_200])

    static let weekPosts: [FlowdBarDatum] = [
        FlowdBarDatum(label: "Mon", value: 1),
        FlowdBarDatum(label: "Tue", value: 2),
        FlowdBarDatum(label: "Wed", value: 0),
        FlowdBarDatum(label: "Thu", value: 3, isHighlighted: true),
        FlowdBarDatum(label: "Fri", value: 2),
        FlowdBarDatum(label: "Sat", value: 1),
        FlowdBarDatum(label: "Sun", value: 0)
    ]

    static let hookViews: [FlowdBarDatum] = [
        FlowdBarDatum(label: "Stop scrolling", value: 412_000, isHighlighted: true),
        FlowdBarDatum(label: "I tried it for 7 days", value: 268_000),
        FlowdBarDatum(label: "POV: you sleep badly", value: 191_000),
        FlowdBarDatum(label: "Nobody tells you", value: 96_000)
    ]

    static let funnel: [FlowdFunnelStage] = [
        FlowdFunnelStage(label: "Views", value: 4_200_000),
        FlowdFunnelStage(label: "Link clicks", value: 75_600),
        FlowdFunnelStage(label: "Installs", value: 3_310),
        FlowdFunnelStage(label: "Trials", value: 1_026, attribution: .estimated),
        FlowdFunnelStage(label: "Paid", value: 214, attribution: .estimated)
    ]

    static let retention: [FlowdRetentionPoint] = [
        FlowdRetentionPoint(second: 0, retained: 1.0),
        FlowdRetentionPoint(second: 1, retained: 0.86),
        FlowdRetentionPoint(second: 2, retained: 0.74),
        FlowdRetentionPoint(second: 3, retained: 0.66),
        FlowdRetentionPoint(second: 6, retained: 0.52),
        FlowdRetentionPoint(second: 10, retained: 0.41),
        FlowdRetentionPoint(second: 15, retained: 0.33),
        FlowdRetentionPoint(second: 22, retained: 0.27)
    ]

    static let retentionTypical: [FlowdRetentionPoint] = [
        FlowdRetentionPoint(second: 0, retained: 1.0),
        FlowdRetentionPoint(second: 3, retained: 0.7),
        FlowdRetentionPoint(second: 10, retained: 0.38),
        FlowdRetentionPoint(second: 22, retained: 0.2)
    ]

    static let niches: [String] = ["Fitness", "AI tools", "Study", "Sleep", "Finance", "Language learning", "Cooking"]
}

private enum GalleryRange: String, CaseIterable, Hashable {
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

private enum GalleryTab: String, Hashable {
    case home
    case bounties
    case wallet
    case profile
}

// MARK: - Section wrapper

private struct GallerySection<Content: View>: View {
    let title: String
    let note: String?
    private let content: Content

    init(_ title: String, note: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.note = note
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .flowdDisplay(.title2)
                    .foregroundStyle(FlowdColor.fg)
                    .accessibilityAddTraits(.isHeader)
                if let note = note {
                    Text(note)
                        .flowdCaption(.footnote)
                        .foregroundStyle(FlowdColor.fgMuted)
                }
            }
            content
        }
    }
}

// MARK: - Gallery

struct DesignGallery: View {
    @State private var theme: FlowdThemePreference = .dark
    @State private var reduceGlass: Bool = false
    @State private var range: GalleryRange = .month
    @State private var selectedNiches: Set<String> = ["Fitness", "AI tools"]
    @State private var tab: GalleryTab = .home
    @State private var skeletonOn: Bool = false
    @State private var progress: Double = 0.78
    @State private var moneyCents: Int = 128_460
    @State private var burst: Int = 0
    @State private var showsPayout: Bool = false
    @State private var showsTierUp: Bool = false
    @Environment(\.flowdToasts) private var toasts: ToastCenter

    var body: some View {
        ZStack {
            AuroraBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: FlowdSpacing.xxl) {
                    header
                    foundationSections
                    controlSections
                    identitySections
                    dataSections
                    feedbackSections
                    celebrationSections
                }
                .padding(.horizontal, FlowdLayout.gutter)
                .padding(.top, FlowdSpacing.xl)
                .padding(.bottom, FlowdSpacing.giant)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollIndicators(.hidden)
        }
        .preferredColorScheme(theme.colorScheme)
        .flowdReduceGlass(reduceGlass)
        .flowdConfetti(trigger: burst, colors: FlowdConfettiPalette.money)
        .flowdToastHost()
        .fullScreenCover(isPresented: $showsPayout) {
            PayoutArriveView(amountCents: 128_460, methodTitle: "Bank ending 4417", arrivalNote: "Fri, Oct 10") {
                showsPayout = false
            }
        }
        .fullScreenCover(isPresented: $showsTierUp) {
            TierUpView(to: .gold) {
                showsTierUp = false
            }
        }
    }

    // MARK: Header and switches

    private var header: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.md) {
            VStack(alignment: .leading, spacing: FlowdSpacing.xxs) {
                Text("flowd design system")
                    .flowdDisplay(.largeTitle)
                    .foregroundStyle(FlowdColor.fg)
                Text(FlowdTheme.name + " " + FlowdTheme.version + ". Money follows what works.")
                    .flowdBody(.callout)
                    .foregroundStyle(FlowdColor.fgMuted)
            }
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                    SegmentedPicker(selection: $theme, values: FlowdThemePreference.allCases) { (value: FlowdThemePreference) -> String in
                        return value.title
                    }
                    Toggle(isOn: $reduceGlass) {
                        Text("Reduce glass")
                            .flowdBody(.body)
                            .foregroundStyle(FlowdColor.fg)
                    }
                }
            }
        }
    }

    // MARK: Foundations

    private var foundationSections: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.xxl) {
            typographySection
            colourSection
            glassSection
            motionSection
        }
    }

    private var typographySection: some View {
        GallerySection("Typography", note: "SF Pro Rounded for display and every number, SF Pro for text, SF Mono for code. All scale with Dynamic Type.") {
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                    Text("Money follows what works.").flowdDisplay(.largeTitle).foregroundStyle(FlowdColor.fg)
                    Text("Wallet").flowdDisplay(.title1).foregroundStyle(FlowdColor.fg)
                    Text("$1,284.60").flowdFigure(.xl).foregroundStyle(FlowdColor.mint)
                    Text("Pending $186.20 clears Sat 2:00 PM").flowdBody(.callout).foregroundStyle(FlowdColor.fgMuted)
                    Text("Checklist score. Gets smarter as bounties settle.").flowdCaption(.footnote).foregroundStyle(FlowdColor.fgSubtle)
                    Text("Daily Drop").flowdCaption(.overline).foregroundStyle(FlowdColor.ember)
                    Text("bnty_8f2c1a").flowdCaption(.code).foregroundStyle(FlowdColor.fgMuted)
                }
            }
        }
    }

    private var colourSection: some View {
        GallerySection("Tones", note: "One colour, one meaning. Soft, solid and outline pills for every tone.") {
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
                    ForEach(FlowdTone.allCases, id: \.self) { (tone: FlowdTone) in
                        HStack(spacing: FlowdSpacing.xs) {
                            Pill(String(describing: tone).capitalized, tone: tone, style: .soft)
                            Pill(String(describing: tone).capitalized, tone: tone, style: .solid)
                            Pill(String(describing: tone).capitalized, tone: tone, style: .outline)
                        }
                    }
                }
            }
        }
    }

    private var glassSection: some View {
        GallerySection("Glass layers", note: "L1 quiet glass holds content. L2 real glass floats controls. L3 carries sheets. Never glass on glass.") {
            VStack(alignment: .leading, spacing: FlowdSpacing.md) {
                VStack(alignment: .leading, spacing: FlowdSpacing.xxs) {
                    Text("L1 quiet glass").flowdBody(.headline).foregroundStyle(FlowdColor.fg)
                    Text("Material, ink scrim, rim and a soft shadow. Same on every OS.")
                        .flowdBody(.subheadline).foregroundStyle(FlowdColor.fgMuted)
                }
                .padding(FlowdSpacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .flowdSurface()

                FlowdGlassContainer(spacing: 12) {
                    HStack(spacing: 12) {
                        Label("Cleared", systemImage: "checkmark.circle.fill")
                            .flowdBody(.subheadline).foregroundStyle(FlowdColor.fg)
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            .flowdGlassCapsule()
                        Label("Pending", systemImage: "clock.fill")
                            .flowdBody(.subheadline).foregroundStyle(FlowdColor.fg)
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            .flowdGlassCapsule()
                    }
                }

                VStack(alignment: .leading, spacing: FlowdSpacing.xxs) {
                    Text("L3 sheet glass").flowdBody(.headline).foregroundStyle(FlowdColor.fg)
                    Text("Sheets and panels. Content inside uses fills, not more glass.")
                        .flowdBody(.subheadline).foregroundStyle(FlowdColor.fgMuted)
                }
                .padding(FlowdSpacing.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
                .flowdGlass(.l3)
            }
        }
    }

    private var motionSection: some View {
        GallerySection("Motion", note: "Press scales to 0.96 on touch-down. Surfaces materialise. Lists reveal at 40 ms per row, capped at 8.") {
            VStack(spacing: FlowdSpacing.sm) {
                Button {
                } label: {
                    Text("Press and hold me")
                        .flowdBody(.headline)
                        .foregroundStyle(FlowdColor.fg)
                        .frame(maxWidth: .infinity)
                        .padding(FlowdSpacing.lg)
                        .flowdSurface(cornerRadius: FlowdRadius.xl)
                }
                .buttonStyle(FlowdPressStyle())
                ForEach(0..<3, id: \.self) { (index: Int) in
                    Text("Revealed row " + String(index + 1))
                        .flowdBody(.body)
                        .foregroundStyle(FlowdColor.fg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(FlowdSpacing.md)
                        .flowdSurface(cornerRadius: FlowdRadius.lg)
                        .flowdReveal(index: index)
                }
            }
        }
    }

    // MARK: Controls

    private var controlSections: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.xxl) {
            buttonSection
            pillSection
            segmentedSection
            listSection
            tabBarSection
        }
    }

    private var buttonSection: some View {
        GallerySection("Buttons", note: "One primary gradient button per view. Peers are glass or ghost. 44 pt minimum.") {
            VStack(spacing: FlowdSpacing.sm) {
                FlowdButton("Make a take", systemImage: "video.fill", fullWidth: true) {}
                FlowdButton("Claim a spot", subtitle: "5 left", variant: .ember, size: .large, fullWidth: true) {}
                FlowdButton("Cash out $240.00", subtitle: "Instant, $3.60 fee", variant: .mint, fullWidth: true) {}
                FlowdButton("Save draft", systemImage: "tray.and.arrow.down", variant: .secondary, fullWidth: true) {}
                FlowdButton("Submitting", isLoading: true, fullWidth: true) {}
                HStack(spacing: FlowdSpacing.sm) {
                    FlowdButton("Remove post", variant: .destructive, size: .compact) {}
                    FlowdButton("Not now", variant: .ghost) {}
                }
                HStack(spacing: FlowdSpacing.sm) {
                    FlowdIconButton(systemImage: "chevron.left", label: "Back") {}
                    FlowdIconButton(systemImage: "bell", label: "Inbox", badge: 3) {}
                    FlowdIconButton(systemImage: "plus", label: "New", variant: .primary) {}
                    FlowdIconButton(systemImage: "bolt.fill", label: "Daily Drop", variant: .ember) {}
                }
            }
        }
    }

    private var pillSection: some View {
        GallerySection("Pills, chips and status", note: "Every status carries a glyph and a word. Selected chips carry a check.") {
            VStack(alignment: .leading, spacing: FlowdSpacing.md) {
                HStack(spacing: FlowdSpacing.xs) {
                    Pill("Funded", systemImage: "lock.fill")
                    Pill("Daily Drop", systemImage: "bolt.fill", tone: .ember, style: .solid)
                    Pill("Flo", systemImage: "sparkles", tone: .violet)
                }
                FlowdWrap(lineSpacing: 0) {
                    ForEach(GalleryData.niches, id: \.self) { (niche: String) in
                        Chip(niche, isSelected: selectedNiches.contains(niche)) {
                            if selectedNiches.contains(niche) {
                                selectedNiches.remove(niche)
                            } else {
                                selectedNiches.insert(niche)
                            }
                        }
                    }
                }
                FlowdWrap(lineSpacing: FlowdSpacing.xs) {
                    ForEach(FlowdStatus.allCases, id: \.self) { (status: FlowdStatus) in
                        StatusPill(status)
                    }
                }
                StatusPill(.inReview, detail: "decides by Fri 2:00 PM")
            }
        }
    }

    private var segmentedSection: some View {
        GallerySection("Segmented picker", note: "The track is a fill. The selected pill is the single glass layer and morphs between segments.") {
            VStack(spacing: FlowdSpacing.sm) {
                SegmentedPicker(selection: $range, values: GalleryRange.allCases) { (value: GalleryRange) -> String in
                    return value.title
                }
                SegmentedPicker(
                    selection: $tab,
                    options: [
                        SegmentedPicker<GalleryTab>.Option(value: .home, title: "Home", systemImage: "house.fill"),
                        SegmentedPicker<GalleryTab>.Option(value: .bounties, title: "Bounties", systemImage: "target"),
                        SegmentedPicker<GalleryTab>.Option(value: .wallet, title: "Wallet", systemImage: "creditcard.fill")
                    ],
                    fillsWidth: false
                )
            }
        }
    }

    private var listSection: some View {
        GallerySection("Lists and headers") {
            VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                SectionHeader("For you", subtitle: "Matched to your niches", actionTitle: "See all") {}
                FlowdCard {
                    VStack(spacing: 0) {
                        ListRow(title: "Lumen hook B", subtitle: "Clears in 41 h", systemImage: "play.rectangle.fill", tone: .info) {
                            MoneyText(cents: 3_820, style: FlowdFont.figureSm, state: .pending)
                        }
                        FlowdDivider(inset: 52)
                        ListRow(title: "Fernlingo day-3 reaction", subtitle: "Cleared Tue", systemImage: "checkmark.circle.fill", tone: .mint) {
                            MoneyText(cents: 6_240, style: FlowdFont.figureSm, state: .cleared)
                        }
                        FlowdDivider(inset: 52)
                        ListRow(title: "Payout methods", subtitle: "Bank ending 4417", systemImage: "building.columns", showsChevron: true)
                    }
                }
            }
        }
    }

    private var tabBarSection: some View {
        GallerySection("Floating tab bar", note: "Two glass clusters and a centre action in one container. Selection is a fill, plus a filled symbol.") {
            FlowdTabBar(
                leading: [
                    FlowdTabItem(id: GalleryTab.home, title: "Home", systemImage: "house", selectedSystemImage: "house.fill"),
                    FlowdTabItem(id: GalleryTab.bounties, title: "Bounties", systemImage: "target", badge: 3)
                ],
                trailing: [
                    FlowdTabItem(id: GalleryTab.wallet, title: "Wallet", systemImage: "creditcard", selectedSystemImage: "creditcard.fill"),
                    FlowdTabItem(id: GalleryTab.profile, title: "Profile", systemImage: "person.crop.circle", selectedSystemImage: "person.crop.circle.fill")
                ],
                selection: $tab,
                center: FlowdTabCenterAction(systemImage: "video.fill", label: "Make a take") {}
            )
            .padding(.horizontal, -FlowdSpacing.md)
        }
    }

    // MARK: Identity

    private var identitySections: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.xxl) {
            tierSection
            avatarSection
            thumbSection
        }
    }

    private var tierSection: some View {
        GallerySection("Tier badges", note: "Chevrons carry rank without colour. Elite is the only dark medallion.") {
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.md) {
                    ForEach(FlowdTierLevel.allCases) { (level: FlowdTierLevel) in
                        HStack(spacing: FlowdSpacing.md) {
                            TierBadge(level, size: .chip)
                            TierBadge(level, size: .row)
                            TierBadge(level, size: .card)
                            TierChip(level)
                        }
                    }
                }
            }
        }
    }

    private var avatarSection: some View {
        GallerySection("Avatars", note: "Generated from the handle, stable across launches. Brands use a rounded square.") {
            FlowdCard {
                VStack(alignment: .leading, spacing: FlowdSpacing.md) {
                    HStack(spacing: FlowdSpacing.sm) {
                        AvatarView(seed: "cr_maya", name: "Maya Kim", size: 44, tier: .gold)
                        AvatarView(seed: "cr_luna", name: "Luna Park", size: 44, tier: .elite)
                        AvatarView(seed: "cr_tej", name: "Tej Rao", size: 44)
                        AvatarView(seed: "app_napnest", name: "Nap Nest", size: 44, shape: .roundedSquare)
                        AvatarView(seed: "app_fernlingo", name: "Fernlingo", size: 44, shape: .roundedSquare)
                    }
                }
            }
        }
    }

    private var thumbSection: some View {
        GallerySection("Generated thumbnails", note: "ArtSeed to gradient, motif and big type. No photos, no stock.") {
            VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: FlowdSpacing.sm) {
                        ForEach(0..<ArtSeed.samples.count, id: \.self) { (index: Int) in
                            ThumbArt(ArtSeed.samples[index])
                                .frame(width: 124)
                        }
                    }
                }
                ThumbArt(ArtSeed.samples[0], aspect: .landscape, cornerRadius: FlowdRadius.xxl)
            }
        }
    }

    // MARK: Data

    private var dataSections: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.xxl) {
            moneySection
            scoreSection
            chartSections
        }
    }

    private var moneySection: some View {
        GallerySection("Money and stats", note: "Cleared is Mint with a check. Pending is Lagoon with a clock and its date. Never a bare pending.") {
            VStack(spacing: FlowdSpacing.sm) {
                FlowdCard {
                    FlowdEarningsPair(clearedCents: moneyCents, pendingCents: 18_620, pendingNote: "clears Sat 2:00 PM")
                }
                FlowdButton("Add $24.10", variant: .secondary) {
                    moneyCents += 2_410
                }
                LazyVGrid(columns: FlowdGridColumns.two, spacing: FlowdSpacing.sm) {
                    StatTile(
                        "Cleared this month",
                        value: .money(cents: 128_460, state: .cleared),
                        delta: FlowdDelta(0.38, vs: "Aug"),
                        sparkline: [12, 18, 15, 24, 31, 28, 40, 52, 49, 61, 70, 84],
                        chartTone: .good
                    )
                    StatTile(
                        "Verified views",
                        value: .compact(412_000),
                        delta: FlowdDelta(0.124, vs: "last 7 days"),
                        systemImage: "eye.fill"
                    )
                }
                FlowdCard {
                    VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
                        MoneyText(cents: 18_620, state: .pending)
                        MoneyText(cents: 500_000, state: .escrowed, showsCents: false)
                        MoneyText(cents: 1_200, state: .down)
                        MoneyText(cents: 150, state: .bonus)
                        MoneyText(cents: 24_000, state: .paid)
                    }
                }
            }
        }
    }

    private var scoreSection: some View {
        GallerySection("Scores and progress", note: "Checklist scores say so. Band, letter and number, never colour alone.") {
            VStack(spacing: FlowdSpacing.sm) {
                FlowdCard {
                    HStack(alignment: .top, spacing: FlowdSpacing.md) {
                        ScoreRing(score: 82, title: "Hook Score", size: 108)
                        ScoreRing(score: 41, title: "Flow Score", size: 80, caption: nil)
                        ScoreRing(score: nil, title: "Hook Score", size: 80, caption: nil)
                    }
                    .frame(maxWidth: .infinity)
                }
                FlowdCard {
                    HStack(spacing: FlowdSpacing.lg) {
                        ProgressRing(progress: progress, size: 88, lineWidth: 9, label: "Progress to Platinum") {
                            VStack(spacing: 0) {
                                Text(FlowdNumberFormat.percent(progress)).flowdFigure(.md).foregroundStyle(FlowdColor.fg)
                                Text("to Platinum").flowdCaption(.caption2).foregroundStyle(FlowdColor.fgSubtle)
                            }
                        }
                        VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
                            Text("Budget left 62%").flowdCaption(.footnote).foregroundStyle(FlowdColor.fgMuted)
                            FlowdProgressBar(progress: 0.62, tone: .accent, label: "Budget left")
                            FlowdButton("Bump progress", variant: .secondary, size: .compact) {
                                progress = progress >= 0.95 ? 0.1 : progress + 0.15
                            }
                        }
                    }
                }
                FlowdCard {
                    VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
                        CountdownLabel(to: Date().addingTimeInterval(4 * 3_600 + 12 * 60), prefix: "Next drop in ", textStyle: FlowdFont.figureMd, tone: .ember)
                        CountdownLabel(to: Date().addingTimeInterval(26 * 3_600), style: .verbose, prefix: "Decides in ")
                    }
                }
            }
        }
    }

    private var chartSections: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.xxl) {
            GallerySection("Charts", note: "Swift Charts, token palette, 2 pt marks, direct labels, a text summary and a table view. Drag the area chart.") {
                VStack(spacing: FlowdSpacing.sm) {
                    FlowdCard {
                        FlowdAreaChart(
                            title: "Cleared earnings",
                            points: GalleryData.cleared,
                            previous: GalleryData.previousCleared,
                            format: .moneyCents,
                            tone: .good
                        )
                    }
                    FlowdCard {
                        FlowdBarChart(title: "Posts this week", bars: GalleryData.weekPosts, tone: .azure, height: 170)
                    }
                    FlowdCard {
                        FlowdBarChart(title: "Views by hook", bars: GalleryData.hookViews, format: .compact, tone: .violet, orientation: .horizontal)
                    }
                }
            }
            GallerySection("Funnel and retention") {
                VStack(spacing: FlowdSpacing.sm) {
                    FlowdAttributionKey()
                    FlowdCard {
                        FlowdFunnelChart(title: "Install to paid", stages: GalleryData.funnel)
                    }
                    FlowdCard {
                        FlowdRetentionChart(
                            title: "Viewer retention",
                            points: GalleryData.retention,
                            benchmark: GalleryData.retentionTypical
                        )
                    }
                }
            }
        }
    }

    // MARK: Feedback

    private var feedbackSections: some View {
        VStack(alignment: .leading, spacing: FlowdSpacing.xxl) {
            toastSection
            loadingSection
            emptySection
        }
    }

    private var toastSection: some View {
        GallerySection("Toasts", note: "Glass capsules. Errors and toasts with an action stay until dismissed.") {
            VStack(spacing: FlowdSpacing.sm) {
                FlowdButton("Success", variant: .secondary, fullWidth: true) { toasts.success("Draft saved") }
                FlowdButton("Money", variant: .secondary, fullWidth: true) { toasts.money("$62.40 cleared to your Wallet") }
                FlowdButton("Warning", variant: .secondary, fullWidth: true) {
                    toasts.warning("You're offline", detail: "Everything you made is saved. We'll sync when you're back.")
                }
                FlowdButton("Error with action", variant: .secondary, fullWidth: true) {
                    toasts.error("Upload stopped at 62%", detail: "Your take is saved on this phone.", actionTitle: "Retry") {}
                }
            }
        }
    }

    private var loadingSection: some View {
        GallerySection("Skeletons", note: "Shimmering placeholders that stop under Reduce Motion.") {
            VStack(spacing: FlowdSpacing.sm) {
                FlowdCard {
                    VStack(spacing: FlowdSpacing.xs) {
                        SkeletonRow()
                        SkeletonRow()
                    }
                }
                FlowdCard {
                    VStack(alignment: .leading, spacing: FlowdSpacing.xs) {
                        Text("Pending $186.20").flowdBody(.headline).foregroundStyle(FlowdColor.fg)
                        Text("Clears Sat 2:00 PM").flowdBody(.subheadline).foregroundStyle(FlowdColor.fgMuted)
                    }
                }
                .flowdSkeleton(isLoading: skeletonOn)
                FlowdButton(skeletonOn ? "Show content" : "Redact content", variant: .secondary) {
                    skeletonOn.toggle()
                }
            }
        }
    }

    private var emptySection: some View {
        GallerySection("Empty and error states") {
            VStack(spacing: FlowdSpacing.sm) {
                EmptyStateView(
                    systemImage: "creditcard",
                    title: "Your first payout lands here",
                    message: "Pending money shows the day it clears.",
                    actionTitle: "Browse bounties"
                ) {}
                ErrorStateView(
                    title: "Upload stopped at 62%",
                    message: "Your take is saved on this phone. Try again."
                ) {}
            }
        }
    }

    // MARK: Celebration

    private var celebrationSections: some View {
        GallerySection("Celebration", note: "Only for creator earned outcomes: cleared money, approvals, a tier-up. Silent under Reduce Motion.") {
            VStack(spacing: FlowdSpacing.sm) {
                FlowdButton("Confetti", variant: .mint, fullWidth: true) {
                    burst += 1
                    FlowdHaptics.play(.success)
                }
                FlowdButton("Payout arrives", variant: .secondary, fullWidth: true) {
                    showsPayout = true
                }
                FlowdButton("Tier up", variant: .secondary, fullWidth: true) {
                    showsTierUp = true
                }
            }
        }
    }
}

// MARK: - Preview

#Preview("Design gallery") {
    DesignGallery()
}

#Preview("Design gallery, light") {
    DesignGallery()
        .preferredColorScheme(.light)
}
