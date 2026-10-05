import { vi, describe, expect, it } from "vitest";
import type { ClipInput } from "../core/analysis";
import { escrowIdentityHolds, escrowStateOf } from "@/lib/engine";
import { ledgerProblems, makeWorld, must, walletFromLedger, type TestWorld } from "./helpers";

vi.setConfig({ testTimeout: 60_000 });

const clip = (n: number): ClipInput => ({
  hook_text: `Take ${n}: I stopped scrolling when I saw this edit.`,
  script: `Take ${n}: I stopped scrolling when I saw this edit. Lumi fixes a bad photo in one tap, watch this. Look at the before and after, it is wild. Try Lumi free for seven days, link in my bio.`,
  duration_s: 22 + n,
  face_at_ms: 300,
  app_at_ms: 1800,
  has_captions: true,
});

const queue = (w: TestWorld) => Object.values(w.state().submissions).filter((s) => s.brand_id === "br_lumi" && s.status === "in_review");

describe("No-Rug Approvals", () => {
  it("approve issues the tracking link and code, tells the creator and keeps the Reserved Slot until posted", async () => {
    const w = await makeWorld("brand");
    const target = queue(w)[0];
    expect(target).toBeDefined();
    const bountyBefore = w.state().bounties[target.bounty_id];
    const r = must(await w.actions.approveSubmission({ submission_id: target.id }));
    const s = w.state().submissions[target.id];
    expect(s.status).toBe("approved");
    expect(s.decision?.action).toBe("approve");
    expect(s.link_id).toBeDefined();
    expect(r.link_url).toMatch(/^joinflowd\.io\/r\//);
    expect(w.state().attribution_links[s.link_id as string].creator_id).toBe(target.creator_id);
    // the reservation stays on the pool until the post is attached
    expect(w.state().bounties[target.bounty_id].reserved_cents).toBe(bountyBefore.reserved_cents);
    const creatorUser = w.state().creators[target.creator_id].user_id;
    const told = Object.values(w.state().notifications).filter((n) => n.recipient_user_id === creatorUser && n.ref_id === target.id && n.kind === "approval");
    expect(told.length).toBeGreaterThan(0);
    const logged = Object.values(w.state().activity_log).filter((a) => a.target_id === target.id && a.action === "submission_approved");
    expect(logged.length).toBeGreaterThan(0);
    // approving twice is refused, not repeated
    const again = await w.actions.approveSubmission({ submission_id: target.id });
    expect(again.ok).toBe(false);
  });

  it("a brand cannot decide another brand's video, and a creator cannot decide any", async () => {
    const w = await makeWorld("brand");
    const other = Object.values(w.state().submissions).find((s) => s.brand_id !== "br_lumi" && s.status === "in_review");
    expect(other).toBeDefined();
    const denied = await w.actions.approveSubmission({ submission_id: other?.id ?? "" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("forbidden");
    w.as("creator");
    const mine = await w.actions.approveSubmission({ submission_id: queue(w)[0]?.id ?? "" });
    expect(mine.ok).toBe(false);
    w.as(null);
    const anon = await w.actions.approveSubmission({ submission_id: queue(w)[0]?.id ?? "" });
    expect(anon.ok).toBe(false);
    if (!anon.ok) expect(anon.error.code).toBe("unauthenticated");
  });

  it("rejecting needs a reason code and evidence, then returns the reservation to the pool", async () => {
    const w = await makeWorld("brand");
    const target = queue(w)[1];
    const bounty = w.state().bounties[target.bounty_id];
    const noReason = await w.actions.rejectSubmission({ submission_id: target.id });
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.error.code).toBe("reason_required");
    const noEvidence = await w.actions.rejectSubmission({ submission_id: target.id, reason_code: "missing_disclosure" });
    expect(noEvidence.ok).toBe(false);
    if (!noEvidence.ok) expect(noEvidence.error.code).toBe("evidence_required");
    const adminCode = await w.actions.rejectSubmission({ submission_id: target.id, reason_code: "suspected_fraud", evidence: { kind: "qa_check", ref: "duplicate" } });
    expect(adminCode.ok).toBe(false);

    must(await w.actions.rejectSubmission({ submission_id: target.id, reason_code: "missing_disclosure", evidence: { kind: "qa_check", ref: "disclosure_audio", excerpt: "No spoken disclosure." } }));
    const s = w.state().submissions[target.id];
    expect(s.status).toBe("rejected");
    expect(s.reserved_cents).toBe(0);
    expect(s.decision?.reason_code).toBe("missing_disclosure");
    const after = w.state().bounties[bounty.id];
    expect(after.reserved_cents).toBe(bounty.reserved_cents - target.reserved_cents);
    expect(after.remaining_cents).toBe(bounty.remaining_cents + target.reserved_cents);
    expect(escrowIdentityHolds(escrowStateOf(after))).toBe(true);
    expect(after.counts.in_review).toBe(bounty.counts.in_review - 1);
  });

  it("requests changes with timecoded notes; the third round is paid by the brand", async () => {
    const w = await makeWorld("brand");
    // Pause the guarded rules of Lumi so a resubmission always goes to a person.
    for (const rule of Object.values(w.state().auto_approve_rules).filter((r) => r.brand_id === "br_lumi" && r.status === "active")) {
      must(await w.actions.setRuleStatus({ rule_id: rule.id, status: "paused", reason: "test" }));
    }
    const mine = Object.values(w.state().submissions).find((s) => s.creator_id === "cr_maya" && s.status === "in_review" && s.brand_id === "br_lumi");
    expect(mine).toBeDefined();
    const id = mine?.id ?? "";

    const noNote = await w.actions.requestRevision({ submission_id: id, notes: [{ t_ms: 1000, body: "Nice energy.", category: "pacing", severity: "suggestion" }] });
    expect(noNote.ok).toBe(false);
    if (!noNote.ok) expect(noNote.error.code).toBe("must_fix_required");

    const walletBefore = w.state().brands["br_lumi"].wallet_balance_cents;
    for (let round = 1; round <= 3; round += 1) {
      w.as("brand");
      const r = must(await w.actions.requestRevision({ submission_id: id, notes: [{ t_ms: 1200, body: `Show the app by one second (round ${round}).`, category: "hook", severity: "must_fix", reason_code: "app_not_shown_early" }, { t_ms: 4000, body: "Slow down on the offer.", category: "offer", severity: "suggestion" }] }));
      expect(r.submission.status).toBe("changes_requested");
      expect(r.submission.revision_round).toBe(round);
      expect(r.notes).toHaveLength(2);
      expect(r.extra_round_fee_cents).toBe(round >= 3 ? 1000 : 0);
      if (round < 3) {
        w.as("creator");
        const rev = must(await w.actions.reviseSubmission({ submission_id: id, clip: clip(round), changes_summary: "App on screen first." }));
        expect(rev.submission.status).toBe("in_review");
        expect(rev.submission.version).toBe(round + 1);
      }
    }
    const lumi = w.state().brands["br_lumi"];
    expect(lumi.wallet_balance_cents).toBeLessThan(walletBefore);
    expect(walletFromLedger(w.state(), "br_lumi")).toBe(lumi.wallet_balance_cents);
    expect(ledgerProblems(w.state())).toEqual([]);
    // the creator's $10 shows on the Money Clock as pending with a dated ETA, never a bare "pending"
    const row = Object.values(w.state().money_clock).find((m) => m.creator_id === "cr_maya" && m.label.includes("extra revision"));
    expect(row?.state).toBe("pending");
    expect(row?.eta_at).toBeDefined();
    expect(row?.reason_text.length).toBeGreaterThan(5);
  });

  it("an appeal goes to Ops: overturned approves the video", async () => {
    const w = await makeWorld("brand");
    const mine = Object.values(w.state().submissions).find((s) => s.creator_id === "cr_maya" && s.status === "in_review" && s.brand_id === "br_lumi");
    const id = mine?.id ?? "";
    must(await w.actions.rejectSubmission({ submission_id: id, reason_code: "off_brief", evidence: { kind: "brief_requirement", ref: "Show the app by 0:03" } }));
    w.as("creator");
    const short = await w.actions.appealRejection({ submission_id: id, note: "too short" });
    expect(short.ok).toBe(false);
    const appealed = must(await w.actions.appealRejection({ submission_id: id, note: "The brief says show the app by 0:03 and I do at 0:02.", reason: "Does not match the brief" }));
    expect(appealed.submission.status).toBe("appealed");
    expect(appealed.dispute.kind).toBe("rejection_appeal");
    const twice = await w.actions.appealRejection({ submission_id: id, note: "Trying again with a longer note." });
    expect(twice.ok).toBe(false);

    w.as("admin");
    must(await w.actions.resolveDispute({ dispute_id: appealed.dispute.id, outcome: "upheld", outcome_text: "The app is on screen at 0:02, as the brief requires." }));
    const s = w.state().submissions[id];
    expect(s.status).toBe("approved");
    expect(s.decision?.action).toBe("appeal_overturn");
    expect(s.link_id).toBeDefined();
    expect(w.state().disputes[appealed.dispute.id].status).toBe("resolved");
    expect(escrowIdentityHolds(escrowStateOf(w.state().bounties[s.bounty_id]))).toBe(true);
  });

  it("a rejection that is upheld on appeal stays rejected and frees the slot", async () => {
    const w = await makeWorld("brand");
    const mine = Object.values(w.state().submissions).find((s) => s.creator_id === "cr_maya" && s.status === "in_review" && s.brand_id === "br_lumi");
    const id = mine?.id ?? "";
    must(await w.actions.rejectSubmission({ submission_id: id, reason_code: "off_brief", evidence: { kind: "brief_requirement", ref: "No new accounts" } }));
    w.as("creator");
    const a = must(await w.actions.appealRejection({ submission_id: id, note: "I believe this follows the brief closely." }));
    w.as("admin");
    must(await w.actions.resolveDispute({ dispute_id: a.dispute.id, outcome: "rejected", outcome_text: "The brief asks for the app by 0:03 and it appears at 0:09." }));
    const s = w.state().submissions[id];
    expect(s.status).toBe("rejected");
    expect(s.reserved_cents).toBe(0);
    expect(escrowIdentityHolds(escrowStateOf(w.state().bounties[s.bounty_id]))).toBe(true);
  });

  it("a creator can withdraw a video before it is posted, returning the reservation", async () => {
    const w = await makeWorld("creator");
    const mine = Object.values(w.state().submissions).find((s) => s.creator_id === "cr_maya" && s.status === "in_review");
    const id = mine?.id ?? "";
    const before = w.state().bounties[mine?.bounty_id ?? ""];
    must(await w.actions.withdrawSubmission({ submission_id: id }));
    const after = w.state().bounties[before.id];
    expect(w.state().submissions[id].status).toBe("withdrawn");
    expect(after.reserved_cents).toBe(before.reserved_cents - (mine?.reserved_cents ?? 0));
    expect(escrowIdentityHolds(escrowStateOf(after))).toBe(true);
  });
});
