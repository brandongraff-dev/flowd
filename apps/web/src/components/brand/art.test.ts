import { describe, expect, it } from "vitest";
import { artBox, artFromName, artShapes, artStops, gradientLine, hashString, hslLuminance, hslToRgb, inkAlphaForWhiteText, luminanceOf, mulberry32, type ArtPattern, type ArtSeed } from "./art";
import { TIER_CHEVRONS, TIER_ORDER, TIER_STOPS } from "./tier-art";

const PATTERNS: readonly ArtPattern[] = ["orbs", "waves", "rings", "grid", "spark", "stripes"];

function seed(pattern: ArtPattern, value = 48121): ArtSeed {
  return { hue_a: 262, hue_b: 214, hue_c: 38, pattern, seed: value, label: "I was wrong about editing apps" };
}

describe("mulberry32", () => {
  it("is the standard stream (pinned so web and iOS render the same picture)", () => {
    const next = mulberry32(48121);
    expect(next()).toBeCloseTo(0.5158550182823092, 12);
    expect(next()).toBeCloseTo(0.8393056883942336, 12);
    expect(next()).toBeCloseTo(0.4390860921703279, 12);
    expect(mulberry32(1)()).toBeCloseTo(0.6270739405881613, 12);
  });

  it("stays in [0, 1)", () => {
    const next = mulberry32(7);
    for (let index = 0; index < 500; index += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("generated art", () => {
  it("draws the same shapes for the same seed, and different ones for another seed", () => {
    const box = artBox("9:16");
    for (const pattern of PATTERNS) {
      expect(artShapes(seed(pattern), box)).toEqual(artShapes(seed(pattern), box));
      expect(artShapes(seed(pattern), box)).not.toEqual(artShapes(seed(pattern, 99), box));
    }
  });

  it("gives every pattern real content within the documented counts", () => {
    const box = artBox("1:1");
    const count = (pattern: ArtPattern) => artShapes(seed(pattern), box).length;
    expect(count("orbs")).toBeGreaterThanOrEqual(5);
    expect(count("orbs")).toBeLessThanOrEqual(7);
    expect(count("waves")).toBe(4);
    expect(count("rings")).toBeGreaterThanOrEqual(6);
    expect(count("grid")).toBeGreaterThanOrEqual(83);
    expect(count("spark")).toBeGreaterThanOrEqual(26);
    expect(count("stripes")).toBeGreaterThanOrEqual(6);
  });

  it("keeps orbs inside the radius range of the art contract (12 to 45 percent of the short side)", () => {
    const box = artBox("9:16");
    for (const shape of artShapes(seed("orbs"), box)) {
      if (shape.kind !== "orb") continue;
      expect(shape.r).toBeGreaterThanOrEqual(box.s * 0.12 - 0.01);
      expect(shape.r).toBeLessThanOrEqual(box.s * 0.45 + 0.01);
    }
  });

  it("builds the three-stop gradient from the hues", () => {
    const stops = artStops(seed("orbs"));
    expect(stops.a).toBe("hsl(262 72% 46%)");
    expect(stops.b).toBe("hsl(214 70% 38%)");
    expect(stops.c).toBe("hsl(38 62% 24%)");
  });

  it("runs the 135 degree gradient corner to corner across any box", () => {
    const square = gradientLine(100, 100);
    expect(square.x1).toBeCloseTo(0, 5);
    expect(square.y1).toBeCloseTo(0, 5);
    expect(square.x2).toBeCloseTo(100, 5);
    expect(square.y2).toBeCloseTo(100, 5);
    const tall = gradientLine(90, 160);
    expect(tall.x2 - tall.x1).toBeCloseTo(tall.y2 - tall.y1, 5);
  });

  it("derives a complete, stable seed from a name, with hues that spread", () => {
    expect(artFromName("@maya.makes", "avatar", "MK")).toEqual(artFromName("@maya.makes", "avatar", "MK"));
    const names = ["@maya.makes", "@tej_r", "@luna.loops", "@devon.tries", "@sasha.snaps", "@omar.builds", "@iris.in.focus", "@jules.daily", "Nap Nest", "Fernlingo", "Loafly", "Kettle Daily"];
    const buckets = new Set(names.map((name) => Math.floor(artFromName(name).hue_a / 45)));
    expect(buckets.size).toBeGreaterThanOrEqual(5);
    expect(["orbs", "rings"]).toContain(artFromName("anyone", "avatar").pattern);
    expect(["grid", "spark"]).toContain(artFromName("anyapp", "icon").pattern);
  });

  it("hashes strings stably", () => {
    expect(hashString("flowd")).toBe(hashString("flowd"));
    expect(hashString("flowd")).not.toBe(hashString("flowD"));
  });
});

describe("legibility of white text on generated art", () => {
  /** Contrast of white over the art's brightest label region after an ink scrim of `alpha`, under the worst-case 30% highlight. */
  function contrastWithScrim(art: ArtSeed, alpha: number): number {
    const candidates = [hslToRgb(art.hue_a, 72, 46), hslToRgb(art.hue_b, 70, 38)].map((rgb) => rgb.map((value) => (value * 0.7 + 0.3) * (1 - alpha)) as [number, number, number]);
    const brightest = Math.max(...candidates.map((rgb) => luminanceOf(rgb)));
    return 1.05 / (brightest + 0.05);
  }

  it("clears AA (4.5:1) for white text on every hue once the computed scrim is applied", () => {
    for (let hue = 0; hue < 360; hue += 6) {
      for (const offset of [-40, 30]) {
        const art: ArtSeed = { hue_a: hue, hue_b: (hue + offset + 360) % 360, hue_c: (hue + 180) % 360, pattern: "orbs", seed: hue };
        const alpha = inkAlphaForWhiteText(art);
        expect(alpha).toBeLessThanOrEqual(0.85);
        expect(contrastWithScrim(art, alpha)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("needs no scrim on dark art and a heavy one on yellow-green", () => {
    expect(inkAlphaForWhiteText({ hue_a: 250, hue_b: 240, hue_c: 60, pattern: "orbs", seed: 1 })).toBeLessThan(0.2);
    expect(inkAlphaForWhiteText({ hue_a: 90, hue_b: 70, hue_c: 270, pattern: "orbs", seed: 1 })).toBeGreaterThan(0.3);
  });

  it("computes WCAG luminance", () => {
    expect(hslLuminance(0, 0, 100)).toBeCloseTo(1, 5);
    expect(hslLuminance(0, 0, 0)).toBeCloseTo(0, 5);
  });
});

describe("tier art", () => {
  it("covers all five tiers with rank readable from the chevron count", () => {
    expect(TIER_ORDER).toEqual(["bronze", "silver", "gold", "platinum", "elite"]);
    expect(TIER_ORDER.map((tier) => TIER_CHEVRONS[tier])).toEqual([1, 2, 3, 4, 4]);
    for (const tier of TIER_ORDER) {
      const stops = TIER_STOPS[tier];
      expect(stops[0]?.[0]).toBe(0);
      expect(stops[stops.length - 1]?.[0]).toBe(1);
    }
  });
});
