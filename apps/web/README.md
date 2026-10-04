# flowd web

Next.js 16 (App Router, React 19, Turbopack) app for flowd: marketing site, free tools, brand dashboard, creator web portal, admin and the mock `/api/v1` backend. Read `docs/CONVENTIONS.md` first; this file only covers how the app is wired.

## Commands

Run from `apps/web` (or from the repo root with `npm --prefix apps/web run <script>`; the root also has `web:dev`, `web:build`, `web:typecheck`, `web:test`).

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 (Turbopack). The lead runs the shared one; do not start your own. |
| `npm run build` | Production build (also typechecks). Lead only while others are editing. |
| `npm run start` | Serve the production build. |
| `npm run typecheck` | `next typegen && tsc --noEmit` (route types, then the whole project). |
| `npm run lint` | `eslint .` (flat config: `eslint-config-next` core-web-vitals + typescript, plus no `any`, described `@ts-ignore`, `_`-prefixed unused vars, inline `type` imports). |
| `npm run test` | `vitest run` (node environment, `src/**/*.test.ts`, passes when there are no tests yet). |

From the repo root: `npm run sync` copies generated tokens/contract files into the apps; `node scripts/shot.mjs ...` takes screenshots.

**Typechecking only your own files while others are mid-edit** (see conventions section 3):

```bash
cd apps/web && npx tsc --noEmit --incremental false 2>&1 | grep -E "src/(app/brand|components/features/brand)"
```

`--incremental false` matters: with many agents the shared `.next/cache/tsc.tsbuildinfo` would otherwise be written concurrently.

## Installed versions

next 16.3.8 · react / react-dom 19.3.0 · typescript 6.0.3 · tailwindcss + @tailwindcss/postcss 4.3.3 · motion 14.0.0 · lucide-react 1.51.0 · sonner 2.0.8 · cmdk 1.1.1 · zustand 5.0.15 · zod 4.6.5 · class-variance-authority 0.7.1 · clsx 2.1.1 · tailwind-merge 3.7.0 · d3-scale 4.0.2 / d3-shape 3.2.0 / d3-array 3.2.4 · geist 1.7.2 · @fontsource-variable/bricolage-grotesque 5.3.0 · vitest 5.0.3 (+ vite 8.3.2) · eslint 9.39.5 + eslint-config-next 16.3.8 · playwright-core 1.63.0 · @types/node 24.19.1. Radix: `@radix-ui/react-*` accordion 1.2.20, avatar 1.2.6, checkbox 1.3.11, dialog 1.1.23, dropdown-menu 2.1.24, hover-card 1.1.23, label 2.1.15, popover 1.1.23, progress 1.1.16, radio-group 1.4.7, scroll-area 1.2.18, select 2.3.7, separator 1.1.15, slider 1.4.7, slot 1.3.3, switch 1.3.7, tabs 1.1.21, toggle-group 1.1.19, tooltip 1.2.16, visually-hidden 1.2.11. Exact resolved tree is in `package-lock.json`.

Two deliberate version choices:

- **TypeScript 6.0.3, not 7.0.2.** 7.x is the native (Go) compiler with no stable JS API, and `typescript-eslint` (pulled in by `eslint-config-next`) declares `typescript <6.1.0`. Move to 7 once typescript-eslint supports it.
- **ESLint 9.39.5, not 10.x.** `eslint-plugin-react`, `eslint-plugin-jsx-a11y` and `eslint-plugin-import` (all dependencies of `eslint-config-next`) still declare `eslint <=9`. npm prints a "no longer supported" deprecation warning for 9.39.5 on install; that is expected.

Gotcha: **`lucide-react` v1 has no brand icons** (no Instagram, YouTube, GitHub...). For platform marks use text or a small generic glyph as the conventions say.

Next 16.3 also writes `AGENTS.md` / `CLAUDE.md` into this folder on first `next dev` (a pointer to the version-matched docs in `node_modules/next/dist/docs/`). Keep them; they are re-created if deleted.

## Structure

```
src/app/
  layout.tsx            fonts, <html data-theme>, no-flash theme script, skip link, <Providers>
  globals.css           tailwind v4 import, token imports, base styles, reduced-motion / transparency / contrast rules
  page.tsx              SCAFFOLD placeholder for "/" (delete when (marketing)/page.tsx lands; two pages cannot share "/")
  not-found.tsx  error.tsx  icon.svg
  (marketing)/ (tools)/ (public)/ (auth)/      route groups, empty until the area agents fill them
  brand/ creator/ admin/ api/v1/               dashboards, portal, admin, mock backend
src/components/
  ui/ glass/ charts/ shell/ brand/             design system (foundation agent; additive edits only)
  shell/theme-provider.tsx theme-switch.tsx app-toaster.tsx providers.tsx   scaffold, already here
  features/<area>/                             feature components, one folder per area
src/lib/
  utils.ts              cn()
  theme.ts              theme constants + the init script string (server-safe)
  engine/ store/ data/ ai/ hooks/ contract/    contract/ is synced, do not hand-edit
src/styles/
  tokens.css            runtime CSS variables (SYNCED from packages/tokens/dist/tokens.css; placeholder until then)
  theme.css             web-owned Tailwind @theme mapping from those variables to utilities
  tailwind-tokens.css   optional overlay (SYNCED from packages/tokens/dist/tailwind.css; empty placeholder until then)
src/data/fixtures/      synced fixtures (never import raw JSON from pages; go through src/lib/data)
public/                 static files (openapi.yaml is synced here)
```

Every route group with data needs its own `loading.tsx` and `error.tsx`; every page exports `metadata`. Put `id="main"` on each page's `<main>` so the skip link in the root layout works.

## Theming

- `<html data-theme="light|dark">` is always the **resolved** theme. The user's choice (`light | dark | system`) is stored in `localStorage["flowd-theme"]` and mirrored in `data-theme-pref`. A blocking inline script in `<head>` applies it before first paint (no flash). First visit defaults to **dark** (`DEFAULT_THEME` in `src/lib/theme.ts`).
- Client API: `import { useTheme } from "@/components/shell/theme-provider"` gives `{ theme, resolvedTheme, setTheme }`. `<ThemeSwitch />` (`@/components/shell/theme-switch`) is a ready-made 3-way control.
- Tailwind `dark:` / `light:` variants follow `data-theme`, not the OS setting.
- Toasts: `import { toast } from "sonner"`; the glass-styled host is already mounted (top-center, themed). Motion respects the OS reduced-motion setting globally (`MotionConfig reducedMotion="user"`).
- Fonts: `font-display` (Bricolage Grotesque, optical-size axis), `font-sans` (Geist), `font-mono` (Geist Mono); all self-hosted. Use `tabular-nums` for money.

### Variable contract between tokens and Tailwind

`theme.css` expects these runtime variables from `tokens.css` (the placeholder defines them for dark and `[data-theme="light"]`):

`--canvas --canvas-raised --surface --surface-raised --surface-solid --fg --fg-muted --fg-subtle --fg-on-accent --rim --rim-strong --focus --violet --azure --lagoon --mint --ember --sun --rose --gradient-flow --aurora-a/b/c --glass-blur --glass-sat --glass-tint --glass-rim-hi --glass-rim-lo --glass-highlight --elev-glass --elev-pop`

That produces utilities such as `bg-canvas bg-surface text-fg text-fg-muted border-rim text-mint bg-ember rounded-xl shadow-glass ease-glass`. If the real `packages/tokens` output uses different names, edit only `src/styles/theme.css` (or ship a `dist/tailwind.css` theme fragment and let sync copy it to `tailwind-tokens.css`; it is imported last and wins).

## Seeing your work

```bash
node scripts/shot.mjs /brand --w 1440 --h 900 --dark            # one theme
node scripts/shot.mjs / /pricing --w 390 --h 844 --light --full # several routes, full page
node scripts/shot.mjs /brand --dark --light                     # one shot per theme
```

Writes `.shots/<name>.png` and prints the path (open it with the Read tool). Flags: `--w --h --name --full --dark --light --wait <ms> --scroll <px> --dpr --reduce-motion --mobile/--no-mobile --base --out --timeout --help`. It waits for fonts, network idle and finite animations, reports console errors, and exits with code 2 if the dev server is down. Chrome (or Edge) must be installed; set `CHROME_PATH` to override. Check desktop and mobile, dark and light.

## Windows / OneDrive notes

- **Git Bash rewrites `/brand` into `C:/Program Files/Git/brand`** before Node sees it. `shot.mjs` undoes this, so plain `/brand` works. For your own commands use PowerShell, or `MSYS_NO_PATHCONV=1`, or write routes without a leading slash.
- `node_modules` is about 590 MB / 28,700 files. If OneDrive is syncing this folder, expect slow `find`/`du` scans and sync churn: pause OneDrive while installing, and never add another `node_modules` (one install, in `apps/web`).
- Windows long paths are off (`LongPathsEnabled=0`). The longest absolute path in `node_modules` is 192 characters (limit 260), so there is about 68 characters of headroom at the current repo depth. Do not move the repo much deeper, and keep route folder names short.
- `.next/` is large and rewritten constantly. If the build ever fails with `EPERM`/`EBUSY`, stop the dev server and any file watchers, retry, and as a last resort delete `apps/web/.next`.
