/**
 * Generated imagery from an ArtSeed (packages/contract/DOMAIN.md section 4): every avatar, thumbnail, app icon, cover and
 * crew badge is described by a handful of numbers and drawn here as SVG, so there are no remote images, no photos and no
 * licensing questions, and the same seed always gives the same picture.
 *
 * Rendering contract (kept in sync with the iOS Canvas renderer):
 *  1. Background: a 135 degree linear gradient through hsl(hue_a 72% 46%) at 0%, hsl(hue_b 70% 38%) at 55% and
 *     hsl(hue_c 62% 24%) at 100%.
 *  2. Shapes come from `mulberry32(seed)`, one stream per render, consumed in the fixed order documented per pattern below.
 *     Positions are fractions of the width / height, radii and strokes are fractions of the SHORT side.
 *  3. Patterns: orbs, waves, rings, grid, spark, stripes.
 *
 * Pure and server-safe (no React, no DOM). `ArtSeed` is structurally identical to the contract's `ArtSeed`, so contract
 * data is assignable without a cast; once `src/lib/contract/types.ts` is synced the type can be re-exported from there.
 */

export type ArtPattern = "orbs" | "waves" | "rings" | "grid" | "spark" | "stripes";

export interface ArtSeed {
  /** 0-360, top-left of the gradient. */
  hue_a: number;
  /** 0-360, mid stop. */
  hue_b: number;
  /** 0-360, accent for shapes and highlights. */
  hue_c: number;
  pattern: ArtPattern;
  /** Integer driving every random placement. */
  seed: number;
  /** Optional text on the art (a hook on a thumbnail, initials on an avatar, a glyph on an icon). 24 characters at most. */
  label?: string;
}

/** The standard aspect ratios of generated art. */
export type ArtAspect = "9:16" | "1:1" | "16:9" | "4:5";

const ASPECTS: Record<ArtAspect, readonly [number, number]> = {
  "9:16": [90, 160],
  "1:1": [100, 100],
  "16:9": [160, 90],
  "4:5": [100, 125],
};

export interface ArtBox {
  w: number;
  h: number;
  /** The short side: radii and stroke widths are fractions of it. */
  s: number;
}

export function artBox(aspect: ArtAspect): ArtBox {
  const [w, h] = ASPECTS[aspect];
  return { w, h, s: Math.min(w, h) };
}

/** Deterministic stream in [0, 1). The same algorithm runs on iOS, so the same seed draws the same picture. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, so a string (a handle, an id) can become a stable seed. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A complete ArtSeed from a name: harmonious hue triple, a pattern suited to `kind`, and the label. For previews and fallbacks; fixtures carry real seeds. */
export function artFromName(name: string, kind: "avatar" | "thumb" | "icon" | "cover" = "avatar", label?: string): ArtSeed {
  const seed = hashString(name);
  const rng = mulberry32(seed);
  // mulberry32's first outputs of nearby seeds are correlated: discard a few so similar names still spread across the hues
  rng();
  rng();
  rng();
  const hueA = Math.floor(rng() * 360);
  const hueB = (hueA + (rng() < 0.5 ? -1 : 1) * (25 + Math.floor(rng() * 45)) + 360) % 360;
  const hueC = (hueA + 150 + Math.floor(rng() * 60)) % 360;
  const patterns: Record<typeof kind, readonly ArtPattern[]> = {
    avatar: ["orbs", "rings"],
    thumb: ["orbs", "waves", "rings", "grid", "spark", "stripes"],
    icon: ["grid", "spark"],
    cover: ["orbs", "waves"],
  };
  const pool = patterns[kind];
  return { hue_a: hueA, hue_b: hueB, hue_c: hueC, pattern: pool[Math.floor(rng() * pool.length)] ?? "orbs", seed, label };
}

export function hsl(hue: number, saturation: number, lightness: number, alpha = 1): string {
  const h = ((Math.round(hue) % 360) + 360) % 360;
  return alpha >= 1 ? `hsl(${h} ${saturation}% ${lightness}%)` : `hsl(${h} ${saturation}% ${lightness}% / ${alpha})`;
}

export interface ArtStops {
  a: string;
  b: string;
  c: string;
}

/** The three gradient stops of the contract (72/46, 70/38, 62/24). */
export function artStops(art: ArtSeed): ArtStops {
  return { a: hsl(art.hue_a, 72, 46), b: hsl(art.hue_b, 70, 38), c: hsl(art.hue_c, 62, 24) };
}

/** Endpoints of a CSS-style 135 degree gradient across a w x h box (corner to corner along the 135 degree axis). */
export function gradientLine(w: number, h: number): { x1: number; y1: number; x2: number; y2: number } {
  const length = (w + h) * Math.SQRT1_2;
  const dx = Math.SQRT1_2 * (length / 2);
  return { x1: w / 2 - dx, y1: h / 2 - dx, x2: w / 2 + dx, y2: h / 2 + dx };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pattern shapes. Each generator consumes the stream in a fixed order and returns plain data; the component draws it.
// ---------------------------------------------------------------------------------------------------------------------

export type Tint = "accent" | "light" | "dark";

export interface OrbShape {
  kind: "orb";
  cx: number;
  cy: number;
  r: number;
  tint: Tint;
  opacity: number;
}
export interface WaveShape {
  kind: "wave";
  d: string;
  tint: Tint;
  opacity: number;
}
export interface ArcShape {
  kind: "arc";
  d: string;
  width: number;
  tint: Tint;
  opacity: number;
}
export interface DotShape {
  kind: "dot";
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}
export interface LineShape {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  tint: Tint;
  opacity: number;
}
export interface GlintShape {
  kind: "glint";
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}
export interface BandShape {
  kind: "band";
  /** Offset along the diagonal axis and thickness, in short-side units. */
  offset: number;
  thickness: number;
  tint: Tint;
  opacity: number;
}

export type ArtShape = OrbShape | WaveShape | ArcShape | DotShape | LineShape | GlintShape | BandShape;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function orbs(rng: () => number, { w, h, s }: ArtBox): ArtShape[] {
  const count = 5 + Math.floor(rng() * 3);
  const shapes: ArtShape[] = [];
  for (let index = 0; index < count; index += 1) {
    const cx = rng() * w;
    const cy = rng() * h;
    const r = s * (0.12 + rng() * 0.33);
    const opacity = 0.26 + rng() * 0.3;
    shapes.push({ kind: "orb", cx: round(cx), cy: round(cy), r: round(r), tint: index % 2 === 0 ? "accent" : "light", opacity: round(opacity) });
  }
  return shapes;
}

function waves(rng: () => number, { w, h, s }: ArtBox): ArtShape[] {
  const shapes: ArtShape[] = [];
  for (let layer = 0; layer < 4; layer += 1) {
    const baseline = h * (0.34 + layer * 0.15);
    const amplitude = s * (0.05 + rng() * 0.08);
    const frequency = ((1 + rng() * 1.5) * Math.PI * 2) / w;
    const phase = rng() * Math.PI * 2;
    let d = `M0 ${h}`;
    for (let x = 0; x <= w + 0.001; x += 3) {
      d += `L${round(x)} ${round(baseline + Math.sin(x * frequency + phase) * amplitude)}`;
    }
    d += `L${w} ${h}Z`;
    shapes.push({ kind: "wave", d, tint: layer % 2 === 0 ? "accent" : "light", opacity: round(0.36 - layer * 0.07) });
  }
  return shapes;
}

function rings(rng: () => number, { w, h, s }: ArtBox): ArtShape[] {
  const ox = w * (0.15 + rng() * 0.7);
  const oy = h * (0.15 + rng() * 0.7);
  const count = 6 + Math.floor(rng() * 4);
  const shapes: ArtShape[] = [];
  for (let index = 0; index < count; index += 1) {
    const radius = s * (0.12 + index * 0.1 + rng() * 0.03);
    const start = rng() * Math.PI * 2;
    const sweep = Math.PI * (0.8 + rng() * 0.8);
    const width = s * (0.02 + rng() * 0.015);
    const opacity = 0.15 + rng() * 0.3;
    const x1 = ox + Math.cos(start) * radius;
    const y1 = oy + Math.sin(start) * radius;
    const x2 = ox + Math.cos(start + sweep) * radius;
    const y2 = oy + Math.sin(start + sweep) * radius;
    shapes.push({ kind: "arc", d: `M${round(x1)} ${round(y1)}A${round(radius)} ${round(radius)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${round(x2)} ${round(y2)}`, width: round(width), tint: index % 2 === 0 ? "light" : "accent", opacity: round(opacity) });
  }
  return shapes;
}

function grid(rng: () => number, { w, h, s }: ArtBox): ArtShape[] {
  const rows = 9;
  const cols = 9;
  const horizon = h * 0.45;
  const shapes: ArtShape[] = [];
  const points: Array<{ x: number; y: number; t: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    const t = row / (rows - 1);
    const y = horizon + (h - horizon) * Math.pow(t, 1.6);
    for (let col = 0; col < cols; col += 1) {
      const x = w / 2 + (col - (cols - 1) / 2) * (w / (cols - 1)) * (0.35 + 1.1 * t);
      points.push({ x, y, t });
      shapes.push({ kind: "dot", cx: round(x), cy: round(y), r: round(s * (0.008 + 0.018 * t)), opacity: round(0.3 + 0.4 * t) });
    }
  }
  const glints = 2 + Math.floor(rng() * 3);
  for (let index = 0; index < glints; index += 1) {
    const point = points[Math.floor(rng() * points.length)];
    if (point) shapes.push({ kind: "glint", cx: round(point.x), cy: round(point.y), r: round(s * (0.05 + rng() * 0.04)), opacity: 0.85 });
  }
  return shapes;
}

function spark(rng: () => number, { w, h, s }: ArtBox): ArtShape[] {
  const ox = w * (0.2 + rng() * 0.6);
  const oy = h * (0.2 + rng() * 0.6);
  const lines = 22 + Math.floor(rng() * 13);
  const shapes: ArtShape[] = [];
  for (let index = 0; index < lines; index += 1) {
    const angle = rng() * Math.PI * 2;
    const length = s * (0.2 + rng() * 0.7);
    const inner = s * (0.04 + rng() * 0.06);
    shapes.push({
      kind: "line",
      x1: round(ox + Math.cos(angle) * inner),
      y1: round(oy + Math.sin(angle) * inner),
      x2: round(ox + Math.cos(angle) * length),
      y2: round(oy + Math.sin(angle) * length),
      width: round(s * (0.006 + rng() * 0.008)),
      tint: index % 3 === 0 ? "accent" : "light",
      opacity: round(0.15 + rng() * 0.35),
    });
  }
  const glints = 4 + Math.floor(rng() * 3);
  for (let index = 0; index < glints; index += 1) {
    shapes.push({ kind: "glint", cx: round(rng() * w), cy: round(rng() * h), r: round(s * (0.03 + rng() * 0.05)), opacity: round(0.5 + rng() * 0.4) });
  }
  return shapes;
}

function stripes(rng: () => number): ArtShape[] {
  const count = 6 + Math.floor(rng() * 4);
  const shapes: ArtShape[] = [];
  let offset = -0.9;
  for (let index = 0; index < count; index += 1) {
    const thickness = 0.05 + rng() * 0.17;
    offset += 0.12 + rng() * 0.22;
    shapes.push({ kind: "band", offset: round(offset), thickness: round(thickness), tint: index % 2 === 0 ? "light" : "accent", opacity: round(0.06 + rng() * 0.16) });
  }
  return shapes;
}

/** The shapes of an art seed in a box. Deterministic. */
export function artShapes(art: ArtSeed, box: ArtBox): ArtShape[] {
  const rng = mulberry32(art.seed);
  switch (art.pattern) {
    case "orbs":
      return orbs(rng, box);
    case "waves":
      return waves(rng, box);
    case "rings":
      return rings(rng, box);
    case "grid":
      return grid(rng, box);
    case "spark":
      return spark(rng, box);
    case "stripes":
      return stripes(rng);
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Legibility. A label drawn on art must clear AA; the art does not know where the label sits, so the component asks how
// much ink to lay under it.
// ---------------------------------------------------------------------------------------------------------------------

function channel(value: number): number {
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

/** sRGB channels (0 to 1) of an hsl() colour, s and l in percent. */
export function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number): number => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** WCAG relative luminance of sRGB channels (0 to 1). */
export function luminanceOf([r, g, b]: readonly [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Relative luminance (WCAG) of an hsl() colour, s and l in percent. */
export function hslLuminance(hue: number, saturation: number, lightness: number): number {
  return luminanceOf(hslToRgb(hue, saturation, lightness));
}

/**
 * Alpha of an ink scrim (near-black, composited in sRGB like CSS) that makes WHITE text clear `target` (default 4.8:1, a
 * little over AA) on the brightest region of the art: the first two gradient stops, where centred labels sit, assuming the
 * pattern lays up to 30% white highlights over them. 0 when the art is already dark enough.
 */
export function inkAlphaForWhiteText(art: ArtSeed, target = 4.8): number {
  const worst = [hslToRgb(art.hue_a, 72, 46), hslToRgb(art.hue_b, 70, 38)].map((rgb) => rgb.map((value) => value * 0.7 + 0.3) as [number, number, number]);
  const brightest = worst.reduce((best, rgb) => (luminanceOf(rgb) > luminanceOf(best) ? rgb : best), worst[0] as [number, number, number]);
  const contrastAt = (alpha: number): number => 1.05 / (luminanceOf(brightest.map((value) => value * (1 - alpha)) as [number, number, number]) + 0.05);
  if (contrastAt(0) >= target) return 0;
  let low = 0;
  let high = 0.85;
  for (let step = 0; step < 14; step += 1) {
    const mid = (low + high) / 2;
    if (contrastAt(mid) >= target) high = mid;
    else low = mid;
  }
  return Math.round(high * 100) / 100;
}
