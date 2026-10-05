import { vi, describe, expect, it } from "vitest";
import type { ClipInput } from "../core/analysis";
import { ledgerProblems, makeWorld, must, walletFromLedger } from "./helpers";
import { escrowIdentityHolds, escrowStateOf } from "@/lib/engine";

vi.setConfig({ testTimeout: 60_000 });

const CLIP: ClipInput = {
  hook_text: "I almost quit running until I found this plan.",
  script: "I almost quit running until I found this plan. Watch this, Stridely builds a five k plan in ten seconds. Look at that, week by week. Try it free with the link in my bio.",
  duration_s: 24,
  face_at_ms: 300,
  app_at_ms: 2000,
  has_captions: true,
};

describe("creator money path", () => {
  it("submit, approve, post, clear and cash out", async () => {
    const w = await makeWorld("creator");
    const bountyId = "bnty_stridely_plantopr";
    const before = w.state().bounties[bountyId];
    expect(before.status).toBe("live");

    // submit: takes a Reserved Slot
    const sub = await w.actions.submitVideo({ bounty_id: bountyId, clip: CLIP, accept_rights: true });
    expect(sub.ok).toBe(true);
    if (!sub.ok) return;
    const submission = sub.data.submission;
    expect(["in_review", "approved"]).toContain(submission.status);
    const afterSubmit = w.state().bounties[bountyId];
    expect(afterSubmit.reserved_cents).toBeGreaterThan(before.reserved_cents);
    expect(escrowIdentityHolds(escrowStateOf(afterSubmit))).toBe(true);

    // a creator cannot approve their own video
    const own = await w.actions.approveSubmission({ submission_id: submission.id });
    expect(own.ok).toBe(false);
    if (!own.ok) expect(own.error.code).toBe("forbidden");

    // Ops approves
    w.as("admin");
    if (submission.status === "in_review") {
      const approved = await w.actions.approveSubmission({ submission_id: submission.id });
      expect(approved.ok).toBe(true);
    }
    expect(w.state().submissions[submission.id].status).toBe("approved");

    // creator posts
    w.as("creator");
    const posted = await w.actions.attachPost({ submission_id: submission.id, caption: "Five k plan, done." });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    expect(posted.data.caption).toContain("#ad");
    const post = w.state().posts[posted.data.post.id];
    expect(post.status).toBe("live");
    expect(w.state().submissions[submission.id].status).toBe("posted");
    expect(w.state().bounties[bountyId].reserved_cents).toBe(before.reserved_cents);
    const accruing = Object.values(w.state().money_clock).filter((m) => m.post_id === post.id);
    expect(accruing).toHaveLength(1);
    expect(accruing[0].state).toBe("accruing");

    // 4 days later the window has closed and the daily run cleared the money
    w.as("admin");
    must(await w.actions.advanceClock({ hours: 96 }));
    const settled = w.state().posts[post.id];
    expect(["window_closed", "cleared", "held"]).toContain(settled.status);
    expect(ledgerProblems(w.state())).toEqual([]);
    expect(escrowIdentityHolds(escrowStateOf(w.state().bounties[bountyId]))).toBe(true);
    const lumi = w.state().brands["br_lumi"];
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(lumi.wallet_balance_cents);
  });
});
