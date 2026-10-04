import { describe, expect, it } from "vitest";
import { CHECKLIST_LABEL, scoreHookText } from "@/lib/engine";
import {
  FloTaskSchema,
  MockFloProvider,
  NEVER_SAY,
  bannedPhraseIn,
  bountyDraftTask,
  briefTldrTask,
  captionTask,
  classifyComment,
  commentReplyTask,
  generateMockAnswer,
  hookRewriteTask,
  nextActionTask,
  scriptTask,
  tightenHook,
  toFloApp,
  type FloTask,
} from "../index";
import { apps, appOf, bounties, bountyById, formatById, formats } from "./fixtures";

const NOW = "2026-10-03T14:00:00Z";
const provider = new MockFloProvider();
const run = (task: FloTask, attempt = 0) => provider.generate(task, { attempt, useFixtures: false });

const lumi = bountyById("bnty_lumi_editwithme");
const lumiApp = appOf(lumi);

const script = (extra: Partial<Parameters<typeof scriptTask>[0]> = {}) =>
  scriptTask({ bounty: lumi, app: lumiApp, format: formatById("tmpl_screen_reaction"), formats: formats().slice(0, 6), creatorId: "cr_maya", ...extra });

describe("the demo world's data satisfies Flo's schemas", () => {
  it("builds a valid script task from every one of the demo bounties", () => {
    const all = bounties();
    expect(all.length).toBeGreaterThan(40);
    for (const b of all) {
      const task = scriptTask({ bounty: b, app: appOf(b) });
      const parsed = FloTaskSchema.safeParse(task);
      expect(parsed.success, `${b.id}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 2))}`).toBe(true);
    }
  });
  it("builds a valid app context from every demo app", () => {
    for (const a of apps()) expect(toFloApp(a).name.length).toBeGreaterThan(0);
  });
});

describe("determinism", () => {
  const tasks: [string, FloTask][] = [
    ["script", script()],
    ["hook_rewrite", hookRewriteTask({ hook: "Why are we all still using a worse productivity app?", app: lumiApp })],
    ["caption", captionTask({ bounty: lumi, app: lumiApp, creatorCode: "MAYA6" })],
    ["comment_reply", commentReplyTask({ comment: "is this actually sponsored?", app: lumiApp })],
    ["bounty_draft", bountyDraftTask({ input: "https://apps.apple.com/us/app/lumi-ai-photo-editor/id6448900000", now: NOW })],
  ];
  it.each(tasks)("%s: the same request gives the same answer, byte for byte", async (_name, task) => {
    expect(JSON.stringify(await run(task))).toBe(JSON.stringify(await run(task)));
  });
  it.each(tasks.filter(([name]) => name !== "bounty_draft"))("%s: regenerate gives different wording", async (_name, task) => {
    const first = await run(task, 0);
    const second = await run(task, 1);
    expect(second.outputs).not.toEqual(first.outputs);
  });
  it("gives a different script for a different bounty", async () => {
    const other = bountyById("bnty_ironleaf_skipping");
    const a = await run(script());
    const b = await run(scriptTask({ bounty: other, app: appOf(other), format: formatById("tmpl_screen_reaction") }));
    expect(a.outputs).not.toEqual(b.outputs);
  });
  it("reports the mock engine, a latency and a label on everything", async () => {
    for (const [, task] of tasks) {
      const r = await run(task);
      expect(r.model).toBe("flo-mock-1");
      expect(r.source).toBe("mock");
      expect(r.latency_ms).toBeGreaterThan(500);
      expect(r.label.length).toBeGreaterThan(10);
      expect(r.outputs.length).toBeGreaterThan(0);
      expect(r.title.length).toBeGreaterThan(3);
    }
  });
});

describe("script drafting", () => {
  it("writes three options, one line per beat, starting with the chosen format", async () => {
    const r = await run(script());
    expect(r.kind).toBe("script");
    expect(r.outputs).toHaveLength(3);
    expect(r.title).toBe("Three scripts for Edit with me");
    r.outputs.forEach((o, i) => expect(o.startsWith(`Option ${i + 1}: `)).toBe(true));
    expect(r.outputs[0]).toMatch(/^Option 1: Screen record \+ reaction, about \d+ s\n/);
    const names = r.outputs.map((o) => /^Option \d: (.+?), about/.exec(o)?.[1]);
    expect(new Set(names).size).toBe(3);
  });
  it("puts each beat on its own line with the format's timing, in order", async () => {
    const r = await run(script());
    const lines = (r.outputs[0] ?? "").split("\n");
    const beatLines = lines.filter((l) => /\(\d+ to \d+ s\):/.test(l));
    expect(beatLines.length).toBeGreaterThanOrEqual(5);
    let previousEnd = 0;
    for (const l of beatLines) {
      const m = /\((\d+) to (\d+) s\)/.exec(l);
      const start = Number(m?.[1]);
      const end = Number(m?.[2]);
      expect(start).toBe(previousEnd);
      expect(end).toBeGreaterThan(start);
      previousEnd = end;
    }
  });
  it("opens with a hook the engine rates on the 2-second rule, in quotes, on the first beat", async () => {
    const r = await run(script());
    for (const o of r.outputs) {
      const hook = /put the same words on screen: "(.+)"/.exec(o)?.[1] ?? /on the first slide, big and short: "(.+)"/.exec(o)?.[1];
      expect(hook, o).toBeTruthy();
      expect(scoreHookText(hook ?? "").rule.words).toBeGreaterThan(0);
    }
  });
  it("never repeats a hook between options", async () => {
    const r = await run(script());
    const hooks = r.outputs.map((o) => /: "(.+)"/.exec(o)?.[1]);
    expect(new Set(hooks).size).toBe(3);
  });
  it("uses the app's own features, names the app and shows the brief's call to action with the creator's code", async () => {
    const r = await run(script({ creatorCode: "MAYA6" }));
    const text = r.outputs.join("\n");
    expect(text).toContain("Lumi");
    expect(text).toMatch(/one-tap relight|background swap|skin retouch|batch edit 50 photos/);
    expect(text).toContain("Use my code MAYA6 for the trial");
    expect(text).not.toContain("YOURCODE");
  });
  it("keeps YOURCODE when the creator has no code yet", async () => {
    const r = await run(script());
    expect(r.outputs.join("\n")).toContain("YOURCODE");
  });
  it("adds the disclosure line and a brief check to every option", async () => {
    const r = await run(script());
    for (const o of r.outputs) {
      expect(o).toContain(`Caption: ${lumi.brief.disclosure_text}. Studio adds it for you.`);
      expect(o).toMatch(/\nBrief check: /);
      expect(o).toMatch(/#ad/);
    }
  });
  it("tightens the creator's own hook for the first option", async () => {
    const r = await run(script({ hook: "Hey guys, so today I want to show you something about editing photos and honestly it changed everything" }));
    const first = /put the same words on screen: "(.+)"/.exec(r.outputs[0] ?? "")?.[1] ?? "";
    expect(first.toLowerCase()).not.toMatch(/^hey guys/);
    expect(first.split(/\s+/).length).toBeLessThan(14);
  });
  it("supports one or two options and offers one-tap actions", async () => {
    expect((await run(script({ options: 1 }))).outputs).toHaveLength(1);
    expect((await run(script({ options: 2 }))).title).toBe("Two scripts for Edit with me");
    const r = await run(script());
    expect(r.actions).toEqual([{ label: "Send to Studio", kind: "open_studio", payload: "bnty_lumi_editwithme" }, { label: "Copy option 1", kind: "copy", payload: "0" }]);
  });
  it("works with no formats supplied (falls back to the built-in library)", async () => {
    const r = await run(scriptTask({ bounty: lumi, app: lumiApp }));
    expect(r.outputs).toHaveLength(3);
  });
  it("drops an optional offer beat when the brief has no offer, and re-times the rest", async () => {
    const noOffer = scriptTask({ bounty: { ...lumi, brief: { ...lumi.brief, offer_line: undefined } }, app: { ...lumiApp, pricing: { ...lumiApp.pricing, trial_days: 0 } }, format: formatById("tmpl_screen_reaction") });
    const r = await run(noOffer);
    expect(r.outputs[0]).not.toContain("State the trial");
    const ends = [...(r.outputs[0] ?? "").matchAll(/\((\d+) to (\d+) s\)/g)].map((m) => Number(m[2]));
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
  });
  it("flags a beat the brief requires that the format lacks", async () => {
    const r = await run(scriptTask({ bounty: lumi, app: lumiApp, format: formatById("tmpl_hidden_gem") }));
    const check = /Brief check: (.+)/.exec(r.outputs[0] ?? "")?.[1] ?? "";
    expect(check).toMatch(/demo|requires|covers/);
  });
  it("says nothing a brief bans, for every demo bounty", async () => {
    for (const b of bounties()) {
      const r = await run(scriptTask({ bounty: b, app: appOf(b), formats: formats() }));
      for (const o of r.outputs) {
        const hit = bannedPhraseIn(o.replace(/Do not [^\n]*/g, ""), b.brief.banned_claims);
        expect(hit, `${b.id}: ${hit}`).toBeNull();
      }
    }
  });
});

describe("hook rewrites", () => {
  const hook = "Why are we all still using a worse productivity app?";
  const task = hookRewriteTask({ hook, app: appOf(bountyById("bnty_tasklane_focus")) });

  it("gives three distinct openings in the saved-suggestion format", async () => {
    const r = await run(task);
    expect(r.title).toBe("Three sharper openings");
    expect(r.outputs).toHaveLength(3);
    for (const o of r.outputs) expect(o).toMatch(/\((?:Confession|Curiosity gap|Specific number|POV|Direct question|Risk reversal|Pattern interrupt|Your own words), about \d\.\d s to say: (?:it lands by 2 seconds\.|trim a word or two to land by 2 seconds\.)\)$/);
    expect(new Set(r.outputs).size).toBe(3);
  });
  it("tells the truth about timing, using the engine's own rule", async () => {
    const r = await run(task);
    for (const o of r.outputs) {
      const text = /^(.*) \([^()]+\)$/.exec(o)?.[1] ?? "";
      const said = /about (\d\.\d) s/.exec(o)?.[1];
      const rule = scoreHookText(text).rule;
      expect(Number(said)).toBeCloseTo(rule.est_seconds, 1);
      expect(o.includes("it lands by 2 seconds.")).toBe(rule.passes);
    }
  });
  it("names the app and never says an app it was not given", async () => {
    const r = await run(task);
    expect(r.outputs.some((o) => o.includes("Tasklane"))).toBe(true);
    expect(r.outputs.join(" ")).not.toContain("{");
  });
  it("explains the original's checklist score in the notes", async () => {
    const r = await run(task);
    expect(r.notes[0]).toMatch(/^Your hook scores \d+ now \([A-E], a checklist score\)\./);
    expect(r.notes[0]).toContain(String(scoreHookText(hook).score));
  });
  it("can be asked for one pattern", async () => {
    const r = await run(hookRewriteTask({ hook, app: appOf(bountyById("bnty_tasklane_focus")), targetType: "confession" }));
    expect(r.title).toBe("Three confession openings");
    for (const o of r.outputs) expect(o).toContain("(Confession,");
  });
  it("respects the limit and the one-tap actions", async () => {
    const r = await run({ ...task, limit: 2 });
    expect(r.outputs).toHaveLength(2);
    expect(r.actions.map((a) => a.kind)).toEqual(["apply_fix", "copy"]);
  });
  it("tightens a rambling opening without losing the point", () => {
    expect(tightenHook("Hey guys, so today I want to show you how I finally planned my whole week in one minute")).toBe("How I finally planned my whole week in one minute.");
    expect(tightenHook("Okay so this app is wild, and I have been using it every day")).toBe("This app is wild.");
    expect(tightenHook("I was wrong about planners.")).toBeNull();
    expect(tightenHook("   ")).toBeNull();
  });
});

describe("brief TL;DR", () => {
  it("is five labelled lines a creator can read in ten seconds", async () => {
    const r = await run(briefTldrTask({ bounty: lumi, app: lumiApp }));
    expect(r.title).toBe("TL;DR: Edit with me");
    expect(r.outputs).toHaveLength(5);
    expect(r.outputs.map((o) => o.split(":")[0])).toEqual(["What to make", "Must say and show", "Pay", "Rights", "Disclosure and timing"]);
  });
  it("states pay in the house wording, and only as an estimate", async () => {
    const stacked = bounties().find((b) => b.type === "stacked" && b.cpm_cents > 0);
    expect(stacked).toBeDefined();
    const r = await run(briefTldrTask({ bounty: stacked as (typeof bounties extends () => (infer B)[] ? B : never), app: appOf(stacked as never) }));
    const pay = r.outputs[2] ?? "";
    expect(pay).toMatch(/\$\d+\.\d\d per 1,000 views/);
    expect(pay).toMatch(/Capped at \$\d+/);
    expect(pay).toContain("(an estimate)");
    expect(pay).not.toMatch(/guarantee/i);
  });
  it("describes a CPA bounty as outcomes only, a direct bounty as a flat fee", async () => {
    const cpa = bounties().find((b) => b.type === "cpa");
    const direct = bounties().find((b) => b.type === "direct");
    const a = await run(briefTldrTask({ bounty: cpa as never, app: appOf(cpa as never) }));
    expect(a.outputs[2]).toMatch(/^Pay: No view pay\./);
    expect(a.outputs[2]).toContain("tracked link and code conversions only");
    const d = await run(briefTldrTask({ bounty: direct as never, app: appOf(direct as never) }));
    expect(d.outputs[2]).toMatch(/^Pay: \$\d+\.\d\d flat per video\./);
  });
  it("covers rights and the disclosure and review promise", async () => {
    const r = await run(briefTldrTask({ bounty: lumi, app: lumiApp }));
    expect(r.outputs[3]).toMatch(/AI likeness is off/);
    expect(r.outputs[4]).toContain("#ad Paid partnership with Lumi");
    expect(r.outputs[4]).toContain("decides within 72 hours, with a reason code if it is a no");
  });
  it("offers Make it and Save for later", async () => {
    const r = await run(briefTldrTask({ bounty: lumi, app: lumiApp }));
    expect(r.actions.map((a) => a.kind)).toEqual(["open_studio", "save_bounty"]);
  });
});

describe("captions", () => {
  const task = captionTask({ bounty: lumi, app: lumiApp, creatorCode: "MAYA6" });
  it("opens every caption with the disclosure line, has one call to action and at most three hashtags", async () => {
    const r = await run(task);
    expect(r.outputs).toHaveLength(3);
    for (const o of r.outputs) {
      expect(o.startsWith("#ad Paid partnership with Lumi\n")).toBe(true);
      expect(o).toContain("Use my code MAYA6.");
      expect(o).not.toMatch(/link in my bio/i);
      const tags = o.split("\n").slice(1).join(" ").match(/#[a-z0-9]+/gi) ?? [];
      expect(tags.length).toBeLessThanOrEqual(3);
      expect(tags.filter((t) => t.toLowerCase() === "#ad")).toHaveLength(0);
    }
  });
  it("falls back to the link in bio, and the free trial line when the app has one", async () => {
    const r = await run(captionTask({ bounty: lumi, app: lumiApp }));
    expect(r.outputs.every((o) => /Try it free, link in my bio\./.test(o))).toBe(true);
  });
  it("never says anything banned", async () => {
    for (const b of bounties().slice(0, 25)) {
      const r = await run(captionTask({ bounty: b, app: appOf(b) }));
      for (const o of r.outputs) expect(bannedPhraseIn(o, b.brief.banned_claims), `${b.id}: ${o}`).toBeNull();
    }
  });
  it("warns when the first line runs past the platform's fold", async () => {
    const long = captionTask({ bounty: { ...lumi, brief: { ...lumi.brief, disclosure_text: `#ad Paid partnership with Lumi and ${"a very long disclosure ".repeat(6)}` } }, app: lumiApp, platform: "instagram" });
    const r = await run(long);
    expect(r.notes.some((n) => n.includes("folds a caption"))).toBe(true);
  });
  it("offers to use the first caption", async () => {
    expect((await run(task)).actions[0]).toEqual({ label: "Use caption 1", kind: "apply_fix", payload: "0" });
  });
});

describe("comment replies", () => {
  const classify: [string, ReturnType<typeof classifyComment>][] = [
    ["is this an ad?", "sponsored"],
    ["are you being paid for this", "sponsored"],
    ["#ad lol", "sponsored"],
    ["does this actually work or is it a scam", "skeptical"],
    ["how much is it", "price"],
    ["is it free?", "price"],
    ["what app is this", "how_to"],
    ["link??", "how_to"],
    ["this is trash", "critical"],
    ["love this so much", "praise"],
    ["can it export to pdf", "feature"],
    ["first", "other"],
    ["How much is the paid version?", "price"],
  ];
  it.each(classify)("reads %j as %s", (comment, intent) => {
    expect(classifyComment(comment)).toBe(intent);
  });
  it("always answers a question about sponsorship with a plain yes", async () => {
    const r = await run(commentReplyTask({ comment: "is this sponsored??", app: lumiApp }));
    expect(r.outputs).toHaveLength(3);
    for (const o of r.outputs) expect(o).toMatch(/paid partnership|an ad|#ad/i);
    expect(r.notes[0]).toContain("plain yes");
  });
  it("keeps replies short and never promises results", async () => {
    for (const [comment] of classify) {
      const r = await run(commentReplyTask({ comment, app: lumiApp, creatorCode: "MAYA6" }));
      for (const o of r.outputs) {
        expect(o.length, o).toBeLessThanOrEqual(200);
        expect(bannedPhraseIn(o)).toBeNull();
        expect(o).not.toMatch(/\$\d/);
      }
    }
  });
  it("never invents a price", async () => {
    const r = await run(commentReplyTask({ comment: "how much does it cost?", app: lumiApp }));
    for (const o of r.outputs) expect(o).not.toMatch(/\$\d/);
    expect(r.outputs.join(" ")).toMatch(/listing/i);
  });
  it("shares the creator's code when asked for the link", async () => {
    const r = await run(commentReplyTask({ comment: "where do I get it?", app: lumiApp, creatorCode: "MAYA6" }));
    expect(r.outputs.join(" ")).toContain("MAYA6");
  });
  it("suggests answering with a video, and stores as a caption", async () => {
    const r = await run(commentReplyTask({ comment: "does it work?", app: lumiApp }));
    expect(r.kind).toBe("caption");
    expect(r.task_kind).toBe("comment_reply");
    expect(r.actions).toContainEqual({ label: "Answer with a video", kind: "open_studio", payload: "tmpl_reply_comment" });
  });
  it("is deterministic and rotates which reply leads on regenerate", async () => {
    const task = commentReplyTask({ comment: "how do I get it", app: lumiApp });
    const a = await run(task, 0);
    const b = await run(task, 1);
    expect([...a.outputs].sort()).toEqual([...b.outputs].sort());
    expect(a.outputs[0]).not.toBe(b.outputs[0]);
  });
});

describe("score fixes", () => {
  const items = [
    { label: "Lands inside 2 seconds", points: 6, max: 25, passed: false, reason: "The first line is 9 words, about 3.0s. The target is 2s (about 6 words).", fix: "Cut the first sentence to 6 words or fewer, then add the detail after it." },
    { label: "Specific, not vague", points: 6, max: 15, passed: false, reason: "No number or timeframe. Specific beats clever.", fix: 'Add a real number or timeframe: "12 minutes a day", "30 days", "$0".' },
    { label: "Sounds like a person", points: 0, max: 10, passed: false, reason: "No I or you. It reads like an ad.", fix: 'Say "I" or "you": "I tried...", "you finally...".' },
    { label: "Uses a proven hook pattern", points: 0, max: 25, passed: false, reason: "No proven pattern found.", fix: "Try a confession." },
    { label: "No risky claims", points: 5, max: 5, passed: true, reason: "No risky claims." },
  ];
  const base = { kind: "score_fix" as const, subject: "hook" as const, audience: "creator" as const, points: 41, band: "D" as const, items, submission_id: "sub_0051" };

  it("picks the three fixes worth the most points, biggest first", async () => {
    const r = await run(base);
    expect(r.title).toBe("Your Hook Score is 41. Three fixes");
    expect(r.outputs).toHaveLength(3);
    expect(r.outputs[0]).toContain("No proven pattern found. Fix: Try a confession.");
    expect(r.outputs[1]).toContain("9 words");
    expect(r.actions).toEqual([{ label: "Apply the first fix", kind: "apply_fix", payload: "sub_0051" }]);
  });
  it("labels it a checklist score and says how far the next band is", async () => {
    const r = await run(base);
    expect(r.label).toBe(CHECKLIST_LABEL);
    expect(r.notes[0]).toContain("Hook Score 41 is a D");
    expect(r.notes[1]).toMatch(/worth up to \d+ points\. \d+ more points reach a C\./);
  });
  it("speaks to a brand reviewer differently", async () => {
    const r = await run({ ...base, audience: "brand", band: "B", points: 78, subject: "flow" });
    expect(r.title).toBe("Why this video scores B");
    expect(r.surface).toBe("review");
    expect(r.actions).toEqual([{ label: "Request changes with these notes", kind: "draft_feedback", payload: "sub_0051" }]);
  });
  it("has nothing to fix when everything passes", async () => {
    const r = await run({ ...base, points: 100, band: "A", items: items.map((i) => ({ ...i, passed: true, points: i.max })) });
    expect(r.title).toBe("Your Hook Score is 100. Nothing to fix");
    expect(r.outputs).toEqual(["Everything on the checklist passes. Post it once the brief check is green."]);
    expect(r.actions).toEqual([]);
  });
});

describe("rate advice", () => {
  const base = { kind: "rate_advice" as const, videos: 2, paid_usage_days: 90, suggested_cents: 9500, p25_cents: 8000, p75_cents: 11500, basis: "Median 14.2k views x $1.73 market CPM x 3.9 for 90-day paid usage, Silver 1.00x.", renewal_pct: 0.25 };
  it("explains the suggested price, a bundle and the renewal, in the saved-suggestion style", async () => {
    const r = await run(base);
    expect(r.title).toBe("What to charge for two videos with paid usage");
    expect(r.outputs[0]).toBe("The market-suggested price for one video with 90 days of paid usage is about $95.00 (middle band $80.00 to $115.00). Basis: Median 14.2k views x $1.73 market CPM x 3.9 for 90-day paid usage, Silver 1.00x.");
    expect(r.outputs[1]).toBe("For two videos, $190.00 is the median ask; $170.00 is a fair bundle price that rewards the brand for booking all two.");
    expect(r.outputs[2]).toBe("Price paid usage up front: renewal at 25% of the base fee per extra 30 days is $23.75 on one video.");
    expect(r.actions).toEqual([{ label: "Set my rate card", kind: "set_rate", payload: "9500" }]);
  });
  it("gives a floor for one video and tells an organic-only creator to quote ads separately", async () => {
    const r = await run({ ...base, videos: 1, paid_usage_days: 0 });
    expect(r.title).toBe("What to charge for one video");
    expect(r.outputs[1]).toBe("Do not go below $80.00 for one video: that is the low end of what comparable creators ask.");
    expect(r.outputs[2]).toMatch(/quote that separately/);
    expect(r.label).toMatch(/estimate/i);
  });
});

describe("what to do today", () => {
  it("lists a creator's signals in priority order, at most three, without guilt", async () => {
    const r = await run(nextActionTask({ role: "creator", signals: { drop_state: "live", drop_spots_left: 5, posts_counting: 2, streak_weeks: 5, freezes_banked: 1, posted_this_week: false, avg_hook_seconds: 2.4, pending_cents: 18620, next_clear_label: "clears Fri 2:00 PM" } }));
    expect(r.outputs).toHaveLength(3);
    expect(r.outputs[0]).toBe("Today's Daily Drop is live with 5 spots left. The count is real, so claim a spot if a bounty fits.");
    expect(r.outputs.join(" ")).not.toMatch(/don't break|lose your streak|hurry|last chance/i);
    expect(r.title).toBe("What to do today");
  });
  it("always dates pending money", async () => {
    const r = await run(nextActionTask({ role: "creator", signals: { pending_cents: 18620, next_clear_label: "clears Fri 2:00 PM" } }));
    expect(r.outputs[0]).toBe("$186.20 is pending and clears Fri 2:00 PM.");
    const none = await run(nextActionTask({ role: "creator", signals: { pending_cents: 18620 } }));
    expect(none.outputs.join(" ")).not.toMatch(/pending/);
  });
  it("reads a hook that is slower than two seconds the way the saved suggestions do", async () => {
    const r = await run(nextActionTask({ role: "creator", signals: { avg_hook_seconds: 2.4 } }));
    expect(r.outputs[0]).toBe("Your last openings landed at 2.4 seconds on average. The Hook Score gives full points at 2.0, so tighten the first line.");
  });
  it("tells a brand about the SLA clock and unfunded drafts", async () => {
    const r = await run(nextActionTask({ role: "brand_member", signals: { submissions_waiting: 14, oldest_waiting_hours: 53, drafts_unfunded: 1 } }));
    expect(r.outputs[0]).toContain("14 submissions waiting for a decision.");
    expect(r.outputs[0]).toContain("past 48 it counts as stale");
    expect(r.outputs[1]).toContain("1 draft bounty waiting on funding");
    expect(r.actions.map((a) => a.kind)).toEqual(["open_review", "open_builder"]);
  });
  it("says so when nothing needs attention", async () => {
    const r = await run(nextActionTask({ role: "brand_member", signals: {} }));
    expect(r.outputs).toHaveLength(1);
    expect(r.outputs[0]).toMatch(/^Nothing is waiting on you\./);
  });
});

describe("bounty drafts from an App Store listing", () => {
  const link = "https://apps.apple.com/us/app/lumi-ai-photo-editor/id6448900000";
  const task = bountyDraftTask({ input: link, now: NOW });

  it("drafts a bounty that Brief Lint lets through, with the engine's numbers", async () => {
    const r = await run(task);
    const d = r.draft;
    expect(d).toBeDefined();
    if (!d) return;
    expect(d.lint.can_publish).toBe(true);
    expect(d.lint.blockers).toBe(0);
    expect(d.type).toBe("stacked");
    expect(d.app.name).toBe("Lumi AI Photo Editor");
    expect(d.category).toBe("ai_photo");
    expect(d.cpm_cents).toBeGreaterThanOrEqual(50);
    expect([d.cpa_install_cents, d.cpa_trial_cents, d.cpa_paid_cents]).toEqual([40, 150, 400]);
    expect(d.per_video_cap_cents).toBe(25000);
    expect(d.budget_cents).toBe(150000);
    expect(d.funding.escrow_total_cents).toBe(d.funding.budget_cents + d.funding.fee_reserve_cents);
    expect(d.funding.fee_reserve_cents).toBe(18000);
    expect(d.rights_card.paid_ads_days).toBe(90);
    expect(d.rights_card.ai_likeness).toBe(false);
    expect(d.brief.disclosure_text).toBe("#ad Paid partnership with Lumi AI Photo Editor");
    expect(d.hooks).toHaveLength(10);
    expect(d.format_ids.length).toBeGreaterThanOrEqual(3);
    expect(d.pay_math?.median_cents).toBeGreaterThan(0);
    expect(d.starts_at).toBe(NOW);
    expect(d.ends_at).toBe("2026-11-02T14:00:00Z");
  });
  it("describes the draft in five lines in the saved-suggestion style", async () => {
    const r = await run(task);
    expect(r.title).toBe("Draft bounty for Lumi AI Photo Editor");
    expect(r.outputs).toHaveLength(5);
    expect(r.outputs[0]).toMatch(/^Title: .+/);
    expect(r.outputs[1]).toMatch(/^Brief: .+ Open with a hook such as: ".+"$/);
    expect(r.outputs[2]).toMatch(/^Suggested pay: \$\d+\.\d\d per 1,000 verified views \(the median clearing CPM for AI photo & video\), \$0\.40 per install, \$1\.50 per trial, \$4\.00 per paid, capped at \$250 per video\.$/);
    expect(r.outputs[3]).toMatch(/^Budget: \$1,500\.00 funds about \d+(?:\.\d)?K views of CPM pay at the clearing price\. Rights: 90 days of paid usage, organic always included\.$/);
    expect(r.outputs[4]).toMatch(/^Recommended formats: .+\. Brief Lint (?:passes|blocks)/);
    expect(r.actions.map((a) => a.kind)).toEqual(["apply_draft", "open_builder"]);
  });
  it("explains every number in the notes and says it is a draft", async () => {
    const r = await run(task);
    expect(r.notes.some((n) => n.startsWith("Price:"))).toBe(true);
    expect(r.notes.some((n) => n.startsWith("Pay stack:"))).toBe(true);
    expect(r.notes.some((n) => n.startsWith("Funding:"))).toBe(true);
    expect(r.notes.some((n) => n.startsWith("Rights:"))).toBe(true);
    expect(r.label).toMatch(/draft/i);
  });
  it("waives the fee and adds the match on a first bounty, never more than $500 or half the pool", async () => {
    const r = await run(bountyDraftTask({ input: link, now: NOW, firstBounty: true }));
    expect(r.draft?.funding.fee_reserve_cents).toBe(0);
    expect(r.draft?.funding.matched_cents).toBe(50000);
    const small = await run(bountyDraftTask({ input: link, now: NOW, firstBounty: true, budgetCents: 40000 }));
    expect(small.draft?.funding.matched_cents).toBe(20000);
    expect(r.notes.find((n) => n.startsWith("Funding:"))).toContain("fee is waived");
  });
  it("prices a bigger budget and a paid plan from the engine", async () => {
    const r = await run(bountyDraftTask({ input: link, now: NOW, budgetCents: 500000, plan: "pro" }));
    expect(r.draft?.funding.fee_reserve_cents).toBe(50000);
    expect(r.draft?.estimate.views).toBeGreaterThan((await run(task)).draft?.estimate.views ?? 0);
  });
  it("uses the app's own features and category when given", async () => {
    const r = await run(bountyDraftTask({ input: "Parlo", now: NOW, app: { ...appOf(bountyById("bnty_parlo_spoke")), features: ["Pocket tutor", "Speaking practice"] } }));
    expect(r.draft?.category).toBe("language");
    expect(r.draft?.brief.beats.find((b) => b.beat === "demo")?.label).toBe("Demo Pocket tutor");
    expect(r.draft?.app.features).toEqual(["Pocket tutor", "Speaking practice"]);
  });
  it("passes lint for every demo app, whatever the category", async () => {
    for (const a of apps()) {
      const r = await run(bountyDraftTask({ input: a.store_url, now: NOW, app: a }));
      expect(r.draft?.lint.can_publish, `${a.name}: ${JSON.stringify(r.draft?.lint.findings.filter((f) => f.severity === "blocker"))}`).toBe(true);
    }
  });
  it("is never replayed from a saved suggestion (its numbers must be the engine's)", async () => {
    const saved = new MockFloProvider({ suggestions: [{ id: "flo_x", surface: "builder", kind: "bounty_draft", brand_id: "br_lumi", context_kind: "app", context_id: "app_lumi", prompt: "x", title: "Saved", outputs: ["saved"], actions: [], model: "flo-mock-1", latency_ms: 1, created_at: NOW }] });
    const r = await saved.generate(bountyDraftTask({ input: link, now: NOW, app: lumiApp }));
    expect(r.source).toBe("mock");
    expect(r.draft).toBeDefined();
  });
  it("changes the working title on regenerate but never a number", async () => {
    const a = await run(task, 0);
    const b = await run(task, 1);
    expect(b.draft?.cpm_cents).toBe(a.draft?.cpm_cents);
    expect(b.draft?.funding).toEqual(a.draft?.funding);
    expect(a.draft?.title === b.draft?.title && a.outputs[1] === b.outputs[1]).toBe(false);
  });
});

describe("the never-say list", () => {
  it("catches whole phrases and nothing else", () => {
    expect(bannedPhraseIn("This is guaranteed to work")).toBe("guaranteed");
    expect(bannedPhraseIn("passive income, anyone?")).toBe("passive income");
    expect(bannedPhraseIn("the guarantee-free trial")).toBe("guarantee");
    expect(bannedPhraseIn("Edit your photos in one tap")).toBeNull();
    expect(bannedPhraseIn("I used it for a week", ["a week"])).toBe("a week");
    expect(NEVER_SAY.length).toBeGreaterThan(5);
  });
});

describe("generateMockAnswer", () => {
  it("covers every kind of task", () => {
    const tasks: FloTask[] = [
      script(),
      hookRewriteTask({ hook: "Wait until you see this", app: lumiApp }),
      briefTldrTask({ bounty: lumi, app: lumiApp }),
      captionTask({ bounty: lumi, app: lumiApp }),
      commentReplyTask({ comment: "nice", app: lumiApp }),
      { kind: "score_fix", subject: "flow", audience: "creator", points: 70, band: "C", items: [] },
      { kind: "rate_advice", videos: 1, paid_usage_days: 0, suggested_cents: 5000, p25_cents: 4000, p75_cents: 6000, basis: "test", renewal_pct: 0.25 },
      nextActionTask({ role: "creator", signals: {} }),
      bountyDraftTask({ input: "Parlo", now: NOW }),
    ];
    const kinds = new Set(tasks.map((t) => t.kind));
    expect(kinds.size).toBe(9);
    for (const t of tasks) expect(generateMockAnswer(t).outputs.length, t.kind).toBeGreaterThan(0);
  });
});
