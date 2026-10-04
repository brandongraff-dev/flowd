/**
 * The Attribution Kit: tracking links, the offer-code pool, confidence labels, CPA eligibility and RevenueCat event normalisation.
 *
 * Tracked is not Estimated. A conversion is TRACKED when it came through a creator's link or code (deterministic, the only kind CPA pays on) and
 * ESTIMATED when it is an MMP match, a survey answer or modelled (reported, never paid). Apple caps active offer codes at 10 per subscription SKU, so
 * flowd rotates a pool of codes rather than minting one per creator, and always falls back to the deterministic link.
 */

import type {
  AttributionLink,
  BountyType,
  ConversionConfidence,
  ConversionKind,
  ConversionSource,
  ConversionStatus,
  IsoDate,
  IsoTimestamp,
  OfferCode,
  PeriodType,
  PostStatus,
  RcEventType,
  RcMatchStatus,
} from "@/lib/contract/types";
import { CONSTANTS, isPayableSource, rateForKind, trackedOrEstimated, type CpaRates } from "./constants";
import { conversionRunOnPost } from "./moneyclock";
import { hashString } from "./rng";
import { slugify } from "./text";
import { DAY_MS, dateOf, iso, toMs } from "./time";

// ── confidence labels ──────────────────────────────────────────────────────────────────────────

/** link and code are deterministic, an MMP match is matched, a survey answer is self-reported, and a model is modelled. */
export function confidenceFor(source: ConversionSource): ConversionConfidence {
  switch (source) {
    case "link":
    case "code":
      return "deterministic";
    case "mmp":
      return "matched";
    case "survey":
      return "self_reported";
    case "modelled":
      return "modelled";
  }
}

const SOURCE_NAME: Record<ConversionSource, string> = { link: "link", code: "code", mmp: "MMP", survey: "survey", modelled: "modelled" };

/** The chip on a conversion count: "Tracked (link)", "Estimated (survey)". */
export function sourceChip(source: ConversionSource): { label: string; kind: "tracked" | "estimated"; pays: boolean } {
  const kind = trackedOrEstimated(source);
  return { label: `${kind === "tracked" ? "Tracked" : "Estimated"} (${SOURCE_NAME[source]})`, kind, pays: isPayableSource(source) };
}

// ── CPA eligibility ────────────────────────────────────────────────────────────────────────────

export type EligibilityCode = "ok" | "estimated_source" | "rejected" | "refunded" | "no_rate" | "post_removed" | "before_post" | "outside_window" | "cap_reached" | "still_clearing";

export interface CpaEligibility {
  eligible: boolean;
  code: EligibilityCode;
  /** Plain English for the funnel and dispute screens. */
  message: string;
  /** When a conversion that is still clearing will clear. */
  clears_at?: IsoTimestamp;
}

/**
 * Whether a conversion earns CPA pay. It must be a link or code conversion (never MMP, survey or modelled), not rejected or refunded, for a kind the
 * bounty actually pays, on a post that was not removed or clawed back, inside the 30 days after posting, with room left under the per-video cap, and
 * past its clearing window (install 24 h, trial 72 h, paid 168 h, then the next 14:00 UTC run) and the post's own clearing run (the CPM leg settles
 * first, so the cap can be applied to both).
 */
export function cpaEligibility(p: {
  conversion: { kind: ConversionKind; source: ConversionSource; status: ConversionStatus; occurred_at: IsoTimestamp };
  post: { posted_at: IsoTimestamp; status: PostStatus };
  bounty: { type: BountyType; rates: CpaRates };
  now: IsoTimestamp;
  /** Pool pay left under the per-video cap. Omit when unknown. */
  cap_remaining_cents?: number;
}): CpaEligibility {
  const { conversion: c, post, bounty } = p;
  if (!isPayableSource(c.source)) return { eligible: false, code: "estimated_source", message: "Estimated conversions (MMP, survey, modelled) are reported but never paid. Only tracked link and code conversions pay." };
  if (c.status === "rejected") return { eligible: false, code: "rejected", message: "This conversion was rejected, so it is not paid." };
  if (c.status === "refunded") return { eligible: false, code: "refunded", message: "This conversion was refunded, so it is not paid." };
  if (bounty.type === "cpm" || rateForKind(bounty.rates, c.kind) <= 0) return { eligible: false, code: "no_rate", message: "This bounty does not pay a bonus for this kind of conversion." };
  if (post.status === "removed" || post.status === "clawed_back") return { eligible: false, code: "post_removed", message: "The post was removed, so its conversions are not paid." };
  const days = (toMs(c.occurred_at) - toMs(post.posted_at)) / DAY_MS;
  if (days < 0) return { eligible: false, code: "before_post", message: "This happened before the post went live." };
  if (days > CONSTANTS.pay.cpa_window_days) return { eligible: false, code: "outside_window", message: `Conversions only pay inside ${CONSTANTS.pay.cpa_window_days} days of posting.` };
  if (p.cap_remaining_cents !== undefined && p.cap_remaining_cents <= 0) return { eligible: false, code: "cap_reached", message: "The per-video cap is reached, so this conversion is unpaid." };
  const clears_at = conversionRunOnPost(c.kind, c.occurred_at, post.posted_at);
  if (toMs(clears_at) > toMs(p.now)) return { eligible: false, code: "still_clearing", message: "Still inside its clearing window.", clears_at };
  return { eligible: true, code: "ok", message: "Tracked and cleared. This pays." };
}

// ── links and codes ────────────────────────────────────────────────────────────────────────────

const firstToken = (text: string): string => (slugify(text).split("-")[0] || "x").slice(0, 10);

/**
 * A short, unique tracking code like "maya-lumi7": the creator's handle, the app and a digit. Deterministic: the digit starts from a hash and moves on
 * until the code is free, so the same inputs always give the same code against the same taken set.
 */
export function trackingCode(p: { creator_handle: string; app_slug: string; taken?: ReadonlySet<string> }): string {
  const base = `${firstToken(p.creator_handle)}-${firstToken(p.app_slug)}`;
  const taken = p.taken ?? new Set<string>();
  const start = (hashString(base) % 9) + 1;
  for (let i = 0; i < 9; i += 1) {
    const code = `${base}${((start - 1 + i) % 9) + 1}`;
    if (!taken.has(code)) return code;
  }
  for (let n = 10; ; n += 1) {
    const code = `${base}${n}`;
    if (!taken.has(code)) return code;
  }
}

/** The public tracking URL: joinflowd.io/r/<code>. */
export const shortUrl = (code: string): string => `${CONSTANTS.attribution.link_base}${code}`;

/** The app deep link: <scheme>://r/<code>. */
export const deepLink = (scheme: string, code: string): string => `${scheme}://r/${code}`;

/** Subscriber attributes the SDK snippet writes on first launch. They are immutable once set and only 50 custom attributes are allowed. */
export function sdkAttributes(p: { code: string; creator_id: string; bounty_id: string }): Record<string, string> {
  return { flowd_link: p.code, flowd_creator: p.creator_id, flowd_bounty: p.bounty_id };
}

/** "MAYA-LUMI": the promo code text suggested for a creator and an app. */
export const promoCodeText = (creatorHandle: string, appSlug: string): string => `${firstToken(creatorHandle)}-${firstToken(appSlug)}`.toUpperCase();

// ── the offer-code pool ────────────────────────────────────────────────────────────────────────

type PoolCode = Pick<OfferCode, "id" | "app_id" | "sku" | "code" | "status" | "assigned_creator_id" | "assigned_bounty_id" | "assigned_link_id" | "assigned_at" | "redemptions" | "max_redemptions" | "valid_until" | "rotation_due_at">;

const isActive = (c: Pick<OfferCode, "status">): boolean => c.status === "available" || c.status === "assigned";

/** Active codes (available or assigned) for one subscription SKU of one app. Apple allows 10. */
export const activeCodes = <T extends Pick<OfferCode, "app_id" | "sku" | "status">>(pool: readonly T[], appId: string, sku: string): T[] => pool.filter((c) => c.app_id === appId && c.sku === sku && isActive(c));

export interface PoolHealth {
  active: number;
  /** Apple's cap on active offers per SKU. */
  cap: number;
  free_slots: number;
  available: number;
  assigned: number;
  /** Active codes past their date or out of redemptions: they should be retired. */
  stale: number;
  at_cap: boolean;
  /** Share of all redemptions allowed that have been used across active codes. */
  usage_ratio: number;
}

/** Health of a SKU's code pool: how many slots are used, free and stale. */
export function poolHealth(pool: readonly PoolCode[], appId: string, sku: string, now: IsoTimestamp): PoolHealth {
  const active = activeCodes(pool, appId, sku);
  const cap = CONSTANTS.attribution.apple_active_offers_per_sku;
  const stale = active.filter((c) => toMs(c.valid_until) <= toMs(now) || c.redemptions >= c.max_redemptions).length;
  const used = active.reduce((s, c) => s + c.redemptions, 0);
  const allowed = active.reduce((s, c) => s + c.max_redemptions, 0);
  return {
    active: active.length,
    cap,
    free_slots: Math.max(0, cap - active.length),
    available: active.filter((c) => c.status === "available").length,
    assigned: active.filter((c) => c.status === "assigned").length,
    stale,
    at_cap: active.length >= cap,
    usage_ratio: allowed > 0 ? used / allowed : 0,
  };
}

/** Violations of the pool rules (T-12): at most 10 active codes per (app, SKU), and codes unique per app. */
export function validatePool(pool: readonly PoolCode[]): string[] {
  const out: string[] = [];
  const perSku = new Map<string, number>();
  const codes = new Map<string, number>();
  for (const c of pool) {
    if (isActive(c)) perSku.set(`${c.app_id}|${c.sku}`, (perSku.get(`${c.app_id}|${c.sku}`) ?? 0) + 1);
    codes.set(`${c.app_id}|${c.code}`, (codes.get(`${c.app_id}|${c.code}`) ?? 0) + 1);
  }
  for (const [key, n] of perSku) if (n > CONSTANTS.attribution.apple_active_offers_per_sku) out.push(`${key} has ${n} active codes (the limit is ${CONSTANTS.attribution.apple_active_offers_per_sku}).`);
  for (const [key, n] of codes) if (n > 1) out.push(`${key} is used ${n} times (codes are unique per app).`);
  return out;
}

/** Why a code is due for rotation, or an empty list when it is not. */
export function rotationReasons(code: PoolCode, now: IsoTimestamp, bountyEnded = false): string[] {
  const out: string[] = [];
  if (toMs(code.valid_until) <= toMs(now)) out.push("Past its valid-until date.");
  if (code.redemptions >= code.max_redemptions) out.push("Out of redemptions.");
  if (code.rotation_due_at && toMs(code.rotation_due_at) <= toMs(now)) out.push("Rotation is due.");
  if (bountyEnded && code.status === "assigned") out.push("Its bounty has ended.");
  return out;
}

export type CodeDecision =
  | { action: "reuse"; code: PoolCode; reason: string }
  | { action: "assign_available"; code: PoolCode; reason: string }
  | { action: "create_new"; new_code: string; reason: string }
  | { action: "rotate"; retire: PoolCode; new_code: string; reason: string }
  | { action: "link_only"; reason: string };

/** The desired code, made unique within the app by adding a number. */
export function uniqueCodeText(desired: string, taken: ReadonlySet<string>): string {
  const base = desired.toUpperCase();
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}${n}`)) return `${base}${n}`;
}

/** Codes that have not been assigned for at least this long are not rotated away from a creator who has only just got one. */
const MIN_ROTATION_AGE_DAYS = 14;

/**
 * Chooses a promo code for a creator under the 10-per-SKU cap. In order:
 *   1. the creator already has one for this bounty: reuse it
 *   2. an available (unassigned) code exists: assign it
 *   3. fewer than 10 are active: create a new one
 *   4. at the cap: rotate out a stale code (expired, out of redemptions, rotation due, its bounty ended), then the oldest assigned one past 14 days
 *   5. nothing can rotate: fall back to the deterministic link alone
 * The tracking link is always issued, whatever happens here.
 */
export function assignOfferCode(p: {
  pool: readonly PoolCode[];
  app_id: string;
  sku: string;
  creator_id: string;
  bounty_id: string;
  now: IsoTimestamp;
  /** The code text to create when a new one is needed, e.g. "MAYA-LUMI". */
  desired_code: string;
  /** Bounty ids that have ended, so their codes can rotate. */
  ended_bounty_ids?: readonly string[];
}): CodeDecision {
  const forSku = p.pool.filter((c) => c.app_id === p.app_id && c.sku === p.sku);
  const active = forSku.filter(isActive);
  const taken = new Set(p.pool.filter((c) => c.app_id === p.app_id).map((c) => c.code.toUpperCase()));
  const existing = active.find((c) => c.status === "assigned" && c.assigned_creator_id === p.creator_id && c.assigned_bounty_id === p.bounty_id);
  if (existing) return { action: "reuse", code: existing, reason: "This creator already has a code for this bounty." };
  const open = active.filter((c) => c.status === "available" && toMs(c.valid_until) > toMs(p.now) && c.redemptions < c.max_redemptions).sort((a, b) => toMs(a.valid_until) - toMs(b.valid_until))[0];
  if (open) return { action: "assign_available", code: open, reason: "An unassigned code is ready." };
  const cap = CONSTANTS.attribution.apple_active_offers_per_sku;
  if (active.length < cap) return { action: "create_new", new_code: uniqueCodeText(p.desired_code, taken), reason: `${active.length} of ${cap} active codes used, so there is room for a new one.` };
  const ended = new Set(p.ended_bounty_ids ?? []);
  const stale = active.filter((c) => rotationReasons(c, p.now, c.assigned_bounty_id !== undefined && ended.has(c.assigned_bounty_id)).length > 0).sort((a, b) => toMs(a.valid_until) - toMs(b.valid_until))[0];
  if (stale) return { action: "rotate", retire: stale, new_code: uniqueCodeText(p.desired_code, taken), reason: `At the cap of ${cap}. Retiring ${stale.code}: ${rotationReasons(stale, p.now, stale.assigned_bounty_id !== undefined && ended.has(stale.assigned_bounty_id))[0]}` };
  const old = active
    .filter((c) => c.status === "assigned" && c.assigned_at !== undefined && (toMs(p.now) - toMs(c.assigned_at)) / DAY_MS >= MIN_ROTATION_AGE_DAYS)
    .sort((a, b) => a.redemptions - b.redemptions || toMs(a.assigned_at ?? p.now) - toMs(b.assigned_at ?? p.now))[0];
  if (old) return { action: "rotate", retire: old, new_code: uniqueCodeText(p.desired_code, taken), reason: `At the cap of ${cap}. Rotating ${old.code}, the least-used code assigned more than ${MIN_ROTATION_AGE_DAYS} days ago.` };
  return { action: "link_only", reason: `All ${cap} codes are in active use. This creator gets the tracking link, which is always deterministic.` };
}

// ── RevenueCat ─────────────────────────────────────────────────────────────────────────────────

/** The fields of a RevenueCat webhook event that flowd reads (everything else is ignored). */
export interface RcRawEvent {
  id: string;
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  product_id: string;
  period_type?: string;
  purchased_at_ms: number;
  expiration_at_ms?: number | null;
  environment?: string;
  offer_code?: string | null;
  /** Price in USD. */
  price?: number | null;
  currency?: string;
  /** Share of the price the developer keeps after store fees (0 to 1). */
  takehome_percentage?: number | null;
  is_trial_conversion?: boolean | null;
  country_code?: string;
  cancel_reason?: string;
  subscriber_attributes?: Record<string, { value: string; updated_at_ms?: number }>;
}

export interface RcWebhook {
  api_version?: string;
  event: RcRawEvent;
}

/** A RevenueCat event in flowd's own shape. */
export interface NormalizedRcEvent {
  id: string;
  app_id: string;
  /** Null for event types flowd does not use. */
  event_type: RcEventType | null;
  period_type: PeriodType;
  app_user_id: string;
  /** The subscriber's first RevenueCat id, when it differs (an anonymous user who later signed in). */
  original_app_user_id?: string;
  product_id: string;
  /** Net of store fees; 0 for trials. */
  price_cents: number;
  currency: string;
  is_trial_conversion: boolean;
  offer_code?: string;
  /** Flattened subscriber attributes: flowd_link, flowd_creator, flowd_bounty. */
  subscriber_attributes: Record<string, string>;
  environment: "production" | "sandbox";
  purchased_at: IsoTimestamp;
  expiration_at?: IsoTimestamp;
  received_at: IsoTimestamp;
  idempotency_key: string;
  country?: string;
  /** What this event is to the funnel: a trial, a first payment, a refund, or nothing. */
  kind: ConversionKind | "refund" | null;
}

const EVENT_TYPES: Readonly<Record<string, RcEventType>> = {
  INITIAL_PURCHASE: "initial_purchase",
  RENEWAL: "renewal",
  CANCELLATION: "cancellation",
  UNCANCELLATION: "uncancellation",
  EXPIRATION: "expiration",
  BILLING_ISSUE: "billing_issue",
  PRODUCT_CHANGE: "product_change",
  NON_RENEWING_PURCHASE: "non_renewing_purchase",
  TEST: "test",
};

const periodOf = (raw?: string): PeriodType => (raw?.toUpperCase() === "TRIAL" ? "trial" : raw?.toUpperCase() === "INTRO" ? "intro" : "normal");

/**
 * What a RevenueCat event means for the funnel:
 *   initial purchase in a trial: a trial · initial purchase without a trial, a trial conversion, or a one-time purchase: a paid conversion
 *   a cancellation for a refund (CUSTOMER_SUPPORT): a refund (reverses the conversion) · everything else: nothing
 */
export function classifyRevenueCatEvent(e: Pick<NormalizedRcEvent, "event_type" | "period_type" | "is_trial_conversion"> & { cancel_reason?: string }): ConversionKind | "refund" | null {
  switch (e.event_type) {
    case "initial_purchase":
      return e.period_type === "trial" ? "trial" : "paid";
    case "renewal":
      return e.is_trial_conversion ? "paid" : null;
    case "non_renewing_purchase":
      return "paid";
    case "cancellation":
      return e.cancel_reason?.toUpperCase() === "CUSTOMER_SUPPORT" ? "refund" : null;
    default:
      return null;
  }
}

/** Turns a RevenueCat webhook body into flowd's event shape: lower-case types, flattened attributes, net price in cents, ISO timestamps. */
export function normalizeRevenueCatEvent(body: RcWebhook | RcRawEvent, ctx: { app_id: string; received_at: IsoTimestamp }): NormalizedRcEvent {
  const raw: RcRawEvent = "event" in body ? body.event : body;
  const event_type = EVENT_TYPES[raw.type.toUpperCase()] ?? null;
  const period_type = periodOf(raw.period_type);
  const net = period_type === "trial" ? 0 : Math.round((raw.price ?? 0) * 100 * (raw.takehome_percentage ?? 1));
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.subscriber_attributes ?? {})) attrs[k] = v.value;
  const normalized: NormalizedRcEvent = {
    id: raw.id,
    app_id: ctx.app_id,
    event_type,
    period_type,
    app_user_id: raw.app_user_id,
    product_id: raw.product_id,
    price_cents: Math.max(0, net),
    currency: (raw.currency ?? "USD").toUpperCase(),
    is_trial_conversion: Boolean(raw.is_trial_conversion),
    subscriber_attributes: attrs,
    environment: raw.environment?.toUpperCase() === "SANDBOX" ? "sandbox" : "production",
    purchased_at: iso(raw.purchased_at_ms),
    received_at: ctx.received_at,
    idempotency_key: raw.id,
    kind: null,
  };
  if (raw.original_app_user_id && raw.original_app_user_id !== raw.app_user_id) normalized.original_app_user_id = raw.original_app_user_id;
  if (raw.offer_code) normalized.offer_code = raw.offer_code;
  if (raw.expiration_at_ms) normalized.expiration_at = iso(raw.expiration_at_ms);
  if (raw.country_code) normalized.country = raw.country_code.toUpperCase();
  normalized.kind = classifyRevenueCatEvent({ event_type, period_type, is_trial_conversion: normalized.is_trial_conversion, cancel_reason: raw.cancel_reason });
  return normalized;
}

type LinkRef = Pick<AttributionLink, "id" | "code" | "creator_id" | "bounty_id" | "app_id" | "post_id" | "status">;
type CodeRef = Pick<OfferCode, "code" | "app_id" | "status" | "assigned_link_id" | "assigned_creator_id" | "assigned_bounty_id">;

export interface RcMatch {
  match_status: RcMatchStatus;
  /** How the event was tied to a creator: the tracking link attribute, or the offer code. */
  source?: "link" | "code";
  link_id?: string;
  creator_id?: string;
  bounty_id?: string;
  post_id?: string;
  /** Plain English: why it matched or did not. */
  reason: string;
}

/**
 * A subscriber flowd already tied to a creator through an earlier link or code conversion. Later events for the same subscriber (a cancellation, a
 * refund, a renewal) often carry no flowd attribute, so they are matched back to the creator through this record.
 */
export interface KnownSubscriber {
  /** How the first conversion was tied to the creator. */
  source: "link" | "code";
  creator_id: string;
  link_id?: string;
  bounty_id?: string;
  post_id?: string;
}

/** What the matcher needs from the store. `known_users` is keyed by RevenueCat `app_user_id` (the caller scopes it to one app). */
export interface RcMatchContext {
  links: readonly LinkRef[];
  offer_codes: readonly CodeRef[];
  seen_keys: ReadonlySet<string>;
  accept_sandbox?: boolean;
  known_users?: Readonly<Record<string, KnownSubscriber>>;
}

/**
 * Ties a normalised event to a creator. A redelivery of a seen event is `duplicate` (idempotent). Sandbox and test events are `ignored`. Otherwise the
 * SDK attribute `flowd_link` (a tracking code) matches by LINK, then the offer code matches by CODE, then a subscriber already tied to a creator by an
 * earlier conversion matches through `known_users`; all three are deterministic. Anything else is `unmatched` and shows in the Attribution Kit as an
 * unmatched event, never as a paid conversion.
 */
export function matchRevenueCatEvent(e: NormalizedRcEvent, ctx: RcMatchContext): RcMatch {
  if (ctx.seen_keys.has(e.idempotency_key)) return { match_status: "duplicate", reason: "This event was already ingested. Redeliveries are ignored." };
  if (e.event_type === "test") return { match_status: "ignored", reason: "A test event." };
  if (e.environment === "sandbox" && !ctx.accept_sandbox) return { match_status: "ignored", reason: "A sandbox event. Only production events count." };
  const code = e.subscriber_attributes.flowd_link;
  if (code) {
    const link = ctx.links.find((l) => l.code === code && l.app_id === e.app_id);
    if (link) return { match_status: "matched", source: "link", link_id: link.id, creator_id: link.creator_id, bounty_id: link.bounty_id, ...(link.post_id ? { post_id: link.post_id } : {}), reason: `Matched by tracking link ${code}.` };
  }
  if (e.offer_code) {
    const oc = ctx.offer_codes.find((c) => c.code.toUpperCase() === e.offer_code?.toUpperCase() && c.app_id === e.app_id && c.assigned_creator_id);
    if (oc) {
      const link = oc.assigned_link_id ? ctx.links.find((l) => l.id === oc.assigned_link_id) : undefined;
      return {
        match_status: "matched",
        source: "code",
        ...(oc.assigned_link_id ? { link_id: oc.assigned_link_id } : {}),
        creator_id: oc.assigned_creator_id,
        ...(oc.assigned_bounty_id ? { bounty_id: oc.assigned_bounty_id } : {}),
        ...(link?.post_id ? { post_id: link.post_id } : {}),
        reason: `Matched by offer code ${e.offer_code}.`,
      };
    }
  }
  const known = ctx.known_users?.[e.app_user_id] ?? (e.original_app_user_id ? ctx.known_users?.[e.original_app_user_id] : undefined);
  if (known) {
    return {
      match_status: "matched",
      source: known.source,
      ...(known.link_id ? { link_id: known.link_id } : {}),
      creator_id: known.creator_id,
      ...(known.bounty_id ? { bounty_id: known.bounty_id } : {}),
      ...(known.post_id ? { post_id: known.post_id } : {}),
      reason: "Matched to this subscriber's earlier conversion.",
    };
  }
  return { match_status: "unmatched", reason: code || e.offer_code ? "A link or code was present but does not belong to any creator on this app." : "No flowd link or offer code on this event." };
}

/** A conversion batch to create from a matched event. */
export interface ConversionProposal {
  action: "create_conversion" | "reverse_conversion" | "none";
  kind?: ConversionKind;
  source?: "link" | "code";
  confidence?: ConversionConfidence;
  quantity?: number;
  occurred_on?: IsoDate;
  first_at?: IsoTimestamp;
  /** Net first-payment revenue of a paid conversion. */
  revenue_cents?: number;
  country?: string;
  status?: ConversionStatus;
  payable?: boolean;
  link_id?: string;
  creator_id?: string;
  bounty_id?: string;
  post_id?: string;
}

export interface RcIngest {
  event: NormalizedRcEvent;
  match: RcMatch;
  conversion: ConversionProposal;
}

/**
 * Ingests a RevenueCat webhook: normalise, match, and propose the conversion. CPA only pays when the event confirms a link or code conversion, so a
 * matched trial or first payment becomes a deterministic, payable (pending clearing) conversion; a refund reverses one; everything else changes nothing.
 */
export function ingestRevenueCatEvent(body: RcWebhook | RcRawEvent, ctx: RcMatchContext & { app_id: string; received_at: IsoTimestamp }): RcIngest {
  const event = normalizeRevenueCatEvent(body, ctx);
  const match = matchRevenueCatEvent(event, ctx);
  if (match.match_status !== "matched" || !match.source || event.kind === null) return { event, match, conversion: { action: "none" } };
  const common = { source: match.source, link_id: match.link_id, creator_id: match.creator_id, bounty_id: match.bounty_id, post_id: match.post_id, country: event.country };
  if (event.kind === "refund") return { event, match, conversion: { action: "reverse_conversion", kind: "paid", ...common, status: "refunded", payable: false } };
  return {
    event,
    match,
    conversion: {
      action: "create_conversion",
      kind: event.kind,
      confidence: confidenceFor(match.source),
      quantity: 1,
      occurred_on: dateOf(event.purchased_at),
      first_at: event.purchased_at,
      revenue_cents: event.kind === "paid" ? event.price_cents : 0,
      status: "pending",
      payable: true,
      ...common,
    },
  };
}
