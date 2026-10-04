// Shared helpers for the logo / OG generators: colours from tokens.json, mark + wordmark builders, lockup layouts.
// The logo is FLAT: no gradients, ever. Colour = one structural colour (ink / ice) + one accent (mint, the colour of money)
// on the crossbar of the f. Mono versions use a single colour.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARK, toD, markCentering, fmt } from './geometry.mjs';
import { wordmark, WM } from './wordmark.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.resolve(HERE, '../logo');
mkdirSync(OUT, { recursive: true });
export const T = JSON.parse(readFileSync(path.resolve(HERE, '../../packages/tokens/tokens.json'), 'utf8'));
export const P = T.color.primitive;

export const C = {
  ink: P.abyss['950'],          // structural colour on light surfaces
  ice: P.abyss['50'],           // structural colour on dark surfaces
  abyss: P.abyss['975'],        // deepest navy (dark appearance tile)
  mint: P.mint['500'],          // accent on dark surfaces
  mintDeep: P.mint['600'],      // accent on light surfaces
  white: '#FFFFFF',
  black: '#000000',
  // legacy names still read by build-og / build-preview (UI aurora art, not the logo)
  violet: P.ultraviolet['500'], violetDeep: P.ultraviolet['600'], azure: P.azure['500'], azureDeep: P.azure['600'], lagoon: P.lagoon['500'],
  inkLight: P.abyss['950'], inkDark: P.abyss['50'],
};

export const mc = markCentering();
export const wm = wordmark();

export const file = (name, svg) => { writeFileSync(path.join(OUT, name), svg.replace(/\r?\n/g, '\n'), 'utf8'); };
export const wrap = ({ w, h, vb, title, desc, defs = '', style = '', body, extra = '' }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb ?? `0 0 ${fmt(w)} ${fmt(h)}`}" width="${fmt(w)}" height="${fmt(h)}" role="img" aria-labelledby="t d"${extra}>
<title id="t">${title}</title>
<desc id="d">${desc}</desc>
${defs || style ? `<defs>${defs}${style ? `<style>${style}</style>` : ''}</defs>\n` : ''}${body}
</svg>
`;

const cls = (c) => (c ? ` class="${c}"` : '');

/** Mark strokes: ribbon in `paint`, crossbar in `bar` (defaults to the same colour = mono). */
export const markStrokes = (paint, { boost = 0, bar = paint, fCls = '', barCls = '' } = {}) =>
  `<path${cls(fCls)} d="${toD(MARK.ribbon)}" stroke="${paint}" stroke-width="${MARK.stroke + boost}"/><path${cls(barCls)} d="${toD(MARK.crossbar)}" stroke="${bar}" stroke-width="${MARK.crossStroke + boost}"/>`;

/** The mark as an SVG group at ink-box origin (0,0) scaled so its ink height = h. Returns { g, w, h }. */
export function markGroup(h, paint, bar = paint, { boost = 0, fCls = '', barCls = '' } = {}) {
  const s = h / mc.h;
  return {
    s, w: mc.w * s, h,
    g: (x, y) => `<g transform="translate(${fmt(x)} ${fmt(y)}) scale(${s.toFixed(4)}) translate(${fmt(-mc.minX)} ${fmt(-mc.minY)})" fill="none" stroke-linecap="round" stroke-linejoin="round">${markStrokes(paint, { boost, bar, fCls, barCls })}</g>`,
  };
}

/** Wordmark letters in `stroke`; the f crossbar in `bar` (defaults to the same colour). */
export const wordPath = (stroke, c = '', bar = stroke, barC = '') =>
  `<path${cls(c)} d="${wm.d}" fill="none" stroke="${stroke}" stroke-width="${wm.stroke}" stroke-linecap="round" stroke-linejoin="round"/><path${cls(barC)} d="${wm.barD}" fill="none" stroke="${bar}" stroke-width="${wm.barStroke}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** OS-scheme adaptive styling: ink + deep mint on light, ice + mint on dark. (Apps should prefer the explicit -on-dark / -on-light files.) */
export const adaptiveStyle =
  `.ink{stroke:${C.ink}}.bar{stroke:${C.mintDeep}}.tilebg{fill:${C.ink}}.tilef{stroke:${C.ice}}.tilebar{stroke:${C.mint}}` +
  `@media (prefers-color-scheme:dark){.ink{stroke:${C.ice}}.bar{stroke:${C.mint}}.tilebg{fill:${C.ice}}.tilef{stroke:${C.ink}}.tilebar{stroke:${C.mintDeep}}}`;

/* ---------------------------------------------------------------- lockup ---------- */
// Horizontal lockup = the full-colour wordmark (its f carries the mint crossbar). The mark IS the f, so no second "f" is added.
export function lockupH(kind) {
  const pad = 4;
  const W = wm.width + pad * 2, H = wm.height + pad * 2;
  const body = `<g transform="translate(${pad} ${pad})">${wordPath(kind.word, kind.cls, kind.bar, kind.barCls)}</g>`;
  return { W, H, defs: '', body };
}

// Stacked lockup = app tile (the mark on a flat rounded square) above the wordmark.
export function lockupV(kind) {
  const tile = 150, rx = 34, markH = 92, gap = 26, pad = 4;
  const W = Math.max(tile, wm.width) + pad * 2;
  const H = pad + tile + gap + wm.height + pad;
  const tx = (W - tile) / 2, ty = pad;
  const m = markGroup(markH, kind.tileF, kind.tileBar, { fCls: kind.tileFCls, barCls: kind.tileBarCls });
  let tileSvg, defs = '';
  if (kind.knockout) {
    // mono: solid tile in the lockup colour, mark knocked out (transparent) so it works on any background
    const mk = markGroup(markH, '#000', '#000');
    defs = `<mask id="k" maskUnits="userSpaceOnUse" x="${fmt(tx)}" y="${fmt(ty)}" width="${tile}" height="${tile}"><rect x="${fmt(tx)}" y="${fmt(ty)}" width="${tile}" height="${tile}" fill="#fff"/>${mk.g(tx + (tile - mk.w) / 2, ty + (tile - markH) / 2)}</mask>`;
    tileSvg = `<rect x="${fmt(tx)}" y="${fmt(ty)}" width="${tile}" height="${tile}" rx="${rx}" fill="${kind.word}" mask="url(#k)"/>`;
  } else {
    tileSvg = `<rect${cls(kind.tileBgCls)} x="${fmt(tx)}" y="${fmt(ty)}" width="${tile}" height="${tile}" rx="${rx}" fill="${kind.tileBg}"/>${m.g(tx + (tile - m.w) / 2, ty + (tile - markH) / 2)}`;
  }
  const body = `${tileSvg}<g transform="translate(${fmt((W - wm.width) / 2)} ${fmt(pad + tile + gap)})">${wordPath(kind.word, kind.cls, kind.bar, kind.barCls)}</g>`;
  return { W, H, defs, body };
}

export const KINDS = {
  '': {
    word: C.ink, cls: 'ink', bar: C.mintDeep, barCls: 'bar', style: adaptiveStyle,
    tileBg: C.ink, tileBgCls: 'tilebg', tileF: C.ice, tileFCls: 'tilef', tileBar: C.mint, tileBarCls: 'tilebar',
    desc: 'Flat full-colour logo: ink wordmark with a mint crossbar on the f; adapts to light and dark colour schemes.',
  },
  '-on-dark': {
    word: C.ice, cls: '', bar: C.mint, barCls: '',
    tileBg: C.ice, tileF: C.ink, tileBar: C.mintDeep,
    desc: 'Flat full-colour logo for dark backgrounds: ice-white wordmark, mint crossbar.',
  },
  '-on-light': {
    word: C.ink, cls: '', bar: C.mintDeep, barCls: '',
    tileBg: C.ink, tileF: C.ice, tileBar: C.mint,
    desc: 'Flat full-colour logo for light backgrounds: ink wordmark, mint crossbar.',
  },
  '-mono-light': { word: C.white, cls: '', bar: C.white, barCls: '', knockout: true, desc: 'Single-colour white logo for dark or photographic backgrounds.' },
  '-mono-dark': { word: C.ink, cls: '', bar: C.ink, barCls: '', knockout: true, desc: 'Single-colour ink logo for light backgrounds.' },
};
