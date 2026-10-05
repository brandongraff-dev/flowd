"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ArtSurface } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { SubmissionView } from "@/lib/data/selectors";
import { BandBadge, CreatorLine, DuplicateBadge, FraudBadge, QaGlyph, SlaChip } from "./parts";
import type { QueueInsight } from "./queue-data";
import { tc } from "./timecode";

/** A video needs a closer look when a QA check flagged it, it matches another video, or its creator's views are under review. */
export function needsCloserLook(v: SubmissionView): boolean {
  const band = v.fraud_evidence.creator_fraud_band;
  return v.qa.fail > 0 || v.qa.warn > 0 || v.fraud_evidence.duplicate_of_submission_id !== undefined || band === "review" || band === "high";
}

export interface QueueRowProps {
  item: SubmissionView;
  insight?: QueueInsight;
  active: boolean;
  selected: boolean;
  onSelectedChange: (next: boolean) => void;
  /** A click on the row: on a wide screen it moves the preview here; on a phone it opens the video. */
  onActivate: () => void;
  onApprove: () => void;
  onChanges: () => void;
  onReject: () => void;
}

function MiniThumb({ item }: { item: SubmissionView }) {
  return (
    <div className="relative isolate h-[72px] w-10 shrink-0 overflow-hidden rounded-lg bg-bg-sunken">
      <ArtSurface art={item.current.video.art} aspect="9:16" className="absolute inset-0 block size-full" />
      <span aria-hidden="true" className="fd-media-scrim pointer-events-none absolute inset-0" />
      <span className="absolute inset-x-0 bottom-1 text-center text-micro font-semibold text-white tabular-nums">{tc(item.current.video.duration_ms)}</span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_oklch(1_0_0/0.14)] light:shadow-[inset_0_0_0_1px_oklch(0_0_0/0.1)]" />
    </div>
  );
}

/** One video waiting for a decision. Dense on purpose: who, how it scored, what the checks found, and how long it has waited. */
export function QueueRow({ item, insight, active, selected, onSelectedChange, onActivate, onApprove, onChanges, onReject }: QueueRowProps) {
  const review = item.review;
  const worst = insight?.flags[0];
  const duplicate = item.fraud_evidence.duplicate_of_submission_id !== undefined;
  const stop = (event: MouseEvent): void => event.stopPropagation();

  return (
    <div
      id={`review-row-${item.id}`}
      data-active={active ? "" : undefined}
      onClick={onActivate}
      className={cn(
        "group/row relative grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-3.5 gap-y-3 px-4 py-3.5 transition-colors duration-(--fd-dur-instant) ease-standard",
        active ? "bg-accent-soft" : "hover:bg-surface-hover",
        selected && !active && "bg-surface-hover",
      )}
    >
      {active ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-bright" /> : null}
      <div className="pt-1" onClick={stop}>
        <Checkbox aria-label={`Select ${item.title} by @${item.creator.handle}`} checked={selected} onCheckedChange={(next) => onSelectedChange(next === true)} />
      </div>
      <MiniThumb item={item} />
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <CreatorLine handle={item.creator.handle} avatar={item.creator.avatar} tier={item.creator.tier} reliability={item.reliability} size="sm" />
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <BandBadge band={item.flow_band} kind="Flow" size="sm" />
            <BandBadge band={item.hook_band} kind="Hook" size="sm" />
            {review ? <SlaChip state={review.state} hoursLeft={review.hours_left} label={review.label} size="sm" /> : null}
          </div>
        </div>
        <p className="truncate text-body-sm text-fg" onClick={stop}>
          <Link href={`/brand/review/${item.id}`} className="font-semibold underline-offset-4 hover:underline">
            {item.title}
          </Link>
          <span className="text-fg-subtle"> · {item.bounty.title}</span>
        </p>
        {insight?.hook_text ? <p className="truncate text-caption text-fg-muted">“{insight.hook_text}”</p> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {worst ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-caption font-medium text-fg">
              <QaGlyph result={worst.result} className="size-3.5" />
              <span className="truncate">
                {worst.message}
                {worst.t_ms !== undefined ? <span className="ml-1.5 rounded-md bg-surface-active px-1.5 py-0.5 text-micro font-semibold text-fg-muted tabular-nums">{tc(worst.t_ms)}</span> : null}
              </span>
            </span>
          ) : item.qa.fail + item.qa.warn === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-caption font-medium text-mint">
              <QaGlyph result="pass" className="size-3.5" />
              All {item.qa.pass} checks pass
            </span>
          ) : null}
          {item.qa.fail + item.qa.warn > 1 ? <span className="text-caption text-fg-subtle">{`+${item.qa.fail + item.qa.warn - 1} more ${item.qa.fail + item.qa.warn - 1 === 1 ? "flag" : "flags"}`}</span> : null}
          <FraudBadge band={item.fraud_evidence.creator_fraud_band} size="sm" />
          {duplicate ? <DuplicateBadge distance={item.fraud_evidence.phash_distance} /> : null}
          {item.creator.approved_count === 0 ? <span className="text-caption text-fg-subtle">First video: always reviewed by a person</span> : null}
        </div>
      </div>
      <div className="col-span-full flex items-center gap-2 lg:hidden" onClick={stop}>
        <Button size="sm" variant="primary" leadingIcon={<Check />} onClick={onApprove}>
          Approve
        </Button>
        <Button size="sm" variant="secondary" leadingIcon={<RotateCcw />} onClick={onChanges}>
          Changes
        </Button>
        <Button size="sm" variant="danger" leadingIcon={<X />} onClick={onReject}>
          Reject
        </Button>
      </div>
    </div>
  );
}

