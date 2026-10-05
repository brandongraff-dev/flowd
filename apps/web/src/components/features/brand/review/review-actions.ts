"use client";

import { actions } from "@/lib/store";
import type { SubmissionView } from "@/lib/data/selectors";
import type { ChangesPayload, RejectPayload } from "./decision-dialogs";
import { queueDecision } from "./decisions";
import { clearDraftNotes } from "./session-state";

/** The three review decisions, each held for 10 seconds with an Undo (see `decisions.ts`) and then run through the real store action. */

const who = (s: SubmissionView): string => `@${s.creator.handle}`;

export function approveVideos(videos: readonly SubmissionView[], summary?: string): void {
  if (videos.length === 0) return;
  const one = videos.length === 1 ? videos[0] : undefined;
  queueDecision({
    kind: "approve",
    submissionIds: videos.map((v) => v.id),
    pendingTitle: one ? `Approving ${who(one)}'s video` : `Approving ${videos.length} videos`,
    pendingDescription: "Final in 10 seconds. Undo keeps it in the queue.",
    doneTitle: (n) => (one ? `Approved ${who(one)}'s video` : `Approved ${n} ${n === 1 ? "video" : "videos"}`),
    doneDescription: "Each creator gets a link and a code, and is paid when views clear.",
    commit: async () => {
      const results = [];
      for (const v of videos) results.push(await actions.approveSubmission({ submission_id: v.id, ...(summary ? { summary: `Approved. Override reason: ${summary}` } : {}) }));
      return results;
    },
  });
}

export function requestChanges(video: SubmissionView, payload: ChangesPayload): void {
  const mustFix = payload.notes.filter((n) => n.severity === "must_fix").length;
  queueDecision({
    kind: "request_changes",
    submissionIds: [video.id],
    pendingTitle: `Asking ${who(video)} for changes`,
    pendingDescription: `${payload.notes.length} ${payload.notes.length === 1 ? "note" : "notes"}, ${mustFix} must fix. Final in 10 seconds. Undo keeps it in the queue.`,
    doneTitle: () => `Asked ${who(video)} for changes`,
    doneDescription: "Each note is pinned to its moment in the video.",
    commit: async () => {
      const result = await actions.requestRevision({
        submission_id: video.id,
        notes: payload.notes.map((n) => ({ t_ms: n.t_ms, ...(n.t_end_ms !== undefined ? { t_end_ms: n.t_end_ms } : {}), body: n.body, category: n.category, severity: n.severity })),
        ...(payload.reason_code ? { reason_code: payload.reason_code } : {}),
        ...(payload.summary ? { summary: payload.summary } : {}),
      });
      if (result.ok) clearDraftNotes(video.id);
      return [result];
    },
  });
}

export function rejectVideo(video: SubmissionView, payload: RejectPayload): void {
  queueDecision({
    kind: "reject",
    submissionIds: [video.id],
    pendingTitle: `Not approving ${who(video)}'s video`,
    pendingDescription: "Final in 10 seconds. Undo keeps it in the queue.",
    doneTitle: () => `Not approved: ${who(video)}'s video`,
    doneDescription: "They can fix it and resubmit, or appeal once.",
    commit: async () => [await actions.rejectSubmission({ submission_id: video.id, reason_code: payload.reason_code, evidence: payload.evidence, ...(payload.summary ? { summary: payload.summary } : {}) })],
  });
}
