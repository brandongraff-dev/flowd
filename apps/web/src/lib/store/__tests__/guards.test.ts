import { readFileSync } from "node:fs";
import { vi, describe, expect, it } from "vitest";
import type { ActionName } from "../actions";
import type { ActionResult } from "../core/tx";
import { makeWorld, type TestWorld } from "./helpers";

vi.setConfig({ testTimeout: 120_000 });

type AnyAction = (input?: unknown) => Promise<ActionResult<unknown>>;

const source = readFileSync(new URL("../actions.ts", import.meta.url), "utf8");
/** The action names in a section of `createActions`, by the section's marker comment. */
function section(title: string): ActionName[] {
  const start = source.indexOf(`// ── ${title}`);
  expect(start, `section ${title}`).toBeGreaterThan(-1);
  const next = source.indexOf("// ── ", start + 10);
  const body = source.slice(start, next === -1 ? undefined : next);
  return [...body.matchAll(/^\s*(\w+): bind\(/gm)].map((m) => m[1] as ActionName);
}

const call = (w: TestWorld, name: ActionName, input: unknown = {}): Promise<ActionResult<unknown>> => (w.actions[name] as AnyAction)(input);

/** What an action did with an empty input, without letting a TypeError from a malformed input hide as a pass. */
async function attempt(w: TestWorld, name: ActionName): Promise<{ ok: boolean; code?: string; threw?: string }> {
  try {
    const r = await call(w, name);
    return r.ok ? { ok: true } : { ok: false, code: r.error.code };
  } catch (e) {
    return { ok: false, threw: (e as Error).message };
  }
}

const PUBLIC: ActionName[] = ["joinWaitlist", "applyFoundingCreator", "recordLinkClick", "recordProofView", "runAudit"];

describe("who may call what", () => {
  it("nothing that moves money or changes a decision works for a signed-out visitor", async () => {
    const w = await makeWorld(null);
    const names = Object.keys(w.actions) as ActionName[];
    expect(names.length).toBeGreaterThan(130);
    const succeeded: string[] = [];
    for (const name of names) {
      if (PUBLIC.includes(name)) continue;
      const r = await attempt(w, name);
      if (r.ok) succeeded.push(name);
    }
    expect(succeeded).toEqual([]);
  });

  it("the same signed-out visitor is told to sign in, in the same words, wherever the guard comes first", async () => {
    const w = await makeWorld(null);
    const money = ["fundWallet", "requestPayout", "approveSubmission", "publishBounty", "acceptOffer", "submitVideo", "placeBid", "claimDrop"] as const;
    for (const name of money) {
      const r = await attempt(w, name);
      expect(r.threw, name).toBeUndefined();
      expect(r.code, name).toBe("unauthenticated");
    }
  });

  it("Ops-only actions refuse a brand and a creator before they look at anything", async () => {
    const w = await makeWorld("brand");
    const adminOnly = section("admin (Ops)");
    expect(adminOnly.length).toBeGreaterThan(15);
    for (const persona of ["brand", "creator"] as const) {
      w.as(persona);
      for (const name of adminOnly) {
        const r = await attempt(w, name);
        expect(r.threw, `${name} as ${persona}`).toBeUndefined();
        expect(r.code, `${name} as ${persona}`).toBe("forbidden");
      }
    }
  });

  it("brand actions refuse a creator and creator actions refuse a brand", async () => {
    const w = await makeWorld("brand");
    const waiting = Object.values(w.state().submissions).find((x) => x.brand_id === "br_lumi" && x.status === "in_review");
    const brandCalls: [ActionName, unknown][] = [
      ["fundWallet", { amount_cents: 10_000 }],
      ["publishBounty", { bounty_id: "bnty_lumi_glowup" }],
      ["createBounty", { app_id: "app_lumi", title: "Nope", budget_cents: 10_000 }],
      ["approveSubmission", { submission_id: waiting?.id }],
      ["rejectSubmission", { submission_id: waiting?.id }],
      ["sendOffer", { creator_id: "cr_maya", app_id: "app_lumi", title: "Nope", amount_cents: 9_000, message: "Hello there" }],
      ["createApiKey", { name: "Nope key" }],
      ["inviteTeamMember", { email: "nope@example.com", role: "viewer" }],
      ["saveRule", { name: "Nope rule" }],
      ["renewRights", { grant_id: "rg_0002", extra_days: 30 }],
    ];
    w.as("creator");
    for (const [name, input] of brandCalls) {
      const r = await call(w, name, input);
      expect(r.ok, `${name} as creator`).toBe(false);
      if (!r.ok) expect(r.error.code, `${name} as creator`).toBe("forbidden");
    }
    const creatorCalls: [ActionName, unknown][] = [
      ["requestPayout", {}],
      ["claimBounty", { bounty_id: "bnty_lumi_glowup" }],
      ["saveBounty", { bounty_id: "bnty_lumi_glowup", saved: true }],
      ["shareProof", { month: "2026-09" }],
      ["toggleWellbeing", { enabled: true }],
      ["joinCrew", { crew_id: Object.keys(w.state().crews)[0] }],
    ];
    w.as("brand");
    for (const [name, input] of creatorCalls) {
      const r = await call(w, name, input);
      expect(r.ok, `${name} as brand`).toBe(false);
      if (!r.ok) expect(r.error.code, `${name} as brand`).toBe("forbidden");
    }
  });

  it("Ops can act for a brand or a creator where the product allows it, and an action on a missing row is not_found, not a crash", async () => {
    const w = await makeWorld("admin");
    const r = await w.actions.pauseBounty({ bounty_id: "bnty_does_not_exist" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_found");
    const ok = await w.actions.pauseBounty({ bounty_id: "bnty_lumi_glowup" });
    expect(ok.ok).toBe(true);
  });

  it("a person Ops put on hold can look but not act, and the message says their money is safe", async () => {
    const w = await makeWorld("admin");
    const held = await w.actions.setCreatorStanding({ creator_id: "cr_maya", action: "hold", reason: "Checking a payout pattern" } as never);
    expect(held.ok).toBe(true);
    w.as("creator");
    const r = await w.actions.requestPayout({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("account_on_hold");
      expect(r.error.hint).toMatch(/money is safe/i);
    }
  });
});
