"use client";

import { useMemo, useState } from "react";
import { REASON_CODE_INFO, REASON_CODE_META, type Evidence, type EvidenceKind, type FeedbackCategory, type ReasonCode, type VideoAnalysis } from "@/lib/contract/types";
import type { SubmissionView } from "@/lib/data/selectors";
import { CONSTANTS, mulRate } from "@/lib/engine";
import { formatMoney } from "@/lib/format";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { NoteComposer, NoteRow, type NoteTimes } from "./notes";
import { flagsFromChecks, type QaFlag } from "./queue-data";
import { briefRequirements, categoryOf, QA_LABEL, rankReasons, type RankedReason } from "./reasons";
import { addDraftNote, removeDraftNote, useDraftNotes, type DraftNote } from "./session-state";
import { parseTimecode, tc, tcPadded, tcPrecise } from "./timecode";


// ── a numbered list of reasons ─────────────────────────────────────────────────────────────────

interface ReasonPickerProps {
  ranked: readonly RankedReason[];
  value: ReasonCode | "";
  onChange: (code: ReasonCode) => void;
  label: string;
  error?: string;
  idPrefix: string;
}

/** The reasons for this video, numbered 1 to 9 (press the number), the flagged ones first. More sit in a menu. */
function ReasonPicker({ ranked, value, onChange, label, error, idPrefix }: ReasonPickerProps) {
  const top = ranked.slice(0, 9);
  const more = ranked.slice(9);
  return (
    <div className="grid gap-2" role="group" aria-labelledby={`${idPrefix}-reason-label`}>
      <div className="flex items-baseline justify-between gap-3">
        <p id={`${idPrefix}-reason-label`} className="text-caption font-semibold text-fg-muted">
          {label}
        </p>
        <p className="text-caption text-fg-subtle">
          Press <Kbd size="sm">1</Kbd> to <Kbd size="sm">9</Kbd>
        </p>
      </div>
      <RadioGroup aria-label={label} value={value} onValueChange={(next) => onChange(next as ReasonCode)} className="gap-0.5 rounded-2xl bg-surface-field p-1.5">
        {top.map((reason, index) => (
          <RadioGroupItem
            key={reason.code}
            id={`${idPrefix}-reason-${reason.code}`}
            value={reason.code}
            label={
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                {REASON_CODE_META[reason.code].label}
                {reason.flagged_by ? (
                  <Badge size="sm" tone="ember">
                    Flagged: {QA_LABEL[reason.flagged_by].toLowerCase()}
                  </Badge>
                ) : null}
              </span>
            }
            description={REASON_CODE_META[reason.code].meaning}
            meta={<Kbd size="sm">{index + 1}</Kbd>}
            className="rounded-xl px-2.5 hover:bg-surface-hover"
          />
        ))}
      </RadioGroup>
      {more.length > 0 ? (
        <Select
          size="sm"
          aria-label="More reasons"
          placeholder="More reasons"
          value={more.some((r) => r.code === value) ? value : undefined}
          onValueChange={(next) => onChange(next as ReasonCode)}
          options={more.map((r) => ({ value: r.code, label: REASON_CODE_META[r.code].label, description: REASON_CODE_META[r.code].meaning }))}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-caption font-medium text-rose">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function WhatCreatorSees({ handle, code }: { handle: string; code: ReasonCode | "" }) {
  if (!code) return null;
  const info = REASON_CODE_INFO[code];
  return (
    <Callout tone="neutral" title={`What @${handle} sees`} icon={null}>
      <p>{info.creator_copy}</p>
      <p className="mt-1 text-fg-subtle">{info.fix_hint}</p>
    </Callout>
  );
}

// ── reject ─────────────────────────────────────────────────────────────────────────────────────

export interface RejectPayload {
  reason_code: ReasonCode;
  evidence: Evidence;
  summary?: string;
}

interface DecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: SubmissionView | undefined;
  analysis: VideoAnalysis | undefined;
  /** The player's time when the dialog opened: the default moment for evidence and notes. */
  currentMs?: number;
}

export interface RejectDialogProps extends DecisionDialogProps {
  onSubmit: (payload: RejectPayload) => void;
}

/**
 * Reject. The reason code and the evidence are mandatory (the store refuses without them): a rejection must name the requirement the
 * video missed and point at where. Calm by design: plain words, what the creator will read, and a 10-second undo after.
 */
export function RejectDialog({ open, onOpenChange, submission, analysis, currentMs = 0, onSubmit }: RejectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" instant>
        {submission ? <RejectForm key={submission.id} submission={submission} analysis={analysis} currentMs={currentMs} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RejectForm({ submission, analysis, currentMs, onCancel, onSubmit }: { submission: SubmissionView; analysis: VideoAnalysis | undefined; currentMs: number; onCancel: () => void; onSubmit: (payload: RejectPayload) => void }) {
  const handle = submission.creator.handle;
  const flags = useMemo(() => flagsFromChecks(analysis?.checks ?? []), [analysis]);
  const ranked = useMemo(() => rankReasons(flags, "reject"), [flags]);
  const requirements = useMemo(() => briefRequirements(submission.bounty.brief), [submission.bounty.brief]);

  const [reason, setReason] = useState<ReasonCode | "">("");
  const [kind, setKind] = useState<Exclude<EvidenceKind, "transcript">>(flags.length > 0 ? "qa_check" : "timecode");
  const [qaRef, setQaRef] = useState<string>(flags[0]?.check ?? "");
  const [time, setTime] = useState<string>(tcPrecise(flags[0]?.t_ms ?? currentMs));
  const [briefRef, setBriefRef] = useState<string>(requirements[0]?.value ?? "");
  const [summary, setSummary] = useState("");
  const [errors, setErrors] = useState<{ reason?: string; evidence?: string }>({});

  // Picking a reason that a QA check usually detects selects that check as the evidence.
  const pick = (code: ReasonCode): void => {
    setReason(code);
    const check = REASON_CODE_INFO[code].qa_check;
    const match = check ? flags.find((f) => f.check === check) : undefined;
    if (match) {
      setKind("qa_check");
      setQaRef(match.check);
      if (match.t_ms !== undefined) setTime(tcPrecise(match.t_ms));
    }
    setErrors((e) => ({ ...e, reason: undefined }));
  };

  useHotkeys(
    Object.fromEntries(ranked.slice(0, 9).map((r, index) => [String(index + 1), () => pick(r.code)] as const)),
    { enabled: true },
  );

  const submit = (): void => {
    const next: { reason?: string; evidence?: string } = {};
    if (!reason) next.reason = "Pick a reason. A rejection has to say which requirement the video missed.";
    let evidence: Evidence | undefined;
    if (kind === "qa_check") {
      const flag: QaFlag | undefined = flags.find((f) => f.check === qaRef);
      if (!flag) next.evidence = "Pick the check that failed, or point at a moment in the video.";
      else evidence = { kind: "qa_check", ref: flag.check, excerpt: flag.message, ...(flag.t_ms !== undefined ? { t_ms: flag.t_ms } : {}) };
    } else if (kind === "timecode") {
      const ms = parseTimecode(time);
      if (ms === null || ms > submission.current.video.duration_ms) next.evidence = `Enter a time inside the video, like 0:18 (it runs ${tc(submission.current.video.duration_ms)}).`;
      else evidence = { kind: "timecode", ref: tcPadded(ms), t_ms: ms };
    } else if (!briefRef.trim()) {
      next.evidence = "Pick the line of the brief the video misses.";
    } else {
      evidence = { kind: "brief_requirement", ref: briefRef.trim() };
    }
    setErrors(next);
    if (next.reason || next.evidence || !reason || !evidence) return;
    onSubmit({ reason_code: reason, evidence, ...(summary.trim() ? { summary: summary.trim() } : {}) });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Not approving this video</DialogTitle>
        <DialogDescription>
          Name the requirement it missed and where. @{handle} reads this, can fix it and resubmit, and can appeal once. A rejection is final after 10 seconds.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-5">
        <ReasonPicker idPrefix="reject" ranked={ranked} value={reason} onChange={pick} label="Why" error={errors.reason} />

        <div className="grid gap-3">
          <p className="text-caption font-semibold text-fg-muted">Evidence</p>
          <SegmentedControl
            aria-label="What the evidence points at"
            size="sm"
            value={kind}
            onValueChange={(next) => {
              setKind(next);
              setErrors((e) => ({ ...e, evidence: undefined }));
            }}
            options={[
              { value: "qa_check", label: "A check", disabled: flags.length === 0 },
              { value: "timecode", label: "A moment" },
              { value: "brief_requirement", label: "A brief line" },
            ]}
          />
          {kind === "qa_check" ? (
            <Field label="Check that failed" error={errors.evidence}>
              <Select
                size="sm"
                value={qaRef}
                onValueChange={setQaRef}
                options={flags.map((f) => ({ value: f.check, label: `${QA_LABEL[f.check]}${f.t_ms !== undefined ? ` at ${tc(f.t_ms)}` : ""}`, description: f.message }))}
              />
            </Field>
          ) : kind === "timecode" ? (
            <Field label="Moment" error={errors.evidence} hint={errors.evidence ? undefined : `The video runs ${tc(submission.current.video.duration_ms)}.`}>
              <Input size="sm" value={time} inputMode="decimal" autoComplete="off" placeholder="0:18" onChange={(event) => setTime(event.target.value)} />
            </Field>
          ) : (
            <Field label="Line of the brief" error={errors.evidence}>
              <Select size="sm" value={briefRef} onValueChange={setBriefRef} options={requirements.map((r) => ({ value: r.value, label: r.label }))} />
            </Field>
          )}
        </div>

        <WhatCreatorSees handle={handle} code={reason} />

        <Field label="A word for the creator" optional hint="About the video, never the person.">
          <Textarea rows={2} maxLength={280} showCount value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Add the offer in the last five seconds and resubmit." />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Keep in the queue
        </Button>
        <Button variant="danger" onClick={submit}>
          Reject video
        </Button>
      </DialogFooter>
    </>
  );
}

// ── request changes ────────────────────────────────────────────────────────────────────────────

export interface ChangesPayload {
  notes: DraftNote[];
  reason_code?: ReasonCode;
  summary?: string;
}

export interface ChangesDialogProps extends DecisionDialogProps {
  onSubmit: (payload: ChangesPayload) => void;
}

/**
 * Request changes. At least one must-fix note with a timecode, so the creator knows exactly what to change. Two revision rounds are
 * included; a third is paid by the brand, and the dialog says so before it costs anything.
 */
export function ChangesDialog({ open, onOpenChange, submission, analysis, currentMs = 0, onSubmit }: ChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" instant>
        {submission ? <ChangesForm key={submission.id} submission={submission} analysis={analysis} currentMs={currentMs} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ChangesForm({ submission, analysis, currentMs, onCancel, onSubmit }: { submission: SubmissionView; analysis: VideoAnalysis | undefined; currentMs: number; onCancel: () => void; onSubmit: (payload: ChangesPayload) => void }) {
  const handle = submission.creator.handle;
  const duration = submission.current.video.duration_ms;
  const drafts = useDraftNotes(submission.id);
  const flags = useMemo(() => flagsFromChecks(analysis?.checks ?? []), [analysis]);
  const ranked = useMemo(() => rankReasons(flags, "changes"), [flags]);
  const [times, setTimes] = useState<NoteTimes>({ start: tcPrecise(flags[0]?.t_ms ?? currentMs), end: "" });
  const [reason, setReason] = useState<ReasonCode | "">("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string>();
  const category: FeedbackCategory = reason ? categoryOf(reason) : flags[0] ? "disclosure" : "hook";

  const fee = CONSTANTS.pay.extra_revision_pay_cents;
  const platformFee = mulRate(fee, submission.bounty.take_rate);
  const extraRound = submission.rounds_left === 0;
  const mustFix = drafts.filter((n) => n.severity === "must_fix").length;

  const submit = (): void => {
    if (mustFix === 0) {
      setError(`Add at least one must-fix note with a timecode so @${handle} knows exactly what to change.`);
      return;
    }
    setError(undefined);
    onSubmit({ notes: [...drafts], ...(reason ? { reason_code: reason } : {}), ...(summary.trim() ? { summary: summary.trim() } : {}) });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Request changes</DialogTitle>
        <DialogDescription>
          Each note points at a moment. Must-fix notes carry to the next version until @{handle} ticks them off. Round {submission.revision_round + 1}
          {submission.rounds_left > 0 ? `, ${submission.rounds_left} of ${CONSTANTS.review.revision_rounds_included} free rounds left.` : "."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-5">
        {extraRound ? (
          <Callout tone="sun" title={`This round costs ${formatMoney(fee + platformFee)}`}>
            Both included revision rounds are used. A third round pays @{handle} {formatMoney(fee)} for the extra work, plus the {formatMoney(platformFee)} platform fee. Approving or rejecting costs nothing extra.
          </Callout>
        ) : null}

        <div className="grid gap-2.5">
          <p className="text-caption font-semibold text-fg-muted">
            Notes <span className="font-normal text-fg-subtle">({drafts.length === 0 ? "none yet" : `${drafts.length}, ${mustFix} must fix`})</span>
          </p>
          {drafts.length > 0 ? (
            <ul className="grid gap-2" aria-label="Notes to send">
              {drafts.map((n) => (
                <NoteRow key={n.id} t_ms={n.t_ms} t_end_ms={n.t_end_ms} category={n.category} severity={n.severity} body={n.body} onRemove={() => removeDraftNote(submission.id, n.id)} />
              ))}
            </ul>
          ) : null}
          {error ? (
            <p role="alert" className="text-caption font-medium text-rose">
              {error}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl bg-surface-field p-4">
          <NoteComposer idPrefix="changes" durationMs={duration} getNowMs={() => currentMs} times={times} onTimesChange={setTimes} defaultCategory={category} onAdd={(note) => addDraftNote(submission.id, note)} />
        </div>

        {ranked.length > 0 ? (
          <Field label="Main reason" optional hint="Shown to the creator beside your notes.">
            <Select
              size="sm"
              placeholder="Pick the closest reason"
              value={reason || undefined}
              onValueChange={(next) => setReason(next as ReasonCode)}
              options={ranked.map((r) => ({ value: r.code, label: REASON_CODE_META[r.code].label, description: REASON_CODE_META[r.code].meaning }))}
            />
          </Field>
        ) : null}
        <Field label="A word for the creator" optional>
          <Textarea rows={2} maxLength={280} showCount value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Strong hook. Two small fixes and this is ready." />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Keep in the queue
        </Button>
        <Button variant="primary" onClick={submit}>
          Request changes
        </Button>
      </DialogFooter>
    </>
  );
}

// ── approving a likely duplicate ───────────────────────────────────────────────────────────────

export interface DuplicateOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: SubmissionView | undefined;
  onSubmit: (reason: string) => void;
}

/** A proven duplicate needs an override reason to approve (AC-15). The reason is saved with the decision. */
export function DuplicateOverrideDialog({ open, onOpenChange, submission, onSubmit }: DuplicateOverrideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" instant>
        {submission ? <OverrideForm key={submission.id} submission={submission} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function OverrideForm({ submission, onCancel, onSubmit }: { submission: SubmissionView; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const distance = submission.fraud_evidence.phash_distance;
  const submit = (): void => {
    if (reason.trim().length < 10) {
      setError("Say why this is fine to approve, in a sentence. It is saved with the decision.");
      return;
    }
    onSubmit(reason.trim());
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>This video matches another one</DialogTitle>
        <DialogDescription>
          It looks like an earlier submission{distance !== undefined ? ` (hash distance ${distance}, where 0 is identical)` : ""}. A reason is needed to approve it, and it is saved with your decision.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <Field label="Why approve it" error={error}>
          <Textarea rows={3} maxLength={280} showCount value={reason} onChange={(event) => setReason(event.target.value)} placeholder="The creator re-shot the same script with a new opening." />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Keep in the queue
        </Button>
        <Button variant="primary" onClick={submit}>
          Approve with this reason
        </Button>
      </DialogFooter>
    </>
  );
}
