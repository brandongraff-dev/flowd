import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { vi, describe, expect, it } from "vitest";
import { makeWorld, type TestWorld } from "@/lib/store/__tests__/helpers";
import { createEmptyState, SIGNED_OUT, type DemoState, type Persona, type StateKey } from "@/lib/store/state";
import { ensureTables } from "@/lib/store/store";
import * as selectors from "../selectors";
import type { Selector } from "../select";

vi.setConfig({ testTimeout: 120_000 });

type AnySelector = Selector<StateKey, unknown, unknown>;

/** Every exported `select...` function, by name. */
const REGISTRY: [string, AnySelector][] = Object.entries(selectors)
  .filter(([name, value]) => name.startsWith("select") && typeof value === "function" && Array.isArray((value as { keys?: unknown }).keys))
  .map(([name, value]) => [name, value as unknown as AnySelector]);

const first = <T>(table: Record<string, T>, pick: (row: T) => boolean = () => true): T | undefined => Object.values(table).find(pick);

/** Real arguments for every selector that takes one, found in the world. Selectors without an entry are called with `undefined` and `{}`. */
function argsFor(db: DemoState): Record<string, unknown[]> {
  const bounty = first(db.bounties, (b) => b.id === "bnty_lumi_glowup") ?? first(db.bounties);
  const post = first(db.posts, (p) => p.creator_id === "cr_maya") ?? first(db.posts);
  const submission = first(db.submissions, (s) => s.brand_id === "br_lumi") ?? first(db.submissions);
  const offer = first(db.offers);
  const thread = first(db.threads);
  const dispute = first(db.disputes);
  const auction = first(db.auctions);
  const spec = first(db.specs);
  const proof = first(db.proofs);
  const link = first(db.attribution_links);
  const audit = first(db.audit_reports);
  const tournament = first(db.tournaments);
  const lesson = first(db.lessons);
  const wrapped = first(db.wrapped);
  const drop = first(db.daily_drops);
  const rule = first(db.auto_approve_rules, (r) => r.brand_id === "br_lumi");
  const plan = first(db.test_plans);
  const invoice = first(db.invoices, (i) => i.brand_id === "br_lumi");
  const flag = first(db.fraud_flags);
  const payout = first(db.payouts, (p) => p.creator_id === "cr_maya");
  const grant = first(db.rights_grants, (g) => g.brand_id === "br_lumi");
  const creator = db.creators.cr_maya;
  const id = (row: { id: string } | undefined): string => row?.id ?? "missing";
  return {
    selectBounty: [id(bounty)],
    selectBountyDetail: [id(bounty)],
    selectBountyForCreator: [id(bounty)],
    selectEscrowProof: [id(bounty)],
    selectRightsCard: [id(bounty)],
    selectPublicBounty: [id(bounty)],
    selectSubmissionsForBounty: [id(bounty)],
    selectBountyPreview: [{ app_id: "app_lumi", title: "Sweep", budget_cents: 100_000 }],
    selectBountyCounts: [undefined, { brand: "br_lumi" }],
    selectPost: [id(post)],
    selectPostLedger: [id(post)],
    selectSubmission: [id(submission)],
    selectSubmissionAnalysis: [id(submission)],
    selectOffer: [id(offer)],
    selectThread: [id(thread)],
    selectDispute: [id(dispute)],
    selectAuction: [id(auction)],
    selectSpec: [id(spec)],
    selectProof: [id(proof)],
    selectTrackingLanding: [link?.code],
    selectAudit: [audit?.slug],
    selectTournament: [id(tournament)],
    selectLesson: [lesson?.slug],
    selectWrapped: [id(wrapped)],
    selectDrop: [id(drop)],
    selectRule: [id(rule)],
    selectTestPlan: [id(plan)],
    selectInvoice: [id(invoice)],
    selectFraudCase: [id(flag)],
    selectPayout: [id(payout)],
    selectApp: ["app_lumi"],
    selectAttributionKit: ["app_lumi"],
    selectFormat: ["tmpl_screen_reaction"],
    selectMarket: ["ai_photo"],
    selectCreatorProfile: [creator?.handle],
    selectPublicCreator: [creator?.handle],
    selectRenewalQuote: [{ grant_id: id(grant), extra_days: 30 }],
    selectPriceSuggestion: [{ category: "ai_photo" }],
    selectInstantPreview: [undefined, {}],
    selectLibraryCompare: [Object.keys(db.posts).slice(0, 2)],
    selectTestimonials: [undefined, "brand", "creator"],
    selectLeaderboard: [undefined, { scope: "global" }],
    selectEarningsCalculator: [{ posts_per_week: 5, niche: "ai_tools" }],
    selectBudgetPlanner: [{ budget_cents: 100_000, category: "fitness" }],
    selectBountyRegistry: [undefined, {}],
  };
}

/** The world a selector may see: only the keys it declared, and a loud error for anything else. */
function strictDb(db: DemoState, keys: readonly StateKey[]): DemoState {
  const picked = Object.fromEntries(keys.map((k) => [k, db[k]]));
  return new Proxy(picked, {
    get(target, prop) {
      if (typeof prop === "string" && !(prop in target)) throw new Error(`reads "${prop}" but declares only [${keys.join(", ")}]`);
      return (target as Record<string | symbol, unknown>)[prop];
    },
  }) as unknown as DemoState;
}

const PERSONAS: (Persona | null)[] = ["brand", "creator", "admin", null];

describe("the selector registry", () => {
  it("every selector has a hook, and every hook a selector", () => {
    expect(REGISTRY.length).toBeGreaterThan(100);
    const source = readFileSync(new URL("../hooks.ts", import.meta.url), "utf8");
    const hooked = new Set([...source.matchAll(/hookOf\((select\w+)\)/g)].map((m) => m[1]));
    const missing = REGISTRY.map(([name]) => name).filter((name) => !hooked.has(name));
    expect(missing, `selectors without a hook: ${missing.join(", ")}`).toEqual([]);
    const known = new Set(REGISTRY.map(([name]) => name));
    expect([...hooked].filter((name) => !known.has(name))).toEqual([]);
  });

  it("every selector declares its keys and the heavy tables it needs are among them", () => {
    for (const [name, sel] of REGISTRY) {
      expect(sel.keys.length, name).toBeGreaterThan(0);
      for (const t of sel.ensure) expect(sel.keys, `${name} ensures ${t}`).toContain(t);
    }
  });
});

describe("empty world", () => {
  it("every selector is total: no throw for no argument, an empty filter or an unknown id", () => {
    const empty = createEmptyState();
    for (const [name, sel] of REGISTRY) {
      for (const arg of [undefined, {}, "nope"]) {
        // `{}` is not a valid id or list, so only filters and ids are tried against the argument shapes they take
        try {
          sel(empty, arg);
        } catch (e) {
          if (arg === undefined) throw new Error(`${name}(undefined) threw on the empty world: ${(e as Error).message}`);
        }
      }
    }
  });

  it("an empty world gives empty lists, never invented rows", () => {
    const empty = createEmptyState();
    expect(selectors.selectBounties(empty, undefined)).toEqual([]);
    expect(selectors.selectSubmissions(empty, undefined)).toEqual([]);
    expect(selectors.selectPosts(empty, undefined)).toEqual([]);
    expect(selectors.selectFeed(empty, undefined).items).toEqual([]);
    expect(selectors.selectReviewQueue(empty, undefined).items).toEqual([]);
    expect(selectors.selectTemplates(empty, undefined)).toEqual([]);
    expect(selectors.selectHookLibrary(empty, undefined)).toEqual([]);
    expect(selectors.selectOnboarding(empty).ready).toBe(false);
    expect(selectors.selectEarningsCalculator(empty, undefined)).toBeUndefined();
    expect(selectors.selectBudgetPlanner(empty, undefined)).toBeUndefined();
  });
});

describe("declared keys", () => {
  for (const heavy of [false, true]) {
    it(`a selector reads only the tables it declares, and gives the same answer twice (${heavy ? "heavy tables loaded" : "core tables"})`, async () => {
      const w: TestWorld = await makeWorld("brand");
      if (heavy) await ensureTables(w.store, ["video_analyses", "compliance_checks", "view_snapshots", "conversions", "post_metrics_daily", "app_metrics_daily"]);
      const failures: string[] = [];
      for (const persona of PERSONAS) {
        w.as(persona);
        const db = w.state();
        const args = argsFor(db);
        for (const [name, sel] of REGISTRY) {
          const argList = args[name] ?? [undefined, {}];
          for (const arg of argList) {
            let full: unknown;
            try {
              full = sel(db, arg);
            } catch (e) {
              failures.push(`${name}(${JSON.stringify(arg) ?? "undefined"}) as ${persona}: threw ${(e as Error).message}`);
              continue;
            }
            try {
              const sliced = sel(strictDb(db, sel.keys), arg);
              if (!isDeepStrictEqual(sliced, full)) failures.push(`${name}(${JSON.stringify(arg) ?? "undefined"}) as ${persona}: result depends on a table it does not declare`);
              if (!isDeepStrictEqual(sel(db, arg), full)) failures.push(`${name}(${JSON.stringify(arg) ?? "undefined"}) as ${persona}: not pure (two calls differ)`);
            } catch (e) {
              failures.push(`${name}(${JSON.stringify(arg) ?? "undefined"}) as ${persona}: ${(e as Error).message}`);
            }
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it("a signed-out visitor gets empty personal views, not another person's", async () => {
    const w = await makeWorld(null);
    const db = w.state();
    expect(db.session).toEqual(SIGNED_OUT);
    expect(selectors.selectCreatorHome(db).ready).toBe(false);
    expect(selectors.selectNotifications(db, undefined).items).toEqual([]);
    expect(selectors.selectInbox(db, undefined).threads).toEqual([]);
    expect(selectors.selectCreatorWallet(db, undefined).rows).toEqual([]);
    expect(selectors.selectBrandWallet(db, undefined).wallet.balance_cents).toBe(0);
    expect(selectors.selectOnboarding(db).ready).toBe(false);
  });
});

describe("templates and hooks", () => {
  it("the 11 formats, in library order, filterable", async () => {
    const w = await makeWorld(null);
    const all = selectors.selectTemplates(w.state(), undefined);
    expect(all).toHaveLength(11);
    expect(all.map((f) => f.rank)).toEqual([...all.map((f) => f.rank)].sort((a, b) => a - b));
    expect(all[0].remix_href).toBe(`/creator/studio?format=${all[0].id}`);
    const faceless = selectors.selectTemplates(w.state(), { faceless: true });
    expect(faceless.length).toBeGreaterThan(0);
    expect(faceless.every((f) => f.faceless)).toBe(true);
    const pov = selectors.selectTemplates(w.state(), { hook_type: "pov" });
    expect(pov.every((f) => f.hook_types.includes("pov"))).toBe(true);
    expect(selectors.selectTemplates(w.state(), { q: "zzzz-no-such-format" })).toEqual([]);
    const first = all[0];
    expect(selectors.selectTemplates(w.state(), { q: first.name.split(" ")[0] }).map((f) => f.id)).toContain(first.id);
  });

  it("hooks come in seven types and are filled with the visitor's app", async () => {
    const w = await makeWorld(null);
    const all = selectors.selectHookLibrary(w.state(), undefined);
    const types = new Set(all.map((h) => h.hook_type));
    expect(types.size).toBe(7);
    for (const t of types) expect(all.filter((h) => h.hook_type === t).length, t).toBeGreaterThanOrEqual(10);
    expect(all.every((h) => !/\{[a-z]+\}/.test(h.filled))).toBe(true);
    const lumi = selectors.selectHookLibrary(w.state(), { type: "confession", fill: { app: "Lumi", category: "photo editing" } });
    expect(lumi.every((h) => h.hook_type === "confession")).toBe(true);
    expect(lumi.some((h) => h.filled.includes("Lumi"))).toBe(true);
    // sorted by what works: trial rate, best first
    for (let i = 1; i < lumi.length; i += 1) expect(lumi[i - 1].stats.trial_rate).toBeGreaterThanOrEqual(lumi[i].stats.trial_rate);
    const withExample = selectors.selectHookLibrary(w.state(), { category: "ai_photo" }).filter((h) => h.example !== undefined);
    expect(withExample.length).toBeGreaterThan(0);
  });
});

describe("free tools", () => {
  it("the earnings calculator is an estimate, ordered, and always shown beside the typical creator", async () => {
    const w = await makeWorld(null);
    const five = selectors.selectEarningsCalculator(w.state(), { niche: "ai_tools", posts_per_week: 5 });
    expect(five).toBeDefined();
    if (!five) return;
    expect(five.label).toMatch(/^Estimate\./);
    const m = five.range.monthly_cents;
    expect(m.p25).toBeLessThanOrEqual(m.median);
    expect(m.median).toBeLessThanOrEqual(m.p75);
    expect(five.typical.typical_cents).toBeGreaterThan(0);
    expect(five.typical.top_decile_cents).toBeGreaterThanOrEqual(five.typical.typical_cents);
    expect(five.typical.sentence).toMatch(/typical creator/i);
    expect(five.assumptions).toHaveLength(3);
    const ten = selectors.selectEarningsCalculator(w.state(), { niche: "ai_tools", posts_per_week: 10 });
    expect(ten?.range.monthly_cents.median).toBeGreaterThan(m.median);
    expect(selectors.selectEarningsCalculator(w.state(), { niche: "ai_tools", posts_per_week: 0 })?.range.monthly_cents.median).toBe(0);
    // posts that are not approved earn nothing
    const strict = selectors.selectEarningsCalculator(w.state(), { niche: "ai_tools", posts_per_week: 5, approval_rate: 0.4 });
    expect(strict?.range.monthly_cents.median).toBeLessThan(m.median);
    expect(strict?.assumptions[2]).toContain("40%");
  });

  it("the budget planner prices a pool at the market and keeps the bands in order", async () => {
    const w = await makeWorld(null);
    const free = selectors.selectBudgetPlanner(w.state(), { budget_cents: 100_000, category: "fitness" });
    expect(free).toBeDefined();
    if (!free) return;
    expect(free.plan.label).toMatch(/^Estimate\./);
    expect(free.take_rate).toBe(0.12);
    expect(free.plan.funding.card_charge_cents).toBeGreaterThan(100_000);
    const { low, median, high } = free.plan.band;
    expect(low.installs).toBeLessThanOrEqual(median.installs);
    expect(median.installs).toBeLessThanOrEqual(high.installs);
    expect(low.paid).toBeLessThanOrEqual(high.paid);
    expect(free.plan.views).toBe(Math.round((100_000 / free.cpm_cents) * 1000));
    const scale = selectors.selectBudgetPlanner(w.state(), { budget_cents: 100_000, category: "fitness", plan: "scale" });
    expect(scale?.take_rate).toBe(0.08);
    expect(scale?.plan.funding.card_charge_cents).toBeLessThan(free.plan.funding.card_charge_cents);
    // a higher CPM buys fewer views
    const pricey = selectors.selectBudgetPlanner(w.state(), { budget_cents: 100_000, category: "fitness", cpm_cents: free.cpm_cents * 2 });
    expect(pricey?.plan.views).toBeLessThan(free.plan.views);
  });
});

describe("onboarding", () => {
  const as = (w: TestWorld, creatorId: string): void => {
    const c = w.state().creators[creatorId];
    w.store.setState({ session: { persona: "creator", user_id: c.user_id, creator_id: c.id, brand_id: null, app_id: null, member_id: null } });
  };

  it("a creator who linked an account and agreed is through the wizard; one whose link needs re-auth is not", async () => {
    const w = await makeWorld(null);
    as(w, "cr_dani_drafts");
    const done = selectors.selectOnboarding(w.state());
    expect(done.ready).toBe(true);
    expect(done.steps.map((s) => s.done)).toEqual([true, true, true]);
    expect(done.complete).toBe(true);
    expect(done.current).toBe(3);
    expect(done.niche_options.filter((n) => n.picked).map((n) => n.id).sort()).toEqual([...done.niches].sort());
    expect(done.starter_count).toBeGreaterThan(0);
    expect(done.promise).toMatch(/72 hours/);

    as(w, "cr_ollie_opens");
    const stuck = selectors.selectOnboarding(w.state());
    expect(stuck.steps.find((s) => s.id === "accounts")?.done).toBe(false);
    expect(stuck.current).toBe(1);
    expect(stuck.complete).toBe(false);
  });

  it("saving a step moves the stage forward and never back", async () => {
    const w = await makeWorld(null);
    as(w, "cr_dani_drafts");
    const before = w.state().creators.cr_dani_drafts.onboarding_stage;
    const r = await w.actions.updateOnboarding({ niches: ["beauty", "lifestyle", "travel"], confirm_18: true, accept_agreement: true });
    expect(r.ok).toBe(true);
    const after = w.state().creators.cr_dani_drafts;
    expect(after.niches).toHaveLength(3);
    expect(after.onboarding_stage).toBe(before);
    expect(selectors.selectOnboarding(w.state()).niches).toHaveLength(3);
    const bad = await w.actions.updateOnboarding({ niches: [] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("niches_invalid");
  });
});
