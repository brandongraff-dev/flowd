// The demo world: personas, scale targets, scenario seeds and reconciliation invariants.
// DOMAIN.md section "Demo world" is generated from this file; the fixture generators and the validator read it.

import { CONSTANTS as C } from './constants.mjs';

export const CONTRACT_VERSION = '1.0.0';
export const WORLD_SEED = 20261003;

export const PERSONAS = {
  creator: {
    user_id: 'usr_maya', creator_id: 'cr_maya', handle: 'maya.makes', display_name: 'Maya Reyes',
    summary: '22, lifestyle and AI-tools niches, posts about three times a week on TikTok and Instagram (roughly two a week are paid flowd bounty posts). Silver tier, close to Gold.',
  },
  brand: {
    user_id: 'usr_jordan', member_id: 'bm_lumi_jordan', brand_id: 'br_lumi', app_id: 'app_lumi', display_name: 'Jordan Ellis',
    summary: 'Growth lead at Lumi, an AI photo-editing subscription app. Owner of the Lumi workspace on the Pro plan.',
  },
  admin: {
    user_id: 'usr_ops', display_name: 'Sam Okafor', title: 'Trust & Ops lead', email: 'sam@joinflowd.io',
    summary: 'Ops: fraud, disputes, verification, payout runs, the 90-day targets and ML calibration. Appears as "Ops".',
  },
};

/** Hard facts about the three personas. The validator asserts every number here (invariants P-*). */
export const PERSONA_FACTS = {
  maya: {
    tier: 'silver', tier_basis: 'earned',
    lifetime_cleared_cents: 164_000, approved_count: 21, decided_count: 27, approval_rate: 0.78, rejected_count: 6,
    reliability_score: 93, live_posts_count: 3, posts_count: 20, posts_status: { live: 3, window_closed: 1, cleared: 1, paid: 14, removed: 1 },
    pending_cents: 21_200, cleared_unpaid_cents: 8_600, paid_out_cents: 155_400,
    streak_weeks: 6, freezes_banked: 1, academy_lessons_completed: 6,
    followers: { tiktok: 48_200, instagram: 21_400 }, median_views_28d: { tiktok: 14_200 }, us_audience_ratio: 0.71,
    country: 'US', niches: ['lifestyle', 'ai_tools'], founding: false, payout_method: 'Bank account ••4821', leaderboard_rank: '7 of 30 (Silver · AI tools)',
    tier_progress_to_gold: 0.82,
  },
  lumi: {
    plan: 'pro', category: 'ai_photo', verification: 'verified', bounties: 6, wallet_balance_cents: 248_000, decision_hours_median: 11.2,
    reliability_band: 'excellent', members: ['Jordan Ellis (owner)', 'Maren Cole (reviewer)', 'Tobias Lang (finance)', 'Aiko Tanaka (viewer)'],
  },
  now: C.now,
};

/** Headline scale of the demo world. Per-file counts are in the fixture catalogue (fixtures.mjs). */
export const SCALE = [
  { key: 'apps', target: 24, note: 'Fictional customer apps in 9 categories, plus flowd\'s own app (25 app rows).' },
  { key: 'brands', target: 26, note: '24 product brands (one per app) + 1 agency workspace + flowd (platform).' },
  { key: 'creators', target: 90, note: 'Believable tier distribution (below).' },
  { key: 'bounties', target: 48, note: 'Includes flowd\'s content-about-us bounty, starter bounties and private direct bounties.' },
  { key: 'submissions', target: 700, note: 'About 810 versions; about 15% have a revision round.' },
  { key: 'posts', target: 420, note: 'All PostStatus values represented.' },
  { key: 'history_days', target: 90, note: 'Daily metrics, market series and ledger back to 2026-07-05.' },
  { key: 'settled_creator_pay_cents', target: 3_600_000, note: 'About $36,000 of creator pay settled in 90 days (cleared + paid), heavy-tailed: top-decile creators earn about $640 a month, the median about $62.' },
  { key: 'platform_fees_cents', target: 390_000, note: 'About $3,900 of take-rate fees on settled spend.' },
  { key: 'typical_creator_30d_cents', target: 6_200, note: 'Median 30-day cleared earnings of active creators: $62.' },
];

export const TIER_DISTRIBUTION = {
  bronze: 46, silver: 24, gold: 13, platinum: 5, elite: 2,
  note: 'Total 90. Platinum and Elite creators, and about two thirds of Gold, are founding creators whose verified prior history (carry_over) counts toward the thresholds; those tiers cannot be earned that fast in 90 days on flowd alone. Maya is not founding and has no carry-over.',
};

export const CATEGORY_MIX = {
  ai_photo: 3, ai_assistant: 2, fitness: 3, language: 2, productivity: 3, finance: 3, sleep_mind: 3, music_audio: 2, lifestyle: 3,
  note: 'Number of apps per category (24).',
};

export const ACTIVITY_RAMP = {
  weeks: 13,
  weekly_share: [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.13, 0.10],
  note: 'Share of all submissions created in each week since launch (week 1 = 2026-07-05). The last week is partial.',
};

export const STATUS_MIX = {
  submissions: { qa_pending: 6, in_review: 38, changes_requested: 22, approved: 24, posted: 420, rejected: 108, appealed: 6, withdrawn: 34, expired: 14, released: 28, note: 'About 700. in_review includes 7 stale (48-72 h) and 3 breached.' },
  posts: { live: 26, window_closed: 5, held: 4, cleared: 52, paid: 322, removed: 6, clawed_back: 5, note: 'About 420. Live = posted within the last 72 h.' },
  bounties: { draft: 2, awaiting_funding: 2, scheduled: 1, live: 22, paused: 1, filled: 4, ended: 4, settled: 11, cancelled: 1, note: '48. All settled bounties reconcile with refunds.' },
};

/** Day-90 target storyline for the admin control tower. Actuals must reproduce these statuses. */
export const TARGET_STORY = [
  { id: 'first_dollar_hours', actual: 58, status: 'achieved' },
  { id: 'filled_48h_ratio', actual: 0.79, status: 'at_risk' },
  { id: 'second_bounty_ratio', actual: 0.64, status: 'achieved' },
  { id: 'repost_30d_ratio', actual: 0.38, status: 'achieved' },
  { id: 'invites_per_creator', actual: 0.41, status: 'at_risk' },
  { id: 'creators_per_live_bounty', actual: 31, status: 'achieved' },
];

/**
 * Scenario seeds: moments every screen needs data for. Fixture generators must produce each one (the validator reports unmet
 * scenarios as warnings, and as errors with --strict).
 */
export const SCENARIOS = [
  // Maya
  { id: 'maya-money-clock', who: 'cr_maya', text: 'Maya has 20 posts: 3 live and accruing, 1 window_closed awaiting its clearing run, 1 cleared at the 14:00 run today ($86.00, waiting for Friday), 14 paid, 1 removed. $212.00 is pending in total (accruing + pending). Every row has a dated ETA and a named reason.' },
  { id: 'maya-submission-states', who: 'cr_maya', text: 'Maya has: two submissions in review (one decides in about 11 h), one with changes requested (3 timecoded notes: two must-fix, one suggestion; round 1 of 2), one approved and not posted yet (link, code and #ad ready), one rejected 2 days ago with a reason code and evidence and the appeal not used yet.' },
  { id: 'maya-dispute', who: 'cr_maya', text: 'Maya has one open view_count dispute on a cleared post (evidence requested), 24 h reply SLA running.' },
  { id: 'maya-offer', who: 'cr_maya', text: 'Lumi (Jordan) sent Maya a direct offer, awaiting_creator, with a market-suggested band and Rights Card; a second offer from another brand is mid-negotiation (one counter, awaiting_brand).' },
  { id: 'maya-rights', who: 'cr_maya', text: 'A Maya post runs as a Lumi Spark ad; its paid-usage rights expire in 14 days (alert 14 sent), renewal priced at 25% of base fee per 30 days.' },
  { id: 'maya-tier-progress', who: 'cr_maya', text: 'Maya is Silver, 82% of the way to Gold (the bottleneck is lifetime cleared: $1,640 of $2,000). One grace-hold example exists on another creator.' },
  { id: 'maya-streak', who: 'cr_maya', text: 'Six-week streak (2026-W35 to W40), one banked freeze, next freeze in two weeks, no rest week declared.' },
  { id: 'maya-drop', who: 'cr_maya', text: 'Today\'s Daily Drop is upcoming (16:00Z, two hours away) with six bounties; yesterday\'s drop sold out one item and closed; a past drop has Maya\'s claim.' },
  { id: 'maya-first-dollar-done', who: 'cr_maya', text: 'Maya\'s first dollar cleared on 2026-07-27, 66 hours after her first approval; her Wrapped for September 2026 and a public proof page exist.' },
  // Lumi
  { id: 'lumi-review-queue', who: 'br_lumi', text: 'Lumi\'s review queue has 6 submissions waiting: two stale (48-72 h), one breached, one with a fraud-evidence warning, one duplicate hash match; 11.2 h median decision time.' },
  { id: 'lumi-bounty-states', who: 'br_lumi', text: 'Lumi has six bounties: live stacked (Glow-up reveal), live CPM, live CPA-only (6% fee), settled (with refund), awaiting_funding draft with a passing Brief Lint, filled.' },
  { id: 'lumi-winner-promotion', who: 'br_lumi', text: 'A winning Lumi post is promoted as a Spark ad (live 14 days, commission accruing), a second ad is fatigued (trial rate down 34% from peak) with a fatigue alert.' },
  { id: 'lumi-auto-approve', who: 'br_lumi', text: 'One active guarded auto-approve rule (dry run: would have approved 31 of the last 50), one killed rule.' },
  { id: 'lumi-attribution', who: 'br_lumi', text: 'Lumi\'s attribution kit is healthy: RevenueCat connected (webhook events flowing), SDK verified, 8 active codes on the annual SKU out of the 10 cap, one unmatched RevenueCat event.' },
  // Platform
  { id: 'platform-fraud-queue', who: 'usr_ops', text: 'Six open fraud flags across score bands (one bought-views pattern at 78, one cap-clustering creator, one duplicate), one confirmed clawback, two cleared false positives.' },
  { id: 'platform-sla-breach', who: 'usr_ops', text: 'Three submissions have breached the 72 h SLA at one brand (escalated); one approve-if-clean timeout approval exists.' },
  { id: 'platform-holds', who: 'usr_ops', text: 'The next payout run (Fri 2026-10-09 18:00Z) has holds for tax info (3), identity check (2), dispute (1), fraud review (2).' },
  { id: 'platform-scam', who: 'usr_ops', text: 'Scam queue has a pay-to-join report, an off-platform-chat report and a burner-account demand that was caught by Brief Lint.' },
  { id: 'platform-released-spec', who: 'usr_ops', text: 'Approved-but-unused submissions past 30 days are released to the Spec Market; one is inside the brand\'s 7-day first-refusal window.' },
  { id: 'platform-auction', who: 'usr_ops', text: 'One open sealed-bid auction (Platinum creator), one awarded with a second-price clearing amount, one with no bids.' },
  { id: 'platform-tournament', who: 'usr_ops', text: 'One live bracket tournament (Round 2), one open for entries, one complete with prizes paid.' },
  { id: 'platform-matched-first-bounty', who: 'usr_ops', text: 'At least three brands used the matched first bounty (fee waived, up to $500 matched).' },
  { id: 'platform-tier-grace', who: 'usr_ops', text: 'One creator is in a 30-day grace hold after an approval-rate dip; one Platinum creator was promoted this week.' },
  { id: 'platform-compliance-fail', who: 'usr_ops', text: 'One post failed the disclosure audit and is held (held_compliance) until the creator edits the caption.' },
];

export const PERSONA_NOTES = [
  'docs/PRODUCT_SPEC.md, ROUTES.md and SCREENS.md describe Maya as Gold with a six-week streak. The contract is authoritative: Maya is SILVER at 82% of the way to Gold (the brief for this contract fixes $1,640 lifetime cleared, 21 approved, 78% approval). Copy that says Gold for the demo creator is a doc slip; the app reads tier from the data.',
  'Founding creators are the only way Platinum and Elite exist in a 90-day-old market: their verified prior history (carry_over) counts toward the thresholds and the founding badge gives free instant cash-outs for 12 months. Maya is not a founding creator, so she sees the instant fee preview.',
];

/**
 * Reconciliation invariants. `check` says where it is enforced: 'base' = scripts/validate-fixtures.mjs enforces it today;
 * 'fixture' = the fixture agent extends the validator when the data exists.
 */
export const INVARIANTS = [
  // structure
  { id: 'S-01', group: 'Structure', check: 'base', text: 'Every row has every required field, with the declared type; enum values are members of their enum; optional fields are omitted, never null.' },
  { id: 'S-02', group: 'Structure', check: 'base', text: 'ids are unique per table and carry the entity prefix; composite keys are unique.' },
  { id: 'S-03', group: 'Structure', check: 'base', text: 'Every ref resolves to a row of the referenced table.' },
  { id: 'S-04', group: 'Structure', check: 'base', text: 'Timestamps are ISO-8601 UTC seconds with a trailing Z; dates are YYYY-MM-DD; money is an integer number of cents; ratios are within 0..1.' },
  { id: 'S-05', group: 'Structure', check: 'base', text: 'No event timestamp is later than now (2026-10-03T14:00:00Z). Only schedule and ETA fields may be in the future.' },
  { id: 'S-06', group: 'Structure', check: 'base', text: 'No remote image or real brand URL appears anywhere: urls end in joinflowd.io, .example or a platform domain (text only); art is always an ArtSeed.' },
  { id: 'S-07', group: 'Structure', check: 'base', text: 'World counts equal the actual row counts; personas resolve.' },
  // money
  { id: 'L-01', group: 'Ledger', check: 'base', text: 'Every ledger txn_id nets to exactly 0 (signed amounts).' },
  { id: 'L-02', group: 'Ledger', check: 'base', text: 'wallet:br_x balance in the ledger equals brands.wallet_balance_cents.' },
  { id: 'L-03', group: 'Ledger', check: 'base', text: 'Per bounty: escrow_funded_cents = reserved_cents + spent_cents + remaining_cents + refunded_cents, all non-negative.' },
  { id: 'L-04', group: 'Ledger', check: 'base', text: 'Per bounty: the ledger balance of escrow:bnty_x equals reserved_cents + remaining_cents (money not yet spent or refunded).' },
  { id: 'L-05', group: 'Ledger', check: 'base', text: 'bounty.funded is true iff escrow_funded_cents >= budget_cents + fee_reserve_cents; scheduled, live, paused, filled, ended and settled bounties are funded; draft and awaiting_funding are not.' },
  { id: 'L-06', group: 'Ledger', check: 'base', text: 'bounty.reserved_cents equals the sum of reserved_cents of its submissions.' },
  { id: 'L-07', group: 'Ledger', check: 'base', text: 'A settled bounty has reserved_cents 0, remaining_cents 0 and refunded_cents + spent_cents = escrow_funded_cents.' },
  { id: 'L-08', group: 'Ledger', check: 'base', text: 'bounty.spent_cents equals the escrow debits of types cpm, cpa, flat_fee and fee (negated).' },
  { id: 'L-09', group: 'Ledger', check: 'base', text: 'creator.lifetime_cleared_cents = carry_over.cleared_cents + sum of the creator\'s earning rows with status cleared or paid.' },
  { id: 'L-10', group: 'Ledger', check: 'base', text: 'Earning rows with status paid have a payout_id; payouts: gross = sum of included earning rows, net = gross - fee, fee follows the instant formula; weekly fee 0.' },
  { id: 'L-11', group: 'Ledger', check: 'base', text: 'Every cpm / cpa / flat_fee settlement transaction has a fee leg equal to round(pay x take_rate) of its bounty (0 for waived first bounties).' },
  { id: 'L-12', group: 'Ledger', check: 'base', text: 'A post\'s settled pool pay (cpm + cpa) never exceeds the bounty per_video_cap_cents.' },
  { id: 'L-13', group: 'Ledger', check: 'base', text: 'CPA ledger rows exist only for conversions with source link or code (payable) and status cleared.' },
  { id: 'L-14', group: 'Ledger', check: 'base', text: 'Ads: spend = sum of daily spend; commission = round(rate x revenue inside the 60-day window); platform fee = round(1% x spend).' },
  { id: 'L-15', group: 'Ledger', check: 'base', text: 'Invoices: total = subtotal + processing + tax; paid funding invoices link to an escrow_fund or wallet_topup transaction.' },
  { id: 'L-16', group: 'Ledger', check: 'base', text: 'payout_runs totals equal the payouts carrying their run_id; money_clock sums per creator equal the wallet figures (pending, cleared, paid).' },
  { id: 'L-17', group: 'Ledger', check: 'base', text: 'Platform ledger accounts never go negative, except platform:promo and platform:matching (treasury accounts funded outside the ledger) and external:* (the outside world).' },
  { id: 'L-18', group: 'Ledger', check: 'base', text: "A post's earnings total (cpm + cpa + commission + flat) equals its creator ledger rows plus its pending, accruing and held Money Clock rows (removed posts earn nothing)." },
  // metrics
  { id: 'M-01', group: 'Metrics', check: 'base', text: 'posts.views equals the sum of post_metrics_daily.views; likes, comments, shares and saves likewise.' },
  { id: 'M-02', group: 'Metrics', check: 'base', text: 'post.funnel clicks, installs, trials, paid and est_* equal the sums of post_metrics_daily; funnel.views = post.views.' },
  { id: 'M-03', group: 'Metrics', check: 'base', text: 'bounty.funnel equals the sum of its posts\' funnels; bounty.counts equal counts of its submissions and posts.' },
  { id: 'M-04', group: 'Metrics', check: 'base', text: 'app_metrics_daily rows equal the sum of the app\'s posts\' daily rows for that date.' },
  { id: 'M-05', group: 'Metrics', check: 'base', text: 'post_metrics_hourly: for every full UTC day covered, the hourly sums equal the daily row; hourly rows exist only for posts posted since 2026-09-30.' },
  { id: 'M-06', group: 'Metrics', check: 'base', text: 'view_snapshots: views_verified non-decreasing per post; delta_verified = difference; the snapshot at window_ends_at equals post.window_views; the last snapshot <= post.views.' },
  { id: 'M-07', group: 'Metrics', check: 'base', text: 'Tracked funnel is monotonic per post, bounty and app: views >= clicks >= installs >= trials >= paid. Estimated counts are separate.' },
  { id: 'M-08', group: 'Metrics', check: 'base', text: 'Conversion batches: sums of quantity by (post, kind) for deterministic sources equal the post funnel; payable only for link and code; confidence follows the source.' },
  { id: 'M-09', group: 'Metrics', check: 'base', text: 'attribution_links counters equal the post funnel; promo codes are unique per app.' },
  { id: 'M-10', group: 'Metrics', check: 'fixture', text: 'market_series: p25 <= clearing <= p75 per day; one row per (category, date) for the 91 days to now.' },
  // state
  { id: 'T-01', group: 'State', check: 'base', text: 'post.window_ends_at = posted_at + 72 h; status live iff posted within the last 72 h (and not removed); window_closed within 12 h after; cleared and paid only after the clearing run.' },
  { id: 'T-02', group: 'State', check: 'base', text: 'Submission: version = versions.length; sla_state follows the hours in queue; sla_due_at = version submitted_at + 72 h; rejected has a decision with reason_code and evidence; posted has post_id; reserved_cents is 0 once rejected, withdrawn, expired, released or posted.' },
  { id: 'T-03', group: 'State', check: 'base', text: 'creator.tier equals tierFor(stats) unless tier_basis is grace_hold (then tier_hold_until is set and in the future); approval_rate = round(approved / decided, 2); elite creators have tier_review.' },
  { id: 'T-04', group: 'State', check: 'base', text: 'creator_reputation and brand_scorecards scores recompute from their components with the FORMULAS weights.' },
  { id: 'T-05', group: 'State', check: 'base', text: 'post.fraud.score = min(100, sum of signal points) with points <= max_points; band matches; score >= 40 posts that passed window_closed are held or have a resolved flag.' },
  { id: 'T-06', group: 'State', check: 'base', text: 'money_clock: accruing, pending and cleared rows have eta_at; every non-final row has a reason from MoneyClockReason; no bare pending.' },
  { id: 'T-07', group: 'State', check: 'base', text: 'streaks: current_weeks equals creators.streak_weeks; freezes_banked <= 2; history ends at the current ISO week.' },
  { id: 'T-08', group: 'State', check: 'base', text: 'leaderboards: ranks contiguous from 1; cohort_size = entries.length; promotion zone only on cohort boards.' },
  { id: 'T-09', group: 'State', check: 'base', text: 'offers: rounds <= 3; expires_at = last activity + 7 days; thread ordered by time; accepted offers have escrow_funded and a bounty_id.' },
  { id: 'T-10', group: 'State', check: 'base', text: 'daily_drops: spots_left = spots_total - claims; today\'s drop is upcoming; claims are unique per creator and item.' },
  { id: 'T-11', group: 'State', check: 'base', text: 'rights_grants: ends_at = starts_at + term; alerts_sent consistent with days left; ads stop at rights end.' },
  { id: 'T-12', group: 'State', check: 'base', text: 'offer_code_pool: at most 10 active (available or assigned) codes per (app, sku); codes unique per app.' },
  { id: 'T-13', group: 'State', check: 'base', text: 'formats has exactly 11 rows (one per FormatId); hooks has at least 10 per HookType; lessons has exactly 10 with three quiz questions each.' },
  { id: 'T-14', group: 'State', check: 'base', text: 'admin_metrics.queues equal the open counts in fraud_flags, disputes, verifications, scam_reports and the submission SLA states.' },
  // ext fixtures (scripts/validate-ext.mjs): checks that tie the ext tables to the core money graph and to each other
  { id: 'E-01', group: 'Ext fixtures', check: 'base', text: 'Academy: one lesson_progress row per (creator, lesson); completed rows carry quiz_score >= 0.66, completed_at and badge_awarded; lessons.completions equals the completed rows; the Academy bonus on creator_reputation is 0.5 per completed lesson (warning).' },
  { id: 'E-02', group: 'Ext fixtures', check: 'base', text: 'Tax Desk: ytd cleared and paid equal the ledger; set-aside = round(ytd cleared x rate); threshold progress = paid / $2,000; the form follows the country; no 1099-NEC is issued while the tax year runs.' },
  { id: 'E-03', group: 'Ext fixtures', check: 'base', text: 'Compliance and fraud: one audit per post with every check type; overall follows the checks; blocks_settlement = failed and not fixed or waived; every post scoring 40 or more has a fraud flag with the post\'s score, a 72-hour envelope and a 24-hour SLA.' },
  { id: 'E-04', group: 'Ext fixtures', check: 'base', text: 'Growth: crews have 3 to 20 members, a Gold-or-above lead and member sums; tournament entries, prizes and winners add up; referrals follow CONSTANTS; proofs match their payouts and ticker events; Wrapped totals equal the ledger; tier history stats meet the tier and climb one tier at a time.' },
  { id: 'E-05', group: 'Ext fixtures', check: 'base', text: 'Platform: matched RevenueCat events point at link or code conversions, other events carry no match ids, duplicates share their original\'s idempotency key; offer codes, API keys, webhooks, auto-approve rules (dry run first, 10% spot-check), test plans, fatigue alerts (30% drop), audit reports and the activity log are internally consistent.' },
  { id: 'E-06', group: 'Ext fixtures', check: 'base', text: 'State of App UGC: nine categories, seven hook types, eleven formats; hook shares add up to 1.' },
  { id: 'E-07', group: 'Ext fixtures', check: 'base', text: 'Trust queues: dispute reply and resolution SLAs, scam-report case ids and 24-hour SLA, verification SLA and reasons, feedback notes inside the video and resolved only by a later version.' },
  { id: 'E-08', group: 'Ext fixtures', check: 'base', text: 'Notifications: the audience matches the recipient, creator links are flowd:// and web links are routes, cash events carry amounts and are never batched, delivery and read times are ordered.' },
  { id: 'E-09', group: 'Ext fixtures', check: 'base', text: 'Maya (ext): streak, academy count, Tax Desk, Wellbeing Mode, cohort rank, saved bounties, proofs, Wrapped, threads, notifications and open feedback notes match her persona story.' },
  // personas and scale
  { id: 'P-01', group: 'Personas', check: 'base', text: 'Maya\'s numbers equal PERSONA_FACTS.maya (tier, $1,640 cleared, 21 approved, 78% approval, 3 live posts, $212.00 pending, $86.00 cleared unpaid, streak 6).' },
  { id: 'P-02', group: 'Personas', check: 'base', text: 'Lumi is on Pro with Jordan Ellis as owner and at least six bounties; the admin user exists.' },
  { id: 'Z-01', group: 'Scale', check: 'base', text: 'Row counts are within the min and max of the fixture catalogue.' },
  { id: 'Z-02', group: 'Scale', check: 'base', text: 'Creator tier distribution is within one creator of TIER_DISTRIBUTION per tier.' },
  { id: 'Z-03', group: 'Scale', check: 'base', text: 'Every enum value marked for coverage appears at least once in the fixtures (warning; error with --strict).' },
  { id: 'Z-04', group: 'Scale', check: 'base', text: 'Every SCENARIOS entry that has an automated checker is met (warning; error with --strict); the rest are listed as notes for manual verification.' },
];
