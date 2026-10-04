// Nested value types (embedded objects). They have no id and no fixture file of their own.
import { value, req, opt } from './dsl.mjs';

export const VALUE_TYPES = [
  // ── shared ──────────────────────────────────────────────────────────────────────────────────
  value('Address', 'Postal address.', [
    req('line1', 'string'), opt('line2', 'string'), req('city', 'string'), req('region', 'string', 'State / province / county.'),
    req('postal_code', 'string'), req('country', 'enum:Country'),
  ]),
  value('PaymentMethod', 'A brand\'s funding method (card or ACH). Never contains a full number.', [
    req('kind', 'enum:PaymentKind'), req('label', 'string', 'Network or bank label, e.g. "Visa".'), req('last4', 'string'),
    opt('exp', 'string', 'MM/YY for cards.'),
  ]),
  value('PayoutMethod', 'A creator\'s payout destination (Stripe Connect style, mocked).', [
    req('id', 'string', 'pm_<n>.'), req('kind', 'enum:PayoutMethodKind'), req('label', 'string', 'e.g. "Bank account".'), req('last4', 'string'),
    req('status', 'enum:PayoutMethodStatus'), req('instant_capable', 'bool'), opt('verified_at', 'iso'),
  ]),
  value('AutoTopUp', 'Brand wallet auto top-up.', [
    req('enabled', 'bool'), req('threshold_cents', 'cents', 'Top up when the wallet falls below this.'), req('amount_cents', 'cents', 'Amount added each time.'),
  ]),
  value('BillingProfile', 'Brand billing identity and finance-pack fields.', [
    req('legal_name', 'string'), req('billing_email', 'string'), opt('payment_method', 'obj:PaymentMethod'),
    opt('vat_id', 'string', 'EU B2B: reverse charge with both VAT IDs.'), req('po_required', 'bool'), opt('cost_center', 'string'), opt('address', 'obj:Address'),
  ]),
  value('ComplianceDefaults', 'Brand-level compliance defaults copied onto each bounty.', [
    req('disclosure_text', 'string', 'Required wording, e.g. "#ad Paid partnership with Lumi".'),
    req('banned_claims', 'string[]', 'Phrases creators must not say.'),
    req('competitor_names', 'string[]', 'Apps that must not be shown.'),
    req('music_policy', 'enum:MusicPolicy'), req('ai_policy', 'enum:AiContentPolicy'),
  ]),
  value('ChartPoint', 'One point of a daily or weekly series.', [req('date', 'date'), req('value', 'number')]),
  value('Evidence', 'What a rejection, note or flag points at (mandatory on rejection).', [
    req('kind', 'enum:EvidenceKind'), req('ref', 'string', 'A timecode "00:03", a QaCheckType, a quoted brief requirement or a transcript line.'),
    opt('excerpt', 'text', 'The quoted text, if any.'), opt('t_ms', 'int', 'Position in the video, when relevant.'),
  ]),

  // ── creators ────────────────────────────────────────────────────────────────────────────────
  value('Storefront', 'Link-in-bio storefront at joinflowd.io/c/<handle>. Stats shown are verified from the ledger.', [
    req('slug', 'string', 'Equals the creator handle.'), req('headline', 'string'), opt('about', 'text'),
    req('featured_post_ids', 'ref:posts[]'), req('show_stats', 'bool'), req('cta_label', 'string', 'e.g. "Work with me".'), req('theme', 'enum:StorefrontTheme'),
  ]),
  value('PortfolioItem', 'A sample video on a creator profile (generated art, never a real thumbnail).', [
    req('title', 'string'), req('art', 'art'), req('duration_s', 'int'), req('platform', 'enum:Platform'), opt('views', 'int'),
  ]),
  value('CarryOver', 'Verified prior history imported at founding-creator onboarding. Counts toward tier thresholds.', [
    req('source', 'string', 'e.g. "Verified earnings statements (other platforms)".'), req('cleared_cents', 'cents'), req('approved_count', 'int'),
    req('decided_count', 'int'), req('verified_by_user_id', 'ref:users'), req('verified_at', 'iso'),
  ]),
  value('TierReview', 'Manual review required for Elite.', [
    req('status', 'string', '"approved".'), req('reviewer_user_id', 'ref:users'), req('reviewed_at', 'iso'), opt('note', 'text'),
  ]),
  value('AccountHealth', 'Repost-safe Account Health for a social account.', [
    req('score', 'int', '0..100.'), req('status', 'enum:AccountHealthStatus'), req('strikes', 'int'), req('unoriginal_flags', 'int'), req('notes', 'string[]'),
  ]),
  value('RateSuggestion', 'Market-suggested price shown beside a creator\'s ask.', [
    req('price_cents', 'cents'), req('low_cents', 'cents'), req('high_cents', 'cents'), req('basis', 'string', 'e.g. "Median 14.2k views x $2.40 market CPM, 1.3x Silver".'),
    req('confidence', 'ratio'), req('computed_at', 'iso'),
  ]),
  value('RatePackage', 'A bundle on a rate card.', [req('label', 'string'), req('videos', 'int'), req('price_per_video_cents', 'cents')]),
  value('RateCardStats', 'Rate-card activity.', [req('offers_received', 'int'), req('accepted', 'int'), req('median_response_hours', 'number')]),

  // ── apps ────────────────────────────────────────────────────────────────────────────────────
  value('AppPricing', 'Subscription price points of an app.', [
    opt('weekly_cents', 'cents'), req('monthly_cents', 'cents'), req('annual_cents', 'cents'), req('trial_days', 'int'),
  ]),
  value('BrandColors', 'Generated brand colours for an app (used by generated art).', [req('primary', 'hex'), req('secondary', 'hex'), req('accent', 'hex')]),

  // ── bounties ────────────────────────────────────────────────────────────────────────────────
  value('BriefBeat', 'A beat a bounty requires or suggests.', [req('beat', 'enum:BeatId'), req('label', 'string'), req('required', 'bool'), opt('hint', 'string')]),
  value('Brief', 'The creative brief.', [
    req('summary', 'text'), req('talking_points', 'string[]'), req('dos', 'string[]'), req('donts', 'string[]'),
    req('beats', 'obj:BriefBeat[]'), req('cta', 'string', 'Exactly one call to action.'), opt('offer_line', 'string'),
    req('hashtags', 'string[]'), req('mentions', 'string[]'), req('tone', 'string'),
    req('disclosure_text', 'string', 'Auto-added to every posting flow.'), req('banned_claims', 'string[]'),
    opt('example_post_ids', 'ref:posts[]', 'Top posts from earlier bounties to copy the structure of.'), opt('reference_art', 'art[]'),
  ]),
  value('RightsCard', 'Plain-language licence shown on every bounty. Organic posting is always included.', [
    req('organic', 'bool', 'Always true.'), req('paid_ads_days', 'int', '0 = no paid-ad use; default 90.'), req('ad_platforms', 'enum:AdPlatform[]'),
    req('whitelisting', 'bool', 'Spark code / partnership permission is requested on approval.'),
    req('renewal_pct_per_30d', 'ratio', 'Renewal price as a share of the base fee per 30 days; default 0.25.'),
    req('exclusivity_days', 'int'), req('ai_likeness', 'bool', 'Off by default.'), req('territory', 'string'), req('summary', 'text', 'Plain-English paragraph.'),
  ]),
  value('Deliverables', 'What a creator must deliver.', [
    req('videos_per_creator', 'int'), req('min_duration_s', 'int'), req('max_duration_s', 'int'), req('aspect', 'string', '"9:16".'),
    req('platforms', 'enum:Platform[]'), req('regions', 'enum:Country[]'), req('require_face', 'bool'),
    req('music_policy', 'enum:MusicPolicy'), req('ai_policy', 'enum:AiContentPolicy'),
  ]),
  value('Eligibility', 'Who can submit.', [
    opt('min_tier', 'enum:Tier'), opt('min_followers', 'int'), req('countries', 'enum:Country[]'), req('niches', 'enum:Niche[]'),
    opt('min_us_audience_ratio', 'ratio'), req('burner_accounts_allowed', 'bool', 'Always false: bounties may not require burner accounts.'),
  ]),
  value('BriefLintIssue', 'One Brief Lint finding.', [
    req('code', 'enum:BriefLintCode'), req('severity', 'enum:LintSeverity'), req('message', 'string'), opt('field', 'string'),
  ]),
  value('BriefLint', 'Result of Brief Lint on the current brief. Blockers prevent publishing.', [
    req('passed', 'bool', 'True when there are no blockers.'), req('checked_at', 'iso'), req('issues', 'obj:BriefLintIssue[]'),
  ]),
  value('PayMath', 'Pay Math: what a creator is likely to earn and what the brand really pays. Always an estimate.', [
    req('expected_views_p25', 'int'), req('expected_views_median', 'int'), req('expected_views_p75', 'int'),
    req('p25_cents', 'cents', 'Expected creator pay per video at p25 views (CPM + CPA, after the cap).'),
    req('median_cents', 'cents'), req('p75_cents', 'cents'),
    req('creator_cpm_cents', 'cents', 'Blended creator pay per 1,000 views at the median.'),
    req('all_in_cpm_cents', 'cents', 'Creator CPM + platform fee + card processing.'), req('basis', 'string', 'Where the estimate comes from (category market series).'),
  ]),
  value('BountyCounts', 'Denormalised counters on a bounty (validated against submissions and posts).', [
    req('creators', 'int', 'Distinct creators who submitted.'), req('submissions', 'int'), req('in_review', 'int'), req('approved', 'int'),
    req('rejected', 'int'), req('posts', 'int'), req('live_posts', 'int'),
  ]),
  value('FunnelCounts', 'Views to paid. Tracked = link + code (deterministic). est_* = MMP, survey and modelled (never paid).', [
    req('views', 'int', 'Verified views (lifetime).'), req('clicks', 'int', 'Tracked visits: link clicks and code lookups.'),
    req('installs', 'int'), req('trials', 'int'), req('paid', 'int'),
    req('est_installs', 'int'), req('est_trials', 'int'), req('est_paid', 'int'),
  ]),

  // ── submissions & analysis ──────────────────────────────────────────────────────────────────
  value('VideoMeta', 'Video file metadata. There is no real video: playback is a generated thumbnail + waveform.', [
    req('asset_id', 'string', 'vid_<n>. Mux-style asset id (mock).'), req('duration_ms', 'int'), req('width', 'int'), req('height', 'int'),
    req('size_bytes', 'int'), req('fps', 'int'), req('has_captions', 'bool'), req('language', 'string'), req('art', 'art', 'Generated thumbnail.'), req('uploaded_at', 'iso'),
  ]),
  value('SubmissionVersion', 'One uploaded version of a submission (v1, v2, v3). Submissions are versioned, never overwritten.', [
    req('version', 'int'), req('submitted_at', 'iso'), req('video', 'obj:VideoMeta'),
    req('flow_band', 'enum:ScoreBand'), req('flow_points', 'int'), req('hook_band', 'enum:ScoreBand'), req('hook_points', 'int'),
    req('qa_pass', 'int'), req('qa_warn', 'int'), req('qa_fail', 'int'), opt('changes_summary', 'string', 'What the creator changed from the previous version.'),
  ]),
  value('Decision', 'The brand\'s (or system\'s) decision on the current version.', [
    req('action', 'enum:DecisionAction'), req('decided_at', 'iso'), opt('decided_by_user_id', 'ref:users', 'Absent for system decisions.'),
    opt('reason_code', 'enum:ReasonCode', 'Mandatory for reject and request_changes.'), opt('evidence', 'obj:Evidence', 'Mandatory for reject.'),
    opt('summary', 'text'), req('sla_met', 'bool'), req('appeal_used', 'bool'),
  ]),
  value('FraudEvidence', 'Fraud evidence shown in the review queue before approving (creator-level, since there is no post yet).', [
    req('creator_fraud_score', 'int'), req('creator_fraud_band', 'enum:FraudBand'), req('audience_us_ratio', 'ratio'),
    req('view_curve_shape', 'enum:CurveShape', 'Shape of the creator\'s typical view curve.'),
    opt('duplicate_of_submission_id', 'ref:submissions'), opt('phash_distance', 'int'), req('follower_quality', 'ratio'),
  ]),
  value('FraudSignalHit', 'A fraud signal that fired.', [
    req('signal', 'enum:FraudSignal'), req('points', 'int', 'points = max_points x severity, rounded.'), req('severity', 'ratio'), req('detail', 'string'),
  ]),
  value('FraudAssessment', 'Fraud score composition for a post.', [
    req('score', 'int', 'min(100, sum of signal points).'), req('band', 'enum:FraudBand'), req('signals', 'obj:FraudSignalHit[]'), req('assessed_at', 'iso'),
  ]),
  value('TranscriptSegment', 'A transcript line.', [req('t_start_ms', 'int'), req('t_end_ms', 'int'), req('text', 'string')]),
  value('OnScreenText', 'Text detected on screen.', [req('t_start_ms', 'int'), req('t_end_ms', 'int'), req('text', 'string'), req('in_safe_zone', 'bool')]),
  value('SceneCut', 'A scene segment.', [req('t_start_ms', 'int'), req('t_end_ms', 'int'), req('kind', 'enum:SceneKind')]),
  value('BeatHit', 'Whether a beat was found.', [req('beat', 'enum:BeatId'), req('required', 'bool'), req('found', 'bool'), opt('t_ms', 'int')]),
  value('HookAnalysis', 'First-3-seconds analysis.', [
    req('text', 'string', 'The spoken hook line.'), req('hook_type', 'enum:HookType'), req('lands_at_ms', 'int'),
    opt('face_at_ms', 'int'), opt('app_at_ms', 'int'), opt('caption_at_ms', 'int'), req('spoken_matches_onscreen', 'bool'),
  ]),
  value('VideoTags', 'Tags added to every settled post (Creative Intelligence Library).', [
    opt('format_id', 'enum:FormatId'), req('hook_type', 'enum:HookType'), req('hook_words', 'string', 'The first words of the hook.'),
    req('time_to_app_reveal_ms', 'int'), req('cta_type', 'enum:CtaType'),
  ]),
  value('QaCheck', 'One automated QA check result.', [
    req('check', 'enum:QaCheckType'), req('result', 'enum:QaResult'), req('message', 'string'), opt('evidence', 'obj:Evidence'),
    req('blocks_settlement', 'bool', 'True for disclosure fails.'), opt('waived_by_user_id', 'ref:users', 'A brand member waived this warning.'),
  ]),
  value('ScoreItem', 'One checklist line with its reason. Day-one scores are checklist scores.', [
    req('id', 'enum:ScoreItemId'), req('label', 'string'), req('points', 'int'), req('max', 'int'), req('passed', 'bool'),
    req('reason', 'string', 'Plain English, e.g. "No face until 3.1s".'), opt('fix', 'string', 'One-tap fix suggestion.'),
  ]),
  value('ScoreCard', 'A checklist score.', [
    req('band', 'enum:ScoreBand'), req('points', 'int', '0..100.'), req('items', 'obj:ScoreItem[]'),
    req('label', 'string', 'Always "Checklist score. It gets smarter as bounties settle." until a learned model ships.'),
  ]),

  // ── posts / metrics ─────────────────────────────────────────────────────────────────────────
  value('EarningsBreakdown', 'Earnings so far on a post (accrued for live posts, settled afterwards).', [
    req('cpm_cents', 'cents'), req('cpa_cents', 'cents'), req('commission_cents', 'cents'), req('flat_cents', 'cents'), req('total_cents', 'cents'),
    req('capped', 'bool', 'True when the per-video cap limited pay.'), req('cap_remaining_cents', 'cents'),
  ]),
  value('Retention', 'Retention curve of a post.', [
    req('curve', 'number[]', '10 points: share of viewers still watching at 0%, 10% ... 90% of the video.'), req('avg_watch_ratio', 'ratio'), opt('biggest_drop_at_s', 'number'),
  ]),

  // ── ads ─────────────────────────────────────────────────────────────────────────────────────
  value('AdDaily', 'One day of a promoted ad.', [
    req('date', 'date'), req('spend_cents', 'cents'), req('impressions', 'int'), req('clicks', 'int'), req('installs', 'int'), req('trials', 'int'),
    req('paid', 'int'), req('revenue_cents', 'cents'),
  ]),
  value('FatigueInfo', 'Fatigue snapshot on an ad.', [
    req('peak_trial_rate', 'ratio'), req('current_trial_rate', 'ratio'), req('drop_ratio', 'ratio', '1 - current / peak.'), opt('flagged_at', 'iso'),
  ]),

  // ── money ───────────────────────────────────────────────────────────────────────────────────
  value('LineItem', 'An invoice line.', [
    req('description', 'string'), req('quantity', 'int'), req('unit_cents', 'cents'), req('amount_cents', 'cents'),
    opt('bounty_id', 'ref:bounties'), opt('ad_id', 'ref:ads'),
  ]),
  value('TickerTotals', 'Totals on the public payout ticker.', [
    req('total_paid_cents', 'cents'), req('paid_today_cents', 'cents'), req('paid_7d_cents', 'cents'), req('creators_paid', 'int'),
    req('payouts_count', 'int'), req('posts_cleared', 'int'), req('typical_creator_30d_cents', 'cents', 'Median 30-day cleared earnings of active creators (always shown beside top earners). Demo target about $62.'),
    req('p25_creator_30d_cents', 'cents', 'p25 of the same distribution.'), req('p75_creator_30d_cents', 'cents', 'p75 of the same distribution.'),
    req('top_decile_creator_30d_cents', 'cents', 'p90: the "top 10%" figure that is always shown beside the median.'),
    req('active_creators_30d', 'int', 'Creators with at least one post or cleared earning in 30 days (the distribution\'s population).'),
    req('updated_at', 'iso'),
  ]),
  value('ReliabilityComponent', 'One explained part of a reliability score.', [
    req('key', 'string'), req('label', 'string'), req('value', 'ratio'), req('weight', 'ratio'), req('points', 'number'), req('reason', 'string'),
  ]),
  value('TierCriterion', 'One progress line toward the next tier.', [
    req('key', 'string', 'lifetime_cleared | approved | approval_rate | reliability | review.'), req('label', 'string'), req('have', 'number'), req('need', 'number'), req('met', 'bool'),
  ]),
  value('TierProgress', 'Progress toward the next tier (derived; embedded in creator_reputation).', [
    req('current', 'enum:Tier'), opt('next', 'enum:Tier'), req('criteria', 'obj:TierCriterion[]'),
    req('progress', 'ratio', 'The bottleneck: the lowest met/need ratio among numeric criteria.'),
  ]),

  // ── market ──────────────────────────────────────────────────────────────────────────────────
  value('OfferMessage', 'One message in an offer negotiation thread.', [
    req('id', 'string', 'omsg_<n>.'), req('author_role', 'enum:AuthorRole'), opt('author_user_id', 'ref:users'), req('type', 'enum:OfferMessageType'),
    opt('amount_cents', 'cents'), opt('rights_days', 'int'), opt('body', 'text'), req('at', 'iso'),
    opt('warning_code', 'enum:ScamReason', 'Scam Shield annotation on a risky message (e.g. an off-platform request).'),
  ]),
  value('CurvePoint', 'One point on the price-vs-fill-time curve.', [
    req('cpm_cents', 'cents'), req('fill_hours_p50', 'number'), req('fill_hours_p80', 'number'), req('confidence', 'ratio'), req('sample_n', 'int'),
  ]),
  value('SpecStats', 'Spec engagement.', [req('previews', 'int'), req('saves', 'int'), req('licenses', 'int')]),

  // ── growth ──────────────────────────────────────────────────────────────────────────────────
  value('TierThresholds', 'What a tier requires.', [
    req('lifetime_cleared_cents', 'cents'), req('approved_count', 'int'), req('approval_rate_min', 'ratio'), req('reliability_min', 'int'), req('manual_review', 'bool'),
  ]),
  value('TierPerks', 'What a tier unlocks.', [
    req('early_access_hours', 'int'), req('rate_card', 'bool'), req('instant_cashout_free_per_week', 'int'), req('instant_cashout_unlimited', 'bool'),
    req('crews_lead', 'bool'), req('auctions', 'bool'), req('featured_profile', 'bool'),
  ]),
  value('WeekRecord', 'One ISO week in a streak history.', [req('iso_week', 'string', 'e.g. "2026-W40".'), req('outcome', 'enum:WeekOutcome'), req('posts', 'int')]),
  value('DropItem', 'One bounty in a Daily Drop with real inventory.', [
    req('bounty_id', 'ref:bounties'), req('spots_total', 'int'), req('spots_left', 'int', 'True count: spots_total minus claims.'), req('claims', 'obj:DropClaim[]'),
  ]),
  value('DropClaim', 'A creator claimed a drop spot (a 24-hour reserved place to submit).', [req('creator_id', 'ref:creators'), req('claimed_at', 'iso')]),
  value('Prize', 'A tournament prize.', [req('place', 'int'), req('amount_cents', 'cents'), opt('label', 'string')]),
  value('LeaderboardEntry', 'One row of a leaderboard.', [
    req('creator_id', 'ref:creators'), req('rank', 'int'), req('value', 'number', 'The ranked metric (cents, ratio or points).'),
    req('delta_rank', 'int', 'Change vs last week (positive = moved up).'), req('zone', 'enum:LeaderboardZone'),
  ]),
  value('QuizQuestion', 'An Academy quiz question.', [req('prompt', 'string'), req('options', 'string[]'), req('answer_index', 'int'), req('explanation', 'string')]),
  value('LessonBlock', 'A block of lesson content.', [req('kind', 'enum:LessonBlockKind'), opt('title', 'string'), req('body', 'text')]),
  value('FormatBeat', 'A beat in a format template.', [
    req('beat', 'enum:BeatId'), req('label', 'string'), req('t_start_s', 'number'), req('t_end_s', 'number'), req('required', 'bool'), req('tip', 'string'),
  ]),
  value('CategoryRate', 'A ratio for one app category.', [req('category', 'enum:Category'), req('value', 'ratio')]),
  value('FormatStats', 'Settled-post performance of a format.', [
    req('settled_posts', 'int'), req('median_views', 'int'), req('trial_rate', 'ratio', 'Trials per install.'), req('approval_rate', 'ratio'),
    req('trial_rate_by_category', 'obj:CategoryRate[]', 'Trials per install by app category (an array, not a map: Swift convertFromSnakeCase would rewrite snake_case map keys).'),
  ]),
  value('HookStats', 'Settled-post performance of a hook.', [req('uses', 'int'), req('median_views', 'int'), req('trial_rate', 'ratio'), req('avg_hook_score', 'int')]),
  value('HookExample', 'A hook filled in for a category.', [req('category', 'enum:Category'), req('text', 'string')]),
  value('QuietHours', 'Wellbeing quiet hours.', [req('enabled', 'bool'), req('start', 'string', '"22:00" local.'), req('end', 'string', '"08:00" local.'), req('timezone', 'string')]),
  value('NumbersOff', 'Hide live views and earnings in a window.', [req('enabled', 'bool'), opt('from', 'string'), opt('to', 'string')]),
  value('PaceGoal', 'Opt-in soft weekly volume target. Never a tier penalty.', [req('enabled', 'bool'), opt('posts_per_week', 'int')]),

  // ── platform ────────────────────────────────────────────────────────────────────────────────
  value('WebhookDelivery', 'A recent webhook delivery.', [
    req('id', 'string', 'whd_<n>.'), req('event', 'enum:WebhookEventType'), req('status', 'enum:DeliveryStatus'), opt('status_code', 'int'), req('at', 'iso'), req('latency_ms', 'int'),
  ]),
  value('AutoApproveConditions', 'All conditions must hold.', [
    req('min_flow_band', 'enum:ScoreBand'), req('require_all_beats', 'bool'), req('require_disclosure_pass', 'bool'), req('require_no_duplicate', 'bool'),
    req('require_music_pass', 'bool'), req('max_fraud_score', 'int'), req('min_us_audience_ratio', 'ratio'),
    req('min_creator_approved_posts', 'int', 'First-time creators are always manual.'), req('min_creator_approval_rate', 'ratio'),
  ]),
  value('AutoApproveScope', 'Where a rule applies. Organic posting only, never paid-ad rights.', [
    req('bounty_ids', 'ref:bounties[]'), req('tiers', 'enum:Tier[]'), req('platforms', 'enum:Platform[]'),
  ]),
  value('RuleGuardrails', 'Rule guardrails.', [
    req('daily_cap', 'int'), req('budget_cap_cents', 'cents'), req('spot_check_ratio', 'ratio', 'Default 0.10.'), req('pause_on_fraud', 'bool'),
  ]),
  value('DryRun', 'Dry run on the last 50 submissions.', [
    req('ran_at', 'iso'), req('sample_size', 'int'), req('would_approve', 'int'), req('would_send_to_human', 'int'), req('would_block', 'int'),
  ]),
  value('RuleStats', 'Rule outcomes.', [
    req('auto_approved', 'int'), req('spot_checked', 'int'), req('spot_check_overturned', 'int'), opt('last_triggered_at', 'iso'),
  ]),
  value('CellResults', 'Measured results for a test cell.', [
    req('views', 'int'), req('installs', 'int'), req('trials', 'int'), req('paid', 'int'), req('trial_rate', 'ratio'),
  ]),
  value('TestCell', 'One hook x body x CTA combination.', [
    req('id', 'string', 'cell_<n>.'), req('hook_ref', 'string', 'A hook_ id or custom hook text.'), req('body_ref', 'string'), req('cta', 'enum:CtaType'),
    req('status', 'enum:TestCellStatus'), opt('submission_id', 'ref:submissions'), opt('post_id', 'ref:posts'), opt('results', 'obj:CellResults'),
  ]),
  value('TestAxisItem', 'A hook or body option in a plan.', [req('id', 'string'), req('label', 'string')]),
  value('AuditHook', 'A hook suggested in an App UGC Audit.', [req('text', 'string'), req('hook_type', 'enum:HookType'), req('format_id', 'enum:FormatId'), req('hook_points', 'int')]),
  value('AuditBand', 'A predicted range.', [req('low', 'int'), req('median', 'int'), req('high', 'int')]),
  value('ModelMetric', 'A monitoring metric.', [req('label', 'string'), req('value', 'number'), req('unit', 'string')]),
  value('CalibrationBin', 'Predicted band vs reality.', [req('band', 'enum:ScoreBand'), req('count', 'int'), req('median_views', 'int'), req('trial_rate', 'ratio')]),
  value('MetricTarget', 'A day-90 target vs actual.', [
    req('id', 'string'), req('label', 'string'), req('target', 'number'), opt('target_max', 'number'), req('op', 'string', '"lt" | "gt" | "between".'),
    req('unit', 'string'), req('actual', 'number'), req('status', 'enum:MetricStatus'), req('series', 'obj:ChartPoint[]', 'Daily or weekly series ending at "now".'),
  ]),
  value('StateCategoryRow', 'State of App UGC: per-category numbers.', [
    req('category', 'enum:Category'), req('clearing_cpm_cents', 'cents'), req('median_views', 'int'), req('install_to_trial', 'ratio'), req('trial_to_paid', 'ratio'),
    req('median_fill_hours', 'number'), req('settled_posts', 'int'),
  ]),
  value('StateHookRow', 'State of App UGC: hook type leaderboard.', [req('hook_type', 'enum:HookType'), req('share_of_posts', 'ratio'), req('median_views', 'int'), req('trial_rate', 'ratio')]),
  value('StateFormatRow', 'State of App UGC: format leaderboard.', [req('format_id', 'enum:FormatId'), req('share_of_posts', 'ratio'), req('median_views', 'int'), req('trial_rate', 'ratio')]),
  value('FloAction', 'A one-tap action Flo offers.', [req('label', 'string'), req('kind', 'string', 'e.g. "apply_fix", "open_studio", "set_rate".'), opt('payload', 'string')]),
];
