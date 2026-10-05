"use client";

import type { ActionResult } from "@/lib/store";
import { notify } from "@/components/ui/toast";
import { createExternalStore, useExternalStore } from "./external-store";

/**
 * Review decisions with a 10-second undo (Apple: forgiveness over confirmation; design-ux: "10-second undo toast, not confirm dialogs").
 *
 * The store has no "undo a decision" action, and an approval issues a link and a code, so the honest way to offer undo is to HOLD the
 * decision: the video leaves the list at once (a 120 ms collapse), a toast says "Final in 10 seconds" with Undo, and only when the time
 * is up does the real action run. Undo before then costs nothing and changes nothing. Closing the tab commits what is pending, so a
 * decision the reviewer made is never silently dropped.
 */

export const UNDO_WINDOW_MS = 10_000;

export type DecisionKind = "approve" | "request_changes" | "reject";

export interface DecisionRequest {
  kind: DecisionKind;
  submissionIds: readonly string[];
  /** Toast title while the undo window is open: "Approving @maya.k's video". */
  pendingTitle: string;
  /** Toast second line while the undo window is open. */
  pendingDescription?: string;
  /** Toast title once the action succeeded, given how many of the submissions it worked for. */
  doneTitle: (succeeded: number) => string;
  doneDescription?: string;
  /** Runs when the time is up: one result per submission. */
  commit: () => Promise<readonly ActionResult<unknown>[]>;
}

interface Held {
  id: number;
  request: DecisionRequest;
  timer: ReturnType<typeof setTimeout> | null;
  toastId: string | number;
  /** The action is running now: the videos stay hidden until the store has the new state. */
  committing: boolean;
}

const held = new Map<number, Held>();
let counter = 0;

const hiddenIds = createExternalStore<ReadonlySet<string>>(new Set());

function publish(): void {
  const next = new Set<string>();
  for (const entry of held.values()) for (const id of entry.request.submissionIds) next.add(id);
  hiddenIds.set(next);
}

let listening = false;
function listenForUnload(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("pagehide", () => {
    flushDecisions();
  });
}

async function run(entry: Held): Promise<void> {
  if (entry.committing) return;
  if (entry.timer !== null) clearTimeout(entry.timer);
  entry.timer = null;
  entry.committing = true;
  let results: readonly ActionResult<unknown>[] = [];
  try {
    results = await entry.request.commit();
  } catch {
    results = entry.request.submissionIds.map(() => ({ ok: false as const, error: { code: "internal_error", message: "That decision did not go through.", hint: "Nothing changed. Try again.", status: 500 } }));
  }
  held.delete(entry.id);
  publish();
  const succeeded = results.filter((r) => r.ok).length;
  for (const r of results) {
    if (!r.ok) notify.error(r.error.message, { description: r.error.hint });
  }
  if (succeeded > 0) notify.success(entry.request.doneTitle(succeeded), { id: entry.toastId, description: entry.request.doneDescription });
  else notify.dismiss(entry.toastId);
}

/** Holds a decision for 10 seconds, with a toast and an Undo button. The videos disappear from the list at once. */
export function queueDecision(request: DecisionRequest): void {
  listenForUnload();
  counter += 1;
  const id = counter;
  const toastId = notify.undo(request.pendingTitle, {
    description: request.pendingDescription,
    duration: UNDO_WINDOW_MS + 600,
    onUndo: () => undoDecision(id),
  });
  const entry: Held = { id, request, timer: null, toastId, committing: false };
  entry.timer = setTimeout(() => void run(entry), UNDO_WINDOW_MS);
  held.set(id, entry);
  publish();
}

/** Takes a held decision back. Returns false when it was already final. */
export function undoDecision(id: number): boolean {
  const entry = held.get(id);
  if (!entry || entry.committing) return false;
  if (entry.timer !== null) clearTimeout(entry.timer);
  held.delete(id);
  notify.dismiss(entry.toastId);
  publish();
  return true;
}

/** Undoes the most recent held decision (Z / Ctrl+Z). Returns whether there was one. */
export function undoLatestDecision(): boolean {
  let latest: Held | undefined;
  for (const entry of held.values()) if (!entry.committing && (!latest || entry.id > latest.id)) latest = entry;
  return latest ? undoDecision(latest.id) : false;
}

/** Makes every held decision final now (the tab is closing, or the reviewer leaves the review area for good). */
export function flushDecisions(): void {
  for (const entry of [...held.values()]) void run(entry);
}

/** Submission ids that are held or being committed: hide them from lists. */
export function useHeldSubmissionIds(): ReadonlySet<string> {
  return useExternalStore(hiddenIds);
}

/** True while at least one decision can still be undone. */
export function hasUndoableDecision(): boolean {
  for (const entry of held.values()) if (!entry.committing) return true;
  return false;
}
