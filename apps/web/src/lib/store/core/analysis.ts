/**
 * Video understanding, mocked. There is no real video in the demo: a "clip" is a script, a few timings and some metadata. This builds what the
 * ML pipeline would return for it (transcript, on-screen text, scenes, beats, hook, QA checks, Hook Score and Flow Score), using the engine's own
 * checklists, so the scores a creator sees in Studio are the same ones the brand sees in the review queue.
 *
 * Everything is deterministic: the same clip always gives the same analysis.
 */

import type {
  App,
  BeatHit,
  Bounty,
  Brand,
  CtaType,
  Format,
  HookType,
  OnScreenText,
  SceneCut,
  TranscriptSegment,
  VideoAnalysis,
  VideoTags,
} from "@/lib/contract/types";
import {
  CHECKLIST_LABEL,
  detectPatterns,
  firstSentence,
  hashString,
  runQa,
  scoreAnalysis,
  textParity,
  wordCount,
  WORDS_PER_SECOND,
  type QaReport,
  type Scored,
} from "@/lib/engine";

/** What a creator hands Studio when they "upload" a clip. */
export interface ClipInput {
  /** The spoken script, as sentences. Without one the brief's talking points are used. */
  script?: string;
  /** The first line (the hook). Defaults to the first sentence of the script. */
  hook_text?: string;
  /** Burned-in caption lines (the hook is added automatically unless `caption_hook` is false). */
  on_screen_text?: string[];
  caption_hook?: boolean;
  duration_s?: number;
  /** When speech starts, in ms. Default 450. */
  speech_start_ms?: number;
  /** When a face is first on screen, in ms. Omit for a faceless format. */
  face_at_ms?: number;
  /** When the app is first on screen, in ms. */
  app_at_ms?: number;
  /** Add the spoken and on-screen #ad automatically (Studio does). Default true. */
  include_disclosure?: boolean;
  has_captions?: boolean;
  width?: number;
  height?: number;
  music?: { detected: boolean; kind?: "original" | "commercial_library" | "trending_sound" | "unknown" };
  ai_content?: { generated: boolean; labelled: boolean };
  watermark_detected?: boolean;
  /** Hashes of other videos to compare with (other creators' and this creator's own). */
  known_hashes?: readonly { id: string; phash: string; creator_id?: string }[];
}

export interface ClipAnalysis {
  analysis: Omit<VideoAnalysis, "id" | "submission_id" | "version" | "analysed_at">;
  qa: QaReport;
  hook: Scored;
  flow: Scored;
  tags: VideoTags;
}

/** Sentences in reading order. Avoids regex look-behind so it parses in every browser the app supports. */
const splitSentences = (text: string): string[] => (text.match(/[^.?!…]+(?:[.?!…]+|$)/g) ?? []).map((s) => s.trim()).filter(Boolean);

/** The disclosure line a creator says out loud. */
export const spokenDisclosure = (brandName: string): string => `This is a paid partnership with ${brandName}.`;

/** A 16-character hex perceptual hash derived from the clip's content, so two uploads of the same script collide. */
export function phashOf(...parts: string[]): string {
  const a = hashString(parts.join("|")).toString(16).padStart(8, "0");
  const b = hashString(parts.join("|").split("").reverse().join("")).toString(16).padStart(8, "0");
  return `${a}${b}`;
}

function ctaTypeOf(cta: string): CtaType {
  const t = cta.toLowerCase();
  if (/\bbio\b/.test(t)) return "link_in_bio";
  if (/\bcode\b/.test(t)) return "use_code";
  if (/app store|search/.test(t)) return "search_app_store";
  if (/download/.test(t)) return "download_now";
  if (/comment/.test(t)) return "comment_for_link";
  return "try_free";
}

/** Builds the analysis of a clip against a bounty. */
export function analyzeClip(p: { clip: ClipInput; bounty: Bounty; app: App; brand: Brand; format?: Format; creatorId: string; title: string }): ClipAnalysis {
  const { clip, bounty, app, brand, format } = p;
  const brief = bounty.brief;
  const include = clip.include_disclosure !== false;
  const baseScript = (clip.script?.trim() ?? "") || [clip.hook_text, ...brief.talking_points, brief.offer_line, brief.cta].filter(Boolean).join(" ");
  const sentences = splitSentences(baseScript);
  if (clip.hook_text && !sentences[0]?.toLowerCase().startsWith(clip.hook_text.toLowerCase().slice(0, 12))) sentences.unshift(clip.hook_text.trim());

  // ── timeline: 3 words per second, a short breath between sentences ──
  const speechStart = clip.speech_start_ms ?? 450;
  const transcript: TranscriptSegment[] = [];
  let t = speechStart;
  const lines = include && !sentences.some((s) => /paid partnership|#ad|hashtag ad/i.test(s)) ? [...sentences.slice(0, Math.max(1, sentences.length - 1)), spokenDisclosure(brand.name), ...sentences.slice(Math.max(1, sentences.length - 1))] : sentences;
  for (const line of lines) {
    const ms = Math.max(900, Math.round((wordCount(line) / WORDS_PER_SECOND) * 1000));
    transcript.push({ t_start_ms: t, t_end_ms: t + ms, text: line });
    t += ms + 180;
  }
  const naturalMs = t + 600;
  const durationMs = Math.max(Math.round((clip.duration_s ?? 0) * 1000), naturalMs);
  const hookLine = firstSentence(clip.hook_text ?? transcript[0]?.text ?? "");
  const hookSeg = transcript[0];
  const landsAt = hookSeg ? hookSeg.t_end_ms : 0;

  // ── on-screen text ──
  const onScreen: OnScreenText[] = [];
  if (clip.caption_hook !== false && hookLine) onScreen.push({ t_start_ms: Math.max(0, speechStart - 100), t_end_ms: Math.min(landsAt + 1200, durationMs), text: hookLine.toUpperCase(), in_safe_zone: true });
  for (const [i, line] of (clip.on_screen_text ?? []).entries()) {
    const start = Math.round(landsAt + 1600 + i * 2200);
    onScreen.push({ t_start_ms: start, t_end_ms: Math.min(start + 2000, durationMs), text: line, in_safe_zone: true });
  }
  if (include) {
    const disclosureAt = transcript.find((s) => /paid partnership/i.test(s.text))?.t_start_ms ?? Math.round(durationMs * 0.55);
    onScreen.push({ t_start_ms: disclosureAt, t_end_ms: Math.min(disclosureAt + 2600, durationMs), text: brief.disclosure_text || `#ad Paid partnership with ${brand.name}`, in_safe_zone: true });
  }
  if (brief.cta) onScreen.push({ t_start_ms: Math.round(durationMs * 0.82), t_end_ms: durationMs, text: `${app.name}: ${brief.cta}`, in_safe_zone: true });
  onScreen.sort((a, b) => a.t_start_ms - b.t_start_ms);

  // ── scenes ──
  const faceless = format?.faceless ?? false;
  const faceAt = faceless ? undefined : (clip.face_at_ms ?? 300);
  const appAt = clip.app_at_ms ?? 2200;
  const scenes: SceneCut[] = [
    { t_start_ms: 0, t_end_ms: appAt, kind: faceless ? "text_card" : "face" },
    { t_start_ms: appAt, t_end_ms: Math.min(durationMs, appAt + 6500), kind: "screen_recording" },
  ];
  if (durationMs > appAt + 6500) scenes.push({ t_start_ms: appAt + 6500, t_end_ms: durationMs, kind: faceless ? "screen_recording" : "face" });

  // ── hook ──
  const captionAt = onScreen.find((o) => textParity(hookLine, o.text) > 0.4)?.t_start_ms;
  const hookType: HookType = detectPatterns(hookLine)[0] ?? "direct_question";
  const hook = {
    text: hookLine,
    hook_type: hookType,
    lands_at_ms: landsAt,
    ...(faceAt !== undefined ? { face_at_ms: faceAt } : {}),
    app_at_ms: appAt,
    ...(captionAt !== undefined ? { caption_at_ms: captionAt } : {}),
    spoken_matches_onscreen: captionAt !== undefined,
  };

  // ── QA, beats and the two checklist scores ──
  const policy = bounty.deliverables;
  const phash = phashOf(p.creatorId, p.title, baseScript);
  const qa = runQa({
    transcript,
    on_screen_text: onScreen,
    duration_ms: durationMs,
    width: clip.width ?? 1080,
    height: clip.height ?? 1920,
    brief: { beats: brief.beats, banned_claims: brief.banned_claims, disclosure_text: brief.disclosure_text, offer_line: brief.offer_line, cta: brief.cta, hashtags: brief.hashtags, mentions: brief.mentions },
    deliverables: { min_duration_s: policy.min_duration_s, max_duration_s: policy.max_duration_s, aspect: policy.aspect, music_policy: policy.music_policy, ai_policy: policy.ai_policy },
    brand_name: app.name,
    app_features: app.features,
    competitor_names: brand.compliance_defaults.competitor_names,
    music: clip.music ?? { detected: policy.music_policy === "commercial_library", kind: policy.music_policy === "commercial_library" ? "commercial_library" : "original" },
    ai_content: clip.ai_content,
    watermark_detected: clip.watermark_detected,
    audio: { snr_db: 22, clipping: false },
    phash,
    known_hashes: clip.known_hashes,
  });
  const scored = scoreAnalysis({ hook, transcript, on_screen_text: onScreen, scenes, beats: qa.beats as BeatHit[], duration_ms: durationMs }, { faceless, format_beats: format?.beats.map((b) => b.beat) });
  const tags: VideoTags = {
    ...(format ? { format_id: format.id } : {}),
    hook_type: hookType,
    hook_words: hookLine.split(/\s+/).slice(0, 4).join(" "),
    time_to_app_reveal_ms: appAt,
    cta_type: ctaTypeOf(brief.cta),
  };
  return {
    analysis: {
      duration_ms: durationMs,
      language: "en",
      transcript,
      transcript_text: transcript.map((s) => s.text).join(" "),
      on_screen_text: onScreen,
      scenes,
      hook,
      beats: qa.beats as BeatHit[],
      tags,
      checks: qa.checks,
      hook_score: { band: scored.hook.band, points: scored.hook.points, items: scored.hook.items, label: CHECKLIST_LABEL },
      flow_score: { band: scored.flow.band, points: scored.flow.points, items: scored.flow.items, label: CHECKLIST_LABEL },
      phash,
      ...(qa.duplicates[0] ? { duplicate_of_submission_id: qa.duplicates[0].id } : {}),
    },
    qa,
    hook: scored.hook,
    flow: scored.flow,
    tags,
  };
}
