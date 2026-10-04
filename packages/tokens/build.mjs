// flowd design-token build. Plain Node, zero dependencies.
//   node build.mjs            verify + generate dist/*
//   node build.mjs --check    verify only (contrast + chart palettes), no files written
//   node build.mjs --no-verify  generate even if a contrast rule fails (do not ship)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadTokens, PKG_DIR } from './lib/tokens.mjs';
import { runContrastChecks, contrastMarkdown } from './lib/contrast.mjs';
import { runChartChecks, chartMarkdown } from './lib/chart-check.mjs';
import { emitTokensCss, emitRecipesCss, emitTailwindCss } from './lib/emit-css.mjs';
import { emitSwift } from './lib/emit-swift.mjs';
import { emitMjs, emitDts } from './lib/emit-ts.mjs';

const args = new Set(process.argv.slice(2));
const { tokens: t } = loadTokens();

// ---- 1. verify ---------------------------------------------------------------------------------
const contrast = runContrastChecks(t);
const charts = runChartChecks(t);
const chartFails = charts.filter((c) => !c.ok);
const semDark = Object.keys(t.color.semantic.dark).sort().join();
const semLight = Object.keys(t.color.semantic.light).sort().join();
const problems = [];
if (semDark !== semLight) problems.push('semantic colour keys differ between dark and light');
for (const f of contrast.failures) problems.push(`contrast ${f.theme}/${f.group}: ${f.name} on ${f.backdrop} = ${f.ratio.toFixed(2)} (< ${f.min})`);
for (const c of chartFails) problems.push(`chart palette failed: ${c.set}`);

console.log(`contrast: ${contrast.rows.length} pairs checked, ${contrast.failures.length} failing`);
console.log(`charts:   ${charts.length} palette checks, ${chartFails.length} failing`);
if (problems.length) {
  console.error(`\n${problems.length} token problem(s):\n - ${problems.join('\n - ')}`);
  if (!args.has('--no-verify')) process.exit(1);
}
if (args.has('--check')) process.exit(0);

// ---- 2. emit ------------------------------------------------------------------------------------
const dist = path.join(PKG_DIR, 'dist');
mkdirSync(dist, { recursive: true });
const files = {
  'tokens.css': emitTokensCss(t),
  'recipes.css': emitRecipesCss(t),
  'tailwind.css': emitTailwindCss(t),
  'Tokens.swift': emitSwift(t),
  'tokens.mjs': emitMjs(t),
  'tokens.d.ts': emitDts(t),
  'tokens.resolved.json': `${JSON.stringify(t, null, 2)}\n`,
  'contrast-report.md': `${contrastMarkdown(contrast)}\n${chartMarkdown(charts)}`,
};
for (const [name, body] of Object.entries(files)) {
  writeFileSync(path.join(dist, name), body, 'utf8');
  console.log(`wrote dist/${name} (${(Buffer.byteLength(body) / 1024).toFixed(1)} KB)`);
}
