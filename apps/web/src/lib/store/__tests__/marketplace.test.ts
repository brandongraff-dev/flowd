import { vi, describe, expect, it } from "vitest";
import type { ClipInput } from "../core/analysis";
import { escrowIdentityHolds, escrowStateOf, mulRate } from "@/lib/engine";
import { availableWallet, heldForBids } from "../core/billing";
import { Tx } from "../core/tx";
import { ledgerProblems, makeWorld, must, walletFromLedger } from "./helpers";

vi.setConfig({ testTimeout: 60_000 });

const GOOD_CLIP: ClipInput = {
  hook_text: "I tried five photo apps so you do not have to.",
  script: "I tried five photo apps so you do not have to. Watch this, Lumi fixes the lighting in one tap. Look at that before and after. Try Lumi free for seven days, link in my bio.",
  duration_s: 24,
  face_at_ms: 300,
  app_at_ms: 1800,
  has_captions: true,
};

describe("sealed-bid auctions", () => {
  it("a bid below the reserve is refused; a valid bid holds the maximum and a new bid replaces it", async () => {
    const w = await makeWorld("brand");
    const auction = w.state().auctions["auc_005"];
    expect(auction.status).toBe("open");
    const low = await w.actions.placeBid({ auction_id: auction.id, amount_cents: auction.reserve_cents - 100 });
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.error.code).toBe("bid_below_reserve");

    const tx = new Tx(w.state());
    const availableBefore = availableWallet(tx, "br_lumi");
    must(await w.actions.placeBid({ auction_id: auction.id, amount_cents: auction.reserve_cents + 5_000 }));
    const mine = w.state().auctions[auction.id].bids.filter((b) => b.brand_id === "br_lumi" && b.status === "sealed");
    expect(mine).toHaveLength(1);
    expect(mine[0].escrow_hold_cents).toBe(auction.reserve_cents + 5_000);
    expect(availableWallet(new Tx(w.state()), "br_lumi")).toBe(availableBefore - (auction.reserve_cents + 5_000));
    // the wallet itself is untouched: a hold is not a payment
    expect(w.state().brands["br_lumi"].wallet_balance_cents).toBe(walletFromLedger(w.state(), "br_lumi"));

    must(await w.actions.placeBid({ auction_id: auction.id, amount_cents: auction.reserve_cents + 8_000 }));
    const after = w.state().auctions[auction.id].bids.filter((b) => b.brand_id === "br_lumi");
    expect(after.filter((b) => b.status === "sealed")).toHaveLength(1);
    expect(heldForBids(new Tx(w.state()), "br_lumi")).toBeGreaterThanOrEqual(auction.reserve_cents + 8_000);

    must(await w.actions.withdrawBid({ auction_id: auction.id }));
    expect(w.state().auctions[auction.id].bids.filter((b) => b.brand_id === "br_lumi" && b.status === "sealed")).toHaveLength(0);
  });

  it("a bid the wallet cannot hold is refused", async () => {
    const w = await makeWorld("brand");
    const r = await w.actions.placeBid({ auction_id: "auc_005", amount_cents: 50_000_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("insufficient_funds");
  });

  it("closing clears at the second price and funds a private direct bounty for the winner", async () => {
    const w = await makeWorld("brand");
    const auction = w.state().auctions["auc_005"];
    const others = auction.bids.filter((b) => b.status === "sealed").map((b) => b.amount_cents);
    const myBid = Math.max(...others, auction.reserve_cents) + 10_000;
    must(await w.actions.placeBid({ auction_id: auction.id, amount_cents: myBid }));
    const wallet = w.state().brands["br_lumi"].wallet_balance_cents;

    w.as("admin");
    must(await w.actions.advanceClock({ hours: 24 * 4 }));
    const done = w.state().auctions[auction.id];
    expect(["awarded", "no_bids"]).toContain(done.status);
    expect(done.status).toBe("awarded");
    // second price: every winner pays the highest losing bid, or the reserve when nobody lost
    const sealedAmounts = [myBid, ...others].sort((a, b) => b - a);
    const losing = sealedAmounts[auction.slots];
    const expectedPrice = Math.max(auction.reserve_cents, losing ?? auction.reserve_cents);
    expect(done.clearing_price_cents).toBe(expectedPrice);
    const winnerBid = done.bids.find((b) => b.brand_id === "br_lumi");
    expect(winnerBid?.status).toBe("won");
    expect(winnerBid?.pays_cents).toBe(expectedPrice);
    expect(done.bids.every((b) => b.status !== "sealed")).toBe(true);
    expect(done.resulting_bounty_ids?.length).toBeGreaterThan(0);
    const bounty = w.state().bounties[(done.resulting_bounty_ids ?? [])[0]];
    expect(bounty.visibility).toBe("private");
    expect(bounty.funded).toBe(true);
    expect(escrowIdentityHolds(escrowStateOf(bounty))).toBe(true);
    const lumi = w.state().brands["br_lumi"];
    expect(lumi.wallet_balance_cents).toBeLessThan(wallet);
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(lumi.wallet_balance_cents);
    expect(ledgerProblems(w.state())).toEqual([]);
    expect(bounty.budget_cents).toBe(expectedPrice);
    expect(lumi.wallet_balance_cents).toBe(wallet - (expectedPrice + mulRate(expectedPrice, bounty.take_rate)));
  });

  it("auctions open at Platinum: a Silver creator is told how to unlock them, a Platinum creator can open one", async () => {
    const w = await makeWorld("creator");
    const locked = await w.actions.createAuction({ title: "Weekly slots", description: "Three honest videos.", slots: 3, reserve_cents: 20_000 });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error.code).toBe("tier_locked");
    w.as("admin");
    must(await w.actions.overrideTier({ creator_id: "cr_maya", tier: "platinum", reason: "Demo: unlock auctions for the test." }));
    w.as("creator");
    const short = await w.actions.createAuction({ title: "Weekly slots", description: "Three honest videos.", slots: 3, reserve_cents: 1_000 });
    expect(short.ok).toBe(false);
    const ok = must(await w.actions.createAuction({ title: "Weekly slots", description: "Three honest videos.", slots: 3, reserve_cents: 20_000 }));
    expect(ok.auction.status).toBe("open");
    expect(ok.auction.bids_count).toBe(0);
    const closes = new Date(ok.auction.closes_at).getTime() - new Date(ok.auction.opens_at).getTime();
    expect(closes).toBeGreaterThanOrEqual(72 * 3_600_000);
    must(await w.actions.cancelAuction({ auction_id: ok.auction.id }));
    expect(w.state().auctions[ok.auction.id].status).toBe("cancelled");
  });
});

describe("the Spec Market", () => {
  it("a brand licenses a listed spec: the creator is paid, the take rate is on top, nothing is exclusive by accident", async () => {
    const w = await makeWorld("brand");
    const spec = w.state().specs["spec_003"];
    expect(spec.status).toBe("listed");
    const wallet = w.state().brands["br_lumi"].wallet_balance_cents;
    const r = must(await w.actions.licenseSpec({ spec_id: spec.id }));
    const take = 0.1;
    expect(r.brand_cost_cents).toBe(spec.price_cents + mulRate(spec.price_cents, take));
    expect(w.state().brands["br_lumi"].wallet_balance_cents).toBe(wallet - r.brand_cost_cents);
    expect(w.state().specs[spec.id].licenses.some((l) => l.brand_id === "br_lumi")).toBe(true);
    expect(w.state().specs[spec.id].stats.licenses).toBe(spec.stats.licenses + 1);
    const clock = Object.values(w.state().money_clock).find((m) => m.creator_id === spec.creator_id && m.label.includes(spec.title));
    expect(clock?.state).toBe("pending");
    expect(clock?.eta_at).toBeDefined();
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(w.state().brands["br_lumi"].wallet_balance_cents);
    expect(ledgerProblems(w.state())).toEqual([]);
    const twice = await w.actions.licenseSpec({ spec_id: spec.id });
    expect(twice.ok).toBe(false);
  });

  it("first refusal belongs to the brand that approved the video", async () => {
    const w = await makeWorld("brand");
    const r = await w.actions.licenseSpec({ spec_id: "spec_030" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("first_refusal");
  });

  it("an uploaded spec is scored and lists only when it clears the checklist", async () => {
    const w = await makeWorld("creator");
    const good = must(await w.actions.uploadSpec({ title: "Lighting fix in one tap", description: "A tight demo.", clip: GOOD_CLIP, category: "ai_photo", price_cents: 6_500 }));
    expect(good.spec.flow_points).toBeGreaterThan(0);
    expect(good.listed).toBe(good.spec.status === "listed");
    const weak = must(await w.actions.uploadSpec({ title: "No disclosure no hook", description: "Rough cut.", clip: { script: "um so this is a thing", duration_s: 70, include_disclosure: false, has_captions: false }, category: "ai_photo", price_cents: 6_500 }));
    expect(weak.listed).toBe(false);
    expect(weak.reasons.length).toBeGreaterThan(0);
    expect(weak.spec.status).toBe("draft");
    const price = await w.actions.uploadSpec({ title: "Too cheap", description: "x", clip: GOOD_CLIP, category: "ai_photo", price_cents: 100 });
    expect(price.ok).toBe(false);
    must(await w.actions.withdrawSpec({ spec_id: weak.spec.id }));
    expect(w.state().specs[weak.spec.id].status).toBe("withdrawn");
  });
});
