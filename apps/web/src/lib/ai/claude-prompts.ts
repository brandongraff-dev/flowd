/**
 * What Flo says to Claude, and what it accepts back. Kept apart from the provider so the prompts, the JSON schemas and the output
 * validation are readable (and testable) without a network.
 *
 * Design rule: the model writes WORDS, the engine owns NUMBERS. Prices, fees, Pay Math and lint are never taken from the model; the
 * context carries the engine's numbers in and the provider re-checks every answer against the house rules on the way out.
 */

import { z } from "zod";
import type { FloTask } from "./schemas";

/** The stable system prompt (no timestamps, no ids: it never changes between requests). */
export const FLO_SYSTEM_PROMPT = `You are Flo, the copilot inside flowd, an open creator market where app teams fund bounties and creators make short videos for them.

Voice: confident, clear, a little playful. Plain English, short sentences, numbers over adjectives. No exclamation marks. Never hype income.

Rules you never break:
- Say "bounty", "creator", "brand" or "app team", "submission", "post" and "payout". Never "campaign", "gig" or "influencer".
- Every script and caption includes the disclosure line from the brief (#ad plus the brand's wording). Never suggest hiding that a post is paid. If a viewer asks whether a post is an ad, the answer is yes.
- Never promise or imply guaranteed results, income, views, installs, or health, weight-loss or financial outcomes. Never use a phrase listed in banned_claims.
- Hook Score and Flow Score are checklist scores, not predictions. Call them checklist scores when you mention them.
- Use only the facts, names and numbers in the context. If something is missing, say so. Do not invent statistics, quotes, prices or customers. Every app and person in the context is fictional; do not name real companies or people.
- Money in the context is in integer cents. Write dollars ($2.28), never cents.
- One call to action per script or caption.
- Be brief: an option should read in about ten seconds, except a script, which has one line per beat.

Reply with JSON that matches the schema you are given, and nothing else.`;

// ── output schemas (JSON Schema for structured outputs; no numeric or length constraints, those are checked after) ──────────────

/** Every task except a bounty draft. */
export const OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    outputs: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["title", "outputs", "notes"],
  additionalProperties: false,
} as const;

/** The creative half of a bounty draft. The numbers are the engine's. */
export const DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    talking_points: { type: "array", items: { type: "string" } },
    dos: { type: "array", items: { type: "string" } },
    donts: { type: "array", items: { type: "string" } },
    cta: { type: "string" },
    offer_line: { type: "string" },
    tone: { type: "string" },
    rationale: { type: "array", items: { type: "string" } },
  },
  required: ["title", "summary", "talking_points", "dos", "donts", "cta", "offer_line", "tone", "rationale"],
  additionalProperties: false,
} as const;

/** Validation of the model's answer, with the limits the schema above leaves out. */
export const ModelOutputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  outputs: z.array(z.string().trim().min(1).max(4000)).min(1).max(6),
  notes: z.array(z.string().trim().max(400)).max(6).default([]),
});

export const DraftCreativeSchema = z.object({
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(10).max(600),
  talking_points: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
  dos: z.array(z.string().trim().min(1).max(200)).max(6),
  donts: z.array(z.string().trim().min(1).max(200)).max(6),
  cta: z.string().trim().min(1).max(240),
  offer_line: z.string().trim().max(160),
  tone: z.string().trim().max(160),
  rationale: z.array(z.string().trim().min(1).max(300)).max(5),
});

export type ModelOutput = z.infer<typeof ModelOutputSchema>;
export type DraftCreative = z.infer<typeof DraftCreativeSchema>;

// ── instructions per task ──────────────────────────────────────────────────────────────────────

function instructionsFor(task: FloTask): string {
  switch (task.kind) {
    case "script":
      return `Write ${task.options ?? 3} scripts for this bounty. Each option is ONE string: a first line "Option N: <format name>, about <seconds> s", then one line per beat in the form "<beat label> (<start> to <end> s): <what to say or show>", then a line "Caption: <the disclosure_text>. Studio adds it for you.", then a line "Brief check: <whether the format covers every required beat in the brief>". Use a different format for each option, starting with the one in "format" when present, otherwise from "formats". Open each script with a different hook that can be said in 2 seconds (about 6 words); if "hook" is given, tighten it for the first option. Use the app's own features in demo beats. Title: "Three scripts for <bounty title>".`;
    case "hook_rewrite":
      return `Give ${task.limit ?? 3} rewrites of the hook. Each is ONE string in the form "<hook> (<pattern>, about <x.x> s to say: <it lands by 2 seconds. | trim a word or two to land by 2 seconds.>)". Aim for 6 words or fewer. Use different patterns from: confession, curiosity gap, specific number, POV, direct question, risk reversal, pattern interrupt${task.target_type ? `, and make every rewrite a ${task.target_type.replace(/_/g, " ")}` : ""}. Keep the creator's meaning. In "notes", say in one line what is weak about the original. Title: "Three sharper openings".`;
    case "brief_tldr":
      return `Summarise the brief in exactly five strings: "What to make: ...", "Must say and show: ...", "Pay: ..." (use the pay numbers in the context; say it is an estimate at the median creator's views and never a promise), "Rights: ..." (organic always; paid-ad days; AI likeness), "Disclosure and timing: ..." (the disclosure text, and that flowd decides within review_sla_hours hours with a reason code if it is a no). Title: "TL;DR: <bounty title>".`;
    case "caption":
      return `Write ${task.count ?? 3} captions. Each is ONE string: the disclosure_text on its own line, then one short line about the app, then one call to action (${task.creator_code ? `"Use my code ${task.creator_code}."` : `"link in bio"`}) and at most 3 hashtags. Each caption is different. Title: "Caption ideas with #ad".`;
    case "comment_reply":
      return `Write three short replies (under 160 characters each) to the viewer comment. If the comment asks whether the post is an ad or sponsored, say plainly that it is a paid partnership. Do not quote prices; point to the app listing. Do not claim results. Be kind to criticism. Title: "Three replies".`;
    case "score_fix":
      return `Explain the ${Math.min(3, task.items.filter((i) => !i.passed).length) || "no"} fixes worth the most points, in order. Each is ONE string: "<reason> Fix: <fix>". ${task.audience === "creator" ? "Speak to the creator in the second person." : "Write it so a brand reviewer can paste it into feedback to the creator."} Say it is a checklist score. If every item passes, say there is nothing to fix. Title: "${task.audience === "creator" ? `Your ${task.subject === "hook" ? "Hook" : "Flow"} Score is <points>. <Three fixes>` : `Why this video scores ${task.band}`}".`;
    case "rate_advice":
      return `Advise what to charge. Exactly three strings: the market-suggested price with its basis and middle band; ${task.videos > 1 ? "a fair bundle price for all the videos" : "a floor not to go below"}; and ${task.paid_usage_days > 0 ? "the renewal price for paid usage" : "a note to quote paid usage separately"}. Use only the numbers in the context. It is an estimate, not a promise.`;
    case "next_action":
      return `Say what to do today in at most three short strings, using only the signals that are present, most important first. No guilt: rest is fine, and pending money always comes with its date. If nothing needs attention, say so in one string. Title: "What to do today".`;
    case "bounty_draft":
      return `Write the creative half of a bounty draft for this app (the numbers are decided elsewhere). title: a working title in the voice of a creator's video, not an ad slogan, under 60 characters. summary: what the creator should make, in one or two sentences, with the app on screen. talking_points: three things to say or show. dos and donts: up to three each; never ask for burner accounts, view minimums, pay to join or unpaid test videos. cta: exactly one call to action. offer_line: the free-trial line, or an empty string. tone: a short phrase. rationale: up to three lines on why this angle suits the category. Never use a phrase from the banned list.`;
  }
}

/** The compact context Claude reads: the task minus its bookkeeping, as JSON. */
function contextFor(task: FloTask): Record<string, unknown> {
  const { kind: _kind, surface: _surface, context: _context, creator_id: _c, brand_id: _b, prompt: _p, attempt: _a, ...rest } = task;
  return rest;
}

export interface ClaudeRequestParts {
  system: string;
  user: string;
  schema: typeof OUTPUT_JSON_SCHEMA | typeof DRAFT_JSON_SCHEMA;
  /** Which validator applies to the reply. */
  expects: "outputs" | "draft";
}

/**
 * The pieces of the Messages API request for a task. `extraContext` adds facts the engine already decided (for a bounty draft: the
 * category, the banned claims and the beats) so the model writes inside them.
 */
export function buildClaudeRequest(task: FloTask, extraContext: Record<string, unknown> = {}): ClaudeRequestParts {
  const draft = task.kind === "bounty_draft";
  const attempt = task.attempt ?? 0;
  const user = JSON.stringify({
    task: task.kind,
    instructions: instructionsFor(task),
    // A regenerate asks for different wording, not different facts.
    ...(attempt > 0 ? { variation: `This is regeneration number ${attempt}. Give noticeably different wording and ideas from a first answer.` } : {}),
    context: { ...contextFor(task), ...extraContext },
  });
  return { system: FLO_SYSTEM_PROMPT, user, schema: draft ? DRAFT_JSON_SCHEMA : OUTPUT_JSON_SCHEMA, expects: draft ? "draft" : "outputs" };
}
