# flowd — Engineering & Design Conventions (READ FIRST, EVERY AGENT)

This file is the contract between every agent working on flowd. If something here conflicts with your instincts, follow this file. If something is missing, make the most conservative, consistent choice and note it in your final report.

---

## 0. What we are building

**flowd** is an open creator market for app growth. App teams ("brands") fund *bounties*; creators compete for them; models price, score and QA every video; money flows (via escrow + double-entry ledger) to whatever actually drives views, installs, trials and paid subscriptions. It is a better, stronger competitor to **Trybe (jointrybe.com)** and **Whop Content Rewards**.

Deliverables of this repository:

| # | Deliverable | Where |
|---|-------------|-------|
| 1 | Brand system (name, logo, voice, tokens) | `brand/`, `packages/tokens/` |
| 2 | Web app: marketing site + free tools + brand dashboard + creator web portal + admin | `apps/web/` |
| 3 | Native **SwiftUI** creator app (iOS 17+, Liquid Glass on iOS 26) incl. Live Activity widget | `apps/ios/` |
| 4 | Backend contract: OpenAPI, Postgres/Supabase schema + RLS, fixtures, TS engine | `packages/contract/`, `supabase/`, `apps/web/src/lib/engine` |
| 5 | ML service (FastAPI, heuristic day-one models + tests) | `services/ml/` |
| 6 | Docs (product spec, architecture, research, QA reports) | `docs/` |

**Source documents** (read the parts relevant to you — do not skim-read the whole thing every time):
- `docs/BLUEPRINT.md` — the user's blueprint. Section index (line numbers): Executive summary L5 · Competitor teardown L16 · Niche choice L29 · Vision/positioning L42 · **Market mechanics L65** · **Growth engine L92** · Launch playbook L129 · **Feature set L159** · **Creator Studio L193** · **Winning ad formats + hook library L239** · **ML systems L279** · Architecture L298 · **Data model L321** · **Business model L343** · Roadmap L368 · Risks L373.
- `docs/research/*.md` — competitor/creator/brand/design research (created in Wave 1).
- `docs/PRODUCT_SPEC.md` — blueprint + the extra features we add (created after research).
- `packages/contract/DOMAIN.md` — canonical entities, enums, vocabulary, formulas (created in Wave 2).
- `docs/ROUTES.md` / `docs/SCREENS.md` — canonical web route map and iOS screen map (created in Wave 2).
- `brand/BRAND.md` — brand book (created in Wave 1).

The user's ask, verbatim in spirit: *complete branding, complete flow, a beautiful web app UI, a SwiftUI app, Liquid Glass UI everywhere, strong visuals, strong typography/UX, better than Trybe, go far beyond the doc with features that help both creators and brands.* Execute at the highest bar.

---

## 1. Brand constants (non-negotiable)

- Product name: **flowd** — always lowercase, even at the start of a sentence in UI chrome. Pronounced "flowed". Brand-side product: "flowd for Brands". Fictional company: flowd, Inc.
- Terminology (use EXACTLY these words in UI copy, code identifiers and docs):
  - **bounty** (never "campaign"/"gig"), **creator** (never "influencer"), **brand** or **app team** (buyer), **submission**, **post**, **payout**, **pending → cleared** (earnings states), **Wallet**, **Studio**, **Market** (live prices), **rate card**, **Daily Drop**, **Crews**, **Tournaments**, **Tiers: Bronze → Silver → Gold → Platinum → Elite**, **Hook Score** (first-3-seconds check), **Flow Score** (overall predicted performance band), **Flo** (the in-app AI copilot), **Spec Market** (pre-made scored videos brands can license), **Winner promotion** (organic post → paid ad).
- Voice: confident, clear, a little playful; plain English; short sentences; numbers over adjectives; never hype income. Earnings language is FTC-careful: show *typical (median)* earnings beside any top-earner example; never "guaranteed income". Labels honesty: the day-one Flow Score/Hook Score are **checklist scores** — say so in the UI ("Checklist score — gets smarter as bounties settle").
- NEVER use real brand logos, real people, real photos or real company/app names as fake customers. Customers/apps/creators in demo data are **fictional**. Mentions of TikTok / Instagram / YouTube / Meta / Stripe / RevenueCat are fine as text or simple generic glyphs (not their trademarked logos).
- No remote images. All imagery is generated (SVG / CSS / canvas / gradients) so the app is fully offline-capable and licence-clean.
- Money: integers in **cents** everywhere in data. Format only at the edge (`formatMoney`). Rates as cents-per-1,000-views (CPM). Currency USD for v1.
- Disclosure: creator-facing posting flows always include `#ad` + brand wording (auto-disclosure).
- Public domain (OWNED by the user): **joinflowd.io** — use it in all product copy, demo data and links: short links `joinflowd.io/c/<handle>`, payout proof `joinflowd.io/p/<proof-id>`, tracking `joinflowd.io/r/<code>`, creator API `api.joinflowd.io`, brand app `app.joinflowd.io`, email `hello@joinflowd.io`. Never write `flowd.so`, `flowd.com` or `flowd.app` anywhere (see `docs/DOMAIN_CHECK.md`).

The brand agent finalises: logo, palette, typography, taglines, voice samples in `brand/BRAND.md`. **`brand/BRAND.md` now exists and overrides anything in this section about visuals.** Canonical tagline: **"Money follows what works."** Key facts: tokens are `--fd-*` CSS vars with Tailwind utilities (`bg-bg`, `bg-surface`, `bg-surface-glass-1`, `text-fg`, `text-fg-muted`, `border-rim`, `text-mint`, `bg-mint-solid text-on-mint`, `bg-accent-solid text-on-accent`, `font-display`, `text-display-xl`, `text-figure-hero`, `shadow-float`, `ease-spring-snappy` …); the default Tailwind palette is intentionally removed. Read `brand/BRAND.md` §§ colour, glass, motion before styling anything. Logo files: use `brand/logo/flowd-lockup-on-dark.svg` / `-on-light.svg` explicitly (the adaptive ones follow OS scheme, not the in-app toggle).

### Visual direction (the brief the brand agent works from)
- Product decisions and research-driven changes live in **`docs/DECISIONS.md`** (final feature set, fee ladder, corrections to the blueprint). Read it.
- Theme concept: **"Lagoon Glass"** — luminous deep-water darks, living gradient light, translucent liquid-glass surfaces that refract it. It should feel like the best Apple-quality fintech app crossed with a creator platform: premium, alive, fast.
- Dark-first, light mode fully supported (pearl/ice background with pastel aurora).
- Palette family (agent tunes & validates contrast): near-black ink-navy backgrounds ("Abyss"); signature **Flow gradient** ultraviolet → azure → lagoon-cyan; **Mint** = money/positive (always the colour of earnings going up); **Ember** = urgency/hot CTA/Daily Drop; **Sun** gold = Elite tier/featured; **Rose** = alerts/destructive. Semantic tokens only in product code.
- Type: Display **Bricolage Grotesque** (variable), UI/text **Geist Sans**, code/IDs **Geist Mono**; money & big figures use Bricolage with tabular numerals (`font-variant-numeric: tabular-nums`). iOS: SF Pro Rounded for display + numerals, SF Pro for text, SF Mono for figures (native feel; no bundled fonts).
- Logo: **flat, no gradients** — a lowercase ribbon-`f` mark with a **mint crossbar** (ink/ice letters + one mint accent). App icon and favicon: flat ink tile, ice-white ribbon-f, mint bar. The aurora/Flow gradient is UI atmosphere only and never appears inside the logo, app icon or favicon. Source: `brand/src/build-logos.mjs`.
- Imagery: aurora gradient orbs, glass cards, generated "video thumbnails" (gradients + shapes + big type), phone mock-ups built in HTML/CSS/SVG, charts. Strong, large, confident typography. Generous whitespace. Motion is spring-based and meaningful.

---

## 2. Liquid Glass design system (shared by web & iOS)

Glass is a **material**, not a decoration. Rules:

1. **Layers (amended after research — see `docs/research/liquid-glass.md`, `brand/BRAND.md` §19).** L0 = aurora background. **L1 = content surfaces = "quiet glass"** (low blur ~16 px, high-opacity ink scrim, Material on iOS) so text always passes AA over the aurora. **L2 = floating controls (nav, tab bar, toolbars, pills, FABs) and L3 = sheets/modals = real Liquid Glass** (blur 24/40 px, refractive rim, interactive). L2/L3 may float over L1 but **glass never samples glass**: no L2 on L2, no glass inside a glass control's own backdrop. Max two glass layers in any viewport region. Apple's HIG: real glass is for the navigation/control layer, never the content layer. Text on any glass must be AA against the *brightest aurora pixel* behind it; if not, raise the scrim — never lower the blur or tint text with `fg-subtle`.
2. **Anatomy of a glass surface (web):** use the tokens/recipes shipped by `packages/tokens/dist/{tokens.css,recipes.css}` (`--fd-glass-*` per layer, light/dark). Specular rim = 1 px gradient border via mask; inner highlight ≤ 6 % in dark; soft coloured shadow; pointer-tracking sheen only on L2/L3 (`--mx`/`--my`). **Chromium-only SVG lens/refraction** (feDisplacementMap) is a progressive enhancement on at most **three hero surfaces** (wallet hero card, Daily Drop, marketing hero), gated by `navigator.userAgentData`, with full CSS glass as the fallback everywhere else. Backdrop-root pitfalls (opacity/filter/mask/clip-path/blend/will-change on an ancestor kill backdrop-filter) are in the research doc — respect them.
3. **iOS:** use real Liquid Glass on iOS 26+ (`glassEffect`, `GlassEffectContainer`, `.buttonStyle(.glass)`, etc.) and `Material`-based fallback on iOS 17–25. **All glass usage goes through DesignSystem wrappers** (`.flowdGlass(...)`, `FlowdGlassContainer`, `FlowdGlassButtonStyle`...) which contain the `#available(iOS 26, *)` branches. Feature views NEVER call `glassEffect` directly.
4. **Accessibility fallbacks (mandatory):** an **in-app "Reduce glass" switch** (web: `html[data-transparency="reduce"]`, boot-script applied, because Safari/Firefox ignore `prefers-reduced-transparency`; iOS: mirrors system settings) + `prefers-reduced-transparency` / `accessibilityReduceTransparency` → solid, opaque tinted surfaces; `prefers-reduced-motion` / `accessibilityReduceMotion` → no parallax/sheen/spring overshoot; `prefers-contrast: more` → stronger rims. Text contrast ≥ WCAG AA (4.5:1 body, 3:1 large) on every glass surface in both themes.
5. **Concentric radii**: child radius = parent radius − padding. Scale tokens: 8 · 12 · 16 · 20 · 28 · 36 · pill.
6. **Numbers are heroes.** Money and counts are large, tabular-figure (**Bricolage Grotesque with `tnum`** on web, SF Pro Rounded on iOS — Geist Mono is for code/IDs only), animated on change (count-up, spring), Mint when positive. Always show pending vs cleared distinctly.
7. **Motion**: springs (stiffness ~300–500, damping ~28–40) for state changes; 150–250 ms ease-out for micro; stagger lists ≤ 40 ms/item; everything interruptible; honour reduced motion. Page transitions are subtle; the hero art may be rich.
8. **Empty / loading / error** states are designed (illustrated, with a primary action), never blank. Skeletons use shimmering glass.
9. **Responsive**: web works from 360 px to 1920 px; dashboard collapses side-nav to a floating glass bottom bar < 768 px; tables degrade to cards. Hit targets ≥ 44 px.
10. Consult the installed skills before designing (invoke with the Skill tool, apply what they say): `apple-design`, `emil-design-eng`, `interfaces:better-ui`, `interfaces:better-typography`, `interfaces:better-colors`, `interfaces:better-layout`, `interfaces:better-accessibility`, `interfaces:better-writing`, `animate`, `dataviz` (charts), `write-swift` (Swift), `ask-sonner` (toasts). The research file `docs/research/liquid-glass.md` has verified API signatures and code recipes — use it.

---

## 3. Repository map & ownership

```
flowd2.0/
├─ brand/                    logos, BRAND.md, social/OG art           (brand agent)
├─ docs/                     CONVENTIONS, BLUEPRINT, PRODUCT_SPEC, ROUTES, SCREENS, research/, qa/
├─ packages/
│  ├─ tokens/                tokens.json → dist/{tokens.css,Tokens.swift,tailwind.css}  (brand agent)
│  └─ contract/              DOMAIN.md, types.ts, openapi.yaml, fixtures/, scripts/    (contract agent)
├─ apps/
│  ├─ web/                   Next.js 16 app (see §4)
│  └─ ios/                   SwiftUI app (see §5)
├─ services/ml/              FastAPI + heuristics + pytest                              (ml agent)
├─ supabase/                 migrations/*.sql, seed.sql, README                         (backend agent)
├─ scripts/                  sync.mjs (fixtures/tokens → apps), shot.mjs (screenshots), checks
└─ .github/workflows/        web.yml, ios.yml (macOS runner compiles the Swift app)
```

**Source of truth flow:** `packages/tokens` and `packages/contract/fixtures` are canonical. `npm run sync` (root) copies generated artifacts into the apps (`apps/web/src/styles/tokens.css`, `apps/web/src/data/fixtures/*`, `apps/web/src/lib/contract/types.ts`, `apps/ios/Flowd/DesignSystem/Tokens.swift`, `apps/ios/Flowd/Resources/Fixtures/*`). Never hand-edit synced copies — edit the source and re-run sync.

### Multi-agent working rules (we run many agents concurrently in one working tree)
1. **Only create/edit files inside the paths your brief assigns you.** If you need a change in someone else's area, make the smallest **additive** change with the `Edit` tool (add a prop/variant/export — never rename/remove/restructure) and list it in your report under `touchedShared`. Never overwrite a shared file with `Write`.
2. Do **not** run `next build`, `next dev`, `npm install` (unless your brief says you own dependencies), `git` commands, or anything that rewrites shared state. A shared dev server runs on `http://localhost:3000`; use it to look at your pages (see §4 "Seeing your work").
3. Typecheck only your area: `cd apps/web && npx tsc --noEmit 2>&1 | grep -E "src/(<your paths>)"` — errors in other agents' in-flight files are not your problem; yours are. Fix all errors in your files before reporting.
4. No destructive commands (`rm -rf`, `del /s`, force-moves). Never delete files you did not create.
5. Platform: **Windows 11**, tools: PowerShell + Git Bash. Use forward slashes in code/config, no symlinks, no OS-specific scripts in the repo (Node `.mjs` only). The repo lives in OneDrive; keep file counts sane (no extra `node_modules`).
6. **No stubs masquerading as features.** No lorem ipsum, no `TODO: implement` in shipped UI, no dead buttons. If a feature is demo-mode, it still works end-to-end against the demo store and says so in a subtle "Demo data" affordance only where truthful.
7. Final report: return the structured JSON your brief asks for. Put long explanations in a file under `docs/` rather than in the report.

---

## 4. Web app (`apps/web`)

- **Stack:** Next.js 16 (App Router, React 19, Turbopack), TypeScript `strict` (no `any`, no `@ts-ignore` without a reason), Tailwind CSS v4 (CSS-first `@theme`, tokens from `src/styles/tokens.css`), `motion` (import from `motion/react`), Radix UI primitives (`@radix-ui/react-*`) for accessible behaviour, `lucide-react` icons only, `sonner` toasts, `cmdk` command palette, `zustand` store, `zod` validation, `class-variance-authority` + `clsx` + `tailwind-merge` (`cn()` in `src/lib/utils.ts`), `d3-scale`/`d3-shape`/`d3-array` for custom SVG charts, `vitest` for the engine. Fonts via `@fontsource-variable/*` / `geist` packages (offline-safe).
- **Layout:**
  ```
  src/app/(marketing)/...  (public marketing)      src/app/(tools)/...  (free tools & shareable reports)
  src/app/(public)/...     (c/[handle], proof/[id], b/[id])      src/app/(auth)/...
  src/app/brand/...        (brand dashboard)       src/app/creator/...  (creator web portal)
  src/app/admin/...        (trust & safety, launch control tower)      src/app/api/v1/...  (mock backend, OpenAPI-shaped)
  src/components/ui|glass|charts|shell|brand      (design system — foundation agent owns; additive edits only)
  src/components/features/<area>/                 (feature components — owned by the page agent for that area)
  src/lib/{utils,format,types? (contract),engine,store,data,ai,hooks}     src/data/fixtures/*  (synced)
  ```
- **Data access:** pages read/write through `src/lib/data` hooks/selectors backed by the persisted demo store (`src/lib/store`) seeded from fixtures. No page imports raw JSON directly. Mutations (create bounty, fund, approve, submit, payout, offer…) are real store actions that update every dependent view. Pure business logic (pricing, settlement, scoring, matching, market suggestions, funnel) lives in `src/lib/engine` and has Vitest tests.
- **Components:** Server Components by default for marketing; `"use client"` only where needed. Every route group with data has `loading.tsx` and `error.tsx`. Every page exports `metadata`. Semantic HTML, labelled controls, visible focus rings, keyboard-operable, `aria-live` for toasts/updates.
- **Styling:** Tailwind utilities using semantic theme colours (`bg-surface`, `text-fg-muted`, `border-rim`, `text-mint`…) defined from tokens. **No hex literals in components** (only in tokens/brand files and generated art). Use the glass primitives; don't reinvent them.
- **Charts:** only via `components/charts` (custom SVG; follow the `dataviz` skill; colour-blind-safe; labelled axes; tooltips; reduced-motion safe).
- **Links:** use only routes that exist in `docs/ROUTES.md`; if your page needs a route that is not listed, add it to your own area and note it in the report.
- **Seeing your work:** the shared dev server is at `http://localhost:3000`. Screenshot with `node scripts/shot.mjs <path> [--w 1440 --h 900 --name x --full --dark|--light]` (outputs PNGs to `.shots/`; view them with the Read tool). Check **desktop (1440×900)** and **mobile (390×844)**, **dark and light**. Fix what looks wrong. Judge your own work harshly.

## 5. iOS app (`apps/ios`)

- **Targets:** app `Flowd` (iOS 17.0+), widget extension `FlowdWidgets` (Live Activity + Home Screen widget), unit tests `FlowdTests`. Project generated by **XcodeGen** from `apps/ios/project.yml` (no hand-written `.xcodeproj`). Bundle id `app.flowd.creator`.
- **Language/mode:** Swift 5 language mode (Xcode 26 toolchain), `@Observable` (Observation), `NavigationStack`, `async/await`. No third-party packages. `@MainActor` on view models. Models are `Codable, Hashable, Identifiable, Sendable` structs.
- **There is NO compiler on this machine.** Write conservative, compile-safe Swift: give explicit types where inference may be heavy; split large `body`s into small subviews/computed properties (≤ ~10 siblings per builder, use `Group`); avoid exotic APIs you are not sure exist; use `#available(iOS 26, *)` for iOS-26-only APIs (only inside DesignSystem wrappers); no force unwraps/`try!`; every `switch` exhaustive; every file imports exactly what it uses (`SwiftUI`, `Charts`, `AVFoundation`, `Vision`, `Speech`, `PhotosUI`, `ActivityKit`, `WidgetKit`, `SwiftData`…). Before finishing, **re-read each file as a compiler would**: missing imports, wrong labels, optional misuse, non-exhaustive switches, missing `@State`/`@Binding`, `Identifiable` conformance, mismatched generic types.
- **Layout:**
  ```
  Flowd/App/            FlowdApp.swift, AppState.swift, RootView.swift, Router.swift, TabShell.swift
  Flowd/DesignSystem/   Tokens.swift (generated), Theme.swift, Typography.swift, Motion.swift, Haptics.swift,
                        Glass/*.swift, Components/*.swift, Charts/*.swift
  Flowd/Core/           Models/*.swift (mirror packages/contract/DOMAIN.md), Services/*.swift (FlowdAPI protocol, MockFlowdAPI, LiveFlowdAPI),
                        Persistence/*.swift (SwiftData drafts, caches), Engine/*.swift (pricing/scoring mirrors), Utilities/*.swift
  Flowd/Features/<Area>/  views + view models per area (Onboarding, Home, Bounties, Studio, Wallet, Profile, Leaderboard, Crews,
                          Tournaments, Inbox, RateCard, Earnings, Academy, Tools, Settings)
  Flowd/Resources/      Assets.xcassets, Fixtures/*.json (synced), Info.plist
  FlowdWidgets/         Live Activity + widget      FlowdTests/   unit tests (decode fixtures, engine parity)
  ```
- **Data:** `FlowdAPI` protocol; `MockFlowdAPI` loads bundled fixtures (snake_case JSON → `convertFromSnakeCase`) and mutates in memory so the whole flow works offline in the simulator; `LiveFlowdAPI` talks to `/api/v1` (base URL from config).
- **UI rules:** every `View` file ends with a `#Preview` using fixture data; Dynamic Type, VoiceOver labels, reduce-motion/transparency respected; haptics via DesignSystem; icons are SF Symbols; no hard-coded colours/fonts/spacings in features — use `Theme`/`Tokens`.
- Consult `write-swift`, `apple-design`, and `docs/research/liquid-glass.md` (API signatures verified against Apple docs).

## 6. Data conventions (all platforms)

- IDs: `<prefix>_<slug-or-number>`: `usr_`, `cr_` (creator), `br_` (brand), `app_`, `bnty_`, `sub_` (submission), `post_`, `offer_`, `ledg_`, `pay_`, `crew_`, `tour_`, `drop_`, `spec_`, `auc_`, `tmpl_` (format template), `hook_`, `note_`.
- JSON keys **snake_case**; timestamps ISO-8601 UTC (`2026-10-03T14:00:00Z`); money fields suffixed `_cents`; rates `cpm_cents` (cents per 1,000 views); percentages as 0–1 floats unless named `_pct`.
- Enums are lowercase snake strings, defined once in `packages/contract/DOMAIN.md` + `types.ts`.
- "Now" in the demo world = **2026-10-03T14:00:00Z** (fixtures are generated relative to it so the UI always looks live).
- The demo personas: one brand workspace, one creator, one admin (defined in the contract). Role switching is a demo affordance on `/login` and in the account menu.

## 7. Quality bar (what "done" means)

- It runs, typechecks, and looks **premium**: spacing rhythm, typographic hierarchy, alignment, state coverage, motion polish. If a screenshot of your page wouldn't make a designer proud, keep working.
- Realistic, specific copy and numbers consistent with fixtures (never "Lorem", "Item 1", "$0" everywhere).
- All interactive elements work (or are visibly disabled with a reason). Forms validate with clear messages. Keyboard and screen-reader basics hold.
- Light and dark both look intentional. Mobile layouts are designed, not merely shrunk.
- Code is typed, small-file, readable, matches neighbours' style/comment density, and has no dead code.
