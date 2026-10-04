/**
 * Brief TL;DR: five short lines a creator can read in ten seconds before they decide to make a take. What to make, what must be on
 * screen, what it pays (an estimate at the median, never a promise), what rights the brand gets, and how fast they will hear back.
 */

import { formatCpm, formatMoney } from "@/lib/engine/money";
import { joinList } from "@/lib/engine/text";
import type { FloBounty, FloTaskOf } from "../schemas";
import { FLO_LABEL } from "../types";
import { act, lowerFirst, sentence, type MockAnswer } from "./common";

const BEAT_NAMES: Readonly<Record<string, string>> = {
  hook: "a hook in the first 2 seconds",
  problem: "the problem in one line",
  app_reveal: "the app on screen",
  demo: "a real demo",
  key_feature: "the key feature",
  payoff: "the result",
  proof: "one number or a before and after",
  offer: "the offer (said once)",
  cta: "one call to action",
  win_state: "a win state at the end",
  reaction: "an honest reaction",
  end_card: "the end card",
};

function payLine(b: FloBounty): string {
  const cap = formatMoney(b.per_video_cap_cents, { cents: "auto" });
  const rates = [
    b.cpa_install_cents > 0 ? `${formatMoney(b.cpa_install_cents)} per install` : "",
    b.cpa_trial_cents > 0 ? `${formatMoney(b.cpa_trial_cents)} per trial started` : "",
    b.cpa_paid_cents > 0 ? `${formatMoney(b.cpa_paid_cents)} per paid subscription` : "",
  ].filter(Boolean);
  const median = b.median_pay_cents && b.median_pay_cents > 0 ? ` At the median creator's views that is about ${formatMoney(b.median_pay_cents, { cents: "auto" })} a video (an estimate).` : "";
  const band = b.p25_pay_cents !== undefined && b.p75_pay_cents !== undefined && b.median_pay_cents ? ` Typical range ${formatMoney(b.p25_pay_cents, { cents: "auto" })} to ${formatMoney(b.p75_pay_cents, { cents: "auto" })}.` : "";

  if (b.type === "direct" || (b.flat_fee_cents > 0 && b.cpm_cents === 0 && rates.length === 0)) {
    return `${formatMoney(b.flat_fee_cents)} flat per video. Paid when it is approved.`;
  }
  if (b.type === "cpa" || b.type === "install_only" || b.cpm_cents === 0) {
    return `No view pay. ${joinList(rates).replace(/^./, (c) => c.toUpperCase())}, on tracked link and code conversions only. Capped at ${cap} per video.${median}${band}`;
  }
  const extra = rates.length > 0 ? `, plus ${joinList(rates)}` : "";
  const flat = b.flat_fee_cents > 0 ? ` A flat ${formatMoney(b.flat_fee_cents, { cents: "auto" })} is paid on top.` : "";
  return `${formatCpm(b.cpm_cents)} verified views in the first 72 hours${extra}. Capped at ${cap} per video.${flat}${median}${band}`;
}

function rightsLine(b: FloBounty): string {
  const paid = b.paid_ads_days > 0 ? `The brand may also run it as a paid ad for ${b.paid_ads_days} days.` : "There is no paid-ad use.";
  return `Rights: you post it on your own account, always. ${paid} AI likeness is ${b.ai_likeness ? "requested, so read the Rights Card before you accept" : "off"}.`;
}

export function answerBriefTldr(task: FloTaskOf<"brief_tldr">): MockAnswer {
  const { bounty } = task;
  const { brief, app } = bounty;

  const required = brief.beats.filter((b) => b.required).map((b) => BEAT_NAMES[b.beat] ?? b.label.toLowerCase());
  const mustSay = brief.talking_points.slice(0, 2).map((p) => sentence(p));
  const mustLine = `Must say and show: ${required.length > 0 ? `${sentence(joinList(required).replace(/^./, (c) => c.toUpperCase()))} ` : ""}${mustSay.join(" ")}`.trim();

  const dont = brief.donts.slice(0, 2);
  const outputs = [
    `What to make: ${sentence(brief.summary)}`,
    mustLine,
    `Pay: ${payLine(bounty)}`,
    rightsLine(bounty),
    `Disclosure and timing: ${sentence(brief.disclosure_text)} flowd decides within ${bounty.review_sla_hours} hours, with a reason code if it is a no.`,
  ];
  const notes = dont.length > 0 ? [`Avoid: ${dont.map((d) => lowerFirst(d.replace(/[.!]+$/, ""))).join("; ")}.`] : [];

  return {
    surface: task.surface ?? "bounty_detail",
    title: `TL;DR: ${bounty.title}`,
    outputs,
    notes: [...notes, `Pay is an estimate at the median creator's views for ${app.name}'s category. Approval is not guaranteed.`],
    actions: [act("Make it", "open_studio", bounty.id), act("Save for later", "save_bounty", bounty.id)],
    label: FLO_LABEL,
  };
}
