"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import type { BountyCreatorRow, BountyDetail } from "@/lib/data/selectors";
import { formatCompact } from "@/lib/format";
import { ArtAvatar } from "@/components/brand/avatar";
import { TierChip } from "@/components/brand/tier-badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Money } from "@/components/ui/money";
import { DataTable, type DataColumn } from "@/components/shell/data-table";
import { Pagination } from "@/components/shell/pagination";
import { SourceChip } from "../common";
import { usePagedRows } from "../use-paged-rows";

const PAGE_SIZE = 10;

/**
 * Creators: who is working on this bounty, ranked by tracked trials and then pay, with what each one cost per trial. Judge creators on cost per
 * trial, not views. A row opens the creator's profile; a creator with only a post or two is a lead, not a verdict.
 */
export function CreatorsTab({ detail }: { detail: BountyDetail }) {
  const router = useRouter();
  const columns: DataColumn<BountyCreatorRow>[] = useMemo(
    () => [
      {
        id: "creator",
        header: "Creator",
        label: "Creator",
        card: "title",
        minWidth: "14rem",
        sortValue: (r) => r.creator.handle,
        cell: (r) => (
          <span className="flex min-w-0 items-center gap-3">
            <ArtAvatar art={r.creator.avatar} name={r.creator.display_name} size={32} decorative />
            <span className="grid min-w-0">
              <span className="truncate font-semibold text-fg">@{r.creator.handle}</span>
              <span className="flex items-center gap-1.5 text-caption text-fg-subtle">
                <TierChip tier={r.creator.tier} size="sm" />
              </span>
            </span>
          </span>
        ),
      },
      { id: "subs", header: "Submitted", align: "end", card: "meta", hideBelow: "md", sortValue: (r) => r.submissions, cell: (r) => r.submissions },
      { id: "approved", header: "Approved", align: "end", card: "meta", hideBelow: "md", sortValue: (r) => r.approved, cell: (r) => r.approved },
      { id: "posts", header: "Posts", align: "end", card: "meta", sortValue: (r) => r.posts, cell: (r) => r.posts },
      { id: "views", header: "Views", align: "end", card: "meta", hideBelow: "lg", sortValue: (r) => r.views, cell: (r) => formatCompact(r.views) },
      { id: "trials", header: "Trials", align: "end", card: "meta", sortValue: (r) => r.trials, cell: (r) => r.trials },
      { id: "paid", header: "Paid to creator", align: "end", card: "meta", hideBelow: "lg", sortValue: (r) => r.paid_cents, cell: (r) => <Money cents={r.paid_cents} size="inherit" decimals="auto" /> },
      {
        id: "cpt",
        header: "Cost per trial",
        align: "end",
        card: "value",
        sortValue: (r) => r.cost_per_trial_cents,
        cell: (r) => (r.cost_per_trial_cents === null ? <span className="text-fg-subtle">Not enough data</span> : <Money cents={r.cost_per_trial_cents} size="inherit" decimals="always" />),
      },
    ],
    [],
  );
  const paged = usePagedRows(detail.creators, columns, PAGE_SIZE, { id: "trials", direction: "desc" });

  return (
    <DataTable
      caption="Creators on this bounty"
      columns={columns}
      rows={paged.pageRows}
      manualSort
      sort={paged.sort}
      onSortChange={paged.setSort}
      getRowId={(r) => r.creator.id}
      getRowLabel={(r) => `@${r.creator.handle}`}
      onRowClick={(r) => router.push(`/brand/creators/${r.creator.handle}`)}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
          <p className="flex items-center gap-2 text-caption text-fg-subtle">
            <SourceChip kind="tracked" />
            Trials are Tracked. Cost per trial is what the creator was paid plus the platform fee, over their tracked trials.
          </p>
          {paged.total > PAGE_SIZE ? <Pagination page={paged.page} pageCount={paged.pageCount} onPageChange={paged.setPage} total={paged.total} pageSize={PAGE_SIZE} noun="creators" /> : null}
        </div>
      }
      empty={{
        art: "inbox",
        title: "No creators yet",
        description: "Creators who submit to this bounty appear here with what each one delivered and cost.",
        action: (
          <Link href="/brand/creators" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Compass aria-hidden="true" />
            Find creators to invite
          </Link>
        ),
      }}
    />
  );
}
