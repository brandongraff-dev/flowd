"use client";

import { useMemo, useState } from "react";
import { Check, Eye, MessageSquareWarning, RotateCcw, X } from "lucide-react";
import { ArtAvatar, AppIcon, DomainStatusPill, PlatformGlyph } from "@/components/brand";
import { formatCompact, ScoreRing, scoreBand } from "@/components/charts";
import { Badge, Button, Money, SegmentedControl, StatusPill } from "@/components/ui";
import { DataTable, Delta, KpiRow, Pagination, StatCard, Timeline, type DataColumn, type RowAction } from "@/components/shell";
import { Cols, Panel, Section } from "../../_gallery/kit";
import { SUBMISSIONS, type Submission } from "./data";

const SUBMISSION_STATUS: Record<Submission["status"], { label: string; tone: "mint" | "info" | "accent" | "ember" | "rose" }> = {
  qa_pending: { label: "Checking", tone: "info" },
  in_review: { label: "In review", tone: "accent" },
  changes_requested: { label: "Changes requested", tone: "ember" },
  approved: { label: "Approved", tone: "mint" },
  posted: { label: "Posted", tone: "mint" },
  rejected: { label: "Not approved", tone: "rose" },
};

const COLUMNS: DataColumn<Submission>[] = [
  {
    id: "creator",
    header: "Creator",
    label: "Creator",
    sortValue: (row) => row.creator.handle,
    sticky: true,
    minWidth: "12rem",
    card: "title",
    cell: (row) => (
      <span className="flex items-center gap-3">
        <ArtAvatar art={row.creator.art} name={row.creator.handle} size={32} decorative />
        <span className="grid min-w-0">
          <span className="truncate font-semibold text-fg">{row.creator.handle}</span>
          <span className="flex items-center gap-1.5 text-caption text-fg-subtle">
            <PlatformGlyph platform={row.platform} size={16} decorative />
            {row.platform === "tiktok" ? "TikTok" : row.platform === "instagram" ? "Instagram" : "YouTube"}
          </span>
        </span>
      </span>
    ),
  },
  {
    id: "bounty",
    header: "Bounty",
    label: "Bounty",
    sortValue: (row) => row.app.name,
    card: "subtitle",
    hideBelow: "md",
    minWidth: "16rem",
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <AppIcon art={row.app.icon} name={row.app.name} size={28} decorative />
        <span className="grid min-w-0">
          <span className="truncate font-medium text-fg">{row.hook}</span>
          <span className="truncate text-caption text-fg-subtle">{row.app.name}</span>
        </span>
      </span>
    ),
  },
  {
    id: "score",
    header: "Flow score",
    label: "Flow score",
    align: "end",
    sortValue: (row) => row.score,
    cell: (row) => {
      const band = scoreBand(row.score);
      return (
        <span className="inline-flex items-center justify-end gap-2" title="Checklist score">
          <Badge size="sm" tone={band.letter === "A" ? "mint" : band.letter === "B" ? "accent" : band.letter === "C" ? "info" : band.letter === "D" ? "ember" : "rose"}>
            {band.letter}
          </Badge>
          <span className="text-fg-muted">{row.score}</span>
        </span>
      );
    },
  },
  { id: "views", header: "Views", label: "Views", align: "end", sortValue: (row) => row.views, hideBelow: "lg", cell: (row) => (row.views ? formatCompact(row.views) : "Not live") },
  {
    id: "earned",
    header: "Earned",
    label: "Earned",
    align: "end",
    sortValue: (row) => row.earnedCents,
    card: "value",
    cell: (row) => (row.earnedCents ? <Money cents={row.earnedCents} size="sm" state={row.moneyState} decimals="always" /> : <span className="text-fg-subtle">None yet</span>),
  },
  {
    id: "status",
    header: "Status",
    label: "Status",
    sortValue: (row) => row.status,
    cell: (row) => <DomainStatusPill meta={SUBMISSION_STATUS[row.status]} value={row.status} size="md" />,
  },
  { id: "decide", header: "Decide by", label: "Decide by", hideBelow: "xl", cell: (row) => <span className="text-fg-muted">{row.decideBy}</span> },
];

const TIMELINE = [
  { id: "live", title: "Post is live", time: "Wed 4:12 PM", description: "The 72-hour view window opened. Earnings accrue as verified views arrive.", state: "done" as const },
  { id: "window", title: "View window closes", time: "Sat 4:12 PM", description: "Views are verified against the platform at the 72-hour mark.", state: "active" as const },
  { id: "fraud", title: "Fraud and compliance check", time: "Sat 4:12 to 6:00 PM", description: "Automatic. A human decides within 24 hours if anything is held, and the reason is named.", state: "upcoming" as const },
  { id: "clear", title: "Cleared to your Wallet", time: "clears Sat 6:00 PM", description: "Cleared money is yours to cash out instantly (1.5% fee, shown first) or on Friday for free.", state: "upcoming" as const },
  { id: "paid", title: "Weekly payout", time: "Fri Oct 9, 6:00 PM", state: "upcoming" as const },
];

export function DataSection() {
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [page, setPage] = useState(3);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const actions = useMemo(
    () =>
      (row: Submission): RowAction[] => [
        { id: "open", label: "Open in review", icon: <Eye />, onSelect: () => undefined },
        { id: "approve", label: "Approve", icon: <Check />, onSelect: () => undefined, disabled: row.status === "posted" },
        { id: "changes", label: "Request changes", icon: <RotateCcw />, onSelect: () => undefined, disabled: row.status === "posted" },
        { id: "reject", label: "Reject with a reason", icon: <X />, destructive: true, separated: true, onSelect: () => undefined, disabled: row.status === "posted" },
      ],
    [],
  );

  return (
    <Section
      id="data"
      eyebrow="Numbers and tables"
      title="Stat tiles, the table, the timeline."
      description="Stat tiles follow the dataviz contract: label, value, a delta against a named period, a 12-point spark. The table is built for the busiest screens (a review queue): sticky header and first column, a tri-state selection, row actions, two densities, and cards under 768px. Timelines carry the Money Clock."
    >
      <KpiRow>
        <StatCard label="Verified views" value={4_212_880} delta={{ ratio: 0.124, against: "vs prior 30 days" }} spark={[310, 322, 305, 340, 368, 361, 392, 405, 398, 431, 452, 470]} />
        <StatCard label="Spend" cents={1_250_000} moneyState="neutral" delta={{ ratio: 0.09, against: "vs prior 30 days" }} spark={[88, 91, 90, 95, 99, 97, 104, 110, 108, 114, 121, 126]} sparkTone="neutral" />
        <StatCard label="Installs" value={3310} delta={{ ratio: 0.183, against: "vs prior 30 days" }} spark={[210, 198, 224, 241, 236, 259, 271, 268, 290, 312, 318, 331]} />
        <StatCard label="Cost per trial" cents={740} delta={{ ratio: -0.214, against: "vs prior 30 days", goodWhen: "down" }} spark={[9.4, 9.1, 9.3, 8.8, 8.9, 8.4, 8.6, 8.2, 8, 8.1, 7.7, 7.4]} sparkTone="neutral" />
      </KpiRow>

      <Cols>
        <Panel title="Creator view: the signal tones" note="Creators see mint for favourable money and rose for unfavourable; brands see neutral ink and arrows. Same component, one prop.">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Cleared this week" cents={128460} moneyState="cleared" audience="creator" delta={{ ratio: 0.38, against: "vs last week" }} spark={[18, 22, 21, 27, 31, 29, 38, 41, 39, 47, 52, 58]} hint="3 posts · next clears Sat 2:00 PM" />
            <StatCard label="Pending" cents={6120} moneyState="pending" audience="creator" delta={{ ratio: -0.07, against: "vs last week" }} hint="Real money on a timer" />
          </div>
          <div className="grid gap-2.5 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <p className="fd-eyebrow text-fg-subtle">Delta, every case</p>
            <Delta ratio={0.124} against="vs prior 30 days" />
            <Delta ratio={-0.214} against="vs prior 30 days" goodWhen="down" />
            <Delta ratio={0.38} against="vs last week" audience="creator" />
            <Delta ratio={-0.12} against="vs last week" audience="creator" />
            <Delta ratio={0} against="vs last week" />
          </div>
        </Panel>
        <Panel title="Loading and a lone hero" note="A skeleton in the same shape (no layout jump), and the single hero figure a view leads with.">
          <StatCard label="Cleared" cents={128460} moneyState="cleared" audience="creator" size="xl" spark={[18, 22, 21, 27, 31, 29, 38, 41, 39, 47, 52, 58]} />
          <StatCard label="Verified views" loading spark={[1, 2, 3]} />
        </Panel>
      </Cols>

      <DataTable
        caption="Submissions in review"
        columns={COLUMNS}
        rows={SUBMISSIONS}
        getRowId={(row) => row.id}
        getRowLabel={(row) => `${row.creator.handle}, ${row.hook}`}
        defaultSort={{ id: "score", direction: "desc" }}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        density={density}
        rowActions={actions}
        onRowClick={() => undefined}
        loading={loading}
        bulkActions={(ids) => (
          <>
            <Button size="xs" variant="primary" leadingIcon={<Check />}>
              Approve {ids.length}
            </Button>
            <Button size="xs" variant="secondary" leadingIcon={<MessageSquareWarning />}>
              Request changes
            </Button>
          </>
        )}
        toolbar={
          <>
            <p className="mr-auto text-body-sm font-semibold text-fg">Review queue</p>
            <SegmentedControl<"comfortable" | "compact">
              aria-label="Row density"
              size="sm"
              value={density}
              onValueChange={setDensity}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
            />
            <Button size="sm" variant="secondary" onClick={() => setLoading((value) => !value)}>
              {loading ? "Show rows" : "Show loading"}
            </Button>
          </>
        }
        footer={<Pagination page={page} pageCount={16} onPageChange={setPage} total={392} pageSize={pageSize} onPageSizeChange={setPageSize} noun="submissions" />}
      />

      <Cols>
        <DataTable
          caption="Empty state"
          columns={COLUMNS.slice(0, 3)}
          rows={[]}
          getRowId={(row) => row.id}
          empty={{ art: "inbox", title: "Inbox zero", description: "Every submission has a decision. New ones appear here the moment a creator submits.", action: <Button size="sm" variant="secondary">Review auto-approve rules</Button> }}
        />
        <Panel title="Timeline: the Money Clock" note="Every step has a glyph and a spoken state, and every time is a date. Never a bare pending.">
          <Timeline items={TIMELINE} />
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status="pending" />
            <StatusPill status="cleared" />
            <StatusPill status="held" />
            <StatusPill status="paid" />
          </div>
        </Panel>
      </Cols>

      <Panel title="Score ring in context" note="The same component the Hook Score result and the review row use.">
        <div className="flex flex-wrap items-center gap-8">
          <ScoreRing name="Flow Score" score={SUBMISSIONS[0]?.score ?? 80} size={104} checklist={false} />
          <ScoreRing name="Flow Score" score={SUBMISSIONS[2]?.score ?? 64} size={104} checklist={false} />
          <ScoreRing name="Flow Score" score={SUBMISSIONS[6]?.score ?? 41} size={104} checklist={false} />
        </div>
      </Panel>
    </Section>
  );
}
