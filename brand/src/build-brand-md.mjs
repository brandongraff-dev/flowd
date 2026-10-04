// Builds brand/BRAND.md from BRAND.template.md. Every number in a table comes from packages/tokens (tokens.json + the contrast
// checker), so the brand book cannot drift from the code. Prose lives in the template.
//   node packages/tokens/build.mjs && node brand/src/build-brand-md.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { HERE, OUT } from './logo-lib.mjs';
import { loadTokens } from '../../packages/tokens/lib/tokens.mjs';
import { runContrastChecks } from '../../packages/tokens/lib/contrast.mjs';
import { runChartChecks } from '../../packages/tokens/lib/chart-check.mjs';
import { springModel, springLinear } from '../../packages/tokens/lib/motion.mjs';
import { shadowCss } from '../../packages/tokens/lib/emit-css.mjs';
import { parseColor, contrast } from '../../packages/tokens/lib/color.mjs';

const ROOT = path.resolve(HERE, '../..');
const { tokens: T } = loadTokens(path.join(ROOT, 'packages/tokens/tokens.json'));
const CR = runContrastChecks(T);
const CH = runChartChecks(T);
const S = T.color.semantic;
const md = (rows) => rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
const table = (head, rows) => `${md([head])}\n|${head.map(() => '---').join('|')}|\n${md(rows)}`;
const code = (s) => `\`${s}\``;
const ratio = (theme, name, backdrop) => CR.rows.find((r) => r.theme === theme && r.name === name && r.backdrop === backdrop)?.ratio;
const fmt = (n) => (n == null ? 'n/a' : `${n.toFixed(1)}:1`);
const opaque = (h) => ({ ...parseColor(h), a: 1 });

/* ---------------------------------------------------------------- semantic colour tables ---------- */
const ROLE = {
  bg: 'Page canvas under the aurora', 'bg-elevated': 'Raised canvas (headers, drawers)', 'bg-sunken': 'Wells, code blocks, video letterbox',
  surface: 'Solid card/panel, popover fallback, table rows', 'surface-raised': 'Solid raised surface (menus, sticky headers)',
  'surface-field': 'Input and chip fill; sits ON glass (a fill, not more glass)', 'surface-hover': 'Hover wash on rows and buttons', 'surface-active': 'Pressed / selected wash, active tab lens',
  'surface-glass-1': 'L1 quiet-glass fill (carries the legibility scrim)', 'surface-glass-2': 'L2 glass fill', 'surface-glass-3': 'L3 sheet fill', scrim: 'Behind L3 sheets and modals',
  fg: 'Primary text and numerals', 'fg-muted': 'Secondary text', 'fg-subtle': 'Tertiary text: metadata, helper, placeholder', 'fg-disabled': 'Disabled only (exempt from AA)', 'fg-inverse': 'Text on bright solid fills',
  rim: 'Hairline border', 'rim-strong': 'Stronger border, selected outline', divider: 'Row separators', 'focus-ring': 'Keyboard focus ring (3:1 on bg and surface)',
  accent: 'Links, active text, interactive text (AA-safe)', 'accent-solid': 'Primary fill under white text', 'accent-solid-hover': 'Hover for accent-solid', 'accent-solid-pressed': 'Pressed for accent-solid',
  'accent-bright': 'Icons, strokes, indicators, glows', 'accent-soft': 'Tinted pill / selected background', 'on-accent': 'Text on accent-solid',
  violet: 'Flo, the copilot (AA-safe text)', 'violet-solid': 'Violet fill', 'violet-soft': 'Violet pill background', 'on-violet': 'Text on violet-solid',
  mint: 'Money going up, cleared, earned (AA-safe text/icon)', 'mint-solid': 'Mint fill (earned badge, success bar)', 'mint-soft': 'Mint pill background', 'on-mint': 'Text on mint-solid',
  ember: 'Urgency, Daily Drop, hot CTA text', 'ember-solid': 'Ember fill', 'ember-soft': 'Ember pill background', 'on-ember': 'Text on ember-solid',
  sun: 'Elite, featured text', 'sun-solid': 'Sun fill', 'sun-soft': 'Sun pill background', 'on-sun': 'Text on sun-solid',
  rose: 'Danger, rejected, negative money text', 'rose-solid': 'Rose fill', 'rose-soft': 'Rose pill background', 'on-rose': 'Text on rose-solid',
  info: 'Pending, info, in-flight money (AA-safe text)', 'info-solid': 'Info/pending fill', 'info-soft': 'Info pill background', 'on-info': 'Text on info-solid',
};
const TEXTY = ['fg', 'fg-muted', 'fg-subtle', 'accent', 'violet', 'mint', 'ember', 'sun', 'rose', 'info'];
function semanticTable(theme) {
  const s = S[theme];
  const rows = Object.keys(s).map((k) => {
    let c = 'n/a';
    if (TEXTY.includes(k)) {
      const bds = ['bg', 'surface', 'L1', 'L2', 'L3'];
      const vals = bds.map((b) => ratio(theme, k, b));
      c = `${vals.map((v) => (v == null ? '-' : v.toFixed(1))).join(' / ')}`;
    } else if (k.startsWith('on-')) {
      const base = k === 'on-accent' ? 'accent-solid' : `${k.slice(3)}-solid`;
      c = `${fmt(contrast(opaque(s[k]), opaque(s[base])))} on ${base}`;
    } else if (k === 'focus-ring') c = `${fmt(ratio(theme, 'focus-ring', 'bg'))} on bg`;
    else if (k === 'accent-bright') c = `${fmt(ratio(theme, 'accent-bright', 'bg'))} on bg`;
    return [code(k), code(s[k].replace(/\s+/g, ' ')), ROLE[k] ?? '', c];
  });
  return table(['Token', 'Value', 'Role', 'Contrast (bg / surface / L1 / L2 / L3, worst-case glass)'], rows);
}

function backdropTable(theme) {
  const B = CR.backdrops[theme];
  return table(['Backdrop', 'Hex', 'Built as'], Object.entries(B).map(([k, v]) => [code(k), code(v), {
    bg: 'semantic bg', surface: 'semantic surface',
    aurora: theme === 'dark' ? 'brightest pixel of the aurora field at 1440x900, 390x844, 1920x1080, 768x1024' : 'darkest pixel of the aurora field (same viewports)',
    L1: 'glass L1 over that pixel: saturate, fill, sheen', L2: 'glass L2 stacked on that L1 (the maximum nesting)', L3: 'glass L3 over scrim over that pixel',
  }[k]]));
}

/* ---------------------------------------------------------------- primitives ---------- */
function ramps() {
  const P = T.color.primitive;
  const out = [];
  for (const name of ['ultraviolet', 'azure', 'lagoon', 'mint', 'ember', 'sun', 'rose']) {
    out.push(`**${name}**: ${Object.entries(P[name]).map(([s, h]) => `${s} ${code(h)}`).join(' · ')}`);
  }
  out.push(`**abyss**: ${Object.entries(P.abyss).map(([s, h]) => `${s} ${code(h)}`).join(' · ')}`);
  return out.map((l) => `- ${l}`).join('\n');
}
const gradients = () => table(['Name', 'Angle', 'Stops', 'Use'], Object.entries(T.gradient).map(([k, g]) => [code(k), `${g.angle}°`, g.stops.map((s) => `${s.color} ${s.at}%`).join(', '), g.note]));
const aurora = () => ['dark', 'light'].map((th) => `**${th}**: base ${code(T.aurora[th].base)}, noise ${T.aurora[th].noise}.\n\n${table(['Orb', 'Centre x / y', 'Radius (x longer side)', 'Colour at centre', 'Peak alpha', 'Falloff'], T.aurora[th].orbs.map((o) => [o.id, `${o.x}% / ${o.y}%`, o.r, code(o.stops[0][0]), o.stops[0][1], o.stops.map(([, a, at]) => `${a} @ ${at}%`).join(', ')]))}`).join('\n\n');

/* ---------------------------------------------------------------- type ---------- */
const typeWeb = () => table(['Style', 'Family', 'Size', 'Line height', 'Tracking', 'Weight', 'Use'], Object.entries(T.typography.scale).map(([n, s]) => [code(n), s.family, s.fluid ? `${s.size}px max, ${code(s.fluid)}` : `${s.size}px`, s.lineHeight, `${s.tracking}em`, s.weight, s.use]));
const typeIos = () => table(['Style', 'Text style', 'Size', 'Weight', 'Design', 'Tracking', 'Notes'], Object.entries(T.typography.ios.scale).map(([n, s]) => [code(n), s.textStyle, `${s.size}pt`, s.weight, s.design, `${s.trackingPt}pt`, [s.fixed ? 'fixed size (does not scale)' : 'Dynamic Type', s.monospacedDigit ? 'monospacedDigit' : '', s.uppercase ? 'uppercase' : ''].filter(Boolean).join(', ')]));

/* ---------------------------------------------------------------- spacing etc ---------- */
const spacing = () => table(['Step', 'px', 'iOS name'], Object.entries(T.spacing.named).map(([k, v]) => [code(k), v, { '2xl': 'xxl', '3xl': 'xxxl', '4xl': 'huge', '5xl': 'giant', '6xl': 'jumbo', '7xl': 'mega' }[k] ?? k]));
const radius = () => table(['Token', 'px', 'Typical use'], Object.entries(T.radius).filter(([k]) => k !== 'note').map(([k, v]) => [code(k), v, { sm: 'Chips, small buttons, tags', md: 'Inputs, small cards', lg: 'List rows, tooltips', xl: 'Cards inside cards', '2xl': 'L1 cards, panels', '3xl': 'L3 sheets, phone screens', pill: 'Buttons, L2 controls, tab bar' }[k]]));
const elevation = () => ['dark', 'light'].map((th) => `**${th}**\n\n${table(['Level', 'Box shadow'], Object.entries(T.elevation[th]).map(([k, v]) => [`${k}${{ 1: ' rest', 2: ' raised / L1', 3: ' float / L2', 4: ' overlay / L3' }[k]}`, code(shadowCss(v))]))}`).join('\n\n');
const layout = () => table(['Token', 'Value'], Object.entries(T.spacing.layout).map(([k, v]) => [code(k), `${v}px`]));
const zindex = () => table(['Layer', 'z-index'], Object.entries(T.zIndex).map(([k, v]) => [code(k), v]));
const breakpoints = () => table(['Name', 'min-width'], Object.entries(T.breakpoints).map(([k, v]) => [code(k), `${v}px`]));

/* ---------------------------------------------------------------- glass ---------- */
function glassParams() {
  const rows = [];
  const add = (label, fn) => rows.push([label, ...['dark', 'light'].flatMap((th) => ['L1', 'L2', 'L3'].map((L) => fn(T.glass[th][L], th, L)))]);
  add('Blur', (g) => `${g.blur}px`);
  add('Saturate', (g) => `${Math.round(g.saturate * 100)}%`);
  add('Fill (tint + scrim)', (g) => code(g.fill));
  add('Fill over media', (g) => code(g.fillOverMedia));
  add('Sheen 135°', (g) => `${g.sheen.from.replace(/rgba\(255, 255, 255, /, '').replace(')', '')} → ${g.sheen.to.replace(/rgba\(255, 255, 255, /, '').replace(')', '')}`);
  add('Rim from / mid / to', (g) => `${[g.rim.from, g.rim.mid, g.rim.to].map((c) => c.replace(/rgba\(255, 255, 255, /, '').replace(')', '')).join(' / ')} @ ${g.rim.width}px`);
  add('Highlight (inset top)', (g) => code(g.highlight));
  add('Lowlight (inset bottom)', (g) => code(g.lowlight));
  add('Edge (outer 1px)', (g) => code(g.edge));
  add('Elevation', (g) => `level ${g.elevation}`);
  add('Solid fallback', (g) => code(g.solid));
  const head = ['Param', ...['dark', 'light'].flatMap((th) => ['L1', 'L2', 'L3'].map((L) => `${th} ${L}`))];
  return table(head, rows);
}
const glassIos = () => table(['Layer', 'Uses glassEffect', 'Variant', 'Fallback material (all OS for L1; iOS 17-25 for L2/L3)', 'Fallback tint opacity (light / dark)', 'Rim stroke opacity (light / dark)'],
  ['L1', 'L2', 'L3'].map((L) => { const g = T.glass.ios[L]; return [L, g.usesGlassEffect ? 'iOS 26+' : 'never (quiet)', g.variant + (g.interactive ? ', interactive' : ''), code(g.fallbackMaterial), `${g.fallbackTintOpacityLight} / ${g.fallbackTintOpacityDark}`, `${g.strokeOpacityLight} / ${g.strokeOpacityDark}`]; }));

/* ---------------------------------------------------------------- motion ---------- */
function springs() {
  const rows = Object.entries(T.motion.spring).map(([k, s]) => {
    const m = springModel(s), l = springLinear(s);
    return [code(k), s.stiffness, s.damping, s.mass, m.response, m.dampingFraction, m.bounce, `${l.durationMs} ms`, s.use];
  });
  return table(['Preset', 'Stiffness', 'Damping', 'Mass', 'iOS response', 'iOS dampingFraction', 'motion bounce', 'CSS linear() duration', 'Use'], rows);
}
const durations = () => table(['Token', 'ms'], Object.entries(T.motion.duration).map(([k, v]) => [code(k), v]));
const easings = () => table(['Token', 'cubic-bezier'], Object.entries(T.motion.easing).map(([k, v]) => [code(k), `(${v.join(', ')})`]));

/* ---------------------------------------------------------------- tiers ---------- */
const tiers = () => table(['Tier', 'Chevrons', 'Gradient stops (135°)', 'Ink', 'Glow', 'Rim'], Object.entries(T.tier).filter(([k]) => k !== 'note').map(([k, t]) => [t.label, t.chevrons, t.stops.map(([c, a]) => `${c} ${a}%`).join(', '), code(t.ink) + (k === 'elite' ? ' (core)' : ''), code(t.glow), code(t.rim)]));

/* ---------------------------------------------------------------- charts ---------- */
const NAMES = ['azure', 'ember', 'lagoon', 'rose', 'violet', 'sun', 'magenta', 'green'];
const chartTable = () => table(['Slot', 'Hue', 'Light', 'Dark'], NAMES.map((n, i) => [i + 1, n, code(T.chart.categorical.light[i]), code(T.chart.categorical.dark[i])]));
const chartVal = () => CH.map((r) => `- **${r.set}**: ${r.ok ? 'PASS' : 'FAIL'}. ${r.checks.map((c) => `${c.name}: ${c.state.toUpperCase()} (${c.detail})`).join('; ')}`).join('\n');
const chartOther = () => table(['Set', 'Light', 'Dark'], [
  ['Sequential (azure, light to dark = low to high)', T.chart.sequential.light.map(code).join(' '), T.chart.sequential.dark.map(code).join(' ')],
  ['Ordinal (tiers, funnel stages)', T.chart.ordinal.light.map(code).join(' '), T.chart.ordinal.dark.map(code).join(' ')],
  ['Diverging (azure below, ember above)', T.chart.diverging.light.map(code).join(' '), T.chart.diverging.dark.map(code).join(' ')],
  ['Status: good / warning / serious / critical', Object.values(T.chart.status.light).map(code).join(' '), Object.values(T.chart.status.dark).map(code).join(' ')],
  ['Surface / grid / axis', `${code(T.chart.surface.light)} ${code(T.chart.grid.light)} ${code(T.chart.axis.light)}`, `${code(T.chart.surface.dark)} ${code(T.chart.grid.dark)} ${code(T.chart.axis.dark)}`],
]);

/* ---------------------------------------------------------------- contrast summary ---------- */
function textMatrix(theme) {
  const bds = Object.keys(CR.backdrops[theme]);
  const rows = ['fg', 'fg-muted', 'fg-subtle', 'accent', 'violet', 'mint', 'ember', 'sun', 'rose', 'info'].map((tok) => {
    const min = CR.rows.find((r) => r.theme === theme && r.group === 'text' && r.name === tok).min;
    return [code(tok), code(S[theme][tok]), min, ...bds.map((b) => { const v = ratio(theme, tok, b); return v == null ? '-' : v.toFixed(1); })];
  });
  return table(['Token', 'Hex', 'Min', ...bds], rows);
}

/* ---------------------------------------------------------------- files ---------- */
const kb = (f) => `${(statSync(f).size / 1024).toFixed(f.endsWith('.svg') ? 1 : 0)} KB`;
const logoFiles = () => readdirSync(OUT).sort().map((f) => `| ${code(f)} | ${kb(path.join(OUT, f))} |`);

/* ---------------------------------------------------------------- assemble ---------- */
const vars = {
  semantic_dark: semanticTable('dark'), semantic_light: semanticTable('light'),
  backdrops_dark: backdropTable('dark'), backdrops_light: backdropTable('light'),
  text_matrix_dark: textMatrix('dark'), text_matrix_light: textMatrix('light'),
  ramps: ramps(), gradients: gradients(), aurora: aurora(),
  type_web: typeWeb(), type_ios: typeIos(),
  spacing: spacing(), radius: radius(), elevation: elevation(), layout: layout(), zindex: zindex(), breakpoints: breakpoints(),
  glass_params: glassParams(), glass_ios: glassIos(),
  springs: springs(), durations: durations(), easings: easings(),
  tiers: tiers(), chart_table: chartTable(), chart_other: chartOther(), chart_validation: chartVal(),
  logo_files: `| File | Size |\n|---|---|\n${logoFiles().join('\n')}`,
  version: T.$meta.version, date: T.$meta.updated, pairs: String(CR.rows.length),
  accent_hover_dark: S.dark['accent-solid-hover'],
};
let tpl = readFileSync(path.join(HERE, 'BRAND.template.md'), 'utf8');
tpl = tpl.replace(/\{\{c:(dark|light)\.([\w-]+)\}\}/g, (_, th, k) => { const v = S[th][k]; if (!v) throw new Error(`unknown semantic ${th}.${k}`); return `\`${v}\``; });
tpl = tpl.replace(/\{\{p:(\w+)\.(\d+)\}\}/g, (_, r, s) => { const v = T.color.primitive[r]?.[s]; if (!v) throw new Error(`unknown primitive ${r}.${s}`); return `\`${v}\``; });
tpl = tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vars)) throw new Error(`BRAND.template.md: unknown placeholder {{${k}}}`); return vars[k]; });
writeFileSync(path.join(ROOT, 'brand/BRAND.md'), tpl);
console.log(`brand/BRAND.md written (${(Buffer.byteLength(tpl) / 1024).toFixed(0)} KB, ${tpl.split('\n').length} lines)`);
