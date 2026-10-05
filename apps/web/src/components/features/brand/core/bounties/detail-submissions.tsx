"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { HOLD_REASON_META, SCORE_BAND_META, SUBMISSION_STATUS_META, type SubmissionStatus } from "@/lib/contract/types";
import type { BountyDetail, SettlementRow, SubmissionView } from "@/lib/data/selectors";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArtAvatar } from "@/components/brand/avatar";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Money } from "@/components/ui/money";
import { Tooltip } from "@/components/ui/tooltip";
import { DataTable, type DataColumn } from "@/components/shell/data-table";
import { Pagination } from "@/components/shell/pagination";
import { Panel } from "../common";
import { usePagedRows } from "../use-paged-rows";

type Filter = "all" | "in_review" | "approved" | "changes" | "closed";

const FILTERS: readonly { id: Filter; label: string; statuses: readonly SubmissionStatus[] }[] = [
  { id: "all", label: "All", statuses: [] },
  { id: "in_review", label: "In review", statuses: ["in_review", "qa_pending"] },
  { id: "approved", label: "Approved", statuses: ["approved", "posted", "released"] },
  { id: "changes", label: "Changes requested", statuses: ["changes_requested"] },
  { id: "closed", label: "Not approved or closed", statuses: ["rejected", "appealed", "withdrawn", "expired"] },
];

const STAGE: Record<SettlementRow["stage"], { status: string; label: string }> = {
  window_open: { status: "window_open", label: "Views counting" },
  fraud_check: { status: "window_closed", label: "Fraud check" },
  clearing: { status: "pending", label: "Clearing" },
  cleared: { status: "cleared", label: "Cleared" },
  paid: { status: "paid", label: "Paid out" },
  held: { status: "held", label: "On hold" },
  clawed_back: { status: "clawed_back", label: "Clawed back" },
  removed: { status: "closed", label: "Removed" },
};

const PAGE_SIZE = 10;

/**
 * Submissions: every video sent to this bounty with its checklist score, QA flags and decision clock (a row opens the review), then where every
 * post is in settlement (window, fraud check, cleared) and any clawbacks. A clawback reverses only proven invalid views; delivered views stay paid.
 */
export function SubmissionsTab({ detail }: { detail: BountyDetail }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useMemo(() => {
    const def = FILTERS.find((f) => f.id === filter);
    return !def || def.statuses.length === 0 ? detail.submissions : detail.submissions.filter((s) => def.statuses.includes(s.status));
  }, [detail.submissions, filter]);

  const columns: DataColumn<SubmissionView>[] = useMemo(
    () => [
      {
        id: "creator",
        header: "Creator",
        label: "Creator",
        card: "title",
        minWidth: "14rem",
        sortValue: (s) => s.creator.handle,
        cell: (s) => (
          <span className="flex min-w-0 items-center gap-3">
            <ArtAvatar art={s.creator.avatar} name={s.creator.display_name} size={32} decorative />
            <span className="grid min-w-0">
              <span className="truncate font-semibold text-fg">@{s.creator.handle}</span>
              <span className="truncate text-caption text-fg-subtle">{s.title}</span>
            </span>
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        card: "subtitle",
        sortValue: (s) => s.status,
        cell: (s) => (
          <Badge tone={SUBMISSION_STATUS_META[s.status].tone} size="md">
            {SUBMISSION_STATUS_META[s.status].label}
          </Badge>
        ),
      },
      {
        id: "flow",
        header: "Flow score",
        card: "meta",
        hideBelow: "md",
        sortValue: (s) => s.flow_points,
        cell: (s) => (
          <Tooltip content="Checklist score from the first 3 seconds, captions, disclosure and pacing. It gets smarter as bounties settle.">
            <span tabIndex={0} className="inline-flex items-center gap-1.5 rounded-pill outline-offset-2">
              <Badge tone={SCORE_BAND_META[s.flow_band].tone} size="sm">
                {s.flow_band}
              </Badge>
              <span className="text-caption text-fg-subtle tabular-nums">{s.flow_points}</span>
            </span>
          </Tooltip>
        ),
      },
      {
        id: "qa",
        header: "QA",
        card: "meta",
        hideBelow: "lg",
        sortValue: (s) => s.qa.fail * 100 + s.qa.warn,
        cell: (s) =>
          s.qa.fail > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-rose">
              <TriangleAlert aria-hidden="true" className="size-4" strokeWidth={2} />
              {s.qa.fail} {s.qa.fail === 1 ? "fail" : "fails"}
            </span>
          ) : s.qa.warn > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-sun">
              <TriangleAlert aria-hidden="true" className="size-4" strokeWidth={2} />
              {s.qa.warn} {s.qa.warn === 1 ? "warning" : "warnings"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-fg-muted">
              <CircleCheck aria-hidden="true" className="size-4 text-mint" strokeWidth={2} />
              Clean
            </span>
          ),
      },
      {
        id: "decide",
        header: "Decision",
        card: "value",
        wrap: true,
        minWidth: "11rem",
        sortValue: (s) => s.sla_due_at ?? s.decision?.decided_at ?? s.updated_at,
        cell: (s) =>
          s.review ? (
            <span className={cn("text-body-sm", s.review.state === "breached" ? "font-semibold text-rose" : s.review.state === "stale" ? "font-medium text-sun" : "text-fg-muted")}>{s.review.label}</span>
          ) : s.decision ? (
            <span className="text-fg-muted">{formatDate(s.decision.decided_at, "medium")}</span>
          ) : (
            <span className="text-fg-subtle">Not submitted</span>
          ),
      },
      { id: "reserved", header: "Reserved", align: "end", card: "meta", hideBelow: "xl", sortValue: (s) => s.reserved_cents, cell: (s) => (s.reserved_cents > 0 ? <Money cents={s.reserved_cents} size="inherit" decimals="auto" /> : <span className="text-fg-subtle">None</span>) },
    ],
    [],
  );
  const paged = usePagedRows(rows, columns, PAGE_SIZE, null);

  const settlementColumns: DataColumn<SettlementRow>[] = useMemo(
    () => [
      {
        id: "post",
        header: "Post",
        label: "Post",
        card: "title",
        minWidth: "13rem",
        sortValue: (r) => r.creator.handle,
        cell: (r) => (
          <span className="flex min-w-0 items-center gap-3">
            <ArtAvatar art={r.creator.avatar} name={r.creator.display_name} size={28} decorative />
            <span className="truncate font-semibold text-fg">@{r.creator.handle}</span>
          </span>
        ),
      },
      { id: "stage", header: "Stage", card: "subtitle", sortValue: (r) => r.stage, cell: (r) => <StatusPill status={STAGE[r.stage].status} label={STAGE[r.stage].label} size="md" /> },
      { id: "window", header: "Window closes", card: "meta", hideBelow: "md", sortValue: (r) => r.window_closes_at, cell: (r) => <span className="text-fg-muted">{formatDateTime(r.window_closes_at)}</span> },
      {
        id: "clears",
        header: "Clears",
        card: "meta",
        wrap: true,
        minWidth: "11rem",
        sortValue: (r) => r.clears_at ?? "",
        cell: (r) => (r.hold_reason ? <span className="text-fg-muted">Held: {HOLD_REASON_META[r.hold_reason as keyof typeof HOLD_REASON_META]?.label ?? r.hold_reason}</span> : r.clears_at ? <span className="text-fg-muted">{formatDateTime(r.clears_at)}</span> : <span className="text-fg-subtle">After the window</span>),
      },
      { id: "pay", header: "Creator pay", align: "end", card: "value", sortValue: (r) => r.creator_pay_cents, cell: (r) => <Money cents={r.creator_pay_cents} size="inherit" decimals="always" /> },
      { id: "fee", header: "Platform fee", align: "end", card: "meta", hideBelow: "lg", sortValue: (r) => r.fee_cents, cell: (r) => <Money cents={r.fee_cents} size="inherit" decimals="always" /> },
    ],
    [],
  );
  const settle = usePagedRows(detail.settlement, settlementColumns, PAGE_SIZE, { id: "window", direction: "desc" });

  return (
    <div className="grid gap-8">
      <section aria-label="Submissions" className="grid gap-4">
        <ChipGroup aria-label="Filter submissions">
          {FILTERS.map((item) => {
            const count = item.statuses.length === 0 ? detail.submissions.length : detail.submissions.filter((s) => item.statuses.includes(s.status)).length;
            return (
              <Chip
                key={item.id}
                selected={filter === item.id}
                onSelectedChange={() => {
                  setFilter(item.id);
                  paged.setPage(1);
                }}
                count={count}
              >
                {item.label}
              </Chip>
            );
          })}
        </ChipGroup>
        <DataTable
          caption="Submissions to this bounty"
          columns={columns}
          rows={paged.pageRows}
          manualSort
          sort={paged.sort}
          onSortChange={paged.setSort}
          getRowId={(s) => s.id}
          getRowLabel={(s) => `@${s.creator.handle}, ${s.title}`}
          onRowClick={(s) => router.push(`/brand/review/${s.id}`)}
          footer={paged.total > PAGE_SIZE ? <Pagination page={paged.page} pageCount={paged.pageCount} onPageChange={paged.setPage} total={paged.total} pageSize={PAGE_SIZE} noun="submissions" /> : undefined}
          empty={{ art: "video", title: filter === "all" ? "No submissions yet" : "No submissions in this view", description: filter === "all" ? "Creators who join this bounty send their videos here. You decide each one within the review promise." : "Pick another filter to see the rest." }}
        />
      </section>

      <section aria-label="Settlement" className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="font-display text-title-md text-fg">Settlement</h2>
          <p className="max-w-[64ch] text-body-sm text-fg-muted">Each post counts verified views for 72 hours, then passes a fraud and compliance check, then clears. Pay leaves escrow when a post clears.</p>
        </div>
        <DataTable
          caption="Posts and where their money is"
          columns={settlementColumns}
          rows={settle.pageRows}
          manualSort
          sort={settle.sort}
          onSortChange={settle.setSort}
          getRowId={(r) => r.post.id}
          getRowLabel={(r) => `@${r.creator.handle}`}
          footer={settle.total > PAGE_SIZE ? <Pagination page={settle.page} pageCount={settle.pageCount} onPageChange={settle.setPage} total={settle.total} pageSize={PAGE_SIZE} noun="posts" /> : undefined}
          empty={{ art: "chart", title: "No posts yet", description: "Once an approved video is posted, its 72-hour window and settlement show here." }}
        />
      </section>

      <Panel title="Clawbacks" description="Reversals after proven fraud. Views that were delivered stay paid.">
        {detail.clawbacks.length === 0 ? (
          <p className="rounded-[20px] bg-surface-field p-4 text-body-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">No clawbacks on this bounty. Nothing has been reversed.</p>
        ) : (
          <ul className="grid gap-1">
            {detail.clawbacks.map((entry) => (
              <li key={entry.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] px-2.5 py-2.5 hover:bg-surface-hover">
                <span className="grid min-w-0">
                  <span className="truncate text-body-sm font-medium text-fg">{entry.memo}</span>
                  <time dateTime={entry.posted_at} className="text-caption text-fg-subtle">
                    {formatDateTime(entry.posted_at)}
                  </time>
                </span>
                <Money cents={entry.amount_cents} size="sm" signDisplay="always" decimals="always" />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
