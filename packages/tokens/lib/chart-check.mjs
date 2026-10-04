// Categorical / ordinal chart palette checks. A zero-dependency port of the dataviz skill's validate_palette.js
// (same thresholds, same Machado-Oliveira-Fernandes 2009 CVD model at severity 1.0, same OKLab x100 Delta E), so the
// token build can fail on a palette that would not pass the skill's own validator.
import { parseColor, toOklch, deltaE, contrast } from './color.mjs';

const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] }; // OKLCH L
const CHROMA_FLOOR = 0.10;
const CVD_TARGET = 8.0, CVD_FLOOR = 6.0, NORMAL_FLOOR = 15.0, CONTRAST_MIN = 3.0;
const ORDINAL_MIN_DL = 0.06, ORDINAL_LIGHT_FLOOR = 2.0;

const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const toLin = (c8) => { const c = c8 / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = (c) => { const v = Math.max(0, Math.min(1, c)); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055); };

function simulate(hex, kind) {
  const c = parseColor(hex);
  const v = [toLin(c.r), toLin(c.g), toLin(c.b)];
  const M = MACHADO[kind];
  const o = M.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  return { r: fromLin(o[0]), g: fromLin(o[1]), b: fromLin(o[2]), a: 1 };
}
const dE = (a, b, kind) => (kind ? deltaE(simulate(a, kind), simulate(b, kind)) : deltaE(parseColor(a), parseColor(b)));

/** Categorical palette. pairs: 'adjacent' (bars/lines/stacks) or 'all' (scatter/bubble/map/small multiples). */
export function validateCategorical(palette, { mode, surface, pairs = 'adjacent' }) {
  const [lo, hi] = BAND[mode];
  const n = palette.length;
  const list = pairs === 'all'
    ? Array.from({ length: n }, (_, i) => Array.from({ length: n - i - 1 }, (_, k) => [i, i + 1 + k])).flat()
    : Array.from({ length: n - 1 }, (_, i) => [i, i + 1]);
  const checks = [];
  const offband = palette.filter((c) => { const L = toOklch(parseColor(c)).L; return L < lo || L > hi; });
  checks.push({ name: 'Lightness band', state: offband.length ? 'fail' : 'pass', detail: offband.length ? `outside L ${lo}-${hi}: ${offband.join(', ')}` : `all ${n} inside OKLCH L ${lo}-${hi}` });
  const lowC = palette.filter((c) => toOklch(parseColor(c)).C < CHROMA_FLOOR);
  checks.push({ name: 'Chroma floor', state: lowC.length ? 'fail' : 'pass', detail: lowC.length ? `reads gray: ${lowC.join(', ')}` : `all ${n} >= ${CHROMA_FLOOR}` });
  let worst = { d: Infinity };
  for (const kind of ['protan', 'deutan']) for (const [i, j] of list) {
    const d = dE(palette[i], palette[j], kind);
    if (d < worst.d) worst = { d, kind, a: palette[i], b: palette[j] };
  }
  const cvd = worst.d >= CVD_TARGET ? 'pass' : worst.d >= CVD_FLOOR ? 'warn' : 'fail';
  checks.push({ name: 'CVD separation', state: cvd, detail: `worst ${pairs} ${worst.a}<->${worst.b} dE ${worst.d.toFixed(1)} (${worst.kind}); target ${CVD_TARGET}` });
  let nw = { d: Infinity };
  for (const [i, j] of list) { const d = dE(palette[i], palette[j]); if (d < nw.d) nw = { d, a: palette[i], b: palette[j] }; }
  checks.push({ name: 'Normal-vision floor', state: nw.d >= NORMAL_FLOOR ? 'pass' : 'fail', detail: `worst ${pairs} ${nw.a}<->${nw.b} dE ${nw.d.toFixed(1)}; floor ${NORMAL_FLOOR}` });
  const low = palette.filter((c) => contrast(parseColor(c), parseColor(surface)) < CONTRAST_MIN);
  checks.push({ name: 'Contrast vs surface', state: low.length ? 'warn' : 'pass', detail: low.length ? `below 3:1 (needs direct labels or table view): ${low.map((c) => `${c} ${contrast(parseColor(c), parseColor(surface)).toFixed(2)}`).join(', ')}` : `all ${n} >= 3:1` });
  return { checks, ok: checks.every((c) => c.state !== 'fail') };
}

/** Ordinal (one-hue) ramp. */
export function validateOrdinal(palette, { mode, surface }) {
  const checks = [];
  const Ls = palette.map((c) => toOklch(parseColor(c)).L);
  const order = [...Ls.keys()].sort((a, b) => Ls[a] - Ls[b]);
  const mono = order.every((v, i) => v === i) || order.every((v, i) => v === Ls.length - 1 - i);
  checks.push({ name: 'Lightness monotone', state: mono ? 'pass' : 'fail', detail: mono ? 'steps read in order' : `out of order: ${Ls.map((l) => l.toFixed(3)).join(', ')}` });
  const thin = Ls.slice(1).map((l, i) => Math.abs(l - Ls[i])).filter((g) => g < ORDINAL_MIN_DL);
  checks.push({ name: 'Adjacent dL', state: thin.length ? 'fail' : 'pass', detail: thin.length ? `steps too close (<${ORDINAL_MIN_DL})` : `all gaps >= ${ORDINAL_MIN_DL}` });
  const byL = [...palette].sort((a, b) => toOklch(parseColor(a)).L - toOklch(parseColor(b)).L);
  const lightest = mode === 'light' ? byL[byL.length - 1] : byL[0];
  const cr = contrast(parseColor(lightest), parseColor(surface));
  checks.push({ name: 'Light-end contrast', state: cr >= ORDINAL_LIGHT_FLOOR ? 'pass' : 'fail', detail: `${lightest} ${cr.toFixed(2)}:1 vs surface; floor ${ORDINAL_LIGHT_FLOOR}` });
  const hues = palette.map((c) => toOklch(parseColor(c)).h);
  let spread = Math.max(...hues) - Math.min(...hues);
  if (spread > 180) spread = 360 - spread;
  checks.push({ name: 'Single hue', state: spread <= 40 ? 'pass' : 'fail', detail: `hue spread ${spread.toFixed(0)} deg` });
  return { checks, ok: checks.every((c) => c.state !== 'fail') };
}

/** Run all chart palette validations for a resolved token tree. */
export function runChartChecks(tokens) {
  const out = [];
  for (const mode of ['light', 'dark']) {
    const surface = tokens.chart.surface[mode];
    out.push({ set: `categorical (${mode}, adjacent, 8 slots)`, ...validateCategorical(tokens.chart.categorical[mode], { mode, surface, pairs: 'adjacent' }) });
    out.push({ set: `categorical (${mode}, all-pairs, first 3 slots)`, ...validateCategorical(tokens.chart.categorical[mode].slice(0, 3), { mode, surface, pairs: 'all' }) });
    out.push({ set: `ordinal (${mode})`, ...validateOrdinal(tokens.chart.ordinal[mode], { mode, surface }) });
  }
  return out;
}

export function chartMarkdown(results) {
  const out = ['## Chart palette validation (dataviz method)', ''];
  for (const r of results) {
    out.push(`### ${r.set}: ${r.ok ? 'PASS' : 'FAIL'}`, '', '| Check | Result | Detail |', '|---|---|---|');
    for (const c of r.checks) out.push(`| ${c.name} | ${c.state.toUpperCase()} | ${c.detail} |`);
    out.push('');
  }
  return out.join('\n');
}
