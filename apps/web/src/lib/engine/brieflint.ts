/**
 * Brief Lint and Pay Math: the pre-publish checks that stop traps in a bounty.
 *
 * Runs on every edit in the builder and again on the server at publish, with the same ruleset (CONSTANTS.lint). A blocker stops publishing; a warning
 * and an info show with a fix. Blockers: missing deliverables or platforms, view-minimum base pay, unpaid test or trial videos, burner or fresh accounts,
 * forced posting counts, perpetual rights, AI likeness, pay-to-join, a CPM under the floor, and a budget under $100.
 *
 * Text rules look for what a brief DEMANDS. A line that forbids the trap ("no new account needed") is not flagged.
 */

import type { BountyType, BriefLint, BriefLintCode, BriefLintIssue, Brief, Deliverables, IsoTimestamp, LintSeverity, PayMath, Plan, RightsCard } from "@/lib/contract/types";
import { CONSTANTS, type CpaRates } from "./constants";
import { payMath } from "./earnings";
import { formatMoney } from "./money";
import { callsToAction } from "./text";
import { DAY_MS, toMs } from "./time";

// ── input and output ───────────────────────────────────────────────────────────────────────────

export interface BriefLintInput {
  type: BountyType;
  plan: Plan;
  cpm_cents: number;
  rates?: CpaRates;
  /** Flat fee for a direct bounty (cents). */
  flat_fee_cents?: number;
  /** The bounty's own take rate (a platform-funded bounty is 0; a bounty keeps the rate it was created with). Defaults to the plan's. */
  take_rate?: number;
  per_video_cap_cents: number;
  budget_cents: number;
  brief: Pick<Brief, "summary" | "talking_points" | "dos" | "donts" | "cta" | "offer_line" | "tone" | "disclosure_text">;
  rights_card: Pick<RightsCard, "paid_ads_days" | "ai_likeness">;
  deliverables: Pick<Deliverables, "videos_per_creator" | "min_duration_s" | "max_duration_s" | "platforms" | "regions">;
  starts_at: IsoTimestamp;
  ends_at: IsoTimestamp;
  /** The category's median verified views per post, to compute effective pay. Without it the low-pay rule cannot run. */
  median_views?: number;
  /** Where the median comes from, for the Pay Math basis line. */
  basis?: string;
  first_bounty?: boolean;
  /** Any other free text on the bounty (a title, a message to creators) to scan for traps. */
  extra_text?: readonly string[];
}

export interface LintFinding extends BriefLintIssue {
  /** Short name of the rule: "Pay to join". */
  title: string;
  /** What to do about it. */
  fix: string;
  /** The words in the brief that triggered a text rule. */
  matched_text?: string;
  /** An Ops override covers this finding (it no longer blocks). */
  overridden?: boolean;
}

export interface BriefLintResult extends BriefLint {
  findings: LintFinding[];
  blockers: number;
  warnings: number;
  infos: number;
  can_publish: boolean;
  /** Expected creator pay at the median and the brand's all-in CPM, when `median_views` was given. */
  pay_math: PayMath | null;
}

const RULE = CONSTANTS.lint.rules;
const TITLE: Record<BriefLintCode, string> = {
  missing_deliverables: "Missing deliverables",
  missing_platforms: "Missing platforms",
  missing_regions: "Missing regions",
  view_minimum_base: "View-minimum base pay",
  unpaid_trial: "Unpaid trial",
  burner_account: "Burner account demanded",
  fresh_account_demand: "Fresh account demanded",
  forced_posting_count: "Forced posting count",
  perpetual_rights: "Perpetual rights",
  ai_likeness_requested: "AI likeness requested",
  pay_to_join: "Pay to join",
  below_floor_cpm: "CPM below floor",
  no_disclosure_text: "No disclosure wording",
  unclear_cta: "Unclear CTA",
  cap_too_low: "Cap too low",
  low_effective_pay: "Low effective pay",
  budget_below_minimum: "Budget below minimum",
  short_window: "Short deadline",
};

const MESSAGE: Record<BriefLintCode, string> = {
  missing_deliverables: "The brief doesn't say how many videos, how long, or in what ratio.",
  missing_platforms: "No platform is chosen.",
  missing_regions: "No target regions are set, so matching and fraud checks can't use them.",
  view_minimum_base: "Base pay starts only after a view minimum. Creators are paid from the first verified view.",
  unpaid_trial: "The brief asks for an unpaid test, sample or trial video.",
  burner_account: "The brief asks creators to use a new, dedicated or burner account.",
  fresh_account_demand: "The brief asks for a fresh account or forbids personal posting.",
  forced_posting_count: "The brief demands a posting cadence with no pay attached.",
  perpetual_rights: "The rights run forever or past 365 days.",
  ai_likeness_requested: "The brief asks to use a creator's voice or likeness with AI.",
  pay_to_join: "The brief charges creators to take part.",
  below_floor_cpm: `The CPM is under the ${formatMoney(CONSTANTS.pay.floor_cpm_cents)} floor.`,
  no_disclosure_text: "No disclosure wording is set.",
  unclear_cta: "The call to action is missing or asks for more than one thing.",
  cap_too_low: "The per-video cap is low enough that creators will skip this bounty.",
  low_effective_pay: "A typical creator earns very little per video at this rate.",
  budget_below_minimum: `The budget is under ${formatMoney(CONSTANTS.pay.min_bounty_budget_cents, { cents: "auto" })}.`,
  short_window: "The deadline is under 5 days, which leaves no room for revisions.",
};

const SEVERITY_ORDER: Record<LintSeverity, number> = { blocker: 0, warning: 1, info: 2 };

// ── text rules ─────────────────────────────────────────────────────────────────────────────────

interface TextPattern {
  re: RegExp;
  /** Skip the match when it is negated just before ("no", "not", "never", "without", "n't"). Off for patterns whose demand IS a negation. */
  guard?: boolean;
}

/**
 * A view threshold on a BONUS is fine ("Earn a $200 bonus once you hit 100k views"): the rule is about base pay. A sentence that talks about a bonus
 * and never mentions base pay, qualifying or being paid first is not a view-minimum trap.
 */
const BONUS_SENTENCE = /\b(?:bonus|bonuses|extra|on top|in addition|additional|tips?)\b/i;
const BASE_PAY_SENTENCE = /\b(?:base|qualif\w*|to be paid|to get paid|before (?:we |you(?:'ll)? )?(?:pay|get paid)|first)\b/i;

/** The sentence a match sits in (from the previous . ! ? or line break to the next). */
function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf(".", index - 1), text.lastIndexOf("!", index - 1), text.lastIndexOf("?", index - 1), text.lastIndexOf("\n", index - 1)) + 1;
  const end = text.slice(index).search(/[.!?\n]/);
  return text.slice(start, end === -1 ? text.length : index + end);
}

const isBonusThreshold = (text: string, index: number): boolean => {
  const sentence = sentenceAround(text, index);
  return BONUS_SENTENCE.test(sentence) && !BASE_PAY_SENTENCE.test(sentence);
};

const NUM = String.raw`\d[\d,.]*\s*(?:k|m)?\+?`;

const TEXT_RULES: Readonly<Partial<Record<BriefLintCode, readonly TextPattern[]>>> = {
  view_minimum_base: [
    { re: new RegExp(String.raw`\b(?:must|need(?:s)? to|have to|has to|required to|should)\s+(?:first\s+)?(?:reach|hit|get|have|achieve|gain|earn)\s+(?:at least\s+|a minimum of\s+|over\s+)?${NUM}\s*views?\b`, "i") },
    { re: new RegExp(String.raw`\b(?:paid|pay(?:ment|out)?|earn(?:ings)?|rewards?|compensat\w+)\b[^.!?\n]{0,40}\b(?:after|once|when|only if|starts? at|begins? at)\s+(?:you\s+)?(?:reach|hit|get|have|pass|exceed)?\s*${NUM}\s*views?\b`, "i") },
    { re: new RegExp(String.raw`\b${NUM}\s*views?\s+(?:minimum|to qualify|required|before (?:we |you(?:'ll)? )?(?:pay|get paid)|or (?:no|nothing))`, "i") },
    { re: new RegExp(String.raw`\bminimum (?:of )?${NUM}\s*views?\b`, "i") },
    { re: new RegExp(String.raw`\bqualif\w+\s+(?:at|with|after|for)\s+${NUM}\s*views?\b`, "i") },
  ],
  unpaid_trial: [
    { re: /\b(?:unpaid|free|no[- ]pay|without pay)\s+(?:test|sample|audition|trial)\s+(?:video|clip|post|shoot|content)\b/i },
    { re: /\bunpaid\s+(?:test|trial|sample|audition)\b/i },
    { re: /\b(?:test|sample|trial|audition)\s+(?:video|clip|post|shoot)\s+(?:before|prior to)\s+(?:we\s+)?(?:pay|hir|book|commit)/i },
  ],
  burner_account: [
    { re: /\b(?:burner|dedicated|separate|brand[- ]new|new)\s+(?:(?:tiktok|instagram|youtube|social|creator)\s+)*account\b/i },
    { re: /\baccount\s+(?:just|only|solely)\s+for\s+(?:us|this|our)\b/i },
    { re: /\bburner\b/i },
  ],
  fresh_account_demand: [
    { re: /\bfresh\s+(?:(?:tiktok|instagram|youtube|social)\s+)*account\b/i },
    { re: /\bno other content (?:on|in) (?:the|your) account\b/i, guard: false },
    { re: /\b(?:only|exclusively)\s+post(?:ing)?\s+(?:about\s+|for\s+)?(?:our|brand|us|the (?:brand|app)|this (?:brand|app)|content for us)\b/i },
    { re: /\bno\s+(?:personal|other)\s+(?:posts?|content)\b/i, guard: false },
  ],
  forced_posting_count: [
    { re: /\bposts?\s+(?:every day|daily|each day)\b/i },
    { re: /\bdaily\s+(?:posts?|posting|content|videos?)\b/i },
    { re: /\bfor\s+\d+\s+(?:days|weeks)\s+(?:straight|in a row)\b/i },
  ],
  perpetual_rights: [
    { re: /\bperpetual(?:ly)?\b/i },
    { re: /\bin perpetuity\b/i },
    { re: /\bunlimited\s+(?:usage|use|rights|licen[cs]e)\b/i },
    { re: /\b(?:rights?|usage|licen[cs]e|ads?|use)\b[^.!?\n]{0,40}\bforever\b/i },
    { re: /\bforever\b[^.!?\n]{0,30}\b(?:rights?|usage|licen[cs]e)\b/i },
    { re: /\birrevocabl[ey]\b/i },
  ],
  ai_likeness_requested: [
    { re: /\b(?:clone|cloning|replicate|recreate|synthesi[sz]e)\b[^.!?\n]{0,30}\b(?:your\s+)?(?:voice|likeness|face|image)\b/i },
    { re: /\btrain(?:ing)?\s+(?:an?\s+)?(?:ai|model)\b[^.!?\n]{0,40}\b(?:voice|likeness|face|videos?)\b/i },
    { re: /\bai\s+(?:likeness|avatar of you|version of you|clone)\b/i },
    { re: /\buse your (?:voice|likeness|face) (?:with|for|in) ai\b/i },
  ],
  pay_to_join: [
    { re: /\b(?:entry|registration|joining|sign[- ]?up|application)\s+fee\b/i },
    { re: /\b(?:pay|put down|place|submit)\s+(?:a\s+)?(?:refundable\s+)?deposit\b/i },
    { re: /\bpay to (?:join|participate|apply)\b/i },
    { re: /\b(?:buy|purchase)\s+(?:the|our)\s+(?:product|app|subscription|plan|premium|kit)\s+first\b/i },
    { re: /\bmust\s+(?:buy|purchase)\b/i },
  ],
};

/** A negation within the 30 characters before a match, in the same sentence. */
const NEGATION = /(?:\bno\b|\bnot\b|\bnever\b|\bwithout\b|\bnor\b|n't\b|\bdon't\b)[^.!?\n]{0,30}$/i;

interface Scan {
  field: string;
  text: string;
}

/** The first non-negated match of a rule in the fields, with the field and the matched words. */
function scanRule(code: BriefLintCode, fields: readonly Scan[]): { field: string; matched: string } | null {
  const patterns = TEXT_RULES[code] ?? [];
  for (const f of fields) {
    for (const { re, guard = true } of patterns) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
      for (const m of f.text.matchAll(g)) {
        const before = f.text.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0);
        if (guard && NEGATION.test(before)) continue;
        if (code === "view_minimum_base" && isBonusThreshold(f.text, m.index ?? 0)) continue;
        return { field: f.field, matched: m[0].trim() };
      }
    }
  }
  return null;
}

/** Cadence demands: "post 3 times a day" is always a trap; "3 videos per week" is one only when it asks for more than the paid deliverables. */
function scanCadence(fields: readonly Scan[], paidVideos: number): { field: string; matched: string } | null {
  const re = /\b(?:post\s+(?:at least\s+)?)?(\d+)\s+(?:times?|posts?|videos?)\s+(?:a|per|each|every)\s+(day|week)\b/gi;
  for (const f of fields) {
    for (const m of f.text.matchAll(re)) {
      const before = f.text.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0);
      if (NEGATION.test(before)) continue;
      const n = Number(m[1]);
      const period = m[2].toLowerCase();
      if (period === "day" || n > Math.max(1, paidVideos)) return { field: f.field, matched: m[0].trim() };
    }
  }
  return null;
}

// ── the linter ─────────────────────────────────────────────────────────────────────────────────

function fieldsOf(input: BriefLintInput): Scan[] {
  const b = input.brief;
  const out: Scan[] = [{ field: "brief.summary", text: b.summary }];
  b.talking_points.forEach((t, i) => out.push({ field: `brief.talking_points[${i}]`, text: t }));
  b.dos.forEach((t, i) => out.push({ field: `brief.dos[${i}]`, text: t }));
  b.donts.forEach((t, i) => out.push({ field: `brief.donts[${i}]`, text: t }));
  out.push({ field: "brief.cta", text: b.cta }, { field: "brief.tone", text: b.tone });
  if (b.offer_line) out.push({ field: "brief.offer_line", text: b.offer_line });
  (input.extra_text ?? []).forEach((t, i) => out.push({ field: `extra_text[${i}]`, text: t }));
  return out;
}

/**
 * Expected creator pay at p25, median and p75 views, and the brand's all-in CPM: the Pay Math on the builder and the bounty card. Null when no
 * category median is known. An estimate, labelled so.
 */
export function effectivePayAtMedian(input: Pick<BriefLintInput, "type" | "plan" | "cpm_cents" | "rates" | "per_video_cap_cents" | "median_views" | "basis" | "first_bounty" | "flat_fee_cents" | "take_rate">): PayMath | null {
  if (input.median_views === undefined) return null;
  return payMath({
    cpm_cents: input.cpm_cents,
    rates: input.rates,
    per_video_cap_cents: input.per_video_cap_cents,
    plan: input.plan,
    type: input.type,
    first_bounty: input.first_bounty,
    take_rate: input.take_rate,
    flat_fee_cents: input.flat_fee_cents,
    median_views: input.median_views,
    basis: input.basis ?? "Category median views, an estimate",
  });
}

/**
 * Brief Lint: 18 rules (CONSTANTS.lint). Returns every finding with severity, message, field and fix, ordered blockers first. `passed` is true when there
 * are no blockers. Findings in `overrides` (an Ops override, logged elsewhere) stay visible but stop blocking.
 */
export function lintBrief(input: BriefLintInput, checkedAt: IsoTimestamp, options: { overrides?: readonly BriefLintCode[] } = {}): BriefLintResult {
  const T = CONSTANTS.lint.thresholds;
  const overrides = new Set(options.overrides ?? []);
  const findings: LintFinding[] = [];
  const add = (code: BriefLintCode, field?: string, matched_text?: string): void => {
    findings.push({
      code,
      severity: RULE[code].severity as LintSeverity,
      message: MESSAGE[code],
      ...(field ? { field } : {}),
      title: TITLE[code],
      fix: RULE[code].fix,
      ...(matched_text ? { matched_text } : {}),
      ...(overrides.has(code) ? { overridden: true } : {}),
    });
  };
  const d = input.deliverables;
  const fields = fieldsOf(input);

  if (d.videos_per_creator < 1 || !(d.min_duration_s > 0) || !(d.max_duration_s > 0) || d.max_duration_s < d.min_duration_s) add("missing_deliverables", "deliverables.videos_per_creator");
  if (d.platforms.length === 0) add("missing_platforms", "deliverables.platforms");
  if (d.regions.length === 0) add("missing_regions", "deliverables.regions");
  for (const code of ["view_minimum_base", "unpaid_trial", "burner_account", "fresh_account_demand"] as const) {
    const hit = scanRule(code, fields);
    if (hit) add(code, hit.field, hit.matched);
  }
  const cadence = scanRule("forced_posting_count", fields) ?? scanCadence(fields, d.videos_per_creator);
  if (cadence) add("forced_posting_count", cadence.field, cadence.matched);
  if (input.rights_card.paid_ads_days > T.max_paid_ads_days) add("perpetual_rights", "rights_card.paid_ads_days", `${input.rights_card.paid_ads_days} days`);
  else {
    const hit = scanRule("perpetual_rights", fields);
    if (hit) add("perpetual_rights", hit.field, hit.matched);
  }
  if (input.rights_card.ai_likeness) add("ai_likeness_requested", "rights_card.ai_likeness", "AI likeness is on");
  else {
    const hit = scanRule("ai_likeness_requested", fields);
    if (hit) add("ai_likeness_requested", hit.field, hit.matched);
  }
  const payToJoin = scanRule("pay_to_join", fields);
  if (payToJoin) add("pay_to_join", payToJoin.field, payToJoin.matched);
  if (input.cpm_cents > 0 && input.cpm_cents < CONSTANTS.pay.floor_cpm_cents) add("below_floor_cpm", "cpm_cents");
  if (input.brief.disclosure_text.trim() === "") add("no_disclosure_text", "brief.disclosure_text");
  if (input.brief.cta.trim() === "" || callsToAction(input.brief.cta).length > 1) add("unclear_cta", "brief.cta");
  if (input.type !== "direct" && input.per_video_cap_cents < T.min_cap_cents) add("cap_too_low", "per_video_cap_cents");
  const pay_math = effectivePayAtMedian(input);
  if (pay_math && pay_math.median_cents < T.low_effective_pay_median_cents) add("low_effective_pay", "cpm_cents", `${formatMoney(pay_math.median_cents)} at the median`);
  if (input.budget_cents < T.min_budget_cents) add("budget_below_minimum", "budget_cents");
  if (toMs(input.ends_at) - toMs(input.starts_at) < T.short_window_days * DAY_MS) add("short_window", "ends_at");

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const blockers = findings.filter((f) => f.severity === "blocker" && !f.overridden).length;
  return {
    passed: blockers === 0,
    checked_at: checkedAt,
    issues: findings.map(({ code, severity, message, field }) => ({ code, severity, message, ...(field ? { field } : {}) })),
    findings,
    blockers,
    warnings: findings.filter((f) => f.severity === "warning").length,
    infos: findings.filter((f) => f.severity === "info").length,
    can_publish: blockers === 0,
    pay_math,
  };
}

/** True when nothing blocks publishing. */
export const canPublish = (lint: Pick<BriefLintResult, "can_publish">): boolean => lint.can_publish;
