"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Clapperboard, ShieldCheck, Undo2 } from "lucide-react";
import { DECISION_ACTION_META, FEEDBACK_CATEGORY_META, QA_CHECK_TYPE_META, REASON_CODE_META, type FeedbackNote, type QaCheckType } from "@/lib/contract/types";
import { useStoreReady, useSubmission, useSubmissionAnalysis } from "@/lib/data";
import type { SubmissionView } from "@/lib/data/selectors";
import { rightsLines } from "@/lib/engine";
import { formatClockEta, formatDate, formatDuration, formatMoney } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass";
import { PageHeader, Timeline, type TimelineItem } from "@/components/shell";
import { Badge, Button, Callout, Checkbox, ConfirmDialog, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, Field, Skeleton, Textarea, buttonVariants, notify } from "@/components/ui";
import { Amount } from "./amount";
import { NotePlayer } from "./note-player";
import { PostFlow } from "./post-flow";
import { RightsCardView } from "./rights-pay-cards";
import { ScorePanel } from "./studio/score-panel";
import { DecideBy, SubmissionStatusPill, statusSentence } from "./submission-parts";

function NoteRow({ note, active, canTick, onSeek }: { note: FeedbackNote; active: boolean; canTick: boolean; onSeek: () => void }) {
  const [busy, setBusy] = useState(false);
  const open = note.status === "open";
  const tick = async (): Promise<void> => {
    setBusy(true);
    const result = await actions.resolveNote({ note_id: note.id, status: "resolved" });
    setBusy(false);
    if (!result.ok) notify.error(result.error.message, { description: result.error.hint });
  };
  return (
    <li className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-2xl p-3.5 transition-colors duration-(--fd-dur-fast) ease-standard", active ? "bg-accent-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-accent)_40%,transparent)]" : "bg-surface-field shadow-[inset_0_0_0_1px_var(--fd-rim)]")}>
      <button type="button" onClick={onSeek} className="h-fit rounded-md bg-surface-active px-2 py-1 font-mono text-micro font-semibold text-fg tabular-nums hover:bg-surface-hover" aria-label={`Jump to ${formatDuration(note.t_ms / 1000)}`}>
        {formatDuration(note.t_ms / 1000)}
      </button>
      <div className="grid min-w-0 gap-1.5">
        <p className="flex flex-wrap items-center gap-1.5">
          <Badge tone={note.severity === "must_fix" ? "ember" : "info"} size="sm">
            {note.severity === "must_fix" ? "Must fix" : "Suggestion"}
          </Badge>
          <Badge tone="neutral" size="sm">
            {FEEDBACK_CATEGORY_META[note.category].label}
          </Badge>
          <span className="text-micro text-fg-subtle">v{note.version}</span>
          {!open ? (
            <Badge tone="mint" size="sm" icon={<Check aria-hidden="true" />}>
              {note.status === "resolved" ? "Done" : "Dismissed"}
            </Badge>
          ) : null}
        </p>
        <p className={cn("text-body-sm text-fg", !open && "text-fg-muted line-through decoration-fg-disabled")}>{note.body}</p>
        {canTick && open ? (
          <Checkbox label="I fixed this" checked={false} disabled={busy} onCheckedChange={() => void tick()} containerClassName="min-h-9 py-0" />
        ) : null}
      </div>
    </li>
  );
}

function AppealDialog({ sub, open, onOpenChange }: { sub: SubmissionView; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const code = sub.decision?.reason_code;
  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await actions.appealRejection({ submission_id: sub.id, note });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onOpenChange(false);
    notify.success("Appeal sent", { description: "A person at flowd replies within 72 hours. It's the one appeal for this rejection." });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Appeal this decision</DialogTitle>
          <DialogDescription>You get one appeal per rejection. A person at flowd reads the brief, the video and the reason, and replies within 72 hours.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {code ? (
            <p className="rounded-xl bg-surface-field px-3.5 py-2.5 text-caption text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              Reason given: <span className="font-semibold text-fg">{REASON_CODE_META[code].label}</span>. {REASON_CODE_META[code].meaning}
            </p>
          ) : null}
          <Field label="Why does that reason not match the brief?" error={error} hint="Point at a timecode or a line of the brief. Keep it about the video.">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} maxLength={600} showCount placeholder="The app is on screen at 0:02, which meets the 3-second rule in the brief." />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Send appeal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DecisionCard({ sub, onAppeal }: { sub: SubmissionView; onAppeal: () => void }) {
  const now = useNow();
  const d = sub.decision;
  if (!d) return null;
  const meta = DECISION_ACTION_META[d.action];
  const reason = d.reason_code ? REASON_CODE_META[d.reason_code] : null;
  return (
    <GlassCard padding="lg" className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-title-md text-fg">The decision</h2>
        <Badge tone={meta.tone} size="md">
          {meta.label}
        </Badge>
      </div>
      <p className="text-caption text-fg-muted">
        Decided {formatClockEta(d.decided_at, { now })} UTC{d.sla_met ? ", inside the 72-hour promise" : ", after the 72-hour promise"}.
      </p>
      {reason ? (
        <div className="grid gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <p className="text-micro font-medium text-fg-subtle">Reason</p>
          <p className="text-body-sm font-semibold text-fg">{reason.label}</p>
          <p className="text-caption text-fg-muted">{reason.meaning}</p>
        </div>
      ) : null}
      {d.summary ? <p className="text-body-sm text-fg">{d.summary}</p> : null}
      {d.evidence ? (
        <div className="grid gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <p className="text-micro font-medium text-fg-subtle">Evidence</p>
          <p className="text-caption text-fg-muted">
            <span className="font-mono tabular-nums text-fg">{d.evidence.t_ms !== undefined ? formatDuration(d.evidence.t_ms / 1000) : (QA_CHECK_TYPE_META[d.evidence.ref as QaCheckType]?.label ?? d.evidence.ref)}</span>
            {d.evidence.excerpt ? ` ${d.evidence.excerpt}` : ""}
          </p>
        </div>
      ) : null}
      {sub.appeal ? (
        <Callout tone="accent" title={`Appeal ${sub.appeal.status.replace(/_/g, " ")}`}>
          {sub.appeal.outcome_text ?? `A person at flowd replies by ${formatClockEta(sub.appeal.resolution_due_at, { now })} UTC.`}
        </Callout>
      ) : sub.can_appeal ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[40ch] text-caption text-fg-muted">You can appeal once, until {sub.appeal_by ? formatDate(sub.appeal_by, "medium", { now }) : "the window closes"}.</p>
          <Button variant="secondary" onClick={onAppeal}>
            Appeal this decision
          </Button>
        </div>
      ) : null}
    </GlassCard>
  );
}

/** `/creator/submissions/[id]`: the player with timecoded notes, the decision and its evidence, versions, the post flow once approved and the reservation. */
export function SubmissionDetail({ submissionId }: { submissionId: string }) {
  const ready = useStoreReady();
  const sub = useSubmission(submissionId);
  const analysis = useSubmissionAnalysis(submissionId);
  const now = useNow();
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [appeal, setAppeal] = useState(false);
  const [withdraw, setWithdraw] = useState(false);

  if (!ready) {
    return (
      <div className="grid gap-6" aria-busy="true">
        <Skeleton className="h-24 w-full max-w-xl" />
        <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <Skeleton className="h-[28rem] rounded-[28px]" />
          <Skeleton className="h-[28rem] rounded-[28px]" />
        </div>
      </div>
    );
  }
  if (!sub) {
    return (
      <GlassCard>
        <EmptyState
          art="search"
          headingAs="h1"
          title="That submission isn't here"
          description="It may belong to another account, or the link is old. Your submissions are all in one list."
          action={
            <Link href="/creator/submissions" className={buttonVariants({ variant: "primary" })}>
              Back to submissions
            </Link>
          }
        />
      </GlassCard>
    );
  }

  const current = analysis.current;
  const notes = sub.notes;
  const activeNote = notes.find((n) => currentMs >= n.t_ms && currentMs <= (n.t_end_ms ?? n.t_ms + 1500)) ?? null;
  const open = sub.status === "in_review" || sub.status === "changes_requested" || sub.status === "approved" || sub.status === "qa_pending";
  const prev = sub.versions.length > 1 ? sub.versions[sub.versions.length - 2] : undefined;

  const steps: TimelineItem[] = [
    { id: "submitted", title: "Submitted", time: `${formatClockEta(sub.submitted_at, { now })} UTC`, description: `Version 1. Auto-checks ran and ${formatMoney(sub.bounty.per_video_cap_cents, { cents: "auto" })} was reserved from the pool.`, state: "done" },
    ...sub.versions.slice(1).map((v): TimelineItem => ({ id: `v${v.version}`, title: `Revision v${v.version}`, time: `${formatClockEta(v.submitted_at, { now })} UTC`, description: v.changes_summary, state: "done" })),
    ...(sub.decision
      ? [{ id: "decision", title: DECISION_ACTION_META[sub.decision.action].label, time: `${formatClockEta(sub.decision.decided_at, { now })} UTC`, description: sub.decision.reason_code ? REASON_CODE_META[sub.decision.reason_code].label : undefined, state: sub.decision.action.includes("reject") ? ("error" as const) : ("done" as const) }]
      : sub.review
        ? [{ id: "review", title: "In review", time: `Decide by ${formatClockEta(sub.review.due_at, { now })} UTC`, description: `${sub.bounty.brand.name}'s 72-hour promise.`, state: (sub.review.state === "breached" ? "warning" : "active") as TimelineItem["state"] }]
        : []),
    ...(sub.post ? [{ id: "posted", title: "Posted", time: `${formatClockEta(sub.post.posted_at, { now })} UTC`, description: "The 72-hour view window opened.", state: "done" as const }] : []),
  ];

  return (
    <div className="grid gap-8">
      <PageHeader
        breadcrumbs={
          <Link href="/creator/submissions" className="inline-flex w-fit items-center gap-1.5 rounded-sm text-caption font-semibold text-fg-muted hover:text-fg">
            <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
            Submissions
          </Link>
        }
        eyebrow="Submission"
        title={sub.title}
        description={
          <>
            <Link href={`/creator/bounties/${sub.bounty_id}`} className="font-semibold text-fg hover:underline">
              {sub.bounty.title}
            </Link>{" "}
            · {sub.app.name} · {sub.brand.name}
          </>
        }
        meta={
          <>
            <SubmissionStatusPill status={sub.status} />
            <DecideBy sub={sub} />
            <Badge tone="neutral" size="md">
              Version {sub.version}
            </Badge>
          </>
        }
        actions={
          <>
            {sub.status === "changes_requested" ? (
              <Link href={`/creator/studio?revise=${sub.id}`} className={buttonVariants({ variant: "primary" })}>
                <Clapperboard aria-hidden="true" />
                Upload a revision
              </Link>
            ) : null}
            {sub.status === "posted" && sub.post ? (
              <Link href={`/creator/posts/${sub.post.id}`} className={buttonVariants({ variant: "primary" })}>
                See the post
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : null}
            {sub.status === "in_review" || sub.status === "changes_requested" || sub.status === "approved" ? (
              <Button variant="ghost" leadingIcon={<Undo2 />} onClick={() => setWithdraw(true)}>
                Withdraw
              </Button>
            ) : null}
          </>
        }
      />

      <Callout tone={sub.status === "rejected" ? "rose" : sub.status === "approved" || sub.status === "posted" ? "mint" : sub.status === "changes_requested" ? "ember" : "info"} title={statusSentence(sub, now)}>
        {sub.status === "changes_requested" && sub.open_must_fix.length > 0
          ? `${sub.open_must_fix.length} must-fix ${sub.open_must_fix.length === 1 ? "note" : "notes"} to tick off before you resubmit.`
          : sub.status === "in_review"
            ? "No action needed. If the brand misses its decide-by time, that counts against the brand."
            : undefined}
      </Callout>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="grid gap-5">
          <NotePlayer
            art={sub.current.video.art}
            assetId={sub.current.video.asset_id}
            durationMs={sub.current.video.duration_ms}
            transcript={current?.transcript ?? []}
            onScreen={current?.on_screen_text ?? []}
            notes={notes.filter((n) => n.version === sub.version || n.status === "open")}
            currentMs={currentMs}
            playing={playing}
            onSeek={setCurrentMs}
            onPlayingChange={setPlaying}
            activeNoteId={activeNote?.id ?? null}
          />
          <p className="text-center text-micro text-fg-subtle">A generated preview with the transcript as captions. The video itself plays in the iOS app.</p>
        </div>

        <div className="grid min-w-0 gap-5">
          {sub.status === "approved" ? <PostFlow sub={sub} /> : null}

          {notes.length > 0 ? (
            <GlassCard padding="lg" className="grid gap-4" aria-labelledby="notes-title">
              <div className="grid gap-1">
                <h2 id="notes-title" className="font-display text-title-md text-fg">
                  Notes on the video
                </h2>
                <p className="text-body-sm text-fg-muted">Each note points at a moment. Must-fix notes carry to the next version until you tick them off. Suggestions are optional.</p>
              </div>
              <ul className="grid gap-2.5">
                {notes.map((note) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    active={activeNote?.id === note.id}
                    canTick={sub.status === "changes_requested"}
                    onSeek={() => {
                      setPlaying(false);
                      setCurrentMs(note.t_ms);
                    }}
                  />
                ))}
              </ul>
            </GlassCard>
          ) : null}

          <DecisionCard sub={sub} onAppeal={() => setAppeal(true)} />

          {open && sub.reserved_cents > 0 ? (
            <GlassCard className="grid gap-2">
              <h2 className="fd-eyebrow flex items-center gap-1.5 text-fg-subtle">
                <ShieldCheck aria-hidden="true" className="size-3.5" strokeWidth={2} />
                Reserved Slot
              </h2>
              <Amount cents={sub.reserved_cents} size="lg" state="neutral" icon={false} decimals="auto" />
              <p className="text-caption text-fg-muted">
                Held in the pool for this video while it is reviewed. If it is approved you are paid even if the pool empties afterwards. If it is rejected or withdrawn, the hold is released.
              </p>
            </GlassCard>
          ) : null}

          <GlassCard padding="lg" className="grid gap-4">
            <h2 className="font-display text-title-md text-fg">Versions and review</h2>
            <ul className="grid gap-2">
              {[...sub.versions].reverse().map((v) => (
                <li key={v.version} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-surface-field p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                  <Badge tone={v.version === sub.version ? "accent" : "neutral"} size="md">
                    v{v.version}
                  </Badge>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-body-sm font-semibold text-fg">
                      Hook {v.hook_band} ({v.hook_points}) · Flow {v.flow_band} ({v.flow_points})
                    </span>
                    <span className="truncate text-caption text-fg-muted">{v.changes_summary ?? `Sent ${formatClockEta(v.submitted_at, { now })} UTC. Checklist scores.`}</span>
                  </span>
                  <span className="text-micro text-fg-subtle tabular-nums">{v.qa_fail > 0 ? `${v.qa_fail} failed` : v.qa_warn > 0 ? `${v.qa_warn} to check` : "Checks clear"}</span>
                </li>
              ))}
            </ul>
            {prev ? (
              <p className="text-caption text-fg-muted">
                Since v{prev.version}: Hook {prev.hook_band} to {sub.current.hook_band}, Flow {prev.flow_band} to {sub.current.flow_band}.
              </p>
            ) : null}
            <Timeline items={steps} compact />
          </GlassCard>

          {current ? (
            <details className="group rounded-[28px] bg-surface p-6 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              <summary className="cursor-pointer rounded-sm font-display text-title-sm text-fg">The scores, with reasons</summary>
              <div className="mt-5">
                <ScorePanel hook={{ ...current.hook_score }} flow={{ ...current.flow_score }} />
              </div>
            </details>
          ) : null}

          <details className="rounded-[28px] bg-surface p-6 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <summary className="cursor-pointer rounded-sm font-display text-title-sm text-fg">The licence you accepted</summary>
            <div className="mt-5">
              <RightsCardView card={sub.rights_card} lines={rightsLines(sub.rights_card)} summary={sub.rights_card.summary} className="shadow-none" />
            </div>
          </details>
        </div>
      </div>

      <AppealDialog sub={sub} open={appeal} onOpenChange={setAppeal} />
      <ConfirmDialog
        open={withdraw}
        onOpenChange={setWithdraw}
        title="Withdraw this video?"
        description={`The ${formatMoney(sub.reserved_cents, { cents: "auto" })} held for it goes back to the pool, and ${sub.brand.name} stops reviewing it. You can submit a different video to this bounty.`}
        confirmLabel="Withdraw video"
        tone="danger"
        onConfirm={async () => {
          const result = await actions.withdrawSubmission({ submission_id: sub.id });
          if (!result.ok) {
            notify.error(result.error.message, { description: result.error.hint });
            throw new Error(result.error.code);
          }
          notify.message("Video withdrawn", { description: "The reservation is back in the pool." });
        }}
      />
    </div>
  );
}
