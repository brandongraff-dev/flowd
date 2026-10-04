/**
 * Score fixes: turns a Hook Score or Flow Score checklist into the three fixes worth the most points, in the words of the checklist
 * itself (each item's reason and one-tap fix come from the engine). The same answer serves the creator ("fix my Hook Score") and the
 * brand reviewer ("why is this a B and not an A?"), with a different title and a different next step.
 */

import { CHECKLIST_LABEL } from "@/lib/engine/constants";
import { bandDescriptor, pointsToNextBand } from "@/lib/engine/scoring";
import type { FloTaskOf } from "../schemas";
import { act, type MockAnswer } from "./common";

const COUNT_WORD = ["Nothing to fix", "One fix", "Two fixes", "Three fixes"] as const;

export function answerScoreFix(task: FloTaskOf<"score_fix">): MockAnswer {
  const subject = task.subject === "hook" ? "Hook" : "Flow";
  const points = Math.round(task.points);
  const failing = task.items
    .filter((i) => !i.passed && i.max - i.points > 0)
    .sort((a, b) => b.max - b.points - (a.max - a.points) || a.label.localeCompare(b.label))
    .slice(0, 3);

  const outputs = failing.map((i) => (i.fix ? `${i.reason} Fix: ${i.fix}` : `${i.reason} Work on "${i.label}".`));
  const gain = failing.reduce((n, i) => n + (i.max - i.points), 0);
  const next = pointsToNextBand(points);

  const creator = task.audience === "creator";
  const title = creator ? `Your ${subject} Score is ${points}. ${COUNT_WORD[failing.length] ?? "Three fixes"}` : failing.length === 0 ? `This video scores ${task.band}. Nothing to request` : `Why this video scores ${task.band}`;
  if (outputs.length === 0) outputs.push(creator ? "Everything on the checklist passes. Post it once the brief check is green." : "Every checklist item passes. There is nothing to ask the creator to change.");

  const notes = [
    `${subject} Score ${points} is a ${task.band} (${bandDescriptor(task.band).toLowerCase()}). ${CHECKLIST_LABEL}`,
    ...(failing.length > 0 && next.next ? [`The top ${failing.length === 1 ? "fix is" : `${failing.length} fixes are`} worth up to ${Math.round(gain)} points. ${next.needed} more points reach a ${next.next}.`] : []),
  ];

  const sub = task.submission_id;
  return {
    surface: task.surface ?? (creator ? "studio" : "review"),
    title,
    outputs,
    notes,
    actions:
      failing.length === 0
        ? []
        : creator
          ? [act("Apply the first fix", "apply_fix", sub)]
          : [act("Request changes with these notes", "draft_feedback", sub)],
    label: CHECKLIST_LABEL,
  };
}
