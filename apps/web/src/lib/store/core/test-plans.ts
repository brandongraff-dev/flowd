/**
 * The test planner (Pro): a hook x body x CTA matrix sized to the brand's spend tier, assigned to bounties or offers and measured on settled posts.
 * Small samples always carry a caution: the matrix tells you what to try next, not what is proven.
 */

import type { BountyId, CtaType, OfferId, SpendTier, TestAxisItem, TestCell, TestPlan } from "@/lib/contract/types";
import { requireBrand } from "./guards";
import { needFeature } from "./brand-ops";
import { ensure, type Tx } from "./tx";

/** The most cells a plan may have per spend tier, so a small budget is not spread across twenty unreadable cells. */
export const MAX_CELLS: Readonly<Record<SpendTier, number>> = { starter: 6, growth: 12, scale: 24 };

/** The spend tier a budget falls in: under $1,000 starter, under $5,000 growth, otherwise scale. */
export const spendTierFor = (budgetCents: number): SpendTier => (budgetCents < 100_000 ? "starter" : budgetCents < 500_000 ? "growth" : "scale");

export interface TestPlanInput {
  app_id: string;
  name: string;
  budget_cents: number;
  hooks: TestAxisItem[];
  bodies: TestAxisItem[];
  ctas: CtaType[];
}

/** The caution shown under results, from how much has been measured. */
function caution(videos: number, cells: number): string {
  if (videos === 0) return "Nothing measured yet. Assign the cells to bounties or offers and the first results land when posts settle.";
  return `Small sample: ${videos} ${videos === 1 ? "video" : "videos"} across ${cells} cells. Treat the results as directional until more cells are measured.`;
}

function cellsFor(tx: Tx, p: Pick<TestPlanInput, "hooks" | "bodies" | "ctas">, tier: SpendTier): TestCell[] {
  const all: { hook: string; body: string; cta: CtaType }[] = [];
  for (const h of p.hooks) for (const b of p.bodies) for (const c of p.ctas) all.push({ hook: h.id, body: b.id, cta: c });
  ensure(all.length <= MAX_CELLS[tier], "too_many_cells", `A ${tier} plan holds ${MAX_CELLS[tier]} cells at most; this matrix has ${all.length}.`, "Drop a hook, a body or a call to action.", 422);
  return all.map((x) => ({ id: tx.nextId("cell"), hook_ref: x.hook, body_ref: x.body, cta: x.cta, status: "planned" as const }));
}

function validate(p: Pick<TestPlanInput, "name" | "hooks" | "bodies" | "ctas" | "budget_cents">): void {
  ensure(p.name.trim().length >= 3, "name_required", "Name the plan so you can find its results later.", undefined, 422);
  ensure(p.hooks.length >= 2 && p.bodies.length >= 1 && p.ctas.length >= 1, "axes_required", "A test needs at least two hooks, one body and one call to action.", undefined, 422);
  ensure(p.budget_cents >= 10_000, "budget_too_small", "Plan at least $100 of creator pay for a test.", undefined, 422);
}

/** Starts a test plan. Needs the Pro plan. */
export function createTestPlan(tx: Tx, input: TestPlanInput): { plan: TestPlan } {
  const app = tx.must("apps", input.app_id, "App");
  const { brand } = requireBrand(tx, app.brand_id, "build");
  needFeature(tx, brand, "test_planner", "The test planner");
  validate(input);
  const tier = spendTierFor(input.budget_cents);
  const cells = cellsFor(tx, input, tier);
  const id = `tplan_${brand.slug}_${String(tx.all("test_plans").filter((p) => p.brand_id === brand.id).length + 1).padStart(2, "0")}`;
  const plan: TestPlan = {
    id: tx.get("test_plans", id) ? `${id}_${tx.nextNumber("pm")}` : id,
    brand_id: brand.id,
    app_id: app.id,
    name: input.name.trim(),
    status: "draft",
    spend_tier: tier,
    budget_cents: input.budget_cents,
    hooks: input.hooks,
    bodies: input.bodies,
    ctas: input.ctas,
    cells,
    bounty_ids: [],
    offer_ids: [],
    caution: caution(0, cells.length),
    created_at: tx.now,
    updated_at: tx.now,
  };
  return { plan: tx.put("test_plans", plan) };
}

/** Edits a draft plan (the matrix is rebuilt). A plan that is running or measured keeps its cells. */
export function updateTestPlan(tx: Tx, input: { plan_id: string; changes: Partial<Omit<TestPlanInput, "app_id">> }): { plan: TestPlan } {
  const plan = tx.must("test_plans", input.plan_id, "Test plan");
  requireBrand(tx, plan.brand_id, "build");
  ensure(plan.status === "draft", "invalid_state", `This plan is ${plan.status}, so its matrix is fixed.`, "Start a new plan to change the matrix.", 409);
  const merged = { name: plan.name, budget_cents: plan.budget_cents, hooks: plan.hooks, bodies: plan.bodies, ctas: plan.ctas, ...input.changes };
  validate(merged);
  const tier = spendTierFor(merged.budget_cents);
  const cells = cellsFor(tx, merged, tier);
  return { plan: tx.patch("test_plans", plan.id, { name: merged.name.trim(), budget_cents: merged.budget_cents, hooks: merged.hooks, bodies: merged.bodies, ctas: merged.ctas, spend_tier: tier, cells, caution: caution(0, cells.length), updated_at: tx.now }) };
}

/** Assigns the plan's cells to bounties and offers of the same app. The plan starts running and every cell is briefed. */
export function assignTestPlan(tx: Tx, input: { plan_id: string; bounty_ids?: BountyId[]; offer_ids?: OfferId[] }): { plan: TestPlan } {
  const plan = tx.must("test_plans", input.plan_id, "Test plan");
  requireBrand(tx, plan.brand_id, "build");
  ensure(plan.status === "draft" || plan.status === "running", "invalid_state", `This plan is ${plan.status}.`, undefined, 409);
  const bounty_ids = [...new Set([...plan.bounty_ids, ...(input.bounty_ids ?? [])])];
  const offer_ids = [...new Set([...plan.offer_ids, ...(input.offer_ids ?? [])])];
  ensure(bounty_ids.length + offer_ids.length > 0, "nothing_assigned", "Pick at least one bounty or offer to run the cells on.", undefined, 422);
  for (const id of input.bounty_ids ?? []) ensure(tx.must("bounties", id, "Bounty").app_id === plan.app_id, "wrong_app", "That bounty belongs to another app.", undefined, 422);
  for (const id of input.offer_ids ?? []) ensure(tx.must("offers", id, "Offer").app_id === plan.app_id, "wrong_app", "That offer belongs to another app.", undefined, 422);
  const cells = plan.cells.map((c) => (c.status === "planned" ? { ...c, status: "briefed" as const } : c));
  return { plan: tx.patch("test_plans", plan.id, { status: "running", bounty_ids, offer_ids, cells, updated_at: tx.now }) };
}

/** Archives a plan (its results stay readable). */
export function archiveTestPlan(tx: Tx, input: { plan_id: string }): { plan: TestPlan } {
  const plan = tx.must("test_plans", input.plan_id, "Test plan");
  requireBrand(tx, plan.brand_id, "build");
  return { plan: plan.status === "archived" ? plan : tx.patch("test_plans", plan.id, { status: "archived", updated_at: tx.now }) };
}
