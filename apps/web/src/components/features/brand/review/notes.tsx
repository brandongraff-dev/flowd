"use client";

import { useId, useState, type Ref } from "react";
import { CircleCheck, Plus, X } from "lucide-react";
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_META, type FeedbackCategory, type FeedbackSeverity, type FeedbackStatus } from "@/lib/contract/types";
import { cn } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DraftNote } from "./session-state";
import { parseTimecode, tc, tcPrecise, tcRange } from "./timecode";

export interface NoteTimes {
  start: string;
  end: string;
}

export interface NoteComposerProps {
  durationMs: number;
  /** The player's current time, read when "Now" is pressed. */
  getNowMs: () => number;
  times: NoteTimes;
  onTimesChange: (times: NoteTimes) => void;
  /** Category the next note starts with (a chosen reason can set it). */
  defaultCategory?: FeedbackCategory;
  onAdd: (note: Omit<DraftNote, "id">) => void;
  /** Lets the page focus the text box (the C key). */
  textareaRef?: Ref<HTMLTextAreaElement>;
  idPrefix?: string;
  className?: string;
}

const CATEGORY_OPTIONS = FEEDBACK_CATEGORIES.map((value) => ({ value, label: FEEDBACK_CATEGORY_META[value].label }));

/**
 * Writes one timecoded note: when (a moment or a range), what kind, how serious, and what should change. About the video, never the
 * person. Must-fix notes carry to the next version until the creator ticks them off.
 */
export function NoteComposer({ durationMs, getNowMs, times, onTimesChange, defaultCategory = "hook", onAdd, textareaRef, idPrefix, className }: NoteComposerProps) {
  const uid = useId();
  const prefix = idPrefix ?? uid;
  const [category, setCategory] = useState<FeedbackCategory>(defaultCategory);
  const [severity, setSeverity] = useState<FeedbackSeverity>("must_fix");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<{ time?: string; body?: string }>({});

  const submit = (): void => {
    const start = parseTimecode(times.start);
    const end = times.end.trim() ? parseTimecode(times.end) : undefined;
    const next: { time?: string; body?: string } = {};
    if (start === null) next.time = "Enter a time like 0:18.";
    else if (start > durationMs) next.time = `The video is ${tc(durationMs)} long.`;
    else if (end === null) next.time = "Enter the end like 0:21, or leave it empty.";
    else if (end !== undefined && end <= start) next.time = "The end must come after the start.";
    if (body.trim().length < 3) next.body = "Say what should change, in a few words.";
    setErrors(next);
    if (next.time || next.body || start === null) return;
    onAdd({ t_ms: start, ...(end !== undefined && end !== null ? { t_end_ms: Math.min(end, durationMs) } : {}), body: body.trim(), category, severity });
    setBody("");
    setErrors({});
  };

  return (
    <div className={cn("grid gap-3", className)}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="At" error={errors.time} hint={errors.time ? undefined : "Where it happens"}>
          <Input
            size="sm"
            value={times.start}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0:18"
            onChange={(event) => onTimesChange({ ...times, start: event.target.value })}
            trailing={
              <button type="button" onClick={() => onTimesChange({ ...times, start: tcPrecise(getNowMs()) })} className="rounded-md px-1.5 py-0.5 text-micro font-semibold text-accent hover:bg-accent-soft">
                Now
              </button>
            }
          />
        </Field>
        <Field label="Until" optional hint="For a span">
          <Input
            size="sm"
            value={times.end}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0:21"
            onChange={(event) => onTimesChange({ ...times, end: event.target.value })}
            trailing={
              <button type="button" onClick={() => onTimesChange({ ...times, end: tcPrecise(getNowMs()) })} className="rounded-md px-1.5 py-0.5 text-micro font-semibold text-accent hover:bg-accent-soft">
                Now
              </button>
            }
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="About">
          <Select size="sm" aria-label="Note category" options={CATEGORY_OPTIONS} value={category} onValueChange={(value) => setCategory(value as FeedbackCategory)} />
        </Field>
        <SegmentedControl
          aria-label="How serious"
          size="sm"
          value={severity}
          onValueChange={setSeverity}
          options={[
            { value: "must_fix", label: "Must fix" },
            { value: "suggestion", label: "Suggestion" },
          ]}
        />
      </div>
      <Field label="What should change" error={errors.body} hint={errors.body ? undefined : "About the video, never the person."}>
        <Textarea
          id={`${prefix}-body`}
          rows={3}
          maxLength={280}
          showCount
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Show the app by 0:03, then come back to your face."
          ref={textareaRef}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-fg-subtle">{severity === "must_fix" ? "Carries to the next version until ticked off." : "A suggestion never blocks approval."}</p>
        <Button variant="secondary" size="sm" leadingIcon={<Plus />} onClick={submit}>
          Add note
        </Button>
      </div>
    </div>
  );
}

const SEVERITY_TONE: Record<FeedbackSeverity, Tone> = { must_fix: "rose", suggestion: "info" };

export interface NoteRowProps {
  t_ms: number;
  t_end_ms?: number;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  body: string;
  status?: FeedbackStatus;
  /** "v1" for a note carried over from an earlier version. */
  version?: number;
  onSeek?: () => void;
  onRemove?: () => void;
  className?: string;
}

/** One timecoded note: the time (a button that seeks), a category and severity, the words, and remove when it is a draft. */
export function NoteRow({ t_ms, t_end_ms, category, severity, body, status, version, onSeek, onRemove, className }: NoteRowProps) {
  const resolved = status === "resolved" || status === "dismissed";
  return (
    <li className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-xl bg-surface-field p-3", resolved && "opacity-70", className)}>
      <button
        type="button"
        onClick={onSeek}
        disabled={!onSeek}
        aria-label={`Jump to ${tcRange(t_ms, t_end_ms)}`}
        className="mt-px inline-flex h-6 items-center rounded-md bg-surface-active px-2 text-caption font-semibold text-fg tabular-nums transition-colors duration-(--fd-dur-fast) ease-standard enabled:hover:bg-accent-soft enabled:hover:text-accent"
      >
        {tcRange(t_ms, t_end_ms)}
      </button>
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge size="sm" tone={SEVERITY_TONE[severity]} variant="soft">
            {severity === "must_fix" ? "Must fix" : "Suggestion"}
          </Badge>
          <Badge size="sm" tone={FEEDBACK_CATEGORY_META[category].tone as Tone} variant="outline">
            {FEEDBACK_CATEGORY_META[category].label}
          </Badge>
          {status === "resolved" ? (
            <Badge size="sm" tone="mint" icon={<CircleCheck aria-hidden="true" />}>
              Fixed in a later version
            </Badge>
          ) : null}
          {version !== undefined ? <span className="text-micro text-fg-subtle">v{version}</span> : null}
        </div>
        <p className="text-body-sm text-fg">{body}</p>
      </div>
      {onRemove ? <IconButton variant="plain" size="xs" label="Remove note" tooltip={false} icon={<X />} onClick={onRemove} /> : <span />}
    </li>
  );
}
