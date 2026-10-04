/**
 * Rate advice: what to charge, from the market-suggested price the engine already computed. Flo explains the number (basis, middle band),
 * suggests a bundle price for several videos, and reminds the creator to price paid usage up front. Estimates, never promises.
 */

import { formatMoney, mulRate } from "@/lib/engine/money";
import { formatPercent } from "@/lib/engine/money";
import type { FloTaskOf } from "../schemas";
import { FLO_ESTIMATE_LABEL } from "../types";
import { act, type MockAnswer } from "./common";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"] as const;
const word = (n: number): string => WORDS[n] ?? String(n);

export function answerRateAdvice(task: FloTaskOf<"rate_advice">): MockAnswer {
  const n = task.videos;
  const per = task.suggested_cents;
  const total = per * n;
  const usage = task.paid_usage_days > 0 ? `${task.paid_usage_days} days of paid usage` : "organic use only";
  const videos = n === 1 ? "one video" : `${word(n)} videos`;

  const outputs: string[] = [
    `The market-suggested price for one video with ${usage} is about ${formatMoney(per)} (middle band ${formatMoney(task.p25_cents)} to ${formatMoney(task.p75_cents)}). Basis: ${task.basis.replace(/\.$/, "")}.`,
  ];

  if (n > 1) {
    // A bundle discount of about 10%, rounded to the nearest $5 so it reads like a price a person would quote.
    const bundle = Math.max(per, Math.round((total * 0.9) / 500) * 500);
    outputs.push(`For ${videos}, ${formatMoney(total)} is the median ask; ${formatMoney(bundle)} is a fair bundle price that rewards the brand for booking all ${word(n)}.`);
  } else {
    outputs.push(`Do not go below ${formatMoney(task.p25_cents)} for one video: that is the low end of what comparable creators ask.`);
  }

  outputs.push(
    task.paid_usage_days > 0
      ? `Price paid usage up front: renewal at ${formatPercent(task.renewal_pct, 0)} of the base fee per extra 30 days is ${formatMoney(mulRate(per, task.renewal_pct))} on one video.`
      : "Organic only is the lowest price. If a brand asks to run your video as an ad, quote that separately: it is worth more than organic alone.",
  );

  return {
    surface: task.surface ?? "rate_card",
    title: `What to charge for ${videos}${task.paid_usage_days > 0 ? " with paid usage" : ""}`,
    outputs,
    notes: [`Pricing at the top of the band can still win when your approval rate and reliability are strong. Pricing under ${formatMoney(task.p25_cents)} usually leaves money on the table.`],
    actions: [act("Set my rate card", "set_rate", String(per))],
    label: FLO_ESTIMATE_LABEL,
  };
}
