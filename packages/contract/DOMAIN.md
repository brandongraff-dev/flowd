# flowd domain contract (DOMAIN.md)

**The canonical bible every agent codes against.** Version 1.0.0 · demo "now" = `2026-10-03T14:00:00Z` (a Saturday, ISO week 2026-W40) · tagline "Money follows what works."

If anything in the code, the fixtures or another doc disagrees with this file, this file wins, except `docs/DECISIONS.md`, which wins over this file (constants here mirror it). Product feature IDs (`F-nnn`) live in `docs/PRODUCT_SPEC.md`, routes in `docs/ROUTES.md`, iOS screens in `docs/SCREENS.md`.

> **How this file is made.** The source of truth is `packages/contract/schema/*.mjs`. `node packages/contract/scripts/build-contract.mjs` generates `types.ts` and every block wrapped in a `GENERATED:<name>` comment pair below. Hand-written prose sits outside those markers. To change a field, an enum value, a constant or a formula, edit the schema and re-run the build; never hand-edit a generated block or `types.ts`. `node packages/contract/scripts/build-contract.mjs --check` fails when either is stale.

## At a glance (read this first)

**What it is.** flowd is an open creator market for app growth. A **brand** (an app team) funds a **bounty** (a pool, a rate, a per-video cap, a brief and a Rights Card). **Creators** compete for it: they make a video in the Studio, **submit** it (a Reserved Slot is taken from the pool), and the brand decides within **72 hours** with a reason code and timecoded feedback. An approved video is **posted** on the creator's own account; for **72 hours** its verified views count (the View Ledger), then a fraud and disclosure check runs, then the earnings **clear** at the daily 14:00 UTC run and **pay out** on Friday 18:00 UTC. Conversions (installs, trials, paid) tracked by link or code add CPA pay; a winning post can be promoted as an ad for a 10% commission. Models price, score and QA everything; day-one scores are **checklist scores**.

**The five rules that shape every screen.**
1. **Money has a date.** Every earning is `accruing -> pending -> cleared -> paid` with a dated ETA and a named reason (Money Clock). Never a bare "pending".
2. **Funded or not live.** A bounty cannot go live until its budget and fee reserve are escrowed. Approved posts are paid even if the pool later empties.
3. **A decision in 72 hours, with a reason.** Rejections carry a reason code and evidence; two revision rounds; one appeal; SLA breaches cost the brand reliability.
4. **Typical beside top.** Always show the median (p25/median/p75) beside any top-earner number; never "guaranteed income".
5. **Tracked is not Estimated.** CPA pays only on `link` and `code` conversions; MMP, survey and modelled numbers are reported separately and never paid.

**Numbers to remember** (all in CONSTANTS): plans Free 12% / Pro $299 at 10% / Scale $999 at 8%; CPA-only 6%; first bounty fee waived + up to $500 matched; default CPM $2.00 (floor $0.50), cap $250; CPA $0.40 / $1.50 / $4.00; ad commission 10% for 60 days, platform fee 1% of ad spend; 72-hour view window; payouts Fridays 18:00 UTC; instant 1.5% (min $0.50, max $15); tiers Bronze -> Silver ($250) -> Gold ($2,000) -> Platinum ($10,000) -> Elite ($50,000); Daily Drop 16:00 UTC; peer cohorts of about 30.

**Where to look.** Words: section 1. Fields and enums: sections 5 to 7. Who may change what, and when: section 8. Money mechanics: sections 9 to 11. The demo world and its personas (Maya, Jordan at Lumi, Ops): section 13. Every fixture file: section 14. What the validator enforces: section 15. Endpoints: section 16.

## Contents

1. [Vocabulary](#1-vocabulary-exact-ui-words)
2. [Conventions](#2-conventions)
3. [Identity and id formats](#3-identity-and-id-formats)
4. [Art seed: generated imagery](#4-art-seed-generated-imagery)
5. [Enumerations](#5-enumerations)
6. [Entities](#6-entities)
7. [Value types](#7-value-types)
8. [State machines](#8-state-machines)
9. [Constants](#9-constants)
10. [Money: ledger postings and the golden walk-through](#10-money-ledger-postings-and-the-golden-walk-through)
11. [Formulas](#11-formulas)
12. [Rules tables: reason codes, Brief Lint, scores, fraud signals](#12-rules-tables-reason-codes-brief-lint-scores-fraud-signals)
13. [Demo world](#13-demo-world)
14. [Fixture catalogue](#14-fixture-catalogue)
15. [Reconciliation invariants and scenarios](#15-reconciliation-invariants-and-scenarios)
16. [API surface](#16-api-surface)
17. [Open questions and decisions taken](#17-open-questions-and-decisions-taken)

---

## 1. Vocabulary (exact UI words)

Use these words exactly in UI copy, code identifiers, docs and fixtures. flowd is always lowercase, even at the start of a sentence in UI chrome. Voice: confident, clear, a little playful; plain English; short sentences; numbers over adjectives. Earnings language is FTC-careful: show the typical (median) beside any top-earner figure; never "guaranteed income"; results vary.

| Word | Means | Never say |
|---|---|---|
| **flowd** | The product. "flowd for Brands" is the brand-side product. Pronounced "flowed". | Flowd, FLOWD, flow'd |
| **bounty** | A funded offer to creators: a pool, a rate, a per-video cap and a brief. | campaign, gig, job, task |
| **creator** | A person who makes and posts videos. | influencer, ambassador, talent |
| **brand** / **app team** | The buyer. A workspace funds bounties. | advertiser, client (except "client approver" in agency workspaces) |
| **submission** | A creator's video for a bounty, versioned (v1, v2). | entry (reserved for tournaments), application |
| **post** | A submission that has been posted on the creator's own account; opens the 72-hour view window. | upload (that is the submission step) |
| **payout** | Money leaving flowd to a creator's bank. Weekly (free) or instant (fee shown first). | withdrawal, cash-out as a noun (the action is "Cash out") |
| **pending -> cleared -> paid** | The earnings states. Pending has a date and a reason ("Views still counting", "Next clearing run"); cleared waits for the weekly payout; paid is in a payout. The UI shows `accruing` and `pending` together as Pending; `MoneyClockState` keeps them apart in the data. | "processing", a bare "pending", "available balance" |
| **Money Clock** | The wallet view where every earning shows its state, a dated ETA ("Clears Sun 2:00 PM") and a named reason for any delay. | "estimated earnings" without a date |
| **Wallet** | The creator's money screen (Cleared and Pending side by side, never summed). Brands also have a Wallet (escrow, funding, invoices). | balance (use Cleared / Pending) |
| **Studio** | The brief-aware creation flow: script, capture, edit, score, submit. | editor, camera screen |
| **Market** | Live prices: clearing CPM by category, price-vs-fill-time. | exchange, marketplace (except "Spec Market") |
| **rate card** | A creator's own price list (Silver and above). | media kit, price sheet |
| **Daily Drop** | One drop a day at 16:00 UTC with real inventory ("spots left" is a true count). | flash sale, limited-time offer |
| **Crews** | 3 to 20 creators with a shared leaderboard and a platform-funded weekly goal bonus. | squads, teams (teams are brand-side) |
| **Tournaments** | Sponsored prize pools: hook battles, free entry. | contests, giveaways |
| **Tiers** | Earned status: Bronze, Silver, Gold, Platinum, Elite. Never bought. | levels, ranks (rank is for leaderboards) |
| **Hook Score** | Checklist score of the first 3 seconds. | AI score, virality score |
| **Flow Score** | Checklist score of the whole video: a band A to E with timecoded reasons. | prediction, grade |
| **Checklist score** | The honest label on both scores until a learned model beats them: "Checklist score. It gets smarter as bounties settle." | AI-powered, predicts virality |
| **Flo** | The in-app AI copilot (scripts, hook rewrites, TL;DR, captions, next action). | assistant, bot, chatbot |
| **Spec Market** | Pre-made, pre-scored videos brands can license off the shelf. | stock footage |
| **Winner promotion** | Turning a winning organic post into a Spark or partnership ad (1% of ad spend). | boost, whitelisting (say "permission" or "Spark code") |
| **Funded** (badge) | The bounty's full budget and fee reserve are in escrow. A bounty cannot go live without it. | verified budget, guaranteed |
| **Reserved Slot** | When a creator submits, up to the per-video cap (plus fee) is reserved from the pool. Approved posts are paid even if the pool later empties. | hold (holds are for fraud, tax, dispute) |
| **View Ledger** | Per-post, source-labelled view snapshots with the cause of any excluded views. | analytics |
| **Rights Card** | The plain-language licence on every bounty. | usage agreement, T&Cs |
| **Rights Vault** | The brand's list of licences with expiry alerts at 30, 14 and 7 days. | asset library |
| **Brief Lint** | Pre-publish checks that block traps in a brief. | validation |
| **Pay Math** | Expected pay at p25, median and p75, and the brand's effective all-in CPM. | earnings forecast, projected income |
| **Brand Scorecard** | Pay speed, decision time, approval fairness and approved-work-run share, plus a 0 to 100 reliability. | brand rating, review |
| **Reliability** | The 0 to 100 score on a creator (finished work only) or a brand (Scorecard). | trust score |
| **Scam Shield** | In-app chat only, no pay-to-join, verified brands, reports, contextual warnings. | spam filter |
| **Tax Desk** | Just-in-time W-9, year-to-date, set-aside estimate, CSV. "Not tax advice." | tax advisor |
| **Wellbeing Mode** | Quiet hours, numbers-off, pace goal, pause that keeps tier and streak. | detox, focus mode |
| **Attribution Kit** | Tracking link, offer-code pool, RevenueCat webhook, SDK snippet, survey. | pixel |
| **Tracked** / **Estimated** | Confidence chips on every conversion count. Tracked = link or code (deterministic, paid). Estimated = MMP, survey, modelled (reported, never paid). | verified, attributed (alone) |
| **Streak** | Weekly: at least one post per ISO week. Earned freezes (1 per 4-week streak, max 2 banked) and rest weeks. No guilt copy. | daily streak, "don't lose your streak" |
| **Cohort** | The ~30 peers (same tier and niche) on a creator's weekly leaderboard, with a promotion zone and no demotion zone. | league |
| **Earnings Card** | A shareable 9:16 or 1:1 card of a payout or month, always with the tier median line and a proof link. | brag card |
| **Wrapped** | A monthly or yearly story recap. | year in review |
| **Academy** | Free lessons of 5 minutes or less; never required. | course, training |
| **First-Dollar Path** | Onboarding that aims at one scored take and one submission; first dollar in 72 hours (approval not guaranteed). | quick money |
| **Founding creator** | One of the first 200 creators: permanent badge, tier head start, free instant cash-outs for 12 months. | OG |
| **Review queue** | The brand's keyboard-first list of submissions; 72-hour SLA. | inbox (inbox is the creator-side messages) |
| **Auto-approve** | A guarded rule: dry run on the last 50, 10% spot-check, kill switch, organic rights only. | autopilot |
| **Money words** | `$1,234.56` everywhere (formatted at the edge); CPM written "$2.10 per 1,000 views"; fees as "12%". | "$2.1", "USD 2.10" |

**Copy rules that bite.** Rejections are about the video, never the person ("The app isn't on screen in the first 3 seconds"). A "no" always carries a reason code, evidence and the next step. Celebrations only for creator-earned outcomes (cleared money, approvals, tier-ups); brands get calm confirmations for funding and go-live. Demo data is labelled "Demo data" only where truthful. No remote images, no real brands or people.

---

## 2. Conventions

- **JSON**: keys are `snake_case`. Enums are lowercase snake strings (exceptions: `ScoreBand` is a single letter `A`..`E`; `Country` is ISO 3166-1 alpha-2 upper case). iOS decodes with `convertFromSnakeCase`.
- **Money**: integer **cents**, field names end in `_cents`. Format only at the edge (`formatMoney`). USD only in v1. Rates are cents per 1,000 verified views (`cpm_cents`).
- **iOS decoding**: iOS uses `JSONDecoder.keyDecodingStrategy = .convertFromSnakeCase`, which also rewrites the keys of String-keyed dictionaries. So maps that iOS reads never have snake_case keys: `view_snapshots.sources` (keys `fyp`, `following`, `profile`, `search`, `sound`, `share`, `other`), `view_snapshots.geo` (country codes), `notification_prefs.categories` (`money`, `reviews`, `drop`, `offers`, `tournaments`, `tips`, `safety`). Anything keyed by a multi-word enum value is an array of `{ key enum, value }` rows instead (`FormatStats.trial_rate_by_category`). Brand-side maps with free keys (`subscriber_attributes`, `integrations.config`, `activity_log.metadata`) are web-only.
- **Ratios and percentages**: 0 to 1 floats (`approval_rate: 0.78`). A field named `_pct` would be 0 to 100; the contract uses none.
- **Time**: ISO-8601 UTC with seconds and a trailing `Z` (`2026-10-03T14:00:00Z`). Calendar days are `YYYY-MM-DD` (UTC). Durations carry their unit in the name: `_ms`, `_s`, `_hours`, `_days`. ISO weeks are `2026-W40` (Monday to Sunday UTC).
- **Demo clock**: "now" is `2026-10-03T14:00:00Z`. Fixtures are generated relative to it. No event timestamp may be later than now; only schedule and ETA fields (`eta_at`, `expires_at`, `starts_at` of scheduled things, `scheduled_for`, `release_at`) may be in the future. The 14:00 UTC clearing run is deemed to have executed at `now`.
- **Nullability**: optional fields are omitted when empty. `null` never appears in a fixture (except where a type says so explicitly: none do).
- **Arrays**: arrays are ordered as documented per file (the catalogue lists the order); nested arrays say oldest first or newest first in their notes.
- **Denormalised counters** (`creators.approved_count`, `bounties.counts`, `posts.views`, `attribution_links.clicks` ...) must reconcile with the rows they summarise; the validator recomputes them (section 15).
- **Append-only**: ledger rows are never edited except `status`, `cleared_at`, `paid_at`, `payout_id`. Submissions are versioned, never overwritten. Corrections are new rows (clawback, adjustment).
- **Text**: sentence case UI copy; no emoji in data; no lorem ipsum; specific realistic numbers.
- **URLs**: only `joinflowd.io` (`joinflowd.io/c/<handle>`, `/p/<proof-id>`, `/r/<code>`, `/b/<bounty-id>`), `api.joinflowd.io`, `app.joinflowd.io`, `hello@joinflowd.io`, fictional `.example` domains for brands, and platform domains as text only. Never `flowd.so`, `flowd.com` or `flowd.app`.
- **Idempotency**: every operation that moves money is idempotent on a client key; settlement is idempotent on (post, leg).
- **Privacy**: tokens, full card or bank numbers and TINs are never in data (only last four digits).

---

## 3. Identity and id formats

Ids are `<prefix>_<slug-or-number>`: lowercase `[a-z0-9_-]` after the prefix. Hero entities have readable slugs (`br_lumi`, `cr_maya`, `app_lumi`, `bnty_lumi_glowup`); bulk entities use zero-padded numbers (`sub_0412`, `post_0307`, `ledg_004217`). Some ids embed a date or a composite (`drop_2026-10-03`, `run_2026-10-02`, `mkt_ai_photo_2026-10-03`, `lb_2026-w40_cohort_silver_ai_tools_earnings`). Ids are stable forever: fixtures regenerate with the same ids from the same seed.

Other identifiers that are not entity ids:

| Identifier | Format | Example |
|---|---|---|
| Creator handle | unique, lowercase `[a-z0-9._]`, no `@`; shown as `@handle`; public link `joinflowd.io/c/<handle>` | `maya.makes` |
| Tracking code | short slug, unique; `joinflowd.io/r/<code>`; deep link `<app scheme>://r/<code>` | `maya-lumi7` |
| Promo code | uppercase, from the offer-code pool, rotated | `MAYA-LUMI` |
| Referral code | uppercase, creator initial + digits | `MAYA6` |
| Proof id | `prf_` + 8 lowercase alphanumerics; public page `joinflowd.io/p/<id>` | `prf_k3x9m2qa` |
| Ledger transaction | `txn_<n>`; every leg of a transaction shares it | `txn_001284` |
| Payout run | `run_<YYYY-MM-DD>` of the Friday | `run_2026-10-02` |
| Case id (scam report) | `SR-<year>-<4 digits>` | `SR-2026-0042` |
| Invoice number | `FD-<year>-<4 digits>` | `FD-2026-0042` |
| Nested row ids | short prefix + number | `omsg_12`, `bid_7`, `msg_204`, `whd_31`, `cell_5`, `mu_9`, `pm_2`, `tick_88`, `vid_0412` |
| API key | `fd_live_` / `fd_test_` + secret (stored as prefix + last four only) | `fd_live_9a2f...c41e` |
| App Store id | fictional 10 digits | `6448912033` |

<!-- GENERATED:idprefixes -->
| Prefix | Entity | Fixture | Example id |
|---|---|---|---|
| `world_` | World | `world` | `world_flowd` |
| `usr_` | User | `users` | `usr_maya` |
| `cr_` | Creator | `creators` | `cr_maya` |
| `sa_` | SocialAccount | `social_accounts` | `sa_maya_tiktok` |
| `rate_` | RateCard | `rate_cards` | `rate_maya` |
| `br_` | Brand | `brands` | `br_lumi` |
| `bm_` | BrandMember | `brand_members` | `bm_lumi_jordan` |
| `app_` | App | `apps` | `app_lumi` |
| `ledg_` | LedgerEntry | `ledger` | `ledg_004217` |
| `pay_` | Payout | `payouts` | `pay_0188` |
| `inv_` | Invoice | `invoices` | `inv_0042` |
| `mc_` | MoneyClockRow | `money_clock` | `mc_0211` |
| `mkt_` | MarketSeriesPoint | `market_series` | `mkt_ai_photo_2026-10-03` |
| `bsc_` | BrandScorecard | `brand_scorecards` | `bsc_lumi` |
| `rep_` | CreatorReputation | `creator_reputation` | `rep_maya` |
| `bnty_` | Bounty | `bounties` | `bnty_lumi_glowup` |
| `sub_` | Submission | `submissions` | `sub_0412` |
| `va_` | VideoAnalysis | `video_analyses` | `va_0412_v2` |
| `post_` | Post | `posts` | `post_0307` |
| `vsn_` | ViewSnapshot | `view_snapshots` | `vsn_0307_012` |
| `conv_` | Conversion | `conversions` | `conv_00914` |
| `lnk_` | AttributionLink | `attribution_links` | `lnk_maya_lumi7` |
| `ad_` | Ad | `ads` | `ad_003` |
| `offer_` | Offer | `offers` | `offer_0014` |
| `auc_` | Auction | `auctions` | `auc_003` |
| `spec_` | Spec | `specs` | `spec_011` |
| `rg_` | RightsGrant | `rights_grants` | `rg_0031` |
| `drop_` | DailyDrop | `daily_drops` | `drop_2026-10-03` |
| `tour_` | Tournament | `tournaments` | `tour_hookbattle_05` |
| `tent_` | TournamentEntry | `tournament_entries` | `tent_0044` |
| `crew_` | Crew | `crews` | `crew_late_night_edits` |
| `cmem_` | CrewMember | `crew_members` | `cmem_0012` |
| `stk_` | Streak | `streaks` | `stk_maya` |
| `lb_` | Leaderboard | `leaderboards` | `lb_2026-w40_cohort_silver_ai_tools_earnings` |
| `ref_` | Referral | `referrals` | `ref_0009` |
| `lsn_` | Lesson | `lessons` | `lsn_contract_red_flags` |
| `lsp_` | LessonProgress | `lesson_progress` | `lsp_0088` |
| `trend_` | Trend | `trends` | `trend_007` |
| `tmpl_` | Format | `formats` | `tmpl_screen_reaction` |
| `hook_` | Hook | `hooks` | `hook_confession_03` |
| `tev_` | TierEvent | `tier_history` | `tev_0054` |
| `wrap_` | Wrapped | `wrapped` | `wrap_maya_2026-09` |
| `prf_` | Proof | `proofs` | `prf_k3x9m2qa` |
| `save_` | BountySave | `bounty_saves` | `save_0031` |
| `wb_` | WellbeingSettings | `wellbeing_settings` | `wb_maya` |
| `npref_` | NotificationPrefs | `notification_prefs` | `npref_maya` |
| `case_` | CaseStudy | `case_studies` | `case_03` |
| `tst_` | Testimonial | `testimonials` | `tst_02` |
| `chg_` | ChangelogEntry | `changelog` | `chg_012` |
| `note_` | FeedbackNote | `feedback_notes` | `note_0233` |
| `disp_` | Dispute | `disputes` | `disp_007` |
| `scam_` | ScamReport | `scam_reports` | `scam_011` |
| `flag_` | FraudFlag | `fraud_flags` | `flag_006` |
| `ver_` | Verification | `verifications` | `ver_021` |
| `taxp_` | TaxProfile | `tax_profiles` | `taxp_maya` |
| `taxd_` | TaxDoc | `tax_docs` | `taxd_maya_w9` |
| `cc_` | ComplianceAudit | `compliance_checks` | `cc_0307` |
| `run_` | PayoutRun | `payout_runs` | `run_2026-10-02` |
| `ntf_` | Notification | `notifications` | `ntf_0412` |
| `intg_` | Integration | `integrations` | `intg_lumi_revenuecat` |
| `key_` | ApiKey | `api_keys` | `key_lumi_live` |
| `whk_` | Webhook | `webhooks` | `whk_lumi_01` |
| `act_` | ActivityEntry | `activity_log` | `act_0098` |
| `rule_` | AutoApproveRule | `auto_approve_rules` | `rule_lumi_organic` |
| `tplan_` | TestPlan | `test_plans` | `tplan_lumi_01` |
| `fat_` | FatigueAlert | `fatigue_alerts` | `fat_002` |
| `aud_` | AuditReport | `audit_reports` | `aud_lumi` |
| `flo_` | FloSuggestion | `flo_suggestions` | `flo_0031` |
| `mdl_` | MlModel | `ml_models` | `mdl_fraud` |
| `thr_` | ChatThread | `threads` | `thr_0019` |
| `rce_` | RevenueCatEvent | `revenuecat_events` | `rce_000814` |
| `occ_` | OfferCode | `offer_code_pool` | `occ_lumi_007` |
| `list_` | BrandList | `brand_lists` | `list_lumi_favourites` |
<!-- /GENERATED:idprefixes -->

---

## 4. Art seed: generated imagery

Every creator avatar, video thumbnail, app icon, spec cover, bounty cover and crew badge is **generated**: there are no remote images, no photographs and no stock art anywhere in the product. Fixtures carry a small JSON description and each client renders the same picture from it.

```json
{ "hue_a": 262, "hue_b": 214, "hue_c": 38, "pattern": "orbs", "seed": 48121, "label": "I was wrong about editing apps" }
```

| Field | Type | Meaning |
|---|---|---|
| `hue_a` | int 0 to 360 | Base hue (top-left of the gradient). |
| `hue_b` | int 0 to 360 | Second stop (mid). Generators pick `hue_a` +/- 25 to 70. |
| `hue_c` | int 0 to 360 | Accent hue for shapes and highlights. Generators pick roughly the complement (+150 to +210). |
| `pattern` | `orbs` \| `waves` \| `rings` \| `grid` \| `spark` \| `stripes` | The shape language drawn over the gradient. |
| `seed` | int | Drives every random placement (mulberry32). Same seed, same picture on web and iOS. |
| `label` | string, optional, 24 characters at most | Text on the art: the hook on a thumbnail, initials on an avatar, a glyph on an icon. |

**Rendering contract** (web `components/brand/thumb.tsx` and `avatar.tsx` as SVG/CSS; iOS `DesignSystem/Components/ThumbArt.swift` with Canvas; the Codable struct `ArtSeed` has `hueA`, `hueB`, `hueC`, `pattern`, `seed`, `label` under `convertFromSnakeCase`):

1. Background: a 135 degree linear gradient through `hsl(hue_a 72% 46%)` at 0%, `hsl(hue_b 70% 38%)` at 55% and `hsl(hue_c 62% 24%)` at 100%. The bottom stays dark enough for white text under the standard media scrim (AA).
2. Shapes come from `mulberry32(seed)`, one stream per render, consumed in a fixed order so that the picture is identical across platforms. Positions and radii are fractions of the short side.
3. Patterns: **orbs** (5 to 7 soft radial circles, radii 12 to 45%, highlights in `hue_c`), **waves** (4 layered sine ribbons with opacity falling toward the bottom), **rings** (concentric arcs around an off-centre origin), **grid** (a perspective dot grid with a few `spark` glints), **spark** (radial starburst lines and small glints), **stripes** (diagonal bands of varying width and opacity).
4. `label`: bottom-left in the display face (Bricolage Grotesque on web, SF Pro Rounded on iOS), bold, white, max two lines; on avatars the label is the initials, centred. App icons draw a rounded-square glyph; crews draw a badge ring.
5. Art is decorative: `aria-hidden` / accessibility-hidden; the owning entity supplies the accessible name.

**Which entity uses which look** (generators follow this so the product looks designed, not random): avatars `orbs` or `rings` with initials; app icons `grid` or `spark` with the app's `brand_colors` hues; video thumbnails and portfolio items any pattern with the hook text as `label`; bounty covers `orbs` or `waves`; spec covers `stripes` or `waves`; crew badges `rings` or `spark`; tournaments `spark`; trends and formats vary by format.

Tooling: `scripts/gen/lib.mjs` exports `artSeed(rng, { hue, pattern, label })` (harmonious hue triples, pattern, seed, label) and `hueOfHex(hex)` (to anchor an icon on an app's brand colour).

---

## 5. Enumerations

<!-- GENERATED:enums -->
166 enumerations in 14 groups. Each is a lowercase snake string (or a single letter for ScoreBand, ISO code for Country). The generated const array and the label/tone map for each are in `types.ts` (`TIERS`, `BOUNTY_STATUSES`, `BOUNTY_STATUS_META` ...; all maps are also in `STATUS_META`).

**Colour tones** (semantic; map to design tokens in `packages/tokens`):

| Tone | Token | Tailwind | Use |
|---|---|---|---|
| neutral | --fd-fg-muted | text-fg-muted / bg-surface-hover | Inert, informational, closed or finished states. |
| accent | --fd-accent | text-accent / bg-accent-soft | Primary, in motion, selected, active work. |
| violet | --fd-violet | text-violet / bg-violet-soft | Flo, models, modelled or estimated figures. |
| info | --fd-info | text-info / bg-info-soft | Pending, informational, clock-driven (lagoon). |
| mint | --fd-mint | text-mint / bg-mint-soft | Money earned, success, verified, funded. Creators only see mint for money; brand surfaces use neutral ink + arrows for deltas. |
| ember | --fd-ember | text-ember / bg-ember-soft | Urgency, warning, Daily Drop, needs attention. |
| sun | --fd-sun | text-sun / bg-sun-soft | Featured, Gold and Elite, premium. |
| rose | --fd-rose | text-rose / bg-rose-soft | Alerts, rejected, destructive, blocking. |


**Index of enumerations** (details below):

| Enum | Group | Values |
|---|---|---|
| `Role` | Identity | `creator`, `brand_member`, `admin` |
| `ActorKind` | Identity | `creator`, `brand`, `admin`, `system` |
| `UserStatus` | Identity | `active`, `invited`, `suspended`, `deleted` |
| `AuthProvider` | Identity | `apple`, `google`, `email` |
| `Tier` | Identity | `bronze`, `silver`, `gold`, `platinum`, `elite` |
| `TierBasis` | Identity | `earned`, `grace_hold` |
| `Platform` | Catalogues | `tiktok`, `instagram`, `youtube` |
| `AdPlatform` | Catalogues | `tiktok`, `meta` |
| `Category` | Catalogues | `ai_photo`, `ai_assistant`, `fitness`, `language`, `productivity`, `finance`, `sleep_mind`, `music_audio`, `lifestyle` |
| `Niche` | Catalogues | `ai_tools`, `tech`, `fitness`, `wellness`, `productivity`, `study`, `money`, `lifestyle`, `beauty`, `travel`, `food`, `parenting` |
| `Country` | Catalogues | `US`, `CA`, `GB`, `AU`, `IE`, `DE`, `FR`, `ES`, `NL`, `BR`, `MX`, `PH` |
| `LinkStatus` | Identity | `connected`, `needs_reauth`, `revoked`, `pending` |
| `AccountHealthStatus` | Identity | `good`, `watch`, `at_risk` |
| `OnboardingStage` | Identity | `signed_up`, `niches_picked`, `accounts_linked`, `first_submission`, `first_approval`, `verified`, `first_dollar` |
| `VerificationStatus` | Trust | `not_started`, `pending`, `needs_info`, `verified`, `rejected`, `expired` |
| `VerificationKind` | Trust | `identity`, `age`, `business`, `tax`, `payout_method` |
| `BrandKind` | Identity | `brand`, `agency`, `platform` |
| `Plan` | Money | `free`, `pro`, `scale` |
| `PlanFeature` | Money | `escrow`, `review_queue`, `funnel`, `creator_discovery`, `rights_card`, `free_tools`, `brief_lint`, `attribution_kit`, `learned_scorer`, `guarded_auto_approve`, `market_view`, `rights_vault`, `test_planner`, `slack`, `api`, `winner_promotion`, `multi_app`, `agency_workspaces`, `roles`, `finance_pack`, `slas`, `white_label_reports` |
| `BrandMemberRole` | Identity | `owner`, `admin`, `reviewer`, `finance`, `viewer`, `client_approver` |
| `MemberStatus` | Identity | `active`, `invited`, `removed` |
| `AppStatus` | Identity | `connected`, `pending`, `error` |
| `MmpKind` | Identity | `none`, `appsflyer`, `adjust`, `branch` |
| `SdkStatus` | Identity | `not_installed`, `installed`, `verified` |
| `BountyType` | Bounties | `cpm`, `cpa`, `stacked`, `direct`, `install_only` |
| `BountyStatus` | Bounties | `draft`, `awaiting_funding`, `scheduled`, `live`, `paused`, `filled`, `ended`, `settled`, `cancelled` |
| `Visibility` | Bounties | `open`, `invite_only`, `private`, `drop` |
| `FundingSource` | Bounties | `brand`, `brand_matched`, `platform` |
| `LintSeverity` | Bounties | `blocker`, `warning`, `info` |
| `BriefLintCode` | Bounties | `missing_deliverables`, `missing_platforms`, `missing_regions`, `view_minimum_base`, `unpaid_trial`, `burner_account`, `fresh_account_demand`, `forced_posting_count`, `perpetual_rights`, `ai_likeness_requested`, `pay_to_join`, `below_floor_cpm`, `no_disclosure_text`, `unclear_cta`, `cap_too_low`, `low_effective_pay`, `budget_below_minimum`, `short_window` |
| `BeatId` | Content | `hook`, `problem`, `app_reveal`, `demo`, `key_feature`, `payoff`, `proof`, `offer`, `cta`, `win_state`, `reaction`, `end_card` |
| `FormatId` | Content | `tmpl_screen_reaction`, `tmpl_hidden_gem`, `tmpl_confession`, `tmpl_problem_solution`, `tmpl_faceless_slideshow`, `tmpl_green_screen`, `tmpl_results_update`, `tmpl_identity_shift`, `tmpl_free_trial_lead`, `tmpl_reply_comment`, `tmpl_carousel_video` |
| `HookType` | Content | `confession`, `curiosity_gap`, `specific_number`, `pov`, `direct_question`, `risk_reversal`, `pattern_interrupt` |
| `CtaType` | Content | `link_in_bio`, `use_code`, `try_free`, `download_now`, `search_app_store`, `comment_for_link` |
| `TimeoutPolicy` | Bounties | `escalate`, `approve_if_clean` |
| `MusicPolicy` | Bounties | `original_only`, `commercial_library` |
| `AiContentPolicy` | Bounties | `not_allowed`, `allowed_disclosed` |
| `LedgerType` | Money | `wallet_topup`, `escrow_fund`, `matched_budget`, `escrow_refund`, `cpm`, `cpa`, `flat_fee`, `commission`, `rights_fee`, `fee`, `ad_fee`, `subscription_fee`, `processing`, `payout`, `payout_fee`, `bonus`, `prize`, `referral`, `clawback`, `adjustment` |
| `LedgerStatus` | Money | `pending`, `cleared`, `paid`, `held`, `reversed` |
| `LedgerAccountKind` | Money | `wallet`, `escrow`, `creator`, `platform`, `external` |
| `PayoutKind` | Money | `weekly`, `instant` |
| `PayoutStatus` | Money | `scheduled`, `processing`, `in_transit`, `paid`, `failed`, `held`, `cancelled` |
| `PayoutMethodKind` | Money | `bank`, `debit_card` |
| `PayoutMethodStatus` | Money | `active`, `pending`, `failed` |
| `PaymentKind` | Money | `card`, `ach` |
| `InvoiceKind` | Money | `funding`, `subscription`, `ad_fee`, `rights_renewal`, `spec_license`, `adjustment` |
| `InvoiceStatus` | Money | `draft`, `open`, `paid`, `void`, `refunded` |
| `MoneyClockSource` | Money | `cpm`, `cpa_install`, `cpa_trial`, `cpa_paid`, `ad_commission`, `flat_fee`, `rights_fee`, `prize`, `bonus`, `referral` |
| `MoneyClockState` | Money | `accruing`, `pending`, `cleared`, `paid`, `held`, `reversed` |
| `MoneyClockReason` | Money | `window_open`, `fraud_check`, `awaiting_clearing_run`, `conversion_clearing`, `awaiting_weekly_payout`, `payout_in_transit`, `held_fraud_review`, `held_dispute`, `held_tax_info`, `held_identity_check`, `held_payout_method`, `held_compliance`, `paid_out`, `reversed_clawback` |
| `TickerKind` | Money | `payout`, `first_dollar`, `tier_up`, `bounty_filled`, `milestone`, `promoted` |
| `BrandBand` | Trust | `new`, `excellent`, `good`, `fair`, `poor` |
| `BrandBadge` | Trust | `fast_decisions`, `funded_always`, `pays_on_time`, `fair_reviews`, `runs_what_it_approves` |
| `OfferKind` | Market | `invite`, `direct`, `rebuy` |
| `OfferStatus` | Market | `awaiting_creator`, `awaiting_brand`, `accepted`, `declined`, `expired`, `withdrawn`, `completed` |
| `OfferMessageType` | Market | `offer`, `counter`, `message`, `accept`, `decline`, `withdraw`, `system` |
| `AuthorRole` | Market | `brand`, `creator`, `system` |
| `AuctionStatus` | Market | `scheduled`, `open`, `closed`, `awarded`, `no_bids`, `cancelled` |
| `BidStatus` | Market | `sealed`, `won`, `lost`, `withdrawn` |
| `SpecStatus` | Market | `draft`, `scoring`, `first_refusal`, `listed`, `licensed`, `withdrawn` |
| `SpecSource` | Market | `creator_upload`, `released_from_bounty` |
| `RightsScope` | Rights | `organic`, `paid_ads`, `spark_code`, `partnership_permission`, `ai_likeness` |
| `RightsGrantStatus` | Rights | `pending_permission`, `active`, `expiring`, `renewal_requested`, `expired`, `revoked` |
| `DisputeKind` | Trust | `view_count`, `flagged_botting`, `late_payment`, `rights_misuse`, `wrong_attribution`, `rejection_appeal`, `held_funds`, `other` |
| `DisputeStatus` | Trust | `open`, `evidence_requested`, `under_review`, `resolved`, `withdrawn` |
| `DisputeOutcome` | Trust | `upheld`, `partially_upheld`, `rejected` |
| `ScamReason` | Trust | `pay_to_join`, `off_platform_chat`, `fake_brand`, `burner_account_demand`, `no_escrow_claim`, `suspicious_link`, `harassment`, `other` |
| `ReportTargetKind` | Trust | `brand`, `bounty`, `creator`, `message`, `offer` |
| `ReportStatus` | Trust | `new`, `triaged`, `confirmed`, `actioned`, `dismissed` |
| `FraudFlagStatus` | Trust | `open`, `monitoring`, `cleared`, `confirmed` |
| `ComplianceCheckType` | Trust | `caption_disclosure`, `spoken_disclosure`, `onscreen_disclosure`, `platform_label`, `music_licence`, `banned_claims`, `ai_label`, `tracking_link` |
| `ComplianceResult` | Trust | `pass`, `warn`, `fail`, `pending` |
| `TaxForm` | Trust | `w9`, `w8ben` |
| `TaxStatus` | Trust | `none`, `requested`, `submitted`, `verified`, `rejected`, `expired` |
| `TaxDocKind` | Trust | `w9`, `w8ben`, `form_1099_nec` |
| `TaxDocStatus` | Trust | `draft`, `issued`, `corrected`, `void` |
| `ScoreBand` | Content | `A`, `B`, `C`, `D`, `E` |
| `ScoreItemId` | Content | `hook_lands_2s`, `onscreen_text_matches`, `face_early`, `app_visible_3s`, `pattern_interrupt`, `proven_hook_type`, `speech_starts_fast`, `captions_safe_zone`, `hook_score`, `required_beats`, `app_visible_early`, `disclosure`, `length_ok`, `single_cta_win_state`, `audio_clear`, `format_fit` |
| `SubmissionSource` | Submissions | `studio`, `web_studio`, `camera_roll`, `capcut` |
| `SubmissionStatus` | Submissions | `qa_pending`, `in_review`, `changes_requested`, `approved`, `posted`, `rejected`, `appealed`, `withdrawn`, `expired`, `released` |
| `DecisionAction` | Submissions | `approve`, `request_changes`, `reject`, `auto_approve`, `timeout_approve`, `auto_reject`, `appeal_overturn`, `appeal_uphold` |
| `SlaState` | Submissions | `on_track`, `stale`, `breached`, `met` |
| `ReasonCode` | Submissions | `app_not_shown_early`, `hook_too_late`, `missing_required_beat`, `missing_disclosure`, `offer_not_stated`, `face_not_shown`, `audio_unclear`, `music_not_licensed`, `banned_claim`, `off_brief`, `low_video_quality`, `wrong_format`, `duplicate_content`, `unoriginal_clip`, `watermark_present`, `competitor_shown`, `ai_content_undisclosed`, `brand_safety`, `region_mismatch`, `other_requirement`, `suspected_fraud` |
| `QaCheckType` | Submissions | `disclosure_audio`, `disclosure_onscreen`, `music_licence`, `banned_claims`, `ai_content`, `duplicate`, `watermark`, `brief_beats`, `safe_zone`, `aspect_ratio`, `length`, `resolution`, `audio_clarity`, `moderation` |
| `QaResult` | Submissions | `pass`, `warn`, `fail` |
| `FeedbackCategory` | Submissions | `hook`, `offer`, `disclosure`, `audio`, `brand`, `pacing`, `captions`, `claims` |
| `FeedbackSeverity` | Submissions | `must_fix`, `suggestion` |
| `FeedbackStatus` | Submissions | `open`, `resolved`, `dismissed` |
| `EvidenceKind` | Submissions | `timecode`, `qa_check`, `brief_requirement`, `transcript` |
| `PostStatus` | Posts | `live`, `window_closed`, `held`, `cleared`, `paid`, `removed`, `clawed_back` |
| `HoldReason` | Posts | `fraud_review`, `dispute_open`, `tax_info_missing`, `identity_check`, `payout_method_missing`, `compliance_fail`, `admin_hold` |
| `TrafficSource` | Posts | `fyp`, `following`, `profile`, `search`, `sound`, `share`, `other` |
| `SnapshotSource` | Posts | `platform_api`, `creator_screenshot`, `manual_adjust` |
| `SnapshotFlag` | Posts | `spike`, `plateau`, `bot_pattern`, `geo_shift`, `reconciled` |
| `FraudSignal` | Trust | `view_spike_no_engagement`, `cap_clustering`, `bought_views_pattern`, `geo_mismatch`, `view_to_follower_outlier`, `new_account`, `duplicate_hash`, `engagement_anomaly`, `traffic_source_anomaly`, `curve_shape` |
| `FraudBand` | Trust | `clean`, `watch`, `review`, `high` |
| `CurveShape` | Trust | `organic`, `spiky`, `flat`, `stepped` |
| `SceneKind` | Content | `face`, `screen_recording`, `broll`, `text_card`, `slide` |
| `ConversionKind` | Attribution | `install`, `trial`, `paid` |
| `ConversionSource` | Attribution | `link`, `code`, `mmp`, `survey`, `modelled` |
| `ConversionConfidence` | Attribution | `deterministic`, `matched`, `self_reported`, `modelled` |
| `ConversionStatus` | Attribution | `pending`, `cleared`, `rejected`, `refunded` |
| `AttributionLinkStatus` | Attribution | `active`, `paused`, `expired` |
| `OfferCodeStatus` | Attribution | `available`, `assigned`, `exhausted`, `expired`, `retired` |
| `RcEventType` | Attribution | `initial_purchase`, `renewal`, `cancellation`, `uncancellation`, `expiration`, `billing_issue`, `product_change`, `non_renewing_purchase`, `test` |
| `PeriodType` | Attribution | `trial`, `intro`, `normal` |
| `RcMatchStatus` | Attribution | `matched`, `unmatched`, `duplicate`, `ignored` |
| `AdKind` | Ads | `spark_ad`, `partnership_ad` |
| `AdStatus` | Ads | `requested`, `authorised`, `live`, `paused`, `fatigued`, `ended`, `expired`, `declined` |
| `RateCardStatus` | Market | `open`, `limited`, `paused` |
| `DropStatus` | Growth | `upcoming`, `live`, `sold_out`, `closed` |
| `TournamentStatus` | Growth | `announced`, `open`, `live`, `judging`, `complete`, `cancelled` |
| `TournamentFormat` | Growth | `bracket`, `leaderboard`, `hook_battle` |
| `EntryStatus` | Growth | `entered`, `advancing`, `eliminated`, `won`, `disqualified` |
| `CrewRole` | Growth | `lead`, `co_lead`, `member` |
| `StreakStatus` | Growth | `new`, `active`, `frozen`, `resting`, `broken` |
| `WeekOutcome` | Growth | `posted`, `freeze_used`, `rest`, `missed` |
| `LeaderboardMetric` | Growth | `earnings`, `conversion_rate`, `score_accuracy` |
| `LeaderboardZone` | Growth | `promotion`, `steady` |
| `ReferralKind` | Growth | `creator`, `brand`, `agency` |
| `ReferralStatus` | Growth | `invited`, `joined`, `first_dollar`, `earning`, `complete`, `expired` |
| `LessonTopic` | Growth | `first_video`, `briefs_and_rights`, `usage_rights`, `contract_red_flags`, `platform_rules`, `taxes`, `scams`, `rate_cards`, `analytics`, `sustainable_cadence` |
| `LessonBlockKind` | Growth | `text`, `tip`, `warning`, `example`, `steps` |
| `LessonStatus` | Growth | `not_started`, `in_progress`, `completed` |
| `TrendKind` | Growth | `format`, `hook`, `topic`, `sound` |
| `TrendDirection` | Growth | `rising`, `steady`, `fading` |
| `BadgeId` | Growth | `founding_creator`, `first_dollar`, `streak_4`, `streak_8`, `streak_12`, `academy_graduate`, `crew_lead`, `tournament_winner`, `top_10_week`, `hook_master`, `id_verified`, `always_on_time`, `million_views`, `first_trial` |
| `NotificationKind` | Platform | `approval`, `changes_requested`, `rejection`, `appeal_decided`, `post_live`, `views_milestone`, `cash_event`, `payout_cleared`, `payout_paid`, `payout_held`, `tier_up`, `streak_milestone`, `streak_freeze_used`, `drop_live`, `drop_reminder`, `offer_received`, `offer_countered`, `offer_accepted`, `tournament_update`, `crew_invite`, `rights_expiring`, `rights_renewed`, `fatigue_alert`, `review_waiting`, `review_sla_warning`, `bounty_filled`, `bounty_funded`, `funding_needed`, `auto_approve_paused`, `ad_live`, `dispute_update`, `tax_info_needed`, `scam_warning`, `flo_tip`, `academy_badge`, `referral_joined`, `system_notice` |
| `NotificationPriority` | Platform | `cash`, `normal`, `digest` |
| `IntegrationKind` | Platform | `revenuecat`, `appsflyer`, `adjust`, `branch`, `meta_ads`, `tiktok_ads`, `slack`, `zapier`, `app_store_connect` |
| `IntegrationStatus` | Platform | `connected`, `needs_attention`, `disconnected`, `error` |
| `ApiScope` | Platform | `read`, `write`, `financial` |
| `KeyMode` | Platform | `live`, `test` |
| `WebhookStatus` | Platform | `active`, `paused`, `failing`, `disabled` |
| `DeliveryStatus` | Platform | `delivered`, `failed`, `retrying` |
| `WebhookEventType` | Platform | `bounty_funded`, `bounty_live`, `bounty_filled`, `bounty_ended`, `submission_created`, `submission_approved`, `submission_changes_requested`, `submission_rejected`, `post_live`, `post_window_closed`, `post_cleared`, `conversion_tracked`, `ad_live`, `ad_fatigued`, `rights_expiring`, `dispute_opened`, `invoice_paid`, `wallet_low` |
| `ActivityAction` | Platform | `bounty_created`, `bounty_published`, `bounty_funded`, `bounty_paused`, `bounty_ended`, `submission_approved`, `submission_changes_requested`, `submission_rejected`, `rule_created`, `rule_enabled`, `rule_killed`, `member_invited`, `member_role_changed`, `member_removed`, `api_key_created`, `api_key_revoked`, `webhook_created`, `integration_connected`, `integration_disconnected`, `plan_changed`, `wallet_topped_up`, `auto_topup_changed`, `ad_promoted`, `rights_renewed`, `offer_sent`, `offer_accepted`, `dispute_responded`, `export_created`, `invoice_downloaded` |
| `RuleStatus` | Platform | `draft`, `dry_run`, `active`, `paused`, `killed` |
| `TestPlanStatus` | Platform | `draft`, `running`, `complete`, `archived` |
| `TestCellStatus` | Platform | `planned`, `briefed`, `submitted`, `live`, `measured` |
| `FatigueStatus` | Platform | `open`, `acknowledged`, `refreshing`, `resolved`, `dismissed` |
| `FatigueMetric` | Platform | `trial_rate`, `ctr`, `install_rate` |
| `FloKind` | Platform | `script`, `hook_rewrite`, `brief_tldr`, `caption`, `score_fix`, `rate_advice`, `next_action`, `bounty_draft` |
| `FloSurface` | Platform | `studio`, `bounty_detail`, `home`, `wallet`, `rate_card`, `builder`, `review` |
| `ModelKind` | Platform | `video_understanding`, `hook_coach`, `auto_qa`, `fraud`, `creative_scorer`, `matching`, `pricing`, `fatigue` |
| `ModelStage` | Platform | `heuristic`, `shadow`, `learned` |
| `ThreadKind` | Platform | `offer`, `submission`, `bounty`, `support` |
| `MessageKind` | Platform | `text`, `system`, `warning` |
| `SaveStage` | Platform | `saved`, `joined`, `submitted` |
| `ChangelogTag` | Platform | `new`, `improved`, `fix`, `trust`, `money` |
| `MetricStatus` | Platform | `achieved`, `on_track`, `at_risk`, `off_track` |
| `WrappedPeriod` | Growth | `month`, `year` |
| `ProofKind` | Growth | `payout`, `month`, `tier_up`, `wrapped` |
| `ExclusionCause` | Posts | `bot_pattern`, `cap_clustering`, `duplicate`, `geo_outlier`, `removed_post`, `platform_adjustment` |
| `StorefrontTheme` | Identity | `aurora`, `ink`, `sunrise`, `lagoon` |
| `RunStatus` | Money | `scheduled`, `running`, `complete` |
| `LeaderboardScope` | Growth | `cohort`, `niche`, `global` |
| `Difficulty` | Content | `easy`, `medium`, `hard` |
| `TaxEntityType` | Trust | `individual`, `llc`, `s_corp`, `c_corp`, `partnership` |
| `VerificationReason` | Trust | `document_unreadable`, `name_mismatch`, `underage`, `selfie_mismatch`, `business_not_found`, `bank_name_mismatch`, `tin_mismatch`, `other` |
| `PartyKind` | Identity | `creator`, `brand` |
| `TierEventKind` | Identity | `promoted`, `granted`, `hold_started`, `hold_cleared`, `demoted`, `carry_over_applied` |
| `WrappedCardKind` | Growth | `earnings`, `views`, `best_post`, `winning_hook`, `trials`, `streak`, `tier`, `top_brand`, `typical`, `share` |
| `SpendTier` | Platform | `starter`, `growth`, `scale` |
| `DisputeAction` | Trust | `opened`, `reply`, `evidence_requested`, `evidence_added`, `review_started`, `decision`, `withdrawn` |
| `RuleAuditAction` | Platform | `created`, `edited`, `dry_run`, `enabled`, `paused`, `resumed`, `killed`, `spot_check`, `spot_check_overturned` |


### Identity

#### Role

Account role on a user. Const: `ROLES`, labels: `ROLE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `creator` | Creator | accent | Posts videos and earns. Uses the iOS app and the creator web portal. |
| `brand_member` | Brand member | info | A person inside a brand workspace; permissions come from BrandMemberRole. |
| `admin` | Admin | violet | flowd staff (Ops). Trust and safety, payouts, verification, ML monitoring. |

#### ActorKind

Who triggers a state transition. Const: `ACTOR_KINDS`, labels: `ACTOR_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `creator` | Creator | accent | A creator, via the app or portal. |
| `brand` | Brand | info | A brand member, via dashboard, Slack or API. |
| `admin` | Admin | violet | flowd Ops. |
| `system` | System | neutral | A scheduled job or model: hourly sync, clearing run, weekly payout, fraud check. |

#### UserStatus

Lifecycle of a user account. Const: `USER_STATUSES`, labels: `USER_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `active` | Active | mint | Can sign in and act. |
| `invited` | Invited | info | Invited to a brand workspace, has not accepted yet. |
| `suspended` | Suspended | rose | Blocked by Ops (fraud, scam report, terms breach). Earnings are held. |
| `deleted` | Deleted | neutral | Deleted on request; PII erased, ledger rows kept with the id only. |

#### AuthProvider

How a user signs in. Const: `AUTH_PROVIDERS`, labels: `AUTH_PROVIDER_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `apple` | Apple | neutral | Sign in with Apple (primary on iOS). |
| `google` | Google | neutral | Sign in with Google. |
| `email` | Email | neutral | Email magic link. |

#### Tier

Earned creator tier. Bronze -> Silver -> Gold -> Platinum -> Elite. Thresholds in CONSTANTS.tiers. Const: `TIERS`, labels: `TIER_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `bronze` | Bronze | neutral | Everyone starts here. Full access to open bounties. |
| `silver` | Silver | neutral | $250 lifetime cleared, 5 approved, 70% approval. Rate card and 1h early access. |
| `gold` | Gold | sun | $2,000 cleared, 25 approved, 75% approval. 3h early access, crews lead, 1 free instant cash-out a week. |
| `platinum` | Platinum | accent | $10,000 cleared, 80 approved, 80% approval, reliability 90. 6h early access, auctions, unlimited instant cash-out. |
| `elite` | Elite | sun | $50,000 cleared, 250 approved, 85% approval, reliability 95, plus manual review. 12h early access, featured profile. |

#### TierBasis

Why a creator currently holds their tier. Const: `TIER_BASISES`, labels: `TIER_BASIS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `earned` | Earned | mint | Current stats meet the tier thresholds. |
| `grace_hold` | Grace hold | ember | Stats dipped below the threshold; tier is held for 30 days before any drop. |

#### LinkStatus

State of a connected social account (OAuth). Const: `LINK_STATUSES`, labels: `LINK_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `connected` | Connected | mint | Read-only OAuth is valid; views sync hourly. |
| `needs_reauth` | Reconnect | ember | Token expired; views stop syncing until the creator reconnects. |
| `revoked` | Revoked | rose | Creator revoked access on the platform. |
| `pending` | Pending | info | OAuth started, not finished. |

#### AccountHealthStatus

Repost-safe Account Health for a social account. Const: `ACCOUNT_HEALTH_STATUSES`, labels: `ACCOUNT_HEALTH_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `good` | Good | mint | No originality flags or strikes. |
| `watch` | Watch | ember | A flag or near-duplicate was detected; fix before the next post. |
| `at_risk` | At risk | rose | Platform strikes or repeated unoriginal-content flags. |

#### OnboardingStage

First-Dollar Path progress for a creator. Const: `ONBOARDING_STAGES`, labels: `ONBOARDING_STAGE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `signed_up` | Signed up | neutral | Signed in with Apple / Google / email. |
| `niches_picked` | Niches picked | neutral | Chose 1 to 3 niches. |
| `accounts_linked` | Accounts linked | info | Linked TikTok / Instagram / YouTube (read-only). |
| `first_submission` | First submission | accent | Submitted a first take (the activation event). |
| `first_approval` | First approval | accent | First video approved; just-in-time W-9 and ID prompt. |
| `verified` | Verified | mint | ID, age and payout method are verified. |
| `first_dollar` | First dollar | mint | First earnings cleared. Onboarding complete. |

#### BrandKind

Type of brand workspace. Const: `BRAND_KINDS`, labels: `BRAND_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `brand` | Brand | info | An app company funding its own bounties. |
| `agency` | Agency | violet | Agency workspace that manages several brand workspaces (Scale plan). |
| `platform` | flowd | accent | flowd itself: always-on content-about-us and starter bounties, funded from the platform promo account. |

#### BrandMemberRole

Role of a person inside a brand workspace. Const: `BRAND_MEMBER_ROLES`, labels: `BRAND_MEMBER_ROLE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `owner` | Owner | sun | Everything, including billing, plan, deleting the workspace and transferring ownership. |
| `admin` | Admin | accent | Manage bounties, team, integrations and API keys. No plan or ownership changes. |
| `reviewer` | Reviewer | info | Approve, request changes and reject submissions; comment on videos. |
| `finance` | Finance | mint | Wallet, funding, invoices, POs and tax documents. Read-only elsewhere. |
| `viewer` | Viewer | neutral | Read-only dashboards. No seat cost. |
| `client_approver` | Client approver | violet | Agency client who approves or requests changes from a link without a full seat. |

#### MemberStatus

State of a brand membership. Const: `MEMBER_STATUSES`, labels: `MEMBER_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `active` | Active | mint | Can act in the workspace. |
| `invited` | Invited | info | Invite sent, not accepted. |
| `removed` | Removed | neutral | Removed; kept for the activity log. |

#### AppStatus

State of an app connection. Const: `APP_STATUSES`, labels: `APP_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `connected` | Connected | mint | Store listing and attribution connected. |
| `pending` | Pending | info | Listing added, attribution not finished. |
| `error` | Needs attention | rose | Webhook or SDK is failing. |

#### MmpKind

Mobile measurement partner connected to an app. Const: `MMP_KINDS`, labels: `MMP_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `none` | None | neutral | No MMP; deterministic link + code + RevenueCat only. |
| `appsflyer` | AppsFlyer | neutral | AppsFlyer (OneLink). |
| `adjust` | Adjust | neutral | Adjust. |
| `branch` | Branch | neutral | Branch. |

#### SdkStatus

flowd attribution SDK snippet state. Const: `SDK_STATUSES`, labels: `SDK_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `not_installed` | Not installed | neutral | No first-launch attribute writes seen. |
| `installed` | Installed | info | Seen, not yet verified end to end. |
| `verified` | Verified | mint | A test conversion round-tripped. |

#### StorefrontTheme

Look of a creator storefront (joinflowd.io/c/<handle>). Const: `STOREFRONT_THEMES`, labels: `STOREFRONT_THEME_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `aurora` | Aurora | accent | Flow gradient glow. |
| `ink` | Ink | neutral | Calm dark ink. |
| `sunrise` | Sunrise | ember | Warm ember and sun. |
| `lagoon` | Lagoon | info | Cool lagoon and mint. |

#### PartyKind

A side of the market. Const: `PARTY_KINDS`, labels: `PARTY_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `creator` | Creator | accent | A creator. |
| `brand` | Brand | info | A brand or app team. |

#### TierEventKind

Entries in a creator's tier history. Const: `TIER_EVENT_KINDS`, labels: `TIER_EVENT_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `promoted` | Promoted | sun | Reached a new tier by meeting its thresholds. |
| `granted` | Granted | sun | Placed in a tier after Ops review (Elite) or founding carry-over. |
| `hold_started` | Grace hold started | ember | Stats dipped below a threshold; 30 days before any drop. |
| `hold_cleared` | Grace hold cleared | mint | Stats recovered inside the 30 days; the tier stays. |
| `demoted` | Moved down | neutral | Stats stayed below the threshold for 30 days. |
| `carry_over_applied` | Carry-over applied | info | Verified prior history was counted toward the thresholds. |


### Catalogues

#### Platform

Social platform a creator posts to. Const: `PLATFORMS`, labels: `PLATFORM_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `tiktok` | TikTok | neutral | TikTok (text/glyph only, no trademarked logo). |
| `instagram` | Instagram | neutral | Instagram Reels. |
| `youtube` | YouTube | neutral | YouTube Shorts. |

#### AdPlatform

Paid-ad surface for Winner promotion. Const: `AD_PLATFORMS`, labels: `AD_PLATFORM_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `tiktok` | TikTok | neutral | TikTok Spark Ads. |
| `meta` | Meta | neutral | Meta partnership ads (Instagram, Facebook). |

#### Category

App category (9). Drives market series, clearing CPMs and matching. Const: `CATEGORIES`, labels: `CATEGORY_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `ai_photo` | AI photo & video | violet | AI photo editors, headshots, video enhancers. |
| `ai_assistant` | AI assistants | violet | AI writing, chat and research assistants. |
| `fitness` | Fitness | mint | Workouts, running, strength, habit-based fitness. |
| `language` | Language & learning | accent | Language learning, study and tutoring apps. |
| `productivity` | Productivity | info | Notes, planners, focus and organisation tools. |
| `finance` | Money & budgeting | sun | Budgeting, saving and subscription-tracking apps. |
| `sleep_mind` | Sleep & mind | info | Sleep, meditation and mental wellbeing apps. |
| `music_audio` | Music & audio | ember | Music making, audio editing and listening tools. |
| `lifestyle` | Lifestyle & travel | ember | Travel, food, home and daily-life apps. |

#### Niche

Creator niche (12). Used for matching, cohorts and discovery. Const: `NICHES`, labels: `NICHE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `ai_tools` | AI tools | violet | Reviews and demos of AI apps. |
| `tech` | Tech | accent | Gadgets, apps and tech reviews. |
| `fitness` | Fitness | mint | Workouts and training. |
| `wellness` | Wellness | info | Sleep, mindfulness and self-care. |
| `productivity` | Productivity | info | Study systems, notes, organisation. |
| `study` | Study & learning | accent | Students, languages, exam prep. |
| `money` | Money | sun | Budgeting, saving and side income. |
| `lifestyle` | Lifestyle | ember | Day-in-the-life and routines. |
| `beauty` | Beauty | ember | Selfies, glow-ups, looks. |
| `travel` | Travel | ember | Trips, planning, maps. |
| `food` | Food | ember | Cooking and meal planning. |
| `parenting` | Parenting | info | Families, kids, routines. |

#### Country

Creator / audience country (ISO 3166-1 alpha-2, 12 supported for v1). Const: `COUNTRIES`, labels: `COUNTRY_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `US` | United States | neutral | Primary market. W-9 and 1099 flow. |
| `CA` | Canada | neutral | Supported. |
| `GB` | United Kingdom | neutral | Supported. |
| `AU` | Australia | neutral | Supported. |
| `IE` | Ireland | neutral | Supported. |
| `DE` | Germany | neutral | Supported. |
| `FR` | France | neutral | Supported. |
| `ES` | Spain | neutral | Supported. |
| `NL` | Netherlands | neutral | Supported. |
| `BR` | Brazil | neutral | Supported. |
| `MX` | Mexico | neutral | Supported. |
| `PH` | Philippines | neutral | Supported. |


### Money

#### Plan

Brand plan. Take rates and prices in CONSTANTS.plans. Const: `PLANS`, labels: `PLAN_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `free` | Free | neutral | $0, 12% take rate. Escrow, review queue, funnel, discovery, Rights Card, free tools. |
| `pro` | Pro | accent | $299/mo, 10% take rate. Learned scorer, auto-approve, Market view, Rights Vault, test planner, Slack, API. |
| `scale` | Scale | sun | $999/mo, 8% take rate. Multi-app / agency workspaces, roles, finance pack, SLAs, white-label reports. |

#### PlanFeature

A feature that a plan unlocks (gating keys). Const: `PLAN_FEATURES`, labels: `PLAN_FEATURE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `escrow` | Escrow | neutral | Fully escrowed bounties with the Funded badge. |
| `review_queue` | Review queue | neutral | Keyboard-first review queue. |
| `funnel` | Funnel | neutral | Views to paid funnel and payback dashboard. |
| `creator_discovery` | Creator discovery | neutral | Browse creators with verified results. |
| `rights_card` | Rights Card | neutral | Plain-language licence on every bounty. |
| `free_tools` | Free tools | neutral | Hook Score, App UGC Audit, calculators. |
| `brief_lint` | Brief Lint | neutral | Pre-publish brief checks and pay math. |
| `attribution_kit` | Attribution Kit | neutral | Links, code pool, RevenueCat webhook, SDK snippet. |
| `learned_scorer` | Learned scorer | accent | Learned Flow Score once enough bounties settle. |
| `guarded_auto_approve` | Guarded auto-approve | accent | Rules with dry run, spot-check and kill switch. |
| `market_view` | Market view | accent | Clearing CPMs and price-vs-fill-time. |
| `rights_vault` | Rights Vault | accent | Expiry alerts, Spark / partnership codes, renewals. |
| `test_planner` | Test planner | accent | Hook x body x CTA planner and fatigue alerts. |
| `slack` | Slack | accent | Approvals and digests in Slack. |
| `api` | API | accent | Public API, webhooks and the MCP server. |
| `winner_promotion` | Winner promotion | accent | Promote winners as Spark / partnership ads (1% of ad spend). |
| `multi_app` | Multi-app | sun | Several apps in one workspace. |
| `agency_workspaces` | Agency workspaces | sun | Manage client brands from one agency workspace. |
| `roles` | Roles | sun | Owner, admin, reviewer, finance, viewer, client approver. |
| `finance_pack` | Finance pack | sun | Invoices, POs, cost centres, CSV and tax docs. |
| `slas` | SLAs | sun | Support and review SLAs. |
| `white_label_reports` | White-label reports | sun | Client-ready PDF reports. |

#### LedgerType

Why a ledger row exists. Every transaction (txn_id) nets to zero. Const: `LEDGER_TYPES`, labels: `LEDGER_TYPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `wallet_topup` | Wallet top-up | neutral | external:card -> wallet:brand. Card charge = amount + processing. |
| `escrow_fund` | Escrow funding | neutral | wallet:brand -> escrow:bounty (budget + fee reserve). The bounty may now go live. |
| `matched_budget` | Matched budget | mint | platform:matching -> escrow:bounty (first-bounty match, up to $500). |
| `escrow_refund` | Escrow refund | neutral | escrow:bounty -> wallet:brand when the bounty settles (unspent budget and fee reserve). |
| `cpm` | Views pay | mint | escrow:bounty -> creator: CPM leg of a post (credit row, pending then cleared then paid). |
| `cpa` | Conversion pay | mint | escrow:bounty -> creator: install / trial / paid bonus on a cleared conversion. |
| `flat_fee` | Flat fee | mint | escrow:bounty -> creator: direct offer, auction or spec licence price. |
| `commission` | Ad commission | mint | wallet:brand -> creator: 10% of ad-attributed revenue for 60 days. |
| `rights_fee` | Rights renewal | mint | wallet:brand -> creator: paid-ad usage renewal (25% of base fee per 30 days). |
| `fee` | Platform fee | neutral | escrow:bounty (or wallet) -> platform:fees: the take rate on a settled leg. |
| `ad_fee` | Ad fee | neutral | wallet:brand -> platform:fees: 1% of ad spend. |
| `subscription_fee` | Subscription | neutral | external:card -> platform:subscriptions: Pro / Scale plan. |
| `processing` | Card processing | neutral | external:card -> platform:processing: pass-through card cost (2.9% + $0.30). |
| `payout` | Payout | mint | creator -> external:bank: money leaves flowd. Debits cleared earnings. |
| `payout_fee` | Instant payout fee | neutral | creator -> platform:fees: 1.5% (min $0.50, max $15) on instant cash-outs. |
| `bonus` | Bonus | mint | platform:promo -> creator: starter-bounty first dollar, streak or crew bonus. |
| `prize` | Prize | sun | platform:promo -> creator: tournament prize. |
| `referral` | Referral reward | mint | platform:promo -> creator: 5% of a referee's cleared earnings for 90 days. |
| `clawback` | Clawback | rose | Reversal of earlier rows after proven fraud or refund (reverses_txn_id set). |
| `adjustment` | Adjustment | neutral | Manual correction by Ops with a memo. |

#### LedgerStatus

State of a ledger row (only status, cleared_at, paid_at and payout_id ever change). Const: `LEDGER_STATUSES`, labels: `LEDGER_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `pending` | Pending | info | Written but waiting on the fraud check or a clearing window. |
| `cleared` | Cleared | mint | Cleared; counts toward lifetime cleared; waits for payout. |
| `paid` | Paid | mint | Included in a payout (payout_id set). |
| `held` | Held | ember | Held with a reason. |
| `reversed` | Reversed | rose | Reversed by a clawback transaction. |

#### LedgerAccountKind

Account kinds in the double-entry ledger. Account strings are "<kind>:<id>". Const: `LEDGER_ACCOUNT_KINDS`, labels: `LEDGER_ACCOUNT_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `wallet` | Brand wallet | neutral | wallet:br_x. Funds a brand deposited and has not locked to a bounty. |
| `escrow` | Bounty escrow | neutral | escrow:bnty_x. Funds locked to one bounty. |
| `creator` | Creator balance | mint | creator:cr_x. Earned money not yet withdrawn. |
| `platform` | flowd platform | accent | platform:fees \| subscriptions \| matching \| promo \| processing. |
| `external` | External | neutral | external:card \| bank. The world outside flowd. |

#### PayoutKind

Payout kind. Const: `PAYOUT_KINDS`, labels: `PAYOUT_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `weekly` | Weekly | mint | Automatic, free, Fridays 18:00 UTC. |
| `instant` | Instant | sun | On demand, 1.5% fee (min $0.50, max $15); free for Gold x1 a week and Platinum+. |

#### PayoutStatus

Payout lifecycle. Const: `PAYOUT_STATUSES`, labels: `PAYOUT_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `scheduled` | Scheduled | info | Will run at the next weekly payout. |
| `processing` | Processing | info | The payout run has started. |
| `in_transit` | In transit | accent | Transfer created; on its way to the bank. |
| `paid` | Paid | mint | Arrived. |
| `failed` | Failed | rose | The transfer failed (reason shown); it retries after the method is fixed. |
| `held` | Held | ember | Held for tax info, ID check, fraud review or a dispute. |
| `cancelled` | Cancelled | neutral | Cancelled before processing. |

#### PayoutMethodKind

Where a creator is paid. Const: `PAYOUT_METHOD_KINDS`, labels: `PAYOUT_METHOD_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `bank` | Bank account | neutral | Bank account via the Stripe-style Connect sheet (mocked). |
| `debit_card` | Debit card | neutral | Debit card (instant-capable). |

#### PayoutMethodStatus

Payout method state. Const: `PAYOUT_METHOD_STATUSES`, labels: `PAYOUT_METHOD_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `active` | Active | mint | Verified and usable. |
| `pending` | Pending | info | Awaiting verification. |
| `failed` | Failed | rose | Verification or a transfer failed. |

#### PaymentKind

How a brand funds its wallet. Const: `PAYMENT_KINDS`, labels: `PAYMENT_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `card` | Card | neutral | Card, 2.9% + $0.30 processing. |
| `ach` | Bank transfer | neutral | ACH, lower processing, slower. |

#### InvoiceKind

Invoice type. Const: `INVOICE_KINDS`, labels: `INVOICE_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `funding` | Bounty funding | neutral | Escrow funding for a bounty: budget, fee and processing lines. |
| `subscription` | Subscription | neutral | Monthly Pro / Scale plan. |
| `ad_fee` | Ad fee | neutral | 1% of ad spend for a month. |
| `rights_renewal` | Rights renewal | neutral | Paid-ad usage renewal. |
| `spec_license` | Spec licence | neutral | Spec Market licence. |
| `adjustment` | Adjustment | neutral | Credit note or manual adjustment. |

#### InvoiceStatus

Invoice state. Const: `INVOICE_STATUSES`, labels: `INVOICE_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `draft` | Draft | neutral | Not issued. |
| `open` | Open | info | Issued, awaiting payment. |
| `paid` | Paid | mint | Paid. |
| `void` | Void | neutral | Voided. |
| `refunded` | Refunded | info | Refunded in full or part. |

#### MoneyClockSource

What kind of earning a Money Clock row is. Const: `MONEY_CLOCK_SOURCES`, labels: `MONEY_CLOCK_SOURCE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `cpm` | Views | mint | CPM pay on verified views. |
| `cpa_install` | Installs | mint | Install bonus. |
| `cpa_trial` | Trials | mint | Trial bonus. |
| `cpa_paid` | Paid subs | mint | Paid subscription bonus. |
| `ad_commission` | Ad commission | mint | Commission on promoted-ad revenue. |
| `flat_fee` | Flat fee | mint | Direct offer, auction or spec licence. |
| `rights_fee` | Rights renewal | mint | Usage renewal payment. |
| `prize` | Prize | sun | Tournament prize. |
| `bonus` | Bonus | mint | Platform bonus. |
| `referral` | Referral | mint | Referral reward. |

#### MoneyClockState

Where earning money is on its way: accruing -> pending -> cleared -> paid. Const: `MONEY_CLOCK_STATES`, labels: `MONEY_CLOCK_STATE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `accruing` | Accruing | info | Window open; the amount is a live estimate that grows with verified views. |
| `pending` | Pending | info | Window closed or conversion in its clearing window; has a dated ETA and a named reason. |
| `cleared` | Cleared | mint | Cleared and waiting for the weekly payout (or an instant cash-out). |
| `paid` | Paid | mint | Paid out. |
| `held` | Held | ember | Held, with a named reason and the next step. |
| `reversed` | Reversed | rose | Reversed after a clawback. |

#### MoneyClockReason

Every non-final Money Clock row carries a named reason. Never a bare "pending". Const: `MONEY_CLOCK_REASONS`, labels: `MONEY_CLOCK_REASON_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `window_open` | Views still counting | info | The 72-hour window closes at eta_at. |
| `fraud_check` | View check running | info | Automated fraud and disclosure check; done within 12 hours. |
| `awaiting_clearing_run` | Next clearing run | info | Clears at the next daily 14:00 UTC run. |
| `conversion_clearing` | Conversion clearing | info | Install 24h / trial 72h / paid 168h check before CPA clears. |
| `awaiting_weekly_payout` | Next weekly payout | mint | Cleared. Pays out Friday 18:00 UTC. |
| `payout_in_transit` | On its way | accent | Transfer created; arriving at the bank. |
| `held_fraud_review` | Held: view review | ember | A human is reviewing the views; decision within 24 hours. |
| `held_dispute` | Held: dispute open | ember | Held while a dispute is open. |
| `held_tax_info` | Held: add W-9 | ember | Add tax info to release. |
| `held_identity_check` | Held: ID check | ember | Verify identity to release. |
| `held_payout_method` | Held: payout method | ember | Add a payout method to release. |
| `held_compliance` | Held: disclosure | rose | The posted video failed the disclosure audit. |
| `paid_out` | Paid out | mint | Included in a completed payout. |
| `reversed_clawback` | Reversed | rose | Views or conversions invalidated. |

#### TickerKind

Public payout-ticker event kinds. Const: `TICKER_KINDS`, labels: `TICKER_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `payout` | Payout | mint | A creator was paid. |
| `first_dollar` | First dollar | mint | A creator's first cleared earnings. |
| `tier_up` | Tier up | sun | A creator reached a new tier. |
| `bounty_filled` | Bounty filled | accent | A bounty filled. |
| `milestone` | Milestone | sun | Platform milestone, e.g. total paid. |
| `promoted` | Promoted | accent | A post was promoted as a paid ad. |

#### RunStatus

Weekly payout run lifecycle (Fridays 18:00 UTC). Const: `RUN_STATUSES`, labels: `RUN_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `scheduled` | Scheduled | info | Not started. Preview shows creators, total and named holds. |
| `running` | Running | accent | The run has started; transfers are being created. |
| `complete` | Complete | mint | Every eligible payout was created; holds carry to the next run. |


### Bounties

#### BountyType

How a bounty pays. Const: `BOUNTY_TYPES`, labels: `BOUNTY_TYPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `cpm` | Views (CPM) | accent | Pays per 1,000 verified views inside the 72-hour window, up to the per-video cap. |
| `cpa` | Outcomes (CPA) | mint | Pays only per tracked install, trial or paid sub via link or code. Flat 6% fee on cleared conversions. |
| `stacked` | Stacked | violet | CPM floor plus CPA bonuses (and ad commission if promoted) on the same video. |
| `direct` | Direct | sun | A private flat-fee bounty created when a brand buys from a rate card or wins an auction slot. |
| `install_only` | Install-only | info | No view pay: installs only (trial and paid rates are 0). Risk-free for small teams. Flat 6% fee. |

#### BountyStatus

Bounty lifecycle. See state machine. Const: `BOUNTY_STATUSES`, labels: `BOUNTY_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `draft` | Draft | neutral | Being written. Not visible to creators. |
| `awaiting_funding` | Awaiting funding | ember | Brief lint passed; waiting for the full escrow. Cannot go live until funded. |
| `scheduled` | Scheduled | info | Funded; will go live at starts_at. |
| `live` | Live | mint | Funded and open to submissions. Shows the Funded badge. |
| `paused` | Paused | ember | Temporarily closed to new submissions by the brand or Ops. Existing work continues. |
| `filled` | Filled | accent | Budget fully reserved; no new submissions. Reopens if reservations release. |
| `ended` | Ended | neutral | Closed to submissions; posts are still in their windows or CPA windows. |
| `settled` | Settled | neutral | All windows closed, escrow reconciled, unspent budget refunded. |
| `cancelled` | Cancelled | rose | Cancelled before any work was approved; escrow refunded. |

#### Visibility

Who can see a bounty. Const: `VISIBILITIES`, labels: `VISIBILITY_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `open` | Open | mint | Any eligible creator can find and join it. |
| `invite_only` | Invite only | info | Only invited creators can see it. |
| `private` | Private | neutral | A direct bounty visible to one creator. |
| `drop` | Daily Drop | ember | Released through a Daily Drop with limited spots. |

#### FundingSource

Where a bounty's escrow comes from. Const: `FUNDING_SOURCES`, labels: `FUNDING_SOURCE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `brand` | Brand funded | neutral | Fully funded by the brand wallet. |
| `brand_matched` | Brand + match | mint | Brand funded; flowd matched up to $500 of the first bounty. |
| `platform` | flowd funded | accent | Funded from the flowd promo account: starter bounties and the content-about-us bounty. |

#### LintSeverity

Brief Lint issue severity. Const: `LINT_SEVERITIES`, labels: `LINT_SEVERITY_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `blocker` | Blocker | rose | The bounty cannot be published until fixed. |
| `warning` | Warning | ember | Allowed, but likely to hurt fill rate or creator trust. |
| `info` | Tip | info | A suggestion. |

#### BriefLintCode

Brief Lint rule ids. Const: `BRIEF_LINT_CODES`, labels: `BRIEF_LINT_CODE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `missing_deliverables` | Missing deliverables | rose | Video count, length and platforms not stated. |
| `missing_platforms` | Missing platforms | rose | No posting platform chosen. |
| `missing_regions` | Missing regions | ember | No target regions or audience minimum. |
| `view_minimum_base` | View-minimum base pay | rose | Base pay that only unlocks after a view minimum. |
| `unpaid_trial` | Unpaid trial | rose | Unpaid test video or free trial work before pay. |
| `burner_account` | Burner account demanded | rose | Requires a new or dedicated account per brand. |
| `fresh_account_demand` | Fresh account demanded | rose | Requires a fresh account, no personal posting. |
| `forced_posting_count` | Forced posting count | rose | Demands a posting count with no pay for it. |
| `perpetual_rights` | Perpetual rights | rose | Perpetual or unlimited usage rights. |
| `ai_likeness_requested` | AI likeness requested | rose | Asks for AI likeness rights (off by default). |
| `pay_to_join` | Pay to join | rose | Charges creators to enter. |
| `below_floor_cpm` | CPM below floor | rose | CPM under $0.50. |
| `no_disclosure_text` | No disclosure wording | ember | Required #ad wording not set. |
| `unclear_cta` | Unclear CTA | ember | More than one call to action or none. |
| `cap_too_low` | Cap too low | ember | Per-video cap under $20; creators will skip it. |
| `low_effective_pay` | Low effective pay | ember | Median expected pay per video is under $15. |
| `budget_below_minimum` | Budget below minimum | rose | Budget under $100. |
| `short_window` | Short deadline | info | Deadline under 5 days leaves little room for revisions. |

#### TimeoutPolicy

What happens when a submission passes the 72h SLA unreviewed. Const: `TIMEOUT_POLICIES`, labels: `TIMEOUT_POLICY_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `escalate` | Escalate | ember | Escalate to the bounty owner and workspace owners; brand reliability takes a hit. Default. |
| `approve_if_clean` | Approve if clean | mint | Auto-approve when every QA check passes; otherwise escalate. |

#### MusicPolicy

Brand music rule. Const: `MUSIC_POLICIES`, labels: `MUSIC_POLICY_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `original_only` | Original audio only | neutral | No music; original audio. |
| `commercial_library` | Commercial library | neutral | Only platform commercial-music-library tracks. |

#### AiContentPolicy

Brand rule on AI-generated content. Const: `AI_CONTENT_POLICIES`, labels: `AI_CONTENT_POLICY_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `not_allowed` | Not allowed | rose | No AI-generated video or voice. |
| `allowed_disclosed` | Allowed, disclosed | neutral | Allowed with a visible AI label. |


### Content

#### BeatId

A beat (moment) a video can contain. Briefs require beats; formats are sequences of beats. Const: `BEAT_IDS`, labels: `BEAT_ID_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `hook` | Hook | ember | The first-3-seconds claim, question or pattern interrupt. |
| `problem` | Problem | neutral | The pain the app solves, in one line. |
| `app_reveal` | App reveal | accent | The app appears on screen. |
| `demo` | Demo | accent | Screen recording of the key action. |
| `key_feature` | Key feature | accent | A named feature from the brief. |
| `payoff` | Payoff | mint | The result of using the app. |
| `proof` | Proof | mint | Before/after, stat or screenshot that proves it. |
| `offer` | Offer | sun | The free trial or promo is stated. |
| `cta` | CTA | ember | One call to action (link in bio, code). |
| `win_state` | Win state | mint | The moment the app delivered. |
| `reaction` | Reaction | violet | Creator reaction at the wow moment. |
| `end_card` | End card | neutral | Closing card with app name and code. |

#### FormatId

Winning app ad format templates (tmpl_*). Full beat structures live in formats.json. Const: `FORMAT_IDS`, labels: `FORMAT_ID_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `tmpl_screen_reaction` | Screen record + reaction | accent | Face cam reacting to using the app for the first time. |
| `tmpl_hidden_gem` | Hidden gem | accent | "This app is so slept on" then one killer feature. |
| `tmpl_confession` | Confession hook | accent | "I didn't expect to use this every day" then why, demo, CTA. |
| `tmpl_problem_solution` | Problem, solution, result | accent | Pain, the app solving it on screen, result, one CTA. |
| `tmpl_faceless_slideshow` | Faceless slideshow | accent | 5 to 8 slides; the app appears on slide 4. |
| `tmpl_green_screen` | Green screen | accent | Creator in front of the store page, a comment or a stat. |
| `tmpl_results_update` | Results update | violet | "Day 30 of using the app", before vs now. |
| `tmpl_identity_shift` | Identity transformation | violet | "I became someone who..." with the app as the habit. |
| `tmpl_free_trial_lead` | Free-trial lead | violet | Offer in the first 3 seconds, quick demo, value per day. |
| `tmpl_reply_comment` | Reply to a comment | violet | Pins a skeptical comment and answers with a demo. |
| `tmpl_carousel_video` | Carousel turned video | violet | A slideshow rendered as video with the app named mid-way. |

#### HookType

Hook library groups. Const: `HOOK_TYPES`, labels: `HOOK_TYPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `confession` | Confession | accent | "I was wrong about workout apps." |
| `curiosity_gap` | Curiosity gap | accent | "Wait until you see what this app did to my mornings." |
| `specific_number` | Specific number | accent | "12 minutes a day, 30 days, here's what changed." |
| `pov` | POV | accent | "POV: you finally found a workout app you don't quit." |
| `direct_question` | Direct question | accent | "Why is nobody talking about this app?" |
| `risk_reversal` | Risk reversal | accent | "I didn't pay a cent for the first week." |
| `pattern_interrupt` | Pattern interrupt | accent | Starts mid-action, mid-sentence or with an odd visual. |

#### CtaType

The single call to action in a video. Const: `CTA_TYPES`, labels: `CTA_TYPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `link_in_bio` | Link in bio | neutral | Tap the tracked link. |
| `use_code` | Use my code | neutral | Promo / offer code redemption. |
| `try_free` | Try it free | neutral | Free trial pitch. |
| `download_now` | Download | neutral | Direct install ask. |
| `search_app_store` | Search the store | neutral | Search the app name in the store. |
| `comment_for_link` | Comment for link | neutral | Comment a keyword to receive the link. |

#### ScoreBand

Checklist score band for Hook Score and Flow Score. Day-one scores are checklist scores, labelled as such. Const: `SCORE_BANDS`, labels: `SCORE_BAND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `A` | A | mint | Strong: 85+ points. |
| `B` | B | accent | Good: 70 to 84. |
| `C` | C | info | Okay: 55 to 69. |
| `D` | D | ember | Needs work: 40 to 54. |
| `E` | E | rose | Fix before posting: under 40. |

#### ScoreItemId

A line of the Hook Score or Flow Score checklist (weights in CONSTANTS.scores). Const: `SCORE_ITEM_IDS`, labels: `SCORE_ITEM_ID_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `hook_lands_2s` | Hook lands by 2.0s | neutral | Hook Score item (20). |
| `onscreen_text_matches` | On-screen text mirrors the hook | neutral | Hook Score item (15). |
| `face_early` | Face in first second | neutral | Hook Score item (15). |
| `app_visible_3s` | App visible by 3s | neutral | Hook Score item (15). |
| `pattern_interrupt` | Pattern interrupt | neutral | Hook Score item (10). |
| `proven_hook_type` | Proven hook type | neutral | Hook Score item (10). |
| `speech_starts_fast` | Speech starts fast | neutral | Hook Score item (10). |
| `captions_safe_zone` | Captions in safe zones | neutral | Hook Score item (5) and Flow Score item (5). |
| `hook_score` | Hook Score | neutral | Flow Score item (30): the Hook Score scaled. |
| `required_beats` | Required beats | neutral | Flow Score item (25). |
| `app_visible_early` | App on screen early | neutral | Flow Score item (10). |
| `disclosure` | Disclosure | neutral | Flow Score item (10). |
| `length_ok` | Length 15 to 30s | neutral | Flow Score item (5). |
| `single_cta_win_state` | One CTA, win state | neutral | Flow Score item (5). |
| `audio_clear` | Audio clear | neutral | Flow Score item (5). |
| `format_fit` | Format fit | neutral | Flow Score item (5). |

#### SceneKind

Kind of scene segment found by video understanding. Const: `SCENE_KINDS`, labels: `SCENE_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `face` | Face to camera | neutral | Creator on camera. |
| `screen_recording` | Screen recording | accent | App screen recording. |
| `broll` | B-roll | neutral | Cutaway footage. |
| `text_card` | Text card | neutral | Full-screen text. |
| `slide` | Slide | neutral | Slideshow image. |

#### Difficulty

How hard a format is to film. Const: `DIFFICULTIES`, labels: `DIFFICULTY_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `easy` | Easy | mint | Phone, no editing skills needed. |
| `medium` | Medium | info | A few cuts or a screen recording. |
| `hard` | Hard | ember | Several scenes or timing-sensitive edits. |


### Submissions

#### SubmissionSource

How the video got to flowd. Const: `SUBMISSION_SOURCES`, labels: `SUBMISSION_SOURCE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `studio` | Studio | accent | Recorded in the flowd Studio (iOS). |
| `web_studio` | Web Studio lite | accent | Uploaded through the web Studio-lite flow. |
| `camera_roll` | Camera roll | neutral | Imported from the phone camera roll. |
| `capcut` | CapCut import | neutral | Exported from CapCut and imported. |

#### SubmissionStatus

Submission lifecycle. See state machine. Const: `SUBMISSION_STATUSES`, labels: `SUBMISSION_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `qa_pending` | Checking | info | Uploaded; auto-QA, scoring and the reservation are running. |
| `in_review` | In review | accent | Waiting for the brand. The 72-hour SLA clock is running. |
| `changes_requested` | Changes requested | ember | The brand asked for changes with timecoded notes (revision round). |
| `approved` | Approved | mint | Approved; ready to post with the tracking link, code and #ad. |
| `posted` | Posted | mint | Posted to the creator's account; the 72-hour view window is running or done. |
| `rejected` | Not approved | rose | Rejected with a reason code and evidence. One appeal allowed. |
| `appealed` | Appeal open | ember | The creator appealed the rejection; Ops decides within 72 hours. |
| `withdrawn` | Withdrawn | neutral | The creator withdrew it; the reservation is released. |
| `expired` | Expired | neutral | Revisions were not resubmitted in 14 days; the reservation is released. |
| `released` | Released | violet | Approved but unused for 30 days; moved to the Spec Market (brand keeps first refusal). |

#### DecisionAction

How a decision was made. Const: `DECISION_ACTIONS`, labels: `DECISION_ACTION_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `approve` | Approved | mint | A person approved it. |
| `request_changes` | Requested changes | ember | A person requested changes (needs at least one must-fix note). |
| `reject` | Rejected | rose | A person rejected it (reason code + evidence mandatory). |
| `auto_approve` | Auto-approved | violet | A guarded auto-approve rule approved it. |
| `timeout_approve` | Approved on timeout | violet | Approved at 72h under the approve-if-clean timeout policy. |
| `auto_reject` | Auto-blocked | rose | Blocked by a hard QA failure such as an exact duplicate (evidence attached). |
| `appeal_overturn` | Appeal overturned | mint | Ops overturned a rejection on appeal. |
| `appeal_uphold` | Appeal upheld | rose | Ops upheld the rejection on appeal. |

#### SlaState

Review SLA position of a submission. Const: `SLA_STATES`, labels: `SLA_STATE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `on_track` | On track | mint | Under 48 hours in the queue. |
| `stale` | Stale | ember | 48 to 72 hours in the queue. |
| `breached` | SLA breached | rose | Over 72 hours: escalated; the brand reliability score took a hit. |
| `met` | Decided in SLA | neutral | Decided inside 72 hours. |

#### ReasonCode

Reason codes for rejecting or requesting changes. Always about the video, never the person. Detail in REASON_CODE_INFO. Const: `REASON_CODES`, labels: `REASON_CODE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `app_not_shown_early` | App not on screen early | ember | The app isn't visible in the first 3 seconds. |
| `hook_too_late` | Hook lands too late | ember | The hook doesn't land by 2 seconds. |
| `missing_required_beat` | Missing a required beat | ember | A required beat from the brief is missing. |
| `missing_disclosure` | Disclosure missing | rose | #ad is not in both the audio and on screen. |
| `offer_not_stated` | Offer not stated | ember | The free trial or promo isn't mentioned. |
| `face_not_shown` | Face required | ember | The brief requires a face on camera. |
| `audio_unclear` | Audio unclear | ember | Speech is hard to hear or has dead air. |
| `music_not_licensed` | Music not licensed for ads | rose | A track outside the commercial music library. |
| `banned_claim` | Banned claim | rose | A medical, income or guarantee claim the brand disallows. |
| `off_brief` | Doesn't match the brief | ember | The concept doesn't follow the stated brief. |
| `low_video_quality` | Video quality too low | ember | Dark, shaky or low resolution. |
| `wrong_format` | Wrong aspect or length | ember | Not 9:16 or outside the length range. |
| `duplicate_content` | Duplicate video | rose | Matches another video already submitted or posted. |
| `unoriginal_clip` | Unoriginal clip | rose | Reposted or stitched from someone else's content. |
| `watermark_present` | Watermark present | ember | Another app's watermark or logo is visible. |
| `competitor_shown` | Competitor shown | ember | A competing app is visible. |
| `ai_content_undisclosed` | AI content not labelled | rose | AI-generated media without the required label. |
| `brand_safety` | Brand-safety issue | rose | Content outside the brand's safety rules. |
| `region_mismatch` | Audience region mismatch | ember | Audience is outside the bounty's target regions. |
| `other_requirement` | Other stated requirement | ember | A requirement written in the brief that the video misses (must be quoted). |
| `suspected_fraud` | Suspected view fraud | rose | Admin-only: proven view fraud. Delivered legitimate views are still paid. |

#### QaCheckType

Automated QA checks run on every submission version. Const: `QA_CHECK_TYPES`, labels: `QA_CHECK_TYPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `disclosure_audio` | Spoken disclosure | neutral | The #ad / paid-partnership line is spoken. |
| `disclosure_onscreen` | On-screen disclosure | neutral | #ad is visible on screen. |
| `music_licence` | Music licence | neutral | Audio matches only commercial-library tracks. |
| `banned_claims` | Banned claims | neutral | No disallowed claims in transcript or on-screen text. |
| `ai_content` | AI-generated content | neutral | AI media detected and labelled where required. |
| `duplicate` | Duplicate check | neutral | Perceptual-hash comparison against all prior videos. |
| `watermark` | Watermark check | neutral | No other app's watermark or logo. |
| `brief_beats` | Brief beats | neutral | Required beats found in the transcript and frames. |
| `safe_zone` | Safe zones | neutral | On-screen text is inside TikTok and Reels safe zones. |
| `aspect_ratio` | Aspect ratio | neutral | 9:16. |
| `length` | Length | neutral | Inside the bounty's length range. |
| `resolution` | Resolution | neutral | At least 720x1280; 1080x1920 preferred. |
| `audio_clarity` | Audio clarity | neutral | Speech level and dead-air check. |
| `moderation` | Moderation | neutral | Safety moderation model. |

#### QaResult

Outcome of a QA check. Const: `QA_RESULTS`, labels: `QA_RESULT_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `pass` | Pass | mint | No issue. |
| `warn` | Warning | ember | Possible issue; a human decides. |
| `fail` | Fail | rose | Likely issue; shown first in the queue and blocks auto-approve. |

#### FeedbackCategory

Category of a timecoded feedback note. Const: `FEEDBACK_CATEGORIES`, labels: `FEEDBACK_CATEGORY_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `hook` | Hook | ember | The first 3 seconds. |
| `offer` | Offer | sun | The offer or trial wording. |
| `disclosure` | Disclosure | rose | #ad and paid-partnership wording. |
| `audio` | Audio | info | Speech, music or sound. |
| `brand` | Brand | accent | App name, logo, colours or tone. |
| `pacing` | Pacing | neutral | Cuts, length and rhythm. |
| `captions` | Captions | neutral | Caption text and placement. |
| `claims` | Claims | rose | A claim that needs to change. |

#### FeedbackSeverity

How serious a note is. Const: `FEEDBACK_SEVERITIES`, labels: `FEEDBACK_SEVERITY_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `must_fix` | Must fix | rose | Must be resolved in the next version; carries over until ticked off. |
| `suggestion` | Suggestion | info | Optional improvement. |

#### FeedbackStatus

State of a feedback note. Const: `FEEDBACK_STATUSES`, labels: `FEEDBACK_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `open` | Open | ember | Not yet addressed. |
| `resolved` | Resolved | mint | Addressed in a later version (the creator ticked it off). |
| `dismissed` | Dismissed | neutral | The brand withdrew the note. |

#### EvidenceKind

What a rejection or note points at. Const: `EVIDENCE_KINDS`, labels: `EVIDENCE_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `timecode` | Timecode | neutral | A moment in the video. |
| `qa_check` | QA check | neutral | An automated check result. |
| `brief_requirement` | Brief requirement | neutral | A quoted line from the brief. |
| `transcript` | Transcript | neutral | A quoted line from the transcript. |


### Posts

#### PostStatus

Post lifecycle (CPM / flat leg). Conversions and ad commission settle on their own ledger rows. Const: `POST_STATUSES`, labels: `POST_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `live` | Live | info | Posted; the 72-hour view window is open. Earnings are pending and accruing. |
| `window_closed` | Window closed | info | 72 hours elapsed; the fraud and compliance check is running. |
| `held` | Held | ember | A fraud, compliance or dispute hold. Reason shown; human decision within 24 hours. |
| `cleared` | Cleared | mint | Checks passed. CPM earnings are cleared and wait for the weekly payout. |
| `paid` | Paid | mint | The CPM earnings were included in a payout. |
| `removed` | Removed | neutral | Deleted before the window closed; earns nothing. |
| `clawed_back` | Clawed back | rose | Proven fraud: invalid views reversed (delivered legitimate views still paid). |

#### HoldReason

Why money or a post is held. Const: `HOLD_REASONS`, labels: `HOLD_REASON_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `fraud_review` | Fraud review | ember | Fraud score 40 or above; a human review within 24 hours. |
| `dispute_open` | Dispute open | ember | A dispute is open on the post or payout. |
| `tax_info_missing` | Tax info needed | ember | Add a W-9 (or W-8BEN) to release the payout. |
| `identity_check` | ID check needed | ember | Identity verification is required before the first payout. |
| `payout_method_missing` | Payout method needed | ember | Add a bank account or debit card. |
| `compliance_fail` | Disclosure check failed | rose | The posted video failed the disclosure audit. |
| `admin_hold` | Manual hold | rose | Placed by Ops; the reason is shown to the creator. |

#### TrafficSource

Where views came from (View Ledger source breakdown). Const: `TRAFFIC_SOURCES`, labels: `TRAFFIC_SOURCE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `fyp` | For You / Explore | mint | Recommendation feed. |
| `following` | Following | neutral | The creator's followers. |
| `profile` | Profile | neutral | Profile visits. |
| `search` | Search | neutral | Search results. |
| `sound` | Sound page | neutral | Sound or audio page. |
| `share` | Shares | neutral | Direct shares and DMs. |
| `other` | Other / external | ember | External or unknown; a high share raises the fraud score. |

#### SnapshotSource

How a View Ledger snapshot was captured. Const: `SNAPSHOT_SOURCES`, labels: `SNAPSHOT_SOURCE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `platform_api` | Platform API | mint | Pulled from the TikTok / Instagram / YouTube API. |
| `creator_screenshot` | Screenshot proof | info | Creator-supplied screenshot checked by the fraud model (fallback). |
| `manual_adjust` | Manual adjustment | ember | Ops corrected the count after a dispute. |

#### SnapshotFlag

Anomaly markers on a View Ledger snapshot. Const: `SNAPSHOT_FLAGS`, labels: `SNAPSHOT_FLAG_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `spike` | Spike | ember | Hourly views far above baseline. |
| `plateau` | Plateau | info | Views stopped growing. |
| `bot_pattern` | Bot pattern | rose | Step-function curve typical of bought views. |
| `geo_shift` | Geo shift | ember | Audience country mix changed abruptly. |
| `reconciled` | Reconciled | mint | Reported and verified counts agree after review. |

#### ExclusionCause

Why views were excluded from the verified count (View Ledger). Always shown in plain words. Const: `EXCLUSION_CAUSES`, labels: `EXCLUSION_CAUSE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `bot_pattern` | Bot pattern | rose | Step-function curve typical of bought views. |
| `cap_clustering` | Cap clustering | rose | Views snapped to the per-video cap. |
| `duplicate` | Duplicate views | ember | The platform counted the same viewers twice, or a repost double-counted. |
| `geo_outlier` | Audience outside the target region | ember | Views from outside the target regions of the bounty. |
| `removed_post` | Post removed | neutral | The post was deleted before the window closed. |
| `platform_adjustment` | Platform adjustment | info | The platform itself revised its count (spam filtering). |


### Attribution

#### ConversionKind

Funnel event after a view. Const: `CONVERSION_KINDS`, labels: `CONVERSION_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `install` | Install | info | App installed (first launch). |
| `trial` | Trial started | accent | Free trial started. |
| `paid` | Paid subscription | mint | First paid period, or trial converted to paid. |

#### ConversionSource

How a conversion was attributed. CPA pays only on link and code. Const: `CONVERSION_SOURCES`, labels: `CONVERSION_SOURCE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `link` | Tracked link | mint | Deterministic: a per-creator deferred deep link. Payable. |
| `code` | Promo code | mint | Deterministic: a promo or offer code redeemed. Payable. |
| `mmp` | MMP match | info | Matched by AppsFlyer / Adjust / Branch. Reported, not paid. |
| `survey` | Survey answer | info | "How did you hear about us?" Reported, not paid. |
| `modelled` | Modelled | violet | Statistical estimate of unattributed lift. Reported separately, never paid. |

#### ConversionConfidence

Confidence label shown next to every conversion count. Const: `CONVERSION_CONFIDENCES`, labels: `CONVERSION_CONFIDENCE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `deterministic` | Tracked | mint | Link or code. Counts toward tracked funnel and CPA pay. |
| `matched` | Matched | info | MMP match. Estimated funnel. |
| `self_reported` | Self-reported | info | Survey answer. Estimated funnel. |
| `modelled` | Modelled | violet | Estimate. Estimated funnel. |

#### ConversionStatus

Settlement state of a conversion batch. Const: `CONVERSION_STATUSES`, labels: `CONVERSION_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `pending` | Pending | info | Inside its clearing window (install 24h, trial 72h, paid 168h). |
| `cleared` | Cleared | mint | Cleared; CPA pay (if payable) is on the ledger. |
| `rejected` | Rejected | rose | Duplicate, fraud or not attributable. |
| `refunded` | Refunded | rose | Refunded inside the window; CPA reversed. |

#### AttributionLinkStatus

State of a per-creator tracking link. Const: `ATTRIBUTION_LINK_STATUSES`, labels: `ATTRIBUTION_LINK_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `active` | Active | mint | Resolving and attributing. |
| `paused` | Paused | ember | Paused with the bounty. |
| `expired` | Expired | neutral | Past the CPA window; still redirects, no longer attributes pay. |

#### OfferCodeStatus

State of a code in the offer-code pool. Const: `OFFER_CODE_STATUSES`, labels: `OFFER_CODE_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `available` | Available | mint | Unassigned and ready. |
| `assigned` | Assigned | accent | Assigned to a creator and bounty. |
| `exhausted` | Exhausted | ember | Hit its redemption cap. |
| `expired` | Expired | neutral | Past its validity window. |
| `retired` | Retired | neutral | Taken out of rotation. |

#### RcEventType

RevenueCat webhook event types we ingest (lowercase mirror of the RevenueCat names). Const: `RC_EVENT_TYPES`, labels: `RC_EVENT_TYPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `initial_purchase` | Initial purchase | accent | First purchase; with period_type trial this is a trial start. |
| `renewal` | Renewal | mint | Renewal; with is_trial_conversion true this is trial to paid. |
| `cancellation` | Cancellation | ember | Cancelled or refunded. |
| `uncancellation` | Un-cancellation | info | Resubscribed before expiry. |
| `expiration` | Expiration | neutral | Subscription ended. |
| `billing_issue` | Billing issue | ember | Payment failed. |
| `product_change` | Product change | neutral | Plan change. |
| `non_renewing_purchase` | One-time purchase | neutral | Non-subscription purchase. |
| `test` | Test | neutral | Webhook test event. |

#### PeriodType

RevenueCat period_type. Const: `PERIOD_TYPES`, labels: `PERIOD_TYPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `trial` | Trial | accent | Free trial period. |
| `intro` | Intro | info | Introductory price period. |
| `normal` | Normal | mint | Full price period. |

#### RcMatchStatus

How a RevenueCat event was matched to a creator. Const: `RC_MATCH_STATUSES`, labels: `RC_MATCH_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `matched` | Matched | mint | Matched to a conversion by subscriber attributes or offer code. |
| `unmatched` | Unmatched | ember | No flowd creator attributes or code on the event. |
| `duplicate` | Duplicate | neutral | Seen before (idempotent redelivery). |
| `ignored` | Ignored | neutral | Test or irrelevant event type. |


### Ads

#### AdKind

Type of promoted post. Const: `AD_KINDS`, labels: `AD_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `spark_ad` | Spark Ad | accent | TikTok Spark Ad using the creator's post and a Spark code. |
| `partnership_ad` | Partnership ad | accent | Meta partnership ad using a creator permission. |

#### AdStatus

Winner promotion lifecycle. See state machine. Const: `AD_STATUSES`, labels: `AD_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `requested` | Permission requested | info | Asked the creator for a Spark code or partnership permission. |
| `authorised` | Authorised | accent | Code or permission received; ready to launch. |
| `live` | Live | mint | Running as a paid ad. Ad commission accrues for 60 days. |
| `paused` | Paused | ember | Paused by the brand. |
| `fatigued` | Fatigued | ember | Results dropped 30% from peak; refresh suggested. |
| `ended` | Ended | neutral | Stopped by the brand. |
| `expired` | Expired | neutral | Spark code or rights term ended; ads stopped automatically. |
| `declined` | Declined | rose | The creator declined the permission request. |


### Market

#### OfferKind

Kind of an offer. Const: `OFFER_KINDS`, labels: `OFFER_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `invite` | Invite | info | Brand invites a creator to an existing open bounty. |
| `direct` | Direct offer | sun | Brand buys from a rate card at the ask (or negotiates). |
| `rebuy` | Re-buy | violet | Brand pays the creator of a winner for new hooks or variants. |

#### OfferStatus

Offer / negotiation state: who has the ball. Const: `OFFER_STATUSES`, labels: `OFFER_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `awaiting_creator` | Awaiting creator | info | The creator needs to accept, counter or decline. |
| `awaiting_brand` | Awaiting brand | info | The creator countered; the brand needs to respond. |
| `accepted` | Accepted | mint | Agreed; a private direct bounty is funded from the brand wallet. |
| `declined` | Declined | rose | Declined. |
| `expired` | Expired | neutral | No response in 7 days. |
| `withdrawn` | Withdrawn | neutral | Withdrawn by the sender. |
| `completed` | Completed | mint | Video delivered, approved and paid. |

#### OfferMessageType

Message types in a negotiation thread. Const: `OFFER_MESSAGE_TYPES`, labels: `OFFER_MESSAGE_TYPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `offer` | Offer | sun | Opening offer with amount and rights. |
| `counter` | Counter | ember | Counter-offer (max 3 rounds). |
| `message` | Message | neutral | Free text. |
| `accept` | Accept | mint | Accepted the latest terms. |
| `decline` | Decline | rose | Declined. |
| `withdraw` | Withdraw | neutral | Withdrawn. |
| `system` | System | neutral | System note (escrow funded, expiry reminder). |

#### AuthorRole

Who wrote a message. Const: `AUTHOR_ROLES`, labels: `AUTHOR_ROLE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `brand` | Brand | info | A brand member. |
| `creator` | Creator | accent | The creator. |
| `system` | System | neutral | flowd. |

#### AuctionStatus

Sealed-bid auction lifecycle. Const: `AUCTION_STATUSES`, labels: `AUCTION_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `scheduled` | Scheduled | info | Not open yet. |
| `open` | Open | mint | Accepting sealed bids. Bidders see only their own bid. |
| `closed` | Closed | info | Bids sealed; resolving. |
| `awarded` | Awarded | sun | The top bids won and pay the uniform clearing price (highest losing bid, or the reserve). |
| `no_bids` | No bids | neutral | Closed with no valid bids. |
| `cancelled` | Cancelled | rose | Cancelled by the creator or Ops before it closed. |

#### BidStatus

State of a sealed bid. Const: `BID_STATUSES`, labels: `BID_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `sealed` | Sealed | info | Placed; hidden from other bidders. |
| `won` | Won | mint | A winning bid; pays the clearing price. |
| `lost` | Lost | neutral | Outbid. |
| `withdrawn` | Withdrawn | neutral | Withdrawn before close. |

#### SpecStatus

Spec Market listing state. Const: `SPEC_STATUSES`, labels: `SPEC_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `draft` | Draft | neutral | Uploaded by the creator, not submitted. |
| `scoring` | Scoring | info | QA and checklist scoring running. |
| `first_refusal` | First refusal | ember | Released from a bounty; the original brand has 7 days of first refusal. |
| `listed` | Listed | mint | Available to license. |
| `licensed` | Licensed | sun | Licensed at least once. |
| `withdrawn` | Withdrawn | neutral | Taken down by the creator. |

#### SpecSource

Where a spec video came from. Const: `SPEC_SOURCES`, labels: `SPEC_SOURCE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `creator_upload` | Creator upload | accent | Made speculatively by the creator. |
| `released_from_bounty` | Released from a bounty | violet | Approved but unused for 30 days. |

#### RateCardStatus

Creator availability on their rate card. Const: `RATE_CARD_STATUSES`, labels: `RATE_CARD_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `open` | Open to offers | mint | Accepting direct offers. |
| `limited` | Limited slots | ember | A few slots left this month. |
| `paused` | Paused | neutral | Not taking offers. |


### Rights

#### RightsScope

What a rights grant covers. Const: `RIGHTS_SCOPES`, labels: `RIGHTS_SCOPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `organic` | Organic posting | mint | Posting on the creator's own account. Always included. |
| `paid_ads` | Paid-ad usage | accent | Running the video as an ad. Default 90 days, renewable at 25% of base fee per 30 days. |
| `spark_code` | Spark code | accent | TikTok Spark authorization code (7/30/60/365 days). |
| `partnership_permission` | Partnership permission | accent | Meta partnership-ad permission. |
| `ai_likeness` | AI likeness | rose | Off by default; needs explicit separate consent. |

#### RightsGrantStatus

Rights grant lifecycle. Const: `RIGHTS_GRANT_STATUSES`, labels: `RIGHTS_GRANT_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `pending_permission` | Awaiting creator | info | Brand asked for a Spark code or partnership permission. |
| `active` | Active | mint | In force. |
| `expiring` | Expiring | ember | Ends within 30 days (alerts at 30, 14 and 7 days). |
| `renewal_requested` | Renewal requested | info | The brand asked to renew (25% of base fee per 30 days). |
| `expired` | Expired | neutral | Ended; the ad stops automatically. |
| `revoked` | Revoked | rose | Revoked for misuse by the creator or Ops. |


### Trust

#### VerificationStatus

State of an ID, age, business, tax or payout-method verification. Const: `VERIFICATION_STATUSES`, labels: `VERIFICATION_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `not_started` | Not started | neutral | Nothing submitted yet. |
| `pending` | Pending | info | Submitted; waiting on the provider or Ops. |
| `needs_info` | Needs info | ember | More information requested from the subject. |
| `verified` | Verified | mint | Verified. |
| `rejected` | Rejected | rose | Could not be verified. |
| `expired` | Expired | ember | Verification lapsed and must be renewed. |

#### VerificationKind

What is being verified. Const: `VERIFICATION_KINDS`, labels: `VERIFICATION_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `identity` | Identity | neutral | Government ID + liveness (Stripe Identity style; mocked). |
| `age` | Age (18+) | neutral | Date of birth check; creators must be 18+. |
| `business` | Business | neutral | Brand legal entity check for the Verified brand badge. |
| `tax` | Tax | neutral | W-9 / W-8BEN completeness. |
| `payout_method` | Payout method | neutral | Bank account or debit card ownership. |

#### BrandBand

Brand reliability band shown on the Brand Scorecard. Const: `BRAND_BANDS`, labels: `BRAND_BAND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `new` | New | neutral | Fewer than 10 decisions; not enough history. Shown as "New brand", never a misleading figure. |
| `excellent` | Excellent | mint | Reliability 90 or above. |
| `good` | Good | accent | 75 to 89. |
| `fair` | Fair | ember | 60 to 74. |
| `poor` | Poor | rose | Under 60. |

#### BrandBadge

Badges on a Brand Scorecard. Const: `BRAND_BADGES`, labels: `BRAND_BADGE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `fast_decisions` | Fast decisions | mint | Median decision time under 24 hours. |
| `funded_always` | Always funded | mint | Every live bounty fully escrowed. |
| `pays_on_time` | Pays on time | mint | No late top-ups on commissions or direct offers. |
| `fair_reviews` | Fair reviews | mint | Rejections rarely overturned on appeal. |
| `runs_what_it_approves` | Runs what it approves | mint | Over 90% of approved work is posted or used. |

#### DisputeKind

What a dispute is about. Const: `DISPUTE_KINDS`, labels: `DISPUTE_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `view_count` | View count | info | The creator disputes the verified view count. |
| `flagged_botting` | Flagged as bot views | ember | The creator disputes a fraud flag. |
| `late_payment` | Late payment | ember | A payout or commission is late. |
| `rights_misuse` | Rights misuse | rose | Use of a video beyond the Rights Card. |
| `wrong_attribution` | Wrong attribution | info | A conversion was or was not credited. |
| `rejection_appeal` | Rejection appeal | ember | One appeal per rejection; Ops decides within 72 hours. |
| `held_funds` | Held funds | ember | Funds are held and the creator disputes the hold. |
| `other` | Other | neutral | Anything else. |

#### DisputeStatus

Dispute lifecycle. Const: `DISPUTE_STATUSES`, labels: `DISPUTE_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `open` | Open | info | Opened; a human replies within 24 hours. |
| `evidence_requested` | Evidence requested | ember | Ops asked a party for evidence. |
| `under_review` | Under review | accent | Ops is deciding. |
| `resolved` | Resolved | mint | Decided; see the outcome. |
| `withdrawn` | Withdrawn | neutral | Withdrawn by the opener. |

#### DisputeOutcome

Result of a resolved dispute, from the opener's side. Const: `DISPUTE_OUTCOMES`, labels: `DISPUTE_OUTCOME_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `upheld` | Upheld | mint | In the opener's favour. |
| `partially_upheld` | Partly upheld | info | Partly in the opener's favour (amount adjusted). |
| `rejected` | Rejected | rose | Not upheld; reasons and evidence shared. |

#### ScamReason

Scam Shield report reasons. Const: `SCAM_REASONS`, labels: `SCAM_REASON_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `pay_to_join` | Pay to join | rose | Asks creators to pay to take part. |
| `off_platform_chat` | Off-platform chat | rose | Pushes the conversation to WhatsApp, Telegram or email. |
| `fake_brand` | Fake brand | rose | Impersonates a brand. |
| `burner_account_demand` | Burner-account demand | rose | Demands a dedicated or fresh account. |
| `no_escrow_claim` | Claims unfunded work is funded | rose | Says a bounty is funded without a Funded badge. |
| `suspicious_link` | Suspicious link | rose | Phishing or malware link. |
| `harassment` | Harassment | rose | Abusive messages. |
| `other` | Other | neutral | Anything else. |

#### ReportTargetKind

What a scam report points at. Const: `REPORT_TARGET_KINDS`, labels: `REPORT_TARGET_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `brand` | Brand | neutral | A brand workspace. |
| `bounty` | Bounty | neutral | A bounty. |
| `creator` | Creator | neutral | A creator. |
| `message` | Message | neutral | A chat message. |
| `offer` | Offer | neutral | An offer. |

#### ReportStatus

Scam report triage state. Const: `REPORT_STATUSES`, labels: `REPORT_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `new` | New | info | Not triaged. |
| `triaged` | Triaged | accent | Looked at by Ops. |
| `confirmed` | Confirmed | rose | Confirmed as a scam. |
| `actioned` | Actioned | neutral | Account suspended or content removed. |
| `dismissed` | Dismissed | neutral | Not a scam. |

#### FraudFlagStatus

Fraud queue state for a flagged post. Const: `FRAUD_FLAG_STATUSES`, labels: `FRAUD_FLAG_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `open` | Open | ember | Waiting for a human review. |
| `monitoring` | Monitoring | info | Watching further snapshots. |
| `cleared` | Cleared | mint | False positive; money released. |
| `confirmed` | Confirmed | rose | Fraud confirmed; invalid views reversed. |

#### ComplianceCheckType

Checks in a post-level compliance audit. Const: `COMPLIANCE_CHECK_TYPES`, labels: `COMPLIANCE_CHECK_TYPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `caption_disclosure` | Caption #ad | neutral | The caption starts with the required disclosure. |
| `spoken_disclosure` | Spoken disclosure | neutral | Disclosure is said in the video. |
| `onscreen_disclosure` | On-screen disclosure | neutral | Disclosure is visible in the video. |
| `platform_label` | Platform branded-content label | neutral | The platform paid-partnership toggle is on. |
| `music_licence` | Music licence | neutral | Commercial-library audio only. |
| `banned_claims` | Banned claims | neutral | No disallowed claims in the posted caption or video. |
| `ai_label` | AI label | neutral | AI content labelled. |
| `tracking_link` | Tracking link | neutral | The tracked link or code is present. |

#### ComplianceResult

Outcome of a compliance check. Const: `COMPLIANCE_RESULTS`, labels: `COMPLIANCE_RESULT_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `pass` | Pass | mint | Compliant. |
| `warn` | Warning | ember | Minor issue; fix in the caption. |
| `fail` | Fail | rose | Failed; blocks settlement until fixed. |
| `pending` | Pending | info | Not checked yet. |

#### TaxForm

Tax form a creator files. Const: `TAX_FORMS`, labels: `TAX_FORM_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `w9` | W-9 | neutral | US persons. |
| `w8ben` | W-8BEN | neutral | Non-US persons. |

#### TaxStatus

Tax profile state (just-in-time at first approval). Const: `TAX_STATUSES`, labels: `TAX_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `none` | Not needed yet | neutral | No approval yet. |
| `requested` | Requested | ember | First approval happened; the form is requested before the first payout. |
| `submitted` | Submitted | info | Submitted; checking. |
| `verified` | Verified | mint | Verified. |
| `rejected` | Rejected | rose | Mismatch (name / TIN); resubmit. |
| `expired` | Expired | ember | W-8BEN older than 3 years. |

#### TaxDocKind

Tax documents. Const: `TAX_DOC_KINDS`, labels: `TAX_DOC_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `w9` | W-9 | neutral | Collected form. |
| `w8ben` | W-8BEN | neutral | Collected form. |
| `form_1099_nec` | 1099-NEC | neutral | Issued to US creators above the threshold ($2,000 for 2026). |

#### TaxDocStatus

Tax document state. Const: `TAX_DOC_STATUSES`, labels: `TAX_DOC_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `draft` | Draft | neutral | Being prepared. |
| `issued` | Issued | mint | Available to download. |
| `corrected` | Corrected | ember | Re-issued after a correction. |
| `void` | Void | neutral | Voided. |

#### FraudSignal

Signals that make up a fraud score. Max points in CONSTANTS.fraud.signals. Const: `FRAUD_SIGNALS`, labels: `FRAUD_SIGNAL_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `view_spike_no_engagement` | View spike, no engagement | rose | Views spike with no likes or comments. |
| `cap_clustering` | Cap clustering | rose | Earnings cluster just under the per-video cap. |
| `bought_views_pattern` | Bought-views pattern | rose | Step-function curve and "other" traffic. |
| `geo_mismatch` | Geo mismatch | ember | Audience outside the target region. |
| `view_to_follower_outlier` | View-to-follower outlier | ember | Views far above the follower count. |
| `new_account` | New account | ember | Account younger than 30 days. |
| `duplicate_hash` | Duplicate video | rose | Perceptual-hash match. |
| `engagement_anomaly` | Engagement anomaly | ember | Engagement ratios out of range. |
| `traffic_source_anomaly` | Traffic-source anomaly | ember | Most views from external sources. |
| `curve_shape` | Curve shape | ember | No natural decay. |

#### FraudBand

Fraud score band. Const: `FRAUD_BANDS`, labels: `FRAUD_BAND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `clean` | Clean | mint | Score 0 to 19. Auto-clears. |
| `watch` | Watch | info | Score 20 to 39. Auto-clears; logged. |
| `review` | Review | ember | Score 40 to 69. Held for a human review within 24 hours. |
| `high` | High risk | rose | Score 70 or above. Auto-held and queued for Ops. |

#### CurveShape

Shape of a view curve (fraud evidence). Const: `CURVE_SHAPES`, labels: `CURVE_SHAPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `organic` | Organic | mint | Fast rise, natural decay over 24 to 48 hours. |
| `spiky` | Spiky | ember | One or two large spikes with little in between. |
| `flat` | Flat | ember | Almost constant hourly views, no decay. |
| `stepped` | Stepped | rose | Step function: bought-views signature. |

#### TaxEntityType

Tax classification on a W-9 (self-declared). Const: `TAX_ENTITY_TYPES`, labels: `TAX_ENTITY_TYPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `individual` | Individual | neutral | Individual or sole proprietor. |
| `llc` | LLC | neutral | Limited liability company. |
| `s_corp` | S corporation | neutral | S corporation. |
| `c_corp` | C corporation | neutral | C corporation. |
| `partnership` | Partnership | neutral | Partnership. |

#### VerificationReason

Reason codes Ops uses when a verification is not approved. Const: `VERIFICATION_REASONS`, labels: `VERIFICATION_REASON_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `document_unreadable` | Document unreadable | ember | The photo is blurry or cut off. |
| `name_mismatch` | Name mismatch | ember | The ID name does not match the account or tax name. |
| `underage` | Under 18 | rose | Creators must be 18 or older. |
| `selfie_mismatch` | Selfie mismatch | rose | The liveness selfie does not match the ID. |
| `business_not_found` | Business not found | ember | No matching legal entity for the brand. |
| `bank_name_mismatch` | Bank name mismatch | ember | The account holder differs from the verified creator. |
| `tin_mismatch` | TIN mismatch | ember | The taxpayer number does not match the name. |
| `other` | Other | neutral | Another reason, explained in the note. |

#### DisputeAction

Entries in a dispute timeline. Const: `DISPUTE_ACTIONS`, labels: `DISPUTE_ACTION_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `opened` | Opened | info | The dispute was opened. |
| `reply` | Reply | neutral | A person replied. |
| `evidence_requested` | Evidence requested | ember | Ops asked for evidence. |
| `evidence_added` | Evidence added | info | A party added evidence. |
| `review_started` | Review started | accent | Ops started the review. |
| `decision` | Decision | mint | Ops decided. |
| `withdrawn` | Withdrawn | neutral | The opener withdrew. |


### Growth

#### DropStatus

Daily Drop state. One drop a day at 16:00 UTC; spots_left is a true count. Const: `DROP_STATUSES`, labels: `DROP_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `upcoming` | Upcoming | info | Pre-drop: countdown, no claims yet. |
| `live` | Live | ember | Open for claims; inventory is real. |
| `sold_out` | Sold out | neutral | Every spot claimed. |
| `closed` | Closed | neutral | Claim window ended with spots unclaimed (released back to the open feed). |

#### TournamentStatus

Tournament lifecycle. Const: `TOURNAMENT_STATUSES`, labels: `TOURNAMENT_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `announced` | Announced | info | Visible; entries not open. |
| `open` | Open | mint | Taking entries. |
| `live` | Live | ember | Rounds running. |
| `judging` | Judging | accent | Results being verified. |
| `complete` | Complete | neutral | Prizes paid. |
| `cancelled` | Cancelled | rose | Cancelled. |

#### TournamentFormat

How a tournament is structured. Const: `TOURNAMENT_FORMATS`, labels: `TOURNAMENT_FORMAT_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `bracket` | Bracket | accent | Head-to-head hook battles. |
| `leaderboard` | Leaderboard | accent | Ranked by verified results over the period. |
| `hook_battle` | Hook battle | accent | Best Hook Score and retention on the same brief. |

#### EntryStatus

Tournament entry state. Const: `ENTRY_STATUSES`, labels: `ENTRY_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `entered` | Entered | info | In. |
| `advancing` | Advancing | mint | Through to the next round. |
| `eliminated` | Eliminated | neutral | Out. |
| `won` | Won | sun | Placed in the prizes. |
| `disqualified` | Disqualified | rose | Rule breach or fraud. |

#### CrewRole

Role in a crew. Const: `CREW_ROLES`, labels: `CREW_ROLE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `lead` | Lead | sun | Gold or above; runs the crew. |
| `co_lead` | Co-lead | accent | Helps run the crew. |
| `member` | Member | neutral | Member. |

#### StreakStatus

Weekly streak state. Const: `STREAK_STATUSES`, labels: `STREAK_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `new` | New | neutral | No streak yet. |
| `active` | Active | mint | Posted this ISO week or still has the week to go. |
| `frozen` | Frozen | info | A banked freeze covered a missed week. |
| `resting` | Resting | info | A declared rest week; the streak is preserved. |
| `broken` | Broken | neutral | A week was missed with no freeze or rest. No guilt copy. |

#### WeekOutcome

What happened in a streak week. Const: `WEEK_OUTCOMES`, labels: `WEEK_OUTCOME_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `posted` | Posted | mint | At least one post. |
| `freeze_used` | Freeze used | info | A banked freeze covered the week. |
| `rest` | Rest week | info | Declared in advance; streak preserved, week not counted. |
| `missed` | Missed | neutral | No post, no freeze, no rest. |

#### LeaderboardMetric

What a leaderboard ranks. Const: `LEADERBOARD_METRICS`, labels: `LEADERBOARD_METRIC_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `earnings` | Earnings | mint | Cleared earnings in the week. |
| `conversion_rate` | Conversion rate | accent | Installs per 1,000 verified views. |
| `score_accuracy` | Score accuracy | violet | How close the creator's Flow Score band predicted real results. |

#### LeaderboardZone

Cohort zone. No demotion zone exists. Const: `LEADERBOARD_ZONES`, labels: `LEADERBOARD_ZONE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `promotion` | Promotion zone | mint | Top 5: moves up to the next cohort next week. |
| `steady` | Steady | neutral | Stays in this cohort. |

#### ReferralKind

Who is referring whom. Const: `REFERRAL_KINDS`, labels: `REFERRAL_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `creator` | Creator referral | accent | A creator invites a creator. |
| `brand` | Brand referral | info | A person refers a brand. |
| `agency` | Agency partner | violet | An agency refers brands (12-month fee share). |

#### ReferralStatus

Referral progress. Const: `REFERRAL_STATUSES`, labels: `REFERRAL_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `invited` | Invited | info | Invite sent. |
| `joined` | Joined | accent | Signed up. |
| `first_dollar` | First dollar | mint | Referee's first cleared earnings. |
| `earning` | Earning | mint | Reward share running (90 days or 12 months). |
| `complete` | Complete | neutral | Reward window ended or cap reached. |
| `expired` | Expired | neutral | Invite expired unused. |

#### LessonTopic

flowd Academy topics (free, five minutes or less, never required). Const: `LESSON_TOPICS`, labels: `LESSON_TOPIC_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `first_video` | First video in 15 minutes | accent | Hooks and getting started. |
| `briefs_and_rights` | Reading a brief and a Rights Card | accent | Briefs and licences. |
| `usage_rights` | Usage rights and what to charge | accent | Whitelisting, paid usage, renewals. |
| `contract_red_flags` | Contract red flags | rose | Perpetual rights, pay-to-join, burner accounts. |
| `platform_rules` | Platform rules and #ad | accent | Originality and disclosure. |
| `taxes` | Taxes: W-9 and 1099 | sun | Not tax advice. |
| `scams` | Spotting scams | rose | Scam Shield. |
| `rate_cards` | Rate cards and negotiating | sun | Pricing your work. |
| `analytics` | Reading analytics and retention curves | info | Retention and funnel. |
| `sustainable_cadence` | Sustainable cadence and burnout | mint | Pace and rest. |

#### LessonBlockKind

Kind of a lesson content block. Const: `LESSON_BLOCK_KINDS`, labels: `LESSON_BLOCK_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `text` | Text | neutral | Body copy. |
| `tip` | Tip | accent | A practical tip. |
| `warning` | Watch out | ember | A pitfall. |
| `example` | Example | info | A worked example. |
| `steps` | Steps | neutral | A numbered list (one step per line in body). |

#### LessonStatus

A creator's progress on a lesson. Const: `LESSON_STATUSES`, labels: `LESSON_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `not_started` | Not started | neutral | Not opened. |
| `in_progress` | In progress | info | Started. |
| `completed` | Completed | mint | Quiz passed; badge awarded. |

#### TrendKind

Trend radar item kind. Const: `TREND_KINDS`, labels: `TREND_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `format` | Format | accent | A video format. |
| `hook` | Hook | accent | A hook pattern. |
| `topic` | Topic | accent | A topic or angle. |
| `sound` | Sound | ember | A trending sound. Not licensed for ads; flag on promotion. |

#### TrendDirection

Direction of a trend. Const: `TREND_DIRECTIONS`, labels: `TREND_DIRECTION_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `rising` | Rising | mint | Growing week on week. |
| `steady` | Steady | neutral | Flat. |
| `fading` | Fading | ember | Declining; flagged for refresh. |

#### BadgeId

Creator badges. They mirror real skill or earnings milestones, never invented ones. Const: `BADGE_IDS`, labels: `BADGE_ID_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `founding_creator` | Founding creator | sun | One of the first 200 creators. |
| `first_dollar` | First dollar | mint | First cleared earnings. |
| `streak_4` | 4-week streak | mint | Posted in 4 consecutive weeks. |
| `streak_8` | 8-week streak | mint | Posted in 8 consecutive weeks. |
| `streak_12` | 12-week streak | sun | Posted in 12 consecutive weeks. |
| `academy_graduate` | Academy graduate | accent | Completed all 10 Academy lessons. |
| `crew_lead` | Crew lead | accent | Leads a crew. |
| `tournament_winner` | Tournament winner | sun | Placed in a tournament. |
| `top_10_week` | Top 10 of the week | sun | Top 10 on a weekly board. |
| `hook_master` | Hook master | violet | Hook Score A on five straight submissions. |
| `id_verified` | ID verified | mint | Identity verified. |
| `always_on_time` | Always on time | mint | 10 approved posts, all resubmitted and posted on time. |
| `million_views` | 1M verified views | sun | One million verified views. |
| `first_trial` | First trial | mint | First trial started through your link or code. |

#### WrappedPeriod

Wrapped period. Const: `WRAPPED_PERIODS`, labels: `WRAPPED_PERIOD_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `month` | Month | accent | Monthly recap. |
| `year` | Year | sun | Yearly Wrapped. |

#### ProofKind

What a public proof page shows. Const: `PROOF_KINDS`, labels: `PROOF_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `payout` | Payout | mint | A payout. |
| `month` | Month | mint | A month's cleared earnings. |
| `tier_up` | Tier up | sun | A tier-up. |
| `wrapped` | Wrapped | sun | A Wrapped recap. |

#### LeaderboardScope

Which population a leaderboard ranks. Const: `LEADERBOARD_SCOPES`, labels: `LEADERBOARD_SCOPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `cohort` | Peer cohort | accent | About 30 creators in the same tier and niche, with a promotion zone. |
| `niche` | Niche board | info | Public weekly board for one niche. |
| `global` | Global board | sun | Public weekly board across all creators. |

#### WrappedCardKind

A story card in Wrapped. Const: `WRAPPED_CARD_KINDS`, labels: `WRAPPED_CARD_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `earnings` | Earnings | mint | Cleared earnings in the period. |
| `views` | Views | info | Verified views delivered. |
| `best_post` | Best post | accent | The post with the highest earnings. |
| `winning_hook` | Winning hook | violet | The hook that drove the most trials. |
| `trials` | Trials started | mint | Trials started through the creator's links and codes. |
| `streak` | Streak | mint | Weekly streak and freezes. |
| `tier` | Tier | sun | Tier and progress. |
| `top_brand` | Top brand | info | The brand the creator worked with most. |
| `typical` | Typical creator | neutral | The tier median beside the creator's number. Always included. |
| `share` | Share | accent | The closing share card. |


### Platform

#### NotificationKind

Notification types (creator, brand and admin). Const: `NOTIFICATION_KINDS`, labels: `NOTIFICATION_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `approval` | Approved | mint | A submission was approved. |
| `changes_requested` | Changes requested | ember | Timecoded feedback arrived. |
| `rejection` | Not approved | rose | Rejected with reason code and evidence. |
| `appeal_decided` | Appeal decided | info | Ops decided an appeal. |
| `post_live` | Views counting | info | A post entered its 72-hour window. |
| `views_milestone` | Views milestone | info | Batched milestone, not a vanity ping. |
| `cash_event` | You earned | mint | "You just earned +$24": a cash event. |
| `payout_cleared` | Cleared | mint | Earnings cleared to the Wallet. |
| `payout_paid` | Payout sent | mint | A payout is on its way or arrived. |
| `payout_held` | Payout held | ember | A hold with a named reason. |
| `tier_up` | Tier up | sun | A new tier. |
| `streak_milestone` | Streak milestone | mint | A streak milestone. Never a guilt reminder. |
| `streak_freeze_used` | Freeze used | info | A banked freeze covered a week. |
| `drop_live` | Daily Drop is live | ember | The 16:00 UTC drop is live. |
| `drop_reminder` | Drop soon | info | Opt-in reminder before the drop. |
| `offer_received` | New offer | sun | A direct offer or invite arrived. |
| `offer_countered` | Counter-offer | ember | The other side countered. |
| `offer_accepted` | Offer accepted | mint | An offer was accepted. |
| `tournament_update` | Tournament update | info | Round results or prizes. |
| `crew_invite` | Crew invite | info | Invited to a crew. |
| `rights_expiring` | Rights expiring | ember | A licence ends in 30, 14 or 7 days. |
| `rights_renewed` | Rights renewed | mint | A licence was renewed; a renewal fee is coming. |
| `fatigue_alert` | Fatigue alert | ember | A winner is decaying. |
| `review_waiting` | Review waiting | info | Submissions are waiting in the queue. |
| `review_sla_warning` | Review SLA | ember | A submission is stale or about to breach 72 hours. |
| `bounty_filled` | Bounty filled | mint | A bounty filled. |
| `bounty_funded` | Bounty funded | mint | Escrow is funded; the bounty is live. |
| `funding_needed` | Funding needed | ember | Wallet is short for a bounty or a commission. |
| `auto_approve_paused` | Auto-approve paused | ember | A rule paused after a fraud event or spot-check failure. |
| `ad_live` | Promoted | accent | A post is running as an ad. |
| `dispute_update` | Dispute update | info | A reply or decision on a dispute. |
| `tax_info_needed` | Tax info needed | ember | Add a W-9 to release a payout. |
| `scam_warning` | Scam warning | rose | A contextual Scam Shield warning. |
| `flo_tip` | Flo tip | violet | A tip from Flo. |
| `academy_badge` | Badge earned | accent | An Academy lesson badge. |
| `referral_joined` | Referral joined | mint | Someone you invited joined. |
| `system_notice` | Notice | neutral | Product or policy notice. |

#### NotificationPriority

Delivery priority (quiet hours batch non-cash items). Const: `NOTIFICATION_PRIORITIES`, labels: `NOTIFICATION_PRIORITY_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `cash` | Cash event | mint | Delivered immediately outside quiet hours; batched inside them. |
| `normal` | Normal | neutral | Standard. |
| `digest` | Digest | info | Batched into a daily or weekly digest. |

#### IntegrationKind

Brand integrations (adapter + mock in this build). Const: `INTEGRATION_KINDS`, labels: `INTEGRATION_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `revenuecat` | RevenueCat | neutral | Webhook ingest for trials and revenue. |
| `appsflyer` | AppsFlyer | neutral | MMP. |
| `adjust` | Adjust | neutral | MMP. |
| `branch` | Branch | neutral | MMP. |
| `meta_ads` | Meta Ads | neutral | Partnership-ad permissions and ad accounts. |
| `tiktok_ads` | TikTok Ads | neutral | Spark codes and ad accounts. |
| `slack` | Slack | neutral | Approvals, digests and alerts. |
| `zapier` | Zapier | neutral | Webhook-based automations. |
| `app_store_connect` | App Store Connect | neutral | Listing metadata and offer codes. |

#### IntegrationStatus

Integration health. Const: `INTEGRATION_STATUSES`, labels: `INTEGRATION_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `connected` | Connected | mint | Working. |
| `needs_attention` | Needs attention | ember | Degraded: stale sync or expiring token. |
| `disconnected` | Not connected | neutral | Not set up. |
| `error` | Error | rose | Failing. |

#### ApiScope

API key scopes. Const: `API_SCOPES`, labels: `API_SCOPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `read` | Read | neutral | Read bounties, submissions, metrics. |
| `write` | Write | accent | Create drafts, comment, decide submissions. Writes are drafts by default. |
| `financial` | Financial | sun | Fund, spend and pay. Separate scope and separate approval. |

#### KeyMode

API key mode. Const: `KEY_MODES`, labels: `KEY_MODE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `live` | Live | mint | Real money in production. |
| `test` | Test | info | Sandbox. |

#### WebhookStatus

Webhook endpoint health. Const: `WEBHOOK_STATUSES`, labels: `WEBHOOK_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `active` | Active | mint | Delivering. |
| `paused` | Paused | neutral | Paused by the brand. |
| `failing` | Failing | ember | Recent deliveries are failing and retrying. |
| `disabled` | Disabled | rose | Disabled after repeated failures. |

#### DeliveryStatus

Webhook delivery result. Const: `DELIVERY_STATUSES`, labels: `DELIVERY_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `delivered` | Delivered | mint | 2xx. |
| `failed` | Failed | rose | Non-2xx or timeout. |
| `retrying` | Retrying | ember | Backing off. |

#### WebhookEventType

Events brands can subscribe to. Const: `WEBHOOK_EVENT_TYPES`, labels: `WEBHOOK_EVENT_TYPE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `bounty_funded` | Bounty funded | neutral | Escrow fully funded. |
| `bounty_live` | Bounty live | neutral | Went live. |
| `bounty_filled` | Bounty filled | neutral | Budget fully reserved. |
| `bounty_ended` | Bounty ended | neutral | Ended. |
| `submission_created` | Submission created | neutral | A creator submitted. |
| `submission_approved` | Submission approved | neutral | Approved (manual or auto). |
| `submission_changes_requested` | Changes requested | neutral | Revision requested. |
| `submission_rejected` | Submission rejected | neutral | Rejected. |
| `post_live` | Post live | neutral | A post entered its window. |
| `post_window_closed` | Window closed | neutral | The 72-hour window closed. |
| `post_cleared` | Post cleared | neutral | Checks passed; earnings cleared. |
| `conversion_tracked` | Conversion tracked | neutral | An install, trial or paid conversion was attributed. |
| `ad_live` | Ad live | neutral | A promoted ad started. |
| `ad_fatigued` | Ad fatigued | neutral | Fatigue detected. |
| `rights_expiring` | Rights expiring | neutral | A licence ends soon. |
| `dispute_opened` | Dispute opened | neutral | A dispute was opened. |
| `invoice_paid` | Invoice paid | neutral | An invoice was paid. |
| `wallet_low` | Wallet low | neutral | Wallet below the auto top-up threshold. |

#### ActivityAction

Team activity log actions. Const: `ACTIVITY_ACTIONS`, labels: `ACTIVITY_ACTION_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `bounty_created` | Created a bounty | neutral | Logged when a teammate created a bounty. |
| `bounty_published` | Published a bounty | neutral | Logged when a teammate published a bounty. |
| `bounty_funded` | Funded a bounty | neutral | Logged when a teammate funded a bounty. |
| `bounty_paused` | Paused a bounty | neutral | Logged when a teammate paused a bounty. |
| `bounty_ended` | Ended a bounty | neutral | Logged when a teammate ended a bounty. |
| `submission_approved` | Approved a submission | neutral | Logged when a teammate approved a submission. |
| `submission_changes_requested` | Requested changes | neutral | Logged when a teammate requested changes. |
| `submission_rejected` | Rejected a submission | neutral | Logged when a teammate rejected a submission. |
| `rule_created` | Created an auto-approve rule | neutral | Logged when a teammate created an auto-approve rule. |
| `rule_enabled` | Enabled an auto-approve rule | neutral | Logged when a teammate enabled an auto-approve rule. |
| `rule_killed` | Used the kill switch | neutral | Logged when a teammate used the kill switch. |
| `member_invited` | Invited a teammate | neutral | Logged when a teammate invited a teammate. |
| `member_role_changed` | Changed a role | neutral | Logged when a teammate changed a role. |
| `member_removed` | Removed a teammate | neutral | Logged when a teammate removed a teammate. |
| `api_key_created` | Created an API key | neutral | Logged when a teammate created an API key. |
| `api_key_revoked` | Revoked an API key | neutral | Logged when a teammate revoked an API key. |
| `webhook_created` | Added a webhook | neutral | Logged when a teammate added a webhook. |
| `integration_connected` | Connected an integration | neutral | Logged when a teammate connected an integration. |
| `integration_disconnected` | Disconnected an integration | neutral | Logged when a teammate disconnected an integration. |
| `plan_changed` | Changed plan | neutral | Logged when a teammate changed plan. |
| `wallet_topped_up` | Topped up the wallet | neutral | Logged when a teammate topped up the wallet. |
| `auto_topup_changed` | Changed auto top-up | neutral | Logged when a teammate changed auto top-up. |
| `ad_promoted` | Promoted a winner | neutral | Logged when a teammate promoted a winner. |
| `rights_renewed` | Renewed rights | neutral | Logged when a teammate renewed rights. |
| `offer_sent` | Sent an offer | neutral | Logged when a teammate sent an offer. |
| `offer_accepted` | Accepted an offer | neutral | Logged when a teammate accepted an offer. |
| `dispute_responded` | Responded to a dispute | neutral | Logged when a teammate responded to a dispute. |
| `export_created` | Exported data | neutral | Logged when a teammate exported data. |
| `invoice_downloaded` | Downloaded an invoice | neutral | Logged when a teammate downloaded an invoice. |

#### RuleStatus

Auto-approve rule lifecycle (dry run is mandatory before enabling). Const: `RULE_STATUSES`, labels: `RULE_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `draft` | Draft | neutral | Being configured. |
| `dry_run` | Dry run | info | Shows what would have been approved among the last 50 submissions. |
| `active` | Active | mint | Auto-approving within guardrails; 10% spot-checked by a human. |
| `paused` | Paused | ember | Paused by the brand or by a guardrail. |
| `killed` | Killed | rose | Kill switch used; needs a fresh dry run to re-enable. |

#### TestPlanStatus

Hook x body x CTA test plan state. Const: `TEST_PLAN_STATUSES`, labels: `TEST_PLAN_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `draft` | Draft | neutral | Matrix being built. |
| `running` | Running | accent | Cells in production or live. |
| `complete` | Complete | mint | Results measured; winners picked. |
| `archived` | Archived | neutral | Archived. |

#### TestCellStatus

One cell (hook x body x CTA) of a plan. Const: `TEST_CELL_STATUSES`, labels: `TEST_CELL_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `planned` | Planned | neutral | Not briefed. |
| `briefed` | Briefed | info | Sent to a creator or bounty. |
| `submitted` | Submitted | info | Video received. |
| `live` | Live | accent | Posted and counting. |
| `measured` | Measured | mint | Results in. |

#### FatigueStatus

Fatigue alert lifecycle. Const: `FATIGUE_STATUSES`, labels: `FATIGUE_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `open` | Open | ember | A winner dropped 30% from its peak. |
| `acknowledged` | Acknowledged | info | Seen by the brand. |
| `refreshing` | Refreshing | accent | A refresh bounty was created. |
| `resolved` | Resolved | mint | Recovered or replaced. |
| `dismissed` | Dismissed | neutral | Dismissed. |

#### FatigueMetric

Which metric decayed. Const: `FATIGUE_METRICS`, labels: `FATIGUE_METRIC_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `trial_rate` | Trial-start rate | neutral | Trials per install. |
| `ctr` | Click-through | neutral | Clicks per impression (promoted ads). |
| `install_rate` | Installs per 1,000 views | neutral | Install yield. |

#### FloKind

Flo copilot output kinds. Const: `FLO_KINDS`, labels: `FLO_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `script` | Script | violet | Three script options for a format and brief. |
| `hook_rewrite` | Hook rewrite | violet | Rewrites a hook. |
| `brief_tldr` | Brief TL;DR | violet | Short brief summary. |
| `caption` | Caption | violet | Caption ideas with #ad. |
| `score_fix` | Score fix | violet | One-tap fixes for checklist misses. |
| `rate_advice` | Rate advice | violet | Rate-card suggestion with the market range. |
| `next_action` | Next action | violet | What to do next. |
| `bounty_draft` | Bounty draft | violet | Brief, hooks and pay drafted from an App Store page. |

#### FloSurface

Where Flo appears. Const: `FLO_SURFACES`, labels: `FLO_SURFACE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `studio` | Studio | neutral | Script and hook coach. |
| `bounty_detail` | Bounty detail | neutral | TL;DR. |
| `home` | Home | neutral | Next action. |
| `wallet` | Wallet | neutral | Explaining holds and ETAs. |
| `rate_card` | Rate card | neutral | Price advice. |
| `builder` | Bounty builder | neutral | Brand-side drafting. |
| `review` | Review | neutral | Brand-side review assist. |

#### ModelKind

The eight ML systems. Const: `MODEL_KINDS`, labels: `MODEL_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `video_understanding` | Video understanding | violet | Transcript, scenes, on-screen text, embeddings. |
| `hook_coach` | Hook coach | violet | On-device first-3-seconds checks. |
| `auto_qa` | Auto-QA | violet | Brief, disclosure, duplicate and moderation checks. |
| `fraud` | View-fraud detection | violet | Post view curves and account history to a risk score. |
| `creative_scorer` | Creative scorer | violet | Predicted views band and install rate. |
| `matching` | Matching | violet | Ranks the bounty feed for each creator. |
| `pricing` | Pricing model | violet | Suggested CPM and fill time. |
| `fatigue` | Fatigue detection | violet | Refresh alerts. |

#### ModelStage

How a model currently runs. Const: `MODEL_STAGES`, labels: `MODEL_STAGE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `heuristic` | Heuristic | neutral | Rules or checklist (day one). |
| `shadow` | Shadow | info | A learned model runs beside the heuristic, unused. |
| `learned` | Learned | mint | The learned model is live. |

#### ThreadKind

What a chat thread is attached to. Const: `THREAD_KINDS`, labels: `THREAD_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `offer` | Offer | neutral | A direct offer. |
| `submission` | Submission | neutral | A submission. |
| `bounty` | Bounty | neutral | A bounty (creator questions). |
| `support` | Support | neutral | flowd support. |

#### MessageKind

Chat message kind. Const: `MESSAGE_KINDS`, labels: `MESSAGE_KIND_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `text` | Text | neutral | A person wrote it. |
| `system` | System | neutral | A system note. |
| `warning` | Scam Shield warning | rose | A contextual warning (e.g. asked to move off-platform). |

#### SaveStage

A creator's relationship to a bounty. Const: `SAVE_STAGES`, labels: `SAVE_STAGE_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `saved` | Saved | neutral | Bookmarked. |
| `joined` | Joined | info | Started in Studio. |
| `submitted` | Submitted | accent | Submitted. |

#### ChangelogTag

Changelog tags. Const: `CHANGELOG_TAGS`, labels: `CHANGELOG_TAG_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `new` | New | accent | New feature. |
| `improved` | Improved | info | Improvement. |
| `fix` | Fix | neutral | Bug fix. |
| `trust` | Trust | mint | Trust and safety. |
| `money` | Money | mint | Payments and payouts. |

#### MetricStatus

Admin day-90 target status. Const: `METRIC_STATUSES`, labels: `METRIC_STATUS_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `achieved` | Achieved | mint | Target met. |
| `on_track` | On track | accent | Trending to the target. |
| `at_risk` | At risk | ember | Within 15% of missing. |
| `off_track` | Off track | rose | Missing. |

#### SpendTier

Test planner matrix size by spend. Const: `SPEND_TIERS`, labels: `SPEND_TIER_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `starter` | Starter | neutral | Up to $1,000: 4 to 6 cells. |
| `growth` | Growth | accent | $1,000 to $5,000: 8 to 12 cells. |
| `scale` | Scale | sun | Over $5,000: 15 to 24 cells. |

#### RuleAuditAction

Entries in an auto-approve rule audit log. Const: `RULE_AUDIT_ACTIONS`, labels: `RULE_AUDIT_ACTION_META`.

| Value | UI label | Colour | Meaning |
|---|---|---|---|
| `created` | Created | neutral | Rule created. |
| `edited` | Edited | neutral | Conditions or guardrails changed. |
| `dry_run` | Dry run | info | Dry run on the last 50 submissions. |
| `enabled` | Enabled | mint | Enabled after a dry run. |
| `paused` | Paused | ember | Paused by the brand or a guardrail. |
| `resumed` | Resumed | mint | Resumed. |
| `killed` | Killed | rose | Kill switch used. |
| `spot_check` | Spot-check | info | A human reviewed an auto-approved submission. |
| `spot_check_overturned` | Spot-check overturned | rose | A human disagreed with an auto-approval; the rule paused. |
<!-- /GENERATED:enums -->

---

## 6. Entities

Every entity is one fixture file (section 14). Relationships are foreign keys (`ref`); the map below is derived from the schema. Group order: Meta, Identity, Money, Bounties, Content, Submissions, Posts, Attribution, Ads, Market, Rights, Trust, Growth, Platform, Public, Admin.

**Ownership of facts** (so nothing is derived twice): `brands.wallet_balance_cents` and `bounties.*_cents` are projections of the ledger; `creators.lifetime_cleared_cents` is carry-over plus the ledger; `posts.views` and `funnel` are sums of the daily rows; `money_clock` is a projection of posts, conversions and the ledger; `payout_runs` is a projection of payouts; `brand_scorecards` and `creator_reputation` are computed with FORMULAS from decisions and posts; `admin_metrics.queues` counts the real queues. When a projection and its source disagree the source wins and the validator fails.

**Names in the brief versus the schema.** `reserved_total` is `bounties.reserved_cents`; `rights_card`, `brief_lint` and `funded` are fields of `bounties`; `qa_checks` are the `QaCheck` rows inside `video_analyses.checks` (a separate SQL table, see below); `tiers` and `streaks` are `CONSTANTS.tiers` / `CONSTANTS.streaks` plus the per-creator `tier_history` and `streaks` files; `team activity log` is `activity_log`; `market series` is `market_series`; `ticker events` are `ticker.events`; `negotiation thread` is `offers.thread`; `bids` are `auctions.bids`.

### 6.1 Mapping to SQL (for `supabase/` and the OpenAPI schemas)

The fixture file name is the SQL table name; the 16 blueprint tables (`users`, `creators`, `social_accounts`, `rate_cards`, `apps`, `bounties`, `offers`, `auctions`, `submissions`, `video_analyses`, `posts`, `post_metrics_hourly`, `conversions`, `ads`, `ledger`, `payouts`) keep their names and gain the fields above; `brands` and `brand_members` hold workspaces and roles. Column types: ids `text` (primary key, `<prefix>_<slug>`), `*_cents` `bigint`, ratios `numeric(6,5)`, timestamps `timestamptz`, dates `date`, enums Postgres enums (or `text` with a check), `ArtSeed` and rarely-queried value types `jsonb`. These embedded arrays are normalised into their own tables because they are queried, joined or appended to:

| Embedded in the fixture | SQL table | Notes |
|---|---|---|
| `submissions.versions` | `submission_versions` | (submission_id, version) key; the `video` object flattens into columns |
| `video_analyses.checks` | `qa_checks` | (video_analysis_id, check) key; evidence as jsonb |
| `offers.thread` | `offer_messages` | append-only |
| `auctions.bids` | `auction_bids` | sealed until close: RLS shows a brand only its own bid while the auction is open |
| `daily_drops.items` and their claims | `drop_items`, `drop_claims` | spots_left is derived: `spots_total - count(claims)` |
| `leaderboards.entries` | `leaderboard_entries` | recomputed weekly |
| `webhooks.deliveries` | `webhook_deliveries` | keep the last 20 per endpoint in the read model |
| `threads.messages` | `chat_messages` | append-only; Scam Shield annotates |
| `rights_grants.renewals` | `rights_renewals` | |
| `disputes.events` | `dispute_events` | append-only |
| `auto_approve_rules.audit` | `rule_audit_log` | append-only |
| `ads.daily` | `ad_daily` | |
| `compliance_checks.checks` | `compliance_check_items` | |
| `creators.payout_method` | `payout_methods` | never a full number; Connect holds the details |

Everything else embedded (scores, transcripts, scenes, briefs, rights cards, brief lint, pay math, fraud assessments, funnels, retention, storefronts, portfolios, wrapped cards, quiz questions, lesson blocks) stays `jsonb`. **Access (RLS)**: creators read and write only their own rows (and the public views); brand members read and write their workspace's rows according to `BrandMemberRole`; `admin` reads everything; public (anonymous) read-only views exist for: storefront (`/c/<handle>`: verified stats only), proofs, brand scorecards, public bounties (with Funded badge, Rights Card, Pay Math), tournaments, the ticker, market series, formats, hooks, lessons, trends, changelog, case studies, testimonials, audit reports and the waitlist leaders. Ledger rows are insert-only; the only updatable columns are `status`, `cleared_at`, `paid_at`, `payout_id`.

<!-- GENERATED:entities -->
80 entities, each one fixture file (27 core, 53 ext). Field types: `-> table` is a foreign key (a string id, validated); `enum X` an enumeration; a bare name is a nested value type; `[]` an array. Optional fields are omitted when empty, never null.

**Index of entities**:

| Entity | File | Owner | Group | Id prefix | What it is |
|---|---|---|---|---|---|
| World | `world.json` | core | Meta | `world_` | The demo world manifest: "now", personas and counts. |
| User | `users.json` | core | Identity | `usr_` | A person who can sign in. |
| Creator | `creators.json` | core | Identity | `cr_` | A creator profile (1:1 with a user whose role is creator). |
| SocialAccount | `social_accounts.json` | core | Identity | `sa_` | A connected TikTok / Instagram / YouTube account (read-only OAuth; tokens are never in fixtures). |
| RateCard | `rate_cards.json` | core | Identity | `rate_` | A creator's own price list (Silver and above). |
| Brand | `brands.json` | core | Identity | `br_` | A buyer workspace: an app company, an agency workspace, or flowd itself (kind platform). |
| BrandMember | `brand_members.json` | core | Identity | `bm_` | A person's membership and role in a brand workspace. |
| App | `apps.json` | core | Identity | `app_` | An app a brand promotes. |
| LedgerEntry | `ledger.json` | core | Money | `ledg_` | One leg of a double-entry transaction. |
| Payout | `payouts.json` | core | Money | `pay_` | Money leaving flowd to a creator's bank. |
| Invoice | `invoices.json` | core | Money | `inv_` | A brand invoice (funding, subscription, ad fee, renewals) with finance-pack fields. |
| MoneyClockRow | `money_clock.json` | core | Money | `mc_` | The Money Clock: one earning row with its state, a dated ETA and a named reason. |
| MarketSeriesPoint | `market_series.json` | core | Market | `mkt_` | Daily market data per category (the clearing CPM series). |
| Ticker | `ticker.json` | core | Market | - | The public live payout ticker: totals plus recent events. |
| BrandScorecard | `brand_scorecards.json` | core | Trust | `bsc_` | Brand Scorecard: pay speed, decision time, approval fairness and the share of approved work actually run. |
| CreatorReputation | `creator_reputation.json` | core | Trust | `rep_` | Fair creator reputation: finished work only, recency-weighted, shown with reasons. |
| Bounty | `bounties.json` | core | Bounties | `bnty_` | A funded offer to creators. |
| Submission | `submissions.json` | core | Submissions | `sub_` | A creator's video for a bounty. |
| VideoAnalysis | `video_analyses.json` | core | Submissions | `va_` | Machine analysis of one submission version: transcript, scenes, beats, hook, QA checks and checklist scores. |
| Post | `posts.json` | core | Posts | `post_` | A posted video on a creator's own account. |
| ViewSnapshot | `view_snapshots.json` | core | Posts | `vsn_` | A View Ledger snapshot: a timestamped, source-labelled view count of a post. |
| PostMetricsDaily | `post_metrics_daily.json` | core | Posts | - | Per-post daily metrics (UTC day). |
| PostMetricsHourly | `post_metrics_hourly.json` | core | Posts | - | Per-post hourly deltas for the most recent days (UTC dates from 2026-09-30 to now), the training-data grain. |
| AppMetricsDaily | `app_metrics_daily.json` | core | Posts | - | Per-app daily rollup of post metrics and spend (derived; equals the sum of its posts' daily rows). |
| Conversion | `conversions.json` | core | Attribution | `conv_` | A batch of identical funnel events: (post, kind, source, UTC day). |
| AttributionLink | `attribution_links.json` | core | Attribution | `lnk_` | A per-creator, per-bounty tracking link (deferred deep link) plus an optional promo code. |
| Ad | `ads.json` | core | Ads | `ad_` | Winner promotion: an organic post run as a Spark / partnership ad. |
| Offer | `offers.json` | ext | Market | `offer_` | An offer between a brand and a creator: an invite to an open bounty, a direct offer bought from a rate card, or a re-buy of a winner. |
| Auction | `auctions.json` | ext | Market | `auc_` | A creator's sealed-bid auction for a few weekly slots (Platinum and Elite). |
| Spec | `specs.json` | ext | Market | `spec_` | A pre-made, pre-scored video that brands can license off the shelf (Spec Market). |
| RightsGrant | `rights_grants.json` | ext | Rights | `rg_` | A usage-rights grant on a post: organic (always), paid-ad usage (default 90 days), a Spark code or a partnership permission. |
| DailyDrop | `daily_drops.json` | ext | Growth | `drop_` | The Daily Drop: one drop a day at 16:00 UTC with real inventory. |
| Tournament | `tournaments.json` | ext | Growth | `tour_` | A sponsored tournament: a prize pool, hook battles in rounds (bracket) or a ranked leaderboard. |
| TournamentEntry | `tournament_entries.json` | ext | Growth | `tent_` | A creator's entry in a tournament: one hook video. |
| Crew | `crews.json` | ext | Growth | `crew_` | A crew of 3 to 20 creators with a shared leaderboard and a platform-funded weekly goal bonus. |
| CrewMember | `crew_members.json` | ext | Growth | `cmem_` | A creator in a crew. |
| Streak | `streaks.json` | ext | Growth | `stk_` | A creator's weekly posting streak. |
| Leaderboard | `leaderboards.json` | ext | Growth | `lb_` | A weekly leaderboard: peer cohorts of about 30 by tier and niche (with a promotion zone and no demotion zone) plus public niche and global boards. |
| Referral | `referrals.json` | ext | Growth | `ref_` | A referral: single level, time-limited and platform-funded; the referred person is never charged. |
| Lesson | `lessons.json` | ext | Growth | `lsn_` | An Academy lesson: free, five minutes or less, never required. |
| LessonProgress | `lesson_progress.json` | ext | Growth | `lsp_` | A creator's progress on a lesson. |
| Trend | `trends.json` | ext | Growth | `trend_` | A Trend radar item: a rising or fading format, hook, topic or sound, built from public top ads and flowd's own settled winners. |
| Format | `formats.json` | ext | Content | `tmpl_` | A winning app-ad format template (11). |
| Hook | `hooks.json` | ext | Content | `hook_` | A fill-in hook from the hook library (7 types, 10 or more per type), pre-filled with the app's name and features at use time. |
| TierEvent | `tier_history.json` | ext | Identity | `tev_` | An entry in a creator's tier history: promotions, Elite grants, grace holds, carry-over. |
| Wrapped | `wrapped.json` | ext | Growth | `wrap_` | A creator's Wrapped recap (monthly or yearly): 8 to 10 story cards. |
| Proof | `proofs.json` | ext | Growth | `prf_` | A public proof page for an earnings claim (joinflowd.io/p/<id>): a payout, a month, a tier-up or a Wrapped. |
| BountySave | `bounty_saves.json` | ext | Growth | `save_` | A creator's relationship to a bounty: saved, joined (claimed or started in Studio) or submitted. |
| WellbeingSettings | `wellbeing_settings.json` | ext | Identity | `wb_` | Wellbeing Mode for a creator: quiet hours, numbers-off, opt-in pace goal, pause that preserves tier and streak, rest weeks, leaderboard opt-out. |
| NotificationPrefs | `notification_prefs.json` | ext | Identity | `npref_` | Notification preferences for a user (creator, brand member or admin). |
| Waitlist | `waitlist.json` | ext | Public | - | The ranked waitlist: totals and a leaderboard of the top referrers. |
| StateOfAppUgc | `state_of_app_ugc.json` | ext | Public | - | The State of App UGC report: clearing CPMs, top hook types and view-to-trial rates by category. |
| CaseStudy | `case_studies.json` | ext | Public | `case_` | A public case study. |
| Testimonial | `testimonials.json` | ext | Public | `tst_` | A fictional testimonial for the marketing pages. |
| ChangelogEntry | `changelog.json` | ext | Public | `chg_` | A changelog entry. |
| FeedbackNote | `feedback_notes.json` | ext | Submissions | `note_` | A timecoded feedback note on a submission version: anchored to a moment in the video, with a category and a severity. |
| Dispute | `disputes.json` | ext | Trust | `disp_` | A dispute or appeal. |
| ScamReport | `scam_reports.json` | ext | Trust | `scam_` | A Scam Shield report from a creator or brand about a brand, bounty, creator, message or offer. |
| FraudFlag | `fraud_flags.json` | ext | Trust | `flag_` | A post in the admin fraud queue (fraud score 40 or above): evidence, money at stake and the decision. |
| Verification | `verifications.json` | ext | Trust | `ver_` | An item in the admin verification queue: creator identity / age, brand business, tax, or payout method. |
| TaxProfile | `tax_profiles.json` | ext | Trust | `taxp_` | A creator's Tax Desk profile: just-in-time W-9 or W-8BEN, year-to-date totals, 1099-NEC threshold progress and the set-aside estimate. |
| TaxDoc | `tax_docs.json` | ext | Trust | `taxd_` | A tax document: a collected W-9 or W-8BEN, or an issued 1099-NEC. |
| ComplianceAudit | `compliance_checks.json` | ext | Trust | `cc_` | The post-level compliance audit (disclosure audio + on-screen, caption, platform label, music, banned claims, AI label, tracking link). |
| PayoutRun | `payout_runs.json` | ext | Money | `run_` | A weekly payout run: Fridays 18:00 UTC. |
| Notification | `notifications.json` | ext | Platform | `ntf_` | A notification for a creator, brand member or admin. |
| Integration | `integrations.json` | ext | Platform | `intg_` | A brand integration (RevenueCat, MMPs, ad accounts, Slack, Zapier, App Store Connect). |
| ApiKey | `api_keys.json` | ext | Platform | `key_` | A public API key (read, write, financial scopes; writes are drafts by default). |
| Webhook | `webhooks.json` | ext | Platform | `whk_` | An outbound webhook endpoint with its subscribed events and recent deliveries. |
| ActivityEntry | `activity_log.json` | ext | Platform | `act_` | The team activity log of a brand workspace (filterable, exportable). |
| AutoApproveRule | `auto_approve_rules.json` | ext | Platform | `rule_` | A guarded auto-approve rule: conditions, scope (organic only), guardrails, a mandatory dry run on the last 50 submissions, a 10% human spot-check a... |
| TestPlan | `test_plans.json` | ext | Platform | `tplan_` | A hook x body x CTA test plan: cells assigned to bounties or offers, measured on settled posts. |
| FatigueAlert | `fatigue_alerts.json` | ext | Platform | `fat_` | A fatigue alert: a winner whose trial-start rate (or click-through, or install yield) fell 30% from its peak. |
| AuditReport | `audit_reports.json` | ext | Public | `aud_` | A free App UGC Audit (shareable report at /audit/<slug>): brief, 10 hooks, predicted CPM, price-vs-fill, creators ready now. |
| FloSuggestion | `flo_suggestions.json` | ext | Platform | `flo_` | A Flo copilot output (history of scripts, hook rewrites, TL;DRs, captions, score fixes, rate advice, next actions, bounty drafts). |
| MlModel | `ml_models.json` | ext | Platform | `mdl_` | One of the eight ML systems with its stage (heuristic, shadow, learned), monitoring metrics and calibration. |
| AdminMetrics | `admin_metrics.json` | ext | Admin | - | The admin control tower: 90-day targets vs actuals, market health, queue counts, next payout run and the money summary. |
| ChatThread | `threads.json` | ext | Platform | `thr_` | An in-app thread tied to an offer, submission, bounty or support. |
| RevenueCatEvent | `revenuecat_events.json` | ext | Attribution | `rce_` | An ingested RevenueCat webhook event (lowercase mirror). |
| OfferCode | `offer_code_pool.json` | ext | Attribution | `occ_` | A code in an app's offer-code pool. |
| BrandList | `brand_lists.json` | ext | Platform | `list_` | A brand's CRM list of creators (favourites or custom), with notes and tags. |


**Relationship map** (arrow = holds a foreign key to):

| Table | References |
|---|---|
| `world` | `users`, `creators`, `brand_members`, `brands`, `apps` |
| `creators` | `users`, `posts` |
| `social_accounts` | `creators` |
| `rate_cards` | `creators` |
| `brand_members` | `brands`, `users` |
| `apps` | `brands` |
| `ledger` | `brands`, `bounties`, `posts`, `submissions`, `creators`, `conversions`, `ads`, `payouts`, `invoices` |
| `payouts` | `creators` |
| `invoices` | `brands`, `bounties`, `ads` |
| `money_clock` | `creators`, `bounties`, `apps`, `posts`, `conversions`, `ledger`, `payouts` |
| `ticker` | `creators`, `bounties` |
| `brand_scorecards` | `brands` |
| `creator_reputation` | `creators` |
| `bounties` | `apps`, `brands`, `brand_members`, `posts`, `users` |
| `submissions` | `bounties`, `creators`, `brands`, `apps`, `users`, `posts`, `attribution_links` |
| `video_analyses` | `submissions`, `users` |
| `posts` | `submissions`, `creators`, `brands`, `apps`, `bounties`, `social_accounts`, `attribution_links`, `ads` |
| `view_snapshots` | `posts` |
| `post_metrics_daily` | `posts` |
| `post_metrics_hourly` | `posts` |
| `app_metrics_daily` | `apps` |
| `conversions` | `posts`, `attribution_links`, `apps`, `bounties`, `creators` |
| `attribution_links` | `creators`, `bounties`, `apps`, `posts` |
| `ads` | `posts`, `brands`, `apps`, `bounties`, `creators` |
| `offers` | `brands`, `apps`, `creators`, `brand_members`, `bounties`, `rate_cards`, `posts`, `users` |
| `auctions` | `creators`, `brands`, `brand_members`, `bounties` |
| `specs` | `creators`, `brands`, `submissions`, `bounties` |
| `rights_grants` | `posts`, `submissions`, `bounties`, `brands`, `apps`, `creators`, `brand_members`, `ads` |
| `daily_drops` | `bounties`, `creators` |
| `tournaments` | `brands`, `tournament_entries`, `bounties`, `creators` |
| `tournament_entries` | `tournaments`, `creators`, `submissions` |
| `crews` | `creators` |
| `crew_members` | `crews`, `creators` |
| `streaks` | `creators` |
| `leaderboards` | `creators` |
| `referrals` | `creators`, `brands` |
| `lesson_progress` | `creators`, `lessons` |
| `tier_history` | `creators` |
| `wrapped` | `creators`, `posts`, `brands`, `proofs` |
| `proofs` | `creators`, `payouts` |
| `bounty_saves` | `creators`, `bounties`, `daily_drops`, `submissions` |
| `wellbeing_settings` | `creators` |
| `notification_prefs` | `users` |
| `case_studies` | `apps`, `brands` |
| `testimonials` | `creators`, `brands` |
| `feedback_notes` | `submissions`, `bounties`, `creators`, `brand_members` |
| `disputes` | `creators`, `brands`, `bounties`, `submissions`, `posts`, `payouts`, `users` |
| `scam_reports` | `creators`, `brands`, `users` |
| `fraud_flags` | `posts`, `creators`, `brands`, `bounties`, `users` |
| `verifications` | `creators`, `brands`, `users` |
| `tax_profiles` | `creators` |
| `tax_docs` | `creators` |
| `compliance_checks` | `posts`, `submissions`, `bounties`, `brands`, `creators`, `brand_members` |
| `notifications` | `users` |
| `integrations` | `brands`, `apps` |
| `api_keys` | `brands`, `brand_members` |
| `webhooks` | `brands` |
| `activity_log` | `brands`, `brand_members` |
| `auto_approve_rules` | `brands`, `bounties`, `brand_members` |
| `test_plans` | `brands`, `apps`, `submissions`, `posts`, `bounties`, `offers` |
| `fatigue_alerts` | `brands`, `apps`, `bounties`, `posts`, `ads`, `creators` |
| `audit_reports` | `posts`, `creators`, `brands` |
| `flo_suggestions` | `creators`, `brands` |
| `threads` | `creators`, `brands`, `offers`, `submissions`, `bounties`, `users` |
| `revenuecat_events` | `apps`, `conversions`, `attribution_links`, `creators` |
| `offer_code_pool` | `apps`, `creators`, `bounties`, `attribution_links` |
| `brand_lists` | `brands`, `creators`, `brand_members` |


### Meta

#### World (`world`)

The demo world manifest: "now", personas and counts. Object-shaped file; read first by every store.

Id prefix: `world_`. Fixture: `world.json` (object, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | "world_flowd". |
| `now` | iso | yes | Always 2026-10-03T14:00:00Z. Every relative time in the app is relative to this. |
| `launch_date` | date | yes | 2026-07-05: day 0 of the 90-day history. |
| `seed` | int | yes | Generator seed (stable output). |
| `contract_version` | string | yes | Semver of the contract this data satisfies. |
| `personas` | Personas | yes |  |
| `counts` | map<int> | yes | Row counts by fixture name. |

References: `personas.creator.user_id -> users`, `personas.creator.creator_id -> creators`, `personas.brand.user_id -> users`, `personas.brand.member_id -> brand_members`, `personas.brand.brand_id -> brands`, `personas.brand.app_id -> apps`, `personas.admin.user_id -> users`.


### Identity

#### User (`users`)

A person who can sign in. Creators, brand members and admins are all users; role decides the experience.

Id prefix: `usr_`. Fixture: `users.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `role` | enum Role | yes |  |
| `email` | string | yes | Fictional addresses only (@example.com or @joinflowd.io for staff). |
| `display_name` | string | yes |  |
| `avatar` | ArtSeed | yes | Generated avatar seed. |
| `auth_providers` | enum AuthProvider[] | yes |  |
| `status` | enum UserStatus | yes |  |
| `age_verified` | bool | yes | Creators must be 18+. |
| `locale` | string | yes | BCP-47, e.g. "en-US". |
| `timezone` | string | yes | IANA, e.g. "America/Chicago". |
| `created_at` | iso | yes |  |
| `last_seen_at` | iso | no |  |
| `title` | string | no | Job title for brand members and staff. |

Referenced by: `bounties`, `brand_members`, `creators`, `disputes`, `fraud_flags`, `notification_prefs`, `notifications`, `offers`, `scam_reports`, `submissions`, `threads`, `verifications`, `video_analyses`, `world`.

#### Creator (`creators`)

A creator profile (1:1 with a user whose role is creator). Tier, stats and reputation are earned, never bought.

Id prefix: `cr_`. Fixture: `creators.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `user_id` | -> users | yes |  |
| `handle` | string | yes | Unique, lowercase, [a-z0-9._], no "@". Shown as @handle. Public link joinflowd.io/c/<handle>. |
| `display_name` | string | yes |  |
| `bio` | text | yes |  |
| `avatar` | ArtSeed | yes |  |
| `niches` | enum Niche[] | yes | 1 to 3. |
| `country` | enum Country | yes |  |
| `languages` | string[] | yes | BCP-47 language tags. |
| `tier` | enum Tier | yes | Computed from the stats below (see FORMULAS: tier). Validated. |
| `tier_basis` | enum TierBasis | yes |  |
| `tier_since` | iso | yes |  |
| `tier_hold_until` | iso | no | Set when tier_basis = grace_hold: no tier drop before this (30 days after a dip). |
| `tier_review` | TierReview | no | Required when tier = elite (manual review). |
| `lifetime_cleared_cents` | cents | yes | carry_over.cleared_cents + sum of the creator's cleared and paid earning rows in the ledger. Reconciled. |
| `approved_count` | int | yes | Approved submissions (status approved \| posted \| released), plus carry_over.approved_count. |
| `decided_count` | int | yes | Finished decisions: approved + rejected (withdrawn and expired excluded), plus carry_over.decided_count. |
| `approval_rate` | ratio | yes | approved_count / decided_count, rounded to 2 decimals. Only finished work counts. |
| `reliability_score` | int | yes | 0..100 (see FORMULAS: creator reliability). |
| `posts_count` | int | yes |  |
| `live_posts_count` | int | yes | Posts with status live. |
| `first_dollar_at` | iso | no |  |
| `joined_at` | iso | yes |  |
| `last_active_at` | iso | yes |  |
| `founding` | bool | yes | One of the first 200 creators. |
| `founding_perks_until` | iso | no | Founding creators: end of the free instant cash-out perk (joined_at + 12 months). |
| `badges` | enum BadgeId[] | yes |  |
| `verification_status` | enum VerificationStatus | yes | Identity verification (JIT at first approval). |
| `onboarding_stage` | enum OnboardingStage | yes |  |
| `payout_ready` | bool | yes | True when identity, tax info and a payout method are all in place. |
| `payout_method` | PayoutMethod | no |  |
| `stripe_account_id` | string | no | Mock Connect account id, "acct_<n>". |
| `referral_code` | string | yes | Unique, e.g. "MAYA6". |
| `referred_by_creator_id` | -> creators | no |  |
| `streak_weeks` | int | yes | Snapshot of the current weekly streak (ext streaks.json must agree). |
| `carry_over` | CarryOver | no | Founding creators only: verified prior history that counts toward tier thresholds. |
| `storefront` | Storefront | yes |  |
| `portfolio` | PortfolioItem[] | yes | 0 to 5 samples. |
| `open_to_offers` | bool | yes |  |
| `paused_until` | iso | no | Pause mode: preserves tier and streak. |

Referenced by: `ads`, `attribution_links`, `auctions`, `audit_reports`, `bounty_saves`, `brand_lists`, `compliance_checks`, `conversions`, `creator_reputation`, `creators`, `crew_members`, `crews`, `daily_drops`, `disputes`, `fatigue_alerts`, `feedback_notes`, `flo_suggestions`, `fraud_flags`, `leaderboards`, `ledger`, `lesson_progress`, `money_clock`, `offer_code_pool`, `offers`, `payouts`, `posts`, `proofs`, `rate_cards`, `referrals`, `revenuecat_events`, `rights_grants`, `scam_reports`, `social_accounts`, `specs`, `streaks`, `submissions`, `tax_docs`, `tax_profiles`, `testimonials`, `threads`, `ticker`, `tier_history`, `tournament_entries`, `tournaments`, `verifications`, `wellbeing_settings`, `world`, `wrapped`.

References: `user_id -> users`, `tier_review.reviewer_user_id -> users`, `referred_by_creator_id -> creators`, `carry_over.verified_by_user_id -> users`, `storefront.featured_post_ids[] -> posts`.

#### SocialAccount (`social_accounts`)

A connected TikTok / Instagram / YouTube account (read-only OAuth; tokens are never in fixtures).

Id prefix: `sa_`. Fixture: `social_accounts.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `platform` | enum Platform | yes |  |
| `handle` | string | yes | Platform handle without "@". |
| `followers` | int | yes |  |
| `avg_views_28d` | int | yes |  |
| `median_views_28d` | int | yes |  |
| `engagement_rate` | ratio | yes | (likes + comments + shares) / views, 28 days. |
| `us_audience_ratio` | ratio | yes |  |
| `status` | enum LinkStatus | yes |  |
| `verified_by_platform` | bool | yes |  |
| `primary` | bool | yes | The account new posts default to. |
| `account_created_at` | iso | yes | Account age drives the new_account fraud signal. |
| `connected_at` | iso | yes |  |
| `last_synced_at` | iso | yes |  |
| `health` | AccountHealth | yes |  |

Referenced by: `posts`.

References: `creator_id -> creators`.

#### RateCard (`rate_cards`)

A creator's own price list (Silver and above). Brands buy directly at the ask.

Id prefix: `rate_`. Fixture: `rate_cards.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `status` | enum RateCardStatus | yes |  |
| `price_per_video_cents` | cents | yes | The ask for one video with organic posting. |
| `min_cpm_cents` | cents | yes | Minimum CPM the creator accepts on open bounties. |
| `paid_usage_days` | int | yes | Paid-ad usage included in the base price; default 90. |
| `paid_usage_pct_per_30d` | ratio | yes | Renewal price as a share of the base price per extra 30 days; default 0.25. |
| `turnaround_days` | int | yes |  |
| `max_videos_per_month` | int | yes |  |
| `platforms` | enum Platform[] | yes |  |
| `format_ids` | enum FormatId[] | yes | Formats the creator offers. |
| `categories_excluded` | enum Category[] | yes |  |
| `accepts_direct_offers` | bool | yes |  |
| `suggested` | RateSuggestion | no | Market-suggested price with its basis. |
| `packages` | RatePackage[] | yes |  |
| `stats` | RateCardStats | yes |  |
| `updated_at` | iso | yes |  |

Referenced by: `offers`.

References: `creator_id -> creators`.

#### Brand (`brands`)

A buyer workspace: an app company, an agency workspace, or flowd itself (kind platform).

Id prefix: `br_`. Fixture: `brands.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `kind` | enum BrandKind | yes |  |
| `name` | string | yes |  |
| `slug` | string | yes |  |
| `tagline` | string | yes |  |
| `logo` | ArtSeed | yes | Generated rounded-square glyph, never a real logo. |
| `website` | string | yes | Fictional domain on .example. |
| `country` | enum Country | yes |  |
| `plan` | enum Plan | yes |  |
| `plan_renews_at` | iso | no |  |
| `verification` | enum VerificationStatus | yes | Verified brand badge (business verification). |
| `created_at` | iso | yes |  |
| `agency_id` | -> brands | no | The agency workspace managing this brand. |
| `first_bounty_waiver_used` | bool | yes | The first-bounty platform-fee waiver and match have been used. |
| `matched_budget_used_cents` | cents | yes |  |
| `wallet_balance_cents` | cents | yes | Sum of the brand wallet account in the ledger. Reconciled. |
| `auto_top_up` | AutoTopUp | no |  |
| `billing` | BillingProfile | yes |  |
| `timeout_policy` | enum TimeoutPolicy | yes |  |
| `review_sla_hours` | int | yes | Default 72. |
| `compliance_defaults` | ComplianceDefaults | yes |  |
| `referral_partner_brand_id` | -> brands | no | The agency partner that referred this brand (12-month fee share). |

Referenced by: `activity_log`, `ads`, `api_keys`, `apps`, `auctions`, `audit_reports`, `auto_approve_rules`, `bounties`, `brand_lists`, `brand_members`, `brand_scorecards`, `brands`, `case_studies`, `compliance_checks`, `disputes`, `fatigue_alerts`, `flo_suggestions`, `fraud_flags`, `integrations`, `invoices`, `ledger`, `offers`, `posts`, `referrals`, `rights_grants`, `scam_reports`, `specs`, `submissions`, `test_plans`, `testimonials`, `threads`, `tournaments`, `verifications`, `webhooks`, `world`, `wrapped`.

References: `agency_id -> brands`, `referral_partner_brand_id -> brands`.

#### BrandMember (`brand_members`)

A person's membership and role in a brand workspace.

Id prefix: `bm_`. Fixture: `brand_members.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `brand_id` | -> brands | yes |  |
| `user_id` | -> users | yes |  |
| `role` | enum BrandMemberRole | yes |  |
| `status` | enum MemberStatus | yes |  |
| `invited_by_member_id` | -> brand_members | no |  |
| `approval_link_code` | string | no | client_approver members: the code in their seat-free approval link. |
| `joined_at` | iso | yes |  |
| `last_active_at` | iso | no |  |

Referenced by: `activity_log`, `api_keys`, `auctions`, `auto_approve_rules`, `bounties`, `brand_lists`, `brand_members`, `compliance_checks`, `feedback_notes`, `offers`, `rights_grants`, `world`.

References: `brand_id -> brands`, `user_id -> users`, `invited_by_member_id -> brand_members`.

#### App (`apps`)

An app a brand promotes. Attribution (RevenueCat, MMP, SDK) hangs off the app.

Id prefix: `app_`. Fixture: `apps.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `brand_id` | -> brands | yes |  |
| `name` | string | yes |  |
| `tagline` | string | yes |  |
| `category` | enum Category | yes |  |
| `icon` | ArtSeed | yes | Generated app icon. |
| `brand_colors` | BrandColors | yes |  |
| `features` | string[] | yes | Feature names creators can demo (3 to 6). |
| `app_store_id` | string | yes | Fictional 10-digit id. |
| `bundle_id` | string | yes | e.g. "com.lumiapps.photo". |
| `store_url` | string | yes | Fictional listing URL. |
| `pricing` | AppPricing | yes |  |
| `avg_first_payment_cents` | cents | yes | Typical first paid period revenue per paid conversion. |
| `rating` | number | yes | 1.0 to 5.0. |
| `rating_count` | int | yes |  |
| `status` | enum AppStatus | yes |  |
| `connected_at` | iso | yes |  |
| `revenuecat_project_id` | string | no | Fictional "proj_<n>". |
| `mmp` | enum MmpKind | yes |  |
| `sdk_status` | enum SdkStatus | yes |  |
| `default_hashtags` | string[] | yes |  |

Referenced by: `ads`, `app_metrics_daily`, `attribution_links`, `bounties`, `case_studies`, `conversions`, `fatigue_alerts`, `integrations`, `money_clock`, `offer_code_pool`, `offers`, `posts`, `revenuecat_events`, `rights_grants`, `submissions`, `test_plans`, `world`.

References: `brand_id -> brands`.

#### TierEvent (`tier_history`)

An entry in a creator's tier history: promotions, Elite grants, grace holds, carry-over.

Id prefix: `tev_`. Fixture: `tier_history.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `kind` | enum TierEventKind | yes |  |
| `from_tier` | enum Tier | no |  |
| `to_tier` | enum Tier | yes |  |
| `basis` | enum TierBasis | yes |  |
| `at` | iso | yes |  |
| `stats` | TierStatsSnapshot | yes |  |
| `note` | string | yes |  |

References: `creator_id -> creators`.

#### WellbeingSettings (`wellbeing_settings`)

Wellbeing Mode for a creator: quiet hours, numbers-off, opt-in pace goal, pause that preserves tier and streak, rest weeks, leaderboard opt-out.

Id prefix: `wb_`. Fixture: `wellbeing_settings.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | wb_<creator slug>. |
| `creator_id` | -> creators | yes |  |
| `enabled` | bool | yes |  |
| `quiet_hours` | QuietHours | yes |  |
| `numbers_off` | NumbersOff | yes |  |
| `pace_goal` | PaceGoal | yes |  |
| `paused_until` | iso | no |  |
| `rest_weeks` | string[] | yes | ISO weeks declared as rest weeks, e.g. "2026-W36". |
| `leaderboard_opt_out` | bool | yes |  |
| `slack_mode` | bool | yes | Slack streaks: freezes and rest weeks are applied automatically. |
| `updated_at` | iso | yes |  |

References: `creator_id -> creators`.

#### NotificationPrefs (`notification_prefs`)

Notification preferences for a user (creator, brand member or admin).

Id prefix: `npref_`. Fixture: `notification_prefs.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | npref_<user slug>. |
| `user_id` | -> users | yes |  |
| `push` | bool | yes |  |
| `email_digest` | bool | yes |  |
| `categories` | map<bool> | yes | Keys: money, reviews, drop, offers, tournaments, tips, safety. |
| `quiet_hours` | QuietHours | yes |  |
| `batch_non_cash` | bool | yes | Batch everything except cash events inside quiet hours. |
| `drop_reminder` | bool | yes | One opt-in Daily Drop reminder. |
| `updated_at` | iso | yes |  |

References: `user_id -> users`.


### Money

#### LedgerEntry (`ledger`)

One leg of a double-entry transaction. Rows with the same txn_id sum to exactly 0 (signed amounts: credit +, debit -). Append-only: only status, cleared_at, paid_at and payout_id change.

Id prefix: `ledg_`. Fixture: `ledger.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `txn_id` | string | yes | "txn_<n>". All legs of one transaction share it; the legs net to 0. |
| `entry_type` | enum LedgerType | yes |  |
| `account` | string | yes | "<kind>:<id>": wallet:br_x \| escrow:bnty_x \| creator:cr_x \| platform:fees\|subscriptions\|matching\|promo\|processing \| external:card\|bank. |
| `amount_cents` | int | yes | Signed. Credit to the account is positive. |
| `status` | enum LedgerStatus | yes | Meaningful on creator-account earning rows; everything else is cleared (or paid once withdrawn). |
| `posted_at` | iso | yes |  |
| `cleared_at` | iso | no |  |
| `paid_at` | iso | no |  |
| `brand_id` | -> brands | no |  |
| `bounty_id` | -> bounties | no |  |
| `post_id` | -> posts | no |  |
| `submission_id` | -> submissions | no |  |
| `creator_id` | -> creators | no |  |
| `conversion_id` | -> conversions | no |  |
| `ad_id` | -> ads | no |  |
| `payout_id` | -> payouts | no |  |
| `invoice_id` | -> invoices | no |  |
| `reverses_txn_id` | string | no | Set on clawback rows. |
| `memo` | string | yes | Plain-English line shown in the wallet ledger. |

Referenced by: `money_clock`.

References: `brand_id -> brands`, `bounty_id -> bounties`, `post_id -> posts`, `submission_id -> submissions`, `creator_id -> creators`, `conversion_id -> conversions`, `ad_id -> ads`, `payout_id -> payouts`, `invoice_id -> invoices`.

#### Payout (`payouts`)

Money leaving flowd to a creator's bank. Weekly (Fri 18:00 UTC, free) or instant (1.5% fee, min $0.50, max $15).

Id prefix: `pay_`. Fixture: `payouts.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `kind` | enum PayoutKind | yes |  |
| `status` | enum PayoutStatus | yes |  |
| `gross_cents` | cents | yes | Sum of the cleared earning rows included. |
| `fee_cents` | cents | yes | Instant fee; 0 for weekly and for free instant perks. |
| `net_cents` | cents | yes | gross_cents - fee_cents. |
| `run_id` | string | no | Weekly run id "run_YYYY-MM-DD" (the Friday). Matches payout_runs. |
| `requested_at` | iso | yes |  |
| `scheduled_for` | iso | yes | For weekly: the Friday 18:00 UTC run. For instant: requested_at. |
| `initiated_at` | iso | no |  |
| `paid_at` | iso | no |  |
| `failed_reason` | string | no |  |
| `hold_reason` | enum HoldReason | no |  |
| `method_label` | string | yes | e.g. "Bank account ••4821". |
| `stripe_transfer_id` | string | no | Mock "tr_<n>". |
| `ledger_txn_id` | string | no | The payout transaction (creator -gross, bank +net, fees +fee). |
| `item_count` | int | yes | Earning rows included. |
| `tier_at_payout` | enum Tier | yes |  |
| `free_instant` | bool | yes | A tier perk made this instant payout free. |
| `proof_id` | string | yes | "prf_<8 chars>". Public proof page joinflowd.io/p/<proof_id>; ext proofs.json has the row. |

Referenced by: `disputes`, `ledger`, `money_clock`, `proofs`.

References: `creator_id -> creators`.

#### Invoice (`invoices`)

A brand invoice (funding, subscription, ad fee, renewals) with finance-pack fields.

Id prefix: `inv_`. Fixture: `invoices.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `brand_id` | -> brands | yes |  |
| `number` | string | yes | "FD-2026-0042". |
| `kind` | enum InvoiceKind | yes |  |
| `status` | enum InvoiceStatus | yes |  |
| `bounty_id` | -> bounties | no |  |
| `line_items` | LineItem[] | yes |  |
| `subtotal_cents` | cents | yes |  |
| `processing_cents` | cents | yes |  |
| `tax_cents` | cents | yes |  |
| `total_cents` | cents | yes | subtotal + processing + tax. For funding invoices this is the card charge. |
| `po_number` | string | no |  |
| `cost_center` | string | no |  |
| `vat_id` | string | no |  |
| `reverse_charge` | bool | yes |  |
| `issued_at` | iso | yes |  |
| `due_at` | iso | yes |  |
| `paid_at` | iso | no |  |
| `ledger_txn_id` | string | no |  |
| `pdf_ref` | string | yes | Mock file name, e.g. "FD-2026-0042.pdf". |

Referenced by: `ledger`.

References: `brand_id -> brands`, `bounty_id -> bounties`, `line_items[].bounty_id -> bounties`, `line_items[].ad_id -> ads`.

#### MoneyClockRow (`money_clock`)

The Money Clock: one earning row with its state, a dated ETA and a named reason. A projection of posts, conversions and the ledger. Never a bare "pending".

Id prefix: `mc_`. Fixture: `money_clock.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `app_id` | -> apps | yes |  |
| `post_id` | -> posts | no |  |
| `conversion_id` | -> conversions | no |  |
| `source` | enum MoneyClockSource | yes |  |
| `state` | enum MoneyClockState | yes |  |
| `amount_cents` | cents | yes | Current amount. For accruing rows a live estimate. |
| `estimated` | bool | yes | True while accruing. |
| `earned_at` | iso | yes | When the earning started accruing. |
| `eta_at` | iso | no | When it moves to the next state. Required for accruing, pending and cleared rows. |
| `reason` | enum MoneyClockReason | yes |  |
| `reason_text` | string | yes | Plain English with the date, e.g. "Clears Sat 2:00 PM UTC after the view check." |
| `label` | string | yes | e.g. "Lumi: Glow-up reveal". |
| `ledger_id` | -> ledger | no | The creator earning row; absent while accruing. |
| `payout_id` | -> payouts | no |  |
| `cleared_at` | iso | no |  |
| `paid_at` | iso | no |  |

References: `creator_id -> creators`, `bounty_id -> bounties`, `app_id -> apps`, `post_id -> posts`, `conversion_id -> conversions`, `ledger_id -> ledger`, `payout_id -> payouts`.

#### PayoutRun (`payout_runs`)

A weekly payout run: Fridays 18:00 UTC. A projection of the payouts it created, with named holds. id = run_<YYYY-MM-DD> of the Friday.

Id prefix: `run_`. Fixture: `payout_runs.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | run_<YYYY-MM-DD>. |
| `run_date` | date | yes |  |
| `scheduled_for` | iso | yes | Friday 18:00:00Z. |
| `status` | enum RunStatus | yes |  |
| `payouts_count` | int | yes | Equals the count of payouts with this run_id. |
| `total_gross_cents` | cents | yes |  |
| `total_fee_cents` | cents | yes | Always 0 for weekly runs. |
| `total_net_cents` | cents | yes |  |
| `paid_count` | int | yes |  |
| `failed_count` | int | yes |  |
| `held_count` | int | yes |  |
| `held_cents` | cents | yes |  |
| `holds` | HoldSummary[] | yes |  |
| `initiated_at` | iso | no |  |
| `completed_at` | iso | no |  |


### Bounties

#### Bounty (`bounties`)

A funded offer to creators. Cannot be live until fully escrowed (the Funded badge). Money fields reconcile with the ledger: escrow_funded = reserved + spent + remaining + refunded.

Id prefix: `bnty_`. Fixture: `bounties.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `app_id` | -> apps | yes |  |
| `brand_id` | -> brands | yes | Denormalised from the app. |
| `owner_member_id` | -> brand_members | no | The one named owner of the review queue for this bounty. Absent on platform bounties. |
| `created_by_member_id` | -> brand_members | no |  |
| `title` | string | yes |  |
| `type` | enum BountyType | yes |  |
| `status` | enum BountyStatus | yes |  |
| `visibility` | enum Visibility | yes |  |
| `funding_source` | enum FundingSource | yes |  |
| `is_first_bounty` | bool | yes | The brand's first bounty: fee waived and matched budget up to $500. |
| `is_starter` | bool | yes | A flowd-funded small starter bounty for new creators (First-Dollar Path). |
| `featured` | bool | yes | Pinned at the top of the feed (flat weekly fee). |
| `featured_until` | iso | no |  |
| `cpm_cents` | cents | yes | Cents per 1,000 verified views inside the 72h window. 0 for cpa, install_only and direct. |
| `cpa_install_cents` | cents | yes |  |
| `cpa_trial_cents` | cents | yes |  |
| `cpa_paid_cents` | cents | yes |  |
| `flat_fee_cents` | cents | yes | Direct bounties only; 0 otherwise. |
| `ad_commission_rate` | ratio | yes | 0.10 default; applies if the post is promoted as an ad (60 days). |
| `per_video_cap_cents` | cents | yes | Max pool pay (CPM + CPA) for one post. Default $250. |
| `per_creator_cap_cents` | cents | no |  |
| `budget_cents` | cents | yes | The creator-pay pool B. |
| `take_rate` | ratio | yes | Plan take rate at funding time (12% / 10% / 8%, 6% for cpa / install_only, 0 when waived). |
| `fee_reserve_cents` | cents | yes | round(budget_cents x take_rate). Held in escrow with the budget. |
| `escrow_funded_cents` | cents | yes | Total locked in escrow: wallet funding plus matched_cents. 0 until funded. |
| `matched_cents` | cents | yes | flowd matched budget included in escrow_funded_cents. |
| `funded` | bool | yes | The Funded badge. True when escrow_funded_cents >= budget_cents + fee_reserve_cents. |
| `funded_at` | iso | no |  |
| `reserved_cents` | cents | yes | Sum of open submissions' reserved_cents. |
| `spent_cents` | cents | yes | Creator pay + fees already settled out of escrow. |
| `remaining_cents` | cents | yes | Unreserved, unspent escrow available for new reservations. |
| `refunded_cents` | cents | yes | Returned to the wallet at settlement. 0 until settled. |
| `brief` | Brief | yes |  |
| `rights_card` | RightsCard | yes |  |
| `deliverables` | Deliverables | yes |  |
| `eligibility` | Eligibility | yes |  |
| `brief_lint` | BriefLint | yes |  |
| `lint_overrides` | LintOverride[] | no | Ops overrides of lint findings (admin log). |
| `pay_math` | PayMath | yes |  |
| `format_ids` | enum FormatId[] | yes | Recommended formats, best first. |
| `art` | ArtSeed | yes | Generated bounty cover. |
| `starts_at` | iso | yes |  |
| `ends_at` | iso | yes |  |
| `published_at` | iso | no |  |
| `first_submission_at` | iso | no |  |
| `filled_at` | iso | no | When remaining_cents first fell below one reservation unit. |
| `time_to_fill_hours` | number | no |  |
| `ended_at` | iso | no |  |
| `settled_at` | iso | no |  |
| `review_sla_hours` | int | yes | Default 72. |
| `counts` | BountyCounts | yes |  |
| `funnel` | FunnelCounts | yes | Lifetime funnel of the bounty's posts. |
| `all_in_cpm_cents` | cents | yes | The brand's all-in effective CPM: round(card_charge x cpm / budget) (FORMULAS: funding). 0 when cpm_cents is 0 (cpa, install_only, direct). |
| `created_at` | iso | yes |  |
| `updated_at` | iso | yes |  |

Referenced by: `ads`, `attribution_links`, `auctions`, `auto_approve_rules`, `bounty_saves`, `compliance_checks`, `conversions`, `daily_drops`, `disputes`, `fatigue_alerts`, `feedback_notes`, `fraud_flags`, `invoices`, `ledger`, `money_clock`, `offer_code_pool`, `offers`, `posts`, `rights_grants`, `specs`, `submissions`, `test_plans`, `threads`, `ticker`, `tournaments`.

References: `app_id -> apps`, `brand_id -> brands`, `owner_member_id -> brand_members`, `created_by_member_id -> brand_members`, `brief.example_post_ids[] -> posts`, `lint_overrides[].by_user_id -> users`.


### Content

#### Format (`formats`)

A winning app-ad format template (11). The Studio supplies the beat structure, script, shot list, timing and checks. Exactly one row per FormatId; id is the FormatId value.

Key: `id`. Id prefix: `tmpl_`. Fixture: `formats.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | Equals a FormatId value (tmpl_screen_reaction ...). |
| `name` | string | yes |  |
| `summary` | text | yes |  |
| `rank` | int | yes | 1 to 11, library order. |
| `mvp` | bool | yes | One of the first six formats. |
| `beats` | FormatBeat[] | yes |  |
| `min_duration_s` | int | yes |  |
| `max_duration_s` | int | yes |  |
| `difficulty` | enum Difficulty | yes |  |
| `faceless` | bool | yes |  |
| `best_for_categories` | enum Category[] | yes |  |
| `best_for_niches` | enum Niche[] | yes |  |
| `hook_types` | enum HookType[] | yes | Hook types that pair well. |
| `recommended_cta` | enum CtaType[] | yes |  |
| `example_script` | text | yes | A fill-in script with {app} and {feature} slots. |
| `shot_list` | string[] | yes |  |
| `why_it_works` | text | yes |  |
| `stats` | FormatStats | yes |  |
| `art` | ArtSeed | yes |  |

#### Hook (`hooks`)

A fill-in hook from the hook library (7 types, 10 or more per type), pre-filled with the app's name and features at use time.

Id prefix: `hook_`. Fixture: `hooks.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `hook_type` | enum HookType | yes |  |
| `template` | string | yes | With {app}, {feature} and {number} slots. |
| `fill_slots` | string[] | yes |  |
| `applies_to` | enum FormatId[] | yes |  |
| `examples` | HookExample[] | yes | Three or more category examples. |
| `when_to_use` | text | yes |  |
| `stats` | HookStats | yes |  |


### Submissions

#### Submission (`submissions`)

A creator's video for a bounty. Versioned: v2 does not overwrite v1. Takes a reservation of the per-video cap on submit.

Id prefix: `sub_`. Fixture: `submissions.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `creator_id` | -> creators | yes |  |
| `brand_id` | -> brands | yes |  |
| `app_id` | -> apps | yes |  |
| `status` | enum SubmissionStatus | yes |  |
| `version` | int | yes | Current version number (1-based). Equals versions.length. |
| `versions` | SubmissionVersion[] | yes | All versions, oldest first. |
| `source` | enum SubmissionSource | yes |  |
| `format_id` | enum FormatId | no |  |
| `title` | string | yes | Short internal title, e.g. "Confession hook v2". |
| `revision_round` | int | yes | Revision rounds used (0 to 2 free; more are paid by the brand). |
| `reserved_cents` | cents | yes | Reservation held against the bounty pool: per_video_cap x (1 + take_rate) while open; 0 once settled, rejected or withdrawn. |
| `flow_band` | enum ScoreBand | yes | Current version. |
| `flow_points` | int | yes |  |
| `hook_band` | enum ScoreBand | yes |  |
| `hook_points` | int | yes |  |
| `rights_card` | RightsCard | yes | Snapshot of the bounty Rights Card the creator accepted at submit; later edits to the bounty do not change it. |
| `rights_accepted_at` | iso | yes | Equals submitted_at. |
| `fraud_evidence` | FraudEvidence | yes |  |
| `submitted_at` | iso | yes | First submission time (v1). |
| `sla_due_at` | iso | no | submitted_at of the current version + review_sla_hours. Present while in review. |
| `sla_state` | enum SlaState | yes |  |
| `sla_breached_at` | iso | no |  |
| `decision` | Decision | no | The latest decision. |
| `auto_approved` | bool | yes |  |
| `approved_at` | iso | no |  |
| `post_id` | -> posts | no |  |
| `link_id` | -> attribution_links | no | Issued at approval. |
| `posted_at` | iso | no |  |
| `released_at` | iso | no |  |
| `updated_at` | iso | yes |  |

Referenced by: `bounty_saves`, `compliance_checks`, `disputes`, `feedback_notes`, `ledger`, `posts`, `rights_grants`, `specs`, `submissions`, `test_plans`, `threads`, `tournament_entries`, `video_analyses`.

References: `bounty_id -> bounties`, `creator_id -> creators`, `brand_id -> brands`, `app_id -> apps`, `fraud_evidence.duplicate_of_submission_id -> submissions`, `decision.decided_by_user_id -> users`, `post_id -> posts`, `link_id -> attribution_links`.

#### VideoAnalysis (`video_analyses`)

Machine analysis of one submission version: transcript, scenes, beats, hook, QA checks and checklist scores. One row per (submission, version).

Id prefix: `va_`. Fixture: `video_analyses.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | va_<submission number>_v<version>. |
| `submission_id` | -> submissions | yes |  |
| `version` | int | yes |  |
| `duration_ms` | int | yes |  |
| `language` | string | yes |  |
| `transcript` | TranscriptSegment[] | yes |  |
| `transcript_text` | text | yes | The segments joined with spaces. |
| `on_screen_text` | OnScreenText[] | yes |  |
| `scenes` | SceneCut[] | yes |  |
| `hook` | HookAnalysis | yes |  |
| `beats` | BeatHit[] | yes |  |
| `tags` | VideoTags | yes |  |
| `checks` | QaCheck[] | yes | One entry per QaCheckType that ran. |
| `hook_score` | ScoreCard | yes | Hook Score checklist (weights sum to 100). |
| `flow_score` | ScoreCard | yes | Flow Score checklist (weights sum to 100). |
| `phash` | string | yes | 16 hex chars: perceptual hash for duplicate detection. |
| `duplicate_of_submission_id` | -> submissions | no |  |
| `analysed_at` | iso | yes |  |

References: `submission_id -> submissions`, `checks[].waived_by_user_id -> users`, `duplicate_of_submission_id -> submissions`.

#### FeedbackNote (`feedback_notes`)

A timecoded feedback note on a submission version: anchored to a moment in the video, with a category and a severity. Must-fix notes carry over to the next version until the creator ticks them off. Qa_checks live inside video_analyses.checks.

Id prefix: `note_`. Fixture: `feedback_notes.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `submission_id` | -> submissions | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `creator_id` | -> creators | yes |  |
| `version` | int | yes | The submission version the note was written on. |
| `author_member_id` | -> brand_members | yes |  |
| `t_ms` | int | yes | Position in the video. |
| `t_end_ms` | int | no | End of a range, when the note covers a span. |
| `category` | enum FeedbackCategory | yes |  |
| `severity` | enum FeedbackSeverity | yes |  |
| `status` | enum FeedbackStatus | yes |  |
| `body` | text | yes | About the video, never the person. |
| `reason_code` | enum ReasonCode | no | Set when the note supports a request-changes or reject decision. |
| `resolved_in_version` | int | no |  |
| `resolved_at` | iso | no |  |
| `created_at` | iso | yes |  |

References: `submission_id -> submissions`, `bounty_id -> bounties`, `creator_id -> creators`, `author_member_id -> brand_members`.


### Posts

#### Post (`posts`)

A posted video on a creator's own account. Opens the 72-hour view window. Money legs settle on the ledger.

Id prefix: `post_`. Fixture: `posts.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `submission_id` | -> submissions | yes |  |
| `creator_id` | -> creators | yes |  |
| `brand_id` | -> brands | yes |  |
| `app_id` | -> apps | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `social_account_id` | -> social_accounts | yes |  |
| `platform` | enum Platform | yes |  |
| `platform_post_id` | string | yes | Fictional platform id. |
| `url` | string | yes | Fictional post URL on the platform domain (text only). |
| `caption` | text | yes | Includes the auto-disclosure (#ad + brand wording). |
| `hashtags` | string[] | yes |  |
| `thumb` | ArtSeed | yes |  |
| `duration_ms` | int | yes |  |
| `posted_at` | iso | yes |  |
| `window_ends_at` | iso | yes | posted_at + 72 hours. |
| `status` | enum PostStatus | yes |  |
| `hold_reason` | enum HoldReason | no | Required when status = held. |
| `cleared_at` | iso | no |  |
| `paid_at` | iso | no |  |
| `removed_at` | iso | no |  |
| `tracking_link_id` | -> attribution_links | yes |  |
| `promo_code` | string | no |  |
| `views` | int | yes | Latest verified views (lifetime, as of now). Equals the sum of post_metrics_daily.views; never less than window_views and never less than the last view snapshot. |
| `window_views` | int | yes | Verified views counted for CPM pay: views at window_ends_at (or so far, while live). Never more than views. |
| `views_invalid` | int | yes | Views reversed after proven fraud (0 normally). |
| `likes` | int | yes |  |
| `comments` | int | yes |  |
| `shares` | int | yes |  |
| `saves` | int | yes |  |
| `retention` | Retention | yes |  |
| `funnel` | FunnelCounts | yes | Lifetime funnel. Equals the sum of post_metrics_daily and tracked conversions. |
| `earnings` | EarningsBreakdown | yes |  |
| `fraud` | FraudAssessment | yes |  |
| `flow_band` | enum ScoreBand | yes | Band at submission. |
| `ad_id` | -> ads | no |  |
| `is_winner` | bool | yes | Flagged as a winner (top decile on trial rate for its bounty); eligible for Winner promotion. |
| `why_it_won` | string[] | no | Plain-English "why it won" reasons written after settlement, e.g. "Hook landed at 1.4 s", "App on screen by 0:02". |
| `tags` | VideoTags | yes |  |

Referenced by: `ads`, `attribution_links`, `audit_reports`, `bounties`, `compliance_checks`, `conversions`, `creators`, `disputes`, `fatigue_alerts`, `fraud_flags`, `ledger`, `money_clock`, `offers`, `post_metrics_daily`, `post_metrics_hourly`, `rights_grants`, `submissions`, `test_plans`, `view_snapshots`, `wrapped`.

References: `submission_id -> submissions`, `creator_id -> creators`, `brand_id -> brands`, `app_id -> apps`, `bounty_id -> bounties`, `social_account_id -> social_accounts`, `tracking_link_id -> attribution_links`, `ad_id -> ads`.

#### ViewSnapshot (`view_snapshots`)

A View Ledger snapshot: a timestamped, source-labelled view count of a post. 13 snapshots across the 72h window (every 6h, t = 0..72h, fewer while the window is still open), then one every 7 days until now. The snapshot at window_ends_at has views_verified equal to the post's window_views.

Id prefix: `vsn_`. Fixture: `view_snapshots.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `post_id` | -> posts | yes |  |
| `taken_at` | iso | yes |  |
| `views_reported` | int | yes | What the platform reported. |
| `views_verified` | int | yes | After fraud filtering. Non-decreasing per post. |
| `views_invalid` | int | yes | Cumulative views excluded at this snapshot: views_reported - views_verified. |
| `exclusions` | ViewExclusion[] | no | Why views were excluded, in plain words. When present, the views add up to views_invalid. |
| `delta_verified` | int | yes | views_verified minus the previous snapshot. |
| `source` | enum SnapshotSource | yes |  |
| `sources` | map<ratio> (keys: TrafficSource) | no | Traffic-source mix summing to 1. |
| `geo` | map<ratio> (keys: Country) | no | Audience country mix summing to 1. |
| `flags` | enum SnapshotFlag[] | yes |  |
| `fraud_score` | int | yes |  |
| `note` | string | no |  |

References: `post_id -> posts`.

#### PostMetricsDaily (`post_metrics_daily`)

Per-post daily metrics (UTC day). Sums equal the post's lifetime numbers. Key: (post_id, date).

Key: `post_id` + `date`. Id prefix: none. Fixture: `post_metrics_daily.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `post_id` | -> posts | yes |  |
| `date` | date | yes |  |
| `views` | int | yes |  |
| `likes` | int | yes |  |
| `comments` | int | yes |  |
| `shares` | int | yes |  |
| `saves` | int | yes |  |
| `clicks` | int | yes | Tracked visits (link clicks + code lookups). |
| `installs` | int | yes | Tracked (link + code) installs. |
| `trials` | int | yes |  |
| `paid` | int | yes |  |
| `est_installs` | int | yes | MMP + survey + modelled. |
| `est_trials` | int | yes |  |
| `est_paid` | int | yes |  |

References: `post_id -> posts`.

#### PostMetricsHourly (`post_metrics_hourly`)

Per-post hourly deltas for the most recent days (UTC dates from 2026-09-30 to now), the training-data grain. Sums over a UTC day equal the daily row. Key: (post_id, ts).

Key: `post_id` + `ts`. Id prefix: none. Fixture: `post_metrics_hourly.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `post_id` | -> posts | yes |  |
| `ts` | iso | yes | Start of the hour. |
| `views` | int | yes | Views during this hour (delta). |
| `likes` | int | yes |  |
| `comments` | int | yes |  |
| `shares` | int | yes |  |
| `fraud_score` | int | yes |  |

References: `post_id -> posts`.

#### AppMetricsDaily (`app_metrics_daily`)

Per-app daily rollup of post metrics and spend (derived; equals the sum of its posts' daily rows). Key: (app_id, date).

Key: `app_id` + `date`. Id prefix: none. Fixture: `app_metrics_daily.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `app_id` | -> apps | yes |  |
| `date` | date | yes |  |
| `views` | int | yes |  |
| `clicks` | int | yes |  |
| `installs` | int | yes |  |
| `trials` | int | yes |  |
| `paid` | int | yes |  |
| `est_installs` | int | yes |  |
| `est_trials` | int | yes |  |
| `est_paid` | int | yes |  |
| `revenue_cents` | cents | yes | First-payment revenue of tracked paid conversions that day. |
| `posts_live` | int | yes | Posts in their window that day. |
| `new_posts` | int | yes |  |
| `new_submissions` | int | yes |  |
| `approvals` | int | yes |  |
| `creator_pay_cents` | cents | yes | Creator earnings settled out of escrow that day. |
| `fee_cents` | cents | yes | Platform fees settled that day. |

References: `app_id -> apps`.


### Attribution

#### Conversion (`conversions`)

A batch of identical funnel events: (post, kind, source, UTC day). quantity > 1 means several events. CPA is paid only when source is link or code.

Id prefix: `conv_`. Fixture: `conversions.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `post_id` | -> posts | yes |  |
| `link_id` | -> attribution_links | yes |  |
| `app_id` | -> apps | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `creator_id` | -> creators | yes |  |
| `kind` | enum ConversionKind | yes |  |
| `source` | enum ConversionSource | yes |  |
| `confidence` | enum ConversionConfidence | yes | link/code = deterministic, mmp = matched, survey = self_reported, modelled = modelled. |
| `quantity` | int | yes | >= 1. |
| `occurred_on` | date | yes |  |
| `first_at` | iso | yes |  |
| `revenue_cents` | cents | yes | Gross first-payment revenue of the batch (paid only; 0 otherwise). |
| `country` | enum Country | no |  |
| `status` | enum ConversionStatus | yes |  |
| `payable` | bool | yes | True only for deterministic sources that are not rejected or refunded. |
| `capped` | bool | yes | The per-video cap stopped CPA pay for (part of) this batch. |
| `cleared_at` | iso | no |  |
| `ledger_txn_id` | string | no | The cpa settlement transaction (txn_<n>). |
| `reject_reason` | string | no |  |

Referenced by: `ledger`, `money_clock`, `revenuecat_events`.

References: `post_id -> posts`, `link_id -> attribution_links`, `app_id -> apps`, `bounty_id -> bounties`, `creator_id -> creators`.

#### AttributionLink (`attribution_links`)

A per-creator, per-bounty tracking link (deferred deep link) plus an optional promo code. Issued at approval.

Id prefix: `lnk_`. Fixture: `attribution_links.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `app_id` | -> apps | yes |  |
| `post_id` | -> posts | no | Set when the post exists. |
| `code` | string | yes | Short slug, e.g. "maya-lumi7". Unique. |
| `short_url` | string | yes | joinflowd.io/r/<code>. |
| `deep_link` | string | yes | Fictional app scheme, e.g. "lumi://r/maya-lumi7". |
| `promo_code` | string | no | From the offer-code pool, e.g. "MAYA-LUMI". Pooled and rotated, not one code per creator forever. |
| `status` | enum AttributionLinkStatus | yes |  |
| `created_at` | iso | yes |  |
| `clicks` | int | yes | Equals the post funnel clicks. |
| `installs` | int | yes |  |
| `trials` | int | yes |  |
| `paid` | int | yes |  |
| `last_click_at` | iso | no |  |

Referenced by: `conversions`, `offer_code_pool`, `posts`, `revenuecat_events`, `submissions`.

References: `creator_id -> creators`, `bounty_id -> bounties`, `app_id -> apps`, `post_id -> posts`.

#### RevenueCatEvent (`revenuecat_events`)

An ingested RevenueCat webhook event (lowercase mirror). Matched to a creator by subscriber attributes or offer code; CPA pays only when it confirms a link or code conversion. Redeliveries are idempotent.

Id prefix: `rce_`. Fixture: `revenuecat_events.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `app_id` | -> apps | yes |  |
| `event_type` | enum RcEventType | yes |  |
| `period_type` | enum PeriodType | yes |  |
| `app_user_id` | string | yes | RevenueCat anonymous id, e.g. "$RCAnonymousID:3f9a...". |
| `product_id` | string | yes | Subscription SKU, e.g. "lumi_pro_annual". |
| `price_cents` | cents | yes | Price paid in this period after store fees (0 for trials). |
| `currency` | string | yes | "USD". |
| `is_trial_conversion` | bool | yes |  |
| `offer_code` | string | no |  |
| `subscriber_attributes` | map<string> | yes | flowd_link (tracking code) and flowd_creator when the SDK snippet is installed. |
| `environment` | string | yes | "production" or "sandbox". |
| `purchased_at` | iso | yes |  |
| `expiration_at` | iso | no |  |
| `received_at` | iso | yes |  |
| `match_status` | enum RcMatchStatus | yes |  |
| `matched_conversion_id` | -> conversions | no |  |
| `matched_link_id` | -> attribution_links | no |  |
| `matched_creator_id` | -> creators | no |  |
| `idempotency_key` | string | yes | The RevenueCat event id. |

References: `app_id -> apps`, `matched_conversion_id -> conversions`, `matched_link_id -> attribution_links`, `matched_creator_id -> creators`.

#### OfferCode (`offer_code_pool`)

A code in an app's offer-code pool. Apple caps active offer codes at 10 per subscription SKU, so flowd rotates a pool (never one code per creator forever) and always falls back to the deterministic link. Active = available or assigned.

Id prefix: `occ_`. Fixture: `offer_code_pool.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `app_id` | -> apps | yes |  |
| `sku` | string | yes | Subscription SKU, e.g. "lumi_pro_annual". |
| `offer_name` | string | yes | e.g. "7-day free trial". |
| `code` | string | yes | e.g. "MAYA-LUMI". Unique per app. |
| `status` | enum OfferCodeStatus | yes |  |
| `assigned_creator_id` | -> creators | no |  |
| `assigned_bounty_id` | -> bounties | no |  |
| `assigned_link_id` | -> attribution_links | no |  |
| `assigned_at` | iso | no |  |
| `redemptions` | int | yes |  |
| `max_redemptions` | int | yes | Apple custom codes: up to 25,000. |
| `valid_from` | iso | yes |  |
| `valid_until` | iso | yes |  |
| `rotation_due_at` | iso | no |  |
| `created_at` | iso | yes |  |

References: `app_id -> apps`, `assigned_creator_id -> creators`, `assigned_bounty_id -> bounties`, `assigned_link_id -> attribution_links`.


### Ads

#### Ad (`ads`)

Winner promotion: an organic post run as a Spark / partnership ad. Commission is 10% of ad-attributed revenue for 60 days; the platform fee is 1% of spend.

Id prefix: `ad_`. Fixture: `ads.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `post_id` | -> posts | yes |  |
| `brand_id` | -> brands | yes |  |
| `app_id` | -> apps | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `creator_id` | -> creators | yes |  |
| `platform` | enum AdPlatform | yes |  |
| `kind` | enum AdKind | yes |  |
| `status` | enum AdStatus | yes |  |
| `external_ad_id` | string | no | Fictional ad-platform id. |
| `spark_code` | string | no | Fictional Spark authorization code. |
| `code_duration_days` | int | no | One of 7, 30, 60, 365. |
| `code_expires_at` | iso | no |  |
| `permission_requested_at` | iso | yes |  |
| `permission_granted_at` | iso | no |  |
| `started_at` | iso | no |  |
| `ended_at` | iso | no |  |
| `daily_budget_cents` | cents | yes |  |
| `spend_cents` | cents | yes | Lifetime spend. Equals the sum of daily.spend_cents. |
| `impressions` | int | yes |  |
| `clicks` | int | yes |  |
| `installs` | int | yes |  |
| `trials` | int | yes |  |
| `paid` | int | yes |  |
| `revenue_cents` | cents | yes | Ad-attributed revenue (lifetime). |
| `commission_rate` | ratio | yes |  |
| `commission_window_ends_at` | iso | no | started_at + 60 days. |
| `commission_cents` | cents | yes | Commission accrued inside the window: commission_rate x revenue inside the window. |
| `platform_fee_cents` | cents | yes | 1% of spend_cents. |
| `daily` | AdDaily[] | yes |  |
| `fatigue` | FatigueInfo | no |  |
| `rights_ends_at` | iso | no | Ads stop automatically at this time. |

Referenced by: `fatigue_alerts`, `invoices`, `ledger`, `posts`, `rights_grants`.

References: `post_id -> posts`, `brand_id -> brands`, `app_id -> apps`, `bounty_id -> bounties`, `creator_id -> creators`.


### Market

#### MarketSeriesPoint (`market_series`)

Daily market data per category (the clearing CPM series). "Clearing CPM" = median CPM of bounties that filled or are live and receiving submissions.

Id prefix: `mkt_`. Fixture: `market_series.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | mkt_<category>_<YYYY-MM-DD>. |
| `category` | enum Category | yes |  |
| `date` | date | yes |  |
| `clearing_cpm_cents` | cents | yes | Median. |
| `p25_cpm_cents` | cents | yes |  |
| `p75_cpm_cents` | cents | yes |  |
| `open_bounties` | int | yes |  |
| `open_budget_cents` | cents | yes |  |
| `new_bounties` | int | yes |  |
| `submissions` | int | yes |  |
| `median_fill_hours` | number | yes |  |
| `median_views` | int | yes | Median verified views per post in the category (7-day trailing). |
| `trial_rate` | ratio | yes | Trials per install (7-day trailing). |
| `sample_n` | int | yes |  |

#### Ticker (`ticker`)

The public live payout ticker: totals plus recent events. Object-shaped file.

Id prefix: none. Fixture: `ticker.json` (object, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `totals` | TickerTotals | yes |  |
| `events` | TickerEvent[] | yes | Newest first; 40 to 80 events. |

References: `events[].creator_id -> creators`, `events[].bounty_id -> bounties`.

#### Offer (`offers`)

An offer between a brand and a creator: an invite to an open bounty, a direct offer bought from a rate card, or a re-buy of a winner. Carries the negotiation thread (max 3 counter rounds, 7-day expiry). Accepting a direct offer funds a private direct bounty from the brand wallet.

Id prefix: `offer_`. Fixture: `offers.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `kind` | enum OfferKind | yes |  |
| `status` | enum OfferStatus | yes | Says who has the ball: awaiting_creator or awaiting_brand. |
| `brand_id` | -> brands | yes |  |
| `app_id` | -> apps | yes |  |
| `creator_id` | -> creators | yes |  |
| `created_by_member_id` | -> brand_members | yes |  |
| `title` | string | yes | e.g. "Two new hooks on Glow-up reveal". |
| `bounty_id` | -> bounties | no | Invite: the open bounty. Direct / re-buy: the private direct bounty, set when the offer is accepted. |
| `rate_card_id` | -> rate_cards | no | The rate card the offer was bought from. |
| `rebuy_of_post_id` | -> posts | no | Re-buy: the winning post the new hooks are based on. |
| `amount_cents` | cents | yes | Current total price for the deliverables (the latest counter). 0 for invites, which pay the bounty's rates. |
| `original_amount_cents` | cents | yes | The opening amount. |
| `ask_cents` | cents | no | The creator's rate-card ask at the time, for comparison. |
| `suggested` | RateSuggestion | no | The market-suggested band shown inside the offer. |
| `take_rate` | ratio | yes | Brand plan take rate applied on top of the amount. |
| `all_in_cents` | cents | yes | amount_cents + round(amount_cents x take_rate): what the brand pays in total. |
| `deliverables` | Deliverables | yes |  |
| `rights_card` | RightsCard | yes |  |
| `turnaround_days` | int | yes |  |
| `message` | text | yes | The brand's opening note. |
| `rounds` | int | yes | Counter rounds used (0 to 3). |
| `escrow_funded` | bool | yes | True once the brand wallet funded the direct bounty (on accept). |
| `thread` | OfferMessage[] | yes | Oldest first. The first message is the opening offer. |
| `expires_at` | iso | yes | created_at + 7 days (reset on each counter). |
| `created_at` | iso | yes |  |
| `updated_at` | iso | yes |  |
| `accepted_at` | iso | no |  |
| `closed_at` | iso | no | Declined, expired, withdrawn or completed. |

Referenced by: `test_plans`, `threads`.

References: `brand_id -> brands`, `app_id -> apps`, `creator_id -> creators`, `created_by_member_id -> brand_members`, `bounty_id -> bounties`, `rate_card_id -> rate_cards`, `rebuy_of_post_id -> posts`, `thread[].author_user_id -> users`.

#### Auction (`auctions`)

A creator's sealed-bid auction for a few weekly slots (Platinum and Elite). Second price: the k highest bids win and all pay the highest losing bid, or the reserve if no losing bid exists.

Id prefix: `auc_`. Fixture: `auctions.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `title` | string | yes |  |
| `description` | text | yes |  |
| `status` | enum AuctionStatus | yes |  |
| `slots` | int | yes | 1 to 5. |
| `reserve_cents` | cents | yes | Minimum bid and the clearing price floor. |
| `deliverables` | Deliverables | yes |  |
| `rights_card` | RightsCard | yes |  |
| `opens_at` | iso | yes |  |
| `closes_at` | iso | yes | At least 72 hours after opens_at, at most 7 days. |
| `art` | ArtSeed | yes |  |
| `bids` | Bid[] | yes | All bids. Sealed: the API only shows a brand its own bid until the auction closes. |
| `bids_count` | int | yes |  |
| `clearing_price_cents` | cents | no | The uniform price winners pay. Set when awarded. |
| `winning_bid_ids` | string[] | no |  |
| `resulting_bounty_ids` | -> bounties[] | no | The private direct bounties created for the winners. |
| `awarded_at` | iso | no |  |
| `created_at` | iso | yes |  |
| `updated_at` | iso | yes |  |

References: `creator_id -> creators`, `bids[].brand_id -> brands`, `bids[].bidder_member_id -> brand_members`, `resulting_bounty_ids[] -> bounties`.

#### Spec (`specs`)

A pre-made, pre-scored video that brands can license off the shelf (Spec Market). Either made speculatively by a creator or released from a bounty after 30 unused days (the original brand keeps first refusal for 7 days).

Id prefix: `spec_`. Fixture: `specs.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `title` | string | yes |  |
| `description` | text | yes |  |
| `status` | enum SpecStatus | yes |  |
| `source` | enum SpecSource | yes |  |
| `art` | ArtSeed | yes | Generated spec cover. |
| `video` | VideoMeta | yes |  |
| `format_id` | enum FormatId | no |  |
| `hook_text` | string | yes |  |
| `hook_type` | enum HookType | yes |  |
| `category` | enum Category | yes | Best-fit app category. |
| `flow_band` | enum ScoreBand | yes |  |
| `flow_points` | int | yes | Must be 55 or more to list. |
| `hook_band` | enum ScoreBand | yes |  |
| `hook_points` | int | yes |  |
| `qa_pass` | int | yes |  |
| `qa_warn` | int | yes |  |
| `qa_fail` | int | yes |  |
| `tags` | VideoTags | yes |  |
| `price_cents` | cents | yes | Licence price to the creator (the brand pays the take rate on top). |
| `paid_ads_days` | int | yes | Paid-ad usage included. Default 90. |
| `exclusive` | bool | yes |  |
| `rights_card` | RightsCard | yes |  |
| `stats` | SpecStats | yes |  |
| `licenses` | SpecLicense[] | yes | stats.licenses equals licenses.length. |
| `source_submission_id` | -> submissions | no | Released-from-bounty specs only. |
| `source_bounty_id` | -> bounties | no |  |
| `source_brand_id` | -> brands | no | The brand holding first refusal. |
| `first_refusal_ends_at` | iso | no | released_at + 7 days. |
| `listed_at` | iso | no |  |
| `created_at` | iso | yes |  |
| `updated_at` | iso | yes |  |

References: `creator_id -> creators`, `licenses[].brand_id -> brands`, `source_submission_id -> submissions`, `source_bounty_id -> bounties`, `source_brand_id -> brands`.


### Rights

#### RightsGrant (`rights_grants`)

A usage-rights grant on a post: organic (always), paid-ad usage (default 90 days), a Spark code or a partnership permission. Powers the Rights Vault with expiry alerts at 30, 14 and 7 days.

Id prefix: `rg_`. Fixture: `rights_grants.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `post_id` | -> posts | yes |  |
| `submission_id` | -> submissions | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `brand_id` | -> brands | yes |  |
| `app_id` | -> apps | yes |  |
| `creator_id` | -> creators | yes |  |
| `scope` | enum RightsScope | yes |  |
| `status` | enum RightsGrantStatus | yes |  |
| `platform` | enum AdPlatform | no |  |
| `spark_code` | string | no | Fictional Spark authorization code (spark_code scope). |
| `code_duration_days` | int | no | One of 7, 30, 60, 365. |
| `starts_at` | iso | yes |  |
| `ends_at` | iso | no | Absent for organic posting, which has no end. |
| `base_fee_cents` | cents | yes | The fee renewals are priced from: the post's settled creator pay (or the flat fee for direct bounties). |
| `renewal_pct_per_30d` | ratio | yes | Default 0.25. |
| `renewal_price_cents` | cents | yes | round(base_fee_cents x renewal_pct_per_30d) per 30 days. |
| `renewals` | Renewal[] | yes |  |
| `alerts_sent` | int[] | yes | Subset of 30, 14, 7: the expiry alerts already sent. |
| `ad_id` | -> ads | no | The ad that depends on this grant. |
| `ai_likeness` | bool | yes | Always false in this build. |
| `revoked_at` | iso | no |  |
| `revoke_reason` | string | no |  |
| `created_at` | iso | yes |  |
| `updated_at` | iso | yes |  |

References: `post_id -> posts`, `submission_id -> submissions`, `bounty_id -> bounties`, `brand_id -> brands`, `app_id -> apps`, `creator_id -> creators`, `renewals[].requested_by_member_id -> brand_members`, `ad_id -> ads`.


### Trust

#### BrandScorecard (`brand_scorecards`)

Brand Scorecard: pay speed, decision time, approval fairness and the share of approved work actually run. Shown to creators before they apply.

Id prefix: `bsc_`. Fixture: `brand_scorecards.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | bsc_<brand slug>. |
| `brand_id` | -> brands | yes |  |
| `window_days` | int | yes | 90. |
| `as_of` | iso | yes |  |
| `decisions_n` | int | yes | Decisions in the window. |
| `approved_n` | int | yes |  |
| `decision_hours_median` | number | yes |  |
| `decision_hours_p90` | number | yes |  |
| `sla_breaches` | int | yes |  |
| `approval_rate` | ratio | yes |  |
| `rejection_rate` | ratio | yes |  |
| `appeals_n` | int | yes |  |
| `appeals_overturned` | int | yes |  |
| `run_rate` | ratio | yes | Share of approved work posted or used within 30 days. |
| `pays_on_time_ratio` | ratio | yes | Share of commissions, direct offers and top-ups funded without delay. |
| `pay_speed_hours_median` | number | yes | Median hours from payment due to funded (commissions, direct offers). |
| `reply_hours_median` | number | yes |  |
| `funded_always` | bool | yes | Every live bounty was fully escrowed. |
| `reliability_score` | int | yes | 0..100 (FORMULAS: brand reliability). |
| `band` | enum BrandBand | yes |  |
| `badges` | enum BrandBadge[] | yes |  |
| `trend_30d` | number | yes | Score change over 30 days. |

References: `brand_id -> brands`.

#### CreatorReputation (`creator_reputation`)

Fair creator reputation: finished work only, recency-weighted, shown with reasons. Never penalises multi-brand work or pending samples.

Id prefix: `rep_`. Fixture: `creator_reputation.json` (array, owner core).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | rep_<creator slug>. |
| `creator_id` | -> creators | yes |  |
| `as_of` | iso | yes |  |
| `provisional` | bool | yes | Fewer than 5 finished decisions: "Building history". Brands see a range, not a verdict. |
| `reliability_score` | int | yes |  |
| `approval_rate_finished` | ratio | yes | Recency-weighted (half-life 45 days). |
| `approval_rate_raw` | ratio | yes |  |
| `on_time_ratio` | ratio | yes |  |
| `post_through_ratio` | ratio | yes |  |
| `compliance_ratio` | ratio | yes |  |
| `clean_record_ratio` | ratio | yes |  |
| `finished_n` | int | yes |  |
| `fraud_flags_90d` | int | yes |  |
| `clawbacks_90d` | int | yes |  |
| `disputes_lost_90d` | int | yes |  |
| `academy_bonus_points` | number | yes |  |
| `components` | ReliabilityComponent[] | yes |  |
| `reasons` | string[] | yes | Plain-English reasons shown on the creator's own profile. |
| `tier_progress` | TierProgress | yes |  |

References: `creator_id -> creators`.

#### Dispute (`disputes`)

A dispute or appeal. One-tap from a post or a rejection; a human replies within 24 hours and resolves within 5 business days. Undisputed money is never blocked by a dispute on other items.

Id prefix: `disp_`. Fixture: `disputes.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `kind` | enum DisputeKind | yes |  |
| `status` | enum DisputeStatus | yes |  |
| `opened_by` | enum PartyKind | yes |  |
| `creator_id` | -> creators | no |  |
| `brand_id` | -> brands | yes | The brand on the other side of the dispute. |
| `bounty_id` | -> bounties | no |  |
| `submission_id` | -> submissions | no | Required for rejection_appeal. |
| `post_id` | -> posts | no |  |
| `payout_id` | -> payouts | no |  |
| `rejection_reason_code` | enum ReasonCode | no | rejection_appeal: the code being appealed. |
| `range_from` | iso | no | Snapshot range the dispute covers (view_count and flagged_botting). |
| `range_to` | iso | no |  |
| `reason` | string | yes |  |
| `note` | text | yes |  |
| `evidence` | Evidence[] | yes | Ledger and snapshot evidence attached automatically. |
| `amount_in_dispute_cents` | cents | yes |  |
| `events` | DisputeEvent[] | yes | Timeline, oldest first. |
| `opened_at` | iso | yes |  |
| `reply_due_at` | iso | yes | opened_at + 24 hours. |
| `first_reply_at` | iso | no |  |
| `resolution_due_at` | iso | yes | opened_at + 5 days (appeals: + 72 hours). |
| `resolved_at` | iso | no |  |
| `outcome` | enum DisputeOutcome | no |  |
| `outcome_text` | text | no |  |
| `adjustment_cents` | cents | no | Amount released or reversed on a (partly) upheld outcome. |
| `assigned_admin_user_id` | -> users | no |  |
| `updated_at` | iso | yes |  |

References: `creator_id -> creators`, `brand_id -> brands`, `bounty_id -> bounties`, `submission_id -> submissions`, `post_id -> posts`, `payout_id -> payouts`, `events[].user_id -> users`, `assigned_admin_user_id -> users`.

#### ScamReport (`scam_reports`)

A Scam Shield report from a creator or brand about a brand, bounty, creator, message or offer. Triage SLA 24 hours.

Id prefix: `scam_`. Fixture: `scam_reports.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `case_id` | string | yes | "SR-2026-0042". |
| `reporter_kind` | enum PartyKind | yes |  |
| `reporter_creator_id` | -> creators | no |  |
| `reporter_brand_id` | -> brands | no |  |
| `target_kind` | enum ReportTargetKind | yes |  |
| `target_id` | string | yes | The id of the target (brand, bounty, creator, message or offer). |
| `reason` | enum ScamReason | yes |  |
| `description` | text | yes |  |
| `evidence_refs` | string[] | yes | Message ids or screenshot names (mock). |
| `status` | enum ReportStatus | yes |  |
| `created_at` | iso | yes |  |
| `sla_due_at` | iso | yes | created_at + 24 hours. |
| `triaged_at` | iso | no |  |
| `resolved_at` | iso | no |  |
| `action_taken` | string | no | e.g. "Brand suspended, bounty removed". |
| `assigned_admin_user_id` | -> users | no |  |

References: `reporter_creator_id -> creators`, `reporter_brand_id -> brands`, `assigned_admin_user_id -> users`.

#### FraudFlag (`fraud_flags`)

A post in the admin fraud queue (fraud score 40 or above): evidence, money at stake and the decision. Delivered legitimate views are always paid; only proven fraud is clawed back.

Id prefix: `flag_`. Fixture: `fraud_flags.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `post_id` | -> posts | yes |  |
| `creator_id` | -> creators | yes |  |
| `brand_id` | -> brands | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `status` | enum FraudFlagStatus | yes |  |
| `score` | int | yes | Equals the post's fraud.score at flag time. |
| `band` | enum FraudBand | yes |  |
| `signals` | FraudSignalHit[] | yes |  |
| `curve_shape` | enum CurveShape | yes |  |
| `curve` | HourlyEnvelope | yes |  |
| `money_at_stake_cents` | cents | yes |  |
| `hold_placed` | bool | yes |  |
| `duplicate_of_post_id` | -> posts | no |  |
| `audience_us_ratio` | ratio | yes |  |
| `account_age_days` | int | yes |  |
| `opened_at` | iso | yes |  |
| `sla_due_at` | iso | yes | opened_at + 24 hours. |
| `reviewed_at` | iso | no |  |
| `reviewed_by_user_id` | -> users | no |  |
| `decision_note` | text | no |  |
| `invalid_views` | int | no | Views reversed when confirmed. |

References: `post_id -> posts`, `creator_id -> creators`, `brand_id -> brands`, `bounty_id -> bounties`, `duplicate_of_post_id -> posts`, `reviewed_by_user_id -> users`.

#### Verification (`verifications`)

An item in the admin verification queue: creator identity / age, brand business, tax, or payout method. Just-in-time for creators (at first approval).

Id prefix: `ver_`. Fixture: `verifications.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `subject_kind` | enum PartyKind | yes |  |
| `creator_id` | -> creators | no |  |
| `brand_id` | -> brands | no |  |
| `kind` | enum VerificationKind | yes |  |
| `status` | enum VerificationStatus | yes |  |
| `provider` | string | yes | e.g. "Stripe Identity (mock)". |
| `documents` | DocRef[] | yes |  |
| `submitted_at` | iso | yes |  |
| `sla_due_at` | iso | yes | submitted_at + 24 hours. |
| `decided_at` | iso | no |  |
| `decided_by_user_id` | -> users | no |  |
| `reason` | enum VerificationReason | no | Required when needs_info or rejected. |
| `note` | text | no |  |
| `blocks_payout` | bool | yes | True while the item holds money (creators) or the Verified badge (brands). |

References: `creator_id -> creators`, `brand_id -> brands`, `decided_by_user_id -> users`.

#### TaxProfile (`tax_profiles`)

A creator's Tax Desk profile: just-in-time W-9 or W-8BEN, year-to-date totals, 1099-NEC threshold progress and the set-aside estimate. Not tax advice.

Id prefix: `taxp_`. Fixture: `tax_profiles.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `status` | enum TaxStatus | yes |  |
| `form` | enum TaxForm | no |  |
| `legal_name` | string | no |  |
| `entity_type` | enum TaxEntityType | no |  |
| `tin_last4` | string | no | Only the last four digits are ever stored. |
| `address` | Address | no |  |
| `country` | enum Country | yes |  |
| `tax_year` | int | yes | 2026. |
| `ytd_cleared_cents` | cents | yes | Cleared and paid earnings in the tax year (excludes carry-over). |
| `ytd_paid_cents` | cents | yes |  |
| `threshold_cents` | cents | yes | 200000 ($2,000 for 2026 payments). |
| `threshold_progress` | ratio | yes | ytd_paid_cents / threshold_cents, capped at 1. |
| `form_1099_required` | bool | yes | US creators at or above the threshold. |
| `set_aside_rate` | ratio | yes | The creator's set-aside percentage (default 0.25). |
| `set_aside_cents` | cents | yes | round(ytd_cleared_cents x set_aside_rate). |
| `requested_at` | iso | no | First approval time. |
| `submitted_at` | iso | no |  |
| `verified_at` | iso | no |  |
| `expires_at` | iso | no | W-8BEN: three years after signing. |
| `updated_at` | iso | yes |  |

References: `creator_id -> creators`.

#### TaxDoc (`tax_docs`)

A tax document: a collected W-9 or W-8BEN, or an issued 1099-NEC.

Id prefix: `taxd_`. Fixture: `tax_docs.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `kind` | enum TaxDocKind | yes |  |
| `status` | enum TaxDocStatus | yes |  |
| `tax_year` | int | yes |  |
| `amount_cents` | cents | no | 1099-NEC box 1. |
| `file_ref` | string | yes | Mock file name, e.g. "W9-cr_maya.pdf". |
| `created_at` | iso | yes |  |
| `issued_at` | iso | no |  |

References: `creator_id -> creators`.

#### ComplianceAudit (`compliance_checks`)

The post-level compliance audit (disclosure audio + on-screen, caption, platform label, music, banned claims, AI label, tracking link). A failure blocks settlement until fixed or waived with a logged reason.

Id prefix: `cc_`. Fixture: `compliance_checks.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `post_id` | -> posts | yes |  |
| `submission_id` | -> submissions | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `brand_id` | -> brands | yes |  |
| `creator_id` | -> creators | yes |  |
| `checks` | ComplianceCheckItem[] | yes | One item per ComplianceCheckType (8). |
| `overall` | enum ComplianceResult | yes | fail if any check failed, else warn if any warned, else pass. |
| `blocks_settlement` | bool | yes | True when overall is fail and not waived or fixed. |
| `checked_at` | iso | yes |  |
| `waived_by_member_id` | -> brand_members | no |  |
| `waive_reason` | string | no |  |
| `fixed_at` | iso | no |  |

References: `post_id -> posts`, `submission_id -> submissions`, `bounty_id -> bounties`, `brand_id -> brands`, `creator_id -> creators`, `waived_by_member_id -> brand_members`.


### Growth

#### DailyDrop (`daily_drops`)

The Daily Drop: one drop a day at 16:00 UTC with real inventory. spots_left is always a true count; claims are 24-hour reserved places to submit. Unclaimed spots return to the open feed.

Id prefix: `drop_`. Fixture: `daily_drops.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | drop_<YYYY-MM-DD>. |
| `date` | date | yes |  |
| `release_at` | iso | yes | The date at 16:00:00Z. |
| `claim_window_ends_at` | iso | yes | release_at + 24 hours. |
| `status` | enum DropStatus | yes | upcoming before release_at, live after, sold_out when every spot is claimed, closed after the claim window. |
| `headline` | string | yes | e.g. "Six new bounties. Real spots." |
| `items` | DropItem[] | yes | Bounties released through the drop (visibility drop or open). |
| `spots_total` | int | yes | Sum of items.spots_total. |
| `spots_left` | int | yes | Sum of items.spots_left (a true count). |
| `claims_total` | int | yes | spots_total - spots_left. |
| `created_at` | iso | yes |  |

Referenced by: `bounty_saves`.

References: `items[].bounty_id -> bounties`, `items[].claims[].creator_id -> creators`.

#### Tournament (`tournaments`)

A sponsored tournament: a prize pool, hook battles in rounds (bracket) or a ranked leaderboard. Free entry. Prizes are paid as ledger rows of type prize from the platform promo account.

Id prefix: `tour_`. Fixture: `tournaments.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `title` | string | yes |  |
| `tagline` | string | yes |  |
| `description` | text | yes |  |
| `status` | enum TournamentStatus | yes |  |
| `format` | enum TournamentFormat | yes |  |
| `art` | ArtSeed | yes |  |
| `sponsor_brand_id` | -> brands | no | Absent when funded by flowd. |
| `sponsor_label` | string | yes | "flowd" or the sponsor brand name. |
| `prize_pool_cents` | cents | yes | Sum of prizes; at least $250. |
| `prizes` | Prize[] | yes |  |
| `rounds` | TournamentRound[] | yes | Empty for leaderboard format. |
| `rules` | string[] | yes |  |
| `min_tier` | enum Tier | no |  |
| `niche` | enum Niche | no |  |
| `bounty_id` | -> bounties | no | The brief entrants answer. |
| `entries_count` | int | yes | Equals the number of tournament_entries rows. |
| `announced_at` | iso | yes |  |
| `entries_open_at` | iso | yes |  |
| `starts_at` | iso | yes |  |
| `ends_at` | iso | yes |  |
| `winner_creator_ids` | -> creators[] | no | Set when complete. |
| `created_at` | iso | yes |  |

Referenced by: `tournament_entries`.

References: `sponsor_brand_id -> brands`, `rounds[].matchups[].entry_a_id -> tournament_entries`, `rounds[].matchups[].entry_b_id -> tournament_entries`, `rounds[].matchups[].winner_entry_id -> tournament_entries`, `bounty_id -> bounties`, `winner_creator_ids[] -> creators`.

#### TournamentEntry (`tournament_entries`)

A creator's entry in a tournament: one hook video.

Id prefix: `tent_`. Fixture: `tournament_entries.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `tournament_id` | -> tournaments | yes |  |
| `creator_id` | -> creators | yes |  |
| `status` | enum EntryStatus | yes |  |
| `hook_text` | string | yes |  |
| `submission_id` | -> submissions | no |  |
| `thumb` | ArtSeed | yes |  |
| `hook_points` | int | yes |  |
| `hook_band` | enum ScoreBand | yes |  |
| `seed` | int | yes | Bracket seed (1-based). |
| `round_reached` | int | yes |  |
| `placement` | int | no |  |
| `prize_cents` | cents | no |  |
| `entered_at` | iso | yes |  |
| `updated_at` | iso | yes |  |

Referenced by: `tournaments`.

References: `tournament_id -> tournaments`, `creator_id -> creators`, `submission_id -> submissions`.

#### Crew (`crews`)

A crew of 3 to 20 creators with a shared leaderboard and a platform-funded weekly goal bonus. Led by a Gold or above creator.

Id prefix: `crew_`. Fixture: `crews.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `name` | string | yes |  |
| `tagline` | string | yes |  |
| `art` | ArtSeed | yes | The crew badge. |
| `niche` | enum Niche | yes |  |
| `lead_creator_id` | -> creators | yes |  |
| `member_count` | int | yes | Equals the number of crew_members rows (3 to 20). |
| `open` | bool | yes | Anyone eligible can join without an invite. |
| `invite_code` | string | yes |  |
| `weekly_goal_cents` | cents | yes |  |
| `week_cleared_cents` | cents | yes | Sum of members' cleared earnings this ISO week. |
| `week_rank` | int | yes | Rank among all crews this week. |
| `bonus_earned_total_cents` | cents | yes | Platform-funded bonuses paid to the crew so far. |
| `lifetime_cleared_cents` | cents | yes |  |
| `created_at` | iso | yes |  |

Referenced by: `crew_members`.

References: `lead_creator_id -> creators`.

#### CrewMember (`crew_members`)

A creator in a crew.

Id prefix: `cmem_`. Fixture: `crew_members.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `crew_id` | -> crews | yes |  |
| `creator_id` | -> creators | yes |  |
| `role` | enum CrewRole | yes |  |
| `joined_at` | iso | yes |  |
| `week_cleared_cents` | cents | yes |  |
| `lifetime_cleared_cents` | cents | yes |  |

References: `crew_id -> crews`, `creator_id -> creators`.

#### Streak (`streaks`)

A creator's weekly posting streak. A week counts when the creator posts at least once in the ISO week (Monday to Sunday UTC). Earned freezes (1 per 4-week streak, max 2 banked), declared rest weeks, no inactivity penalty, no guilt copy.

Id prefix: `stk_`. Fixture: `streaks.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | stk_<creator slug>. |
| `creator_id` | -> creators | yes |  |
| `status` | enum StreakStatus | yes |  |
| `current_weeks` | int | yes | Equals creators.streak_weeks. |
| `best_weeks` | int | yes |  |
| `freezes_banked` | int | yes | 0 to 2. |
| `freezes_earned_total` | int | yes |  |
| `freezes_used_total` | int | yes |  |
| `rest_weeks_used_quarter` | int | yes | At most 2 per quarter. |
| `iso_week` | string | yes | The current ISO week, e.g. "2026-W40". |
| `posts_this_week` | int | yes |  |
| `posted_this_week` | bool | yes |  |
| `week_ends_at` | iso | yes | Sunday 23:59:59Z of the current ISO week. |
| `next_freeze_in_weeks` | int | yes | Weeks of streak until the next freeze is earned (0 to 3). |
| `history` | WeekRecord[] | yes | The last 12 ISO weeks, oldest first. |
| `updated_at` | iso | yes |  |

References: `creator_id -> creators`.

#### Leaderboard (`leaderboards`)

A weekly leaderboard: peer cohorts of about 30 by tier and niche (with a promotion zone and no demotion zone) plus public niche and global boards. Resets Monday 00:00 UTC.

Id prefix: `lb_`. Fixture: `leaderboards.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | lb_<iso week in lower case, e.g. 2026-w40>_<scope>_<tier\|all>_<niche\|all>_<metric>. |
| `scope` | enum LeaderboardScope | yes |  |
| `iso_week` | string | yes |  |
| `week_starts_at` | iso | yes |  |
| `reset_at` | iso | yes | Next Monday 00:00:00Z. |
| `metric` | enum LeaderboardMetric | yes |  |
| `tier` | enum Tier | no |  |
| `niche` | enum Niche | no |  |
| `label` | string | yes | e.g. "Silver · AI tools · Cohort 3". |
| `cohort_size` | int | yes | Equals entries.length. |
| `promotion_zone_size` | int | yes | Top 5 on cohort boards; 0 otherwise. |
| `entries` | LeaderboardEntry[] | yes | Ranked 1..n. Creators who opted out are excluded. |
| `updated_at` | iso | yes |  |

References: `entries[].creator_id -> creators`.

#### Referral (`referrals`)

A referral: single level, time-limited and platform-funded; the referred person is never charged. Creators earn 5% of a referee's cleared earnings for 90 days (capped at $100 per referee); agency partners earn 10% of platform fees for 12 months.

Id prefix: `ref_`. Fixture: `referrals.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `kind` | enum ReferralKind | yes |  |
| `status` | enum ReferralStatus | yes |  |
| `code` | string | yes |  |
| `referrer_creator_id` | -> creators | no |  |
| `referrer_brand_id` | -> brands | no | Agency partner referrals. |
| `referee_creator_id` | -> creators | no |  |
| `referee_brand_id` | -> brands | no |  |
| `referee_label` | string | yes | Public label: "@handle" or "A Silver creator". |
| `channel` | string | yes | "link" \| "code" \| "qr". |
| `invited_at` | iso | yes |  |
| `joined_at` | iso | no |  |
| `first_dollar_at` | iso | no |  |
| `reward_window_ends_at` | iso | no | first_dollar_at + 90 days (creators) or + 12 months (brands). |
| `reward_rate` | ratio | yes |  |
| `reward_cap_cents` | cents | yes |  |
| `reward_earned_cents` | cents | yes |  |
| `created_at` | iso | yes |  |
| `updated_at` | iso | yes |  |

References: `referrer_creator_id -> creators`, `referrer_brand_id -> brands`, `referee_creator_id -> creators`, `referee_brand_id -> brands`.

#### Lesson (`lessons`)

An Academy lesson: free, five minutes or less, never required. Ten core lessons; each has a quiz and a badge.

Id prefix: `lsn_`. Fixture: `lessons.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | lsn_<slug>. |
| `slug` | string | yes |  |
| `topic` | enum LessonTopic | yes |  |
| `order` | int | yes | 1 to 10. |
| `title` | string | yes |  |
| `summary` | string | yes |  |
| `read_minutes` | int | yes | 5 or fewer. |
| `blocks` | LessonBlock[] | yes |  |
| `quiz` | QuizQuestion[] | yes | Three questions. |
| `badge_label` | string | yes |  |
| `badge_art` | ArtSeed | yes |  |
| `reliability_bonus_points` | number | yes | 0.5 per completed lesson, capped at 5 across the Academy. |
| `completions` | int | yes |  |
| `avg_quiz_score` | ratio | yes |  |
| `updated_at` | iso | yes |  |

Referenced by: `lesson_progress`.

#### LessonProgress (`lesson_progress`)

A creator's progress on a lesson.

Id prefix: `lsp_`. Fixture: `lesson_progress.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `lesson_id` | -> lessons | yes |  |
| `status` | enum LessonStatus | yes |  |
| `quiz_score` | ratio | no |  |
| `started_at` | iso | no |  |
| `completed_at` | iso | no |  |
| `badge_awarded` | bool | yes |  |

References: `creator_id -> creators`, `lesson_id -> lessons`.

#### Trend (`trends`)

A Trend radar item: a rising or fading format, hook, topic or sound, built from public top ads and flowd's own settled winners.

Id prefix: `trend_`. Fixture: `trends.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `kind` | enum TrendKind | yes |  |
| `label` | string | yes |  |
| `description` | text | yes |  |
| `why_it_works` | text | yes |  |
| `direction` | enum TrendDirection | yes |  |
| `weekly_change_ratio` | number | yes | Week-on-week change in usage, e.g. 0.32 = +32%. |
| `sparkline` | number[] | yes | Eight weekly usage points, oldest first. |
| `format_id` | enum FormatId | no |  |
| `hook_type` | enum HookType | no |  |
| `categories` | enum Category[] | yes |  |
| `niches` | enum Niche[] | yes |  |
| `sample_posts` | int | yes |  |
| `sound_licensed_for_ads` | bool | no | Sounds only. false = flag on promotion. |
| `art` | ArtSeed | yes |  |
| `first_seen_at` | iso | yes |  |
| `updated_at` | iso | yes |  |

#### Wrapped (`wrapped`)

A creator's Wrapped recap (monthly or yearly): 8 to 10 story cards. The typical-creator card is always included.

Id prefix: `wrap_`. Fixture: `wrapped.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | wrap_<creator slug>_<YYYY-MM\|YYYY>. |
| `creator_id` | -> creators | yes |  |
| `period` | enum WrappedPeriod | yes |  |
| `label` | string | yes | e.g. "September 2026". |
| `period_start` | date | yes |  |
| `period_end` | date | yes |  |
| `total_cleared_cents` | cents | yes |  |
| `views_total` | int | yes |  |
| `posts_count` | int | yes |  |
| `trials_total` | int | yes |  |
| `best_post_id` | -> posts | no |  |
| `best_hook_text` | string | no |  |
| `best_hook_type` | enum HookType | no |  |
| `top_brand_id` | -> brands | no |  |
| `streak_weeks` | int | yes |  |
| `tier` | enum Tier | yes |  |
| `tier_median_cents` | cents | yes | The tier median for the period, shown beside the creator's number. |
| `cards` | WrappedCard[] | yes |  |
| `proof_id` | -> proofs | no |  |
| `created_at` | iso | yes |  |

References: `creator_id -> creators`, `best_post_id -> posts`, `top_brand_id -> brands`, `proof_id -> proofs`.

#### Proof (`proofs`)

A public proof page for an earnings claim (joinflowd.io/p/<id>): a payout, a month, a tier-up or a Wrapped. Always carries the tier median beside the number. Revocable by the creator.

Id prefix: `prf_`. Fixture: `proofs.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | prf_<8 lowercase alphanumerics>. |
| `kind` | enum ProofKind | yes |  |
| `creator_id` | -> creators | yes |  |
| `handle` | string | yes | Displayed handle (or "A Silver creator" when anonymous). |
| `anonymous` | bool | yes |  |
| `payout_id` | -> payouts | no |  |
| `period_label` | string | yes |  |
| `period_start` | date | yes |  |
| `period_end` | date | yes |  |
| `amount_cents` | cents | yes |  |
| `tier` | enum Tier | yes |  |
| `posts_count` | int | yes |  |
| `typical_median_cents` | cents | yes | Always shown beside the figure. |
| `typical_p25_cents` | cents | yes |  |
| `typical_p75_cents` | cents | yes |  |
| `ledger_hash` | string | yes | 12 lowercase hex characters: a hash of the ledger rows the claim rests on. |
| `art` | ArtSeed | yes |  |
| `revoked` | bool | yes |  |
| `page_views` | int | yes |  |
| `created_at` | iso | yes |  |

Referenced by: `wrapped`.

References: `creator_id -> creators`, `payout_id -> payouts`.

#### BountySave (`bounty_saves`)

A creator's relationship to a bounty: saved, joined (claimed or started in Studio) or submitted.

Id prefix: `save_`. Fixture: `bounty_saves.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `creator_id` | -> creators | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `stage` | enum SaveStage | yes |  |
| `saved_at` | iso | yes |  |
| `claimed_until` | iso | no | Daily Drop claim expiry (claim + 24 hours). |
| `drop_id` | -> daily_drops | no |  |
| `submission_id` | -> submissions | no |  |
| `updated_at` | iso | yes |  |

References: `creator_id -> creators`, `bounty_id -> bounties`, `drop_id -> daily_drops`, `submission_id -> submissions`.


### Platform

#### Notification (`notifications`)

A notification for a creator, brand member or admin. Cash events are delivered immediately outside quiet hours; everything else is batched inside them. Never a bare vanity ping.

Id prefix: `ntf_`. Fixture: `notifications.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `recipient_user_id` | -> users | yes |  |
| `audience` | enum ActorKind | yes | creator, brand or admin. |
| `kind` | enum NotificationKind | yes |  |
| `priority` | enum NotificationPriority | yes |  |
| `title` | string | yes |  |
| `body` | string | yes |  |
| `amount_cents` | cents | no | Cash events: "You just earned +$24". |
| `deep_link` | string | yes | iOS "flowd://payout/pay_x" for creators; web route for brands and admins. |
| `ref_kind` | string | no | Entity kind, e.g. "post". |
| `ref_id` | string | no |  |
| `batched` | bool | yes | Held for quiet hours and delivered later. |
| `created_at` | iso | yes |  |
| `delivered_at` | iso | no |  |
| `read_at` | iso | no |  |

References: `recipient_user_id -> users`.

#### Integration (`integrations`)

A brand integration (RevenueCat, MMPs, ad accounts, Slack, Zapier, App Store Connect). Adapter + realistic mock in this build.

Id prefix: `intg_`. Fixture: `integrations.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `brand_id` | -> brands | yes |  |
| `app_id` | -> apps | no |  |
| `kind` | enum IntegrationKind | yes |  |
| `status` | enum IntegrationStatus | yes |  |
| `label` | string | yes |  |
| `scopes` | string[] | yes |  |
| `config` | map<string> | yes | Non-secret settings (e.g. Slack channel "#growth-ugc"). |
| `webhook_url` | string | no | RevenueCat ingest URL on api.joinflowd.io. |
| `secret_last4` | string | no |  |
| `coverage_ratio` | ratio | no | Attribution coverage: share of installs and trials this integration can tie to a creator. |
| `events_24h` | int | yes |  |
| `health_note` | string | yes |  |
| `connected_at` | iso | no |  |
| `last_sync_at` | iso | no |  |
| `last_event_at` | iso | no |  |

References: `brand_id -> brands`, `app_id -> apps`.

#### ApiKey (`api_keys`)

A public API key (read, write, financial scopes; writes are drafts by default). Only the prefix and last four characters are ever stored.

Id prefix: `key_`. Fixture: `api_keys.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `brand_id` | -> brands | yes |  |
| `name` | string | yes |  |
| `mode` | enum KeyMode | yes |  |
| `scopes` | enum ApiScope[] | yes |  |
| `prefix` | string | yes | "fd_live_" or "fd_test_". |
| `last4` | string | yes |  |
| `created_by_member_id` | -> brand_members | yes |  |
| `rate_limit_per_minute` | int | yes |  |
| `requests_30d` | int | yes |  |
| `created_at` | iso | yes |  |
| `last_used_at` | iso | no |  |
| `expires_at` | iso | no |  |
| `revoked_at` | iso | no |  |

References: `brand_id -> brands`, `created_by_member_id -> brand_members`.

#### Webhook (`webhooks`)

An outbound webhook endpoint with its subscribed events and recent deliveries. Deliveries are signed.

Id prefix: `whk_`. Fixture: `webhooks.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `brand_id` | -> brands | yes |  |
| `url` | string | yes | On a .example host. |
| `events` | enum WebhookEventType[] | yes |  |
| `status` | enum WebhookStatus | yes |  |
| `secret_last4` | string | yes |  |
| `failure_count` | int | yes | Consecutive failures. |
| `deliveries` | WebhookDelivery[] | yes | The last 20, newest first. |
| `created_at` | iso | yes |  |
| `last_success_at` | iso | no |  |

References: `brand_id -> brands`.

#### ActivityEntry (`activity_log`)

The team activity log of a brand workspace (filterable, exportable).

Id prefix: `act_`. Fixture: `activity_log.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `brand_id` | -> brands | yes |  |
| `actor_member_id` | -> brand_members | no | Absent for system actions. |
| `action` | enum ActivityAction | yes |  |
| `summary` | string | yes | Plain English: "Jordan Ellis approved a video from @kai.frames". |
| `target_kind` | string | no |  |
| `target_id` | string | no |  |
| `metadata` | map<string> | yes |  |
| `at` | iso | yes |  |

References: `brand_id -> brands`, `actor_member_id -> brand_members`.

#### AutoApproveRule (`auto_approve_rules`)

A guarded auto-approve rule: conditions, scope (organic only), guardrails, a mandatory dry run on the last 50 submissions, a 10% human spot-check and a kill switch.

Id prefix: `rule_`. Fixture: `auto_approve_rules.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `brand_id` | -> brands | yes |  |
| `name` | string | yes |  |
| `status` | enum RuleStatus | yes |  |
| `conditions` | AutoApproveConditions | yes |  |
| `scope` | AutoApproveScope | yes |  |
| `guardrails` | RuleGuardrails | yes |  |
| `timeout_policy` | enum TimeoutPolicy | yes |  |
| `dry_run` | DryRun | no | Required before status can be active. |
| `stats` | RuleStats | yes |  |
| `audit` | RuleAuditEntry[] | yes | Oldest first. |
| `created_by_member_id` | -> brand_members | yes |  |
| `created_at` | iso | yes |  |
| `updated_at` | iso | yes |  |
| `enabled_at` | iso | no |  |
| `killed_at` | iso | no |  |
| `kill_reason` | string | no |  |

References: `brand_id -> brands`, `scope.bounty_ids[] -> bounties`, `audit[].actor_member_id -> brand_members`, `created_by_member_id -> brand_members`.

#### TestPlan (`test_plans`)

A hook x body x CTA test plan: cells assigned to bounties or offers, measured on settled posts. Small samples carry a caution.

Id prefix: `tplan_`. Fixture: `test_plans.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `brand_id` | -> brands | yes |  |
| `app_id` | -> apps | yes |  |
| `name` | string | yes |  |
| `status` | enum TestPlanStatus | yes |  |
| `spend_tier` | enum SpendTier | yes |  |
| `budget_cents` | cents | yes |  |
| `hooks` | TestAxisItem[] | yes |  |
| `bodies` | TestAxisItem[] | yes |  |
| `ctas` | enum CtaType[] | yes |  |
| `cells` | TestCell[] | yes | hooks x bodies x ctas selected cells. |
| `bounty_ids` | -> bounties[] | yes |  |
| `offer_ids` | -> offers[] | yes |  |
| `winner_cell_id` | string | no |  |
| `lift_ratio` | number | no | Winner trial rate / median trial rate - 1. |
| `confidence` | ratio | no |  |
| `caution` | string | yes | e.g. "Small sample: 3 videos per hook. Treat as directional." |
| `created_at` | iso | yes |  |
| `updated_at` | iso | yes |  |

References: `brand_id -> brands`, `app_id -> apps`, `cells[].submission_id -> submissions`, `cells[].post_id -> posts`, `bounty_ids[] -> bounties`, `offer_ids[] -> offers`.

#### FatigueAlert (`fatigue_alerts`)

A fatigue alert: a winner whose trial-start rate (or click-through, or install yield) fell 30% from its peak.

Id prefix: `fat_`. Fixture: `fatigue_alerts.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `brand_id` | -> brands | yes |  |
| `app_id` | -> apps | yes |  |
| `bounty_id` | -> bounties | yes |  |
| `post_id` | -> posts | yes |  |
| `ad_id` | -> ads | no |  |
| `creator_id` | -> creators | yes |  |
| `metric` | enum FatigueMetric | yes |  |
| `status` | enum FatigueStatus | yes |  |
| `peak_value` | ratio | yes |  |
| `current_value` | ratio | yes |  |
| `drop_ratio` | ratio | yes | 1 - current / peak; 0.30 or more triggers the alert. |
| `peak_on` | date | yes |  |
| `series` | ChartPoint[] | yes | Daily metric values around the decay. |
| `message` | string | yes |  |
| `detected_at` | iso | yes |  |
| `acknowledged_at` | iso | no |  |
| `refresh_bounty_id` | -> bounties | no |  |

References: `brand_id -> brands`, `app_id -> apps`, `bounty_id -> bounties`, `post_id -> posts`, `ad_id -> ads`, `creator_id -> creators`, `refresh_bounty_id -> bounties`.

#### FloSuggestion (`flo_suggestions`)

A Flo copilot output (history of scripts, hook rewrites, TL;DRs, captions, score fixes, rate advice, next actions, bounty drafts). Mock engine behind the AIProvider interface.

Id prefix: `flo_`. Fixture: `flo_suggestions.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `surface` | enum FloSurface | yes |  |
| `kind` | enum FloKind | yes |  |
| `creator_id` | -> creators | no |  |
| `brand_id` | -> brands | no |  |
| `context_kind` | string | no | e.g. "bounty", "format", "submission". |
| `context_id` | string | no |  |
| `prompt` | text | yes |  |
| `title` | string | yes |  |
| `outputs` | string[] | yes | E.g. three script options. |
| `actions` | FloAction[] | yes |  |
| `model` | string | yes | "flo-mock-1". |
| `latency_ms` | int | yes |  |
| `helpful` | bool | no |  |
| `created_at` | iso | yes |  |

References: `creator_id -> creators`, `brand_id -> brands`.

#### MlModel (`ml_models`)

One of the eight ML systems with its stage (heuristic, shadow, learned), monitoring metrics and calibration. The admin ML page reads this.

Id prefix: `mdl_`. Fixture: `ml_models.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes | mdl_<kind>. |
| `kind` | enum ModelKind | yes |  |
| `name` | string | yes |  |
| `version` | string | yes |  |
| `stage` | enum ModelStage | yes |  |
| `description` | text | yes |  |
| `trained_on_n` | int | yes | Settled posts available to learn from (0 for heuristics). |
| `metrics` | ModelMetric[] | yes |  |
| `calibration` | CalibrationBin[] | yes | Predicted band vs realised results (creative scorer); empty for the others. |
| `drift_score` | ratio | yes |  |
| `jobs` | ModelJobStats | yes |  |
| `tag_coverage` | map<ratio> | yes | Video understanding: share of settled posts with format, hook and CTA tags. |
| `learned_ready_at_posts` | int | yes | 1000: settled posts before comparing learned vs checklist. |
| `last_run_at` | iso | yes |  |
| `updated_at` | iso | yes |  |

#### ChatThread (`threads`)

An in-app thread tied to an offer, submission, bounty or support. In-app only: flowd never moves conversations off-platform; Scam Shield warns on risky messages.

Id prefix: `thr_`. Fixture: `threads.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `kind` | enum ThreadKind | yes |  |
| `title` | string | yes |  |
| `creator_id` | -> creators | no |  |
| `brand_id` | -> brands | no |  |
| `offer_id` | -> offers | no |  |
| `submission_id` | -> submissions | no |  |
| `bounty_id` | -> bounties | no |  |
| `messages` | ChatMessage[] | yes | Oldest first. |
| `unread_creator` | int | yes |  |
| `unread_brand` | int | yes |  |
| `rate_limited` | bool | yes | The one-sided message rate limit is active. |
| `last_message_at` | iso | yes |  |
| `created_at` | iso | yes |  |

References: `creator_id -> creators`, `brand_id -> brands`, `offer_id -> offers`, `submission_id -> submissions`, `bounty_id -> bounties`, `messages[].author_user_id -> users`.

#### BrandList (`brand_lists`)

A brand's CRM list of creators (favourites or custom), with notes and tags.

Id prefix: `list_`. Fixture: `brand_lists.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `brand_id` | -> brands | yes |  |
| `name` | string | yes |  |
| `is_favourites` | bool | yes |  |
| `members` | ListMember[] | yes |  |
| `created_by_member_id` | -> brand_members | yes |  |
| `created_at` | iso | yes |  |
| `updated_at` | iso | yes |  |

References: `brand_id -> brands`, `members[].creator_id -> creators`, `created_by_member_id -> brand_members`.


### Public

#### Waitlist (`waitlist`)

The ranked waitlist: totals and a leaderboard of the top referrers. Object-shaped file.

Id prefix: none. Fixture: `waitlist.json` (object, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `totals` | WaitlistTotals | yes |  |
| `leaders` | WaitlistLeader[] | yes | Top 25 by referrals. |
| `demo_position` | int | yes | The position shown to the demo visitor. |
| `demo_referrals` | int | yes |  |

#### StateOfAppUgc (`state_of_app_ugc`)

The State of App UGC report: clearing CPMs, top hook types and view-to-trial rates by category. Computed from the fixtures. Object-shaped file.

Id prefix: none. Fixture: `state_of_app_ugc.json` (object, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `quarter` | string | yes | "2026-Q3". |
| `quarters` | string[] | yes | Selectable quarters (the demo has one real quarter and one partial). |
| `published_at` | iso | yes |  |
| `title` | string | yes |  |
| `settled_posts` | int | yes |  |
| `total_views` | int | yes |  |
| `total_paid_cents` | cents | yes |  |
| `categories` | StateCategoryRow[] | yes | One row per Category (9). |
| `hooks` | StateHookRow[] | yes | One row per HookType (7). |
| `formats` | StateFormatRow[] | yes | One row per FormatId (11). |
| `methodology` | text | yes |  |
| `caveats` | string[] | yes |  |

#### CaseStudy (`case_studies`)

A public case study. Fictional in the demo (permission-based in production).

Id prefix: `case_`. Fixture: `case_studies.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `app_id` | -> apps | yes |  |
| `brand_id` | -> brands | yes |  |
| `title` | string | yes | e.g. "Sleepy brand, 2.1M views, 3,900 trials". |
| `summary` | text | yes |  |
| `quote` | text | yes |  |
| `quote_author` | string | yes | A fictional person. |
| `quote_role` | string | yes |  |
| `metrics` | CaseMetrics | yes |  |
| `art` | ArtSeed | yes |  |
| `fictional` | bool | yes | Always true in the demo. |
| `published_at` | iso | yes |  |

References: `app_id -> apps`, `brand_id -> brands`.

#### Testimonial (`testimonials`)

A fictional testimonial for the marketing pages.

Id prefix: `tst_`. Fixture: `testimonials.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `kind` | enum PartyKind | yes |  |
| `quote` | text | yes |  |
| `author` | string | yes |  |
| `role` | string | yes |  |
| `creator_id` | -> creators | no |  |
| `brand_id` | -> brands | no |  |
| `stat_label` | string | no |  |
| `stat_value` | string | no |  |
| `avatar` | ArtSeed | yes |  |
| `fictional` | bool | yes | Always true in the demo. |

References: `creator_id -> creators`, `brand_id -> brands`.

#### ChangelogEntry (`changelog`)

A changelog entry.

Id prefix: `chg_`. Fixture: `changelog.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `date` | date | yes |  |
| `title` | string | yes |  |
| `body` | text | yes |  |
| `tags` | enum ChangelogTag[] | yes |  |
| `audience` | enum PartyKind[] | yes | Empty means everyone. |
| `version` | string | no |  |

#### AuditReport (`audit_reports`)

A free App UGC Audit (shareable report at /audit/<slug>): brief, 10 hooks, predicted CPM, price-vs-fill, creators ready now. Checklist estimates, labelled as such.

Id prefix: `aud_`. Fixture: `audit_reports.json` (array, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | id | yes |  |
| `slug` | string | yes | URL slug, e.g. "lumi-ai-photo-editor". |
| `app_name` | string | yes |  |
| `tagline` | string | yes |  |
| `category` | enum Category | yes |  |
| `store_url` | string | yes |  |
| `icon` | ArtSeed | yes |  |
| `og_art` | ArtSeed | yes |  |
| `brief` | Brief | yes |  |
| `hooks` | AuditHook[] | yes | Exactly 10. |
| `suggested_format_ids` | enum FormatId[] | yes |  |
| `predicted_cpm_cents` | AuditBand | yes |  |
| `expected_views_per_post` | AuditBand | yes |  |
| `expected_cost_per_trial_cents` | AuditBand | yes |  |
| `confidence` | ratio | yes |  |
| `price_curve` | CurvePoint[] | yes | Price vs fill time (6 points). |
| `creators_ready` | -> creators[] | yes | Fictional creators ready now. |
| `assumptions` | string[] | yes |  |
| `created_by` | enum PartyKind | yes |  |
| `claimed_by_brand_id` | -> brands | no |  |
| `page_views` | int | yes |  |
| `generated_at` | iso | yes |  |

References: `brief.example_post_ids[] -> posts`, `creators_ready[] -> creators`, `claimed_by_brand_id -> brands`.


### Admin

#### AdminMetrics (`admin_metrics`)

The admin control tower: 90-day targets vs actuals, market health, queue counts, next payout run and the money summary. Object-shaped file.

Id prefix: none. Fixture: `admin_metrics.json` (object, owner ext).

| Field | Type | Req | Notes |
|---|---|---|---|
| `as_of` | iso | yes |  |
| `targets` | MetricTarget[] | yes | The six day-90 targets (CONSTANTS.launch_targets) with actuals and trend series. |
| `market_health` | MarketHealth | yes |  |
| `queues` | QueueCounts | yes |  |
| `next_payout_run` | NextPayoutRun | yes |  |
| `summary` | AdminSummary | yes |  |
| `promise_metrics` | PromiseMetric[] | yes | The 11 Promise proof metrics (public on /promise and /trust). |
| `alerts` | string[] | yes | Plain-English alerts, e.g. "3 submissions at Brightloop passed 72 hours". |
<!-- /GENERATED:entities -->

---

## 7. Value types

<!-- GENERATED:value-types -->
121 nested value types. They have no id and no file of their own; they appear inside entities.

#### Address

Postal address.

| Field | Type | Req | Notes |
|---|---|---|---|
| `line1` | string | yes |  |
| `line2` | string | no |  |
| `city` | string | yes |  |
| `region` | string | yes | State / province / county. |
| `postal_code` | string | yes |  |
| `country` | enum Country | yes |  |

#### PaymentMethod

A brand's funding method (card or ACH). Never contains a full number.

| Field | Type | Req | Notes |
|---|---|---|---|
| `kind` | enum PaymentKind | yes |  |
| `label` | string | yes | Network or bank label, e.g. "Visa". |
| `last4` | string | yes |  |
| `exp` | string | no | MM/YY for cards. |

#### PayoutMethod

A creator's payout destination (Stripe Connect style, mocked).

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | yes | pm_<n>. |
| `kind` | enum PayoutMethodKind | yes |  |
| `label` | string | yes | e.g. "Bank account". |
| `last4` | string | yes |  |
| `status` | enum PayoutMethodStatus | yes |  |
| `instant_capable` | bool | yes |  |
| `verified_at` | iso | no |  |

#### AutoTopUp

Brand wallet auto top-up.

| Field | Type | Req | Notes |
|---|---|---|---|
| `enabled` | bool | yes |  |
| `threshold_cents` | cents | yes | Top up when the wallet falls below this. |
| `amount_cents` | cents | yes | Amount added each time. |

#### BillingProfile

Brand billing identity and finance-pack fields.

| Field | Type | Req | Notes |
|---|---|---|---|
| `legal_name` | string | yes |  |
| `billing_email` | string | yes |  |
| `payment_method` | PaymentMethod | no |  |
| `vat_id` | string | no | EU B2B: reverse charge with both VAT IDs. |
| `po_required` | bool | yes |  |
| `cost_center` | string | no |  |
| `address` | Address | no |  |

#### ComplianceDefaults

Brand-level compliance defaults copied onto each bounty.

| Field | Type | Req | Notes |
|---|---|---|---|
| `disclosure_text` | string | yes | Required wording, e.g. "#ad Paid partnership with Lumi". |
| `banned_claims` | string[] | yes | Phrases creators must not say. |
| `competitor_names` | string[] | yes | Apps that must not be shown. |
| `music_policy` | enum MusicPolicy | yes |  |
| `ai_policy` | enum AiContentPolicy | yes |  |

#### ChartPoint

One point of a daily or weekly series.

| Field | Type | Req | Notes |
|---|---|---|---|
| `date` | date | yes |  |
| `value` | number | yes |  |

#### Evidence

What a rejection, note or flag points at (mandatory on rejection).

| Field | Type | Req | Notes |
|---|---|---|---|
| `kind` | enum EvidenceKind | yes |  |
| `ref` | string | yes | A timecode "00:03", a QaCheckType, a quoted brief requirement or a transcript line. |
| `excerpt` | text | no | The quoted text, if any. |
| `t_ms` | int | no | Position in the video, when relevant. |

#### Storefront

Link-in-bio storefront at joinflowd.io/c/<handle>. Stats shown are verified from the ledger.

| Field | Type | Req | Notes |
|---|---|---|---|
| `slug` | string | yes | Equals the creator handle. |
| `headline` | string | yes |  |
| `about` | text | no |  |
| `featured_post_ids` | -> posts[] | yes |  |
| `show_stats` | bool | yes |  |
| `cta_label` | string | yes | e.g. "Work with me". |
| `theme` | enum StorefrontTheme | yes |  |

#### PortfolioItem

A sample video on a creator profile (generated art, never a real thumbnail).

| Field | Type | Req | Notes |
|---|---|---|---|
| `title` | string | yes |  |
| `art` | ArtSeed | yes |  |
| `duration_s` | int | yes |  |
| `platform` | enum Platform | yes |  |
| `views` | int | no |  |

#### CarryOver

Verified prior history imported at founding-creator onboarding. Counts toward tier thresholds.

| Field | Type | Req | Notes |
|---|---|---|---|
| `source` | string | yes | e.g. "Verified earnings statements (other platforms)". |
| `cleared_cents` | cents | yes |  |
| `approved_count` | int | yes |  |
| `decided_count` | int | yes |  |
| `verified_by_user_id` | -> users | yes |  |
| `verified_at` | iso | yes |  |

#### TierReview

Manual review required for Elite.

| Field | Type | Req | Notes |
|---|---|---|---|
| `status` | string | yes | "approved". |
| `reviewer_user_id` | -> users | yes |  |
| `reviewed_at` | iso | yes |  |
| `note` | text | no |  |

#### AccountHealth

Repost-safe Account Health for a social account.

| Field | Type | Req | Notes |
|---|---|---|---|
| `score` | int | yes | 0..100. |
| `status` | enum AccountHealthStatus | yes |  |
| `strikes` | int | yes |  |
| `unoriginal_flags` | int | yes |  |
| `notes` | string[] | yes |  |

#### RateSuggestion

Market-suggested price shown beside a creator's ask.

| Field | Type | Req | Notes |
|---|---|---|---|
| `price_cents` | cents | yes |  |
| `low_cents` | cents | yes |  |
| `high_cents` | cents | yes |  |
| `basis` | string | yes | e.g. "Median 14.2k views x $2.40 market CPM, 1.3x Silver". |
| `confidence` | ratio | yes |  |
| `computed_at` | iso | yes |  |

#### RatePackage

A bundle on a rate card.

| Field | Type | Req | Notes |
|---|---|---|---|
| `label` | string | yes |  |
| `videos` | int | yes |  |
| `price_per_video_cents` | cents | yes |  |

#### RateCardStats

Rate-card activity.

| Field | Type | Req | Notes |
|---|---|---|---|
| `offers_received` | int | yes |  |
| `accepted` | int | yes |  |
| `median_response_hours` | number | yes |  |

#### AppPricing

Subscription price points of an app.

| Field | Type | Req | Notes |
|---|---|---|---|
| `weekly_cents` | cents | no |  |
| `monthly_cents` | cents | yes |  |
| `annual_cents` | cents | yes |  |
| `trial_days` | int | yes |  |

#### BrandColors

Generated brand colours for an app (used by generated art).

| Field | Type | Req | Notes |
|---|---|---|---|
| `primary` | hex | yes |  |
| `secondary` | hex | yes |  |
| `accent` | hex | yes |  |

#### BriefBeat

A beat a bounty requires or suggests.

| Field | Type | Req | Notes |
|---|---|---|---|
| `beat` | enum BeatId | yes |  |
| `label` | string | yes |  |
| `required` | bool | yes |  |
| `hint` | string | no |  |

#### Brief

The creative brief.

| Field | Type | Req | Notes |
|---|---|---|---|
| `summary` | text | yes |  |
| `talking_points` | string[] | yes |  |
| `dos` | string[] | yes |  |
| `donts` | string[] | yes |  |
| `beats` | BriefBeat[] | yes |  |
| `cta` | string | yes | Exactly one call to action. |
| `offer_line` | string | no |  |
| `hashtags` | string[] | yes |  |
| `mentions` | string[] | yes |  |
| `tone` | string | yes |  |
| `disclosure_text` | string | yes | Auto-added to every posting flow. |
| `banned_claims` | string[] | yes |  |
| `example_post_ids` | -> posts[] | no | Top posts from earlier bounties to copy the structure of. |
| `reference_art` | ArtSeed[] | no |  |

#### RightsCard

Plain-language licence shown on every bounty. Organic posting is always included.

| Field | Type | Req | Notes |
|---|---|---|---|
| `organic` | bool | yes | Always true. |
| `paid_ads_days` | int | yes | 0 = no paid-ad use; default 90. |
| `ad_platforms` | enum AdPlatform[] | yes |  |
| `whitelisting` | bool | yes | Spark code / partnership permission is requested on approval. |
| `renewal_pct_per_30d` | ratio | yes | Renewal price as a share of the base fee per 30 days; default 0.25. |
| `exclusivity_days` | int | yes |  |
| `ai_likeness` | bool | yes | Off by default. |
| `territory` | string | yes |  |
| `summary` | text | yes | Plain-English paragraph. |

#### Deliverables

What a creator must deliver.

| Field | Type | Req | Notes |
|---|---|---|---|
| `videos_per_creator` | int | yes |  |
| `min_duration_s` | int | yes |  |
| `max_duration_s` | int | yes |  |
| `aspect` | string | yes | "9:16". |
| `platforms` | enum Platform[] | yes |  |
| `regions` | enum Country[] | yes |  |
| `require_face` | bool | yes |  |
| `music_policy` | enum MusicPolicy | yes |  |
| `ai_policy` | enum AiContentPolicy | yes |  |

#### Eligibility

Who can submit.

| Field | Type | Req | Notes |
|---|---|---|---|
| `min_tier` | enum Tier | no |  |
| `min_followers` | int | no |  |
| `countries` | enum Country[] | yes |  |
| `niches` | enum Niche[] | yes |  |
| `min_us_audience_ratio` | ratio | no |  |
| `burner_accounts_allowed` | bool | yes | Always false: bounties may not require burner accounts. |

#### BriefLintIssue

One Brief Lint finding.

| Field | Type | Req | Notes |
|---|---|---|---|
| `code` | enum BriefLintCode | yes |  |
| `severity` | enum LintSeverity | yes |  |
| `message` | string | yes |  |
| `field` | string | no |  |

#### BriefLint

Result of Brief Lint on the current brief. Blockers prevent publishing.

| Field | Type | Req | Notes |
|---|---|---|---|
| `passed` | bool | yes | True when there are no blockers. |
| `checked_at` | iso | yes |  |
| `issues` | BriefLintIssue[] | yes |  |

#### PayMath

Pay Math: what a creator is likely to earn and what the brand really pays. Always an estimate.

| Field | Type | Req | Notes |
|---|---|---|---|
| `expected_views_p25` | int | yes |  |
| `expected_views_median` | int | yes |  |
| `expected_views_p75` | int | yes |  |
| `p25_cents` | cents | yes | Expected creator pay per video at p25 views (CPM + CPA, after the cap). |
| `median_cents` | cents | yes |  |
| `p75_cents` | cents | yes |  |
| `creator_cpm_cents` | cents | yes | Blended creator pay per 1,000 views at the median. |
| `all_in_cpm_cents` | cents | yes | Creator CPM + platform fee + card processing. |
| `basis` | string | yes | Where the estimate comes from (category market series). |

#### BountyCounts

Denormalised counters on a bounty (validated against submissions and posts).

| Field | Type | Req | Notes |
|---|---|---|---|
| `creators` | int | yes | Distinct creators who submitted. |
| `submissions` | int | yes |  |
| `in_review` | int | yes |  |
| `approved` | int | yes |  |
| `rejected` | int | yes |  |
| `posts` | int | yes |  |
| `live_posts` | int | yes |  |

#### FunnelCounts

Views to paid. Tracked = link + code (deterministic). est_* = MMP, survey and modelled (never paid).

| Field | Type | Req | Notes |
|---|---|---|---|
| `views` | int | yes | Verified views (lifetime). |
| `clicks` | int | yes | Tracked visits: link clicks and code lookups. |
| `installs` | int | yes |  |
| `trials` | int | yes |  |
| `paid` | int | yes |  |
| `est_installs` | int | yes |  |
| `est_trials` | int | yes |  |
| `est_paid` | int | yes |  |

#### VideoMeta

Video file metadata. There is no real video: playback is a generated thumbnail + waveform.

| Field | Type | Req | Notes |
|---|---|---|---|
| `asset_id` | string | yes | vid_<n>. Mux-style asset id (mock). |
| `duration_ms` | int | yes |  |
| `width` | int | yes |  |
| `height` | int | yes |  |
| `size_bytes` | int | yes |  |
| `fps` | int | yes |  |
| `has_captions` | bool | yes |  |
| `language` | string | yes |  |
| `art` | ArtSeed | yes | Generated thumbnail. |
| `uploaded_at` | iso | yes |  |

#### SubmissionVersion

One uploaded version of a submission (v1, v2, v3). Submissions are versioned, never overwritten.

| Field | Type | Req | Notes |
|---|---|---|---|
| `version` | int | yes |  |
| `submitted_at` | iso | yes |  |
| `video` | VideoMeta | yes |  |
| `flow_band` | enum ScoreBand | yes |  |
| `flow_points` | int | yes |  |
| `hook_band` | enum ScoreBand | yes |  |
| `hook_points` | int | yes |  |
| `qa_pass` | int | yes |  |
| `qa_warn` | int | yes |  |
| `qa_fail` | int | yes |  |
| `changes_summary` | string | no | What the creator changed from the previous version. |

#### Decision

The brand's (or system's) decision on the current version.

| Field | Type | Req | Notes |
|---|---|---|---|
| `action` | enum DecisionAction | yes |  |
| `decided_at` | iso | yes |  |
| `decided_by_user_id` | -> users | no | Absent for system decisions. |
| `reason_code` | enum ReasonCode | no | Mandatory for reject and request_changes. |
| `evidence` | Evidence | no | Mandatory for reject. |
| `summary` | text | no |  |
| `sla_met` | bool | yes |  |
| `appeal_used` | bool | yes |  |

#### FraudEvidence

Fraud evidence shown in the review queue before approving (creator-level, since there is no post yet).

| Field | Type | Req | Notes |
|---|---|---|---|
| `creator_fraud_score` | int | yes |  |
| `creator_fraud_band` | enum FraudBand | yes |  |
| `audience_us_ratio` | ratio | yes |  |
| `view_curve_shape` | enum CurveShape | yes | Shape of the creator's typical view curve. |
| `duplicate_of_submission_id` | -> submissions | no |  |
| `phash_distance` | int | no |  |
| `follower_quality` | ratio | yes |  |

#### FraudSignalHit

A fraud signal that fired.

| Field | Type | Req | Notes |
|---|---|---|---|
| `signal` | enum FraudSignal | yes |  |
| `points` | int | yes | points = max_points x severity, rounded. |
| `severity` | ratio | yes |  |
| `detail` | string | yes |  |

#### FraudAssessment

Fraud score composition for a post.

| Field | Type | Req | Notes |
|---|---|---|---|
| `score` | int | yes | min(100, sum of signal points). |
| `band` | enum FraudBand | yes |  |
| `signals` | FraudSignalHit[] | yes |  |
| `assessed_at` | iso | yes |  |

#### TranscriptSegment

A transcript line.

| Field | Type | Req | Notes |
|---|---|---|---|
| `t_start_ms` | int | yes |  |
| `t_end_ms` | int | yes |  |
| `text` | string | yes |  |

#### OnScreenText

Text detected on screen.

| Field | Type | Req | Notes |
|---|---|---|---|
| `t_start_ms` | int | yes |  |
| `t_end_ms` | int | yes |  |
| `text` | string | yes |  |
| `in_safe_zone` | bool | yes |  |

#### SceneCut

A scene segment.

| Field | Type | Req | Notes |
|---|---|---|---|
| `t_start_ms` | int | yes |  |
| `t_end_ms` | int | yes |  |
| `kind` | enum SceneKind | yes |  |

#### BeatHit

Whether a beat was found.

| Field | Type | Req | Notes |
|---|---|---|---|
| `beat` | enum BeatId | yes |  |
| `required` | bool | yes |  |
| `found` | bool | yes |  |
| `t_ms` | int | no |  |

#### HookAnalysis

First-3-seconds analysis.

| Field | Type | Req | Notes |
|---|---|---|---|
| `text` | string | yes | The spoken hook line. |
| `hook_type` | enum HookType | yes |  |
| `lands_at_ms` | int | yes |  |
| `face_at_ms` | int | no |  |
| `app_at_ms` | int | no |  |
| `caption_at_ms` | int | no |  |
| `spoken_matches_onscreen` | bool | yes |  |

#### VideoTags

Tags added to every settled post (Creative Intelligence Library).

| Field | Type | Req | Notes |
|---|---|---|---|
| `format_id` | enum FormatId | no |  |
| `hook_type` | enum HookType | yes |  |
| `hook_words` | string | yes | The first words of the hook. |
| `time_to_app_reveal_ms` | int | yes |  |
| `cta_type` | enum CtaType | yes |  |

#### QaCheck

One automated QA check result.

| Field | Type | Req | Notes |
|---|---|---|---|
| `check` | enum QaCheckType | yes |  |
| `result` | enum QaResult | yes |  |
| `message` | string | yes |  |
| `evidence` | Evidence | no |  |
| `blocks_settlement` | bool | yes | True for disclosure fails. |
| `waived_by_user_id` | -> users | no | A brand member waived this warning. |

#### ScoreItem

One checklist line with its reason. Day-one scores are checklist scores.

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | enum ScoreItemId | yes |  |
| `label` | string | yes |  |
| `points` | int | yes |  |
| `max` | int | yes |  |
| `passed` | bool | yes |  |
| `reason` | string | yes | Plain English, e.g. "No face until 3.1s". |
| `fix` | string | no | One-tap fix suggestion. |

#### ScoreCard

A checklist score.

| Field | Type | Req | Notes |
|---|---|---|---|
| `band` | enum ScoreBand | yes |  |
| `points` | int | yes | 0..100. |
| `items` | ScoreItem[] | yes |  |
| `label` | string | yes | Always "Checklist score. It gets smarter as bounties settle." until a learned model ships. |

#### EarningsBreakdown

Earnings so far on a post (accrued for live posts, settled afterwards).

| Field | Type | Req | Notes |
|---|---|---|---|
| `cpm_cents` | cents | yes |  |
| `cpa_cents` | cents | yes |  |
| `commission_cents` | cents | yes |  |
| `flat_cents` | cents | yes |  |
| `total_cents` | cents | yes |  |
| `capped` | bool | yes | True when the per-video cap limited pay. |
| `cap_remaining_cents` | cents | yes |  |

#### Retention

Retention curve of a post.

| Field | Type | Req | Notes |
|---|---|---|---|
| `curve` | number[] | yes | 10 points: share of viewers still watching at 0%, 10% ... 90% of the video. |
| `avg_watch_ratio` | ratio | yes |  |
| `biggest_drop_at_s` | number | no |  |

#### AdDaily

One day of a promoted ad.

| Field | Type | Req | Notes |
|---|---|---|---|
| `date` | date | yes |  |
| `spend_cents` | cents | yes |  |
| `impressions` | int | yes |  |
| `clicks` | int | yes |  |
| `installs` | int | yes |  |
| `trials` | int | yes |  |
| `paid` | int | yes |  |
| `revenue_cents` | cents | yes |  |

#### FatigueInfo

Fatigue snapshot on an ad.

| Field | Type | Req | Notes |
|---|---|---|---|
| `peak_trial_rate` | ratio | yes |  |
| `current_trial_rate` | ratio | yes |  |
| `drop_ratio` | ratio | yes | 1 - current / peak. |
| `flagged_at` | iso | no |  |

#### LineItem

An invoice line.

| Field | Type | Req | Notes |
|---|---|---|---|
| `description` | string | yes |  |
| `quantity` | int | yes |  |
| `unit_cents` | cents | yes |  |
| `amount_cents` | cents | yes |  |
| `bounty_id` | -> bounties | no |  |
| `ad_id` | -> ads | no |  |

#### TickerTotals

Totals on the public payout ticker.

| Field | Type | Req | Notes |
|---|---|---|---|
| `total_paid_cents` | cents | yes |  |
| `paid_today_cents` | cents | yes |  |
| `paid_7d_cents` | cents | yes |  |
| `creators_paid` | int | yes |  |
| `payouts_count` | int | yes |  |
| `posts_cleared` | int | yes |  |
| `typical_creator_30d_cents` | cents | yes | Median 30-day cleared earnings of active creators (always shown beside top earners). Demo target about $62. |
| `p25_creator_30d_cents` | cents | yes | p25 of the same distribution. |
| `p75_creator_30d_cents` | cents | yes | p75 of the same distribution. |
| `top_decile_creator_30d_cents` | cents | yes | p90: the "top 10%" figure that is always shown beside the median. |
| `active_creators_30d` | int | yes | Creators with at least one post or cleared earning in 30 days (the distribution's population). |
| `updated_at` | iso | yes |  |

#### ReliabilityComponent

One explained part of a reliability score.

| Field | Type | Req | Notes |
|---|---|---|---|
| `key` | string | yes |  |
| `label` | string | yes |  |
| `value` | ratio | yes |  |
| `weight` | ratio | yes |  |
| `points` | number | yes |  |
| `reason` | string | yes |  |

#### TierCriterion

One progress line toward the next tier.

| Field | Type | Req | Notes |
|---|---|---|---|
| `key` | string | yes | lifetime_cleared \| approved \| approval_rate \| reliability \| review. |
| `label` | string | yes |  |
| `have` | number | yes |  |
| `need` | number | yes |  |
| `met` | bool | yes |  |

#### TierProgress

Progress toward the next tier (derived; embedded in creator_reputation).

| Field | Type | Req | Notes |
|---|---|---|---|
| `current` | enum Tier | yes |  |
| `next` | enum Tier | no |  |
| `criteria` | TierCriterion[] | yes |  |
| `progress` | ratio | yes | The bottleneck: the lowest met/need ratio among numeric criteria. |

#### OfferMessage

One message in an offer negotiation thread.

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | yes | omsg_<n>. |
| `author_role` | enum AuthorRole | yes |  |
| `author_user_id` | -> users | no |  |
| `type` | enum OfferMessageType | yes |  |
| `amount_cents` | cents | no |  |
| `rights_days` | int | no |  |
| `body` | text | no |  |
| `at` | iso | yes |  |
| `warning_code` | enum ScamReason | no | Scam Shield annotation on a risky message (e.g. an off-platform request). |

#### CurvePoint

One point on the price-vs-fill-time curve.

| Field | Type | Req | Notes |
|---|---|---|---|
| `cpm_cents` | cents | yes |  |
| `fill_hours_p50` | number | yes |  |
| `fill_hours_p80` | number | yes |  |
| `confidence` | ratio | yes |  |
| `sample_n` | int | yes |  |

#### SpecStats

Spec engagement.

| Field | Type | Req | Notes |
|---|---|---|---|
| `previews` | int | yes |  |
| `saves` | int | yes |  |
| `licenses` | int | yes |  |

#### TierThresholds

What a tier requires.

| Field | Type | Req | Notes |
|---|---|---|---|
| `lifetime_cleared_cents` | cents | yes |  |
| `approved_count` | int | yes |  |
| `approval_rate_min` | ratio | yes |  |
| `reliability_min` | int | yes |  |
| `manual_review` | bool | yes |  |

#### TierPerks

What a tier unlocks.

| Field | Type | Req | Notes |
|---|---|---|---|
| `early_access_hours` | int | yes |  |
| `rate_card` | bool | yes |  |
| `instant_cashout_free_per_week` | int | yes |  |
| `instant_cashout_unlimited` | bool | yes |  |
| `crews_lead` | bool | yes |  |
| `auctions` | bool | yes |  |
| `featured_profile` | bool | yes |  |

#### WeekRecord

One ISO week in a streak history.

| Field | Type | Req | Notes |
|---|---|---|---|
| `iso_week` | string | yes | e.g. "2026-W40". |
| `outcome` | enum WeekOutcome | yes |  |
| `posts` | int | yes |  |

#### DropItem

One bounty in a Daily Drop with real inventory.

| Field | Type | Req | Notes |
|---|---|---|---|
| `bounty_id` | -> bounties | yes |  |
| `spots_total` | int | yes |  |
| `spots_left` | int | yes | True count: spots_total minus claims. |
| `claims` | DropClaim[] | yes |  |

#### DropClaim

A creator claimed a drop spot (a 24-hour reserved place to submit).

| Field | Type | Req | Notes |
|---|---|---|---|
| `creator_id` | -> creators | yes |  |
| `claimed_at` | iso | yes |  |

#### Prize

A tournament prize.

| Field | Type | Req | Notes |
|---|---|---|---|
| `place` | int | yes |  |
| `amount_cents` | cents | yes |  |
| `label` | string | no |  |

#### LeaderboardEntry

One row of a leaderboard.

| Field | Type | Req | Notes |
|---|---|---|---|
| `creator_id` | -> creators | yes |  |
| `rank` | int | yes |  |
| `value` | number | yes | The ranked metric (cents, ratio or points). |
| `delta_rank` | int | yes | Change vs last week (positive = moved up). |
| `zone` | enum LeaderboardZone | yes |  |

#### QuizQuestion

An Academy quiz question.

| Field | Type | Req | Notes |
|---|---|---|---|
| `prompt` | string | yes |  |
| `options` | string[] | yes |  |
| `answer_index` | int | yes |  |
| `explanation` | string | yes |  |

#### LessonBlock

A block of lesson content.

| Field | Type | Req | Notes |
|---|---|---|---|
| `kind` | enum LessonBlockKind | yes |  |
| `title` | string | no |  |
| `body` | text | yes |  |

#### FormatBeat

A beat in a format template.

| Field | Type | Req | Notes |
|---|---|---|---|
| `beat` | enum BeatId | yes |  |
| `label` | string | yes |  |
| `t_start_s` | number | yes |  |
| `t_end_s` | number | yes |  |
| `required` | bool | yes |  |
| `tip` | string | yes |  |

#### CategoryRate

A ratio for one app category.

| Field | Type | Req | Notes |
|---|---|---|---|
| `category` | enum Category | yes |  |
| `value` | ratio | yes |  |

#### FormatStats

Settled-post performance of a format.

| Field | Type | Req | Notes |
|---|---|---|---|
| `settled_posts` | int | yes |  |
| `median_views` | int | yes |  |
| `trial_rate` | ratio | yes | Trials per install. |
| `approval_rate` | ratio | yes |  |
| `trial_rate_by_category` | CategoryRate[] | yes | Trials per install by app category (an array, not a map: Swift convertFromSnakeCase would rewrite snake_case map keys). |

#### HookStats

Settled-post performance of a hook.

| Field | Type | Req | Notes |
|---|---|---|---|
| `uses` | int | yes |  |
| `median_views` | int | yes |  |
| `trial_rate` | ratio | yes |  |
| `avg_hook_score` | int | yes |  |

#### HookExample

A hook filled in for a category.

| Field | Type | Req | Notes |
|---|---|---|---|
| `category` | enum Category | yes |  |
| `text` | string | yes |  |

#### QuietHours

Wellbeing quiet hours.

| Field | Type | Req | Notes |
|---|---|---|---|
| `enabled` | bool | yes |  |
| `start` | string | yes | "22:00" local. |
| `end` | string | yes | "08:00" local. |
| `timezone` | string | yes |  |

#### NumbersOff

Hide live views and earnings in a window.

| Field | Type | Req | Notes |
|---|---|---|---|
| `enabled` | bool | yes |  |
| `from` | string | no |  |
| `to` | string | no |  |

#### PaceGoal

Opt-in soft weekly volume target. Never a tier penalty.

| Field | Type | Req | Notes |
|---|---|---|---|
| `enabled` | bool | yes |  |
| `posts_per_week` | int | no |  |

#### WebhookDelivery

A recent webhook delivery.

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | yes | whd_<n>. |
| `event` | enum WebhookEventType | yes |  |
| `status` | enum DeliveryStatus | yes |  |
| `status_code` | int | no |  |
| `at` | iso | yes |  |
| `latency_ms` | int | yes |  |

#### AutoApproveConditions

All conditions must hold.

| Field | Type | Req | Notes |
|---|---|---|---|
| `min_flow_band` | enum ScoreBand | yes |  |
| `require_all_beats` | bool | yes |  |
| `require_disclosure_pass` | bool | yes |  |
| `require_no_duplicate` | bool | yes |  |
| `require_music_pass` | bool | yes |  |
| `max_fraud_score` | int | yes |  |
| `min_us_audience_ratio` | ratio | yes |  |
| `min_creator_approved_posts` | int | yes | First-time creators are always manual. |
| `min_creator_approval_rate` | ratio | yes |  |

#### AutoApproveScope

Where a rule applies. Organic posting only, never paid-ad rights.

| Field | Type | Req | Notes |
|---|---|---|---|
| `bounty_ids` | -> bounties[] | yes |  |
| `tiers` | enum Tier[] | yes |  |
| `platforms` | enum Platform[] | yes |  |

#### RuleGuardrails

Rule guardrails.

| Field | Type | Req | Notes |
|---|---|---|---|
| `daily_cap` | int | yes |  |
| `budget_cap_cents` | cents | yes |  |
| `spot_check_ratio` | ratio | yes | Default 0.10. |
| `pause_on_fraud` | bool | yes |  |

#### DryRun

Dry run on the last 50 submissions.

| Field | Type | Req | Notes |
|---|---|---|---|
| `ran_at` | iso | yes |  |
| `sample_size` | int | yes |  |
| `would_approve` | int | yes |  |
| `would_send_to_human` | int | yes |  |
| `would_block` | int | yes |  |

#### RuleStats

Rule outcomes.

| Field | Type | Req | Notes |
|---|---|---|---|
| `auto_approved` | int | yes |  |
| `spot_checked` | int | yes |  |
| `spot_check_overturned` | int | yes |  |
| `last_triggered_at` | iso | no |  |

#### CellResults

Measured results for a test cell.

| Field | Type | Req | Notes |
|---|---|---|---|
| `views` | int | yes |  |
| `installs` | int | yes |  |
| `trials` | int | yes |  |
| `paid` | int | yes |  |
| `trial_rate` | ratio | yes |  |

#### TestCell

One hook x body x CTA combination.

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | yes | cell_<n>. |
| `hook_ref` | string | yes | A hook_ id or custom hook text. |
| `body_ref` | string | yes |  |
| `cta` | enum CtaType | yes |  |
| `status` | enum TestCellStatus | yes |  |
| `submission_id` | -> submissions | no |  |
| `post_id` | -> posts | no |  |
| `results` | CellResults | no |  |

#### TestAxisItem

A hook or body option in a plan.

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `label` | string | yes |  |

#### AuditHook

A hook suggested in an App UGC Audit.

| Field | Type | Req | Notes |
|---|---|---|---|
| `text` | string | yes |  |
| `hook_type` | enum HookType | yes |  |
| `format_id` | enum FormatId | yes |  |
| `hook_points` | int | yes |  |

#### AuditBand

A predicted range.

| Field | Type | Req | Notes |
|---|---|---|---|
| `low` | int | yes |  |
| `median` | int | yes |  |
| `high` | int | yes |  |

#### ModelMetric

A monitoring metric.

| Field | Type | Req | Notes |
|---|---|---|---|
| `label` | string | yes |  |
| `value` | number | yes |  |
| `unit` | string | yes |  |

#### CalibrationBin

Predicted band vs reality.

| Field | Type | Req | Notes |
|---|---|---|---|
| `band` | enum ScoreBand | yes |  |
| `count` | int | yes |  |
| `median_views` | int | yes |  |
| `trial_rate` | ratio | yes |  |

#### MetricTarget

A day-90 target vs actual.

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `label` | string | yes |  |
| `target` | number | yes |  |
| `target_max` | number | no |  |
| `op` | string | yes | "lt" \| "gt" \| "between". |
| `unit` | string | yes |  |
| `actual` | number | yes |  |
| `status` | enum MetricStatus | yes |  |
| `series` | ChartPoint[] | yes | Daily or weekly series ending at "now". |

#### StateCategoryRow

State of App UGC: per-category numbers.

| Field | Type | Req | Notes |
|---|---|---|---|
| `category` | enum Category | yes |  |
| `clearing_cpm_cents` | cents | yes |  |
| `median_views` | int | yes |  |
| `install_to_trial` | ratio | yes |  |
| `trial_to_paid` | ratio | yes |  |
| `median_fill_hours` | number | yes |  |
| `settled_posts` | int | yes |  |

#### StateHookRow

State of App UGC: hook type leaderboard.

| Field | Type | Req | Notes |
|---|---|---|---|
| `hook_type` | enum HookType | yes |  |
| `share_of_posts` | ratio | yes |  |
| `median_views` | int | yes |  |
| `trial_rate` | ratio | yes |  |

#### StateFormatRow

State of App UGC: format leaderboard.

| Field | Type | Req | Notes |
|---|---|---|---|
| `format_id` | enum FormatId | yes |  |
| `share_of_posts` | ratio | yes |  |
| `median_views` | int | yes |  |
| `trial_rate` | ratio | yes |  |

#### FloAction

A one-tap action Flo offers.

| Field | Type | Req | Notes |
|---|---|---|---|
| `label` | string | yes |  |
| `kind` | string | yes | e.g. "apply_fix", "open_studio", "set_rate". |
| `payload` | string | no |  |

#### ViewExclusion

Views excluded from the verified count, with the cause and a plain-language detail (View Ledger).

| Field | Type | Req | Notes |
|---|---|---|---|
| `cause` | enum ExclusionCause | yes |  |
| `views` | int | yes |  |
| `detail` | string | yes | e.g. "62% of views in two hours came from an unknown external source". |

#### LintOverride

An Ops override of a Brief Lint finding on a bounty (logged).

| Field | Type | Req | Notes |
|---|---|---|---|
| `code` | enum BriefLintCode | yes |  |
| `by_user_id` | -> users | yes |  |
| `reason` | string | yes |  |
| `at` | iso | yes |  |

#### PromiseMetric

The public proof metric of one of the 11 flowd Promise commitments (shown on /promise and /trust, computed from the ledger).

| Field | Type | Req | Notes |
|---|---|---|---|
| `number` | int | yes | 1 to 11. |
| `key` | string | yes | e.g. "cleared_on_eta". |
| `label` | string | yes |  |
| `value` | number | yes |  |
| `unit` | string | yes | "ratio", "hours", "count" or "cents". |
| `display` | string | yes | Preformatted, e.g. "97.4% cleared on or before the ETA". |
| `target` | number | no |  |
| `note` | string | yes |  |

#### PersonaCreator

The demo creator persona.

| Field | Type | Req | Notes |
|---|---|---|---|
| `user_id` | -> users | yes |  |
| `creator_id` | -> creators | yes |  |
| `handle` | string | yes |  |

#### PersonaBrand

The demo brand persona.

| Field | Type | Req | Notes |
|---|---|---|---|
| `user_id` | -> users | yes |  |
| `member_id` | -> brand_members | yes |  |
| `brand_id` | -> brands | yes |  |
| `app_id` | -> apps | yes |  |

#### PersonaAdmin

The demo admin persona (Ops).

| Field | Type | Req | Notes |
|---|---|---|---|
| `user_id` | -> users | yes |  |

#### Personas

The three demo personas. Role switching is a demo affordance on /login and in the account menu.

| Field | Type | Req | Notes |
|---|---|---|---|
| `creator` | PersonaCreator | yes |  |
| `brand` | PersonaBrand | yes |  |
| `admin` | PersonaAdmin | yes |  |

#### TickerEvent

One event on the public payout ticker. Creator identity is public handle only or anonymised.

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | yes | tick_<n>. |
| `kind` | enum TickerKind | yes |  |
| `at` | iso | yes |  |
| `text` | string | yes | Ready to render: "@kai.frames was paid $84.20". |
| `amount_cents` | cents | no |  |
| `creator_id` | -> creators | no |  |
| `handle` | string | no | Public handle; absent when anonymous. |
| `tier` | enum Tier | no |  |
| `bounty_id` | -> bounties | no |  |
| `app_name` | string | no |  |
| `proof_id` | string | no | prf_ id of a public proof page. |

#### HoldSummary

Holds in a payout run, grouped by named reason.

| Field | Type | Req | Notes |
|---|---|---|---|
| `reason` | enum HoldReason | yes |  |
| `count` | int | yes |  |
| `cents` | cents | yes |  |

#### Renewal

A rights renewal.

| Field | Type | Req | Notes |
|---|---|---|---|
| `at` | iso | yes |  |
| `days` | int | yes | Extension in days (multiples of 30). |
| `fee_cents` | cents | yes |  |
| `ledger_txn_id` | string | no |  |
| `requested_by_member_id` | -> brand_members | no |  |

#### Bid

A sealed bid in an auction. Bidders see only their own bid until the auction closes.

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | yes | bid_<n>. |
| `brand_id` | -> brands | yes |  |
| `bidder_member_id` | -> brand_members | yes |  |
| `amount_cents` | cents | yes | The maximum the brand will pay per slot (second price: winners pay the highest losing bid). |
| `status` | enum BidStatus | yes |  |
| `placed_at` | iso | yes |  |
| `escrow_hold_cents` | cents | yes | Held from the brand wallet while the auction is open. |
| `pays_cents` | cents | no | The uniform clearing price a winner actually paid. |
| `note` | string | no |  |

#### SpecLicense

A brand's licence of a spec.

| Field | Type | Req | Notes |
|---|---|---|---|
| `brand_id` | -> brands | yes |  |
| `licensed_at` | iso | yes |  |
| `price_cents` | cents | yes | Creator price (the brand also pays the take rate on top). |
| `paid_ads_days` | int | yes |  |
| `ends_at` | iso | no |  |
| `ledger_txn_id` | string | no |  |

#### Matchup

A head-to-head hook battle in a tournament bracket.

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | yes | mu_<n>. |
| `entry_a_id` | -> tournament_entries | yes |  |
| `entry_b_id` | -> tournament_entries | yes |  |
| `winner_entry_id` | -> tournament_entries | no |  |
| `score_a` | number | no |  |
| `score_b` | number | no |  |
| `metric` | string | yes | e.g. "Hook Score + 3s hold rate". |

#### TournamentRound

One round of a tournament.

| Field | Type | Req | Notes |
|---|---|---|---|
| `round` | int | yes |  |
| `name` | string | yes | e.g. "Round of 16". |
| `starts_at` | iso | yes |  |
| `ends_at` | iso | yes |  |
| `matchups` | Matchup[] | yes |  |

#### DisputeEvent

One entry in a dispute timeline.

| Field | Type | Req | Notes |
|---|---|---|---|
| `at` | iso | yes |  |
| `actor` | enum ActorKind | yes |  |
| `action` | enum DisputeAction | yes |  |
| `text` | text | yes |  |
| `user_id` | -> users | no |  |

#### HourlyEnvelope

Hourly view curve with the expected organic envelope (fraud case evidence). 72 values each, hour 0 = post time.

| Field | Type | Req | Notes |
|---|---|---|---|
| `views` | int[] | yes | Verified views per hour. |
| `expected_low` | int[] | yes |  |
| `expected_high` | int[] | yes |  |

#### DocRef

A mock document attached to a verification.

| Field | Type | Req | Notes |
|---|---|---|---|
| `label` | string | yes |  |
| `file_name` | string | yes |  |
| `art` | ArtSeed | yes | Generated placeholder, never a real document. |

#### ComplianceCheckItem

One check inside a post-level compliance audit.

| Field | Type | Req | Notes |
|---|---|---|---|
| `type` | enum ComplianceCheckType | yes |  |
| `result` | enum ComplianceResult | yes |  |
| `message` | string | yes |  |
| `evidence` | Evidence | no |  |
| `blocks_settlement` | bool | yes |  |

#### ChatMessage

A message in an in-app thread. In-app chat only; Scam Shield annotates risky messages.

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | yes | msg_<n>. |
| `author_role` | enum AuthorRole | yes |  |
| `author_user_id` | -> users | no |  |
| `kind` | enum MessageKind | yes |  |
| `body` | text | yes |  |
| `at` | iso | yes |  |
| `warning_code` | enum ScamReason | no | Set on kind = warning. |
| `read_at` | iso | no |  |

#### RuleAuditEntry

One entry in an auto-approve rule audit log.

| Field | Type | Req | Notes |
|---|---|---|---|
| `at` | iso | yes |  |
| `actor_member_id` | -> brand_members | no |  |
| `action` | enum RuleAuditAction | yes |  |
| `note` | string | yes |  |

#### ListMember

A creator on a brand's CRM list.

| Field | Type | Req | Notes |
|---|---|---|---|
| `creator_id` | -> creators | yes |  |
| `note` | string | no |  |
| `tags` | string[] | yes |  |
| `added_at` | iso | yes |  |

#### WrappedCard

A story card in Wrapped (8 to 10 per recap).

| Field | Type | Req | Notes |
|---|---|---|---|
| `kind` | enum WrappedCardKind | yes |  |
| `title` | string | yes |  |
| `figure` | string | no | The hero figure, preformatted. |
| `caption` | string | yes |  |
| `art` | ArtSeed | yes |  |

#### WaitlistTotals

Ranked waitlist totals.

| Field | Type | Req | Notes |
|---|---|---|---|
| `creators` | int | yes |  |
| `brands` | int | yes |  |
| `invites_accepted` | int | yes |  |
| `updated_at` | iso | yes |  |

#### WaitlistLeader

A row of the ranked waitlist leaderboard (handles only, never emails).

| Field | Type | Req | Notes |
|---|---|---|---|
| `position` | int | yes |  |
| `kind` | enum PartyKind | yes |  |
| `handle` | string | yes |  |
| `referrals` | int | yes |  |
| `joined_at` | iso | yes |  |

#### MarketHealth

Market health metrics on the admin control tower.

| Field | Type | Req | Notes |
|---|---|---|---|
| `fill_rate_48h` | ratio | yes | Share of bounties that filled within 48 hours. |
| `median_fill_hours` | number | yes |  |
| `median_decision_hours` | number | yes |  |
| `decided_in_sla_ratio` | ratio | yes |  |
| `cleared_on_eta_ratio` | ratio | yes |  |
| `disputes_resolved_48h_ratio` | ratio | yes |  |
| `funded_live_ratio` | ratio | yes | Always 1.0: no bounty goes live unfunded. |
| `first_dollar_median_hours` | number | yes |  |
| `active_creators_per_live_bounty` | number | yes |  |

#### QueueCounts

Open items per admin queue.

| Field | Type | Req | Notes |
|---|---|---|---|
| `fraud_open` | int | yes |  |
| `disputes_open` | int | yes |  |
| `verification_open` | int | yes |  |
| `safety_new` | int | yes |  |
| `sla_stale` | int | yes |  |
| `sla_breached` | int | yes |  |
| `payouts_held` | int | yes |  |

#### NextPayoutRun

Preview of the next Friday payout run.

| Field | Type | Req | Notes |
|---|---|---|---|
| `run_id` | string | yes | run_YYYY-MM-DD. |
| `scheduled_for` | iso | yes |  |
| `creators` | int | yes |  |
| `total_cents` | cents | yes |  |
| `holds` | int | yes |  |
| `held_cents` | cents | yes |  |

#### AdminSummary

Money summary on the control tower.

| Field | Type | Req | Notes |
|---|---|---|---|
| `gmv_30d_cents` | cents | yes | Creator pay + fees settled in 30 days. |
| `fees_30d_cents` | cents | yes |  |
| `paid_total_cents` | cents | yes |  |
| `active_creators_30d` | int | yes |  |
| `live_bounties` | int | yes |  |
| `brands_active_30d` | int | yes |  |

#### TierStatsSnapshot

Creator stats at a point in time (tier history).

| Field | Type | Req | Notes |
|---|---|---|---|
| `lifetime_cleared_cents` | cents | yes |  |
| `approved_count` | int | yes |  |
| `approval_rate` | ratio | yes |  |
| `reliability_score` | int | yes |  |

#### ModelJobStats

Pipeline job stats for a model.

| Field | Type | Req | Notes |
|---|---|---|---|
| `queue_depth` | int | yes |  |
| `jobs_24h` | int | yes |  |
| `failed_24h` | int | yes |  |
| `median_latency_s` | number | yes |  |

#### CaseMetrics

Public case-study numbers (fictional in the demo).

| Field | Type | Req | Notes |
|---|---|---|---|
| `views` | int | yes |  |
| `installs` | int | yes |  |
| `trials` | int | yes |  |
| `paid` | int | yes |  |
| `spend_cents` | cents | yes |  |
| `cost_per_trial_cents` | cents | yes |  |
| `creators` | int | yes |  |
| `period_days` | int | yes |  |
<!-- /GENERATED:value-types -->

---

## 8. State machines

Transitions are triggered by one of four actors: the **creator** (app or portal), the **brand** (dashboard, Slack or API), **admin** (Ops) and **system** (a scheduled job or model). Scheduled jobs: hourly view and conversion sync, 6-hourly View Ledger snapshots inside the 72-hour window, the fraud and disclosure check within 12 hours of a window closing, the **daily clearing run at 14:00 UTC**, the **weekly payout run on Fridays at 18:00 UTC**, rights-expiry alerts (30, 14, 7 days), the Daily Drop at 16:00 UTC, the leaderboard reset on Mondays 00:00 UTC.

Rules that cut across machines:

- **A bounty cannot go live until fully escrowed** (Funded). `409 bounty_not_funded` otherwise.
- **Reserved Slot**: submit reserves `per_video_cap + fee` from `remaining`; rejection, withdrawal, expiry and release give it back; approved posts are paid even if the pool later empties.
- **No-Rug Approvals**: 72-hour SLA from the time the current version enters review; reason code and evidence mandatory on rejection; no post-approval rejection except proven fraud (delivered legitimate views are still paid); two included revision rounds (extra rounds are paid by the brand); one appeal per rejection; an SLA breach escalates and costs the brand reliability; approved-but-unused after 30 days is released to the Spec Market (the brand keeps first refusal for 7 days).
- **Clawbacks** are only for proven fraud or refunds and are separate ledger transactions that reference the original.

<!-- GENERATED:state-machines -->
23 state machines. Each transition lists who triggers it (`creator`, `brand`, `admin`, `system`). `(create)` means the row is created in that state. Anything not listed is not allowed (the mock API returns `409 conflict`).

#### bounty (`BountyStatus`)

A bounty cannot go live until fully escrowed (the Funded badge). Brief Lint blockers prevent publishing.

Initial: `draft`. Terminal: `settled`, `cancelled`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| `draft` | `awaiting_funding` | brand | Publish | Brief Lint has no blockers; budget >= $100. |
| `draft` | `cancelled` | brand | Discard draft |  |
| `awaiting_funding` | `draft` | brand | Edit brief |  |
| `awaiting_funding` | `live` | system | Escrow fully funded | escrow_funded_cents >= budget_cents + fee_reserve_cents and starts_at <= now. |
| `awaiting_funding` | `scheduled` | system | Escrow fully funded | Funded but starts_at is in the future. |
| `awaiting_funding` | `cancelled` | brand | Cancel |  |
| `scheduled` | `live` | system | starts_at reached |  |
| `scheduled` | `cancelled` | brand / admin | Cancel | Escrow refunded to the wallet. |
| `live` | `paused` | brand / admin | Pause | Ops pauses for a compliance or scam review. |
| `paused` | `live` | brand / admin | Resume |  |
| `live` | `filled` | system | Budget fully reserved | remaining_cents < one reservation unit (per_video_cap + fee). |
| `filled` | `live` | system | Reservations released | A rejection, withdrawal or settlement freed at least one reservation unit and ends_at has not passed. |
| `live` | `ended` | brand / system | End now / ends_at reached |  |
| `paused` | `ended` | brand / system | End now / ends_at reached |  |
| `filled` | `ended` | brand / system | End now / ends_at reached |  |
| `live` | `cancelled` | brand / admin | Cancel | Only with zero approved submissions. |
| `paused` | `cancelled` | brand / admin | Cancel | Only with zero approved submissions. |
| `ended` | `settled` | system | All windows closed | Every post window and 30-day CPA window is closed; unspent escrow refunded to the wallet. |

Main path: `draft` -> `awaiting_funding` -> `live` -> `paused` -> `ended` -> `settled`. States: `draft`, `awaiting_funding`, `scheduled`, `live`, `paused`, `filled`, `ended`, `settled`, `cancelled`.

#### submission (`SubmissionStatus`)

Reservation is taken on submit (up to the per-video cap plus fee) and released on rejection, withdrawal or expiry. Approved posts are paid even if the pool later empties.

Initial: `qa_pending`. Terminal: `posted`, `withdrawn`, `expired`, `released`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `qa_pending` | creator | Submit | Bounty is live or filled-with-capacity; creator tier early-access window open; a reservation can be taken. |
| `qa_pending` | `in_review` | system | QA and scoring complete | Starts the 72h SLA clock. |
| `qa_pending` | `rejected` | system | Hard QA failure | Exact duplicate or moderation fail; evidence attached. |
| `in_review` | `approved` | brand / system | Approve / auto-approve rule / timeout approve-if-clean | Auto-approve only when every guardrail passes. |
| `in_review` | `changes_requested` | brand | Request changes | At least one must-fix timecoded note; revision_round < 2 (extra rounds are paid by the brand). |
| `in_review` | `rejected` | brand | Reject | Reason code + evidence mandatory; must cite a stated requirement. |
| `in_review` | `withdrawn` | creator | Withdraw |  |
| `changes_requested` | `qa_pending` | creator | Resubmit | Creates version + 1; carries open must-fix notes. |
| `changes_requested` | `withdrawn` | creator | Withdraw |  |
| `changes_requested` | `expired` | system | No resubmission in 14 days |  |
| `approved` | `posted` | creator / system | Post detected and verified | Creates the post, opens the 72h window. |
| `approved` | `released` | system | Unused for 30 days | Not posted and not used; moves to the Spec Market (brand keeps first refusal for 7 days). |
| `approved` | `withdrawn` | creator | Withdraw | Before posting. |
| `rejected` | `appealed` | creator | Appeal | One appeal per rejection, within 7 days. |
| `appealed` | `approved` | admin | Overturn | Ops decides within 72h; brand notified; reliability effect on the brand. |
| `appealed` | `rejected` | admin | Uphold | No further appeal. |

Main path: `qa_pending` -> `in_review` -> `approved` -> `posted`. States: `qa_pending`, `in_review`, `changes_requested`, `approved`, `posted`, `rejected`, `appealed`, `withdrawn`, `expired`, `released`.

#### post (`PostStatus`)

Tracks the CPM / flat-fee leg. 72-hour window, then fraud and compliance check, then cleared. Conversions and ad commission settle on their own ledger rows.

Initial: `live`. Terminal: `paid`, `removed`, `clawed_back`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `live` | system | Post verified | posted_at set; window_ends_at = posted_at + 72h. |
| `live` | `window_closed` | system | 72 hours elapsed |  |
| `live` | `removed` | creator / system | Post deleted before the window closes | Earns nothing. |
| `window_closed` | `cleared` | system | Fraud + compliance check passed | fraud score < 40 and compliance not failed; at the next daily clearing run. |
| `window_closed` | `held` | system | Fraud score >= 40 or compliance fail or dispute opened |  |
| `held` | `cleared` | admin | Hold resolved in favour of the creator |  |
| `held` | `clawed_back` | admin | Fraud confirmed | Invalid views reversed; delivered legitimate views still paid. |
| `cleared` | `paid` | system | Included in a weekly payout or an instant cash-out |  |
| `cleared` | `clawed_back` | admin | Proven fraud found after clearing | Only proven fraud can undo an approved, cleared post. |

Main path: `live` -> `window_closed` -> `cleared` -> `paid`. States: `live`, `window_closed`, `held`, `cleared`, `paid`, `removed`, `clawed_back`.

#### ledger (`LedgerStatus`)

Ledger rows are append-only. Only status, cleared_at, paid_at and payout_id are ever updated.

Initial: `pending`. Terminal: `paid`, `reversed`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `pending` | system | Settlement writes the rows | The txn nets to zero. |
| `pending` | `cleared` | system | Clearing run | Fraud and compliance passed; conversion windows elapsed. |
| `pending` | `held` | system / admin | Hold placed |  |
| `held` | `cleared` | admin / system | Hold released |  |
| `cleared` | `paid` | system | Payout created | payout_id set. |
| `pending` | `reversed` | admin / system | Clawback |  |
| `cleared` | `reversed` | admin | Clawback | Proven fraud only. |
| `held` | `reversed` | admin | Clawback |  |

Main path: `pending` -> `cleared` -> `paid`. States: `pending`, `cleared`, `paid`, `held`, `reversed`.

#### payout (`PayoutStatus`)

Weekly payouts run Fridays 18:00 UTC; instant payouts start at processing.

Initial: `scheduled`. Terminal: `paid`, `cancelled`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `scheduled` | system | Cleared earnings exist | Weekly auto-payout. |
| (create) | `processing` | creator | Instant cash-out | Fee previewed and confirmed first. |
| `scheduled` | `processing` | system | Weekly run starts | Fri 18:00 UTC; tax info, ID and payout method present. |
| `scheduled` | `held` | system / admin | Hold | Missing tax info, ID, payout method, fraud review or dispute. |
| `held` | `scheduled` | system / admin | Hold released |  |
| `scheduled` | `cancelled` | creator / admin | Cancel |  |
| `processing` | `in_transit` | system | Transfer created |  |
| `in_transit` | `paid` | system | Transfer confirmed |  |
| `processing` | `failed` | system | Transfer failed |  |
| `in_transit` | `failed` | system | Transfer returned |  |
| `failed` | `scheduled` | system | Method fixed; retry at the next run |  |

Main path: `scheduled` -> `processing` -> `in_transit` -> `paid`. States: `scheduled`, `processing`, `in_transit`, `paid`, `failed`, `held`, `cancelled`.

#### offer (`OfferStatus`)

Negotiation: at most 3 counter rounds; expires after 7 days with no response.

Initial: `awaiting_creator`. Terminal: `declined`, `expired`, `withdrawn`, `completed`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `awaiting_creator` | brand | Send offer / invite / re-buy |  |
| `awaiting_creator` | `accepted` | creator | Accept | Brand wallet funds the private direct bounty at acceptance. |
| `awaiting_creator` | `awaiting_brand` | creator | Counter |  |
| `awaiting_creator` | `declined` | creator | Decline |  |
| `awaiting_brand` | `accepted` | brand | Accept counter |  |
| `awaiting_brand` | `awaiting_creator` | brand | Counter back | Max 3 counter rounds. |
| `awaiting_brand` | `declined` | brand | Decline |  |
| `awaiting_creator` | `withdrawn` | brand | Withdraw |  |
| `awaiting_brand` | `withdrawn` | brand | Withdraw |  |
| `awaiting_creator` | `expired` | system | 7 days, no response |  |
| `awaiting_brand` | `expired` | system | 7 days, no response |  |
| `accepted` | `completed` | system | Video approved and paid |  |

Main path: `awaiting_creator` -> `accepted` -> `completed`. States: `awaiting_creator`, `awaiting_brand`, `accepted`, `declined`, `expired`, `withdrawn`, `completed`.

#### auction (`AuctionStatus`)

Sealed-bid, second price. k slots: the k highest bids win and all pay the highest losing bid (or the reserve if there is none).

Initial: `scheduled`. Terminal: `awarded`, `no_bids`, `cancelled`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `scheduled` | creator | Create auction | Platinum or Elite creator. |
| `scheduled` | `open` | system | opens_at reached |  |
| `open` | `closed` | system | closes_at reached |  |
| `closed` | `awarded` | system | Resolve | Winners charged from their wallets; each creates a private direct bounty. |
| `closed` | `no_bids` | system | Resolve |  |
| `scheduled` | `cancelled` | creator / admin | Cancel |  |
| `open` | `cancelled` | creator / admin | Cancel | Bids released. |

Main path: `scheduled` -> `open` -> `closed` -> `awarded`. States: `scheduled`, `open`, `closed`, `awarded`, `no_bids`, `cancelled`.

#### dispute (`DisputeStatus`)

One-tap dispute with a human reply SLA of 24 hours.

Initial: `open`. Terminal: `resolved`, `withdrawn`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `open` | creator / brand | Open dispute |  |
| `open` | `evidence_requested` | admin | Request evidence |  |
| `evidence_requested` | `open` | creator / brand | Provide evidence |  |
| `open` | `under_review` | admin | Start review |  |
| `evidence_requested` | `under_review` | admin | Start review |  |
| `under_review` | `resolved` | admin | Decide | outcome set: upheld, partially_upheld or rejected. |
| `open` | `withdrawn` | creator / brand | Withdraw |  |
| `evidence_requested` | `withdrawn` | creator / brand | Withdraw |  |

Main path: `open` -> `evidence_requested` -> `under_review` -> `resolved`. States: `open`, `evidence_requested`, `under_review`, `resolved`, `withdrawn`.

#### rights_grant (`RightsGrantStatus`)

Expiry alerts at 30, 14 and 7 days. Ads stop automatically when rights end.

Initial: `pending_permission`. Terminal: `expired`, `revoked`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `active` | system | Approval creates the organic grant | Organic is always included. |
| (create) | `pending_permission` | brand | Request Spark code / partnership permission |  |
| `pending_permission` | `active` | creator | Creator grants permission or shares the code |  |
| `pending_permission` | `revoked` | creator | Creator declines |  |
| `active` | `expiring` | system | 30 days before ends_at |  |
| `expiring` | `renewal_requested` | brand | Request renewal | 25% of the base fee per 30 days. |
| `active` | `renewal_requested` | brand | Request renewal |  |
| `renewal_requested` | `active` | creator / system | Renewal accepted | ends_at extended; rights_fee charged to the wallet. |
| `expiring` | `expired` | system | ends_at reached | Running ads stop. |
| `active` | `expired` | system | ends_at reached |  |
| `active` | `revoked` | creator / admin | Revoke | Misuse beyond the Rights Card. |
| `expiring` | `revoked` | creator / admin | Revoke |  |

Main path: `pending_permission` -> `active` -> `expiring` -> `renewal_requested`. States: `pending_permission`, `active`, `expiring`, `renewal_requested`, `expired`, `revoked`.

#### ad (`AdStatus`)

Winner promotion. Ad commission is 10% of ad-attributed revenue for 60 days from the first live day; the platform fee is 1% of ad spend.

Initial: `requested`. Terminal: `ended`, `expired`, `declined`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `requested` | brand | Promote winner | Pro plan; post is cleared; paid-ad rights active. |
| `requested` | `authorised` | creator | Grant permission / share Spark code |  |
| `requested` | `declined` | creator | Decline |  |
| `authorised` | `live` | brand | Launch | Ad account connected. |
| `authorised` | `expired` | system | Code or rights expired before launch |  |
| `live` | `paused` | brand | Pause |  |
| `paused` | `live` | brand | Resume |  |
| `live` | `fatigued` | system | Trial-start rate down 30% from peak |  |
| `fatigued` | `live` | system | Recovered |  |
| `live` | `ended` | brand | Stop |  |
| `paused` | `ended` | brand | Stop |  |
| `fatigued` | `ended` | brand | Stop |  |
| `live` | `expired` | system | Spark code or rights ended |  |
| `fatigued` | `expired` | system | Spark code or rights ended |  |

Main path: `requested` -> `authorised` -> `live` -> `paused` -> `ended`. States: `requested`, `authorised`, `live`, `paused`, `fatigued`, `ended`, `expired`, `declined`.

#### verification (`VerificationStatus`)

ID, age, business, tax and payout-method verifications. Just-in-time at first approval for creators.

Initial: `not_started`. Terminal: none (can cycle).

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| `not_started` | `pending` | creator / brand | Submit |  |
| `pending` | `verified` | system / admin | Provider or Ops approves |  |
| `pending` | `needs_info` | system / admin | More information needed |  |
| `pending` | `rejected` | system / admin | Cannot verify |  |
| `needs_info` | `pending` | creator / brand | Resubmit |  |
| `rejected` | `pending` | creator / brand | Resubmit |  |
| `verified` | `expired` | system | Validity ended |  |
| `expired` | `pending` | creator / brand | Renew |  |

Main path: `not_started` -> `pending` -> `verified`. States: `not_started`, `pending`, `needs_info`, `verified`, `rejected`, `expired`.

#### conversion (`ConversionStatus`)

Conversion batches clear after install 24h, trial 72h, paid 168h. CPA pays only on link and code sources.

Initial: `pending`. Terminal: `rejected`, `refunded`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `pending` | system | Attributed (link, code, MMP, survey or modelled) |  |
| `pending` | `cleared` | system | Clearing window elapsed | Payable sources write a cpa ledger row. |
| `pending` | `rejected` | system | Duplicate or fraud |  |
| `cleared` | `refunded` | system | Refund inside the window | CPA reversed. |

Main path: `pending` -> `cleared` -> `refunded`. States: `pending`, `cleared`, `rejected`, `refunded`.

#### money_clock (`MoneyClockState`)

The creator-facing projection of earnings. Derived from posts, conversions and the ledger; never edited directly.

Initial: `accruing`. Terminal: `paid`, `reversed`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `accruing` | system | Post goes live |  |
| `accruing` | `pending` | system | Window closes / conversion tracked |  |
| `pending` | `cleared` | system | Clearing run |  |
| `pending` | `held` | system / admin | Hold |  |
| `held` | `cleared` | admin / system | Hold released |  |
| `cleared` | `paid` | system | Payout |  |
| `pending` | `reversed` | admin | Clawback |  |
| `cleared` | `reversed` | admin | Clawback |  |
| `held` | `reversed` | admin | Clawback |  |

Main path: `accruing` -> `pending` -> `cleared` -> `paid`. States: `accruing`, `pending`, `cleared`, `paid`, `held`, `reversed`.

#### daily_drop (`DropStatus`)

One drop a day at 16:00 UTC. Spots left is always a true count.

Initial: `upcoming`. Terminal: `sold_out`, `closed`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `upcoming` | system | Scheduled |  |
| `upcoming` | `live` | system | 16:00 UTC |  |
| `live` | `sold_out` | system | Last spot claimed |  |
| `live` | `closed` | system | Claim window ended (24h) | Unclaimed spots return to the open feed. |

Main path: `upcoming` -> `live` -> `sold_out`. States: `upcoming`, `live`, `sold_out`, `closed`.

#### tournament (`TournamentStatus`)

Sponsored prize pools; prizes paid as ledger rows of type prize.

Initial: `announced`. Terminal: `complete`, `cancelled`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `announced` | admin | Announce |  |
| `announced` | `open` | system | Entries open |  |
| `open` | `live` | system | Starts |  |
| `live` | `judging` | system | Final round ends |  |
| `judging` | `complete` | system / admin | Results verified, prizes paid |  |
| `announced` | `cancelled` | admin | Cancel |  |
| `open` | `cancelled` | admin | Cancel |  |

Main path: `announced` -> `open` -> `live` -> `judging` -> `complete`. States: `announced`, `open`, `live`, `judging`, `complete`, `cancelled`.

#### auto_approve_rule (`RuleStatus`)

Guarded auto-approve: a dry run on the last 50 submissions is mandatory; 10% spot-check; kill switch.

Initial: `draft`. Terminal: none (can cycle).

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| `draft` | `dry_run` | brand | Run dry run |  |
| `dry_run` | `active` | brand | Enable | A dry run completed on the current conditions. |
| `dry_run` | `draft` | brand | Edit conditions |  |
| `active` | `paused` | brand / system | Pause / guardrail trip | Any clawback or fraud event pauses the rule. |
| `paused` | `active` | brand | Resume |  |
| `active` | `killed` | brand | Kill switch |  |
| `paused` | `killed` | brand | Kill switch |  |
| `killed` | `dry_run` | brand | Re-enable | Needs a fresh dry run. |

Main path: `draft` -> `dry_run` -> `active` -> `paused`. States: `draft`, `dry_run`, `active`, `paused`, `killed`.

#### fatigue_alert (`FatigueStatus`)

Rule-based: trial-start rate down 30% from peak.

Initial: `open`. Terminal: `resolved`, `dismissed`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `open` | system | Detected |  |
| `open` | `acknowledged` | brand | Acknowledge |  |
| `open` | `dismissed` | brand | Dismiss |  |
| `acknowledged` | `refreshing` | brand | Create refresh bounty |  |
| `refreshing` | `resolved` | system / brand | Refresh live / recovered |  |
| `acknowledged` | `dismissed` | brand | Dismiss |  |

Main path: `open` -> `acknowledged` -> `refreshing` -> `resolved`. States: `open`, `acknowledged`, `refreshing`, `resolved`, `dismissed`.

#### spec (`SpecStatus`)

Spec Market. A spec needs Flow Score 55+ (band C) to list. Released-from-bounty specs start in first refusal.

Initial: `draft`. Terminal: `withdrawn`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `draft` | creator | Upload spec |  |
| `draft` | `scoring` | creator | Submit for scoring |  |
| `scoring` | `listed` | system | Scored and QA passed | Flow points >= 55. |
| `scoring` | `draft` | system | Below listing score or QA failed |  |
| (create) | `first_refusal` | system | Released from a bounty | Source brand has 7 days of first refusal. |
| `first_refusal` | `licensed` | brand | Original brand licenses it |  |
| `first_refusal` | `listed` | system | 7 days elapsed |  |
| `listed` | `licensed` | brand | License | Take rate applies on top of the price. |
| `licensed` | `listed` | system | Non-exclusive: stays listed |  |
| `listed` | `withdrawn` | creator | Withdraw |  |
| `draft` | `withdrawn` | creator | Withdraw |  |

Main path: `draft` -> `scoring` -> `listed` -> `licensed`. States: `draft`, `scoring`, `first_refusal`, `listed`, `licensed`, `withdrawn`.

#### referral (`ReferralStatus`)

Single level, platform-funded; the referred person is never charged.

Initial: `invited`. Terminal: `complete`, `expired`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `invited` | creator / brand | Invite |  |
| `invited` | `joined` | system | Signs up with the code |  |
| `invited` | `expired` | system | Unused for 30 days |  |
| `joined` | `first_dollar` | system | First cleared earnings (creators) / first funded bounty (brands) |  |
| `first_dollar` | `earning` | system | Reward window opens |  |
| `earning` | `complete` | system | 90 days, 12 months or cap reached |  |

Main path: `invited` -> `joined` -> `first_dollar` -> `earning` -> `complete`. States: `invited`, `joined`, `first_dollar`, `earning`, `complete`, `expired`.

#### fraud_flag (`FraudFlagStatus`)

Admin fraud queue (fraud score 40+).

Initial: `open`. Terminal: `cleared`, `confirmed`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `open` | system | Score 40 or above |  |
| `open` | `monitoring` | admin | Watch more snapshots |  |
| `monitoring` | `open` | system | New anomaly |  |
| `open` | `cleared` | admin | False positive |  |
| `monitoring` | `cleared` | admin | False positive |  |
| `open` | `confirmed` | admin | Confirm fraud |  |
| `monitoring` | `confirmed` | admin | Confirm fraud |  |

Main path: `open` -> `monitoring` -> `cleared`. States: `open`, `monitoring`, `cleared`, `confirmed`.

#### scam_report (`ReportStatus`)

Scam Shield reports from creators or brands.

Initial: `new`. Terminal: `actioned`, `dismissed`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `new` | creator / brand | Report |  |
| `new` | `triaged` | admin | Triage |  |
| `triaged` | `confirmed` | admin | Confirm |  |
| `triaged` | `dismissed` | admin | Dismiss |  |
| `confirmed` | `actioned` | admin | Suspend / remove |  |

Main path: `new` -> `triaged` -> `confirmed` -> `actioned`. States: `new`, `triaged`, `confirmed`, `actioned`, `dismissed`.

#### invoice (`InvoiceStatus`)

Brand invoices (funding, subscription, ad fee).

Initial: `draft`. Terminal: `void`, `refunded`.

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| (create) | `draft` | system | Created |  |
| `draft` | `open` | system | Issued |  |
| `open` | `paid` | system | Paid |  |
| `open` | `void` | system / admin | Voided |  |
| `paid` | `refunded` | admin | Refund |  |

Main path: `draft` -> `open` -> `paid` -> `refunded`. States: `draft`, `open`, `paid`, `void`, `refunded`.

#### tax_profile (`TaxStatus`)

Tax Desk. W-9 is requested just in time at the first approval, before the first payout.

Initial: `none`. Terminal: none (can cycle).

| From | To | Actor | Trigger | Guard |
|---|---|---|---|---|
| `none` | `requested` | system | First approval |  |
| `requested` | `submitted` | creator | Submit form |  |
| `submitted` | `verified` | system / admin | Verified |  |
| `submitted` | `rejected` | system / admin | Name or TIN mismatch |  |
| `rejected` | `submitted` | creator | Resubmit |  |
| `verified` | `expired` | system | W-8BEN older than 3 years |  |
| `expired` | `submitted` | creator | Renew |  |

Main path: `none` -> `requested` -> `submitted` -> `verified`. States: `none`, `requested`, `submitted`, `verified`, `rejected`, `expired`.
<!-- /GENERATED:state-machines -->

---

## 9. Constants

Every number lives in `CONSTANTS` (generated into `types.ts`). Plans and tiers first, then everything else by section.

### 9.1 Plans and fees

<!-- GENERATED:plans -->
| Plan | Label | Price | Take rate | # features | Features (PlanFeature keys) |
|---|---|---|---|---|---|
| free | Free | $0 | 12% | 8 | escrow, review_queue, funnel, creator_discovery, rights_card, free_tools, brief_lint, attribution_kit |
| pro | Pro | $299/mo | 10% | 16 | escrow, review_queue, funnel, creator_discovery, rights_card, free_tools, brief_lint, attribution_kit, learned_scorer, guarded_auto_approve, market_view, rights_vault, test_planner, slack, api, winner_promotion |
| scale | Scale | $999/mo | 8% | 22 | escrow, review_queue, funnel, creator_discovery, rights_card, free_tools, brief_lint, attribution_kit, learned_scorer, guarded_auto_approve, market_view, rights_vault, test_planner, slack, api, winner_promotion, multi_app, agency_workspaces, roles, finance_pack, slas, white_label_reports |

CPA-only and install-only bounties: flat 6%, taken only from cleared conversions. First bounty: fee waived and matched budget up to $500. Winner promotion: 1% of ad spend. Creators always free. Weekly payout free; instant 1.5% (min 0.50, max 15.00).
<!-- /GENERATED:plans -->

### 9.2 Tier thresholds and perks

<!-- GENERATED:tiers -->
| Tier | Lifetime cleared | Approved | Approval | Reliability | Manual review | Early access | Rate card | Free instant | Crews lead | Auctions | Featured |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bronze | $0 | 0 | 0% | - | - | - | - | - | - | - | - |
| silver | $250 | 5 | 70% | - | - | 1 h | yes | - | - | - | - |
| gold | $2,000 | 25 | 75% | - | - | 3 h | yes | 1 / week | yes | - | - |
| platinum | $10,000 | 80 | 80% | 90 | - | 6 h | yes | unlimited | yes | yes | - |
| elite | $50,000 | 250 | 85% | 95 | yes | 12 h | yes | unlimited | yes | yes | yes |

No tier drop for 30 days after a dip (grace hold). Founding creators' verified prior history counts toward the thresholds.
<!-- /GENERATED:tiers -->

### 9.3 Everything else

Headline numbers from DECISIONS.md for orientation: CPM is cents per 1,000 **verified** views; bounty default **$2.00** CPM, floor **$0.50**, per-video cap default **$250**; CPA defaults **$0.40** install, **$1.50** trial, **$4.00** paid; ad commission **10%** of ad-attributed revenue for **60 days**; **72-hour** view window then fraud check then cleared; **weekly auto-payout Fridays 18:00 UTC**; instant cash-out **1.5%** (min $0.50, max $15); review SLA **72 hours** with **two** revision rounds and **one** appeal; approved-but-unused released after **30 days**; paid-ad rights default **90 days**, renewal **25%** of base fee per 30 days, alerts at 30, 14 and 7 days; Daily Drop at **16:00 UTC**; peer cohorts of **~30**; streak freezes **1 per 4 weeks, max 2**; Apple caps active offer codes at **10** per subscription SKU.

<!-- GENERATED:constants -->
CONSTANTS is the single place every number lives. It is exported from `types.ts` (`CONSTANTS`), mirrored in `apps/web/src/lib/engine/constants.ts` and iOS `Core/Engine/Constants.swift`. Money is integer cents; ratios are 0..1; durations carry their unit in the name. Source tags: `DECISIONS` = fixed by docs/DECISIONS.md; `CONTRACT` = a contract-defined default to be tested with design partners.

#### now

`now` = `2026-10-03T14:00:00Z`

#### world

| Path | Value |
|---|---|
| `world.launch_date` | 2026-07-05 |
| `world.history_days` | 90 |
| `world.currency` | USD |
| `world.public_domain` | joinflowd.io |
| `world.api_host` | api.joinflowd.io |
| `world.app_host` | app.joinflowd.io |
| `world.contact_email` | hello@joinflowd.io |
| `world.min_age` | 18 |

#### plans

- **plans** (DECISIONS §2): Free 12% / Pro $299 at 10% / Scale $999 at 8%. Creators always free. Price shown all-in.

| Path | Value |
|---|---|
| `plans.free.label` | Free |
| `plans.free.price_cents_month` | 0 ($0.00) |
| `plans.free.take_rate` | 0.12 (12%) |
| `plans.free.features` | escrow, review_queue, funnel, creator_discovery, rights_card, free_tools, brief_lint, attribution_kit |
| `plans.pro.label` | Pro |
| `plans.pro.price_cents_month` | 29900 ($299.00) |
| `plans.pro.take_rate` | 0.1 (10%) |
| `plans.pro.features` | escrow, review_queue, funnel, creator_discovery, rights_card, free_tools, brief_lint, attribution_kit, learned_scorer, guarded_auto_approve, market_view, rights_vault, test_planner, slack, api, winner_promotion |
| `plans.scale.label` | Scale |
| `plans.scale.price_cents_month` | 99900 ($999.00) |
| `plans.scale.take_rate` | 0.08 (8%) |
| `plans.scale.features` | escrow, review_queue, funnel, creator_discovery, rights_card, free_tools, brief_lint, attribution_kit, learned_scorer, guarded_auto_approve, market_view, rights_vault, test_planner, slack, api, winner_promotion, multi_app, agency_workspaces, roles, finance_pack, slas, white_label_reports |

#### fees

- **fees.cpa_only_take_rate** (DECISIONS §2): Install- and trial-only (CPA-only) bounties: flat 6%, charged only on cleared conversions.
- **fees.first_bounty_fee_waived** (DECISIONS §2): First bounty: platform fee waived and matched budget up to $500 (design-partner programme).
- **fees.ad_spend_fee_rate** (DECISIONS §2): Winner promotion fee: 1% of ad spend.
- **fees.instant_payout_** (DECISIONS §2): Instant cash-out fee 1.5%, min $0.50, max $15; fee shown before confirm. Weekly payout free.
- **fees.card_processing_** (CONTRACT): Card funding processing passed through at cost (2.9% + $0.30) and shown in the all-in price. Not refundable on unspent budget.

| Path | Value |
|---|---|
| `fees.cpa_only_take_rate` | 0.06 (6%) |
| `fees.first_bounty_fee_waived` | true |
| `fees.matched_first_bounty_cap_cents` | 50000 ($500.00) |
| `fees.ad_spend_fee_rate` | 0.01 (1%) |
| `fees.weekly_payout_fee_cents` | 0 ($0.00) |
| `fees.instant_payout_rate` | 0.015 (1.5%) |
| `fees.instant_payout_min_cents` | 50 ($0.50) |
| `fees.instant_payout_max_cents` | 1500 ($15.00) |
| `fees.instant_min_amount_cents` | 500 ($5.00) |
| `fees.creator_platform_fee_rate` | 0 (0%) |
| `fees.card_processing_rate` | 0.029 (2.9%) |
| `fees.card_processing_fixed_cents` | 30 ($0.30) |

#### pay

- **pay** (DECISIONS §3): Bounty default $2.00 CPM, floor $0.50, per-video cap $250; CPA defaults $0.40 install / $1.50 trial / $4.00 paid; ad commission 10% for 60 days. CPA window 30 days (BLUEPRINT). min_bounty_budget_cents and extra_revision_pay_cents are CONTRACT.

| Path | Value |
|---|---|
| `pay.default_cpm_cents` | 200 ($2.00) |
| `pay.floor_cpm_cents` | 50 ($0.50) |
| `pay.default_per_video_cap_cents` | 25000 ($250.00) |
| `pay.default_cpa_install_cents` | 40 ($0.40) |
| `pay.default_cpa_trial_cents` | 150 ($1.50) |
| `pay.default_cpa_paid_cents` | 400 ($4.00) |
| `pay.ad_commission_rate` | 0.1 (10%) |
| `pay.ad_commission_days` | 60 |
| `pay.cpa_window_days` | 30 |
| `pay.min_bounty_budget_cents` | 10000 ($100.00) |
| `pay.extra_revision_pay_cents` | 1000 ($10.00) |

#### windows

- **windows.view_window_hours** (DECISIONS §3): 72-hour view window, then window_closed, fraud check, cleared.
- **windows.weekly_payout_** (DECISIONS §3): Weekly auto-payout Fridays 18:00 UTC (JS getUTCDay() = 5).
- **windows.clearing_** (CONTRACT): Daily clearing run 14:00 UTC; an item clears at the first run at or after window end + buffer. fraud_check_max_hours bounds the automated check.
- **windows.cpa_clear_hours** (CONTRACT): Conversions clear after install 24h, trial 72h, paid 168h (refund window).
- **windows.snapshot_interval_hours** (CONTRACT): View Ledger snapshots every 6h during the 72h window.
- **windows.offer_expiry_days** (CONTRACT): Direct offers expire after 7 days; max 3 counter rounds.

| Path | Value |
|---|---|
| `windows.view_window_hours` | 72 |
| `windows.fraud_check_max_hours` | 12 |
| `windows.clearing_run_hour_utc` | 14 |
| `windows.clearing_buffer_hours` | 2 |
| `windows.weekly_payout_weekday_utc` | 5 |
| `windows.weekly_payout_hour_utc` | 18 |
| `windows.cpa_clear_hours.install` | 24 |
| `windows.cpa_clear_hours.trial` | 72 |
| `windows.cpa_clear_hours.paid` | 168 |
| `windows.snapshot_interval_hours` | 6 |
| `windows.offer_expiry_days` | 7 |
| `windows.max_counter_rounds` | 3 |

#### review

- **review** (DECISIONS §3): 72h SLA, reason code + evidence on rejection, 2 included revision rounds (extra paid by brand), one appeal per rejection, SLA breach escalates and dents the brand score, approved-but-unused after 30 days is released to the Spec Market (brand keeps first refusal). stale_after_hours, appeal window, first_refusal_days, revision_expiry_days, undo_seconds are CONTRACT / research.

| Path | Value |
|---|---|
| `review.sla_hours` | 72 |
| `review.stale_after_hours` | 48 |
| `review.revision_rounds_included` | 2 |
| `review.appeals_per_rejection` | 1 |
| `review.appeal_window_days` | 7 |
| `review.appeal_decision_sla_hours` | 72 |
| `review.unused_release_days` | 30 |
| `review.first_refusal_days` | 7 |
| `review.revision_expiry_days` | 14 |
| `review.timeout_policy_default` | escalate |
| `review.undo_seconds` | 10 |
| `review.post_approval_rejection` | proven_fraud_only |

#### auto_approve

- **auto_approve** (research/brand-needs §6): Guarded auto-approve: dry run on last 50, 10% spot-check, first-time creators manual, organic only.

| Path | Value |
|---|---|
| `auto_approve.default_min_flow_band` | B |
| `auto_approve.default_min_creator_approved_posts` | 3 |
| `auto_approve.default_min_creator_approval_rate` | 0.9 (90%) |
| `auto_approve.default_max_fraud_score` | 20 |
| `auto_approve.default_min_us_audience_ratio` | 0.5 (50%) |
| `auto_approve.spot_check_ratio` | 0.1 (10%) |
| `auto_approve.dry_run_sample` | 50 |
| `auto_approve.first_time_creators_manual` | true |
| `auto_approve.scope` | organic_only |

#### rights

- **rights** (DECISIONS §3): Organic always included; paid-ad usage default 90 days, renewable at 25% of base fee per 30 days; AI likeness off; alerts at 30/14/7 days. Spark durations 7/30/60/365 (research).

| Path | Value |
|---|---|
| `rights.organic_always` | true |
| `rights.paid_ads_default_days` | 90 |
| `rights.renewal_fee_pct_of_base_per_30d` | 0.25 (25%) |
| `rights.expiry_alert_days` | 30, 14, 7 |
| `rights.ai_likeness_default` | false |
| `rights.spark_code_options_days` | 7, 30, 60, 365 |
| `rights.exclusivity_options_days` | 0, 14, 30, 60 |
| `rights.auto_end_ads_at_rights_expiry` | true |

#### tiers

- **tiers** (DECISIONS §3): Thresholds and perks exactly as DECISIONS; no tier drop for 30 days after a dip. founding_carry_over_counts is CONTRACT: verified prior history of founding creators counts toward thresholds (Ops reviews).

| Path | Value |
|---|---|
| `tiers.order` | bronze, silver, gold, platinum, elite |
| `tiers.thresholds.bronze.lifetime_cleared_cents` | 0 ($0.00) |
| `tiers.thresholds.bronze.approved_count` | 0 |
| `tiers.thresholds.bronze.approval_rate_min` | 0 (0%) |
| `tiers.thresholds.bronze.reliability_min` | 0 |
| `tiers.thresholds.bronze.manual_review` | false |
| `tiers.thresholds.silver.lifetime_cleared_cents` | 25000 ($250.00) |
| `tiers.thresholds.silver.approved_count` | 5 |
| `tiers.thresholds.silver.approval_rate_min` | 0.7 (70%) |
| `tiers.thresholds.silver.reliability_min` | 0 |
| `tiers.thresholds.silver.manual_review` | false |
| `tiers.thresholds.gold.lifetime_cleared_cents` | 200000 ($2,000.00) |
| `tiers.thresholds.gold.approved_count` | 25 |
| `tiers.thresholds.gold.approval_rate_min` | 0.75 (75%) |
| `tiers.thresholds.gold.reliability_min` | 0 |
| `tiers.thresholds.gold.manual_review` | false |
| `tiers.thresholds.platinum.lifetime_cleared_cents` | 1000000 ($10,000.00) |
| `tiers.thresholds.platinum.approved_count` | 80 |
| `tiers.thresholds.platinum.approval_rate_min` | 0.8 (80%) |
| `tiers.thresholds.platinum.reliability_min` | 90 |
| `tiers.thresholds.platinum.manual_review` | false |
| `tiers.thresholds.elite.lifetime_cleared_cents` | 5000000 ($50,000.00) |
| `tiers.thresholds.elite.approved_count` | 250 |
| `tiers.thresholds.elite.approval_rate_min` | 0.85 (85%) |
| `tiers.thresholds.elite.reliability_min` | 95 |
| `tiers.thresholds.elite.manual_review` | true |
| `tiers.perks.bronze.early_access_hours` | 0 |
| `tiers.perks.bronze.rate_card` | false |
| `tiers.perks.bronze.instant_cashout_free_per_week` | 0 |
| `tiers.perks.bronze.instant_cashout_unlimited` | false |
| `tiers.perks.bronze.crews_lead` | false |
| `tiers.perks.bronze.auctions` | false |
| `tiers.perks.bronze.featured_profile` | false |
| `tiers.perks.silver.early_access_hours` | 1 |
| `tiers.perks.silver.rate_card` | true |
| `tiers.perks.silver.instant_cashout_free_per_week` | 0 |
| `tiers.perks.silver.instant_cashout_unlimited` | false |
| `tiers.perks.silver.crews_lead` | false |
| `tiers.perks.silver.auctions` | false |
| `tiers.perks.silver.featured_profile` | false |
| `tiers.perks.gold.early_access_hours` | 3 |
| `tiers.perks.gold.rate_card` | true |
| `tiers.perks.gold.instant_cashout_free_per_week` | 1 |
| `tiers.perks.gold.instant_cashout_unlimited` | false |
| `tiers.perks.gold.crews_lead` | true |
| `tiers.perks.gold.auctions` | false |
| `tiers.perks.gold.featured_profile` | false |
| `tiers.perks.platinum.early_access_hours` | 6 |
| `tiers.perks.platinum.rate_card` | true |
| `tiers.perks.platinum.instant_cashout_free_per_week` | 0 |
| `tiers.perks.platinum.instant_cashout_unlimited` | true |
| `tiers.perks.platinum.crews_lead` | true |
| `tiers.perks.platinum.auctions` | true |
| `tiers.perks.platinum.featured_profile` | false |
| `tiers.perks.elite.early_access_hours` | 12 |
| `tiers.perks.elite.rate_card` | true |
| `tiers.perks.elite.instant_cashout_free_per_week` | 0 |
| `tiers.perks.elite.instant_cashout_unlimited` | true |
| `tiers.perks.elite.crews_lead` | true |
| `tiers.perks.elite.auctions` | true |
| `tiers.perks.elite.featured_profile` | true |
| `tiers.demotion_grace_days` | 30 |
| `tiers.founding_carry_over_counts` | true |

#### founding

| Path | Value |
|---|---|
| `founding.creator_count` | 200 |
| `founding.free_instant_months` | 12 |
| `founding.badge` | founding_creator |
| `founding.carry_over_counts` | true |

#### streaks

- **streaks** (DECISIONS §3): Weekly streak, earned freezes (1 per 4-week streak, max 2 banked), rest weeks, no inactivity penalty, no guilt notifications.

| Path | Value |
|---|---|
| `streaks.unit` | iso_week |
| `streaks.min_posts_per_week` | 1 |
| `streaks.freeze_earned_every_weeks` | 4 |
| `streaks.freeze_bank_max` | 2 |
| `streaks.rest_weeks_per_quarter` | 2 |
| `streaks.slack_mode_weeks` | 2 |
| `streaks.inactivity_penalty` | false |
| `streaks.guilt_notifications` | false |

#### leaderboards

- **leaderboards** (DECISIONS §3): Peer cohorts of about 30 by tier + niche with promotion zones; public global weekly board. Small tiers merge until a cohort has min size.

| Path | Value |
|---|---|
| `leaderboards.cohort_target_size` | 30 |
| `leaderboards.cohort_min_size` | 8 |
| `leaderboards.cohort_max_size` | 36 |
| `leaderboards.promotion_zone_size` | 5 |
| `leaderboards.demotion_zone` | false |
| `leaderboards.global_board_size` | 50 |
| `leaderboards.metrics` | earnings, conversion_rate, score_accuracy |
| `leaderboards.week_starts_on` | monday |

#### daily_drop

- **daily_drop** (DECISIONS §3): One drop per day at 16:00 UTC; real inventory; pre-drop / live / sold-out states.

| Path | Value |
|---|---|
| `daily_drop.hour_utc` | 16 |
| `daily_drop.claim_window_hours` | 24 |
| `daily_drop.items_per_drop` | 6 |
| `daily_drop.min_spots_per_item` | 8 |
| `daily_drop.max_spots_per_item` | 40 |
| `daily_drop.real_inventory_only` | true |

#### tournaments

- **tournaments** (CONTRACT): Sponsored prize pools, bracket or leaderboard rounds, free entry.

| Path | Value |
|---|---|
| `tournaments.min_prize_pool_cents` | 25000 ($250.00) |
| `tournaments.default_rounds` | 3 |
| `tournaments.entry_fee_cents` | 0 ($0.00) |
| `tournaments.funded_by` | platform_or_sponsor_brand |

#### crews

- **crews** (CONTRACT): Gold+ lead, 3 to 20 members, platform-funded weekly goal bonus.

| Path | Value |
|---|---|
| `crews.max_members` | 20 |
| `crews.min_members` | 3 |
| `crews.lead_min_tier` | gold |
| `crews.weekly_goal_bonus_rate` | 0.03 (3%) |
| `crews.weekly_goal_bonus_cap_cents` | 25000 ($250.00) |
| `crews.funded_by` | platform |

#### referrals

- **referrals** (DECISIONS §4 / BLUEPRINT): Single level, platform-funded. 5% of referee cleared earnings for 90 days (cap $100 per referee). Brand/agency partners: 10% of platform fees for 12 months. Rates are CONTRACT.

| Path | Value |
|---|---|
| `referrals.creator_share_rate` | 0.05 (5%) |
| `referrals.creator_share_days` | 90 |
| `referrals.creator_share_cap_per_referee_cents` | 10000 ($100.00) |
| `referrals.levels` | 1 |
| `referrals.funded_by` | platform |
| `referrals.brand_partner_share_rate` | 0.1 (10%) |
| `referrals.brand_partner_share_months` | 12 |

#### auctions

- **auctions** (BLUEPRINT): Sealed-bid, second price (uniform clearing price = highest losing bid), Platinum+ creators.

| Path | Value |
|---|---|
| `auctions.pricing` | second_price_uniform |
| `auctions.min_slots` | 1 |
| `auctions.max_slots` | 5 |
| `auctions.min_duration_hours` | 72 |
| `auctions.max_duration_days` | 7 |
| `auctions.min_creator_tier` | platinum |
| `auctions.reserve_floor_cents` | 5000 ($50.00) |

#### specs

- **specs** (CONTRACT): Spec Market listing needs Flow Score 55+ (band C); licence price floor $15.

| Path | Value |
|---|---|
| `specs.min_flow_points_to_list` | 55 |
| `specs.default_paid_ads_days` | 90 |
| `specs.price_floor_cents` | 1500 ($15.00) |
| `specs.price_cap_cents` | 50000 ($500.00) |
| `specs.first_refusal_days` | 7 |

#### fraud

- **fraud** (CONTRACT): Fraud score 0..100 = min(100, sum(points x severity)). clean <20, watch 20-39, review 40-69 (human review within 24h), high 70+ (auto-hold).

| Path | Value |
|---|---|
| `fraud.review_threshold` | 40 |
| `fraud.hold_threshold` | 70 |
| `fraud.bands.clean` | 0, 19 |
| `fraud.bands.watch` | 20, 39 |
| `fraud.bands.review` | 40, 69 |
| `fraud.bands.high` | 70, 100 |
| `fraud.review_sla_hours` | 24 |
| `fraud.duplicate_phash_max_distance` | 6 |
| `fraud.signals.view_spike_no_engagement.max_points` | 25 |
| `fraud.signals.view_spike_no_engagement.rule` | Hourly views at least 10x the post baseline while engagement stays under 0.5% of views. |
| `fraud.signals.cap_clustering.max_points` | 20 |
| `fraud.signals.cap_clustering.rule` | Earnings land within 2% of the per-video cap on 3 of the creator's last 5 posts, or views snap to the cap. |
| `fraud.signals.bought_views_pattern.max_points` | 30 |
| `fraud.signals.bought_views_pattern.rule` | Step-function curve: 80% or more of views arrive in two hourly buckets, flat otherwise, and over 60% of views come from the "other" source. |
| `fraud.signals.geo_mismatch.max_points` | 15 |
| `fraud.signals.geo_mismatch.rule` | Audience in the bounty target region is more than 25 points below the bounty minimum. |
| `fraud.signals.view_to_follower_outlier.max_points` | 10 |
| `fraud.signals.view_to_follower_outlier.rule` | Views are more than 40x followers on an account under 5,000 followers. |
| `fraud.signals.new_account.max_points` | 10 |
| `fraud.signals.new_account.rule` | Social account younger than 30 days. |
| `fraud.signals.duplicate_hash.max_points` | 20 |
| `fraud.signals.duplicate_hash.rule` | Perceptual hash within distance 6 of another creator's video or the creator's own earlier post. |
| `fraud.signals.engagement_anomaly.max_points` | 10 |
| `fraud.signals.engagement_anomaly.rule` | Likes under 0.4% of views, or comment ratio an outlier against the account's 28-day norm. |
| `fraud.signals.traffic_source_anomaly.max_points` | 10 |
| `fraud.signals.traffic_source_anomaly.rule` | More than 50% of views from external or "other" sources. |
| `fraud.signals.curve_shape.max_points` | 10 |
| `fraud.signals.curve_shape.rule` | No natural decay: hourly views flat or rising for more than 24 hours. |

#### scores

- **scores** (CONTRACT): Checklist scores (not learned). Hook Score checklist weights sum to 100; Flow Score checklist weights sum to 100. Bands A 85+, B 70-84, C 55-69, D 40-54, E below 40.

| Path | Value |
|---|---|
| `scores.bands.A` | 85 |
| `scores.bands.B` | 70 |
| `scores.bands.C` | 55 |
| `scores.bands.D` | 40 |
| `scores.bands.E` | 0 |
| `scores.band_view_multiplier.A` | 1.6 |
| `scores.band_view_multiplier.B` | 1.15 |
| `scores.band_view_multiplier.C` | 0.85 |
| `scores.band_view_multiplier.D` | 0.5 |
| `scores.band_view_multiplier.E` | 0.3 |
| `scores.checklist_label` | Checklist score. It gets smarter as bounties settle. |
| `scores.hook_checklist` | {"id":"hook_lands_2s","label":"Hook lands by 2.0s","weight":20,"rule":"Full if the hook line lands by 2.0 s; half by 3.0 s; otherwise 0."}, {"id":"onscreen_text_matches","label":"On-screen text mirrors the spoken hook within 1s","weight":15,"rule":"Full if the spoken hook is also on screen as text within 1.0 s; half if it appears by 2.0 s or only partly matches."}, {"id":"face_early","label":"A face is on screen within the first second","weight":15,"rule":"Full if a face is on screen within 1.0 s; half by 2.0 s. Faceless formats get full points."}, {"id":"app_visible_3s","label":"App or product visible by 3s","weight":15,"rule":"Full if the app is visible by 3.0 s; half by 5.0 s."}, {"id":"pattern_interrupt","label":"Motion or pattern interrupt in the first 1.5s","weight":10,"rule":"Full if there is a cut, motion or visual pattern interrupt in the first 1.5 s."}, {"id":"proven_hook_type","label":"Uses a proven hook type","weight":10,"rule":"Full if the hook is a library hook type with an above-median trial rate; half for any other library hook type; 0 otherwise."}, {"id":"speech_starts_fast","label":"Speech starts within 1s, no dead air","weight":10,"rule":"Full if speech starts within 1.0 s; half within 2.0 s."}, {"id":"captions_safe_zone","label":"Captions burned in, inside safe zones","weight":5,"rule":"Full if captions are burned in and inside the platform safe zones; otherwise 0."} |
| `scores.flow_checklist` | {"id":"hook_score","label":"Hook Score (scaled)","weight":30,"rule":"round(Hook Score points x 0.30)."}, {"id":"required_beats","label":"Required beats covered","weight":25,"rule":"round(25 x required beats found / required beats in the brief)."}, {"id":"app_visible_early","label":"App on screen early","weight":10,"rule":"Full if the app is on screen by 3.0 s; half by 8.0 s."}, {"id":"disclosure","label":"Disclosure present (audio and on-screen)","weight":10,"rule":"10 if #ad is both spoken and on screen; 5 if only one; 0 if neither (a missing disclosure also blocks settlement)."}, {"id":"length_ok","label":"Length 15 to 30 seconds","weight":5,"rule":"Full for 15 to 30 s; half for 10 to 15 s or 30 to 45 s; otherwise 0."}, {"id":"captions_safe_zone","label":"Captions inside safe zones","weight":5,"rule":"Full if captions are inside the platform safe zones; otherwise 0."}, {"id":"single_cta_win_state","label":"One CTA, ends on a win state","weight":5,"rule":"Full if there is exactly one CTA and the video ends on a win state; half if one of the two."}, {"id":"audio_clear","label":"Audio clear, no dead air","weight":5,"rule":"Full if speech is clear with no dead air over 1.0 s; half if there is one gap."}, {"id":"format_fit","label":"Follows the chosen format's beats","weight":5,"rule":"Full if the video follows the format's beat order; half if one beat is out of order."} |

#### reliability

- **reliability** (CONTRACT): Creator and brand reliability score weights (0..100).

| Path | Value |
|---|---|
| `reliability.creator.weights.finished_approval` | 0.3 |
| `reliability.creator.weights.on_time` | 0.2 |
| `reliability.creator.weights.post_through` | 0.2 |
| `reliability.creator.weights.compliance` | 0.2 |
| `reliability.creator.weights.clean_record` | 0.1 |
| `reliability.creator.recency_half_life_days` | 45 |
| `reliability.creator.min_finished_for_score` | 5 |
| `reliability.creator.provisional_score` | 70 |
| `reliability.creator.on_time_resubmit_hours` | 48 |
| `reliability.creator.post_through_days` | 7 |
| `reliability.creator.academy_bonus_per_lesson` | 0.5 |
| `reliability.creator.academy_bonus_cap` | 5 |
| `reliability.brand.weights.decision_speed` | 0.3 |
| `reliability.brand.weights.approval_fairness` | 0.25 |
| `reliability.brand.weights.pays_on_time` | 0.2 |
| `reliability.brand.weights.run_rate` | 0.15 (15%) |
| `reliability.brand.weights.reply_speed` | 0.1 |
| `reliability.brand.decision_best_hours` | 12 |
| `reliability.brand.decision_worst_hours` | 72 |
| `reliability.brand.reply_best_hours` | 2 |
| `reliability.brand.reply_worst_hours` | 48 |
| `reliability.brand.rejection_rate_free_pass` | 0.3 (30%) |
| `reliability.brand.rejection_rate_zero_at` | 0.7 (70%) |
| `reliability.brand.min_decisions_for_score` | 10 |
| `reliability.brand.bands.excellent` | 90 |
| `reliability.brand.bands.good` | 75 |
| `reliability.brand.bands.fair` | 60 |

#### funnel_defaults

- **funnel_defaults** (research/brand-needs §5): Install to trial median 6.2%, trial to paid median 34.8% (RevenueCat via Airbridge). Used for expected-earnings ranges and the budget planner; always labelled "estimate".

| Path | Value |
|---|---|
| `funnel_defaults.view_to_visit` | 0.0045 |
| `funnel_defaults.visit_to_install` | 0.38 |
| `funnel_defaults.install_to_trial` | 0.062 |
| `funnel_defaults.trial_to_paid` | 0.348 |
| `funnel_defaults.views_quantile_ratio.p25` | 0.4 (40%) |
| `funnel_defaults.views_quantile_ratio.median` | 1 (100%) |
| `funnel_defaults.views_quantile_ratio.p75` | 2.55 |
| `funnel_defaults.conversion_band_ratio.low` | 0.55 (55%) |
| `funnel_defaults.conversion_band_ratio.median` | 1 (100%) |
| `funnel_defaults.conversion_band_ratio.high` | 1.6 |

#### matching

| Path | Value |
|---|---|
| `matching.weights.niche` | 40 |
| `matching.weights.platform` | 15 |
| `matching.weights.region` | 15 |
| `matching.weights.price` | 15 |
| `matching.weights.brand_reliability` | 10 |
| `matching.weights.recency` | 5 |
| `matching.recency_half_life_days` | 14 |
| `matching.price_ratio_cap` | 1.5 |
| `matching.gates` | eligibility_tier, country, platform_account_linked, funded, not_already_submitted |
| `matching.min_match_to_rank_first` | 60 |

#### pricing_model

| Path | Value |
|---|---|
| `pricing_model.fill_exponent` | 1.6 |
| `pricing_model.p80_multiplier` | 1.8 |
| `pricing_model.min_fill_hours` | 6 |
| `pricing_model.confidence_k` | 20 |
| `pricing_model.curve_cpm_multipliers` | 0.6, 0.8, 1, 1.2, 1.5, 2 |
| `pricing_model.thin_market_min_sample` | 8 |

#### attribution

- **attribution** (DECISIONS §3): CPA pays only on link and code. Apple caps 10 active offers per subscription SKU; custom codes up to 25,000 redemptions.

| Path | Value |
|---|---|
| `attribution.apple_active_offers_per_sku` | 10 |
| `attribution.apple_custom_code_max_redemptions` | 25000 |
| `attribution.apple_offer_codes_per_quarter` | 1000000 |
| `attribution.pay_on_sources` | link, code |
| `attribution.link_base` | joinflowd.io/r/ |
| `attribution.survey_name` | How did you hear about us? |

#### tax

- **tax** (DECISIONS §4 / research): 1099-NEC threshold $2,000 for 2026 payments; W-9 collected at first approval, before first payout. Set-aside default is a CONTRACT estimate. Not tax advice.

| Path | Value |
|---|---|
| `tax.form_1099_nec_threshold_cents` | 200000 ($2,000.00) |
| `tax.tax_year` | 2026 |
| `tax.set_aside_rate` | 0.25 (25%) |
| `tax.collect_at` | first_approval |
| `tax.hold_payout_without_tax_info` | true |
| `tax.disclaimer` | Not tax advice. |

#### compliance

- **compliance** (DECISIONS §4): Disclosure in the video itself (audio + on-screen); #ad + brand wording auto-added; failure blocks settlement.

| Path | Value |
|---|---|
| `compliance.disclosure_tag` | #ad |
| `compliance.default_disclosure_text` | #ad Paid partnership with {brand} |
| `compliance.audio_disclosure_required` | true |
| `compliance.onscreen_disclosure_required` | true |
| `compliance.blocks_settlement_on_fail` | true |

#### studio

- **studio** (BLUEPRINT): 9:16, 1080x1920, 15-30s target; hook lands within 2s; spoken hook mirrored on screen within 1s; app visible early.

| Path | Value |
|---|---|
| `studio.aspect` | 9:16 |
| `studio.width` | 1080 |
| `studio.height` | 1920 |
| `studio.min_duration_s` | 15 |
| `studio.max_duration_s` | 60 |
| `studio.target_duration_s` | 15, 30 |
| `studio.hook_must_land_s` | 2 |
| `studio.onscreen_hook_s` | 1 |
| `studio.app_visible_by_s` | 3 |

#### lint

- **lint** (DECISIONS §4 / research/brand-needs §3): Brief Lint blocks missing deliverables, view-minimum bases, unpaid trials, burner / fresh-account demands, forced posting counts, perpetual rights, AI likeness, pay-to-join, CPM under the floor and budgets under $100. Rule triggers are the shared client + server ruleset; severities blocker / warning / info.

| Path | Value |
|---|---|
| `lint.thresholds.min_budget_cents` | 10000 ($100.00) |
| `lint.thresholds.min_cap_cents` | 2000 ($20.00) |
| `lint.thresholds.low_effective_pay_median_cents` | 1500 ($15.00) |
| `lint.thresholds.short_window_days` | 5 |
| `lint.thresholds.max_paid_ads_days` | 365 |
| `lint.rules.missing_deliverables.severity` | blocker |
| `lint.rules.missing_deliverables.trigger` | videos_per_creator < 1, or min_duration_s / max_duration_s unset. |
| `lint.rules.missing_deliverables.fix` | State how many videos, how long and in what ratio. |
| `lint.rules.missing_platforms.severity` | blocker |
| `lint.rules.missing_platforms.trigger` | deliverables.platforms is empty. |
| `lint.rules.missing_platforms.fix` | Choose at least one platform. |
| `lint.rules.missing_regions.severity` | warning |
| `lint.rules.missing_regions.trigger` | deliverables.regions is empty. |
| `lint.rules.missing_regions.fix` | Pick target regions so matching and fraud checks can use them. |
| `lint.rules.view_minimum_base.severity` | blocker |
| `lint.rules.view_minimum_base.trigger` | Text says base pay needs a minimum view count first (e.g. "must reach 10,000 views to qualify", "paid after 5k views"). |
| `lint.rules.view_minimum_base.fix` | Pay from the first verified view, or move the threshold to a bonus. |
| `lint.rules.unpaid_trial.severity` | blocker |
| `lint.rules.unpaid_trial.trigger` | Text asks for an unpaid test, sample or trial video ("unpaid test", "free sample video", "trial video before we pay"). |
| `lint.rules.unpaid_trial.fix` | Pay for every video, including the first. |
| `lint.rules.burner_account.severity` | blocker |
| `lint.rules.burner_account.trigger` | Text requires a new, dedicated or burner account ("new account", "dedicated account", "burner", "separate account just for us"). |
| `lint.rules.burner_account.fix` | Let creators post from their own accounts. |
| `lint.rules.fresh_account_demand.severity` | blocker |
| `lint.rules.fresh_account_demand.trigger` | Text requires a fresh account or forbids personal posting ("fresh account", "no other content on the account"). |
| `lint.rules.fresh_account_demand.fix` | Remove it; bounties may not require fresh accounts. |
| `lint.rules.forced_posting_count.severity` | blocker |
| `lint.rules.forced_posting_count.trigger` | Text demands a posting cadence with no pay attached ("post 3 times a day", "daily posts for 30 days"). |
| `lint.rules.forced_posting_count.fix` | Pay per video and drop the quota. |
| `lint.rules.perpetual_rights.severity` | blocker |
| `lint.rules.perpetual_rights.trigger` | rights_card.paid_ads_days > 365, or text says "perpetual", "in perpetuity", "forever" or "unlimited usage". |
| `lint.rules.perpetual_rights.fix` | Use a fixed paid-ad term (default 90 days) with a priced renewal. |
| `lint.rules.ai_likeness_requested.severity` | blocker |
| `lint.rules.ai_likeness_requested.trigger` | rights_card.ai_likeness is true, or text asks to clone voice or likeness. |
| `lint.rules.ai_likeness_requested.fix` | AI likeness is off by default and needs a separate agreement. |
| `lint.rules.pay_to_join.severity` | blocker |
| `lint.rules.pay_to_join.trigger` | Text charges creators ("entry fee", "deposit", "pay to join", "buy the product first"). |
| `lint.rules.pay_to_join.fix` | Creators never pay to take part. |
| `lint.rules.below_floor_cpm.severity` | blocker |
| `lint.rules.below_floor_cpm.trigger` | 0 < cpm_cents < pay.floor_cpm_cents (50). |
| `lint.rules.below_floor_cpm.fix` | Raise the CPM to at least $0.50. |
| `lint.rules.no_disclosure_text.severity` | warning |
| `lint.rules.no_disclosure_text.trigger` | brief.disclosure_text is empty. |
| `lint.rules.no_disclosure_text.fix` | Set the required wording, e.g. "#ad Paid partnership with Lumi". |
| `lint.rules.unclear_cta.severity` | warning |
| `lint.rules.unclear_cta.trigger` | brief.cta is empty or names more than one call to action. |
| `lint.rules.unclear_cta.fix` | Pick exactly one. |
| `lint.rules.cap_too_low.severity` | warning |
| `lint.rules.cap_too_low.trigger` | per_video_cap_cents < thresholds.min_cap_cents ($20). |
| `lint.rules.cap_too_low.fix` | Raise the cap or creators will skip it. |
| `lint.rules.low_effective_pay.severity` | warning |
| `lint.rules.low_effective_pay.trigger` | pay_math.median_cents < thresholds.low_effective_pay_median_cents ($15). |
| `lint.rules.low_effective_pay.fix` | Raise the CPM or add a CPA bonus. |
| `lint.rules.budget_below_minimum.severity` | blocker |
| `lint.rules.budget_below_minimum.trigger` | budget_cents < thresholds.min_budget_cents ($100). |
| `lint.rules.budget_below_minimum.fix` | Fund at least $100. |
| `lint.rules.short_window.severity` | info |
| `lint.rules.short_window.trigger` | ends_at - starts_at < thresholds.short_window_days (5 days). |
| `lint.rules.short_window.fix` | Allow at least 5 days so revisions fit. |

#### disputes

- **disputes** (CONTRACT): One-tap dispute, human reply within 24h, resolution within 5 business days.

| Path | Value |
|---|---|
| `disputes.reply_sla_hours` | 24 |
| `disputes.resolution_sla_days` | 5 |
| `disputes.window_days` | 30 |

#### wellbeing

- **wellbeing** (research/creator-needs §10): Quiet hours 22:00-08:00, no inactivity decay, pause up to 90 days preserves tier and streak.

| Path | Value |
|---|---|
| `wellbeing.quiet_hours_start` | 22:00 |
| `wellbeing.quiet_hours_end` | 08:00 |
| `wellbeing.batch_money_pushes_in_quiet_hours` | true |
| `wellbeing.inactivity_decay_days` | 0 |
| `wellbeing.pause_max_days` | 90 |

#### api

- **api** (research/brand-needs): Scopes read/write/financial; drafts by default; cursor pagination.

| Path | Value |
|---|---|
| `api.scopes` | read, write, financial |
| `api.drafts_by_default` | true |
| `api.key_prefix_live` | fd_live_ |
| `api.key_prefix_test` | fd_test_ |
| `api.idempotency_header` | Idempotency-Key |
| `api.page_size_default` | 50 |
| `api.page_size_max` | 200 |
| `api.rate_limit_per_minute.free` | 60 |
| `api.rate_limit_per_minute.pro` | 600 |
| `api.rate_limit_per_minute.scale` | 3000 |

#### launch_targets

- **launch_targets** (BLUEPRINT launch playbook): Suggested day-90 targets shown in the admin control tower.

| Item |
|---|
| {"id":"first_dollar_hours","label":"Median time to a creator's first dollar","op":"lt","target":72,"unit":"hours"} |
| {"id":"filled_48h_ratio","label":"Bounties filled within 48 hours","op":"gt","target":0.8,"unit":"ratio"} |
| {"id":"second_bounty_ratio","label":"Brands funding a second bounty","op":"gt","target":0.6,"unit":"ratio"} |
| {"id":"repost_30d_ratio","label":"Creators posting again within 30 days","op":"gt","target":0.35,"unit":"ratio"} |
| {"id":"invites_per_creator","label":"Accepted invites per new creator","op":"gt","target":0.5,"unit":"count"} |
| {"id":"creators_per_live_bounty","label":"Active creators per live bounty","op":"between","target":20,"target_max":50,"unit":"count"} |
<!-- /GENERATED:constants -->

---

## 10. Money: ledger postings and the golden walk-through

flowd keeps an **append-only, double-entry ledger**. A transaction (`txn_id`) is a set of legs that **net to exactly zero** (credit to an account is positive, debit negative). Accounts are strings `"<kind>:<id>"`:

| Account | Meaning |
|---|---|
| `wallet:br_x` | A brand's wallet: funds deposited and not yet locked to a bounty. |
| `escrow:bnty_x` | Funds locked to one bounty (the pool plus the fee reserve). |
| `creator:cr_x` | A creator's earned money not yet withdrawn. Earning rows carry `status` (pending, cleared, held, reversed, paid). |
| `platform:fees` | Take-rate and instant-payout fees. |
| `platform:subscriptions` | Pro and Scale plan fees. |
| `platform:processing` | Card processing passed through at cost. |
| `platform:matching` | The matched first-bounty budget (a treasury account). |
| `platform:promo` | Bonuses, prizes, referral rewards (a treasury account). |
| `external:card`, `external:bank` | The outside world. |

Postings by event (the `LedgerType` of each leg in brackets):

| Event | Legs (sum = 0) |
|---|---|
| **Wallet top-up** (card) | `external:card` -(X + processing) [wallet_topup] · `wallet:br_x` +X [wallet_topup] · `platform:processing` +processing [processing] |
| **Escrow funding** | `wallet:br_x` -X · `escrow:bnty_y` +X [escrow_fund]. The bounty is Funded when its escrow equals budget + fee reserve. |
| **Matched budget** (first bounty) | `platform:matching` -M · `escrow:bnty_y` +M [matched_budget] |
| **CPM settlement** of a post at clearing | `escrow:bnty_y` -(pay + fee) · `creator:cr_x` +pay [cpm] · `platform:fees` +fee [fee]. The creator row starts `pending`, becomes `cleared` at the clearing run, `paid` in a payout. A zero fee (waived first bounty) omits the fee leg. |
| **CPA settlement** per cleared conversion batch (link or code only) | Same shape with [cpa] and `conversion_id`. |
| **Flat fee** (direct offer, auction, spec) | Offers and auctions fund a private direct bounty (escrow), then `escrow` -(price + fee) · `creator` +price [flat_fee] · `platform:fees` +fee [fee]. Spec licences are paid from the wallet: `wallet:br_x` -(price + fee) · creator +price [flat_fee] · fees +fee [fee]. |
| **Ad commission** | `wallet:br_x` -c · `creator:cr_x` +c [commission] (outside the per-video cap). |
| **Ad fee** | `wallet:br_x` -f · `platform:fees` +f [ad_fee] (1% of ad spend). |
| **Rights renewal** | `wallet:br_x` -(price + fee) · creator +price [rights_fee] · fees +fee [fee]. |
| **Subscription** | `external:card` -P · `platform:subscriptions` +P [subscription_fee]. |
| **Weekly payout** | `creator:cr_x` -gross · `external:bank` +gross [payout]. The earning rows included become `paid` with `payout_id`. |
| **Instant payout** | `creator:cr_x` -gross · `external:bank` +(gross - fee) [payout] · `platform:fees` +fee [payout_fee]. |
| **Bonus, prize, referral** | `platform:promo` -x · `creator:cr_x` +x [bonus] / [prize] / [referral]. |
| **Clawback** (proven fraud or refund) | Reverses the earlier legs in a new transaction with `reverses_txn_id`: `creator` -pay · `platform:fees` -fee · `wallet:br_x` +(pay + fee) [clawback]. A creator balance may go negative and is recovered from future earnings. |
| **Escrow refund** at settlement | `escrow:bnty_y` -unspent · `wallet:br_x` +unspent [escrow_refund]. Unspent budget and unused fee reserve return together. |
| **Adjustment** | Manual correction by Ops with a memo. |

**Escrow identity** for every bounty, at all times: `escrow_funded = reserved + spent + remaining + refunded`. `reserved` is not on the ledger (it is a claim on `remaining`); the ledger balance of `escrow:bnty_x` equals `reserved + remaining`; `spent` equals the debits of the settlement legs; `refunded` equals the refund transaction. A settled bounty has `reserved = 0`, `remaining = 0`.

**Memos** (`ledger.memo`, plain English, shown in the Wallet ledger): `Views pay: Glow-up reveal (31,400 verified views)`, `Install bonus x7 (tracked link): Glow-up reveal`, `Platform fee 10%: Glow-up reveal`, `Funded: Glow-up reveal ($3,000.00 pool + $300.00 fee reserve)`, `Matched budget (first bounty)`, `Weekly payout run_2026-10-02`, `Instant cash-out (fee $2.40)`, `Refund of unspent budget: Glow-up reveal`, `Ad commission: 10% of ad-attributed revenue`, `Clawback: proven view fraud (delivered views still paid)`.

<!-- GENERATED:golden -->
The life of money in one bounty, computed from the formulas (every row is a ledger leg; every transaction nets to zero). Pro plan (10%), $3,000.00 pool, $2.10 CPM with $0.40 / $1.50 / $4.00 CPA, $250.00 cap. The walk-through post by @maya.makes earns $76.54 of pool pay and Lumi pays $7.65 in fees, so its brand cost is $84.19. A post that clears in several conversion batches rounds the fee per batch transaction (per ledger leg), so a post's fee can differ by a cent or two from the fee on its total.

| Txn | Step | Account | Amount | Type | Status |
|---|---|---|---|---|---|
| `txn_g01` | Lumi tops up the wallet by card | `external:card` | -$3,396.00 | wallet_topup | cleared |
| `txn_g01` |  | `wallet:br_lumi` | $3,300.00 | wallet_topup | cleared |
| `txn_g01` |  | `platform:processing` | $96.00 | processing | cleared |
| `txn_g02` | Lumi funds the bounty: $3,000.00 pool + $300.00 fee reserve (Funded badge, goes live) | `wallet:br_lumi` | -$3,300.00 | escrow_fund | cleared |
| `txn_g02` |  | `escrow:bnty_lumi_glowup` | $3,300.00 | escrow_fund | cleared |
| `txn_g03` | CPM leg at clearing: 31,400 verified views x $2.10 (reserved slot of $275.00 released) | `escrow:bnty_lumi_glowup` | -$72.53 | cpm | cleared |
| `txn_g03` |  | `creator:cr_maya` | $65.94 | cpm | pending -> cleared -> paid |
| `txn_g03` |  | `platform:fees` | $6.59 | fee | cleared |
| `txn_g04` | CPA leg: 7 installs through the link | `escrow:bnty_lumi_glowup` | -$3.08 | cpa | cleared |
| `txn_g04` |  | `creator:cr_maya` | $2.80 | cpa | pending -> cleared -> paid |
| `txn_g04` |  | `platform:fees` | $0.28 | fee | cleared |
| `txn_g05` | CPA leg: 2 installs through the code | `escrow:bnty_lumi_glowup` | -$0.88 | cpa | cleared |
| `txn_g05` |  | `creator:cr_maya` | $0.80 | cpa | pending -> cleared -> paid |
| `txn_g05` |  | `platform:fees` | $0.08 | fee | cleared |
| `txn_g06` | CPA leg: 2 trials through the link | `escrow:bnty_lumi_glowup` | -$3.30 | cpa | cleared |
| `txn_g06` |  | `creator:cr_maya` | $3.00 | cpa | pending -> cleared -> paid |
| `txn_g06` |  | `platform:fees` | $0.30 | fee | cleared |
| `txn_g07` | CPA leg: 1 paid through the code | `escrow:bnty_lumi_glowup` | -$4.40 | cpa | cleared |
| `txn_g07` |  | `creator:cr_maya` | $4.00 | cpa | pending -> cleared -> paid |
| `txn_g07` |  | `platform:fees` | $0.40 | fee | cleared |
| `txn_g08` | Friday 18:00Z weekly payout of the cleared earnings (free) | `creator:cr_maya` | -$76.54 | payout | paid |
| `txn_g08` |  | `external:bank` | $76.54 | payout | paid |
| `txn_g09` | Maya cashes out $160.00 instantly (Silver): fee 1.5%, shown first | `creator:cr_maya` | -$160.00 | payout | paid |
| `txn_g09` |  | `external:bank` | $157.60 | payout | paid |
| `txn_g09` |  | `platform:fees` | $2.40 | payout_fee | cleared |
| `txn_g10` | Winner promotion: 10% commission on $1,084.69 of ad-attributed revenue (60-day window) | `wallet:br_lumi` | -$108.47 | commission | cleared |
| `txn_g10` |  | `creator:cr_maya` | $108.47 | commission | pending -> cleared -> paid |
| `txn_g11` | Winner promotion: 1% platform fee on $1,200.00 ad spend | `wallet:br_lumi` | -$12.00 | ad_fee | cleared |
| `txn_g11` |  | `platform:fees` | $12.00 | ad_fee | cleared |
| `txn_g12` | Clawback of a proven-fraud post (pay $40.00 + fee $4.00); reverses_txn_id = the original | `creator:cr_other` | -$40.00 | clawback | reversed |
| `txn_g12` |  | `platform:fees` | -$4.00 | clawback | cleared |
| `txn_g12` |  | `wallet:br_lumi` | $44.00 | clawback | cleared |
| `txn_g13` | Settlement: after $2,486.40 pay and $248.64 fees were settled, the rest returns | `escrow:bnty_lumi_glowup` | -$564.96 | escrow_refund | cleared |
| `txn_g13` |  | `wallet:br_lumi` | $564.96 | escrow_refund | cleared |
<!-- /GENERATED:golden -->

---

## 11. Formulas

<!-- GENERATED:formulas -->
17 formulas. The executable reference implementation is `packages/contract/schema/formulas.mjs` (pure functions); every example below is computed from it, so the numbers cannot drift. Rounding is half-up per ledger leg unless stated. Test vectors are in `packages/contract/formula-vectors.json`.

#### Escrow total, fee reserve, matched budget and card charge

- take_rate = plan rate (Free 12%, Pro 10%, Scale 8%); 6% for CPA-only and install-only bounties; 0% on the first bounty (fee waived).
- fee_reserve = round(budget x take_rate). It is held in escrow with the budget; the fee actually taken is take_rate x creator pay settled, and the unused reserve is refunded at settlement.
- escrow_total = budget + fee_reserve. The Funded badge (and going live) needs escrow_funded >= escrow_total.
- First bounty: matched = min($500, brand funds) is added to the pool on top of what the brand funds; fee waived. Brand funded = escrow_total - matched.
- processing = round(2.9% x brand funded) + $0.30, passed through at cost and shown in the all-in price; card_charge = brand funded + processing.
- all_in_cpm = round(card_charge x cpm / budget): what the brand pays per 1,000 verified views when the pool is fully used.

**Worked example: Free plan, $5,000 pool at $2.00 CPM**

| Step | Calculation | Result |
|---|---|---|
| budget | B | $5,000.00 |
| take_rate | Free plan | 12% |
| fee_reserve | round(500000 x 0.12) | $600.00 |
| escrow_total | B + fee_reserve | $5,600.00 |
| processing | round(560000 x 0.029) + 30 | $162.70 |
| card_charge | escrow_total + processing | $5,762.70 |
| all_in_cpm | round(576270 x 200 / 500000) | $2.31 |

**Worked example: First bounty on Pro: brand funds $1,500, flowd matches $500**

| Step | Calculation | Result |
|---|---|---|
| matched | min($500, $1,500) | $500.00 |
| budget | $1,500 + $500 | $2,000.00 |
| fee_reserve | fee waived | $0.00 |
| escrow_total | budget | $2,000.00 |
| brand_funded | escrow_total - matched | $1,500.00 |
| processing | round(150000 x 0.029) + 30 | $43.80 |
| card_charge | brand_funded + processing | $1,543.80 |
| all_in_cpm | round(154380 x 200 / 200000) | $1.54 |

#### Reserved Slot

- reservation_unit = per_video_cap + round(per_video_cap x take_rate). A submission reserves one unit on submit and releases it on rejection, withdrawal or expiry; on settlement the reservation is replaced by the actual pay + fee and the difference returns to remaining.
- spots_left = floor(remaining / reservation_unit). The bounty becomes filled when spots_left is 0 and live again when a unit is released.
- Identity: escrow_funded = reserved + spent + remaining + refunded (all >= 0). Approved posts are paid even if remaining is later 0.

**Worked example: Pro, $3,000 pool, $250 cap**

| Step | Calculation | Result |
|---|---|---|
| reservation_unit | 25000 + round(25000 x 0.10) | $275.00 |
| escrow_total | 300000 + 30000 | $3,300.00 |
| with 4 open submissions and $610 spent | remaining = 330000 - 4 x 27500 - 61000 | $1,590.00 |
| spots_left | floor(159000 / 27500) | 5 |

#### Stacked pay settlement of a post

- CPM leg: cpm_pay = round(window_views x cpm / 1000), where window_views are the verified views at the end of the 72-hour window.
- CPA legs (cleared conversions through a link or code only): installs x install rate + trials x trial rate + paid x paid rate, inside 30 days of posting.
- The per-video cap limits pool pay (CPM + CPA together). CPM is applied first, then CPA until the cap is reached. Anything above the cap is unpaid and the post is marked capped.
- Fee per ledger leg = round(leg pay x take_rate). Brand cost = pay + fees. Ad commission and flat fees sit outside the cap.

**Worked example: Typical stacked post: 48,200 views, 14 installs, 6 trials, 2 paid (Pro, $2.00 CPM, $250 cap)**

| Step | Calculation | Result |
|---|---|---|
| cpm_pay | round(48200 x 200 / 1000) | $96.40 |
| cpa_pay | 14 x 40 + 6 x 150 + 2 x 400 | $22.60 |
| pay | cpm_pay + cpa_pay (under the cap) | $119.00 |
| fee | round(9640 x 0.10) + round(2260 x 0.10) | $11.90 |
| brand_cost | pay + fee | $130.90 |

**Worked example: A viral post hits the cap: 150,000 views, 40 installs, 10 trials, 3 paid**

| Step | Calculation | Result |
|---|---|---|
| cpm_uncapped | round(150000 x 200 / 1000) | $300.00 |
| cpm_pay | min(30000, 25000) | $250.00 |
| cpa_pay | min(2800 + 1500 + 1200 = 5500, 25000 - 25000) | $0.00 |
| pay | cap reached | $250.00 |
| capped | true | true |
| fee | round(25000 x 0.10) | $25.00 |
| brand_cost | pay + fee | $275.00 |

#### Ad commission and winner-promotion fee

- commission = round(10% x ad-attributed revenue inside the 60 days after the ad first goes live). Paid by the brand wallet to the creator (ledger type commission), outside the per-video cap.
- platform fee = round(1% x ad spend). The creator is never charged.
- Ads stop automatically when the Spark code or the rights term ends.

**Worked example: 14 days live: $1,200 spend, 31 paid conversions at $34.99 first payment**

| Step | Calculation | Result |
|---|---|---|
| revenue_in_window | 31 x 3499 | $1,084.69 |
| commission | round(108469 x 0.10) | $108.47 |
| platform_fee | round(120000 x 0.01) | $12.00 |
| brand cost of the ad | spend + fee + commission | $1,320.47 |
| ad ROAS | revenue / cost | 0.82 |

#### Instant payout fee

- fee = clamp(round(1.5% x amount), $0.50, $15.00). Minimum cash-out $5.00. The fee and the net are shown before confirm.
- Free: Platinum and Elite (unlimited), Gold once per ISO week, Founding creators for 12 months. Weekly payouts (Fridays 18:00 UTC) are always free.

**Worked example: Instant cash-out**

| Step | Calculation | Result |
|---|---|---|
| $160.00 cleared, Silver | fee $2.40 list | fee $2.40, net $157.60 |
| $20.00, Silver (fee floor) | fee $0.50 list | fee $0.50, net $19.50 |
| $2,000.00, Silver (fee cap) | fee $15.00 list | fee $15.00, net $1,985.00 |
| $160.00, Gold, first this week | fee $2.40 list | fee $0.00, net $160.00 (free) |
| $160.00, Gold, second this week | fee $2.40 list | fee $2.40, net $157.60 |

#### Expected earnings: p25 / median / p75 (Pay Math)

- Views: median = the creator's 28-day median views (category median for a new creator); p25 = 0.40 x median; p75 = 2.55 x median (CONSTANTS.funnel_defaults).
- Tracked funnel per view: 0.45% visits, 38% of visits install, 6.2% of installs start a trial, 34.8% of trials pay.
- pay = min(cap, round(views x cpm / 1000) + round(installs x r_i + trials x r_t + paid x r_p)). Always labelled "estimate"; the typical (median) is shown beside any top-earner example.
- Predicted views for a take = median views x band multiplier (A 1.6, B 1.15, C 0.85, D 0.5, E 0.3).

**Worked example: Stacked bounty $2.10 CPM + $0.40 / $1.50 / $4.00, creator median 14,200 views, $250 cap**

| Step | Calculation | Result |
|---|---|---|
| p25 | 5,680 views, 9.71 installs, 0.6 trials | $17.56 (CPM $11.93 + CPA $5.63) |
| median | 14,200 views, 24.28 installs, 1.51 trials | $43.89 (CPM $29.82 + CPA $14.07) |
| p75 | 36,210 views, 61.92 installs, 3.84 trials | $111.91 (CPM $76.04 + CPA $35.87) |
| predicted views, band B | round(14200 x 1.15) | 16,330 |

#### Tier, progress and grace

- A creator holds the highest tier whose thresholds are ALL met: lifetime cleared, approved posts, approval rate (approved / finished), reliability (Platinum+), manual review (Elite).
- lifetime cleared = carry-over (verified prior history, founding creators) + cleared and paid earnings in the ledger. Approval rate counts finished work only: approved / (approved + rejected); withdrawn and expired are excluded.
- progress to the next tier = the bottleneck: the lowest min(1, have / need) over the numeric criteria.
- No tier drop for 30 days after a dip: tier_basis becomes grace_hold and tier_hold_until = dip start + 30 days. Recovery inside the window clears the hold.

**Worked example: @maya.makes: $1,640 cleared, 21 approved of 27 finished, reliability 93**

| Step | Calculation | Result |
|---|---|---|
| tier | highest tier fully met | silver |
| approval_rate | round(21 / 27, 2) | 0.78 |
| gold: Lifetime cleared | $1,640.00 / $2,000.00 | 82% |
| gold: Approved posts | 21 / 25 | 84% |
| gold: Approval rate | 0.78 / 0.75 | met |
| progress to gold | bottleneck = min(0.82, 0.84, 1) | 0.82 |

#### Creator reliability (0 to 100)

- Components (weights): finished-work approval 30% (recency-weighted, half-life 45 days), on-time revisions and deadlines 20%, approved videos posted within 7 days 20%, disclosure right first time 20%, clean record 10% (1 - 0.4 x confirmed fraud - 0.3 x clawbacks - 0.15 x lost disputes, 90 days).
- score = round(100 x sum(weight x value) + Academy bonus), the bonus being 0.5 per completed lesson up to 5; capped at 100.
- Fewer than 5 finished decisions: provisional score 70, shown as "Building history"; brands see a range, not a verdict. Multi-brand work and pending samples are never penalised.

**Worked example: A creator with 21 of 27 finished posts approved, 6 Academy lessons**

| Step | Calculation | Result |
|---|---|---|
| Finished-work approval (recency-weighted) | 0.8 x 0.3 | 24.12 pts |
| Revisions and deadlines on time | 0.89 x 0.2 | 17.89 pts |
| Approved videos posted within 7 days | 0.95 x 0.2 | 19.05 pts |
| Disclosure right first time | 0.95 x 0.2 | 19.05 pts |
| Clean record (90 days) | 1 x 0.1 | 10 pts |
| Academy bonus | 6 x 0.5 | 3 pts |
| score | round(sum + bonus) | 93 |

#### Brand reliability (Brand Scorecard, 0 to 100)

- Components (weights): decision speed 30% (median hours to decide: 12 h = 1.0, 72 h = 0.0, linear), approval fairness 25%, pays on time 20%, runs what it approves 15%, reply speed 10% (2 h = 1.0, 48 h = 0.0).
- Approval fairness = clamp(1 - (rejection rate - 0.30) / 0.40, 0, 1) - 0.5 x (appeals overturned / rejections). A rejection rate up to 30% is free; 70% scores 0.
- Decisions are approvals and rejections (request-changes excluded). Fewer than 10 decisions: band "new", shown as "New brand", never a misleading figure.
- Bands: excellent 90+, good 75 to 89, fair 60 to 74, poor under 60. An SLA breach (decision after 72 h) counts toward decision speed through the median and creates an escalation.

**Worked example: Lumi: 64 decisions, 49 approved, median 11.2 h, 1 appeal overturned**

| Step | Calculation | Result |
|---|---|---|
| Decision speed | 1 x 0.3 | 30 pts |
| Approval fairness | 0.97 x 0.25 | 24.17 pts |
| Pays on time | 0.99 x 0.2 | 19.8 pts |
| Runs what it approves | 0.93 x 0.15 | 13.95 pts |
| Reply speed | 0.95 x 0.1 | 9.46 pts |
| score | round(sum) | 97 |
| band |  | excellent |

#### Fraud score composition

- Ten signals, each with a maximum number of points (CONSTANTS.fraud.signals). A fired signal has a severity 0..1; points = round(max_points x severity).
- score = min(100, sum of points). Bands: clean 0-19 (auto-clear), watch 20-39 (auto-clear, logged), review 40-69 (held for a human review within 24 h), high 70+ (auto-hold and queued for Ops).
- Only proven fraud is clawed back, and delivered legitimate views are still paid. Every score shows its signals as evidence.

**Worked example: A spiky post with no engagement and 62% "other" traffic**

| Step | Calculation | Result |
|---|---|---|
| view_spike_no_engagement | round(25 x 0.8) | 20 pts |
| bought_views_pattern | round(30 x 0.9) | 27 pts |
| traffic_source_anomaly | round(10 x 0.7) | 7 pts |
| curve_shape | round(10 x 0.6) | 6 pts |
| score | min(100, sum) | 60 |
| band |  | review -> hold_for_human_review |

#### Hook Score and Flow Score (checklist scores)

- Both are CHECKLIST scores, labelled "Checklist score. It gets smarter as bounties settle." until a learned model beats them on held-out apps (about 1,000 settled posts).
- Hook Score weights: hook lands by 2.0 s 20, on-screen text mirrors the spoken hook 15, face in the first second 15, app by 3 s 15, pattern interrupt 10, proven hook type 10, speech starts fast 10, captions in safe zones 5 (sum 100). Each item scores full, half or zero (rules in CONSTANTS.scores).
- Flow Score weights: Hook Score scaled 30, required beats 25, app early 10, disclosure 10, length 5, safe-zone captions 5, one CTA and win state 5, clear audio 5, format fit 5 (sum 100).
- Bands: A 85+, B 70-84, C 55-69, D 40-54, E under 40. Every band comes with timecoded reasons and a one-tap fix; never a bare number.

**Worked example: Hook Score: hook lands at 2.4 s, everything else on time**

| Step | Calculation | Result |
|---|---|---|
| Hook lands by 2.0s | Hook lands at 2.4s. | 10 / 20 |
| On-screen text mirrors the spoken hook within 1s | Hook text appears at 0.9s. | 15 / 15 |
| A face is on screen within the first second | Face on screen at 0.3s. | 15 / 15 |
| App or product visible by 3s | App visible at 2.8s. | 15 / 15 |
| Motion or pattern interrupt in the first 1.5s | Pattern interrupt at 1.2s. | 10 / 10 |
| Uses a proven hook type | Library hook type. | 10 / 10 |
| Speech starts within 1s, no dead air | Speech starts at 0.4s. | 10 / 10 |
| Captions burned in, inside safe zones | Captions inside the safe zones. | 5 / 5 |
| points | sum | 90 |
| band | A 85+ | A |

**Worked example: Flow Score for the same video (4 of 5 beats, 24 s)**

| Step | Calculation | Result |
|---|---|---|
| Hook Score (scaled) | Hook Score 90 scaled to 30. | 27 / 30 |
| Required beats covered | 4 of 5 required beats found. | 20 / 25 |
| App on screen early | App on screen at 2.8s. | 10 / 10 |
| Disclosure present (audio and on-screen) | #ad spoken and on screen. | 10 / 10 |
| Length 15 to 30 seconds | Length 24s. | 5 / 5 |
| Captions inside safe zones | Captions inside the safe zones. | 5 / 5 |
| One CTA, ends on a win state | One CTA, ends on a win. | 5 / 5 |
| Audio clear, no dead air | Clear audio. | 5 / 5 |
| Follows the chosen format's beats | Follows the format. | 5 / 5 |
| points | sum | 92 |
| band | A 85+ | A |

#### Money Clock: when money clears and pays

- Post earnings: accruing while the 72-hour window is open (live estimate) -> window_closed -> automated fraud and disclosure check (done within 12 h) -> cleared at the first daily clearing run (14:00 UTC) at or after window end + 2 h -> paid by the next weekly run (Friday 18:00 UTC) or an instant cash-out.
- Conversion earnings (CPA) clear after the clearing window of their kind: install 24 h, trial 72 h, paid 168 h, then the next 14:00 UTC run.
- Every non-final row carries a dated ETA and a named reason (MoneyClockReason); a bare "pending" is a bug. Holds name the next step: fraud review (24 h), dispute, tax info, identity check, payout method, disclosure failure.
- Demo clock: now = 2026-10-03T14:00:00Z. A run whose time is <= now has executed: its items are cleared with cleared_at = the run time.

**Worked example: Timeline for a post (all UTC)**

| Step | Calculation | Result |
|---|---|---|
| posted |  | 2026-09-30T09:00:00Z |
| window ends | posted + 72 h | 2026-10-03T09:00:00Z |
| clearing run | first 14:00Z at or after window end + 2 h | 2026-10-03T14:00:00Z (cleared) |
| weekly payout | first Friday 18:00Z at or after clearing | 2026-10-09T18:00:00Z |
| live post at now | posted 2026-10-02T18:30Z | accruing, reason window_open, clears 2026-10-06T14:00:00Z |
| closed post at now | posted 2026-09-29T21:00Z (window ended 2026-10-02T21:00Z) | cleared, reason awaiting_weekly_payout, clears 2026-10-09T18:00:00Z |
| trial at 2026-10-01T08:15Z | occurred + 72 h, next 14:00Z | 2026-10-04T14:00:00Z |

#### Review SLA

- sla_due_at = the time the current version entered review + 72 h. on_track under 48 h; stale 48 to 72 h; breached over 72 h (escalated, and the brand reliability score takes a hit).
- Timeout policy (per brand): escalate (default) or approve-if-clean (auto-approve only when every QA check passes). Approved-but-unused after 30 days is released to the Spec Market; the brand keeps first refusal for 7 days.

**Worked example: Position by hours in the queue**

| Step | Calculation | Result |
|---|---|---|
| 10 h |  | on_track |
| 47.9 h |  | on_track |
| 48 h |  | stale |
| 72 h |  | stale |
| 72.5 h |  | breached |

#### Price vs fill time (day-one pricing heuristic)

- p50 fill hours = max(6, H x (clearing_cpm / cpm)^1.6); p80 = p50 x 1.8. H = the category's median fill hours at the clearing price.
- confidence = sample_n / (sample_n + 20) x (1 - min(0.5, |ln(cpm / clearing_cpm)|)). Under 8 comparable bounties = thin market warning.
- The curve has six points at 0.6x, 0.8x, 1.0x, 1.2x, 1.5x, 2.0x of the clearing CPM. Replaced by a regression once enough bounties settle.

**Worked example: AI photo & video: clearing CPM $2.40, median fill 31 h, 38 comparable bounties**

| Step | Calculation | Result |
|---|---|---|
| $1.44 | CPM | p50 70.2 h, p80 126.35 h, confidence 0.33 |
| $1.92 | CPM | p50 44.3 h, p80 79.74 h, confidence 0.51 |
| $2.40 | CPM | p50 31 h, p80 55.8 h, confidence 0.66 |
| $2.88 | CPM | p50 23.16 h, p80 41.68 h, confidence 0.54 |
| $3.60 | CPM | p50 16.2 h, p80 29.17 h, confidence 0.39 |
| $4.80 | CPM | p50 10.23 h, p80 18.41 h, confidence 0.33 |

#### Match score (bounty feed ranking)

- Gates first (any failure hides the bounty or shows it locked): creator tier meets the bounty minimum, country, a linked account on a bounty platform, bounty funded, not already submitted.
- match = niche overlap x 40 + platform fit x 15 + audience-region fit x 15 + price fit x 15 + brand reliability x 10 + recency x 5, all factors 0..1. Price fit = min(bounty expected pay / creator's usual pay, 1.5) / 1.5. Recency halves every 14 days.

**Worked example: Maya x a fresh stacked AI-photo bounty**

| Step | Calculation | Result |
|---|---|---|
| niche overlap | 1 of 1 niche | 1.00 |
| platform fit | TikTok linked | 1.00 |
| region fit | 71% US audience vs 50% needed | 1.00 |
| price fit | min(1.2, 1.5) / 1.5 | 0.80 |
| brand reliability | 94 / 100 | 0.94 |
| recency | 2 days old | 0.91 |
| match | 40 + 15 + 15 + 12 + 9.4 + 4.55 | 96 |

#### Funnel, cost per stage, ROAS and payback

- cost = creator pay + platform fee (+ ad spend and commission for promoted posts). Stage costs divide cost by TRACKED counts (link + code, deterministic). Estimated counts (MMP, survey, modelled) are shown separately and never mixed in or paid.
- ROAS Dn = tracked revenue in the first n days after posting / cost. payback_day = the first day cumulative tracked revenue >= cost.

**Worked example: $520.00 cost, 410,000 views, 1,850 clicks, 700 installs, 112 trials, 41 paid**

| Step | Calculation | Result |
|---|---|---|
| effective CPM | cost / views x 1000 | $1.27 |
| cost per install | round(52000 / 700) | $0.74 |
| cost per trial | round(52000 / 112) | $4.64 |
| cost per paid | round(52000 / 41) | $12.68 |
| ROAS D7 | revenue in 7 days / cost | 0.44 |
| ROAS D30 |  | 1.47 |
| payback day | first day cumulative revenue >= cost | 17 |

#### Smart Budget planner

- views = budget / cpm x 1000. Median: installs = views x 0.45% x 38%; trials = installs x 6.2%; paid = trials x 34.8%. The low and high bands multiply every stage count by k = 0.55 and 1.6. cost per trial = card charge / trials.
- Always labelled "estimate"; the band is a planning range, not a promise.

**Worked example: Pro, $5,000 pool at $2.00 CPM (card charge $5,659.80)**

| Step | Calculation | Result |
|---|---|---|
| low | 2351 installs, 146 trials, 51 paid | cost per trial $38.82 |
| median | 4275 installs, 265 trials, 92 paid | cost per trial $21.35 |
| high | 6840 installs, 424 trials, 148 paid | cost per trial $13.35 |
| views | budget / cpm x 1000 | 2,500,000 |
<!-- /GENERATED:formulas -->

---

## 12. Rules tables: reason codes, Brief Lint, scores, fraud signals

### 12.1 Reason codes

<!-- GENERATED:reason-codes -->
Reason codes explain why a video was not approved. They are always about the video, never the person. Rejection needs a code AND evidence (a timecode, a QA check, a quoted brief requirement or a transcript line). Request-changes needs a code and at least one must-fix timecoded note.

| Code | UI label | Applies to | Note category | QA check | Creator copy | Fix hint |
|---|---|---|---|---|---|---|
| `app_not_shown_early` | App not on screen early | both | hook | `brief_beats` | The app isn't on screen in the first 3 seconds. | Cut to the app by 0:03, then come back to your face. |
| `hook_too_late` | Hook lands too late | both | hook | - | The hook doesn't land until after 2 seconds. | Open on the hook line. Trim the intro or move the line to the very first frame. |
| `missing_required_beat` | Missing a required beat | both | offer | `brief_beats` | A beat the brief requires is missing. | Add the missing beat from the shot checklist, then re-check the score. |
| `missing_disclosure` | Disclosure missing | both | disclosure | `disclosure_audio` | #ad needs to be spoken and shown on screen. | Say "this is a paid partnership" and keep #ad on screen for 2 seconds. |
| `offer_not_stated` | Offer not stated | both | offer | `brief_beats` | The free-trial offer isn't mentioned. | Say the offer out loud once, near the end, before the call to action. |
| `face_not_shown` | Face required | both | hook | - | This bounty needs a face on camera in the first seconds. | Re-record the opening with your face in frame. |
| `audio_unclear` | Audio unclear | both | audio | `audio_clarity` | The speech is hard to hear or has dead air. | Move closer to the mic, cut silences, and re-export. |
| `music_not_licensed` | Music not licensed for ads | both | audio | `music_licence` | The music is not licensed for ads. | Swap it for a commercial-library track or remove the music. |
| `banned_claim` | Banned claim | both | claims | `banned_claims` | A claim in the video is on the brand's do-not-say list. | Rephrase using the approved wording in the brief. |
| `off_brief` | Doesn't match the brief | both | brand | - | The concept doesn't follow the stated brief. | Re-read the brief TL;DR and pick one of the suggested formats. |
| `low_video_quality` | Video quality too low | both | pacing | `resolution` | The video is too dark, shaky or low resolution. | Film near a window, hold steady, and export at 1080x1920. |
| `wrong_format` | Wrong aspect or length | both | pacing | `aspect_ratio` | The video is not 9:16 or is outside the allowed length. | Re-export at 1080x1920 and keep it between 15 and 30 seconds. |
| `duplicate_content` | Duplicate video | reject | brand | `duplicate` | This video matches one that was already submitted or posted. | Film a new original take. |
| `unoriginal_clip` | Unoriginal clip | reject | brand | `duplicate` | The video reuses someone else's footage. | Use only your own footage and screen recordings. |
| `watermark_present` | Watermark present | both | brand | `watermark` | Another app's watermark or logo is visible. | Re-export your screen recording without overlays. |
| `competitor_shown` | Competitor shown | both | brand | - | A competing app is visible on screen. | Crop or re-record the section. |
| `ai_content_undisclosed` | AI content not labelled | both | disclosure | `ai_content` | AI-generated media needs a visible AI label. | Add the "AI-generated" label on screen. |
| `brand_safety` | Brand-safety issue | reject | brand | `moderation` | The content is outside the brand's safety rules. | Review the do and don't list in the brief. |
| `region_mismatch` | Audience region mismatch | reject | brand | - | Your audience isn't in this bounty's target regions. | Look for bounties that match your audience; your next one may fit. |
| `other_requirement` | Other stated requirement | both | brand | - | A requirement written in the brief is missing. | The quoted requirement shows exactly what to change. |
| `suspected_fraud` | Suspected view fraud | admin | brand | - | Views on this post were found to be invalid. Legitimate views delivered are still paid. | You can dispute this from the post. |
<!-- /GENERATED:reason-codes -->

### 12.2 Brief Lint rules

<!-- GENERATED:lint -->
Brief Lint runs on every draft (client and server share this ruleset, `CONSTANTS.lint`). A bounty with a blocker cannot be published; warnings and tips are shown with the fix. Thresholds: min_budget_cents = 10000, min_cap_cents = 2000, low_effective_pay_median_cents = 1500, short_window_days = 5, max_paid_ads_days = 365.

| Code | Rule | Severity | Triggers when | Fix |
|---|---|---|---|---|
| `missing_deliverables` | Missing deliverables | blocker | videos_per_creator < 1, or min_duration_s / max_duration_s unset. | State how many videos, how long and in what ratio. |
| `missing_platforms` | Missing platforms | blocker | deliverables.platforms is empty. | Choose at least one platform. |
| `missing_regions` | Missing regions | warning | deliverables.regions is empty. | Pick target regions so matching and fraud checks can use them. |
| `view_minimum_base` | View-minimum base pay | blocker | Text says base pay needs a minimum view count first (e.g. "must reach 10,000 views to qualify", "paid after 5k views"). | Pay from the first verified view, or move the threshold to a bonus. |
| `unpaid_trial` | Unpaid trial | blocker | Text asks for an unpaid test, sample or trial video ("unpaid test", "free sample video", "trial video before we pay"). | Pay for every video, including the first. |
| `burner_account` | Burner account demanded | blocker | Text requires a new, dedicated or burner account ("new account", "dedicated account", "burner", "separate account just for us"). | Let creators post from their own accounts. |
| `fresh_account_demand` | Fresh account demanded | blocker | Text requires a fresh account or forbids personal posting ("fresh account", "no other content on the account"). | Remove it; bounties may not require fresh accounts. |
| `forced_posting_count` | Forced posting count | blocker | Text demands a posting cadence with no pay attached ("post 3 times a day", "daily posts for 30 days"). | Pay per video and drop the quota. |
| `perpetual_rights` | Perpetual rights | blocker | rights_card.paid_ads_days > 365, or text says "perpetual", "in perpetuity", "forever" or "unlimited usage". | Use a fixed paid-ad term (default 90 days) with a priced renewal. |
| `ai_likeness_requested` | AI likeness requested | blocker | rights_card.ai_likeness is true, or text asks to clone voice or likeness. | AI likeness is off by default and needs a separate agreement. |
| `pay_to_join` | Pay to join | blocker | Text charges creators ("entry fee", "deposit", "pay to join", "buy the product first"). | Creators never pay to take part. |
| `below_floor_cpm` | CPM below floor | blocker | 0 < cpm_cents < pay.floor_cpm_cents (50). | Raise the CPM to at least $0.50. |
| `no_disclosure_text` | No disclosure wording | warning | brief.disclosure_text is empty. | Set the required wording, e.g. "#ad Paid partnership with Lumi". |
| `unclear_cta` | Unclear CTA | warning | brief.cta is empty or names more than one call to action. | Pick exactly one. |
| `cap_too_low` | Cap too low | warning | per_video_cap_cents < thresholds.min_cap_cents ($20). | Raise the cap or creators will skip it. |
| `low_effective_pay` | Low effective pay | warning | pay_math.median_cents < thresholds.low_effective_pay_median_cents ($15). | Raise the CPM or add a CPA bonus. |
| `budget_below_minimum` | Budget below minimum | blocker | budget_cents < thresholds.min_budget_cents ($100). | Fund at least $100. |
| `short_window` | Short deadline | info | ends_at - starts_at < thresholds.short_window_days (5 days). | Allow at least 5 days so revisions fit. |
<!-- /GENERATED:lint -->

### 12.3 Hook Score and Flow Score checklists

<!-- GENERATED:score-items -->
Both scores are checklist scores: "Checklist score. It gets smarter as bounties settle." Bands: A 85+, B 70-84, C 55-69, D 40-54, E under 40.

| Score | Item | Checklist line | Weight | Rule |
|---|---|---|---|---|
| Hook Score | `hook_lands_2s` | Hook lands by 2.0s | 20 | Full if the hook line lands by 2.0 s; half by 3.0 s; otherwise 0. |
| Hook Score | `onscreen_text_matches` | On-screen text mirrors the spoken hook within 1s | 15 | Full if the spoken hook is also on screen as text within 1.0 s; half if it appears by 2.0 s or only partly matches. |
| Hook Score | `face_early` | A face is on screen within the first second | 15 | Full if a face is on screen within 1.0 s; half by 2.0 s. Faceless formats get full points. |
| Hook Score | `app_visible_3s` | App or product visible by 3s | 15 | Full if the app is visible by 3.0 s; half by 5.0 s. |
| Hook Score | `pattern_interrupt` | Motion or pattern interrupt in the first 1.5s | 10 | Full if there is a cut, motion or visual pattern interrupt in the first 1.5 s. |
| Hook Score | `proven_hook_type` | Uses a proven hook type | 10 | Full if the hook is a library hook type with an above-median trial rate; half for any other library hook type; 0 otherwise. |
| Hook Score | `speech_starts_fast` | Speech starts within 1s, no dead air | 10 | Full if speech starts within 1.0 s; half within 2.0 s. |
| Hook Score | `captions_safe_zone` | Captions burned in, inside safe zones | 5 | Full if captions are burned in and inside the platform safe zones; otherwise 0. |
| Flow Score | `hook_score` | Hook Score (scaled) | 30 | round(Hook Score points x 0.30). |
| Flow Score | `required_beats` | Required beats covered | 25 | round(25 x required beats found / required beats in the brief). |
| Flow Score | `app_visible_early` | App on screen early | 10 | Full if the app is on screen by 3.0 s; half by 8.0 s. |
| Flow Score | `disclosure` | Disclosure present (audio and on-screen) | 10 | 10 if #ad is both spoken and on screen; 5 if only one; 0 if neither (a missing disclosure also blocks settlement). |
| Flow Score | `length_ok` | Length 15 to 30 seconds | 5 | Full for 15 to 30 s; half for 10 to 15 s or 30 to 45 s; otherwise 0. |
| Flow Score | `captions_safe_zone` | Captions inside safe zones | 5 | Full if captions are inside the platform safe zones; otherwise 0. |
| Flow Score | `single_cta_win_state` | One CTA, ends on a win state | 5 | Full if there is exactly one CTA and the video ends on a win state; half if one of the two. |
| Flow Score | `audio_clear` | Audio clear, no dead air | 5 | Full if speech is clear with no dead air over 1.0 s; half if there is one gap. |
| Flow Score | `format_fit` | Follows the chosen format's beats | 5 | Full if the video follows the format's beat order; half if one beat is out of order. |
<!-- /GENERATED:score-items -->

### 12.4 Fraud signals

<!-- GENERATED:fraud-signals -->
Fraud score = min(100, sum of round(max_points x severity) over fired signals). Bands: clean 0-19, watch 20-39, review 40-69, high 70-100.

| Signal | Max points | Rule |
|---|---|---|
| `view_spike_no_engagement` | 25 | Hourly views at least 10x the post baseline while engagement stays under 0.5% of views. |
| `cap_clustering` | 20 | Earnings land within 2% of the per-video cap on 3 of the creator's last 5 posts, or views snap to the cap. |
| `bought_views_pattern` | 30 | Step-function curve: 80% or more of views arrive in two hourly buckets, flat otherwise, and over 60% of views come from the "other" source. |
| `geo_mismatch` | 15 | Audience in the bounty target region is more than 25 points below the bounty minimum. |
| `view_to_follower_outlier` | 10 | Views are more than 40x followers on an account under 5,000 followers. |
| `new_account` | 10 | Social account younger than 30 days. |
| `duplicate_hash` | 20 | Perceptual hash within distance 6 of another creator's video or the creator's own earlier post. |
| `engagement_anomaly` | 10 | Likes under 0.4% of views, or comment ratio an outlier against the account's 28-day norm. |
| `traffic_source_anomaly` | 10 | More than 50% of views from external or "other" sources. |
| `curve_shape` | 10 | No natural decay: hourly views flat or rising for more than 24 hours. |
<!-- /GENERATED:fraud-signals -->

---

## 13. Demo world

One brand workspace, one creator, one admin, and a market around them, all fictional, all generated relative to `now = 2026-10-03T14:00:00Z`. Role switching is a demo affordance on `/login` and in the account menu.

**Timeline of the world** (UTC):

| Date | Event |
|---|---|
| 2026-07-05 | flowd launches (day 0 of the 90-day history). Market series, ledger and metrics start here. |
| 2026-07-06 | Lumi joins as a design partner; flowd runs the content-about-us bounty from day 0. |
| 2026-07-08 | Lumi's first bounty ("Headshots in 60 seconds") goes live with the matched budget (fee waived, $500 matched). |
| 2026-07-10 | First weekly payout run (every Friday 18:00Z after: 07-17, 07-24, 07-31, 08-07, 08-14, 08-21, 08-28, 09-04, 09-11, 09-18, 09-25, 10-02 = 13 runs). |
| 2026-07-14 | Maya joins, links TikTok and Instagram. |
| 2026-07-16 | Maya's first submission: the flowd starter bounty (flat $5). |
| 2026-07-24 | Maya's first approval (20:00Z); W-9 requested just in time. |
| 2026-07-27 | Maya's first dollar clears at the 14:00Z run, 66 hours after the approval. |
| 2026-08-12 | Lumi upgrades to Pro. |
| 2026-08-29 | Maya reaches Silver. |
| 2026-09-28 | Week 6 of Maya's streak begins (2026-W35 started 2026-08-24; W40 is the current week and she has already posted in it). |
| 2026-10-02 18:00Z | Last weekly payout run (`run_2026-10-02`, complete). |
| **2026-10-03 14:00Z** | **now** (Saturday). The 14:00 clearing run has just executed. Today's Daily Drop (16:00Z) is upcoming. |
| 2026-10-04 14:00Z | Next clearing run: Maya's pending items clear in the order of their windows. |
| 2026-10-09 18:00Z | Next payout run (`run_2026-10-09`, scheduled): Maya's $86.00 cleared pays out. |

**The money clock at now.** A clearing run at time R has executed when `R <= now`; its items are cleared with `cleared_at = R`. An item whose eligibility (window end + 2 hours, or conversion age) falls after the last run waits for the first run at or after eligibility: `eta_at` is that run, `reason` says why. Held items have no ETA but a named reason and next step.

<!-- GENERATED:world -->
**Personas** (ids are fixed; everything else about them is in the fixtures):

| Role | Display name | Ids | Who |
|---|---|---|---|
| Creator | Maya Reyes | `usr_maya`, `cr_maya`, @maya.makes | 22, lifestyle and AI-tools niches, posts about three times a week on TikTok and Instagram (roughly two a week are paid flowd bounty posts). Silver tier, close to Gold. |
| Brand member | Jordan Ellis | `usr_jordan`, `bm_lumi_jordan`, `br_lumi`, `app_lumi` | Growth lead at Lumi, an AI photo-editing subscription app. Owner of the Lumi workspace on the Pro plan. |
| Admin | Sam Okafor | `usr_ops`, sam@joinflowd.io | Ops: fraud, disputes, verification, payout runs, the 90-day targets and ML calibration. Appears as "Ops". |


**Maya (cr_maya) hard facts** (invariant P-01):

| Fact | Value |
|---|---|
| tier | silver |
| tier_basis | earned |
| lifetime_cleared_cents | 164000 |
| approved_count | 21 |
| decided_count | 27 |
| approval_rate | 0.78 |
| rejected_count | 6 |
| reliability_score | 93 |
| live_posts_count | 3 |
| posts_count | 20 |
| posts_status.live | 3 |
| posts_status.window_closed | 1 |
| posts_status.cleared | 1 |
| posts_status.paid | 14 |
| posts_status.removed | 1 |
| pending_cents | 21200 |
| cleared_unpaid_cents | 8600 |
| paid_out_cents | 155400 |
| streak_weeks | 6 |
| freezes_banked | 1 |
| academy_lessons_completed | 6 |
| followers.tiktok | 48200 |
| followers.instagram | 21400 |
| median_views_28d.tiktok | 14200 |
| us_audience_ratio | 0.71 |
| country | US |
| niches | lifestyle, ai_tools |
| founding | false |
| payout_method | Bank account ••4821 |
| leaderboard_rank | 7 of 30 (Silver · AI tools) |
| tier_progress_to_gold | 0.82 |


**Lumi (br_lumi) hard facts** (invariant P-02):

| Fact | Value |
|---|---|
| plan | pro |
| category | ai_photo |
| verification | verified |
| bounties | 6 |
| wallet_balance_cents | 248000 |
| decision_hours_median | 11.2 |
| reliability_band | excellent |
| members | Jordan Ellis (owner); Maren Cole (reviewer); Tobias Lang (finance); Aiko Tanaka (viewer) |


**Scale**:

| Key | Target | Note |
|---|---|---|
| `apps` | 24 | Fictional customer apps in 9 categories, plus flowd's own app (25 app rows). |
| `brands` | 26 | 24 product brands (one per app) + 1 agency workspace + flowd (platform). |
| `creators` | 90 | Believable tier distribution (below). |
| `bounties` | 48 | Includes flowd's content-about-us bounty, starter bounties and private direct bounties. |
| `submissions` | 700 | About 810 versions; about 15% have a revision round. |
| `posts` | 420 | All PostStatus values represented. |
| `history_days` | 90 | Daily metrics, market series and ledger back to 2026-07-05. |
| `settled_creator_pay_cents` | 3600000 | About $36,000 of creator pay settled in 90 days (cleared + paid), heavy-tailed: top-decile creators earn about $640 a month, the median about $62. |
| `platform_fees_cents` | 390000 | About $3,900 of take-rate fees on settled spend. |
| `typical_creator_30d_cents` | 6200 | Median 30-day cleared earnings of active creators: $62. |


**Creator tier distribution** (total 90): bronze 46, silver 24, gold 13, platinum 5, elite 2. Total 90. Platinum and Elite creators, and about two thirds of Gold, are founding creators whose verified prior history (carry_over) counts toward the thresholds; those tiers cannot be earned that fast in 90 days on flowd alone. Maya is not founding and has no carry-over.

**Apps per category** (24): ai_photo 3, ai_assistant 2, fitness 3, language 2, productivity 3, finance 3, sleep_mind 3, music_audio 2, lifestyle 3.

**Status mixes** (approximate; fixture agents hit these within a few percent):

- **submissions**: qa_pending 6, in_review 38, changes_requested 22, approved 24, posted 420, rejected 108, appealed 6, withdrawn 34, expired 14, released 28. About 700. in_review includes 7 stale (48-72 h) and 3 breached.
- **posts**: live 26, window_closed 5, held 4, cleared 52, paid 322, removed 6, clawed_back 5. About 420. Live = posted within the last 72 h.
- **bounties**: draft 2, awaiting_funding 2, scheduled 1, live 22, paused 1, filled 4, ended 4, settled 11, cancelled 1. 48. All settled bounties reconcile with refunds.

**Activity ramp**: 2%, 3%, 4%, 5%, 6%, 7%, 8%, 9%, 10%, 11%, 12%, 13%, 10% of submissions in weeks 1-13 since launch. Share of all submissions created in each week since launch (week 1 = 2026-07-05). The last week is partial.

**Day-90 target storyline** (admin control tower):

| Target | Actual | Status |
|---|---|---|
| `first_dollar_hours` | 58 | achieved |
| `filled_48h_ratio` | 0.79 | at_risk |
| `second_bounty_ratio` | 0.64 | achieved |
| `repost_30d_ratio` | 0.38 | achieved |
| `invites_per_creator` | 0.41 | at_risk |
| `creators_per_live_bounty` | 31 | achieved |


**Persona notes**:

- docs/PRODUCT_SPEC.md, ROUTES.md and SCREENS.md describe Maya as Gold with a six-week streak. The contract is authoritative: Maya is SILVER at 82% of the way to Gold (the brief for this contract fixes $1,640 lifetime cleared, 21 approved, 78% approval). Copy that says Gold for the demo creator is a doc slip; the app reads tier from the data.
- Founding creators are the only way Platinum and Elite exist in a 90-day-old market: their verified prior history (carry_over) counts toward the thresholds and the founding badge gives free instant cash-outs for 12 months. Maya is not a founding creator, so she sees the instant fee preview.
<!-- /GENERATED:world -->

**Stories the data must tell.** These scenario seeds are the reason fixtures are hand-shaped, not random: each screen in `docs/ROUTES.md` and `docs/SCREENS.md` needs at least one meaningful row.

<!-- GENERATED:scenarios -->
| Scenario | Who | What the data must show |
|---|---|---|
| `maya-money-clock` | `cr_maya` | Maya has 20 posts: 3 live and accruing, 1 window_closed awaiting its clearing run, 1 cleared at the 14:00 run today ($86.00, waiting for Friday), 14 paid, 1 removed. $212.00 is pending in total (accruing + pending). Every row has a dated ETA and a named reason. |
| `maya-submission-states` | `cr_maya` | Maya has: two submissions in review (one decides in about 11 h), one with changes requested (3 timecoded notes: two must-fix, one suggestion; round 1 of 2), one approved and not posted yet (link, code and #ad ready), one rejected 2 days ago with a reason code and evidence and the appeal not used yet. |
| `maya-dispute` | `cr_maya` | Maya has one open view_count dispute on a cleared post (evidence requested), 24 h reply SLA running. |
| `maya-offer` | `cr_maya` | Lumi (Jordan) sent Maya a direct offer, awaiting_creator, with a market-suggested band and Rights Card; a second offer from another brand is mid-negotiation (one counter, awaiting_brand). |
| `maya-rights` | `cr_maya` | A Maya post runs as a Lumi Spark ad; its paid-usage rights expire in 14 days (alert 14 sent), renewal priced at 25% of base fee per 30 days. |
| `maya-tier-progress` | `cr_maya` | Maya is Silver, 82% of the way to Gold (the bottleneck is lifetime cleared: $1,640 of $2,000). One grace-hold example exists on another creator. |
| `maya-streak` | `cr_maya` | Six-week streak (2026-W35 to W40), one banked freeze, next freeze in two weeks, no rest week declared. |
| `maya-drop` | `cr_maya` | Today's Daily Drop is upcoming (16:00Z, two hours away) with six bounties; yesterday's drop sold out one item and closed; a past drop has Maya's claim. |
| `maya-first-dollar-done` | `cr_maya` | Maya's first dollar cleared on 2026-07-27, 66 hours after her first approval; her Wrapped for September 2026 and a public proof page exist. |
| `lumi-review-queue` | `br_lumi` | Lumi's review queue has 6 submissions waiting: two stale (48-72 h), one breached, one with a fraud-evidence warning, one duplicate hash match; 11.2 h median decision time. |
| `lumi-bounty-states` | `br_lumi` | Lumi has six bounties: live stacked (Glow-up reveal), live CPM, live CPA-only (6% fee), settled (with refund), awaiting_funding draft with a passing Brief Lint, filled. |
| `lumi-winner-promotion` | `br_lumi` | A winning Lumi post is promoted as a Spark ad (live 14 days, commission accruing), a second ad is fatigued (trial rate down 34% from peak) with a fatigue alert. |
| `lumi-auto-approve` | `br_lumi` | One active guarded auto-approve rule (dry run: would have approved 31 of the last 50), one killed rule. |
| `lumi-attribution` | `br_lumi` | Lumi's attribution kit is healthy: RevenueCat connected (webhook events flowing), SDK verified, 8 active codes on the annual SKU out of the 10 cap, one unmatched RevenueCat event. |
| `platform-fraud-queue` | `usr_ops` | Six open fraud flags across score bands (one bought-views pattern at 78, one cap-clustering creator, one duplicate), one confirmed clawback, two cleared false positives. |
| `platform-sla-breach` | `usr_ops` | Three submissions have breached the 72 h SLA at one brand (escalated); one approve-if-clean timeout approval exists. |
| `platform-holds` | `usr_ops` | The next payout run (Fri 2026-10-09 18:00Z) has holds for tax info (3), identity check (2), dispute (1), fraud review (2). |
| `platform-scam` | `usr_ops` | Scam queue has a pay-to-join report, an off-platform-chat report and a burner-account demand that was caught by Brief Lint. |
| `platform-released-spec` | `usr_ops` | Approved-but-unused submissions past 30 days are released to the Spec Market; one is inside the brand's 7-day first-refusal window. |
| `platform-auction` | `usr_ops` | One open sealed-bid auction (Platinum creator), one awarded with a second-price clearing amount, one with no bids. |
| `platform-tournament` | `usr_ops` | One live bracket tournament (Round 2), one open for entries, one complete with prizes paid. |
| `platform-matched-first-bounty` | `usr_ops` | At least three brands used the matched first bounty (fee waived, up to $500 matched). |
| `platform-tier-grace` | `usr_ops` | One creator is in a 30-day grace hold after an approval-rate dip; one Platinum creator was promoted this week. |
| `platform-compliance-fail` | `usr_ops` | One post failed the disclosure audit and is held (held_compliance) until the creator edits the caption. |
<!-- /GENERATED:scenarios -->

**Realism rules for generators.** Names, handles, apps and brands are fictional and diverse; no real people or brands. Views per post follow a log-normal around the creator's 28-day median with a fast-decay curve (70% of views in the first 24 hours); engagement 3 to 9% of views; installs per 1,000 views vary 0.6 to 2.4 by category; trials per install 4 to 9%; trials to paid 25 to 45%. Approval rates 60 to 92% by brand. Flow bands skew B and C. Fraud scores are under 20 for 92% of posts. Typical creators earn about $62 in 30 days; the p90 is about $640. Numbers are never round (no "$500.00" views pay); amounts reconcile to the cent.

---

## 14. Fixture catalogue

Every fixture file: path, top-level shape, owner (`core` = identity and the marketplace money graph; `ext` = everything else), fields, counts and cross-references. The orchestrator `generate-fixtures.mjs` runs `scripts/gen/core.mjs` (`generate(ctx)`) then `scripts/gen/ext.mjs` (`generate(ctx, core)`), writes the files with stable key order, fills `world.counts` and runs the validator.

<!-- GENERATED:fixtures -->
80 fixture files in `packages/contract/fixtures/` (27 core, 53 ext). Generated by `node packages/contract/scripts/generate-fixtures.mjs` (seed 20261003); never hand-edited. Key order within every row follows the schema field order; one compact JSON row per line (single-object files are 2-space indented); arrays sorted as stated. `npm run sync` copies them to `apps/web/src/data/fixtures` and `apps/ios/Flowd/Resources/Fixtures`. Total target size under 14 MB, no single file over 3.5 MB.

| File | Owner | Shape | Entity | Rows (min-max) |
|---|---|---|---|---|
| `world.json` | core | object | World | 1 (1-1) |
| `users.json` | core | array | User | 152 (135-170) |
| `creators.json` | core | array | Creator | 90 (88-92) |
| `social_accounts.json` | core | array | SocialAccount | 150 (120-180) |
| `rate_cards.json` | core | array | RateCard | 40 (30-44) |
| `brands.json` | core | array | Brand | 26 (26-26) |
| `brand_members.json` | core | array | BrandMember | 58 (50-66) |
| `apps.json` | core | array | App | 25 (25-25) |
| `ledger.json` | core | array | LedgerEntry | 6000 (3500-9000) |
| `payouts.json` | core | array | Payout | 420 (330-520) |
| `invoices.json` | core | array | Invoice | 90 (60-130) |
| `money_clock.json` | core | array | MoneyClockRow | 520 (300-800) |
| `market_series.json` | core | array | MarketSeriesPoint | 819 (819-819) |
| `ticker.json` | core | object | Ticker | 1 (1-1) |
| `brand_scorecards.json` | core | array | BrandScorecard | 24 (22-25) |
| `creator_reputation.json` | core | array | CreatorReputation | 90 (88-92) |
| `bounties.json` | core | array | Bounty | 48 (46-50) |
| `submissions.json` | core | array | Submission | 700 (640-760) |
| `video_analyses.json` | core | array | VideoAnalysis | 810 (740-880) |
| `posts.json` | core | array | Post | 420 (390-450) |
| `view_snapshots.json` | core | array | ViewSnapshot | 6300 (4500-8000) |
| `post_metrics_daily.json` | core | array | PostMetricsDaily | 14000 (9000-20000) |
| `post_metrics_hourly.json` | core | array | PostMetricsHourly | 2000 (900-3500) |
| `app_metrics_daily.json` | core | array | AppMetricsDaily | 2250 (1800-2600) |
| `conversions.json` | core | array | Conversion | 3500 (2500-5000) |
| `attribution_links.json` | core | array | AttributionLink | 480 (430-520) |
| `ads.json` | core | array | Ad | 8 (6-10) |
| `offers.json` | ext | array | Offer | 36 (28-44) |
| `auctions.json` | ext | array | Auction | 8 (6-10) |
| `specs.json` | ext | array | Spec | 30 (24-36) |
| `rights_grants.json` | ext | array | RightsGrant | 190 (140-240) |
| `daily_drops.json` | ext | array | DailyDrop | 35 (30-40) |
| `tournaments.json` | ext | array | Tournament | 8 (6-10) |
| `tournament_entries.json` | ext | array | TournamentEntry | 120 (80-160) |
| `crews.json` | ext | array | Crew | 8 (6-10) |
| `crew_members.json` | ext | array | CrewMember | 70 (40-100) |
| `streaks.json` | ext | array | Streak | 70 (60-90) |
| `leaderboards.json` | ext | array | Leaderboard | 28 (20-40) |
| `referrals.json` | ext | array | Referral | 60 (40-80) |
| `lessons.json` | ext | array | Lesson | 10 (10-10) |
| `lesson_progress.json` | ext | array | LessonProgress | 260 (180-340) |
| `trends.json` | ext | array | Trend | 18 (14-24) |
| `formats.json` | ext | array | Format | 11 (11-11) |
| `hooks.json` | ext | array | Hook | 84 (70-100) |
| `tier_history.json` | ext | array | TierEvent | 110 (80-150) |
| `wrapped.json` | ext | array | Wrapped | 6 (4-8) |
| `proofs.json` | ext | array | Proof | 120 (90-160) |
| `bounty_saves.json` | ext | array | BountySave | 90 (60-130) |
| `wellbeing_settings.json` | ext | array | WellbeingSettings | 12 (8-20) |
| `notification_prefs.json` | ext | array | NotificationPrefs | 6 (3-12) |
| `waitlist.json` | ext | object | Waitlist | 1 (1-1) |
| `state_of_app_ugc.json` | ext | object | StateOfAppUgc | 1 (1-1) |
| `case_studies.json` | ext | array | CaseStudy | 6 (5-8) |
| `testimonials.json` | ext | array | Testimonial | 8 (6-10) |
| `changelog.json` | ext | array | ChangelogEntry | 14 (10-20) |
| `feedback_notes.json` | ext | array | FeedbackNote | 260 (180-340) |
| `disputes.json` | ext | array | Dispute | 14 (10-20) |
| `scam_reports.json` | ext | array | ScamReport | 22 (16-28) |
| `fraud_flags.json` | ext | array | FraudFlag | 18 (12-24) |
| `verifications.json` | ext | array | Verification | 40 (30-55) |
| `tax_profiles.json` | ext | array | TaxProfile | 72 (55-90) |
| `tax_docs.json` | ext | array | TaxDoc | 80 (55-110) |
| `compliance_checks.json` | ext | array | ComplianceAudit | 420 (390-450) |
| `payout_runs.json` | ext | array | PayoutRun | 14 (14-14) |
| `notifications.json` | ext | array | Notification | 260 (160-360) |
| `integrations.json` | ext | array | Integration | 38 (28-48) |
| `api_keys.json` | ext | array | ApiKey | 10 (6-14) |
| `webhooks.json` | ext | array | Webhook | 8 (5-12) |
| `activity_log.json` | ext | array | ActivityEntry | 160 (100-220) |
| `auto_approve_rules.json` | ext | array | AutoApproveRule | 6 (4-8) |
| `test_plans.json` | ext | array | TestPlan | 4 (3-6) |
| `fatigue_alerts.json` | ext | array | FatigueAlert | 5 (3-7) |
| `audit_reports.json` | ext | array | AuditReport | 8 (6-10) |
| `flo_suggestions.json` | ext | array | FloSuggestion | 60 (40-90) |
| `ml_models.json` | ext | array | MlModel | 8 (8-8) |
| `admin_metrics.json` | ext | object | AdminMetrics | 1 (1-1) |
| `threads.json` | ext | array | ChatThread | 60 (40-90) |
| `revenuecat_events.json` | ext | array | RevenueCatEvent | 1600 (1000-2200) |
| `offer_code_pool.json` | ext | array | OfferCode | 90 (60-120) |
| `brand_lists.json` | ext | array | BrandList | 12 (8-18) |


### Core fixtures (identity and the marketplace money graph)

#### world.json

- **Path** `packages/contract/fixtures/world.json`; **shape** one object; **owner** core; **rows** 1 (min 1, max 1); **order** n/a.
- **Fields** (7, `?` = optional): id, now, launch_date, seed, contract_version, personas, counts.
- **Cross-references** `apps`, `brand_members`, `brands`, `creators`, `users`; **referenced by** none.
- **Notes** Manifest first: now, personas, row counts (counts are written by the orchestrator, never by hand). Loaded before any other file.

#### users.json

- **Path** `packages/contract/fixtures/users.json`; **shape** array of User; **owner** core; **rows** 152 (min 135, max 170); **order** role, then created_at.
- **Fields** (13, `?` = optional): id, role, email, display_name, avatar, auth_providers, status, age_verified, locale, timezone, created_at, last_seen_at?, title?.
- **Cross-references** none; **referenced by** `bounties`, `brand_members`, `creators`, `disputes`, `fraud_flags`, `notification_prefs`, `notifications`, `offers`, `scam_reports`, `submissions`, `threads`, `verifications`, `video_analyses`, `world`.
- **Notes** 90 creators + about 58 brand members + 2 admins (usr_ops "Sam Okafor", plus a second Ops user). Emails are fictional (@example.com; staff @joinflowd.io). Avatars are ArtSeeds.

#### creators.json

- **Path** `packages/contract/fixtures/creators.json`; **shape** array of Creator; **owner** core; **rows** 90 (min 88, max 92); **order** joined_at.
- **Fields** (40, `?` = optional): id, user_id, handle, display_name, bio, avatar, niches, country, languages, tier, tier_basis, tier_since, tier_hold_until?, tier_review?, lifetime_cleared_cents, approved_count, decided_count, approval_rate, reliability_score, posts_count, live_posts_count, first_dollar_at?, joined_at, last_active_at, founding, founding_perks_until?, badges, verification_status, onboarding_stage, payout_ready, payout_method?, stripe_account_id?, referral_code, referred_by_creator_id?, streak_weeks, carry_over?, storefront, portfolio, open_to_offers, paused_until?.
- **Cross-references** `posts`, `users`; **referenced by** `ads`, `attribution_links`, `auctions`, `audit_reports`, `bounty_saves`, `brand_lists`, `compliance_checks`, `conversions`, `creator_reputation`, `creators`, `crew_members`, `crews`, `daily_drops`, `disputes`, `fatigue_alerts`, `feedback_notes`, `flo_suggestions`, `fraud_flags`, `leaderboards`, `ledger`, `lesson_progress`, `money_clock`, `offer_code_pool`, `offers`, `payouts`, `posts`, `proofs`, `rate_cards`, `referrals`, `revenuecat_events`, `rights_grants`, `scam_reports`, `social_accounts`, `specs`, `streaks`, `submissions`, `tax_docs`, `tax_profiles`, `testimonials`, `threads`, `ticker`, `tier_history`, `tournament_entries`, `tournaments`, `verifications`, `wellbeing_settings`, `world`, `wrapped`.
- **Notes** Tier distribution 46/24/13/5/2 (TIER_DISTRIBUTION). cr_maya is Silver. About 35 founding creators (the earliest joiners: all Platinum and Elite and about two thirds of Gold; they carry carry_over). Maya is not founding. Handles unique. Stats reconcile with the ledger (L-09).

#### social_accounts.json

- **Path** `packages/contract/fixtures/social_accounts.json`; **shape** array of SocialAccount; **owner** core; **rows** 150 (min 120, max 180); **order** creator, platform.
- **Fields** (16, `?` = optional): id, creator_id, platform, handle, followers, avg_views_28d, median_views_28d, engagement_rate, us_audience_ratio, status, verified_by_platform, primary, account_created_at, connected_at, last_synced_at, health.
- **Cross-references** `creators`; **referenced by** `posts`.
- **Notes** 1 to 3 per creator, TikTok most common. Followers in the 2k..400k range; median_views_28d correlates with followers. Maya: TikTok 48.2k (median 14.2k views), Instagram 21.4k.

#### rate_cards.json

- **Path** `packages/contract/fixtures/rate_cards.json`; **shape** array of RateCard; **owner** core; **rows** 40 (min 30, max 44); **order** creator.
- **Fields** (17, `?` = optional): id, creator_id, status, price_per_video_cents, min_cpm_cents, paid_usage_days, paid_usage_pct_per_30d, turnaround_days, max_videos_per_month, platforms, format_ids, categories_excluded, accepts_direct_offers, suggested?, packages, stats, updated_at.
- **Cross-references** `creators`; **referenced by** `offers`.
- **Notes** Silver and above only (tier perk); some opt out. price_per_video $80..$900 correlated with tier and median views; suggested band from the market formula.

#### brands.json

- **Path** `packages/contract/fixtures/brands.json`; **shape** array of Brand; **owner** core; **rows** 26 (min 26, max 26); **order** created_at.
- **Fields** (22, `?` = optional): id, kind, name, slug, tagline, logo, website, country, plan, plan_renews_at?, verification, created_at, agency_id?, first_bounty_waiver_used, matched_budget_used_cents, wallet_balance_cents, auto_top_up?, billing, timeout_policy, review_sla_hours, compliance_defaults, referral_partner_brand_id?.
- **Cross-references** none; **referenced by** `activity_log`, `ads`, `api_keys`, `apps`, `auctions`, `audit_reports`, `auto_approve_rules`, `bounties`, `brand_lists`, `brand_members`, `brand_scorecards`, `brands`, `case_studies`, `compliance_checks`, `disputes`, `fatigue_alerts`, `flo_suggestions`, `fraud_flags`, `integrations`, `invoices`, `ledger`, `offers`, `posts`, `referrals`, `rights_grants`, `scam_reports`, `specs`, `submissions`, `test_plans`, `testimonials`, `threads`, `tournaments`, `verifications`, `webhooks`, `world`, `wrapped`.
- **Notes** 24 product brands (br_lumi first), 1 agency workspace managing 3 of them (agency_id), flowd (kind platform, br_flowd) running the content-about-us and starter bounties. Plans among the 24 product brands: 10 free, 11 pro, 3 scale; the agency workspace and flowd are on scale.

#### brand_members.json

- **Path** `packages/contract/fixtures/brand_members.json`; **shape** array of BrandMember; **owner** core; **rows** 58 (min 50, max 66); **order** brand, role.
- **Fields** (9, `?` = optional): id, brand_id, user_id, role, status, invited_by_member_id?, approval_link_code?, joined_at, last_active_at?.
- **Cross-references** `brands`, `users`; **referenced by** `activity_log`, `api_keys`, `auctions`, `auto_approve_rules`, `bounties`, `brand_lists`, `brand_members`, `compliance_checks`, `feedback_notes`, `offers`, `rights_grants`, `world`.
- **Notes** Lumi has four (Jordan Ellis owner, Maren Cole reviewer, Tobias Lang finance, Aiko Tanaka viewer). Others have 1 to 3. Every brand has exactly one owner. The agency has client_approver members.

#### apps.json

- **Path** `packages/contract/fixtures/apps.json`; **shape** array of App; **owner** core; **rows** 25 (min 25, max 25); **order** connected_at.
- **Fields** (21, `?` = optional): id, brand_id, name, tagline, category, icon, brand_colors, features, app_store_id, bundle_id, store_url, pricing, avg_first_payment_cents, rating, rating_count, status, connected_at, revenuecat_project_id?, mmp, sdk_status, default_hashtags.
- **Cross-references** `brands`; **referenced by** `ads`, `app_metrics_daily`, `attribution_links`, `bounties`, `case_studies`, `conversions`, `fatigue_alerts`, `integrations`, `money_clock`, `offer_code_pool`, `offers`, `posts`, `revenuecat_events`, `rights_grants`, `submissions`, `test_plans`, `world`.
- **Notes** 24 fictional apps (pools.mjs APPS) + app_flowd. Lumi: AI photo-editing, monthly $9.99, annual $59.99, 7-day trial. Brand colours feed generated art.

#### ledger.json

- **Path** `packages/contract/fixtures/ledger.json`; **shape** array of LedgerEntry; **owner** core; **rows** 6000 (min 3500, max 9000); **order** posted_at, id.
- **Fields** (20, `?` = optional): id, txn_id, entry_type, account, amount_cents, status, posted_at, cleared_at?, paid_at?, brand_id?, bounty_id?, post_id?, submission_id?, creator_id?, conversion_id?, ad_id?, payout_id?, invoice_id?, reverses_txn_id?, memo.
- **Cross-references** `ads`, `bounties`, `brands`, `conversions`, `creators`, `invoices`, `payouts`, `posts`, `submissions`; **referenced by** `money_clock`.
- **Notes** Double entry; every txn nets to 0 (L-01). Types: top-ups, escrow_fund, matched_budget, cpm, cpa, flat_fee, fee, commission, rights_fee, ad_fee, subscription_fee, processing, payout, payout_fee, bonus, prize, referral, clawback, escrow_refund. memo is plain English.

#### payouts.json

- **Path** `packages/contract/fixtures/payouts.json`; **shape** array of Payout; **owner** core; **rows** 420 (min 330, max 520); **order** requested_at.
- **Fields** (21, `?` = optional): id, creator_id, kind, status, gross_cents, fee_cents, net_cents, run_id?, requested_at, scheduled_for, initiated_at?, paid_at?, failed_reason?, hold_reason?, method_label, stripe_transfer_id?, ledger_txn_id?, item_count, tier_at_payout, free_instant, proof_id.
- **Cross-references** `creators`; **referenced by** `disputes`, `ledger`, `money_clock`, `proofs`.
- **Notes** Weekly (Fridays 18:00Z since 2026-07-10) and about 12% instant. Maya: one weekly payout most weeks. proof_id on each.

#### invoices.json

- **Path** `packages/contract/fixtures/invoices.json`; **shape** array of Invoice; **owner** core; **rows** 90 (min 60, max 130); **order** issued_at.
- **Fields** (20, `?` = optional): id, brand_id, number, kind, status, bounty_id?, line_items, subtotal_cents, processing_cents, tax_cents, total_cents, po_number?, cost_center?, vat_id?, reverse_charge, issued_at, due_at, paid_at?, ledger_txn_id?, pdf_ref.
- **Cross-references** `ads`, `bounties`, `brands`; **referenced by** `ledger`.
- **Notes** Funding invoices per bounty, subscription invoices per month for Pro and Scale brands, ad-fee and renewal invoices. PO and cost-centre on the Scale and agency brands.

#### money_clock.json

- **Path** `packages/contract/fixtures/money_clock.json`; **shape** array of MoneyClockRow; **owner** core; **rows** 520 (min 300, max 800); **order** creator, earned_at.
- **Fields** (19, `?` = optional): id, creator_id, bounty_id, app_id, post_id?, conversion_id?, source, state, amount_cents, estimated, earned_at, eta_at?, reason, reason_text, label, ledger_id?, payout_id?, cleared_at?, paid_at?.
- **Cross-references** `apps`, `bounties`, `conversions`, `creators`, `ledger`, `payouts`, `posts`; **referenced by** none.
- **Notes** The creator-facing projection for every earning that is not yet paid, plus the last 21 days of paid rows. Every non-final row has eta_at and a named reason.

#### market_series.json

- **Path** `packages/contract/fixtures/market_series.json`; **shape** array of MarketSeriesPoint; **owner** core; **rows** 819 (min 819, max 819); **order** category, date.
- **Fields** (14, `?` = optional): id, category, date, clearing_cpm_cents, p25_cpm_cents, p75_cpm_cents, open_bounties, open_budget_cents, new_bounties, submissions, median_fill_hours, median_views, trial_rate, sample_n.
- **Cross-references** none; **referenced by** none.
- **Notes** 9 categories x 91 days (2026-07-05 to 2026-10-03). Clearing CPM follows the category base with a weekly drift and noise; p25 <= clearing <= p75.

#### ticker.json

- **Path** `packages/contract/fixtures/ticker.json`; **shape** one object; **owner** core; **rows** 1 (min 1, max 1); **order** n/a.
- **Fields** (2, `?` = optional): totals, events.
- **Cross-references** `bounties`, `creators`; **referenced by** none.
- **Notes** Totals (typical median $62, p25, p75, p90) and 40 to 80 recent events newest first, handles only. Totals equal ledger and payout sums.

#### brand_scorecards.json

- **Path** `packages/contract/fixtures/brand_scorecards.json`; **shape** array of BrandScorecard; **owner** core; **rows** 24 (min 22, max 25); **order** brand.
- **Fields** (22, `?` = optional): id, brand_id, window_days, as_of, decisions_n, approved_n, decision_hours_median, decision_hours_p90, sla_breaches, approval_rate, rejection_rate, appeals_n, appeals_overturned, run_rate, pays_on_time_ratio, pay_speed_hours_median, reply_hours_median, funded_always, reliability_score, band, badges, trend_30d.
- **Cross-references** `brands`; **referenced by** none.
- **Notes** One per brand with at least one decision (flowd excluded). Lumi: excellent (97), 11.2 h median. 3 brands "new" (under 10 decisions); one brand with SLA breaches and a poor band.

#### creator_reputation.json

- **Path** `packages/contract/fixtures/creator_reputation.json`; **shape** array of CreatorReputation; **owner** core; **rows** 90 (min 88, max 92); **order** creator.
- **Fields** (19, `?` = optional): id, creator_id, as_of, provisional, reliability_score, approval_rate_finished, approval_rate_raw, on_time_ratio, post_through_ratio, compliance_ratio, clean_record_ratio, finished_n, fraud_flags_90d, clawbacks_90d, disputes_lost_90d, academy_bonus_points, components, reasons, tier_progress.
- **Cross-references** `creators`; **referenced by** none.
- **Notes** One per creator; recomputed with creatorReliability(). New creators are provisional. Maya 93.

#### bounties.json

- **Path** `packages/contract/fixtures/bounties.json`; **shape** array of Bounty; **owner** core; **rows** 48 (min 46, max 50); **order** created_at.
- **Fields** (56, `?` = optional): id, app_id, brand_id, owner_member_id?, created_by_member_id?, title, type, status, visibility, funding_source, is_first_bounty, is_starter, featured, featured_until?, cpm_cents, cpa_install_cents, cpa_trial_cents, cpa_paid_cents, flat_fee_cents, ad_commission_rate, per_video_cap_cents, per_creator_cap_cents?, budget_cents, take_rate, fee_reserve_cents, escrow_funded_cents, matched_cents, funded, funded_at?, reserved_cents, spent_cents, remaining_cents, refunded_cents, brief, rights_card, deliverables, eligibility, brief_lint, lint_overrides?, pay_math, format_ids, art, starts_at, ends_at, published_at?, first_submission_at?, filled_at?, time_to_fill_hours?, ended_at?, settled_at?, review_sla_hours, counts, funnel, all_in_cpm_cents, created_at, updated_at.
- **Cross-references** `apps`, `brand_members`, `brands`, `posts`, `users`; **referenced by** `ads`, `attribution_links`, `auctions`, `auto_approve_rules`, `bounty_saves`, `compliance_checks`, `conversions`, `daily_drops`, `disputes`, `fatigue_alerts`, `feedback_notes`, `fraud_flags`, `invoices`, `ledger`, `money_clock`, `offer_code_pool`, `offers`, `posts`, `rights_grants`, `specs`, `submissions`, `test_plans`, `threads`, `ticker`, `tournaments`.
- **Notes** STATUS_MIX.bounties. Every non-draft money field reconciles (L-03..L-08). 6 for Lumi. Types: cpm 21, stacked 12, cpa 5, install_only 3, direct 7. 3 first-bounty brands used the match. Includes the flowd content-about-us bounty (always on) and 3 starter bounties (flat $5).

#### submissions.json

- **Path** `packages/contract/fixtures/submissions.json`; **shape** array of Submission; **owner** core; **rows** 700 (min 640, max 760); **order** submitted_at.
- **Fields** (32, `?` = optional): id, bounty_id, creator_id, brand_id, app_id, status, version, versions, source, format_id?, title, revision_round, reserved_cents, flow_band, flow_points, hook_band, hook_points, rights_card, rights_accepted_at, fraud_evidence, submitted_at, sla_due_at?, sla_state, sla_breached_at?, decision?, auto_approved, approved_at?, post_id?, link_id?, posted_at?, released_at?, updated_at.
- **Cross-references** `apps`, `attribution_links`, `bounties`, `brands`, `creators`, `posts`, `users`; **referenced by** `bounty_saves`, `compliance_checks`, `disputes`, `feedback_notes`, `ledger`, `posts`, `rights_grants`, `specs`, `submissions`, `test_plans`, `threads`, `tournament_entries`, `video_analyses`.
- **Notes** STATUS_MIX.submissions. Versioned. About 15% have a second version; changes_requested rounds <= 2 free. Reservation unit held while open. Flow band skew: A 12%, B 34%, C 30%, D 17%, E 7%. Each carries the Rights Card snapshot accepted at submit.

#### video_analyses.json

- **Path** `packages/contract/fixtures/video_analyses.json`; **shape** array of VideoAnalysis; **owner** core; **rows** 810 (min 740, max 880); **order** submission, version.
- **Fields** (18, `?` = optional): id, submission_id, version, duration_ms, language, transcript, transcript_text, on_screen_text, scenes, hook, beats, tags, checks, hook_score, flow_score, phash, duplicate_of_submission_id?, analysed_at.
- **Cross-references** `submissions`, `users`; **referenced by** none.
- **Notes** One per (submission, version). Scores recompute with scoreHook/scoreFlow (formulas.mjs) from the observations. Transcripts are short and believable; phash 16 hex; QA checks: all 14 types per row.

#### posts.json

- **Path** `packages/contract/fixtures/posts.json`; **shape** array of Post; **owner** core; **rows** 420 (min 390, max 450); **order** posted_at.
- **Fields** (39, `?` = optional): id, submission_id, creator_id, brand_id, app_id, bounty_id, social_account_id, platform, platform_post_id, url, caption, hashtags, thumb, duration_ms, posted_at, window_ends_at, status, hold_reason?, cleared_at?, paid_at?, removed_at?, tracking_link_id, promo_code?, views, window_views, views_invalid, likes, comments, shares, saves, retention, funnel, earnings, fraud, flow_band, ad_id?, is_winner, why_it_won?, tags.
- **Cross-references** `ads`, `apps`, `attribution_links`, `bounties`, `brands`, `creators`, `social_accounts`, `submissions`; **referenced by** `ads`, `attribution_links`, `audit_reports`, `bounties`, `compliance_checks`, `conversions`, `creators`, `disputes`, `fatigue_alerts`, `fraud_flags`, `ledger`, `money_clock`, `offers`, `post_metrics_daily`, `post_metrics_hourly`, `rights_grants`, `submissions`, `test_plans`, `view_snapshots`, `wrapped`.
- **Notes** STATUS_MIX.posts. Views follow a log-normal by creator median with the decay curve; fraud signals produce the 40+ scores. 26 live, ~35 with an ad candidate flag (is_winner on the top decile per bounty).

#### view_snapshots.json

- **Path** `packages/contract/fixtures/view_snapshots.json`; **shape** array of ViewSnapshot; **owner** core; **rows** 6300 (min 4500, max 8000); **order** post, taken_at.
- **Fields** (14, `?` = optional): id, post_id, taken_at, views_reported, views_verified, views_invalid, exclusions?, delta_verified, source, sources?, geo?, flags, fraud_score, note?.
- **Cross-references** `posts`; **referenced by** none.
- **Notes** 13 per fully-windowed post (6 h steps over 72 h) then weekly until now; fewer while a window is open. Source mix 95% platform_api, 5% creator_screenshot. Bot-pattern flags and exclusions (ExclusionCause with plain-language detail) only on flagged posts; views_invalid = reported - verified.

#### post_metrics_daily.json

- **Path** `packages/contract/fixtures/post_metrics_daily.json`; **shape** array of PostMetricsDaily; **owner** core; **rows** 14000 (min 9000, max 20000); **order** post, date.
- **Fields** (14, `?` = optional): post_id, date, views, likes, comments, shares, saves, clicks, installs, trials, paid, est_installs, est_trials, est_paid.
- **Cross-references** `posts`; **referenced by** none.
- **Notes** One row per post per UTC day from posted_at to now (daily decay). Sums equal post lifetime numbers (M-01, M-02).

#### post_metrics_hourly.json

- **Path** `packages/contract/fixtures/post_metrics_hourly.json`; **shape** array of PostMetricsHourly; **owner** core; **rows** 2000 (min 900, max 3500); **order** post, ts.
- **Fields** (7, `?` = optional): post_id, ts, views, likes, comments, shares, fraud_score.
- **Cross-references** `posts`; **referenced by** none.
- **Notes** Only posts posted on or after 2026-09-30; every hour from posted_at to now. Daily sums equal post_metrics_daily for covered days (M-05).

#### app_metrics_daily.json

- **Path** `packages/contract/fixtures/app_metrics_daily.json`; **shape** array of AppMetricsDaily; **owner** core; **rows** 2250 (min 1800, max 2600); **order** app, date.
- **Fields** (17, `?` = optional): app_id, date, views, clicks, installs, trials, paid, est_installs, est_trials, est_paid, revenue_cents, posts_live, new_posts, new_submissions, approvals, creator_pay_cents, fee_cents.
- **Cross-references** `apps`; **referenced by** none.
- **Notes** One row per app per day from the app's connected_at to now; equals the sum of post daily rows (M-04) plus pay and fee columns from the ledger.

#### conversions.json

- **Path** `packages/contract/fixtures/conversions.json`; **shape** array of Conversion; **owner** core; **rows** 3500 (min 2500, max 5000); **order** post, occurred_on.
- **Fields** (20, `?` = optional): id, post_id, link_id, app_id, bounty_id, creator_id, kind, source, confidence, quantity, occurred_on, first_at, revenue_cents, country?, status, payable, capped, cleared_at?, ledger_txn_id?, reject_reason?.
- **Cross-references** `apps`, `attribution_links`, `bounties`, `creators`, `posts`; **referenced by** `ledger`, `money_clock`, `revenuecat_events`.
- **Notes** Batches of (post, kind, source, day). About 74% tracked (link 52%, code 22%), mmp 12%, survey 8%, modelled 6%. Install 24 h, trial 72 h, paid 168 h clearing.

#### attribution_links.json

- **Path** `packages/contract/fixtures/attribution_links.json`; **shape** array of AttributionLink; **owner** core; **rows** 480 (min 430, max 520); **order** created_at.
- **Fields** (16, `?` = optional): id, creator_id, bounty_id, app_id, post_id?, code, short_url, deep_link, promo_code?, status, created_at, clicks, installs, trials, paid, last_click_at?.
- **Cross-references** `apps`, `bounties`, `creators`, `posts`; **referenced by** `conversions`, `offer_code_pool`, `posts`, `revenuecat_events`, `submissions`.
- **Notes** One per approved submission with a link (issued at approval). Counters equal the post funnel (M-09). Maya's: "maya-lumi7" etc. short_url joinflowd.io/r/<code>.

#### ads.json

- **Path** `packages/contract/fixtures/ads.json`; **shape** array of Ad; **owner** core; **rows** 8 (min 6, max 10); **order** started_at.
- **Fields** (32, `?` = optional): id, post_id, brand_id, app_id, bounty_id, creator_id, platform, kind, status, external_ad_id?, spark_code?, code_duration_days?, code_expires_at?, permission_requested_at, permission_granted_at?, started_at?, ended_at?, daily_budget_cents, spend_cents, impressions, clicks, installs, trials, paid, revenue_cents, commission_rate, commission_window_ends_at?, commission_cents, platform_fee_cents, daily, fatigue?, rights_ends_at?.
- **Cross-references** `apps`, `bounties`, `brands`, `creators`, `posts`; **referenced by** `fatigue_alerts`, `invoices`, `ledger`, `posts`, `rights_grants`.
- **Notes** Spark and partnership ads from winners; 2 live for Lumi (one fatigued), 1 paused, 2 ended, 1 expired, 1 requested, 1 authorised, 1 declined. Daily series length equals days live.


### Ext fixtures (everything else)

#### offers.json

- **Path** `packages/contract/fixtures/offers.json`; **shape** array of Offer; **owner** ext; **rows** 36 (min 28, max 44); **order** created_at.
- **Fields** (29, `?` = optional): id, kind, status, brand_id, app_id, creator_id, created_by_member_id, title, bounty_id?, rate_card_id?, rebuy_of_post_id?, amount_cents, original_amount_cents, ask_cents?, suggested?, take_rate, all_in_cents, deliverables, rights_card, turnaround_days, message, rounds, escrow_funded, thread, expires_at, created_at, updated_at, accepted_at?, closed_at?.
- **Cross-references** `apps`, `bounties`, `brand_members`, `brands`, `creators`, `posts`, `rate_cards`, `users`; **referenced by** `test_plans`, `threads`.
- **Notes** Invites 14, direct offers 16, re-buys 6; every OfferStatus. Maya: one awaiting_creator from Lumi, one mid-negotiation. Threads have 1 to 6 messages, rounds <= 3.

#### auctions.json

- **Path** `packages/contract/fixtures/auctions.json`; **shape** array of Auction; **owner** ext; **rows** 8 (min 6, max 10); **order** closes_at.
- **Fields** (20, `?` = optional): id, creator_id, title, description, status, slots, reserve_cents, deliverables, rights_card, opens_at, closes_at, art, bids, bids_count, clearing_price_cents?, winning_bid_ids?, resulting_bounty_ids?, awarded_at?, created_at, updated_at.
- **Cross-references** `bounties`, `brand_members`, `brands`, `creators`; **referenced by** none.
- **Notes** Platinum and Elite creators. 2 open, 1 scheduled, 3 awarded (second-price), 1 no_bids, 1 cancelled. Bids sealed in the data; clearing price = highest losing bid or the reserve.

#### specs.json

- **Path** `packages/contract/fixtures/specs.json`; **shape** array of Spec; **owner** ext; **rows** 30 (min 24, max 36); **order** created_at.
- **Fields** (33, `?` = optional): id, creator_id, title, description, status, source, art, video, format_id?, hook_text, hook_type, category, flow_band, flow_points, hook_band, hook_points, qa_pass, qa_warn, qa_fail, tags, price_cents, paid_ads_days, exclusive, rights_card, stats, licenses, source_submission_id?, source_bounty_id?, source_brand_id?, first_refusal_ends_at?, listed_at?, created_at, updated_at.
- **Cross-references** `bounties`, `brands`, `creators`, `submissions`; **referenced by** none.
- **Notes** 20 creator uploads and 10 released-from-bounty. Flow points >= 55 to be listed. 6 licensed; 1 inside first refusal.

#### rights_grants.json

- **Path** `packages/contract/fixtures/rights_grants.json`; **shape** array of RightsGrant; **owner** ext; **rows** 190 (min 140, max 240); **order** starts_at.
- **Fields** (25, `?` = optional): id, post_id, submission_id, bounty_id, brand_id, app_id, creator_id, scope, status, platform?, spark_code?, code_duration_days?, starts_at, ends_at?, base_fee_cents, renewal_pct_per_30d, renewal_price_cents, renewals, alerts_sent, ad_id?, ai_likeness, revoked_at?, revoke_reason?, created_at, updated_at.
- **Cross-references** `ads`, `apps`, `bounties`, `brand_members`, `brands`, `creators`, `posts`, `submissions`; **referenced by** none.
- **Notes** Paid-usage grants for approved posts on bounties with paid_ads_days > 0, Spark codes and partnership permissions for promoted posts, organic rows for Maya's posts. 6 expiring, alerts per days left; 2 renewals.

#### daily_drops.json

- **Path** `packages/contract/fixtures/daily_drops.json`; **shape** array of DailyDrop; **owner** ext; **rows** 35 (min 30, max 40); **order** date.
- **Fields** (11, `?` = optional): id, date, release_at, claim_window_ends_at, status, headline, items, spots_total, spots_left, claims_total, created_at.
- **Cross-references** `bounties`, `creators`; **referenced by** `bounty_saves`.
- **Notes** Day -31 to day +3: 31 past drops (sold_out or closed), today 2026-10-03 upcoming at 16:00Z, 3 future upcoming. Items reference real bounties with true spot arithmetic.

#### tournaments.json

- **Path** `packages/contract/fixtures/tournaments.json`; **shape** array of Tournament; **owner** ext; **rows** 8 (min 6, max 10); **order** starts_at.
- **Fields** (23, `?` = optional): id, title, tagline, description, status, format, art, sponsor_brand_id?, sponsor_label, prize_pool_cents, prizes, rounds, rules, min_tier?, niche?, bounty_id?, entries_count, announced_at, entries_open_at, starts_at, ends_at, winner_creator_ids?, created_at.
- **Cross-references** `bounties`, `brands`, `creators`, `tournament_entries`; **referenced by** `tournament_entries`.
- **Notes** 1 live bracket (round 2), 1 open, 1 announced, 3 complete with prizes paid as ledger prize rows, 1 judging, 1 cancelled. Sponsored by flowd or a brand.

#### tournament_entries.json

- **Path** `packages/contract/fixtures/tournament_entries.json`; **shape** array of TournamentEntry; **owner** ext; **rows** 120 (min 80, max 160); **order** tournament, seed.
- **Fields** (15, `?` = optional): id, tournament_id, creator_id, status, hook_text, submission_id?, thumb, hook_points, hook_band, seed, round_reached, placement?, prize_cents?, entered_at, updated_at.
- **Cross-references** `creators`, `submissions`, `tournaments`; **referenced by** `tournaments`.
- **Notes** About 24 entries per bracket tournament. entries_count on the tournament equals these rows.

#### crews.json

- **Path** `packages/contract/fixtures/crews.json`; **shape** array of Crew; **owner** ext; **rows** 8 (min 6, max 10); **order** week_rank.
- **Fields** (15, `?` = optional): id, name, tagline, art, niche, lead_creator_id, member_count, open, invite_code, weekly_goal_cents, week_cleared_cents, week_rank, bonus_earned_total_cents, lifetime_cleared_cents, created_at.
- **Cross-references** `creators`; **referenced by** `crew_members`.
- **Notes** Led by Gold+ creators; names and badge art are generated. Maya is a member of "Late Night Edits".

#### crew_members.json

- **Path** `packages/contract/fixtures/crew_members.json`; **shape** array of CrewMember; **owner** ext; **rows** 70 (min 40, max 100); **order** crew, role.
- **Fields** (7, `?` = optional): id, crew_id, creator_id, role, joined_at, week_cleared_cents, lifetime_cleared_cents.
- **Cross-references** `creators`, `crews`; **referenced by** none.
- **Notes** 3 to 20 per crew; member_count equals rows.

#### streaks.json

- **Path** `packages/contract/fixtures/streaks.json`; **shape** array of Streak; **owner** ext; **rows** 70 (min 60, max 90); **order** creator.
- **Fields** (16, `?` = optional): id, creator_id, status, current_weeks, best_weeks, freezes_banked, freezes_earned_total, freezes_used_total, rest_weeks_used_quarter, iso_week, posts_this_week, posted_this_week, week_ends_at, next_freeze_in_weeks, history, updated_at.
- **Cross-references** `creators`; **referenced by** none.
- **Notes** One per creator with at least one post. Maya: 6 weeks, 1 banked freeze. A few broken and resting examples.

#### leaderboards.json

- **Path** `packages/contract/fixtures/leaderboards.json`; **shape** array of Leaderboard; **owner** ext; **rows** 28 (min 20, max 40); **order** scope, tier, niche.
- **Fields** (13, `?` = optional): id, scope, iso_week, week_starts_at, reset_at, metric, tier?, niche?, label, cohort_size, promotion_zone_size, entries, updated_at.
- **Cross-references** `creators`; **referenced by** none.
- **Notes** Peer cohorts (about 30; merged for small tiers) including Silver · AI tools with Maya at rank 7; niche boards; global boards for earnings, conversion rate and score accuracy.

#### referrals.json

- **Path** `packages/contract/fixtures/referrals.json`; **shape** array of Referral; **owner** ext; **rows** 60 (min 40, max 80); **order** created_at.
- **Fields** (19, `?` = optional): id, kind, status, code, referrer_creator_id?, referrer_brand_id?, referee_creator_id?, referee_brand_id?, referee_label, channel, invited_at, joined_at?, first_dollar_at?, reward_window_ends_at?, reward_rate, reward_cap_cents, reward_earned_cents, created_at, updated_at.
- **Cross-references** `brands`, `creators`; **referenced by** none.
- **Notes** Single level. Maya referred 2 (one earning, one joined). 5 agency/brand referrals with 12-month windows.

#### lessons.json

- **Path** `packages/contract/fixtures/lessons.json`; **shape** array of Lesson; **owner** ext; **rows** 10 (min 10, max 10); **order** order.
- **Fields** (15, `?` = optional): id, slug, topic, order, title, summary, read_minutes, blocks, quiz, badge_label, badge_art, reliability_bonus_points, completions, avg_quiz_score, updated_at.
- **Cross-references** none; **referenced by** `lesson_progress`.
- **Notes** The ten Academy lessons (LessonTopic): hooks, brief and Rights Card, usage rights, contract red flags, platform rules, taxes, scams, rate cards, analytics, cadence. 5 minutes or less; three quiz questions each.

#### lesson_progress.json

- **Path** `packages/contract/fixtures/lesson_progress.json`; **shape** array of LessonProgress; **owner** ext; **rows** 260 (min 180, max 340); **order** creator, lesson.
- **Fields** (8, `?` = optional): id, creator_id, lesson_id, status, quiz_score?, started_at?, completed_at?, badge_awarded.
- **Cross-references** `creators`, `lessons`; **referenced by** none.
- **Notes** Maya: 6 completed, 1 in progress. 28 creators hold the Academy graduate badge.

#### trends.json

- **Path** `packages/contract/fixtures/trends.json`; **shape** array of Trend; **owner** ext; **rows** 18 (min 14, max 24); **order** direction, weekly_change_ratio.
- **Fields** (17, `?` = optional): id, kind, label, description, why_it_works, direction, weekly_change_ratio, sparkline, format_id?, hook_type?, categories, niches, sample_posts, sound_licensed_for_ads?, art, first_seen_at, updated_at.
- **Cross-references** none; **referenced by** none.
- **Notes** Rising, steady and fading formats, hooks, topics and sounds; sounds flagged not licensed for ads.

#### formats.json

- **Path** `packages/contract/fixtures/formats.json`; **shape** array of Format; **owner** ext; **rows** 11 (min 11, max 11); **order** rank.
- **Fields** (19, `?` = optional): id, name, summary, rank, mvp, beats, min_duration_s, max_duration_s, difficulty, faceless, best_for_categories, best_for_niches, hook_types, recommended_cta, example_script, shot_list, why_it_works, stats, art.
- **Cross-references** none; **referenced by** none.
- **Notes** Exactly one row per FormatId with full beat structure, shot list, example script and stats by category. First six flagged mvp.

#### hooks.json

- **Path** `packages/contract/fixtures/hooks.json`; **shape** array of Hook; **owner** ext; **rows** 84 (min 70, max 100); **order** hook_type, id.
- **Fields** (8, `?` = optional): id, hook_type, template, fill_slots, applies_to, examples, when_to_use, stats.
- **Cross-references** none; **referenced by** none.
- **Notes** 7 hook types, 10 to 14 each, with category examples and stats.

#### tier_history.json

- **Path** `packages/contract/fixtures/tier_history.json`; **shape** array of TierEvent; **owner** ext; **rows** 110 (min 80, max 150); **order** at.
- **Fields** (9, `?` = optional): id, creator_id, kind, from_tier?, to_tier, basis, at, stats, note.
- **Cross-references** `creators`; **referenced by** none.
- **Notes** Promotions and grants for every non-bronze creator; Maya: Bronze to Silver on 2026-08-29; one grace-hold started and one cleared; carry-over entries for founding creators.

#### wrapped.json

- **Path** `packages/contract/fixtures/wrapped.json`; **shape** array of Wrapped; **owner** ext; **rows** 6 (min 4, max 8); **order** creator, period_start.
- **Fields** (20, `?` = optional): id, creator_id, period, label, period_start, period_end, total_cleared_cents, views_total, posts_count, trials_total, best_post_id?, best_hook_text?, best_hook_type?, top_brand_id?, streak_weeks, tier, tier_median_cents, cards, proof_id?, created_at.
- **Cross-references** `brands`, `creators`, `posts`, `proofs`; **referenced by** none.
- **Notes** Maya: September 2026 and August 2026 monthly recaps; two other creators.

#### proofs.json

- **Path** `packages/contract/fixtures/proofs.json`; **shape** array of Proof; **owner** ext; **rows** 120 (min 90, max 160); **order** created_at.
- **Fields** (20, `?` = optional): id, kind, creator_id, handle, anonymous, payout_id?, period_label, period_start, period_end, amount_cents, tier, posts_count, typical_median_cents, typical_p25_cents, typical_p75_cents, ledger_hash, art, revoked, page_views, created_at.
- **Cross-references** `creators`, `payouts`; **referenced by** `wrapped`.
- **Notes** Public proof pages for payouts, months and tier-ups. 8 revoked; 12 anonymised. Maya has 5.

#### bounty_saves.json

- **Path** `packages/contract/fixtures/bounty_saves.json`; **shape** array of BountySave; **owner** ext; **rows** 90 (min 60, max 130); **order** creator, saved_at.
- **Fields** (9, `?` = optional): id, creator_id, bounty_id, stage, saved_at, claimed_until?, drop_id?, submission_id?, updated_at.
- **Cross-references** `bounties`, `creators`, `daily_drops`, `submissions`; **referenced by** none.
- **Notes** Maya: 5 saved, 2 joined (one a Daily Drop claim with 24 h expiry).

#### wellbeing_settings.json

- **Path** `packages/contract/fixtures/wellbeing_settings.json`; **shape** array of WellbeingSettings; **owner** ext; **rows** 12 (min 8, max 20); **order** creator.
- **Fields** (11, `?` = optional): id, creator_id, enabled, quiet_hours, numbers_off, pace_goal, paused_until?, rest_weeks, leaderboard_opt_out, slack_mode, updated_at.
- **Cross-references** `creators`; **referenced by** none.
- **Notes** Maya has Wellbeing Mode enabled with default quiet hours 22:00 to 08:00; a few others use numbers-off or pause.

#### notification_prefs.json

- **Path** `packages/contract/fixtures/notification_prefs.json`; **shape** array of NotificationPrefs; **owner** ext; **rows** 6 (min 3, max 12); **order** user.
- **Fields** (9, `?` = optional): id, user_id, push, email_digest, categories, quiet_hours, batch_non_cash, drop_reminder, updated_at.
- **Cross-references** `users`; **referenced by** none.
- **Notes** Maya, Jordan, Sam and a few others.

#### waitlist.json

- **Path** `packages/contract/fixtures/waitlist.json`; **shape** one object; **owner** ext; **rows** 1 (min 1, max 1); **order** n/a.
- **Fields** (4, `?` = optional): totals, leaders, demo_position, demo_referrals.
- **Cross-references** none; **referenced by** none.
- **Notes** Totals (about 18,400 creators and 1,350 brands in the waitlist) and the top 25 referrers by handle.

#### state_of_app_ugc.json

- **Path** `packages/contract/fixtures/state_of_app_ugc.json`; **shape** one object; **owner** ext; **rows** 1 (min 1, max 1); **order** n/a.
- **Fields** (12, `?` = optional): quarter, quarters, published_at, title, settled_posts, total_views, total_paid_cents, categories, hooks, formats, methodology, caveats.
- **Cross-references** none; **referenced by** none.
- **Notes** Computed from the fixtures: clearing CPM and trial rates by category, hook-type and format leaderboards.

#### case_studies.json

- **Path** `packages/contract/fixtures/case_studies.json`; **shape** array of CaseStudy; **owner** ext; **rows** 6 (min 5, max 8); **order** published_at.
- **Fields** (12, `?` = optional): id, app_id, brand_id, title, summary, quote, quote_author, quote_role, metrics, art, fictional, published_at.
- **Cross-references** `apps`, `brands`; **referenced by** none.
- **Notes** Fictional apps and quotes, labelled fictional. Numbers consistent with the app's posts.

#### testimonials.json

- **Path** `packages/contract/fixtures/testimonials.json`; **shape** array of Testimonial; **owner** ext; **rows** 8 (min 6, max 10); **order** kind.
- **Fields** (11, `?` = optional): id, kind, quote, author, role, creator_id?, brand_id?, stat_label?, stat_value?, avatar, fictional.
- **Cross-references** `brands`, `creators`; **referenced by** none.
- **Notes** Fictional creators and brand people, labelled fictional.

#### changelog.json

- **Path** `packages/contract/fixtures/changelog.json`; **shape** array of ChangelogEntry; **owner** ext; **rows** 14 (min 10, max 20); **order** date desc.
- **Fields** (7, `?` = optional): id, date, title, body, tags, audience, version?.
- **Cross-references** none; **referenced by** none.
- **Notes** Shipping history leading to 2026-10-01.

#### feedback_notes.json

- **Path** `packages/contract/fixtures/feedback_notes.json`; **shape** array of FeedbackNote; **owner** ext; **rows** 260 (min 180, max 340); **order** submission, version, t_ms.
- **Fields** (16, `?` = optional): id, submission_id, bounty_id, creator_id, version, author_member_id, t_ms, t_end_ms?, category, severity, status, body, reason_code?, resolved_in_version?, resolved_at?, created_at.
- **Cross-references** `bounties`, `brand_members`, `creators`, `submissions`; **referenced by** none.
- **Notes** Timecoded notes on changes-requested and rejected versions; must-fix notes carry to the next version until resolved. Maya: 3 notes on her open revision.

#### disputes.json

- **Path** `packages/contract/fixtures/disputes.json`; **shape** array of Dispute; **owner** ext; **rows** 14 (min 10, max 20); **order** opened_at.
- **Fields** (28, `?` = optional): id, kind, status, opened_by, creator_id?, brand_id, bounty_id?, submission_id?, post_id?, payout_id?, rejection_reason_code?, range_from?, range_to?, reason, note, evidence, amount_in_dispute_cents, events, opened_at, reply_due_at, first_reply_at?, resolution_due_at, resolved_at?, outcome?, outcome_text?, adjustment_cents?, assigned_admin_user_id?, updated_at.
- **Cross-references** `bounties`, `brands`, `creators`, `payouts`, `posts`, `submissions`, `users`; **referenced by** none.
- **Notes** Every DisputeKind and status. Maya: one open view_count. 3 rejection appeals (one overturned). Reply within 24 h on resolved ones.

#### scam_reports.json

- **Path** `packages/contract/fixtures/scam_reports.json`; **shape** array of ScamReport; **owner** ext; **rows** 22 (min 16, max 28); **order** created_at.
- **Fields** (17, `?` = optional): id, case_id, reporter_kind, reporter_creator_id?, reporter_brand_id?, target_kind, target_id, reason, description, evidence_refs, status, created_at, sla_due_at, triaged_at?, resolved_at?, action_taken?, assigned_admin_user_id?.
- **Cross-references** `brands`, `creators`, `users`; **referenced by** none.
- **Notes** Every ScamReason; pay-to-join and off-platform-chat most common. 6 new, 5 triaged, 5 confirmed, 4 actioned, 2 dismissed.

#### fraud_flags.json

- **Path** `packages/contract/fixtures/fraud_flags.json`; **shape** array of FraudFlag; **owner** ext; **rows** 18 (min 12, max 24); **order** opened_at.
- **Fields** (22, `?` = optional): id, post_id, creator_id, brand_id, bounty_id, status, score, band, signals, curve_shape, curve, money_at_stake_cents, hold_placed, duplicate_of_post_id?, audience_us_ratio, account_age_days, opened_at, sla_due_at, reviewed_at?, reviewed_by_user_id?, decision_note?, invalid_views?.
- **Cross-references** `bounties`, `brands`, `creators`, `posts`, `users`; **referenced by** none.
- **Notes** 6 open (scores 41..78), 2 monitoring, 2 cleared, 3 confirmed (clawed back). Envelope arrays have 72 values.

#### verifications.json

- **Path** `packages/contract/fixtures/verifications.json`; **shape** array of Verification; **owner** ext; **rows** 40 (min 30, max 55); **order** submitted_at.
- **Fields** (15, `?` = optional): id, subject_kind, creator_id?, brand_id?, kind, status, provider, documents, submitted_at, sla_due_at, decided_at?, decided_by_user_id?, reason?, note?, blocks_payout.
- **Cross-references** `brands`, `creators`, `users`; **referenced by** none.
- **Notes** Creator ID and age, brand business, tax, payout method; 8 pending, 3 needs_info, 2 rejected.

#### tax_profiles.json

- **Path** `packages/contract/fixtures/tax_profiles.json`; **shape** array of TaxProfile; **owner** ext; **rows** 72 (min 55, max 90); **order** creator.
- **Fields** (22, `?` = optional): id, creator_id, status, form?, legal_name?, entity_type?, tin_last4?, address?, country, tax_year, ytd_cleared_cents, ytd_paid_cents, threshold_cents, threshold_progress, form_1099_required, set_aside_rate, set_aside_cents, requested_at?, submitted_at?, verified_at?, expires_at?, updated_at.
- **Cross-references** `creators`; **referenced by** none.
- **Notes** One per creator with at least one approval. Maya: W-9 verified, YTD cleared and paid, threshold progress 0.78 (paid), set-aside 25%. A few requested and one W-8BEN.

#### tax_docs.json

- **Path** `packages/contract/fixtures/tax_docs.json`; **shape** array of TaxDoc; **owner** ext; **rows** 80 (min 55, max 110); **order** creator, kind.
- **Fields** (9, `?` = optional): id, creator_id, kind, status, tax_year, amount_cents?, file_ref, created_at, issued_at?.
- **Cross-references** `creators`; **referenced by** none.
- **Notes** Collected W-9 / W-8BEN per profile; no 1099-NEC issued yet (tax year 2026 is in progress).

#### compliance_checks.json

- **Path** `packages/contract/fixtures/compliance_checks.json`; **shape** array of ComplianceAudit; **owner** ext; **rows** 420 (min 390, max 450); **order** checked_at.
- **Fields** (13, `?` = optional): id, post_id, submission_id, bounty_id, brand_id, creator_id, checks, overall, blocks_settlement, checked_at, waived_by_member_id?, waive_reason?, fixed_at?.
- **Cross-references** `bounties`, `brand_members`, `brands`, `creators`, `posts`, `submissions`; **referenced by** none.
- **Notes** One per post, 8 checks each. 6 failures (4 fixed, 1 waived with a reason, 1 blocking), 20 warnings.

#### payout_runs.json

- **Path** `packages/contract/fixtures/payout_runs.json`; **shape** array of PayoutRun; **owner** ext; **rows** 14 (min 14, max 14); **order** run_date.
- **Fields** (15, `?` = optional): id, run_date, scheduled_for, status, payouts_count, total_gross_cents, total_fee_cents, total_net_cents, paid_count, failed_count, held_count, held_cents, holds, initiated_at?, completed_at?.
- **Cross-references** none; **referenced by** none.
- **Notes** Fridays 2026-07-10 to 2026-10-02 (13 complete) plus the scheduled run 2026-10-09 with holds preview.

#### notifications.json

- **Path** `packages/contract/fixtures/notifications.json`; **shape** array of Notification; **owner** ext; **rows** 260 (min 160, max 360); **order** recipient, created_at.
- **Fields** (15, `?` = optional): id, recipient_user_id, audience, kind, priority, title, body, amount_cents?, deep_link, ref_kind?, ref_id?, batched, created_at, delivered_at?, read_at?.
- **Cross-references** `users`; **referenced by** none.
- **Notes** Maya about 60 (cash events, decisions, drop, offers), Jordan about 30, Sam about 15, others sparse. Cash events carry amount_cents; batched ones inside quiet hours.

#### integrations.json

- **Path** `packages/contract/fixtures/integrations.json`; **shape** array of Integration; **owner** ext; **rows** 38 (min 28, max 48); **order** brand, kind.
- **Fields** (16, `?` = optional): id, brand_id, app_id?, kind, status, label, scopes, config, webhook_url?, secret_last4?, coverage_ratio?, events_24h, health_note, connected_at?, last_sync_at?, last_event_at?.
- **Cross-references** `apps`, `brands`; **referenced by** none.
- **Notes** RevenueCat for most apps, Slack for Pro and Scale, MMPs for a few, one with needs_attention (stale sync), one error.

#### api_keys.json

- **Path** `packages/contract/fixtures/api_keys.json`; **shape** array of ApiKey; **owner** ext; **rows** 10 (min 6, max 14); **order** created_at.
- **Fields** (14, `?` = optional): id, brand_id, name, mode, scopes, prefix, last4, created_by_member_id, rate_limit_per_minute, requests_30d, created_at, last_used_at?, expires_at?, revoked_at?.
- **Cross-references** `brand_members`, `brands`; **referenced by** none.
- **Notes** Pro and Scale brands only; Lumi has one live read+write and one test key. One revoked.

#### webhooks.json

- **Path** `packages/contract/fixtures/webhooks.json`; **shape** array of Webhook; **owner** ext; **rows** 8 (min 5, max 12); **order** created_at.
- **Fields** (10, `?` = optional): id, brand_id, url, events, status, secret_last4, failure_count, deliveries, created_at, last_success_at?.
- **Cross-references** `brands`; **referenced by** none.
- **Notes** Pro and Scale brands; Lumi has two; one failing with retries.

#### activity_log.json

- **Path** `packages/contract/fixtures/activity_log.json`; **shape** array of ActivityEntry; **owner** ext; **rows** 160 (min 100, max 220); **order** at.
- **Fields** (9, `?` = optional): id, brand_id, actor_member_id?, action, summary, target_kind?, target_id?, metadata, at.
- **Cross-references** `brand_members`, `brands`; **referenced by** none.
- **Notes** Team activity for Lumi (about 60) and the others; Jordan's actions dominate.

#### auto_approve_rules.json

- **Path** `packages/contract/fixtures/auto_approve_rules.json`; **shape** array of AutoApproveRule; **owner** ext; **rows** 6 (min 4, max 8); **order** created_at.
- **Fields** (17, `?` = optional): id, brand_id, name, status, conditions, scope, guardrails, timeout_policy, dry_run?, stats, audit, created_by_member_id, created_at, updated_at, enabled_at?, killed_at?, kill_reason?.
- **Cross-references** `bounties`, `brand_members`, `brands`; **referenced by** none.
- **Notes** Lumi: one active (dry run would approve 31 of 50), one killed. Others draft, dry_run, paused.

#### test_plans.json

- **Path** `packages/contract/fixtures/test_plans.json`; **shape** array of TestPlan; **owner** ext; **rows** 4 (min 3, max 6); **order** created_at.
- **Fields** (19, `?` = optional): id, brand_id, app_id, name, status, spend_tier, budget_cents, hooks, bodies, ctas, cells, bounty_ids, offer_ids, winner_cell_id?, lift_ratio?, confidence?, caution, created_at, updated_at.
- **Cross-references** `apps`, `bounties`, `brands`, `offers`, `posts`, `submissions`; **referenced by** none.
- **Notes** Lumi: a running 3 hooks x 2 bodies x 2 CTAs plan with partial results and a small-sample caution.

#### fatigue_alerts.json

- **Path** `packages/contract/fixtures/fatigue_alerts.json`; **shape** array of FatigueAlert; **owner** ext; **rows** 5 (min 3, max 7); **order** detected_at.
- **Fields** (18, `?` = optional): id, brand_id, app_id, bounty_id, post_id, ad_id?, creator_id, metric, status, peak_value, current_value, drop_ratio, peak_on, series, message, detected_at, acknowledged_at?, refresh_bounty_id?.
- **Cross-references** `ads`, `apps`, `bounties`, `brands`, `creators`, `posts`; **referenced by** none.
- **Notes** Lumi: one open on the fatigued ad (trial rate down 34%).

#### audit_reports.json

- **Path** `packages/contract/fixtures/audit_reports.json`; **shape** array of AuditReport; **owner** ext; **rows** 8 (min 6, max 10); **order** generated_at.
- **Fields** (22, `?` = optional): id, slug, app_name, tagline, category, store_url, icon, og_art, brief, hooks, suggested_format_ids, predicted_cpm_cents, expected_views_per_post, expected_cost_per_trial_cents, confidence, price_curve, creators_ready, assumptions, created_by, claimed_by_brand_id?, page_views, generated_at.
- **Cross-references** `brands`, `creators`, `posts`; **referenced by** none.
- **Notes** Public App UGC Audits; exactly 10 hooks each; price curve of 6 points.

#### flo_suggestions.json

- **Path** `packages/contract/fixtures/flo_suggestions.json`; **shape** array of FloSuggestion; **owner** ext; **rows** 60 (min 40, max 90); **order** created_at.
- **Fields** (15, `?` = optional): id, surface, kind, creator_id?, brand_id?, context_kind?, context_id?, prompt, title, outputs, actions, model, latency_ms, helpful?, created_at.
- **Cross-references** `brands`, `creators`; **referenced by** none.
- **Notes** Maya: scripts, hook rewrites, TL;DRs and captions; Jordan: bounty drafts. Mock engine outputs.

#### ml_models.json

- **Path** `packages/contract/fixtures/ml_models.json`; **shape** array of MlModel; **owner** ext; **rows** 8 (min 8, max 8); **order** kind.
- **Fields** (15, `?` = optional): id, kind, name, version, stage, description, trained_on_n, metrics, calibration, drift_score, jobs, tag_coverage, learned_ready_at_posts, last_run_at, updated_at.
- **Cross-references** none; **referenced by** none.
- **Notes** One per ModelKind; heuristic stage for the day-one models; calibration for the creative scorer.

#### admin_metrics.json

- **Path** `packages/contract/fixtures/admin_metrics.json`; **shape** one object; **owner** ext; **rows** 1 (min 1, max 1); **order** n/a.
- **Fields** (8, `?` = optional): as_of, targets, market_health, queues, next_payout_run, summary, promise_metrics, alerts.
- **Cross-references** none; **referenced by** none.
- **Notes** Six targets with trend series ending now (TARGET_STORY), market health, queue counts that equal the real queues, the Friday run preview, and the 11 Promise proof metrics.

#### threads.json

- **Path** `packages/contract/fixtures/threads.json`; **shape** array of ChatThread; **owner** ext; **rows** 60 (min 40, max 90); **order** last_message_at.
- **Fields** (14, `?` = optional): id, kind, title, creator_id?, brand_id?, offer_id?, submission_id?, bounty_id?, messages, unread_creator, unread_brand, rate_limited, last_message_at, created_at.
- **Cross-references** `bounties`, `brands`, `creators`, `offers`, `submissions`, `users`; **referenced by** none.
- **Notes** Offer, submission, bounty and support threads; in-app only; Scam Shield warnings on 4 messages; Maya has 9 threads.

#### revenuecat_events.json

- **Path** `packages/contract/fixtures/revenuecat_events.json`; **shape** array of RevenueCatEvent; **owner** ext; **rows** 1600 (min 1000, max 2200); **order** received_at.
- **Fields** (20, `?` = optional): id, app_id, event_type, period_type, app_user_id, product_id, price_cents, currency, is_trial_conversion, offer_code?, subscriber_attributes, environment, purchased_at, expiration_at?, received_at, match_status, matched_conversion_id?, matched_link_id?, matched_creator_id?, idempotency_key.
- **Cross-references** `apps`, `attribution_links`, `conversions`, `creators`; **referenced by** none.
- **Notes** One or more per tracked trial and paid conversion plus renewals and cancellations; 90% matched, 6% unmatched, 3% duplicates, 1% ignored.

#### offer_code_pool.json

- **Path** `packages/contract/fixtures/offer_code_pool.json`; **shape** array of OfferCode; **owner** ext; **rows** 90 (min 60, max 120); **order** app, sku.
- **Fields** (16, `?` = optional): id, app_id, sku, offer_name, code, status, assigned_creator_id?, assigned_bounty_id?, assigned_link_id?, assigned_at?, redemptions, max_redemptions, valid_from, valid_until, rotation_due_at?, created_at.
- **Cross-references** `apps`, `attribution_links`, `bounties`, `creators`; **referenced by** none.
- **Notes** At most 10 active codes per (app, sku). Lumi: 8 active on lumi_pro_annual. Codes rotate; some exhausted or expired.

#### brand_lists.json

- **Path** `packages/contract/fixtures/brand_lists.json`; **shape** array of BrandList; **owner** ext; **rows** 12 (min 8, max 18); **order** brand.
- **Fields** (8, `?` = optional): id, brand_id, name, is_favourites, members, created_by_member_id, created_at, updated_at.
- **Cross-references** `brand_members`, `brands`, `creators`; **referenced by** none.
- **Notes** Favourites and custom lists with notes and tags; Lumi has "Favourites" and "AI-tools hooks".
<!-- /GENERATED:fixtures -->

---

## 15. Reconciliation invariants and scenarios

<!-- GENERATED:invariants -->
The validator `packages/contract/scripts/validate-fixtures.mjs` enforces every invariant marked `base`; invariants marked `fixture` are enforced by the fixture agents (extend the validator when the data exists). `--strict` turns warnings into errors.

#### Structure

| Id | Enforced | Invariant |
|---|---|---|
| `S-01` | base | Every row has every required field, with the declared type; enum values are members of their enum; optional fields are omitted, never null. |
| `S-02` | base | ids are unique per table and carry the entity prefix; composite keys are unique. |
| `S-03` | base | Every ref resolves to a row of the referenced table. |
| `S-04` | base | Timestamps are ISO-8601 UTC seconds with a trailing Z; dates are YYYY-MM-DD; money is an integer number of cents; ratios are within 0..1. |
| `S-05` | base | No event timestamp is later than now (2026-10-03T14:00:00Z). Only schedule and ETA fields may be in the future. |
| `S-06` | base | No remote image or real brand URL appears anywhere: urls end in joinflowd.io, .example or a platform domain (text only); art is always an ArtSeed. |
| `S-07` | base | World counts equal the actual row counts; personas resolve. |

#### Ledger

| Id | Enforced | Invariant |
|---|---|---|
| `L-01` | base | Every ledger txn_id nets to exactly 0 (signed amounts). |
| `L-02` | base | wallet:br_x balance in the ledger equals brands.wallet_balance_cents. |
| `L-03` | base | Per bounty: escrow_funded_cents = reserved_cents + spent_cents + remaining_cents + refunded_cents, all non-negative. |
| `L-04` | base | Per bounty: the ledger balance of escrow:bnty_x equals reserved_cents + remaining_cents (money not yet spent or refunded). |
| `L-05` | base | bounty.funded is true iff escrow_funded_cents >= budget_cents + fee_reserve_cents; scheduled, live, paused, filled, ended and settled bounties are funded; draft and awaiting_funding are not. |
| `L-06` | base | bounty.reserved_cents equals the sum of reserved_cents of its submissions. |
| `L-07` | base | A settled bounty has reserved_cents 0, remaining_cents 0 and refunded_cents + spent_cents = escrow_funded_cents. |
| `L-08` | base | bounty.spent_cents equals the escrow debits of types cpm, cpa, flat_fee and fee (negated). |
| `L-09` | base | creator.lifetime_cleared_cents = carry_over.cleared_cents + sum of the creator's earning rows with status cleared or paid. |
| `L-10` | base | Earning rows with status paid have a payout_id; payouts: gross = sum of included earning rows, net = gross - fee, fee follows the instant formula; weekly fee 0. |
| `L-11` | base | Every cpm / cpa / flat_fee settlement transaction has a fee leg equal to round(pay x take_rate) of its bounty (0 for waived first bounties). |
| `L-12` | base | A post's settled pool pay (cpm + cpa) never exceeds the bounty per_video_cap_cents. |
| `L-13` | base | CPA ledger rows exist only for conversions with source link or code (payable) and status cleared. |
| `L-14` | base | Ads: spend = sum of daily spend; commission = round(rate x revenue inside the 60-day window); platform fee = round(1% x spend). |
| `L-15` | base | Invoices: total = subtotal + processing + tax; paid funding invoices link to an escrow_fund or wallet_topup transaction. |
| `L-16` | base | payout_runs totals equal the payouts carrying their run_id; money_clock sums per creator equal the wallet figures (pending, cleared, paid). |
| `L-17` | base | Platform ledger accounts never go negative, except platform:promo and platform:matching (treasury accounts funded outside the ledger) and external:* (the outside world). |
| `L-18` | base | A post's earnings total (cpm + cpa + commission + flat) equals its creator ledger rows plus its pending, accruing and held Money Clock rows (removed posts earn nothing). |

#### Metrics

| Id | Enforced | Invariant |
|---|---|---|
| `M-01` | base | posts.views equals the sum of post_metrics_daily.views; likes, comments, shares and saves likewise. |
| `M-02` | base | post.funnel clicks, installs, trials, paid and est_* equal the sums of post_metrics_daily; funnel.views = post.views. |
| `M-03` | base | bounty.funnel equals the sum of its posts' funnels; bounty.counts equal counts of its submissions and posts. |
| `M-04` | base | app_metrics_daily rows equal the sum of the app's posts' daily rows for that date. |
| `M-05` | base | post_metrics_hourly: for every full UTC day covered, the hourly sums equal the daily row; hourly rows exist only for posts posted since 2026-09-30. |
| `M-06` | base | view_snapshots: views_verified non-decreasing per post; delta_verified = difference; the snapshot at window_ends_at equals post.window_views; the last snapshot <= post.views. |
| `M-07` | base | Tracked funnel is monotonic per post, bounty and app: views >= clicks >= installs >= trials >= paid. Estimated counts are separate. |
| `M-08` | base | Conversion batches: sums of quantity by (post, kind) for deterministic sources equal the post funnel; payable only for link and code; confidence follows the source. |
| `M-09` | base | attribution_links counters equal the post funnel; promo codes are unique per app. |
| `M-10` | fixture | market_series: p25 <= clearing <= p75 per day; one row per (category, date) for the 91 days to now. |

#### State

| Id | Enforced | Invariant |
|---|---|---|
| `T-01` | base | post.window_ends_at = posted_at + 72 h; status live iff posted within the last 72 h (and not removed); window_closed within 12 h after; cleared and paid only after the clearing run. |
| `T-02` | base | Submission: version = versions.length; sla_state follows the hours in queue; sla_due_at = version submitted_at + 72 h; rejected has a decision with reason_code and evidence; posted has post_id; reserved_cents is 0 once rejected, withdrawn, expired, released or posted. |
| `T-03` | base | creator.tier equals tierFor(stats) unless tier_basis is grace_hold (then tier_hold_until is set and in the future); approval_rate = round(approved / decided, 2); elite creators have tier_review. |
| `T-04` | base | creator_reputation and brand_scorecards scores recompute from their components with the FORMULAS weights. |
| `T-05` | base | post.fraud.score = min(100, sum of signal points) with points <= max_points; band matches; score >= 40 posts that passed window_closed are held or have a resolved flag. |
| `T-06` | base | money_clock: accruing, pending and cleared rows have eta_at; every non-final row has a reason from MoneyClockReason; no bare pending. |
| `T-07` | base | streaks: current_weeks equals creators.streak_weeks; freezes_banked <= 2; history ends at the current ISO week. |
| `T-08` | base | leaderboards: ranks contiguous from 1; cohort_size = entries.length; promotion zone only on cohort boards. |
| `T-09` | base | offers: rounds <= 3; expires_at = last activity + 7 days; thread ordered by time; accepted offers have escrow_funded and a bounty_id. |
| `T-10` | base | daily_drops: spots_left = spots_total - claims; today's drop is upcoming; claims are unique per creator and item. |
| `T-11` | base | rights_grants: ends_at = starts_at + term; alerts_sent consistent with days left; ads stop at rights end. |
| `T-12` | base | offer_code_pool: at most 10 active (available or assigned) codes per (app, sku); codes unique per app. |
| `T-13` | base | formats has exactly 11 rows (one per FormatId); hooks has at least 10 per HookType; lessons has exactly 10 with three quiz questions each. |
| `T-14` | base | admin_metrics.queues equal the open counts in fraud_flags, disputes, verifications, scam_reports and the submission SLA states. |

#### Ext fixtures

| Id | Enforced | Invariant |
|---|---|---|
| `E-01` | base | Academy: one lesson_progress row per (creator, lesson); completed rows carry quiz_score >= 0.66, completed_at and badge_awarded; lessons.completions equals the completed rows; the Academy bonus on creator_reputation is 0.5 per completed lesson (warning). |
| `E-02` | base | Tax Desk: ytd cleared and paid equal the ledger; set-aside = round(ytd cleared x rate); threshold progress = paid / $2,000; the form follows the country; no 1099-NEC is issued while the tax year runs. |
| `E-03` | base | Compliance and fraud: one audit per post with every check type; overall follows the checks; blocks_settlement = failed and not fixed or waived; every post scoring 40 or more has a fraud flag with the post's score, a 72-hour envelope and a 24-hour SLA. |
| `E-04` | base | Growth: crews have 3 to 20 members, a Gold-or-above lead and member sums; tournament entries, prizes and winners add up; referrals follow CONSTANTS; proofs match their payouts and ticker events; Wrapped totals equal the ledger; tier history stats meet the tier and climb one tier at a time. |
| `E-05` | base | Platform: matched RevenueCat events point at link or code conversions, other events carry no match ids, duplicates share their original's idempotency key; offer codes, API keys, webhooks, auto-approve rules (dry run first, 10% spot-check), test plans, fatigue alerts (30% drop), audit reports and the activity log are internally consistent. |
| `E-06` | base | State of App UGC: nine categories, seven hook types, eleven formats; hook shares add up to 1. |
| `E-07` | base | Trust queues: dispute reply and resolution SLAs, scam-report case ids and 24-hour SLA, verification SLA and reasons, feedback notes inside the video and resolved only by a later version. |
| `E-08` | base | Notifications: the audience matches the recipient, creator links are flowd:// and web links are routes, cash events carry amounts and are never batched, delivery and read times are ordered. |
| `E-09` | base | Maya (ext): streak, academy count, Tax Desk, Wellbeing Mode, cohort rank, saved bounties, proofs, Wrapped, threads, notifications and open feedback notes match her persona story. |

#### Personas

| Id | Enforced | Invariant |
|---|---|---|
| `P-01` | base | Maya's numbers equal PERSONA_FACTS.maya (tier, $1,640 cleared, 21 approved, 78% approval, 3 live posts, $212.00 pending, $86.00 cleared unpaid, streak 6). |
| `P-02` | base | Lumi is on Pro with Jordan Ellis as owner and at least six bounties; the admin user exists. |

#### Scale

| Id | Enforced | Invariant |
|---|---|---|
| `Z-01` | base | Row counts are within the min and max of the fixture catalogue. |
| `Z-02` | base | Creator tier distribution is within one creator of TIER_DISTRIBUTION per tier. |
| `Z-03` | base | Every enum value marked for coverage appears at least once in the fixtures (warning; error with --strict). |
| `Z-04` | base | Every SCENARIOS entry that has an automated checker is met (warning; error with --strict); the rest are listed as notes for manual verification. |
<!-- /GENERATED:invariants -->

---

## 16. API surface

For the backend agent (`openapi.yaml`) and the mock API (`apps/web/src/app/api/v1`). Resources are the fixture entities; verbs are listed per group.

<!-- GENERATED:api -->
- **Auth.** Bearer session token (demo: POST /auth/demo-login). Roles: public, creator, brand (a brand_member, scoped to their workspace by role), admin. API keys (fd_live_ / fd_test_) act as a brand with scopes read, write, financial; writes made with an API key are drafts by default and money movements need the financial scope.
- **Money and time.** Money is integer cents with a _cents suffix; rates are cpm_cents; ratios are 0..1; timestamps are ISO-8601 UTC with Z; dates YYYY-MM-DD. Every response that shows an earning includes its state, eta_at and reason (Money Clock). No endpoint returns formatted money.
- **Pagination and filters.** Cursor pagination: ?limit= (default 50, max 200) & ?cursor=; responses are { data: [...], next_cursor, total? }. Filters are plain query params named after fields (?status=live&app_id=...&q=...). Sort with ?sort=-created_at. ?expand= takes a comma list of ref fields to inline (e.g. expand=app,brand).
- **Idempotency.** Every POST that moves money or creates a settlement artefact (fund, top-up, decision, payout, accept, claim, webhook ingest) accepts an Idempotency-Key header; repeated keys return the original response. Webhook ingest is idempotent on the RevenueCat event id.
- **Errors.** Non-2xx responses are { code, message, hint } with a stable snake_case code. Common: validation_failed (422), reason_required (422), not_found (404), forbidden (403), tier_locked (403), bounty_not_funded (409), pool_exhausted (409), sla_not_started (409), revision_limit (409), appeal_used (409), below_minimum (422), method_missing (409), tax_info_missing (409), identity_check_required (409), idempotency_conflict (409), rate_limited (429), conflict (409).
- **Demo mode.** The mock API is an in-memory singleton seeded from the fixtures. POST /admin/demo/advance moves the demo clock (24 h / 72 h) and runs window close, fraud check, clearing and the Friday payout when due; POST /admin/demo/reset restores the seed. Responses carry header X-Flowd-Demo: 1.
- **Webhooks (outbound).** Signed with HMAC-SHA256 in the X-Flowd-Signature header (t=<unix>,v1=<hex>); events are WebhookEventType; deliveries retry with exponential backoff and are listed in the endpoint's deliveries.


235 endpoints in 18 groups. Roles: `public`, `creator`, `brand`, `admin`, `any` (signed in). Response names that are not fixture entities (Session, Funnel, PriceQuote, FeedItem, ReviewItem, ViewLedger, Wallet, PayoutPreview, LinkResolution, AttributionHealth, ...) are API read-models composed from entities; openapi.yaml defines them. They never add new money fields: every amount is reproducible from the entities.

#### Session

Demo role switching and the world manifest.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/demo-login` | public | Start a demo session as creator, brand or admin. | Session |  |
| POST | `/api/v1/auth/logout` | any | End the session. | 204 |  |
| GET | `/api/v1/me` | any | The signed-in user with role, persona ids and demo flag. | Session |  |
| GET | `/api/v1/world` | any | World manifest: now, personas, row counts. | World |  |
| GET | `/api/v1/health` | public | Liveness and demo clock. | Health |  |
| POST | `/api/v1/events` | any | Analytics events (rules in PRODUCT_SPEC section 10). | 202 |  |

#### Apps, brands and team

Workspaces, apps, members, roles, activity and CRM lists.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/apps` | brand | Apps in the workspace. | Page<App> |  |
| POST | `/api/v1/apps` | brand | Add an app (store URL -> metadata). | App | validation_failed |
| POST | `/api/v1/apps/lookup` | public | Resolve an App Store URL to mock metadata and a generated icon. | AppLookup | validation_failed |
| GET | `/api/v1/apps/{id}` | brand | App with attribution health. | App |  |
| PATCH | `/api/v1/apps/{id}` | brand | Update app metadata, MMP, defaults. | App |  |
| GET | `/api/v1/brands/{id}` | any | Brand profile (public fields for non-members). | Brand |  |
| PATCH | `/api/v1/brands/{id}` | brand | Update workspace profile, timeout policy, compliance defaults, billing profile. | Brand | forbidden |
| GET | `/api/v1/brands/{id}/scorecard` | any | Brand Scorecard (public). | BrandScorecard |  |
| GET | `/api/v1/brands/{id}/members` | brand | Members and roles. | Page<BrandMember> |  |
| POST | `/api/v1/brands/{id}/members` | brand | Invite a member (role) or create a client-approval link. | BrandMember | forbidden, validation_failed |
| PATCH | `/api/v1/brands/{id}/members/{memberId}` | brand | Change role. | BrandMember | forbidden |
| DELETE | `/api/v1/brands/{id}/members/{memberId}` | brand | Remove a member. | 204 | forbidden |
| GET | `/api/v1/brands/{id}/activity` | brand | Team activity log (filter by action, member; CSV with ?format=csv). | Page<ActivityEntry> |  |
| GET | `/api/v1/brands/{id}/lists` | brand | CRM lists. | Page<BrandList> |  |
| POST | `/api/v1/brands/{id}/lists` | brand | Create a list or add creators. | BrandList |  |
| PATCH | `/api/v1/brands/{id}/plan` | brand | Change plan (Free, Pro, Scale). | Brand | forbidden |

#### Bounties

Builder, lint, price, escrow and lifecycle.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/bounties` | any | List bounties (brand: own workspace; creator: visible to them). | Page<Bounty> |  |
| POST | `/api/v1/bounties` | brand | Create a draft bounty. | Bounty | validation_failed |
| GET | `/api/v1/bounties/{id}` | any | Bounty with brief, rights card, pay math, funded flag. | Bounty | not_found |
| PATCH | `/api/v1/bounties/{id}` | brand | Edit a draft or an allowed field of a live bounty (extend, caps). | Bounty | conflict |
| POST | `/api/v1/bounties/lint` | brand | Brief Lint a brief (same ruleset as the client). | BriefLint |  |
| POST | `/api/v1/bounties/price` | brand | Pay Math, funding breakdown, all-in CPM and price-vs-fill suggestion. | PriceQuote |  |
| POST | `/api/v1/bounties/draft` | brand | AI draft from an App Store link (graceful failure -> manual). | Bounty |  |
| POST | `/api/v1/bounties/{id}/publish` | brand | Publish: lint must pass; moves to awaiting_funding (or live if funded). | Bounty | validation_failed |
| POST | `/api/v1/bounties/{id}/fund` | brand | Fund escrow from the wallet (matched budget and fee waiver applied on the first bounty). | Bounty | below_minimum, idempotency_conflict |
| POST | `/api/v1/bounties/{id}/top-up` | brand | Add budget to a live bounty. | Bounty |  |
| POST | `/api/v1/bounties/{id}/pause` | brand | Pause (existing work continues). | Bounty |  |
| POST | `/api/v1/bounties/{id}/resume` | brand | Resume. | Bounty |  |
| POST | `/api/v1/bounties/{id}/close` | brand | End now; settlement follows when windows close. | Bounty |  |
| POST | `/api/v1/bounties/{id}/cancel` | brand | Cancel (only with zero approved submissions); escrow refunded. | Bounty | conflict |
| POST | `/api/v1/bounties/{id}/feature` | brand | Pin to the top of the feed (flat weekly fee). | Bounty |  |
| GET | `/api/v1/bounties/{id}/funnel` | brand | Views to paid funnel, per creator and per video, tracked vs estimated. | Funnel |  |
| GET | `/api/v1/bounties/{id}/creators` | brand | Creators on the bounty with results. | Page<CreatorResult> |  |

#### Feed, Daily Drop and saves

Creator discovery.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/feed` | creator | Ranked bounty feed with match score, expected earnings and gates. | Page<FeedItem> |  |
| GET | `/api/v1/drops/today` | creator | Today's Daily Drop (upcoming, live or sold out) with true spots. | DailyDrop |  |
| GET | `/api/v1/drops/{id}` | creator | A drop. | DailyDrop |  |
| POST | `/api/v1/drops/{id}/claim` | creator | Claim a spot (24 h reservation to submit). | BountySave | tier_locked, pool_exhausted, idempotency_conflict |
| GET | `/api/v1/saves` | creator | Saved, joined and submitted bounties. | Page<BountySave> |  |
| PUT | `/api/v1/saves/{bountyId}` | creator | Save or join a bounty. | BountySave |  |
| DELETE | `/api/v1/saves/{bountyId}` | creator | Unsave. | 204 |  |

#### Submissions and review

Versioned submissions, timecoded feedback, decisions, appeals, auto-approve.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/submissions` | any | Creator: own; brand: for the workspace. | Page<Submission> |  |
| POST | `/api/v1/submissions` | creator | Submit (creates v1, takes a Reserved Slot). | Submission | pool_exhausted, tier_locked, validation_failed |
| POST | `/api/v1/uploads` | creator | Start a resumable upload (returns upload URL and asset id). | UploadSession |  |
| GET | `/api/v1/submissions/{id}` | any | Submission with versions, decision and notes. | Submission |  |
| GET | `/api/v1/submissions/{id}/analysis` | any | Video analysis of a version (?version=). | VideoAnalysis |  |
| GET | `/api/v1/submissions/{id}/notes` | any | Timecoded feedback notes. | Page<FeedbackNote> |  |
| POST | `/api/v1/submissions/{id}/feedback` | brand | Add a timecoded note (category, severity). | FeedbackNote |  |
| PATCH | `/api/v1/feedback/{id}` | any | Resolve (creator) or dismiss (brand) a note. | FeedbackNote |  |
| POST | `/api/v1/submissions/{id}/decision` | brand | Approve, request changes or reject. Rejection needs reason_code and evidence. | Submission | reason_required, revision_limit, sla_not_started |
| POST | `/api/v1/submissions/{id}/revise` | creator | Upload the next version (v+1), carrying open must-fix notes. | Submission | revision_limit |
| POST | `/api/v1/submissions/{id}/appeal` | creator | One appeal per rejection (Ops decides in 72 h). | Dispute | appeal_used |
| POST | `/api/v1/submissions/{id}/withdraw` | creator | Withdraw and release the reservation. | Submission |  |
| POST | `/api/v1/submissions/{id}/post` | creator | Attach the post URL; opens the 72-hour window. | Post | validation_failed |
| GET | `/api/v1/review/queue` | brand | Review queue sorted by QA flags, band, age; fraud-hold lane. | Page<ReviewItem> |  |
| GET | `/api/v1/review/rules` | brand | Auto-approve rules. | Page<AutoApproveRule> |  |
| PUT | `/api/v1/review/rules/{id}` | brand | Create or update a rule. | AutoApproveRule |  |
| POST | `/api/v1/review/rules/dry-run` | brand | Dry run on the last 50 submissions. | DryRun |  |
| POST | `/api/v1/review/rules/{id}/enable` | brand | Enable (needs a dry run on the current conditions). | AutoApproveRule | conflict |
| POST | `/api/v1/review/rules/{id}/kill` | brand | Kill switch. | AutoApproveRule |  |

#### Scoring

Checklist scores shared with the client engines.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| POST | `/api/v1/score/hook` | any | Hook Score from observations or an uploaded clip (bands plus timecoded reasons). | ScoreCard |  |
| POST | `/api/v1/score/flow` | any | Flow Score against a brief and format. | ScoreCard |  |
| POST | `/api/v1/score/preflight` | creator | Pre-flight: disclosure, music, claims, AI flag, 9:16, length, safe zones. | PreflightResult |  |

#### Posts, View Ledger and ledger

Verified views, snapshots, disputes, double-entry.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/posts` | any | Posts (creator: own; brand: workspace). | Page<Post> |  |
| GET | `/api/v1/posts/{id}` | any | Post with funnel, earnings, fraud assessment, retention. | Post |  |
| GET | `/api/v1/posts/{id}/ledger` | creator | View Ledger: snapshots, source split, verified vs excluded with the plain-language cause. | ViewLedger |  |
| GET | `/api/v1/posts/{id}/metrics` | any | Daily (and hourly for recent posts) metrics. | PostMetrics |  |
| POST | `/api/v1/posts/{id}/dispute` | creator | One-tap dispute with a snapshot range, reason and note. | Dispute |  |
| POST | `/api/v1/posts/{id}/remove` | creator | Record a deletion (earns nothing if before the window closes). | Post |  |
| GET | `/api/v1/ledger` | any | Ledger rows (brand: own accounts; creator: own; admin: all) with filters account, bounty, post, type. | Page<LedgerEntry> |  |
| GET | `/api/v1/ledger/{txnId}` | any | All legs of a transaction. | Page<LedgerEntry> |  |

#### Wallet, Money Clock and payouts

Pending, cleared and paid with dates and reasons.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/wallet` | any | Creator: Money Clock summary; brand: escrow held / reserved / settled / available. | Wallet |  |
| GET | `/api/v1/money-clock` | creator | Earning rows with state, eta_at and reason. | Page<MoneyClockRow> |  |
| POST | `/api/v1/wallet/topup` | brand | Fund the wallet by card or bank (mock). | Wallet | idempotency_conflict |
| PUT | `/api/v1/wallet/auto-topup` | brand | Auto top-up threshold and amount. | AutoTopUp |  |
| GET | `/api/v1/payouts` | creator | Payout history and upcoming. | Page<Payout> |  |
| GET | `/api/v1/payouts/{id}` | creator | A payout with its earning rows and proof. | Payout |  |
| GET | `/api/v1/payouts/preview` | creator | Instant cash-out preview: fee, net, free allowance, blocked reason. | PayoutPreview |  |
| POST | `/api/v1/payouts/instant` | creator | Instant cash-out (fee shown first). | Payout | below_minimum, method_missing, tax_info_missing, identity_check_required |
| GET | `/api/v1/payout-methods` | creator | Payout methods. | Page<PayoutMethod> |  |
| POST | `/api/v1/payout-methods` | creator | Add a bank or debit card (Connect sheet, mock). | PayoutMethod |  |
| DELETE | `/api/v1/payout-methods/{id}` | creator | Remove. | 204 |  |
| GET | `/api/v1/invoices` | brand | Invoices. | Page<Invoice> |  |
| GET | `/api/v1/invoices/{id}` | brand | Invoice with lines. | Invoice |  |
| PATCH | `/api/v1/invoices/{id}` | brand | Edit PO number, cost centre, VAT id. | Invoice |  |
| POST | `/api/v1/proofs` | creator | Create a public proof page (payout, month, tier-up, wrapped). | Proof |  |
| DELETE | `/api/v1/proofs/{id}` | creator | Revoke a proof page. | 204 |  |

#### Tax Desk

Just-in-time W-9. Not tax advice.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/tax/summary` | creator | Profile, YTD, 1099-NEC threshold progress, set-aside. | TaxProfile |  |
| POST | `/api/v1/tax/w9` | creator | Submit a W-9 (or W-8BEN). | TaxProfile | validation_failed |
| PATCH | `/api/v1/tax/set-aside` | creator | Adjust the set-aside percentage. | TaxProfile |  |
| GET | `/api/v1/tax/docs` | creator | Collected and issued documents. | Page<TaxDoc> |  |
| GET | `/api/v1/tax/export.csv` | creator | Earnings CSV for the tax year. | text/csv |  |

#### Offers, rate cards, auctions, specs and market

Pricing and trade.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/offers` | any | Offers for the signed-in side. | Page<Offer> |  |
| POST | `/api/v1/offers` | brand | Send an invite, direct offer or re-buy. | Offer | validation_failed |
| GET | `/api/v1/offers/{id}` | any | Offer with thread. | Offer |  |
| POST | `/api/v1/offers/{id}/messages` | any | Message in the thread (in-app only). | Offer |  |
| POST | `/api/v1/offers/{id}/accept` | any | Accept the latest terms; the brand wallet funds the direct bounty. | Offer | bounty_not_funded, idempotency_conflict |
| POST | `/api/v1/offers/{id}/counter` | any | Counter (max 3 rounds). | Offer | conflict |
| POST | `/api/v1/offers/{id}/decline` | any | Decline. | Offer |  |
| POST | `/api/v1/offers/{id}/withdraw` | brand | Withdraw. | Offer |  |
| GET | `/api/v1/rate-card` | creator | The creator's rate card with the market suggestion. | RateCard |  |
| PUT | `/api/v1/rate-card` | creator | Update the rate card (Silver and above). | RateCard | tier_locked |
| GET | `/api/v1/auctions` | any | Auctions (brand sees only its own bid while open). | Page<Auction> |  |
| POST | `/api/v1/auctions` | creator | Create an auction (Platinum and above). | Auction | tier_locked |
| GET | `/api/v1/auctions/{id}` | any | Auction. | Auction |  |
| POST | `/api/v1/auctions/{id}/bids` | brand | Place a sealed maximum bid (escrow hold). | Bid | idempotency_conflict |
| DELETE | `/api/v1/auctions/{id}/bids/{bidId}` | brand | Withdraw a bid before close. | 204 |  |
| POST | `/api/v1/auctions/{id}/cancel` | creator | Cancel. | Auction |  |
| GET | `/api/v1/specs` | any | Spec Market (brand: listed specs; creator: own). | Page<Spec> |  |
| POST | `/api/v1/specs` | creator | Upload a spec. | Spec |  |
| POST | `/api/v1/specs/{id}/score` | creator | Submit for scoring and listing (Flow points 55+). | Spec |  |
| POST | `/api/v1/specs/{id}/license` | brand | License a spec (rights, term, price; take rate on top). | Spec | idempotency_conflict |
| DELETE | `/api/v1/specs/{id}` | creator | Withdraw. | 204 |  |
| GET | `/api/v1/market/clearing` | any | Clearing CPM series by category with p25-p75 band. | Page<MarketSeriesPoint> |  |
| POST | `/api/v1/market/suggest` | brand | Suggested CPM and price-vs-fill curve with confidence. | PriceSuggestion |  |
| GET | `/api/v1/market/ticker` | public | Public payout ticker (ledger-backed). | Ticker |  |
| GET | `/api/v1/report/state-of-app-ugc` | public | State of App UGC report. | StateOfAppUgc |  |

#### Attribution Kit

Links, codes, RevenueCat ingest. CPA pays only on link and code.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/r/{code}` | public | Resolve a tracking code (landing data) and log a click. | LinkResolution | not_found |
| POST | `/api/v1/attribution/events` | public | SDK first-launch attribute write (code, install id). | 202 |  |
| POST | `/api/v1/webhooks/revenuecat` | public | RevenueCat webhook ingest (idempotent on event id, signature checked). | RevenueCatEvent |  |
| GET | `/api/v1/attribution/health` | brand | Coverage meter, last event, SDK status, code pool usage. | AttributionHealth |  |
| GET | `/api/v1/attribution/codes` | brand | Offer-code pool. | Page<OfferCode> |  |
| POST | `/api/v1/attribution/codes/rotate` | brand | Rotate codes (respecting the 10-per-SKU cap). | Page<OfferCode> |  |
| POST | `/api/v1/attribution/test-event` | brand | Send a test conversion through the pipeline. | RevenueCatEvent |  |
| GET | `/api/v1/conversions` | brand | Conversions by source and confidence. | Page<Conversion> |  |

#### Rights, promotion and fatigue

Rights Vault, Spark and partnership permissions, Winner promotion.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/rights` | any | Rights grants (creator: my licences; brand: Rights Vault with expiry buckets). | Page<RightsGrant> |  |
| POST | `/api/v1/rights/{id}/renew` | brand | Request renewal (25% of base fee per 30 days; price preview). | RightsGrant |  |
| POST | `/api/v1/rights/{id}/permission` | creator | Grant or decline a Spark code / partnership permission. | RightsGrant |  |
| POST | `/api/v1/rights/{id}/revoke` | any | Revoke for misuse beyond the Rights Card. | RightsGrant |  |
| GET | `/api/v1/promotions` | brand | Ads. | Page<Ad> |  |
| POST | `/api/v1/promotions` | brand | Promote a winner (creator consent -> platform permission). | Ad | forbidden, conflict |
| POST | `/api/v1/promotions/{id}/launch` | brand | Launch an authorised ad. | Ad |  |
| POST | `/api/v1/promotions/{id}/pause` | brand | Pause or resume. | Ad |  |
| POST | `/api/v1/promotions/{id}/stop` | brand | Stop. | Ad |  |
| GET | `/api/v1/fatigue-alerts` | brand | Fatigue alerts. | Page<FatigueAlert> |  |
| POST | `/api/v1/fatigue-alerts/{id}/refresh` | brand | Create a refresh bounty from a fatigued winner. | Bounty |  |
| POST | `/api/v1/fatigue-alerts/{id}/dismiss` | brand | Dismiss. | FatigueAlert |  |
| GET | `/api/v1/test-plans` | brand | Hook x body x CTA plans. | Page<TestPlan> |  |
| POST | `/api/v1/test-plans` | brand | Create a plan. | TestPlan |  |
| GET | `/api/v1/library` | brand | Creative Intelligence Library: tagged posts, hook leaderboards. | Page<LibraryItem> |  |
| GET | `/api/v1/compliance` | brand | Compliance audits. | Page<ComplianceAudit> |  |
| POST | `/api/v1/compliance/{id}/waive` | brand | Waive a failed check with a logged reason. | ComplianceAudit |  |

#### Creators, reputation and progression

Profiles, tiers, streaks, leaderboards, crews, tournaments, Academy, referrals.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/creators` | brand | Discover creators with filters (niche, tier, approval, reliability, platform, price, US audience). | Page<CreatorCard> |  |
| GET | `/api/v1/creators/{idOrHandle}` | any | Creator profile (public fields; verified stats). | Creator |  |
| GET | `/api/v1/creators/{id}/reputation` | any | Reputation with components and reasons. | CreatorReputation |  |
| PATCH | `/api/v1/me/profile` | creator | Update handle, bio, niches, portfolio, storefront. | Creator | validation_failed |
| GET | `/api/v1/social-accounts` | creator | Linked accounts with Account Health. | Page<SocialAccount> |  |
| POST | `/api/v1/social-accounts` | creator | Link an account (mock OAuth, read-only). | SocialAccount |  |
| DELETE | `/api/v1/social-accounts/{id}` | creator | Disconnect. | 204 |  |
| GET | `/api/v1/tiers` | any | Tier thresholds and perks (from constants). | Tiers |  |
| GET | `/api/v1/tiers/me` | creator | Progress, history, grace hold. | TierStatus |  |
| GET | `/api/v1/streaks/me` | creator | Weekly streak, freezes, history. | Streak |  |
| POST | `/api/v1/streaks/rest-week` | creator | Declare a rest week. | Streak | conflict |
| GET | `/api/v1/leaderboards` | creator | Cohort, niche and global boards (?scope=, ?metric=). | Page<Leaderboard> |  |
| GET | `/api/v1/tournaments` | any | Tournaments. | Page<Tournament> |  |
| GET | `/api/v1/tournaments/{id}` | any | Tournament with rounds and standings. | Tournament |  |
| POST | `/api/v1/tournaments/{id}/entries` | creator | Enter (submit a hook). | TournamentEntry | tier_locked |
| GET | `/api/v1/crews` | creator | Crews (mine, discover). | Page<Crew> |  |
| POST | `/api/v1/crews` | creator | Create a crew (Gold and above). | Crew | tier_locked |
| POST | `/api/v1/crews/{id}/join` | creator | Join. | CrewMember |  |
| POST | `/api/v1/crews/{id}/leave` | creator | Leave. | 204 |  |
| GET | `/api/v1/referrals` | any | My referrals and reward window. | Page<Referral> |  |
| POST | `/api/v1/referrals` | any | Create an invite. | Referral |  |
| GET | `/api/v1/academy` | creator | Lessons with progress. | Page<Lesson> |  |
| GET | `/api/v1/academy/{slug}` | creator | A lesson. | Lesson |  |
| POST | `/api/v1/academy/{slug}/complete` | creator | Submit the quiz; award the badge. | LessonProgress |  |
| GET | `/api/v1/remix` | creator | Formats, hooks and trends for the Remix library. | RemixLibrary |  |
| GET | `/api/v1/wrapped` | creator | Wrapped recaps (?period=month\|year). | Page<Wrapped> |  |
| GET | `/api/v1/threads` | any | Inbox threads. | Page<ChatThread> |  |
| POST | `/api/v1/threads/{id}/messages` | any | Send a message (in-app only; Scam Shield screens it). | ChatThread |  |
| GET | `/api/v1/notifications` | any | Notifications. | Page<Notification> |  |
| POST | `/api/v1/notifications/read` | any | Mark read. | 204 |  |
| GET | `/api/v1/settings/notifications` | any | Notification preferences. | NotificationPrefs |  |
| PUT | `/api/v1/settings/notifications` | any | Update. | NotificationPrefs |  |
| GET | `/api/v1/settings/wellbeing` | creator | Wellbeing Mode. | WellbeingSettings |  |
| PUT | `/api/v1/settings/wellbeing` | creator | Update (quiet hours, numbers-off, pace, pause, rest weeks). | WellbeingSettings |  |
| POST | `/api/v1/verifications` | any | Start an ID / age / business / tax / payout-method verification. | Verification |  |

#### Flo and free tools

Mock engine behind an AIProvider; public tools need no auth.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| POST | `/api/v1/flo/chat` | any | Flo copilot (Server-Sent Events stream; outputs recorded as flo_suggestions). | SSE<FloSuggestion> |  |
| POST | `/api/v1/tools/hook-score` | public | Free Hook Score from text or analysed clip observations. | ScoreCard |  |
| POST | `/api/v1/tools/app-audit` | public | Free App UGC Audit from an App Store link. | AuditReport |  |
| GET | `/api/v1/audits/{slug}` | public | Shareable audit report. | AuditReport |  |
| POST | `/api/v1/tools/earnings` | public | Earnings calculator (p25 / median / p75). | EarningsEstimate |  |
| POST | `/api/v1/tools/budget` | public | Smart Budget planner bands. | BudgetPlan |  |
| POST | `/api/v1/tools/price` | public | All-in price calculator by plan. | PriceComparison |  |

#### Safety

Scam Shield.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| POST | `/api/v1/reports` | any | Report a brand, bounty, creator, message or offer (returns case id and SLA). | ScamReport |  |
| GET | `/api/v1/reports/mine` | any | My reports and status. | Page<ScamReport> |  |
| GET | `/api/v1/disputes` | any | Disputes and appeals visible to me. | Page<Dispute> |  |
| GET | `/api/v1/disputes/{id}` | any | Dispute with timeline. | Dispute |  |
| POST | `/api/v1/disputes/{id}/events` | any | Reply or add evidence. | Dispute |  |

#### Developers and integrations

API keys, webhooks, MCP, integrations.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/api-keys` | brand | Keys (prefix and last four only). | Page<ApiKey> |  |
| POST | `/api/v1/api-keys` | brand | Create (secret shown once). | ApiKeyCreated | forbidden |
| DELETE | `/api/v1/api-keys/{id}` | brand | Revoke. | 204 |  |
| GET | `/api/v1/webhook-endpoints` | brand | Endpoints with recent deliveries. | Page<Webhook> |  |
| POST | `/api/v1/webhook-endpoints` | brand | Create. | Webhook |  |
| POST | `/api/v1/webhook-endpoints/{id}/test` | brand | Send a test event. | WebhookDelivery |  |
| POST | `/api/v1/mcp` | brand | MCP server (JSON-RPC 2.0): tools create_bounty, fund_bounty, list_submissions, decide_submission, get_funnel; writes are drafts unless the key has financial scope. | JsonRpc |  |
| GET | `/api/v1/integrations` | brand | Integrations and status. | Page<Integration> |  |
| POST | `/api/v1/integrations/{kind}/connect` | brand | Connect (mock OAuth / key). | Integration |  |
| DELETE | `/api/v1/integrations/{id}` | brand | Disconnect. | 204 |  |

#### Admin

Control tower and queues. Role admin only.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/admin/targets` | admin | Control tower: targets vs actuals, market health, queues, next payout run. | AdminMetrics |  |
| GET | `/api/v1/admin/fraud` | admin | Fraud queue sorted by risk and money at stake. | Page<FraudFlag> |  |
| GET | `/api/v1/admin/fraud/{id}` | admin | Fraud case with evidence. | FraudFlag |  |
| POST | `/api/v1/admin/fraud/{id}/decision` | admin | Clear, hold, claw back or ban with a reason (audited). | FraudFlag | reason_required |
| GET | `/api/v1/admin/disputes` | admin | Dispute queue with SLA timers. | Page<Dispute> |  |
| POST | `/api/v1/admin/disputes/{id}/decision` | admin | Resolve: upheld, partially upheld, rejected; release to next payout. | Dispute | reason_required |
| GET | `/api/v1/admin/verification` | admin | Verification queue (creator ID, brand business, tax). | Page<Verification> |  |
| POST | `/api/v1/admin/verification/{id}/decision` | admin | Approve, request info or reject with a reason code. | Verification | reason_required |
| GET | `/api/v1/admin/payouts` | admin | Payout runs, holds, failures, instant volume. | Page<PayoutRun> |  |
| POST | `/api/v1/admin/payouts/{id}/release` | admin | Release a hold. | Payout |  |
| GET | `/api/v1/admin/ledger` | admin | Ledger explorer with balance proof and anomaly detector. | LedgerExplorer |  |
| GET | `/api/v1/admin/sla` | admin | Review SLA desk: stale and breached submissions. | Page<Submission> |  |
| POST | `/api/v1/admin/sla/{submissionId}/approve-if-clean` | admin | Approve if every QA check passes. | Submission |  |
| GET | `/api/v1/admin/safety` | admin | Scam reports queue. | Page<ScamReport> |  |
| POST | `/api/v1/admin/safety/{id}/action` | admin | Triage, confirm, takedown, strike or suspend. | ScamReport |  |
| GET | `/api/v1/admin/ml` | admin | Model monitoring and calibration. | Page<MlModel> |  |
| GET | `/api/v1/admin/bounties` | admin | Bounty registry. | Page<Bounty> |  |
| GET | `/api/v1/admin/creators` | admin | Creator registry. | Page<Creator> |  |
| GET | `/api/v1/admin/brands` | admin | Brand registry. | Page<Brand> |  |
| POST | `/api/v1/admin/tier-override` | admin | Override a tier (logged). | Creator | reason_required |
| POST | `/api/v1/admin/demo/advance` | admin | Advance the demo clock by 24 h or 72 h and run due jobs. | World |  |
| POST | `/api/v1/admin/demo/reset` | admin | Reset to the seed. | World |  |

#### Public pages

Unauthenticated, cacheable.

| Verb | Path | Who | What | Returns | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/public/bounties/{id}` | public | Public bounty page data. | Bounty |  |
| GET | `/api/v1/public/creators/{handle}` | public | Storefront with verified stats. | Storefront |  |
| GET | `/api/v1/public/proofs/{id}` | public | Proof page (always with the tier median line). | Proof |  |
| GET | `/api/v1/public/scorecards/{brandId}` | public | Public Brand Scorecard. | BrandScorecard |  |
| GET | `/api/v1/public/tournaments/{id}` | public | Public tournament page. | Tournament |  |
| GET | `/api/v1/public/waitlist` | public | Waitlist totals and leaders. | Waitlist |  |
| POST | `/api/v1/public/waitlist` | public | Join the waitlist (email, kind, referral code). | WaitlistJoined |  |
| GET | `/api/v1/public/changelog` | public | Changelog. | Page<ChangelogEntry> |  |
| GET | `/api/v1/public/case-studies` | public | Case studies and testimonials. | CaseStudies |  |
<!-- /GENERATED:api -->

---

## 17. Open questions and decisions taken

Decisions the contract made where docs were silent or in conflict (the lead can overturn any of them; each is a constant or a schema line):

1. **Maya's tier.** `docs/PRODUCT_SPEC.md`, `ROUTES.md` and `SCREENS.md` describe Maya as Gold; the contract fixes her as **Silver** (lifetime cleared $1,640, 21 approved, 78% approval, 82% of the way to Gold), so that the tier-progress, instant-fee-preview and grace-hold stories are visible with her data. Copy must read the tier from data.
2. **New-brand threshold** is 10 decisions (PRODUCT_SPEC, ROUTES); creator "Building history" under 5 finished decisions (PRODUCT_SPEC). Both are constants.
3. **Fee reserve.** The take rate is held as a reserve on top of the pool and taken only on creator pay actually settled; the unused reserve is refunded with the unspent budget. Per-leg rounding (half up) is the contract.
4. **Matched first bounty** matches dollar for dollar up to $500 on top of what the brand funds and waives the fee on that bounty.
5. **Card processing** (2.9% + $0.30) is passed through and shown in the all-in price; it is not refunded on unspent budget.
6. **CPA-only** (`cpa`, `install_only`): flat 6% on cleared conversions regardless of plan.
7. **Instant cash-out**: minimum cash-out $5.00; free for Platinum and Elite, once per ISO week for Gold, and for Founding creators for 12 months.
8. **Conversion clearing**: install 24 h, trial 72 h, paid 168 h (the refund window), then the next 14:00 UTC run. CPA window 30 days from posting.
9. **Dispute SLAs**: human reply within 24 hours; resolution within 5 business days (appeals 72 hours). PRODUCT_SPEC proposes 48 hours for admin-queue resolution of disputes; the control tower metric is "disputes resolved within 48 h".
10. **Referral**: creators earn 5% of a referee's cleared earnings for 90 days (cap $100 per referee), platform-funded; agency partners earn 10% of platform fees for 12 months.
11. **Hook/Flow Score** are checklist scores with the rules in section 12.3; partial credit is half points. They become learned only after about 1,000 settled posts (shadow mode first).
12. **The fraud score** composition and bands (section 12.4) are the day-one heuristic; only proven fraud claws back and delivered legitimate views are always paid.
13. **Auctions**: sealed-bid, second price, uniform clearing price, Platinum and Elite creators, 1 to 5 slots, 72 hours to 7 days.
14. **iOS ArtSeed**: the shape in section 4 (`hue_a`/`hue_b`/`hue_c`/`pattern`/`seed`/`label`) is the contract. `apps/ios/Flowd/DesignSystem/Components/ArtSeed.swift` was written to an earlier shape (`palette`, `motif`, `title`, ...); it must be changed to decode this one.
15. **Admin name.** The admin persona is "Sam Okafor" (shown as "Ops" in the UI).
16. **Names that differ from the screen docs.** `docs/SCREENS.md` names Money Clock delay reasons `fraud_review`, `awaiting_tax_info`, `dispute_open`; the contract names are `MoneyClockReason` `held_fraud_review`, `held_tax_info`, `held_dispute` (plus the others in the enum). View Ledger exclusion causes are `ExclusionCause` (`bot_pattern`, `cap_clustering`, `duplicate`, `geo_outlier`, `removed_post`, `platform_adjustment`) carried on `view_snapshots.exclusions`.
17. **Rights Card snapshot.** A submission stores the Rights Card the creator accepted (`submissions.rights_card`, `rights_accepted_at`); later edits to the bounty never change what was accepted.
18. **Client-only state** is not in the contract: review-queue snooze, Studio drafts, camera and teleprompter settings, haptics and app-icon variant, local theme and Reduce glass switch.
19. **Promise metrics** (the 11 public proof metrics on `/promise` and `/trust`) are fixtures (`admin_metrics.promise_metrics`) computed from the ledger, so the public numbers match the admin ones.
