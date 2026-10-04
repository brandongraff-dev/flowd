/**
 * Flo's request contract, as zod schemas. They are the single source of truth: the TypeScript types are inferred from them, the server
 * route validates untrusted JSON with them, and string and array limits keep a public route from becoming a free prompt relay.
 *
 * A task carries the CONTEXT Flo needs (the bounty, the format, the hook) rather than ids to look up, so the provider is pure: the same
 * task always gives the same mock answer, and the Claude provider sees exactly what the person sees.
 */

import { z } from "zod";
import {
  BEAT_IDS,
  BOUNTY_TYPES,
  CATEGORIES,
  FLO_SURFACES,
  FORMAT_IDS,
  HOOK_TYPES,
  PLANS,
  PLATFORMS,
  SCORE_BANDS,
} from "@/lib/contract/types";

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).optional();
const list = (max: number, itemMax: number) => z.array(z.string().trim().min(1).max(itemMax)).max(max);
const cents = z.number().int().min(0).max(100_000_000);

export const FloAppSchema = z.object({
  id: optText(64),
  name: text(80),
  tagline: optText(200),
  category: z.enum(CATEGORIES).optional(),
  /** What the app can demo on screen (3 to 6). */
  features: list(8, 80).optional(),
  hashtags: list(6, 40).optional(),
  /** The app offers a free trial: Flo may say "try it free". */
  has_free_trial: z.boolean().optional(),
});

export const FloBriefSchema = z.object({
  summary: text(600),
  talking_points: list(8, 200).default([]),
  dos: list(8, 200).default([]),
  donts: list(8, 200).default([]),
  beats: z
    .array(z.object({ beat: z.enum(BEAT_IDS), label: text(200), required: z.boolean(), hint: optText(200) }))
    .max(14)
    .default([]),
  cta: text(240),
  offer_line: optText(160),
  hashtags: list(8, 40).default([]),
  tone: optText(160),
  disclosure_text: text(200),
  banned_claims: list(24, 80).default([]),
});

export const FloBountySchema = z.object({
  id: text(80),
  title: text(160),
  app: FloAppSchema,
  brief: FloBriefSchema,
  type: z.enum(BOUNTY_TYPES),
  cpm_cents: cents,
  cpa_install_cents: cents.default(0),
  cpa_trial_cents: cents.default(0),
  cpa_paid_cents: cents.default(0),
  flat_fee_cents: cents.default(0),
  per_video_cap_cents: cents,
  /** Paid-ad usage in days (0 = organic only). */
  paid_ads_days: z.number().int().min(0).max(3650).default(0),
  ai_likeness: z.boolean().default(false),
  format_ids: z.array(z.enum(FORMAT_IDS)).max(11).optional(),
  /** Pay Math at the median creator's views, when known (an estimate). */
  median_pay_cents: cents.optional(),
  p25_pay_cents: cents.optional(),
  p75_pay_cents: cents.optional(),
  review_sla_hours: z.number().int().min(1).max(336).default(72),
});

export const FloFormatSchema = z.object({
  id: z.enum(FORMAT_IDS),
  name: text(80),
  beats: z
    .array(z.object({ beat: z.enum(BEAT_IDS), label: text(120), t_start_s: z.number().min(0).max(300), t_end_s: z.number().min(0).max(300), required: z.boolean(), tip: optText(240) }))
    .min(1)
    .max(14),
  min_duration_s: z.number().min(1).max(300),
  max_duration_s: z.number().min(1).max(300),
  hook_types: z.array(z.enum(HOOK_TYPES)).max(7).optional(),
  faceless: z.boolean().optional(),
});

const context = z.object({ kind: text(40), id: text(80) });

const base = {
  surface: z.enum(FLO_SURFACES).optional(),
  /** What the request is about (a bounty, a submission, an app). Used to match saved suggestions and to label history. */
  context: context.optional(),
  creator_id: optText(64),
  brand_id: optText(64),
  /** What the person typed or tapped, kept for history. Never sent as the instruction on its own. */
  prompt: optText(600),
  /** Regenerate: 0 is the first answer, 1 the next one, and so on. Different attempts give different text. */
  attempt: z.number().int().min(0).max(50).optional(),
};

export const ScoreItemSchema = z.object({
  label: text(120),
  points: z.number().min(0).max(100),
  max: z.number().min(0).max(100),
  passed: z.boolean(),
  reason: text(300),
  fix: optText(300),
});

/** The signals Flo's "what should I do today?" reads. Every field is optional: Flo says what it can see and skips the rest. */
export const NextActionSignalsSchema = z.object({
  posts_counting: z.number().int().min(0).max(1000).optional(),
  streak_weeks: z.number().int().min(0).max(520).optional(),
  freezes_banked: z.number().int().min(0).max(2).optional(),
  posted_this_week: z.boolean().optional(),
  avg_hook_seconds: z.number().min(0).max(30).optional(),
  drop_state: z.enum(["pre_drop", "live", "sold_out"]).optional(),
  drop_spots_left: z.number().int().min(0).max(1000).optional(),
  submissions_waiting: z.number().int().min(0).max(10_000).optional(),
  oldest_waiting_hours: z.number().min(0).max(10_000).optional(),
  rights_expiring_days: z.number().int().min(0).max(365).optional(),
  pending_cents: cents.optional(),
  cleared_cents: cents.optional(),
  next_clear_label: optText(60),
  drafts_unfunded: z.number().int().min(0).max(1000).optional(),
  fatigue_alerts: z.number().int().min(0).max(1000).optional(),
});

export const FloTaskSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("script"),
    bounty: FloBountySchema,
    /** The format the person picked (first option). */
    format: FloFormatSchema.optional(),
    /** Other formats Flo may use for the other options, best first. */
    formats: z.array(FloFormatSchema).max(11).optional(),
    /** The creator's own opening line, if they have one. */
    hook: optText(240),
    /** Their tracking code, so the call to action is ready to read out. */
    creator_code: optText(40),
    /** How many options (1 to 3). Default 3. */
    options: z.number().int().min(1).max(3).optional(),
  }),
  z.object({
    ...base,
    kind: z.literal("hook_rewrite"),
    hook: text(400),
    app: FloAppSchema,
    target_type: z.enum(HOOK_TYPES).optional(),
    limit: z.number().int().min(1).max(5).optional(),
  }),
  z.object({ ...base, kind: z.literal("brief_tldr"), bounty: FloBountySchema }),
  z.object({
    ...base,
    kind: z.literal("caption"),
    bounty: FloBountySchema,
    creator_code: optText(40),
    platform: z.enum(PLATFORMS).optional(),
    count: z.number().int().min(1).max(5).optional(),
  }),
  z.object({
    ...base,
    kind: z.literal("comment_reply"),
    comment: text(500),
    app: FloAppSchema,
    creator_code: optText(40),
    /** The post is a paid partnership. Default true: every flowd post is. */
    sponsored: z.boolean().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal("score_fix"),
    subject: z.enum(["hook", "flow"]),
    audience: z.enum(["creator", "brand"]),
    points: z.number().min(0).max(100),
    band: z.enum(SCORE_BANDS),
    items: z.array(ScoreItemSchema).max(14),
    submission_id: optText(64),
  }),
  z.object({
    ...base,
    kind: z.literal("rate_advice"),
    videos: z.number().int().min(1).max(20),
    paid_usage_days: z.number().int().min(0).max(365),
    suggested_cents: cents,
    p25_cents: cents,
    p75_cents: cents,
    basis: text(300),
    renewal_pct: z.number().min(0).max(1).default(0.25),
  }),
  z.object({ ...base, kind: z.literal("next_action"), role: z.enum(["creator", "brand_member"]), signals: NextActionSignalsSchema }),
  z.object({
    ...base,
    kind: z.literal("bounty_draft"),
    /** An App Store link or an app name. */
    input: text(400),
    app: FloAppSchema.optional(),
    plan: z.enum(PLANS).optional(),
    budget_cents: z.number().int().min(10_000).max(50_000_000).optional(),
    first_bounty: z.boolean().optional(),
    /** The demo world's now (an ISO timestamp), so dates in the draft are relative to it. */
    now: z.string().min(10).max(40),
  }),
]);

/** The body of `POST /api/v1/flo/chat`. */
export const FloChatRequestSchema = z.object({ task: FloTaskSchema });

export type FloApp = z.infer<typeof FloAppSchema>;
export type FloBounty = z.infer<typeof FloBountySchema>;
export type FloFormat = z.infer<typeof FloFormatSchema>;
export type FloScoreItem = z.infer<typeof ScoreItemSchema>;
export type NextActionSignals = z.infer<typeof NextActionSignalsSchema>;
export type FloTask = z.infer<typeof FloTaskSchema>;
export type FloTaskKind = FloTask["kind"];
export type FloChatRequest = z.infer<typeof FloChatRequestSchema>;

/** A task narrowed to one kind. */
export type FloTaskOf<K extends FloTaskKind> = Extract<FloTask, { kind: K }>;
