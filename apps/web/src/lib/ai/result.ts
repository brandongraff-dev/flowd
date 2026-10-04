/**
 * Helpers around a Flo answer: which contract kind it is stored under, the prompt to show in history, the contract `FloSuggestion` it
 * becomes, and a plain-text rendering for copy buttons and chat bubbles.
 */

import type { FloKind, FloSuggestion, IsoTimestamp } from "@/lib/contract/types";
import type { FloTask, FloTaskKind } from "./schemas";
import type { FloResult } from "./types";

const KIND: Readonly<Record<FloTaskKind, FloKind>> = {
  script: "script",
  hook_rewrite: "hook_rewrite",
  brief_tldr: "brief_tldr",
  caption: "caption",
  // The contract has no reply kind: a reply is caption copy, stored with context_kind "comment".
  comment_reply: "caption",
  score_fix: "score_fix",
  rate_advice: "rate_advice",
  next_action: "next_action",
  bounty_draft: "bounty_draft",
};

/** The contract `FloKind` a task's answer is stored under. */
export const floKindFor = (kind: FloTaskKind): FloKind => KIND[kind];

const numberWord = (n: number): string => (["zero", "one", "two", "three"][n] ?? String(n));

/**
 * The line that describes what was asked, in the voice the saved suggestions use ("Write 3 scripts for ...", "How do I fix my Hook
 * Score?"). Shown in history; `task.prompt` wins when the person typed their own.
 */
export function promptFor(task: FloTask): string {
  if (task.prompt) return task.prompt;
  switch (task.kind) {
    case "script": {
      const n = task.options ?? 3;
      return task.format ? `Write ${n} scripts for the ${task.format.name.toLowerCase()} format for ${task.bounty.app.name}.` : `Give me a script for ${task.bounty.title}.`;
    }
    case "hook_rewrite":
      return task.target_type ? `Make this opening a ${task.target_type.replace(/_/g, " ")}: "${task.hook}"` : `Rewrite this hook so it lands in 2 seconds: "${task.hook}"`;
    case "brief_tldr":
      return "TL;DR this brief in three bullets.";
    case "caption":
      return "Caption ideas with #ad for this video.";
    case "comment_reply":
      return `Reply to this comment: "${task.comment}"`;
    case "score_fix":
      return task.audience === "creator" ? `How do I fix my ${task.subject === "hook" ? "Hook" : "Flow"} Score?` : `Why is this a ${task.band} and not an A?`;
    case "rate_advice":
      return `What should I charge for ${numberWord(task.videos)} video${task.videos === 1 ? "" : "s"}${task.paid_usage_days > 0 ? " with paid usage" : ""}?`;
    case "next_action":
      return "What should I do today?";
    case "bounty_draft":
      return `Draft a bounty from this App Store link: ${task.input}`;
  }
}

export interface SuggestionMeta {
  /** "flo_0063". */
  id: string;
  created_at: IsoTimestamp;
  creator_id?: string;
  brand_id?: string;
  /** Overrides the task's own context. */
  context?: { kind: string; id: string };
  helpful?: boolean;
}

/**
 * Maps an answer onto the contract's `FloSuggestion`, so the store keeps Flo history in the same shape the fixtures use.
 * A comment reply is stored as a `caption` with `context_kind: "comment"`.
 */
export function toFloSuggestion(task: FloTask, result: FloResult, meta: SuggestionMeta): FloSuggestion {
  const context = meta.context ?? (task.kind === "comment_reply" ? { kind: "comment", id: task.context?.id ?? "comment" } : task.context);
  return {
    id: meta.id,
    surface: result.surface,
    kind: result.kind,
    ...((meta.creator_id ?? task.creator_id) ? { creator_id: meta.creator_id ?? task.creator_id } : {}),
    ...((meta.brand_id ?? task.brand_id) ? { brand_id: meta.brand_id ?? task.brand_id } : {}),
    ...(context ? { context_kind: context.kind, context_id: context.id } : {}),
    prompt: promptFor(task),
    title: result.title,
    outputs: [...result.outputs],
    actions: result.actions.map((a) => ({ ...a })),
    model: result.model,
    latency_ms: result.latency_ms,
    ...(meta.helpful === undefined ? {} : { helpful: meta.helpful }),
    created_at: meta.created_at,
  };
}

/** A saved suggestion as a result, for replaying history through the same UI as a new answer. */
export function fromFloSuggestion(s: FloSuggestion, label: string, taskKind?: FloTaskKind): FloResult {
  return {
    kind: s.kind,
    task_kind: taskKind ?? (s.kind as FloTaskKind),
    surface: s.surface,
    title: s.title,
    outputs: [...s.outputs],
    notes: [],
    actions: s.actions.map((a) => ({ ...a })),
    model: s.model,
    latency_ms: s.latency_ms,
    label,
    source: "fixture",
    fixture_id: s.id,
  };
}

/** The whole answer as plain text: the title, then each option separated by a blank line. For a clipboard and a transcript. */
export function resultToText(result: Pick<FloResult, "title" | "outputs">, options: { title?: boolean } = {}): string {
  const body = result.outputs.join("\n\n");
  return options.title === false ? body : `${result.title}\n\n${body}`;
}
