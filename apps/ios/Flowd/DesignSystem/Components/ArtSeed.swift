import SwiftUI

// ArtSeed: the tiny Codable description of generated artwork (bounty hero art, video thumbnails, brand glyph backdrops).
// Nothing is photographed or downloaded: `ThumbArt` renders a seed with gradients and Canvas shapes, so the same seed draws the
// same picture on every launch. Decoding is deliberately tolerant so the fixtures can carry it in three shapes:
//
//     "art_seed": { "seed": 1842, "palette": "flow", "motif": "orbs", "title": "Sleep better tonight", "caption": "Lumen Sleep", "glyph": "moon.stars.fill" }
//     "art_seed": "bnty_lumen_hook_a"        // a key string: palette, motif and seed are derived from it
//     "art_seed": 1842                       // an integer: derived the same way
//
// Unknown palette or motif strings fall back to `flow` / `orbs`; every field except the seed is optional.

/// Colour family. Each maps to a brand gradient family (BRAND.md 6.7). All of them are dark enough at the bottom for white text on the media scrim.
enum ArtPalette: String, Codable, CaseIterable, Hashable, Sendable {
    case flow
    case money
    case ember
    case sun
    case flo
    case lagoon
    case rose
    case night

    var colors: [Color] {
        switch self {
        case .flow: return [FlowdPrimitive.ultraviolet500, FlowdPrimitive.azure500, FlowdPrimitive.lagoon500]
        case .money: return [FlowdPrimitive.mint400, FlowdPrimitive.lagoon400, FlowdPrimitive.azure500]
        case .ember: return [FlowdPrimitive.sun500, FlowdPrimitive.ember500, FlowdPrimitive.rose500]
        case .sun: return [FlowdPrimitive.sun300, FlowdPrimitive.sun500, FlowdPrimitive.ember500]
        case .flo: return [FlowdPrimitive.ultraviolet400, FlowdPrimitive.ultraviolet600, FlowdPrimitive.azure700]
        case .lagoon: return [FlowdPrimitive.azure700, FlowdPrimitive.lagoon600, FlowdPrimitive.mint500]
        case .rose: return [FlowdPrimitive.rose400, FlowdPrimitive.rose600, FlowdPrimitive.ultraviolet600]
        case .night: return [FlowdPrimitive.abyss700, FlowdPrimitive.ultraviolet700, FlowdPrimitive.azure800]
        }
    }
}

/// The generated shape language drawn over the gradient.
enum ArtMotif: String, Codable, CaseIterable, Hashable, Sendable {
    case orbs
    case rings
    case ribbon
    case grid
    case burst
    case waves
    case stripes
}

struct ArtSeed: Codable, Hashable, Sendable {
    /// Drives every random choice in the motif. Same seed, same picture.
    var seed: Int
    var palette: ArtPalette
    var motif: ArtMotif
    /// Big type on the thumbnail: two or three words.
    var title: String?
    /// The caption chip at the bottom-left (usually the app or brand name).
    var caption: String?
    /// SF Symbol for the tiny generic app glyph at the top-left.
    var glyph: String?
    /// Gradient angle in degrees (CSS convention, 135 = to bottom-right). Default 135.
    var angle: Double?

    init(
        seed: Int = 1,
        palette: ArtPalette = .flow,
        motif: ArtMotif = .orbs,
        title: String? = nil,
        caption: String? = nil,
        glyph: String? = nil,
        angle: Double? = nil
    ) {
        self.seed = seed
        self.palette = palette
        self.motif = motif
        self.title = title
        self.caption = caption
        self.glyph = glyph
        self.angle = angle
    }

    /// Derives palette, motif and seed from a stable key (an id such as `"bnty_lumen_hook_a"`).
    init(key: String, title: String? = nil, caption: String? = nil, glyph: String? = nil) {
        let derived: ArtSeed = ArtSeed.derived(from: key)
        self.seed = derived.seed
        self.palette = derived.palette
        self.motif = derived.motif
        self.title = title
        self.caption = caption
        self.glyph = glyph
        self.angle = nil
    }

    private enum CodingKeys: String, CodingKey {
        case seed
        case palette
        case motif
        case title
        case caption
        case glyph
        case angle
    }

    init(from decoder: Decoder) throws {
        var seedValue: Int = 1
        var paletteValue: ArtPalette = ArtPalette.flow
        var motifValue: ArtMotif = ArtMotif.orbs
        var titleValue: String? = nil
        var captionValue: String? = nil
        var glyphValue: String? = nil
        var angleValue: Double? = nil

        if let single = try? decoder.singleValueContainer(), let text = try? single.decode(String.self) {
            let derived: ArtSeed = ArtSeed.derived(from: text)
            seedValue = derived.seed
            paletteValue = derived.palette
            motifValue = derived.motif
        } else if let single = try? decoder.singleValueContainer(), let number = try? single.decode(Int.self) {
            let derived: ArtSeed = ArtSeed.derived(from: String(number))
            seedValue = number
            paletteValue = derived.palette
            motifValue = derived.motif
        } else {
            let container: KeyedDecodingContainer<CodingKeys> = try decoder.container(keyedBy: CodingKeys.self)
            if let number = try? container.decode(Int.self, forKey: .seed) {
                seedValue = number
            }
            if let raw = try? container.decode(String.self, forKey: .palette) {
                paletteValue = ArtPalette(rawValue: raw) ?? ArtPalette.flow
            }
            if let raw = try? container.decode(String.self, forKey: .motif) {
                motifValue = ArtMotif(rawValue: raw) ?? ArtMotif.orbs
            }
            titleValue = try? container.decode(String.self, forKey: .title)
            captionValue = try? container.decode(String.self, forKey: .caption)
            glyphValue = try? container.decode(String.self, forKey: .glyph)
            angleValue = try? container.decode(Double.self, forKey: .angle)
        }

        self.seed = seedValue
        self.palette = paletteValue
        self.motif = motifValue
        self.title = titleValue
        self.caption = captionValue
        self.glyph = glyphValue
        self.angle = angleValue
    }

    /// Palette, motif and seed derived from a stable key.
    static func derived(from key: String) -> ArtSeed {
        let hash: UInt32 = FlowdAvatarMath.stableHash(key)
        let palettes: [ArtPalette] = ArtPalette.allCases
        let motifs: [ArtMotif] = ArtMotif.allCases
        let palette: ArtPalette = palettes[Int(hash % UInt32(palettes.count))]
        let motif: ArtMotif = motifs[Int((hash / 8) % UInt32(motifs.count))]
        return ArtSeed(seed: Int(hash), palette: palette, motif: motif)
    }
}

// MARK: - Sample seeds (fictional apps, for previews and the gallery)

extension ArtSeed {
    static let samples: [ArtSeed] = [
        ArtSeed(seed: 1842, palette: .flow, motif: .orbs, title: "Sleep better tonight", caption: "Lumen Sleep", glyph: "moon.stars.fill"),
        ArtSeed(seed: 77, palette: .money, motif: .rings, title: "Five minutes a day", caption: "Fernlingo", glyph: "leaf.fill"),
        ArtSeed(seed: 903, palette: .ember, motif: .burst, title: "Bake it fresh", caption: "Loafly", glyph: "flame.fill"),
        ArtSeed(seed: 2210, palette: .night, motif: .grid, title: "Nap like a pro", caption: "Nap Nest", glyph: "bed.double.fill"),
        ArtSeed(seed: 415, palette: .rose, motif: .waves, title: "Budget in 3 taps", caption: "Pennywise", glyph: "creditcard.fill"),
        ArtSeed(seed: 5, palette: .lagoon, motif: .ribbon, title: "Run farther", caption: "Stride", glyph: "figure.run"),
        ArtSeed(seed: 61, palette: .flo, motif: .stripes, title: "Ask Flo", caption: "flowd", glyph: "sparkles"),
        ArtSeed(seed: 1300, palette: .sun, motif: .orbs, title: "Focus mode on", caption: "Tempo", glyph: "timer")
    ]
}

// MARK: - Preview

private struct ArtSeedPreview: View {
    /// The three shapes a fixture may carry, decoded with the same tolerant decoder the app uses.
    private let objectJSON: String = "{\"seed\": 1842, \"palette\": \"flow\", \"motif\": \"orbs\", \"title\": \"Sleep better tonight\", \"caption\": \"Lumen Sleep\", \"glyph\": \"moon.stars.fill\"}"
    private let keyJSON: String = "\"bnty_lumen_hook_a\""
    private let numberJSON: String = "1842"

    var body: some View {
        FlowdPreviewCanvas {
            VStack(alignment: .leading, spacing: FlowdSpacing.md) {
                Text("Decoded from fixtures").flowdDisplay(.title2).flowdInk(.primary)
                HStack(spacing: FlowdSpacing.sm) {
                    ThumbArt(decode(objectJSON)).frame(width: 110)
                    ThumbArt(decode(keyJSON)).frame(width: 110)
                    ThumbArt(decode(numberJSON)).frame(width: 110)
                }
                Text("An object, a key string and an integer all decode.")
                    .flowdCaption(.footnote)
                    .flowdInk(.muted)
            }
            .padding(FlowdSpacing.lg)
        }
    }

    private func decode(_ json: String) -> ArtSeed {
        let data: Data = Data(json.utf8)
        if let seed = try? JSONDecoder().decode(ArtSeed.self, from: data) {
            return seed
        }
        return ArtSeed()
    }
}

#Preview("Art seeds") {
    ArtSeedPreview()
}
