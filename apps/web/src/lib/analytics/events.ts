/**
 * The analytics event catalogue (docs/PRODUCT_SPEC.md section 10). Names are `object_action` in snake case. Each group is a const
 * tuple, so the `EventName` union, the runtime list and the docs cannot drift. The spec writes variants as `a_started|completed`;
 * they are expanded here to one name each.
 *
 * Privacy rules the types enforce or the sanitiser applies (see ./privacy.ts): no free text, no video content, no amounts in URLs,
 * money only as integer cents (`*_cents`), ids pseudonymous, never an email or a name.
 */

export const ACQUISITION_EVENTS = [
  "page_viewed",
  "cta_clicked",
  "audience_toggled",
  "waitlist_joined",
  "waitlist_invite_accepted",
  "tool_started",
  "tool_completed",
  "audit_generated",
  "audit_shared",
  "report_viewed",
  "proof_page_viewed",
  "storefront_viewed",
  "public_bounty_viewed",
  "tracking_link_opened",
  "app_store_clicked",
] as const;

export const CREATOR_ONBOARDING_EVENTS = [
  "signup_started",
  "signup_completed",
  "login_succeeded",
  "persona_switched",
  "earnings_preview_viewed",
  "niche_selected",
  "account_link_started",
  "account_link_completed",
  "account_link_skipped",
  "age_confirmed",
  "first_dollar_path_started",
  "starter_bounty_claimed",
  "permission_primer_shown",
  "permission_granted",
  "permission_denied",
  "first_take_scored",
  "first_submission_sent",
  "first_approval_received",
  "first_dollar_cleared",
] as const;

export const BRAND_ONBOARDING_EVENTS = [
  "workspace_created",
  "app_url_pasted",
  "app_connected",
  "revenuecat_connected",
  "sdk_snippet_copied",
  "attribution_test_passed",
  "code_pool_configured",
  "plan_selected",
] as const;

export const BOUNTY_EVENTS = [
  "bounty_draft_started",
  "bounty_ai_draft_generated",
  "bounty_ai_draft_failed",
  "brief_lint_run",
  "brief_lint_blocked",
  "price_suggestion_viewed",
  "price_suggestion_accepted",
  "rights_card_edited",
  "funding_started",
  "bounty_funded",
  "bounty_published",
  "bounty_paused",
  "bounty_topped_up",
  "bounty_filled",
  "bounty_closed",
  "featured_pin_purchased",
] as const;

export const MARKETPLACE_EVENTS = [
  "feed_viewed",
  "feed_filtered",
  "bounty_viewed",
  "rights_card_opened",
  "pay_math_opened",
  "scorecard_opened",
  "bounty_saved",
  "spot_claimed",
  "spot_expired",
  "daily_drop_viewed",
  "daily_drop_claimed",
  "offer_received",
  "offer_accepted",
  "offer_countered",
  "offer_declined",
  "rate_card_updated",
] as const;

export const STUDIO_EVENTS = [
  "studio_opened",
  "format_selected",
  "script_selected",
  "flo_prompt_sent",
  "take_recorded",
  "teleprompter_used",
  "checklist_beat_ticked",
  "hook_coach_result",
  "edit_applied",
  "score_viewed",
  "fix_applied",
  "preflight_failed",
  "variants_built",
  "draft_saved",
  "upload_started",
  "upload_resumed",
  "upload_completed",
  "submission_sent",
  "post_published",
  "post_url_attached",
] as const;

export const REVIEW_EVENTS = [
  "queue_viewed",
  "submission_opened",
  "feedback_added",
  "decision_made",
  "decision_undone",
  "appeal_filed",
  "appeal_resolved",
  "auto_approve_rule_enabled",
  "auto_approve_dry_run",
  "auto_approve_paused",
  "spot_check_routed",
  "sla_warning_shown",
  "sla_breached",
  "submission_released_to_spec",
] as const;

export const MONEY_EVENTS = [
  "earning_row_viewed",
  "money_clock_opened",
  "window_closed",
  "post_cleared",
  "payout_scheduled",
  "payout_paid",
  "payout_failed",
  "cash_out_started",
  "cash_out_confirmed",
  "payout_method_added",
  "id_verification_started",
  "id_verification_completed",
  "w9_started",
  "w9_completed",
  "tax_csv_exported",
  "invoice_viewed",
  "invoice_downloaded",
  "topup_enabled",
] as const;

export const ATTRIBUTION_EVENTS = [
  "conversion_recorded",
  "webhook_received",
  "funnel_viewed",
  "creator_league_viewed",
  "creative_library_filtered",
  "test_planned",
  "fatigue_alert_sent",
  "promote_requested",
  "creator_consent_given",
  "permission_synced",
  "rights_expiring_alerted",
  "rights_renewed",
  "market_viewed",
  "auction_bid_placed",
  "spec_listed",
  "spec_licensed",
] as const;

export const ENGAGEMENT_EVENTS = [
  "streak_extended",
  "streak_freeze_used",
  "rest_week_taken",
  "tier_changed",
  "leaderboard_viewed",
  "tournament_entered",
  "crew_joined",
  "referral_sent",
  "referral_accepted",
  "academy_lesson_completed",
  "badge_earned",
  "remix_started",
  "earnings_card_created",
  "earnings_card_shared",
  "wrapped_viewed",
  "live_activity_started",
  "widget_added",
  "wellbeing_mode_enabled",
  "quiet_hours_set",
  "notification_opened",
] as const;

export const TRUST_EVENTS = [
  "scam_report_filed",
  "scorecard_viewed",
  "view_ledger_opened",
  "dispute_opened",
  "dispute_resolved",
  "fraud_flag_raised",
  "fraud_case_resolved",
  "compliance_check_failed",
  "compliance_waived",
  "verification_decided",
] as const;

export const PLATFORM_EVENTS = [
  "api_key_created",
  "webhook_endpoint_added",
  "mcp_tool_called",
  "slack_connected",
  "member_invited",
  "role_changed",
  "admin_target_viewed",
  "admin_hold_applied",
  "admin_clawback_applied",
  "ml_calibration_viewed",
] as const;

/** Every event, grouped as the spec groups them. */
export const EVENT_GROUPS = {
  acquisition: ACQUISITION_EVENTS,
  creator_onboarding: CREATOR_ONBOARDING_EVENTS,
  brand_onboarding: BRAND_ONBOARDING_EVENTS,
  bounty: BOUNTY_EVENTS,
  marketplace: MARKETPLACE_EVENTS,
  studio: STUDIO_EVENTS,
  review: REVIEW_EVENTS,
  money: MONEY_EVENTS,
  attribution: ATTRIBUTION_EVENTS,
  engagement: ENGAGEMENT_EVENTS,
  trust: TRUST_EVENTS,
  platform: PLATFORM_EVENTS,
} as const;

export type EventGroup = keyof typeof EVENT_GROUPS;

export type EventName =
  | (typeof ACQUISITION_EVENTS)[number]
  | (typeof CREATOR_ONBOARDING_EVENTS)[number]
  | (typeof BRAND_ONBOARDING_EVENTS)[number]
  | (typeof BOUNTY_EVENTS)[number]
  | (typeof MARKETPLACE_EVENTS)[number]
  | (typeof STUDIO_EVENTS)[number]
  | (typeof REVIEW_EVENTS)[number]
  | (typeof MONEY_EVENTS)[number]
  | (typeof ATTRIBUTION_EVENTS)[number]
  | (typeof ENGAGEMENT_EVENTS)[number]
  | (typeof TRUST_EVENTS)[number]
  | (typeof PLATFORM_EVENTS)[number];

/** Every event name, flat. */
export const ALL_EVENTS: readonly EventName[] = Object.values(EVENT_GROUPS).flatMap((group) => [...group]);

const EVENT_SET: ReadonlySet<string> = new Set(ALL_EVENTS);
export const isEventName = (value: string): value is EventName => EVENT_SET.has(value);

/** The group an event belongs to. */
export function groupOf(event: EventName): EventGroup {
  for (const [group, names] of Object.entries(EVENT_GROUPS) as [EventGroup, readonly string[]][]) {
    if (names.includes(event)) return group;
  }
  throw new Error(`Unknown event: ${event}`);
}

// ── property shapes ────────────────────────────────────────────────────────────────────────────

/** The only value types a property may carry. No nested objects, no free text (the sanitiser also drops long strings). */
export type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProps = Readonly<Record<string, AnalyticsValue | readonly AnalyticsValue[] | undefined>>;

type Surface = "web" | "ios";
type Band = "A" | "B" | "C" | "D" | "E";

/**
 * Properties the spec names for specific events (section 10). Events not listed here take optional free-form
 * `AnalyticsProps` (still sanitised). Money is cents; amounts never go in a path.
 */
export interface EventPropsMap {
  page_viewed: { path: string; referrer_kind?: "direct" | "internal" | "search" | "social" | "other" };
  cta_clicked: { cta: string; location?: string };
  audience_toggled: { audience: "creators" | "brands" };
  tool_started: { tool: string };
  tool_completed: { tool: string };
  persona_switched: { from: string | null; to: string };
  login_succeeded: { role: string; method?: "demo" | "email" | "apple" | "google" };
  brief_lint_run: { errors: number; warnings: number };
  brief_lint_blocked: { rule: string };
  bounty_viewed: { source: "feed" | "drop" | "search" | "link" | "saved" | "offer" | "other" };
  daily_drop_viewed: { state: "pre_drop" | "live" | "sold_out" };
  script_selected: { source: "ai" | "library" | "own" };
  flo_prompt_sent: { kind: string; surface?: string };
  hook_coach_result: { band: Band };
  edit_applied: { edit: "captions" | "silence_cut" | "pip" | "trim" | "music" };
  score_viewed: { hook_band: Band; flow_band: Band };
  preflight_failed: { rule: string };
  post_published: { platform: "tiktok" | "instagram" | "youtube" };
  feedback_added: { category: string; severity: "must_fix" | "suggestion" };
  decision_made: { decision: "approved" | "changes_requested" | "rejected"; reason_code?: string; via: "manual" | "auto" | "timeout" };
  earning_row_viewed: { state: "accruing" | "pending" | "cleared" | "paid" | "held" };
  cash_out_confirmed: { instant: boolean; fee_cents: number };
  conversion_recorded: { kind: "install" | "trial" | "paid"; source: string; confidence: string };
  webhook_received: { provider: string };
  rights_expiring_alerted: { days: 30 | 14 | 7 };
  dispute_resolved: { outcome: "upheld" | "overturned" | "partial" };
  tier_changed: { from: string; to: string };
}

/** The properties argument for an event: required when the spec names them, optional free-form otherwise. */
export type EventArgs<E extends EventName> = E extends keyof EventPropsMap
  ? [props: EventPropsMap[E] & AnalyticsProps]
  : [props?: AnalyticsProps];

/** Every event carries this context (section 10). Set once with `setAnalyticsContext`; `track` adds it to each capture. */
export interface AnalyticsContext {
  role?: "creator" | "brand_member" | "admin";
  /** Pseudonymous workspace id (brand side). */
  workspace_id?: string;
  /** Pseudonymous creator id. */
  creator_id?: string;
  plan?: "free" | "pro" | "scale";
  tier?: "bronze" | "silver" | "gold" | "platinum" | "elite";
  surface: Surface;
  app_version: string;
  /** True in this build: every account is a demo persona. */
  demo: boolean;
  locale: string;
}
