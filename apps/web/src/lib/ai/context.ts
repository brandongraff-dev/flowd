/**
 * Adapters from the contract's entities (what the store holds) to the task context Flo takes. Strings are cut to the schema's limits,
 * so a task built here always validates on the server route. Pages call these; they never hand-build a `FloTask`.
 *
 * ```ts
 * const task = scriptTask({ bounty, app, format, formats, creatorCode: "MAYA6", creatorId: "cr_maya" });
 * const result = await getFloProvider().generate(task);
 * ```
 */

import type { App, Bounty, Format, IsoTimestamp, Plan } from "@/lib/contract/types";
import { truncate } from "@/lib/format/text";
import type { FloApp, FloBounty, FloFormat, FloTask, FloTaskOf, NextActionSignals } from "./schemas";

const cut = (text: string, max: number): string => truncate(text.trim(), max, { wordSafe: true });
const cutAll = (items: readonly string[], count: number, max: number): string[] => items.slice(0, count).map((t) => cut(t, max)).filter(Boolean);

/** An app as Flo sees it: name, what it does, what can be demoed, and whether there is a free trial. */
export function toFloApp(app: Pick<App, "id" | "name" | "tagline" | "category" | "features" | "default_hashtags" | "pricing">): FloApp {
  return {
    id: app.id,
    name: cut(app.name, 80),
    tagline: cut(app.tagline, 200),
    category: app.category,
    features: cutAll(app.features, 8, 80),
    hashtags: cutAll(app.default_hashtags, 6, 40),
    has_free_trial: app.pricing.trial_days > 0,
  };
}

/** A bounty with its app, brief, pay, rights and Pay Math: the context scripts, TL;DRs and captions are written from. */
export function toFloBounty(bounty: Bounty, app: Pick<App, "id" | "name" | "tagline" | "category" | "features" | "default_hashtags" | "pricing">): FloBounty {
  const b = bounty.brief;
  return {
    id: bounty.id,
    title: cut(bounty.title, 160),
    app: toFloApp(app),
    brief: {
      summary: cut(b.summary, 600),
      talking_points: cutAll(b.talking_points, 8, 200),
      dos: cutAll(b.dos, 8, 200),
      donts: cutAll(b.donts, 8, 200),
      beats: b.beats.slice(0, 14).map((beat) => ({ beat: beat.beat, label: cut(beat.label, 200), required: beat.required, ...(beat.hint ? { hint: cut(beat.hint, 200) } : {}) })),
      cta: cut(b.cta, 240),
      ...(b.offer_line ? { offer_line: cut(b.offer_line, 160) } : {}),
      hashtags: cutAll(b.hashtags, 8, 40),
      tone: cut(b.tone, 160),
      disclosure_text: cut(b.disclosure_text, 200),
      banned_claims: cutAll(b.banned_claims, 24, 80),
    },
    type: bounty.type,
    cpm_cents: bounty.cpm_cents,
    cpa_install_cents: bounty.cpa_install_cents,
    cpa_trial_cents: bounty.cpa_trial_cents,
    cpa_paid_cents: bounty.cpa_paid_cents,
    flat_fee_cents: bounty.flat_fee_cents,
    per_video_cap_cents: bounty.per_video_cap_cents,
    paid_ads_days: bounty.rights_card.paid_ads_days,
    ai_likeness: bounty.rights_card.ai_likeness,
    format_ids: bounty.format_ids.slice(0, 11),
    median_pay_cents: bounty.pay_math.median_cents,
    p25_pay_cents: bounty.pay_math.p25_cents,
    p75_pay_cents: bounty.pay_math.p75_cents,
    review_sla_hours: bounty.review_sla_hours,
  };
}

/** A format with its beats and timings. */
export function toFloFormat(format: Pick<Format, "id" | "name" | "beats" | "min_duration_s" | "max_duration_s" | "hook_types" | "faceless">): FloFormat {
  return {
    id: format.id,
    name: cut(format.name, 80),
    beats: format.beats.slice(0, 14).map((b) => ({ beat: b.beat, label: cut(b.label, 120), t_start_s: b.t_start_s, t_end_s: b.t_end_s, required: b.required, tip: cut(b.tip, 240) })),
    min_duration_s: format.min_duration_s,
    max_duration_s: format.max_duration_s,
    hook_types: [...format.hook_types],
    faceless: format.faceless,
  };
}

interface Who {
  creatorId?: string;
  brandId?: string;
  prompt?: string;
  attempt?: number;
}

const who = (w: Who): { creator_id?: string; brand_id?: string; prompt?: string; attempt?: number } => ({
  ...(w.creatorId ? { creator_id: w.creatorId } : {}),
  ...(w.brandId ? { brand_id: w.brandId } : {}),
  ...(w.prompt ? { prompt: cut(w.prompt, 600) } : {}),
  ...(w.attempt ? { attempt: w.attempt } : {}),
});

/** Scripts for a bounty in the format the creator picked (and two more). */
export function scriptTask(p: Who & { bounty: Bounty; app: Parameters<typeof toFloApp>[0]; format?: Parameters<typeof toFloFormat>[0]; formats?: readonly Parameters<typeof toFloFormat>[0][]; hook?: string; creatorCode?: string; options?: 1 | 2 | 3 }): FloTaskOf<"script"> {
  return {
    kind: "script",
    surface: "studio",
    context: { kind: "bounty", id: p.bounty.id },
    bounty: toFloBounty(p.bounty, p.app),
    ...(p.format ? { format: toFloFormat(p.format) } : {}),
    ...(p.formats ? { formats: p.formats.slice(0, 11).map(toFloFormat) } : {}),
    ...(p.hook ? { hook: cut(p.hook, 240) } : {}),
    ...(p.creatorCode ? { creator_code: cut(p.creatorCode, 40) } : {}),
    ...(p.options ? { options: p.options } : {}),
    ...who(p),
  };
}

/** Three sharper openings for a creator's hook line. */
export function hookRewriteTask(p: Who & { hook: string; app: Parameters<typeof toFloApp>[0]; targetType?: FloTaskOf<"hook_rewrite">["target_type"]; submissionId?: string }): FloTaskOf<"hook_rewrite"> {
  return {
    kind: "hook_rewrite",
    surface: "studio",
    ...(p.submissionId ? { context: { kind: "submission", id: p.submissionId } } : {}),
    hook: cut(p.hook, 400),
    app: toFloApp(p.app),
    ...(p.targetType ? { target_type: p.targetType } : {}),
    ...who(p),
  };
}

/** The five-line TL;DR of a bounty's brief. */
export function briefTldrTask(p: Who & { bounty: Bounty; app: Parameters<typeof toFloApp>[0] }): FloTaskOf<"brief_tldr"> {
  return { kind: "brief_tldr", surface: "bounty_detail", context: { kind: "bounty", id: p.bounty.id }, bounty: toFloBounty(p.bounty, p.app), ...who(p) };
}

/** Caption ideas with the disclosure line. */
export function captionTask(p: Who & { bounty: Bounty; app: Parameters<typeof toFloApp>[0]; creatorCode?: string; platform?: FloTaskOf<"caption">["platform"] }): FloTaskOf<"caption"> {
  return {
    kind: "caption",
    surface: "studio",
    context: { kind: "bounty", id: p.bounty.id },
    bounty: toFloBounty(p.bounty, p.app),
    ...(p.creatorCode ? { creator_code: cut(p.creatorCode, 40) } : {}),
    ...(p.platform ? { platform: p.platform } : {}),
    ...who(p),
  };
}

/** Replies to a viewer's comment. */
export function commentReplyTask(p: Who & { comment: string; app: Parameters<typeof toFloApp>[0]; creatorCode?: string; postId?: string }): FloTaskOf<"comment_reply"> {
  return {
    kind: "comment_reply",
    surface: "studio",
    ...(p.postId ? { context: { kind: "post", id: p.postId } } : {}),
    comment: cut(p.comment, 500),
    app: toFloApp(p.app),
    ...(p.creatorCode ? { creator_code: cut(p.creatorCode, 40) } : {}),
    ...who(p),
  };
}

/** A bounty draft from an App Store link (or an app name). `now` is the demo world's now. */
export function bountyDraftTask(p: Who & { input: string; now: IsoTimestamp; app?: Parameters<typeof toFloApp>[0]; plan?: Plan; budgetCents?: number; firstBounty?: boolean }): FloTaskOf<"bounty_draft"> {
  return {
    kind: "bounty_draft",
    surface: "builder",
    ...(p.app ? { context: { kind: "app", id: p.app.id }, app: toFloApp(p.app) } : {}),
    input: cut(p.input, 400),
    now: p.now,
    ...(p.plan ? { plan: p.plan } : {}),
    ...(p.budgetCents ? { budget_cents: p.budgetCents } : {}),
    ...(p.firstBounty ? { first_bounty: true } : {}),
    ...who(p),
  };
}

/** "What should I do today?" from the signals the page has. */
export function nextActionTask(p: Who & { role: "creator" | "brand_member"; signals: NextActionSignals }): FloTaskOf<"next_action"> {
  return { kind: "next_action", surface: "home", role: p.role, signals: p.signals, ...who(p) };
}

/** Narrow helper: is this a task of the given kind? */
export const isTaskKind = <K extends FloTask["kind"]>(task: FloTask, kind: K): task is FloTaskOf<K> => task.kind === kind;
