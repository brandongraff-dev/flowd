import SwiftUI

// PayoutArriveView: the "money reached you" moment (design-ux delight #2). A dotted route from the Wallet to the payout method draws
// itself in, a mint check seals the destination on a bouncy spring, the success haptic fires on that same frame, the amount rolls up
// from zero and a confetti burst fires. It is a creator EARNED OUTCOME, so it celebrates; it states plain facts (amount, where, when)
// and never hypes income. Reduce Motion: everything appears at once, no confetti, same haptic and VoiceOver announcement.
//
//     .fullScreenCover(item: $arrived) { payout in
//         PayoutArriveView(amountCents: payout.amountCents, methodTitle: "Bank ending 4417", arrivalNote: "Fri, Oct 10") { arrived = nil }
//     }

/// Quadratic arc between the two endpoints, used for the route and its `trim` draw-in.
struct FlowdPayoutRouteShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path: Path = Path()
        let start: CGPoint = CGPoint(x: rect.minX + 62, y: rect.midY)
        let end: CGPoint = CGPoint(x: rect.maxX - 62, y: rect.midY)
        path.move(to: start)
        path.addQuadCurve(to: end, control: CGPoint(x: rect.midX, y: rect.midY - 70))
        return path
    }
}

struct PayoutArriveView: View {
    let amountCents: Int
    let methodTitle: String
    let arrivalNote: String?
    let isArrived: Bool
    let isInstant: Bool
    let includesBackground: Bool
    let onDone: (() -> Void)?

    @State private var routeProgress: Double = 0
    @State private var isSealed: Bool = false
    @State private var shownCents: Int = 0
    @State private var textShown: Bool = false
    @State private var burst: Int = 0
    private var appearance: FlowdAppearance = FlowdAppearance()

    /// - Parameters:
    ///   - methodTitle: where it went: "Bank ending 4417".
    ///   - arrivalNote: a date, shown under the line ("Fri, Oct 10"). For `isArrived == false` it reads "Arrives Fri, Oct 10".
    ///   - isArrived: `true` once the money landed ("Payout arrived"); `false` when it has just been sent ("Payout on its way").
    ///   - isInstant: instant cash-outs say so in the overline.
    ///   - includesBackground: draws the aurora behind it (leave `true` for a full-screen cover; `false` inside your own screen).
    init(
        amountCents: Int,
        methodTitle: String,
        arrivalNote: String? = nil,
        isArrived: Bool = true,
        isInstant: Bool = false,
        includesBackground: Bool = true,
        onDone: (() -> Void)? = nil
    ) {
        self.amountCents = amountCents
        self.methodTitle = methodTitle
        self.arrivalNote = arrivalNote
        self.isArrived = isArrived
        self.isInstant = isInstant
        self.includesBackground = includesBackground
        self.onDone = onDone
    }

    var body: some View {
        ZStack {
            if includesBackground {
                AuroraBackground()
            }
            VStack(spacing: FlowdSpacing.xl) {
                Spacer(minLength: FlowdSpacing.xl)
                route
                amountBlock
                Spacer(minLength: FlowdSpacing.md)
                if let onDone = onDone {
                    FlowdButton("Done", variant: .secondary, size: .large, fullWidth: true, action: onDone)
                }
            }
            .padding(.horizontal, FlowdSpacing.xl)
            .padding(.bottom, FlowdSpacing.lg)
            ConfettiView(trigger: burst, colors: FlowdConfettiPalette.money)
        }
        .task {
            await play()
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: Route

    private var route: some View {
        ZStack {
            FlowdPayoutRouteShape()
                .stroke(FlowdColor.rimStrong, style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [1, 7]))
            FlowdPayoutRouteShape()
                .trim(from: 0, to: CGFloat(routeProgress))
                .stroke(FlowdGradient.money, style: StrokeStyle(lineWidth: 3, lineCap: .round))
            HStack(spacing: 0) {
                endpoint(systemImage: "creditcard.fill", caption: "Wallet", tone: FlowdTone.accent, sealed: false)
                Spacer(minLength: 0)
                endpoint(systemImage: "building.columns.fill", caption: shortMethod, tone: isSealed ? FlowdTone.mint : FlowdTone.neutral, sealed: true)
            }
        }
        .frame(height: 140)
        .accessibilityHidden(true)
    }

    private func endpoint(systemImage: String, caption: String, tone: FlowdTone, sealed: Bool) -> some View {
        return FlowdIconTile(systemImage: systemImage, tone: tone, size: 60)
            .overlay(alignment: .topTrailing) {
                if sealed {
                    seal
                        .offset(x: 8, y: -8)
                }
            }
            .overlay(alignment: .bottom) {
                Text(caption)
                    .flowdCaption(.caption1)
                    .foregroundStyle(FlowdColor.fgMuted)
                    .lineLimit(1)
                    .fixedSize()
                    .offset(y: 24)
            }
    }

    private var seal: some View {
        Image(systemName: "checkmark")
            .font(.system(size: 12, weight: .heavy))
            .foregroundStyle(FlowdColor.onMint)
            .frame(width: 26, height: 26)
            .background { Circle().fill(FlowdGradient.money) }
            .overlay { Circle().strokeBorder(FlowdColor.bg, lineWidth: 2) }
            .scaleEffect(isSealed ? 1 : 0.25)
            .opacity(isSealed ? 1 : 0)
    }

    // MARK: Amount

    private var amountBlock: some View {
        VStack(spacing: FlowdSpacing.xs) {
            Text(overline)
                .flowdCaption(.overline)
                .foregroundStyle(FlowdColor.fgSubtle)
            MoneyText(cents: shownCents, style: FlowdFont.figureHero, state: .cleared, showsGlyph: false)
            Text(headline)
                .flowdDisplay(.title2)
                .foregroundStyle(FlowdColor.fg)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            if let line = detailLine {
                Text(line)
                    .flowdBody(.callout)
                    .foregroundStyle(FlowdColor.fgMuted)
                    .multilineTextAlignment(.center)
            }
        }
        .opacity(textShown ? 1 : 0)
        .offset(y: textShown || appearance.reduceMotion ? 0 : 8)
    }

    private var overline: String {
        if isInstant {
            return "Instant payout"
        }
        return "Weekly payout"
    }

    private var headline: String {
        return isArrived ? "Payout arrived" : "Payout on its way"
    }

    private var detailLine: String? {
        let place: String = isArrived ? "Landed in " + methodTitle : "Sending to " + methodTitle
        guard let note = arrivalNote, !note.isEmpty else {
            return place
        }
        return isArrived ? place + ", " + note : place + ". Arrives " + note
    }

    private var shortMethod: String {
        if methodTitle.count > 18 {
            return String(methodTitle.prefix(17)) + "\u{2026}"
        }
        return methodTitle
    }

    private var spokenSummary: String {
        let amount: String = FlowdMoneyFormat.string(cents: amountCents)
        let sentence: String = detailLine ?? methodTitle
        return headline + ". " + amount + ". " + sentence + "."
    }

    // MARK: Sequence

    @MainActor
    private func play() async {
        if appearance.reduceMotion {
            routeProgress = 1
            isSealed = true
            shownCents = amountCents
            textShown = true
            FlowdHaptics.play(.success)
            AccessibilityNotification.Announcement(spokenSummary).post()
            return
        }
        withAnimation(FlowdMotion.emphasized(0.8)) {
            routeProgress = 1
        }
        try? await Task.sleep(nanoseconds: 700_000_000)
        // The causal frame: seal, haptic and confetti land together.
        withAnimation(FlowdMotion.bouncy) {
            isSealed = true
        }
        FlowdHaptics.play(.success)
        burst += 1
        withAnimation(FlowdMotion.smooth) {
            textShown = true
        }
        shownCents = amountCents
        AccessibilityNotification.Announcement(spokenSummary).post()
    }
}

// MARK: - Preview

#Preview("Payout arrived") {
    PayoutArriveView(amountCents: 128_460, methodTitle: "Bank ending 4417", arrivalNote: "Fri, Oct 10") {}
}

#Preview("Payout on its way, instant") {
    PayoutArriveView(
        amountCents: 24_000,
        methodTitle: "Bank ending 4417",
        arrivalNote: "in minutes",
        isArrived: false,
        isInstant: true
    ) {}
}
