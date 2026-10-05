import { vi, describe, expect, it } from "vitest";
import { ActionError, ensure, runAction, type Tx } from "../core/tx";
import { roleCan, type BrandCapability } from "../core/guards";
import { migrateOverlay, OVERLAY_VERSION, toOverlay, applyOverlay } from "../overlay";
import { ledgerProblems, makeWorld, must } from "./helpers";
import type { BrandMemberRole } from "@/lib/contract/types";

vi.setConfig({ testTimeout: 60_000 });

describe("transactions", () => {
  it("a failed action changes nothing: same state object, no half-written rows, no burned ids", async () => {
    const w = await makeWorld("brand");
    const before = w.state();
    const counters = { ...before.counters };
    const walletBefore = before.brands.br_lumi.wallet_balance_cents;
    // writes a row, moves money and takes an id, then fails
    const { state, result } = runAction(before, (tx: Tx) => {
      tx.nextId("txn");
      tx.patch("brands", "br_lumi", { name: "Half written" });
      tx.post({ id: "txn_x", posted_at: tx.now, type: "deposit", memo: "x", legs: [] } as never);
      ensure(false, "nope", "This fails after writing.");
    }, undefined);
    expect(result.ok).toBe(false);
    expect(state).toBe(before);
    expect(before.brands.br_lumi.name).not.toBe("Half written");
    expect(before.brands.br_lumi.wallet_balance_cents).toBe(walletBefore);
    expect(before.counters).toEqual(counters);
    // and through the store: the store keeps the same state and revision
    const rev = w.state().revision;
    const refused = await w.actions.fundWallet({ amount_cents: 1 });
    expect(refused.ok).toBe(false);
    expect(w.state()).toBe(before);
    expect(w.state().revision).toBe(rev);
  });

  it("a successful action shares every table it did not touch and never mutates the old state", async () => {
    const w = await makeWorld("brand");
    const before = w.state();
    const wallet = before.brands.br_lumi.wallet_balance_cents;
    const notificationsBefore = { ...before.notifications };
    must(await w.actions.fundWallet({ amount_cents: 20_000 }));
    const after = w.state();
    expect(after).not.toBe(before);
    expect(after.revision).toBe(before.revision + 1);
    // untouched tables keep their identity (this is what makes selectors and the overlay cheap)
    expect(after.bounties).toBe(before.bounties);
    expect(after.posts).toBe(before.posts);
    expect(after.creators).toBe(before.creators);
    expect(after.brands).not.toBe(before.brands);
    expect(after.ledger).not.toBe(before.ledger);
    // the old state is untouched
    expect(before.brands.br_lumi.wallet_balance_cents).toBe(wallet);
    expect(before.notifications).toEqual(notificationsBefore);
    expect(after.brands.br_lumi.wallet_balance_cents).toBe(wallet + 20_000);
    expect(ledgerProblems(after)).toEqual([]);
  });

  it("an action that changes nothing returns the same state (no re-render, nothing to save)", async () => {
    const w = await makeWorld("creator");
    const before = w.state();
    const read = await w.actions.markThreadRead({ thread_id: Object.values(before.threads).find((t) => t.creator_id === "cr_maya" && t.unread_creator === 0)?.id ?? "" });
    expect(read.ok).toBe(true);
    expect(w.state()).toBe(before);
  });

  it("a bug inside an action is rethrown under test so it cannot hide", () => {
    const state = createState();
    expect(() => runAction(state, () => { throw new TypeError("a bug"); }, undefined)).toThrow("a bug");
    const refusal = runAction(state, () => { throw new ActionError("custom", "A plain message", "A hint", 418); }, undefined);
    expect(refusal.result).toMatchObject({ ok: false, error: { code: "custom", message: "A plain message", hint: "A hint", status: 418 } });
  });
});

function createState() {
  // a minimal state is enough for runAction: it only needs something Tx can wrap
  return { revision: 0, counters: {}, tombstones: {}, clock: { now: "2026-10-03T14:00:00Z", advanced_hours: 0 }, session: { persona: null } } as never;
}

describe("the roles matrix", () => {
  const roles: BrandMemberRole[] = ["owner", "admin", "reviewer", "finance", "viewer", "client_approver"];
  const caps: BrandCapability[] = ["view", "review", "build", "finance", "manage"];
  const expected: Record<BrandMemberRole, BrandCapability[]> = {
    owner: ["view", "review", "build", "finance", "manage"],
    admin: ["view", "review", "build", "finance", "manage"],
    reviewer: ["view", "review", "build"],
    finance: ["view", "finance"],
    viewer: ["view"],
    client_approver: ["view", "review"],
  };

  it("matches the product's role table", () => {
    for (const role of roles) expect(caps.filter((c) => roleCan(role, c)), role).toEqual(expected[role]);
  });
});

describe("the saved demo", () => {
  it("migrates the current version and refuses anything it cannot trust", async () => {
    const w = await makeWorld("brand");
    must(await w.actions.fundWallet({ amount_cents: 10_000 }));
    const overlay = toOverlay(w.state());
    expect(overlay.v).toBe(OVERLAY_VERSION);
    expect(migrateOverlay(JSON.parse(JSON.stringify(overlay)), OVERLAY_VERSION)).toMatchObject({ v: OVERLAY_VERSION, session: { persona: "brand" } });
    // fields added later default sensibly
    const { removed: _removed, docs: _docs, counters: _counters, ...bare } = overlay;
    const upgraded = migrateOverlay(bare, OVERLAY_VERSION);
    expect(upgraded).toMatchObject({ removed: {}, docs: {}, counters: {} });
    // junk is dropped, not half-applied
    for (const junk of [null, undefined, 42, "x", [], {}, { rows: [] }, { rows: {}, session: null }]) expect(migrateOverlay(junk, OVERLAY_VERSION)).toBeNull();
    expect(migrateOverlay(overlay, 0)).toBeNull();
    expect(migrateOverlay(overlay, OVERLAY_VERSION + 1)).toBeNull();
  });

  it("applying a saved overlay to a fresh world reproduces the visitor's state, rows, docs, clock and counters", async () => {
    const a = await makeWorld("brand");
    must(await a.actions.fundWallet({ amount_cents: 30_000 }));
    a.as("admin");
    must(await a.actions.advanceClock({ hours: 30 }));
    const overlay = JSON.parse(JSON.stringify(toOverlay(a.state())));
    const b = await makeWorld(null);
    const restored = applyOverlay(b.state(), migrateOverlay(overlay, OVERLAY_VERSION) ?? toOverlay(b.state()));
    expect(restored.clock).toEqual(a.state().clock);
    expect(restored.brands.br_lumi.wallet_balance_cents).toBe(a.state().brands.br_lumi.wallet_balance_cents);
    expect(Object.keys(restored.ledger).length).toBe(Object.keys(a.state().ledger).length);
    expect(restored.counters).toEqual(a.state().counters);
    expect(ledgerProblems(restored)).toEqual([]);
    // counters never go backwards, so a new id is never a reused one
    const b2 = applyOverlay(a.state(), { ...overlay, counters: {} });
    for (const [k, v] of Object.entries(a.state().counters)) expect(b2.counters[k]).toBeGreaterThanOrEqual(v);
  });
});
