/**
 * Matching: which bounties a creator sees first, and which creators fit a bounty.
 *
 * Gates first: any failure hides the bounty or shows it locked, with the reason. Then
 *   match = niche overlap x 40 + platform fit x 15 + audience-region fit x 15 + price fit x 15 + brand reliability x 10 + recency x 5
 * with every factor 0 to 1. Price fit = min(bounty expected pay / the creator's usual pay, 1.5) / 1.5. Recency halves every 14 days.
 * Early access: higher tiers see a new bounty before everyone else (Silver 1 h, Gold 3 h, Platinum 6 h, Elite 12 h).
 */

import type { BountyId, BountyStatus, Country, CreatorId, IsoTimestamp, LinkStatus, Niche, Platform, Tier } from "@/lib/contract/types";
import { CONSTANTS, type CpaRates } from "./constants";
import { expectedEarnings } from "./earnings";
import { clamp, clamp01 } from "./stats";
import { earlyAccessAt, tierAtLeast } from "./tiers";
import { DAY_MS, toMs } from "./time";

// ── the score ──────────────────────────────────────────────────────────────────────────────────

/** The five gates. A bounty failing any is hidden or shown locked. */
export type MatchGates = {
  eligibility_tier: boolean;
  country: boolean;
  platform_account_linked: boolean;
  funded: boolean;
  not_already_submitted: boolean;
};

export type GateName = keyof MatchGates;

/** What each failed gate says, in words about the situation, never the person. */
export const GATE_TEXT: Readonly<Record<GateName, string>> = {
  eligibility_tier: "Needs a higher tier or more followers.",
  country: "Not open in your country.",
  platform_account_linked: "Needs a linked account on one of its platforms.",
  funded: "Not live yet. It is not fully funded or has not started.",
  not_already_submitted: "You have already submitted to this bounty.",
};

export interface MatchFactors {
  niche: number;
  platform: number;
  region: number;
  price: number;
  brand_reliability: number;
  recency: number;
}

export interface MatchInput {
  /** Every gate must be true. The names are free so callers can pass their own; the contract names are `MatchGates`. */
  gates: Readonly<Record<string, boolean>>;
  niche_overlap: number;
  platform_fit: number;
  region_fit: number;
  /** Bounty expected pay / the creator's usual pay. Capped at 1.5 in the score. */
  price_ratio: number;
  /** 0 to 100. */
  brand_reliability: number;
  bounty_age_days: number;
}

/** The six factors, each 0 to 1. Price is capped: price fit = min(ratio, 1.5) / 1.5. */
export function matchFactors(inp: Omit<MatchInput, "gates">): MatchFactors {
  const M = CONSTANTS.matching;
  return {
    niche: clamp01(inp.niche_overlap),
    platform: clamp01(inp.platform_fit),
    region: clamp01(inp.region_fit),
    price: clamp(inp.price_ratio, 0, M.price_ratio_cap) / M.price_ratio_cap,
    brand_reliability: clamp01(inp.brand_reliability / 100),
    recency: 0.5 ** (Math.max(0, inp.bounty_age_days) / M.recency_half_life_days),
  };
}

/** Points each factor contributes (weight x factor); they add up to the score before rounding. */
export function matchPoints(f: MatchFactors): MatchFactors {
  const W = CONSTANTS.matching.weights;
  return {
    niche: f.niche * W.niche,
    platform: f.platform * W.platform,
    region: f.region * W.region,
    price: f.price * W.price,
    brand_reliability: f.brand_reliability * W.brand_reliability,
    recency: f.recency * W.recency,
  };
}

/** Match score 0 to 100, or null when a gate fails. */
export function matchScore(inp: MatchInput): number | null {
  if (!Object.values(inp.gates).every(Boolean)) return null;
  const pts = matchPoints(matchFactors(inp));
  return Math.round(pts.niche + pts.platform + pts.region + pts.price + pts.brand_reliability + pts.recency);
}

/** Matches at or above this rank first and read as "top picks". */
export const isTopPick = (score: number | null): boolean => score !== null && score >= CONSTANTS.matching.min_match_to_rank_first;

// ── inputs ─────────────────────────────────────────────────────────────────────────────────────

export interface MatchAccount {
  platform: Platform;
  status: LinkStatus;
  us_audience_ratio: number;
  followers: number;
  median_views_28d: number;
  primary?: boolean;
}

export interface CreatorMatchProfile {
  id: CreatorId;
  tier: Tier;
  country: Country;
  niches: readonly Niche[];
  accounts: readonly MatchAccount[];
  /** What the creator typically earns per post (cents). Defaults to their median views at the default CPM. */
  usual_pay_cents?: number;
  /** Bounties already submitted to. */
  submitted_bounty_ids?: readonly BountyId[];
  reliability_score?: number;
  last_active_at?: IsoTimestamp;
  /** The creator's rate-card minimum CPM. */
  min_cpm_cents?: number;
  open_to_offers?: boolean;
  paused_until?: IsoTimestamp;
}

export interface MatchBounty {
  id: BountyId;
  status: BountyStatus;
  funded: boolean;
  cpm_cents: number;
  rates: CpaRates;
  per_video_cap_cents: number;
  /** Flat fee for direct bounties (cents), 0 otherwise. */
  flat_fee_cents?: number;
  eligibility: { min_tier?: Tier; min_followers?: number; countries: readonly Country[]; niches: readonly Niche[]; min_us_audience_ratio?: number };
  platforms: readonly Platform[];
  regions: readonly Country[];
  /** 0 to 100 (the brand's Scorecard score). */
  brand_reliability: number;
  created_at: IsoTimestamp;
  published_at?: IsoTimestamp;
  starts_at?: IsoTimestamp;
}

const connectedOn = (accounts: readonly MatchAccount[], platforms: readonly Platform[]): MatchAccount[] =>
  accounts.filter((a) => a.status === "connected" && platforms.includes(a.platform));

/** Share of the bounty's niches the creator covers. A bounty open to any niche is a neutral 0.6. */
export function nicheOverlap(creatorNiches: readonly Niche[], bountyNiches: readonly Niche[]): number {
  if (bountyNiches.length === 0) return 0.6;
  return bountyNiches.filter((n) => creatorNiches.includes(n)).length / bountyNiches.length;
}

/** Audience-region fit: against a stated minimum US share, or by country when the bounty names regions. */
export function regionFit(p: { creator_country: Country; us_audience_ratio: number; min_us_audience_ratio?: number; regions: readonly Country[] }): number {
  if (p.min_us_audience_ratio !== undefined && p.min_us_audience_ratio > 0) return clamp01(p.us_audience_ratio / p.min_us_audience_ratio);
  if (p.regions.length === 0) return 1;
  return p.regions.includes(p.creator_country) ? 1 : 0.3;
}

/** The bounty's release moment: when it goes live (or was published). Early access counts back from here. */
const releaseOf = (b: Pick<MatchBounty, "starts_at" | "published_at" | "created_at">): IsoTimestamp => b.starts_at ?? b.published_at ?? b.created_at;

const ageDays = (b: Pick<MatchBounty, "published_at" | "created_at">, now: IsoTimestamp): number => Math.max(0, (toMs(now) - toMs(b.published_at ?? b.created_at)) / DAY_MS);

export interface BountyMatch {
  bounty_id: BountyId;
  /** Null when a gate failed (the bounty is locked). */
  score: number | null;
  locked: boolean;
  gate_failures: GateName[];
  /** Why it is locked, in words. */
  lock_reasons: string[];
  factors: MatchFactors;
  points: MatchFactors;
  /** Expected pay per video for this creator at p25, median and p75 views: the Pay Math on the card. An estimate. */
  expected_pay_cents: { p25: number; median: number; p75: number };
  /** Why it ranks where it does. */
  reasons: string[];
  /** When this creator's tier first sees it (release minus the tier's head start). */
  visible_at: IsoTimestamp;
  visible: boolean;
}

/**
 * Ranks the bounties for a creator's feed. Unlocked matches come first by score, then by expected median pay; locked bounties follow, the ones
 * closest to unlocking (fewest failed gates) first, each with its reasons. Bounties the creator's tier cannot see yet (early access) are left out unless `include_hidden` is set.
 */
export function rankBountiesForCreator(p: { creator: CreatorMatchProfile; bounties: readonly MatchBounty[]; now: IsoTimestamp; include_hidden?: boolean }): BountyMatch[] {
  const { creator, now } = p;
  const submitted = new Set(creator.submitted_bounty_ids ?? []);
  const out: BountyMatch[] = [];
  for (const b of p.bounties) {
    const linked = connectedOn(creator.accounts, b.platforms);
    const best = [...linked].sort((x, y) => y.median_views_28d - x.median_views_28d)[0];
    const el = b.eligibility;
    const minFollowers = el.min_followers;
    const followersOk = minFollowers === undefined || linked.some((a) => a.followers >= minFollowers);
    const gates: MatchGates = {
      eligibility_tier: (el.min_tier === undefined || tierAtLeast(creator.tier, el.min_tier)) && followersOk,
      country: el.countries.length === 0 || el.countries.includes(creator.country),
      platform_account_linked: linked.length > 0,
      funded: b.funded && b.status === "live",
      not_already_submitted: !submitted.has(b.id),
    };
    const medianViews = best?.median_views_28d ?? Math.max(0, ...creator.accounts.map((a) => a.median_views_28d), 0);
    const expected = expectedEarnings({ base_median_views: medianViews, cpm_cents: b.cpm_cents, rates: b.rates, per_video_cap_cents: b.per_video_cap_cents });
    const flat = b.flat_fee_cents ?? 0;
    const pay = { p25: expected.p25.pay_cents + flat, median: expected.median.pay_cents + flat, p75: expected.p75.pay_cents + flat };
    const usual = creator.usual_pay_cents ?? Math.max(1, Math.round((medianViews * CONSTANTS.pay.default_cpm_cents) / 1000));
    const priceRatio = pay.median / usual;
    const input: MatchInput = {
      gates,
      niche_overlap: nicheOverlap(creator.niches, el.niches),
      platform_fit: best ? (best.primary ? 1 : 0.8) : 0,
      region_fit: regionFit({ creator_country: creator.country, us_audience_ratio: best?.us_audience_ratio ?? 0, min_us_audience_ratio: el.min_us_audience_ratio, regions: b.regions }),
      price_ratio: priceRatio,
      brand_reliability: b.brand_reliability,
      bounty_age_days: ageDays(b, now),
    };
    const factors = matchFactors(input);
    const gate_failures = (Object.keys(gates) as GateName[]).filter((g) => !gates[g]);
    const score = matchScore(input);
    const visible_at = earlyAccessAt(releaseOf(b), creator.tier);
    const visible = toMs(now) >= toMs(visible_at);
    if (!visible && !p.include_hidden) continue;
    const reasons: string[] = [];
    if (factors.niche >= 0.99) reasons.push("Matches your niche.");
    else if (factors.niche > 0) reasons.push("Partly matches your niche.");
    // Price fit = min(ratio, 1.5) / 1.5, so "at or above what you usually earn" (ratio 1 or more) is a fit of 1 / 1.5 or more.
    if (pay.median / usual >= 1) reasons.push("Pays at or above what you usually earn.");
    if (factors.brand_reliability >= 0.9) reasons.push("The brand decides fast and pays on time.");
    if (factors.recency >= 0.8) reasons.push("Just posted.");
    out.push({
      bounty_id: b.id,
      score,
      locked: gate_failures.length > 0,
      gate_failures,
      lock_reasons: gate_failures.map((g) => GATE_TEXT[g]),
      factors,
      points: matchPoints(factors),
      expected_pay_cents: pay,
      reasons,
      visible_at,
      visible,
    });
  }
  return out.sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? 1 : -1;
    if (a.locked) return a.gate_failures.length - b.gate_failures.length || a.bounty_id.localeCompare(b.bounty_id);
    return (b.score ?? 0) - (a.score ?? 0) || b.expected_pay_cents.median - a.expected_pay_cents.median || a.bounty_id.localeCompare(b.bounty_id);
  });
}

// ── creators for a bounty ──────────────────────────────────────────────────────────────────────

export interface CreatorMatch {
  creator_id: CreatorId;
  score: number | null;
  gate_failures: string[];
  factors: MatchFactors;
  /** Expected median pay on this bounty for this creator (an estimate). */
  expected_median_pay_cents: number;
  reasons: string[];
}

/**
 * Ranks creators for a bounty (the brand's "creators ready now" and invite lists). Same weights as the feed, with the creator's reliability in the
 * brand-reliability slot and the creator's recent activity in the recency slot. Price fit compares the bounty's CPM with the creator's rate-card
 * minimum. Gates: tier, country, a linked account on a bounty platform, not paused, not already submitted.
 */
export function rankCreatorsForBounty(p: { bounty: MatchBounty; creators: readonly CreatorMatchProfile[]; now: IsoTimestamp; require_open_to_offers?: boolean }): CreatorMatch[] {
  const b = p.bounty;
  const el = b.eligibility;
  const out: CreatorMatch[] = [];
  for (const c of p.creators) {
    const linked = connectedOn(c.accounts, b.platforms);
    const best = [...linked].sort((x, y) => y.median_views_28d - x.median_views_28d)[0];
    const minFollowers = el.min_followers;
    const followersOk = minFollowers === undefined || linked.some((a) => a.followers >= minFollowers);
    const paused = c.paused_until !== undefined && toMs(c.paused_until) > toMs(p.now);
    const failures: string[] = [];
    if (!((el.min_tier === undefined || tierAtLeast(c.tier, el.min_tier)) && followersOk)) failures.push("eligibility_tier");
    if (!(el.countries.length === 0 || el.countries.includes(c.country))) failures.push("country");
    if (linked.length === 0) failures.push("platform_account_linked");
    if (paused) failures.push("paused");
    if ((c.submitted_bounty_ids ?? []).includes(b.id)) failures.push("not_already_submitted");
    if (p.require_open_to_offers && c.open_to_offers === false) failures.push("open_to_offers");
    const medianViews = best?.median_views_28d ?? 0;
    const e = expectedEarnings({ base_median_views: medianViews, cpm_cents: b.cpm_cents, rates: b.rates, per_video_cap_cents: b.per_video_cap_cents });
    const median = e.median.pay_cents + (b.flat_fee_cents ?? 0);
    const usual = c.usual_pay_cents ?? Math.max(1, Math.round((medianViews * CONSTANTS.pay.default_cpm_cents) / 1000));
    const priceRatio = c.min_cpm_cents && c.min_cpm_cents > 0 && b.cpm_cents > 0 ? b.cpm_cents / c.min_cpm_cents : median / usual;
    const lastActiveDays = c.last_active_at ? Math.max(0, (toMs(p.now) - toMs(c.last_active_at)) / DAY_MS) : 30;
    const input: MatchInput = {
      gates: { eligible: failures.length === 0 },
      niche_overlap: nicheOverlap(c.niches, el.niches),
      platform_fit: best ? (best.primary ? 1 : 0.8) : 0,
      region_fit: regionFit({ creator_country: c.country, us_audience_ratio: best?.us_audience_ratio ?? 0, min_us_audience_ratio: el.min_us_audience_ratio, regions: b.regions }),
      price_ratio: priceRatio,
      brand_reliability: c.reliability_score ?? 70,
      bounty_age_days: lastActiveDays,
    };
    const factors = matchFactors(input);
    const score = matchScore(input);
    const reasons: string[] = [];
    if (factors.niche >= 0.99) reasons.push("Covers the bounty's niche.");
    if (factors.region >= 0.99) reasons.push("Audience fits the target region.");
    if (priceRatio >= 1) reasons.push("Price is at or above their minimum.");
    if (factors.brand_reliability >= 0.9) reasons.push("Reliable on finished work.");
    if (lastActiveDays <= 3) reasons.push("Active this week.");
    out.push({ creator_id: c.id, score, gate_failures: failures, factors, expected_median_pay_cents: median, reasons });
  }
  return out.sort((a, b2) => {
    if ((a.score === null) !== (b2.score === null)) return a.score === null ? 1 : -1;
    return (b2.score ?? 0) - (a.score ?? 0) || b2.expected_median_pay_cents - a.expected_median_pay_cents || a.creator_id.localeCompare(b2.creator_id);
  });
}

