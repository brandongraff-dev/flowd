import SwiftUI

// The launch gate's own screens: the splash (the flowd mark drawing itself over the aurora), and the calm states for a failed launch, planned
// maintenance and a build that is too old. "Mark draw-on (600 ms, fade under reduced motion)": the ribbon-f draws first, the mint crossbar lands last.

// MARK: - The mark

/// The ribbon-f (a stroked path) from `brand/logo/flowd-mark.svg`, in a 256-point design space.
private struct FlowdRibbonShape: Shape {
    func path(in rect: CGRect) -> Path {
        let s: CGFloat = min(rect.width, rect.height) / 256
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            return CGPoint(x: rect.minX + (x + 13) * s, y: rect.minY + (y - 5) * s)
        }
        var path: Path = Path()
        path.move(to: point(34, 214))
        path.addCurve(to: point(90, 170), control1: point(66, 214), control2: point(84, 196))
        path.addCurve(to: point(112, 88), control1: point(98, 134), control2: point(100, 112))
        path.addCurve(to: point(172, 52), control1: point(124, 64), control2: point(144, 52))
        path.addLine(to: point(196, 52))
        return path
    }
}

/// The mint crossbar of the mark.
private struct FlowdBarShape: Shape {
    func path(in rect: CGRect) -> Path {
        let s: CGFloat = min(rect.width, rect.height) / 256
        var path: Path = Path()
        path.move(to: CGPoint(x: rect.minX + (62 + 13) * s, y: rect.minY + (138 - 5) * s))
        path.addLine(to: CGPoint(x: rect.minX + (168 + 13) * s, y: rect.minY + (138 - 5) * s))
        return path
    }
}

/// The flowd mark, drawn to `progress` (0 nothing, 1 complete). The letter takes the first 70 percent, the crossbar the last 40 (they overlap a little).
/// The letter is `FlowdColor.fg` (ink on light, ice on dark) and the bar is Mint, as in the logo files.
struct FlowdMarkView: View {
    var progress: CGFloat

    init(progress: CGFloat = 1) {
        self.progress = progress
    }

    var body: some View {
        GeometryReader { (proxy: GeometryProxy) in
            let side: CGFloat = min(proxy.size.width, proxy.size.height)
            let scale: CGFloat = side / 256
            ZStack {
                FlowdRibbonShape()
                    .trim(from: 0, to: min(1, max(0, progress / 0.7)))
                    .stroke(FlowdColor.fg, style: StrokeStyle(lineWidth: 40 * scale, lineCap: .round, lineJoin: .round))
                FlowdBarShape()
                    .trim(from: 0, to: min(1, max(0, (progress - 0.6) / 0.4)))
                    .stroke(FlowdColor.mintSolid, style: StrokeStyle(lineWidth: 34 * scale, lineCap: .round))
            }
            .frame(width: side, height: side)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement()
        .accessibilityLabel("flowd")
        .accessibilityAddTraits(AccessibilityTraits.isImage)
    }
}

// MARK: - Splash

/// The first screen of a normal launch: the mark draws itself (600 ms) over the aurora while the session is restored. Under Reduce Motion the mark
/// is simply there and fades in.
struct SplashView: View {
    @State private var progress: CGFloat = 0
    @State private var tagline: Double = 0
    private var appearance: FlowdAppearance = FlowdAppearance()

    var body: some View {
        ZStack {
            AuroraBackground()
            VStack(spacing: FlowdSpacing.lg) {
                FlowdMarkView(progress: progress)
                    .frame(width: 104, height: 104)
                Text("Money follows what works.")
                    .flowdBody(.callout)
                    .foregroundStyle(FlowdColor.fgMuted)
                    .opacity(tagline)
            }
        }
        .onAppear {
            if appearance.reduceMotion {
                withAnimation(FlowdMotion.standard(FlowdMotion.base)) {
                    progress = 1
                    tagline = 1
                }
            } else {
                withAnimation(FlowdMotion.emphasized(0.6)) {
                    progress = 1
                }
                withAnimation(FlowdMotion.standard(FlowdMotion.slower).delay(0.35)) {
                    tagline = 1
                }
            }
        }
    }
}

// MARK: - Launch problems

/// A failed launch, planned maintenance, or a build that is too old. Calm, specific, with the one next step that exists.
struct LaunchProblemView: View {
    enum Kind: Equatable {
        case failed(String)
        case maintenance(String?)
        case updateRequired
    }

    let kind: Kind
    let retry: () -> Void
    @Environment(\.openURL) private var openURL: OpenURLAction

    init(kind: Kind, retry: @escaping () -> Void) {
        self.kind = kind
        self.retry = retry
    }

    var body: some View {
        ZStack {
            AuroraBackground(intensity: FlowdAuroraIntensity.calm)
            content
                .padding(FlowdSpacing.lg)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch kind {
        case .failed(let message):
            FlowdCard {
                ErrorStateView(title: "We couldn't open flowd", message: message, retryTitle: "Try again", retry: retry)
            }
        case .maintenance(let statusLink):
            FlowdCard {
                EmptyStateView(
                    systemImage: "wrench.and.screwdriver.fill",
                    title: "flowd is being tuned up",
                    message: "We'll be back shortly. Everything you made is saved.",
                    actionTitle: "Check status",
                    tone: FlowdTone.info
                ) {
                    openStatus(statusLink)
                }
            }
        case .updateRequired:
            FlowdCard {
                EmptyStateView(
                    systemImage: "arrow.down.app.fill",
                    title: "Update flowd to keep going",
                    message: "This version is too old to open your account safely. Nothing you made is lost.",
                    tone: FlowdTone.ember
                )
            }
        }
    }

    private func openStatus(_ statusLink: String?) {
        let text: String = statusLink ?? ("https://" + FlowdConstants.WorldInfo.publicDomain + "/status")
        if let url = URL(string: text) {
            openURL(url)
        }
    }
}

#Preview("Splash") {
    SplashView()
        .flowdPreviewEnvironment()
}

#Preview("Launch failed") {
    LaunchProblemView(kind: LaunchProblemView.Kind.failed("The demo data couldn't be loaded.")) {
    }
    .flowdPreviewEnvironment()
}
