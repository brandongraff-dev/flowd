import { vi, describe, expect, it } from "vitest";
import { fundWallet } from "../core/wallet";
import { markNotificationRead } from "../core/creator";
import { getServerActions, getServerState, getServerStore, resetServerWorld, runServerAction } from "../server";
import { ledgerProblems } from "./helpers";

vi.setConfig({ testTimeout: 120_000 });

describe("the server world", () => {
  it("runs the same actions as the app, as the caller's persona, and never leaks the caller's session", async () => {
    await resetServerWorld();
    const seeded = await getServerState();
    expect((await getServerStore()).getState().status).toBe("ready");
    expect(seeded.session.persona).toBeNull();
    const wallet = seeded.brands.br_lumi.wallet_balance_cents;

    // three callers at once: each is judged as who it is
    const [brand, creator, anon] = await Promise.all([
      runServerAction(fundWallet, [{ amount_cents: 10_000 }], { persona: "brand" }),
      runServerAction(fundWallet, [{ amount_cents: 10_000 }], { persona: "creator" }),
      runServerAction(fundWallet, [{ amount_cents: 10_000 }]),
    ]);
    expect(brand.ok).toBe(true);
    expect(creator.ok).toBe(false);
    if (!creator.ok) expect(creator.error.code).toBe("forbidden");
    expect(anon.ok).toBe(false);
    if (!anon.ok) expect(anon.error.code).toBe("unauthenticated");

    const after = await getServerState();
    expect(after.session.persona).toBeNull();
    expect(after.brands.br_lumi.wallet_balance_cents).toBe(wallet + 10_000);
    expect(ledgerProblems(after)).toEqual([]);

    // the server world holds every table, heavy ones included
    expect(Object.keys(after.video_analyses).length).toBeGreaterThan(0);
    expect(Object.keys(after.conversions).length).toBeGreaterThan(0);
  });

  it("a creator action through the server changes the same rows the app would", async () => {
    await resetServerWorld();
    const before = await getServerState();
    const note = Object.values(before.notifications).find((n) => n.recipient_user_id === "usr_maya" && !n.read_at);
    expect(note).toBeDefined();
    const r = await runServerAction(markNotificationRead, [{ id: note?.id ?? "" }], { persona: "creator" });
    expect(r.ok).toBe(true);
    const after = await getServerState();
    expect(after.notifications[note?.id ?? ""].read_at).toBeTruthy();
    // and the world starts over on request
    await resetServerWorld();
    expect((await getServerState()).notifications[note?.id ?? ""].read_at).toBeFalsy();
  });

  it("bound actions run as an anonymous caller (public endpoints)", async () => {
    await resetServerWorld();
    const actions = await getServerActions();
    const r = await actions.joinWaitlist({ email: "server@example.com", role: "creator" });
    expect(r.ok).toBe(true);
    const denied = await actions.fundWallet({ amount_cents: 10_000 });
    expect(denied.ok).toBe(false);
    await resetServerWorld();
  });
});
