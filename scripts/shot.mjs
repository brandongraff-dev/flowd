#!/usr/bin/env node
// Screenshot helper for the flowd web app. Run from the repo root:
//
//   node scripts/shot.mjs /brand --w 1440 --h 900 --dark
//   node scripts/shot.mjs / /pricing /brand --w 390 --h 844 --light --full
//
// Output: .shots/<name>.png (view it with the Read tool). Needs the dev server on
// http://localhost:3000 (npm run web:dev) and Chrome or Edge installed.
// playwright-core is resolved from apps/web/node_modules; no root install needed.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const THEME_KEY = "flowd-theme"; // keep in sync with apps/web/src/lib/theme.ts

const USAGE = `Usage: node scripts/shot.mjs <path> [<path> ...] [flags]

Paths are routes on the dev server ("/", "/brand", "/pricing"); full URLs also work.

Flags
  --w <px>           viewport width            (default 1440)
  --h <px>           viewport height           (default 900)
  --name <name>      output file name          (default <slug>-<w>x<h>[-full][-theme])
  --full             full-page capture (scrolls through the page first so in-view animations fire)
  --dark / --light   force the theme (sets localStorage + data-theme + emulated colour scheme).
                     Pass both to get one shot per theme (suffixed -dark / -light).
  --wait <ms>        extra wait before the shot (default 400; raise for JS count-ups)
  --scroll <px>      scroll the window to this offset before a viewport shot
  --dpr <n>          device scale factor       (default 1)
  --reduce-motion    emulate prefers-reduced-motion: reduce
  --mobile / --no-mobile   force or disable mobile emulation (default: on when width <= 500)
  --base <url>       dev server origin         (default http://localhost:3000, or $FLOWD_URL)
  --out <dir>        output directory          (default .shots)
  --timeout <ms>     navigation timeout        (default 45000)
  --help             this text

Exit codes: 0 ok, 1 capture failed, 2 dev server unreachable, 3 no Chrome/Edge found, 4 bad arguments.

Git Bash note: it rewrites "/brand" into "C:/Program Files/Git/brand" before Node sees it;
this script undoes that, so plain "/brand" works. Relative forms ("brand") work everywhere.`;

const VALUE_FLAGS = new Set(["w", "h", "name", "wait", "scroll", "dpr", "base", "out", "timeout"]);
const BOOL_FLAGS = new Set(["full", "dark", "light", "reduce-motion", "mobile", "no-mobile", "help"]);

function fail(message, code = 1) {
  console.error(`shot: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {};
  const targets = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      targets.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (BOOL_FLAGS.has(key)) {
      opts[key] = true;
    } else if (VALUE_FLAGS.has(key)) {
      const value = eq === -1 ? argv[(i += 1)] : arg.slice(eq + 1);
      if (value === undefined || value.startsWith("--")) fail(`--${key} needs a value\n\n${USAGE}`, 4);
      opts[key] = value;
    } else {
      fail(`unknown flag --${key}\n\n${USAGE}`, 4);
    }
  }
  return { opts, targets };
}

function toNumber(raw, fallback, label, { min = 0 } = {}) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) fail(`--${label} must be a number >= ${min} (got "${raw}")`, 4);
  return value;
}

/** Roots Git Bash may prepend to a "/route" argument (MSYS path conversion). */
function gitBashRoots() {
  const roots = new Set();
  const add = (value) => value && roots.add(value.replace(/\\/g, "/").replace(/\/+$/, ""));
  add(process.env.EXEPATH);
  if (process.env.EXEPATH) add(path.dirname(process.env.EXEPATH));
  add(process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}/Git`);
  add(process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Programs/Git`);
  add("C:/Program Files/Git");
  add("C:/Program Files (x86)/Git");
  return [...roots];
}

function normalizeTarget(raw) {
  let value = raw.replace(/\\/g, "/");
  if (/^https?:\/\//i.test(value)) return { url: value, route: new URL(value).pathname + new URL(value).search };
  const lower = value.toLowerCase();
  for (const root of gitBashRoots()) {
    const r = root.toLowerCase();
    if (lower === r) {
      value = "/";
      break;
    }
    if (lower.startsWith(`${r}/`)) {
      value = value.slice(root.length);
      break;
    }
  }
  if (!value.startsWith("/")) value = `/${value}`;
  return { route: value };
}

function slugify(route) {
  const slug = route
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "home";
}

function normalizePosix(p) {
  return p.replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------

async function ensureServer(base) {
  try {
    const response = await fetch(`${base}/`, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
    return response.status;
  } catch (error) {
    const reason = error?.cause?.code ?? error?.name ?? "unknown error";
    fail(
      `the flowd web server is not reachable at ${base} (${reason}).\n` +
        "       Start it first:  npm run web:dev   (from the repo root)\n" +
        "       or:              npm --prefix apps/web run dev",
      2,
    );
    return 0;
  }
}

function loadPlaywright() {
  try {
    const require = createRequire(path.join(repoRoot, "apps", "web", "package.json"));
    return require("playwright-core");
  } catch {
    fail("playwright-core was not found. Run `npm install` in apps/web first.", 1);
    return null;
  }
}

function executableCandidates() {
  const local = process.env.LOCALAPPDATA ? normalizePosix(process.env.LOCALAPPDATA) : null;
  return [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    local && `${local}/Google/Chrome/Application/chrome.exe`,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((candidate) => candidate && fs.existsSync(candidate));
}

async function launchBrowser(chromium) {
  const args = ["--hide-scrollbars", "--force-color-profile=srgb"];
  const attempts = [
    { label: "Chrome (channel chrome)", options: { channel: "chrome" } },
    { label: "Edge (channel msedge)", options: { channel: "msedge" } },
    ...executableCandidates().map((executablePath) => ({ label: executablePath, options: { executablePath } })),
  ];
  const errors = [];
  for (const attempt of attempts) {
    try {
      return await chromium.launch({ headless: true, args, ...attempt.options });
    } catch (error) {
      errors.push(`  - ${attempt.label}: ${String(error?.message ?? error).split("\n")[0]}`);
    }
  }
  fail(`could not launch Chrome or Edge.\n${errors.join("\n")}\n       Set CHROME_PATH to a chrome.exe / msedge.exe.`, 3);
  return null;
}

async function warmScroll(page) {
  // Walk down the page so whileInView / IntersectionObserver content renders, then return to the top.
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const step = Math.max(240, Math.floor(window.innerHeight * 0.75));
    const maxY = () => Math.min(document.documentElement.scrollHeight - window.innerHeight, 40_000);
    let y = 0;
    for (let i = 0; i < 80 && y < maxY(); i += 1) {
      y = Math.min(y + step, maxY());
      window.scrollTo({ top: y, behavior: "instant" });
      await wait(110);
    }
    await wait(250);
    window.scrollTo({ top: 0, behavior: "instant" });
    await wait(150);
  });
}

async function settle(page, capMs) {
  // Wait for finite CSS/WAAPI animations to finish (infinite loops are ignored), then two frames.
  await page.evaluate(async (cap) => {
    const running = () =>
      document.getAnimations().filter((animation) => {
        try {
          const timing = animation.effect?.getComputedTiming?.();
          return Boolean(timing) && Number.isFinite(timing.endTime) && animation.playState === "running";
        } catch {
          return false;
        }
      });
    const deadline = performance.now() + cap;
    while (performance.now() < deadline) {
      const pending = running();
      if (pending.length === 0) break;
      await Promise.race([
        Promise.allSettled(pending.map((animation) => animation.finished)),
        new Promise((resolve) => setTimeout(resolve, 250)),
      ]);
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, capMs);
}

async function capture(browser, job, settings) {
  const { url, theme, file, label } = job;
  const context = await browser.newContext({
    viewport: { width: settings.width, height: settings.height },
    deviceScaleFactor: settings.dpr,
    isMobile: settings.mobile,
    hasTouch: settings.mobile,
    colorScheme: theme ?? undefined,
    reducedMotion: settings.reduceMotion ? "reduce" : "no-preference",
    locale: "en-US",
    timezoneId: "UTC",
  });
  const issues = [];
  try {
    if (theme) {
      await context.addInitScript(
        ({ key, value }) => {
          try {
            window.localStorage.setItem(key, value);
          } catch {
            // storage blocked: the data-theme assignment below still applies
          }
        },
        { key: THEME_KEY, value: theme },
      );
    }
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text().split("\n")[0];
      // Chrome logs the document's own 4xx/5xx as a console error; the HTTP status in the report covers it.
      if (text.startsWith("Failed to load resource") && message.location().url === new URL(url).href) return;
      issues.push(`console.error: ${text}`);
    });
    page.on("pageerror", (error) => issues.push(`pageerror: ${String(error.message).split("\n")[0]}`));

    const response = await page.goto(url, { waitUntil: "load", timeout: settings.timeout });
    const status = response ? response.status() : 0;
    await page.waitForLoadState("networkidle", { timeout: Math.min(settings.timeout, 10_000) }).catch(() => {
      issues.push("network never went idle within 10s (continuing)");
    });
    await page.evaluate(async (forced) => {
      if (forced) {
        document.documentElement.dataset.theme = forced;
        document.documentElement.style.colorScheme = forced;
      }
      await document.fonts.ready;
    }, theme ?? null);

    if (settings.full) await warmScroll(page);
    if (settings.scroll > 0) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), settings.scroll);
      await page.waitForTimeout(450);
    }
    await settle(page, 4_000);
    await page.waitForTimeout(settings.wait);

    const applied = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
    if (theme && applied !== theme) issues.push(`requested theme "${theme}" but <html data-theme> is "${applied}"`);

    await page.screenshot({ path: file, fullPage: settings.full, caret: "hide" });
    const flags = [theme, settings.full ? "full" : null, settings.mobile ? "mobile" : null].filter(Boolean).join(", ");
    console.log(`ok  ${normalizePosix(file)}  [${label} ${settings.width}x${settings.height}${flags ? `, ${flags}` : ""}, HTTP ${status}]`);
    if (status >= 400) console.log(`    note: server answered HTTP ${status} (screenshot shows that page)`);
    for (const issue of issues.slice(0, 6)) console.log(`    ! ${issue}`);
    if (issues.length > 6) console.log(`    ! ... and ${issues.length - 6} more`);
    return true;
  } catch (error) {
    console.error(`FAIL ${label}: ${String(error?.message ?? error).split("\n")[0]}`);
    return false;
  } finally {
    await context.close();
  }
}

async function main() {
  const { opts, targets: rawTargets } = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return;
  }
  if (rawTargets.length === 0) fail(`give at least one path, e.g. /brand\n\n${USAGE}`, 4);

  const settings = {
    width: toNumber(opts.w, 1440, "w", { min: 100 }),
    height: toNumber(opts.h, 900, "h", { min: 100 }),
    wait: toNumber(opts.wait, 400, "wait"),
    scroll: toNumber(opts.scroll, 0, "scroll"),
    dpr: toNumber(opts.dpr, 1, "dpr", { min: 0.5 }),
    timeout: toNumber(opts.timeout, 45_000, "timeout", { min: 1000 }),
    full: Boolean(opts.full),
    reduceMotion: Boolean(opts["reduce-motion"]),
  };
  settings.mobile = opts["no-mobile"] ? false : Boolean(opts.mobile) || settings.width <= 500;

  const base = (opts.base ?? process.env.FLOWD_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const outDir = path.resolve(repoRoot, opts.out ?? ".shots");
  fs.mkdirSync(outDir, { recursive: true });

  const themes = [opts.dark ? "dark" : null, opts.light ? "light" : null].filter(Boolean);
  const themeRuns = themes.length > 0 ? themes : [null];
  const explicitName = opts.name ? opts.name.replace(/\.png$/i, "") : null;

  const jobs = [];
  for (const raw of rawTargets) {
    const target = normalizeTarget(raw);
    const slug = slugify(target.route);
    for (const theme of themeRuns) {
      let stem;
      if (explicitName) {
        stem = rawTargets.length > 1 ? `${explicitName}-${slug}` : explicitName;
        if (themeRuns.length > 1) stem += `-${theme}`;
      } else {
        stem = `${slug}-${settings.width}x${settings.height}${settings.full ? "-full" : ""}${theme ? `-${theme}` : ""}`;
      }
      jobs.push({
        url: target.url ?? `${base}${target.route}`,
        label: target.route,
        theme,
        file: path.join(outDir, `${stem}.png`),
      });
    }
  }

  await ensureServer(base);
  const playwright = loadPlaywright();
  const browser = await launchBrowser(playwright.chromium);
  let failures = 0;
  try {
    for (const job of jobs) {
      const ok = await capture(browser, job, settings);
      if (!ok) failures += 1;
    }
  } finally {
    await browser.close();
  }
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`shot: ${String(error?.stack ?? error)}`);
  process.exit(1);
});
