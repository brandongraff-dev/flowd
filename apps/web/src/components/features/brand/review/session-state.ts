"use client";

import type { FeedbackCategory, FeedbackSeverity, ReasonCode } from "@/lib/contract/types";
import { createExternalStore, useExternalStore } from "./external-store";

/** A note a reviewer wrote but has not sent yet. It becomes a `NoteInput` when they request changes. */
export interface DraftNote {
  id: string;
  t_ms: number;
  t_end_ms?: number;
  body: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  reason_code?: ReasonCode;
}

type Drafts = Readonly<Record<string, readonly DraftNote[]>>;

const EMPTY_NOTES: readonly DraftNote[] = Object.freeze([]);
const draftStore = createExternalStore<Drafts>({});
let draftCounter = 0;

/** Unsent notes for one video. They survive moving between videos in the queue, and are lost on reload (they are drafts). */
export function useDraftNotes(submissionId: string | undefined): readonly DraftNote[] {
  const all = useExternalStore(draftStore);
  return (submissionId ? all[submissionId] : undefined) ?? EMPTY_NOTES;
}

export function addDraftNote(submissionId: string, note: Omit<DraftNote, "id">): DraftNote {
  draftCounter += 1;
  const created: DraftNote = { ...note, id: `draft_${draftCounter}` };
  draftStore.update((all) => ({ ...all, [submissionId]: [...(all[submissionId] ?? []), created].sort((a, b) => a.t_ms - b.t_ms) }));
  return created;
}

export function removeDraftNote(submissionId: string, noteId: string): void {
  draftStore.update((all) => ({ ...all, [submissionId]: (all[submissionId] ?? EMPTY_NOTES).filter((n) => n.id !== noteId) }));
}

export function clearDraftNotes(submissionId: string): void {
  draftStore.update((all) => {
    if (!(submissionId in all)) return all;
    const { [submissionId]: _removed, ...rest } = all;
    return rest;
  });
}

// ── snoozed videos ─────────────────────────────────────────────────────────────────────────────

const snoozeStore = createExternalStore<ReadonlySet<string>>(new Set());

/** Videos the reviewer snoozed (S). Snoozing hides a video from this list only; the 72-hour clock keeps running. */
export function useSnoozedIds(): ReadonlySet<string> {
  return useExternalStore(snoozeStore);
}

export function snooze(ids: readonly string[]): void {
  snoozeStore.update((current) => new Set([...current, ...ids]));
}

export function unsnooze(ids: readonly string[]): void {
  snoozeStore.update((current) => {
    const next = new Set(current);
    for (const id of ids) next.delete(id);
    return next;
  });
}

export function clearSnoozed(): void {
  snoozeStore.set(new Set());
}
