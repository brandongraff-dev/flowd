// Zero-dependency colour maths for the flowd token pipeline.
// sRGB <-> OKLab/OKLCH, WCAG 2.x contrast, alpha compositing and the CSS `saturate()` matrix.
// Colours are plain objects { r, g, b, a } with r/g/b in 0..255 (floats allowed) and a in 0..1.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Parse '#rgb', '#rrggbb', '#rrggbbaa', 'rgb(...)', 'rgba(...)' or { r,g,b,a }. */
export function parseColor(input) {
  if (typeof input !== 'string') return { r: input.r, g: input.g, b: input.b, a: input.a ?? 1 };
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) throw new Error(`Bad hex colour: ${input}`);
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) throw new Error(`Bad rgb colour: ${input}`);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }
  throw new Error(`Unsupported colour: ${input}`);
}

const hex2 = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
export const toHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
export const toHexA = (c) => (c.a >= 1 ? toHex(c) : `${toHex(c)}${hex2(c.a * 255)}`.toUpperCase());
export const toRgbaString = ({ r, g, b, a }) => {
  const n = (v) => Math.round(clamp(v, 0, 255));
  return a >= 1 ? `rgb(${n(r)} ${n(g)} ${n(b)})` : `rgba(${n(r)}, ${n(g)}, ${n(b)}, ${Math.round(a * 1000) / 1000})`;
};

const toLin = (c8) => { const c = c8 / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = (c) => { const v = clamp(c, 0, 1); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055); };

/** WCAG relative luminance of an OPAQUE colour. */
export const luminance = (c) => 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);

/** WCAG contrast ratio between two opaque colours. */
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Source-over composite of `top` (with alpha) on `bottom` (alpha respected, result may be translucent). */
export function over(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t, bt) => (t * top.a + bt * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

/** CSS Filter Effects `saturate(s)` applied in sRGB (gamma) space. s=1 identity. */
export function saturate(c, s) {
  const m = [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
  return {
    r: clamp(m[0] * c.r + m[1] * c.g + m[2] * c.b, 0, 255),
    g: clamp(m[3] * c.r + m[4] * c.g + m[5] * c.b, 0, 255),
    b: clamp(m[6] * c.r + m[7] * c.g + m[8] * c.b, 0, 255),
    a: c.a,
  };
}

// ---- OKLab / OKLCH -------------------------------------------------------------------------
export function toOklab(c) {
  const r = toLin(c.r), g = toLin(c.g), b = toLin(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}
export function toOklch(c) {
  const { L, a, b } = toOklab(c);
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}
/** OKLCH -> linear sRGB triple (unclamped). */
function oklchToLin(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (lin) => lin.every((v) => v >= -0.0005 && v <= 1.0005);
/** OKLCH -> sRGB colour, reducing chroma until it fits the sRGB gamut (hue and lightness held). */
export function fromOklch(L, C, h, a = 1) {
  let c = C;
  let lin = oklchToLin(L, c, h);
  if (!inGamut(lin)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 30; i++) {
      c = (lo + hi) / 2;
      if (inGamut(oklchToLin(L, c, h))) lo = c; else hi = c;
    }
    c = lo;
    lin = oklchToLin(L, c, h);
  }
  return { r: fromLin(lin[0]), g: fromLin(lin[1]), b: fromLin(lin[2]), a };
}
/** Largest in-gamut chroma for (L, h). */
export function maxChroma(L, h) {
  let lo = 0, hi = 0.45;
  for (let i = 0; i < 30; i++) {
    const c = (lo + hi) / 2;
    if (inGamut(oklchToLin(L, c, h))) lo = c; else hi = c;
  }
  return lo;
}

/** OKLab distance x100 (the dataviz skill's Delta E). */
export function deltaE(a, b) {
  const p = toOklab(a), q = toOklab(b);
  return 100 * Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}
