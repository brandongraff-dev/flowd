// Rasterises brand/logo/*.svg to PNG with headless Chrome/Edge. Zero npm dependencies (set CHROME_PATH to override the browser).
//   node brand/src/rasterize.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { OUT } from './logo-lib.mjs';
import { decodePng, encodePng, crop, flatten, encodeIco } from './png.mjs';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('No Chrome/Edge found. Set CHROME_PATH.'); process.exit(1); }

const tmp = mkdtempSync(path.join(os.tmpdir(), 'flowd-raster-'));

/** Render an SVG at exact w x h. opaque=true flattens onto white and writes an alpha-free PNG. */
function render(svgName, w, h, { opaque = false } = {}) {
  const svg = pathToFileURL(path.join(OUT, svgName)).href;
  const html = path.join(tmp, `${path.basename(svgName)}-${w}x${h}.html`);
  const shot = path.join(tmp, `${path.basename(svgName)}-${w}x${h}.png`);
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}img{display:block;width:${w}px;height:${h}px}</style><img src="${svg}">`);
  const W = Math.max(w, 600), H = Math.max(h, 600);
  const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=00000000',
    `--window-size=${W},${H}`, `--screenshot=${shot}`, '--virtual-time-budget=3000', pathToFileURL(html).href], { encoding: 'utf8' });
  if (!existsSync(shot)) throw new Error(`render failed for ${svgName}: ${r.stderr?.slice(0, 300)}`);
  let img = crop(decodePng(readFileSync(shot)), 0, 0, w, h);
  if (opaque) img = flatten(img);
  return encodePng(img, { alpha: !opaque });
}

const jobs = [
  // [svg, out png, w, h, opaque]
  ['app-icon.svg', 'app-icon-1024.png', 1024, 1024, true],
  ['app-icon-dark.svg', 'app-icon-dark-1024.png', 1024, 1024, true],
  ['app-icon-tinted.svg', 'app-icon-tinted-1024.png', 1024, 1024, true],
  ['app-icon-layer-bg.svg', 'app-icon-layer-bg-1024.png', 1024, 1024, true],
  ['app-icon-layer-fg.svg', 'app-icon-layer-fg-1024.png', 1024, 1024, false],
  ['app-icon-rounded.svg', 'app-icon-rounded-512.png', 512, 512, false],
  ['app-icon.svg', 'favicon-180.png', 180, 180, true],   // apple-touch-icon: full-bleed, opaque, iOS rounds it
  ['app-icon.svg', 'favicon-192.png', 192, 192, true],   // PWA
  ['app-icon.svg', 'favicon-512.png', 512, 512, true],   // PWA
  ['favicon.svg', 'favicon-16.png', 16, 16, false],
  ['favicon.svg', 'favicon-32.png', 32, 32, false],
  ['favicon.svg', 'favicon-48.png', 48, 48, false],
  ['og-image.svg', 'og-image.png', 1200, 630, true],
  ['flowd-mark.svg', 'flowd-mark-1024.png', 1024, 1024, false],
];
for (const [svg, out, w, h, opaque] of jobs) {
  writeFileSync(path.join(OUT, out), render(svg, w, h, { opaque }));
  console.log('wrote', out);
}
// lockups keep their aspect ratio: read it from the SVG header
for (const name of ['flowd-lockup-on-dark', 'flowd-lockup-on-light', 'flowd-lockup-stacked-on-dark', 'flowd-lockup-stacked-on-light']) {
  const head = readFileSync(path.join(OUT, `${name}.svg`), 'utf8').match(/width="([\d.]+)" height="([\d.]+)"/);
  const aspect = Number(head[1]) / Number(head[2]);
  const w = name.includes('stacked') ? 1000 : 1600, h = Math.round(w / aspect);
  writeFileSync(path.join(OUT, `${name}.png`), render(`${name}.svg`, w, h));
  console.log('wrote', `${name}.png`, `${w}x${h}`);
}
// favicon.ico (16, 32, 48)
const ico = encodeIco([16, 32, 48].map((size) => ({ size, png: readFileSync(path.join(OUT, `favicon-${size}.png`)) })));
writeFileSync(path.join(OUT, 'favicon.ico'), ico);
console.log('wrote favicon.ico');
rmSync(tmp, { recursive: true, force: true });
