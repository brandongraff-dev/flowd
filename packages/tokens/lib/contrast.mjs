// Contrast enforcement for the flowd tokens (WCAG 2.x). Zero dependencies.
//
// Text sits on GLASS, and glass is translucent, so a flat "fg vs bg" ratio proves nothing. We measure against what is
// really behind the text:
//   1. sample the actual aurora field (the CSS radial gradients in tokens.json) on a pixel grid at several viewports and
//      keep the BRIGHTEST pixel for dark theme (light text) / DARKEST pixel for light theme (dark text);
//   2. composite the glass exactly as CSS paints it: backdrop -> saturate() -> translucent fill -> sheen gradient;
//   3. L2 is measured on top of L1 (the maximum allowed stack), L3 on top of the scrim.
import { parseColor, over, saturate, contrast, luminance, toHex } from './color.mjs';

const VIEWPORTS = [[1440, 900], [390, 844], [1920, 1080], [768, 1024]];
const opaque = (c) => ({ r: c.r, g: c.g, b: c.b, a: 1 });

function stopAlpha(stops, tPct) {
  if (tPct <= stops[0][2]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (tPct <= stops[i][2]) {
      const [, a0, p0] = stops[i - 1], [, a1, p1] = stops[i];
      return a0 + ((a1 - a0) * (tPct - p0)) / (p1 - p0);
    }
  }
  return stops[stops.length - 1][1];
}

/** Sample the aurora field; returns the extreme (brightest + darkest) opaque pixels over all viewports. */
export function sampleAurora(aurora, step = 12) {
  const base = opaque(parseColor(aurora.base));
  let bright = { lum: -1, color: base }, dark = { lum: 2, color: base };
  for (const [vw, vh] of VIEWPORTS) {
    const vmax = Math.max(vw, vh);
    for (let y = 0; y <= vh; y += step) {
      for (let x = 0; x <= vw; x += step) {
        let c = base;
        for (let i = aurora.orbs.length - 1; i >= 0; i--) { // first orb is painted on top
          const o = aurora.orbs[i];
          const d = Math.hypot(x - (o.x / 100) * vw, y - (o.y / 100) * vh);
          const t = (d / (o.r * vmax)) * 100;
          if (t >= 100) continue;
          const a = stopAlpha(o.stops, t);
          if (a <= 0) continue;
          const col = parseColor(o.stops[0][0]);
          c = over({ r: col.r, g: col.g, b: col.b, a }, c);
        }
        const l = luminance(c);
        if (l > bright.lum) bright = { lum: l, color: c };
        if (l < dark.lum) dark = { lum: l, color: c };
      }
    }
  }
  return { brightest: bright.color, darkest: dark.color };
}

/** Composite a glass layer over an opaque backdrop the way CSS paints it. */
export function glassComposite(backdrop, layer, theme) {
  let c = over(parseColor(layer.fill), saturate(opaque(backdrop), layer.saturate));
  const a1 = parseColor(layer.sheen.from).a, a2 = parseColor(layer.sheen.to).a;
  const sheenA = theme === 'dark' ? Math.max(a1, a2) : Math.min(a1, a2); // worst case for the theme's text colour
  c = over({ r: 255, g: 255, b: 255, a: sheenA }, c);
  return opaque(c);
}

/** All backdrops text can sit on, per theme. */
export function backdropsFor(tokens, theme) {
  const sem = tokens.color.semantic[theme];
  const glass = tokens.glass[theme];
  const field = sampleAurora(tokens.aurora[theme]);
  const worst = theme === 'dark' ? field.brightest : field.darkest;
  const L1 = glassComposite(worst, glass.L1, theme);
  const L2 = glassComposite(L1, glass.L2, theme); // L2 stacked on L1: the maximum nesting
  const L3 = glassComposite(opaque(over(parseColor(glass.L3.scrim), worst)), glass.L3, theme);
  return {
    bg: opaque(parseColor(sem.bg)),
    surface: opaque(parseColor(sem.surface)),
    aurora: opaque(worst),
    L1, L2, L3,
  };
}

const HUES = ['accent', 'violet', 'mint', 'ember', 'sun', 'rose', 'info'];

/** Run every contrast rule. Returns { rows, failures, backdrops }. */
export function runContrastChecks(tokens) {
  const rows = [];
  const add = (theme, group, name, fgHex, bgName, bgColor, min) => {
    const fg = opaque(parseColor(fgHex));
    const ratio = contrast(fg, opaque(bgColor));
    rows.push({ theme, group, name, backdrop: bgName, fg: toHex(fg), bg: toHex(bgColor), ratio, min, pass: ratio + 1e-9 >= min });
  };
  const backdrops = {};

  for (const theme of ['dark', 'light']) {
    const sem = tokens.color.semantic[theme];
    const B = backdropsFor(tokens, theme);
    backdrops[theme] = Object.fromEntries(Object.entries(B).map(([k, v]) => [k, toHex(v)]));
    const all = Object.keys(B);

    // 1. Text tokens on every backdrop
    // fg and fg-muted are guaranteed everywhere, including straight on the raw aurora. Subtle + coloured text must sit on
    // bg, surface or glass (never directly on the aurora): it is too low-energy to be safe on a luminous gradient.
    const onGlass = all.filter((x) => x !== 'aurora');
    const textRules = [['fg', 7, all], ['fg-muted', 4.5, all], ['fg-subtle', 4.5, onGlass]];
    for (const h of HUES) textRules.push([h, 4.5, onGlass]);
    for (const [tok, min, where] of textRules) for (const b of where) add(theme, 'text', tok, sem[tok], b, B[b], min);

    // 2. Tinted pills: <hue>-text on <hue>-soft composited over each surface it may sit on
    for (const h of HUES) {
      const soft = parseColor(sem[`${h}-soft`]);
      for (const b of ['bg', 'surface', 'L1']) {
        add(theme, 'pill', `${h} on ${h}-soft`, sem[h], b, opaque(over(soft, B[b])), 4.5);
      }
    }

    // 3. Solid fills: on-<hue> over <hue>
    for (const h of HUES.filter((x) => x !== 'accent')) add(theme, 'solid', `on-${h} on ${h}`, sem[`on-${h}`], `${h}-solid`, opaque(parseColor(sem[`${h}-solid`])), 4.5);
    for (const s of ['accent-solid', 'accent-solid-hover', 'accent-solid-pressed']) add(theme, 'solid', `on-accent on ${s}`, sem['on-accent'], s, opaque(parseColor(sem[s])), 4.5);

    // 4. Non-text
    for (const b of ['bg', 'surface']) add(theme, 'non-text', 'focus-ring', sem['focus-ring'], b, B[b], 3);
    for (const b of ['bg', 'surface', 'L1']) add(theme, 'non-text', 'accent-bright', sem['accent-bright'], b, B[b], 3);
  }

  // 5. Primary button gradient: white text at both ends (theme independent)
  for (const s of tokens.gradient.flowButton.stops) {
    add('both', 'solid', 'on-accent on flowButton stop', '#FFFFFF', `flowButton ${s.at}%`, opaque(parseColor(s.color)), 4.5);
  }

  // 6. Tier badges: ink on medallion (>=4.5 on the mid stop, >=3 on the extremes)
  for (const [id, t] of Object.entries(tokens.tier)) {
    if (id === 'note') continue;
    t.stops.forEach(([hex, at], i) => {
      const edge = i === 0 || i === t.stops.length - 1;
      add('both', 'tier', `${id} ink`, t.ink, `stop ${at}%`, opaque(parseColor(hex)), edge ? 3 : 4.5);
    });
  }

  const failures = rows.filter((r) => !r.pass);
  return { rows, failures, backdrops };
}

const fmtRatio = (r) => r.toFixed(2);

/** Markdown for BRAND.md / dist/contrast-report.md */
export function contrastMarkdown({ rows, failures, backdrops }) {
  const out = [];
  out.push('# flowd contrast report', '', 'Generated by `packages/tokens/build.mjs`. WCAG 2.x ratios; `min` is the threshold the token must clear.', '');
  out.push(failures.length ? `**${failures.length} FAILING pair(s)** (listed first).` : '**All checked pairs pass.**', '');
  if (failures.length) {
    out.push('| Theme | Group | Pair | Backdrop | Ratio | Min |', '|---|---|---|---|---|---|');
    for (const r of failures) out.push(`| ${r.theme} | ${r.group} | ${r.name} | ${r.backdrop} | ${fmtRatio(r.ratio)} | ${r.min} |`);
    out.push('');
  }
  for (const theme of ['dark', 'light']) {
    out.push(`## ${theme} theme backdrops (worst case)`, '', '| Backdrop | Hex | How it is built |', '|---|---|---|');
    const how = {
      bg: 'semantic `bg`', surface: 'semantic `surface`',
      aurora: theme === 'dark' ? 'brightest pixel of the aurora field (all viewports)' : 'darkest pixel of the aurora field (all viewports)',
      L1: 'glass L1 over the worst aurora pixel', L2: 'glass L2 stacked on that L1 (maximum nesting)', L3: 'glass L3 over scrim over the worst aurora pixel',
    };
    for (const [k, v] of Object.entries(backdrops[theme])) out.push(`| ${k} | \`${v}\` | ${how[k]} |`);
    out.push('');
    const text = rows.filter((r) => r.theme === theme && r.group === 'text');
    const toks = [...new Set(text.map((r) => r.name))];
    const bds = Object.keys(backdrops[theme]);
    out.push(`### ${theme}: text tokens on each backdrop`, '', `| Token | min | ${bds.join(' | ')} |`, `|---|---|${bds.map(() => '---').join('|')}|`);
    for (const t of toks) {
      const rs = bds.map((b) => text.find((r) => r.name === t && r.backdrop === b));
      out.push(`| \`${t}\` | ${text.find((r) => r.name === t).min} | ${rs.map((r) => (r ? `${fmtRatio(r.ratio)}${r.pass ? '' : ' FAIL'}` : 'n/a')).join(' | ')} |`);
    }
    out.push('');
    const rest = rows.filter((r) => r.theme === theme && r.group !== 'text');
    out.push(`### ${theme}: pills, solid fills, non-text`, '', '| Group | Pair | Backdrop | Ratio | Min |', '|---|---|---|---|---|');
    for (const r of rest) out.push(`| ${r.group} | ${r.name} | ${r.backdrop} | ${fmtRatio(r.ratio)}${r.pass ? '' : ' FAIL'} | ${r.min} |`);
    out.push('');
  }
  out.push('## Theme-independent pairs', '', '| Group | Pair | Backdrop | Ratio | Min |', '|---|---|---|---|---|');
  for (const r of rows.filter((x) => x.theme === 'both')) out.push(`| ${r.group} | ${r.name} | ${r.backdrop} | ${fmtRatio(r.ratio)}${r.pass ? '' : ' FAIL'} | ${r.min} |`);
  out.push('');
  return out.join('\n');
}
