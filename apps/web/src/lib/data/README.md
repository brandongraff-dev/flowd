# The data layer: hooks and actions

This is how every page reads and changes the flowd demo. There is no backend in the build: the whole product (bounties, escrow, review, the Money Clock, payouts, offers, auctions, the admin tower) runs as a real, rule-enforcing simulation in the browser, on top of the synced fixtures. A click on "Approve" writes the same ledger rows, notifications and activity entries the production system would, and every page that shows that money updates on its own.

```
fixtures (immutable)            @/lib/data/fixtures      typed loaders
   |
demo store (zustand + persist)  @/lib/store              state, overlay saved in the browser, actions
   |
selectors (pure functions)      @/lib/data/selectors     joins, filters, derived views, role-aware
   |
hooks                           @/lib/data               useBounties(), useCreatorWallet() ...
```

Pages touch only two things:

```tsx
import { useBounties, useStoreReady } from "@/lib/data";   // READ: hooks
import { actions } from "@/lib/store";                     // WRITE: actions
```

## In one minute

```tsx
"use client";

import { useBounties, useCreatorWallet, useMe, useStoreReady } from "@/lib/data";
import { actions } from "@/lib/store";
import { notify } from "@/components/ui/toast";

export function LiveBounties() {
  const ready = useStoreReady();                                    // false until the demo world is loaded
  const me = useMe();                                               // who is signed in, with their rows
  const bounties = useBounties({ brand: "mine", status: "live", sort: "fill" });

  if (!ready) return <BountyListSkeleton />;                        // loading
  if (bounties.length === 0) return <EmptyState title="No live bounties" />; // a real empty state

  async function pause(id: string) {
    const r = await actions.pauseBounty({ bounty_id: id });         // never throws
    if (!r.ok) notify.error(r.error.message, { description: r.error.hint });
    else notify.success(`Paused ${r.data.bounty.title}`);          // the list re-renders by itself
  }
  return bounties.map((b) => <BountyRow key={b.id} bounty={b} onPause={() => pause(b.id)} />);
}
```

## The rules

1. **Read with hooks, write with actions.** Never import a fixture JSON in a page. Never mutate a row you got from a hook. Never keep a copy of server-like state in `useState`: read the hook again.
2. **Loading is `useStoreReady()`.** Before the demo world is loaded (the server render, and the first client render) every hook returns the empty world: empty lists, `undefined`, zeroed totals. That is what makes the server and first client markup match. Show a skeleton while `ready` is false. Once it is true, an empty list is a real empty state: design it.
3. **Arguments are plain data, compared by value.** `useBounties({ status: "live" })` with an inline object is fine; the hook does not re-run unless the filter changes. Pass only JSON (strings, numbers, booleans, arrays and objects of those). Never pass functions or class instances.
4. **Results keep their identity.** A hook returns the same object until a table it reads changes, so results are safe in `useEffect`/`useMemo` dependencies and as `React.memo` props. Rows inside a list also keep their identity while their own data is unchanged.
5. **"mine" is a shorthand for the signed-in brand or creator.** `useBounties({ brand: "mine" })`, `usePosts({ creator: "mine" })`, `useFunnel({ brand: "mine" })`, `useMoneyClock({ creator: "mine" })`. Most hooks that take a brand or creator default to the signed-in one when you pass nothing. Pass an explicit id to look at someone else.
6. **Money is integer cents, everywhere.** Format with `formatMoney` from `@/lib/engine`. Never multiply or divide money with floats in a component; the selectors already give you the derived numbers (fees, net, all-in CPM, the Money Clock ETA).
7. **Time is the demo clock.** "Now" in the demo is `useDemoNow()` (an ISO string, 2026-10-03T14:00:00Z at the start; Ops can advance it). Use it for state ("is this row cleared yet"). Use `useNow()` from `@/lib/hooks/use-now` for relative labels. Never call `Date.now()` in a component.
8. **Actions return `ActionResult<T>` and never throw.** `{ ok: true, data }` or `{ ok: false, error: { code, message, hint?, status } }`. `message` is plain English and `hint` says what to do next: show both. Branch on `error.code` only for behaviour (open the "add funds" sheet on `insufficient_funds`).
9. **Actions are real.** They run the same rules as the product: roles (a viewer cannot fund), plan gates, Brief Lint blockers, the escrow identity, the 72-hour view window, the one-appeal rule, the revision rounds. A refusal is a feature, not a bug: surface it.
10. **After an action, do nothing.** The store updates and every hook that reads the changed tables re-renders. No refetch, no invalidation, no optimistic state. The action resolves after the new state is committed.
11. **Do not read `demoStore` directly in components.** Use hooks. `demoStore.getState()` is for imperative code in event handlers and tests.

## Loading and the store lifecycle

* `<StoreHydrator />` is mounted once in `components/shell/providers.tsx`. It renders nothing. Server render and first client render both see the empty `idle` store.
* The core fixtures are fetched **lazily**: the first data hook that mounts (or the first action) boots the store, then the saved demo is applied on top. A page with no data hooks (the marketing home) never downloads them.
* A dashboard layout that always needs data can pass `eager` (`<StoreHydrator eager />` in the layout) or wrap its children in `<StoreGate fallback={<Skeleton />}>` from `@/lib/store`: children render only once the data is ready.
* **Heavy tables** (video analyses, view snapshots, daily metrics, conversions, compliance checks) load on demand. Hooks that need them (`useSubmissionAnalysis`, `useReviewQueue`...) ask for them and re-render when they arrive; actions that need them load them first. `useEnsureTables([...])` forces a load.
* `useStoreStatus()` gives `{ status, ready, error, loading_tables, persistence }`. `persistence` is `"pending"` until the saved demo has been applied, `"saved"` while changes are written to this browser, and `"memory"` in a private window or when the quota is full (changes are lost on reload: say so).
* The demo is saved under `localStorage["flowd-demo-v1"]` as a small **diff** against the fixtures (only rows that changed, tombstones, edited docs, the session, the clock and id counters). `actions.resetDemo()` throws it all away and keeps you signed in. Only one tab should drive the demo at a time (there is no cross-tab live sync; a reload picks up the other tab's saves).

## Who is signed in

The demo has three personas: `"brand"` (Jordan at Lumi), `"creator"` (Maya, @maya.makes) and `"admin"` (Ops). The app switches persona through `useSession().signIn` from `@/lib/session` (the sign-in cookie), and the store follows it automatically. In previews and tests you can call `setPersona("creator")` from `@/lib/store`.

* `useMe()` returns `{ persona, signedIn, user, creator, brand, member, member_role, app, apps, workspaces }`.
* `usePersona()` returns the persona and `useDemoSession()` the store's session ids. (`useSession` from `@/lib/session` is the sign-in cookie with `signIn` and `signOut`; `useDemoSession` is read-only.)
* A brand member's active app and workspace are switched with `actions.switchWorkspace({ brand_id?, app_id? })`.
* Role rules are enforced by actions: owner and admin do everything; reviewer reviews and builds; finance moves money; viewer only looks; client approver only reviews. A creator calling a brand action gets `forbidden`, and a signed-out visitor gets `unauthenticated` from every action except the public ones (`joinWaitlist`, `applyFoundingCreator`, `recordLinkClick`, `recordProofView`, `runAudit`).

## What a failed action looks like

```ts
const r = await actions.fundWallet({ amount_cents: 50_000 });
if (!r.ok) {
  // r.error = { code: "forbidden", message: "Your role (viewer) cannot do that.", hint: "Ask a workspace owner or admin.", status: 403 }
}
```

Codes you will branch on:

| Code | Meaning | What a page does |
| --- | --- | --- |
| `unauthenticated` | Nobody is signed in | Send to the persona picker |
| `forbidden` | Wrong persona or role, or another party's row | Show the message and hint; do not retry |
| `plan_required` (402) | The brand's plan lacks the feature | Link to Settings, then Plan and billing |
| `insufficient_funds` | Wallet cannot cover it | Open the add-funds flow with the shortfall |
| `brief_lint_blockers` | Brief Lint blockers stop publishing | Show the blockers; each has a one-line fix |
| `invalid_state` (409) | The object is in the wrong state (already approved, already paid) | Show the message; the view will already be current |
| `reason_required`, `evidence_required`, `note_required`, `*_invalid`, `*_required` (422) | Missing or invalid input | Mark the field |
| `not_your_turn`, `max_rounds`, `rate_limited` (429) | Negotiation and messaging limits | Show the message |
| `account_on_hold` | Ops put the person on hold: they can look, not act | Show the message; their money is safe |
| `tier_locked` | Not yet available at this creator tier | Show what unlocks it |
| `not_found` (404) | The row does not exist | Designed 404 |
| `not_ready` (503), `load_failed`, `internal_error` | The demo is not loaded or something broke | Retry; the action changed nothing |

A failed action never changes anything: the state is the same object as before.

## Lists, filters and joins

Hooks return **views**: the row with its joins resolved (`bounty.app`, `bounty.brand`, `submission.creator`, `post.creator`) and the derived numbers pages would otherwise recompute (`spots_left`, `fill_ratio`, `hours_left`, `all_in_cents`, a dated `reason_text` on every Money Clock row). The exact fields are in the types: each hook below names the selector file that defines its view and filter types (`src/lib/data/selectors/<file>.ts`). Filters accept a single value or an array where it makes sense (`status: ["live", "paused"]`), plus convenience groups (`status: "open"`, `"active"`, `"closed"`).

Common filter vocabulary:

* `BountyStatus`: draft, awaiting_funding, scheduled, live, paused, filled, ended, settled, cancelled.
* `SubmissionStatus`: qa_pending, in_review, changes_requested, approved, posted, rejected, appealed, withdrawn, expired, released.
* `PostStatus`: live, window_closed, held, cleared, paid, removed, clawed_back.
* `MoneyClockState`: accruing, pending, cleared, paid, held, reversed.
* `OfferStatus`: awaiting_creator, awaiting_brand, accepted, declined, expired, withdrawn, completed.
* `Tier`: bronze, silver, gold, platinum, elite. `LeaderboardScope`: cohort, niche, global.

## Names from the build plan and what they are called here

| The plan said | Use |
| --- | --- |
| `createBounty` / `publishBounty` (lint blockers, escrow funding to Funded) | `actions.createBounty`, `actions.publishBounty` (`fund: true` by default, `top_up_from_card` to cover a shortfall) |
| `fundWallet` | `actions.fundWallet` |
| `submitVideo` (Reserved Slot) | `actions.submitVideo` (needs `accept_rights: true`) |
| `approve` / `requestRevision` / `reject` / `appeal` | `approveSubmission` / `requestRevision` (timecoded `notes`) / `rejectSubmission` (reason code + evidence) / `appealRejection` |
| `autoApproveRun` | `actions.autoApproveRun` |
| `claimBounty` | `actions.claimBounty` (joins), `actions.saveBounty` (shortlist) |
| `sendOffer` / `counter` / `accept` / `decline` | `sendOffer` / `counterOffer` / `acceptOffer` / `declineOffer` |
| `placeBid` | `actions.placeBid` |
| `requestPayout` (instant, fee preview) | `actions.requestPayout`; preview with `useInstantPreview()` |
| `markPaid` (weekly payout) | `actions.runPayoutRun` (Ops; moves the clock to Friday 18:00 UTC and pays the run) |
| `disputePost` / `resolveDispute` (admin) | same names |
| `joinTournament` / `claimDrop` / `completeLesson` | same names |
| `connectIntegration` / `createApiKey` / `inviteTeamMember` / `runAudit` / `saveRateCard` / `toggleWellbeing` | same names |
| `markNotificationRead` / `resetDemo` | `actions.markNotificationRead` / `actions.resetDemo` |
| `useHooks()` | `useHooks()` (the hook library; `useRemix()` also returns hooks, formats and winner cards together) |

## Reading on the server and in tests

Selectors are pure functions `(db, arg?) => view`; the hooks are thin wrappers. In a Server Component or a route handler:

```ts
import { getServerState, runServerAction } from "@/lib/store/server";
import { selectBounties, selectTicker } from "@/lib/data/selectors";      // server-safe barrel (no React)
import { approveSubmission } from "@/lib/store/core/review";

const db = await getServerState();                                        // one in-memory world per server process
const live = selectBounties(db, { status: "live" });
const r = await runServerAction(approveSubmission, [{ submission_id }], { persona: "brand" });
```

The server world is seeded from the same fixtures, never persisted, and calls never overlap. It exists for the mock API (`/api/v1/**`); the browser store is the source of truth for the app.

In vitest, `makeWorld("brand")` from `src/lib/store/__tests__/helpers.ts` gives an isolated booted store with the actions bound to it (`w.actions.fundWallet(...)`, `w.state()`, `w.as("creator")`, `ledgerProblems(w.state())`).

## Adding a selector and hook

```ts
// src/lib/data/selectors/<area>.ts
export const selectThing = defineSelector(["things", "apps"] as const, (db: Db<"things" | "apps">, id: string | undefined): ThingView | undefined => { ... });
// src/lib/data/hooks.ts
export const useThing = hookOf(selectThing);
```

The listed keys are the only tables the selector may read (the type system and `selectors-sweep.test.ts` enforce it), and the hook subscribes to exactly those. A selector must be total: on the empty world it returns an empty list or `undefined`, never throws. Never read the clock inside a selector; use `db.clock.now`. Cache joins with `joinView` and group lookups with `groupBy`/`valuesOf` so identity stays stable.

## Invariants the tests guard

* The ledger is double-entry: every transaction nets to zero, and `wallet_balance_cents` always equals the ledger's `wallet:<brand>` account.
* The escrow identity holds on every bounty: funded = reserved + spent + remaining + refunded.
* Money never moves except through ledger transactions written by an action; a failed action changes nothing.
* Creators are never charged: a referral reward is paid from flowd's treasury, instant cash-out costs the creator the quoted fee only (1.5%, min $0.50, max $15), the Friday payout is free.
* "Pending" is never bare: every Money Clock row has a dated ETA and a named reason.

---

## Hook reference

All hooks are exported from `@/lib/data`. Every argument is optional at the type level (a hook before the user has picked something gets `undefined`), and every hook returns the empty world until the store is ready.

### Session and identity

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useMe()` | `Me` | Who is signed in (persona, user, creator, brand workspace, member and role, active app, app and workspace switchers). Safe before the store is ready. | `selectors/identity.ts` |
| `useDemoSession()` | `Session` | The demo store's session slice: persona and the current ids (user, creator, brand, app, member). Cheap; use `useMe` when you need the rows. Not `useSession` from `@/lib/session`, which is the sign-in cookie (`signIn`, `signOut`); the store follows the cookie. |  |
| `usePersona()` | `Persona \| null` | The current persona: "brand", "creator", "admin" or null (signed out). |  |

### Bounties

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useBounties(arg?: BountyFilter)` | `readonly BountyView[]` | `useBounties({ brand: "mine", status: "live" \| "open" \| "active" \| "closed" \| BountyStatus, app, type, visibility, funded, category, featured, q, sort, limit })`: bounty rows with app, brand, scorecard, fill and spots joined. | `selectors/bounties.ts` |
| `useBounty(arg?: string)` | `BountyView \| undefined` | One bounty row by id. | `selectors/bounties.ts` |
| `useBountyCounts(arg?: { brand?: string \| undefined; })` | `BountyTabCounts` | Counts for the bounty tabs (draft, live, paused, filled, ended...), for a brand or everyone. | `selectors/bounties.ts` |
| `useBountyPreview(arg?: BountyDraftInput)` | `BountyPreview \| null` | The live preview of a bounty being built: pay math, fee ladder, brief lint blockers, price suggestion and what it will cost. Null with no draft. | `selectors/bounties.ts` |
| `useBountyDetail(arg?: string)` | `BountyDetail \| undefined` | The brand's bounty page: the `bounty` row, `money` (the escrow identity), `submissions`, `posts`, `settlement`, `creators`, `clawbacks`, `funnel`, `cost` and `review`. | `selectors/bounty-detail.ts` |
| `useBountyForCreator(arg?: string)` | `CreatorBountyView \| undefined` | A bounty as the signed-in creator sees it: match score, expected pay, what blocks submitting (in words), their submissions and saved state. | `selectors/feed.ts` |
| `useFeed(arg?: FeedFilter)` | `FeedResult` | `useFeed({ structure, platform, category, saved, hide_locked, funded_only, q, sort: "match" \| "pay" \| "new" \| "ending" \| "spots", limit })`: the creator feed, ranked, with match reasons, locks and tier head starts. | `selectors/feed.ts` |
| `useStarterBounties()` | `readonly BountyView[]` | The funded starter bounties for new creators (flat $5, decision within 24 hours). | `selectors/feed.ts` |
| `useSavedBounties()` | `readonly BountyView[]` | The creator's saved and joined bounties, newest first. | `selectors/feed.ts` |
| `usePublicBounty(arg?: string)` | `PublicBounty \| undefined` | A bounty on its public page `/b/[id]`; undefined for drafts and unfunded bounties. | `selectors/public.ts` |

### Submissions, review and posts

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useSubmissions(arg?: SubmissionFilter)` | `readonly SubmissionView[]` | `useSubmissions({ creator: "mine", brand: "mine", bounty, app, status: "open" \| "decided" \| SubmissionStatus, q, sort })`: submissions with bounty, creator, brand and the decision clock joined. | `selectors/submissions.ts` |
| `useSubmission(arg?: string)` | `SubmissionView \| undefined` | One submission by id. | `selectors/submissions.ts` |
| `useSubmissionsForBounty(arg?: string)` | `readonly SubmissionView[]` | Every submission to one bounty. | `selectors/submissions.ts` |
| `useSubmissionAnalysis(arg?: string)` | `SubmissionAnalysis` | The AI analysis of a submission (hook score, fit, compliance checks, fraud signals). Loads the heavy analysis table; `loading` is true until it is there. | `selectors/submissions.ts` |
| `useReviewQueue(arg?: ReviewQueueFilter)` | `ReviewQueue` | The brand's review queue: `items` with SLA timers, QA and fraud flags, auto-approve matches, plus `counts`, `fraud_hold`, `inbox_zero` and `active_rules`. | `selectors/submissions.ts` |
| `useRules(arg?: string)` | `readonly RuleView[]` | The brand's auto-approve rules with match counts and last-run results. | `selectors/submissions.ts` |
| `useRule(arg?: string)` | `RuleView \| undefined` | One auto-approve rule. | `selectors/submissions.ts` |
| `usePosts(arg?: PostFilter)` | `readonly PostView[]` | `usePosts({ creator: "mine", brand: "mine", bounty, app, status: "open" \| "settling" \| PostStatus, q, sort })`: posts with creator, bounty, 72-hour window, Money Clock rows and earnings joined. | `selectors/posts.ts` |
| `usePost(arg?: string)` | `PostView \| undefined` | One post by id. | `selectors/posts.ts` |
| `usePostLedger(arg?: string)` | `PostLedger` | The Post Ledger: every cent of one post, line by line, with the money state and ETA of each and a proof hash. | `selectors/post-ledger.ts` |

### Money: creator

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useMoneyClock(arg?: MoneyClockFilter)` | `readonly MoneyClockView[]` | `useMoneyClock({ creator, state, bounty, limit })`: the Money Clock rows (accruing, pending, cleared, paid, held, reversed), each with its dated ETA and a named reason. | `selectors/money.ts` |
| `usePayouts(arg?: string)` | `readonly PayoutView[]` | Payout history and the next Friday payout. | `selectors/money.ts` |
| `usePayout(arg?: string)` | `PayoutView \| undefined` | One payout with its earnings lines. | `selectors/money.ts` |
| `useInstantPreview(arg?: { creator?: string \| undefined; row_ids?: string[] \| undefined; })` | `InstantPreview \| null` | The instant cash-out preview: amount, fee (1.5%, min $0.50, max $15), net, and why it is or is not available. Null with nothing eligible. | `selectors/money.ts` |
| `useCreatorWallet(arg?: { creator?: string \| undefined; days?: number \| undefined; })` | `CreatorWallet` | The creator wallet: `summary` (pending, cleared, held, paid), the `ledger` totals it agrees with, Money Clock `rows`, `next_payout`, `payouts`, `hold`, payout `method`, the `instant` cash-out preview, a 30 day `series`, the income `calendar`, `proofs` and the `tax` desk. | `selectors/money.ts` |
| `useTaxDesk(arg?: string)` | `CreatorTaxDesk \| null` | The tax desk: year to date earnings, form status, 1099 threshold progress and set-aside. Null for a signed-out visitor. | `selectors/money.ts` |
| `useWalletChip(arg?: string)` | `WalletChip` | The small wallet chip for the creator shell: pending, cleared and held. | `selectors/money.ts` |

### Money: brand

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useBrandWallet(arg?: string)` | `BrandWallet` | The brand wallet: `wallet` (balance, available, held for bids), `escrow` (held, reserved, available, settled, returned, with the bounties), `plan`, `auto_top_up`, `payment_method`, recent `txns`, `invoices`, the fee ladder (`fees`) and `spend_30d_cents`. | `selectors/brand-wallet.ts` |
| `useInvoice(arg?: string)` | `InvoiceView \| undefined` | One invoice with line items. | `selectors/brand-wallet.ts` |
| `useLedger(arg?: LedgerFilter)` | `LedgerExplorer` | The ledger explorer: double-entry transactions, filters, totals and the nets-to-zero check. | `selectors/brand-wallet.ts` |
| `useEscrowProof(arg?: string)` | `EscrowProof \| null` | The escrow proof for one bounty: funded = reserved + spent + remaining + refunded, with the ledger lines behind each term. Null for an unknown bounty. | `selectors/brand-wallet.ts` |

### Funnel, overviews and home screens

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useFunnel(arg?: FunnelScope)` | `FunnelView` | The attribution funnel for a scope: `steps` (views, visits, installs, trials, paid), `counts`, `tracked` and `estimated` (kept apart), `coverage`, `cost_cents`, breakdowns (`by_source`, `by_hook_type`, `by_format`, `by_platform`, `by_bounty`), `cohorts` and `trend`. `loading` is true until its heavy tables arrive. | `selectors/funnel.ts` |
| `useBrandOverview(arg?: { range?: OverviewRange \| undefined; brand?: string \| undefined; })` | `BrandOverview` | The brand overview: `tiles` (spend, views, installs, trials, paid, CAC), `needs` (what needs you now), `pacing`, `funnel`, `live_bounties`, `market`, `activity`, `next_actions`, the setup `checklist` and `is_new`. | `selectors/brand-overview.ts` |
| `useCreatorHome()` | `CreatorHome` | The creator home: `wallet`, today's `drop`, `streak`, `matched` bounties, `what_to_post`, the `first_dollar` tracker, `next_steps`, `activity` and `tier`. | `selectors/creator-home.ts` |
| `useOnboarding()` | `OnboardingView` | The First-Dollar Path wizard state: steps done and next, niches, linked accounts, 18+ confirmation and starter bounties. | `selectors/creator-home.ts` |

### Market

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useMarket(arg?: Category)` | `MarketView \| undefined` | One category's market: `stats` (clearing CPM and bands), `trend_copy`, `series`, `heat`, `curve`, `thin_market`, `supply`, `open_bounties`, `mine` and `top_hooks`. Undefined for no category. | `selectors/market.ts` |
| `useMarketOverview()` | `readonly MarketOverviewRow[]` | Every category's market in one table (the market overview). | `selectors/market.ts` |
| `usePriceSuggestion(arg?: { category: Category; cpm_cents?: number \| undefined; target_hours?: number \| undefined; })` | `PriceSuggestion \| undefined` | The pricing assistant: suggested CPM, fill-time forecast and where a CPM sits in the market. | `selectors/market.ts` |
| `useTrends(arg?: TrendFilter)` | `readonly TrendView[]` | Trend radar: rising sounds, formats and topics, filterable by niche and status. | `selectors/market.ts` |
| `useAuctions(arg?: AuctionFilter)` | `readonly AuctionView[]` | Creator auctions (sealed bids): open, closing soon and resolved, with the bid state of the signed-in persona. | `selectors/market.ts` |
| `useAuction(arg?: string)` | `AuctionView \| undefined` | One auction with bids (sealed for others), hold and the price to beat. | `selectors/market.ts` |
| `useSpecs(arg?: SpecFilter)` | `readonly SpecView[]` | Spec videos: unpaid-until-licensed uploads brands can license. | `selectors/market.ts` |
| `useSpec(arg?: string)` | `SpecView \| undefined` | One spec video. | `selectors/market.ts` |

### Offers, inbox and threads

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useOffers(arg?: OfferFilter)` | `readonly OfferView[]` | Direct offers (brand to creator and creator to brand) with the whole negotiation, turn and expiry. | `selectors/offers.ts` |
| `useOffer(arg?: string)` | `OfferView \| undefined` | One offer. | `selectors/offers.ts` |
| `useRebuyCandidates(arg?: number)` | `readonly RebuyCandidate[]` | Creators a brand paid before and can rebuy in one click, with their last price. | `selectors/offers.ts` |
| `useInbox(arg?: InboxFilter)` | `InboxView` | The inbox: `threads`, `unread_total` and `offers_waiting`. | `selectors/offers.ts` |
| `useThread(arg?: string)` | `ThreadView \| undefined` | One thread with its messages. | `selectors/offers.ts` |

### Creators

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useCreatorDirectory(arg?: CreatorFilter)` | `CreatorDirectory` | The creator directory for brands: `items` (reputation, reliability, rate card, match) and `total`. | `selectors/creators.ts` |
| `useCreatorProfile(arg?: string)` | `CreatorProfileView \| undefined` | A creator profile as a brand sees it (reputation, work, rate card, lists). | `selectors/creators.ts` |
| `usePublicCreator(arg?: string)` | `PublicCreator \| undefined` | The public creator page `/c/[handle]`. | `selectors/creators.ts` |
| `useLists(arg?: string)` | `readonly ListView[]` | The brand's creator lists (shortlists, favourites, blocked). | `selectors/creators.ts` |
| `useRateCard(arg?: string)` | `RateCardView` | The creator's rate card with a suggested price and the market median. | `selectors/creators.ts` |

### Community, learning and growth for creators

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useLeaderboard(arg?: LeaderboardArg)` | `LeaderboardView` | Leaderboards: peer cohorts of about 30: `board`, `rows`, `me` (your rank and the gap to the next place), `promotion_zone_size`, `hours_to_reset`, `available`, `opted_out` and `typical_cents`. | `selectors/community.ts` |
| `useCrews()` | `CrewsView` | Crews: `mine` (your crew, members, weekly goal), `discover` (open crews to join), `can_lead` and `lead_blocked_reason`. | `selectors/community.ts` |
| `useTournaments()` | `TournamentsView` | Tournaments: `live`, `open`, `upcoming`, `past` and `mine` (your entries and standing). | `selectors/community.ts` |
| `useTournament(arg?: string)` | `TournamentView \| undefined` | One tournament with rounds, matchups and prizes. | `selectors/community.ts` |
| `useAcademy()` | `AcademyView` | The Academy: `lessons` with progress, `completed`, `total`, `badges`, `reliability_bonus`, `graduate` and the `next` lesson. | `selectors/community.ts` |
| `useLesson(arg?: string)` | `LessonView \| undefined` | One lesson with the creator's progress. | `selectors/community.ts` |
| `useRemix(arg?: RemixFilter)` | `RemixView` | The Remix library: formats, hooks and "why it won" cards, with filters. | `selectors/community.ts` |
| `useFormat(arg?: string)` | `FormatView \| undefined` | One format with its beats, script and shot list. | `selectors/community.ts` |
| `useTemplates(arg?: TemplateFilter)` | `readonly FormatView[]` | The 11 winning format templates, filterable by niche, hook type, category, difficulty and faceless. | `selectors/community.ts` |
| `useHooks(arg?: HookFilter)` | `readonly HookLibraryRow[]` | The hook library (7 types, 10 or more hooks each), with templates filled for an app: `useHooks({ type, fill: { app } })`. | `selectors/community.ts` |
| `useReferrals()` | `ReferralsView` | Referrals: your `code` and `link`, `referrals`, `totals` and the `rules` (5% for 90 days, capped at $100 per referee). | `selectors/community.ts` |
| `useWrapped(arg?: string)` | `WrappedView` | A Wrapped recap (monthly or yearly), 8 to 10 story cards. | `selectors/community.ts` |
| `useWellbeing()` | `WellbeingView` | Wellbeing Mode: `settings`, `saved` (whether settings exist yet), whether you are `paused`, `set_aside`, and `resources`. | `selectors/community.ts` |
| `useSafety()` | `SafetyView` | Scam Shield and account health: `reports`, `accounts`, `rules` and the `checklist`. | `selectors/community.ts` |

### Creator home pieces

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useDrops()` | `DropsView` | The Daily Drop: `today` (state, hours left, items with real inventory), `upcoming` and `recent`. | `selectors/creator-home.ts` |
| `useDrop(arg?: string)` | `DropView \| undefined` | One drop by id. | `selectors/creator-home.ts` |
| `useStreak(arg?: string)` | `StreakView \| null` | The creator's streak: current, longest, freezes and the week's goal. | `selectors/creator-home.ts` |
| `useTiers(arg?: string)` | `TierView` | Tier progress: the current tier, `remaining` to the next, `progress`, `unlocks`, the `ladder`, `grace` and the `history`. | `selectors/creator-home.ts` |
| `useNotifications(arg?: NotificationFilter)` | `NotificationsView` | Notifications: `items`, the `unread` count and `needs_you` (the notifications that wait on an action), filterable by kind and unread. | `selectors/creator-home.ts` |

### Growth tools for brands

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useLibrary(arg?: LibraryFilter)` | `LibraryResult` | The creative library: a brand's winning posts with performance, tags and filters. | `selectors/growth.ts` |
| `useLibraryCompare(arg?: readonly string[])` | `readonly LibraryItem[]` | Side-by-side compare of up to 4 library items. | `selectors/growth.ts` |
| `useTestPlans(arg?: string)` | `readonly TestPlanView[]` | Test plans (hook and format experiments) with arms and results. | `selectors/growth.ts` |
| `useTestPlan(arg?: string)` | `TestPlanView \| undefined` | One test plan. | `selectors/growth.ts` |
| `useCanUseTestPlanner()` | `boolean` | Whether the plan includes the test planner (Pro and above). | `selectors/growth.ts` |
| `usePromotions(arg?: string)` | `Promotions` | Promotions: spark-code ads and boosts for approved posts with eligibility, cost and results. | `selectors/growth.ts` |

### Trust and safety

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useRightsVault(arg?: string)` | `RightsVaultView` | The Rights Vault: `rows` (every licence, soonest expiry first), `buckets` (expired, within 7, 14 and 30 days, later, no end) and `counts` (total, active, expiring in 30 days, expired, ads depending on a licence). | `selectors/trust.ts` |
| `useRenewalQuote(arg?: { grant_id: string; extra_days: number; })` | `(RenewalQuote & { grant_id: string; }) \| null` | The quote to extend a licence by N days. Null for an unknown grant. | `selectors/trust.ts` |
| `useMyRights(arg?: string)` | `readonly MyLicence[]` | The creator's own licences: where their videos are licensed, to whom, until when. | `selectors/trust.ts` |
| `useRightsCard(arg?: string)` | `{ card: RightsCard; lines: readonly RightsLine[]; summary: string; } \| undefined` | The plain-language rights card of a bounty. | `selectors/trust.ts` |
| `useComplianceLog(arg?: ComplianceFilter)` | `ComplianceLog` | The compliance log: FTC disclosure and platform-policy checks per post with the fix. | `selectors/trust.ts` |
| `useDisputes(arg?: DisputeFilter)` | `readonly DisputeView[]` | Disputes filtered by status, side and bounty. | `selectors/trust.ts` |
| `useDispute(arg?: string)` | `DisputeView \| undefined` | One dispute with evidence, timeline and next step. | `selectors/trust.ts` |
| `useBrandScorecard(arg?: string)` | `ScorecardView \| undefined` | A brand scorecard: `metrics`, `decisions_n`, approval and rejection rates, decision hours (median, p90), pay speed, `badges`, `band`, `trend_30d` and `improvements`. Undefined for an unknown brand. | `selectors/trust.ts` |
| `useBrandScorecards(arg?: number)` | `readonly ScorecardView[]` | Brand scorecards, best first. | `selectors/trust.ts` |

### Workspace and settings

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useApps(arg?: string)` | `readonly AppView[]` | The brand's apps with attribution health and active bounties. | `selectors/workspace.ts` |
| `useApp(arg?: string)` | `AppView \| undefined` | One app. | `selectors/workspace.ts` |
| `useAttributionKit(arg?: string)` | `AttributionKit` | Tracking links, promo codes, SDK status and the setup checklist for an app. | `selectors/workspace.ts` |
| `useIntegrations(arg?: string)` | `IntegrationsView` | Integrations: `integrations` of this workspace, the `catalog` (each kind with its connected row), `webhooks`, `slack` and recent `deliveries`. | `selectors/workspace.ts` |
| `useTeam(arg?: string)` | `TeamView` | The team: `members`, the role `matrix`, `invited`, `can_manage` and `seats_used`. | `selectors/workspace.ts` |
| `useActivityLog(arg?: ActivityFilter)` | `readonly ActivityRow[]` | The workspace activity log. | `selectors/workspace.ts` |
| `useDeveloper(arg?: string)` | `DeveloperView` | Developer settings: API `keys` (masked), `webhooks` with deliveries, `mcp`, `openapi_url`, `base_url` and `scopes`. | `selectors/workspace.ts` |
| `useAgency()` | `AgencyView` | The agency view: `plan_ok`, `clients` (client brands with spend and health) and `totals`. | `selectors/workspace.ts` |
| `useBrandSettings()` | `BrandSettingsView` | Brand settings: profile, defaults, notification and billing preferences. | `selectors/workspace.ts` |

### Admin

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useAdminMetrics()` | `AdminMetricsView` | Ops metrics: `summary`, `targets`, `market_health`, `queues`, `alerts`, `promise_metrics`, `next_payout_run`, `payout_run` and `gaps`. | `selectors/admin.ts` |
| `useDemoClock()` | `DemoClockView` | The demo clock: `now`, `advanced_hours`, `next_clearing_run`, `next_payout_run` and `hours_to_payout`. Advance it with `actions.advanceClock`. | `selectors/admin.ts` |
| `useFraudQueue(arg?: FraudFilter)` | `FraudQueue` | The fraud queue with filters and counts. | `selectors/admin.ts` |
| `useFraudCase(arg?: string)` | `FraudCaseDetail \| undefined` | One fraud case with signals and the decision options. | `selectors/admin.ts` |
| `useVerificationQueue(arg?: VerificationFilter)` | `VerificationQueue` | Identity and tax verification queue. | `selectors/admin.ts` |
| `usePayoutOps()` | `PayoutOps` | Payout operations: `next_run`, `held`, `failed`, `runs`, `instant_7d` and `method_issues`. | `selectors/admin.ts` |
| `useSlaDesk()` | `SlaDesk` | The review SLA desk: `stale` and `breached` videos, `by_brand`, and `unused` (approved videos nearing the 30-day release to the Spec Market). | `selectors/admin.ts` |
| `useSafetyQueue(arg?: SafetyFilter)` | `SafetyQueue` | Scam reports and safety cases. | `selectors/admin.ts` |
| `useBountyRegistry(arg?: BountyRegistryFilter)` | `readonly BountyRegistryRow[]` | Every bounty with filters, for ops. | `selectors/admin.ts` |
| `useCreatorRegistry(arg?: CreatorRegistryFilter)` | `readonly CreatorRegistryRow[]` | Every creator with filters, for ops. | `selectors/admin.ts` |
| `useBrandRegistry(arg?: { q?: string \| undefined; plan?: Plan \| undefined; })` | `readonly BrandRegistryRow[]` | Every brand with filters, for ops. | `selectors/admin.ts` |
| `useMlModels()` | `readonly MlModelView[]` | The ML models behind scoring, with versions, accuracy and drift. | `selectors/admin.ts` |
| `useAdminAudit(arg?: number)` | `readonly { id: string; at: string; action: string; detail: string; target_kind?: string \| undefined; target_id?: string \| undefined; }[]` | The admin audit trail. | `selectors/admin.ts` |

### Public pages and free tools

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useTicker()` | `TickerView` | The live payout ticker with the typical creator beside the top figure. | `selectors/public.ts` |
| `useMedianEarnings()` | `MedianEarnings` | Typical (median) creator earnings in 30 days, the band and the top decile. | `selectors/public.ts` |
| `useWaitlist()` | `Waitlist & { visitor?: WaitlistVisitor \| undefined; founding_application?: FoundingApplication \| undefined; } & { total: number; }` | The ranked waitlist and the demo visitor's place. | `selectors/public.ts` |
| `useFoundingSpots()` | `FoundingSpots` | The true count of the 200 founding-creator places. | `selectors/public.ts` |
| `useStateOfAppUgc()` | `StateOfAppUgc` | The State of App UGC report. | `selectors/public.ts` |
| `useProof(arg?: string)` | `ProofView \| undefined` | A proof page `/p/[id]`; undefined for an unknown id. | `selectors/public.ts` |
| `useTrackingLanding(arg?: string)` | `TrackingLanding` | What a viewer sees at a tracking link `/r/<code>`. | `selectors/public.ts` |
| `useAudit(arg?: string)` | `AuditView \| undefined` | An audit report by slug. | `selectors/public.ts` |
| `useAudits(arg?: number)` | `readonly AuditReport[]` | Example and recent audits. | `selectors/public.ts` |
| `useCaseStudies()` | `readonly CaseStudyView[]` | Case studies (fictional in the demo, labelled). | `selectors/public.ts` |
| `useTestimonials(arg?: PartyKind)` | `readonly Testimonial[]` | Testimonials, optionally for brands or creators. | `selectors/public.ts` |
| `useChangelog(arg?: { tag?: ChangelogTag \| undefined; audience?: PartyKind \| undefined; })` | `readonly ChangelogEntry[]` | The changelog, newest first. | `selectors/public.ts` |
| `usePromise()` | `PromiseView` | The 11 flowd Promise commitments with their live public proof. | `selectors/public.ts` |
| `useTrustMetrics()` | `{ as_of: string; fill_rate_48h: number; median_fill_hours: number; median_decision_hours: number; decided_in_sla_ratio: number; cleared_on_eta_ratio: number; disputes_resolved_48h_ratio: number; funded_live_ratio: number; first_dollar_median_hours: number; active_creators_per_live_bounty: number; }` | Public market-health numbers for the Trust Center. | `selectors/public.ts` |
| `useEarningsCalculator(arg?: EarningsCalcInput)` | `EarningsCalcResult \| undefined` | The free earnings calculator: an estimate beside what typical creators really cleared. | `selectors/public.ts` |
| `useBudgetPlanner(arg?: BudgetPlanInput)` | `BudgetPlanResult \| undefined` | The free budget planner: what a pool buys in views, installs, trials and paid. | `selectors/public.ts` |

### Search

| Hook | Returns | What it is | Types in |
| --- | --- | --- | --- |
| `useSearchIndex()` | `SearchIndex` | The command-palette index for the signed-in persona (their own bounties, submissions, posts, lessons, creators, plus pages and actions). | `selectors/search.ts` |

---

## Action reference

`import { actions } from "@/lib/store"`. Each action takes one input object and returns `Promise<ActionResult<Data>>`. The table lists the input type and the `data` you get on success. Inline inputs are spelled out; named inputs are expanded under "Input shapes" below.

An action works for the persona it belongs to (the section says which): the same call from another persona returns `forbidden`. Brand actions act on the signed-in workspace unless the input names another brand you manage. Ops can act on any brand or creator where the product allows it.

Two actions are called a little differently:

* `actions.resetDemo()` returns `Promise<void>`: it throws away every change and keeps you signed in.
* `actions.requestPayout({ confirm_fee_cents })`: call `useInstantPreview()` first, show the fee, and pass the fee you showed. If the real fee differs the action refuses (`fee_changed`) instead of surprising the creator.

### Brand: bounties

| Action | Input | Result data | Notes |
| --- | --- | --- | --- |
| `createBounty` | `BountyDraftInput` | `BountyDraftResult` | Saves a draft bounty (linted and priced; nothing is charged). |
| `updateBounty` | `{ bounty_id: string; changes: Partial<BountyDraftInput>; }` | `BountyDraftResult` |  |
| `discardBountyDraft` | `{ bounty_id: string; }` | `{ bounty: Bounty; }` |  |
| `publishBounty` | `{ bounty_id: string; fund?: boolean; top_up_from_card?: boolean; }` | `PublishResult` | Publishes a draft: Brief Lint blockers stop it (`brief_lint_blockers`); then funds the escrow from the wallet and goes live (Funded badge). |
| `fundBounty` | `{ bounty_id: string; top_up_from_card?: boolean; }` | `FundResult` |  |
| `topUpBounty` | `{ bounty_id: string; amount_cents: number; top_up_from_card?: boolean; }` | `{ bounty: Bounty; added_cents: number; }` |  |
| `pauseBounty` | `{ bounty_id: string; reason?: string; }` | `{ bounty: Bounty; }` |  |
| `resumeBounty` | `{ bounty_id: string; }` | `{ bounty: Bounty; }` |  |
| `extendBounty` | `{ bounty_id: string; ends_at: string; }` | `{ bounty: Bounty; }` |  |
| `endBounty` | `{ bounty_id: string; }` | `{ bounty: Bounty; }` |  |
| `cancelBounty` | `{ bounty_id: string; reason?: string; }` | `{ bounty: Bounty; refunded_cents: number; }` |  |
| `featureBounty` | `{ bounty_id: string; weeks?: number; }` | `{ bounty: Bounty; fee_cents: number; }` |  |

### Brand: wallet and billing

| Action | Input | Result data | Notes |
| --- | --- | --- | --- |
| `fundWallet` | `{ amount_cents: number; }` | `TopUpResult & { balance_cents: number; }` |  |
| `changeBrandPlan` | `{ plan: Plan; }` | `PlanChange` |  |
| `setPaymentMethod` | `{ kind: PaymentKind; label?: string; last4: string; exp?: string; }` | `{ brand: Brand; payment_method: PaymentMethod; }` |  |
| `updateInvoice` | `{ invoice_id: string; po_number?: string; cost_center?: string; vat_id?: string; }` | `{ invoice: Invoice; }` |  |
| `recordExport` | `{ what: string; target_kind?: string; target_id?: string; }` | `{ logged: true; }` |  |
| `recordInvoiceDownload` | `{ invoice_id: string; }` | `{ invoice: Invoice; }` |  |
| `updateBrandSettings` | `BrandSettingsPatch` | `{ brand: Brand; }` |  |
| `switchWorkspace` | `{ brand_id?: string; app_id?: string; }` | `{ session: Session; }` |  |

### Brand: review

| Action | Input | Result data | Notes |
| --- | --- | --- | --- |
| `approveSubmission` | `{ submission_id: string; summary?: string; }` | `{ submission: Submission; link_url: string; promo_code?: string \| undefined; }` |  |
| `requestRevision` | `{ submission_id: string; notes: NoteInput[]; reason_code?: ReasonCode; summary?: string; }` | `{ submission: Submission; notes: FeedbackNote[]; extra_round_fee_cents: number; }` | Timecoded notes (at least one must-fix); two rounds are included, later rounds are paid by the brand. |
| `rejectSubmission` | `{ submission_id: string; reason_code?: ReasonCode; evidence?: Evidence; summary?: string; }` | `{ submission: Submission; }` | A reason code and evidence are mandatory (`reason_required`, `evidence_required`). |
| `addFeedbackNote` | `{ submission_id: string; note: NoteInput; }` | `{ note: FeedbackNote; }` |  |
| `resolveNote` | `{ note_id: string; status?: "resolved" \| "dismissed"; }` | `{ note: FeedbackNote; }` |  |
| `saveRule` | `SaveRuleInput` | `{ rule: AutoApproveRule; }` |  |
| `dryRunRule` | `{ rule_id: string; }` | `{ rule: AutoApproveRule; result: DryRunResult; }` |  |
| `setRuleStatus` | `{ rule_id: string; status: "active" \| "paused" \| "killed"; reason?: string; }` | `{ rule: AutoApproveRule; }` |  |
| `autoApproveRun` | `{ rule_id?: string; }` | `{ approved: number; routed_to_human: number; evaluated: number; }` |  |
| `waiveCompliance` | `{ post_id: string; reason: string; }` | `{ compliance: ComplianceAudit; }` |  |

### Brand: growth and rights

| Action | Input | Result data | Notes |
| --- | --- | --- | --- |
| `createTestPlan` | `TestPlanInput` | `{ plan: TestPlan; }` |  |
| `updateTestPlan` | `{ plan_id: string; changes: Partial<Omit<TestPlanInput, "app_id">>; }` | `{ plan: TestPlan; }` |  |
| `assignTestPlan` | `{ plan_id: string; bounty_ids?: string[]; offer_ids?: string[]; }` | `{ plan: TestPlan; }` |  |
| `archiveTestPlan` | `{ plan_id: string; }` | `{ plan: TestPlan; }` |  |
| `promoteWinner` | `PromoteInput` | `{ ad: Ad; }` |  |
| `respondToAd` | `{ ad_id: string; accept: boolean; code_days?: number; }` | `{ ad: Ad; }` |  |
| `setAdStatus` | `{ ad_id: string; status: "paused" \| "live" \| "ended"; }` | `{ ad: Ad; }` |  |
| `resolveFatigue` | `{ alert_id: string; action: "acknowledge" \| "dismiss" \| "refresh"; }` | `{ alert: FatigueAlert; refresh_bounty_id?: string \| undefined; }` |  |
| `renewRights` | `{ grant_id: string; extra_days: number; }` | `{ grant: RightsGrant; total_cents: number; }` |  |
| `revokeRights` | `{ grant_id: string; reason: string; }` | `{ grant: RightsGrant; }` |  |

### Brand: market, offers, setup

| Action | Input | Result data | Notes |
| --- | --- | --- | --- |
| `addToList` | `{ creator_id: string; list_id?: string; note?: string; tags?: string[]; }` | `{ list: BrandList; }` |  |
| `removeFromList` | `{ list_id: string; creator_id: string; }` | `{ list: BrandList; }` |  |
| `createList` | `{ name: string; }` | `{ list: BrandList; }` |  |
| `sendOffer` | `SendOfferInput` | `{ offer: Offer; }` |  |
| `counterOffer` | `{ offer_id: string; amount_cents: number; message?: string; }` | `{ offer: Offer; }` |  |
| `sendOfferMessage` | `{ offer_id: string; body: string; }` | `{ offer: Offer; warning?: string \| undefined; }` |  |
| `acceptOffer` | `{ offer_id: string; }` | `{ offer: Offer; bounty_id?: string \| undefined; }` |  |
| `declineOffer` | `{ offer_id: string; reason?: string; }` | `{ offer: Offer; }` |  |
| `withdrawOffer` | `{ offer_id: string; }` | `{ offer: Offer; }` |  |
| `placeBid` | `{ auction_id: string; amount_cents: number; note?: string; }` | `{ auction: Auction; bid: Bid; held_cents: number; }` |  |
| `withdrawBid` | `{ auction_id: string; }` | `{ auction: Auction; }` |  |
| `licenseSpec` | `{ spec_id: string; paid_ads_days?: number; }` | `{ spec: Spec; license: SpecLicense; brand_cost_cents: number; }` |  |
| `addApp` | `{ store_url_or_name: string; brand_id?: string; category?: Category; }` | `{ app: App; }` |  |
| `updateApp` | `{ app_id: string; changes: Partial<Pick<App, "name" \| "category" \| "tagline" \| "features" \| "default_hashtags" \| "pricing" \| "avg_first_payment_cents">>; }` | `{ app: App; }` |  |
| `setAppArchived` | `{ app_id: string; archived: boolean; }` | `{ app: App; }` | Archives or restores an app (`archived_at`). Refused while a bounty for it has money in escrow (`app_has_open_bounties`) or when it is the last active app (`last_app`). |
| `connectIntegration` | `ConnectIntegrationInput` | `{ integration: Integration; webhook_secret?: string \| undefined; }` |  |
| `disconnectIntegration` | `{ integration_id: string; }` | `{ integration: Integration; }` |  |
| `testIntegration` | `{ integration_id: string; }` | `{ integration: Integration; }` |  |
| `createApiKey` | `CreateApiKeyInput` | `{ key: ApiKey; secret: string; }` |  |
| `revokeApiKey` | `{ key_id: string; }` | `{ key: ApiKey; }` |  |
| `createWebhook` | `{ url: string; events: WebhookEventType[]; }` | `{ webhook: Webhook; secret: string; }` |  |
| `testWebhook` | `{ webhook_id: string; }` | `{ webhook: Webhook; }` |  |
| `inviteTeamMember` | `{ email: string; name?: string; role: "admin" \| "finance" \| "reviewer" \| "viewer" \| "client_approver"; }` | `{ member_id: string; user_id: string; approval_link?: string \| undefined; }` |  |
| `changeMemberRole` | `{ member_id: string; role: "admin" \| "finance" \| "reviewer" \| "viewer" \| "client_approver"; }` | `{ member_id: string; }` |  |
| `removeMember` | `{ member_id: string; }` | `{ member_id: string; }` |  |
| `claimAudit` | `{ slug: string; }` | `{ report: AuditReport; }` |  |

### Creator: the money path

| Action | Input | Result data | Notes |
| --- | --- | --- | --- |
| `updateOnboarding` | `OnboardingInput` | `OnboardingResult` |  |
| `saveBounty` | `{ bounty_id: string; saved?: boolean; }` | `{ saved: boolean; }` |  |
| `claimBounty` | `{ bounty_id: string; }` | `{ save: BountySave; }` |  |
| `submitVideo` | `SubmitVideoInput` | `SubmitVideoResult` | Takes a Reserved Slot from the pool, runs QA and the checklist scores, then enters review (or auto-approve). |
| `reviseSubmission` | `{ submission_id: string; clip: ClipInput; changes_summary?: string; file?: { size_bytes?: number; }; }` | `{ submission: Submission; analysis: VideoAnalysis; auto_approved: boolean; }` |  |
| `withdrawSubmission` | `{ submission_id: string; }` | `{ submission: Submission; }` |  |
| `appealRejection` | `{ submission_id: string; note: string; reason?: string; }` | `{ submission: Submission; dispute: Dispute; }` |  |
| `attachPost` | `AttachPostInput` | `AttachPostResult` |  |
| `removePost` | `{ post_id: string; }` | `{ post: Post; }` |  |
| `fixCaption` | `{ post_id: string; caption: string; }` | `{ post: Post; compliance: ComplianceAudit; }` |  |
| `disputePost` | `DisputePostInput` | `{ dispute: Dispute; }` |  |
| `withdrawDispute` | `{ dispute_id: string; }` | `{ dispute: Dispute; }` |  |
| `requestPayout` | `InstantCashOutInput` | `{ payout: Payout; fee_cents: number; net_cents: number; arrives_at: string; }` | Instant cash-out: the fee is quoted first; pass `confirm_fee_cents` to refuse a surprise. |
| `setPayoutMethod` | `{ kind: PayoutMethodKind; label?: string; last4: string; }` | `{ method: PayoutMethod; }` |  |
| `submitTaxForm` | `TaxFormInput` | `{ profile: TaxProfile; }` |  |
| `setTaxSetAside` | `{ rate: number; }` | `{ profile: TaxProfile; }` |  |
| `submitVerification` | `SubmitVerificationInput` | `{ verification: Verification; status: VerificationStatus; }` |  |
| `connectSocialAccount` | `{ platform: Platform; handle: string; }` | `{ account: SocialAccount; }` |  |
| `disconnectSocialAccount` | `{ account_id: string; }` | `{ removed: boolean; }` |  |
| `updateCreatorProfile` | `ProfilePatch` | `{ creator: Creator; }` |  |
| `shareProof` | `ShareProofInput` | `{ proof: Proof; url: string; }` |  |
| `revokeProof` | `{ proof_id: string; }` | `{ proof: Proof; }` |  |

### Creator: growth, social, safety

| Action | Input | Result data | Notes |
| --- | --- | --- | --- |
| `saveRateCard` | `RateCardInput` | `{ rate_card: RateCard; }` |  |
| `claimDrop` | `{ drop_id: string; bounty_id: string; }` | `{ drop_id: string; bounty_id: string; claimed_until: string; spots_left: number; }` |  |
| `joinTournament` | `{ tournament_id: string; hook_text: string; submission_id?: string; }` | `{ entry: TournamentEntry; }` |  |
| `startLesson` | `{ lesson_id: string; }` | `{ progress: LessonProgress; }` |  |
| `completeLesson` | `{ lesson_id: string; answers: number[]; }` | `LessonResult` |  |
| `createCrew` | `{ name: string; tagline: string; niche: Niche; open?: boolean; weekly_goal_cents?: number; }` | `{ crew: Crew; }` |  |
| `joinCrew` | `{ crew_id: string; invite_code?: string; }` | `{ crew: Crew; }` |  |
| `leaveCrew` | `none` | `{ left: boolean; }` |  |
| `inviteToFlowd` | `{ label: string; channel?: "link" \| "code" \| "qr"; }` | `{ referral: Referral; link: string; }` |  |
| `toggleWellbeing` | `{ enabled: boolean; }` | `{ settings: WellbeingSettings; }` |  |
| `updateWellbeing` | `WellbeingPatch` | `{ settings: WellbeingSettings; }` |  |
| `createAuction` | `CreateAuctionInput` | `{ auction: Auction; }` |  |
| `cancelAuction` | `{ auction_id: string; }` | `{ auction: Auction; }` |  |
| `uploadSpec` | `UploadSpecInput` | `{ spec: Spec; listed: boolean; reasons: string[]; }` |  |
| `withdrawSpec` | `{ spec_id: string; }` | `{ spec: Spec; }` |  |
| `reportScam` | `ReportInput` | `{ report: ScamReport; }` |  |
| `saveFloSuggestion` | `SaveFloInput` | `{ suggestion: FloSuggestion; }` |  |
| `rateFloSuggestion` | `{ id: string; helpful: boolean; }` | `{ suggestion: FloSuggestion; }` |  |

### Everyone

| Action | Input | Result data | Notes |
| --- | --- | --- | --- |
| `markNotificationRead` | `{ id: string; }` | `{ notification: Notification; }` |  |
| `markAllNotificationsRead` | `none` | `{ count: number; }` |  |
| `updateNotificationPrefs` | `Partial<Pick<NotificationPrefs, "quiet_hours" \| "push" \| "email_digest" \| "categories" \| "batch_non_cash" \| "drop_reminder">>` | `{ prefs: NotificationPrefs; }` |  |
| `sendThreadMessage` | `{ thread_id: string; body: string; }` | `SendThreadMessageResult` |  |
| `startThread` | `{ kind: "submission" \| "bounty" \| "support"; title: string; body: string; bounty_id?: string; submission_id?: string; }` | `{ thread: ChatThread; }` |  |
| `markThreadRead` | `{ thread_id: string; }` | `{ thread: ChatThread; }` |  |
| `replyToDispute` | `{ dispute_id: string; text: string; evidence?: Evidence; }` | `{ dispute: Dispute; }` |  |
| `runAudit` | `{ input: string; }` | `{ report: AuditReport; created: boolean; }` |  |

### Public pages

| Action | Input | Result data | Notes |
| --- | --- | --- | --- |
| `joinWaitlist` | `JoinWaitlistInput` | `JoinWaitlistResult` |  |
| `applyFoundingCreator` | `FoundingInput` | `{ application: FoundingApplication; spots_left: number; }` |  |
| `recordLinkClick` | `{ code: string; }` | `{ counted: boolean; app_id?: string \| undefined; link_id?: string \| undefined; }` |  |
| `recordProofView` | `{ proof_id: string; }` | `{ page_views: number; }` |  |

### Admin (Ops)

| Action | Input | Result data | Notes |
| --- | --- | --- | --- |
| `decideFraudFlag` | `FraudDecisionInput` | `{ flag: FraudFlag; clawed_cents: number; }` |  |
| `adminHoldPost` | `{ post_id: string; reason?: HoldReason; note?: string; }` | `{ post: Post; }` |  |
| `adminReleasePost` | `{ post_id: string; }` | `{ post: Post; }` |  |
| `requestDisputeEvidence` | `{ dispute_id: string; text: string; }` | `{ dispute: Dispute; }` |  |
| `startDisputeReview` | `{ dispute_id: string; }` | `{ dispute: Dispute; }` |  |
| `resolveDispute` | `ResolveDisputeInput` | `{ dispute: Dispute; }` |  |
| `decideVerification` | `{ verification_id: string; decision: "needs_info" \| "approve" \| "reject"; reason?: VerificationReason; note?: string; }` | `{ verification: Verification; }` |  |
| `decideScamReport` | `{ report_id: string; decision: "dismiss" \| "triage" \| "confirm" \| "action"; action_taken?: string; }` | `{ report: ScamReport; }` |  |
| `overrideTier` | `{ creator_id: string; tier: Tier; reason: string; }` | `{ creator_id: string; tier: Tier; }` |  |
| `nudgePayoutHold` | `{ payout_id: string; }` | `{ payout: Payout; }` |  |
| `retryFailedPayout` | `{ payout_id: string; }` | `{ payout: Payout; scheduled: Payout; }` |  |
| `adminHoldBounty` | `{ bounty_id: string; reason: string; }` | `{ bounty: Bounty; }` |  |
| `adminReleaseBounty` | `{ bounty_id: string; }` | `{ bounty: Bounty; }` |  |
| `overrideBriefLint` | `{ bounty_id: string; code: BriefLintCode; reason: string; }` | `{ bounty: Bounty; }` |  |
| `setCreatorStanding` | `{ creator_id: string; action: StandingAction; reason: string; }` | `{ creator: Creator; withdrawn: number; }` |  |
| `setBrandStanding` | `{ brand_id: string; action: "restore" \| "suspend"; reason: string; }` | `{ brand: Brand; paused_bounties: number; }` |  |
| `adjustBrandPlan` | `{ brand_id: string; plan: Plan; reason: string; }` | `{ brand: Brand; }` |  |
| `slaNudge` | `{ submission_id: string; }` | `{ submission: Submission; }` |  |
| `slaApproveIfClean` | `{ submission_id: string; }` | `{ submission: Submission; }` |  |
| `reassignBountyOwner` | `{ bounty_id: string; member_id: string; }` | `{ bounty: Bounty; }` |  |
| `advanceClock` | `{ hours: number; }` | `TickSummary` | Moves the demo clock forward and runs every scheduled job on the way (window closes, clearing, the Friday run, SLA timeouts). |
| `advanceClockTo` | `{ to: string; }` | `TickSummary` |  |
| `runPayoutRun` | `none` | `TickSummary & { run_at: string; hours_ahead: number; }` | Moves the clock to the next Friday 18:00 UTC and pays the weekly run (cleared money is paid free; holds stay held). |

### Input shapes

Named inputs used above, spelled out. Money is integer cents; timestamps are ISO strings; ids are the fixture ids (`bnty_lumi_glowup`, `cr_maya`, `app_lumi`).

#### NoteInput

Used by `requestRevision` (`notes`). Defined in `src/lib/store/core/review.ts`.

```ts
export interface NoteInput {
  t_ms: number;
  t_end_ms?: number;
  body: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  reason_code?: ReasonCode;
}
```

#### AttachPostInput

Used by `attachPost`. Defined in `src/lib/store/core/posts.ts`.

```ts
export interface AttachPostInput {
  submission_id: string;
  platform?: Platform;
  social_account_id?: string;
  /** The creator's caption; the disclosure and hashtags are added if missing. */
  caption?: string;
  /** The post URL (optional in the demo; one is generated when absent). */
  url?: string;
  /** Whether the platform's own paid-partnership label was switched on. */
  platform_label_on?: boolean;
}
```

#### BountyDraftInput

Used by `createBounty`. Defined in `src/lib/store/core/bounty-draft.ts`.

```ts
export interface BountyDraftInput {
  app_id: string;
  title: string;
  /** The creator-pay pool, in cents. On a first bounty flowd matches part of it (see `matched_cents` in the preview). */
  budget_cents: number;
  type?: BountyType;
  visibility?: Visibility;
  cpm_cents?: number;
  cpa_install_cents?: number;
  cpa_trial_cents?: number;
  cpa_paid_cents?: number;
  /** Direct bounties: the flat fee per video. */
  flat_fee_cents?: number;
  per_video_cap_cents?: number;
  per_creator_cap_cents?: number;
  ad_commission_rate?: number;
  brief?: Partial<Brief>;
  rights?: RightsCardOptions;
  deliverables?: Partial<Deliverables>;
  eligibility?: Partial<Eligibility> & { min_tier?: Tier };
  format_ids?: FormatId[];
  starts_at?: string;
  ends_at?: string;
  /** Extra free text to scan for traps (a message to creators). */
  extra_text?: string[];
}
```

#### BrandSettingsPatch

Used by `updateBrandSettings`. Defined in `src/lib/store/core/brand-ops.ts`.

```ts
export interface BrandSettingsPatch {
  compliance_defaults?: Partial<Brand["compliance_defaults"]>;
  review_sla_hours?: number;
  timeout_policy?: Brand["timeout_policy"];
  billing?: Partial<Pick<Brand["billing"], "legal_name" | "billing_email" | "vat_id" | "po_required" | "cost_center">>;
  auto_top_up?: Brand["auto_top_up"];
  tagline?: string;
  website?: string;
}
```

#### ConnectIntegrationInput

Used by `connectIntegration`. Defined in `src/lib/store/core/brand-ops.ts`.

```ts
export interface ConnectIntegrationInput {
  kind: IntegrationKind;
  app_id?: string;
  /** Non-secret settings, such as the Slack channel "#growth-ugc". */
  config?: Record<string, string>;
  brand_id?: string;
}
```

#### CreateApiKeyInput

Used by `createApiKey`. Defined in `src/lib/store/core/brand-ops.ts`.

```ts
export interface CreateApiKeyInput {
  name: string;
  mode?: KeyMode;
  scopes?: ApiScope[];
  expires_in_days?: number;
}
```

#### CreateAuctionInput

Used by `createAuction`. Defined in `src/lib/store/core/marketplace.ts`.

```ts
export interface CreateAuctionInput {
  title: string;
  description: string;
  slots: number;
  reserve_cents: number;
  opens_at?: string;
  closes_at?: string;
  deliverables?: Partial<Deliverables>;
  rights?: RightsCardOptions;
}
```

#### DisputePostInput

Used by `disputePost`. Defined in `src/lib/store/core/admin.ts`.

```ts
export interface DisputePostInput {
  post_id: string;
  kind?: DisputeKind;
  reason: string;
  note: string;
  range_from?: string;
  range_to?: string;
}
```

#### FoundingInput

Used by `applyFoundingCreator`. Defined in `src/lib/store/core/public.ts`.

```ts
export interface FoundingInput {
  handle: string;
  niche: string;
  /** A link to work the creator has already made (their own channel, a portfolio). */
  proof_url: string;
}
```

#### FraudDecisionInput

Used by `decideFraudFlag`. Defined in `src/lib/store/core/admin.ts`.

```ts
export interface FraudDecisionInput {
  flag_id: string;
  decision: "clear" | "monitor" | "confirm";
  note?: string;
  /** Confirm: the views that were not real (default: the share the score implies). */
  invalid_views?: number;
}
```

#### InstantCashOutInput

Used by `requestPayout`. Defined in `src/lib/store/core/payouts.ts`.

```ts
export interface InstantCashOutInput {
  /** Earning rows to cash out; omit for everything cleared. */
  row_ids?: string[];
  /** The fee the creator was shown. If it no longer matches, nothing is paid (the fee is confirmed first, never a surprise). */
  confirm_fee_cents?: number;
}
```

#### JoinWaitlistInput

Used by `joinWaitlist`. Defined in `src/lib/store/core/public.ts`.

```ts
export interface JoinWaitlistInput {
  email: string;
  role: "creator" | "brand";
  handle?: string;
}
```

#### OnboardingInput

Used by `updateOnboarding`. Defined in `src/lib/store/core/onboarding.ts`.

```ts
export interface OnboardingInput {
  /** 1 to 3 niches. */
  niches?: Niche[];
  /** The creator confirms they are 18 or older. */
  confirm_18?: boolean;
  /** The creator accepts the creator agreement. Needs `confirm_18`. */
  accept_agreement?: boolean;
}
```

#### ProfilePatch

Used by `updateCreatorProfile`. Defined in `src/lib/store/core/creator.ts`.

```ts
export interface ProfilePatch {
  display_name?: string;
  bio?: string;
  niches?: Niche[];
  languages?: string[];
  open_to_offers?: boolean;
  storefront?: Partial<Creator["storefront"]>;
}
```

#### PromoteInput

Used by `promoteWinner`. Defined in `src/lib/store/core/brand-ops.ts`.

```ts
export interface PromoteInput {
  post_id: string;
  platform?: AdPlatform;
  kind?: AdKind;
  daily_budget_cents: number;
}
```

#### RateCardInput

Used by `saveRateCard`. Defined in `src/lib/store/core/creator.ts`.

```ts
export interface RateCardInput {
  price_per_video_cents: number;
  min_cpm_cents: number;
  paid_usage_days?: number;
  turnaround_days?: number;
  max_videos_per_month?: number;
  platforms?: Platform[];
  format_ids?: Format["id"][];
  categories_excluded?: Category[];
  accepts_direct_offers?: boolean;
  status?: RateCard["status"];
}
```

#### ReportInput

Used by `reportScam`. Defined in `src/lib/store/core/admin.ts`.

```ts
export interface ReportInput {
  target_kind: ReportTargetKind;
  target_id: string;
  reason: ScamReason;
  description: string;
  evidence_refs?: string[];
}
```

#### ResolveDisputeInput

Used by `resolveDispute`. Defined in `src/lib/store/core/admin.ts`.

```ts
export interface ResolveDisputeInput {
  dispute_id: string;
  outcome: DisputeOutcome;
  outcome_text: string;
  /** Upheld or partly upheld view or payout disputes: extra pay released to the creator, funded by flowd. */
  adjustment_cents?: number;
}
```

#### SaveFloInput

Used by `saveFloSuggestion`. Defined in `src/lib/store/core/inbox.ts`.

```ts
export interface SaveFloInput {
  surface: FloSurface;
  kind: FloKind;
  prompt: string;
  title: string;
  outputs: string[];
  actions?: FloAction[];
  context_kind?: string;
  context_id?: string;
  /** Mock engine timing, shown as "answered in 1.2 s". */
  latency_ms?: number;
}
```

#### SaveRuleInput

Used by `saveRule`. Defined in `src/lib/store/core/brand-ops.ts`.

```ts
export interface SaveRuleInput {
  rule_id?: string;
  name: string;
  conditions?: Partial<AutoApproveRule["conditions"]>;
  scope?: Partial<AutoApproveRule["scope"]>;
  guardrails?: Partial<AutoApproveRule["guardrails"]>;
  timeout_policy?: AutoApproveRule["timeout_policy"];
}
```

#### SendOfferInput

Used by `sendOffer`. Defined in `src/lib/store/core/offers.ts`.

```ts
export interface SendOfferInput {
  creator_id: string;
  app_id: string;
  title: string;
  /** The total price for the deliverables (0 for an invite, which pays the bounty's rates). */
  amount_cents: number;
  kind?: Offer["kind"];
  /** Invites: the open bounty. */
  bounty_id?: BountyId;
  /** Re-buys: the winning post the new hooks are based on. */
  rebuy_of_post_id?: string;
  deliverables?: Partial<Deliverables>;
  rights?: RightsCardOptions;
  turnaround_days?: number;
  message: string;
}
```

#### ShareProofInput

Used by `shareProof`. Defined in `src/lib/store/core/public.ts`.

```ts
export interface ShareProofInput {
  /** A paid or in-transit payout to make a proof from. */
  payout_id?: string;
  /** A calendar month ("2026-09") of cleared earnings. */
  month?: string;
  /** Show "A Silver creator" instead of the handle. */
  anonymous?: boolean;
}
```

#### SubmitVerificationInput

Used by `submitVerification`. Defined in `src/lib/store/core/admin.ts`.

```ts
export interface SubmitVerificationInput {
  kind: VerificationKind;
  /** The mock provider outcome: `verified` (default) decides at once; `pending` queues for Ops. */
  outcome?: "verified" | "pending" | "rejected";
  reason?: VerificationReason;
}
```

#### SubmitVideoInput

Used by `submitVideo`. Defined in `src/lib/store/core/submissions.ts`.

```ts
export interface SubmitVideoInput {
  bounty_id: string;
  /** Short internal title; defaults to "<hook type> hook v1". */
  title?: string;
  format_id?: FormatId;
  source?: SubmissionSource;
  clip: ClipInput;
  /** Must be true: the creator accepts the bounty's Rights Card at submit (a snapshot is stored). */
  accept_rights: boolean;
  /** Mock file facts (name and size) to show in the version history. */
  file?: { name?: string; size_bytes?: number };
}
```

#### TaxFormInput

Used by `submitTaxForm`. Defined in `src/lib/store/core/creator.ts`.

```ts
export interface TaxFormInput {
  legal_name: string;
  entity_type?: TaxProfile["entity_type"];
  /** Only the last four digits are ever sent or stored. */
  tin_last4: string;
  address: NonNullable<TaxProfile["address"]>;
  form?: TaxProfile["form"];
}
```

#### TestPlanInput

Used by `createTestPlan`. Defined in `src/lib/store/core/test-plans.ts`.

```ts
export interface TestPlanInput {
  app_id: string;
  name: string;
  budget_cents: number;
  hooks: TestAxisItem[];
  bodies: TestAxisItem[];
  ctas: CtaType[];
}
```

#### UploadSpecInput

Used by `uploadSpec`. Defined in `src/lib/store/core/marketplace.ts`.

```ts
export interface UploadSpecInput {
  title: string;
  description: string;
  clip: ClipInput;
  category: Spec["category"];
  format_id?: FormatId;
  price_cents: number;
  paid_ads_days?: number;
  exclusive?: boolean;
}
```

#### WellbeingPatch

Used by `updateWellbeing`. Defined in `src/lib/store/core/creator.ts`.

```ts
export type WellbeingPatch = Partial<Pick<WellbeingSettings, "enabled" | "quiet_hours" | "numbers_off" | "pace_goal" | "rest_weeks" | "leaderboard_opt_out" | "slack_mode">> & { paused_until?: string | null };
```
