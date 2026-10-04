// flowd wordmark — custom monoline lowercase letterforms, drawn as stroked paths (round caps/joins).
// Units: 1 unit = 1/104 of the ascender height. y grows downward; baseline OUTER edge sits at y = ASC.
import { toD, fmt } from './geometry.mjs';

export const WM = {
  S: 17,          // stroke weight (semi-bold)
  ASC: 104,       // outer ascender height (top of f / l / d to baseline)
  XH: 66,         // outer x-height
  OV: 2,          // round-letter overshoot (each side)
};

const half = WM.S / 2;
const yTop = half;                       // centerline of ascender tops
const yBase = WM.ASC - half;             // centerline of baseline
const yX = WM.ASC - WM.XH + half;        // centerline of x-height
const cyO = WM.ASC - WM.XH / 2;          // vertical centre of round letters
const rO = (WM.XH + WM.OV * 2 - WM.S) / 2; // centreline radius of the bowl

const circle = (cx, cy, r) => [['M', cx - r, cy], ['A', r, 1, cx + r, cy], ['A', r, 1, cx - r, cy]];

/** Letter factories. Each returns { segs, w } with segs positioned from x0, w = outer advance width. */
const L = {
  // f — the ribbon f of the mark, condensed: foot flicks left, stem leans, hook rolls right, crossbar at x-height.
  f(x0) {
    const sx = 0.40, sy = (yBase - yTop) / 162;
    const ox = x0 + half, oy = yBase;
    const p = (x, y) => [ox + (x - 34) * sx, oy - (214 - y) * sy];
    const segs = [
      ['M', ...p(34, 214)],
      ['C', ...p(66, 214), ...p(84, 196), ...p(90, 170)],
      ['C', ...p(98, 134), ...p(100, 112), ...p(112, 88)],
      ['C', ...p(124, 64), ...p(144, 52), ...p(166, 52)],
      ['L', ...p(184, 52)],
    ];
    // crossbar centred on the stem at x-height
    const stemX = ox + (99 - 34) * sx;
    const bar = [['M', stemX - 15, yX], ['L', stemX + 24, yX]];
    return { segs, bar, w: (184 - 34) * sx + WM.S };
  },
  l(x0) { const x = x0 + half; return { segs: [['M', x, yTop], ['L', x, yBase]], w: WM.S }; },
  o(x0) { const r = rO; return { segs: circle(x0 + r + half, cyO, r), w: r * 2 + WM.S }; },
  d(x0) {
    const r = rO, cx = x0 + r + half, sx = cx + r;
    return { segs: [...circle(cx, cyO, r), ['M', sx, yTop], ['L', sx, yBase]], w: r * 2 + WM.S };
  },
  w(x0) {
    const dx = 22.5, a = x0 + half;
    const pts = [[a, yX], [a + dx, yBase], [a + 2 * dx, yX + 4], [a + 3 * dx, yBase], [a + 4 * dx, yX]];
    return { segs: pts.map((p, i) => [i ? 'L' : 'M', ...p]), w: 4 * dx + WM.S };
  },
};

// optical spacing between letters (outer edge to outer edge)
const GAP = { 'f-l': 5, 'l-o': 7, 'o-w': 4, 'w-d': 3 };

export function wordmark() {
  const segs = [];
  const bars = [];   // the f crossbar is drawn separately so it can carry the mint accent
  let x = 0;
  const order = ['f', 'l', 'o', 'w', 'd'];
  order.forEach((ch, i) => {
    const g = L[ch](x);
    segs.push(...g.segs);
    if (g.bar) bars.push(...g.bar);
    x += g.w + (i < order.length - 1 ? GAP[`${ch}-${order[i + 1]}`] : 0);
  });
  // vertical extents include round overshoot below baseline
  return { d: toD(segs), barD: toD(bars), width: x, height: WM.ASC + WM.OV, stroke: WM.S, barStroke: WM.S - 1 };
}
export { fmt };
