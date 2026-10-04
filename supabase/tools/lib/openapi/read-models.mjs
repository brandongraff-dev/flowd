// API read models: responses that are composed from entities and are not fixture rows (packages/contract/schema/api.mjs, API_TYPES_NOTE).
// "They never add new money fields: every amount is reproducible from the entities." Every amount below is integer cents, every ratio 0..1,
// every timestamp ISO-8601 UTC. Fields use the contract's type grammar; obj:Name may name any component (value type, entity or read model).
//
// Where a read model already exists as a SQL function result or a web-engine type, the field names follow it (public.instant_payout_quote,
// public.audit_ledger, apps/web/src/lib/engine/{funnel,pricing,moneyclock,market}.ts) so the three implementations agree.

import { parseFields } from './types.mjs';

const m = (doc, fields, extra = {}) => ({ doc, fields: parseFields(fields), ...extra });

export const READ_MODELS = {
  // ── session ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  Session: m('A signed-in session: the bearer token, the user and the persona ids that scope every other call. Demo sessions (POST /auth/demo-login) carry demo = true and every response then has X-Flowd-Demo: 1.', `
    token:string -- Opaque bearer token (a Supabase JWT in production).;
    token_type:string -- Always "bearer".;
    expires_at:iso;
    role:enum:Role;
    user:obj:User;
    creator_id?:ref:creators -- Set when role = creator.;
    brand_id?:ref:brands -- The active workspace when role = brand_member.;
    brand_member_id?:ref:brand_members;
    brand_role?:enum:BrandMemberRole -- The member's role in the active workspace; capabilities follow from it.;
    workspaces?:ref:brands[] -- Every workspace the user belongs to (agency users see client workspaces too).;
    demo:bool -- True for the in-memory demo world.`),

  Health: m('Liveness. In demo mode `now` is the demo clock (2026-10-03T14:00:00Z until advanced).', `
    ok:bool;
    version:string -- API version, e.g. 1.0.0.;
    contract_version:string -- Version of packages/contract the server implements.;
    now:iso -- Server time (the demo clock in demo mode).;
    demo:bool;
    checks?:map:string -- Dependency checks: database, ml, payments, each "ok" or a short reason.`),

  AppLookup: m('An App Store URL resolved to app metadata, so a brand can add the app in one paste (mock metadata in this build).', `
    found:bool;
    app_store_id?:string;
    bundle_id?:string;
    name?:string;
    tagline?:string;
    category?:enum:Category;
    icon?:art -- Generated icon (never a remote image).;
    rating?:number;
    rating_count?:int;
    store_url?:url;
    pricing?:obj:AppPricing;
    already_on_flowd:bool -- The app belongs to a workspace already.;
    suggestions?:string[] -- What to do when the URL could not be resolved.`),

  // ── money ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  FundingBreakdown: m('Escrow funding for a budget (DOMAIN section 11, "Escrow total, fee reserve, matched budget and card charge"). Same numbers as public.funding().', `
    budget_cents:cents -- The creator-pay pool.;
    take_rate:ratio -- Plan rate (Free 12%, Pro 10%, Scale 8%), 6% for CPA-only and install-only bounties, 0% on the first bounty.;
    fee_reserve_cents:cents -- round(budget x take rate), held in escrow with the budget; unused reserve is refunded at settlement.;
    escrow_total_cents:cents -- budget + fee reserve. The Funded badge needs escrow >= this.;
    matched_cents:cents -- flowd's match on the first bounty: min($500, what the brand funds).;
    brand_funded_cents:cents -- escrow_total - matched.;
    processing_cents:cents -- round(2.9% x brand funded) + $0.30, passed through at cost.;
    card_charge_cents:cents -- brand_funded + processing.`),

  PriceQuote: m('Pay Math for a bounty draft: the full funding breakdown, the brand\'s effective all-in price per 1,000 verified views, what creators earn at the median, and how many Reserved Slots the pool carries.', `
    plan:enum:Plan;
    bounty_type:enum:BountyType;
    first_bounty:bool -- The first bounty: fee waived and a matched budget applies.;
    funding:obj:FundingBreakdown;
    all_in_cpm_cents:cents -- round(card charge x CPM / budget): what the brand pays per 1,000 verified views when the pool is fully used.;
    cpm_cents:cents;
    all_in_cpa_install_cents?:cents;
    all_in_cpa_trial_cents?:cents;
    all_in_cpa_paid_cents?:cents;
    reservation_unit_cents:cents -- per-video cap + the fee on it: what one submission reserves.;
    spots:int -- floor(escrow remaining / reservation unit): how many creators can submit.;
    pay_math:obj:PayMath -- Creator pay at p25 / median / p75, always labelled estimate.;
    lint?:obj:BriefLint -- Present when the request carried a brief.;
    warnings:string[] -- Plain-English cautions, e.g. "At this CPM the median creator earns $11.40 per video."`),

  PriceSuggestion: m('The day-one pricing heuristic (BLUEPRINT ML system 7): a suggested CPM for the category and the price-versus-fill-time curve, with the confidence it deserves.', `
    category:enum:Category;
    clearing_cpm_cents:cents -- Median CPM of open bounties receiving submissions in the trailing 7 days.;
    suggested_cpm_cents:cents;
    band_p25_cents:cents;
    band_p75_cents:cents;
    position?:string -- Where the requested CPM sits: below_p25, p25_to_median, median_to_p75, above_p75.;
    curve:obj:CurvePoint[] -- Six points at 0.6x, 0.8x, 1.0x, 1.2x, 1.5x and 2.0x of the clearing CPM.;
    median_fill_hours:number;
    sample_n:int -- Comparable bounties behind the numbers.;
    thin_market:bool -- Fewer than 8 comparable bounties: shown as a warning, never as a fact.;
    confidence:ratio;
    label:string -- "Checklist pricing. It gets smarter as bounties settle."`),

  Wallet: m('The signed-in side\'s wallet. A creator gets the Money Clock summary (pending and cleared are never summed); a brand gets escrow held, reserved, spent and available.', '', { oneOf: ['CreatorWallet', 'BrandWallet'], discriminator: 'kind' }),

  CreatorWallet: m('A creator\'s wallet: Pending and Cleared side by side, held, paid, and the next dates.', `
    kind:string -- Always "creator".;
    pending_cents:cents -- Accruing or pending: the window is open or the clearing run has not happened.;
    cleared_cents:cents -- Cleared and waiting for a payout.;
    held_cents:cents -- Held for a named reason.;
    paid_cents:cents -- Paid out in the last 90 days.;
    lifetime_cleared_cents:cents;
    pending_items:int;
    cleared_items:int;
    held_items:int;
    next_clear_at?:iso;
    next_payout_at?:iso -- The next weekly run (Friday 18:00 UTC) when cleared money is waiting.;
    instant?:obj:PayoutPreview -- What an instant cash-out would do right now.;
    payout_ready:bool;
    blockers:string[] -- Named reasons a payout would be held: identity_check, tax_info_missing, payout_method_missing.`),

  BrandWallet: m('A brand wallet: balance, holds, what is available, and what sits in escrow.', `
    kind:string -- Always "brand".;
    balance_cents:cents;
    holds_cents:cents -- Sealed auction bids and spec quotes: no money moved, but not available.;
    available_cents:cents -- balance - holds.;
    escrow_remaining_cents:cents -- Unreserved pool across funded bounties.;
    escrow_reserved_cents:cents -- Reserved Slots of open submissions.;
    spent_cents:cents;
    live_bounties:int;
    funded_bounties:int;
    auto_top_up?:obj:AutoTopUp;
    payment_method?:obj:PaymentMethod;
    low_balance:bool -- Below the auto top-up threshold or too low to fund a drafted bounty.`),

  PayoutPreview: m('Instant cash-out preview: the fee and the net are shown BEFORE the creator confirms. Same fields as public.instant_payout_quote().', `
    ok:bool -- False when blocked_reason is set.;
    blocked_reason?:string -- below_minimum, exceeds_cleared, method_missing, tax_info_missing or identity_check_required.;
    amount_cents:cents -- The cleared balance that would be cashed out.;
    available_cents:cents;
    fee_cents:cents -- clamp(1.5% x amount, $0.50, $15), or 0 when free.;
    net_cents:cents;
    list_fee_cents:cents -- The fee before any tier perk.;
    free_instant:bool -- A tier perk makes this cash-out free.;
    tier:enum:Tier;
    free_allowance:obj:InstantAllowance;
    method?:obj:PayoutMethod`),

  InstantAllowance: m('How many free instant cash-outs the creator has (Gold once per ISO week, Platinum and Elite unlimited, Founding creators for 12 months).', `
    unlimited:bool;
    per_week:int;
    used_this_week:int`),

  ViewLedger: m('The View Ledger of one post: every snapshot, the source and audience mix, what was excluded and why, and what the post earns because of it.', `
    post_id:ref:posts;
    window_starts_at:iso;
    window_ends_at:iso;
    window_closed:bool;
    snapshots:obj:ViewSnapshot[];
    views_reported:int;
    views_verified:int;
    views_invalid:int;
    window_views:int -- The verified views that count for CPM pay (frozen at window end).;
    sources?:map:ratio -- Traffic-source mix of the latest snapshot.;
    geo?:map:ratio -- Audience country mix of the latest snapshot.;
    exclusions:obj:ViewExclusion[] -- Plain-language causes; they add up to views_invalid.;
    earnings:obj:EarningsBreakdown;
    state:enum:MoneyClockState;
    reason?:enum:MoneyClockReason;
    eta_at?:iso;
    can_dispute:bool;
    open_dispute_id?:ref:disputes`),

  // ── bounty analytics ─────────────────────────────────────────────────────────────────────────────────────────────────────
  RoasPoint: m('Return on spend at one horizon.', `
    days:int;
    value:number -- Tracked revenue within this many days of posting, divided by brand cost.;
    revenue_cents:cents;
    maturity:string -- early_signal (7 and 14 days), decision (30 and 60) or long_term (90).;
    mature:bool -- The cohort has at least this many days of data.`),

  FunnelStats: m('Derived funnel numbers. Stage costs divide cost by TRACKED counts (link and code); estimated counts are shown separately and never mixed in or paid.', `
    cpm_effective_cents?:cents;
    cost_per_click_cents?:cents;
    cost_per_install_cents?:cents;
    cost_per_trial_cents?:cents;
    cost_per_paid_cents?:cents -- The CAC.;
    view_to_click:ratio;
    trial_to_paid:ratio;
    roas_d7:number;
    roas_d30:number;
    roas_d90:number;
    roas:map:obj:RoasPoint -- Keyed "7", "14", "30", "60", "90".;
    payback_day?:int -- The first day cumulative tracked revenue reached cost (1 = the day of posting).;
    observed_days:int`),

  FunnelRow: m('One group of a funnel breakdown (a creator, a hook type, a format).', `
    key:string;
    n:int -- Items in the group.;
    funnel:obj:FunnelCounts;
    cost_cents:cents;
    cost_per_trial_cents?:cents;
    cost_per_paid_cents?:cents;
    trial_rate?:ratio`),

  Funnel: m('Views to paid for a bounty, per creator and per video, tracked versus estimated.', `
    bounty_id:ref:bounties;
    as_of:iso;
    cost_cents:cents -- Creator pay + platform fee (+ ad spend and commission for promoted posts).;
    tracked:obj:FunnelCounts -- Deterministic: link and code.;
    estimated:obj:FunnelCounts -- MMP, survey and modelled: reported, never paid.;
    revenue_cents:cents -- Tracked first payments.;
    stats:obj:FunnelStats;
    by_creator:obj:FunnelRow[] -- Ordered by cost per trial, cheapest first.;
    by_post:obj:FunnelRow[];
    note:string -- Plain-English reminder that estimated numbers do not pay.`),

  CreatorResult: m('A creator\'s results on one bounty.', `
    creator_id:ref:creators;
    handle:string;
    display_name:string;
    avatar:art;
    tier:enum:Tier;
    submissions:int;
    approved:int;
    posts:int;
    funnel:obj:FunnelCounts;
    cost_cents:cents;
    cost_per_trial_cents?:cents;
    last_activity_at?:iso`),

  LibraryItem: m('One row of the Creative Intelligence Library: a posted video tagged by format, hook and CTA with its results.', `
    post_id:ref:posts;
    creator_id:ref:creators;
    bounty_id:ref:bounties;
    platform:enum:Platform;
    posted_at:iso;
    status:enum:PostStatus;
    thumb:art;
    tags:obj:VideoTags;
    hook_text:string;
    funnel:obj:FunnelCounts;
    trial_rate?:ratio;
    flow_band:enum:ScoreBand;
    is_winner:bool;
    why_it_won?:string[]`),

  PostMetrics: m('Daily metrics of a post and, for a recent post, its hourly curve.', `
    post_id:ref:posts;
    daily:obj:PostMetricsDaily[];
    hourly?:obj:PostMetricsHourly[];
    retention?:obj:Retention`),

  // ── feed and review ─────────────────────────────────────────────────────────────────────────────────────────────────────
  MatchFactors: m('The six match factors, each 0..1 (DOMAIN section 11, Match score).', `
    niche:ratio;
    platform:ratio;
    region:ratio;
    price:ratio;
    brand_reliability:ratio;
    recency:ratio`),

  FeedItem: m('A bounty in a creator\'s ranked feed: the bounty, the match score with its reasons, what the creator could expect to earn, and whether it is locked (and how to unlock it).', `
    bounty:obj:Bounty;
    app_name:string;
    app_icon:art;
    brand_name:string;
    brand_score?:int -- Brand Scorecard 0..100; absent for a new brand.;
    brand_band?:enum:BrandBand;
    match:int -- 0..100.;
    match_factors:obj:MatchFactors;
    expected_p25_cents:cents;
    expected_median_cents:cents;
    expected_p75_cents:cents;
    spots_left:int -- Real: floor(remaining / reservation unit).;
    locked:bool;
    locked_reason?:string -- tier_locked, early_access, region, platform or already_submitted.;
    unlocks_at?:iso -- When tier early access opens this bounty to the creator.;
    saved:bool;
    in_drop?:bool -- Part of today's Daily Drop.`),

  ReviewItem: m('A submission in the brand\'s review queue, sorted by QA flags, band and age; the fraud-hold lane is flagged.', `
    submission:obj:Submission;
    bounty_title:string;
    creator_handle:string;
    creator_name:string;
    creator_avatar:art;
    creator_tier:enum:Tier;
    creator_reliability:int;
    creator_provisional:bool -- Fewer than 5 finished decisions: shown as "Building history".;
    qa_pass:int;
    qa_warn:int;
    qa_fail:int;
    flow_band:enum:ScoreBand;
    hook_band:enum:ScoreBand;
    fraud_hold:bool;
    fraud_score?:int;
    hours_in_queue:number;
    hours_left:number;
    sla_state:enum:SlaState;
    flags:string[] -- Plain-English QA flags, most important first.`),

  PreflightItem: m('One pre-flight check.', `
    id:string;
    label:string;
    status:string -- pass, warn or fail.;
    reason:string;
    fix?:string;
    t_ms?:int`),

  PreflightResult: m('Pre-flight before submitting: disclosure (audio and on screen), music licence, banned claims, AI content flag, 9:16, length and safe zones. A failed disclosure blocks submit.', `
    ok:bool;
    blocks_submit:bool;
    items:obj:PreflightItem[];
    disclosure_audio:bool;
    disclosure_onscreen:bool;
    summary:string`),

  UploadSession: m('A resumable video upload: PUT chunks to upload_url, then reference asset_id in the submission.', `
    upload_id:string;
    asset_id:string;
    upload_url:url;
    method:string -- PUT.;
    headers:map:string;
    chunk_size_bytes:int;
    max_size_bytes:int;
    expires_at:iso;
    resumable:bool`),

  // ── attribution ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  LinkResolution: m('A tracking code resolved for the landing page. Opening it logs a click; the response carries what the page needs and where to send the visitor.', `
    code:string;
    status:enum:AttributionLinkStatus;
    app_name:string;
    app_icon:art;
    store_url:url;
    deep_link:string;
    short_url:string;
    creator_handle?:string;
    creator_name?:string;
    creator_avatar?:art;
    promo_code?:string;
    headline:string;
    cta_label:string;
    click_id:string`),

  CodePoolHealth: m('Offer-code pool usage (Apple caps active offer codes at 10 per subscription SKU, so flowd rotates a pool).', `
    cap_per_sku:int;
    active:int;
    available:int;
    assigned:int;
    rotation_due:int`),

  AttributionIssue: m('A problem with attribution and exactly how to fix it.', `
    code:string;
    message:string;
    fix:string`),

  AttributionHealth: m('Coverage meter, last event, SDK status and code-pool usage.', `
    app_id:ref:apps;
    coverage_ratio:ratio -- Share of installs flowd can attribute deterministically.;
    sdk_status:enum:SdkStatus;
    mmp:enum:MmpKind;
    revenuecat_connected:bool;
    last_event_at?:iso;
    events_24h:int;
    active_links:int;
    tracked:int;
    estimated:int;
    code_pool:obj:CodePoolHealth;
    issues:obj:AttributionIssue[]`),

  // ── creators ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  CreatorPlatform: m('A linked platform and its public size.', `
    platform:enum:Platform;
    handle:string;
    followers:int`),

  CreatorCard: m('A creator in discovery: verified numbers only. No earnings are shown here; reliability is shown with its provisional flag.', `
    id:ref:creators;
    handle:string;
    display_name:string;
    avatar:art;
    tier:enum:Tier;
    niches:enum:Niche[];
    country:enum:Country;
    platforms:obj:CreatorPlatform[];
    approval_rate:ratio;
    reliability_score:int;
    reliability_provisional:bool;
    median_views_28d:int;
    us_audience_ratio?:ratio;
    open_to_offers:bool;
    price_per_video_cents?:cents -- From the rate card, when the creator accepts direct offers.;
    suggested_price_cents?:cents;
    badges:enum:BadgeId[]`),

  TierThresholdsRow: m('One tier with its thresholds and perks.', `
    tier:enum:Tier;
    thresholds:obj:TierThresholds;
    perks:obj:TierPerks`),

  Tiers: m('Tier thresholds and perks (from CONSTANTS).', `
    tiers:obj:TierThresholdsRow[];
    demotion_grace_days:int -- No tier drop for this many days after a dip.`),

  TierStatus: m('The creator\'s tier: progress to the next one, the history and any grace hold.', `
    tier:enum:Tier;
    basis:enum:TierBasis;
    since:iso;
    progress:obj:TierProgress;
    hold_until?:iso;
    history:obj:TierEvent[];
    perks:obj:TierPerks`),

  RemixLibrary: m('Formats, hooks and trends for the Remix library.', `
    formats:obj:Format[];
    hooks:obj:Hook[];
    trends:obj:Trend[]`),

  // ── public tools ────────────────────────────────────────────────────────────────────────────────────────────────────────
  EarningsBand: m('One band of the earnings estimate.', `
    views:int;
    installs:number;
    trials:number;
    paid:number;
    cpm_pay_cents:cents;
    cpa_pay_cents:cents;
    pay_cents:cents -- min(cap, CPM pay + CPA pay).;
    capped:bool`),

  EarningsEstimate: m('Earnings calculator: p25, median and p75 for a creator and a bounty. Always an estimate; the typical (median) is shown beside any top-earner example.', `
    base_median_views:int;
    cpm_cents:cents;
    per_video_cap_cents:cents;
    p25:obj:EarningsBand;
    median:obj:EarningsBand;
    p75:obj:EarningsBand;
    label:string -- "Estimate".;
    typical_note:string`),

  BudgetBand: m('One band of the Smart Budget planner.', `
    name:string -- low, median or high.;
    multiplier:number;
    installs:int;
    trials:int;
    paid:int;
    cost_per_trial_cents?:cents`),

  BudgetPlan: m('Smart Budget planner: what a budget buys at a CPM, as a planning range (never a promise).', `
    plan:enum:Plan;
    budget_cents:cents;
    cpm_cents:cents;
    card_charge_cents:cents;
    views:int -- budget / CPM x 1,000.;
    bands:obj:BudgetBand[];
    label:string -- "Estimate".`),

  PlanComparison: m('The all-in price under one plan.', `
    plan:enum:Plan;
    plan_fee_cents_per_month:cents;
    take_rate:ratio;
    fee_cents:cents;
    processing_cents:cents;
    card_charge_cents:cents;
    all_in_cpm_cents:cents`),

  PriceComparison: m('All-in price calculator: the same pool under each plan, so a brand sees the fee ladder side by side.', `
    budget_cents:cents;
    cpm_cents:cents;
    rows:obj:PlanComparison[];
    cheapest_plan:enum:Plan -- Including the monthly plan fee at this spend.`),

  CaseStudies: m('Case studies and testimonials for the marketing site.', `
    case_studies:obj:CaseStudy[];
    testimonials:obj:Testimonial[]`),

  WaitlistJoined: m('A waitlist signup: the position, the referral code and how many are ahead.', `
    position:int;
    total:int;
    referral_code:string;
    ahead:int`),

  // ── admin and developers ───────────────────────────────────────────────────────────────────────────────────────────────
  LedgerAnomaly: m('Something the ledger audit flagged.', `
    kind:string;
    ref:string;
    detail:string`),

  LedgerAccountBalance: m('A ledger account and its balance.', `
    account:string;
    balance_cents:int`),

  LedgerExplorer: m('The admin ledger explorer: the balance proof (every transaction nets to zero, every cached balance equals the sum of its legs, wallet and escrow projections agree) and the anomaly detector. Same fields as public.audit_ledger().', `
    ok:bool;
    transactions:int;
    legs:int;
    unbalanced_transactions:json[];
    balance_mismatches:json[];
    wallet_projection_mismatches:json[];
    escrow_mismatches:json[];
    negative_floors:json[];
    accounts:obj:LedgerAccountBalance[];
    anomalies:obj:LedgerAnomaly[]`),

  ApiKeyCreated: m('A new API key. The secret is shown exactly once.', `
    key:obj:ApiKey;
    secret:string -- fd_live_... or fd_test_...: store it now; flowd keeps only its sha256 hash.;
    warning:string`),

  JsonRpc: m('A JSON-RPC 2.0 response from the MCP endpoint.', `
    jsonrpc:string;
    id:string;
    result?:json;
    error?:obj:JsonRpcError`),

  JsonRpcError: m('A JSON-RPC 2.0 error object.', `
    code:int;
    message:string;
    data?:json`),

  JsonRpcRequest: m('A JSON-RPC 2.0 request to the MCP endpoint (methods initialize, tools/list, tools/call).', `
    jsonrpc:string;
    id:string;
    method:string;
    params?:json`),
};

/** Read models that exist only as helpers of another (not named in api.mjs). */
export const HELPER_MODELS = new Set(['FundingBreakdown', 'CreatorWallet', 'BrandWallet', 'InstantAllowance', 'RoasPoint', 'FunnelStats', 'FunnelRow', 'MatchFactors', 'PreflightItem', 'CodePoolHealth', 'AttributionIssue', 'CreatorPlatform', 'TierThresholdsRow', 'EarningsBand', 'BudgetBand', 'PlanComparison', 'LedgerAnomaly', 'LedgerAccountBalance', 'JsonRpcError', 'JsonRpcRequest']);
