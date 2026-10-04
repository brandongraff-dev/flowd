// Builds brand/preview.html: the single-file brand board (design north star).
//   node packages/tokens/build.mjs && node brand/src/build-logos.mjs && node brand/src/build-preview.mjs
// Inlines tokens.css + recipes.css, the three OFL fonts (base64) and the logo SVGs, so the file opens offline.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { HERE, OUT } from './logo-lib.mjs';
import { loadTokens } from '../../packages/tokens/lib/tokens.mjs';
import { runContrastChecks } from '../../packages/tokens/lib/contrast.mjs';
import { runChartChecks } from '../../packages/tokens/lib/chart-check.mjs';
import { parseColor, contrast, toHex, over } from '../../packages/tokens/lib/color.mjs';
import { springModel, springLinear } from '../../packages/tokens/lib/motion.mjs';
import { auroraCss } from '../../packages/tokens/lib/emit-css.mjs';
import { sections } from './preview/sections.mjs';

const ROOT = path.resolve(HERE, '../..');
const DIST = path.join(ROOT, 'packages/tokens/dist');
const read = (p) => readFileSync(p, 'utf8');
const b64 = (p) => readFileSync(p).toString('base64');
const font = (file) => path.join(HERE, 'fonts', file);

const { tokens: T } = loadTokens(path.join(ROOT, 'packages/tokens/tokens.json'));
const ctx = {
  T, ROOT, OUT,
  svg: (name) => read(path.join(OUT, name)).replace(/<\?xml[^>]*\?>/, '').trim(),
  svgInner: (name) => read(path.join(OUT, name)),
  contrastReport: runContrastChecks(T),
  chartReport: runChartChecks(T),
  color: { parseColor, contrast, toHex, over },
  motion: { springModel, springLinear },
  auroraDark: auroraCss(T.aurora.dark, 620),
  auroraLight: auroraCss(T.aurora.light, 620),
};

const fontFaces = existsSync(font('Geist-Variable.woff2'))
  ? `@font-face{font-family:"Bricolage Grotesque Variable";font-style:normal;font-weight:200 800;font-display:swap;src:url(data:font/woff2;base64,${b64(font('BricolageGrotesque-opsz-latin.woff2'))}) format("woff2")}
@font-face{font-family:"Geist Variable";font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${b64(font('Geist-Variable.woff2'))}) format("woff2")}
@font-face{font-family:"Geist Mono Variable";font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${b64(font('GeistMono-latin-wght.woff2'))}) format("woff2")}`
  : '/* fonts missing: falling back to system stacks */';

const typeClasses = Object.entries(T.typography.scale).map(([n, s]) =>
  `.t-${n}{font-family:var(--fd-font-${s.family});font-size:var(--fd-text-${n}-size);line-height:var(--fd-text-${n}-lh);letter-spacing:var(--fd-text-${n}-tracking);font-weight:var(--fd-text-${n}-weight);${s.tabular ? 'font-variant-numeric:tabular-nums;' : ''}${s.case ? `text-transform:${s.case};` : ''}}`).join('\n');

const css = read(path.join(HERE, 'preview/board.css'));
const body = sections(ctx);
const js = read(path.join(HERE, 'preview/board.js'))
  .replace('/*SPRINGS*/', JSON.stringify(Object.fromEntries(Object.entries(T.motion.spring).map(([k, v]) => [k, { ...springLinear(v), ...(({ x, ...r }) => r)(springModel(v)) }]))));

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>flowd brand board</title>
<meta name="description" content="flowd brand board: Lagoon Glass identity, logo, colour, type, glass material, tiers, charts and app mock.">
<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(read(path.join(OUT, 'favicon.svg'))).toString('base64')}">
<style>
${fontFaces}
${read(path.join(DIST, 'tokens.css'))}
${read(path.join(DIST, 'recipes.css'))}
${typeClasses}
${css}
</style>
</head>
<body class="fd-base">
<div class="fd-aurora" aria-hidden="true"></div>
${body}
<script>
${js}
</script>
</body>
</html>
`;
writeFileSync(path.join(ROOT, 'brand/preview.html'), html);
console.log(`brand/preview.html written (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
