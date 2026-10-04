/**
 * Bounty drafting from an App Store listing (the Flo draft in /brand/bounties/new).
 *
 * The WORDS (title, brief, hooks) are Flo's; the NUMBERS (price, budget, fee, Pay Math, fill time) and the LINT are the engine's, always,
 * so a draft can never promise a price the platform would not price or a brief the platform would not publish. The audit generator
 * supplies the brief and the ten scored hooks; this file adds a title, the stacked pay (CPM plus CPA bonuses), funding, Pay Math, Brief
 * Lint, a plain-language rationale for every number, and the strings the builder streams.
 */

import { CATEGORY_META, FORMAT_ID_META, type AdPlatform, type Category, type Deliverables, type Platform } from "@/lib/contract/types";
import { generateAudit, parseAppInput, AUDIT_LABEL } from "@/lib/engine/audit";
import { lintBrief, type LintFinding } from "@/lib/engine/brieflint";
import { CONSTANTS, DEFAULT_CPA_RATES, takeRateFor } from "@/lib/engine/constants";
import { payMath } from "@/lib/engine/earnings";
import { baselineFor, fillTime } from "@/lib/engine/market";
import { formatCompact, formatHours, formatMoney, formatPercent } from "@/lib/engine/money";
import { budgetPlan, DEFAULT_FUNNEL, fundingFor } from "@/lib/engine/pricing";
import { buildRightsCard } from "@/lib/engine/rights";
import { pick } from "@/lib/engine/rng";
import { addDays } from "@/lib/engine/time";
import { joinList } from "@/lib/engine/text";
import type { FloApp, FloTaskOf } from "../schemas";
import { FLO_DRAFT_LABEL, type BountyDraft, type DraftLintFinding } from "../types";
import { act, lowerFirst, rngFor, type MockAnswer } from "./common";

/** Three working titles per category, in the voice of a creator's video (not an ad slogan). */
const TITLES: Readonly<Record<Category, readonly string[]>> = {
  ai_photo: ["The photo I almost deleted", "One tap, one better photo", "Edit with me"],
  ai_assistant: ["The question I stopped googling", "Ask it anything, honestly", "Reply in my voice"],
  fitness: ["The workout I stopped skipping", "Fifteen minutes, no excuses", "My first week, honestly"],
  language: ["I spoke it on day one", "Day 1 vs day 30", "Five minutes, one new phrase"],
  productivity: ["Plan my day in 60 seconds", "The to-do list I finally finish", "Write it in one take"],
  finance: ["Where my money actually goes", "A budget I can read in ten seconds", "Last month, in one screen"],
  sleep_mind: ["My ten-minute wind-down", "What I do instead of scrolling", "A calmer evening"],
  music_audio: ["I made a beat in five minutes", "Hum it, loop it, share it", "My first track"],
  lifestyle: ["The plan that took one message", "Sorted in a tap", "My week, planned"],
};

/** The default pool for a first draft: $1,500 buys a real test without a big commitment. */
export const DEFAULT_DRAFT_BUDGET_CENTS = 150_000;
/** A first bounty is matched by up to $500, never more than half the pool (docs/DECISIONS.md section 2). */
const MATCH_CAP_CENTS = 50_000;

const AD_PLATFORMS: readonly AdPlatform[] = ["tiktok", "meta"];
const DEFAULT_PLATFORMS: readonly Platform[] = ["tiktok", "instagram"];

function toDraftFinding(f: LintFinding): DraftLintFinding {
  return { code: f.code, severity: f.severity, title: f.title, message: f.message, fix: f.fix };
}

/**
 * Runs Brief Lint over a draft's current brief, rights and pay, exactly as the builder and the server do at publish. Used after any
 * edit to the words, so a draft always carries the lint of what it currently says.
 */
export function lintDraft(draft: Pick<BountyDraft, "type" | "cpm_cents" | "per_video_cap_cents" | "budget_cents" | "brief" | "rights_card" | "deliverables" | "starts_at" | "ends_at" | "cpa_install_cents" | "cpa_trial_cents" | "cpa_paid_cents" | "category">, plan: "free" | "pro" | "scale", firstBounty: boolean, now: string): BountyDraft["lint"] & { pay_math: BountyDraft["pay_math"] } {
  const baseline = baselineFor(draft.category);
  const result = lintBrief(
    {
      type: draft.type,
      plan,
      cpm_cents: draft.cpm_cents,
      rates: { install: draft.cpa_install_cents, trial: draft.cpa_trial_cents, paid: draft.cpa_paid_cents },
      per_video_cap_cents: draft.per_video_cap_cents,
      budget_cents: draft.budget_cents,
      brief: draft.brief,
      rights_card: draft.rights_card,
      deliverables: draft.deliverables,
      starts_at: draft.starts_at,
      ends_at: draft.ends_at,
      median_views: baseline.median_views,
      basis: `${CATEGORY_META[draft.category].label}, ${baseline.sample_n} comparable bounties`,
      first_bounty: firstBounty,
    },
    now,
  );
  return { can_publish: result.can_publish, blockers: result.blockers, warnings: result.warnings, infos: result.infos, findings: result.findings.map(toDraftFinding), pay_math: result.pay_math };
}

function buildDeliverables(category: Category): Deliverables {
  return {
    videos_per_creator: 1,
    min_duration_s: 15,
    max_duration_s: 30,
    aspect: "9:16",
    platforms: [...DEFAULT_PLATFORMS],
    regions: ["US"],
    require_face: false,
    music_policy: "commercial_library",
    ai_policy: category === "ai_photo" || category === "ai_assistant" ? "allowed_disclosed" : "not_allowed",
  };
}

/** Swaps the audit's category-default feature names for the app's own, where the app lists them. */
function withOwnFeatures(brief: BountyDraft["brief"], app: FloApp | undefined, appName: string, defaults: readonly string[]): BountyDraft["brief"] {
  const own = app?.features ?? [];
  if (own.length === 0) return brief;
  const first = own[0] ?? defaults[0] ?? "the main feature";
  const second = own[1] ?? first;
  return {
    ...brief,
    talking_points: brief.talking_points.map((p, i) => (i === 1 ? `Show ${first} working on screen` : p)),
    beats: brief.beats.map((b) => {
      if (b.beat === "demo") return { ...b, label: `Demo ${first}` };
      if (b.beat === "key_feature") return { ...b, label: `Show ${second}` };
      return b;
    }),
    summary: app?.tagline ? `Show how ${appName} works: ${app.tagline.replace(/[.!]+$/, "")}. Keep it honest and under 30 seconds, with the app on screen.` : brief.summary,
  };
}

/**
 * The draft. Deterministic for a given input and attempt; a regenerate (attempt 1, 2, ...) picks a different working title but keeps
 * every number, because the numbers come from the engine.
 */
export function buildBountyDraft(task: FloTaskOf<"bounty_draft">, attempt: number): BountyDraft {
  const rng = rngFor(task, attempt);
  const plan = task.plan ?? "free";
  const firstBounty = task.first_bounty === true;
  const input = task.app?.name && !/^https?:\/\//i.test(task.input) ? task.app.name : task.input;
  const parsed = parseAppInput(input);
  const audit = generateAudit({ input, now: task.now, ...(task.app?.category ? { category: task.app.category } : {}) });
  const category = audit.category;
  const baseline = baselineFor(category);

  const type = "stacked" as const;
  const rates = { ...DEFAULT_CPA_RATES };
  const cpm = audit.predicted_cpm_cents.median;
  const cap = CONSTANTS.pay.default_per_video_cap_cents;
  const budget = task.budget_cents ?? DEFAULT_DRAFT_BUDGET_CENTS;
  const matched = firstBounty ? Math.min(MATCH_CAP_CENTS, Math.floor(budget / 2)) : 0;
  const take = takeRateFor({ plan, type, firstBountyWaived: firstBounty });
  const funding = fundingFor({ budget_cents: budget, plan, type, first_bounty: firstBounty, matched_cents: matched });
  const fill = fillTime({ cpm_cents: cpm, clearing_cpm_cents: baseline.clearing_cpm_cents, median_fill_hours: baseline.median_fill_hours, sample_n: baseline.sample_n });
  const plan_ = budgetPlan({
    budget_cents: budget,
    take_rate: take,
    cpm_cents: cpm,
    avg_first_payment_cents: 0,
    matched_cents: matched,
    funnel: { ...DEFAULT_FUNNEL, install_to_trial: baseline.install_to_trial, trial_to_paid: baseline.trial_to_paid },
  });

  const names = (task.app?.features ?? []).slice(0, 6);
  const brief = withOwnFeatures(audit.brief, task.app, audit.app_name, audit.features);
  const rights = buildRightsCard({ paid_ads_days: CONSTANTS.rights.paid_ads_default_days, ad_platforms: AD_PLATFORMS });
  const deliverables = buildDeliverables(category);
  const starts_at = task.now;
  const ends_at = addDays(task.now, 30);
  const title = pick(rng, TITLES[category]);

  const draft: BountyDraft = {
    category,
    app: { name: audit.app_name, slug: parsed.slug, category, store_url: audit.store_url, tagline: task.app?.tagline ?? audit.tagline, features: names.length > 0 ? names : audit.features },
    title,
    type,
    brief,
    cpm_cents: cpm,
    cpa_install_cents: rates.install,
    cpa_trial_cents: rates.trial,
    cpa_paid_cents: rates.paid,
    per_video_cap_cents: cap,
    budget_cents: budget,
    rights_card: rights,
    deliverables,
    format_ids: [...audit.suggested_format_ids],
    hooks: audit.hooks,
    pricing: {
      clearing_cpm_cents: baseline.clearing_cpm_cents,
      p25_cpm_cents: audit.predicted_cpm_cents.low,
      p75_cpm_cents: audit.predicted_cpm_cents.high,
      fill_hours_p50: fill.fill_hours_p50,
      confidence: fill.confidence,
      thin_market: fill.thin_market,
      basis: `${baseline.sample_n} comparable ${CATEGORY_META[category].label} bounties`,
    },
    funding,
    estimate: { views: plan_.views, trials_median: plan_.band.median.trials, cost_per_trial_cents: plan_.band.median.cost_per_trial_cents },
    pay_math: null,
    lint: { can_publish: false, blockers: 0, warnings: 0, infos: 0, findings: [] },
    rationale: [],
    starts_at,
    ends_at,
  };

  const linted = lintDraft(draft, plan, firstBounty, task.now);
  draft.lint = { can_publish: linted.can_publish, blockers: linted.blockers, warnings: linted.warnings, infos: linted.infos, findings: linted.findings };
  draft.pay_math = linted.pay_math ?? payMath({ cpm_cents: cpm, rates: { install: rates.install, trial: rates.trial, paid: rates.paid }, per_video_cap_cents: cap, plan, type, first_bounty: firstBounty, median_views: baseline.median_views, basis: draft.pricing.basis });
  draft.rationale = rationaleFor(draft, { plan, take, firstBounty, matched });
  return draft;
}

function rationaleFor(d: BountyDraft, ctx: { plan: "free" | "pro" | "scale"; take: number; firstBounty: boolean; matched: number }): string[] {
  const label = CATEGORY_META[d.category].label;
  const { funding } = d;
  const lines = [
    `Price: ${formatMoney(d.cpm_cents)} per 1,000 verified views is the median clearing CPM for ${label}, from ${d.pricing.basis}. At that price a bounty fills in about ${formatHours(d.pricing.fill_hours_p50)} (${Math.round(d.pricing.confidence * 100)}% confidence).`,
    `Pay stack: the CPM is the base. ${formatMoney(d.cpa_install_cents)} per install, ${formatMoney(d.cpa_trial_cents)} per trial and ${formatMoney(d.cpa_paid_cents)} per paid subscription reward what you actually want. CPA pays on tracked link and code conversions only.`,
    `Cap: ${formatMoney(d.per_video_cap_cents, { cents: "auto" })} per video, CPM and CPA together, so one viral post cannot drain the pool. Approved posts are paid even if the pool runs out.`,
    ctx.firstBounty
      ? `Funding: the platform fee is waived on your first bounty, and flowd matches ${formatMoney(ctx.matched, { cents: "auto" })} of the ${formatMoney(d.budget_cents, { cents: "auto" })} pool. You fund ${formatMoney(funding.brand_funded_cents)} plus card processing.`
      : `Funding: the ${formatMoney(d.budget_cents)} pool plus a ${formatMoney(funding.fee_reserve_cents)} platform fee (${formatPercent(ctx.take)}) is held in escrow: ${formatMoney(funding.escrow_total_cents)}, plus card processing. A bounty cannot go live until it is fully funded.`,
    `Rights: organic posting is always included, plus ${d.rights_card.paid_ads_days} days of paid-ad use on ${joinList(d.rights_card.ad_platforms.map((p) => (p === "tiktok" ? "TikTok" : "Meta")))}, renewable at ${formatPercent(d.rights_card.renewal_pct_per_30d, 0)} of the base fee per 30 days. AI likeness is off.`,
  ];
  if (d.pricing.thin_market) lines.push(`Only ${d.pricing.basis}: treat the price as a rough guide until more bounties settle.`);
  lines.push(AUDIT_LABEL);
  return lines;
}

/** The five strings the builder streams, in the order of the existing suggestions: title, brief, pay, budget and rights, formats and lint. */
export function draftOutputs(d: BountyDraft): string[] {
  const label = lowerFirst(CATEGORY_META[d.category].label);
  const formats = joinList(d.format_ids.slice(0, 3).map((id) => FORMAT_ID_META[id].label.toLowerCase()));
  const hook = d.hooks[0]?.text;
  const lintLine = d.lint.blockers > 0 ? `Brief Lint blocks publishing: ${d.lint.findings.find((f) => f.severity === "blocker")?.title ?? "fix the blockers"}.` : d.lint.warnings > 0 ? `Brief Lint passes; ${d.lint.warnings === 1 ? "one warning" : `${d.lint.warnings} warnings`}: ${(d.lint.findings.find((f) => f.severity === "warning")?.title ?? "see the panel").toLowerCase()}.` : "Brief Lint passes with no warnings.";
  return [
    `Title: ${d.title}`,
    `Brief: ${d.brief.summary.replace(/\s+/g, " ")}${hook ? ` Open with a hook such as: "${hook}"` : ""}`,
    `Suggested pay: ${formatMoney(d.cpm_cents)} per 1,000 verified views (the median clearing CPM for ${label}), ${formatMoney(d.cpa_install_cents)} per install, ${formatMoney(d.cpa_trial_cents)} per trial, ${formatMoney(d.cpa_paid_cents)} per paid, capped at ${formatMoney(d.per_video_cap_cents, { cents: "auto" })} per video.`,
    `Budget: ${formatMoney(d.budget_cents)} funds about ${formatCompact(d.estimate.views)} views of CPM pay at the clearing price. Rights: ${d.rights_card.paid_ads_days} days of paid usage, organic always included.`,
    `Recommended formats: ${formats}. ${lintLine}`,
  ];
}

export function answerBountyDraft(task: FloTaskOf<"bounty_draft">, attempt: number): MockAnswer {
  const draft = buildBountyDraft(task, attempt);
  return {
    surface: task.surface ?? "builder",
    title: `Draft bounty for ${draft.app.name}`,
    outputs: draftOutputs(draft),
    notes: draft.rationale,
    actions: [act("Apply the draft", "apply_draft", task.app?.id ?? draft.app.slug), act("Open the builder", "open_builder")],
    label: FLO_DRAFT_LABEL,
    draft,
  };
}
