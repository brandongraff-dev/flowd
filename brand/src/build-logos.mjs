// Generates every logo SVG in brand/logo/. Plain Node, zero dependencies.
//   node brand/src/build-logos.mjs
// FLAT identity: no gradients, no glows, no shadows. Geometry lives in geometry.mjs (mark) and wordmark.mjs (letterforms);
// colours come from packages/tokens/tokens.json (ink, ice, mint).
import { fmt } from './geometry.mjs';
import { OUT, C, mc, wm, file, wrap, markStrokes, markGroup, wordPath, adaptiveStyle, lockupH, lockupV, KINDS } from './logo-lib.mjs';

/* ------------------------------------------------------------------ mark ---------- */
const markBody = (f, bar, opts = {}) =>
  `<g transform="translate(${fmt(mc.dx)} ${fmt(mc.dy)})" fill="none" stroke-linecap="round" stroke-linejoin="round">${markStrokes(f, { bar, ...opts })}</g>`;
{
  file('flowd-mark.svg', wrap({ w: 256, h: 256, title: 'flowd', desc: 'The flowd mark: a lowercase f formed by one continuous ribbon, with a mint crossbar. Flat colour; adapts to light and dark colour schemes.', style: adaptiveStyle, body: markBody(C.ink, C.mintDeep, { fCls: 'ink', barCls: 'bar' }) }));
  file('flowd-mark-on-dark.svg', wrap({ w: 256, h: 256, title: 'flowd', desc: 'The flowd mark for dark backgrounds: ice-white ribbon, mint crossbar.', body: markBody(C.ice, C.mint) }));
  file('flowd-mark-on-light.svg', wrap({ w: 256, h: 256, title: 'flowd', desc: 'The flowd mark for light backgrounds: ink ribbon, mint crossbar.', body: markBody(C.ink, C.mintDeep) }));
  for (const [name, col] of [['light', C.white], ['dark', C.ink]]) {
    file(`flowd-mark-mono-${name}.svg`, wrap({ w: 256, h: 256, title: 'flowd', desc: `The flowd mark in a single colour for ${name === 'light' ? 'dark' : 'light'} backgrounds.`, body: markBody(col, col) }));
  }
}

/* -------------------------------------------------------------- wordmark ---------- */
// Pure type: one colour, no accent (the full-colour version with the mint f crossbar is the lockup).
const PADW = 2;
const wmW = wm.width + PADW * 2, wmH = wm.height + PADW * 2;
const wmBody = (stroke, c) => `<g transform="translate(${PADW} ${PADW})">${wordPath(stroke, c, stroke, c)}</g>`;
{
  file('flowd-wordmark.svg', wrap({ w: wmW, h: wmH, title: 'flowd', desc: 'The flowd wordmark in one colour. Adapts to light and dark colour schemes.', style: `.ink{stroke:${C.ink}}@media (prefers-color-scheme:dark){.ink{stroke:${C.ice}}}`, body: wmBody(C.ink, 'ink') }));
  file('flowd-wordmark-mono-light.svg', wrap({ w: wmW, h: wmH, title: 'flowd', desc: 'The flowd wordmark in white for dark backgrounds.', body: wmBody(C.white) }));
  file('flowd-wordmark-mono-dark.svg', wrap({ w: wmW, h: wmH, title: 'flowd', desc: 'The flowd wordmark in ink for light backgrounds.', body: wmBody(C.ink) }));
  file('flowd-wordmark-on-dark.svg', wrap({ w: wmW, h: wmH, title: 'flowd', desc: 'The flowd wordmark in ice white for dark backgrounds.', body: wmBody(C.ice) }));
}

/* --------------------------------------------------------------- lockups ---------- */
for (const [suffix, kind] of Object.entries(KINDS)) {
  const h = lockupH(kind);
  file(`flowd-lockup${suffix}.svg`, wrap({ w: h.W, h: h.H, title: 'flowd', desc: `flowd logo (horizontal). ${kind.desc}`, defs: h.defs, style: kind.style ?? '', body: h.body }));
  const v = lockupV(kind);
  file(`flowd-lockup-stacked${suffix}.svg`, wrap({ w: v.W, h: v.H, title: 'flowd', desc: `flowd logo (stacked: app tile above wordmark). ${kind.desc}`, defs: v.defs, style: kind.style ?? '', body: v.body }));
}

/* ------------------------------------------------------------- app icon ----------- */
// 1024 grid. Full-bleed, fully opaque square (iOS applies its own mask). FLAT: one solid tile + the mark. No glass, no glow, no shadow.
const ICON = 1024;
const ICONS = {
  light: { bg: C.ink, f: C.ice, bar: C.mint, desc: 'flowd app icon: ice-white ribbon f with a mint crossbar on a flat ink tile. Full-bleed, opaque, no pre-rounded corners (iOS masks it).' },
  dark: { bg: C.abyss, f: C.ice, bar: C.mint, desc: 'flowd app icon, dark appearance: the same flat mark on the deepest navy tile.' },
  tinted: { bg: '#000000', f: '#FFFFFF', bar: '#8C8C8C', desc: 'flowd app icon, tinted appearance: greyscale artwork (white ribbon, mid-grey crossbar) that iOS tints with the user colour.' },
};
const ICON_MARK_H = 600;
function iconMark(i) {
  const m = markGroup(ICON_MARK_H, i.f, i.bar);
  return m.g((ICON - m.w) / 2, (ICON - ICON_MARK_H) / 2);
}
for (const v of ['light', 'dark', 'tinted']) {
  const i = ICONS[v];
  file(v === 'light' ? 'app-icon.svg' : `app-icon-${v}.svg`, wrap({ w: ICON, h: ICON, title: 'flowd app icon', desc: i.desc, body: `<rect width="${ICON}" height="${ICON}" fill="${i.bg}"/>${iconMark(i)}` }));
}
{
  const i = ICONS.light;
  file('app-icon-rounded.svg', wrap({ w: ICON, h: ICON, title: 'flowd app icon (rounded preview)', desc: 'Rounded preview of the flowd app icon for web, README and store listings. Do not use as the iOS asset.', body: `<rect width="${ICON}" height="${ICON}" rx="229" fill="${i.bg}"/>${iconMark(i)}` }));
  file('app-icon-layer-bg.svg', wrap({ w: ICON, h: ICON, title: 'flowd app icon background layer', desc: 'Background layer for Icon Composer (iOS 26 layered icon): a flat ink fill.', body: `<rect width="${ICON}" height="${ICON}" fill="${i.bg}"/>` }));
  file('app-icon-layer-fg.svg', wrap({ w: ICON, h: ICON, title: 'flowd app icon foreground layer', desc: 'Foreground (mark) layer for Icon Composer, transparent background.', body: iconMark(i) }));
}

/* -------------------------------------------------------------- favicon ----------- */
// 64 grid: flat ink tile + the mark with a heavier stroke so it survives 16px. A tile (not a bare glyph) so it stays visible on
// both light and dark browser tab strips regardless of the OS colour scheme.
{
  const S = 64, markH = 44;
  const m = markGroup(markH, C.ice, C.mint, { boost: 10 });
  file('favicon.svg', wrap({ w: S, h: S, title: 'flowd', desc: 'flowd favicon: ice-white ribbon f with a mint crossbar on a flat ink tile.', body: `<rect width="${S}" height="${S}" rx="14" fill="${C.ink}"/>${m.g((S - m.w) / 2, (S - markH) / 2)}` }));
}

console.log('logos written to', OUT);
