/**
 * The secondary markets: sealed-bid Auctions (Platinum and Elite creators sell a few weekly slots) and the Spec Market (pre-made, pre-scored videos a
 * brand can license).
 *
 * Auctions are second price: the k highest bids win and every winner pays the highest losing bid (or the reserve when nobody lost). Bids are sealed
 * until the auction closes; a bid holds the brand's maximum from the wallet while it is open.
 */

import type { Auction, Bid, Deliverables, FormatId, Spec, SpecLicense } from "@/lib/contract/types";
import {
  CONSTANTS,
  addDays,
  addHours,
  clockLabel,
  formatMoney,
  makeArtSeed,
  mulRate,
  nextClearingRun,
  seededRng,
  settleFlatFee,
  takeRateFor,
  tierAtLeast,
  toMs,
  buildRightsCard,
  type RightsCardOptions,
} from "@/lib/engine";
import { analyzeClip, type ClipInput } from "./analysis";
import { availableWallet, ensureWalletCovers, heldForBids } from "./billing";
import { createDirectBounty } from "./offers";
import { requireBrand, requireCreator } from "./guards";
import { notifyBrand, notifyCreator } from "./notify";
import { defaultBrief } from "./bounty-draft";
import { pad } from "../ids";
import { ActionError, ensure, type Tx } from "./tx";

// ── auctions ───────────────────────────────────────────────────────────────────────────────────

export interface CreateAuctionInput {
  title: string;
  description: string;
  slots: number;
  reserve_cents: number;
  opens_at?: string;
  closes_at?: string;
  deliverables?: Partial<Deliverables>;
  rights?: RightsCardOptions;
}

/** A Platinum or Elite creator opens a sealed-bid auction for 1 to 5 slots. */
export function createAuction(tx: Tx, input: CreateAuctionInput): { auction: Auction } {
  const { creator } = requireCreator(tx);
  ensure(tierAtLeast(creator.tier, CONSTANTS.auctions.min_creator_tier), "tier_locked", "Auctions open to Platinum and Elite creators.", "Keep clearing approved work to unlock them.", 403);
  ensure(input.slots >= CONSTANTS.auctions.min_slots && input.slots <= CONSTANTS.auctions.max_slots, "invalid_slots", `An auction has ${CONSTANTS.auctions.min_slots} to ${CONSTANTS.auctions.max_slots} slots.`, undefined, 422);
  ensure(input.reserve_cents >= CONSTANTS.auctions.reserve_floor_cents, "reserve_too_low", `The reserve is at least ${formatMoney(CONSTANTS.auctions.reserve_floor_cents)}.`, undefined, 422);
  const opens = input.opens_at ?? tx.now;
  const closes = input.closes_at ?? addDays(opens, 5);
  const hours = (toMs(closes) - toMs(opens)) / 3_600_000;
  ensure(hours >= CONSTANTS.auctions.min_duration_hours && hours <= CONSTANTS.auctions.max_duration_days * 24, "invalid_duration", `An auction runs at least ${CONSTANTS.auctions.min_duration_hours} hours and at most ${CONSTANTS.auctions.max_duration_days} days.`, undefined, 422);
  const id = tx.nextId("auc");
  const auction: Auction = {
    id,
    creator_id: creator.id,
    title: input.title.trim(),
    description: input.description.trim(),
    status: toMs(opens) <= toMs(tx.now) ? "open" : "scheduled",
    slots: input.slots,
    reserve_cents: input.reserve_cents,
    deliverables: { videos_per_creator: 1, min_duration_s: 15, max_duration_s: 45, aspect: "9:16", platforms: ["tiktok"], regions: ["US"], require_face: true, music_policy: "commercial_library", ai_policy: "allowed_disclosed", ...(input.deliverables ?? {}) },
    rights_card: buildRightsCard(input.rights),
    opens_at: opens,
    closes_at: closes,
    art: makeArtSeed(seededRng(id), { label: input.title }),
    bids: [],
    bids_count: 0,
    created_at: tx.now,
    updated_at: tx.now,
  };
  tx.put("auctions", auction);
  return { auction };
}

/**
 * A brand places a sealed bid: its maximum for one slot. The maximum is held from the wallet while the auction is open; a brand has one bid per
 * auction (a new bid replaces the old one and the difference is re-held).
 */
export function placeBid(tx: Tx, input: { auction_id: string; amount_cents: number; note?: string }): { auction: Auction; bid: Bid; held_cents: number } {
  const a = tx.must("auctions", input.auction_id, "Auction");
  const { member, brand } = requireBrand(tx, null, "finance");
  ensure(a.status === "open", "auction_closed", a.status === "scheduled" ? `This auction opens ${clockLabel(a.opens_at)} UTC.` : "This auction is closed.", undefined, 409);
  ensure(Number.isInteger(input.amount_cents) && input.amount_cents >= a.reserve_cents, "bid_below_reserve", `The reserve is ${formatMoney(a.reserve_cents)}. Bid at least that.`, undefined, 422);
  const prev = a.bids.find((b) => b.brand_id === brand.id && b.status === "sealed");
  const needed = input.amount_cents - (prev?.escrow_hold_cents ?? 0);
  if (needed > 0) ensureWalletCovers(tx, brand.id, needed + (heldForBids(tx, brand.id) > 0 ? 0 : 0));
  const bid: Bid = {
    id: tx.nextId("bid"),
    brand_id: brand.id,
    bidder_member_id: member?.id ?? "bm_system",
    amount_cents: input.amount_cents,
    status: "sealed",
    placed_at: tx.now,
    escrow_hold_cents: input.amount_cents,
    ...(input.note ? { note: input.note.trim() } : {}),
  };
  const bids = [...a.bids.filter((b) => b !== prev), ...(prev ? [{ ...prev, status: "withdrawn" as const, escrow_hold_cents: 0 }] : []), bid];
  const next = tx.patch("auctions", a.id, { bids, bids_count: bids.filter((b) => b.status !== "withdrawn").length, updated_at: tx.now });
  const creator = tx.must("creators", a.creator_id);
  notifyCreator(tx, creator.id, { kind: "offer_received", title: `A new sealed bid on "${a.title}"`, body: `${next.bids_count} ${next.bids_count === 1 ? "bid" : "bids"} so far. Bids stay sealed until it closes ${clockLabel(a.closes_at)} UTC.`, path: `auction/${a.id}`, ref_kind: "auction", ref_id: a.id });
  return { auction: next, bid, held_cents: input.amount_cents };
}

/** Withdraws a sealed bid while the auction is open. The hold is released. */
export function withdrawBid(tx: Tx, input: { auction_id: string }): { auction: Auction } {
  const a = tx.must("auctions", input.auction_id, "Auction");
  const { brand } = requireBrand(tx, null, "finance");
  ensure(a.status === "open", "auction_closed", "Bids can only be withdrawn while the auction is open.", undefined, 409);
  const bids = a.bids.map((b) => (b.brand_id === brand.id && b.status === "sealed" ? { ...b, status: "withdrawn" as const, escrow_hold_cents: 0 } : b));
  return { auction: tx.patch("auctions", a.id, { bids, bids_count: bids.filter((b) => b.status !== "withdrawn").length, updated_at: tx.now }) };
}

/** Cancels an auction (the creator, while no bid has won); every hold is released. */
export function cancelAuction(tx: Tx, input: { auction_id: string }): { auction: Auction } {
  const a = tx.must("auctions", input.auction_id, "Auction");
  requireCreator(tx, a.creator_id);
  ensure(a.status === "scheduled" || a.status === "open", "invalid_state", `This auction is ${a.status.replace(/_/g, " ")}.`, undefined, 409);
  const bids = a.bids.map((b) => (b.status === "sealed" ? { ...b, status: "withdrawn" as const, escrow_hold_cents: 0 } : b));
  return { auction: tx.patch("auctions", a.id, { status: "cancelled", bids, updated_at: tx.now }) };
}

export interface AuctionResolution {
  status: "awarded" | "no_bids";
  clearing_price_cents?: number;
  winners: string[];
  bounty_ids: string[];
}

/**
 * Resolves a closed auction: second price. The k highest bids win and all pay the highest losing bid, or the reserve if there is none. Each winner's
 * brand funds a private direct bounty for the creator at the clearing price; a winner whose wallet cannot cover it forfeits the slot to the next bid.
 */
export function resolveAuction(tx: Tx, auctionId: string): AuctionResolution {
  const a = tx.must("auctions", auctionId, "Auction");
  const sealed = a.bids.filter((b) => b.status === "sealed").sort((x, y) => y.amount_cents - x.amount_cents || (x.placed_at < y.placed_at ? -1 : 1));
  if (sealed.length === 0) {
    tx.patch("auctions", a.id, { status: "no_bids", updated_at: tx.now });
    return { status: "no_bids", winners: [], bounty_ids: [] };
  }
  const k = Math.min(a.slots, sealed.length);
  const winners = sealed.slice(0, k);
  const losingTop = sealed[k];
  const price = Math.max(a.reserve_cents, losingTop ? losingTop.amount_cents : a.reserve_cents);
  const creator = tx.must("creators", a.creator_id);
  const bountyIds: string[] = [];
  const won: string[] = [];
  const updated: Bid[] = a.bids.map((b) => ({ ...b }));
  for (const w of winners) {
    const brand = tx.must("brands", w.brand_id);
    const app = tx.all("apps").find((x) => x.brand_id === brand.id && x.status === "connected") ?? tx.all("apps").find((x) => x.brand_id === brand.id);
    const need = price + mulRate(price, takeRateFor({ plan: brand.plan, type: "direct" }));
    const idx = updated.findIndex((b) => b.id === w.id);
    if (!app || brand.wallet_balance_cents < need) {
      updated[idx] = { ...updated[idx], status: "lost", escrow_hold_cents: 0 };
      continue;
    }
    const bounty = createDirectBounty(tx, { brand_id: brand.id, app_id: app.id, creator, title: `${a.title}`, price_cents: price, deliverables: a.deliverables, rights_card: a.rights_card, owner_member_id: w.bidder_member_id, note: a.description, funding: "wallet" });
    updated[idx] = { ...updated[idx], status: "won", pays_cents: price, escrow_hold_cents: 0 };
    bountyIds.push(bounty.id);
    won.push(brand.id);
    notifyBrand(tx, brand.id, { kind: "offer_accepted", title: `You won "${a.title}"`, body: `Second-price clearing: you pay ${formatMoney(price)}, below your bid of ${formatMoney(w.amount_cents)}. It is in escrow; @${creator.handle} has been told.`, route: `/brand/auctions`, ref_kind: "auction", ref_id: a.id, member_id: w.bidder_member_id });
  }
  for (let i = 0; i < updated.length; i += 1) if (updated[i].status === "sealed") updated[i] = { ...updated[i], status: "lost", escrow_hold_cents: 0 };
  const status = won.length > 0 ? "awarded" : "no_bids";
  tx.patch("auctions", a.id, { status, bids: updated, bids_count: updated.filter((b) => b.status !== "withdrawn").length, ...(won.length > 0 ? { clearing_price_cents: price, winning_bid_ids: winners.filter((w) => won.includes(w.brand_id)).map((w) => w.id), resulting_bounty_ids: bountyIds, awarded_at: tx.now } : {}), updated_at: tx.now });
  if (won.length > 0) notifyCreator(tx, creator.id, { kind: "offer_accepted", title: `"${a.title}" sold: ${won.length} ${won.length === 1 ? "slot" : "slots"} at ${formatMoney(price)}`, body: "Every winner pays the same second-price amount. The funded briefs are in your bounties.", amount_cents: price * won.length, path: `auction/${a.id}`, ref_kind: "auction", ref_id: a.id });
  return { status, clearing_price_cents: won.length > 0 ? price : undefined, winners: won, bounty_ids: bountyIds };
}

/** Moves auctions through scheduled, open, closed and awarded by the clock. */
export function advanceAuctions(tx: Tx): number {
  let n = 0;
  for (const a of tx.all("auctions")) {
    if (a.status === "scheduled" && toMs(a.opens_at) <= toMs(tx.now)) {
      tx.patch("auctions", a.id, { status: "open", updated_at: tx.now });
      n += 1;
    }
    const cur = tx.must("auctions", a.id);
    if (cur.status === "open" && toMs(cur.closes_at) <= toMs(tx.now)) {
      tx.patch("auctions", a.id, { status: "closed", updated_at: tx.now });
      resolveAuction(tx, a.id);
      n += 1;
    }
  }
  return n;
}

// ── specs ──────────────────────────────────────────────────────────────────────────────────────

export interface UploadSpecInput {
  title: string;
  description: string;
  clip: ClipInput;
  category: Spec["category"];
  format_id?: FormatId;
  price_cents: number;
  paid_ads_days?: number;
  exclusive?: boolean;
}

/** A creator uploads a spec video. It is scored; at Flow Score 55 (band C) or better and with no QA failures it lists on the Spec Market. */
export function uploadSpec(tx: Tx, input: UploadSpecInput): { spec: Spec; listed: boolean; reasons: string[] } {
  const { creator } = requireCreator(tx);
  ensure(input.price_cents >= CONSTANTS.specs.price_floor_cents && input.price_cents <= CONSTANTS.specs.price_cap_cents, "invalid_price", `A spec is priced between ${formatMoney(CONSTANTS.specs.price_floor_cents)} and ${formatMoney(CONSTANTS.specs.price_cap_cents)}.`, undefined, 422);
  const app = tx.all("apps").find((a) => a.category === input.category && a.id !== "app_flowd") ?? tx.all("apps")[0];
  const brand = tx.must("brands", app.brand_id);
  const format = input.format_id ? tx.get("formats", input.format_id) : undefined;
  // A spec is made for a category, not one app: score it against a generic brief for that category.
  const demoBounty = { ...Object.values(tx.state.bounties).find((b) => b.app_id === app.id && b.brief.beats.length > 0)!, brief: defaultBrief(app, brand) };
  const result = analyzeClip({ clip: input.clip, bounty: demoBounty, app, brand, format, creatorId: creator.id, title: input.title });
  const reasons: string[] = [];
  if (result.flow.points < CONSTANTS.specs.min_flow_points_to_list) reasons.push(`Flow Score ${result.flow.points} is under the ${CONSTANTS.specs.min_flow_points_to_list} needed to list.`);
  if (result.qa.fail > 0) reasons.push(`${result.qa.fail} QA ${result.qa.fail === 1 ? "check failed" : "checks failed"}: fix them before listing.`);
  const listed = reasons.length === 0;
  const id = tx.nextId("spec");
  const vid = `vid_${pad(tx.nextNumber("vid"), 4)}`;
  const spec: Spec = {
    id,
    creator_id: creator.id,
    title: input.title.trim(),
    description: input.description.trim(),
    status: listed ? "listed" : "draft",
    source: "creator_upload",
    art: makeArtSeed(seededRng(id), { hue: app.icon.hue_a, label: result.analysis.tags.hook_words }),
    video: { asset_id: vid, duration_ms: result.analysis.duration_ms, width: 1080, height: 1920, size_bytes: Math.round((result.analysis.duration_ms / 1000) * 960_000), fps: 30, has_captions: true, language: "en", art: makeArtSeed(seededRng(vid), { hue: app.icon.hue_a }), uploaded_at: tx.now },
    ...(format ? { format_id: format.id } : {}),
    hook_text: result.analysis.hook.text,
    hook_type: result.analysis.hook.hook_type,
    category: input.category,
    flow_band: result.flow.band,
    flow_points: result.flow.points,
    hook_band: result.hook.band,
    hook_points: result.hook.points,
    qa_pass: result.qa.pass,
    qa_warn: result.qa.warn,
    qa_fail: result.qa.fail,
    tags: result.tags,
    price_cents: input.price_cents,
    paid_ads_days: input.paid_ads_days ?? CONSTANTS.specs.default_paid_ads_days,
    exclusive: input.exclusive ?? false,
    rights_card: buildRightsCard({ paid_ads_days: input.paid_ads_days ?? CONSTANTS.specs.default_paid_ads_days }),
    stats: { previews: 0, saves: 0, licenses: 0 },
    licenses: [],
    ...(listed ? { listed_at: tx.now } : {}),
    created_at: tx.now,
    updated_at: tx.now,
  };
  tx.put("specs", spec);
  return { spec, listed, reasons };
}

/** A brand licenses a spec: the creator's price plus the brand's take rate come from the wallet, the creator is paid, and the spec stays listed unless it was exclusive. */
export function licenseSpec(tx: Tx, input: { spec_id: string; paid_ads_days?: number }): { spec: Spec; license: SpecLicense; brand_cost_cents: number } {
  const spec = tx.must("specs", input.spec_id, "Spec");
  const { member, brand } = requireBrand(tx, null, "finance");
  ensure(spec.status === "listed" || spec.status === "first_refusal", "invalid_state", `This spec is ${spec.status.replace(/_/g, " ")}.`, undefined, 409);
  if (spec.status === "first_refusal") ensure(spec.source_brand_id === brand.id, "first_refusal", "The brand that approved this video has first refusal for seven days.", undefined, 403);
  ensure(!spec.licenses.some((l) => l.brand_id === brand.id), "already_licensed", "You already license this video.", undefined, 409);
  const take = takeRateFor({ plan: brand.plan, type: "direct" });
  const cost = spec.price_cents + mulRate(spec.price_cents, take);
  ensureWalletCovers(tx, brand.id, cost);
  const days = input.paid_ads_days ?? spec.paid_ads_days;
  const txnId = tx.nextId("txn");
  const flat = settleFlatFee({ txn_id: txnId, posted_at: tx.now, brand_id: brand.id, bounty_id: spec.source_bounty_id ?? "", creator_id: spec.creator_id, price_cents: spec.price_cents, take_rate: take, title: spec.title, source: "wallet" });
  // A spec licence has no bounty: the empty id adds no bounty reference to the legs.
  tx.post(flat.txn);
  const run = nextClearingRun(tx.now);
  const creatorLeg = tx.all("ledger").find((e) => e.txn_id === txnId && e.account === `creator:${spec.creator_id}`);
  tx.put("money_clock", {
    id: tx.nextId("mc"),
    creator_id: spec.creator_id,
    bounty_id: spec.source_bounty_id ?? "",
    app_id: tx.all("apps").find((a) => a.brand_id === brand.id)?.id ?? "",
    source: "flat_fee",
    state: "pending",
    amount_cents: spec.price_cents,
    estimated: false,
    earned_at: tx.now,
    eta_at: run,
    reason: "awaiting_clearing_run",
    reason_text: `Spec licence. Clears ${clockLabel(run)} UTC.`,
    label: `${brand.name}: licence of "${spec.title}"`,
    ...(creatorLeg ? { ledger_id: creatorLeg.id } : {}),
  });
  const license: SpecLicense = { brand_id: brand.id, licensed_at: tx.now, price_cents: spec.price_cents, paid_ads_days: days, ends_at: addDays(tx.now, days), ledger_txn_id: txnId };
  const next = tx.patch("specs", spec.id, { licenses: [...spec.licenses, license], stats: { ...spec.stats, licenses: spec.stats.licenses + 1 }, status: spec.exclusive ? "licensed" : spec.status === "first_refusal" ? "licensed" : "listed", updated_at: tx.now });
  notifyCreator(tx, spec.creator_id, { kind: "cash_event", title: `${brand.name} licensed "${spec.title}"`, body: `${formatMoney(spec.price_cents)} is pending and clears ${clockLabel(run)} UTC.`, amount_cents: spec.price_cents, path: `spec/${spec.id}`, ref_kind: "spec", ref_id: spec.id });
  return { spec: next, license, brand_cost_cents: cost };
}

/** Withdraws a spec the creator no longer wants listed. */
export function withdrawSpec(tx: Tx, input: { spec_id: string }): { spec: Spec } {
  const spec = tx.must("specs", input.spec_id, "Spec");
  requireCreator(tx, spec.creator_id);
  ensure(spec.status === "listed" || spec.status === "draft", "invalid_state", `This spec is ${spec.status.replace(/_/g, " ")}.`, undefined, 409);
  return { spec: tx.patch("specs", spec.id, { status: "withdrawn", updated_at: tx.now }) };
}

/** Specs whose first-refusal week ended open to every brand. */
export function advanceSpecs(tx: Tx): number {
  let n = 0;
  for (const s of tx.all("specs")) {
    if (s.status === "first_refusal" && s.first_refusal_ends_at && toMs(s.first_refusal_ends_at) <= toMs(tx.now)) {
      tx.patch("specs", s.id, { status: "listed", listed_at: tx.now, updated_at: tx.now });
      n += 1;
    }
  }
  return n;
}

