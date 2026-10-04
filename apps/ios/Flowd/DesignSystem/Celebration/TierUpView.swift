import SwiftUI

// TierUpView: the rank-up moment (BRAND.md section 14). A progress ring closes around the current medallion, the new medallion springs
// in on the `bouncy` spring, a single rim sweep crosses it, the success haptic lands on that frame, then the name, the one-line why
// and the new perks fade in. Calm by design: no confetti rain (the brand book says rank-up has none), only an optional small burst
// in the tier's own colours for Elite via `showsConfetti`. Tiers are EARNED: the copy says what earned it. Reduce Motion: the new
// medallion appears at once, no ring, no sweep, same haptic and announcement.
//
//     .fullScreenCover(item: $tierUp) { event in
//         TierUpView(to: event.newTier) { tierUp = nil }
//     }

// MARK: - Tier helpers

extension FlowdTierLevel {
    /// The tier below, `nil` at Bronze.
    var previous: FlowdTierLevel? {
        switch self {
        case .bronze: return nil
        case .silver: return FlowdTierLevel.bronze
        case .gold: return FlowdTierLevel.silver
        case .platinum: return FlowdTierLevel.gold
        case .elite: return FlowdTierLevel.platinum
        }
    }

    /// What reaching this tier unlocks (DECISIONS section 3). Early access is a head start on newly published bounties.
    var newPerks: [String] {
        switch self {
        case .bronze:
            return ["Every open bounty is yours to claim", "Weekly payouts every Friday, free"]
        case .silver:
            return ["1-hour head start on new bounties", "Your own rate card, with market-suggested prices"]
        case .gold:
            return ["3-hour head start on new bounties", "One free instant cash-out each week", "Lead a Crew"]
        case .platinum:
            return ["6-hour head start on new bounties", "Unlimited free instant cash-outs", "Bid in auctions"]
        case .elite:
            return ["12-hour head start on new bounties", "A featured profile", "Unlimited free instant cash-outs"]
        }
    }
}

// MARK: - View

struct TierUpView: View {
    let to: FlowdTierLevel
    let from: FlowdTierLevel?
    let perks: [String]
    let showsConfetti: Bool
    let includesBackground: Bool
    let onDone: (() -> Void)?

    @State private var ringProgress: Double = 0
    @State private var isRevealed: Bool = false
    @State private var sweep: Double = 0
    @State private var burst: Int = 0
    @State private var detailsShown: Bool = false
    private var appearance: FlowdAppearance = FlowdAppearance()

    /// - Parameters:
    ///   - to: the tier just reached.
    ///   - from: the tier before it (defaults to `to.previous`).
    ///   - perks: lines for the "new perks" card (defaults to `to.newPerks`).
    ///   - showsConfetti: a small burst in the tier's colours. Off by default (brand: rank-up is calm); use for Elite.
    init(
        to: FlowdTierLevel,
        from: FlowdTierLevel? = nil,
        perks: [String]? = nil,
        showsConfetti: Bool = false,
        includesBackground: Bool = true,
        onDone: (() -> Void)? = nil
    ) {
        self.to = to
        self.from = from ?? to.previous
        self.perks = perks ?? to.newPerks
        self.showsConfetti = showsConfetti
        self.includesBackground = includesBackground
        self.onDone = onDone
    }

    var body: some View {
        ZStack {
            if includesBackground {
                AuroraBackground()
            }
            VStack(spacing: FlowdSpacing.lg) {
                Spacer(minLength: FlowdSpacing.md)
                Text("Tier up")
                    .flowdCaption(.overline)
                    .foregroundStyle(FlowdColor.fgSubtle)
                medallionStack
                titleBlock
                perksCard
                Spacer(minLength: FlowdSpacing.md)
                if let onDone = onDone {
                    FlowdButton("Keep going", variant: .secondary, size: .large, fullWidth: true, action: onDone)
                }
            }
            .padding(.horizontal, FlowdSpacing.xl)
            .padding(.bottom, FlowdSpacing.lg)
            if showsConfetti {
                ConfettiView(
                    trigger: burst,
                    particleCount: 48,
                    origin: UnitPoint(x: 0.5, y: 0.34),
                    colors: FlowdConfettiPalette.tier(to)
                )
            }
        }
        .task {
            await play()
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: Medallion

    private var medallionStack: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [to.style.glow, Color.clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 130
                    )
                )
                .frame(width: 260, height: 260)
                .opacity(isRevealed ? 1 : 0)
            if from != nil {
                ProgressRing(progress: ringProgress, size: 188, lineWidth: 6, tone: .accent, label: "Progress to " + to.title)
                    .opacity(isRevealed ? 0 : 1)
            }
            if let from = from {
                TierMedallion(level: from, diameter: 132)
                    .opacity(isRevealed ? 0 : 1)
                    .scaleEffect(isRevealed ? 0.8 : 1)
            }
            TierMedallion(level: to, diameter: 144)
                .scaleEffect(isRevealed ? 1 : 0.4)
                .opacity(isRevealed ? 1 : 0)
            rimSweep
        }
        .frame(width: 220, height: 220)
        .accessibilityHidden(true)
    }

    /// One bright arc that travels once around the new medallion.
    private var rimSweep: some View {
        Circle()
            .strokeBorder(
                AngularGradient(
                    colors: [Color.clear, FlowdPrimitive.white.opacity(0.95), Color.clear],
                    center: .center
                ),
                lineWidth: 3
            )
            .frame(width: 148, height: 148)
            .rotationEffect(Angle.degrees(sweep))
            .opacity(isRevealed && sweep < 360 ? 1 : 0)
    }

    // MARK: Text

    private var titleBlock: some View {
        VStack(spacing: FlowdSpacing.xxs) {
            Text("You reached " + to.title)
                .flowdDisplay(.largeTitle)
                .foregroundStyle(FlowdColor.fg)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            Text("Earned from cleared money, approved posts and a steady approval rate.")
                .flowdBody(.callout)
                .foregroundStyle(FlowdColor.fgMuted)
                .multilineTextAlignment(.center)
        }
        .opacity(detailsShown ? 1 : 0)
        .offset(y: detailsShown || appearance.reduceMotion ? 0 : 8)
    }

    private var perksCard: some View {
        FlowdCard {
            VStack(alignment: .leading, spacing: FlowdSpacing.sm) {
                Text("New at " + to.title)
                    .flowdBody(.headline)
                    .foregroundStyle(FlowdColor.fg)
                ForEach(perks, id: \.self) { (perk: String) in
                    HStack(alignment: .top, spacing: FlowdSpacing.xs) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(FlowdColor.mint)
                            .accessibilityHidden(true)
                        Text(perk)
                            .flowdBody(.subheadline)
                            .foregroundStyle(FlowdColor.fg)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .opacity(detailsShown ? 1 : 0)
        .offset(y: detailsShown || appearance.reduceMotion ? 0 : 12)
    }

    // MARK: Sequence

    @MainActor
    private func play() async {
        if appearance.reduceMotion {
            ringProgress = 1
            isRevealed = true
            sweep = 360
            detailsShown = true
            FlowdHaptics.play(.success)
            AccessibilityNotification.Announcement("Tier up. You reached " + to.title + ".").post()
            return
        }
        if from != nil {
            withAnimation(FlowdMotion.emphasized(0.9)) {
                ringProgress = 1
            }
            try? await Task.sleep(nanoseconds: 950_000_000)
        }
        // The causal frame: the new medallion lands, the haptic fires, the rim sweeps.
        withAnimation(FlowdMotion.bouncy) {
            isRevealed = true
        }
        FlowdHaptics.play(.success)
        burst += 1
        withAnimation(FlowdMotion.emphasized(0.9)) {
            sweep = 360
        }
        try? await Task.sleep(nanoseconds: 250_000_000)
        withAnimation(FlowdMotion.smooth) {
            detailsShown = true
        }
        AccessibilityNotification.Announcement("Tier up. You reached " + to.title + ".").post()
    }
}

// MARK: - Preview

#Preview("Tier up, Gold") {
    TierUpView(to: .gold) {}
}

#Preview("Tier up, Elite") {
    TierUpView(to: .elite, showsConfetti: true) {}
}
