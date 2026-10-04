/**
 * Adapters from store rows to the engine's input shapes (matching, fraud evidence, auto-approve). Pure functions of a state, shared by the
 * actions, the selectors and the server-side mock API, so every surface ranks and gates identically.
 */

import type { Bounty, Creator, SocialAccount, Submission, VideoAnalysis } from "@/lib/contract/types";
import { ratesOf, type AutoApproveSubject, type CreatorMatchProfile, type MatchAccount, type MatchBounty } from "@/lib/engine";
import type { DemoState } from "../state";

type Db<K extends keyof DemoState> = Pick<DemoState, K>;

const BUSY: ReadonlySet<Submission["status"]> = new Set<Submission["status"]>(["qa_pending", "in_review", "changes_requested", "approved", "posted", "appealed"]);

/** Statuses that count against a creator's videos-per-bounty limit (a rejection, withdrawal or expiry frees the slot). */
export const COUNTS_AGAINST_LIMIT = BUSY;

/** The connected accounts of a creator in the shape matching reads. */
export function matchAccounts(accounts: readonly SocialAccount[]): MatchAccount[] {
  return accounts.map((a) => ({ platform: a.platform, status: a.status, us_audience_ratio: a.us_audience_ratio, followers: a.followers, median_views_28d: a.median_views_28d, primary: a.primary }));
}

/** A creator as the matching engine sees them. */
export function creatorProfile(db: Db<"social_accounts" | "submissions" | "rate_cards">, creator: Creator): CreatorMatchProfile {
  const accounts = Object.values(db.social_accounts).filter((a) => a.creator_id === creator.id);
  const submitted = Object.values(db.submissions)
    .filter((s) => s.creator_id === creator.id && BUSY.has(s.status))
    .map((s) => s.bounty_id);
  const rate = Object.values(db.rate_cards).find((r) => r.creator_id === creator.id);
  return {
    id: creator.id,
    tier: creator.tier,
    country: creator.country,
    niches: creator.niches,
    accounts: matchAccounts(accounts),
    submitted_bounty_ids: submitted,
    reliability_score: creator.reliability_score,
    last_active_at: creator.last_active_at,
    ...(rate ? { min_cpm_cents: rate.min_cpm_cents } : {}),
    open_to_offers: creator.open_to_offers,
    ...(creator.paused_until ? { paused_until: creator.paused_until } : {}),
  };
}

/** A bounty as the matching engine sees it (the brand's Scorecard score stands in for brand reliability). */
export function matchBounty(db: Db<"brand_scorecards">, b: Bounty): MatchBounty {
  const score = Object.values(db.brand_scorecards).find((s) => s.brand_id === b.brand_id)?.reliability_score;
  return {
    id: b.id,
    status: b.status,
    funded: b.funded,
    cpm_cents: b.cpm_cents,
    rates: ratesOf(b),
    per_video_cap_cents: b.per_video_cap_cents,
    flat_fee_cents: b.flat_fee_cents,
    eligibility: { ...(b.eligibility.min_tier ? { min_tier: b.eligibility.min_tier } : {}), ...(b.eligibility.min_followers !== undefined ? { min_followers: b.eligibility.min_followers } : {}), countries: b.eligibility.countries, niches: b.eligibility.niches, ...(b.eligibility.min_us_audience_ratio !== undefined ? { min_us_audience_ratio: b.eligibility.min_us_audience_ratio } : {}) },
    platforms: b.deliverables.platforms,
    regions: b.deliverables.regions,
    brand_reliability: score ?? 75,
    created_at: b.created_at,
    ...(b.published_at ? { published_at: b.published_at } : {}),
    starts_at: b.starts_at,
  };
}

/** What an auto-approve rule reads about a submission, from its analysis, its creator and its fraud evidence. */
export function autoApproveSubject(sub: Submission, analysis: VideoAnalysis | undefined, creator: Creator, bounty: Bounty): AutoApproveSubject {
  const check = (t: string): string | undefined => analysis?.checks.find((c) => c.check === t)?.result;
  const required = analysis?.beats.filter((b) => b.required) ?? [];
  const v = sub.versions[sub.version - 1];
  return {
    submission_id: sub.id,
    bounty_id: sub.bounty_id,
    creator_id: sub.creator_id,
    tier: creator.tier,
    platform: bounty.deliverables.platforms[0] ?? "tiktok",
    flow_band: sub.flow_band,
    beats_found: required.length > 0 ? required.filter((b) => b.found).length : v ? Math.max(0, 5 - v.qa_fail) : 0,
    beats_required: required.length > 0 ? required.length : 5,
    disclosure_pass: analysis ? check("disclosure_audio") === "pass" && check("disclosure_onscreen") === "pass" : (v?.qa_fail ?? 0) === 0,
    no_duplicate: analysis ? check("duplicate") !== "fail" && sub.fraud_evidence.duplicate_of_submission_id === undefined : sub.fraud_evidence.duplicate_of_submission_id === undefined,
    music_pass: analysis ? check("music_licence") !== "fail" : true,
    fraud_score: sub.fraud_evidence.creator_fraud_score,
    us_audience_ratio: sub.fraud_evidence.audience_us_ratio,
    creator_approved_count: creator.approved_count,
    creator_approval_rate: creator.approval_rate,
    submitted_at: sub.versions[sub.version - 1]?.submitted_at ?? sub.submitted_at,
  };
}
