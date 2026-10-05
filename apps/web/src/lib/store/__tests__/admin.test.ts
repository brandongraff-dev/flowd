import { vi, describe, expect, it } from "vitest";
import { escrowIdentityHolds, escrowStateOf } from "@/lib/engine";
import { ledgerProblems, makeWorld, must, walletFromLedger } from "./helpers";

vi.setConfig({ testTimeout: 60_000 });

describe("the fraud queue", () => {
  it("clearing a case releases the hold on that post only", async () => {
    const w = await makeWorld("admin");
    const flag = w.state().fraud_flags["flag_008"];
    expect(flag.status).toBe("open");
    const post = w.state().posts[flag.post_id];
    expect(post.status).toBe("held");
    const rows = Object.values(w.state().ledger).filter((e) => e.post_id === post.id && e.account === `creator:${post.creator_id}`);
    expect(rows.every((r) => r.status === "held")).toBe(true);
    const otherHeld = Object.values(w.state().ledger).filter((e) => e.status === "held" && e.post_id !== post.id).length;

    must(await w.actions.decideFraudFlag({ flag_id: flag.id, decision: "clear", note: "Traffic matches the creator's audience." }));
    expect(w.state().fraud_flags[flag.id].status).toBe("cleared");
    const after = w.state().posts[post.id];
    expect(after.status).not.toBe("held");
    expect(after.hold_reason).toBeUndefined();
    const rowsAfter = Object.values(w.state().ledger).filter((e) => e.post_id === post.id && e.account === `creator:${post.creator_id}`);
    expect(rowsAfter.every((r) => r.status === "pending" || r.status === "cleared")).toBe(true);
    expect(Object.values(w.state().ledger).filter((e) => e.status === "held" && e.post_id !== post.id).length).toBe(otherHeld);
    // the Money Clock row has a dated ETA again, never a bare state
    const mc = Object.values(w.state().money_clock).find((m) => m.post_id === post.id);
    expect(mc?.state === "pending" || mc?.state === "cleared").toBe(true);
    expect(mc?.reason_text.length).toBeGreaterThan(5);
    const told = Object.values(w.state().notifications).some((n) => n.recipient_user_id === w.state().creators[post.creator_id].user_id && n.ref_id === post.id);
    expect(told).toBe(true);
  });

  it("confirming claws back only the invalid share, in a new transaction that references the original", async () => {
    const w = await makeWorld("admin");
    const flag = w.state().fraud_flags["flag_009"];
    const post = w.state().posts[flag.post_id];
    const originalRow = Object.values(w.state().ledger).find((e) => e.post_id === post.id && e.account === `creator:${post.creator_id}` && e.entry_type === "cpm");
    expect(originalRow).toBeDefined();
    const r = must(await w.actions.decideFraudFlag({ flag_id: flag.id, decision: "confirm", note: "Bought views: new accounts, one source." }));
    expect(r.flag.status).toBe("confirmed");
    expect(r.flag.invalid_views).toBeGreaterThan(0);
    expect(r.flag.invalid_views).toBeLessThanOrEqual(post.window_views);
    expect(r.clawed_cents).toBeGreaterThan(0);
    expect(r.clawed_cents).toBeLessThanOrEqual(post.earnings.total_cents);
    const claw = Object.values(w.state().ledger).filter((e) => e.reverses_txn_id === originalRow?.txn_id);
    expect(claw.length).toBeGreaterThan(0);
    expect(w.state().posts[post.id].status).toBe("clawed_back");
    expect(w.state().posts[post.id].views_invalid).toBe(r.flag.invalid_views);
    expect(ledgerProblems(w.state())).toEqual([]);
    // the brand's guarded rules pause until a person looks
    const rules = Object.values(w.state().auto_approve_rules).filter((x) => x.brand_id === flag.brand_id);
    expect(rules.every((x) => x.status !== "active")).toBe(true);
    const again = await w.actions.decideFraudFlag({ flag_id: flag.id, decision: "clear" });
    expect(again.ok).toBe(false);
  });

  it("only Ops can decide", async () => {
    const w = await makeWorld("brand");
    const r = await w.actions.decideFraudFlag({ flag_id: "flag_008", decision: "clear" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("forbidden");
  });
});

describe("disputes", () => {
  it("one tap from a post: only that post is held, and withdrawing releases it", async () => {
    const w = await makeWorld("creator");
    const clearedBefore = w.state().posts["post_0384"].status;
    const post = w.state().posts["post_0388"];
    const need = await w.actions.disputePost({ post_id: post.id, reason: "Views look low", note: "short" });
    expect(need.ok).toBe(false);
    const d = must(await w.actions.disputePost({ post_id: post.id, kind: "view_count", reason: "Views look lower than the platform shows", note: "The platform shows 14,200 views at 72 hours; the ledger says fewer." }));
    expect(d.dispute.status).toBe("open");
    expect(d.dispute.amount_in_dispute_cents).toBe(post.earnings.total_cents);
    expect(d.dispute.evidence.length).toBeGreaterThan(0);
    expect(w.state().posts[post.id].status).toBe("held");
    expect(w.state().posts[post.id].hold_reason).toBe("dispute_open");
    expect(w.state().posts["post_0384"].status).toBe(clearedBefore);
    const dupe = await w.actions.disputePost({ post_id: post.id, reason: "Views look lower", note: "Opening a second one by mistake." });
    expect(dupe.ok).toBe(false);
    if (!dupe.ok) expect(dupe.error.code).toBe("already_open");
    must(await w.actions.withdrawDispute({ dispute_id: d.dispute.id }));
    expect(w.state().disputes[d.dispute.id].status).toBe("withdrawn");
    expect(w.state().posts[post.id].status).not.toBe("held");
  });

  it("Ops reviews, asks for evidence and resolves: an upheld view dispute can add a flowd-funded adjustment", async () => {
    const w = await makeWorld("creator");
    const d = must(await w.actions.disputePost({ post_id: "post_0388", reason: "Views look lower", note: "The platform shows more views than the ledger counted." }));
    w.as("admin");
    const review = must(await w.actions.startDisputeReview({ dispute_id: d.dispute.id }));
    expect(review.dispute.status).toBe("under_review");
    const unresolved = await w.actions.resolveDispute({ dispute_id: d.dispute.id, outcome: "upheld", outcome_text: "short" });
    expect(unresolved.ok).toBe(false);
    must(await w.actions.resolveDispute({ dispute_id: d.dispute.id, outcome: "partially_upheld", outcome_text: "Some views were counted late; we added the difference.", adjustment_cents: 500 }));
    const done = w.state().disputes[d.dispute.id];
    expect(done.status).toBe("resolved");
    expect(done.adjustment_cents).toBe(500);
    expect(w.state().posts["post_0388"].status).not.toBe("held");
    const bonus = Object.values(w.state().ledger).find((e) => e.entry_type === "bonus" && e.account === "creator:cr_maya" && e.amount_cents === 500);
    expect(bonus?.status).toBe("pending");
    expect(ledgerProblems(w.state())).toEqual([]);
  });

  it("asking for evidence waits for the other side; a reply reopens it", async () => {
    const w = await makeWorld("admin");
    const open = w.state().disputes["disp_015"];
    expect(open.status).toBe("open");
    must(await w.actions.requestDisputeEvidence({ dispute_id: open.id, text: "Please send the platform analytics screenshot for hours 0 to 24." }));
    expect(w.state().disputes[open.id].status).toBe("evidence_requested");
    expect(w.state().disputes[open.id].first_reply_at).toBeDefined();
    const text = must(await w.actions.replyToDispute({ dispute_id: open.id, text: "Looking at the snapshots now." }));
    expect(text.dispute.events.at(-1)?.actor).toBe("admin");
  });
});

describe("verification, safety and tiers", () => {
  it("approving verifies the creator and re-checks their payout holds; rejecting needs a reason", async () => {
    const w = await makeWorld("admin");
    const v = w.state().verifications["ver_028"];
    expect(v.status).toBe("pending");
    const noReason = await w.actions.decideVerification({ verification_id: v.id, decision: "reject" });
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.error.code).toBe("reason_required");
    must(await w.actions.decideVerification({ verification_id: v.id, decision: "approve" }));
    expect(w.state().verifications[v.id].status).toBe("verified");
    expect(w.state().creators[v.creator_id as string].verification_status).toBe("verified");
    const again = await w.actions.decideVerification({ verification_id: v.id, decision: "approve" });
    expect(again.ok).toBe(false);
  });

  it("a scam report gets a case id and a 24-hour triage SLA, then moves through the allowed steps only", async () => {
    const w = await makeWorld("creator");
    const short = await w.actions.reportScam({ target_kind: "brand", target_id: "br_x", reason: "pay_to_join", description: "no" });
    expect(short.ok).toBe(false);
    const r = must(await w.actions.reportScam({ target_kind: "brand", target_id: "br_nestly", reason: "pay_to_join", description: "They asked me to pay a $20 onboarding fee to join." }));
    expect(r.report.case_id).toMatch(/^SR-2026-\d{4}$/);
    expect(r.report.status).toBe("new");
    expect(new Date(r.report.sla_due_at).getTime() - new Date(r.report.created_at).getTime()).toBe(24 * 3_600_000);
    expect(Object.values(w.state().notifications).some((n) => n.ref_id === r.report.id && n.audience === "admin")).toBe(true);
    w.as("admin");
    const skip = await w.actions.decideScamReport({ report_id: r.report.id, decision: "confirm" });
    expect(skip.ok).toBe(false);
    must(await w.actions.decideScamReport({ report_id: r.report.id, decision: "triage" }));
    must(await w.actions.decideScamReport({ report_id: r.report.id, decision: "confirm" }));
    const noAction = await w.actions.decideScamReport({ report_id: r.report.id, decision: "action" });
    expect(noAction.ok).toBe(false);
    must(await w.actions.decideScamReport({ report_id: r.report.id, decision: "action", action_taken: "Brand suspended, bounty removed." }));
    expect(w.state().scam_reports[r.report.id].status).toBe("actioned");
    expect(w.state().scam_reports[r.report.id].resolved_at).toBeDefined();
  });

  it("a tier override is logged with its reason and the creator is told", async () => {
    const w = await makeWorld("admin");
    const hist = Object.values(w.state().tier_history).length;
    const noReason = await w.actions.overrideTier({ creator_id: "cr_maya", tier: "gold", reason: "ok" });
    expect(noReason.ok).toBe(false);
    must(await w.actions.overrideTier({ creator_id: "cr_maya", tier: "gold", reason: "Founding creator review: consistent quality." }));
    expect(w.state().creators["cr_maya"].tier).toBe("gold");
    expect(Object.values(w.state().tier_history).length).toBe(hist + 1);
    const same = await w.actions.overrideTier({ creator_id: "cr_maya", tier: "gold", reason: "Same tier again for the test." });
    expect(same.ok).toBe(false);
    expect(Object.values(w.state().notifications).some((n) => n.recipient_user_id === "usr_maya" && n.kind === "tier_up")).toBe(true);
  });
});

describe("Ops registry actions", () => {
  it("a creator on hold can read but not act; restore brings them back", async () => {
    const w = await makeWorld("admin");
    must(await w.actions.setCreatorStanding({ creator_id: "cr_maya", action: "hold", reason: "Verification mismatch under review." }));
    expect(w.state().users["usr_maya"].status).toBe("suspended");
    w.as("creator");
    const blocked = await w.actions.saveBounty({ bounty_id: "bnty_stridely_plantopr", saved: true });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("account_on_hold");
    w.as("admin");
    const noReason = await w.actions.setCreatorStanding({ creator_id: "cr_maya", action: "restore", reason: "ok" });
    expect(noReason.ok).toBe(false);
    must(await w.actions.setCreatorStanding({ creator_id: "cr_maya", action: "restore", reason: "Verification confirmed, all clear." }));
    expect(w.state().users["usr_maya"].status).toBe("active");
  });

  it("a ban withdraws open submissions and returns their reservations", async () => {
    const w = await makeWorld("admin");
    const open = Object.values(w.state().submissions).filter((s) => s.creator_id === "cr_maya" && ["in_review", "changes_requested", "approved"].includes(s.status));
    expect(open.length).toBeGreaterThan(0);
    const r = must(await w.actions.setCreatorStanding({ creator_id: "cr_maya", action: "ban", reason: "Repeated originality violations." }));
    expect(r.withdrawn).toBe(open.length);
    for (const s of open) {
      expect(w.state().submissions[s.id].status).toBe("withdrawn");
      expect(escrowIdentityHolds(escrowStateOf(w.state().bounties[s.bounty_id]))).toBe(true);
    }
    expect(ledgerProblems(w.state())).toEqual([]);
  });

  it("suspending a brand pauses its live bounties", async () => {
    const w = await makeWorld("admin");
    const live = Object.values(w.state().bounties).filter((b) => b.brand_id === "br_lumi" && (b.status === "live" || b.status === "filled")).length;
    const r = must(await w.actions.setBrandStanding({ brand_id: "br_lumi", action: "suspend", reason: "Chargeback dispute on the card." }));
    expect(r.paused_bounties).toBe(live);
    w.as("brand");
    const denied = await w.actions.pauseBounty({ bounty_id: "bnty_lumi_glowup" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("account_on_hold");
    w.as("admin");
    must(await w.actions.setBrandStanding({ brand_id: "br_lumi", action: "restore", reason: "Chargeback withdrawn by the bank." }));
    w.as("brand");
    const ok = await w.actions.fundWallet({ amount_cents: 10_000 });
    expect(ok.ok).toBe(true);
  });

  it("holding a bounty pauses it and tells the brand; a lint override is logged and stops blocking", async () => {
    const w = await makeWorld("brand");
    const draft = must(await w.actions.createBounty({ app_id: "app_lumi", title: "Needs an override", budget_cents: 50_000, brief: { summary: "Creators must hit 100k views to get paid." } }));
    expect(draft.lint.can_publish).toBe(false);
    const blocker = draft.lint.findings.find((f) => f.severity === "blocker");
    expect(blocker).toBeDefined();
    w.as("admin");
    must(await w.actions.overrideBriefLint({ bounty_id: draft.bounty.id, code: blocker!.code, reason: "Wording is a bonus tier, confirmed with the brand." }));
    const b = w.state().bounties[draft.bounty.id];
    expect(b.lint_overrides?.[0].code).toBe(blocker!.code);
    const twice = await w.actions.overrideBriefLint({ bounty_id: draft.bounty.id, code: blocker!.code, reason: "Overriding the same finding again." });
    expect(twice.ok).toBe(false);
    must(await w.actions.adminHoldBounty({ bounty_id: "bnty_lumi_glowup", reason: "Disclosure wording complaint under review." }));
    expect(w.state().bounties["bnty_lumi_glowup"].status).toBe("paused");
    must(await w.actions.adminReleaseBounty({ bounty_id: "bnty_lumi_glowup" }));
    expect(w.state().bounties["bnty_lumi_glowup"].status).toBe("live");
    // every Ops action leaves an audit line
    expect(Object.values(w.state().notifications).filter((n) => n.ref_kind === "audit").length).toBeGreaterThanOrEqual(3);
  });

  it("the SLA desk: nudge, approve-if-clean and reassign", async () => {
    const w = await makeWorld("admin");
    const waiting = Object.values(w.state().submissions).filter((s) => s.brand_id === "br_lumi" && s.status === "in_review");
    const clean = waiting.find((s) => s.versions[s.version - 1].qa_fail === 0 && s.versions[s.version - 1].qa_warn === 0);
    const dirty = waiting.find((s) => s.versions[s.version - 1].qa_fail > 0 || s.versions[s.version - 1].qa_warn > 0);
    must(await w.actions.slaNudge({ submission_id: waiting[0].id }));
    if (dirty) {
      const refused = await w.actions.slaApproveIfClean({ submission_id: dirty.id });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.code).toBe("not_clean");
    }
    if (clean) {
      must(await w.actions.slaApproveIfClean({ submission_id: clean.id }));
      expect(w.state().submissions[clean.id].status).toBe("approved");
      expect(w.state().submissions[clean.id].decision?.action).toBe("timeout_approve");
    }
    const owner = Object.values(w.state().brand_members).find((m) => m.brand_id === "br_lumi" && m.role === "reviewer");
    if (owner) must(await w.actions.reassignBountyOwner({ bounty_id: "bnty_lumi_glowup", member_id: owner.id }));
    const stranger = Object.values(w.state().brand_members).find((m) => m.brand_id !== "br_lumi");
    const wrong = await w.actions.reassignBountyOwner({ bounty_id: "bnty_lumi_glowup", member_id: stranger?.id ?? "" });
    expect(wrong.ok).toBe(false);
  });

  it("a held payout can be nudged; a failed one is rescheduled or explained", async () => {
    const w = await makeWorld("admin");
    must(await w.actions.nudgePayoutHold({ payout_id: "pay_0167" }));
    const notScheduled = await w.actions.nudgePayoutHold({ payout_id: "pay_0268" });
    expect(notScheduled.ok).toBe(false);
    const retry = await w.actions.retryFailedPayout({ payout_id: "pay_0316" });
    if (retry.ok) {
      expect(w.state().payouts["pay_0316"].status).toBe("cancelled");
      expect(["scheduled", "held"]).toContain(retry.data.scheduled.status);
    } else {
      expect(retry.error.code).toBe("nothing_to_retry");
      expect(w.state().payouts["pay_0316"].status).toBe("failed");
    }
    const notFailed = await w.actions.retryFailedPayout({ payout_id: "pay_0167" });
    expect(notFailed.ok).toBe(false);
  });
});

describe("the demo clock", () => {
  it("only Ops moves it, only forward, and the control tower follows", async () => {
    const w = await makeWorld("brand");
    const denied = await w.actions.advanceClock({ hours: 24 });
    expect(denied.ok).toBe(false);
    w.as("admin");
    expect((await w.actions.advanceClock({ hours: 0 })).ok).toBe(false);
    expect((await w.actions.advanceClock({ hours: 24 * 90 })).ok).toBe(false);
    const t = must(await w.actions.advanceClock({ hours: 24 }));
    expect(t.hours).toBe(24);
    expect(w.state().clock.now).toBe("2026-10-04T14:00:00Z");
    expect(w.state().clock.advanced_hours).toBe(24);
    expect(w.state().admin_metrics.as_of).toBe("2026-10-04T14:00:00Z");
    expect(t.clearing_runs).toBe(1);
    const back = await w.actions.advanceClockTo({ to: "2026-10-03T00:00:00Z" });
    expect(back.ok).toBe(false);
    expect(ledgerProblems(w.state())).toEqual([]);
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(w.state().brands["br_lumi"].wallet_balance_cents);
  });

  it("a review that waits past 72 hours is escalated, and the queue counts follow", async () => {
    const w = await makeWorld("admin");
    const before = w.state().admin_metrics.queues.sla_breached;
    must(await w.actions.advanceClock({ hours: 72 }));
    const breached = Object.values(w.state().submissions).filter((s) => s.status === "in_review" && s.sla_state === "breached").length;
    expect(breached).toBeGreaterThanOrEqual(before);
    expect(w.state().admin_metrics.queues.sla_breached).toBe(breached);
    expect(Object.values(w.state().notifications).some((n) => n.kind === "review_sla_warning" && n.created_at > "2026-10-03T14:00:00Z")).toBe(true);
    expect(ledgerProblems(w.state())).toEqual([]);
  });
});
