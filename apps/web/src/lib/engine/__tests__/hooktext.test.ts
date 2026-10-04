import { describe, expect, it } from "vitest";
import { HOOK_TYPES, type HookType } from "@/lib/contract/types";
import { CHECKLIST_LABEL } from "../constants";
import {
  HOOK_LIBRARY,
  HOOK_TARGET_SECONDS,
  MAX_SCORE_WITH_RISKY_CLAIM,
  WORDS_PER_SECOND,
  detectPatterns,
  fillHook,
  firstSentence,
  scoreHookText,
  suggestRewrites,
  twoSecondRule,
} from "../hooktext";

const types = (text: string): HookType[] => detectPatterns(text);

describe("pattern detection", () => {
  it("finds confessions", () => {
    for (const t of ["I was wrong about workout apps.", "I didn't expect to use this every day.", "Okay, I owe this app an apology.", "I have to admit something.", "I deleted every other budgeting app.", "Unpopular opinion: I like paywalls."]) {
      expect(types(t)).toContain("confession");
    }
  });

  it("finds curiosity gaps", () => {
    for (const t of ["Wait until you see what this app did.", "Nobody told me it could do this.", "Here's what happened after one week.", "The one setting nobody changes.", "This is why my mornings changed.", "You won't believe this one.", "Turns out it was free all along", "I found something..."]) {
      expect(types(t)).toContain("curiosity_gap");
    }
  });

  it("finds specific numbers", () => {
    for (const t of ["12 minutes a day.", "I saved $40 in a week.", "30 days. One app.", "Three ways to edit faster.", "It cut my edit time by 80%.", "5 apps tested."]) {
      expect(types(t)).toContain("specific_number");
    }
    expect(types("Download this app")).not.toContain("specific_number");
  });

  it("finds POV hooks", () => {
    for (const t of ["POV: you finally found a workout app.", "pov: it is Monday", "When you finally find the right app", "That moment when the edit is done"]) {
      expect(types(t)).toContain("pov");
    }
  });

  it("finds direct questions", () => {
    for (const t of ["Why is nobody talking about this app?", "Still editing by hand", "Do you edit on your phone?", "How do I fix this", "Is this app worth it?"]) {
      expect(types(t)).toContain("direct_question");
    }
  });

  it("finds risk reversals", () => {
    for (const t of ["I didn't pay a cent for the first week.", "Try it free.", "No card needed.", "Cancel anytime.", "There's nothing to lose.", "Free for 7 days."]) {
      expect(types(t)).toContain("risk_reversal");
    }
  });

  it("finds pattern interrupts at the start", () => {
    expect(types("Wait. Stop scrolling.")).toContain("pattern_interrupt");
    expect(types("Hold on, watch this")).toContain("pattern_interrupt");
    expect(types("No way this works")).toContain("pattern_interrupt");
    expect(types("This is not an interrupt")).not.toContain("pattern_interrupt");
  });

  it("finds nothing in a plain statement", () => {
    expect(types("This app edits your photos")).toEqual([]);
    expect(types("")).toEqual([]);
  });

  it("can find several patterns in one hook", () => {
    expect(types("12 minutes a day, and here's what changed.").sort()).toEqual(["curiosity_gap", "specific_number"].sort());
  });
});

describe("the 2-second rule", () => {
  it("reads the first sentence only", () => {
    expect(firstSentence("12 minutes a day. Here's what changed.")).toBe("12 minutes a day.");
    expect(firstSentence("Why is nobody talking about this app? It's free.")).toBe("Why is nobody talking about this app?");
    expect(firstSentence("Wait...  what")).toBe("Wait...");
    expect(firstSentence("No punctuation here")).toBe("No punctuation here");
    expect(firstSentence("POV: you finally found an app you keep.")).toBe("POV: you finally found an app you keep.");
    expect(firstSentence("It saved 3.5 hours. Wow.")).toBe("It saved 3.5 hours.");
    expect(firstSentence("  spaced   out  ")).toBe("spaced out");
  });

  it("times words at 3 per second and passes at 2 seconds", () => {
    expect(WORDS_PER_SECOND).toBe(3);
    expect(HOOK_TARGET_SECONDS).toBe(2);
    expect(twoSecondRule("I was wrong about workout apps.")).toMatchObject({ words: 6, est_seconds: 2, passes: true, target_words: 6 });
    expect(twoSecondRule("Why is nobody talking about this app?")).toMatchObject({ words: 7, est_seconds: 2.3, passes: false });
    expect(twoSecondRule("").passes).toBe(false);
  });
});

describe("scoreHookText", () => {
  it("scores a strong confession in band A with every item explained", () => {
    const r = scoreHookText("I was wrong about workout apps.");
    expect(r.score).toBe(87);
    expect(r.band).toBe("A");
    expect(r.primary_pattern).toBe("confession");
    expect(r.items.map((i) => [i.id, i.points, i.max])).toEqual([
      ["pattern", 25, 25],
      ["two_second_rule", 25, 25],
      ["specificity", 6, 15],
      ["personal", 10, 10],
      ["open_loop", 6, 10],
      ["no_filler_opening", 10, 10],
      ["safe_claims", 5, 5],
    ]);
    expect(r.items.reduce((s, i) => s + i.max, 0)).toBe(100);
    expect(r.items.every((i) => i.reason.length > 0)).toBe(true);
    expect(r.label).toBe(CHECKLIST_LABEL);
    expect(r.flags).toEqual([]);
    expect(r.capped).toBe(false);
  });

  it("gives items a fix only where points were lost, biggest loss first in suggestions", () => {
    const r = scoreHookText("I was wrong about workout apps.");
    expect(r.items[0].fix).toBeUndefined();
    expect(r.items[2].fix).toMatch(/real number/);
    expect(r.suggestions).toHaveLength(2);
    expect(r.suggestions[0]).toMatch(/real number/);
  });

  it("scores a library hook with a number and a gap highly", () => {
    const r = scoreHookText("12 minutes a day. Here's what changed.");
    expect(r.score).toBe(90);
    expect(r.patterns.sort()).toEqual(["curiosity_gap", "specific_number"].sort());
    expect(r.rule.words).toBe(4);
  });

  it("penalises a long first sentence by the 2-second rule", () => {
    const short = scoreHookText("I was wrong about workout apps.");
    const long = scoreHookText("I was so wrong about workout apps for such a long time until I tried this one.");
    expect(long.items[1].points).toBeLessThan(short.items[1].points);
    expect(long.items[1].reason).toMatch(/target is 2s \(about 6 words\)/);
    expect(long.items[1].fix).toMatch(/6 words or fewer/);
    // the graded steps
    const pointsFor = (words: number) => scoreHookText(`${Array.from({ length: words }, () => "word").join(" ")}.`).items[1].points;
    expect([6, 7, 8, 9, 10, 12, 13].map(pointsFor)).toEqual([25, 19, 12, 12, 6, 6, 0]);
  });

  it("scores a filler opening in band E and says why", () => {
    const r = scoreHookText("Hey guys, today I'm going to show you an amazing app");
    expect(r.band).toBe("E");
    expect(r.items.find((i) => i.id === "no_filler_opening")?.points).toBe(0);
    expect(r.items.find((i) => i.id === "specificity")?.reason).toMatch(/Vague hype words/);
    expect(r.items.find((i) => i.id === "pattern")?.points).toBe(0);
    for (const opener of ["Hi everyone, ", "In this video I ", "Welcome back to my channel, ", "So today we ", "Let me show you "]) {
      expect(scoreHookText(`${opener}tried an app`).items.find((i) => i.id === "no_filler_opening")?.points).toBe(0);
    }
    expect(scoreHookText("I tried an app").items.find((i) => i.id === "no_filler_opening")?.points).toBe(10);
  });

  it("caps a hook with a risky claim at a D and flags it, FTC-careful", () => {
    const r = scoreHookText("This app will make you $5000 a month, guaranteed!");
    expect(r.capped).toBe(true);
    expect(r.score).toBe(MAX_SCORE_WITH_RISKY_CLAIM);
    expect(r.band).toBe("D");
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]).toMatch(/risky/);
    expect(r.items.find((i) => i.id === "safe_claims")?.points).toBe(0);
    for (const claim of ["Passive income while you sleep", "Quit your job with this app", "It cures stress", "Lose 10 lbs in a week", "100% guaranteed results", "Get rich with this"]) {
      expect(scoreHookText(claim).flags).toHaveLength(1);
    }
    expect(scoreHookText("I made $40 in my first week").flags).toEqual([]);
  });

  it("does not cap a low-scoring risky hook (the cap only lowers scores)", () => {
    const r = scoreHookText("guaranteed");
    expect(r.capped).toBe(false);
    expect(r.score).toBeLessThanOrEqual(MAX_SCORE_WITH_RISKY_CLAIM);
  });

  it("handles an empty hook honestly", () => {
    const r = scoreHookText("   ");
    expect(r).toMatchObject({ score: 0, band: "E", words: 0, patterns: [], primary_pattern: null, capped: false });
    expect(r.suggestions).toEqual(["Write the first line of your video, then score it."]);
    expect(r.items).toHaveLength(7);
  });

  it("is deterministic and case-insensitive", () => {
    expect(scoreHookText("I WAS WRONG ABOUT WORKOUT APPS.").score).toBe(scoreHookText("i was wrong about workout apps.").score);
    expect(scoreHookText("I was wrong about workout apps.")).toEqual(scoreHookText("I was wrong about workout apps."));
  });

  it("never scores outside 0 to 100", () => {
    for (const t of ["x", "I was wrong about 12 apps. Here's what happened?", "wait wait wait wait wait wait wait wait wait wait wait wait wait wait", "$$$"]) {
      const r = scoreHookText(t);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it("counts a number without a unit as partial specificity", () => {
    expect(scoreHookText("I have 3").items.find((i) => i.id === "specificity")?.reason).toMatch(/no unit/);
  });
});

describe("hook library and rewrites", () => {
  it("has hooks for every one of the seven hook types", () => {
    expect(Object.keys(HOOK_LIBRARY).sort()).toEqual([...HOOK_TYPES].sort());
    for (const type of HOOK_TYPES) expect(HOOK_LIBRARY[type].length).toBeGreaterThanOrEqual(3);
  });

  it("fills slots and falls back to neutral words", () => {
    expect(fillHook("Why is nobody talking about {app}?", { app: "Lumi" })).toBe("Why is nobody talking about Lumi?");
    expect(fillHook("Why is nobody talking about {app}?")).toBe("Why is nobody talking about this app?");
    expect(fillHook("{number} days with {app}.", { number: "30", app: "Lumi" })).toBe("30 days with Lumi.");
    expect(fillHook("No slots here")).toBe("No slots here");
  });

  it("scores every filled library hook at least a C, and detects the type it was written for", () => {
    for (const [type, templates] of Object.entries(HOOK_LIBRARY) as [HookType, readonly string[]][]) {
      for (const tpl of templates) {
        const text = fillHook(tpl, { app: "Lumi", category: "photo editing", feature: "AI headshots", goal: "editing photos", number: "12" });
        const r = scoreHookText(text);
        expect(r.score, text).toBeGreaterThanOrEqual(55);
        expect(r.patterns, text).toContain(type);
      }
    }
  });

  it("suggests rewrites best first, deterministic, with scores", () => {
    const a = suggestRewrites({ slots: { app: "Lumi", category: "photo editing" } });
    expect(a).toHaveLength(5);
    for (let i = 1; i < a.length; i += 1) expect(a[i - 1].score).toBeGreaterThanOrEqual(a[i].score);
    expect(a[0].text).not.toMatch(/\{/);
    expect(a.every((r) => r.score === scoreHookText(r.text).score)).toBe(true);
    expect(suggestRewrites({ slots: { app: "Lumi", category: "photo editing" } })).toEqual(a);
  });

  it("can skip a type and limit the count", () => {
    const r = suggestRewrites({ limit: 40, avoid_types: ["pattern_interrupt", "pov"] });
    expect(r.some((x) => x.pattern === "pov" || x.pattern === "pattern_interrupt")).toBe(false);
    expect(r.length).toBe(Object.entries(HOOK_LIBRARY).filter(([t]) => t !== "pov" && t !== "pattern_interrupt").reduce((n, [, l]) => n + l.length, 0));
    expect(suggestRewrites({ limit: 0 })).toEqual([]);
    expect(suggestRewrites({ limit: 2 })).toHaveLength(2);
  });
});
