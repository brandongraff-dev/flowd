# flowd engine

The pure business logic of the product: pricing, the double-entry ledger, settlement, the Money Clock, scoring, fraud, matching, the Market view,
tiers, reputation, attribution, rights, Brief Lint, guarded auto-approve, earnings and the free-tool generators.

- **Pure TypeScript.** No React, no I/O, no `Date.now()`, no `Math.random()`. Every function takes `now` (an ISO timestamp) and any randomness as an
  injected `Rng` (`seededRng("seed")`), so the same inputs always give the same output on web and iOS.
- **Money is integer cents**, rounded half-up **per ledger leg** with basis-point integer math (`mulRate`), so there is no float drift. A CPM is
  cents per 1,000 verified views. Format only at the edge (`formatMoney`).
- **Specs, not opinions.** `CONSTANTS` (re-exported from the contract) holds every number. The formulas implement `packages/contract/DOMAIN.md`
  sections 9 to 12 exactly. `__tests__/contract-vectors.test.ts` replays every case in `packages/contract/formula-vectors.json`, and each DOMAIN worked
  example is also a named test.
- **Honest scores.** Hook Score, Flow Score and the brief-compliance checklist are **checklist scores**. Every result carries
  `label: "Checklist score. It gets smarter as bounties settle."`, a band, timecoded reasons and one-tap fixes. Estimates (earnings, budgets, audits)
  say "estimate".
- Import from the barrel: `import { settlePost, formatMoney } from "@/lib/engine"`. Contract types come from `@/lib/contract/types`.

```
npm --prefix apps/web run test                      # all tests (vitest)
npx vitest run src/lib/engine                       # just the engine, from apps/web
```

Test files (`__tests__/`): one per module with inline data and the DOMAIN worked examples; `contract-vectors` (every case of `formula-vectors.json`);
`lifecycle` (one bounty from top-up to refund through ledger, settlement, Money Clock and clawback, checked against the golden walk-through);
`properties` (seeded sweeps: exact rounding, cap, nets-to-zero, clock dates); `fixtures-parity` (the generated demo world agrees with the engine: ledger,
escrow, tiers, scorecards, fraud bands, Pay Math, the Money Clock, referrals; skips itself when fixtures are absent).

## Layout

| Module | What it owns |
|---|---|
| `constants.ts` | `CONSTANTS`, plan and take-rate helpers, CPA rates, tier thresholds and perks, tracked vs estimated sources |
| `money.ts` | cents math, parsing, `formatMoney` / `formatCpm` / `formatCompact` |
| `time.ts`, `stats.ts`, `rng.ts`, `text.ts` | UTC and ISO-week helpers, quantiles, seeded randomness, text tokens and phrase search |
| `pricing.ts` | funding and escrow totals, all-in CPM, install-only fee, plan comparison, budget planner, Smart Budget |
| `ledger.ts` | accounts, transaction builders for every event that moves money, balances and invariant checks |
| `settlement.ts` | stacked pay per post, ledger postings per post, Reserved Slot, escrow identity, bounty settlement |
| `moneyclock.ts` | pending, cleared, paid with ETAs and named reasons; payout schedule; instant cash-out preview |
| `funnel.ts` | funnel aggregation, tracked vs estimated, cost per stage, ROAS D7 to D90, payback, fatigue |
| `scoring.ts` | Hook Score, Flow Score, bands, one-tap fixes, brief-compliance checklist |
| `hooktext.ts` | text-only Hook Score for the free tool, hook library, rewrites |
| `qa.ts` | auto-QA over transcript and metadata, disclosure, banned claims, duplicates by hash distance |
| `fraud.ts` | ten explainable view-fraud signals, score, band, action |
| `matching.ts` | rank bounties for a creator, rank creators for a bounty |
| `market.ts` | clearing CPM statistics, suggested CPM, price vs fill-time curve, competition heat |
| `tiers.ts` | tier from stats, progress, what unlocks next, 30-day grace hold, early access |
| `reputation.ts` | creator reliability, Brand Scorecard, review SLA clock |
| `streaks.ts` | weekly streaks with earned freezes, rest weeks, no guilt |
| `attribution.ts` | confidence labels, CPA eligibility, tracking codes, the 10-per-SKU offer-code pool, RevenueCat ingest |
| `rights.ts` | Rights Card builder, expiry alerts, renewal pricing, the Rights Vault |
| `brieflint.ts` | publish blockers and warnings, effective pay at the median |
| `autoapprove.ts` | rule evaluation, dry run, spot-check sampling, lifecycle |
| `earnings.ts` | p25 / median / p75 expected earnings, income calendar, Tax Desk numbers |
| `audit.ts` | the App UGC Audit generator (seeded) |
| `referral.ts` | creator and partner referral rewards, referral status, ranked waitlist |
| `index.ts` | the barrel |

## API index

### constants.ts
`CONSTANTS` · `DEMO_NOW` · `CHECKLIST_LABEL` · `PLAN_ORDER` · `TIER_ORDER` · `DEFAULT_CPA_RATES` ·
`rateForKind(rates, kind)` · `ratesOf(bounty)` · `planTakeRate(plan)` · `planPriceCentsMonth(plan)` · `planLabel(plan)` · `planFeatures(plan)` ·
`planHasFeature(plan, feature)` · `cheapestPlanWith(feature)` · `isCpaOnly(type)` ·
`takeRateFor({ plan, type, firstBountyWaived? })` (first bounty 0, `cpa` and `install_only` flat 6%, else the plan rate) ·
`tierThresholds(tier)` · `tierPerks(tier)` · `isPayableSource(source)` · `trackedOrEstimated(source)`.

### money.ts
`bps` · `roundHalfUp` · `mulRate(cents, rate)` · `divRound(num, den)` · `sumCents` · `splitCents(total, weights)` (largest remainder, no drift) ·
`dollarsToCents` · `parseMoney("$1,234.56")` · `formatMoney(cents, { cents, sign, compact })` · `formatCpm(cents, style)` · `formatInt` ·
`formatCompact` (1.2K, 14.2K, 1.5M) · `formatPercent` · `formatMultiple` · `formatDeltaMoney` · `formatHours`.

### time.ts, stats.ts, rng.ts, text.ts
- **time**: `SECOND_MS` · `MINUTE_MS` · `HOUR_MS` · `DAY_MS` · `iso(ms)` · `toMs(iso)` · `addHours` · `addDays` · `addMinutes` · `addMonths` (clamps to month end) · `dateOf` · `dayStart` ·
  `hoursBetween` · `daysBetween` · `addDaysToDate` · `dateRange` · `weekdayOf` · ISO weeks `isoWeek` · `isoWeekStart` · `isoWeekEnd` · `nextWeekStart` · `isoWeekToStart` ·
  `isoWeekAdd` · recurring runs `nextDailyAt` · `nextWeeklyAt` · `prevWeeklyAt` · labels `timeLabel` · `clockLabel` ("Sat 2:00 PM") · `dayLabel` · `datedClockLabel` · `relativeLabel`.
- **stats**: `clamp` · `clamp01` · `round2` · `roundTo` · `sum` · `mean` · `quantile` · `median` · `typicalBand` (p25, median, p75, p90) · `lerp` · `mapRange` · `safeRatio` ·
  `countWhere` · `groupBy`.
- **rng**: `Rng` · `hashString` (FNV-1a) · `mulberry32` · `seededRng(seed)` · `randInt` · `randRange` · `pick` · `shuffled` · `sample`.
- **text**: `normalizeText` · `tokenize` · `wordCount` · `contentTokens` · `jaccard` · `containment` · `textParity` · `findPhrase` · `findPhrases` · `escapeRegExp` · `titleCase` ·
  `slugify` · `capitalize` · `joinList` · `callsToAction` · `timecode` · `secondsLabel`.

### pricing.ts
- Funding: `cardProcessing(cents)` · `funding({ budget_cents, take_rate, matched_cents? })` · `escrowTotal` · `firstBountyFunding({ brand_funds_cents })` ·
  `fundingFor({ budget_cents, plan, type, first_bounty?, matched_cents? })` · `isFunded` · `escrowShortfall`.
- All-in price: `allInCpm({ cpm_cents, budget_cents, card_charge_cents })` · `allInRate(rate, take_rate)` · `allInBreakdown({ rate_cents, plan, type?, first_bounty? })`
  (creator pay + fee + processing, always summing to the total) · `realizedCpm({ cost_cents, verified_views })`.
- CPA-only: `installOnlyFee({ conversions, rates })` (flat 6% per leg) · `installOnlyPlan({ budget_cents, install_rate_cents })`.
- Plans: `comparePlans({ monthly_spend_cents })` · `planBreakEven(from, to)` (Free to Pro $14,950, Free to Scale $24,975, Pro to Scale $35,000).
- Planning: `budgetPlan({ budget_cents, take_rate, cpm_cents, avg_first_payment_cents, ... })` (views, installs, trials, paid and cost per stage in low, median and
  high bands at 0.55x / 1x / 1.6x) · `smartBudget({ goal, cpm_cents, plan, ... })` (the pool for a views, installs, trials or paid goal, three scenarios) ·
  `maxCpmForCostPerTrial` · `DEFAULT_FUNNEL` · `BAND_NAMES` · `BUDGET_PLAN_LABEL`.

### ledger.ts
Accounts: `ACCOUNTS` · `walletAccount` · `escrowAccount` · `creatorAccount` · `parseAccount`. Transactions net to exactly zero (`makeTxn` throws otherwise):
`walletTopUpTxn` · `escrowFundTxn` · `matchedBudgetTxn` · `settlementTxn` (escrow or wallet to creator plus fee) · `adCommissionTxn` · `adFeeTxn` ·
`rightsRenewalTxn` · `subscriptionTxn` · `promoTxn` (bonus, prize, referral) · `weeklyPayoutTxn` · `instantPayoutTxn` · `clawbackTxn` (reverses in a new txn with
`reverses_txn_id`, optional invalid share) · `recoverFromEarnings` · `escrowRefundTxn`. Helpers: `sequentialTxnIds` · `netOf` · `markCleared` · `markPaid` · memo builders that match the demo ledger: `fundedMemo` · `rightsRenewalMemo` · `subscriptionMemo`
(settlement memos are in settlement.ts).
Checks: `balances` · `balanceOf` · `verifyLedger` (L-01, L-17) · `bountyLedgerMoney` · `reconcileBounty` (L-03, L-04, L-08) · `creatorLedgerMoney`
(pending, cleared, held, paid, never summed together).

### settlement.ts
- Stacked pay: `settlePost({ window_views, cpm_cents, conversions, rates, per_video_cap_cents, take_rate })` (CPM first, then CPA until the cap, fee per leg) ·
  `maxBrandCostPerPost`.
- Ledger postings: `settleCpmLeg` · `settleCpaBatch` · `settlePostToLedger` (CPM leg plus one txn per payable batch, with skipped batches and why) ·
  `settleFlatFee` · `batchSkipReason` · `skipReasonText` · `feeMemo` / `cpaMemo` / `cpmMemo` · `withinCpaWindow`.
- Reserved Slot and escrow: `emptyEscrow` · `fundEscrow` · `escrowIdentityHolds` · `reservationUnit` · `spotsLeft` · `isFilled` · `reserveSlot` · `releaseSlot` ·
  `settleReservation` (an approved post is paid even if the pool is empty: the shortfall is reported for the wallet) · `spendFromRemaining` · `settleBounty` (refund) ·
  `escrowBurn` · `escrowStateOf`.

### moneyclock.ts
Schedule: `firstRunAtOrAfter` · `windowEndsAt` · `postClearingRun` · `conversionClearingRun` · `weeklyPayoutFor` · `nextWeeklyPayout` · `payoutSchedule` · `nextClearingRun` ·
`payoutRunId`. State: `moneyClockState` · `conversionClockState` · `uiState` · `reasonText` · `describeEarning` · `bareStateProblem` (a bare "pending" is a bug) ·
`summarizeMoneyClock` · `postTimeline` · `HOLD_TO_REASON` · `isHoldReason`. A conversion on a post: `conversionRunOnPost` (it clears no earlier than the post's own run) and
`conversionClockState({ post_posted_at })` (accruing while the post window is open). Payout in transit: `moneyClockState({ paid_at, payout_arrives_at })` gives `paid` with reason
`payout_in_transit` until it lands; `estimatePayoutArrival({ kind, initiated_at })` (instant 30 minutes, weekly 15:00 UTC the next banking day). Cash-out: `instantPayout` (fee clamp(1.5%, $0.50, $15), $5 minimum, free perks) ·
`instantCashOutPreview` (the sentence shown before confirm) · `foundingFreeActive` · `freeInstantUsedThisWeek` · `hoursToNextPayout`.

### funnel.ts
`emptyFunnel` · `addFunnels` · `sumFunnels` · `funnelMonotonicProblems` · `rateWithSample` (null and a note under 20) · `wilsonInterval` · `stepRates` · `trialRate` ·
`splitConversions` (tracked link + code vs estimated mmp + survey + modelled) · `coverageLabel` · `funnelFromConversions` · `funnelStats` (effective CPM, cost per
install, trial and paid, ROAS D7, D14, D30, D60, D90 with maturity, payback day) · `revenueByDay` · `aggregateFunnelBy` (creator, hook or format leaderboards) ·
`detectFatigue` · `ROAS_HORIZONS` · `FATIGUE_DROP_THRESHOLD` · `MIN_SAMPLE_FOR_RATE`.

### scoring.ts
`bandFor` · `bandAtLeast` · `bandDescriptor` · `bandFloor` · `pointsToNextBand` · `scoreHook(obs)` (weights 20/15/15/15/10/10/10/5) · `scoreFlow(obs)`
(30/25/10/10/5/5/5/5/5) · `scoreHookFeatures(features)` (face, text overlay, app, motion, hook length, spoken-hook parity) · `toHookObservations` · `hookLengthAdvice` ·
`suggestHookFixes` · `applyHookFix` · `applyAllHookFixes` · `suggestFlowFixes` · `applyFlowFix` · `explainScore` · `scoreAnalysis` · `hookObservationsFromAnalysis` ·
`flowObservationsFromAnalysis` · `formatOrderOf` · `endsOnWinState` · `scoreBriefCompliance` (always labelled a checklist score) · thresholds `HOOK_TEXT_PARITY_MIN` · `MOTION_INTERRUPT_MIN`.

### hooktext.ts
`scoreHookText(text)` (score, band, items, patterns, 2-second rule, suggestions; a risky claim caps it at a D) · `detectPatterns` · `twoSecondRule` · `firstSentence` ·
`suggestRewrites({ slots, avoid_types, limit })` · `fillHook` · `HOOK_LIBRARY` · `WORDS_PER_SECOND` · `HOOK_TARGET_SECONDS` · `MAX_SCORE_WITH_RISKY_CLAIM`.

### qa.ts
`runQa(input)` (required beats, disclosure audio and on-screen, banned claims, competitors, music licence, AI label, duplicates, watermark, aspect, length, resolution,
audio clarity, safe zones) · `isClean` · `findSpokenDisclosure` · `findWrittenDisclosure` · `checkDisclosureAudio` · `checkDisclosureOnScreen` · `checkCaptionDisclosure` ·
`findBannedClaims` · `findCompetitors` · `phashDistance` · `isValidPhash` · `findDuplicates` · `deadAirGaps` · `detectBeats` · `aspectRatioOf` · `auditPostCompliance` ·
`compareForReviewQueue`. Only a missing disclosure blocks settlement.

### fraud.ts
`assessFraud(input, at)` (ten signals) · `fraudScore(signals)` (points = round(max x severity), min(100, sum)) · `fraudBand` · `fraudAction` · `fraudActionText` ·
the detectors `detectViewSpikeNoEngagement` · `detectCapClustering` · `detectCapSnap` · `detectBoughtViewsPattern` · `detectGeoMismatch` · `detectViewToFollowerOutlier` ·
`detectNewAccount` · `detectDuplicateHash` · `detectEngagementAnomaly` · `detectTrafficSourceAnomaly` · `detectCurveShape` · curve tools `classifyCurve` ·
`topTwoHourShare` · `longestNoDecayRun` · `expectedViewCurve` · `NATURAL_FIRST_DAY_SHARE` · `followerQuality` · `creatorFraudEvidence`.

### matching.ts
`matchScore(input)` (null when a gate fails) · `matchFactors` · `matchPoints` · `isTopPick` · `nicheOverlap` · `regionFit` ·
`rankBountiesForCreator({ creator, bounties, now })` (gated, scored, locked bounties last with reasons, early access by tier) ·
`rankCreatorsForBounty({ bounty, creators, now })` · `GATE_TEXT`.

### market.ts
`clearingStats(points, category)` · `suggestCpm({ clearing_cpm_cents, median_fill_hours, sample_n, target_fill_hours })` · `fillTime` · `priceCurve` · `categoryPriceCurve` ·
`fillTimeCopy` · `marketPosition` · `cpmPercentile` · `competitionHeat` · `trendCopy` · `CATEGORY_BASELINES` · `baselineFor`. Always carries a confidence and a thin-market flag.

### tiers.ts
`tierFor(stats)` · `tierProgress(stats)` (the bottleneck) · `remainingToNext` · `meetsTier` · `evaluateTier` (30-day grace hold, pause-safe) · `tierWithGrace` ·
`graceDaysLeft` · `withCarryOver` · `approvalRate` · `perkLines` · `whatUnlocksNext` · `earlyAccessAt` · `canSeeBounty` · `tierRank` · `tierAtLeast` · `nextTier` · `previousTier`.

### reputation.ts
`creatorReliability(input)` (finished work, recency-weighted, provisional 70 under 5 decisions) · `reliabilityForBrandView` · `creatorReasons` ·
`brandReliability(input)` · `buildBrandScorecard` · `brandDecisionStats` · `brandBadges` · `brandBandLabel` · `decidesInAbout` · `scorecardSample` · `approvalCopy` ·
`slaState` · `slaDueAt` · `reviewClock`.

### streaks.ts
`evaluateStreak({ post_times, now, rest_weeks, pauses, slack_mode })` · `streakCopy` · `canDeclareRestWeek` · `quarterOfWeek` · `restWeeksUsedInQuarter`.

### attribution.ts
`confidenceFor` · `sourceChip` · `cpaEligibility` (link and code only) · `trackingCode` · `shortUrl` · `deepLink` · `sdkAttributes` · `promoCodeText` · pool: `activeCodes` ·
`poolHealth` · `validatePool` (T-12) · `rotationReasons` · `uniqueCodeText` · `assignOfferCode` (reuse, assign, create, rotate, or link only) · RevenueCat:
`normalizeRevenueCatEvent` · `classifyRevenueCatEvent` · `matchRevenueCatEvent` (link, then code, then a remembered subscriber via `known_users`) · `ingestRevenueCatEvent`.

### rights.ts
`buildRightsCard(options)` · `rightsSummary` · `rightsLines` · `validateRightsCard` · `renewalPricePer30` · `renewalQuote` · `daysLeft` · `rightsEndsAt` · `dueExpiryAlerts` (30, 14, 7) ·
`deriveGrantStatus` · `sparkCodeDaysFor` · `SPARK_OPTIONS_DAYS` · `effectiveAdEnd` · `adMustStop` · `rightsVault`.

### brieflint.ts
`lintBrief(input, checkedAt, { overrides })` (18 rules, blockers first) · `canPublish` · `effectivePayAtMedian` (Pay Math).

### autoapprove.ts
`evaluateRule(rule, subject, state?)` (`auto_approve`, `send_to_human`, `block`; organic only) · `checkConditions` · `inScope` · `dryRun(rule, submissions, { now })` ·
`shouldSpotCheck` · `spotCheckCount` · `sampleForSpotCheck` · `withSpotCheck` · `spotCheckRatioOf` · `canEnable` · `killRule` · `statusAfterEvent` · `timeoutAction`.

### earnings.ts
`expectedEarnings({ base_median_views, cpm_cents, rates, per_video_cap_cents })` (p25 0.40x, median, p75 2.55x) · `payMath` (pass the bounty's own `take_rate` and its `flat_fee_cents`) · `predictedViews` · `monthlyEarningsRange` ·
`typicalEarnings` · `typicalVsTop` · `incomeCalendar` · `taxDesk` · `EARNINGS_DISCLAIMER`.

### audit.ts
`generateAudit({ input, now, creators?, max_creators? })` (category, draft brief, ten scored hooks, predicted CPM band, views, cost per trial, price curve, creators ready,
assumptions) · `parseAppInput` · `inferCategory` · `makeArtSeed` · `AUDIT_LABEL`.

### referral.ts
`creatorReferralReward` (5% for 90 days, $100 cap per referee) · `brandPartnerShare` (10% of fees for 12 months) · `referralStatus` · `makeReferralCode` · `referralLink` ·
`isSelfReferral` · `waitlistPosition` · `rankWaitlist` · `INVITE_EXPIRY_DAYS` · `WAITLIST_JUMP_PER_INVITE`.

## DOMAIN ambiguities and how the engine resolves them

1. **Recency in the match score.** DOMAIN's example rounds recency to 0.91 (4.55 points); the engine uses the exact `0.5 ^ (days / 14)` (0.9057, 4.53 points). Both give 96.
2. **Price fit and "pays at or above your usual".** Price fit is `min(ratio, 1.5) / 1.5`. The "at or above" reason is shown at a ratio of 1 or more (a fit of 0.67), not at a fit of 0.8.
3. **First bounty sizing.** `firstBountyFunding({ brand_funds_cents })` takes what the brand funds; the pool is that plus the match `min($500, funds)`. In Smart Budget a pool `P` is matched by `min($500, floor(P / 2))`.
4. **Fee per leg.** The fee is rounded half-up per ledger leg (the CPM leg and each CPA batch), so a post's fee can differ by a cent from the fee on its total. This matches the golden walk-through.
5. **Killed auto-approve rules.** The status table says "needs a fresh dry run to re-enable"; another line says a kill is final. The engine follows the table: `canEnable` allows a killed rule back only after a dry run that ran after `killed_at`.
6. **Dry-run status.** A rule in `dry_run` approves nothing; only `active` rules auto-approve. `dryRun()` evaluates as if active and ignores caps.
7. **`pause_on_fraud`.** A clawback always pauses an active rule. A fraud flag pauses it unless the rule's guardrails turn `pause_on_fraud` off.
8. **Hard safety checks.** A missing disclosure, a duplicate hash or a fraud score in the hold band (70+) is `block`, whatever the rule says. First-time creators (0 approved posts) are always sent to a person.
9. **View-minimum rule.** Text rules look for what a brief DEMANDS: negated lines ("no new account needed") are not flagged, and a view threshold on a bonus ("earn a $200 bonus once you hit 100k views") is allowed. Only base-pay gates block.
10. **Review SLA boundaries.** `slaState` follows DOMAIN (48 h is stale, 72 h is stale, over 72 h is breached). `timeoutAction` acts at the 72 h deadline itself (`hours >= 72`).
11. **Reliability inputs.** A creator component with nothing to measure yet counts as 1 (no evidence against). Brand "pays on time" and "run rate" are ratios supplied by the caller from the ledger. A brand under 10 decisions gets band `new` and the score is not a verdict.
12. **Referral window.** The creator's 90 days start at the referee's first dollar, and an earning that clears at the exact end of the window still counts. A partner's 12 months start at the brand's first fee (calendar months, clamped to the month end).
13. **Streak freezes.** One freeze is earned each time the current run of posted weeks reaches a multiple of 4, banked up to 2 (an earned freeze beyond 2 is not stored). Rest weeks, pauses and slack mode neither add a week nor break the streak.
14. **Money Clock holds.** A held row has no ETA by design; it names the next step instead (`HOLD_STEP` text), and `bareStateProblem` flags any pending, accruing or cleared row without a dated ETA.
15. **CPA waits for the post.** The per-video cap covers CPM and CPA together and CPM is applied first, so a conversion clears at the later of its own window (install 24 h, trial 72 h, paid 168 h, then the next 14:00 UTC run) and the post's own clearing run. While the post's 72-hour window is open its CPA rows are `accruing` with reason `window_open`. This is what the demo world does for every row.
16. **CPA eligibility order.** Source first (estimated never pays), then rejected or refunded, then a rate for that kind, then post status, the 30-day window, the cap and last the clearing window (its own, and the post's).
17. **Rounding of small ratios.** Funnel view-to-click and trial-to-paid keep 4 decimals so a 0.45% rate does not round to zero; scores and approval rates keep 2 as DOMAIN does.
18. **All-in CPM in Pay Math.** `PayMath.all_in_cpm_cents` is the creator CPM (median pay / median views) plus the platform fee plus 2.9% processing, at the bounty's OWN take rate (a platform-funded bounty is 0%, a bounty made on the Free plan stays 12% after an upgrade). It is not the bounty-level `round(card_charge x cpm / budget)`, which also spreads the $0.30 fixed fee across the pool (that one is `allInCpm`). A flat fee is paid on top of view pay and sits outside the cap.
19. **Payout in transit.** Once a payout is initiated its money is `paid`; the reason is `payout_in_transit` (with an arrival date) until the transfer lands, then `paid_out`. The arrival estimate (instant 30 minutes, weekly at 15:00 UTC the next banking day, so a Friday run lands Monday) is an engine estimate: the payment partner's own date wins when known.
20. **Ledger memos** follow the demo ledger: "Wallet top-up by card ($1,500.00)", "Card processing (2.9% + $0.30)", "Funded: Title ($2,000.00 pool + $0.00 fee reserve)" for a waived fee, "Funded by flowd: Title ($2,500.00 pool)" for a platform-funded bounty, "Paid conversion bonus x1 (tracked link): Title", "Instant cash-out fee ($0.50)" on the fee leg, "Ad commission: 10% of ad-attributed revenue (Title)".
21. **Later RevenueCat events.** A cancellation, refund or renewal often carries no flowd attribute. `matchRevenueCatEvent` accepts `known_users` (RevenueCat `app_user_id` to the creator an earlier conversion was tied to, scoped by the caller to one app) so a refund still reverses the right conversion. An event for a subscriber flowd never attributed stays `unmatched`.
