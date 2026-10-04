import SwiftUI

// ConfettiView: a short burst of generated confetti. Celebration is for creator EARNED OUTCOMES only (cleared money, approvals, a
// tier-up); funding, bidding and spending get calm confirmations (DECISIONS 5). It is deterministic (seeded, so previews and tests are
// stable), costs one Canvas pass per frame while it plays and nothing afterwards, ignores touches, is hidden from VoiceOver, and draws
// NOTHING under Reduce Motion (pair it with a static cue and the success haptic, never rely on it).
//
//     @State private var burst = 0
//     ...
//     .flowdConfetti(trigger: burst)            // overlay; bump `burst += 1` at the causal moment, with FlowdHaptics.play(.success)
//     ConfettiView(trigger: burst, firesOnAppear: true)   // or place it yourself in a ZStack

// MARK: - Palettes

/// Colour sets for confetti. Decorative only, so fixed brand primitives rather than semantic tokens.
enum FlowdConfettiPalette {
    /// The full brand spread: mint, lagoon, azure, violet, sun, ember, rose, white.
    static let brand: [Color] = [
        FlowdPrimitive.mint400, FlowdPrimitive.lagoon400, FlowdPrimitive.azure400, FlowdPrimitive.ultraviolet400,
        FlowdPrimitive.sun400, FlowdPrimitive.ember400, FlowdPrimitive.rose400, FlowdPrimitive.white
    ]

    /// Earned money: mint and lagoon with a little sun.
    static let money: [Color] = [
        FlowdPrimitive.mint300, FlowdPrimitive.mint400, FlowdPrimitive.mint500, FlowdPrimitive.lagoon300,
        FlowdPrimitive.lagoon400, FlowdPrimitive.sun300, FlowdPrimitive.white
    ]

    /// A tier's own colours.
    static func tier(_ level: FlowdTierLevel) -> [Color] {
        switch level {
        case .bronze:
            return [FlowdPrimitive.ember300, FlowdPrimitive.ember400, FlowdPrimitive.sun300, FlowdPrimitive.white]
        case .silver:
            return [FlowdPrimitive.abyss200, FlowdPrimitive.abyss300, FlowdPrimitive.azure200, FlowdPrimitive.white]
        case .gold:
            return [FlowdPrimitive.sun300, FlowdPrimitive.sun400, FlowdPrimitive.sun500, FlowdPrimitive.white]
        case .platinum:
            return [FlowdPrimitive.azure200, FlowdPrimitive.lagoon200, FlowdPrimitive.ultraviolet200, FlowdPrimitive.white]
        case .elite:
            return brand
        }
    }
}

// MARK: - Particles

/// One piece of confetti. A pure value: where it is at time `t` is a closed-form function, so no per-frame state is kept.
struct FlowdConfettiParticle: Identifiable {
    let id: Int
    /// Launch direction in radians (screen space; straight up is minus pi over two).
    let angle: Double
    /// Launch speed in points per second.
    let speed: Double
    /// Long side in points.
    let size: CGFloat
    /// Short side as a fraction of the long side.
    let aspect: CGFloat
    /// Spin in radians per second.
    let spin: Double
    let phase: Double
    /// Side-to-side flutter amplitude in points.
    let flutter: Double
    /// Seconds before this piece launches (a burst fans out over about 0.18 s).
    let delay: Double
    /// 0 rectangle, 1 dot, 2 ribbon.
    let shape: Int
    let colorIndex: Int
}

enum FlowdConfettiFactory {
    /// Deterministic particles for a seed.
    static func make(count: Int, seed: UInt64) -> [FlowdConfettiParticle] {
        var random: FlowdSeededRandom = FlowdSeededRandom(seed: seed)
        var result: [FlowdConfettiParticle] = []
        var index: Int = 0
        while index < count {
            let spread: Double = random.range(-0.95, 0.95)
            let particle: FlowdConfettiParticle = FlowdConfettiParticle(
                id: index,
                angle: -Double.pi / 2 + spread,
                speed: random.range(520, 1_100),
                size: CGFloat(random.range(6, 12)),
                aspect: CGFloat(random.range(0.4, 0.8)),
                spin: random.range(-9, 9),
                phase: random.range(0, Double.pi * 2),
                flutter: random.range(4, 16),
                delay: random.range(0, 0.18),
                shape: Int(random.range(0, 2.999)),
                colorIndex: index
            )
            result.append(particle)
            index += 1
        }
        return result
    }
}

enum FlowdConfettiPainter {
    private static let gravity: Double = 760
    private static let drag: Double = 2.7

    /// Draws every particle at `elapsed` seconds after the burst. Pieces fade over the last 30 percent of `duration`.
    static func draw(
        particles: [FlowdConfettiParticle],
        colors: [Color],
        elapsed: TimeInterval,
        duration: TimeInterval,
        origin: CGPoint,
        into context: inout GraphicsContext
    ) {
        if colors.isEmpty || duration <= 0 {
            return
        }
        for particle in particles {
            let t: Double = elapsed - particle.delay
            if t < 0 {
                continue
            }
            let life: Double = t / duration
            if life >= 1 {
                continue
            }
            let decay: Double = exp(-drag * t)
            let travel: Double = (1 - decay) / drag
            let terminal: Double = gravity / drag
            let vx: Double = cos(particle.angle) * particle.speed
            let vy: Double = sin(particle.angle) * particle.speed
            let sway: Double = sin(t * 7 + particle.phase) * particle.flutter * min(t, 1)
            let x: Double = Double(origin.x) + vx * travel + sway
            let y: Double = Double(origin.y) + (vy - terminal) * travel + terminal * t
            let fade: Double = life < 0.7 ? 1 : max(0, 1 - (life - 0.7) / 0.3)
            let flip: Double = max(0.18, abs(cos(t * 6 + particle.phase)))

            var piece: GraphicsContext = context
            piece.opacity = fade
            piece.translateBy(x: CGFloat(x), y: CGFloat(y))
            piece.rotate(by: Angle.radians(particle.spin * t + particle.phase))
            piece.scaleBy(x: 1, y: CGFloat(flip))

            let width: CGFloat = particle.size
            let height: CGFloat = particle.size * particle.aspect
            let color: Color = colors[particle.colorIndex % colors.count]
            switch particle.shape {
            case 0:
                let rect: CGRect = CGRect(x: -width / 2, y: -height / 2, width: width, height: height)
                piece.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(color))
            case 1:
                let side: CGFloat = particle.size * 0.7
                let rect: CGRect = CGRect(x: -side / 2, y: -side / 2, width: side, height: side)
                piece.fill(Path(ellipseIn: rect), with: .color(color))
            default:
                let rect: CGRect = CGRect(x: -width * 0.9, y: -1.5, width: width * 1.8, height: 3)
                piece.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(color))
            }
        }
    }
}

// MARK: - View

struct ConfettiView: View {
    let trigger: Int
    let particleCount: Int
    let origin: UnitPoint
    let duration: TimeInterval
    let colors: [Color]
    let firesOnAppear: Bool

    @State private var particles: [FlowdConfettiParticle] = []
    @State private var startDate: Date? = nil
    @State private var token: Int = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion: Bool

    /// - Parameters:
    ///   - trigger: bump it (`burst += 1`) to fire a burst. Equal values never refire.
    ///   - origin: where the burst launches, as a fraction of the view (default: upper middle).
    ///   - firesOnAppear: also fire once when the view first appears (celebration screens).
    init(
        trigger: Int = 0,
        particleCount: Int = 90,
        origin: UnitPoint = UnitPoint(x: 0.5, y: 0.38),
        duration: TimeInterval = 2.8,
        colors: [Color] = FlowdConfettiPalette.brand,
        firesOnAppear: Bool = false
    ) {
        self.trigger = trigger
        self.particleCount = particleCount
        self.origin = origin
        self.duration = duration
        self.colors = colors
        self.firesOnAppear = firesOnAppear
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: startDate == nil || reduceMotion)) { timeline in
            Canvas { (context: inout GraphicsContext, size: CGSize) in
                guard let start = startDate else {
                    return
                }
                let elapsed: TimeInterval = timeline.date.timeIntervalSince(start)
                let point: CGPoint = CGPoint(x: size.width * origin.x, y: size.height * origin.y)
                FlowdConfettiPainter.draw(
                    particles: particles,
                    colors: colors,
                    elapsed: elapsed,
                    duration: duration,
                    origin: point,
                    into: &context
                )
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear {
            if firesOnAppear {
                fire()
            }
        }
        .onChange(of: trigger) { _, _ in
            fire()
        }
    }

    private func fire() {
        if reduceMotion {
            return
        }
        token += 1
        let current: Int = token
        let seed: UInt64 = UInt64(truncatingIfNeeded: trigger &* 7_919 &+ 104_729 &+ token &* 31)
        particles = FlowdConfettiFactory.make(count: particleCount, seed: seed)
        startDate = Date()
        let lifetime: TimeInterval = duration + 0.4
        Task {
            try? await Task.sleep(nanoseconds: UInt64(lifetime * 1_000_000_000))
            if token == current {
                startDate = nil
                particles = []
            }
        }
    }
}

extension View {
    /// Overlays a confetti burst that fires whenever `trigger` changes. Draws nothing under Reduce Motion.
    func flowdConfetti(
        trigger: Int,
        origin: UnitPoint = UnitPoint(x: 0.5, y: 0.38),
        colors: [Color] = FlowdConfettiPalette.brand,
        particleCount: Int = 90
    ) -> some View {
        return overlay {
            ConfettiView(trigger: trigger, particleCount: particleCount, origin: origin, colors: colors, firesOnAppear: false)
        }
    }
}

// MARK: - Preview

private struct ConfettiPreview: View {
    @State private var burst: Int = 0

    var body: some View {
        ZStack {
            AuroraBackground()
            VStack(spacing: FlowdSpacing.lg) {
                MoneyText(cents: 6_240, style: FlowdFont.figureXL, state: .cleared)
                FlowdButton("Clear a post", variant: .mint) {
                    burst += 1
                    FlowdHaptics.play(.success)
                }
            }
            .padding(FlowdSpacing.xl)
            ConfettiView(trigger: burst, colors: FlowdConfettiPalette.money)
        }
    }
}

#Preview("Confetti") {
    ConfettiPreview()
}
