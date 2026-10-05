"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Check, Keyboard, RotateCcw, Undo2, X } from "lucide-react";
import { DECISION_ACTION_META, REASON_CODE_META, SUBMISSION_STATUS_META } from "@/lib/contract/types";
import { useMe, useReviewQueue, useStoreReady, useSubmission, useSubmissionAnalysis } from "@/lib/data";
import type { SubmissionView } from "@/lib/data/selectors";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DomainStatusPill } from "@/components/brand";
import { Glass, GlassCard } from "@/components/glass/glass";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { ChangesDialog, DuplicateOverrideDialog, RejectDialog } from "./decision-dialogs";
import { undoLatestDecision, useHeldSubmissionIds } from "./decisions";
import { FraudEvidence } from "./fraud-evidence";
import { CreatorCard, RightsAcceptedCard, TranscriptCard, VersionDiffCard } from "./focus-context";
import { QaCard, ScoresCard } from "./focus-scores";
import type { NoteTimes } from "./notes";
import { NotesPanel } from "./notes-panel";
import { BandBadge, Reason, SlaChip } from "./parts";
import { usePlayer } from "./player";
import { isControlTarget } from "./queue-preview";
import { approveVideos, rejectVideo, requestChanges } from "./review-actions";
import { RouteLoading } from "./route-states";
import { useDraftNotes } from "./session-state";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { tc, tcPrecise } from "./timecode";
import { useReviewKeys } from "./use-review-keys";
import { PlayerBar, VideoScreen, type TimelineMarker, type TimelineRange } from "./video-stand-in";
import { flagsFromChecks } from "./queue-data";

type Dialog = "reject" | "changes" | "override" | null;

/**
 * Focus-mode review. One video, everything a reviewer needs to decide it, and the keyboard to do it with: the player with its
 * moments, the checklist scores with the reason for every lost point, the automated checks, the fraud evidence, the transcript with
 * its beats, the creator's record, what changed since last time, and timecoded notes. Decisions work exactly as in the queue.
 */
export function FocusReview({ id }: { id: string }) {
  const ready = useStoreReady();
  const me = useMe();
  const submission = useSubmission(id);
  if (!ready) return <RouteLoading shape="focus" label="Loading the video" header={false} />;
  if (!submission || (me.brand && submission.brand_id !== me.brand.id)) return <NotFound />;
  return <FocusBody key={`${submission.id}-${submission.version}`} submission={submission} />;
}

function NotFound() {
  return (
    <GlassCard padding="lg" className="mx-auto mt-6 w-full max-w-2xl">
      <EmptyState
        art="video"
        title="That video is not in your queue"
        description="The link may be old, or the video belongs to another workspace. The queue has everything waiting for you."
        action={
          <Link href="/brand/review" className={buttonVariants({ variant: "primary" })}>
            Back to the review queue
          </Link>
        }
      />
    </GlassCard>
  );
}

function FocusBody({ submission }: { submission: SubmissionView }) {
  const router = useRouter();
  const analysis = useSubmissionAnalysis(submission.id);
  const queue = useReviewQueue();
  const held = useHeldSubmissionIds();
  const drafts = useDraftNotes(submission.id);
  const duration = submission.current.video.duration_ms;
  const player = usePlayer(duration);
  const [captions, setCaptions] = useState(true);
  const [times, setTimes] = useState<NoteTimes>({ start: "", end: "" });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const a = analysis.current;
  const inReview = submission.status === "in_review";
  const isHeld = held.has(submission.id);
  const canDecide = inReview && !isHeld;
  const overlayOpen = dialog !== null || helpOpen;

  const order = useMemo(() => queue.items.filter((v) => !held.has(v.id)).map((v) => v.id), [queue.items, held]);
  const index = order.indexOf(submission.id);
  const prevId = index > 0 ? order[index - 1] : undefined;
  const nextId = index >= 0 ? order[index + 1] : undefined;
  const neighbour = nextId ?? prevId;
  const afterDecision = (): void => router.replace(neighbour ? `/brand/review/${neighbour}` : "/brand/review");

  const flags = useMemo(() => flagsFromChecks(a?.checks ?? []), [a]);
  const markers = useMemo<TimelineMarker[]>(() => {
    const list: TimelineMarker[] = [];
    flags.forEach((f, i) => {
      if (f.t_ms !== undefined) list.push({ id: `flag-${i}`, t_ms: f.t_ms, kind: f.result === "fail" ? "fail" : "warn", label: f.message });
    });
    if (a) list.push({ id: "hook", t_ms: a.hook.lands_at_ms, kind: "hook", label: "The hook lands" });
    for (const n of drafts) list.push({ id: n.id, t_ms: n.t_ms, kind: n.severity === "must_fix" ? "must_fix" : "suggestion", label: n.body });
    return list;
  }, [flags, a, drafts]);
  const ranges = useMemo<TimelineRange[]>(() => {
    const list: TimelineRange[] = drafts.filter((n) => n.t_end_ms !== undefined).map((n) => ({ id: n.id, start_ms: n.t_ms, end_ms: n.t_end_ms ?? n.t_ms, tone: "accent" as const }));
    return list;
  }, [drafts]);

  const seek = (ms: number): void => {
    player.pause();
    player.seek(ms);
  };
  const now = (): number => player.getState().timeMs;

  const approve = (): void => {
    if (!canDecide) return;
    if (submission.fraud_evidence.duplicate_of_submission_id !== undefined) {
      setDialog("override");
      return;
    }
    approveVideos([submission]);
    afterDecision();
  };

  useReviewKeys(
    {
      space: (event) => (isControlTarget(event.target) ? false : player.toggle()),
      j: () => player.seekBy(-5000),
      k: () => player.pause(),
      l: () => player.seekBy(5000),
      ",": () => player.step(-1),
      ".": () => player.step(1),
      "1": () => player.setRate(1),
      "2": () => player.setRate(2),
      t: () => setCaptions((on) => !on),
      c: () => {
        if (!canDecide) return false;
        player.pause();
        setTimes((t) => ({ ...t, start: tcPrecise(now()) }));
        textareaRef.current?.focus();
      },
      i: () => {
        if (canDecide) setTimes((t) => ({ ...t, start: tcPrecise(now()) }));
      },
      o: () => {
        if (canDecide) setTimes((t) => ({ ...t, end: tcPrecise(now()) }));
      },
      a: approve,
      f: () => {
        if (canDecide) setDialog("changes");
      },
      r: () => {
        if (canDecide) setDialog("reject");
      },
      z: () => (undoLatestDecision() ? undefined : false),
      "mod+z": () => (undoLatestDecision() ? undefined : false),
      "]": () => {
        if (nextId) router.push(`/brand/review/${nextId}`);
      },
      "[": () => {
        if (prevId) router.push(`/brand/review/${prevId}`);
      },
      "?": () => setHelpOpen(true),
      escape: () => router.push("/brand/review"),
    },
    { enabled: !overlayOpen },
  );

  const review = submission.review;
  const handle = submission.creator.handle;

  return (
    <div className="grid gap-6">
      <header className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/brand/review" className="inline-flex items-center gap-2 rounded-pill py-1 pr-2 text-body-sm font-medium text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Review queue
            <Kbd size="sm">Esc</Kbd>
          </Link>
          <div className="flex items-center gap-1">
            <NavArrow href={prevId ? `/brand/review/${prevId}` : undefined} label="Previous video" keyHint="[" icon={<ChevronLeft />} />
            <p className="min-w-[4.5rem] text-center text-caption font-medium text-fg-muted tabular-nums" aria-live="polite">
              {index >= 0 ? `${index + 1} of ${order.length}` : "Not waiting"}
            </p>
            <NavArrow href={nextId ? `/brand/review/${nextId}` : undefined} label="Next video" keyHint="]" icon={<ChevronRight />} />
            <IconButton variant="plain" size="sm" label="Keyboard shortcuts" shortcut={["?"]} icon={<Keyboard />} onClick={() => setHelpOpen(true)} />
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="grid min-w-0 gap-2">
            <h1 className="font-display text-display-sm text-balance text-fg">{submission.title}</h1>
            <p className="text-body-sm text-fg-muted">
              @{handle} · {submission.bounty.title} · version {submission.version}
              {review ? ` · ${review.label}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DomainStatusPill meta={SUBMISSION_STATUS_META[submission.status]} />
            <BandBadge band={submission.flow_band} kind="Flow" word />
            <BandBadge band={submission.hook_band} kind="Hook" word />
            {review ? <SlaChip state={review.state} hoursLeft={review.hours_left} label={review.label} /> : null}
          </div>
        </div>
        {isHeld ? (
          <Callout
            tone="info"
            role="status"
            title="Decision held for 10 seconds"
            action={
              <Button size="sm" variant="secondary" leadingIcon={<Undo2 />} onClick={() => undoLatestDecision()}>
                Undo
                <Kbd size="sm">Z</Kbd>
              </Button>
            }
          >
            It becomes final when the time is up. Until then nothing has changed for the creator.
          </Callout>
        ) : !inReview ? (
          <DecidedBanner submission={submission} />
        ) : null}
      </header>

      <ActionBar submission={submission} canDecide={canDecide} held={isHeld} inReview={inReview} onApprove={approve} onChanges={() => setDialog("changes")} onReject={() => setDialog("reject")} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4 lg:sticky lg:top-40">
          <GlassCard padding="md" className="grid gap-3">
            <div className="mx-auto w-full" style={{ maxWidth: "clamp(160px, calc((100dvh - 35rem) * 0.5625), 240px)" }}>
              <VideoScreen player={player} art={submission.current.video.art} app={{ name: submission.app.name, art: submission.app.icon }} analysis={a} captions={captions} label={`${submission.title} by @${handle}`} />
            </div>
            <PlayerBar player={player} markers={markers} ranges={ranges} captions={captions} onCaptionsChange={setCaptions} hints />
          </GlassCard>
        </div>

        <div className="grid min-w-0 gap-6">
          <nav aria-label="On this page" className="flex flex-wrap gap-1.5">
            {[
              ...(submission.version > 1 ? [["versions", "What changed"]] : []),
              ["checks", "Checks"],
              ["scores", "Scores"],
              ["notes", "Notes"],
              ["fraud", "Fraud evidence"],
              ["transcript", "Transcript"],
              ["creator", "Creator"],
            ].map(([anchor, label]) => (
              <a key={anchor} href={`#${anchor}`} className="inline-flex h-8 items-center rounded-pill bg-surface-field px-3.5 text-caption font-semibold text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:text-fg">
                {label}
              </a>
            ))}
          </nav>
          <VersionDiffCard submission={submission} versions={analysis.versions} onSeek={seek} />
          <QaCard analysis={a} loading={analysis.loading} submissionId={submission.id} onSeek={seek} />
          <ScoresCard analysis={a} loading={analysis.loading} submissionId={submission.id} onSeek={seek} />
          <NotesPanel submission={submission} player={player} times={times} onTimesChange={setTimes} textareaRef={textareaRef} canWrite={canDecide} />
          <FraudEvidence submission={submission} analysis={a} />
          <TranscriptCard player={player} analysis={a} loading={analysis.loading} onSeek={seek} />
          <CreatorCard submission={submission} />
          <RightsAcceptedCard submission={submission} />
        </div>
      </div>

      <RejectDialog
        open={dialog === "reject"}
        onOpenChange={(open) => !open && setDialog(null)}
        submission={submission}
        analysis={a}
        currentMs={Math.round(player.getState().timeMs)}
        onSubmit={(payload) => {
          setDialog(null);
          rejectVideo(submission, payload);
          afterDecision();
        }}
      />
      <ChangesDialog
        open={dialog === "changes"}
        onOpenChange={(open) => !open && setDialog(null)}
        submission={submission}
        analysis={a}
        currentMs={Math.round(player.getState().timeMs)}
        onSubmit={(payload) => {
          setDialog(null);
          requestChanges(submission, payload);
          afterDecision();
        }}
      />
      <DuplicateOverrideDialog
        open={dialog === "override"}
        onOpenChange={(open) => !open && setDialog(null)}
        submission={submission}
        onSubmit={(reason) => {
          setDialog(null);
          approveVideos([submission], reason);
          afterDecision();
        }}
      />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} screen="focus" />
    </div>
  );
}

function NavArrow({ href, label, keyHint, icon }: { href: string | undefined; label: string; keyHint: string; icon: ReactNode }) {
  const cls = buttonVariants({ variant: "plain", size: "sm", iconOnly: true });
  if (!href) {
    return (
      <span aria-label={`${label} (none)`} className={cn(cls, "pointer-events-none opacity-40")}>
        {icon}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={`${label}, shortcut ${keyHint}`} className={cls}>
      {icon}
    </Link>
  );
}

interface ActionBarProps {
  submission: SubmissionView;
  canDecide: boolean;
  held: boolean;
  inReview: boolean;
  onApprove: () => void;
  onChanges: () => void;
  onReject: () => void;
}

/** The decisions, pinned under the shell's top bar while the evidence scrolls beneath, so a reviewer never has to hunt for them. */
function ActionBar({ submission, canDecide, held, inReview, onApprove, onChanges, onReject }: ActionBarProps) {
  return (
    <Glass layer={2} role="group" aria-label="Decide" className="sticky top-[4.75rem] z-(--fd-z-raised) flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-[22px] px-3.5 py-2.5">
      <div className="grid min-w-0 gap-0.5">
        <p className="truncate text-body-sm font-semibold text-fg">Your decision on @{submission.creator.handle}&rsquo;s video</p>
        {canDecide ? (
          <p className="hidden truncate text-caption text-fg-subtle sm:block">The creator is paid when views clear. Every decision has 10 seconds to undo.</p>
        ) : (
          <Reason>{held ? "Your decision is on hold for 10 seconds." : inReview ? "Not available." : "This video has already been decided."}</Reason>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" leadingIcon={<RotateCcw />} disabled={!canDecide} aria-keyshortcuts="F" onClick={onChanges}>
          Request changes
          <Kbd size="sm">F</Kbd>
        </Button>
        <Button variant="danger" size="sm" leadingIcon={<X />} disabled={!canDecide} aria-keyshortcuts="R" onClick={onReject}>
          Reject
          <Kbd size="sm">R</Kbd>
        </Button>
        <Button variant="primary" size="sm" leadingIcon={<Check />} disabled={!canDecide} aria-keyshortcuts="A" onClick={onApprove}>
          Approve
          <Kbd size="sm" className="bg-white/20 text-on-accent shadow-none">A</Kbd>
        </Button>
      </div>
    </Glass>
  );
}

/** What happened to a video that is no longer waiting: the decision, who made it, how fast, and the reason when there is one. */
function DecidedBanner({ submission }: { submission: SubmissionView }) {
  const d = submission.decision;
  const meta = SUBMISSION_STATUS_META[submission.status];
  const action = d ? DECISION_ACTION_META[d.action] : undefined;
  const tone = (action?.tone ?? meta.tone) as Tone;
  return (
    <Callout tone={tone === "neutral" ? "info" : tone} title={action ? `${action.label} ${formatDateTime(d?.decided_at)}` : meta.label}>
      <p>{d?.summary ?? meta.meaning}</p>
      {d?.reason_code ? (
        <p className="mt-1">
          Reason: <span className="font-medium text-fg">{REASON_CODE_META[d.reason_code].label}</span>
          {d.evidence ? <span className="text-fg-subtle"> · {d.evidence.kind === "timecode" || d.evidence.t_ms !== undefined ? `at ${tc(d.evidence.t_ms ?? 0)}` : d.evidence.ref}</span> : null}
        </p>
      ) : null}
      {submission.appeal ? (
        <p className="mt-1">
          <Badge size="sm" tone="ember">
            Appeal {submission.appeal.status.replace(/_/g, " ")}
          </Badge>
        </p>
      ) : null}
    </Callout>
  );
}
