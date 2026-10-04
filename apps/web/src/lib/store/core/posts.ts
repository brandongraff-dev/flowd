/**
 * Posting an approved video: the post is created, the 72-hour view window opens, rights are granted, the compliance audit runs and the Money Clock starts.
 */

import type {
  ComplianceAudit,
  Platform,
  Post,
  RightsGrant,
  Submission,
  VideoAnalysis,
  VideoTags,
} from "@/lib/contract/types";
import {
  CONSTANTS,
  addDays,
  auditPostCompliance,
  hashString,
  mulRate,
  predictedViews,
  rightsEndsAt,
  windowEndsAt,
  renewalPricePer30,
} from "@/lib/engine";
import { auditPostComplianceCaption } from "./compliance";
import { openAccrual } from "./earnings";
import { releaseFor } from "./escrow";
import { requireBrand, requireCreator } from "./guards";
import { logActivity, notifyBrand } from "./notify";
import { recountBounty } from "./recount";
import { refreshCreator } from "./creator-stats";
import { recordPostInStreak } from "./streaks";
import { ensure, type Tx } from "./tx";

const PLATFORM_HOST: Record<Platform, string> = { tiktok: "https://www.tiktok.com", instagram: "https://www.instagram.com", youtube: "https://www.youtube.com" };

/** A fictional platform post url that follows each platform's shape (text only; flowd never links to a real account). */
function platformUrl(platform: Platform, handle: string, id: string): string {
  if (platform === "tiktok") return `${PLATFORM_HOST.tiktok}/@${handle}/video/${id}`;
  if (platform === "instagram") return `${PLATFORM_HOST.instagram}/reel/${id}/`;
  return `${PLATFORM_HOST.youtube}/shorts/${id}`;
}

/** The caption a creator posts: their own words plus the locked auto-disclosure (#ad and the brand wording) and the brief's hashtags. */
export function composeCaption(own: string | undefined, p: { disclosure: string; hashtags: readonly string[]; link?: string }): string {
  const text = (own ?? "").trim();
  const hasAd = /(^|[^a-z0-9])#ad(?![a-z0-9])/i.test(text);
  const parts = [text, hasAd ? "" : p.disclosure, ...p.hashtags.filter((h) => !text.toLowerCase().includes(h.toLowerCase()) && h.toLowerCase() !== "#ad")].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export interface AttachPostInput {
  submission_id: string;
  platform?: Platform;
  social_account_id?: string;
  /** The creator's caption; the disclosure and hashtags are added if missing. */
  caption?: string;
  /** The post URL (optional in the demo; one is generated when absent). */
  url?: string;
  /** Whether the platform's own paid-partnership label was switched on. */
  platform_label_on?: boolean;
}

export interface AttachPostResult {
  post: Post;
  /** The caption that was posted (disclosure and hashtags added). */
  caption: string;
  window_ends_at: string;
  compliance: ComplianceAudit;
}

/**
 * Attaches the live post of an approved submission. The reservation returns to the pool (an approved post is paid even if the pool later empties),
 * the 72-hour window opens, the Rights Card becomes grants, the compliance audit runs, and an accruing Money Clock row shows the estimate.
 */
export function attachPost(tx: Tx, input: AttachPostInput): AttachPostResult {
  const { creator } = requireCreator(tx);
  const sub = tx.must("submissions", input.submission_id, "Submission");
  ensure(sub.creator_id === creator.id, "forbidden", "That submission belongs to another creator.", undefined, 403);
  ensure(sub.status === "approved", "invalid_state", sub.status === "posted" ? "This video is already posted." : `This video is ${sub.status.replace(/_/g, " ")}, so it cannot be posted yet.`, sub.status === "posted" ? undefined : "Only an approved video can be posted.", 409);
  const bounty = tx.must("bounties", sub.bounty_id);
  const app = tx.must("apps", sub.app_id);
  const link = tx.must("attribution_links", sub.link_id, "Tracking link");
  const platform = input.platform ?? bounty.deliverables.platforms[0] ?? "tiktok";
  ensure(bounty.deliverables.platforms.includes(platform), "wrong_platform", `This bounty is for ${bounty.deliverables.platforms.join(" and ")}.`, undefined, 422);
  const accounts = tx.all("social_accounts").filter((a) => a.creator_id === creator.id && a.platform === platform && a.status === "connected");
  const account = (input.social_account_id ? accounts.find((a) => a.id === input.social_account_id) : undefined) ?? accounts.find((a) => a.primary) ?? accounts[0];
  ensure(account, "no_account", `Link a ${platform} account first.`, "Open Settings and connect it (read-only).", 409);

  const id = tx.nextId("post");
  const platformPostId = String(BigInt(hashString(`${id}|${creator.id}`)) * 1_000_003n + 7_000_000_000_000_000_000n);
  const url = input.url?.trim() || platformUrl(platform, account.handle, platformPostId);
  ensure(/^https?:\/\//i.test(url), "invalid_url", "Paste the full link to your post.", undefined, 422);
  const caption = composeCaption(input.caption, { disclosure: bounty.brief.disclosure_text, hashtags: bounty.brief.hashtags, link: link.short_url });
  const version = sub.versions[sub.version - 1];
  const analysis = tx.get("video_analyses", `va_${sub.id.slice(4)}_v${sub.version}`) as VideoAnalysis | undefined;
  const tags: VideoTags = analysis?.tags ?? { ...(sub.format_id ? { format_id: sub.format_id } : {}), hook_type: "direct_question", hook_words: sub.title.split(/\s+/).slice(0, 4).join(" "), time_to_app_reveal_ms: 2500, cta_type: "link_in_bio" };
  const windowEnds = windowEndsAt(tx.now);
  const post: Post = {
    id,
    submission_id: sub.id,
    creator_id: creator.id,
    brand_id: sub.brand_id,
    app_id: sub.app_id,
    bounty_id: sub.bounty_id,
    social_account_id: account.id,
    platform,
    platform_post_id: platformPostId,
    url,
    caption,
    hashtags: caption.match(/#[a-z0-9_]+/gi) ?? [],
    thumb: version.video.art,
    duration_ms: version.video.duration_ms,
    posted_at: tx.now,
    window_ends_at: windowEnds,
    status: "live",
    tracking_link_id: link.id,
    ...(link.promo_code ? { promo_code: link.promo_code } : {}),
    views: 0,
    window_views: 0,
    views_invalid: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    retention: { curve: [1, 0.86, 0.76, 0.69, 0.63, 0.58, 0.54, 0.5, 0.47, 0.44], avg_watch_ratio: 0.56 },
    funnel: { views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0 },
    earnings: { cpm_cents: 0, cpa_cents: 0, commission_cents: 0, flat_cents: 0, total_cents: 0, capped: false, cap_remaining_cents: bounty.per_video_cap_cents },
    fraud: { score: 0, band: "clean", signals: [], assessed_at: tx.now },
    flow_band: sub.flow_band,
    is_winner: false,
    tags,
  };
  tx.put("posts", post);
  releaseFor(tx, sub.bounty_id, sub.reserved_cents);
  tx.patch("submissions", sub.id, { status: "posted", post_id: id, posted_at: tx.now, reserved_cents: 0, updated_at: tx.now });
  tx.patch("attribution_links", link.id, { post_id: id });

  // rights: organic always; a paid-ads term when the Rights Card includes one
  const base = bounty.flat_fee_cents > 0 ? bounty.flat_fee_cents : 0;
  const grantBase = {
    post_id: id,
    submission_id: sub.id,
    bounty_id: bounty.id,
    brand_id: bounty.brand_id,
    app_id: app.id,
    creator_id: creator.id,
    base_fee_cents: base,
    renewal_pct_per_30d: sub.rights_card.renewal_pct_per_30d,
    renewal_price_cents: renewalPricePer30(base, sub.rights_card.renewal_pct_per_30d),
    renewals: [] as RightsGrant["renewals"],
    alerts_sent: [] as number[],
    ai_likeness: false,
    created_at: tx.now,
    updated_at: tx.now,
  };
  tx.put("rights_grants", { id: tx.nextId("rg"), ...grantBase, scope: "organic", status: "active", starts_at: tx.now });
  if (sub.rights_card.paid_ads_days > 0) {
    tx.put("rights_grants", { id: tx.nextId("rg"), ...grantBase, scope: "paid_ads", status: "active", starts_at: tx.now, ends_at: rightsEndsAt(tx.now, sub.rights_card.paid_ads_days), ...(sub.rights_card.ad_platforms[0] ? { platform: sub.rights_card.ad_platforms[0] } : {}) });
  }

  // compliance audit (a failed disclosure blocks settlement until it is fixed or waived)
  const qa = analysis ? { checks: analysis.checks } : { checks: [] };
  const audit = auditPostCompliance({ caption, brand_name: app.name, tracking_link: link.short_url, platform_label_on: input.platform_label_on, qa });
  const compliance: ComplianceAudit = {
    id: tx.nextId("cc"),
    post_id: id,
    submission_id: sub.id,
    bounty_id: bounty.id,
    brand_id: bounty.brand_id,
    creator_id: creator.id,
    checks: audit.checks,
    overall: audit.overall,
    blocks_settlement: audit.blocks_settlement,
    checked_at: tx.now,
  };
  tx.put("compliance_checks", compliance);

  // the Money Clock starts: a live estimate from the creator's median views at the Flow band
  const medianViews = account.median_views_28d;
  const expectedViews = predictedViews(medianViews, sub.flow_band);
  const estimate = Math.min(bounty.per_video_cap_cents, Math.round((expectedViews * bounty.cpm_cents) / 1000)) + bounty.flat_fee_cents;
  openAccrual(tx, post, bounty, estimate);

  recountBounty(tx, bounty.id);
  refreshCreator(tx, creator.id);
  recordPostInStreak(tx, creator.id);
  const save = tx.all("bounty_saves").find((s) => s.creator_id === creator.id && s.bounty_id === bounty.id);
  if (save) tx.patch("bounty_saves", save.id, { stage: "submitted", submission_id: sub.id, updated_at: tx.now });
  notifyBrand(tx, bounty.brand_id, { kind: "post_live", title: `A video is live for "${bounty.title}"`, body: `@${creator.handle} posted on ${platform}. The 72-hour view window is open.`, route: `/brand/bounties/${bounty.id}?tab=submissions`, ref_kind: "post", ref_id: id, member_id: bounty.owner_member_id });
  logActivity(tx, { brand_id: bounty.brand_id, action: "submission_approved", summary: `@${creator.handle} posted the approved video for "${bounty.title}" on ${platform}`, target_kind: "post", target_id: id });
  return { post: tx.must("posts", id), caption, window_ends_at: windowEnds, compliance };
}

/** The creator deletes a post before its window closes: it earns nothing and the estimate disappears. After the window the post stays (delivered views are paid). */
export function removePost(tx: Tx, input: { post_id: string }): { post: Post } {
  const { creator } = requireCreator(tx);
  const post = tx.must("posts", input.post_id, "Post");
  ensure(post.creator_id === creator.id, "forbidden", "That post belongs to another creator.", undefined, 403);
  ensure(post.status === "live", "invalid_state", "Only a post inside its 72-hour window can be removed. After that the views are final and paid.", undefined, 409);
  tx.patch("posts", post.id, { status: "removed", removed_at: tx.now });
  for (const r of tx.all("money_clock").filter((m) => m.post_id === post.id && m.state === "accruing")) tx.remove("money_clock", r.id);
  for (const g of tx.all("rights_grants").filter((x) => x.post_id === post.id)) tx.patch("rights_grants", g.id, { status: "revoked", revoked_at: tx.now, revoke_reason: "Post removed by the creator", updated_at: tx.now });
  recountBounty(tx, post.bounty_id);
  refreshCreator(tx, creator.id);
  return { post: tx.must("posts", post.id) };
}

/** The creator edits the caption of a post whose disclosure failed: the audit re-runs; if it passes, the hold is lifted. */
export function fixCaption(tx: Tx, input: { post_id: string; caption: string }): { post: Post; compliance: ComplianceAudit } {
  const { creator } = requireCreator(tx);
  const post = tx.must("posts", input.post_id, "Post");
  ensure(post.creator_id === creator.id, "forbidden", "That post belongs to another creator.", undefined, 403);
  const bounty = tx.must("bounties", post.bounty_id);
  const link = tx.must("attribution_links", post.tracking_link_id);
  const caption = composeCaption(input.caption, { disclosure: bounty.brief.disclosure_text, hashtags: bounty.brief.hashtags, link: link.short_url });
  tx.patch("posts", post.id, { caption, hashtags: caption.match(/#[a-z0-9_]+/gi) ?? [] });
  return { post: tx.must("posts", post.id), compliance: auditPostComplianceCaption(tx, post.id, caption) };
}

/** Brand waives a compliance warning with a logged reason (a failed disclosure can only be waived with a reason). */
export function waiveCompliance(tx: Tx, input: { post_id: string; reason: string }): { compliance: ComplianceAudit } {
  const post = tx.must("posts", input.post_id, "Post");
  const { member } = requireBrand(tx, post.brand_id, "review");
  ensure(input.reason.trim().length >= 10, "reason_required", "Say why you are waiving this. It is logged.", undefined, 422);
  const audit = tx.all("compliance_checks").find((c) => c.post_id === post.id);
  ensure(audit, "not_found", "No compliance audit for this post yet.", undefined, 404);
  const next = tx.patch("compliance_checks", audit.id, { waived_by_member_id: member?.id ?? "bm_system", waive_reason: input.reason.trim(), blocks_settlement: false });
  return { compliance: next };
}

/** Per-video cap and fee helper used in previews: what the post can cost at most. */
export const maxPostCost = (b: { per_video_cap_cents: number; take_rate: number }): number => b.per_video_cap_cents + mulRate(b.per_video_cap_cents, b.take_rate);

export type { Submission };
export { addDays, CONSTANTS };
