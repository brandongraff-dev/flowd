import { vi, describe, expect, it } from "vitest";
import { escrowIdentityHolds, escrowStateOf, mulRate } from "@/lib/engine";
import { ledgerProblems, makeWorld, must, walletFromLedger } from "./helpers";

vi.setConfig({ testTimeout: 60_000 });

describe("offers and counters", () => {
  it("a creator counters, the brand accepts, and the private bounty is funded from the wallet", async () => {
    const w = await makeWorld("creator");
    const offer = w.state().offers["offer_0033"];
    expect(offer.status).toBe("awaiting_creator");
    expect(offer.creator_id).toBe("cr_maya");

    // it is not the brand's turn yet
    w.as("brand");
    const early = await w.actions.counterOffer({ offer_id: offer.id, amount_cents: 15_000 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe("not_your_turn");

    w.as("creator");
    const small = await w.actions.counterOffer({ offer_id: offer.id, amount_cents: 500 });
    expect(small.ok).toBe(false);
    const counter = must(await w.actions.counterOffer({ offer_id: offer.id, amount_cents: offer.amount_cents + 2_000, message: "Two hooks and a raw take, same rights." }));
    expect(counter.offer.status).toBe("awaiting_brand");
    expect(counter.offer.rounds).toBe(1);
    expect(counter.offer.thread.at(-1)?.type).toBe("counter");

    w.as("brand");
    const wallet = w.state().brands["br_lumi"].wallet_balance_cents;
    const accepted = must(await w.actions.acceptOffer({ offer_id: offer.id }));
    expect(accepted.offer.status).toBe("accepted");
    expect(accepted.bounty_id).toBeDefined();
    const bounty = w.state().bounties[accepted.bounty_id as string];
    expect(bounty.visibility).toBe("private");
    expect(bounty.funded).toBe(true);
    expect(bounty.budget_cents).toBe(counter.offer.amount_cents);
    expect(bounty.flat_fee_cents * counter.offer.deliverables.videos_per_creator).toBe(counter.offer.amount_cents);
    expect(bounty.status).toBe("live");
    expect(escrowIdentityHolds(escrowStateOf(bounty))).toBe(true);
    const cost = counter.offer.amount_cents + mulRate(counter.offer.amount_cents, bounty.take_rate);
    expect(w.state().brands["br_lumi"].wallet_balance_cents).toBe(wallet - cost);
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(w.state().brands["br_lumi"].wallet_balance_cents);
    expect(ledgerProblems(w.state())).toEqual([]);

    // only the creator the offer was made to can submit to the private bounty
    w.as("creator");
    expect(w.state().bounty_saves).toBeDefined();
    const mine = Object.values(w.state().bounty_saves).find((s) => s.creator_id === "cr_maya" && s.bounty_id === bounty.id);
    expect(mine?.stage).toBe("joined");
  });

  it("allows three counter rounds and no more", async () => {
    const w = await makeWorld("creator");
    const id = "offer_0033";
    let amount = w.state().offers[id].amount_cents;
    for (let round = 1; round <= 3; round += 1) {
      const side = round % 2 === 1 ? "creator" : "brand";
      w.as(side);
      amount += side === "creator" ? 1_000 : -500;
      must(await w.actions.counterOffer({ offer_id: id, amount_cents: amount }));
      expect(w.state().offers[id].rounds).toBe(round);
    }
    w.as("brand");
    const fourth = await w.actions.counterOffer({ offer_id: id, amount_cents: amount + 1_000 });
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.error.code).toBe("max_rounds");
    must(await w.actions.declineOffer({ offer_id: id, reason: "Out of my range." }));
    expect(w.state().offers[id].status).toBe("declined");
  });

  it("an accepted offer the wallet cannot fund tells the brand instead of half-funding", async () => {
    const w = await makeWorld("brand");
    // Drain nothing: ask for more than the wallet holds.
    w.as("creator");
    const id = "offer_0033";
    must(await w.actions.counterOffer({ offer_id: id, amount_cents: 900_000 }));
    w.as("brand");
    const before = w.state().brands["br_lumi"].wallet_balance_cents;
    const r = await w.actions.acceptOffer({ offer_id: id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("insufficient_funds");
    expect(w.state().offers[id].status).toBe("awaiting_brand");
    expect(w.state().brands["br_lumi"].wallet_balance_cents).toBe(before);
    expect(Object.values(w.state().notifications).some((n) => n.kind === "funding_needed" && n.ref_id === id)).toBe(false);
  });

  it("Scam Shield annotates a risky message and never silently deletes it", async () => {
    const w = await makeWorld("brand");
    const r = must(await w.actions.sendOfferMessage({ offer_id: "offer_0033", body: "Easier on WhatsApp, send me your number." }));
    expect(r.warning).toBe("off_platform_chat");
    const last = w.state().offers["offer_0033"].thread.at(-1);
    expect(last?.body).toContain("WhatsApp");
    expect(last?.warning_code).toBe("off_platform_chat");
    const fee = must(await w.actions.sendOfferMessage({ offer_id: "offer_0033", body: "There is a $20 onboarding fee to lock your slot." }));
    expect(fee.warning).toBe("pay_to_join");
  });

  it("a brand sends an offer to a creator with a rate card; burner-account demands are refused", async () => {
    const w = await makeWorld("brand");
    const sent = must(await w.actions.sendOffer({ creator_id: "cr_abe_adds_apps", app_id: "app_lumi", title: "Two honest hooks", amount_cents: 9_000, message: "We like your screen-recording style. Two takes, 4 days." }));
    expect(sent.offer.status).toBe("awaiting_creator");
    expect(sent.offer.expires_at > w.state().clock.now).toBe(true);
    expect(sent.offer.all_in_cents).toBeGreaterThan(9_000);
    const creatorUser = w.state().creators["cr_abe_adds_apps"].user_id;
    expect(Object.values(w.state().notifications).some((n) => n.recipient_user_id === creatorUser && n.kind === "offer_received" && n.ref_id === sent.offer.id)).toBe(true);
    expect(Object.values(w.state().activity_log).some((a) => a.target_id === sent.offer.id && a.action === "offer_sent")).toBe(true);

    const bad = await w.actions.sendOffer({ creator_id: "cr_coda_cuts", app_id: "app_lumi", title: "Burner test", amount_cents: 9_000, message: "Please film this from a brand new account that you create just for us." });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("offer_lint_blockers");
    const short = await w.actions.sendOffer({ creator_id: "cr_coda_cuts", app_id: "app_lumi", title: "x", amount_cents: 9_000, message: "hi" });
    expect(short.ok).toBe(false);
  });

  it("an invite to a live bounty pays the bounty rates and joins the creator on accept", async () => {
    const w = await makeWorld("brand");
    const invite = must(await w.actions.sendOffer({ kind: "invite", creator_id: "cr_maya", app_id: "app_lumi", bounty_id: "bnty_lumi_fixbadphoto", title: "Invite: Fix a bad photo", amount_cents: 0, message: "Your before and after style fits this brief. Join if you have a take." }));
    expect(invite.offer.amount_cents).toBe(0);
    expect(invite.offer.bounty_id).toBe("bnty_lumi_fixbadphoto");
    w.as("creator");
    const accepted = must(await w.actions.acceptOffer({ offer_id: invite.offer.id }));
    expect(accepted.offer.status).toBe("accepted");
    const save = Object.values(w.state().bounty_saves).find((x) => x.creator_id === "cr_maya" && x.bounty_id === "bnty_lumi_fixbadphoto");
    expect(save?.stage === "joined" || save?.stage === "submitted").toBe(true);
    const counter = await w.actions.counterOffer({ offer_id: invite.offer.id, amount_cents: 5_000 });
    expect(counter.ok).toBe(false);
  });

  it("an offer nobody answers expires after seven days of the demo clock", async () => {
    const w = await makeWorld("brand");
    const sent = must(await w.actions.sendOffer({ creator_id: "cr_abe_adds_apps", app_id: "app_lumi", title: "Quiet offer", amount_cents: 9_000, message: "A short brief for a short video, please." }));
    w.as("admin");
    must(await w.actions.advanceClock({ hours: 24 * 8 }));
    expect(w.state().offers[sent.offer.id].status).toBe("expired");
    expect(ledgerProblems(w.state())).toEqual([]);
  });
});
