// flowd logo geometry — single source of truth for every logo SVG.
// Everything is plain path data (strokes with round caps/joins), so no font is required anywhere.
// Run `node brand/src/build-logos.mjs` to regenerate brand/logo/*.svg.

const r1 = (n) => Math.round(n * 100) / 100;
export const fmt = (n) => String(r1(n));

/** Build an SVG path "d" from a list of segments. Segment: ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['A',r,sweep,x,y] ['H',x] ['V',y] */
export function toD(segs, map = (x, y) => [x, y]) {
  const out = [];
  for (const s of segs) {
    const [c, ...a] = s;
    if (c === 'M' || c === 'L') { const [x, y] = map(a[0], a[1]); out.push(`${c}${fmt(x)} ${fmt(y)}`); }
    else if (c === 'C') {
      const p1 = map(a[0], a[1]), p2 = map(a[2], a[3]), p3 = map(a[4], a[5]);
      out.push(`C${fmt(p1[0])} ${fmt(p1[1])} ${fmt(p2[0])} ${fmt(p2[1])} ${fmt(p3[0])} ${fmt(p3[1])}`);
    } else if (c === 'A') { const [x, y] = map(a[2], a[3]); out.push(`A${fmt(a[0])} ${fmt(a[0])} 0 0 ${a[1]} ${fmt(x)} ${fmt(y)}`); }
    else throw new Error('bad seg ' + c);
  }
  return out.join('');
}

// ---------------------------------------------------------------------------------------------
// THE MARK — "ribbon f" (flat, no gradients). One continuous liquid ribbon enters from the lower left, sweeps up into
// the stem, rolls over into the hook. A straight crossbar crosses it; the crossbar is the brand's one accent (mint = money).
// 256 x 256 design grid.
// ---------------------------------------------------------------------------------------------
export const MARK = {
  grid: 256,
  stroke: 40,
  crossStroke: 34,
  ribbon: [
    ['M', 34, 214],
    ['C', 66, 214, 84, 196, 90, 170],
    ['C', 98, 134, 100, 112, 112, 88],
    ['C', 124, 64, 144, 52, 172, 52],
    ['L', 196, 52],
  ],
  crossbar: [['M', 62, 138], ['L', 168, 138]],
};

/** Axis-aligned bounds of a segment list (sampled beziers) + half stroke. */
export function bounds(segs, stroke) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let cur = [0, 0];
  const add = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const s of segs) {
    const [c, ...a] = s;
    if (c === 'M' || c === 'L') { add(a[0], a[1]); cur = [a[0], a[1]]; }
    else if (c === 'C') {
      for (let t = 0; t <= 1; t += 0.01) {
        const u = 1 - t;
        const x = u ** 3 * cur[0] + 3 * u * u * t * a[0] + 3 * u * t * t * a[2] + t ** 3 * a[4];
        const y = u ** 3 * cur[1] + 3 * u * u * t * a[1] + 3 * u * t * t * a[3] + t ** 3 * a[5];
        add(x, y);
      }
      cur = [a[4], a[5]];
    }
  }
  const h = stroke / 2;
  return { minX: minX - h, minY: minY - h, maxX: maxX + h, maxY: maxY + h };
}

/** Offset (dx,dy) that centres the mark's ink in the 256 grid. */
export function markCentering() {
  const b1 = bounds(MARK.ribbon, MARK.stroke);
  const b2 = bounds(MARK.crossbar, MARK.crossStroke);
  const minX = Math.min(b1.minX, b2.minX), maxX = Math.max(b1.maxX, b2.maxX);
  const minY = Math.min(b1.minY, b2.minY), maxY = Math.max(b1.maxY, b2.maxY);
  return { dx: 128 - (minX + maxX) / 2, dy: 128 - (minY + maxY) / 2, w: maxX - minX, h: maxY - minY, minX, minY, maxX, maxY };
}
