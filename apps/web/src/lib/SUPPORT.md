# Web support layer: API index

Everything a page needs that is not a component, the store or the engine. Import paths are `@/lib/...`. All of it is pure and server-safe unless a row says **client** (`"use client"`, needs React and the browser) or **server** (reads request cookies or server env). Business numbers (fees, windows, tiers) live in `@/lib/engine` (`CONSTANTS`), never here.

| Area | Import | One line |
|---|---|---|
| Formatting | `@/lib/format` | Money, CPM, percentages, dates, relative time, ETAs ("clears Sat 2:00 PM"), durations, countdowns, words, truncation |
| Flo (AI copilot) | `@/lib/ai`, `@/lib/hooks/use-flo` | `AIProvider`, deterministic `MockFloProvider`, typewriter streaming, Claude behind env vars |
| Session | `@/lib/session`, `@/lib/session/use-session`, `@/lib/session/server`, `@/components/shell` | Demo personas, `flowd_role` cookie, `useSession`, `requireRole`, `<RoleGate>` |
| Search | `@/lib/search` | Command-palette index, ranking, route registry, actions, recents |
| Analytics | `@/lib/analytics` | Typed events (PRODUCT_SPEC section 10), privacy sanitiser, no-op / PostHog adapters |
| SEO | `@/lib/seo` | `buildMetadata`, JSON-LD, sitemap and robots builders |
| Hooks | `@/lib/hooks/use-*` | `useNow`, `useCountdown`, `useMediaQuery`, `useHotkeys`, `useKeySequence`, `useFlo` ... |
| Env and constants | `@/lib/env`, `@/lib/constants` | Zod-validated env, the demo clock constant, brand and domain facts |
| Demo affordances | `@/components/shell` | `<RoleGate>`, `<DemoBanner>`, `<DemoTag>` |

Tests live beside each area in `__tests__/` (and `lib/env.test.ts`, `lib/constants.test.ts`). Run them with `npx vitest run src/lib`.

---

## 1. Format: `@/lib/format`

Money is integer cents and is formatted only here. "Now" is explicit and defaults to the demo world (`DEMO_NOW` = `2026-10-03T14:00:00Z`), never the system clock. Everything is UTC unless a `timeZone` (IANA) option is passed, so server and client output are identical (no hydration mismatch). An unreadable timestamp prints `—` instead of throwing.

**Money and numbers** (the core formatters are the engine's, so web, mock API and tests agree to the cent)

| Function | Example |
|---|---|
| `formatMoney(cents, { cents?: "auto" \| "always" \| "never", compact?, sign? ... })` | `formatMoney(128460)` gives `$1,284.60` |
| `formatCpm(cents, "long" \| "short" \| "bare")` | `$2.00 per 1,000 views` / `$2.00 CPM` / `$2.00` |
| `formatCompact(n)` | `1.2K`, `3.4M` |
| `formatPct(ratio, digits?)`, `formatSignedPct`, `formatPoints(now, before)` | `12%`, `+4.5%`, `+7 pts` |
| `formatMoneyRange(lo, hi, { joiner })`, `formatCpmRange(lo, hi, style)` | `$80 to $115`, `$1.90 to $3.10 per 1,000 views` |
| `formatCostPer(cents \| null, "trial")` | `$3.40 per trial` / `not enough data` (never `$0`) |
| `formatFee(feeCents, rate?)` | `$2.40 fee (1.5%)` / `No fee` |
| `splitMoney(cents)` | `{ sign, dollars: "1,284", cents: "60" }` for hero figures |
| `formatInt`, `formatDecimal(value, digits)`, `formatViews(n)`, `formatMultiple`, `formatHours`, `formatDeltaMoney` | |

**Time** (`now` defaults to `DEMO_NOW`; pass `useNow()` for a live value)

| Function | Example |
|---|---|
| `formatRelative(time, now?, { style: "long" \| "short" })` | `just now`, `12 minutes ago`, `in 3 hours`, `yesterday`, `3 weeks ago`, then `Aug 14` |
| `formatEta(time, { verb?, now?, timeZone? })` | `clears Sat 2:00 PM`; turns past tense once it has passed (`cleared Fri 2:00 PM`) |
| `formatClockEta(time)` | `Sat 2:00 PM` within a week, `Oct 14, 2:00 PM` beyond (matches the engine's `clockLabel`) |
| `formatDate(time, "auto" \| "short" \| "medium" \| "long" \| "weekday" \| "month" \| "iso")` | `Oct 3`, `Oct 3, 2026`, `Sat, Oct 3` |
| `formatTime`, `formatDateTime`, `formatIsoWeek("2026-W40")` | `2:00 PM`, `Oct 3, 2:00 PM UTC`, `Sep 28 – Oct 4` |
| `formatDaysLeft(endsAt)` | `12 days left`, `ends today`, `ended 3 days ago` |
| `formatDuration(seconds, "clock" \| "short" \| "long" \| "approx")` | `1:05`, `1m 5s`, `1 minute 5 seconds`, `about 22 s` |
| `formatCountdown(ms, "compact" \| "clock" \| "long")`, `countdownParts(ms)` | `2h 14m`, `02:14:09` |
| `formatSecondsPrecise(s)`, `greeting(time)`, `parseTime(input)` | `1.9 s`, `Good afternoon` |

**Words and text**

| Function | Example |
|---|---|
| `ordinal(n)` | `1st`, `2nd`, `11th`, `112th` |
| `pluralise(count, "bounty", plural?)`, `pluralWord`, `pluralOf` | `1 bounty`, `3 bounties`, `1,204 views` |
| `formatList(items)`, `formatRank(4, 30)`, `withArticle("hour")` | `a, b and c`, `4th of 30`, `an hour` |
| `truncate(text, max, { wordSafe, ellipsis })`, `truncateWords`, `truncateMiddle`, `excerpt(text, max, query?)` | cuts on a word, never splits a surrogate pair |
| `initials`, `formatHandle`, `displayUrl`, `shortId`, `humanize("window_closed")` | `MR`, `@maya.makes`, `joinflowd.io/c/maya.makes`, `Window closed` |

Rule of thumb: truncate in CSS (`truncate`, `line-clamp-2`) when the container decides; use these when the length is a fact about the string (meta description, push body, tooltip, copied id).

---

## 2. Flo, the AI copilot: `@/lib/ai`

Every screen talks to the `AIProvider` interface, so swapping engines changes no UI.

```ts
interface AIProvider {
  readonly id: "mock" | "claude" | "remote";
  readonly model: string;
  generate(task: FloTask, options?: FloCallOptions): Promise<FloResult>;
  stream(task: FloTask, options?: FloCallOptions): AsyncGenerator<FloStreamEvent>;   // start, delta*, output_end, done | error
}
```

**Use it from React** (client): `useFlo({ suggestions })` from `@/lib/hooks/use-flo`.

```tsx
const flo = useFlo({ suggestions });                    // `flo_suggestions` rows from the data layer: saved answers are replayed
<Button onClick={() => flo.run(scriptTask({ bounty, app, format, formats, creatorCode: "MAYA6", creatorId: "cr_maya" }))}>Write scripts</Button>
{flo.outputs.map((text, i) => <ScriptCard key={i} text={text} streaming={flo.status === "streaming"} />)}
// flo.status: idle | thinking | streaming | done | error;  flo.result, flo.title, flo.error, flo.degraded
// flo.regenerate()  (attempt + 1: different wording, same facts)   flo.cancel()   flo.reset()
// Typing animation honours prefers-reduced-motion; pass { instant: true } to force none. Sends `flo_prompt_sent` (kind and surface only, never the text).
```

**Build tasks with the adapters** (`context.ts`): pages never hand-build a `FloTask`; strings are cut to the schema's limits, so a task always validates on the route.

| Constructor | Task kind | Result |
|---|---|---|
| `scriptTask({ bounty, app, format?, formats?, hook?, creatorCode?, options? })` | `script` | 1 to 3 scripts, one line per beat with timings, disclosure, brief check |
| `hookRewriteTask({ hook, app, targetType?, submissionId? })` | `hook_rewrite` | 3 rewrites scored on the 2-second rule |
| `briefTldrTask({ bounty, app })` | `brief_tldr` | 5 labelled lines: make, say, pay (estimate), rights, disclosure and review SLA |
| `captionTask({ bounty, app, creatorCode?, platform? })` | `caption` | `#ad` first, one call to action, at most 3 hashtags |
| `commentReplyTask({ comment, app, creatorCode?, postId? })` | `comment_reply` | 3 honest replies (a sponsorship question always gets a plain yes); stored as a `caption` |
| `bountyDraftTask({ input, now, app?, plan?, budgetCents?, firstBounty? })` | `bounty_draft` | A whole draft from an App Store link (`result.draft: BountyDraft`) |
| `nextActionTask({ role, signals })` | `next_action` | "What should I do today?" from the signals present, no guilt, pending money always dated |
| (build from the schema types) | `score_fix`, `rate_advice` | Checklist-score fixes (creator or brand-reviewer voice); rate-card advice |

**Engines**

- `MockFloProvider({ suggestions? })`: deterministic (seeded RNG, no clock, no network); the same request gives the same answer byte for byte, `attempt` gives different wording. It replays a matching saved `flo_suggestions` row first (`result.source === "fixture"`, `fixture_id`), then writes new answers from the brief, the format and the engine's hook library. A **bounty draft is never replayed**: its numbers (price, budget, fee, Pay Math, lint) always come from the engine, only the words are Flo's.
- `createFloProvider({ suggestions?, mode? })` / `getFloProvider()`: local mock by default; `NEXT_PUBLIC_FLO_MODE=remote` returns `HttpFloProvider`, which posts to `/api/v1/flo/chat`, types the finished answer in the browser, and answers from the mock (`degraded: true`) if the route is missing, rate limited or down.
- `ClaudeProvider` (`@/lib/ai/claude-provider`, server only): OPTIONAL. Model `claude-sonnet-5-5` (`FLO_MODEL`), structured outputs (`output_config.format = json_schema`), `effort: "low"`, no sampling parameters, no prefill, no forced tool choice, server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Replies are parsed, validated with zod and checked against the house rules (no banned claims, `#ad` present, one call to action) before anyone sees them; the model writes words, the engine owns numbers. The official SDK is NOT a dependency yet: `loadAnthropicClient` imports `@anthropic-ai/sdk` on demand and names the one command that fixes a missing package (`npm install @anthropic-ai/sdk` in `apps/web`).
- `@/lib/ai/server`: `handleFloChat` (the route logic), `createFloServer(deps)`, `describeFlo()`, `streamWithFallback`, `MAX_BODY_BYTES`.

**Turning Claude on (optional).** The route file belongs to the admin and API area; it is three lines:

```ts
// src/app/api/v1/flo/chat/route.ts
import { handleFloChat, describeFlo } from "@/lib/ai/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleFloChat;
export const GET = () => Response.json(describeFlo());
```

Then set `ANTHROPIC_API_KEY` (server only; never `NEXT_PUBLIC_`), run `npm install @anthropic-ai/sdk`, and set `NEXT_PUBLIC_FLO_MODE=remote`. `FLO_PROVIDER=auto|mock|claude`, `FLO_MODEL`, `FLO_MAX_TOKENS`, `FLO_REFUSAL_FALLBACK`, `FLO_RATE_LIMIT_PER_MIN` tune it. The route rate-limits per client, caps the body at 64 KB, validates with `FloChatRequestSchema`, streams server-sent events, uses errors shaped `{ code, message, hint }`, and on any failure of Claude answers from the mock with `degraded: true`. Nothing about the key, the SDK or a stack trace reaches the client.

**Result shape** (`FloResult`): `kind` (the contract `FloKind` it is stored under), `task_kind`, `surface`, `title`, `outputs: string[]` (the options), `notes`, `actions: FloAction[]` (one-tap: `open_studio`, `copy`, `apply_fix`, `apply_draft`, `set_rate` ...), `model`, `latency_ms`, `label` (the honest line to show: `FLO_LABEL` "Checklist-based and can be wrong. Check it against the brief before you post."), `source: "fixture" | "mock" | "claude"`, `degraded?`, `draft?`.

**Helpers**: `toFloSuggestion(task, result, meta)` / `fromFloSuggestion(s, label)` map a result to the contract `FloSuggestion` for history; `promptFor(task)`, `floKindFor(kind)`, `resultToText(result)` (clipboard); `typewriter(text, opts)`, `streamResult(result, opts)`, `collectStream(stream)`, `typingDurationMs`, `chunkText`; `encodeSse`, `SseDecoder`, `readSse`; `FloTaskSchema` and `FloChatRequestSchema` (zod); `classifyComment`, `tightenHook`, `buildBountyDraft`, `lintDraft`, `NEVER_SAY`, `bannedPhraseIn`.

---

## 3. Session: `@/lib/session`

Demo personas (fictional, ids match the fixtures' `world.personas`): **Jordan Ellis** (brand, Growth lead at Lumi, `usr_jordan`, home `/brand`), **Maya Reyes** (creator, `@maya.makes`, `usr_maya`, `/creator`), **Sam Okafor** (admin, Trust and Ops, `usr_ops`, `/admin`).

- Constants: `ROLE_COOKIE = "flowd_role"` (value `creator`, `brand_member` or `admin`), `SESSION_STORAGE_KEY`, `ROLE_LABEL`, `PERSONA_KEYS`, `ROLE_TO_PERSONA`, `PERSONA_TO_ROLE`, `isRole`, `isPersonaKey`.
- Personas: `DEMO_PERSONAS`, `PERSONA_LIST` (brand, creator, admin), `personaForRole(role)`, `personaByKey(key)`.
- Access rules (pure; layout, proxy and test friendly): `accessFor(path)`, `roleCanAccess(role, path)`, `homeFor(role)`, `redirectFor({ role, pathname, search })`, `loginUrl(next)`, `postLoginTarget(role, next)`, `safeNextPath(next)` (blocks open redirects), `gateDecision({ status, role, initialRole, allow })`, `gateTargets(allow)`.
- Cookie (pure parse and serialize): `readRoleFromCookieHeader`, `serializeRoleCookie`, `parseRole`; browser: `readRoleCookie`, `writeRoleCookie`.
- Store (`useSyncExternalStore`-friendly, non-React callable): `signInAs(role)`, `signOut()`, `getSessionRole()`, `getSessionSnapshot()`, `subscribeSession`. Cookie is the source of truth; localStorage mirrors it and repairs a lost cookie; other tabs follow through the `storage` event. `signInAs` sends `login_succeeded` / `persona_switched` and identifies the persona (pseudonymised) to analytics.
- **Client**: `useSession()` gives `{ status: "unknown" | "ready", role, persona, isSignedIn, signIn(who, { redirectTo? }), signOut({ redirectTo? }) }`; `useRole()`. `status` is `unknown` on the server and during hydration (no mismatch).
- **Server** (`@/lib/session/server`): `await getServerRole()` and `await requireRole("brand_member" | [..], nextPath?)` (redirects to `/login?next=`). Reading cookies makes the route dynamic, which is right for signed-in areas.
- It is a demo affordance, not a security boundary (CONVENTIONS section 6). Production swaps the cookie for a signed httpOnly session.

```tsx
// src/app/brand/layout.tsx (server component)
import { requireRole } from "@/lib/session/server";
import { RoleGate } from "@/components/shell";

export default async function BrandLayout({ children }: { children: React.ReactNode }) {
  const role = await requireRole("brand_member");
  return <RoleGate allow="brand_member" initialRole={role}><BrandShell>{children}</BrandShell></RoleGate>;
}
```

### `<RoleGate>` (`@/components/shell/role-gate`, client)

Props: `allow` (role or roles), `initialRole?` (the server-verified role; renders children on the server and avoids a gate flash), `signedOut?: "redirect" | "screen"` (default redirect to `/login?next=<path>`), `layout?: "page" | "inline"` (page: full viewport with its own aurora, wrap a whole shell; inline: inside a shell's content area), `pending?`.

- Allowed: children untouched. Signed out: redirect (or the "Sign in to continue" screen with one-click persona buttons). **Wrong role: a friendly "This area is for creators" screen** that names who you are, who can open the page, and offers "Switch to Maya", "Back to the brand home" and "See all personas". It never bounces a person silently.
- Without `initialRole` it shows `pending` until the browser's session has been read, and children are not server-rendered.

### `<DemoBanner>` and `<DemoTag>` (`@/components/shell/demo-banner`, client)

- `<DemoBanner switcher? dismissible? className? />`: the slim "Demo data. Every brand, creator and dollar here is fictional, and it lives only in this browser." strip with a "Viewing as Maya" persona switcher (lands on that persona's home) and a per-device dismiss. Put it at the top of a shell's content area.
- `<DemoTag>Demo data</DemoTag>`: the small outline tag for a card or figure whose numbers are simulated (ROUTES.md honesty affordance). Not a tab stop; a screen-reader sentence explains it.
- Both render nothing when `NEXT_PUBLIC_DEMO_MODE=false` (`isDemoMode()`).

---

## 4. Search: `@/lib/search`

Pure functions fed with data the caller already has (store rows, fixtures).

```tsx
const index = useMemo(() => buildSearchIndex({ role, bounties, creators, brands, apps, submissions, posts, lessons }), [...]);
const { query, setQuery, groups, recordUse } = useSearch(index);                       // client: "@/lib/search/use-search"
<CommandPalette groups={toCommandGroups(groups, { onAction, onSelect: recordUse })} shouldFilter={false} onQueryChange={setQuery} />
```

- `buildSearchIndex({ role, ...entities, recent?, includeActions? })` gives pages (the role's, plus public), actions, and entities whose links are rewritten per role (`entityHref(kind, role, id)`: a creator's bounty opens `/creator/bounties/<id>`, a brand's `/brand/bounties/<id>`, a signed-out visitor's `/b/<id>`; entities a role has no page for are left out).
- `searchIndex(index, query, { limit, perGroup, kinds, recent })` / `groupResults(results, query)` / `search(index, query)`: ranked, grouped (`GROUP_ORDER`: Suggested, Go to, Actions, Bounties, Creators, Brands, Apps, Submissions, Posts, Academy). Empty query returns the weighted pages and actions; matches are prefix, word and subsequence aware, accent and case insensitive; recents are boosted. `highlightSegments(label, matches)` / `highlightPlain` for rendering the hit.
- `ROUTE_REGISTRY` (every static route in docs/ROUTES.md, verified both ways by a test), `routeFor(href)`, `routesForRole(role)`, `sitemapRoutes()`, `shortcutsForRole(role)` (wire with `useKeySequence`). One registry feeds the palette, the sitemap and the guard tests.
- Actions (`ActionId`): `toggle-theme`, `toggle-reduce-glass`, `open-flo`, `show-shortcuts`, `copy-profile-link`, `toggle-numbers-off`, `advance-clock-24h`, `advance-clock-72h`, `reset-demo`, `sign-out`, `switch-persona:<brand|creator|admin>`. The shell maps them in `onAction`; `actionsForRole(role)`, `allActionIds()`, `personaOfAction`.
- Recents: `pushRecent`, `parseRecents`, `readRecents`, `writeRecents`, `RECENTS_KEY`, `MAX_RECENTS` (a blocked store means no recents, not an error).

---

## 5. Analytics: `@/lib/analytics`

`track("bounty_viewed", { source: "feed" })`: the typed catalogue is PRODUCT_SPEC section 10 (182 names in 12 groups: `EVENT_GROUPS`, `ALL_EVENTS`, `EventName`, `isEventName`, `groupOf`). Events the spec gives properties get required, typed props (`EventPropsMap`: `cash_out_confirmed: { instant, fee_cents }`, `decision_made: { decision, via, reason_code? }`, ...); the rest take optional free-form `AnalyticsProps`.

- Privacy is enforced in code: `sanitizeProps` drops free text (long strings), emails, nested objects and non-finite numbers; `sanitizePath` strips sensitive query params and masks `$` amounts; ids go through `pseudonymise`; `identify(id, { role, plan, tier })` sends traits only; Do Not Track and Global Privacy Control switch everything off (`privacyOptOut`). `track` never throws and never captures on the server.
- `initAnalytics({ adapter, signals })`, `setAnalyticsContext({ plan, tier, workspaceId, creatorId })`, `setAnalyticsEnabled(bool)` (consent toggle), `trackPage(path)`, `resetAnalytics()` (sign-out).
- Adapters: `noopAdapter` (the default; nothing leaves the browser), `createMemoryAdapter()` (tests, /dev pages), `createConsoleAdapter()` (development), `createPostHogAdapter(client)` (flowd does not depend on posthog-js; inject any client with `capture`, `identify`, `reset`).
- `initAnalyticsFromEnv()` picks the adapter from `NEXT_PUBLIC_ANALYTICS_PROVIDER` (`none` default; `posthog` uses an injected client or `window.posthog`, and stays no-op with a warning when there is none). `<AnalyticsBoot />` (`@/lib/analytics/analytics-boot`, client) does that plus `usePageView()` and is mounted once in `Providers`.

---

## 6. SEO: `@/lib/seo`

```tsx
export const metadata = buildMetadata({ title: "Pricing", description: "...", path: "/pricing" });          // every page
export const metadata = noindexMetadata("Sign in", "Pick a demo persona.", "/login");                          // utility pages
<JsonLd data={graph(organizationJsonLd(), faqJsonLd(FAQ))} />                                                  // "@/lib/seo/json-ld-script" (server)
```

- `buildMetadata({ title, description (cut to 160), path, image?, noindex?, absoluteTitle?, type?, keywords?, publishedTime? })` gives title, description, canonical, Open Graph, Twitter card and robots. `image` takes a URL or `{ kind: "proof" | "audit" | "card" | "scorecard" | "bounty", id }` which becomes `/og/<kind>/<id>`. Helpers: `resolveBaseUrl()`, `absoluteUrl(path)`, `ogImageUrl(kind, id)`, `DEFAULT_OG_IMAGE`.
- JSON-LD: `organizationJsonLd`, `websiteJsonLd`, `siteJsonLd`, `faqJsonLd(items)`, `breadcrumbJsonLd(crumbs)`, `articleJsonLd`, `pricingJsonLd`, `softwareApplicationJsonLd`, `profilePageJsonLd`, `graph(...)`, `jsonLdString`. Output is safe to inline (`<` is escaped).
- `buildSitemap({ sources })` (`src/app/sitemap.ts` loads `loadSitemapSources()`): every public indexable route from the registry, plus open funded bounties (`/b/<id>`), audits, creator storefronts and brand scorecards. Never lists `/p/` proof pages, `/r/` tracking links or anything behind a login.
- `buildRobots()` (`src/app/robots.ts`): open site, closed `/api/`, `/brand/`, `/creator/`, `/admin/`, `/onboarding/`, `/dev/`, `/login`, `/r/`, `/p/`. Anything that is not the canonical production domain (`https://joinflowd.io`) is closed entirely, so a preview deploy can never be indexed; `NEXT_PUBLIC_ALLOW_INDEXING` overrides. `isPathAllowed(rules, path)` is a small matcher for tests.

---

## 7. Hooks: `@/lib/hooks/use-*` (client)

| Hook | Use |
|---|---|
| `useNow({ live?, intervalMs?, enabled? })`, `useNowIso()` | The demo world's now (ms). Frozen by default so labels stay put and server equals first client render; `live: true` ticks with real time. Backed by `demoClock` (`@/lib/hooks/demo-clock`: `now()`, `liveNow()`, `set(iso)`, `advance(ms)`, `reset()`, `subscribe`); the data layer and the admin "advance 24 h / 72 h" call `demoClock.set` / `advance`, and every `useNow` follows. |
| `useCountdown(target, { intervalMs?, enabled?, onDone? })` | `{ label: "2h 14m", clock: "02:14:09", days, hours, minutes, seconds, done, remainingMs, valid }`; ticks every second near the target and every 15 s when more than 3 hours away. For the Daily Drop (16:00 UTC). |
| `useMediaQuery(query, serverValue?)`, `useIsDesktop()`, `useCanHover()` | SSR-safe media queries (`useSyncExternalStore`). |
| `useHotkeys({ "mod+k": fn, ... }, { enabled?, allowInInputs? })`, `useHotkey(combo, fn)`, `useKeySequence(["g", "w"], fn)`, `useKeySequences(bindings)`, `useIsMac()` | Keyboard shortcuts; plain keys never fire while typing in an input; sequences time out after 900 ms (`g` then `w`). Pure core in `hotkeys-core.ts` (`parseCombo`, `matchesCombo`, `createSequenceMatcher`). |
| `useFlo(options)` | See section 2. |
| `useDebouncedValue(value, ms)`, `useCopyToClipboard()`, `useCountUp`, `useControllableState`, `useMergedRef`, `usePointerSheen`, `useReduceGlass`, `useResolvedTheme` | Small utilities (the last six belong to the design system). |

---

## 8. Env and constants

`@/lib/env`: `publicEnv()` (NEXT_PUBLIC_* only; safe in client code; every variable is read as a literal `process.env.NEXT_PUBLIC_X` so Next inlines it) and `serverEnv()` (throws in the browser). Everything has a working default, so a fresh clone runs with no `.env`. A wrong value throws one `EnvError` naming the variable (secrets are never echoed). `parsePublicEnv(source)` / `parseServerEnv(source)` are pure (tests), `isDemoMode()`, `resetEnvCache()`, `DEFAULT_FLO_MODEL = "claude-sonnet-5-5"`.

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` (`https://joinflowd.io` in production) | metadataBase, canonical URLs, sitemap, OG links |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_API_URL` | `https://app.joinflowd.io` / `https://api.joinflowd.io` | product and API origins |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | demo banner, persona picker, "Demo data" tags |
| `NEXT_PUBLIC_FLO_MODE` | `local` | `local` (in-browser mock) or `remote` (`/api/v1/flo/chat`) |
| `NEXT_PUBLIC_ANALYTICS_PROVIDER` | `none` | `none` or `posthog` (+ `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`) |
| `NEXT_PUBLIC_ALLOW_INDEXING` | unset | force indexing on or off; unset means on only for the canonical domain |
| `ANTHROPIC_API_KEY` | unset | optional, server only: lets Flo run on Claude |
| `FLO_PROVIDER` / `FLO_MODEL` / `FLO_MAX_TOKENS` / `FLO_REFUSAL_FALLBACK` / `FLO_RATE_LIMIT_PER_MIN` | `auto` / `claude-sonnet-5-5` / `4000` / `true` / `20` | Claude provider tuning |

`@/lib/constants`: `DEMO_NOW` (`2026-10-03T14:00:00Z`, pinned to the engine's `CONSTANTS.now` by a test), `DEMO_NOW_MS`, `DEMO_TODAY`, `SITE` (name, tagline "Money follows what works.", `joinflowd.io` domain, app, API and email), `DEMO_IDS` (the three personas' ids), `links` (`links.creator(handle)` gives `joinflowd.io/c/<handle>`, plus `proof`, `tracking`, `bounty`, `scorecard`). Never write `flowd.so`, `flowd.com` or `flowd.app`.
