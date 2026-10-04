import { describe, expect, it } from "vitest";
import { CATEGORIES, type Category, type HookType } from "@/lib/contract/types";
import { AUDIT_LABEL, generateAudit, inferCategory, makeArtSeed, parseAppInput, type AuditCreatorCandidate } from "../audit";
import { CATEGORY_BASELINES } from "../market";
import { lintBrief } from "../brieflint";
import { cardProcessing } from "../pricing";
import { buildRightsCard } from "../rights";
import { seededRng } from "../rng";
import { NOW } from "./helpers";

describe("parseAppInput", () => {
  it("reads an App Store link: the name from the slug and the store id", () => {
    expect(parseAppInput("https://apps.apple.com/us/app/lumi-ai-photo-editor/id6741234567")).toEqual({
      kind: "url",
      store: "app_store",
      name: "Lumi AI Photo Editor",
      slug: "lumi-ai-photo-editor",
      store_id: "6741234567",
    });
    expect(parseAppInput("  https://www.apps.apple.com/app/stride-fit/id1234567890?mt=8  ")).toMatchObject({ store: "app_store", name: "Stride Fit", store_id: "1234567890" });
  });

  it("copes with an App Store link that has no name, and with iTunes links", () => {
    expect(parseAppInput("https://apps.apple.com/app/id123456789")).toMatchObject({ store: "app_store", name: "Your app", store_id: "123456789" });
    expect(parseAppInput("https://itunes.apple.com/us/app/calm-nights/id987654321")).toMatchObject({ store: "app_store", name: "Calm Nights" });
  });

  it("reads a Google Play link, another link, or a plain name", () => {
    expect(parseAppInput("https://play.google.com/store/apps/details?id=com.example.lumiphoto")).toEqual({ kind: "url", store: "google_play", name: "Lumiphoto", slug: "lumiphoto", store_id: "com.example.lumiphoto" });
    expect(parseAppInput("https://www.lumi.example/photo")).toMatchObject({ kind: "url", store: "other", name: "Lumi", slug: "lumi" });
    expect(parseAppInput("  lumi ai photo editor ")).toEqual({ kind: "name", store: "none", name: "Lumi AI Photo Editor", slug: "lumi-ai-photo-editor" });
    expect(parseAppInput("Stride_Fit")).toMatchObject({ name: "Stride Fit", slug: "stride-fit" });
  });

  it("never throws: an empty or broken input becomes a placeholder name", () => {
    expect(parseAppInput("")).toMatchObject({ kind: "name", name: "Your app", slug: "your-app" });
    expect(() => parseAppInput("https://")).not.toThrow();
    expect(() => parseAppInput("http://%%%")).not.toThrow();
    expect(parseAppInput("https://").name.length).toBeGreaterThan(0);
  });
});

describe("inferCategory", () => {
  it("picks the category with the most keyword hits", () => {
    expect(inferCategory("Lumi AI Photo Editor")).toMatchObject({ category: "ai_photo", source: "keyword" });
    expect(inferCategory("Stride Workout Tracker").category).toBe("fitness");
    expect(inferCategory("Budget Buddy").category).toBe("finance");
    expect(inferCategory("Calm Sleep Sounds").category).toBe("sleep_mind");
    expect(inferCategory("Lingo Spanish Lessons").category).toBe("language");
    expect(inferCategory("Beat Maker Studio").category).toBe("music_audio");
    expect(inferCategory("Weekly Planner Focus Timer").category).toBe("productivity");
    expect(inferCategory("Trip Recipe Box").category).toBe("lifestyle");
  });

  it("breaks a tie by category priority and lists every category that matched", () => {
    const r = inferCategory("Photo Workout");
    expect(r.category).toBe("ai_photo");
    expect(r.matched).toEqual(expect.arrayContaining(["ai_photo", "fitness"]));
  });

  it("falls back to a stable hash of the name, flagged as a guess", () => {
    const a = inferCategory("Zzqx");
    expect(a).toEqual(inferCategory("Zzqx"));
    expect(a).toMatchObject({ source: "guess", matched: [] });
    expect(CATEGORIES).toContain(a.category);
  });
});

describe("makeArtSeed", () => {
  it("is deterministic and well formed", () => {
    const a = makeArtSeed(seededRng("x"), { pattern: "orbs", label: "Lumi" });
    expect(a).toEqual(makeArtSeed(seededRng("x"), { pattern: "orbs", label: "Lumi" }));
    expect(a).toMatchObject({ pattern: "orbs", label: "Lumi" });
    for (const h of [a.hue_a, a.hue_b, a.hue_c]) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
    expect(Number.isInteger(a.seed)).toBe(true);
  });

  it("honours a fixed hue, picks a pattern when none is given, and trims the label to 24 characters", () => {
    const a = makeArtSeed(seededRng("y"), { hue: 200, label: "A very long app name that keeps going" });
    expect(a.hue_a).toBe(200);
    expect(a.label).toHaveLength(24);
    expect(["orbs", "waves", "rings", "grid", "spark", "stripes"]).toContain(a.pattern);
    expect(makeArtSeed(seededRng("z"), {})).not.toHaveProperty("label");
  });
});

describe("generateAudit", () => {
  const input = "https://apps.apple.com/us/app/lumi-ai-photo-editor/id6741234567";
  const creators: AuditCreatorCandidate[] = [
    { id: "cr_maya", niches: ["ai_tools", "lifestyle"], tier: "silver" },
    { id: "cr_jo", niches: ["ai_tools", "tech"], tier: "gold" },
    { id: "cr_off", niches: ["food"], tier: "elite" },
    { id: "cr_busy", niches: ["ai_tools"], tier: "platinum", open_to_offers: false },
    { id: "cr_ren", niches: ["beauty"], tier: "bronze" },
  ];

  it("is deterministic: the same input gives the same report, and only generated_at follows `now`", () => {
    const a = generateAudit({ input, now: NOW, creators });
    expect(generateAudit({ input, now: NOW, creators })).toEqual(a);
    const later = generateAudit({ input, now: "2026-10-04T10:00:00Z", creators });
    expect({ ...later, generated_at: NOW }).toEqual(a);
    expect(generateAudit({ input: "Lumi AI Photo Editor", now: NOW }).hooks).toEqual(a.hooks);
    expect(generateAudit({ input: "Stride Workout Tracker", now: NOW }).hooks).not.toEqual(a.hooks);
  });

  it("names the app, the category and the label, and keeps the store link", () => {
    const a = generateAudit({ input, now: NOW });
    expect(a).toMatchObject({ slug: "lumi-ai-photo-editor", app_name: "Lumi AI Photo Editor", category: "ai_photo", category_source: "keyword", store_url: input, generated_at: NOW, label: AUDIT_LABEL });
    expect(a.tagline.length).toBeGreaterThan(10);
    expect(a.label).toMatch(/Checklist estimate/);
    // a plain name gets a fictional store URL on an App Store path
    expect(generateAudit({ input: "Lumi AI Photo Editor", now: NOW }).store_url).toMatch(/^https:\/\/apps\.apple\.com\/us\/app\/lumi-ai-photo-editor\/id6\d{9}$/);
  });

  it("drafts a brief that a brand could publish: required beats, one CTA and disclosure wording", () => {
    const { brief } = generateAudit({ input, now: NOW });
    expect(brief.beats.filter((b) => b.required).map((b) => b.beat)).toEqual(["hook", "app_reveal", "demo", "offer", "cta"]);
    expect(brief.disclosure_text).toBe("#ad Paid partnership with Lumi AI Photo Editor");
    expect(brief.hashtags).toEqual(["#ad", "#lumi"]);
    expect(brief.cta).toBe("Try Lumi AI Photo Editor free for 7 days");
    expect(brief.banned_claims).toContain("guaranteed results");
    expect(brief.summary).toContain("Lumi AI Photo Editor");
    const lint = lintBrief(
      {
        type: "cpm",
        plan: "free",
        cpm_cents: 240,
        per_video_cap_cents: 25_000,
        budget_cents: 200_000,
        brief,
        rights_card: buildRightsCard(),
        deliverables: { videos_per_creator: 1, min_duration_s: 15, max_duration_s: 45, platforms: ["tiktok"], regions: ["US"] },
        starts_at: "2026-10-05T00:00:00Z",
        ends_at: "2026-11-05T00:00:00Z",
      },
      NOW,
    );
    expect(lint.blockers).toBe(0);
    expect(lint.findings.map((f) => f.code)).not.toContain("unclear_cta");
  });

  it("writes exactly ten distinct, scored hooks in the 2/2/2/1/1/1/1 mix, best first", () => {
    const { hooks } = generateAudit({ input, now: NOW });
    expect(hooks).toHaveLength(10);
    expect(new Set(hooks.map((h) => h.text)).size).toBe(10);
    const counts: Partial<Record<HookType, number>> = {};
    for (const h of hooks) counts[h.hook_type] = (counts[h.hook_type] ?? 0) + 1;
    expect(counts).toEqual({ confession: 2, curiosity_gap: 2, specific_number: 2, pov: 1, direct_question: 1, risk_reversal: 1, pattern_interrupt: 1 });
    for (let i = 1; i < hooks.length; i += 1) expect(hooks[i - 1].hook_points).toBeGreaterThanOrEqual(hooks[i].hook_points);
    for (const h of hooks) {
      expect(h.hook_points).toBeGreaterThanOrEqual(0);
      expect(h.hook_points).toBeLessThanOrEqual(100);
      expect(h.format_id).toMatch(/^tmpl_/);
      expect(h.text).not.toMatch(/\{[a-z]+\}/); // every slot is filled
    }
  });

  it("predicts a CPM band around the category's clearing price, never under the floor", () => {
    const a = generateAudit({ input, now: NOW });
    const base = CATEGORY_BASELINES.ai_photo;
    expect(a.predicted_cpm_cents.low).toBeLessThanOrEqual(a.predicted_cpm_cents.median);
    expect(a.predicted_cpm_cents.median).toBeLessThanOrEqual(a.predicted_cpm_cents.high);
    expect(a.predicted_cpm_cents.median).toBeGreaterThanOrEqual(Math.round(base.clearing_cpm_cents * 0.94 / 5) * 5);
    expect(a.predicted_cpm_cents.median).toBeLessThanOrEqual(Math.round(base.clearing_cpm_cents * 1.06 / 5) * 5);
    for (const v of Object.values(a.predicted_cpm_cents)) {
      expect(v % 5).toBe(0);
      expect(v).toBeGreaterThanOrEqual(50);
    }
  });

  it("projects views with the 0.40x / 1x / 2.55x spread and a cost per trial that falls as conversion rises", () => {
    const a = generateAudit({ input, now: NOW });
    const v = a.expected_views_per_post;
    expect(v.low).toBe(Math.round(v.median * 0.4));
    expect(v.high).toBe(Math.round(v.median * 2.55));
    const c = a.expected_cost_per_trial_cents;
    expect(c.low).toBeLessThan(c.median);
    expect(c.median).toBeLessThan(c.high);
    expect(c.low).toBeGreaterThan(0);
  });

  it("sizes a reference pool on the Free plan: $2,000 plus 12% fee plus processing", () => {
    const a = generateAudit({ input, now: NOW });
    const r = a.reference_pool;
    expect(r.plan).toBe("free");
    expect(r.budget_cents).toBe(200_000);
    expect(r.card_charge_cents).toBe(224_000 + cardProcessing(224_000));
    expect(r.card_charge_cents).toBe(230_526);
    expect(r.cpm_cents).toBe(a.predicted_cpm_cents.median);
    expect(r.views).toBe(Math.round((200_000 / r.cpm_cents) * 1000));
    expect(r.trials.low).toBeLessThan(r.trials.median);
    expect(r.trials.median).toBeLessThan(r.trials.high);
    expect(r.installs.median).toBeGreaterThan(r.trials.median);
  });

  it("includes the six-point price curve and a bounded confidence", () => {
    const a = generateAudit({ input, now: NOW });
    expect(a.price_curve).toHaveLength(6);
    expect(a.price_curve.map((p) => p.cpm_cents)).toEqual([0.6, 0.8, 1, 1.2, 1.5, 2].map((m) => Math.round(a.predicted_cpm_cents.median * m)));
    expect(a.price_curve[0].fill_hours_p50).toBeGreaterThan(a.price_curve[5].fill_hours_p50);
    expect(a.confidence).toBeGreaterThan(0);
    expect(a.confidence).toBeLessThanOrEqual(0.85);
  });

  it("lowers its confidence for an app whose category it had to guess", () => {
    const guessed = generateAudit({ input: "Zzqx", now: NOW });
    expect(guessed.category_source).toBe("guess");
    expect(guessed.assumptions[0]).toContain("a best guess from the name");
    expect(guessed.confidence).toBeLessThan(0.65);
    expect(generateAudit({ input, now: NOW }).assumptions[0]).not.toContain("best guess");
  });

  it("names creators ready now: open to offers, a niche overlap, strongest first, capped", () => {
    const a = generateAudit({ input, now: NOW, creators });
    // gold with two niche hits, then silver with two, then bronze with one; the creator who is not open to offers and the one with no niche overlap are out
    expect(a.creators_ready).toEqual(["cr_jo", "cr_maya", "cr_ren"]);
    expect(generateAudit({ input, now: NOW }).creators_ready).toEqual([]);
    expect(generateAudit({ input, now: NOW, creators, max_creators: 1 }).creators_ready).toEqual(["cr_jo"]);
    const many: AuditCreatorCandidate[] = Array.from({ length: 12 }, (_, i) => ({ id: `cr_${i}`, niches: ["ai_tools"], tier: "silver" }));
    expect(generateAudit({ input, now: NOW, creators: many }).creators_ready).toHaveLength(6);
  });

  it("states its assumptions, including where each number comes from", () => {
    const a = generateAudit({ input, now: NOW });
    expect(a.assumptions.join(" ")).toContain("38 comparable bounties");
    expect(a.assumptions.join(" ")).toContain("Hook points are checklist scores");
    expect(a.assumptions.some((s) => s.includes("$2,000") && s.includes("Free plan"))).toBe(true);
  });

  it("holds its invariants across many app names (a property sweep)", () => {
    const names = ["Lumi", "Glow Up", "Sleepy Panda", "Run Club", "Penny Pal", "Verb", "Tempo Beats", "Doc Scanner Pro", "Zen Garden", "Plant Pal", "Mate Chat AI", "Flashcard Fox", "Quill Notes", "Cart Hero", "x", "Ünïcode Äpp", "123 Steps", "The App", "Spanish Buddy", "Pocket Chef"];
    for (const name of names) {
      const a = generateAudit({ input: name, now: NOW });
      expect(a.hooks).toHaveLength(10);
      expect(new Set(a.hooks.map((h) => h.text)).size).toBe(10);
      expect(a.predicted_cpm_cents.low).toBeLessThanOrEqual(a.predicted_cpm_cents.median);
      expect(a.predicted_cpm_cents.median).toBeLessThanOrEqual(a.predicted_cpm_cents.high);
      expect(a.price_curve).toHaveLength(6);
      expect(a.suggested_format_ids).toHaveLength(4);
      expect(a.slug).toMatch(/^[a-z0-9-]+$/);
      expect(CATEGORIES.includes(a.category as Category)).toBe(true);
      expect(a.brief.beats.some((b) => b.beat === "hook" && b.required)).toBe(true);
    }
  });
});
