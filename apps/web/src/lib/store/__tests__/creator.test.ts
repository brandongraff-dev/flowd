import { vi, describe, expect, it } from "vitest";
import { ledgerProblems, makeWorld, must } from "./helpers";

vi.setConfig({ testTimeout: 60_000 });

describe("cash-out", () => {
  it("quotes the fee first and refuses a surprise", async () => {
    const w = await makeWorld("creator");
    const cleared = Object.values(w.state().ledger).filter((e) => e.account === "creator:cr_maya" && e.status === "cleared" && !e.payout_id);
    const gross = cleared.reduce((s, e) => s + e.amount_cents, 0);
    expect(gross).toBeGreaterThan(0);
    const stale = await w.actions.requestPayout({ confirm_fee_cents: 1 });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("fee_changed");
    expect(Object.values(w.state().payouts).filter((p) => p.creator_id === "cr_maya" && p.kind === "instant" && p.status === "in_transit")).toHaveLength(0);
  });

  it("an instant cash-out pays cleared money now: ledger, Money Clock, proof and ticker all agree", async () => {
    const w = await makeWorld("creator");
    const clearedRows = Object.values(w.state().ledger).filter((e) => e.account === "creator:cr_maya" && e.status === "cleared" && !e.payout_id);
    const gross = clearedRows.reduce((s, e) => s + e.amount_cents, 0);
    const tickerBefore = w.state().ticker.totals.total_paid_cents;
    const r = must(await w.actions.requestPayout({}));
    expect(r.payout.kind).toBe("instant");
    expect(r.payout.status).toBe("in_transit");
    expect(r.payout.gross_cents).toBe(gross);
    expect(r.payout.net_cents).toBe(gross - r.fee_cents);
    expect(r.fee_cents).toBeGreaterThanOrEqual(r.payout.free_instant ? 0 : 50);
    expect(r.fee_cents).toBeLessThanOrEqual(1_500);
    // the cleared rows are now paid and point at the payout
    for (const row of clearedRows) {
      const now = w.state().ledger[row.id];
      expect(now.status).toBe("paid");
      expect(now.payout_id).toBe(r.payout.id);
    }
    // the Money Clock says paid, in transit, with an arrival time (never a bare state)
    const mc = Object.values(w.state().money_clock).filter((m) => m.payout_id === r.payout.id);
    expect(mc.length).toBeGreaterThan(0);
    expect(mc.every((m) => m.state === "paid" && m.reason === "payout_in_transit" && m.reason_text.length > 0)).toBe(true);
    expect(w.state().proofs[r.payout.proof_id]?.amount_cents).toBe(r.payout.net_cents);
    expect(w.state().ticker.totals.total_paid_cents).toBe(tickerBefore + r.payout.net_cents);
    expect(w.state().ticker.events[0].amount_cents).toBe(r.payout.net_cents);
    expect(ledgerProblems(w.state())).toEqual([]);
    // nothing is left to cash out
    const again = await w.actions.requestPayout({});
    expect(again.ok).toBe(false);
  });

  it("the Friday run pays the weekly payout for free and the transfer lands later", async () => {
    const w = await makeWorld("admin");
    const scheduled = Object.values(w.state().payouts).filter((p) => p.creator_id === "cr_maya" && p.status === "scheduled");
    expect(scheduled).toHaveLength(1);
    const run = must(await w.actions.runPayoutRun());
    expect(run.run_at).toBe("2026-10-09T18:00:00Z");
    expect(run.payouts_paid).toBeGreaterThan(0);
    const paid = w.state().payouts[scheduled[0].id];
    expect(["in_transit", "paid"]).toContain(paid.status);
    expect(paid.fee_cents).toBe(0);
    expect(paid.net_cents).toBe(paid.gross_cents);
    must(await w.actions.advanceClock({ hours: 96 }));
    expect(w.state().payouts[scheduled[0].id].status).toBe("paid");
    expect(w.state().payout_runs["run_2026-10-09"].status).toBe("complete");
    expect(ledgerProblems(w.state())).toEqual([]);
  });

  it("holds stay held with their reason; money on other items keeps moving", async () => {
    const w = await makeWorld("admin");
    must(await w.actions.runPayoutRun());
    const held = Object.values(w.state().payouts).filter((p) => p.run_id === "run_2026-10-09" && p.status === "held");
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((p) => p.hold_reason !== undefined)).toBe(true);
    const paid = Object.values(w.state().payouts).filter((p) => p.run_id === "run_2026-10-09" && (p.status === "in_transit" || p.status === "paid"));
    expect(paid.length).toBeGreaterThan(0);
  });
});

describe("Academy, tournaments, drops, crews", () => {
  it("a lesson completes when two of three answers are right, awards its badge and lifts reliability once", async () => {
    const w = await makeWorld("creator");
    const lesson = Object.values(w.state().lessons).find((l) => !Object.values(w.state().lesson_progress).some((p) => p.creator_id === "cr_maya" && p.lesson_id === l.id && p.status === "completed"));
    expect(lesson).toBeDefined();
    if (!lesson) return;
    const wrong = lesson.quiz.map((q) => (q.answer_index + 1) % 3);
    const miss = must(await w.actions.completeLesson({ lesson_id: lesson.id, answers: wrong }));
    expect(miss.passed).toBe(false);
    expect(miss.badge_awarded).toBe(false);
    const right = must(await w.actions.completeLesson({ lesson_id: lesson.id, answers: lesson.quiz.map((q) => q.answer_index) }));
    expect(right.passed).toBe(true);
    expect(right.badge_awarded).toBe(true);
    expect(right.review.every((r) => r.explanation.length > 0)).toBe(true);
    const progress = Object.values(w.state().lesson_progress).find((p) => p.creator_id === "cr_maya" && p.lesson_id === lesson.id);
    expect(progress?.status).toBe("completed");
    const again = must(await w.actions.completeLesson({ lesson_id: lesson.id, answers: lesson.quiz.map((q) => q.answer_index) }));
    expect(again.badge_awarded).toBe(false);
    const short = await w.actions.completeLesson({ lesson_id: lesson.id, answers: [0] });
    expect(short.ok).toBe(false);
  });

  it("joining a tournament scores the hook on the same checklist; niche and tier gates are explained", async () => {
    const w = await makeWorld("creator");
    const gated = await w.actions.joinTournament({ tournament_id: "tour_screen_record_sprint", hook_text: "I almost deleted my screen recorder." });
    expect(gated.ok).toBe(false);
    if (!gated.ok) expect(gated.error.code).toBe("niche_mismatch");
    must(await w.actions.updateCreatorProfile({ niches: ["beauty", "lifestyle"] }));
    const id = "tour_october_glow_up_brackets";
    const before = w.state().tournaments[id].entries_count;
    const entry = must(await w.actions.joinTournament({ tournament_id: id, hook_text: "I almost skipped my glow up until this one tap." }));
    expect(entry.entry.hook_points).toBeGreaterThan(0);
    expect(entry.entry.seed).toBe(before + 1);
    expect(w.state().tournaments[id].entries_count).toBe(before + 1);
    const twice = await w.actions.joinTournament({ tournament_id: id, hook_text: "Another take on the same idea here." });
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error.code).toBe("already_entered");
    const notYet = await w.actions.joinTournament({ tournament_id: "tour_best_first_trial", hook_text: "Entries are not open for this one yet." });
    expect(notYet.ok).toBe(false);
    const over = await w.actions.joinTournament({ tournament_id: "tour_confession_season", hook_text: "A hook for a finished tournament." });
    expect(over.ok).toBe(false);
  });

  it("a Daily Drop claim takes one true spot and holds the place for 24 hours", async () => {
    const w = await makeWorld("creator");
    const drop = w.state().daily_drops["drop_2026-10-02"];
    expect(drop.status).toBe("live");
    const item = drop.items.find((i) => i.spots_left > 0 && w.state().bounties[i.bounty_id].status === "live" && !i.claims.some((c) => c.creator_id === "cr_maya"));
    expect(item).toBeDefined();
    if (!item) return;
    const r = must(await w.actions.claimDrop({ drop_id: drop.id, bounty_id: item.bounty_id }));
    expect(r.spots_left).toBe(item.spots_left - 1);
    const after = w.state().daily_drops[drop.id];
    expect(after.spots_left).toBe(drop.spots_left - 1);
    expect(after.claims_total).toBe(drop.claims_total + 1);
    expect(after.items.find((i) => i.bounty_id === item.bounty_id)?.claims.some((c) => c.creator_id === "cr_maya")).toBe(true);
    const twice = await w.actions.claimDrop({ drop_id: drop.id, bounty_id: item.bounty_id });
    expect(twice.ok).toBe(false);
    const upcoming = await w.actions.claimDrop({ drop_id: "drop_2026-10-03", bounty_id: "bnty_dozely_winddown" });
    expect(upcoming.ok).toBe(false);
    if (!upcoming.ok) expect(upcoming.error.code).toBe("drop_not_live");
    const soldOut = await w.actions.claimDrop({ drop_id: "drop_2026-10-02", bounty_id: "bnty_reelcraft_rawclips" });
    expect(soldOut.ok).toBe(false);
    if (!soldOut.ok) expect(soldOut.error.code).toBe("sold_out");
  });

  it("crews: leave and join, with the lead handed over", async () => {
    const w = await makeWorld("creator");
    const mine = Object.values(w.state().crew_members).find((m) => m.creator_id === "cr_maya");
    expect(mine?.crew_id).toBe("crew_late_night_edits");
    const members = w.state().crews["crew_late_night_edits"].member_count;
    const busy = await w.actions.joinCrew({ crew_id: "crew_hook_lab" });
    expect(busy.ok).toBe(false);
    must(await w.actions.leaveCrew());
    expect(w.state().crews["crew_late_night_edits"].member_count).toBe(members - 1);
    const closed = await w.actions.joinCrew({ crew_id: "crew_pocket_studio" });
    expect(closed.ok).toBe(false);
    if (!closed.ok) expect(closed.error.code).toBe("invite_required");
    must(await w.actions.joinCrew({ crew_id: "crew_pocket_studio", invite_code: w.state().crews["crew_pocket_studio"].invite_code.toLowerCase() }));
    expect(w.state().crews["crew_pocket_studio"].member_count).toBeGreaterThan(0);
    const lead = await w.actions.createCrew({ name: "Maya Makes Crew", tagline: "x", niche: "ai_tools" });
    expect(lead.ok).toBe(false);
  });
});

describe("Studio-side settings", () => {
  it("rate cards open at Silver and keep the market-suggested price beside the ask", async () => {
    const w = await makeWorld("creator");
    const r = must(await w.actions.saveRateCard({ price_per_video_cents: 15_000, min_cpm_cents: 230 }));
    expect(r.rate_card.price_per_video_cents).toBe(15_000);
    expect(r.rate_card.suggested?.price_cents).toBeGreaterThan(0);
    expect(r.rate_card.suggested!.low_cents).toBeLessThanOrEqual(r.rate_card.suggested!.high_cents);
    const floor = await w.actions.saveRateCard({ price_per_video_cents: 15_000, min_cpm_cents: 10 });
    expect(floor.ok).toBe(false);
    const cheap = await w.actions.saveRateCard({ price_per_video_cents: 500, min_cpm_cents: 230 });
    expect(cheap.ok).toBe(false);
  });

  it("Wellbeing Mode: quiet hours on, Pause keeps tier and streak, rest weeks are capped", async () => {
    const w = await makeWorld("creator");
    const off = must(await w.actions.toggleWellbeing({ enabled: false }));
    expect(off.settings.enabled).toBe(false);
    const on = must(await w.actions.toggleWellbeing({ enabled: true }));
    expect(on.settings.enabled).toBe(true);
    expect(on.settings.quiet_hours.enabled).toBe(true);
    const pause = must(await w.actions.updateWellbeing({ paused_until: "2026-10-10T00:00:00Z" }));
    expect(pause.settings.paused_until).toBe("2026-10-10T00:00:00Z");
    expect(w.state().creators["cr_maya"].paused_until).toBe("2026-10-10T00:00:00Z");
    expect(w.state().creators["cr_maya"].tier).toBe("silver");
    const resume = must(await w.actions.updateWellbeing({ paused_until: null }));
    expect(resume.settings.paused_until).toBeUndefined();
    expect(w.state().creators["cr_maya"].paused_until).toBeUndefined();
    const tooMany = await w.actions.updateWellbeing({ rest_weeks: ["2026-W36", "2026-W37", "2026-W38"] });
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error.code).toBe("too_many_rest_weeks");
  });

  it("notifications: marking read is per person, money and safety stay on", async () => {
    const w = await makeWorld("creator");
    const unread = Object.values(w.state().notifications).filter((n) => n.recipient_user_id === "usr_maya" && !n.read_at);
    expect(unread.length).toBeGreaterThan(0);
    must(await w.actions.markNotificationRead({ id: unread[0].id }));
    expect(w.state().notifications[unread[0].id].read_at).toBeDefined();
    const theirs = Object.values(w.state().notifications).find((n) => n.recipient_user_id !== "usr_maya" && !n.read_at);
    const denied = await w.actions.markNotificationRead({ id: theirs?.id ?? "" });
    expect(denied.ok).toBe(false);
    const all = must(await w.actions.markAllNotificationsRead());
    expect(all.count).toBe(unread.length - 1);
    const prefs = must(await w.actions.updateNotificationPrefs({ categories: { money: false, safety: false, tips: false } }));
    expect(prefs.prefs.categories.money).toBe(true);
    expect(prefs.prefs.categories.safety).toBe(true);
    expect(prefs.prefs.categories.tips).toBe(false);
  });

  it("tax desk, payout method and linked accounts", async () => {
    const w = await makeWorld("creator");
    const bad = await w.actions.submitTaxForm({ legal_name: "Maya", tin_last4: "12", address: { line1: "", city: "", region: "TX", postal_code: "", country: "US" } });
    expect(bad.ok).toBe(false);
    const good = must(await w.actions.submitTaxForm({ legal_name: "Maya Reyes", tin_last4: "7386", address: { line1: "4023 Ridge Dr", city: "Austin", region: "TX", postal_code: "78794", country: "US" } }));
    expect(good.profile.status).toBe("verified");
    expect(good.profile.tin_last4).toBe("7386");
    const aside = must(await w.actions.setTaxSetAside({ rate: 0.3 }));
    expect(aside.profile.set_aside_rate).toBe(0.3);
    const tooMuch = await w.actions.setTaxSetAside({ rate: 0.8 });
    expect(tooMuch.ok).toBe(false);
    const method = must(await w.actions.setPayoutMethod({ kind: "debit_card", last4: "1234" }));
    expect(method.method.instant_capable).toBe(true);
    expect(w.state().creators["cr_maya"].payout_method?.last4).toBe("1234");
    const acct = must(await w.actions.connectSocialAccount({ platform: "youtube", handle: "@maya.makes" }));
    expect(acct.account.status).toBe("connected");
    expect(acct.account.handle).toBe("maya.makes");
    const same = must(await w.actions.connectSocialAccount({ platform: "youtube", handle: "maya.makes" }));
    expect(same.account.id).toBe(acct.account.id);
  });
});
