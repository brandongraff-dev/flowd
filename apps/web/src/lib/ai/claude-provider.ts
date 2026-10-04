/**
 * The Claude provider: Flo on the real model. OPTIONAL. The demo runs on `MockFloProvider`; this turns on when the server has an
 * `ANTHROPIC_API_KEY` (see `lib/ai/server.ts`), and any failure falls back to the mock.
 *
 *  - Model: `claude-sonnet-5-5` (override with `FLO_MODEL`).
 *  - Structured outputs: `output_config.format = { type: "json_schema" }`, so the reply is JSON that is parsed, validated with zod and
 *    checked against the house rules before anyone sees it. The model writes words; the engine owns numbers.
 *  - Sonnet 5.5 rules: thinking is left to the model (omitted), no sampling parameters, no forced tool choice, no prefill, effort set
 *    explicitly. A policy refusal is handled (`stop_reason: "refusal"`) and the server-side refusal fallback is on by default
 *    (`fallbacks: "default"`, Claude API only).
 *  - It uses the official `@anthropic-ai/sdk` through an injected client. The package is NOT a dependency of this repo yet (no install
 *    was done); `loadAnthropicClient` imports it on demand and says exactly what to run when it is missing. Browser code never imports this file.
 */

import { bannedPhraseIn } from "./mock/common";
import { buildBountyDraft, draftOutputs, lintDraft } from "./mock/bounty-draft";
import { FLO_DRAFT_LABEL, FLO_LABEL, FLO_ESTIMATE_LABEL, FloError, type AIProvider, type BountyDraft, type FloCallOptions, type FloResult, type FloStreamEvent } from "./types";
import { callsToAction } from "@/lib/engine/text";
import { DEFAULT_FLO_MODEL } from "@/lib/env";
import { buildClaudeRequest, DraftCreativeSchema, ModelOutputSchema, type DraftCreative } from "./claude-prompts";
import { act } from "./mock/common";
import { floKindFor } from "./result";
import type { FloTask } from "./schemas";
import { streamResult } from "./typewriter";

// ── the slice of the SDK the provider uses ─────────────────────────────────────────────────────

export interface AnthropicMessageLike {
  content: readonly { type: string; text?: string }[];
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
  model?: string;
}

export interface AnthropicMessagesApi {
  create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<AnthropicMessageLike>;
}

/** An `Anthropic` client from the official SDK satisfies this (as does a test double). */
export interface AnthropicLike {
  messages: AnthropicMessagesApi;
  beta?: { messages: AnthropicMessagesApi };
}

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface ClaudeProviderOptions {
  client: AnthropicLike;
  /** Default `claude-sonnet-5-5`. */
  model?: string;
  /** Default 4000: every Flo answer is short, so it never needs a streaming request. */
  maxTokens?: number;
  /** Thinking depth. Flo drafts short copy, so the default is "low". */
  effort?: "low" | "medium" | "high";
  /** Retry a policy decline on the model Anthropic names (server-side `fallbacks: "default"`). Default true. */
  refusalFallback?: boolean;
  /** Clock for the reported latency. */
  now?: () => number;
}

/** What the SDK needs to be asked for, built without the SDK so it can be unit tested. */
export function buildMessagesParams(task: FloTask, options: Required<Pick<ClaudeProviderOptions, "model" | "maxTokens" | "effort">>, extraContext?: Record<string, unknown>): Record<string, unknown> {
  const parts = buildClaudeRequest(task, extraContext);
  return {
    model: options.model,
    max_tokens: options.maxTokens,
    system: parts.system,
    messages: [{ role: "user", content: parts.user }],
    // No `temperature`, `top_p` or `thinking: disabled`: Claude Sonnet 5.5 rejects them. Effort is the one dial.
    output_config: { effort: options.effort, format: { type: "json_schema", schema: parts.schema } },
  };
}

const textOf = (message: AnthropicMessageLike): string =>
  message.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text ?? "")
    .join("")
    .trim();

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new FloError("invalid_output", "Claude did not return valid JSON.", { cause });
  }
}

/** The house rules every model answer must pass before it reaches a person. Throws `FloError("guard")`. */
export function assertHouseRules(task: FloTask, outputs: readonly string[]): void {
  const banned = "bounty" in task ? task.bounty.brief.banned_claims : [];
  for (const text of outputs) {
    const hit = bannedPhraseIn(text, banned);
    if (hit) throw new FloError("guard", `The answer used a banned phrase ("${hit}").`);
  }
  if (task.kind === "caption" || task.kind === "script") {
    if (outputs.some((o) => !/#ad\b/i.test(o))) throw new FloError("guard", "An option was missing the #ad disclosure.");
  }
  if (task.kind === "caption" && outputs.some((o) => callsToAction(o).length > 1)) throw new FloError("guard", "A caption asked for more than one thing.");
}

const LABEL_FOR: Readonly<Record<FloTask["kind"], string>> = {
  script: FLO_LABEL,
  hook_rewrite: FLO_LABEL,
  brief_tldr: FLO_LABEL,
  caption: FLO_LABEL,
  comment_reply: FLO_LABEL,
  score_fix: FLO_LABEL,
  rate_advice: FLO_ESTIMATE_LABEL,
  next_action: FLO_LABEL,
  bounty_draft: FLO_DRAFT_LABEL,
};

export class ClaudeProvider implements AIProvider {
  readonly id = "claude" as const;
  readonly model: string;
  private readonly client: AnthropicLike;
  private readonly maxTokens: number;
  private readonly effort: "low" | "medium" | "high";
  private readonly refusalFallback: boolean;
  private readonly now: () => number;

  constructor(options: ClaudeProviderOptions) {
    this.client = options.client;
    this.model = options.model ?? DEFAULT_FLO_MODEL;
    this.maxTokens = options.maxTokens ?? 4000;
    this.effort = options.effort ?? "low";
    this.refusalFallback = options.refusalFallback ?? true;
    this.now = options.now ?? (() => Date.now());
  }

  /** One call to the Messages API. Throws a `FloError` for anything the caller should fall back from. */
  private async call(task: FloTask, extraContext: Record<string, unknown> | undefined, signal?: AbortSignal): Promise<unknown> {
    const params = buildMessagesParams(task, { model: this.model, maxTokens: this.maxTokens, effort: this.effort }, extraContext);
    const betaApi = this.refusalFallback ? this.client.beta?.messages : undefined;
    let message: AnthropicMessageLike;
    try {
      message = betaApi
        ? await betaApi.create({ ...params, betas: [FALLBACK_BETA], fallbacks: "default" }, { signal })
        : await this.client.messages.create(params, { signal });
    } catch (cause) {
      if (signal?.aborted) throw new FloError("aborted", "The request was cancelled.", { cause });
      throw new FloError("unavailable", "Claude could not be reached.", { cause });
    }
    if (message.stop_reason === "refusal") throw new FloError("refused", `Claude declined this request${message.stop_details?.category ? ` (${message.stop_details.category})` : ""}.`);
    if (message.stop_reason === "max_tokens") throw new FloError("invalid_output", "The answer was cut off.");
    return parseJson(textOf(message));
  }

  async generate(task: FloTask, options: FloCallOptions = {}): Promise<FloResult> {
    const started = this.now();
    const signal = options.signal ?? options.typewriter?.signal;

    if (task.kind === "bounty_draft") {
      const baseline = buildBountyDraft(task, options.attempt ?? task.attempt ?? 0);
      const raw = await this.call(task, { engine: { category: baseline.category, app: baseline.app, banned_claims: baseline.brief.banned_claims, beats: baseline.brief.beats, hashtags: baseline.brief.hashtags } }, signal);
      const parsed = DraftCreativeSchema.safeParse(raw);
      if (!parsed.success) throw new FloError("invalid_output", "The draft did not match the schema.", { cause: parsed.error });
      const draft = mergeCreative(baseline, parsed.data, task);
      return {
        kind: "bounty_draft",
        task_kind: "bounty_draft",
        surface: task.surface ?? "builder",
        title: `Draft bounty for ${draft.app.name}`,
        outputs: draftOutputs(draft),
        notes: [...parsed.data.rationale.slice(0, 3), ...draft.rationale],
        actions: [act("Apply the draft", "apply_draft", task.app?.id ?? draft.app.slug), act("Open the builder", "open_builder")],
        model: this.model,
        latency_ms: this.now() - started,
        label: FLO_DRAFT_LABEL,
        source: "claude",
        draft,
      };
    }

    const raw = await this.call(task, undefined, signal);
    const parsed = ModelOutputSchema.safeParse(raw);
    if (!parsed.success) throw new FloError("invalid_output", "The answer did not match the schema.", { cause: parsed.error });
    assertHouseRules(task, parsed.data.outputs);
    return {
      kind: floKindFor(task.kind),
      task_kind: task.kind,
      surface: task.surface ?? "studio",
      title: parsed.data.title,
      outputs: parsed.data.outputs,
      notes: parsed.data.notes,
      actions: actionsFor(task),
      model: this.model,
      latency_ms: this.now() - started,
      label: LABEL_FOR[task.kind],
      source: "claude",
    };
  }

  /**
   * Claude answers a Flo task in one short request, so this waits for the whole reply and then types it out (the same typewriter the
   * mock uses). The first character appears after the model has finished, which is the honest cost of a validated, guarded answer.
   */
  async *stream(task: FloTask, options: FloCallOptions = {}): AsyncGenerator<FloStreamEvent, void, void> {
    const result = await this.generate(task, options);
    yield* streamResult(result, { ...options.typewriter, firstTokenDelayMs: options.typewriter?.firstTokenDelayMs ?? 0, signal: options.signal ?? options.typewriter?.signal });
  }
}

/** The one-tap actions an answer offers: the same set the mock uses, decided by the task, never by the model. */
export function actionsFor(task: FloTask): FloResult["actions"] {
  const ctx = task.context?.id ?? ("bounty" in task ? task.bounty.id : undefined);
  switch (task.kind) {
    case "script":
      return [act("Send to Studio", "open_studio", ctx), act("Copy option 1", "copy", "0")];
    case "hook_rewrite":
      return [act("Apply to my script", "apply_fix", ctx), act("Copy the best", "copy", "0")];
    case "brief_tldr":
      return [act("Make it", "open_studio", ctx), act("Save for later", "save_bounty", ctx)];
    case "caption":
      return [act("Use caption 1", "apply_fix", "0"), act("Copy caption 1", "copy", "0")];
    case "comment_reply":
      return [act("Copy reply 1", "copy", "0"), act("Answer with a video", "open_studio", "tmpl_reply_comment")];
    case "score_fix":
      return task.audience === "creator" ? [act("Apply the first fix", "apply_fix", task.submission_id)] : [act("Request changes with these notes", "draft_feedback", task.submission_id)];
    case "rate_advice":
      return [act("Set my rate card", "set_rate", String(task.suggested_cents))];
    case "next_action":
      return [act(task.role === "creator" ? "Open Studio" : "Open the review queue", task.role === "creator" ? "open_studio" : "open_review")];
    case "bounty_draft":
      return [act("Apply the draft", "apply_draft", task.app?.id), act("Open the builder", "open_builder")];
  }
}

/**
 * Puts Claude's words into the engine's draft. The model may change the title, the summary, the talking points, the do's and don'ts, the
 * call to action, the offer line and the tone. It may not change a number, the beats, the disclosure, the hashtags or the banned claims.
 * The result is linted again; a draft that would be worse than the engine's own (a new blocker) is rejected.
 */
export function mergeCreative(base: BountyDraft, creative: DraftCreative, task: FloTask & { kind: "bounty_draft" }): BountyDraft {
  const words = [creative.title, creative.summary, ...creative.talking_points, ...creative.dos, ...creative.donts, creative.cta, creative.offer_line, ...creative.rationale];
  for (const text of words) {
    const hit = bannedPhraseIn(text, base.brief.banned_claims);
    if (hit) throw new FloError("guard", `The draft used a banned phrase ("${hit}").`);
  }
  if (callsToAction(creative.cta).length > 1) throw new FloError("guard", "The draft asked for more than one thing.");

  const merged: BountyDraft = {
    ...base,
    title: creative.title,
    brief: {
      ...base.brief,
      summary: creative.summary,
      talking_points: creative.talking_points,
      dos: creative.dos.length > 0 ? creative.dos : base.brief.dos,
      donts: creative.donts.length > 0 ? creative.donts : base.brief.donts,
      cta: creative.cta,
      ...(creative.offer_line ? { offer_line: creative.offer_line } : {}),
      tone: creative.tone || base.brief.tone,
    },
  };
  const plan = task.plan ?? "free";
  const relinted = lintDraft(merged, plan, task.first_bounty === true, task.now);
  if (relinted.blockers > base.lint.blockers) throw new FloError("guard", "The draft would add a Brief Lint blocker.");
  return { ...merged, lint: { can_publish: relinted.can_publish, blockers: relinted.blockers, warnings: relinted.warnings, infos: relinted.infos, findings: relinted.findings }, pay_math: relinted.pay_math ?? base.pay_math };
}

// ── loading the SDK ────────────────────────────────────────────────────────────────────────────

export interface LoadClientOptions {
  apiKey: string;
  /** Request timeout in ms (the SDK's unit is milliseconds in TypeScript). Default 30,000. */
  timeoutMs?: number;
  /** Replaces the dynamic import (tests). */
  importer?: (specifier: string) => Promise<unknown>;
}

/**
 * Builds an `Anthropic` client from the official SDK, importing it on demand. The specifier is assembled at run time so bundlers do not
 * try to resolve a package this repo has not installed. If the SDK is missing, the error names the one command that fixes it, and
 * the server falls back to the mock.
 */
export async function loadAnthropicClient(options: LoadClientOptions): Promise<AnthropicLike> {
  const specifier = ["@anthropic-ai", "sdk"].join("/");
  let mod: unknown;
  try {
    mod = options.importer ? await options.importer(specifier) : await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ specifier);
  } catch (cause) {
    throw new FloError("unavailable", "The Claude provider needs the official SDK. Run `npm install @anthropic-ai/sdk` in apps/web.", { cause });
  }
  const candidate = (mod as { default?: unknown; Anthropic?: unknown } | null) ?? {};
  const Client = candidate.default ?? candidate.Anthropic;
  if (typeof Client !== "function") throw new FloError("unavailable", "The Anthropic SDK did not export a client class.");
  return new (Client as new (init: { apiKey: string; timeout: number; maxRetries: number }) => AnthropicLike)({ apiKey: options.apiKey, timeout: options.timeoutMs ?? 30_000, maxRetries: 2 });
}
