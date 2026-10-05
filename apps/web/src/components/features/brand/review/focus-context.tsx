"use client";

import type { ReactNode } from "react";
import { ArrowRight, Check, Minus, X } from "lucide-react";
import { BEAT_ID_META, SUBMISSION_STATUS_META, type QaCheckType, type VideoAnalysis } from "@/lib/contract/types";
import { useSubmissions } from "@/lib/data";
import type { SubmissionView } from "@/lib/data/selectors";
import { rightsLines } from "@/lib/engine";
import { formatPct, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DomainStatusPill, TierBadge } from "@/components/brand";
import { GlassCard } from "@/components/glass/glass";
import { Badge, type Tone } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NoteRow } from "./notes";
import { QaGlyph } from "./parts";
import { usePlayerState, type Player } from "./player";
import { QA_LABEL } from "./reasons";
import { tc, tcPrecise } from "./timecode";

function TimeChip({ ms, onSeek }: { ms: number; onSeek: (ms: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSeek(ms)}
      aria-label={`Jump to ${tc(ms)}`}
      className="inline-flex h-6 shrink-0 items-center rounded-md bg-surface-active px-2 text-caption font-semibold text-fg tabular-nums transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-accent-soft hover:text-accent"
    >
      {tc(ms)}
    </button>
  );
}

// ── transcript, beats, disclosure ──────────────────────────────────────────────────────────────

const SHOWN_CHECKS: readonly { check: QaCheckType; short: string }[] = [
  { check: "disclosure_audio", short: "Spoken #ad" },
  { check: "disclosure_onscreen", short: "On-screen #ad" },
  { check: "music_licence", short: "Music" },
  { check: "ai_content", short: "AI label" },
  { check: "banned_claims", short: "Claims" },
  { check: "duplicate", short: "Duplicate" },
];

function TranscriptLines({ player, analysis, onSeek }: { player: Player; analysis: VideoAnalysis; onSeek: (ms: number) => void }) {
  const { timeMs } = usePlayerState(player);
  return (
    <ol className="grid gap-1" aria-label="Transcript">
      {analysis.transcript.map((line) => {
        const current = timeMs >= line.t_start_ms && timeMs < line.t_end_ms;
        const beats = analysis.beats.filter((b) => b.found && b.t_ms !== undefined && b.t_ms >= line.t_start_ms && b.t_ms < line.t_end_ms);
        return (
          <li key={line.t_start_ms}>
            <button
              type="button"
              onClick={() => onSeek(line.t_start_ms)}
              aria-current={current ? "true" : undefined}
              className={cn("grid w-full grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-3 rounded-xl px-3 py-2 text-left transition-colors duration-(--fd-dur-instant) ease-standard", current ? "bg-accent-soft" : "hover:bg-surface-hover")}
            >
              <span className="pt-0.5 text-caption font-semibold text-fg-subtle tabular-nums">{tcPrecise(line.t_start_ms)}</span>
              <span className="grid gap-1">
                <span className="text-body-sm text-fg">{line.text}</span>
                {beats.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {beats.map((b) => (
                      <Badge key={b.beat} size="sm" tone={BEAT_ID_META[b.beat].tone as Tone} variant="outline">
                        {BEAT_ID_META[b.beat].label}
                      </Badge>
                    ))}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export interface TranscriptCardProps {
  player: Player;
  analysis?: VideoAnalysis;
  loading: boolean;
  onSeek: (ms: number) => void;
}

/** What is said and shown: the transcript with the beats ticked off, and the disclosure, music, AI and claims checks at a glance. */
export function TranscriptCard({ player, analysis, loading, onSeek }: TranscriptCardProps) {
  const required = analysis?.beats.filter((b) => b.required) ?? [];
  const found = required.filter((b) => b.found).length;
  return (
    <GlassCard padding="lg" className="grid scroll-mt-40 gap-5" id="transcript">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-title-md text-fg">Transcript and beats</h2>
        {analysis ? (
          <p className="text-body-sm text-fg-muted tabular-nums">
            {found} of {required.length} required beats found
          </p>
        ) : null}
      </header>
      {analysis ? (
        <>
          <ul className="flex flex-wrap gap-1.5" aria-label="Disclosure, music, AI and claims">
            {SHOWN_CHECKS.map(({ check, short }) => {
              const c = analysis.checks.find((x) => x.check === check);
              if (!c) return null;
              return (
                <li key={check} title={`${QA_LABEL[check]}: ${c.message}`}>
                  <Badge tone={c.result === "pass" ? "mint" : c.result === "warn" ? "ember" : "rose"} variant="soft" icon={<QaGlyph result={c.result} className="size-3.5 text-current" />}>
                    <span className="sr-only">{`${QA_LABEL[check]}: ${c.result}. ${c.message} `}</span>
                    <span aria-hidden="true">{short}</span>
                    {c.evidence?.t_ms !== undefined ? <span aria-hidden="true" className="font-medium opacity-80">{tc(c.evidence.t_ms)}</span> : null}
                  </Badge>
                </li>
              );
            })}
          </ul>
          <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Beats the brief asks for">
            {analysis.beats.map((b) => (
              <li key={b.beat} className="flex items-center gap-2.5 rounded-xl bg-surface-field px-3 py-2">
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", b.found ? "bg-mint-soft text-mint" : b.required ? "bg-rose-soft text-rose" : "bg-surface-active text-fg-subtle")}>
                  {b.found ? <Check aria-hidden="true" className="size-3" strokeWidth={3} /> : b.required ? <X aria-hidden="true" className="size-3" strokeWidth={3} /> : <Minus aria-hidden="true" className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 text-body-sm text-fg">
                  {BEAT_ID_META[b.beat].label}
                  <span className="text-caption text-fg-subtle">{b.required ? " · required" : " · optional"}</span>
                </span>
                <span className="sr-only">{b.found ? "found" : "missing"}</span>
                {b.found && b.t_ms !== undefined ? <TimeChip ms={b.t_ms} onSeek={onSeek} /> : <span className="text-caption text-fg-subtle">{b.required ? "Missing" : "Not used"}</span>}
              </li>
            ))}
          </ul>
          <TranscriptLines player={player} analysis={analysis} onSeek={onSeek} />
        </>
      ) : loading ? (
        <div className="grid gap-2" aria-hidden="true">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <p className="text-body-sm text-fg-muted">The transcript for this version is not ready yet.</p>
      )}
    </GlassCard>
  );
}

// ── the creator ────────────────────────────────────────────────────────────────────────────────

/** A creator's record with this brand: approved, not approved, and the rest, from decided submissions. */
function useHistoryWithBrand(creatorId: string): { approved: number; rejected: number; other: number; total: number } {
  const decided = useSubmissions({ creator: creatorId, brand: "mine", status: "decided" });
  const approved = decided.filter((s) => s.status === "posted" || s.status === "released").length;
  const rejected = decided.filter((s) => s.status === "rejected").length;
  return { approved, rejected, other: decided.length - approved - rejected, total: decided.length };
}

export function CreatorCard({ submission }: { submission: SubmissionView }) {
  const c = submission.creator;
  const rep = submission.reputation;
  const history = useHistoryWithBrand(c.id);
  return (
    <GlassCard padding="lg" className="grid scroll-mt-40 gap-5" id="creator">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="font-display text-title-md text-fg">@{c.handle}</h2>
          <p className="text-body-sm text-fg-muted">
            {c.display_name} · {c.country} · {c.niches.join(", ")}
          </p>
        </div>
        <TierBadge tier={c.tier} size={40} label />
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat label="Reliability" value={submission.reliability ? (submission.reliability.kind === "verdict" ? String(submission.reliability.score) : `${submission.reliability.low} to ${submission.reliability.high}`) : "None yet"} hint={submission.reliability?.kind === "range" ? "building history" : "recency-weighted"} />
        <Stat label="Approval rate" value={c.decided_count > 0 ? formatPct(c.approval_rate, 0) : "None yet"} hint={`${c.approved_count} of ${c.decided_count} decided`} />
        <Stat label="Posts" value={String(c.posts_count)} hint={`${c.live_posts_count} live now`} />
        <Stat label="With you" value={history.total === 0 ? "First time" : `${history.approved} of ${history.total}`} hint={history.total === 0 ? "no earlier videos" : `approved${history.rejected > 0 ? `, ${history.rejected} not approved` : ""}`} />
      </dl>

      {rep ? (
        <div className="grid gap-2">
          <h3 className="text-body-sm font-semibold text-fg">Why that reliability</h3>
          {rep.provisional ? (
            <p className="rounded-xl bg-surface-field px-3.5 py-3 text-body-sm text-fg-muted">
              Building history: {rep.finished_n} of 5 finished posts so far. You see a range until the fifth decision, and work for other brands is never held against a creator.
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {rep.components.map((comp) => (
                <li key={comp.key} className="flex items-baseline justify-between gap-4 rounded-xl bg-surface-field px-3.5 py-2">
                  <span className="text-body-sm text-fg">{comp.label}</span>
                  <span className="text-caption text-fg-muted">{comp.reason}</span>
                </li>
              ))}
            </ul>
          )}
          {rep.fraud_flags_90d > 0 || rep.clawbacks_90d > 0 || rep.disputes_lost_90d > 0 ? (
            <p className="text-caption text-ember">
              Last 90 days: {rep.fraud_flags_90d} fraud {rep.fraud_flags_90d === 1 ? "flag" : "flags"}, {rep.clawbacks_90d} {rep.clawbacks_90d === 1 ? "clawback" : "clawbacks"}, {rep.disputes_lost_90d} {rep.disputes_lost_90d === 1 ? "dispute" : "disputes"} lost.
            </p>
          ) : (
            <p className="text-caption text-fg-subtle">No fraud flags, clawbacks or lost disputes in the last 90 days.</p>
          )}
        </div>
      ) : null}
    </GlassCard>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="font-display text-title-sm text-fg tabular-nums">{value}</dd>
      {hint ? <dd className="text-caption text-fg-subtle">{hint}</dd> : null}
    </div>
  );
}

// ── v1 / v2 ────────────────────────────────────────────────────────────────────────────────────

function Delta({ before, after, better, unit = "" }: { before: number; after: number; better: "up" | "down"; unit?: string }) {
  const same = before === after;
  const improved = better === "up" ? after > before : after < before;
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span className="text-fg-subtle">
        {before}
        {unit}
      </span>
      <ArrowRight aria-hidden="true" className="size-3.5 text-fg-subtle" />
      <span className="font-semibold text-fg">
        {after}
        {unit}
      </span>
      <span className="sr-only">{same ? "no change" : improved ? "better" : "worse"}</span>
      <Badge size="sm" tone={same ? "neutral" : improved ? "mint" : "ember"} variant="soft">
        {same ? "Same" : improved ? "Better" : "Worse"}
      </Badge>
    </span>
  );
}

export interface VersionDiffCardProps {
  submission: SubmissionView;
  versions: readonly VideoAnalysis[];
  onSeek: (ms: number) => void;
}

/** What changed since the last version: scores, checks, timing, the creator's own summary, and which of your must-fix notes got fixed. */
export function VersionDiffCard({ submission, versions, onSeek }: VersionDiffCardProps) {
  const current = versions.find((v) => v.version === submission.version);
  const previous = versions.find((v) => v.version === submission.version - 1);
  const prevVersion = submission.versions[submission.version - 2];
  const nowVersion = submission.current;
  if (submission.version < 2 || !prevVersion) return null;
  const carried = submission.notes.filter((n) => n.version < submission.version && n.severity === "must_fix");
  const rows: { label: string; node: ReactNode }[] = [
    { label: "Hook Score", node: <Delta before={prevVersion.hook_points} after={nowVersion.hook_points} better="up" /> },
    { label: "Flow Score", node: <Delta before={prevVersion.flow_points} after={nowVersion.flow_points} better="up" /> },
    { label: "Checks that fail", node: <Delta before={prevVersion.qa_fail} after={nowVersion.qa_fail} better="down" /> },
    { label: "Checks with a warning", node: <Delta before={prevVersion.qa_warn} after={nowVersion.qa_warn} better="down" /> },
  ];
  if (current && previous) {
    if (current.hook.app_at_ms !== undefined && previous.hook.app_at_ms !== undefined) rows.push({ label: "App on screen at", node: <Delta before={Math.round(previous.hook.app_at_ms / 100) / 10} after={Math.round(current.hook.app_at_ms / 100) / 10} better="down" unit=" s" /> });
    rows.push({ label: "Hook lands at", node: <Delta before={Math.round(previous.hook.lands_at_ms / 100) / 10} after={Math.round(current.hook.lands_at_ms / 100) / 10} better="down" unit=" s" /> });
  }
  return (
    <GlassCard padding="lg" className="grid scroll-mt-40 gap-5" id="versions">
      <header className="grid gap-1">
        <h2 className="font-display text-title-md text-fg">
          Version {submission.version - 1} to version {submission.version}
        </h2>
        <p className="text-body-sm text-fg-muted">{nowVersion.changes_summary ?? "The creator did not describe what changed."}</p>
      </header>
      <dl className="grid gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-surface-field px-3.5 py-2.5">
            <dt className="text-body-sm text-fg">{r.label}</dt>
            <dd className="text-body-sm">{r.node}</dd>
          </div>
        ))}
      </dl>
      {carried.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-body-sm font-semibold text-fg">Your must-fix notes from last time</h3>
          <ul className="grid gap-2">
            {carried.map((n) => (
              <NoteRow key={n.id} t_ms={n.t_ms} t_end_ms={n.t_end_ms} category={n.category} severity={n.severity} body={n.body} status={n.status} version={n.version} onSeek={() => onSeek(n.t_ms)} />
            ))}
          </ul>
        </div>
      ) : null}
    </GlassCard>
  );
}

// ── the licence the creator accepted ───────────────────────────────────────────────────────────

export function RightsAcceptedCard({ submission }: { submission: SubmissionView }) {
  const lines = rightsLines(submission.rights_card);
  return (
    <GlassCard padding="lg" className="grid scroll-mt-40 gap-4" id="rights">
      <header className="grid gap-1">
        <h2 className="font-display text-title-md text-fg">The licence they accepted</h2>
        <p className="text-body-sm text-fg-muted">A snapshot from the moment they submitted {formatRelative(submission.rights_accepted_at)}. Later edits to the bounty never change it.</p>
      </header>
      <dl className="grid gap-1.5 sm:grid-cols-2">
        {lines.map((l) => (
          <div key={l.id} className={cn("grid gap-0.5 rounded-xl bg-surface-field px-3.5 py-2.5", l.notable && "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-sun)_35%,transparent)]")}>
            <dt className="text-caption text-fg-subtle">{l.label}</dt>
            <dd className="text-body-sm font-medium text-fg">{l.value}</dd>
          </div>
        ))}
      </dl>
    </GlassCard>
  );
}

/** The status of a submission that is no longer waiting, as a pill. */
export function StatusOfSubmission({ status }: { status: keyof typeof SUBMISSION_STATUS_META }) {
  return <DomainStatusPill meta={SUBMISSION_STATUS_META[status]} />;
}
