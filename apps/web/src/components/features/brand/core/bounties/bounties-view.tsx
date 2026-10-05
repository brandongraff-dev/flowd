"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CirclePlus, ExternalLink, Pause, Pencil, Play, WalletMinimal } from "lucide-react";
import { BOUNTY_STATUS_META, BOUNTY_TYPES, BOUNTY_TYPE_META, type BountyStatus, type BountyType } from "@/lib/contract/types";
import { useApps, useBountyCounts, useBounties, useStoreReady } from "@/lib/data";
import type { BountyView } from "@/lib/data/selectors";
import { pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { AppIcon } from "@/components/brand/app-icon";
import { DomainStatusPill } from "@/components/brand/domain-status";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Money } from "@/components/ui/money";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notify } from "@/components/ui/toast";
import { DemoTag } from "@/components/shell/demo-banner";
import { DataTable, type DataColumn, type RowAction } from "@/components/shell/data-table";
import { PageHeader } from "@/components/shell/page-header";
import { Pagination } from "@/components/shell/pagination";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { SourceChip, useUrlParam } from "../common";
import { FillMeter } from "../fill-meter";
import { usePagedRows } from "../use-paged-rows";

const TABS = ["live", "draft", "filled", "ended"] as const;
type BountyTab = (typeof TABS)[number];

const TAB_STATUSES: Record<BountyTab, readonly BountyStatus[]> = {
  live: ["live", "scheduled", "paused"],
  draft: ["draft", "awaiting_funding"],
  filled: ["filled"],
  ended: ["ended", "settled", "cancelled"],
};

const TAB_EMPTY: Record<BountyTab, { title: string; description: string }> = {
  live: { title: "No live bounties", description: "A funded bounty goes live the moment its escrow is in. Start one and Flo drafts the brief from your listing." },
  draft: { title: "No drafts", description: "Drafts save as you build, so you can leave the builder and pick up where you stopped." },
  filled: { title: "Nothing is filled", description: "A bounty fills when its whole pool is reserved or spent. It reopens if a reservation is released." },
  ended: { title: "Nothing has ended", description: "Ended and settled bounties stay here with their results and what came back to the wallet." },
};

const PAGE_SIZE = 12;

/** The cost per tracked trial a bounty has delivered so far; null with no trials. */
const costPerTrial = (b: BountyView): number | null => (b.funnel.trials > 0 && b.spent_cents > 0 ? Math.round(b.spent_cents / b.funnel.trials) : null);

/**
 * `/brand/bounties`: every bounty in four tabs (live, draft, filled, ended), each row showing the Funded badge, how much of the pool is committed
 * against the clock, what is left, how many videos are waiting on you and what a tracked trial has cost. Search, filter by app and type, pause
 * several at once. The tab and filters live in the URL.
 */
export function BrandBountiesView() {
  const ready = useStoreReady();
  const router = useRouter();
  const apps = useApps();
  const counts = useBountyCounts({ brand: "mine" });
  const [tab, setTab] = useUrlParam<BountyTab>("tab", TABS, "live");
  const [appFilter, setAppFilter] = useUrlParam<string>("app", ["all", ...apps.map((a) => a.id)], "all");
  const [typeFilter, setTypeFilter] = useUrlParam<BountyType | "all">("type", ["all", ...BOUNTY_TYPES], "all");
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 150);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const all = useBounties({ brand: "mine", ...(appFilter !== "all" ? { app: appFilter } : {}), ...(typeFilter !== "all" ? { type: typeFilter } : {}), ...(q ? { q } : {}), sort: "newest" });
  const rows = useMemo(() => all.filter((b) => TAB_STATUSES[tab].includes(b.status)), [all, tab]);

  const tabCount = (id: BountyTab): number => TAB_STATUSES[id].reduce((sum, status) => sum + counts[status], 0);

  const columns: DataColumn<BountyView>[] = useMemo(
    () => [
      {
        id: "bounty",
        header: "Bounty",
        label: "Bounty",
        card: "title",
        minWidth: "16rem",
        sortValue: (b) => b.title,
        cell: (b) => (
          <span className="flex min-w-0 items-center gap-3">
            <AppIcon art={b.app.icon} name={b.app.name} size={36} decorative />
            <span className="grid min-w-0">
              <span className="truncate font-semibold text-fg">{b.title}</span>
              <span className="truncate text-caption text-fg-subtle">
                {b.type_label} · {b.app.name}
              </span>
            </span>
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        card: "subtitle",
        sortValue: (b) => b.status,
        cell: (b) => (
          <span className="flex flex-wrap items-center gap-1.5">
            {b.funded && ["live", "scheduled", "paused", "filled"].includes(b.status) ? <StatusPill status="funded" size="md" /> : null}
            {b.status === "awaiting_funding" ? <StatusPill status="unfunded" size="md" /> : null}
            {b.status !== "live" && b.status !== "awaiting_funding" ? <DomainStatusPill meta={BOUNTY_STATUS_META[b.status]} value={b.status} size="md" /> : null}
          </span>
        ),
      },
      {
        id: "fill",
        header: "Committed",
        card: "meta",
        minWidth: "9.5rem",
        hideBelow: "lg",
        sortValue: (b) => b.fill_ratio,
        cell: (b) => (
          <span className="grid gap-1.5">
            <span className="text-caption font-semibold text-fg tabular-nums">{Math.round(b.fill_ratio * 100)}%</span>
            <FillMeter settled={b.spent_cents} reserved={b.reserved_cents} total={b.escrow_funded_cents} label={`${b.title} committed`} size="sm" />
          </span>
        ),
      },
      { id: "left", header: "Budget left", align: "end", card: "value", sortValue: (b) => b.budget_left_cents, cell: (b) => <Money cents={b.budget_left_cents} size="inherit" decimals="auto" /> },
      {
        id: "pending",
        header: "In review",
        align: "end",
        card: "meta",
        hideBelow: "md",
        sortValue: (b) => b.counts.in_review,
        cell: (b) => (b.counts.in_review > 0 ? <span className="font-semibold text-fg">{b.counts.in_review}</span> : <span className="text-fg-subtle">0</span>),
      },
      {
        id: "cpt",
        header: "Cost per trial",
        align: "end",
        card: "meta",
        hideBelow: "xl",
        sortValue: (b) => costPerTrial(b),
        cell: (b) => {
          const cost = costPerTrial(b);
          return cost === null ? <span className="text-fg-subtle">Not enough data</span> : <Money cents={cost} size="inherit" decimals="always" />;
        },
      },
    ],
    [],
  );

  const paged = usePagedRows(rows, columns, PAGE_SIZE, null);

  const rowActions = (b: BountyView): readonly RowAction[] => {
    const list: RowAction[] = [{ id: "open", label: "Open bounty", icon: <ExternalLink />, onSelect: () => router.push(`/brand/bounties/${b.id}`) }];
    if (b.status === "draft") list.push({ id: "continue", label: "Continue in the builder", icon: <Pencil />, onSelect: () => router.push(`/brand/bounties/new?draft=${b.id}`) });
    if (b.status === "awaiting_funding") list.push({ id: "fund", label: "Fund to go live", icon: <WalletMinimal />, onSelect: () => router.push(`/brand/bounties/${b.id}`) });
    if (b.status === "live" || b.status === "filled") list.push({ id: "pause", label: "Pause", icon: <Pause />, separated: true, onSelect: () => void pause([b.id]) });
    if (b.status === "paused") list.push({ id: "resume", label: "Resume", icon: <Play />, separated: true, onSelect: () => void resume(b.id) });
    return list;
  };

  const pause = async (ids: readonly string[]): Promise<void> => {
    let done = 0;
    let firstError: string | null = null;
    for (const id of ids) {
      const result = await actions.pauseBounty({ bounty_id: id });
      if (result.ok) done += 1;
      else firstError ??= `${result.error.message} ${result.error.hint ?? ""}`.trim();
    }
    setSelected(new Set());
    if (done > 0) {
      notify.undo(`${pluralise(done, "bounty")} paused`, {
        description: "Creators cannot start new submissions. Videos already in review are still decided and paid.",
        onUndo: () => {
          for (const id of ids) void actions.resumeBounty({ bounty_id: id });
        },
      });
    }
    if (firstError) notify.error(done > 0 ? "Some bounties were not paused" : "Nothing was paused", { description: firstError });
  };
  const resume = async (id: string): Promise<void> => {
    const result = await actions.resumeBounty({ bounty_id: id });
    if (result.ok) notify.success("Bounty resumed");
    else notify.error(result.error.message, { description: result.error.hint });
  };

  const appOptions = [{ value: "all", label: "All apps" }, ...apps.map((a) => ({ value: a.id, label: a.name }))];
  const typeOptions = [{ value: "all", label: "All pay types" }, ...BOUNTY_TYPES.map((t) => ({ value: t, label: BOUNTY_TYPE_META[t].label }))];
  const filtered = appFilter !== "all" || typeFilter !== "all" || q !== "";

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Bounties"
        title="Bounties"
        description="Fund a pool, let creators compete for it and pay only for verified views and tracked results. Funded means the whole pool and fee are in escrow."
        actions={
          <Link href="/brand/bounties/new" className={buttonVariants({ variant: "primary", size: "md" })}>
            <CirclePlus aria-hidden="true" />
            Start a bounty
          </Link>
        }
        meta={<DemoTag />}
        tabs={
          <Tabs value={tab} onValueChange={(next) => setTab(next as BountyTab)} variant="underline">
            <TabsList aria-label="Bounty status">
              <TabsTrigger value="live" count={ready ? tabCount("live") : undefined}>
                Live
              </TabsTrigger>
              <TabsTrigger value="draft" count={ready ? tabCount("draft") : undefined}>
                Draft
              </TabsTrigger>
              <TabsTrigger value="filled" count={ready ? tabCount("filled") : undefined}>
                Filled
              </TabsTrigger>
              <TabsTrigger value="ended" count={ready ? tabCount("ended") : undefined}>
                Ended
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <DataTable
        caption={`${tab} bounties`}
        columns={columns}
        rows={paged.pageRows}
        manualSort
        sort={paged.sort}
        onSortChange={paged.setSort}
        getRowId={(b) => b.id}
        getRowLabel={(b) => b.title}
        loading={!ready}
        loadingRows={5}
        selectable={tab === "live" || tab === "filled"}
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={(ids) => (
          <Button variant="secondary" size="sm" leadingIcon={<Pause aria-hidden="true" />} onClick={() => void pause(ids)}>
            Pause {ids.length === 1 ? "bounty" : `${ids.length} bounties`}
          </Button>
        )}
        rowActions={rowActions}
        onRowClick={(b) => router.push(b.status === "draft" ? `/brand/bounties/new?draft=${b.id}` : `/brand/bounties/${b.id}`)}
        toolbar={
          <div className="flex flex-wrap items-center gap-3 px-1 pb-1">
            <div className="min-w-0 flex-1 basis-60">
              <SearchInput value={query} onValueChange={setQuery} placeholder="Search bounties, apps and briefs" aria-label="Search bounties" />
            </div>
            {apps.length > 1 ? (
              <div className="w-full sm:w-44">
                <Select aria-label="Filter by app" options={appOptions} value={appFilter} onValueChange={setAppFilter} />
              </div>
            ) : null}
            <div className="w-full sm:w-48">
              <Select aria-label="Filter by pay type" options={typeOptions} value={typeFilter} onValueChange={(next) => setTypeFilter(next as BountyType | "all")} />
            </div>
          </div>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
            <p className="flex items-center gap-2 text-caption text-fg-subtle">
              <SourceChip kind="tracked" />
              Cost per trial counts Tracked trials only.
            </p>
            {paged.total > PAGE_SIZE ? <Pagination page={paged.page} pageCount={paged.pageCount} onPageChange={paged.setPage} total={paged.total} pageSize={PAGE_SIZE} noun="bounties" /> : null}
          </div>
        }
        empty={{
          art: filtered ? "search" : "bounty",
          title: filtered ? "No bounties match" : TAB_EMPTY[tab].title,
          description: filtered ? "Clear the search or the filters to see every bounty in this tab." : TAB_EMPTY[tab].description,
          action: filtered ? (
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setAppFilter("all");
                setTypeFilter("all");
              }}
            >
              Clear filters
            </Button>
          ) : tab === "live" || tab === "draft" ? (
            <Link href="/brand/bounties/new" className={cn(buttonVariants({ variant: "primary", size: "md" }))}>
              <CirclePlus aria-hidden="true" />
              Start a bounty
            </Link>
          ) : undefined,
        }}
      />
      <p className="sr-only" aria-live="polite">
        {ready ? `${pluralise(paged.total, "bounty")} in ${tab}` : ""}
      </p>
    </div>
  );
}
