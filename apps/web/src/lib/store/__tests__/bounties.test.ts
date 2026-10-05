import { vi, describe, expect, it } from "vitest";
import { escrowIdentityHolds, escrowStateOf, formatMoney } from "@/lib/engine";
import { ledgerProblems, makeWorld, must, walletFromLedger } from "./helpers";

vi.setConfig({ testTimeout: 60_000 });

const base = { app_id: "app_lumi", title: "Honest before and after", budget_cents: 50_000 };

describe("bounties and the Funded badge", () => {
  it("saves a draft that is linted and priced, and charges nothing", async () => {
    const w = await makeWorld("brand");
    const wallet = w.state().brands["br_lumi"].wallet_balance_cents;
    const r = must(await w.actions.createBounty(base));
    expect(r.bounty.status).toBe("draft");
    expect(r.bounty.funded).toBe(false);
    expect(r.lint.can_publish).toBe(true);
    expect(r.funding.brand_funded_cents).toBeGreaterThan(base.budget_cents);
    expect(w.state().brands["br_lumi"].wallet_balance_cents).toBe(wallet);
    expect(w.state().bounties[r.bounty.id]).toBeDefined();
    expect(Object.values(w.state().activity_log).some((a) => a.target_id === r.bounty.id && a.action === "bounty_created")).toBe(true);
  });

  it("Brief Lint blockers stop publishing, and the fix is one line", async () => {
    const w = await makeWorld("brand");
    const draft = must(await w.actions.createBounty({ ...base, brief: { summary: "Creators must hit 100k views to get paid and open a brand new TikTok account for this." } }));
    expect(draft.lint.can_publish).toBe(false);
    expect(draft.lint.findings.some((f) => f.severity === "blocker")).toBe(true);
    const blocked = await w.actions.publishBounty({ bounty_id: draft.bounty.id });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe("brief_lint_blockers");
      expect(blocked.error.hint).toBeTruthy();
    }
    expect(w.state().bounties[draft.bounty.id].status).toBe("draft");
  });

  it("publishing funds the escrow from the wallet and the bounty goes live Funded", async () => {
    const w = await makeWorld("brand");
    const wallet = w.state().brands["br_lumi"].wallet_balance_cents;
    const draft = must(await w.actions.createBounty(base));
    const pub = must(await w.actions.publishBounty({ bounty_id: draft.bounty.id }));
    expect(pub.funded).toBe(true);
    const b = w.state().bounties[draft.bounty.id];
    expect(b.status).toBe("live");
    expect(b.funded).toBe(true);
    expect(b.escrow_funded_cents).toBe(b.budget_cents + b.fee_reserve_cents);
    expect(b.remaining_cents).toBe(b.escrow_funded_cents);
    expect(escrowIdentityHolds(escrowStateOf(b))).toBe(true);
    const lumi = w.state().brands["br_lumi"];
    expect(lumi.wallet_balance_cents).toBe(wallet - (b.budget_cents + b.fee_reserve_cents));
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(lumi.wallet_balance_cents);
    expect(ledgerProblems(w.state())).toEqual([]);
    const memo = Object.values(w.state().ledger).find((e) => e.bounty_id === b.id && e.entry_type === "escrow_fund")?.memo ?? "";
    expect(memo).toContain("Funded:");
  });

  it("a bounty cannot go live until the escrow is full; topping up the wallet completes it", async () => {
    const w = await makeWorld("brand");
    const draft = must(await w.actions.createBounty({ ...base, title: "Big push", budget_cents: 400_000 }));
    const pub = must(await w.actions.publishBounty({ bounty_id: draft.bounty.id }));
    expect(pub.funded).toBe(false);
    expect(pub.shortfall_cents).toBeGreaterThan(0);
    expect(w.state().bounties[draft.bounty.id].status).toBe("awaiting_funding");
    expect(w.state().bounties[draft.bounty.id].funded).toBe(false);
    const refused = await w.actions.fundBounty({ bounty_id: draft.bounty.id });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("insufficient_funds");

    const top = must(await w.actions.fundWallet({ amount_cents: pub.shortfall_cents }));
    expect(top.card_charge_cents).toBeGreaterThan(top.amount_cents);
    expect(top.invoice.status).toBe("paid");
    expect(top.invoice.total_cents).toBe(top.card_charge_cents);
    const funded = must(await w.actions.fundBounty({ bounty_id: draft.bounty.id }));
    expect(funded.bounty.status).toBe("live");
    expect(funded.bounty.funded).toBe(true);
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(w.state().brands["br_lumi"].wallet_balance_cents);
    expect(ledgerProblems(w.state())).toEqual([]);
  });

  it("publishing can top up from the card in one step", async () => {
    const w = await makeWorld("brand");
    const draft = must(await w.actions.createBounty({ ...base, title: "Card funded", budget_cents: 400_000 }));
    const pub = must(await w.actions.publishBounty({ bounty_id: draft.bounty.id, top_up_from_card: true }));
    expect(pub.funded).toBe(true);
    expect(w.state().bounties[draft.bounty.id].status).toBe("live");
    expect(Object.values(w.state().invoices).some((i) => i.bounty_id === draft.bounty.id)).toBe(true);
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(w.state().brands["br_lumi"].wallet_balance_cents);
  });

  it("the first bounty of a brand has its fee waived and flowd matches up to $500", async () => {
    const w = await makeWorld("admin");
    const brand = w.state().brands["br_rainyday"];
    expect(brand.first_bounty_waiver_used).toBe(false);
    const app = Object.values(w.state().apps).find((a) => a.brand_id === brand.id);
    const r = must(await w.actions.createBounty({ app_id: app?.id ?? "", title: "Our first bounty", budget_cents: 80_000 }));
    expect(r.first_bounty).toBe(true);
    expect(r.bounty.take_rate).toBe(0);
    expect(r.funding.matched_cents).toBe(40_000);
    expect(r.funding.brand_funded_cents).toBe(40_000);
    must(await w.actions.publishBounty({ bounty_id: r.bounty.id }));
    const b = w.state().bounties[r.bounty.id];
    expect(b.status).toBe("live");
    expect(b.matched_cents).toBe(40_000);
    expect(b.escrow_funded_cents).toBe(80_000);
    expect(w.state().brands[b.brand_id].first_bounty_waiver_used).toBe(true);
    expect(w.state().brands[b.brand_id].wallet_balance_cents).toBe(brand.wallet_balance_cents - 40_000);
    expect(escrowIdentityHolds(escrowStateOf(b))).toBe(true);
    expect(ledgerProblems(w.state())).toEqual([]);
    // the second bounty pays the plan rate
    const second = must(await w.actions.createBounty({ app_id: app?.id ?? "", title: "Our second bounty", budget_cents: 20_000 }));
    expect(second.first_bounty).toBe(false);
    expect(second.bounty.take_rate).toBeGreaterThan(0);
  });

  it("top up, pause, resume, extend and end", async () => {
    const w = await makeWorld("brand");
    const draft = must(await w.actions.createBounty(base));
    must(await w.actions.publishBounty({ bounty_id: draft.bounty.id }));
    const id = draft.bounty.id;
    const before = w.state().bounties[id];
    must(await w.actions.topUpBounty({ bounty_id: id, amount_cents: 20_000 }));
    const topped = w.state().bounties[id];
    expect(topped.budget_cents).toBe(before.budget_cents + 20_000);
    expect(escrowIdentityHolds(escrowStateOf(topped))).toBe(true);
    expect(topped.funded).toBe(true);
    must(await w.actions.pauseBounty({ bounty_id: id, reason: "waiting on the new build" }));
    expect(w.state().bounties[id].status).toBe("paused");
    must(await w.actions.resumeBounty({ bounty_id: id }));
    expect(w.state().bounties[id].status).toBe("live");
    must(await w.actions.extendBounty({ bounty_id: id, ends_at: "2026-12-31T00:00:00Z" }));
    expect(w.state().bounties[id].ends_at).toBe("2026-12-31T00:00:00Z");
    must(await w.actions.endBounty({ bounty_id: id }));
    expect(w.state().bounties[id].status).toBe("ended");
    expect(ledgerProblems(w.state())).toEqual([]);
  });

  it("cancelling an unworked bounty returns every unspent dollar to the wallet", async () => {
    const w = await makeWorld("brand");
    const wallet0 = w.state().brands["br_lumi"].wallet_balance_cents;
    const draft = must(await w.actions.createBounty(base));
    must(await w.actions.publishBounty({ bounty_id: draft.bounty.id }));
    const r = must(await w.actions.cancelBounty({ bounty_id: draft.bounty.id, reason: "changed plans" }));
    expect(r.refunded_cents).toBe(w.state().bounties[draft.bounty.id].escrow_funded_cents);
    expect(w.state().bounties[draft.bounty.id].status).toBe("cancelled");
    expect(w.state().brands["br_lumi"].wallet_balance_cents).toBe(wallet0);
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(wallet0);
    expect(escrowIdentityHolds(escrowStateOf(w.state().bounties[draft.bounty.id]))).toBe(true);
    expect(ledgerProblems(w.state())).toEqual([]);
  });

  it("a bounty with approved videos cannot be cancelled", async () => {
    const w = await makeWorld("brand");
    const r = await w.actions.cancelBounty({ bounty_id: "bnty_lumi_glowup" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("has_approved_work");
  });

  it("only a workspace member with the right role can fund", async () => {
    const w = await makeWorld("creator");
    const r = await w.actions.fundWallet({ amount_cents: 10_000 });
    expect(r.ok).toBe(false);
    w.as("brand");
    const tooSmall = await w.actions.fundWallet({ amount_cents: 500 });
    expect(tooSmall.ok).toBe(false);
    if (!tooSmall.ok) expect(tooSmall.error.code).toBe("amount_too_small");
    const ok = must(await w.actions.fundWallet({ amount_cents: 100_000 }));
    expect(formatMoney(ok.balance_cents)).toBeTruthy();
    expect(ok.balance_cents).toBe(w.state().brands["br_lumi"].wallet_balance_cents);
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(ok.balance_cents);
  });

  it("changing plan: an upgrade is charged and invoiced, a downgrade waits for renewal", async () => {
    const w = await makeWorld("brand");
    const up = must(await w.actions.changeBrandPlan({ plan: "scale" }));
    expect(up.charged_cents).toBe(99_900);
    expect(w.state().brands["br_lumi"].plan).toBe("scale");
    expect(up.invoice?.kind).toBe("subscription");
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(w.state().brands["br_lumi"].wallet_balance_cents);
    const down = must(await w.actions.changeBrandPlan({ plan: "free" }));
    expect(down.charged_cents).toBe(0);
    const same = await w.actions.changeBrandPlan({ plan: "free" });
    expect(same.ok).toBe(false);
    expect(ledgerProblems(w.state())).toEqual([]);
  });
});
