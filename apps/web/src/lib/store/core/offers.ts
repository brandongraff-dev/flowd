/**
 * Offers: a brand and a creator agree a price in the app. Invites point at an open bounty; direct offers are bought from a rate card; re-buys build on a
 * winning post. At most three counter rounds; seven days to answer. Accepting a direct offer funds a private direct bounty from the brand wallet.
 */

import type { Bounty, BountyId, BrandMember, Creator, Deliverables, Offer, OfferMessage, Plan, RateCard, RightsCard } from "@/lib/contract/types";
import {
  CONSTANTS,
  addDays,
  buildRightsCard,
  clockLabel,
  escrowFundTxn,
  formatMoney,
  fundedMemo,
  fundEscrow,
  lintBrief,
  makeArtSeed,
  mulRate,
  payMath,
  seededRng,
  takeRateFor,
  toMs,
  type RightsCardOptions,
} from "@/lib/engine";
import { slug } from "../ids";
import { defaultBrief, bountyIdFor } from "./bounty-draft";
import { availableWallet, ensureWalletCovers } from "./billing";
import { applyEscrow, escrowOf } from "./escrow";
import { requireBrand, requireCreator } from "./guards";
import { logActivity, notifyBrand, notifyCreator } from "./notify";
import { scamWarningFor } from "./scamshield";
import { ActionError, ensure, type Tx } from "./tx";

const TRAP_CODES = new Set(["view_minimum_base", "unpaid_trial", "burner_account", "fresh_account_demand", "forced_posting_count", "perpetual_rights", "ai_likeness_requested", "pay_to_join"]);

/** Brief Lint's text traps applied to an offer's words: an offer cannot demand a burner account or pay-to-join either. */
function ensureCleanOffer(text: readonly string[], rights: RightsCard, deliverables: Deliverables): void {
  const lint = lintBrief(
    {
      type: "direct",
      plan: "free" as Plan,
      cpm_cents: 0,
      per_video_cap_cents: 100_000,
      budget_cents: 100_000,
      brief: { summary: text.join(" "), talking_points: [], dos: [], donts: [], cta: "Link in bio", tone: "", disclosure_text: "#ad" },
      rights_card: rights,
      deliverables,
      starts_at: "2026-01-01T00:00:00Z",
      ends_at: "2026-02-01T00:00:00Z",
    },
    "2026-01-01T00:00:00Z",
  );
  const blockers = lint.findings.filter((f) => f.severity === "blocker" && TRAP_CODES.has(f.code));
  if (blockers.length > 0) {
    throw new ActionError("offer_lint_blockers", `This offer can't be sent: ${blockers.map((b) => b.title.toLowerCase()).join(", ")}.`, blockers[0].fix, 422);
  }
}

const message = (tx: Tx, p: Omit<OfferMessage, "id" | "at">): OfferMessage => {
  const warning = p.body ? scamWarningFor(p.body) : null;
  return { id: tx.nextId("omsg"), at: tx.now, ...p, ...(warning ? { warning_code: warning } : {}) };
};

export interface SendOfferInput {
  creator_id: string;
  app_id: string;
  title: string;
  /** The total price for the deliverables (0 for an invite, which pays the bounty's rates). */
  amount_cents: number;
  kind?: Offer["kind"];
  /** Invites: the open bounty. */
  bounty_id?: BountyId;
  /** Re-buys: the winning post the new hooks are based on. */
  rebuy_of_post_id?: string;
  deliverables?: Partial<Deliverables>;
  rights?: RightsCardOptions;
  turnaround_days?: number;
  message: string;
}

/** A brand sends an offer. The opening note is scanned by Scam Shield; the offer expires in seven days. */
export function sendOffer(tx: Tx, input: SendOfferInput): { offer: Offer } {
  const app = tx.must("apps", input.app_id, "App");
  const { member, brand } = requireBrand(tx, app.brand_id, "build");
  const creator = tx.must("creators", input.creator_id, "Creator");
  const kind = input.kind ?? "direct";
  ensure(creator.open_to_offers, "not_open_to_offers", `@${creator.handle} is not taking offers right now.`, "Invite them to an open bounty instead.", 409);
  ensure(input.message.trim().length >= 10, "message_required", "Add a short note: what you want, and why this creator.", undefined, 422);
  const rate = tx.all("rate_cards").find((r) => r.creator_id === creator.id);
  let amount = Math.max(0, Math.round(input.amount_cents));
  let bounty: Bounty | undefined;
  if (kind === "invite") {
    bounty = tx.must("bounties", input.bounty_id, "Bounty");
    ensure(bounty.brand_id === brand.id && bounty.status === "live", "invalid_bounty", "Pick one of your live bounties to invite them to.", undefined, 409);
    amount = 0;
  } else {
    ensure(rate?.accepts_direct_offers && rate.status !== "paused", "no_rate_card", `@${creator.handle} does not take direct offers.`, "Creators take direct offers once they have a rate card (Silver and above).", 409);
    ensure(amount >= CONSTANTS.pay.min_bounty_budget_cents / 4, "amount_too_small", "The smallest direct offer is $25.", undefined, 422);
  }
  const rights = buildRightsCard(input.rights ?? { paid_ads_days: CONSTANTS.rights.paid_ads_default_days });
  const base = tx.all("bounties").find((b) => b.id === input.bounty_id);
  const deliverables: Deliverables = {
    videos_per_creator: 1,
    min_duration_s: 15,
    max_duration_s: 45,
    aspect: "9:16",
    platforms: rate?.platforms.length ? rate.platforms : ["tiktok"],
    regions: ["US"],
    require_face: false,
    music_policy: brand.compliance_defaults.music_policy,
    ai_policy: brand.compliance_defaults.ai_policy,
    ...(base?.deliverables ?? {}),
    ...(input.deliverables ?? {}),
  };
  ensureCleanOffer([input.title, input.message], rights, deliverables);
  const take = takeRateFor({ plan: brand.plan, type: "direct" });
  const row: Offer = {
    id: tx.nextId("offer"),
    kind,
    status: "awaiting_creator",
    brand_id: brand.id,
    app_id: app.id,
    creator_id: creator.id,
    created_by_member_id: member?.id ?? "bm_system",
    title: input.title.trim(),
    ...(bounty ? { bounty_id: bounty.id } : {}),
    ...(rate && kind !== "invite" ? { rate_card_id: rate.id } : {}),
    ...(input.rebuy_of_post_id ? { rebuy_of_post_id: input.rebuy_of_post_id } : {}),
    amount_cents: amount,
    original_amount_cents: amount,
    ...(rate && kind !== "invite" ? { ask_cents: rate.price_per_video_cents * deliverables.videos_per_creator } : {}),
    ...(rate?.suggested ? { suggested: rate.suggested } : {}),
    take_rate: take,
    all_in_cents: amount + mulRate(amount, take),
    deliverables,
    rights_card: bounty?.rights_card ?? rights,
    turnaround_days: input.turnaround_days ?? rate?.turnaround_days ?? 5,
    message: input.message.trim(),
    rounds: 0,
    escrow_funded: false,
    thread: [message(tx, { author_role: "brand", author_user_id: member?.user_id, type: "offer", amount_cents: amount, rights_days: (bounty?.rights_card ?? rights).paid_ads_days, body: input.message.trim() })],
    expires_at: addDays(tx.now, CONSTANTS.windows.offer_expiry_days),
    created_at: tx.now,
    updated_at: tx.now,
  };
  tx.put("offers", row);
  logActivity(tx, { brand_id: brand.id, action: "offer_sent", summary: `${tx.get("users", member?.user_id)?.display_name ?? "Someone"} sent @${creator.handle} ${kind === "invite" ? `an invite to "${bounty?.title}"` : `an offer of ${formatMoney(amount)}`}`, actor_member_id: member?.id, target_kind: "offer", target_id: row.id });
  notifyCreator(tx, creator.id, { kind: "offer_received", title: kind === "invite" ? `${brand.name} invited you to a bounty` : `${brand.name} sent you an offer: ${formatMoney(amount)}`, body: `${row.title}. Answer by ${clockLabel(row.expires_at)} UTC. Everything stays in flowd.`, amount_cents: amount || undefined, path: `offer/${row.id}`, ref_kind: "offer", ref_id: row.id });
  return { offer: row };
}

function ensureOpenOffer(o: Offer): void {
  ensure(o.status === "awaiting_creator" || o.status === "awaiting_brand", "invalid_state", `This offer is ${o.status.replace(/_/g, " ")}.`, undefined, 409);
}

/** Who is acting on an offer: the creator or a brand member. Throws unless they are a party and it is their turn. */
function turnOf(tx: Tx, o: Offer): { side: "creator" | "brand"; member?: BrandMember; creator?: Creator } {
  const s = tx.session;
  if (s.persona === "creator") {
    const { creator } = requireCreator(tx, o.creator_id);
    ensure(o.status === "awaiting_creator", "not_your_turn", "It is the brand's turn to answer.", undefined, 409);
    return { side: "creator", creator };
  }
  const { member } = requireBrand(tx, o.brand_id, "build");
  ensure(o.status === "awaiting_brand", "not_your_turn", "It is the creator's turn to answer.", undefined, 409);
  return { side: "brand", member };
}

/** Counter-offers a new price (at most 3 rounds). The other side now has the ball for seven days. */
export function counterOffer(tx: Tx, input: { offer_id: string; amount_cents: number; message?: string }): { offer: Offer } {
  const o = tx.must("offers", input.offer_id, "Offer");
  ensureOpenOffer(o);
  ensure(o.kind !== "invite", "invalid_state", "An invite pays the bounty's own rates; accept or decline it.", undefined, 409);
  const { side, member, creator } = turnOf(tx, o);
  ensure(o.rounds < CONSTANTS.windows.max_counter_rounds, "max_rounds", `Offers allow ${CONSTANTS.windows.max_counter_rounds} counter rounds. Accept or decline this one.`, undefined, 409);
  ensure(Number.isInteger(input.amount_cents) && input.amount_cents >= 2500, "amount_too_small", "The smallest price is $25.", undefined, 422);
  const msg = message(tx, { author_role: side, author_user_id: side === "creator" ? creator?.user_id : member?.user_id, type: "counter", amount_cents: input.amount_cents, ...(input.message ? { body: input.message.trim() } : {}) });
  const next = tx.patch("offers", o.id, {
    status: side === "creator" ? "awaiting_brand" : "awaiting_creator",
    amount_cents: input.amount_cents,
    all_in_cents: input.amount_cents + mulRate(input.amount_cents, o.take_rate),
    rounds: o.rounds + 1,
    thread: [...o.thread, msg],
    expires_at: addDays(tx.now, CONSTANTS.windows.offer_expiry_days),
    updated_at: tx.now,
  });
  if (side === "creator") notifyBrand(tx, o.brand_id, { kind: "offer_countered", title: `Counter-offer: ${formatMoney(input.amount_cents)}`, body: `${o.title}. They moved from ${formatMoney(o.amount_cents)}. Reply by ${clockLabel(next.expires_at)} UTC.`, amount_cents: input.amount_cents, route: "/brand/offers", ref_kind: "offer", ref_id: o.id, member_id: o.created_by_member_id });
  else notifyCreator(tx, o.creator_id, { kind: "offer_countered", title: `The brand countered: ${formatMoney(input.amount_cents)}`, body: `${o.title}. Reply by ${clockLabel(next.expires_at)} UTC.`, amount_cents: input.amount_cents, path: `offer/${o.id}`, ref_kind: "offer", ref_id: o.id });
  return { offer: next };
}

/** A plain message on the offer thread (scanned by Scam Shield; a warning annotates it). */
export function sendOfferMessage(tx: Tx, input: { offer_id: string; body: string }): { offer: Offer; warning?: string } {
  const o = tx.must("offers", input.offer_id, "Offer");
  const s = tx.session;
  let side: "creator" | "brand";
  let userId: string | undefined;
  if (s.persona === "creator") {
    side = "creator";
    userId = requireCreator(tx, o.creator_id).user_id;
  } else {
    side = "brand";
    userId = requireBrand(tx, o.brand_id, "build").user_id;
  }
  ensure(input.body.trim().length > 0, "empty_message", "Write a message first.", undefined, 422);
  ensure(o.status !== "declined" && o.status !== "expired" && o.status !== "withdrawn", "invalid_state", `This offer is ${o.status}.`, undefined, 409);
  const msg = message(tx, { author_role: side, author_user_id: userId, type: "message", body: input.body.trim() });
  const next = tx.patch("offers", o.id, { thread: [...o.thread, msg], updated_at: tx.now });
  return { offer: next, warning: msg.warning_code };
}

/** The brand's price is final at acceptance: a direct offer becomes a private bounty funded from the wallet (pool plus fee reserve in escrow). */
export function createDirectBounty(
  tx: Tx,
  p: { brand_id: string; app_id: string; creator: Creator; title: string; price_cents: number; deliverables: Deliverables; rights_card: RightsCard; owner_member_id?: string; note: string; funding: "wallet" },
): Bounty {
  const brand = tx.must("brands", p.brand_id, "Brand");
  const app = tx.must("apps", p.app_id, "App");
  const videos = Math.max(1, p.deliverables.videos_per_creator);
  const flat = Math.round(p.price_cents / videos);
  const budget = flat * videos;
  const take = takeRateFor({ plan: brand.plan, type: "direct" });
  const fee = mulRate(budget, take);
  const escrow = budget + fee;
  ensureWalletCovers(tx, brand.id, escrow);
  const id = bountyIdFor(brand, `${p.title}-direct`, (c) => tx.get("bounties", c) !== undefined);
  const now = tx.now;
  const rate = tx.all("rate_cards").find((r) => r.creator_id === p.creator.id);
  const bestAccount = tx.all("social_accounts").filter((a) => a.creator_id === p.creator.id).sort((a, b) => b.median_views_28d - a.median_views_28d)[0];
  const brief = { ...defaultBrief(app, brand), summary: p.note };
  const bounty: Bounty = {
    id: id,
    app_id: app.id,
    brand_id: brand.id,
    ...(p.owner_member_id ? { owner_member_id: p.owner_member_id, created_by_member_id: p.owner_member_id } : {}),
    title: p.title,
    type: "direct",
    status: "live",
    visibility: "private",
    funding_source: "brand",
    is_first_bounty: false,
    is_starter: false,
    featured: false,
    cpm_cents: 0,
    cpa_install_cents: 0,
    cpa_trial_cents: 0,
    cpa_paid_cents: 0,
    flat_fee_cents: flat,
    ad_commission_rate: CONSTANTS.pay.ad_commission_rate,
    per_video_cap_cents: flat,
    budget_cents: budget,
    take_rate: take,
    fee_reserve_cents: fee,
    escrow_funded_cents: 0,
    matched_cents: 0,
    funded: false,
    reserved_cents: 0,
    spent_cents: 0,
    remaining_cents: 0,
    refunded_cents: 0,
    brief,
    rights_card: p.rights_card,
    deliverables: p.deliverables,
    eligibility: { min_tier: p.creator.tier, countries: p.deliverables.regions, niches: p.creator.niches, burner_accounts_allowed: false },
    brief_lint: { passed: true, checked_at: now, issues: [] },
    pay_math: payMath({ cpm_cents: 0, per_video_cap_cents: flat, plan: brand.plan, type: "direct", take_rate: take, flat_fee_cents: flat, median_views: bestAccount?.median_views_28d ?? 10_000, basis: `Direct offer: ${formatMoney(flat)} flat per video, agreed in the app.` }),
    format_ids: rate?.format_ids ?? [],
    art: makeArtSeed(seededRng(id), { hue: app.icon.hue_a, label: p.title }),
    starts_at: now,
    ends_at: addDays(now, 45),
    published_at: now,
    review_sla_hours: brand.review_sla_hours,
    counts: { creators: 0, submissions: 0, in_review: 0, approved: 0, rejected: 0, posts: 0, live_posts: 0 },
    funnel: { views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0 },
    all_in_cpm_cents: 0,
    created_at: now,
    updated_at: now,
  };
  tx.put("bounties", bounty);
  tx.post(escrowFundTxn({ txn_id: tx.nextId("txn"), posted_at: now, brand_id: brand.id, bounty_id: id, amount_cents: escrow, memo: fundedMemo(p.title, budget, fee, (c) => formatMoney(c)) }));
  applyEscrow(tx, id, fundEscrow(escrowOf(tx.must("bounties", id)), escrow), { funded_at: now });
  return tx.must("bounties", id);
}

/** Accepts the offer (the side with the ball). A direct offer funds the private bounty at once; an invite joins the open bounty. */
export function acceptOffer(tx: Tx, input: { offer_id: string }): { offer: Offer; bounty_id?: BountyId } {
  const o = tx.must("offers", input.offer_id, "Offer");
  ensureOpenOffer(o);
  const { side, member, creator } = turnOf(tx, o);
  const creatorRow = tx.must("creators", o.creator_id);
  let bountyId = o.bounty_id;
  if (o.kind === "invite") {
    ensure(bountyId, "invalid_state", "This invite has no bounty.", undefined, 409);
    const existing = tx.all("bounty_saves").find((s) => s.creator_id === creatorRow.id && s.bounty_id === bountyId);
    if (existing) tx.patch("bounty_saves", existing.id, { stage: "joined", updated_at: tx.now });
    else tx.put("bounty_saves", { id: tx.nextId("save"), creator_id: creatorRow.id, bounty_id: bountyId, stage: "joined", saved_at: tx.now, updated_at: tx.now });
  } else {
    // The brand funds the private bounty when the creator accepts (or when the brand accepts a counter).
    if (availableWallet(tx, o.brand_id) < o.amount_cents + mulRate(o.amount_cents, o.take_rate)) {
      notifyBrand(tx, o.brand_id, { kind: "funding_needed", title: `Fund the wallet to confirm ${creatorRow.display_name}`, body: `${creatorRow.display_name} accepted "${o.title}". Top up ${formatMoney(o.amount_cents + mulRate(o.amount_cents, o.take_rate))} and accept again.`, route: "/brand/wallet", ref_kind: "offer", ref_id: o.id });
      throw new ActionError("insufficient_funds", "The brand's wallet is short, so this offer cannot be confirmed yet. We told the brand.", "They have seven days to fund it.", 402);
    }
    const bounty = createDirectBounty(tx, { brand_id: o.brand_id, app_id: o.app_id, creator: creatorRow, title: o.title, price_cents: o.amount_cents, deliverables: o.deliverables, rights_card: o.rights_card, owner_member_id: o.created_by_member_id, note: o.message, funding: "wallet" });
    bountyId = bounty.id;
    tx.put("bounty_saves", { id: tx.nextId("save"), creator_id: creatorRow.id, bounty_id: bounty.id, stage: "joined", saved_at: tx.now, updated_at: tx.now });
  }
  const msg = message(tx, { author_role: side, author_user_id: side === "creator" ? creator?.user_id : member?.user_id, type: "accept" });
  const next = tx.patch("offers", o.id, { status: "accepted", accepted_at: tx.now, ...(bountyId ? { bounty_id: bountyId } : {}), escrow_funded: o.kind !== "invite", thread: [...o.thread, msg], updated_at: tx.now });
  logActivity(tx, { brand_id: o.brand_id, action: "offer_accepted", summary: `@${creatorRow.handle} accepted "${o.title}"${o.amount_cents > 0 ? ` at ${formatMoney(o.amount_cents)}` : ""}`, target_kind: "offer", target_id: o.id });
  if (side === "creator") notifyBrand(tx, o.brand_id, { kind: "offer_accepted", title: `@${creatorRow.handle} accepted your offer`, body: `${o.title}${o.amount_cents > 0 ? `: ${formatMoney(o.amount_cents)} is in escrow` : ""}. They have ${o.turnaround_days} days to submit.`, route: "/brand/offers", ref_kind: "offer", ref_id: o.id, member_id: o.created_by_member_id });
  else notifyCreator(tx, o.creator_id, { kind: "offer_accepted", title: "Your counter was accepted", body: `${o.title}: ${formatMoney(o.amount_cents)} is in escrow. Open the brief and make it.`, amount_cents: o.amount_cents, path: `bounty/${bountyId}`, ref_kind: "offer", ref_id: o.id });
  return { offer: next, bounty_id: bountyId };
}

/** Declines the offer (the side with the ball). */
export function declineOffer(tx: Tx, input: { offer_id: string; reason?: string }): { offer: Offer } {
  const o = tx.must("offers", input.offer_id, "Offer");
  ensureOpenOffer(o);
  const { side, member, creator } = turnOf(tx, o);
  const msg = message(tx, { author_role: side, author_user_id: side === "creator" ? creator?.user_id : member?.user_id, type: "decline", ...(input.reason ? { body: input.reason.trim() } : {}) });
  const next = tx.patch("offers", o.id, { status: "declined", closed_at: tx.now, thread: [...o.thread, msg], updated_at: tx.now });
  const creatorRow = tx.must("creators", o.creator_id);
  if (side === "creator") notifyBrand(tx, o.brand_id, { kind: "offer_countered", title: `@${creatorRow.handle} declined`, body: `${o.title}${input.reason ? `: ${input.reason}` : ""}`, route: "/brand/offers", ref_kind: "offer", ref_id: o.id, member_id: o.created_by_member_id });
  else notifyCreator(tx, o.creator_id, { kind: "offer_countered", title: "The brand declined your counter", body: o.title, path: `offer/${o.id}`, ref_kind: "offer", ref_id: o.id });
  return { offer: next };
}

/** The brand withdraws an offer it sent (either side's turn). */
export function withdrawOffer(tx: Tx, input: { offer_id: string }): { offer: Offer } {
  const o = tx.must("offers", input.offer_id, "Offer");
  ensureOpenOffer(o);
  const { member } = requireBrand(tx, o.brand_id, "build");
  const msg = message(tx, { author_role: "brand", author_user_id: member?.user_id, type: "withdraw" });
  return { offer: tx.patch("offers", o.id, { status: "withdrawn", closed_at: tx.now, thread: [...o.thread, msg], updated_at: tx.now }) };
}

/** Whether a creator may submit to a private or invite-only bounty: they hold an accepted offer for it. */
export function holdsAcceptedOffer(tx: Tx, bountyId: string, creatorId: string): boolean {
  return tx.all("offers").some((o) => o.bounty_id === bountyId && o.creator_id === creatorId && (o.status === "accepted" || o.status === "completed"));
}

/** Offers that were not answered in seven days close (run by the clock). */
export function expireOffers(tx: Tx): number {
  let n = 0;
  for (const o of tx.all("offers")) {
    if ((o.status === "awaiting_creator" || o.status === "awaiting_brand") && toMs(o.expires_at) <= toMs(tx.now)) {
      tx.patch("offers", o.id, { status: "expired", closed_at: o.expires_at, updated_at: tx.now });
      n += 1;
    }
  }
  return n;
}

export type { RateCard };
export { slug };
