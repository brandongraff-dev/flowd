"use client";

import type { QaCheck, QaCheckType, QaResult, VideoAnalysis } from "@/lib/contract/types";
import { defineSelector, useSelect, type Db } from "@/lib/data";

/** One automated QA finding a reviewer should look at: a failure or a warning, with the moment it happens. */
export interface QaFlag {
  check: QaCheckType;
  result: Exclude<QaResult, "pass">;
  message: string;
  /** Where in the video, when the check points at a moment. */
  t_ms?: number;
  blocks_settlement: boolean;
}

/** Failures first (a hard stop beats a nudge), then warnings, each group in video order. */
export function flagsFromChecks(checks: readonly QaCheck[]): QaFlag[] {
  const flags: QaFlag[] = [];
  for (const c of checks) {
    if (c.result === "pass") continue;
    flags.push({ check: c.check, result: c.result, message: c.message, blocks_settlement: c.blocks_settlement, ...(c.evidence?.t_ms !== undefined ? { t_ms: c.evidence.t_ms } : {}) });
  }
  return flags.sort((a, b) => Number(b.result === "fail") - Number(a.result === "fail") || (a.t_ms ?? Number.MAX_SAFE_INTEGER) - (b.t_ms ?? Number.MAX_SAFE_INTEGER));
}

/** What a queue row says about a video beyond its counts: the worst finding, the spoken hook, the beats. */
export interface QueueInsight {
  flags: readonly QaFlag[];
  hook_text: string;
  hook_lands_ms: number;
  beats: { found: number; required: number };
  duplicate_of?: string;
}

function insightOf(a: VideoAnalysis): QueueInsight {
  const required = a.beats.filter((b) => b.required);
  return {
    flags: flagsFromChecks(a.checks),
    hook_text: a.hook.text,
    hook_lands_ms: a.hook.lands_at_ms,
    beats: { found: required.filter((b) => b.found).length, required: required.length },
    ...(a.duplicate_of_submission_id ? { duplicate_of: a.duplicate_of_submission_id } : {}),
  };
}

type InsightDb = Db<"video_analyses" | "submissions" | "session" | "loaded">;

const EMPTY: Readonly<Record<string, QueueInsight>> = Object.freeze({});

/** The QA flags and hook line of every video waiting in this brand's queue. Loads the heavy analysis table on first use. */
export const selectQueueInsights = defineSelector(
  ["video_analyses", "submissions", "session", "loaded"] as const,
  (db: InsightDb): Readonly<Record<string, QueueInsight>> => {
    const brandId = db.session.brand_id;
    if (!brandId || db.loaded.video_analyses !== true) return EMPTY;
    const out: Record<string, QueueInsight> = {};
    const analyses = new Map<string, VideoAnalysis>();
    for (const a of Object.values(db.video_analyses)) analyses.set(`${a.submission_id}|${a.version}`, a);
    for (const s of Object.values(db.submissions)) {
      if (s.brand_id !== brandId || s.status !== "in_review") continue;
      const a = analyses.get(`${s.id}|${s.version}`);
      if (a) out[s.id] = insightOf(a);
    }
    return out;
  },
  { ensure: ["video_analyses"] },
);

/** `useQueueInsights()`: per-submission flags for the queue, `{}` until the analysis table has loaded. */
export function useQueueInsights(): Readonly<Record<string, QueueInsight>> {
  return useSelect(selectQueueInsights);
}
