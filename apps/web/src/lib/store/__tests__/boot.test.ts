import { vi, describe, expect, it } from "vitest";
import { ledgerProblems, makeWorld, walletFromLedger } from "./helpers";

vi.setConfig({ testTimeout: 60_000 });

describe("boot", () => {
  it("loads the core world and is ready", async () => {
    const w = await makeWorld();
    const s = w.state();
    expect(s.status).toBe("ready");
    expect(Object.keys(s.bounties).length).toBeGreaterThan(40);
    expect(Object.keys(s.creators).length).toBe(s.world.counts.creators);
    expect(s.world.now).toBe("2026-10-03T14:00:00Z");
    expect(s.clock.now).toBe(s.world.now);
  });

  it("starts with books that balance", async () => {
    const w = await makeWorld();
    expect(ledgerProblems(w.state())).toEqual([]);
    const lumi = w.state().brands["br_lumi"];
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(lumi.wallet_balance_cents);
  });
});
