// CONSTANTS: every number the product depends on, defined once.
// Source of truth for packages/contract/types.ts (CONSTANTS), the DOMAIN.md CONSTANTS table, the fixture
// generators and the validator. Mirrors docs/DECISIONS.md; anything DECISIONS does not fix is tagged
// "CONTRACT" in CONSTANT_NOTES (a contract-defined default to be tested with design partners).
// Money is integer cents; rates are 0..1 ratios; durations are named with their unit.

export const CONSTANTS = {
  now: '2026-10-03T14:00:00Z',

  world: {
    launch_date: '2026-07-05',
    history_days: 90,
    currency: 'USD',
    public_domain: 'joinflowd.io',
    api_host: 'api.joinflowd.io',
    app_host: 'app.joinflowd.io',
    contact_email: 'hello@joinflowd.io',
    min_age: 18,
  },

  plans: {
    free: {
      label: 'Free',
      price_cents_month: 0,
      take_rate: 0.12,
      features: ['escrow', 'review_queue', 'funnel', 'creator_discovery', 'rights_card', 'free_tools', 'brief_lint', 'attribution_kit'],
    },
    pro: {
      label: 'Pro',
      price_cents_month: 29_900,
      take_rate: 0.10,
      features: [
        'escrow', 'review_queue', 'funnel', 'creator_discovery', 'rights_card', 'free_tools', 'brief_lint', 'attribution_kit',
        'learned_scorer', 'guarded_auto_approve', 'market_view', 'rights_vault', 'test_planner', 'slack', 'api', 'winner_promotion',
      ],
    },
    scale: {
      label: 'Scale',
      price_cents_month: 99_900,
      take_rate: 0.08,
      features: [
        'escrow', 'review_queue', 'funnel', 'creator_discovery', 'rights_card', 'free_tools', 'brief_lint', 'attribution_kit',
        'learned_scorer', 'guarded_auto_approve', 'market_view', 'rights_vault', 'test_planner', 'slack', 'api', 'winner_promotion',
        'multi_app', 'agency_workspaces', 'roles', 'finance_pack', 'slas', 'white_label_reports',
      ],
    },
  },

  fees: {
    cpa_only_take_rate: 0.06,
    first_bounty_fee_waived: true,
    matched_first_bounty_cap_cents: 50_000,
    ad_spend_fee_rate: 0.01,
    weekly_payout_fee_cents: 0,
    instant_payout_rate: 0.015,
    instant_payout_min_cents: 50,
    instant_payout_max_cents: 1_500,
    instant_min_amount_cents: 500,
    creator_platform_fee_rate: 0,
    card_processing_rate: 0.029,
    card_processing_fixed_cents: 30,
  },

  pay: {
    default_cpm_cents: 200,
    floor_cpm_cents: 50,
    default_per_video_cap_cents: 25_000,
    default_cpa_install_cents: 40,
    default_cpa_trial_cents: 150,
    default_cpa_paid_cents: 400,
    ad_commission_rate: 0.10,
    ad_commission_days: 60,
    cpa_window_days: 30,
    min_bounty_budget_cents: 10_000,
    extra_revision_pay_cents: 1_000,
  },

  windows: {
    view_window_hours: 72,
    fraud_check_max_hours: 12,
    clearing_run_hour_utc: 14,
    clearing_buffer_hours: 2,
    weekly_payout_weekday_utc: 5,
    weekly_payout_hour_utc: 18,
    cpa_clear_hours: { install: 24, trial: 72, paid: 168 },
    snapshot_interval_hours: 6,
    offer_expiry_days: 7,
    max_counter_rounds: 3,
  },

  review: {
    sla_hours: 72,
    stale_after_hours: 48,
    revision_rounds_included: 2,
    appeals_per_rejection: 1,
    appeal_window_days: 7,
    appeal_decision_sla_hours: 72,
    unused_release_days: 30,
    first_refusal_days: 7,
    revision_expiry_days: 14,
    timeout_policy_default: 'escalate',
    undo_seconds: 10,
    post_approval_rejection: 'proven_fraud_only',
  },

  auto_approve: {
    default_min_flow_band: 'B',
    default_min_creator_approved_posts: 3,
    default_min_creator_approval_rate: 0.9,
    default_max_fraud_score: 20,
    default_min_us_audience_ratio: 0.5,
    spot_check_ratio: 0.10,
    dry_run_sample: 50,
    first_time_creators_manual: true,
    scope: 'organic_only',
  },

  rights: {
    organic_always: true,
    paid_ads_default_days: 90,
    renewal_fee_pct_of_base_per_30d: 0.25,
    expiry_alert_days: [30, 14, 7],
    ai_likeness_default: false,
    spark_code_options_days: [7, 30, 60, 365],
    exclusivity_options_days: [0, 14, 30, 60],
    auto_end_ads_at_rights_expiry: true,
  },

  tiers: {
    order: ['bronze', 'silver', 'gold', 'platinum', 'elite'],
    thresholds: {
      bronze: { lifetime_cleared_cents: 0, approved_count: 0, approval_rate_min: 0, reliability_min: 0, manual_review: false },
      silver: { lifetime_cleared_cents: 25_000, approved_count: 5, approval_rate_min: 0.70, reliability_min: 0, manual_review: false },
      gold: { lifetime_cleared_cents: 200_000, approved_count: 25, approval_rate_min: 0.75, reliability_min: 0, manual_review: false },
      platinum: { lifetime_cleared_cents: 1_000_000, approved_count: 80, approval_rate_min: 0.80, reliability_min: 90, manual_review: false },
      elite: { lifetime_cleared_cents: 5_000_000, approved_count: 250, approval_rate_min: 0.85, reliability_min: 95, manual_review: true },
    },
    perks: {
      bronze: { early_access_hours: 0, rate_card: false, instant_cashout_free_per_week: 0, instant_cashout_unlimited: false, crews_lead: false, auctions: false, featured_profile: false },
      silver: { early_access_hours: 1, rate_card: true, instant_cashout_free_per_week: 0, instant_cashout_unlimited: false, crews_lead: false, auctions: false, featured_profile: false },
      gold: { early_access_hours: 3, rate_card: true, instant_cashout_free_per_week: 1, instant_cashout_unlimited: false, crews_lead: true, auctions: false, featured_profile: false },
      platinum: { early_access_hours: 6, rate_card: true, instant_cashout_free_per_week: 0, instant_cashout_unlimited: true, crews_lead: true, auctions: true, featured_profile: false },
      elite: { early_access_hours: 12, rate_card: true, instant_cashout_free_per_week: 0, instant_cashout_unlimited: true, crews_lead: true, auctions: true, featured_profile: true },
    },
    demotion_grace_days: 30,
    founding_carry_over_counts: true,
  },

  founding: {
    creator_count: 200,
    free_instant_months: 12,
    badge: 'founding_creator',
    carry_over_counts: true,
  },

  streaks: {
    unit: 'iso_week',
    min_posts_per_week: 1,
    freeze_earned_every_weeks: 4,
    freeze_bank_max: 2,
    rest_weeks_per_quarter: 2,
    slack_mode_weeks: 2,
    inactivity_penalty: false,
    guilt_notifications: false,
  },

  leaderboards: {
    cohort_target_size: 30,
    cohort_min_size: 8,
    cohort_max_size: 36,
    promotion_zone_size: 5,
    demotion_zone: false,
    global_board_size: 50,
    metrics: ['earnings', 'conversion_rate', 'score_accuracy'],
    week_starts_on: 'monday',
  },

  daily_drop: {
    hour_utc: 16,
    claim_window_hours: 24,
    items_per_drop: 6,
    min_spots_per_item: 8,
    max_spots_per_item: 40,
    real_inventory_only: true,
  },

  tournaments: {
    min_prize_pool_cents: 25_000,
    default_rounds: 3,
    entry_fee_cents: 0,
    funded_by: 'platform_or_sponsor_brand',
  },

  crews: {
    max_members: 20,
    min_members: 3,
    lead_min_tier: 'gold',
    weekly_goal_bonus_rate: 0.03,
    weekly_goal_bonus_cap_cents: 25_000,
    funded_by: 'platform',
  },

  referrals: {
    creator_share_rate: 0.05,
    creator_share_days: 90,
    creator_share_cap_per_referee_cents: 10_000,
    levels: 1,
    funded_by: 'platform',
    brand_partner_share_rate: 0.10,
    brand_partner_share_months: 12,
  },

  auctions: {
    pricing: 'second_price_uniform',
    min_slots: 1,
    max_slots: 5,
    min_duration_hours: 72,
    max_duration_days: 7,
    min_creator_tier: 'platinum',
    reserve_floor_cents: 5_000,
  },

  specs: {
    min_flow_points_to_list: 55,
    default_paid_ads_days: 90,
    price_floor_cents: 1_500,
    price_cap_cents: 50_000,
    first_refusal_days: 7,
  },

  fraud: {
    review_threshold: 40,
    hold_threshold: 70,
    bands: { clean: [0, 19], watch: [20, 39], review: [40, 69], high: [70, 100] },
    review_sla_hours: 24,
    duplicate_phash_max_distance: 6,
    signals: {
      view_spike_no_engagement: { max_points: 25, rule: 'Hourly views at least 10x the post baseline while engagement stays under 0.5% of views.' },
      cap_clustering: { max_points: 20, rule: 'Earnings land within 2% of the per-video cap on 3 of the creator\'s last 5 posts, or views snap to the cap.' },
      bought_views_pattern: { max_points: 30, rule: 'Step-function curve: 80% or more of views arrive in two hourly buckets, flat otherwise, and over 60% of views come from the "other" source.' },
      geo_mismatch: { max_points: 15, rule: 'Audience in the bounty target region is more than 25 points below the bounty minimum.' },
      view_to_follower_outlier: { max_points: 10, rule: 'Views are more than 40x followers on an account under 5,000 followers.' },
      new_account: { max_points: 10, rule: 'Social account younger than 30 days.' },
      duplicate_hash: { max_points: 20, rule: 'Perceptual hash within distance 6 of another creator\'s video or the creator\'s own earlier post.' },
      engagement_anomaly: { max_points: 10, rule: 'Likes under 0.4% of views, or comment ratio an outlier against the account\'s 28-day norm.' },
      traffic_source_anomaly: { max_points: 10, rule: 'More than 50% of views from external or "other" sources.' },
      curve_shape: { max_points: 10, rule: 'No natural decay: hourly views flat or rising for more than 24 hours.' },
    },
  },

  scores: {
    bands: { A: 85, B: 70, C: 55, D: 40, E: 0 },
    band_view_multiplier: { A: 1.6, B: 1.15, C: 0.85, D: 0.5, E: 0.3 },
    checklist_label: 'Checklist score. It gets smarter as bounties settle.',
    // Each item: full points, half points (partial) or 0. Weights of each checklist sum to 100.
    hook_checklist: [
      { id: 'hook_lands_2s', label: 'Hook lands by 2.0s', weight: 20, rule: 'Full if the hook line lands by 2.0 s; half by 3.0 s; otherwise 0.' },
      { id: 'onscreen_text_matches', label: 'On-screen text mirrors the spoken hook within 1s', weight: 15, rule: 'Full if the spoken hook is also on screen as text within 1.0 s; half if it appears by 2.0 s or only partly matches.' },
      { id: 'face_early', label: 'A face is on screen within the first second', weight: 15, rule: 'Full if a face is on screen within 1.0 s; half by 2.0 s. Faceless formats get full points.' },
      { id: 'app_visible_3s', label: 'App or product visible by 3s', weight: 15, rule: 'Full if the app is visible by 3.0 s; half by 5.0 s.' },
      { id: 'pattern_interrupt', label: 'Motion or pattern interrupt in the first 1.5s', weight: 10, rule: 'Full if there is a cut, motion or visual pattern interrupt in the first 1.5 s.' },
      { id: 'proven_hook_type', label: 'Uses a proven hook type', weight: 10, rule: 'Full if the hook is a library hook type with an above-median trial rate; half for any other library hook type; 0 otherwise.' },
      { id: 'speech_starts_fast', label: 'Speech starts within 1s, no dead air', weight: 10, rule: 'Full if speech starts within 1.0 s; half within 2.0 s.' },
      { id: 'captions_safe_zone', label: 'Captions burned in, inside safe zones', weight: 5, rule: 'Full if captions are burned in and inside the platform safe zones; otherwise 0.' },
    ],
    flow_checklist: [
      { id: 'hook_score', label: 'Hook Score (scaled)', weight: 30, rule: 'round(Hook Score points x 0.30).' },
      { id: 'required_beats', label: 'Required beats covered', weight: 25, rule: 'round(25 x required beats found / required beats in the brief).' },
      { id: 'app_visible_early', label: 'App on screen early', weight: 10, rule: 'Full if the app is on screen by 3.0 s; half by 8.0 s.' },
      { id: 'disclosure', label: 'Disclosure present (audio and on-screen)', weight: 10, rule: '10 if #ad is both spoken and on screen; 5 if only one; 0 if neither (a missing disclosure also blocks settlement).' },
      { id: 'length_ok', label: 'Length 15 to 30 seconds', weight: 5, rule: 'Full for 15 to 30 s; half for 10 to 15 s or 30 to 45 s; otherwise 0.' },
      { id: 'captions_safe_zone', label: 'Captions inside safe zones', weight: 5, rule: 'Full if captions are inside the platform safe zones; otherwise 0.' },
      { id: 'single_cta_win_state', label: 'One CTA, ends on a win state', weight: 5, rule: 'Full if there is exactly one CTA and the video ends on a win state; half if one of the two.' },
      { id: 'audio_clear', label: 'Audio clear, no dead air', weight: 5, rule: 'Full if speech is clear with no dead air over 1.0 s; half if there is one gap.' },
      { id: 'format_fit', label: 'Follows the chosen format\'s beats', weight: 5, rule: 'Full if the video follows the format\'s beat order; half if one beat is out of order.' },
    ],
  },

  reliability: {
    creator: {
      weights: { finished_approval: 0.30, on_time: 0.20, post_through: 0.20, compliance: 0.20, clean_record: 0.10 },
      recency_half_life_days: 45,
      min_finished_for_score: 5,
      provisional_score: 70,
      on_time_resubmit_hours: 48,
      post_through_days: 7,
      academy_bonus_per_lesson: 0.5,
      academy_bonus_cap: 5,
    },
    brand: {
      weights: { decision_speed: 0.30, approval_fairness: 0.25, pays_on_time: 0.20, run_rate: 0.15, reply_speed: 0.10 },
      decision_best_hours: 12,
      decision_worst_hours: 72,
      reply_best_hours: 2,
      reply_worst_hours: 48,
      rejection_rate_free_pass: 0.30,
      rejection_rate_zero_at: 0.70,
      min_decisions_for_score: 10,
      bands: { excellent: 90, good: 75, fair: 60 },
    },
  },

  funnel_defaults: {
    view_to_visit: 0.0045,
    visit_to_install: 0.38,
    install_to_trial: 0.062,
    trial_to_paid: 0.348,
    views_quantile_ratio: { p25: 0.4, median: 1.0, p75: 2.55 },
    // Smart Budget planner: low / median / high multipliers applied to the conversion rates (not to views).
    conversion_band_ratio: { low: 0.55, median: 1.0, high: 1.6 },
  },

  matching: {
    // Match score 0..100 for the creator's bounty feed (see FORMULAS: match score). Gates are binary and applied first.
    weights: { niche: 40, platform: 15, region: 15, price: 15, brand_reliability: 10, recency: 5 },
    recency_half_life_days: 14,
    price_ratio_cap: 1.5,
    gates: ['eligibility_tier', 'country', 'platform_account_linked', 'funded', 'not_already_submitted'],
    min_match_to_rank_first: 60,
  },

  pricing_model: {
    // Day-one pricing heuristic (see FORMULAS: price vs fill time). Replaced by a regression once enough bounties settle.
    fill_exponent: 1.6,
    p80_multiplier: 1.8,
    min_fill_hours: 6,
    confidence_k: 20,
    curve_cpm_multipliers: [0.6, 0.8, 1.0, 1.2, 1.5, 2.0],
    thin_market_min_sample: 8,
  },

  attribution: {
    apple_active_offers_per_sku: 10,
    apple_custom_code_max_redemptions: 25_000,
    apple_offer_codes_per_quarter: 1_000_000,
    pay_on_sources: ['link', 'code'],
    link_base: 'joinflowd.io/r/',
    survey_name: 'How did you hear about us?',
  },

  tax: {
    form_1099_nec_threshold_cents: 200_000,
    tax_year: 2026,
    set_aside_rate: 0.25,
    collect_at: 'first_approval',
    hold_payout_without_tax_info: true,
    disclaimer: 'Not tax advice.',
  },

  compliance: {
    disclosure_tag: '#ad',
    default_disclosure_text: '#ad Paid partnership with {brand}',
    audio_disclosure_required: true,
    onscreen_disclosure_required: true,
    blocks_settlement_on_fail: true,
  },

  studio: {
    aspect: '9:16',
    width: 1080,
    height: 1920,
    min_duration_s: 15,
    max_duration_s: 60,
    target_duration_s: [15, 30],
    hook_must_land_s: 2,
    onscreen_hook_s: 1,
    app_visible_by_s: 3,
  },

  lint: {
    // Brief Lint: one rule per BriefLintCode. severity blocker = cannot publish. Text rules match the brief text, case-insensitive.
    thresholds: { min_budget_cents: 10_000, min_cap_cents: 2_000, low_effective_pay_median_cents: 1_500, short_window_days: 5, max_paid_ads_days: 365 },
    rules: {
      missing_deliverables: { severity: 'blocker', trigger: 'videos_per_creator < 1, or min_duration_s / max_duration_s unset.', fix: 'State how many videos, how long and in what ratio.' },
      missing_platforms: { severity: 'blocker', trigger: 'deliverables.platforms is empty.', fix: 'Choose at least one platform.' },
      missing_regions: { severity: 'warning', trigger: 'deliverables.regions is empty.', fix: 'Pick target regions so matching and fraud checks can use them.' },
      view_minimum_base: { severity: 'blocker', trigger: 'Text says base pay needs a minimum view count first (e.g. "must reach 10,000 views to qualify", "paid after 5k views").', fix: 'Pay from the first verified view, or move the threshold to a bonus.' },
      unpaid_trial: { severity: 'blocker', trigger: 'Text asks for an unpaid test, sample or trial video ("unpaid test", "free sample video", "trial video before we pay").', fix: 'Pay for every video, including the first.' },
      burner_account: { severity: 'blocker', trigger: 'Text requires a new, dedicated or burner account ("new account", "dedicated account", "burner", "separate account just for us").', fix: 'Let creators post from their own accounts.' },
      fresh_account_demand: { severity: 'blocker', trigger: 'Text requires a fresh account or forbids personal posting ("fresh account", "no other content on the account").', fix: 'Remove it; bounties may not require fresh accounts.' },
      forced_posting_count: { severity: 'blocker', trigger: 'Text demands a posting cadence with no pay attached ("post 3 times a day", "daily posts for 30 days").', fix: 'Pay per video and drop the quota.' },
      perpetual_rights: { severity: 'blocker', trigger: 'rights_card.paid_ads_days > 365, or text says "perpetual", "in perpetuity", "forever" or "unlimited usage".', fix: 'Use a fixed paid-ad term (default 90 days) with a priced renewal.' },
      ai_likeness_requested: { severity: 'blocker', trigger: 'rights_card.ai_likeness is true, or text asks to clone voice or likeness.', fix: 'AI likeness is off by default and needs a separate agreement.' },
      pay_to_join: { severity: 'blocker', trigger: 'Text charges creators ("entry fee", "deposit", "pay to join", "buy the product first").', fix: 'Creators never pay to take part.' },
      below_floor_cpm: { severity: 'blocker', trigger: '0 < cpm_cents < pay.floor_cpm_cents (50).', fix: 'Raise the CPM to at least $0.50.' },
      no_disclosure_text: { severity: 'warning', trigger: 'brief.disclosure_text is empty.', fix: 'Set the required wording, e.g. "#ad Paid partnership with Lumi".' },
      unclear_cta: { severity: 'warning', trigger: 'brief.cta is empty or names more than one call to action.', fix: 'Pick exactly one.' },
      cap_too_low: { severity: 'warning', trigger: 'per_video_cap_cents < thresholds.min_cap_cents ($20).', fix: 'Raise the cap or creators will skip it.' },
      low_effective_pay: { severity: 'warning', trigger: 'pay_math.median_cents < thresholds.low_effective_pay_median_cents ($15).', fix: 'Raise the CPM or add a CPA bonus.' },
      budget_below_minimum: { severity: 'blocker', trigger: 'budget_cents < thresholds.min_budget_cents ($100).', fix: 'Fund at least $100.' },
      short_window: { severity: 'info', trigger: 'ends_at - starts_at < thresholds.short_window_days (5 days).', fix: 'Allow at least 5 days so revisions fit.' },
    },
  },

  disputes: {
    reply_sla_hours: 24,
    resolution_sla_days: 5,
    window_days: 30,
  },

  wellbeing: {
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
    batch_money_pushes_in_quiet_hours: true,
    inactivity_decay_days: 0,
    pause_max_days: 90,
  },

  api: {
    scopes: ['read', 'write', 'financial'],
    drafts_by_default: true,
    key_prefix_live: 'fd_live_',
    key_prefix_test: 'fd_test_',
    idempotency_header: 'Idempotency-Key',
    page_size_default: 50,
    page_size_max: 200,
    rate_limit_per_minute: { free: 60, pro: 600, scale: 3000 },
  },

  launch_targets: [
    { id: 'first_dollar_hours', label: 'Median time to a creator\'s first dollar', op: 'lt', target: 72, unit: 'hours' },
    { id: 'filled_48h_ratio', label: 'Bounties filled within 48 hours', op: 'gt', target: 0.8, unit: 'ratio' },
    { id: 'second_bounty_ratio', label: 'Brands funding a second bounty', op: 'gt', target: 0.6, unit: 'ratio' },
    { id: 'repost_30d_ratio', label: 'Creators posting again within 30 days', op: 'gt', target: 0.35, unit: 'ratio' },
    { id: 'invites_per_creator', label: 'Accepted invites per new creator', op: 'gt', target: 0.5, unit: 'count' },
    { id: 'creators_per_live_bounty', label: 'Active creators per live bounty', op: 'between', target: 20, target_max: 50, unit: 'count' },
  ],
};

/** Where each constant came from. Path = dotted path into CONSTANTS (prefix match). */
export const CONSTANT_NOTES = [
  { path: 'plans', source: 'DECISIONS §2', note: 'Free 12% / Pro $299 at 10% / Scale $999 at 8%. Creators always free. Price shown all-in.' },
  { path: 'fees.cpa_only_take_rate', source: 'DECISIONS §2', note: 'Install- and trial-only (CPA-only) bounties: flat 6%, charged only on cleared conversions.' },
  { path: 'fees.first_bounty_fee_waived', source: 'DECISIONS §2', note: 'First bounty: platform fee waived and matched budget up to $500 (design-partner programme).' },
  { path: 'fees.ad_spend_fee_rate', source: 'DECISIONS §2', note: 'Winner promotion fee: 1% of ad spend.' },
  { path: 'fees.instant_payout_', source: 'DECISIONS §2', note: 'Instant cash-out fee 1.5%, min $0.50, max $15; fee shown before confirm. Weekly payout free.' },
  { path: 'fees.card_processing_', source: 'CONTRACT', note: 'Card funding processing passed through at cost (2.9% + $0.30) and shown in the all-in price. Not refundable on unspent budget.' },
  { path: 'pay', source: 'DECISIONS §3', note: 'Bounty default $2.00 CPM, floor $0.50, per-video cap $250; CPA defaults $0.40 install / $1.50 trial / $4.00 paid; ad commission 10% for 60 days. CPA window 30 days (BLUEPRINT). min_bounty_budget_cents and extra_revision_pay_cents are CONTRACT.' },
  { path: 'windows.view_window_hours', source: 'DECISIONS §3', note: '72-hour view window, then window_closed, fraud check, cleared.' },
  { path: 'windows.weekly_payout_', source: 'DECISIONS §3', note: 'Weekly auto-payout Fridays 18:00 UTC (JS getUTCDay() = 5).' },
  { path: 'windows.clearing_', source: 'CONTRACT', note: 'Daily clearing run 14:00 UTC; an item clears at the first run at or after window end + buffer. fraud_check_max_hours bounds the automated check.' },
  { path: 'windows.cpa_clear_hours', source: 'CONTRACT', note: 'Conversions clear after install 24h, trial 72h, paid 168h (refund window).' },
  { path: 'windows.snapshot_interval_hours', source: 'CONTRACT', note: 'View Ledger snapshots every 6h during the 72h window.' },
  { path: 'windows.offer_expiry_days', source: 'CONTRACT', note: 'Direct offers expire after 7 days; max 3 counter rounds.' },
  { path: 'review', source: 'DECISIONS §3', note: '72h SLA, reason code + evidence on rejection, 2 included revision rounds (extra paid by brand), one appeal per rejection, SLA breach escalates and dents the brand score, approved-but-unused after 30 days is released to the Spec Market (brand keeps first refusal). stale_after_hours, appeal window, first_refusal_days, revision_expiry_days, undo_seconds are CONTRACT / research.' },
  { path: 'auto_approve', source: 'research/brand-needs §6', note: 'Guarded auto-approve: dry run on last 50, 10% spot-check, first-time creators manual, organic only.' },
  { path: 'rights', source: 'DECISIONS §3', note: 'Organic always included; paid-ad usage default 90 days, renewable at 25% of base fee per 30 days; AI likeness off; alerts at 30/14/7 days. Spark durations 7/30/60/365 (research).' },
  { path: 'tiers', source: 'DECISIONS §3', note: 'Thresholds and perks exactly as DECISIONS; no tier drop for 30 days after a dip. founding_carry_over_counts is CONTRACT: verified prior history of founding creators counts toward thresholds (Ops reviews).' },
  { path: 'streaks', source: 'DECISIONS §3', note: 'Weekly streak, earned freezes (1 per 4-week streak, max 2 banked), rest weeks, no inactivity penalty, no guilt notifications.' },
  { path: 'leaderboards', source: 'DECISIONS §3', note: 'Peer cohorts of about 30 by tier + niche with promotion zones; public global weekly board. Small tiers merge until a cohort has min size.' },
  { path: 'daily_drop', source: 'DECISIONS §3', note: 'One drop per day at 16:00 UTC; real inventory; pre-drop / live / sold-out states.' },
  { path: 'tournaments', source: 'CONTRACT', note: 'Sponsored prize pools, bracket or leaderboard rounds, free entry.' },
  { path: 'crews', source: 'CONTRACT', note: 'Gold+ lead, 3 to 20 members, platform-funded weekly goal bonus.' },
  { path: 'referrals', source: 'DECISIONS §4 / BLUEPRINT', note: 'Single level, platform-funded. 5% of referee cleared earnings for 90 days (cap $100 per referee). Brand/agency partners: 10% of platform fees for 12 months. Rates are CONTRACT.' },
  { path: 'auctions', source: 'BLUEPRINT', note: 'Sealed-bid, second price (uniform clearing price = highest losing bid), Platinum+ creators.' },
  { path: 'specs', source: 'CONTRACT', note: 'Spec Market listing needs Flow Score 55+ (band C); licence price floor $15.' },
  { path: 'fraud', source: 'CONTRACT', note: 'Fraud score 0..100 = min(100, sum(points x severity)). clean <20, watch 20-39, review 40-69 (human review within 24h), high 70+ (auto-hold).' },
  { path: 'scores', source: 'CONTRACT', note: 'Checklist scores (not learned). Hook Score checklist weights sum to 100; Flow Score checklist weights sum to 100. Bands A 85+, B 70-84, C 55-69, D 40-54, E below 40.' },
  { path: 'reliability', source: 'CONTRACT', note: 'Creator and brand reliability score weights (0..100).' },
  { path: 'funnel_defaults', source: 'research/brand-needs §5', note: 'Install to trial median 6.2%, trial to paid median 34.8% (RevenueCat via Airbridge). Used for expected-earnings ranges and the budget planner; always labelled "estimate".' },
  { path: 'attribution', source: 'DECISIONS §3', note: 'CPA pays only on link and code. Apple caps 10 active offers per subscription SKU; custom codes up to 25,000 redemptions.' },
  { path: 'tax', source: 'DECISIONS §4 / research', note: '1099-NEC threshold $2,000 for 2026 payments; W-9 collected at first approval, before first payout. Set-aside default is a CONTRACT estimate. Not tax advice.' },
  { path: 'compliance', source: 'DECISIONS §4', note: 'Disclosure in the video itself (audio + on-screen); #ad + brand wording auto-added; failure blocks settlement.' },
  { path: 'studio', source: 'BLUEPRINT', note: '9:16, 1080x1920, 15-30s target; hook lands within 2s; spoken hook mirrored on screen within 1s; app visible early.' },
  { path: 'lint', source: 'DECISIONS §4 / research/brand-needs §3', note: 'Brief Lint blocks missing deliverables, view-minimum bases, unpaid trials, burner / fresh-account demands, forced posting counts, perpetual rights, AI likeness, pay-to-join, CPM under the floor and budgets under $100. Rule triggers are the shared client + server ruleset; severities blocker / warning / info.' },
  { path: 'disputes', source: 'CONTRACT', note: 'One-tap dispute, human reply within 24h, resolution within 5 business days.' },
  { path: 'wellbeing', source: 'research/creator-needs §10', note: 'Quiet hours 22:00-08:00, no inactivity decay, pause up to 90 days preserves tier and streak.' },
  { path: 'api', source: 'research/brand-needs', note: 'Scopes read/write/financial; drafts by default; cursor pagination.' },
  { path: 'launch_targets', source: 'BLUEPRINT launch playbook', note: 'Suggested day-90 targets shown in the admin control tower.' },
];
