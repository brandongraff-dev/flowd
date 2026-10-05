"use client";

import { Clock, Hourglass, TriangleAlert } from "lucide-react";
import { SUBMISSION_STATUS_META, type SubmissionStatus } from "@/lib/contract/types";
import type { SubmissionView } from "@/lib/data/selectors";
import { formatClockEta, formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";
import { DomainStatusPill } from "@/components/brand";

export function SubmissionStatusPill({ status, className }: { status: SubmissionStatus; className?: string }) {
  return <DomainStatusPill meta={SUBMISSION_STATUS_META[status]} value={status} size="md" className={className} />;
}

/** Which tab a status belongs to. The labels are the creator's words, not the state machine's. */
export const SUBMISSION_GROUPS = [
  { id: "all", label: "All", statuses: null },
  { id: "review", label: "In review", statuses: ["qa_pending", "in_review", "appealed"] },
  { id: "revise", label: "Revise", statuses: ["changes_requested"] },
  { id: "approved", label: "Approved", statuses: ["approved"] },
  { id: "posted", label: "Posted", statuses: ["posted", "released"] },
  { id: "rejected", label: "Not approved", statuses: ["rejected"] },
  { id: "withdrawn", label: "Withdrawn", statuses: ["withdrawn", "expired"] },
] as const satisfies readonly { id: string; label: string; statuses: readonly SubmissionStatus[] | null }[];
export type SubmissionGroupId = (typeof SUBMISSION_GROUPS)[number]["id"];

/**
 * The decide-by clock: "Decide by Tue 2:00 PM UTC" in words, amber at 48 hours in the queue and rose once the 72-hour promise is broken, each with a glyph so
 * the state never rests on colour. Shown on both sides of a review, because the clock belongs to the brand and the creator both.
 */
export function DecideBy({ sub, className }: { sub: Pick<SubmissionView, "review" | "bounty" | "status">; className?: string }) {
  const now = useNow();
  const clock = sub.review;
  if (!clock) return null;
  const late = clock.state === "breached";
  const stale = clock.state === "stale";
  const Icon = late ? TriangleAlert : stale ? Hourglass : Clock;
  const left = Math.round(clock.hours_left);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 text-caption font-medium", late ? "text-rose" : stale ? "text-ember" : "text-fg-muted", className)}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.25} />
      <span>{late ? `Overdue by ${Math.abs(left)} h` : `Decides by ${formatClockEta(clock.due_at, { now })} UTC`}</span>
      {!late ? <span className="font-normal text-fg-subtle">({left < 1 ? "under an hour" : `about ${left} h`})</span> : null}
      {late ? <span className="sr-only">. The 72-hour promise was missed.</span> : null}
    </span>
  );
}

/** Where a submission is, in one plain sentence. Used under the title in lists and at the top of the detail page. */
export function statusSentence(sub: SubmissionView, now: number): string {
  const brand = sub.brand.name;
  switch (sub.status) {
    case "qa_pending":
      return "Auto-checks and scoring are running. It enters review in a moment.";
    case "in_review":
      return `${brand} is reviewing it.`;
    case "changes_requested":
      return `${brand} asked for changes. ${sub.rounds_left > 0 ? `${sub.rounds_left} free ${sub.rounds_left === 1 ? "round" : "rounds"} left.` : "A further round is paid by the brand."}`;
    case "approved":
      return "Approved. Post it with the disclosure and your link to start the 72-hour view window.";
    case "posted":
      return sub.post ? `Posted ${formatClockEta(sub.post.posted_at, { now })} UTC. Views count for 72 hours.` : "Posted.";
    case "rejected":
      return sub.decision?.reason_code ? "Not approved, with a reason you can read." : "Not approved.";
    case "appealed":
      return "Your appeal is open. A person at flowd replies within 72 hours.";
    case "withdrawn":
      return "You withdrew it. The reservation went back to the pool.";
    case "expired":
      return `The revision window closed ${formatRelative(sub.updated_at, now)}.`;
    case "released":
      return "Approved but not used within 30 days, so it moved to the Spec Market. The brand keeps first refusal.";
  }
}
