import SwiftUI

// Generated avatars (BRAND.md 5.6): a gradient disc seeded by the handle, two initials in rounded heavy type at 42 percent of the
// diameter, a 1.5 pt inner rim. Brands and apps get a rounded-square glyph. Never stock, never a real logo. The same seed always
// produces the same avatar on every launch and every device (no `hashValue`, which is randomised per process).

enum AvatarShape: CaseIterable, Hashable, Sendable {
    case circle
    /// Brands and apps: corner radius 27 percent of the side.
    case roundedSquare
}

/// Initials and seeded colour helpers.
enum FlowdAvatarMath {
    /// Stable 32-bit hash (djb2). Never use `hashValue` for anything that must survive a relaunch.
    static func stableHash(_ text: String) -> UInt32 {
        var hash: UInt32 = 5381
        for scalar in text.unicodeScalars {
            hash = (hash &* 33) &+ scalar.value
        }
        return hash
    }

    /// `"Maya Kim"` becomes `MK`, `"@maya.k"` becomes `MK`, `"nap nest"` becomes `NN`, `"loafly"` becomes `LO`.
    static func initials(from text: String) -> String {
        var words: [String] = []
        var current: String = ""
        for character in text {
            if character.isLetter || character.isNumber {
                current.append(character)
            } else if !current.isEmpty {
                words.append(current)
                current = ""
            }
        }
        if !current.isEmpty {
            words.append(current)
        }
        if words.isEmpty {
            return "?"
        }
        if words.count == 1 {
            return String(words[0].prefix(2)).uppercased()
        }
        let first: String = String(words[0].prefix(1))
        let second: String = String(words[1].prefix(1))
        return (first + second).uppercased()
    }

    /// The eight gradient pairs (Flow, Money, Ember, Sun, Flo families). `inkInitials` is true when the pair is light and the initials must be ink.
    static func palette(for seed: String) -> (colors: [Color], inkInitials: Bool) {
        let index: Int = Int(stableHash(seed) % 8)
        switch index {
        case 0: return ([FlowdPrimitive.ultraviolet600, FlowdPrimitive.azure600], false)
        case 1: return ([FlowdPrimitive.azure700, FlowdPrimitive.lagoon700], false)
        case 2: return ([FlowdPrimitive.mint400, FlowdPrimitive.lagoon400], true)
        case 3: return ([FlowdPrimitive.ember500, FlowdPrimitive.rose500], true)
        case 4: return ([FlowdPrimitive.sun400, FlowdPrimitive.ember500], true)
        case 5: return ([FlowdPrimitive.ultraviolet600, FlowdPrimitive.ultraviolet500], false)
        case 6: return ([FlowdPrimitive.rose600, FlowdPrimitive.ultraviolet600], false)
        default: return ([FlowdPrimitive.lagoon800, FlowdPrimitive.azure600], false)
        }
    }
}

/// A generated avatar.
///
///     AvatarView(seed: "cr_maya", name: "Maya Kim", size: 44)                       // creator
///     AvatarView(seed: "cr_maya", name: "Maya Kim", size: 56, tier: .gold)          // with a tier chip medallion
///     AvatarView(seed: "app_napnest", name: "Nap Nest", size: 40, shape: .roundedSquare)   // brand / app glyph
struct AvatarView: View {
    let seed: String
    let name: String?
    let size: CGFloat
    let shape: AvatarShape
    let tier: FlowdTierLevel?

    init(
        seed: String,
        name: String? = nil,
        size: CGFloat = 40,
        shape: AvatarShape = .circle,
        tier: FlowdTierLevel? = nil
    ) {
        self.seed = seed
        self.name = name
        self.size = size
        self.shape = shape
        self.tier = tier
    }

    var body: some View {
        let palette: (colors: [Color], inkInitials: Bool) = FlowdAvatarMath.palette(for: seed)
        let label: String = name ?? seed
        return ZStack {
            disc(colors: palette.colors)
            Text(FlowdAvatarMath.initials(from: label))
                .font(.system(size: size * 0.42, weight: .heavy, design: .rounded))
                .foregroundStyle(palette.inkInitials ? FlowdPrimitive.abyss975 : FlowdPrimitive.white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
        }
        .frame(width: size, height: size)
        .overlay(alignment: .bottomTrailing) {
            if let tier = tier, size >= 32 {
                TierMedallion(level: tier, diameter: max(18, size * 0.38))
                    .offset(x: size * 0.06, y: size * 0.06)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText(label))
    }

    @ViewBuilder
    private func disc(colors: [Color]) -> some View {
        let gradient: LinearGradient = LinearGradient(
            colors: colors,
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        let rim: LinearGradient = LinearGradient(
            colors: [FlowdPrimitive.white.opacity(0.4), FlowdPrimitive.white.opacity(0.04)],
            startPoint: .top,
            endPoint: .bottom
        )
        switch shape {
        case .circle:
            Circle()
                .fill(gradient)
                .overlay { Circle().strokeBorder(rim, lineWidth: 1.5) }
        case .roundedSquare:
            RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
                .fill(gradient)
                .overlay {
                    RoundedRectangle(cornerRadius: size * 0.27, style: .continuous).strokeBorder(rim, lineWidth: 1.5)
                }
        }
    }

    private func accessibilityText(_ label: String) -> String {
        if let tier = tier {
            return label + ", " + tier.title + " tier"
        }
        return label
    }
}

// MARK: - Preview

#Preview("Avatars") {
    FlowdPreviewCanvas {
        VStack(alignment: .leading, spacing: FlowdSpacing.lg) {
            HStack(spacing: FlowdSpacing.md) {
                ForEach(["cr_maya", "cr_tej", "cr_luna", "cr_ibo", "cr_noor", "cr_sol", "cr_kai", "cr_ren"], id: \.self) { (seed: String) in
                    AvatarView(seed: seed, name: seed.replacingOccurrences(of: "cr_", with: "").capitalized + " Lee", size: 36)
                }
            }
            HStack(spacing: FlowdSpacing.md) {
                AvatarView(seed: "cr_maya", name: "Maya Kim", size: 64, tier: .gold)
                AvatarView(seed: "cr_luna", name: "Luna Park", size: 64, tier: .elite)
                AvatarView(seed: "app_napnest", name: "Nap Nest", size: 48, shape: .roundedSquare)
                AvatarView(seed: "app_fernlingo", name: "Fernlingo", size: 48, shape: .roundedSquare)
            }
        }
        .padding(FlowdSpacing.lg)
    }
}
