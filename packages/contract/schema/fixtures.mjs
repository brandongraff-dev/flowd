// Fixture catalogue metadata: counts, ordering and generation notes per fixture file. The fields, shape, owner and cross-references
// are derived from the entities (index.mjs buildFixtureCatalogue). Row counts are TARGETS the validator enforces as min..max.
// shape "array" rows are objects; shape "object" files are single objects (world, ticker, waitlist, state_of_app_ugc, admin_metrics).

const n = (target, min = Math.round(target * 0.85), max = Math.round(target * 1.15)) => ({ target, min, max });
const one = { target: 1, min: 1, max: 1 };

export const FIXTURE_META = {
  // ── core: identity ──────────────────────────────────────────────────────────────────────────
  world: { count: one, order: 'n/a', notes: 'Manifest first: now, personas, row counts (counts are written by the orchestrator, never by hand). Loaded before any other file.' },
  users: { count: n(152, 135, 170), order: 'role, then created_at', notes: '90 creators + about 58 brand members + 2 admins (usr_ops "Sam Okafor", plus a second Ops user). Emails are fictional (@example.com; staff @joinflowd.io). Avatars are ArtSeeds.' },
  creators: { count: n(90, 88, 92), order: 'joined_at', notes: 'Tier distribution 46/24/13/5/2 (TIER_DISTRIBUTION). cr_maya is Silver. About 35 founding creators (the earliest joiners: all Platinum and Elite and about two thirds of Gold; they carry carry_over). Maya is not founding. Handles unique. Stats reconcile with the ledger (L-09).' },
  social_accounts: { count: n(150, 120, 180), order: 'creator, platform', notes: '1 to 3 per creator, TikTok most common. Followers in the 2k..400k range; median_views_28d correlates with followers. Maya: TikTok 48.2k (median 14.2k views), Instagram 21.4k.' },
  rate_cards: { count: n(40, 30, 44), order: 'creator', notes: 'Silver and above only (tier perk); some opt out. price_per_video $80..$900 correlated with tier and median views; suggested band from the market formula.' },
  brands: { count: n(26, 26, 26), order: 'created_at', notes: '24 product brands (br_lumi first), 1 agency workspace managing 3 of them (agency_id), flowd (kind platform, br_flowd) running the content-about-us and starter bounties. Plans among the 24 product brands: 10 free, 11 pro, 3 scale; the agency workspace and flowd are on scale.' },
  brand_members: { count: n(58, 50, 66), order: 'brand, role', notes: 'Lumi has four (Jordan Ellis owner, Maren Cole reviewer, Tobias Lang finance, Aiko Tanaka viewer). Others have 1 to 3. Every brand has exactly one owner. The agency has client_approver members.' },
  apps: { count: n(25, 25, 25), order: 'connected_at', notes: '24 fictional apps (pools.mjs APPS) + app_flowd. Lumi: AI photo-editing, monthly $9.99, annual $59.99, 7-day trial. Brand colours feed generated art.' },

  // ── core: work ───────────────────────────────────────────────────────────────────────────────
  bounties: { count: n(48, 46, 50), order: 'created_at', notes: 'STATUS_MIX.bounties. Every non-draft money field reconciles (L-03..L-08). 6 for Lumi. Types: cpm 21, stacked 12, cpa 5, install_only 3, direct 7. 3 first-bounty brands used the match. Includes the flowd content-about-us bounty (always on) and 3 starter bounties (flat $5).' },
  submissions: { count: n(700, 640, 760), order: 'submitted_at', notes: 'STATUS_MIX.submissions. Versioned. About 15% have a second version; changes_requested rounds <= 2 free. Reservation unit held while open. Flow band skew: A 12%, B 34%, C 30%, D 17%, E 7%. Each carries the Rights Card snapshot accepted at submit.' },
  video_analyses: { count: n(810, 740, 880), order: 'submission, version', notes: 'One per (submission, version). Scores recompute with scoreHook/scoreFlow (formulas.mjs) from the observations. Transcripts are short and believable; phash 16 hex; QA checks: all 14 types per row.' },
  posts: { count: n(420, 390, 450), order: 'posted_at', notes: 'STATUS_MIX.posts. Views follow a log-normal by creator median with the decay curve; fraud signals produce the 40+ scores. 26 live, ~35 with an ad candidate flag (is_winner on the top decile per bounty).' },
  view_snapshots: { count: n(6300, 4500, 8000), order: 'post, taken_at', notes: '13 per fully-windowed post (6 h steps over 72 h) then weekly until now; fewer while a window is open. Source mix 95% platform_api, 5% creator_screenshot. Bot-pattern flags and exclusions (ExclusionCause with plain-language detail) only on flagged posts; views_invalid = reported - verified.' },
  post_metrics_daily: { count: n(14000, 9000, 20000), order: 'post, date', notes: 'One row per post per UTC day from posted_at to now (daily decay). Sums equal post lifetime numbers (M-01, M-02).' },
  post_metrics_hourly: { count: n(2000, 900, 3500), order: 'post, ts', notes: 'Only posts posted on or after 2026-09-30; every hour from posted_at to now. Daily sums equal post_metrics_daily for covered days (M-05).' },
  app_metrics_daily: { count: n(2250, 1800, 2600), order: 'app, date', notes: 'One row per app per day from the app\'s connected_at to now; equals the sum of post daily rows (M-04) plus pay and fee columns from the ledger.' },
  conversions: { count: n(3500, 2500, 5000), order: 'post, occurred_on', notes: 'Batches of (post, kind, source, day). About 74% tracked (link 52%, code 22%), mmp 12%, survey 8%, modelled 6%. Install 24 h, trial 72 h, paid 168 h clearing.' },
  attribution_links: { count: n(480, 430, 520), order: 'created_at', notes: 'One per approved submission with a link (issued at approval). Counters equal the post funnel (M-09). Maya\'s: "maya-lumi7" etc. short_url joinflowd.io/r/<code>.' },
  ads: { count: n(8, 6, 10), order: 'started_at', notes: 'Spark and partnership ads from winners; 2 live for Lumi (one fatigued), 1 paused, 2 ended, 1 expired, 1 requested, 1 authorised, 1 declined. Daily series length equals days live.' },

  // ── core: money ──────────────────────────────────────────────────────────────────────────────
  ledger: { count: n(6000, 3500, 9000), order: 'posted_at, id', notes: 'Double entry; every txn nets to 0 (L-01). Types: top-ups, escrow_fund, matched_budget, cpm, cpa, flat_fee, fee, commission, rights_fee, ad_fee, subscription_fee, processing, payout, payout_fee, bonus, prize, referral, clawback, escrow_refund. memo is plain English.' },
  payouts: { count: n(420, 330, 520), order: 'requested_at', notes: 'Weekly (Fridays 18:00Z since 2026-07-10) and about 12% instant. Maya: one weekly payout most weeks. proof_id on each.' },
  invoices: { count: n(90, 60, 130), order: 'issued_at', notes: 'Funding invoices per bounty, subscription invoices per month for Pro and Scale brands, ad-fee and renewal invoices. PO and cost-centre on the Scale and agency brands.' },
  money_clock: { count: n(520, 300, 800), order: 'creator, earned_at', notes: 'The creator-facing projection for every earning that is not yet paid, plus the last 21 days of paid rows. Every non-final row has eta_at and a named reason.' },
  market_series: { count: n(819, 819, 819), order: 'category, date', notes: '9 categories x 91 days (2026-07-05 to 2026-10-03). Clearing CPM follows the category base with a weekly drift and noise; p25 <= clearing <= p75.' },
  ticker: { count: one, order: 'n/a', notes: 'Totals (typical median $62, p25, p75, p90) and 40 to 80 recent events newest first, handles only. Totals equal ledger and payout sums.' },
  brand_scorecards: { count: n(24, 22, 25), order: 'brand', notes: 'One per brand with at least one decision (flowd excluded). Lumi: excellent (97), 11.2 h median. 3 brands "new" (under 10 decisions); one brand with SLA breaches and a poor band.' },
  creator_reputation: { count: n(90, 88, 92), order: 'creator', notes: 'One per creator; recomputed with creatorReliability(). New creators are provisional. Maya 93.' },

  // ── ext: market and rights ───────────────────────────────────────────────────────────────────
  offers: { count: n(36, 28, 44), order: 'created_at', notes: 'Invites 14, direct offers 16, re-buys 6; every OfferStatus. Maya: one awaiting_creator from Lumi, one mid-negotiation. Threads have 1 to 6 messages, rounds <= 3.' },
  auctions: { count: n(8, 6, 10), order: 'closes_at', notes: 'Platinum and Elite creators. 2 open, 1 scheduled, 3 awarded (second-price), 1 no_bids, 1 cancelled. Bids sealed in the data; clearing price = highest losing bid or the reserve.' },
  specs: { count: n(30, 24, 36), order: 'created_at', notes: '20 creator uploads and 10 released-from-bounty. Flow points >= 55 to be listed. 6 licensed; 1 inside first refusal.' },
  rights_grants: { count: n(190, 140, 240), order: 'starts_at', notes: 'Paid-usage grants for approved posts on bounties with paid_ads_days > 0, Spark codes and partnership permissions for promoted posts, organic rows for Maya\'s posts. 6 expiring, alerts per days left; 2 renewals.' },

  // ── ext: growth ──────────────────────────────────────────────────────────────────────────────
  daily_drops: { count: n(35, 30, 40), order: 'date', notes: 'Day -31 to day +3: 31 past drops (sold_out or closed), today 2026-10-03 upcoming at 16:00Z, 3 future upcoming. Items reference real bounties with true spot arithmetic.' },
  tournaments: { count: n(8, 6, 10), order: 'starts_at', notes: '1 live bracket (round 2), 1 open, 1 announced, 3 complete with prizes paid as ledger prize rows, 1 judging, 1 cancelled. Sponsored by flowd or a brand.' },
  tournament_entries: { count: n(120, 80, 160), order: 'tournament, seed', notes: 'About 24 entries per bracket tournament. entries_count on the tournament equals these rows.' },
  crews: { count: n(8, 6, 10), order: 'week_rank', notes: 'Led by Gold+ creators; names and badge art are generated. Maya is a member of "Late Night Edits".' },
  crew_members: { count: n(70, 40, 100), order: 'crew, role', notes: '3 to 20 per crew; member_count equals rows.' },
  streaks: { count: n(70, 60, 90), order: 'creator', notes: 'One per creator with at least one post. Maya: 6 weeks, 1 banked freeze. A few broken and resting examples.' },
  leaderboards: { count: n(28, 20, 40), order: 'scope, tier, niche', notes: 'Peer cohorts (about 30; merged for small tiers) including Silver · AI tools with Maya at rank 7; niche boards; global boards for earnings, conversion rate and score accuracy.' },
  referrals: { count: n(60, 40, 80), order: 'created_at', notes: 'Single level. Maya referred 2 (one earning, one joined). 5 agency/brand referrals with 12-month windows.' },
  lessons: { count: n(10, 10, 10), order: 'order', notes: 'The ten Academy lessons (LessonTopic): hooks, brief and Rights Card, usage rights, contract red flags, platform rules, taxes, scams, rate cards, analytics, cadence. 5 minutes or less; three quiz questions each.' },
  lesson_progress: { count: n(260, 180, 340), order: 'creator, lesson', notes: 'Maya: 6 completed, 1 in progress. 28 creators hold the Academy graduate badge.' },
  trends: { count: n(18, 14, 24), order: 'direction, weekly_change_ratio', notes: 'Rising, steady and fading formats, hooks, topics and sounds; sounds flagged not licensed for ads.' },
  formats: { count: n(11, 11, 11), order: 'rank', notes: 'Exactly one row per FormatId with full beat structure, shot list, example script and stats by category. First six flagged mvp.' },
  hooks: { count: n(84, 70, 100), order: 'hook_type, id', notes: '7 hook types, 10 to 14 each, with category examples and stats.' },
  tier_history: { count: n(110, 80, 150), order: 'at', notes: 'Promotions and grants for every non-bronze creator; Maya: Bronze to Silver on 2026-08-29; one grace-hold started and one cleared; carry-over entries for founding creators.' },
  wrapped: { count: n(6, 4, 8), order: 'creator, period_start', notes: 'Maya: September 2026 and August 2026 monthly recaps; two other creators.' },
  proofs: { count: n(120, 90, 160), order: 'created_at', notes: 'Public proof pages for payouts, months and tier-ups. 8 revoked; 12 anonymised. Maya has 5.' },
  bounty_saves: { count: n(90, 60, 130), order: 'creator, saved_at', notes: 'Maya: 5 saved, 2 joined (one a Daily Drop claim with 24 h expiry).' },
  wellbeing_settings: { count: n(12, 8, 20), order: 'creator', notes: 'Maya has Wellbeing Mode enabled with default quiet hours 22:00 to 08:00; a few others use numbers-off or pause.' },
  notification_prefs: { count: n(6, 3, 12), order: 'user', notes: 'Maya, Jordan, Sam and a few others.' },
  waitlist: { count: one, order: 'n/a', notes: 'Totals (about 18,400 creators and 1,350 brands in the waitlist) and the top 25 referrers by handle.' },
  state_of_app_ugc: { count: one, order: 'n/a', notes: 'Computed from the fixtures: clearing CPM and trial rates by category, hook-type and format leaderboards.' },
  case_studies: { count: n(6, 5, 8), order: 'published_at', notes: 'Fictional apps and quotes, labelled fictional. Numbers consistent with the app\'s posts.' },
  testimonials: { count: n(8, 6, 10), order: 'kind', notes: 'Fictional creators and brand people, labelled fictional.' },
  changelog: { count: n(14, 10, 20), order: 'date desc', notes: 'Shipping history leading to 2026-10-01.' },

  // ── ext: trust ───────────────────────────────────────────────────────────────────────────────
  feedback_notes: { count: n(260, 180, 340), order: 'submission, version, t_ms', notes: 'Timecoded notes on changes-requested and rejected versions; must-fix notes carry to the next version until resolved. Maya: 3 notes on her open revision.' },
  disputes: { count: n(14, 10, 20), order: 'opened_at', notes: 'Every DisputeKind and status. Maya: one open view_count. 3 rejection appeals (one overturned). Reply within 24 h on resolved ones.' },
  scam_reports: { count: n(22, 16, 28), order: 'created_at', notes: 'Every ScamReason; pay-to-join and off-platform-chat most common. 6 new, 5 triaged, 5 confirmed, 4 actioned, 2 dismissed.' },
  fraud_flags: { count: n(18, 12, 24), order: 'opened_at', notes: '6 open (scores 41..78), 2 monitoring, 2 cleared, 3 confirmed (clawed back). Envelope arrays have 72 values.' },
  verifications: { count: n(40, 30, 55), order: 'submitted_at', notes: 'Creator ID and age, brand business, tax, payout method; 8 pending, 3 needs_info, 2 rejected.' },
  tax_profiles: { count: n(72, 55, 90), order: 'creator', notes: 'One per creator with at least one approval. Maya: W-9 verified, YTD cleared and paid, threshold progress 0.78 (paid), set-aside 25%. A few requested and one W-8BEN.' },
  tax_docs: { count: n(80, 55, 110), order: 'creator, kind', notes: 'Collected W-9 / W-8BEN per profile; no 1099-NEC issued yet (tax year 2026 is in progress).' },
  compliance_checks: { count: n(420, 390, 450), order: 'checked_at', notes: 'One per post, 8 checks each. 6 failures (4 fixed, 1 waived with a reason, 1 blocking), 20 warnings.' },
  payout_runs: { count: n(14, 14, 14), order: 'run_date', notes: 'Fridays 2026-07-10 to 2026-10-02 (13 complete) plus the scheduled run 2026-10-09 with holds preview.' },

  // ── ext: platform and attribution ────────────────────────────────────────────────────────────
  notifications: { count: n(260, 160, 360), order: 'recipient, created_at', notes: 'Maya about 60 (cash events, decisions, drop, offers), Jordan about 30, Sam about 15, others sparse. Cash events carry amount_cents; batched ones inside quiet hours.' },
  integrations: { count: n(38, 28, 48), order: 'brand, kind', notes: 'RevenueCat for most apps, Slack for Pro and Scale, MMPs for a few, one with needs_attention (stale sync), one error.' },
  api_keys: { count: n(10, 6, 14), order: 'created_at', notes: 'Pro and Scale brands only; Lumi has one live read+write and one test key. One revoked.' },
  webhooks: { count: n(8, 5, 12), order: 'created_at', notes: 'Pro and Scale brands; Lumi has two; one failing with retries.' },
  activity_log: { count: n(160, 100, 220), order: 'at', notes: 'Team activity for Lumi (about 60) and the others; Jordan\'s actions dominate.' },
  auto_approve_rules: { count: n(6, 4, 8), order: 'created_at', notes: 'Lumi: one active (dry run would approve 31 of 50), one killed. Others draft, dry_run, paused.' },
  test_plans: { count: n(4, 3, 6), order: 'created_at', notes: 'Lumi: a running 3 hooks x 2 bodies x 2 CTAs plan with partial results and a small-sample caution.' },
  fatigue_alerts: { count: n(5, 3, 7), order: 'detected_at', notes: 'Lumi: one open on the fatigued ad (trial rate down 34%).' },
  audit_reports: { count: n(8, 6, 10), order: 'generated_at', notes: 'Public App UGC Audits; exactly 10 hooks each; price curve of 6 points.' },
  flo_suggestions: { count: n(60, 40, 90), order: 'created_at', notes: 'Maya: scripts, hook rewrites, TL;DRs and captions; Jordan: bounty drafts. Mock engine outputs.' },
  ml_models: { count: n(8, 8, 8), order: 'kind', notes: 'One per ModelKind; heuristic stage for the day-one models; calibration for the creative scorer.' },
  admin_metrics: { count: one, order: 'n/a', notes: 'Six targets with trend series ending now (TARGET_STORY), market health, queue counts that equal the real queues, the Friday run preview, and the 11 Promise proof metrics.' },
  threads: { count: n(60, 40, 90), order: 'last_message_at', notes: 'Offer, submission, bounty and support threads; in-app only; Scam Shield warnings on 4 messages; Maya has 9 threads.' },
  revenuecat_events: { count: n(1600, 1000, 2200), order: 'received_at', notes: 'One or more per tracked trial and paid conversion plus renewals and cancellations; 90% matched, 6% unmatched, 3% duplicates, 1% ignored.' },
  offer_code_pool: { count: n(90, 60, 120), order: 'app, sku', notes: 'At most 10 active codes per (app, sku). Lumi: 8 active on lumi_pro_annual. Codes rotate; some exhausted or expired.' },
  brand_lists: { count: n(12, 8, 18), order: 'brand', notes: 'Favourites and custom lists with notes and tags; Lumi has "Favourites" and "AI-tools hooks".' },
};
