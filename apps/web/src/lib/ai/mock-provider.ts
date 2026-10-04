/**
 * The deterministic Flo engine: no network, no randomness except a seeded RNG, no clock. It is what the demo runs on and what every
 * other provider falls back to.
 *
 * With saved suggestions (the demo world's `flo_suggestions` fixture) it replays the one that matches a request, so history and a re-run
 * agree. Past those, or on "regenerate", it writes a new answer from the brief, the format and the engine's hook library and scoring.
 * A bounty draft is always generated (never replayed): its numbers must be the engine's, not a stored string.
 */

import type { FloSuggestion } from "@/lib/contract/types";
import { hashString } from "@/lib/engine/rng";
import type { FloTask } from "./schemas";
import { floKindFor, fromFloSuggestion } from "./result";
import { generateMockAnswer, MOCK_MODEL } from "./mock";
import { streamResult } from "./typewriter";
import { FLO_LABEL, type AIProvider, type FloCallOptions, type FloResult, type FloStreamEvent } from "./types";

export interface MockFloOptions {
  /** Saved suggestions to replay (`flo_suggestions`). */
  suggestions?: readonly FloSuggestion[];
}

/** Typical thinking time per kind, in ms, for the answer's reported latency and the pause before the first character. */
const BASE_LATENCY: Readonly<Record<FloTask["kind"], number>> = {
  script: 2100,
  hook_rewrite: 1300,
  brief_tldr: 1500,
  caption: 1400,
  comment_reply: 1200,
  score_fix: 1800,
  rate_advice: 2200,
  next_action: 1800,
  bounty_draft: 1700,
};

function latencyFor(task: FloTask, attempt: number, outputs: readonly string[]): number {
  const seed = hashString(`${task.kind}|${task.context?.id ?? ""}|${attempt}|${outputs.join("").length}`);
  return BASE_LATENCY[task.kind] + (seed % 600);
}

/** A saved suggestion that answers this request, or undefined. Matching is by kind and context, scoped to the same person when both are known. */
export function findSuggestion(suggestions: readonly FloSuggestion[], task: FloTask, index = 0): FloSuggestion | undefined {
  if (task.kind === "bounty_draft") return undefined;
  const kind = floKindFor(task.kind);
  const contextId = task.context?.id ?? ("bounty" in task ? task.bounty.id : undefined);
  if (!contextId) return undefined;
  const matches = suggestions
    .filter((s) => s.kind === kind && s.context_id === contextId)
    .filter((s) => !(task.creator_id && s.creator_id && s.creator_id !== task.creator_id))
    .filter((s) => !(task.brand_id && s.brand_id && s.brand_id !== task.brand_id))
    .filter((s) => (task.kind === "hook_rewrite" ? s.prompt.toLowerCase().includes(task.hook.trim().toLowerCase()) : true))
    .filter((s) => (task.kind === "comment_reply" ? s.prompt.toLowerCase().includes(task.comment.trim().toLowerCase()) : true))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  return matches[index];
}

export class MockFloProvider implements AIProvider {
  readonly id = "mock" as const;
  readonly model = MOCK_MODEL;
  private readonly suggestions: readonly FloSuggestion[];

  constructor(options: MockFloOptions = {}) {
    this.suggestions = options.suggestions ?? [];
  }

  async generate(task: FloTask, options: FloCallOptions = {}): Promise<FloResult> {
    return this.answer(task, options);
  }

  async *stream(task: FloTask, options: FloCallOptions = {}): AsyncGenerator<FloStreamEvent, void, void> {
    const result = this.answer(task, options);
    const first = options.typewriter?.firstTokenDelayMs ?? Math.min(700, Math.max(250, Math.round(result.latency_ms * 0.25)));
    yield* streamResult(result, { ...options.typewriter, firstTokenDelayMs: first, signal: options.signal ?? options.typewriter?.signal });
  }

  /** Synchronous core: the mock never waits on anything. */
  private answer(task: FloTask, options: FloCallOptions): FloResult {
    const attempt = options.attempt ?? task.attempt ?? 0;
    const useFixtures = options.useFixtures ?? this.suggestions.length > 0;

    if (useFixtures) {
      // Attempt k replays the k-th saved answer for this request; once they run out, Flo writes new ones (attempt k - saved).
      const saved = findSuggestion(this.suggestions, task, attempt);
      if (saved) {
        return { ...fromFloSuggestion(saved, FLO_LABEL, task.kind), kind: floKindFor(task.kind), notes: [] };
      }
    }

    const answer = generateMockAnswer(task, attempt);
    return {
      kind: floKindFor(task.kind),
      task_kind: task.kind,
      surface: answer.surface,
      title: answer.title,
      outputs: answer.outputs,
      notes: answer.notes,
      actions: answer.actions,
      model: MOCK_MODEL,
      latency_ms: latencyFor(task, attempt, answer.outputs),
      label: answer.label,
      source: "mock",
      ...(answer.draft ? { draft: answer.draft } : {}),
    };
  }
}
