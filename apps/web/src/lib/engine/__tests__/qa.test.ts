import { describe, expect, it } from "vitest";
import type { OnScreenText, TranscriptSegment } from "@/lib/contract/types";
import {
  aspectRatioOf,
  auditPostCompliance,
  checkCaptionDisclosure,
  checkDisclosureAudio,
  checkDisclosureOnScreen,
  compareForReviewQueue,
  deadAirGaps,
  detectBeats,
  findBannedClaims,
  findCompetitors,
  findDuplicates,
  findSpokenDisclosure,
  findWrittenDisclosure,
  isClean,
  isValidPhash,
  phashDistance,
  runQa,
  type QaReport,
} from "../qa";
import { brief, deliverables, goodOnScreen, goodTranscript, qaInput } from "./helpers";

const seg = (t_start_ms: number, t_end_ms: number, text: string): TranscriptSegment => ({ t_start_ms, t_end_ms, text });
const osText = (t_start_ms: number, t_end_ms: number, text: string, in_safe_zone = true): OnScreenText => ({ t_start_ms, t_end_ms, text, in_safe_zone });
const find = (r: QaReport, check: string) => r.findings.find((f) => f.check === check);

describe("a clean video", () => {
  const r = runQa(qaInput());

  it("passes every one of the 14 checks and blocks nothing", () => {
    expect(r.findings).toHaveLength(14);
    expect(r.pass).toBe(14);
    expect(r.warn).toBe(0);
    expect(r.fail).toBe(0);
    expect(r.blocks_settlement).toBe(false);
    expect(r.reason_codes).toEqual([]);
    expect(isClean(r)).toBe(true);
  });

  it("returns the contract QaCheck shape alongside the richer findings", () => {
    expect(r.checks).toHaveLength(14);
    expect(r.checks.map((c) => c.check)).toEqual(r.findings.map((f) => f.check));
    for (const c of r.checks) expect(Object.keys(c)).not.toContain("reason_code");
    expect(r.checks.every((c) => c.blocks_settlement === false)).toBe(true);
  });

  it("finds all five required beats from the transcript", () => {
    expect(r.beats.filter((b) => b.required && b.found)).toHaveLength(5);
    expect(find(r, "brief_beats")?.message).toBe("All 5 required beats found.");
  });

  it("is deterministic", () => {
    expect(runQa(qaInput())).toEqual(r);
  });
});

describe("disclosure (the FTC rule: in the video, audio and on screen)", () => {
  it("recognises the ways people say it is an ad", () => {
    for (const text of [
      "This is a paid partnership with Lumi.",
      "It's a paid partnership.",
      "This is an ad.",
      "Hashtag ad.",
      "This video is sponsored by Lumi.",
      "I'm partnering with Lumi on this one.",
      "Paid promotion for Lumi.",
      "We are partnered with Lumi.",
      "In partnership with Lumi.",
    ]) {
      expect(findSpokenDisclosure([seg(0, 3000, text)]), text).not.toBeNull();
    }
    for (const text of ["I love this app.", "Ad blockers are great.", "That partnership with my roommate went well."]) {
      expect(findSpokenDisclosure([seg(0, 3000, text)]), text).toBeNull();
    }
  });

  it("finds a disclosure split across two segments", () => {
    expect(findSpokenDisclosure([seg(0, 1000, "this is"), seg(1100, 2000, "an ad")])?.t_start_ms).toBe(0);
  });

  it("recognises written disclosures and rejects look-alikes", () => {
    for (const text of ["#ad", "#AD Paid partnership with Lumi", "Ad", "AD: Lumi", "Paid partnership", "Sponsored", "I love it #ad"]) {
      expect(findWrittenDisclosure([osText(0, 3000, text)]), text).not.toBeNull();
    }
    for (const text of ["Ad-free forever", "Bad idea", "#adventure", "Add a photo"]) {
      expect(findWrittenDisclosure([osText(0, 3000, text)]), text).toBeNull();
    }
  });

  it("a missing spoken disclosure fails, carries a reason code and blocks settlement", () => {
    const f = checkDisclosureAudio({ transcript: [seg(0, 2000, "Hello there")], duration_ms: 24_000 });
    expect(f).toMatchObject({ check: "disclosure_audio", result: "fail", blocks_settlement: true, reason_code: "missing_disclosure" });
    expect(f.fix).toMatch(/paid partnership/);
    expect(f.evidence).toEqual({ kind: "qa_check", ref: "disclosure_audio" });
  });

  it("a late spoken disclosure warns but does not block", () => {
    const f = checkDisclosureAudio({ transcript: [seg(0, 2000, "Hi"), seg(15_000, 17_000, "This is a paid partnership.")], duration_ms: 24_000 });
    expect(f).toMatchObject({ result: "warn", blocks_settlement: false, reason_code: "missing_disclosure" });
    expect(f.message).toMatch(/late/);
    expect(f.evidence).toMatchObject({ kind: "transcript", ref: "0:15", t_ms: 15_000 });
  });

  it("passes a timely spoken disclosure with transcript evidence", () => {
    const f = checkDisclosureAudio({ transcript: goodTranscript(), duration_ms: 24_000 });
    expect(f).toMatchObject({ result: "pass", blocks_settlement: false });
    expect(f.evidence).toMatchObject({ kind: "transcript", t_ms: 2600 });
    expect(f.reason_code).toBeUndefined();
  });

  it("on-screen disclosure: pass at 2 seconds, warn when shorter, fail and block when absent", () => {
    expect(checkDisclosureOnScreen({ on_screen_text: [osText(1000, 3000, "#ad")] })).toMatchObject({ result: "pass" });
    const short = checkDisclosureOnScreen({ on_screen_text: [osText(1000, 2500, "#ad")] });
    expect(short).toMatchObject({ result: "warn", blocks_settlement: false });
    expect(short.message).toMatch(/1\.5s/);
    const none = checkDisclosureOnScreen({ on_screen_text: [osText(0, 3000, "Try Lumi free")] });
    expect(none).toMatchObject({ result: "fail", blocks_settlement: true, reason_code: "missing_disclosure" });
  });

  it("blocks settlement for the whole video when either disclosure is missing", () => {
    const noSpoken = runQa(qaInput({ transcript: goodTranscript().filter((s) => !/paid partnership/.test(s.text)) }));
    expect(noSpoken.blocks_settlement).toBe(true);
    expect(find(noSpoken, "disclosure_audio")?.result).toBe("fail");
    expect(find(noSpoken, "disclosure_onscreen")?.result).toBe("pass");
    expect(noSpoken.reason_codes).toContain("missing_disclosure");
    expect(noSpoken.checks.find((c) => c.check === "disclosure_audio")?.blocks_settlement).toBe(true);
    const noWritten = runQa(qaInput({ on_screen_text: goodOnScreen().filter((t) => !/#ad/.test(t.text)) }));
    expect(noWritten.blocks_settlement).toBe(true);
    expect(isClean(noWritten)).toBe(false);
  });

  it("checks the caption for #ad and the brand wording", () => {
    expect(checkCaptionDisclosure("Studio headshots #ad Paid partnership with Lumi", "Lumi")).toMatchObject({ type: "caption_disclosure", result: "pass", blocks_settlement: false });
    expect(checkCaptionDisclosure("Studio headshots #ad", "Lumi")).toMatchObject({ result: "warn", blocks_settlement: false });
    expect(checkCaptionDisclosure("Studio headshots with Lumi", "Lumi")).toMatchObject({ result: "fail", blocks_settlement: true });
    expect(checkCaptionDisclosure("", "Lumi")).toMatchObject({ result: "fail", blocks_settlement: true });
    expect(checkCaptionDisclosure(undefined, "Lumi")).toMatchObject({ result: "fail" });
    expect(checkCaptionDisclosure("#advice for lumi", "Lumi").result).toBe("fail");
  });
});

describe("claims and competitors", () => {
  it("fails a banned claim with the timecode and the quoted line", () => {
    const transcript = [...goodTranscript(), seg(9000, 9200, "x")];
    transcript[3] = seg(9800, 15_000, "These are guaranteed results every time.");
    const r = runQa(qaInput({ transcript }));
    const f = find(r, "banned_claims");
    expect(f).toMatchObject({ result: "fail", reason_code: "banned_claim", blocks_settlement: false });
    expect(f?.evidence).toMatchObject({ kind: "transcript", ref: "0:10", t_ms: 9800, excerpt: "These are guaranteed results every time." });
    expect(r.reason_codes).toContain("banned_claim");
    expect(r.blocks_settlement).toBe(false);
  });

  it("finds banned claims written on screen or in the caption", () => {
    const hits = findBannedClaims({
      transcript: [],
      on_screen_text: [osText(4000, 6000, "100% realistic results")],
      caption: "Guaranteed results! #ad",
      brief: brief(),
    });
    expect(hits.map((h) => [h.claim, h.source])).toEqual([
      ["guaranteed results", "caption"],
      ["100% realistic", "on_screen"],
    ]);
    expect(findBannedClaims({ transcript: [seg(0, 1000, "A very realistic photo")], on_screen_text: [], brief: brief() })).toEqual([]);
  });

  it("warns about a competitor mention and lists it", () => {
    const r = runQa(qaInput({ transcript: [...goodTranscript(), seg(23_600, 23_900, "Better than PicPerfect.")] }));
    const f = find(r, "banned_claims");
    expect(f).toMatchObject({ result: "warn", reason_code: "competitor_shown" });
    expect(f?.message).toBe("A competitor is mentioned: PicPerfect at 0:24.");
    expect(r.competitors).toEqual([{ name: "PicPerfect", t_ms: 23_600, source: "transcript", excerpt: "Better than PicPerfect." }]);
  });

  it("finds competitors in all three places, and none when there is no list", () => {
    const m = findCompetitors({ transcript: [seg(0, 1000, "picperfect is ok")], on_screen_text: [osText(0, 1000, "PicPerfect")], caption: "vs PicPerfect", competitor_names: ["PicPerfect"] });
    expect(m.map((x) => x.source)).toEqual(["transcript", "on_screen", "caption"]);
    expect(findCompetitors({ transcript: [seg(0, 1000, "picperfect")], on_screen_text: [] })).toEqual([]);
  });

  it("puts a banned claim ahead of a competitor when both are present", () => {
    const r = runQa(qaInput({ transcript: [seg(0, 2000, "guaranteed results with Lumi, not PicPerfect")] }));
    expect(find(r, "banned_claims")?.result).toBe("fail");
    expect(r.competitors).toHaveLength(1);
  });
});

describe("duplicates by perceptual-hash distance", () => {
  it("counts differing bits across 16 hex characters", () => {
    expect(phashDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(phashDistance("0000000000000000", "0000000000000001")).toBe(1);
    expect(phashDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(phashDistance("a1b2c3d4e5f60718", "a1b2c3d4e5f60719")).toBe(1);
    expect(phashDistance("A1B2C3D4E5F60718", "a1b2c3d4e5f60718")).toBe(0);
    expect(() => phashDistance("zz", "0000000000000000")).toThrow();
    expect(isValidPhash("a1b2c3d4e5f60718")).toBe(true);
    expect(isValidPhash("a1b2")).toBe(false);
    expect(isValidPhash("g1b2c3d4e5f60718")).toBe(false);
  });

  it("finds videos within 6 bits, nearest first, skipping malformed hashes", () => {
    const base = "a1b2c3d4e5f60718";
    const m = findDuplicates(base, [
      { id: "far", phash: "0000000000000000" },
      { id: "near3", phash: "a1b2c3d4e5f60700", creator_id: "cr_x" }, // 0x18 -> 0x00: 2 bits
      { id: "exact", phash: base },
      { id: "bad", phash: "nope" },
      { id: "edge6", phash: "a1b2c3d4e5f6073f" }, // 0x18 vs 0x3f: 6 bits? computed below
    ]);
    expect(m[0]).toMatchObject({ id: "exact", distance: 0, exact: true });
    expect(m.map((x) => x.id)).not.toContain("far");
    expect(m.map((x) => x.id)).not.toContain("bad");
    for (let i = 1; i < m.length; i += 1) expect(m[i - 1].distance).toBeLessThanOrEqual(m[i].distance);
    expect(findDuplicates("nope", [{ id: "x", phash: base }])).toEqual([]);
    expect(findDuplicates(base, [{ id: "d", phash: "a1b2c3d4e5f60700" }], 1)).toEqual([]);
  });

  it("fails an exact duplicate and a near duplicate, with the earlier video named", () => {
    const exact = runQa(qaInput({ known_hashes: [{ id: "sub_0042", phash: "a1b2c3d4e5f60718", creator_id: "cr_other" }] }));
    expect(find(exact, "duplicate")).toMatchObject({ result: "fail", reason_code: "duplicate_content", message: "An identical video was already submitted (sub_0042)." });
    expect(exact.duplicates[0]).toMatchObject({ id: "sub_0042", exact: true, creator_id: "cr_other" });
    const near = runQa(qaInput({ known_hashes: [{ id: "sub_0043", phash: "a1b2c3d4e5f60700" }] }));
    expect(find(near, "duplicate")?.message).toBe("This video closely matches sub_0043 (distance 2 of 6).");
    expect(find(near, "duplicate")?.evidence).toMatchObject({ kind: "qa_check", ref: "duplicate" });
  });

  it("passes when there is no hash or no match", () => {
    expect(find(runQa(qaInput({ phash: undefined })), "duplicate")?.result).toBe("pass");
    expect(find(runQa(qaInput({ phash: "bad" })), "duplicate")?.message).toBe("No fingerprint to compare yet.");
    expect(find(runQa(qaInput()), "duplicate")?.message).toBe("No matching video found.");
  });
});

describe("music, AI, watermark, moderation", () => {
  it("flags music that is not licensed for ads", () => {
    expect(find(runQa(qaInput({ music: { detected: true, kind: "trending_sound" } })), "music_licence")).toMatchObject({ result: "fail", reason_code: "music_not_licensed" });
    expect(find(runQa(qaInput({ music: { detected: true, kind: "unknown" } })), "music_licence")).toMatchObject({ result: "warn", reason_code: "music_not_licensed" });
    expect(find(runQa(qaInput({ music: { detected: true } })), "music_licence")?.result).toBe("warn");
    expect(find(runQa(qaInput({ music: { detected: true, kind: "commercial_library" } })), "music_licence")?.result).toBe("pass");
    expect(find(runQa(qaInput({ music: { detected: false } })), "music_licence")?.message).toBe("No music detected.");
    expect(find(runQa(qaInput({ music: undefined })), "music_licence")?.result).toBe("pass");
    expect(find(runQa(qaInput({ music: { detected: true, kind: "original" } })), "music_licence")?.message).toBe("Original music.");
  });

  it("an original-only bounty rejects library music", () => {
    const r = runQa(qaInput({ deliverables: deliverables({ music_policy: "original_only" }), music: { detected: true, kind: "commercial_library" } }));
    expect(find(r, "music_licence")).toMatchObject({ result: "fail", reason_code: "music_not_licensed" });
  });

  it("labels AI-generated media", () => {
    expect(find(runQa(qaInput({ ai_content: { generated: true, labelled: false } })), "ai_content")).toMatchObject({ result: "fail", reason_code: "ai_content_undisclosed" });
    expect(find(runQa(qaInput({ ai_content: { generated: true, labelled: true } })), "ai_content")?.result).toBe("pass");
    expect(find(runQa(qaInput({ ai_content: { generated: true, labelled: true }, deliverables: deliverables({ ai_policy: "not_allowed" }) })), "ai_content")).toMatchObject({ result: "fail", reason_code: "other_requirement" });
    expect(find(runQa(qaInput({ ai_content: undefined })), "ai_content")?.result).toBe("pass");
  });

  it("flags watermarks and brand-safety issues", () => {
    expect(find(runQa(qaInput({ watermark_detected: true })), "watermark")).toMatchObject({ result: "fail", reason_code: "watermark_present" });
    expect(find(runQa(qaInput({ moderation_flags: ["violence"] })), "moderation")).toMatchObject({ result: "fail", reason_code: "brand_safety", message: "Brand-safety flags: violence." });
  });
});

describe("format, length, resolution, safe zones and audio", () => {
  it("parses an aspect string", () => {
    expect(aspectRatioOf("9:16")).toBeCloseTo(0.5625, 4);
    expect(aspectRatioOf("1:1")).toBe(1);
    expect(aspectRatioOf("garbage")).toBeCloseTo(0.5625, 4);
  });

  it("fails the wrong aspect ratio", () => {
    expect(find(runQa(qaInput({ width: 1920, height: 1080 })), "aspect_ratio")).toMatchObject({ result: "fail", reason_code: "wrong_format" });
    expect(find(runQa(qaInput({ width: 1080, height: 1350 })), "aspect_ratio")?.result).toBe("fail");
    expect(find(runQa(qaInput({ width: 1080, height: 1080, deliverables: deliverables({ aspect: "1:1" }) })), "aspect_ratio")?.result).toBe("pass");
  });

  it("fails a video outside the allowed length", () => {
    expect(find(runQa(qaInput({ duration_ms: 9000 })), "length")).toMatchObject({ result: "fail", reason_code: "wrong_format", message: "The video is 9s. This bounty asks for 15 to 45 seconds." });
    expect(find(runQa(qaInput({ duration_ms: 50_000 })), "length")?.result).toBe("fail");
    expect(find(runQa(qaInput({ duration_ms: 15_000 })), "length")?.result).toBe("pass");
    expect(find(runQa(qaInput({ duration_ms: 45_000 })), "length")?.result).toBe("pass");
  });

  it("grades resolution by the short side", () => {
    expect(find(runQa(qaInput({ width: 1080, height: 1920 })), "resolution")?.result).toBe("pass");
    expect(find(runQa(qaInput({ width: 720, height: 1280 })), "resolution")).toMatchObject({ result: "warn", reason_code: "low_video_quality" });
    expect(find(runQa(qaInput({ width: 540, height: 960 })), "resolution")).toMatchObject({ result: "fail", reason_code: "low_video_quality" });
  });

  it("warns about text outside the safe zones with the first timecode", () => {
    const r = runQa(qaInput({ on_screen_text: [...goodOnScreen(), osText(8000, 9000, "Too low", false), osText(10_000, 11_000, "Also low", false)] }));
    const f = find(r, "safe_zone");
    expect(f).toMatchObject({ result: "warn" });
    expect(f?.message).toBe("2 text overlays are outside the safe zones, first at 0:08.");
    expect(f?.evidence).toMatchObject({ t_ms: 8000, excerpt: "Too low" });
    expect(find(runQa(qaInput({ on_screen_text: [...goodOnScreen(), osText(8000, 9000, "Too low", false)] })), "safe_zone")?.message).toMatch(/^1 text overlay is/);
  });

  it("finds dead air between spoken lines", () => {
    expect(deadAirGaps(goodTranscript())).toEqual([]);
    const gappy = [seg(0, 2000, "a"), seg(3500, 5000, "b"), seg(5100, 6000, "c"), seg(8000, 9000, "d")];
    expect(deadAirGaps(gappy)).toEqual([
      { start_ms: 2000, end_ms: 3500, length_ms: 1500 },
      { start_ms: 6000, end_ms: 8000, length_ms: 2000 },
    ]);
    expect(deadAirGaps([seg(3500, 5000, "b"), seg(0, 2000, "a")], 1000)).toEqual([{ start_ms: 2000, end_ms: 3500, length_ms: 1500 }]);
    expect(deadAirGaps(gappy, 1800)).toEqual([{ start_ms: 6000, end_ms: 8000, length_ms: 2000 }]);
    expect(deadAirGaps([])).toEqual([]);
  });

  it("grades audio by dead air, noise and clipping", () => {
    const one = runQa(qaInput({ transcript: [seg(300, 2400, "I was wrong about photo editing apps. This is a paid partnership with Lumi."), seg(4000, 9500, "Watch this, Lumi does the rest"), seg(9800, 23_000, "Look at that, free trial, try Lumi free with the link in my bio.")] }));
    expect(find(one, "audio_clarity")).toMatchObject({ result: "warn", reason_code: "audio_unclear", message: "A 1.6s pause at 0:02." });
    const many = runQa(qaInput({ transcript: [seg(0, 1000, "a"), seg(2500, 3000, "b"), seg(5000, 5500, "c"), seg(7500, 8000, "d")] }));
    expect(find(many, "audio_clarity")).toMatchObject({ result: "fail", message: "3 dead-air gaps over 1 second." });
    expect(find(runQa(qaInput({ audio: { snr_db: 8 } })), "audio_clarity")?.result).toBe("fail");
    expect(find(runQa(qaInput({ audio: { snr_db: 16 } })), "audio_clarity")).toMatchObject({ result: "warn", message: "Some background noise." });
    expect(find(runQa(qaInput({ audio: { clipping: true } })), "audio_clarity")).toMatchObject({ result: "warn", message: "The audio clips (too loud)." });
    expect(find(runQa(qaInput({ audio: { snr_db: 30 } })), "audio_clarity")?.result).toBe("pass");
  });
});

describe("beats", () => {
  it("reports a missing required beat with the reason code that fits it", () => {
    const noOffer = runQa(qaInput({ transcript: goodTranscript().filter((s) => !/free trial/.test(s.text)) }));
    expect(find(noOffer, "brief_beats")).toMatchObject({ result: "fail", reason_code: "offer_not_stated" });
    expect(find(noOffer, "brief_beats")?.message).toMatch(/4 of 5 required beats found\. Missing: offer\./);
    expect(find(noOffer, "brief_beats")?.evidence).toMatchObject({ kind: "brief_requirement", ref: "beat:offer" });
    const noApp = runQa(qaInput({ transcript: goodTranscript().map((s) => ({ ...s, text: s.text.replace(/Lumi/g, "it") })), on_screen_text: [] }));
    expect(find(noApp, "brief_beats")).toMatchObject({ result: "fail", reason_code: "app_not_shown_early" });
    const noDemo = runQa(qaInput({ beats: brief().beats.map((b) => ({ beat: b.beat, required: b.required, found: b.beat !== "demo" })) }));
    expect(find(noDemo, "brief_beats")).toMatchObject({ result: "fail", reason_code: "missing_required_beat" });
  });

  it("uses the vision model's beat hits when they are supplied", () => {
    const hits = brief().beats.map((b) => ({ beat: b.beat, required: b.required, found: true, t_ms: 1000 }));
    const r = runQa(qaInput({ transcript: [], beats: hits }));
    expect(r.beats).toEqual(hits);
    expect(find(r, "brief_beats")?.result).toBe("pass");
  });

  it("passes a brief with no required beats", () => {
    const r = runQa(qaInput({ brief: brief({ beats: [{ beat: "hook", label: "Hook", required: false }] }) }));
    expect(find(r, "brief_beats")).toMatchObject({ result: "pass", message: "The brief has no required beats." });
  });

  it("detects beats from the transcript with the right timecodes", () => {
    const hits = detectBeats({
      transcript: goodTranscript(),
      on_screen_text: goodOnScreen(),
      brief: brief({
        beats: ["hook", "problem", "app_reveal", "demo", "key_feature", "payoff", "offer", "cta", "win_state", "reaction", "end_card", "proof"].map((beat) => ({ beat: beat as never, label: beat, required: true })),
      }),
      brand_name: "Lumi",
      app_features: ["headshot"],
      duration_ms: 24_000,
    });
    const by = Object.fromEntries(hits.map((h) => [h.beat, h]));
    expect(by.hook).toMatchObject({ found: true, t_ms: 300 });
    expect(by.app_reveal).toMatchObject({ found: true, t_ms: 2600 }); // the first on-screen text (0:00.6) does not name the app; the spoken and written "Lumi" both land at 2.6 s
    expect(by.demo.found).toBe(true);
    expect(by.key_feature.found).toBe(true);
    expect(by.offer).toMatchObject({ found: true, t_ms: 15_300 });
    expect(by.cta).toMatchObject({ found: true, t_ms: 20_100 });
    expect(by.end_card.found).toBe(true);
    expect(by.problem.found).toBe(false);
    expect(by.reaction.found).toBe(false);
  });

  it("does not find a hook when nobody speaks in the first 3 seconds", () => {
    const hits = detectBeats({
      transcript: [seg(5000, 9000, "Hello")],
      on_screen_text: [],
      brief: brief({ beats: [{ beat: "hook", label: "Hook", required: true }] }),
      brand_name: "Lumi",
      duration_ms: 24_000,
    });
    expect(hits[0]).toMatchObject({ beat: "hook", found: false });
    expect(hits[0].t_ms).toBeUndefined();
  });
});

describe("reason codes", () => {
  it("lists reason codes for failed and warned checks, most serious first, without duplicates", () => {
    const r = runQa(
      qaInput({
        transcript: goodTranscript().filter((s) => !/paid partnership/.test(s.text)),
        width: 1920,
        height: 1080,
        duration_ms: 9000,
        watermark_detected: true,
        music: { detected: true, kind: "unknown" },
      }),
    );
    expect(r.reason_codes[0]).toBe("missing_disclosure");
    expect(new Set(r.reason_codes).size).toBe(r.reason_codes.length);
    expect(r.reason_codes).toEqual(expect.arrayContaining(["missing_disclosure", "wrong_format", "watermark_present", "music_not_licensed"]));
    expect(r.fail).toBeGreaterThanOrEqual(4);
  });
});

describe("post-level compliance audit", () => {
  const clean = runQa(qaInput());

  it("returns one item per compliance check type and passes a clean post", () => {
    const a = auditPostCompliance({ caption: "Studio headshots #ad Paid partnership with Lumi lumi.example/r/maya", brand_name: "Lumi", tracking_link: "https://lumi.example/r/maya", platform_label_on: true, qa: clean });
    expect(a.checks.map((c) => c.type)).toEqual(["caption_disclosure", "spoken_disclosure", "onscreen_disclosure", "platform_label", "music_licence", "banned_claims", "ai_label", "tracking_link"]);
    expect(a.overall).toBe("pass");
    expect(a.blocks_settlement).toBe(false);
  });

  it("fails and blocks when the caption has no #ad", () => {
    const a = auditPostCompliance({ caption: "Studio headshots", brand_name: "Lumi", qa: clean });
    expect(a.overall).toBe("fail");
    expect(a.blocks_settlement).toBe(true);
    expect(a.checks[0]).toMatchObject({ type: "caption_disclosure", result: "fail", blocks_settlement: true });
  });

  it("warns about a missing tracking link and a platform label that is off", () => {
    const a = auditPostCompliance({ caption: "#ad Paid partnership with Lumi", brand_name: "Lumi", tracking_link: "lumi.example/r/maya", platform_label_on: false, qa: clean });
    expect(a.checks.find((c) => c.type === "tracking_link")).toMatchObject({ result: "warn" });
    expect(a.checks.find((c) => c.type === "platform_label")).toMatchObject({ result: "warn" });
    expect(a.overall).toBe("warn");
  });

  it("stays pending where there is nothing to check yet", () => {
    const a = auditPostCompliance({ caption: "#ad Paid partnership with Lumi", brand_name: "Lumi", qa: { checks: [] } });
    expect(a.checks.find((c) => c.type === "spoken_disclosure")?.result).toBe("pending");
    expect(a.checks.find((c) => c.type === "platform_label")?.result).toBe("pending");
    expect(a.checks.find((c) => c.type === "tracking_link")?.result).toBe("pending");
    expect(a.overall).toBe("pending");
  });

  it("carries a failed QA disclosure into the audit and blocks", () => {
    const bad = runQa(qaInput({ transcript: [seg(0, 2000, "Hi")] }));
    const a = auditPostCompliance({ caption: "#ad Paid partnership with Lumi", brand_name: "Lumi", qa: bad });
    expect(a.checks.find((c) => c.type === "spoken_disclosure")).toMatchObject({ result: "fail", blocks_settlement: true });
    expect(a.blocks_settlement).toBe(true);
    expect(a.overall).toBe("fail");
  });
});

describe("review queue order", () => {
  const row = (qa_fail: number, qa_warn: number, flow_points: number, submitted_at: string) => ({ qa_fail, qa_warn, flow_points, submitted_at });

  it("sorts QA flags first, then Flow Score (lower first), then age (oldest first)", () => {
    const rows = [
      row(0, 0, 90, "2026-10-01T10:00:00Z"),
      row(1, 0, 90, "2026-10-02T10:00:00Z"),
      row(0, 2, 60, "2026-10-02T10:00:00Z"),
      row(0, 0, 60, "2026-10-03T10:00:00Z"),
      row(0, 0, 60, "2026-10-01T10:00:00Z"),
      row(2, 1, 80, "2026-10-02T10:00:00Z"),
    ];
    const sorted = [...rows].sort(compareForReviewQueue);
    expect(sorted.map((r) => [r.qa_fail, r.qa_warn, r.flow_points, r.submitted_at.slice(8, 10)])).toEqual([
      [2, 1, 80, "02"],
      [1, 0, 90, "02"],
      [0, 2, 60, "02"],
      [0, 0, 60, "01"],
      [0, 0, 60, "03"],
      [0, 0, 90, "01"],
    ]);
    expect(compareForReviewQueue(rows[0], rows[0])).toBe(0);
  });
});
