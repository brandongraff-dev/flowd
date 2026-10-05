"use client";

import { useMemo, useState } from "react";
import { Check, Hand, ShieldX } from "lucide-react";
import { useSubmissions } from "@/lib/data";
import type { DryRunResult } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { DataTable, type DataColumn } from "@/components/shell/data-table";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented-control";

type Row = DryRunResult["per_submission"][number] & { title: string; handle: string; bounty: string };
type Which = "all" | "auto_approve" | "send_to_human" | "block";

const DECISION: Record<Row["decision"], { label: string; tone: "mint" | "neutral" | "rose"; icon: typeof Check }> = {
  auto_approve: { label: "Would approve", tone: "mint", icon: Check },
  send_to_human: { label: "A person decides", tone: "neutral", icon: Hand },
  block: { label: "Safety stop", tone: "rose", icon: ShieldX },
};

export interface DryRunPanelProps {
  result: DryRunResult;
  /** When it ran, as a label. */
  ranLabel: string;
}

/**
 * The dry run on the brand's last 50 submissions: what the rule WOULD have done, with the reason for every video it would not approve.
 * It approves nothing. A rule cannot be switched on until one has run, and a changed rule needs a fresh one.
 */
export function DryRunPanel({ result, ranLabel }: DryRunPanelProps) {
  const subs = useSubmissions({ brand: "mine" });
  const [which, setWhich] = useState<Which>("all");
  const { would_approve: yes, would_send_to_human: person, would_block: block, sample_size: n } = result.dry_run;

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(subs.map((s) => [s.id, s] as const));
    return result.per_submission.map((p) => {
      const s = byId.get(p.submission_id);
      return { ...p, title: s?.title ?? p.submission_id, handle: s?.creator.handle ?? "unknown", bounty: s?.bounty.title ?? "" };
    });
  }, [result.per_submission, subs]);
  const shown = rows.filter((r) => which === "all" || r.decision === which);

  const columns: DataColumn<Row>[] = [
    {
      id: "video",
      header: "Video",
      label: "Video",
      minWidth: "14rem",
      card: "title",
      wrap: true,
      cell: (r) => (
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate font-medium text-fg">{r.title}</span>
          <span className="truncate text-caption text-fg-subtle">
            @{r.handle}
            {r.bounty ? ` · ${r.bounty}` : ""}
          </span>
        </span>
      ),
    },
    {
      id: "decision",
      header: "The rule would",
      label: "The rule would",
      minWidth: "11rem",
      card: "value",
      cell: (r) => {
        const d = DECISION[r.decision];
        const Icon = d.icon;
        return (
          <Badge tone={d.tone} icon={<Icon aria-hidden="true" />}>
            {d.label}
          </Badge>
        );
      },
    },
    {
      id: "why",
      header: "Why",
      label: "Why",
      wrap: true,
      card: "meta",
      cell: (r) => <span className={cn("text-caption", r.reasons.length === 0 ? "text-fg-subtle" : "text-fg-muted")}>{r.reasons.length === 0 ? "Every condition holds." : r.reasons.slice(0, 2).join(" ")}</span>,
    },
  ];

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <p className="font-display text-title-md text-fg">{result.headline.replace(/\.$/, "")}</p>
        <p className="text-body-sm text-fg-muted">
          Ran {ranLabel} on the last {n} {n === 1 ? "video" : "videos"}. Nothing was approved: this only shows what the rule would have done.
        </p>
      </div>
      <div className="grid gap-2" role="img" aria-label={`${yes} would be approved, ${person} would be decided by a person, ${block} are safety stops`}>
        <div className="flex h-3 overflow-hidden rounded-pill bg-surface-active">
          <span className="bg-mint-solid" style={{ width: `${(yes / Math.max(n, 1)) * 100}%` }} />
          <span className="bg-fg-subtle/60" style={{ width: `${(person / Math.max(n, 1)) * 100}%` }} />
          <span className="bg-rose-solid" style={{ width: `${(block / Math.max(n, 1)) * 100}%` }} />
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-fg-muted tabular-nums">
          <li className="inline-flex items-center gap-1.5">
            <Check aria-hidden="true" className="size-3.5 text-mint" strokeWidth={2.5} />
            {yes} would be approved
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Hand aria-hidden="true" className="size-3.5" />
            {person} left to a person
          </li>
          <li className="inline-flex items-center gap-1.5">
            <ShieldX aria-hidden="true" className="size-3.5 text-rose" />
            {block} safety {block === 1 ? "stop" : "stops"}
          </li>
        </ul>
      </div>
      <DataTable
        caption="What the rule would have done on each of the last videos"
        columns={columns}
        rows={shown}
        getRowId={(r) => r.submission_id}
        getRowLabel={(r) => `${r.title} by @${r.handle}`}
        density="compact"
        stickyHeader
        maxHeight="26rem"
        surface="none"
        toolbar={
          <SegmentedControl
            aria-label="Show"
            size="sm"
            value={which}
            onValueChange={setWhich}
            options={[
              { value: "all", label: `All ${rows.length}` },
              { value: "auto_approve", label: `Approved ${yes}` },
              { value: "send_to_human", label: `A person ${person}` },
              { value: "block", label: `Stops ${block}` },
            ]}
          />
        }
        empty={{ art: "search", title: "Nothing in this group", description: "Pick another group to see the rest." }}
        className="rounded-2xl bg-surface-field"
      />
    </div>
  );
}
