// How the primitive ramps in tokens.json were derived (OKLCH, constant hue, chroma scaled to each hue's own sRGB gamut).
//   node scripts/derive-ramps.mjs           print the ramps as JSON
//   node scripts/derive-ramps.mjs --check   fail if tokens.json no longer matches this derivation
// Change a hue, an anchor lightness or a chroma profile here, run it, paste the output into tokens.json, then `npm run build`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fromOklch, maxChroma, toHex } from '../lib/color.mjs';
import { PKG_DIR } from '../lib/tokens.mjs';

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
// How far each step sits between the anchor (500) and the extremes (L 0.975 light end, 0.24 dark end)
const UP = { 50: 1, 100: 0.93, 200: 0.78, 300: 0.58, 400: 0.3, 500: 0 };
const DOWN = { 600: 0.22, 700: 0.42, 800: 0.62, 900: 0.8, 950: 1 };
// Chroma as a proportion of the hue's own maximum at that lightness (peaks mid-ramp, falls off at both ends)
const CHROMA = { 50: 0.3, 100: 0.44, 200: 0.62, 300: 0.8, 400: 0.93, 500: 0.98, 600: 0.95, 700: 0.9, 800: 0.84, 900: 0.78, 950: 0.7 };
// hue (OKLCH degrees) and the lightness of the signature 500 step
const HUES = {
  ultraviolet: { h: 287, L: 0.575 },
  azure: { h: 260, L: 0.615 },
  lagoon: { h: 208, L: 0.79 },
  mint: { h: 162, L: 0.8 },
  ember: { h: 42, L: 0.725 },
  sun: { h: 88, L: 0.84 },
  rose: { h: 14, L: 0.68 },
};
// Abyss: ink-navy neutral at hue 266, lightness table, chroma tinted blue and nearly gone at the light end
const ABYSS_L = { 50: 0.975, 100: 0.955, 200: 0.915, 300: 0.85, 400: 0.73, 500: 0.6, 600: 0.48, 700: 0.385, 800: 0.3, 850: 0.26, 900: 0.225, 925: 0.205, 950: 0.185, 975: 0.15, 1000: 0.12 };
const abyssChroma = (L) => (L > 0.94 ? 0.012 : L > 0.9 ? 0.016 : L > 0.8 ? 0.03 : L > 0.55 ? 0.042 : L > 0.4 ? 0.05 : 0.052);

export function derive() {
  const out = { abyss: {} };
  for (const [step, L] of Object.entries(ABYSS_L)) out.abyss[step] = toHex(fromOklch(L, Math.min(abyssChroma(L), maxChroma(L, 266) * 0.95), 266));
  for (const [name, { h, L: L500 }] of Object.entries(HUES)) {
    out[name] = {};
    for (const s of STEPS) {
      const L = s < 500 ? L500 + (0.975 - L500) * UP[s] : s === 500 ? L500 : L500 - (L500 - 0.24) * DOWN[s];
      out[name][s] = toHex(fromOklch(L, maxChroma(L, h) * CHROMA[s], h));
    }
  }
  return out;
}

const derived = derive();
if (process.argv.includes('--check')) {
  const file = JSON.parse(readFileSync(path.join(PKG_DIR, 'tokens.json'), 'utf8')).color.primitive;
  const bad = [];
  for (const [ramp, steps] of Object.entries(derived)) for (const [s, hex] of Object.entries(steps)) if (file[ramp]?.[s] !== hex) bad.push(`${ramp}.${s}: tokens.json ${file[ramp]?.[s]} vs derived ${hex}`);
  if (bad.length) { console.error(`tokens.json primitives drifted from the derivation:\n - ${bad.join('\n - ')}`); process.exit(1); }
  console.log('primitives match the derivation');
} else {
  console.log(JSON.stringify(derived, null, 2));
}
