"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, NotebookPen } from "lucide-react";
import type { QaCheck, QaResult, ScoreCard, ScoreItem, VideoAnalysis } from "@/lib/contract/types";
import { cn } from "@/lib/utils";
import { ScoreRing } from "@/components/charts";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/components/ui/toast";
import { QaGlyph, CHECKLIST_NOTE } from "./parts";
import { categoryForCheck, categoryForScoreItem, QA_LABEL, scoreItemTime } from "./reasons";
import { addDraftNote } from "./session-state";
import { tc } from "./timecode";

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

interface ScoreBlockProps {
  name: "Hook Score" | "Flow Score";
  card: ScoreCard;
  analysis: VideoAnalysis;
  submissionId: string;
  onSeek: (ms: number) => void;
}

function ScoreBlock({ name, card, analysis, submissionId, onSeek }: ScoreBlockProps) {
  const [all, setAll] = useState(false);
  const failing = card.items.filter((i) => !i.passed || i.points < i.max);
  const passing = card.items.filter((i) => i.passed && i.points >= i.max);
  const shown: ScoreItem[] = all ? [...failing, ...passing] : failing;

  const noteIt = (item: ScoreItem, at: number | undefined): void => {
    addDraftNote(submissionId, { t_ms: at ?? 0, body: item.fix ?? item.reason, category: categoryForScoreItem(item.id), severity: "suggestion" });
    notify.success("Added to your notes", { description: "A suggestion at " + tc(at ?? 0) + ". Make it a must-fix in the notes panel if it blocks approval." });
  };

  return (
    <div className="grid min-w-0 content-start gap-4">
      <div className="flex items-center gap-4">
        <ScoreRing name={name} score={card.points} size={112} checklist={false} />
        <div className="grid gap-1">
          <h3 className="font-display text-title-sm text-fg">{name}</h3>
          <p className="text-caption text-fg-subtle">{name === "Hook Score" ? "The first 3 seconds" : "The whole video"}</p>
          <p className="text-caption font-medium text-fg-muted">{failing.length === 0 ? "Every line is full marks" : `${failing.length} ${failing.length === 1 ? "line" : "lines"} lost points`}</p>
        </div>
      </div>
      <ul className="grid gap-1.5">
        {shown.map((item) => {
          const at = scoreItemTime(item.id, analysis);
          const lost = item.points < item.max;
          return (
            <li key={item.id} className="grid gap-1.5 rounded-xl bg-surface-field px-3.5 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-body-sm font-medium text-fg">{item.label}</p>
                <span className={cn("shrink-0 text-caption font-semibold tabular-nums", lost ? "text-ember" : "text-mint")}>
                  {item.points} / {item.max}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                {at !== undefined ? <TimeChip ms={at} onSeek={onSeek} /> : null}
                <p className="min-w-0 flex-1 text-caption text-fg-muted">{item.reason}</p>
              </div>
              {item.fix && lost ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-caption text-fg-subtle">Fix: {item.fix}</p>
                  <Button size="xs" variant="plain" leadingIcon={<NotebookPen />} onClick={() => noteIt(item, at)}>
                    Note it
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {passing.length > 0 ? (
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="inline-flex items-center gap-1.5 justify-self-start rounded-md px-1 py-0.5 text-caption font-medium text-accent hover:underline">
          <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-(--fd-dur-fast)", all && "rotate-180")} />
          {all ? "Hide the full-marks lines" : `Show ${passing.length} full-marks ${passing.length === 1 ? "line" : "lines"}`}
        </button>
      ) : null}
    </div>
  );
}

export interface ScoresCardProps {
  analysis?: VideoAnalysis;
  loading: boolean;
  submissionId: string;
  onSeek: (ms: number) => void;
}

/** Hook Score and Flow Score, with the reason for every lost point, the moment it points at, and a one-click way to turn it into a note. */
export function ScoresCard({ analysis, loading, submissionId, onSeek }: ScoresCardProps) {
  return (
    <GlassCard padding="lg" className="grid scroll-mt-40 gap-5" id="scores">
      <header className="grid gap-1">
        <h2 className="font-display text-title-md text-fg">Hook Score and Flow Score</h2>
        <p className="text-body-sm text-fg-muted">{CHECKLIST_NOTE} Use the reasons as evidence, not as a verdict: you decide against your brief.</p>
      </header>
      {analysis ? (
        <div className="grid gap-8 sm:grid-cols-2">
          <ScoreBlock name="Hook Score" card={analysis.hook_score} analysis={analysis} submissionId={submissionId} onSeek={onSeek} />
          <ScoreBlock name="Flow Score" card={analysis.flow_score} analysis={analysis} submissionId={submissionId} onSeek={onSeek} />
        </div>
      ) : loading ? (
        <div className="grid gap-6 sm:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <p className="text-body-sm text-fg-muted">The scores for this version are not ready yet.</p>
      )}
    </GlassCard>
  );
}

const ORDER: Record<QaResult, number> = { fail: 0, warn: 1, pass: 2 };

export interface QaCardProps {
  analysis?: VideoAnalysis;
  loading: boolean;
  submissionId: string;
  onSeek: (ms: number) => void;
}

/** All the automated checks for this version. Failures and warnings lead; each seeks to its moment and can become a note. */
export function QaCard({ analysis, loading, submissionId, onSeek }: QaCardProps) {
  const [showPassing, setShowPassing] = useState(false);
  const checks = analysis ? [...analysis.checks].sort((a, b) => ORDER[a.result] - ORDER[b.result] || (a.evidence?.t_ms ?? 1e9) - (b.evidence?.t_ms ?? 1e9)) : [];
  const flagged = checks.filter((c) => c.result !== "pass");
  const passing = checks.filter((c) => c.result === "pass");
  const fails = checks.filter((c) => c.result === "fail").length;
  const warns = checks.filter((c) => c.result === "warn").length;

  const noteIt = (check: QaCheck): void => {
    const at = check.evidence?.t_ms ?? 0;
    addDraftNote(submissionId, { t_ms: at, body: check.message, category: categoryForCheck(check.check), severity: check.result === "fail" ? "must_fix" : "suggestion" });
    notify.success("Added to your notes", { description: `${check.result === "fail" ? "A must-fix" : "A suggestion"} at ${tc(at)}.` });
  };

  const row = (check: QaCheck): ReactNode => (
    <li key={check.check} className="flex items-start gap-3 rounded-xl bg-surface-field px-3.5 py-2.5">
      <QaGlyph result={check.result} className="mt-0.5 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="text-body-sm font-medium text-fg">{QA_LABEL[check.check]}</p>
          {check.blocks_settlement && check.result === "fail" ? (
            <Badge size="sm" tone="rose">
              Holds settlement until fixed or waived
            </Badge>
          ) : null}
        </div>
        <p className="text-caption text-fg-muted">{check.message}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {check.evidence?.t_ms !== undefined ? <TimeChip ms={check.evidence.t_ms} onSeek={onSeek} /> : null}
        {check.result !== "pass" ? (
          <Button size="xs" variant="plain" leadingIcon={<NotebookPen />} onClick={() => noteIt(check)}>
            Note it
          </Button>
        ) : null}
      </div>
    </li>
  );

  return (
    <GlassCard padding="lg" className="grid scroll-mt-40 gap-5" id="checks">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-title-md text-fg">Automated checks</h2>
        {analysis ? (
          <p className="text-body-sm text-fg-muted tabular-nums">
            {passing.length} pass · {warns} {warns === 1 ? "warning" : "warnings"} · {fails} {fails === 1 ? "fail" : "fails"}
          </p>
        ) : null}
      </header>
      {analysis ? (
        <>
          {flagged.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-surface-field px-4 py-3.5 text-body-sm text-fg-muted">
              <Check aria-hidden="true" className="size-4 text-mint" strokeWidth={2.5} />
              Every check passes. Only a missing disclosure holds settlement; the rest are for your judgement.
            </p>
          ) : (
            <ul className="grid gap-1.5">{flagged.map(row)}</ul>
          )}
          {passing.length > 0 ? (
            <div className="grid gap-2">
              <button type="button" onClick={() => setShowPassing(!showPassing)} aria-expanded={showPassing} className="inline-flex items-center gap-1.5 justify-self-start rounded-md px-1 py-0.5 text-caption font-medium text-accent hover:underline">
                <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-(--fd-dur-fast)", showPassing && "rotate-180")} />
                {showPassing ? "Hide the passing checks" : `Show ${passing.length} passing checks`}
              </button>
              {showPassing ? <ul className="grid gap-1.5">{passing.map(row)}</ul> : null}
            </div>
          ) : null}
        </>
      ) : loading ? (
        <div className="grid gap-2" aria-hidden="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <p className="text-body-sm text-fg-muted">The checks for this version are not ready yet.</p>
      )}
    </GlassCard>
  );
}
