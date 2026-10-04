import SwiftUI

// L0: the aurora. Four soft radial orbs on the canvas colour with a hint of grain (BRAND.md section 10). Orb positions, radii,
// colours and falloff come from `FlowdAurora` in Tokens.swift. Drift is 90 s, +-2 percent translate and a 1.0 to 1.06 scale,
// and it stops under Reduce Motion, in Low Power Mode and when the app is not active. Never blur the orbs, never animate their
// size, keep one aurora per screen. On dense data screens use `.calm` so the aurora recedes to 60 percent.
//
// MeshGradient (iOS 18) is deliberately not used: radial orbs match the web aurora exactly on every OS.

enum FlowdAuroraIntensity: CaseIterable, Hashable, Sendable {
    /// Full strength: onboarding, Home, hero screens.
    case full
    /// 60 percent: dense data screens (Wallet detail, charts, lists).
    case calm

    var multiplier: Double {
        switch self {
        case .full: return 1.0
        case .calm: return 0.6
        }
    }
}

struct AuroraBackground: View {
    let intensity: FlowdAuroraIntensity
    let isAnimated: Bool

    @Environment(\.colorScheme) private var colorScheme: ColorScheme
    @Environment(\.scenePhase) private var scenePhase: ScenePhase
    @State private var drift: Bool = false
    @State private var lowPower: Bool = ProcessInfo.processInfo.isLowPowerModeEnabled
    private var appearance: FlowdAppearance = FlowdAppearance()

    init(intensity: FlowdAuroraIntensity = .full, isAnimated: Bool = true) {
        self.intensity = intensity
        self.isAnimated = isAnimated
    }

    var body: some View {
        let isDark: Bool = colorScheme == ColorScheme.dark
        let orbs: [FlowdAuroraOrb] = FlowdAurora.orbs(isDark: isDark)
        let multiplier: Double = intensity.multiplier
        return GeometryReader { (proxy: GeometryProxy) in
            let size: CGSize = proxy.size
            ZStack {
                FlowdAurora.base
                orbLayer(orbs: orbs, size: size, multiplier: multiplier)
                    .offset(
                        x: drift ? size.width * 0.02 : -size.width * 0.02,
                        y: drift ? size.height * 0.012 : -size.height * 0.012
                    )
                    .scaleEffect(drift ? 1.06 : 1.0)
                if isDark {
                    vignette(size: size)
                }
                AuroraGrain(opacity: isDark ? FlowdAurora.darkNoiseOpacity : FlowdAurora.lightNoiseOpacity)
            }
            .frame(width: size.width, height: size.height)
            .clipped()
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { updateDrift() }
        .onChange(of: shouldDrift) { _, _ in updateDrift() }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name.NSProcessInfoPowerStateDidChange)) { _ in
            lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
        }
    }

    private func orbLayer(orbs: [FlowdAuroraOrb], size: CGSize, multiplier: Double) -> some View {
        return ZStack {
            ForEach(orbs) { (orb: FlowdAuroraOrb) in
                AuroraOrbView(orb: orb, size: size, multiplier: multiplier)
            }
        }
        .frame(width: size.width, height: size.height)
    }

    private func vignette(size: CGSize) -> some View {
        let longSide: CGFloat = max(size.width, size.height)
        return RadialGradient(
            colors: [Color.clear, FlowdPrimitive.black.opacity(0.28)],
            center: .center,
            startRadius: longSide * 0.45,
            endRadius: longSide * 0.85
        )
        .frame(width: size.width, height: size.height)
    }

    private var shouldDrift: Bool {
        return isAnimated && !appearance.reduceMotion && scenePhase == ScenePhase.active && !lowPower
    }

    private func updateDrift() {
        if shouldDrift {
            withAnimation(Animation.easeInOut(duration: FlowdAurora.driftSeconds).repeatForever(autoreverses: true)) {
                drift = true
            }
        } else {
            withAnimation(nil) {
                drift = false
            }
        }
    }
}

// MARK: - Orb

private struct AuroraOrbView: View {
    let orb: FlowdAuroraOrb
    let size: CGSize
    let multiplier: Double

    var body: some View {
        let diameter: CGFloat = orb.radius * max(size.width, size.height) * 2
        let stops: [Gradient.Stop] = orb.stops.map { (stop: FlowdAuroraStop) -> Gradient.Stop in
            return Gradient.Stop(color: orb.color.opacity(stop.opacity * multiplier), location: stop.location)
        }
        return RadialGradient(
            gradient: Gradient(stops: stops),
            center: .center,
            startRadius: 0,
            endRadius: diameter / 2
        )
        .frame(width: diameter, height: diameter)
        .position(x: orb.x * size.width, y: orb.y * size.height)
    }
}

// MARK: - Grain

/// Static film grain: ~2,000 deterministic specks drawn once. Cheap, and breaks banding in the blurred gradients.
private struct AuroraGrain: View {
    let opacity: Double

    var body: some View {
        let amount: Double = opacity
        return Canvas { (context: inout GraphicsContext, size: CGSize) in
            FlowdGrainPainter.paint(into: &context, size: size)
        }
        .opacity(amount * 6)
        .blendMode(.overlay)
        .allowsHitTesting(false)
    }
}

/// Nonisolated so the Canvas renderer (which may run off the main actor) can call it.
private enum FlowdGrainPainter {
    static func paint(into context: inout GraphicsContext, size: CGSize) {
        var generator: FlowdSeededRandom = FlowdSeededRandom(seed: 0xF10D)
        let count: Int = 2000
        var index: Int = 0
        while index < count {
            let x: CGFloat = CGFloat(Double.random(in: 0...1, using: &generator)) * size.width
            let y: CGFloat = CGFloat(Double.random(in: 0...1, using: &generator)) * size.height
            let alpha: Double = Double.random(in: 0.25...0.9, using: &generator)
            let isLight: Bool = Double.random(in: 0...1, using: &generator) > 0.5
            let rect: CGRect = CGRect(x: x, y: y, width: 1.2, height: 1.2)
            context.fill(
                Path(rect),
                with: .color(isLight ? FlowdPrimitive.white.opacity(alpha) : FlowdPrimitive.black.opacity(alpha))
            )
            index += 1
        }
    }
}

// MARK: - Deterministic random (SplitMix64)

/// Seeded generator so generated art (aurora grain, thumbnails, avatars, confetti) is identical on every launch.
struct FlowdSeededRandom: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) {
        self.state = seed
    }

    mutating func next() -> UInt64 {
        state = state &+ 0x9E3779B97F4A7C15
        var z: UInt64 = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }

    /// Uniform Double in 0...1.
    mutating func unit() -> Double {
        return Double.random(in: 0...1, using: &self)
    }

    /// Uniform Double in the range.
    mutating func range(_ lower: Double, _ upper: Double) -> Double {
        return Double.random(in: lower...upper, using: &self)
    }
}

// MARK: - Convenience

extension View {
    /// Puts the aurora behind a screen: `ScrollView { ... }.flowdAurora()`. Ignores the safe area.
    func flowdAurora(_ intensity: FlowdAuroraIntensity = .full) -> some View {
        return background {
            AuroraBackground(intensity: intensity)
        }
    }
}

/// Preview and gallery helper: aurora + padding + scroll so every component is judged on its real backdrop.
struct FlowdPreviewCanvas<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ZStack {
            AuroraBackground()
            ScrollView {
                content
            }
        }
    }
}

#Preview("Aurora, dark") {
    AuroraBackground()
        .preferredColorScheme(.dark)
}

#Preview("Aurora, light") {
    AuroraBackground()
        .preferredColorScheme(.light)
}

#Preview("Aurora, calm") {
    AuroraBackground(intensity: .calm)
        .preferredColorScheme(.dark)
}
