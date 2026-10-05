import { vi, describe, expect, it } from "vitest";
import { selectFoundingSpots, selectProof, selectTrackingLanding, selectWaitlist } from "@/lib/data/selectors";
import { MAX_UNANSWERED_BRAND_MESSAGES } from "../core/inbox";
import { ledgerProblems, makeWorld, must } from "./helpers";

vi.setConfig({ testTimeout: 60_000 });

const code = async (p: Promise<{ ok: boolean; error?: { code: string } }>): Promise<string> => {
  const r = await p;
  return r.ok ? "ok" : (r.error?.code ?? "unknown");
};

describe("the waitlist and the founding places", () => {
  it("a visitor joins at the true next place; joining again returns the same place", async () => {
    const w = await makeWorld(null);
    const total = selectWaitlist(w.state(), undefined).total;
    const joined = must(await w.actions.joinWaitlist({ email: "sam@example.com", role: "creator", handle: "@sam.makes" }));
    expect(joined).toMatchObject({ position: total + 1, already_joined: false, total: total + 1 });
    expect(joined.referral_link).toContain(joined.referral_code);
    const view = selectWaitlist(w.state(), undefined);
    expect(view.total).toBe(total + 1);
    expect(view.visitor).toMatchObject({ position: total + 1, masked_email: expect.stringContaining("@example.com") });
    // the email is never stored in the clear
    expect(JSON.stringify(w.state().waitlist)).not.toContain("sam@example.com");
    const again = must(await w.actions.joinWaitlist({ email: "sam@example.com", role: "creator" }));
    expect(again).toMatchObject({ position: total + 1, already_joined: true, total: total + 1 });
    expect(await code(w.actions.joinWaitlist({ email: "not-an-email", role: "brand" }))).toBe("email_invalid");
    expect(await code(w.actions.joinWaitlist({ email: "ok@example.com", role: "brand", handle: "!!" }))).toBe("handle_invalid");
  });

  it("a founding application is validated, gets a case id and can be sent once", async () => {
    const w = await makeWorld(null);
    const spots = selectFoundingSpots(w.state(), undefined);
    expect(spots.total).toBe(200);
    expect(spots.taken + spots.left).toBe(200);
    expect(spots.applied).toBe(false);
    expect(await code(w.actions.applyFoundingCreator({ handle: "x", niche: "tech", proof_url: "https://example.com/me" }))).toBe("handle_invalid");
    expect(await code(w.actions.applyFoundingCreator({ handle: "sam.makes", niche: "", proof_url: "https://example.com/me" }))).toBe("niche_required");
    expect(await code(w.actions.applyFoundingCreator({ handle: "sam.makes", niche: "tech", proof_url: "my channel" }))).toBe("proof_invalid");
    const r = must(await w.actions.applyFoundingCreator({ handle: "@sam.makes", niche: "tech", proof_url: "https://example.com/me" }));
    expect(r.application.case_id).toMatch(/^FC-2026-\d{4}$/);
    expect(r.application.status).toBe("in_review");
    expect(r.spots_left).toBe(spots.left);
    expect(selectFoundingSpots(w.state(), undefined).applied).toBe(true);
    expect(await code(w.actions.applyFoundingCreator({ handle: "sam.makes", niche: "tech", proof_url: "https://example.com/me" }))).toBe("already_applied");
  });
});

describe("tracking links and proof pages", () => {
  it("a click is counted on the link, the post and the bounty funnel, and only for an active link", async () => {
    const w = await makeWorld(null);
    const link = Object.values(w.state().attribution_links).find((l) => l.status === "active" && l.post_id !== undefined);
    expect(link).toBeDefined();
    if (!link?.post_id) return;
    const post = w.state().posts[link.post_id];
    const landing = selectTrackingLanding(w.state(), link.code);
    expect(landing.valid).toBe(true);
    expect(landing.disclosure).toMatch(/^Ad by @/);
    const r = must(await w.actions.recordLinkClick({ code: link.code.toUpperCase() }));
    expect(r.counted).toBe(true);
    expect(w.state().attribution_links[link.id].clicks).toBe(link.clicks + 1);
    expect(w.state().posts[link.post_id].funnel.clicks).toBe(post.funnel.clicks + 1);
    expect(must(await w.actions.recordLinkClick({ code: "not-a-code" })).counted).toBe(false);
    expect(selectTrackingLanding(w.state(), "not-a-code").valid).toBe(false);
  });

  it("a creator shares a month as a proof page that carries the typical creator, can hide their handle and can take it down", async () => {
    const w = await makeWorld("creator");
    const payout = Object.values(w.state().payouts).find((p) => p.creator_id === "cr_maya" && (p.status === "paid" || p.status === "in_transit"));
    expect(payout).toBeDefined();
    const shared = must(await w.actions.shareProof({ payout_id: payout?.id, anonymous: true }));
    expect(shared.url).toContain(`/p/${shared.proof.id}`);
    expect(shared.proof.anonymous).toBe(true);
    expect(shared.proof.handle).not.toContain("maya");
    expect(shared.proof.typical_median_cents).toBeGreaterThan(0);

    const view = selectProof(w.state(), shared.proof.id);
    expect(view?.creator).toBeUndefined();
    expect(view?.typical_line).toMatch(/typical creator/i);
    expect(view?.revoked).toBe(false);

    // visible again with the handle when asked
    const named = must(await w.actions.shareProof({ payout_id: payout?.id, anonymous: false }));
    expect(named.proof.id).toBe(shared.proof.id);
    expect(named.proof.handle).toBe("maya.makes");
    expect(selectProof(w.state(), shared.proof.id)?.creator?.id).toBe("cr_maya");

    // exactly one of payout or month
    expect(await code(w.actions.shareProof({}))).toBe("choose_one");
    expect(await code(w.actions.shareProof({ payout_id: payout?.id, month: "2026-09" }))).toBe("choose_one");
    expect(await code(w.actions.shareProof({ month: "2031-01" }))).toBe("nothing_to_share");
    expect(await code(w.actions.shareProof({ month: "september" }))).toBe("month_invalid");

    must(await w.actions.recordProofView({ proof_id: shared.proof.id }));
    expect(w.state().proofs[shared.proof.id].page_views).toBe(shared.proof.page_views + 1);

    must(await w.actions.revokeProof({ proof_id: shared.proof.id }));
    expect(selectProof(w.state(), shared.proof.id)?.revoked).toBe(true);
    // a revoked page is not counted
    expect(must(await w.actions.recordProofView({ proof_id: shared.proof.id })).page_views).toBe(0);
  });

  it("another creator cannot share or revoke someone else's money", async () => {
    const w = await makeWorld("creator");
    const other = Object.values(w.state().payouts).find((p) => p.creator_id !== "cr_maya" && p.status === "paid");
    expect(await code(w.actions.shareProof({ payout_id: other?.id }))).toBe("forbidden");
    const proof = Object.values(w.state().proofs).find((p) => p.creator_id !== "cr_maya");
    expect(await code(w.actions.revokeProof({ proof_id: proof?.id ?? "" }))).toBe("forbidden");
    w.as("brand");
    expect(await code(w.actions.shareProof({ month: "2026-09" }))).toBe("forbidden");
  });
});

describe("the free audit", () => {
  it("builds a report from a name, returns the same one for the same app and a brand can claim it", async () => {
    const w = await makeWorld(null);
    const first = must(await w.actions.runAudit({ input: "Fernly Plants" }));
    expect(first.created).toBe(true);
    expect(first.report.slug.length).toBeGreaterThan(2);
    expect(first.report.page_views).toBe(1);
    const again = must(await w.actions.runAudit({ input: "Fernly Plants" }));
    expect(again.created).toBe(false);
    expect(again.report.id).toBe(first.report.id);
    expect(again.report.page_views).toBe(2);
    expect(await code(w.actions.runAudit({ input: " " }))).toBe("input_required");
    expect(await code(w.actions.runAudit({ input: "x".repeat(301) }))).toBe("input_too_long");
    // anyone can look, only a brand claims
    expect(await code(w.actions.claimAudit({ slug: first.report.slug }))).toBe("unauthenticated");
    w.as("brand");
    expect(await code(w.actions.claimAudit({ slug: first.report.slug }))).toBe("ok");
  });
});

describe("the inbox", () => {
  it("a creator opens a support thread and is told when a person replies", async () => {
    const w = await makeWorld("creator");
    expect(await code(w.actions.startThread({ kind: "support", title: "x", body: "A question about my payout" }))).toBe("title_required");
    const { thread } = must(await w.actions.startThread({ kind: "support", title: "Where is my payout?", body: "My Friday payout is not here yet." }));
    expect(thread.creator_id).toBe("cr_maya");
    expect(thread.messages.at(-1)?.body).toMatch(/within 24 hours/);
    expect(w.state().threads[thread.id]).toBeDefined();
    w.as("brand");
    // a thread is private to its parties
    expect(await code(w.actions.sendThreadMessage({ thread_id: thread.id, body: "Hello" }))).toBe("forbidden");
  });

  it("a brand cannot send more than three messages before the creator replies", async () => {
    const w = await makeWorld("brand");
    const thread = Object.values(w.state().threads).find((t) => t.brand_id === "br_lumi" && t.kind === "offer");
    expect(thread).toBeDefined();
    if (!thread) return;
    // clear the way: reply as the creator first
    w.as("creator");
    if (thread.creator_id !== "cr_maya") return;
    must(await w.actions.sendThreadMessage({ thread_id: thread.id, body: "Thanks for the note, happy to talk." }));
    w.as("brand");
    for (let i = 0; i < MAX_UNANSWERED_BRAND_MESSAGES; i += 1) must(await w.actions.sendThreadMessage({ thread_id: thread.id, body: `Follow-up ${i + 1}` }));
    const blocked = await w.actions.sendThreadMessage({ thread_id: thread.id, body: "One more?" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("rate_limited");
    expect(w.state().threads[thread.id].rate_limited).toBe(true);
    // a reply from the creator lifts it
    w.as("creator");
    must(await w.actions.sendThreadMessage({ thread_id: thread.id, body: "Replying now." }));
    w.as("brand");
    expect(w.state().threads[thread.id].rate_limited).toBe(false);
    expect(await code(w.actions.sendThreadMessage({ thread_id: thread.id, body: "Great, thanks." }))).toBe("ok");
  });

  it("a risky message gets a warning under it and is never deleted; unread counts follow", async () => {
    const w = await makeWorld("brand");
    const thread = Object.values(w.state().threads).find((t) => t.brand_id === "br_lumi" && t.creator_id === "cr_maya");
    expect(thread).toBeDefined();
    if (!thread) return;
    const r = must(await w.actions.sendThreadMessage({ thread_id: thread.id, body: "Easier on WhatsApp, send me your number." }));
    expect(r.warning).toBe("off_platform_chat");
    const messages = w.state().threads[thread.id].messages;
    expect(messages.at(-2)?.body).toContain("WhatsApp");
    expect(messages.at(-1)?.kind).toBe("warning");
    expect(w.state().threads[thread.id].unread_creator).toBeGreaterThan(thread.unread_creator);
    w.as("creator");
    must(await w.actions.markThreadRead({ thread_id: thread.id }));
    expect(w.state().threads[thread.id].unread_creator).toBe(0);
    expect(await code(w.actions.sendThreadMessage({ thread_id: thread.id, body: "   " }))).toBe("empty_message");
  });

  it("an offer and its thread never disagree: a message in either shows in both", async () => {
    const w = await makeWorld("brand");
    const sent = must(await w.actions.sendOffer({ creator_id: "cr_abe_adds_apps", app_id: "app_lumi", title: "Two honest hooks", amount_cents: 9_000, message: "We like your screen-recording style. Two takes, 4 days." }));
    const thread = Object.values(w.state().threads).find((t) => t.offer_id === sent.offer.id);
    expect(thread?.kind).toBe("offer");
    expect(thread?.messages.some((m) => m.body.includes("screen-recording style"))).toBe(true);
    must(await w.actions.sendThreadMessage({ thread_id: thread?.id ?? "", body: "Happy to send a reference reel too." }));
    const offer = w.state().offers[sent.offer.id];
    expect(offer.thread.at(-1)?.body).toBe("Happy to send a reference reel too.");
    must(await w.actions.sendOfferMessage({ offer_id: sent.offer.id, body: "And a rate for three takes." }));
    const t2 = w.state().threads[thread?.id ?? ""];
    expect(t2.messages.at(-1)?.body).toBe("And a rate for three takes.");
    expect(ledgerProblems(w.state())).toEqual([]);
  });
});

describe("referrals", () => {
  it("the referrer earns 5% of what the referee clears inside the window, funded by flowd, capped, and the referee is never charged", async () => {
    const w = await makeWorld("admin");
    const referral = Object.values(w.state().referrals).find((r) => r.kind === "creator" && r.referee_creator_id && r.referrer_creator_id && r.joined_at && r.status !== "complete");
    expect(referral).toBeDefined();
    if (!referral?.referee_creator_id || !referral.referrer_creator_id) return;
    expect(referral.reward_rate).toBe(0.05);
    const referrer = referral.referrer_creator_id;
    const referee = referral.referee_creator_id;
    const sum = (creatorId: string, type?: string): number => Object.values(w.state().ledger).filter((e) => e.account === `creator:${creatorId}` && (type === undefined || e.entry_type === type)).reduce((s, e) => s + e.amount_cents, 0);
    const refereeBefore = sum(referee);
    const rewards = (): number => Object.values(w.state().referrals).filter((r) => r.referrer_creator_id === referrer).reduce((n, r) => n + r.reward_earned_cents, 0);
    const referrerBefore = sum(referrer, "referral");
    const rewardsBefore = rewards();
    must(await w.actions.advanceClock({ hours: 24 * 14 }));
    const after = w.state().referrals[referral.id];
    expect(after.reward_earned_cents).toBeGreaterThanOrEqual(referral.reward_earned_cents);
    expect(after.reward_earned_cents).toBeLessThanOrEqual(after.reward_cap_cents);
    // the reward is a separate platform-funded row; the referee's own earnings never lose a cent to it
    // (a referrer can have several referees clearing in the same run: the ledger agrees with the sum of their reward counters)
    expect(sum(referrer, "referral") - referrerBefore).toBe(rewards() - rewardsBefore);
    expect(sum(referee)).toBeGreaterThanOrEqual(refereeBefore);
    expect(ledgerProblems(w.state())).toEqual([]);
  });
});
