import { vi, describe, expect, it } from "vitest";
import { makeWorld } from "@/lib/store/__tests__/helpers";
import { createEmptyState } from "@/lib/store/state";
import { selectBounties, selectBounty, selectBountyCounts, selectBountyPreview } from "../selectors/bounties";
import { selectMe } from "../selectors/identity";
import { selectCreatorWallet, selectInstantPreview, selectMoneyClock, selectPayouts, selectTaxDesk, selectWalletChip } from "../selectors/money";
import { selectPost, selectPosts } from "../selectors/posts";

vi.setConfig({ testTimeout: 60_000 });

describe("empty world", () => {
  it("every selector is total: empty lists and undefined, never a throw", () => {
    const db = createEmptyState();
    expect(selectMe(db)).toMatchObject({ signedIn: false, apps: [] });
    expect(selectBounties(db, {})).toEqual([]);
    expect(selectBounty(db, "nope")).toBeUndefined();
    expect(selectBountyCounts(db, undefined).all).toBe(0);
    expect(selectBountyPreview(db, undefined)).toBeNull();
    expect(selectPosts(db, {})).toEqual([]);
    expect(selectPost(db, "x")).toBeUndefined();
    expect(selectMoneyClock(db, undefined)).toEqual([]);
    expect(selectPayouts(db, undefined)).toEqual([]);
    expect(selectCreatorWallet(db, undefined).rows).toEqual([]);
    expect(selectInstantPreview(db, undefined)).toBeNull();
    expect(selectTaxDesk(db, undefined)).toBeNull();
    expect(selectWalletChip(db, undefined).cleared_cents).toBe(0);
  });
});

describe("identity", () => {
  it("resolves the persona's rows", async () => {
    const w = await makeWorld("brand");
    const me = selectMe(w.state());
    expect(me.persona).toBe("brand");
    expect(me.brand?.id).toBe("br_lumi");
    expect(me.member?.id).toBe("bm_lumi_jordan");
    expect(me.app?.id).toBe("app_lumi");
    expect(me.workspaces.map((b) => b.id)).toContain("br_lumi");
    expect(me.user?.display_name).toBe("Jordan Ellis");
    w.as("creator");
    expect(selectMe(w.state()).creator?.handle).toBe("maya.makes");
    w.as(null);
    expect(selectMe(w.state()).signedIn).toBe(false);
  });
});

describe("bounties", () => {
  it("filters, sorts and resolves joins", async () => {
    const w = await makeWorld("brand");
    const db = w.state();
    const mine = selectBounties(db, { brand: "mine" });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((b) => b.brand_id === "br_lumi" && b.app.brand_id === "br_lumi" && b.brand.id === "br_lumi")).toBe(true);
    const live = selectBounties(db, { brand: "mine", status: "live" });
    expect(live.every((b) => b.status === "live")).toBe(true);
    const open = selectBounties(db, { status: "open" });
    expect(open.every((b) => b.is_open && b.funded)).toBe(true);
    const search = selectBounties(db, { q: "lumi headshots" });
    expect(search.length).toBeGreaterThan(0);
    expect(selectBounties(db, { type: ["cpa", "install_only"] }).every((b) => b.type === "cpa" || b.type === "install_only")).toBe(true);
    const byBudget = selectBounties(db, { sort: "budget" });
    expect(byBudget[0].budget_cents).toBeGreaterThanOrEqual(byBudget[1].budget_cents);
    expect(selectBounties(db, { limit: 3 })).toHaveLength(3);
    // stable identity while nothing changed
    expect(selectBounties(db, { brand: "mine" })[0]).toBe(selectBounties(db, { brand: "mine" })[0]);
  });

  it("derives spots, fill and the review promise", async () => {
    const w = await makeWorld("brand");
    const b = selectBounty(w.state(), "bnty_lumi_glowup");
    expect(b).toBeDefined();
    if (!b) return;
    expect(b.spots_left).toBe(Math.floor(b.remaining_cents / b.unit_cents));
    expect(b.fill_ratio).toBeGreaterThan(0);
    expect(b.fill_ratio).toBeLessThanOrEqual(1);
    expect(b.budget_left_cents).toBe(b.remaining_cents);
    expect(b.is_open).toBe(true);
    expect(b.type_label).toBeTruthy();
    expect(b.owner?.name).toBeTruthy();
    const counts = selectBountyCounts(w.state(), { brand: "mine" });
    expect(counts.all).toBe(selectBounties(w.state(), { brand: "mine" }).length);
    expect(counts.live + counts.draft + counts.awaiting_funding + counts.scheduled + counts.paused + counts.filled + counts.ended + counts.settled + counts.cancelled).toBe(counts.all);
  });

  it("stays stable when an unrelated row changes and updates when its own row does", async () => {
    const w = await makeWorld("brand");
    const before = selectBounty(w.state(), "bnty_lumi_glowup");
    await w.actions.markNotificationRead({ id: Object.values(w.state().notifications).find((n) => n.recipient_user_id === "usr_jordan" && !n.read_at)?.id ?? "" });
    expect(selectBounty(w.state(), "bnty_lumi_glowup")).toBe(before);
    await w.actions.pauseBounty({ bounty_id: "bnty_lumi_glowup" });
    const after = selectBounty(w.state(), "bnty_lumi_glowup");
    expect(after).not.toBe(before);
    expect(after?.status).toBe("paused");
    expect(after?.is_open).toBe(false);
  });

  it("previews the builder exactly as a save would price it", async () => {
    const w = await makeWorld("brand");
    const preview = selectBountyPreview(w.state(), { app_id: "app_lumi", title: "Preview me", budget_cents: 100_000 });
    expect(preview).not.toBeNull();
    if (!preview) return;
    expect(preview.lint.can_publish).toBe(true);
    expect(preview.funding.brand_funded_cents).toBe(100_000 + preview.bounty.fee_reserve_cents);
    expect(preview.wallet.shortfall_cents).toBe(0);
    const big = selectBountyPreview(w.state(), { app_id: "app_lumi", title: "Preview me", budget_cents: 5_000_000 });
    expect(big?.wallet.shortfall_cents).toBeGreaterThan(0);
    expect(big?.wallet.card_charge_for_shortfall_cents).toBeGreaterThan(big?.wallet.shortfall_cents ?? 0);
    expect(selectBountyPreview(w.state(), { app_id: "app_nope", title: "x", budget_cents: 1 })).toBeNull();
    // the preview is what the action saves
    const saved = await w.actions.createBounty({ app_id: "app_lumi", title: "Preview me", budget_cents: 100_000 });
    expect(saved.ok && saved.data.funding.brand_funded_cents).toBe(preview.funding.brand_funded_cents);
  });
});

describe("posts and money", () => {
  it("a post carries its window, Money Clock rows and a dated sentence", async () => {
    const w = await makeWorld("creator");
    const live = selectPosts(w.state(), { creator: "mine", status: "live" });
    expect(live.length).toBeGreaterThan(0);
    for (const p of live) {
      expect(p.window.is_open).toBe(true);
      expect(p.window.hours_left).toBeGreaterThan(0);
      expect(p.creator.id).toBe("cr_maya");
      expect(p.money?.reason_text.length).toBeGreaterThan(5);
      expect(p.timeline[0].done).toBe(true);
      expect(p.cap.ratio).toBeGreaterThanOrEqual(0);
      expect(p.cap.ratio).toBeLessThanOrEqual(1);
    }
    const one = selectPost(w.state(), live[0].id);
    expect(one?.id).toBe(live[0].id);
    expect(selectPosts(w.state(), { creator: "mine", sort: "earnings" })[0].earnings.total_cents).toBeGreaterThanOrEqual(selectPosts(w.state(), { creator: "mine", sort: "earnings" })[1].earnings.total_cents);
  });

  it("the wallet keeps pending and cleared apart and agrees with the ledger", async () => {
    const w = await makeWorld("creator");
    const wallet = selectCreatorWallet(w.state(), undefined);
    expect(wallet.creator?.id).toBe("cr_maya");
    expect(wallet.summary.cleared_cents).toBe(wallet.ledger.cleared_cents);
    // pending includes conversions still in their clearing window, which are not on the ledger yet
    expect(wallet.summary.pending_cents).toBeGreaterThanOrEqual(wallet.ledger.pending_cents);
    expect(wallet.summary.held_cents).toBe(wallet.ledger.held_cents);
    expect(wallet.summary.paid_cents).toBeGreaterThan(0);
    expect(wallet.rows.length).toBeGreaterThan(10);
    // never a bare "pending": every non-final row has a dated reason
    for (const r of wallet.rows) {
      expect(r.description.reason_text.length).toBeGreaterThan(3);
      if (r.state === "pending" || r.state === "accruing" || r.state === "cleared") expect(r.eta_at).toBeDefined();
    }
    expect(wallet.next_payout?.at).toBe("2026-10-09T18:00:00Z");
    expect(wallet.next_payout?.amount_cents).toBeGreaterThan(0);
    expect(wallet.series).toHaveLength(30);
    expect(wallet.series.reduce((s, d) => s + d.earned_cents, 0)).toBeGreaterThan(0);
    expect(wallet.calendar.days.length).toBeGreaterThan(0);
    expect(wallet.instant?.gross_cents).toBe(wallet.summary.cleared_cents);
    expect(wallet.tax?.ytd_cleared_cents).toBeGreaterThan(0);
    expect(wallet.payouts.length).toBeGreaterThan(5);
    expect(wallet.hold).toBeNull();
    // the paid rows in transit say when they land
    const transit = wallet.rows.find((r) => r.reason === "payout_in_transit");
    if (transit) expect(transit.description.eta_label).toMatch(/^Arrives /);
  });

  it("the instant preview matches what the action charges", async () => {
    const w = await makeWorld("creator");
    const preview = selectInstantPreview(w.state(), undefined);
    expect(preview?.can_confirm).toBe(true);
    const r = await w.actions.requestPayout({ confirm_fee_cents: preview?.fee_cents });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.fee_cents).toBe(preview?.fee_cents);
      expect(r.data.net_cents).toBe(preview?.net_cents);
    }
    expect(selectInstantPreview(w.state(), undefined)?.can_confirm).toBe(false);
  });

  it("the tax desk reports year to date, the threshold and a CSV", async () => {
    const w = await makeWorld("creator");
    const desk = selectTaxDesk(w.state(), undefined);
    expect(desk?.threshold_cents).toBe(200_000);
    expect(desk?.progress_to_threshold).toBeGreaterThan(0);
    expect(desk?.set_aside_cents).toBeGreaterThan(0);
    expect(desk?.csv_rows.length).toBeGreaterThan(0);
    expect(desk?.next_step).toBeNull();
    expect(desk?.disclaimer.toLowerCase()).toContain("not tax advice");
  });
});
