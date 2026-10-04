/**
 * Liquid Glass refraction maps (Chromium only; see docs/research/liquid-glass.md Part B4).
 *
 * `backdrop-filter: url(#id)` makes the filter's SourceGraphic the backdrop. A displacement map bends it
 * (feDisplacementMap) and a baked specular PNG adds the lit rim. The lens model is a convex-squircle bezel
 * y = (1 - (1 - t)^4)^(1/4) with Snell's law (n = 1.5) giving the lateral shift per depth; shifts are written inward
 * into R/G (128 = neutral) so the rim magnifies like a thick glass edge. An approximation of the optics, not Apple's renderer.
 *
 * Maps are generated once per size on a 2D canvas (6-25 ms) and cached; never regenerate per frame and never animate the
 * displacement scale (slow distortion across a refracting surface is a nausea trigger).
 */

export interface RefractionOptions {
  width: number;
  height: number;
  /** Corner radius in CSS px (clamped to half the short side). */
  radius: number;
  /** Width of the refracting rim in px. */
  bezel?: number;
  /** Glass thickness in px. Larger = stronger bend. */
  thickness?: number;
  /** Index of refraction (glass is about 1.5). */
  ior?: number;
  /** Unit vector pointing TOWARD the light. Default: top-left. */
  light?: { x: number; y: number };
  /** Specular sharpness. */
  specPower?: number;
}

export interface RefractionMaps {
  /** PNG data URL. R/G = x/y sample offset, 128 = neutral. */
  displacement: string;
  /** PNG data URL. White with alpha = rim highlight. */
  specular: string;
  /** Value for feDisplacementMap `scale` (the map spans +-scale/2). */
  scale: number;
  width: number;
  height: number;
}

const PROFILE_SAMPLES = 127;

/** Convex squircle height profile. t = 0 at the rim, 1 in the flat interior. */
export function surfaceHeight(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return Math.pow(1 - Math.pow(u, 4), 0.25);
}

function buildProfile(bezel: number, thickness: number, ior: number): { profile: Float32Array; max: number } {
  const profile = new Float32Array(PROFILE_SAMPLES + 1);
  let max = 0;
  const eps = 1e-3;
  for (let i = 0; i <= PROFILE_SAMPLES; i += 1) {
    const t = i / PROFILE_SAMPLES;
    const y = surfaceHeight(t) * thickness;
    const t1 = Math.max(0, t - eps);
    const t2 = Math.min(1, t + eps);
    const slope = ((surfaceHeight(t2) - surfaceHeight(t1)) * thickness) / ((t2 - t1) * bezel); // px per px
    const incidence = Math.atan(Math.abs(slope)); // angle between the ray and the surface normal
    const refracted = Math.asin(Math.sin(incidence) / ior); // Snell: sin(a) = n * sin(b)
    const shift = y * Math.tan(incidence - refracted); // lateral shift on the background plane (px)
    profile[i] = shift;
    if (shift > max) max = shift;
  }
  return { profile, max };
}

interface Sdf {
  dist: number; // negative inside
  gx: number; // outward normal
  gy: number;
}

function roundRectSdf(px: number, py: number, cx: number, cy: number, hw: number, hh: number, r: number): Sdf {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy) || 1;
    return { dist, gx: (qx / len) * Math.sign(px - cx), gy: (qy / len) * Math.sign(py - cy) };
  }
  if (qx > qy) return { dist, gx: Math.sign(px - cx), gy: 0 };
  return { dist, gx: 0, gy: Math.sign(py - cy) };
}

function makeCanvas(width: number, height: number): { ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement } | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  return ctx ? { ctx, canvas } : null;
}

/** Build both maps. Returns null when a 2D canvas is unavailable (the caller keeps plain CSS glass). */
export function buildRefractionMaps(options: RefractionOptions): RefractionMaps | null {
  const { bezel = 28, thickness = 22, ior = 1.5, light = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }, specPower = 3.5 } = options;
  const w = Math.max(1, Math.round(options.width));
  const h = Math.max(1, Math.round(options.height));
  const disp = makeCanvas(w, h);
  const spec = makeCanvas(w, h);
  if (!disp || !spec) return null;

  const { profile, max } = buildProfile(bezel, thickness, ior);
  const dData = disp.ctx.createImageData(w, h);
  const sData = spec.ctx.createImageData(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(options.radius, cx, cy);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const { dist, gx, gy } = roundRectSdf(x + 0.5, y + 0.5, cx, cy, cx, cy, r);
      const depth = -dist;
      let red = 128;
      let green = 128;
      let rim = 0;
      if (depth > 0 && depth < bezel) {
        const k = (depth / bezel) * PROFILE_SAMPLES;
        const k0 = Math.floor(k);
        const f = k - k0;
        const d = (profile[k0] ?? 0) * (1 - f) + (profile[Math.min(PROFILE_SAMPLES, k0 + 1)] ?? 0) * f;
        const m = max > 0 ? d / max : 0;
        red = 128 - gx * m * 127; // sample from the INSIDE of the shape: a magnifier-like lens
        green = 128 - gy * m * 127;
        const dot = gx * light.x + gy * light.y;
        const lit = Math.max(0, dot) + 0.45 * Math.max(0, -dot); // key light + a dimmer bounce on the far side
        rim = Math.min(1, Math.pow(lit, specPower) * Math.pow(1 - depth / bezel, 3) * 1.6);
      }
      dData.data[i] = red;
      dData.data[i + 1] = green;
      dData.data[i + 2] = 128;
      dData.data[i + 3] = 255;
      sData.data[i] = 255;
      sData.data[i + 1] = 255;
      sData.data[i + 2] = 255;
      sData.data[i + 3] = Math.round(rim * 255);
    }
  }
  disp.ctx.putImageData(dData, 0, 0);
  spec.ctx.putImageData(sData, 0, 0);
  return {
    displacement: disp.canvas.toDataURL("image/png"),
    specular: spec.canvas.toDataURL("image/png"),
    scale: max * 2,
    width: w,
    height: h,
  };
}

// ---- cache (small LRU-ish) ------------------------------------------------------------------------------------
const cache = new Map<string, RefractionMaps>();

export function getRefractionMaps(options: RefractionOptions): RefractionMaps | null {
  const key = [
    Math.round(options.width),
    Math.round(options.height),
    Math.round(options.radius),
    options.bezel ?? 28,
    options.thickness ?? 22,
    options.ior ?? 1.5,
  ].join("x");
  const hit = cache.get(key);
  if (hit) return hit;
  const built = buildRefractionMaps(options);
  if (!built) return null;
  if (cache.size >= 24) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, built);
  return built;
}

// ---- capability gate -------------------------------------------------------------------------------------------
interface UserAgentDataLike {
  brands?: ReadonlyArray<{ brand: string; version: string }>;
}

/**
 * True only in Chromium engines (Chrome, Edge, Brave, Opera, Electron). Safari and Firefox parse
 * `backdrop-filter: url(#id)` but do not render it (WebKit bug 245510, Firefox bug 1961378) and `@supports` cannot tell
 * the difference, so gate on the engine. `navigator.userAgentData` exists only in Chromium.
 */
export function supportsSvgBackdropFilter(): boolean {
  if (typeof window === "undefined" || typeof CSS === "undefined") return false;
  const uad = (navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData;
  const isChromium = uad?.brands?.some((brand) => brand.brand === "Chromium") === true;
  return isChromium && CSS.supports("backdrop-filter", "url(#flowd-probe)");
}
