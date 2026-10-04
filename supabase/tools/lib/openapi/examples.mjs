// Curated examples (fictional data: the demo world's @maya.makes and Lumi). Keyed "METHOD /path". Numbers follow DOMAIN sections 10 and 11 so they can be
// checked by hand: Pro plan (10%), a $3,000.00 pool at $2.10 CPM, $250.00 per-video cap, $0.40 / $1.50 / $4.00 CPA.

const err = (code, message, hint) => ({ code, message, ...(hint ? { hint } : {}) });

export const EXAMPLES = {
  'POST /auth/demo-login': {
    request: { role: 'creator', persona: 'maya.makes' },
    response: {
      token: 'fd_demo_9c1b7e2a5d', token_type: 'bearer', expires_at: '2026-10-04T14:00:00Z', role: 'creator',
      user: { id: 'usr_maya', role: 'creator', email: 'maya@example.test', display_name: 'Maya Torres', status: 'active', locale: 'en-US', timezone: 'America/Los_Angeles' },
      creator_id: 'cr_maya', demo: true,
    },
  },
  'POST /bounties/price': {
    request: { draft: { app_id: 'app_lumi', title: 'Glow-up reveal', type: 'stacked', budget_cents: 300000, cpm_cents: 210, cpa_install_cents: 40, cpa_trial_cents: 150, cpa_paid_cents: 400, per_video_cap_cents: 25000 }, plan: 'pro' },
    response: {
      plan: 'pro', bounty_type: 'stacked', first_bounty: false,
      funding: { budget_cents: 300000, take_rate: 0.1, fee_reserve_cents: 30000, escrow_total_cents: 330000, matched_cents: 0, brand_funded_cents: 330000, processing_cents: 9600, card_charge_cents: 339600 },
      all_in_cpm_cents: 238, cpm_cents: 210, reservation_unit_cents: 27500, spots: 12,
      pay_math: { p25_cents: 1756, median_cents: 4389, p75_cents: 11191, cap_cents: 25000, basis: 'Median views 14,200; estimate' },
      warnings: [],
    },
  },
  'POST /bounties/{id}/fund': {
    headers: { 'Idempotency-Key': 'fund-bnty_lumi_glowup-1' },
    response: { id: 'bnty_lumi_glowup', status: 'live', funded: true, budget_cents: 300000, fee_reserve_cents: 30000, escrow_funded_cents: 330000, reserved_cents: 0, spent_cents: 0, remaining_cents: 330000, refunded_cents: 0, take_rate: 0.1 },
  },
  'POST /submissions/{id}/decision': {
    request: { action: 'reject', reason_code: 'missing_disclosure', evidence: { kind: 'qa_check', ref: 'disclosure_audio', excerpt: 'No spoken "#ad" or "paid partnership" found.' }, summary: 'Say "this is a paid partnership" and keep #ad on screen for 2 seconds.' },
    response: { id: 'sub_0412', status: 'rejected', decision: { action: 'reject', decided_at: '2026-10-03T13:20:00Z', reason_code: 'missing_disclosure', sla_met: true, appeal_used: false } },
    errors: { 422: err('reason_required', 'A rejection needs a reason code and evidence.', 'Cite the stated requirement and attach a timecode, QA check or brief quote.') },
  },
  'GET /payouts/preview': {
    response: { ok: true, amount_cents: 16000, available_cents: 16000, fee_cents: 240, net_cents: 15760, list_fee_cents: 240, free_instant: false, tier: 'silver', free_allowance: { unlimited: false, per_week: 0, used_this_week: 0 } },
  },
  'POST /payouts/instant': {
    request: { confirm_fee_cents: 240 },
    headers: { 'Idempotency-Key': 'instant-cr_maya-2026-10-03-1' },
    response: { id: 'pay_0931', creator_id: 'cr_maya', kind: 'instant', status: 'processing', gross_cents: 16000, fee_cents: 240, net_cents: 15760, requested_at: '2026-10-03T14:00:00Z', scheduled_for: '2026-10-03T14:00:00Z', method_label: 'Bank account ••4821', item_count: 4, tier_at_payout: 'silver', free_instant: false },
    errors: { 409: err('method_missing', 'Add a payout method to cash out.') },
  },
  'GET /wallet': {
    response: { kind: 'creator', pending_cents: 21200, cleared_cents: 8600, held_cents: 0, paid_cents: 156923, lifetime_cleared_cents: 165523, pending_items: 4, cleared_items: 2, held_items: 0, next_clear_at: '2026-10-04T14:00:00Z', next_payout_at: '2026-10-09T18:00:00Z', payout_ready: true, blockers: [] },
  },
  'GET /money-clock': {
    response: {
      data: [
        { id: 'mc_0001', creator_id: 'cr_maya', bounty_id: 'bnty_lumi_glowup', app_id: 'app_lumi', post_id: 'post_0160', source: 'cpm', state: 'cleared', amount_cents: 6594, estimated: false, earned_at: '2026-09-30T09:00:00Z', eta_at: '2026-10-09T18:00:00Z', reason: 'awaiting_weekly_payout', reason_text: 'Cleared. Pays out Fri 6:00 PM UTC.', label: 'Lumi: Glow-up reveal' },
        { id: 'mc_0002', creator_id: 'cr_maya', bounty_id: 'bnty_lumi_glowup', app_id: 'app_lumi', post_id: 'post_0171', source: 'cpm', state: 'accruing', amount_cents: 3120, estimated: true, earned_at: '2026-10-02T18:30:00Z', eta_at: '2026-10-06T14:00:00Z', reason: 'window_open', reason_text: 'Views count until Mon 6:30 PM UTC. Clears Tue 2:00 PM UTC after the view check.', label: 'Lumi: Glow-up reveal' },
      ],
      next_cursor: null,
    },
  },
  'GET /posts/{id}/ledger': {
    response: {
      post_id: 'post_0160', window_starts_at: '2026-09-30T09:00:00Z', window_ends_at: '2026-10-03T09:00:00Z', window_closed: true,
      snapshots: [{ id: 'vsn_0160_5', post_id: 'post_0160', taken_at: '2026-10-03T08:00:00Z', views_reported: 31650, views_verified: 31400, views_invalid: 250, delta_verified: 2100, source: 'platform_api', flags: [], fraud_score: 8 }],
      views_reported: 31650, views_verified: 31400, views_invalid: 250, window_views: 31400,
      sources: { fyp: 0.64, following: 0.12, profile: 0.08, search: 0.06, sound: 0.05, share: 0.03, other: 0.02 }, geo: { US: 0.71, CA: 0.06, GB: 0.08 },
      exclusions: [{ cause: 'platform_adjustment', views: 250, detail: 'TikTok removed 250 views as invalid at 2026-10-02.' }],
      earnings: { cpm_cents: 6594, cpa_cents: 0, commission_cents: 0, flat_cents: 0, total_cents: 6594, capped: false, cap_remaining_cents: 18406 },
      state: 'cleared', reason: 'awaiting_weekly_payout', eta_at: '2026-10-09T18:00:00Z', can_dispute: true,
    },
  },
  'POST /posts/{id}/dispute': {
    request: { kind: 'views_missing', reason: 'Views dropped after the window', note: 'The platform shows 33,900 views; the ledger counted 31,400.', range_from: '2026-10-02T00:00:00Z', range_to: '2026-10-03T09:00:00Z' },
  },
  'POST /webhooks/revenuecat': {
    headers: { Authorization: 'Bearer <the secret you set in RevenueCat>' },
    request: {
      api_version: '1.0',
      event: {
        id: 'b6d3f1c4-2c0e-4a7e-9c6a-6b7f2f8e0a11', type: 'INITIAL_PURCHASE', app_id: 'app1a2b3c', app_user_id: '$RCAnonymousID:3f9a7c1d', product_id: 'lumi_pro_annual', period_type: 'TRIAL',
        purchased_at_ms: 1759306500000, expiration_at_ms: 1759565700000, environment: 'PRODUCTION', currency: 'USD', price: 0, country_code: 'US',
        subscriber_attributes: { flowd_link: { value: 'maya-glowup' } },
      },
    },
    response: { received: true, match: 'matched', source: 'link', kind: 'trial', conversion_id: 'conv_00610' },
  },
  'POST /attribution/events': {
    request: { link_code: 'maya-glowup', install_id: '7d1f0c2e-5b0a-4f3e-8f6d-2a9c6e5b1a77', kind: 'install', country: 'US' },
  },
  'GET /r/{code}': {
    response: { code: 'maya-glowup', status: 'active', app_name: 'Lumi', app_icon: { seed: 480112, pattern: 'orbs', hue_a: 262, hue_b: 214, hue_c: 188, label: 'Lu' }, store_url: 'https://apps.apple.com/app/id6740000001', deep_link: 'lumi://r/maya-glowup', short_url: 'joinflowd.io/r/maya-glowup', creator_handle: 'maya.makes', creator_name: 'Maya Torres', headline: 'Maya found a photo trick', cta_label: 'Try Lumi free', click_id: 'clk_8f3a1d' },
  },
  'POST /market/suggest': {
    request: { category: 'ai_photo', budget_cents: 300000, cpm_cents: 210, priority: 'balanced' },
    response: { category: 'ai_photo', clearing_cpm_cents: 240, suggested_cpm_cents: 240, band_p25_cents: 190, band_p75_cents: 310, position: 'below_p25', median_fill_hours: 31, sample_n: 38, thin_market: false, confidence: 0.66, label: 'Checklist pricing. It gets smarter as bounties settle.', curve: [{ cpm_cents: 144, fill_hours_p50: 70.2, fill_hours_p80: 126.35, confidence: 0.33, sample_n: 38 }, { cpm_cents: 240, fill_hours_p50: 31, fill_hours_p80: 55.8, confidence: 0.66, sample_n: 38 }, { cpm_cents: 480, fill_hours_p50: 10.23, fill_hours_p80: 18.41, confidence: 0.33, sample_n: 38 }] },
  },
  'POST /tools/hook-score': {
    request: { lands_ms: 2400, onscreen_ms: 900, spoken_matches_onscreen: true, face_ms: 300, faceless: false, app_ms: 2800, interrupt_ms: 1200, hook_type_known: true, hook_type_above_median: true, speech_ms: 400, captions_in_safe_zone: true },
  },
  'POST /tools/earnings': {
    request: { base_median_views: 14200, cpm_cents: 210, cpa_install_cents: 40, cpa_trial_cents: 150, cpa_paid_cents: 400, per_video_cap_cents: 25000 },
    response: {
      base_median_views: 14200, cpm_cents: 210, per_video_cap_cents: 25000, label: 'Estimate', typical_note: 'Typical (median) creators earn $43.89 on a bounty like this. Top earners are not typical.',
      p25: { views: 5680, installs: 9.71, trials: 0.6, paid: 0.21, cpm_pay_cents: 1193, cpa_pay_cents: 563, pay_cents: 1756, capped: false },
      median: { views: 14200, installs: 24.28, trials: 1.51, paid: 0.52, cpm_pay_cents: 2982, cpa_pay_cents: 1407, pay_cents: 4389, capped: false },
      p75: { views: 36210, installs: 61.92, trials: 3.84, paid: 1.34, cpm_pay_cents: 7604, cpa_pay_cents: 3587, pay_cents: 11191, capped: false },
    },
  },
  'POST /mcp': {
    request: { jsonrpc: '2.0', id: '1', method: 'tools/call', params: { name: 'get_funnel', arguments: { bounty_id: 'bnty_lumi_glowup' } } },
    response: { jsonrpc: '2.0', id: '1', result: { content: [{ type: 'text', text: 'Bounty bnty_lumi_glowup: 410,000 views, 700 tracked installs, 112 trials, 41 paid. Cost $520.00. Cost per trial $4.64.' }], isError: false } },
  },
  'POST /admin/fraud/{id}/decision': {
    request: { decision: 'claw_back', reason: 'Step-function curve, 78% of views from an unknown source, 0.2% engagement.', invalid_views: 41200 },
  },
};

export const ERROR_EXAMPLES = {
  validation_failed: err('validation_failed', 'One or more fields failed validation.', 'The message names the field and what is allowed.'),
  reason_required: err('reason_required', 'A rejection needs a reason code and evidence.', 'Cite the stated requirement and attach a timecode, QA check or brief quote.'),
  not_found: err('not_found', 'The resource does not exist or is not visible to you.'),
  forbidden: err('forbidden', 'Your role cannot do this in this workspace.', 'Ask an owner to change your role.'),
  tier_locked: err('tier_locked', 'This bounty opens to Bronze creators at 2026-10-03 22:00 UTC.', 'Higher tiers get a head start of up to 12 hours.'),
  bounty_not_funded: err('bounty_not_funded', 'The bounty is not fully escrowed yet.'),
  pool_exhausted: err('pool_exhausted', 'The pool has 12000 cents left; one slot needs 27500.'),
  sla_not_started: err('sla_not_started', 'The review clock has not started for this version.'),
  revision_limit: err('revision_limit', 'Two revision rounds are included; the next round is paid by the brand.'),
  appeal_used: err('appeal_used', 'This rejection already has its one appeal.'),
  below_minimum: err('below_minimum', 'The amount is below the minimum: $5.00 for an instant cash-out, $100.00 for a bounty budget.'),
  method_missing: err('method_missing', 'Add a payout method to cash out.'),
  tax_info_missing: err('tax_info_missing', 'A W-9 is needed before this payout.', 'Add it in Wallet, Tax Desk.'),
  identity_check_required: err('identity_check_required', 'Finish your ID check to be paid.'),
  idempotency_conflict: err('idempotency_conflict', 'This Idempotency-Key was used with a different request.'),
  rate_limited: err('rate_limited', 'Slow down: your plan allows 600 requests per minute.', 'Retry after the number of seconds in Retry-After.'),
  conflict: err('conflict', 'That is not possible in the current state.', 'The message says what to do first.'),
  insufficient_funds: err('insufficient_funds', 'Funding needs 330000 cents; the wallet has 120000 available.', 'Top up the wallet, then fund the bounty.'),
  invalid_transition: err('invalid_transition', 'live -> draft is not an allowed transition.', 'See the state machine of the resource in the contract.'),
  invalid_signature: err('invalid_signature', 'The signature does not match.'),
  unauthorized: err('unauthorized', 'Send a bearer token or an API key.'),
};
