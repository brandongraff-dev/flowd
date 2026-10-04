/**
 * Rights: the Rights Card, the Rights Vault, expiry alerts and renewal pricing.
 *
 * Organic posting is always included. Paid-ad usage defaults to 90 days and is renewable at 25% of the base fee per extra 30 days. AI likeness is
 * off by default. Expiry alerts go out at 30, 14 and 7 days. Ads stop automatically when the Spark code or the rights term ends. The Rights Card is
 * plain language (about grade 8) and is snapshotted onto a submission when the creator accepts it: later edits never change what was accepted.
 */

import type { AdPlatform, IsoTimestamp, RightsCard, RightsGrantStatus, RightsScope } from "@/lib/contract/types";
import { CONSTANTS } from "./constants";
import { formatMoney, formatPercent, mulRate } from "./money";
import { addDays, DAY_MS, toMs } from "./time";
import { joinList } from "./text";

const PLATFORM_LABEL: Record<AdPlatform, string> = { tiktok: "TikTok", meta: "Meta" };

// ── the Rights Card ────────────────────────────────────────────────────────────────────────────

export interface RightsCardOptions {
  paid_ads_days?: number;
  ad_platforms?: readonly AdPlatform[];
  whitelisting?: boolean;
  renewal_pct_per_30d?: number;
  exclusivity_days?: number;
  ai_likeness?: boolean;
  territory?: string;
}

/**
 * A Rights Card with the platform defaults: organic always, 90 days of paid ads on TikTok and Meta, a Spark or partnership permission requested on
 * approval, renewal at 25% of the base fee per 30 days, no exclusivity, AI likeness off, worldwide. Pass `paid_ads_days: 0` for organic only.
 */
export function buildRightsCard(options: RightsCardOptions = {}): RightsCard {
  const days = options.paid_ads_days ?? CONSTANTS.rights.paid_ads_default_days;
  const platforms = days > 0 ? [...(options.ad_platforms ?? (["tiktok", "meta"] as AdPlatform[]))] : [];
  const card: RightsCard = {
    organic: true,
    paid_ads_days: days,
    ad_platforms: platforms,
    whitelisting: days > 0 ? (options.whitelisting ?? true) : false,
    renewal_pct_per_30d: options.renewal_pct_per_30d ?? CONSTANTS.rights.renewal_fee_pct_of_base_per_30d,
    exclusivity_days: options.exclusivity_days ?? 0,
    ai_likeness: options.ai_likeness ?? CONSTANTS.rights.ai_likeness_default,
    territory: options.territory ?? "Worldwide",
    summary: "",
  };
  return { ...card, summary: rightsSummary(card) };
}

/**
 * The plain-English paragraph of a Rights Card. Short sentences, everyday words, no legalese. It always says what is included, what costs extra,
 * and that AI likeness is off.
 */
export function rightsSummary(card: Omit<RightsCard, "summary"> | RightsCard): string {
  const parts: string[] = ["You post this video on your own account. That is always included."];
  if (card.paid_ads_days > 0) {
    const where = card.ad_platforms.length > 0 ? ` on ${joinList(card.ad_platforms.map((p) => PLATFORM_LABEL[p]))}` : "";
    parts.push(`The brand can also run it as a paid ad${where} for ${card.paid_ads_days} days.`);
    parts.push(card.whitelisting ? "You will be asked to approve the ad permission when your video is approved." : "The brand cannot run it through your account.");
    const per30 = formatPercent(card.renewal_pct_per_30d, 0);
    parts.push(`After that it stops, unless the brand pays you ${per30} of your fee for every extra 30 days.`);
  } else {
    parts.push("Paid ads are not included. The brand needs your agreement and a separate price to run it as an ad.");
  }
  parts.push(card.exclusivity_days > 0 ? `You agree not to make a video for a competing app for ${card.exclusivity_days} days.` : "There is no exclusivity.");
  parts.push(card.ai_likeness ? "AI use of your voice or face is included in this licence." : "Your voice and face are never cloned or recreated with AI.");
  parts.push(`Territory: ${card.territory.toLowerCase() === "worldwide" ? "worldwide" : card.territory}.`);
  return parts.join(" ");
}

export interface RightsLine {
  id: "organic" | "paid_ads" | "whitelisting" | "exclusivity" | "ai_likeness" | "renewal" | "territory";
  label: string;
  value: string;
  /** True when the line is a restriction or a cost the creator should read twice. */
  notable: boolean;
}

/** The Rights Card as table rows, for the chip, the bounty page and the submit screen. */
export function rightsLines(card: RightsCard): RightsLine[] {
  return [
    { id: "organic", label: "Organic posting", value: "Always included", notable: false },
    { id: "paid_ads", label: "Paid ads", value: card.paid_ads_days > 0 ? `${card.paid_ads_days} days${card.ad_platforms.length > 0 ? ` on ${joinList(card.ad_platforms.map((p) => PLATFORM_LABEL[p]))}` : ""}` : "Not included", notable: card.paid_ads_days > 0 },
    { id: "whitelisting", label: "Spark code or partnership permission", value: card.whitelisting ? "Requested when approved" : "No", notable: card.whitelisting },
    { id: "exclusivity", label: "Exclusivity", value: card.exclusivity_days > 0 ? `${card.exclusivity_days} days` : "None", notable: card.exclusivity_days > 0 },
    { id: "ai_likeness", label: "AI likeness", value: card.ai_likeness ? "Included" : "Off", notable: card.ai_likeness },
    { id: "renewal", label: "Renewal", value: card.paid_ads_days > 0 ? `${formatPercent(card.renewal_pct_per_30d, 0)} of your fee per extra 30 days` : "Not applicable", notable: false },
    { id: "territory", label: "Territory", value: card.territory, notable: false },
  ];
}

export interface RightsIssue {
  severity: "blocker" | "warning";
  message: string;
}

/** Problems with a Rights Card. Blockers match Brief Lint: a term over 365 days is perpetual, and AI likeness needs a separate agreement. */
export function validateRightsCard(card: RightsCard): RightsIssue[] {
  const out: RightsIssue[] = [];
  if (!card.organic) out.push({ severity: "blocker", message: "Organic posting is always included." });
  if (card.paid_ads_days > CONSTANTS.lint.thresholds.max_paid_ads_days) out.push({ severity: "blocker", message: "Paid-ad terms over 365 days are treated as perpetual. Use a fixed term with a priced renewal." });
  if (card.paid_ads_days < 0) out.push({ severity: "blocker", message: "The paid-ad term cannot be negative." });
  if (card.ai_likeness) out.push({ severity: "blocker", message: "AI likeness is off by default and needs a separate agreement." });
  if (card.renewal_pct_per_30d < 0 || card.renewal_pct_per_30d > 1) out.push({ severity: "blocker", message: "Renewal must be a share of the base fee between 0% and 100%." });
  if (card.paid_ads_days > 0 && card.ad_platforms.length === 0) out.push({ severity: "warning", message: "Paid ads are included but no ad platform is named." });
  if (!(CONSTANTS.rights.exclusivity_options_days as readonly number[]).includes(card.exclusivity_days)) out.push({ severity: "warning", message: "Exclusivity is usually 14, 30 or 60 days." });
  return out;
}

// ── renewals ───────────────────────────────────────────────────────────────────────────────────

/** Renewal price for one 30-day period: round(base fee x renewal share). Default 25%. */
export const renewalPricePer30 = (baseFeeCents: number, renewalPct: number = CONSTANTS.rights.renewal_fee_pct_of_base_per_30d): number => mulRate(baseFeeCents, renewalPct);

export interface RenewalQuote {
  /** 30-day periods bought: ceil(extra days / 30). */
  periods: number;
  per_30_cents: number;
  /** What the creator earns (outside the per-video cap). */
  price_cents: number;
  /** The platform fee on top, paid by the brand. */
  fee_cents: number;
  /** What the brand pays: price + fee. */
  total_cents: number;
  /** The new end of the rights, when the current end is known. */
  new_ends_at?: IsoTimestamp;
  /** "Extend 60 days for $38.28 (+ $3.83 fee)". */
  summary: string;
}

/**
 * Prices extending paid-ad rights. Each started 30 days is one period at round(base fee x 25%); the brand pays the plan fee on top. The base fee
 * is the post's settled creator pay (or the flat fee for a direct bounty).
 */
export function renewalQuote(p: { base_fee_cents: number; renewal_pct_per_30d?: number; extra_days: number; take_rate: number; current_ends_at?: IsoTimestamp }): RenewalQuote {
  const periods = Math.max(0, Math.ceil(p.extra_days / 30));
  const per30 = renewalPricePer30(p.base_fee_cents, p.renewal_pct_per_30d);
  const price = per30 * periods;
  const fee = mulRate(price, p.take_rate);
  return {
    periods,
    per_30_cents: per30,
    price_cents: price,
    fee_cents: fee,
    total_cents: price + fee,
    ...(p.current_ends_at && periods > 0 ? { new_ends_at: addDays(p.current_ends_at, periods * 30) } : {}),
    summary: periods === 0 ? "Nothing to renew." : `Extend ${periods * 30} days for ${formatMoney(price)}${fee > 0 ? ` (+ ${formatMoney(fee)} fee)` : ""}`,
  };
}

// ── expiry and the vault ───────────────────────────────────────────────────────────────────────

/** Days left until `endsAt` (fractional; negative once ended). */
export const daysLeft = (endsAt: IsoTimestamp, now: IsoTimestamp): number => (toMs(endsAt) - toMs(now)) / DAY_MS;

/** The end of a rights term: start + days. */
export const rightsEndsAt = (startsAt: IsoTimestamp, termDays: number): IsoTimestamp => addDays(startsAt, termDays);

export interface AlertsDue {
  /** Every alert threshold (30, 14, 7) now crossed and not yet sent. */
  due: number[];
  /** The most urgent of them, the one to actually send, or null. */
  send: number | null;
}

/**
 * Which expiry alerts are due. Thresholds are 30, 14 and 7 days left; one is due when the days left are at or under it and it has not been sent.
 * If the job was late and several are due at once, send only the most urgent: `send`.
 */
export function dueExpiryAlerts(p: { ends_at: IsoTimestamp; alerts_sent: readonly number[]; now: IsoTimestamp }): AlertsDue {
  const left = daysLeft(p.ends_at, p.now);
  if (left <= 0) return { due: [], send: null };
  const due = [...CONSTANTS.rights.expiry_alert_days].filter((d) => left <= d && !p.alerts_sent.includes(d)).sort((a, b) => b - a);
  return { due, send: due.length > 0 ? due[due.length - 1] : null };
}

/**
 * The status a grant should show now: revoked stays revoked; a permission still waiting stays pending; past its end it is expired; inside 30 days of
 * its end it is expiring; a renewal request is kept; otherwise active.
 */
export function deriveGrantStatus(p: { status: RightsGrantStatus; ends_at?: IsoTimestamp; revoked_at?: IsoTimestamp; now: IsoTimestamp }): RightsGrantStatus {
  if (p.revoked_at || p.status === "revoked") return "revoked";
  if (p.status === "pending_permission") return "pending_permission";
  if (!p.ends_at) return "active";
  const left = daysLeft(p.ends_at, p.now);
  if (left <= 0) return "expired";
  if (p.status === "renewal_requested") return "renewal_requested";
  return left <= Math.max(...CONSTANTS.rights.expiry_alert_days) ? "expiring" : "active";
}

/** Spark code lengths TikTok offers: 7, 30, 60 or 365 days. */
export const SPARK_OPTIONS_DAYS: readonly number[] = CONSTANTS.rights.spark_code_options_days;

/** The shortest Spark code that covers the rights term, or 365 when none is long enough. (Codes cannot be reactivated, so too short is worse than too long.) */
export function sparkCodeDaysFor(termDays: number): number {
  return SPARK_OPTIONS_DAYS.find((d) => d >= termDays) ?? SPARK_OPTIONS_DAYS[SPARK_OPTIONS_DAYS.length - 1];
}

/** Ads stop at the earlier of the Spark code expiry and the end of the rights term. */
export function effectiveAdEnd(p: { code_expires_at?: IsoTimestamp; rights_ends_at?: IsoTimestamp }): { ends_at: IsoTimestamp | null; limited_by: "spark_code" | "rights" | null } {
  if (p.code_expires_at && p.rights_ends_at) return toMs(p.code_expires_at) < toMs(p.rights_ends_at) ? { ends_at: p.code_expires_at, limited_by: "spark_code" } : { ends_at: p.rights_ends_at, limited_by: "rights" };
  if (p.code_expires_at) return { ends_at: p.code_expires_at, limited_by: "spark_code" };
  if (p.rights_ends_at) return { ends_at: p.rights_ends_at, limited_by: "rights" };
  return { ends_at: null, limited_by: null };
}

/** True when an ad must stop now, with the reason (the auto-end rule). */
export function adMustStop(p: { now: IsoTimestamp; code_expires_at?: IsoTimestamp; rights_ends_at?: IsoTimestamp }): { stop: boolean; reason?: string } {
  const end = effectiveAdEnd(p);
  if (!end.ends_at || toMs(end.ends_at) > toMs(p.now)) return { stop: false };
  return { stop: true, reason: end.limited_by === "spark_code" ? "The Spark code expired. Codes cannot be reactivated; request a new one." : "The rights term ended. Renew it to keep the ad running." };
}

/** What the vault needs of a grant. */
export interface VaultGrant {
  id: string;
  scope: RightsScope;
  status: RightsGrantStatus;
  ends_at?: IsoTimestamp;
  renewal_price_cents: number;
  alerts_sent: readonly number[];
  ad_id?: string;
}

export interface RightsVault<T extends VaultGrant> {
  expired: T[];
  within_7: T[];
  within_14: T[];
  within_30: T[];
  later: T[];
  /** Organic grants and anything without an end. */
  no_end: T[];
  /** Cost to renew everything that ends inside 30 days for one more period. */
  renewal_exposure_cents: number;
  /** Alerts that should go out now: the most urgent per grant. */
  alerts_due: { grant_id: string; days: number }[];
}

/**
 * The Rights Vault view: grants bucketed by how soon they end (expired, 7, 14, 30 days, later, no end), the cost of renewing what is about to
 * end, and the alerts due now. Revoked grants are left out. Each bucket is sorted by end date, soonest first.
 */
export function rightsVault<T extends VaultGrant>(grants: readonly T[], now: IsoTimestamp): RightsVault<T> {
  const v: RightsVault<T> = { expired: [], within_7: [], within_14: [], within_30: [], later: [], no_end: [], renewal_exposure_cents: 0, alerts_due: [] };
  const sorted = [...grants].filter((g) => g.status !== "revoked").sort((a, b) => toMs(a.ends_at ?? "9999-12-31") - toMs(b.ends_at ?? "9999-12-31"));
  for (const g of sorted) {
    if (!g.ends_at) {
      v.no_end.push(g);
      continue;
    }
    const left = daysLeft(g.ends_at, now);
    if (left <= 0) v.expired.push(g);
    else if (left <= 7) v.within_7.push(g);
    else if (left <= 14) v.within_14.push(g);
    else if (left <= 30) v.within_30.push(g);
    else v.later.push(g);
    if (left > 0 && left <= 30) {
      v.renewal_exposure_cents += g.renewal_price_cents;
      const a = dueExpiryAlerts({ ends_at: g.ends_at, alerts_sent: g.alerts_sent, now });
      if (a.send !== null) v.alerts_due.push({ grant_id: g.id, days: a.send });
    }
  }
  return v;
}
