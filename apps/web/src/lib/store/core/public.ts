/**
 * Actions that public pages and growth surfaces need: the ranked waitlist, the founding-creator application, tracking-link clicks, proof pages and
 * Earnings Cards. Most of these work without a signed-in session (a visitor is not a user yet).
 */

import type { Creator, Proof } from "@/lib/contract/types";
import { CONSTANTS, dateOf, hashString, makeArtSeed, makeReferralCode, referralLink, seededRng, typicalBand } from "@/lib/engine";
import { createProof, earningRows } from "./earnings";
import { requireCreator } from "./guards";
import { recountBounty } from "./recount";
import { ensure, type Tx } from "./tx";
import type { FoundingApplication, WaitlistVisitor } from "../state";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const maskEmail = (email: string): string => {
  const [local, domain] = email.trim().toLowerCase().split("@");
  return `${local.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
};

// ── the ranked waitlist ────────────────────────────────────────────────────────────────────────

export interface JoinWaitlistInput {
  email: string;
  role: "creator" | "brand";
  handle?: string;
}

export interface JoinWaitlistResult {
  position: number;
  referral_code: string;
  referral_link: string;
  /** True when this visitor had already joined (their place is returned, nothing changes). */
  already_joined: boolean;
  total: number;
}

/** Joins the ranked waitlist. The place is real (join order; each friend who joins moves you up 25 places) and perks are position-based, never chance-based. */
export function joinWaitlist(tx: Tx, input: JoinWaitlistInput): JoinWaitlistResult {
  ensure(EMAIL.test(input.email.trim()), "email_invalid", "Enter a valid email address.", "Example: you@example.com", 422);
  if (input.handle) ensure(/^@?[a-z0-9._]{2,30}$/i.test(input.handle.trim()), "handle_invalid", "A handle is 2 to 30 letters, numbers, dots or underscores.", undefined, 422);
  const doc = tx.doc("waitlist");
  const total = doc.totals.creators + doc.totals.brands;
  const masked = maskEmail(input.email);
  if (doc.visitor && doc.visitor.masked_email === masked && doc.visitor.role === input.role) {
    return { position: doc.visitor.position, referral_code: doc.visitor.referral_code, referral_link: doc.visitor.referral_link, already_joined: true, total };
  }
  const taken = new Set(tx.all("creators").map((c) => c.referral_code));
  const code = makeReferralCode(input.handle?.replace(/^@/, "") || input.email.split("@")[0], taken);
  const position = total + 1;
  const visitor: WaitlistVisitor = {
    masked_email: masked,
    role: input.role,
    ...(input.handle ? { handle: input.handle.trim().replace(/^@/, "") } : {}),
    position,
    referral_code: code,
    referral_link: referralLink(code),
    referrals: 0,
    joined_at: tx.now,
  };
  tx.setDoc("waitlist", {
    ...doc,
    totals: { ...doc.totals, ...(input.role === "creator" ? { creators: doc.totals.creators + 1 } : { brands: doc.totals.brands + 1 }), updated_at: tx.now },
    demo_position: position,
    demo_referrals: 0,
    visitor,
  });
  return { position, referral_code: code, referral_link: visitor.referral_link, already_joined: false, total: total + 1 };
}

export interface FoundingInput {
  handle: string;
  niche: string;
  /** A link to work the creator has already made (their own channel, a portfolio). */
  proof_url: string;
}

/** Applies for one of the first 200 founding creator places. A person reads it within 48 hours; the place count on the page is the true inventory. */
export function applyFoundingCreator(tx: Tx, input: FoundingInput): { application: FoundingApplication; spots_left: number } {
  ensure(/^@?[a-z0-9._]{2,30}$/i.test(input.handle.trim()), "handle_invalid", "A handle is 2 to 30 letters, numbers, dots or underscores.", undefined, 422);
  ensure(input.niche.trim().length > 0, "niche_required", "Pick the niche you make videos in.", undefined, 422);
  ensure(/^https?:\/\/\S+\.\S+/i.test(input.proof_url.trim()), "proof_invalid", "Paste a link to videos you have made (it must start with https://).", undefined, 422);
  const doc = tx.doc("waitlist");
  ensure(doc.founding_application === undefined, "already_applied", "You already applied. A person reads every application within 48 hours.", undefined, 409);
  const taken = tx.all("creators").filter((c) => c.founding).length;
  const spotsLeft = Math.max(0, CONSTANTS.founding.creator_count - taken);
  ensure(spotsLeft > 0, "founding_full", "All 200 founding places are taken.", "Join the waitlist and we will tell you when the next group opens.", 409);
  const n = (hashString(`${input.handle}|${tx.now}`) % 9000) + 1000;
  const application: FoundingApplication = { handle: input.handle.trim().replace(/^@/, ""), niche: input.niche.trim(), proof_url: input.proof_url.trim(), case_id: `FC-2026-${n}`, status: "in_review", submitted_at: tx.now };
  tx.setDoc("waitlist", { ...doc, founding_application: application });
  return { application, spots_left: spotsLeft };
}

// ── tracking links and proof pages ─────────────────────────────────────────────────────────────

/** A person opens `joinflowd.io/r/<code>`: the click is logged on the link, the post and the bounty's funnel. No session needed. */
export function recordLinkClick(tx: Tx, input: { code: string }): { counted: boolean; app_id?: string; link_id?: string } {
  const code = input.code.trim().toLowerCase();
  const link = tx.all("attribution_links").find((l) => l.code.toLowerCase() === code);
  if (!link || link.status !== "active") return { counted: false };
  tx.patch("attribution_links", link.id, { clicks: link.clicks + 1, last_click_at: tx.now });
  if (link.post_id) {
    const post = tx.get("posts", link.post_id);
    if (post) {
      tx.patch("posts", post.id, { funnel: { ...post.funnel, clicks: post.funnel.clicks + 1 } });
      recountBounty(tx, post.bounty_id);
    }
  }
  return { counted: true, app_id: link.app_id, link_id: link.id };
}

/** A proof page was opened. */
export function recordProofView(tx: Tx, input: { proof_id: string }): { page_views: number } {
  const proof = tx.get("proofs", input.proof_id);
  if (!proof || proof.revoked) return { page_views: 0 };
  return { page_views: tx.patch("proofs", proof.id, { page_views: proof.page_views + 1 }).page_views };
}

const proofIdFor = (seed: string): string => `prf_${hashString(`proof|${seed}`).toString(36).padStart(8, "0").slice(0, 8)}`;

export interface ShareProofInput {
  /** A paid or in-transit payout to make a proof from. */
  payout_id?: string;
  /** A calendar month ("2026-09") of cleared earnings. */
  month?: string;
  /** Show "A Silver creator" instead of the handle. */
  anonymous?: boolean;
}

function ticker(tx: Tx): { median: number; p25: number; p75: number } {
  const t = tx.doc("ticker").totals;
  const band = typicalBand([t.typical_creator_30d_cents, t.p25_creator_30d_cents, t.p75_creator_30d_cents].filter((v) => v > 0));
  return { median: t.typical_creator_30d_cents || band.median, p25: t.p25_creator_30d_cents || band.p25, p75: t.p75_creator_30d_cents || band.p75 };
}

/**
 * Creates (or returns) the public proof page of a payout or a month, the data behind an Earnings Card. It always carries the typical creator's figure
 * beside the amount. Only the creator can share their own money; an anonymous proof never names them.
 */
export function shareProof(tx: Tx, input: ShareProofInput): { proof: Proof; url: string } {
  const { creator } = requireCreator(tx);
  ensure(Boolean(input.payout_id) !== Boolean(input.month), "choose_one", "Pick a payout or a month to share.", undefined, 422);
  const typical = ticker(tx);
  if (input.payout_id) {
    const payout = tx.must("payouts", input.payout_id, "Payout");
    ensure(payout.creator_id === creator.id, "forbidden", "That payout belongs to another creator.", undefined, 403);
    ensure(payout.status === "paid" || payout.status === "in_transit", "invalid_state", "Only a payout that has been sent can be shared.", undefined, 409);
    const proof = withAnonymity(tx, createProof(tx, payout), creator, input.anonymous);
    return { proof, url: `${CONSTANTS.world.public_domain}/p/${proof.id}` };
  }
  const month = input.month as string;
  ensure(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), "month_invalid", "Use a month like 2026-09.", undefined, 422);
  const id = proofIdFor(`${creator.id}|${month}`);
  const existing = tx.get("proofs", id);
  if (existing && !existing.revoked) {
    const proof = withAnonymity(tx, existing, creator, input.anonymous);
    return { proof, url: `${CONSTANTS.world.public_domain}/p/${proof.id}` };
  }
  const rows = earningRows(tx, creator.id).filter((e) => e.cleared_at !== undefined && e.cleared_at.startsWith(month));
  ensure(rows.length > 0, "nothing_to_share", "No earnings cleared in that month yet.", "Pick a month with cleared money.", 409);
  const amount = rows.reduce((s, r) => s + r.amount_cents, 0);
  const posts = new Set(rows.map((r) => r.post_id).filter(Boolean)).size;
  const proof: Proof = {
    id,
    kind: "month",
    creator_id: creator.id,
    handle: input.anonymous ? `A ${creator.tier[0].toUpperCase()}${creator.tier.slice(1)} creator` : creator.handle,
    anonymous: input.anonymous === true,
    period_label: new Date(`${month}-15T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    period_start: `${month}-01`,
    period_end: dateOf(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString()),
    amount_cents: amount,
    tier: creator.tier,
    posts_count: posts,
    typical_median_cents: typical.median,
    typical_p25_cents: typical.p25,
    typical_p75_cents: typical.p75,
    ledger_hash: hashString(rows.map((r) => r.id).join("|")).toString(16).padStart(8, "0") + hashString(`${id}|${amount}`).toString(16).padStart(8, "0").slice(0, 4),
    art: makeArtSeed(seededRng(id), { label: input.anonymous ? creator.tier : creator.handle }),
    revoked: false,
    page_views: 0,
    created_at: tx.now,
  };
  tx.put("proofs", proof);
  return { proof, url: `${CONSTANTS.world.public_domain}/p/${proof.id}` };
}

function withAnonymity(tx: Tx, proof: Proof, creator: Creator, anonymous: boolean | undefined): Proof {
  if (anonymous === undefined || anonymous === proof.anonymous) return proof;
  return tx.patch("proofs", proof.id, { anonymous, handle: anonymous ? `A ${creator.tier[0].toUpperCase()}${creator.tier.slice(1)} creator` : creator.handle });
}

/** The creator takes a proof page down (the link then shows the revoked state). */
export function revokeProof(tx: Tx, input: { proof_id: string }): { proof: Proof } {
  const { creator } = requireCreator(tx);
  const proof = tx.must("proofs", input.proof_id, "Proof");
  ensure(proof.creator_id === creator.id, "forbidden", "That proof belongs to another creator.", undefined, 403);
  return { proof: proof.revoked ? proof : tx.patch("proofs", proof.id, { revoked: true }) };
}
