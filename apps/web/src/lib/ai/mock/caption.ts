/**
 * Caption ideas. Every caption opens with the brief's disclosure line (#ad plus the brand's wording, always), carries exactly one call
 * to action (the creator's code when they have one, otherwise "link in bio"), and stays inside the platform's comfortable length.
 */

import { shuffled } from "@/lib/engine/rng";
import type { FloTaskOf } from "../schemas";
import { FLO_LABEL } from "../types";
import { act, bannedPhraseIn, featureOf, rngFor, wordsFor, type MockAnswer } from "./common";

/** Characters before most feeds fold a caption behind "more". */
const FOLD: Readonly<Record<string, number>> = { tiktok: 150, instagram: 125, youtube: 100 };

type Style = (c: Ctx) => string;

interface Ctx {
  app: string;
  feature: string;
  goal: string;
  noun: string;
  minutes: number;
  trial: boolean;
}

const STYLES: readonly Style[] = [
  (c) => `There's a button in ${c.app} that most people never tap.`,
  (c) => `POV: you stopped ${c.goal} the hard way.`,
  (c) => `I didn't expect ${c.app} to make ${c.goal} this easy.`,
  (c) => (c.trial ? `If ${c.app} doesn't work for you, you've lost ${c.minutes} minutes. Try it free.` : `If ${c.app} isn't for you, you've lost ${c.minutes} minutes. Worth a look.`),
  (c) => `${c.feature.charAt(0).toUpperCase()}${c.feature.slice(1)} is the part of ${c.app} I use most.`,
  (c) => `${c.minutes} minutes with ${c.app} and ${c.goal} looked different.`,
];

export function answerCaption(task: FloTaskOf<"caption">, attempt: number): MockAnswer {
  const rng = rngFor(task, attempt);
  const { bounty } = task;
  const { app, brief } = bounty;
  const words = wordsFor(app);
  const count = task.count ?? 3;
  const code = task.creator_code?.trim();
  const platform = task.platform ?? "tiktok";

  const ctx: Ctx = { app: app.name, feature: featureOf(app, 1), goal: words.goal, noun: words.noun, minutes: 10 + Math.floor(rng() * 6) * 5, trial: Boolean(brief.offer_line) || app.has_free_trial === true };
  const cta = code ? `Use my code ${code}.` : ctx.trial ? "Try it free, link in my bio." : "Link in my bio.";
  const tags = [...brief.hashtags.filter((t) => t.toLowerCase() !== "#ad"), `#${app.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`]
    .filter((t, i, all) => t.length > 1 && all.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
    .slice(0, 3)
    .join(" ");

  const outputs: string[] = [];
  const notes: string[] = [];
  for (const style of shuffled(rng, STYLES)) {
    if (outputs.length >= count) break;
    const body = style(ctx);
    if (bannedPhraseIn(body, brief.banned_claims)) continue;
    const caption = `${brief.disclosure_text}\n${body} ${cta} ${tags}`.replace(/\s+\n/g, "\n").trim();
    outputs.push(caption);
    // The disclosure line is visible before the fold on every platform: check the hook of the caption fits too.
    const visible = `${brief.disclosure_text} ${body}`.length;
    if (visible > (FOLD[platform] ?? 150)) notes.push(`Caption ${outputs.length}: the first line runs past where ${platform === "tiktok" ? "TikTok" : platform === "instagram" ? "Instagram" : "YouTube"} folds a caption. Trim it if you want the call to action seen.`);
  }

  return {
    surface: task.surface ?? "studio",
    title: "Caption ideas with #ad",
    outputs,
    notes: [`The disclosure line is added to every caption. Studio keeps it locked when you post.`, ...notes],
    actions: outputs.length > 0 ? [act("Use caption 1", "apply_fix", "0"), act("Copy caption 1", "copy", "0")] : [],
    label: FLO_LABEL,
  };
}
