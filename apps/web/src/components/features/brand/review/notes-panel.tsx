"use client";

import type { Ref } from "react";
import { MessageSquarePlus } from "lucide-react";
import type { SubmissionView } from "@/lib/data/selectors";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { NoteComposer, NoteRow, type NoteTimes } from "./notes";
import type { Player } from "./player";
import { addDraftNote, removeDraftNote, useDraftNotes } from "./session-state";

export interface NotesPanelProps {
  submission: SubmissionView;
  player: Player;
  times: NoteTimes;
  onTimesChange: (times: NoteTimes) => void;
  textareaRef: Ref<HTMLTextAreaElement>;
  /** Notes can only be written while the video is in review. */
  canWrite: boolean;
}

/**
 * Timecoded feedback (F-005). C pauses and starts a note at this frame, I and O mark a span. Notes stay here as drafts until you ask for
 * changes; then each one is pinned to its moment for the creator, and your must-fix notes follow the video into the next version.
 */
export function NotesPanel({ submission, player, times, onTimesChange, textareaRef, canWrite }: NotesPanelProps) {
  const drafts = useDraftNotes(submission.id);
  const sent = submission.notes.filter((n) => n.version === submission.version);
  const mustFix = drafts.filter((n) => n.severity === "must_fix").length;
  return (
    <GlassCard padding="lg" className="grid scroll-mt-40 gap-5" id="notes">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <h2 className="flex items-center gap-2.5 font-display text-title-md text-fg">
          Notes for @{submission.creator.handle}
          {drafts.length > 0 ? (
            <Badge tone="accent" size="sm">
              {drafts.length}
            </Badge>
          ) : null}
        </h2>
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-fg-subtle">
          <span className="inline-flex items-center gap-1">
            <Kbd size="sm">C</Kbd> note here
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd size="sm">I</Kbd>
            <Kbd size="sm">O</Kbd> span
          </span>
        </p>
      </header>

      {canWrite ? (
        <div className="rounded-2xl bg-surface-field p-4">
          <NoteComposer
            durationMs={player.durationMs}
            getNowMs={() => player.getState().timeMs}
            times={times}
            onTimesChange={onTimesChange}
            onAdd={(note) => addDraftNote(submission.id, note)}
            textareaRef={textareaRef}
            idPrefix="focus-note"
          />
        </div>
      ) : (
        <p className="rounded-xl bg-surface-field px-4 py-3 text-body-sm text-fg-muted">This video is not waiting for a decision, so it takes no new notes.</p>
      )}

      {drafts.length > 0 ? (
        <div className="grid gap-2.5">
          <h3 className="text-body-sm font-semibold text-fg">
            To send <span className="font-normal text-fg-subtle">· {mustFix} must fix, {drafts.length - mustFix} {drafts.length - mustFix === 1 ? "suggestion" : "suggestions"}</span>
          </h3>
          <ul className="grid gap-2" aria-label="Notes to send">
            {drafts.map((n) => (
              <NoteRow key={n.id} t_ms={n.t_ms} t_end_ms={n.t_end_ms} category={n.category} severity={n.severity} body={n.body} onSeek={() => player.seek(n.t_ms)} onRemove={() => removeDraftNote(submission.id, n.id)} />
            ))}
          </ul>
          <p className="text-caption text-fg-subtle">Press F to send them with a request for changes. At least one must be a must-fix.</p>
        </div>
      ) : canWrite ? (
        <p className="flex items-center gap-2 text-caption text-fg-subtle">
          <MessageSquarePlus aria-hidden="true" className="size-4" />
          No notes yet. Notes about a moment beat a long message: the creator jumps straight to it.
        </p>
      ) : null}

      {sent.length > 0 ? (
        <div className="grid gap-2.5">
          <h3 className="text-body-sm font-semibold text-fg">Already sent on this version</h3>
          <ul className="grid gap-2">
            {sent.map((n) => (
              <NoteRow key={n.id} t_ms={n.t_ms} t_end_ms={n.t_end_ms} category={n.category} severity={n.severity} body={n.body} status={n.status} onSeek={() => player.seek(n.t_ms)} />
            ))}
          </ul>
        </div>
      ) : null}
    </GlassCard>
  );
}
