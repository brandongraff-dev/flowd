// Board charts: pure SVG, colours via --fd-chart-* so they follow the theme toggle. Follows the dataviz skill:
// thin marks, 4px rounded data ends, 2px surface gaps, recessive grid, direct labels, fixed hue order.
const NAMES = ['Question', 'POV', 'Demo', 'Story', 'Reaction', 'List', 'Challenge', 'Trend'];
const f1 = (n) => Math.round(n * 10) / 10;

export const seriesNames = NAMES;

export function stackedBars() {
  const W = 560, H = 290, L = 44, R = 12, T = 14, B = 34;
  const cols = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
  const data = [
    [18, 14, 12, 10, 8, 7, 6, 5],
    [20, 15, 14, 11, 9, 8, 6, 6],
    [23, 17, 14, 13, 10, 8, 7, 6],
    [26, 19, 16, 13, 11, 9, 8, 6],
    [28, 21, 17, 15, 12, 10, 8, 7],
    [32, 23, 19, 16, 13, 11, 9, 8],
  ];
  const max = 140, ih = H - T - B, bw = 54, step = (W - L - R) / cols.length;
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, y = T + ih - (v / max) * ih;
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--fd-chart-grid)"/><text x="${L - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--fd-fg-subtle)" style="font-variant-numeric:tabular-nums">${v === 0 ? '0' : `$${v}k`}</text>`;
  }
  cols.forEach((c, ci) => {
    const x = L + step * ci + (step - bw) / 2;
    let acc = 0;
    data[ci].forEach((v, si) => {
      const h = (v / max) * ih;
      const y = T + ih - ((acc + v) / max) * ih;
      const last = si === data[ci].length - 1;
      // 4px rounded data end only on the top segment; 2px surface gap between segments
      g += last
        ? `<path d="M${x} ${y + h}V${y + 4}a4 4 0 0 1 4-4h${bw - 8}a4 4 0 0 1 4 4V${y + h}z" fill="var(--fd-chart-${si + 1})" stroke="var(--fd-chart-surface)" stroke-width="2"/>`
        : `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="var(--fd-chart-${si + 1})" stroke="var(--fd-chart-surface)" stroke-width="2"/>`;
      acc += v;
    });
    g += `<text x="${x + bw / 2}" y="${H - 12}" text-anchor="middle" font-size="12" fill="var(--fd-fg-muted)">${c}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Stacked columns of payout by hook type over six weeks, eight series in fixed hue order">${g}</svg>`;
}

export function lineChart() {
  const W = 560, H = 290, L = 44, R = 78, T = 18, B = 34;
  const N = 12;
  const mk = (base, grow, wob, seed) => Array.from({ length: N }, (_, i) => base + grow * i + Math.sin((i + seed) * 1.3) * wob + Math.cos((i + seed) * 0.7) * wob * 0.5);
  const s = [mk(100, 11, 6, 0), mk(100, 7, 5, 2), mk(100, 4.2, 4, 4)];
  const names = ['Views', 'Installs', 'Trials'];
  const max = 240, min = 80, ih = H - T - B, iw = W - L - R;
  const X = (i) => L + (iw * i) / (N - 1), Y = (v) => T + ih - ((v - min) / (max - min)) * ih;
  let g = '<defs><linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--fd-chart-1)" stop-opacity=".30"/><stop offset="1" stop-color="var(--fd-chart-1)" stop-opacity="0"/></linearGradient></defs>';
  for (const v of [80, 120, 160, 200, 240]) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--fd-chart-grid)"/><text x="${L - 10}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--fd-fg-subtle)" style="font-variant-numeric:tabular-nums">${v}</text>`;
  [0, 3, 6, 9, 11].forEach((i) => { g += `<text x="${X(i)}" y="${H - 12}" text-anchor="middle" font-size="12" fill="var(--fd-fg-muted)">W${i + 1}</text>`; });
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${f1(X(i))} ${f1(Y(v))}`).join('');
  g += `<path d="${path(s[0])}L${X(N - 1)} ${T + ih}L${X(0)} ${T + ih}Z" fill="url(#lc-area)"/>`;
  s.forEach((arr, k) => {
    g += `<path d="${path(arr)}" fill="none" stroke="var(--fd-chart-${[1, 2, 3][k]})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    g += `<circle cx="${X(N - 1)}" cy="${Y(arr[N - 1])}" r="4.5" fill="var(--fd-chart-${[1, 2, 3][k]})" stroke="var(--fd-chart-surface)" stroke-width="2"/>`;
    g += `<text x="${X(N - 1) + 12}" y="${Y(arr[N - 1]) + 4}" font-size="12.5" font-weight="600" fill="var(--fd-fg)">${names[k]}</text>`;
  });
  // crosshair + tooltip at W9
  const ci = 8, cx = X(ci);
  g += `<line x1="${cx}" x2="${cx}" y1="${T}" y2="${T + ih}" stroke="var(--fd-chart-axis)" stroke-dasharray="3 4"/>`;
  s.forEach((arr, k) => { g += `<circle cx="${cx}" cy="${Y(arr[ci])}" r="4.5" fill="var(--fd-chart-${[1, 2, 3][k]})" stroke="var(--fd-chart-surface)" stroke-width="2"/>`; });
  const tx = cx - 150, ty = T + 6;
  g += `<g><rect x="${tx}" y="${ty}" width="132" height="76" rx="12" fill="var(--fd-glass-2-solid)" stroke="var(--fd-rim-strong)"/>
<text x="${tx + 14}" y="${ty + 22}" font-size="11" font-weight="600" fill="var(--fd-fg-subtle)" letter-spacing=".06em">WEEK 9 (INDEX)</text>
${s.map((arr, k) => `<circle cx="${tx + 18}" cy="${ty + 38 + k * 16}" r="4" fill="var(--fd-chart-${[1, 2, 3][k]})"/><text x="${tx + 30}" y="${ty + 42 + k * 16}" font-size="12" fill="var(--fd-fg-muted)">${names[k]}</text><text x="${tx + 118}" y="${ty + 42 + k * 16}" text-anchor="end" font-size="12" font-weight="650" fill="var(--fd-fg)" style="font-variant-numeric:tabular-nums">${Math.round(arr[ci])}</text>`).join('')}</g>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of views, installs and trials indexed to week one equals 100, with a crosshair on week nine">${g}</svg>`;
}

export function heatmap() {
  const rows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = ['6a', '9a', '12p', '3p', '6p', '9p'];
  const W = 560, H = 290, L = 44, T = 10, cw = (W - L - 8) / hours.length, ch = (H - T - 30) / rows.length;
  let g = '';
  rows.forEach((r, ri) => {
    g += `<text x="${L - 10}" y="${T + ri * ch + ch / 2 + 4}" text-anchor="end" font-size="11.5" fill="var(--fd-fg-muted)">${r}</text>`;
    hours.forEach((h, hi) => {
      const v = Math.max(0, Math.min(6, Math.round(3 + 2.6 * Math.sin(hi * 1.1 + ri * 0.6) + (hi > 3 ? 1.4 : -0.6) + (ri > 4 ? 0.8 : 0))));
      g += `<rect x="${L + hi * cw + 1}" y="${T + ri * ch + 1}" width="${cw - 2}" height="${ch - 2}" rx="6" fill="var(--fd-chart-seq-${v + 1})"/>`;
    });
  });
  hours.forEach((h, hi) => { g += `<text x="${L + hi * cw + cw / 2}" y="${H - 8}" text-anchor="middle" font-size="11.5" fill="var(--fd-fg-muted)">${h}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Heatmap of views by weekday and hour, one-hue sequential ramp">${g}</svg>`;
}

export function diverging() {
  const W = 560, H = 290, L = 120, R = 40, T = 12, B = 28;
  const rows = [['Hook A: question', 34], ['Hook B: POV', 21], ['Hook C: demo', 9], ['Hook D: list', -6], ['Hook E: story', -15], ['Hook F: react', -28]];
  const mid = L + (W - L - R) / 2, scale = (W - L - R) / 2 / 40, rh = (H - T - B) / rows.length;
  let g = `<line x1="${mid}" x2="${mid}" y1="${T}" y2="${H - B}" stroke="var(--fd-chart-axis)"/>`;
  rows.forEach(([n, v], i) => {
    const y = T + i * rh + rh * 0.2, h = rh * 0.6;
    const w = Math.abs(v) * scale, x = v >= 0 ? mid : mid - w;
    const col = v >= 0 ? 'var(--fd-chart-div-6)' : 'var(--fd-chart-div-2)';
    g += `<text x="${L - 12}" y="${y + h / 2 + 4}" text-anchor="end" font-size="12" fill="var(--fd-fg-muted)">${n}</text>`;
    g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${col}"/>`;
    g += `<text x="${v >= 0 ? x + w + 8 : x - 8}" y="${y + h / 2 + 4}" text-anchor="${v >= 0 ? 'start' : 'end'}" font-size="12" font-weight="650" fill="var(--fd-fg)" style="font-variant-numeric:tabular-nums">${v > 0 ? '+' : '−'}${Math.abs(v)}%</text>`;
  });
  g += `<text x="${mid - 6}" y="${H - 8}" text-anchor="end" font-size="11" fill="var(--fd-fg-subtle)">below median</text><text x="${mid + 6}" y="${H - 8}" font-size="11" fill="var(--fd-fg-subtle)">above median</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Diverging bars: view-to-trial rate versus category median, azure below and ember above">${g}</svg>`;
}
