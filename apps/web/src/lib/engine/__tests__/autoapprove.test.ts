import { describe, expect, it } from "vitest";
import type { RuleStatus } from "@/lib/contract/types";
import {
  canEnable,
  checkConditions,
  dryRun,
  evaluateRule,
  inScope,
  killRule,
  sampleForSpotCheck,
  shouldSpotCheck,
  spotCheckCount,
  spotCheckRatioOf,
  statusAfterEvent,
  timeoutAction,
  withSpotCheck,
  type AutoApproveSubject,
  type RuleLike,
} from "../autoapprove";
import { seededRng } from "../rng";
import { addDays } from "../time";
import { NOW } from "./helpers";

const rule = (over: Partial<RuleLike> = {}): RuleLike => ({
  status: "active",
  conditions: {
    min_flow_band: "B",
    require_all_beats: true,
    require_disclosure_pass: true,
    require_no_duplicate: true,
    require_music_pass: true,
    max_fraud_score: 20,
    min_us_audience_ratio: 0.5,
    min_creator_approved_posts: 3,
    min_creator_approval_rate: 0.9,
  },
  scope: { bounty_ids: [], tiers: [], platforms: [] },
  guardrails: { daily_cap: 25, budget_cap_cents: 500_000, spot_check_ratio: 0.1, pause_on_fraud: true },
  ...over,
});

const subject = (over: Partial<AutoApproveSubject> = {}): AutoApproveSubject => ({
  submission_id: "sub_1",
  bounty_id: "bnty_a",
  creator_id: "cr_maya",
  tier: "silver",
  platform: "tiktok",
  flow_band: "A",
  beats_found: 5,
  beats_required: 5,
  disclosure_pass: true,
  no_duplicate: true,
  music_pass: true,
  fraud_score: 6,
  us_audience_ratio: 0.71,
  creator_approved_count: 21,
  creator_approval_rate: 0.93,
  submitted_at: "2026-10-03T09:00:00Z",
  ...over,
});

describe("checkConditions", () => {
  it("lists every condition with what was found against what was needed", () => {
    const c = checkConditions(rule(), subject());
    expect(c.map((x) => x.id)).toEqual(["disclosure", "duplicate", "fraud_hold", "min_flow_band", "all_beats", "music", "fraud_max", "us_audience", "approved_posts", "approval_rate"]);
    expect(c.every((x) => x.passed)).toBe(true);
    expect(c.filter((x) => x.hard).map((x) => x.id)).toEqual(["disclosure", "duplicate", "fraud_hold"]);
    expect(c.find((x) => x.id === "us_audience")?.detail).toBe("71% US audience (needs 50%).");
    expect(c.find((x) => x.id === "min_flow_band")?.detail).toBe("Flow band A (needs B or better).");
    expect(c.find((x) => x.id === "approval_rate")?.label).toBe("Approval rate at least 90%");
  });

  it("only asks for beats and music when the rule requires them", () => {
    const r = rule({ conditions: { ...rule().conditions, require_all_beats: false, require_music_pass: false } });
    expect(checkConditions(r, subject()).map((x) => x.id)).not.toContain("all_beats");
    expect(checkConditions(r, subject()).map((x) => x.id)).not.toContain("music");
  });

  it("fails each soft condition on its own", () => {
    const failed = (over: Partial<AutoApproveSubject>): string[] => checkConditions(rule(), subject(over)).filter((x) => !x.passed).map((x) => x.id);
    expect(failed({ flow_band: "C" })).toEqual(["min_flow_band"]);
    expect(failed({ beats_found: 4 })).toEqual(["all_beats"]);
    expect(failed({ music_pass: false })).toEqual(["music"]);
    expect(failed({ fraud_score: 21 })).toEqual(["fraud_max"]);
    expect(failed({ us_audience_ratio: 0.49 })).toEqual(["us_audience"]);
    expect(failed({ creator_approved_count: 2 })).toEqual(["approved_posts"]);
    expect(failed({ creator_approval_rate: 0.89 })).toEqual(["approval_rate"]);
    // boundaries are inclusive
    expect(failed({ flow_band: "B", fraud_score: 20, us_audience_ratio: 0.5, creator_approved_count: 3, creator_approval_rate: 0.9 })).toEqual([]);
  });
});

describe("inScope", () => {
  it("treats an empty list as everything and checks bounties, tiers and platforms", () => {
    expect(inScope(rule(), subject())).toEqual({ ok: true });
    const scoped = rule({ scope: { bounty_ids: ["bnty_a"], tiers: ["silver", "gold"], platforms: ["tiktok"] } });
    expect(inScope(scoped, subject())).toEqual({ ok: true });
    expect(inScope(scoped, subject({ bounty_id: "bnty_z" }))).toEqual({ ok: false, reason: "This bounty is not in the rule's scope." });
    expect(inScope(scoped, subject({ tier: "bronze" }))).toEqual({ ok: false, reason: "The bronze tier is not in the rule's scope." });
    expect(inScope(scoped, subject({ platform: "youtube" }))).toEqual({ ok: false, reason: "youtube is not in the rule's scope." });
  });
});

describe("evaluateRule", () => {
  it("auto-approves a clean submission from a proven creator, organic posting only", () => {
    const e = evaluateRule(rule(), subject());
    expect(e).toMatchObject({ decision: "auto_approve", reasons: [], grants: "organic_only", hard_block: false, spot_check: false });
  });

  it("sends anything short of the rule to a person, with every reason", () => {
    const e = evaluateRule(rule(), subject({ flow_band: "D", us_audience_ratio: 0.2 }));
    expect(e.decision).toBe("send_to_human");
    expect(e.reasons).toEqual(["Flow band D (needs B or better).", "20% US audience (needs 50%)."]);
    expect(e.hard_block).toBe(false);
  });

  it("blocks a hard safety failure whatever the rule says", () => {
    const lax = rule({ conditions: { ...rule().conditions, require_disclosure_pass: false, require_no_duplicate: false } });
    const noDisclosure = evaluateRule(lax, subject({ disclosure_pass: false }));
    expect(noDisclosure).toMatchObject({ decision: "block", hard_block: true });
    expect(noDisclosure.reasons).toEqual(["A disclosure is missing. This always needs a person."]);
    expect(evaluateRule(lax, subject({ no_duplicate: false })).decision).toBe("block");
    // a hard block is reported even when the rule is switched off
    expect(evaluateRule(rule({ status: "killed" }), subject({ disclosure_pass: false })).decision).toBe("block");
  });

  it("treats a fraud score in the hold band (70 and up) as a hard block, and below it as an ordinary soft limit", () => {
    expect(evaluateRule(rule(), subject({ fraud_score: 70 }))).toMatchObject({ decision: "block", hard_block: true });
    const high = rule({ conditions: { ...rule().conditions, max_fraud_score: 100 } });
    expect(evaluateRule(high, subject({ fraud_score: 70 })).decision).toBe("block");
    expect(evaluateRule(high, subject({ fraud_score: 69 })).decision).toBe("auto_approve");
    expect(evaluateRule(rule(), subject({ fraud_score: 69 }))).toMatchObject({ decision: "send_to_human", hard_block: false });
  });

  it("only auto-approves while the rule is active", () => {
    const expected: Record<Exclude<RuleStatus, "active">, string> = {
      draft: "The rule is still a draft.",
      dry_run: "The rule is in dry run: it shows what it would do and approves nothing yet.",
      paused: "The rule is paused.",
      killed: "The rule was killed.",
    };
    for (const [status, reason] of Object.entries(expected)) {
      const e = evaluateRule(rule({ status: status as RuleStatus }), subject());
      expect(e).toMatchObject({ decision: "send_to_human", reasons: [reason] });
    }
  });

  it("always sends a first-time creator to a person", () => {
    const open = rule({ conditions: { ...rule().conditions, min_creator_approved_posts: 0, min_creator_approval_rate: 0 } });
    const e = evaluateRule(open, subject({ creator_approved_count: 0, creator_approval_rate: 0 }));
    expect(e).toMatchObject({ decision: "send_to_human", reasons: ["First-time creators are always reviewed by a person."] });
    expect(evaluateRule(open, subject({ creator_approved_count: 1 })).decision).toBe("auto_approve");
  });

  it("keeps to the rule's scope", () => {
    const scoped = rule({ scope: { bounty_ids: ["bnty_z"], tiers: [], platforms: [] } });
    expect(evaluateRule(scoped, subject())).toMatchObject({ decision: "send_to_human", reasons: ["This bounty is not in the rule's scope."] });
  });

  it("stops at the daily guardrails, and when a clawback or fraud event paused the rule", () => {
    expect(evaluateRule(rule(), subject(), { approved_today: 24, spent_today_cents: 0 }).decision).toBe("auto_approve");
    expect(evaluateRule(rule(), subject(), { approved_today: 25, spent_today_cents: 0 })).toMatchObject({ decision: "send_to_human", reasons: ["The daily cap of 25 auto-approvals is reached."] });
    expect(evaluateRule(rule(), subject(), { approved_today: 1, spent_today_cents: 500_000 })).toMatchObject({ decision: "send_to_human", reasons: ["The daily budget cap is reached."] });
    expect(evaluateRule(rule(), subject(), { approved_today: 1, spent_today_cents: 0, paused_by_event: true }).reasons).toEqual(["The rule is paused after a clawback or fraud event."]);
    // a cap of 0 means no cap, and omitting the state ignores caps (a dry run)
    const uncapped = rule({ guardrails: { daily_cap: 0, budget_cap_cents: 0, spot_check_ratio: 0.1, pause_on_fraud: true } });
    expect(evaluateRule(uncapped, subject(), { approved_today: 999, spent_today_cents: 9_999_999 }).decision).toBe("auto_approve");
    expect(evaluateRule(rule(), subject()).decision).toBe("auto_approve");
  });

  it("never grants anything beyond organic posting", () => {
    for (const s of [subject(), subject({ flow_band: "E" }), subject({ disclosure_pass: false })]) expect(evaluateRule(rule(), s).grants).toBe("organic_only");
  });
});

describe("spot checks", () => {
  it("routes an approval to a person when the draw falls under the ratio", () => {
    expect(shouldSpotCheck(() => 0.05)).toBe(true);
    expect(shouldSpotCheck(() => 0.1)).toBe(false);
    expect(shouldSpotCheck(() => 0.0, 0)).toBe(false);
    expect(shouldSpotCheck(() => 0.999, 1)).toBe(true);
    expect(shouldSpotCheck(() => 0.3, 0.5)).toBe(true);
  });

  it("counts a batch sample: round(n x ratio), at least one, never more than the batch", () => {
    expect(spotCheckCount(0)).toBe(0);
    expect(spotCheckCount(7)).toBe(1);
    expect(spotCheckCount(50)).toBe(5);
    expect(spotCheckCount(100)).toBe(10);
    expect(spotCheckCount(2, 5)).toBe(2);
    expect(spotCheckCount(10, 0)).toBe(0);
    expect(spotCheckCount(-3)).toBe(0);
  });

  it("samples reproducibly with an injected Rng", () => {
    const items = Array.from({ length: 50 }, (_, i) => `sub_${i}`);
    const a = sampleForSpotCheck(items, seededRng("week-40"));
    expect(a).toHaveLength(5);
    expect(new Set(a).size).toBe(5);
    expect(a.every((x) => items.includes(x))).toBe(true);
    expect(sampleForSpotCheck(items, seededRng("week-40"))).toEqual(a);
    expect(sampleForSpotCheck(items, seededRng("week-41"))).not.toEqual(a);
    expect(sampleForSpotCheck([], seededRng("x"))).toEqual([]);
    expect(items).toHaveLength(50); // the input is untouched
  });

  it("turns about one automatic approval in ten into a person's review", () => {
    const approve = evaluateRule(rule(), subject());
    const rng = seededRng("spot-check");
    let routed = 0;
    const n = 4000;
    for (let i = 0; i < n; i += 1) {
      const e = withSpotCheck(approve, rng);
      if (e.decision === "send_to_human") {
        routed += 1;
        expect(e.spot_check).toBe(true);
        expect(e.reasons).toEqual(["Random spot-check: a person reviews a share of automatic approvals."]);
      }
    }
    expect(routed / n).toBeGreaterThan(0.08);
    expect(routed / n).toBeLessThan(0.12);
  });

  it("leaves anything that was not an approval alone", () => {
    const human = evaluateRule(rule(), subject({ flow_band: "E" }));
    expect(withSpotCheck(human, () => 0)).toBe(human);
    const block = evaluateRule(rule(), subject({ no_duplicate: false }));
    expect(withSpotCheck(block, () => 0)).toBe(block);
    // a rule's own ratio can be higher
    expect(withSpotCheck(evaluateRule(rule(), subject()), () => 0.4, 0.5).decision).toBe("send_to_human");
  });

  it("reads the rule's own spot-check ratio", () => {
    expect(spotCheckRatioOf(rule())).toBe(0.1);
    expect(spotCheckRatioOf(rule({ guardrails: { daily_cap: 1, budget_cap_cents: 1, spot_check_ratio: 0.25, pause_on_fraud: true } }))).toBe(0.25);
  });
});

describe("dryRun", () => {
  // 60 submissions, one a day: every 10th has a duplicate (a block), every 7th is a weak flow band (a person), the rest would be approved.
  const subs = Array.from({ length: 60 }, (_, i) => subject({ submission_id: `sub_${i}`, submitted_at: addDays("2026-08-01T09:00:00Z", i), no_duplicate: i % 10 !== 0, flow_band: i % 7 === 0 ? "D" : "A" }));

  it("replays the rule over the most recent 50 submissions", () => {
    const r = dryRun(rule({ status: "draft" }), subs, { now: NOW });
    // the 50 newest are sub_10 to sub_59: blocks at 10, 20, 30, 40, 50; people at 14, 21, 28, 35, 42, 49, 56
    expect(r.dry_run).toEqual({ ran_at: NOW, sample_size: 50, would_approve: 38, would_send_to_human: 7, would_block: 5 });
    expect(r.headline).toBe("Would have approved 38 of the last 50.");
    expect(r.per_submission).toHaveLength(50);
    expect(r.per_submission[0].submission_id).toBe("sub_59");
    expect(r.per_submission.at(-1)?.submission_id).toBe("sub_10");
    expect(r.per_submission.find((s) => s.submission_id === "sub_20")).toMatchObject({ decision: "block" });
    expect(r.per_submission.find((s) => s.submission_id === "sub_14")).toMatchObject({ decision: "send_to_human" });
  });

  it("takes whatever it is given when there are fewer than 50, in any order", () => {
    const r = dryRun(rule(), [...subs].reverse().slice(0, 12), { now: NOW });
    expect(r.dry_run.sample_size).toBe(12);
    expect(r.dry_run.would_approve + r.dry_run.would_send_to_human + r.dry_run.would_block).toBe(12);
    expect(dryRun(rule(), [], { now: NOW })).toMatchObject({ dry_run: { sample_size: 0, would_approve: 0, would_send_to_human: 0, would_block: 0 }, headline: "Would have approved 0 of the last 0." });
  });

  it("honours a different sample size and ignores the daily caps", () => {
    const tight = rule({ guardrails: { daily_cap: 1, budget_cap_cents: 1, spot_check_ratio: 0.1, pause_on_fraud: true } });
    const r = dryRun(tight, subs, { now: NOW, sample_size: 10 });
    expect(r.dry_run.sample_size).toBe(10);
    expect(r.dry_run.would_approve).toBeGreaterThan(1);
  });

  it("lists the reasons a submission would have gone to a person", () => {
    const r = dryRun(rule(), [subject({ flow_band: "E" })], { now: NOW });
    expect(r.per_submission[0]).toEqual({ submission_id: "sub_1", decision: "send_to_human", reasons: ["Flow band E (needs B or better)."] });
  });
});

describe("lifecycle", () => {
  const dry = { ran_at: "2026-10-01T00:00:00Z", sample_size: 50, would_approve: 31, would_send_to_human: 14, would_block: 5 };

  it("needs a dry run before a rule can be switched on", () => {
    expect(canEnable({ status: "draft" })).toMatchObject({ ok: false, reason: expect.stringContaining("Run the dry run first") });
    expect(canEnable({ status: "draft", dry_run: dry })).toEqual({ ok: true });
    expect(canEnable({ status: "dry_run", dry_run: dry })).toEqual({ ok: true });
    expect(canEnable({ status: "paused", dry_run: dry })).toEqual({ ok: true });
    expect(canEnable({ status: "active", dry_run: dry })).toEqual({ ok: false, reason: "The rule is already on." });
  });

  it("brings a killed rule back only after a FRESH dry run", () => {
    const killed = { status: "killed" as const, killed_at: "2026-10-02T00:00:00Z" };
    expect(canEnable({ ...killed, dry_run: dry })).toEqual({ ok: false, reason: "A killed rule needs a fresh dry run before it can be switched back on." });
    expect(canEnable({ ...killed, dry_run: { ...dry, ran_at: "2026-10-02T00:00:00Z" } }).ok).toBe(false);
    expect(canEnable({ ...killed, dry_run: { ...dry, ran_at: "2026-10-02T12:00:00Z" } })).toEqual({ ok: true });
    expect(canEnable(killed).ok).toBe(false);
  });

  it("kills with a time and a reason", () => {
    expect(killRule("Fraud spike on bnty_a", NOW)).toEqual({ status: "killed", killed_at: NOW, kill_reason: "Fraud spike on bnty_a" });
  });

  it("pauses an active rule on a clawback, and on a fraud flag unless the rule says otherwise", () => {
    expect(statusAfterEvent("active")).toBe("paused");
    expect(statusAfterEvent("active", "clawback")).toBe("paused");
    expect(statusAfterEvent("active", "fraud_flag")).toBe("paused");
    expect(statusAfterEvent("active", "fraud_flag", { pause_on_fraud: true })).toBe("paused");
    expect(statusAfterEvent("active", "fraud_flag", { pause_on_fraud: false })).toBe("active");
    expect(statusAfterEvent("active", "clawback", { pause_on_fraud: false })).toBe("paused");
    for (const s of ["draft", "dry_run", "paused", "killed"] as const) expect(statusAfterEvent(s)).toBe(s);
  });

  it("waits out the 72 hours, then escalates or approves a clean submission by policy", () => {
    expect(timeoutAction({ policy: "escalate", hours_in_queue: 71.99, qa_clean: true })).toBe("wait");
    expect(timeoutAction({ policy: "approve_if_clean", hours_in_queue: 10, qa_clean: true })).toBe("wait");
    expect(timeoutAction({ policy: "escalate", hours_in_queue: 72, qa_clean: true })).toBe("escalate");
    expect(timeoutAction({ policy: "approve_if_clean", hours_in_queue: 72, qa_clean: true })).toBe("approve");
    expect(timeoutAction({ policy: "approve_if_clean", hours_in_queue: 80, qa_clean: false })).toBe("escalate");
  });
});
