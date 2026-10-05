"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, Hourglass, PauseCircle, ScanSearch, Timer } from "lucide-react";
import type { PostStatus } from "@/lib/contract/types";
import { HOLD_REASON_META } from "@/lib/contract/types";
import { useDemoNow, usePosts, useStoreReady } from "@/lib/data";
import type { PostView } from "@/lib/data/selectors";
import { formatClockEta, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArtAvatar } from "@/components/brand/avatar";
import { StatusPill } from "@/components/ui/badge";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Money } from "@/components/ui/money";
import { DataTable, type DataColumn } from "@/components/shell/data-table";
import { Pagination } from "@/components/shell/pagination";
import { usePagedRows } from "../use-paged-rows";
import { buttonVariants } from "@/components/ui/button-variants";

const PAGE_SIZE = 12;

type Stage = "window" | "check" | "held" | "cleared" | "paid" | "reversed";

const STAGES: readonly { id: Stage; label: string; hint: string; icon: typeof Timer; statuses: readonly PostStatus[] }[] = [
  { id: "window", label: "Views counting", hint: "72-hour window open", icon: Timer, statuses: ["live"] },
  { id: "check", label: "Fraud and compliance check", hint: "Window closed, checks running", icon: ScanSearch, statuses: ["window_closed"] },
  { id: "held", label: "On hold", hint: "A reason is named on each row", icon: PauseCircle, statuses: ["held"] },
  { id: "cleared", label: "Cleared", hint: "Waiting for the weekly payout", icon: CircleCheck, statuses: ["cleared"] },
  { id: "paid", label: "Paid out", hint: "Included in a payout", icon: Hourglass, statuses: ["paid"] },
];

const stageOf = (post: PostView): Stage | "reversed" =>
  post.status === "live" ? "window" : post.status === "window_closed" ? "check" : post.status === "held" ? "held" : post.status === "cleared" ? "cleared" : post.status === "paid" ? "paid" : "reversed";

const STATUS_KEY: Record<PostStatus, string> = { live: "window_open", window_closed: "window_closed", held: "held", cleared: "cleared", paid: "paid", removed: "closed", clawed_back: "clawed_back" };

/**
 * Settlement runs: where every post is between "posted" and "paid". The pipeline counts the posts and the creator pay in each stage; pick a stage
 * to filter the per-post rows. Each row says when the 72-hour window closes, when the pay clears, and for a hold, why. Pay is settled out of
 * escrow once a post clears; an approved post is paid even if the pool has run out.
 */
export function SettlementTab() {
  const ready = useStoreReady();
  const now = useDemoNow();
  const router = useRouter();
  const posts = usePosts({ brand: "mine" });
  const [stage, setStage] = useState<Stage | "all">("all");

  const summary = useMemo(() => {
    const map = new Map<Stage | "reversed", { count: number; cents: number }>();
    for (const post of posts) {
      const key = stageOf(post);
      const entry = map.get(key) ?? { count: 0, cents: 0 };
      entry.count += 1;
      entry.cents += post.earnings.total_cents;
      map.set(key, entry);
    }
    return map;
  }, [posts]);

  const rows = useMemo(() => posts.filter((post) => stage === "all" || stageOf(post) === stage), [posts, stage]);

  const columns: DataColumn<PostView>[] = useMemo(() => [
    {
      id: "post",
      header: "Post",
      label: "Post",
      card: "title",
      minWidth: "15rem",
      sortValue: (p) => p.creator.handle,
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-3">
          <ArtAvatar art={p.creator.avatar} name={p.creator.display_name} size={32} decorative />
          <span className="grid min-w-0">
            <span className="truncate font-semibold text-fg">@{p.creator.handle}</span>
            <span className="truncate text-caption text-fg-subtle">{p.bounty.title}</span>
          </span>
        </span>
      ),
    },
    { id: "stage", header: "Stage", card: "subtitle", sortValue: (p) => p.status, cell: (p) => <StatusPill status={STATUS_KEY[p.status]} size="md" /> },
    {
      id: "window",
      header: "Window closes",
      card: "meta",
      hideBelow: "lg",
      sortValue: (p) => p.window_ends_at,
      cell: (p) => <span className="text-fg-muted">{formatDateTime(p.window_ends_at)}</span>,
    },
    {
      id: "clears",
      header: "Money",
      card: "meta",
      wrap: true,
      minWidth: "14rem",
      cell: (p) =>
        p.status === "held" && p.hold_reason ? (
          <span className="text-fg-muted">Held: {HOLD_REASON_META[p.hold_reason].label}</span>
        ) : p.money?.eta_label ? (
          <span className="text-fg-muted">{p.money.eta_label}</span>
        ) : p.cleared_at ? (
          <span className="text-fg-muted">Cleared {formatClockEta(p.cleared_at, { now })}</span>
        ) : (
          <span className="text-fg-subtle">Counting views</span>
        ),
    },
    { id: "pay", header: "Creator pay", align: "end", card: "value", sortValue: (p) => p.earnings.total_cents, cell: (p) => <Money cents={p.earnings.total_cents} size="inherit" decimals="always" /> },
  ], [now]);
  const paged = usePagedRows(rows, columns, PAGE_SIZE, { id: "window", direction: "desc" });

  return (
    <div className="grid gap-5">
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Settlement pipeline">
        {STAGES.map((item, index) => {
          const entry = summary.get(item.id) ?? { count: 0, cents: 0 };
          const Icon = item.icon;
          const active = stage === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setStage(active ? "all" : item.id)}
                className={cn(
                  "grid h-full w-full content-start gap-2 rounded-[22px] bg-surface-field p-4 text-left shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-[box-shadow,background-color] duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover active:scale-[0.99]",
                  active && "bg-surface-hover shadow-[inset_0_0_0_1.5px_var(--fd-accent-bright)]",
                )}
              >
                <span className="flex items-center gap-2 text-caption font-semibold text-fg-muted">
                  <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-surface-active font-display text-micro font-bold tabular-nums">
                    {index + 1}
                  </span>
                  <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="font-display text-figure-md text-fg tabular-nums">{ready ? entry.count : "–"}</span>
                <span className="text-caption text-fg-subtle">
                  {item.hint}
                  {ready && entry.cents > 0 ? (
                    <>
                      {" · "}
                      <Money cents={entry.cents} size="inherit" decimals="auto" className="text-caption font-medium" />
                    </>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <ChipGroup aria-label="Filter by stage">
          <Chip selected={stage === "all"} onSelectedChange={() => setStage("all")} count={posts.length}>
            All posts
          </Chip>
          {(summary.get("reversed")?.count ?? 0) > 0 ? (
            <Chip selected={stage === "reversed"} onSelectedChange={(on) => setStage(on ? "reversed" : "all")} count={summary.get("reversed")?.count}>
              Removed or clawed back
            </Chip>
          ) : null}
        </ChipGroup>
        <Link href="/brand/review" className={cn(buttonVariants({ variant: "plain", size: "xs" }), "ml-auto text-fg-muted")}>
          Videos waiting for your decision
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
      <DataTable
        caption="Posts and where their money is"
        columns={columns}
        rows={paged.pageRows}
        manualSort
        sort={paged.sort}
        onSortChange={paged.setSort}
        footer={paged.total > PAGE_SIZE ? <Pagination page={paged.page} pageCount={paged.pageCount} onPageChange={paged.setPage} total={paged.total} pageSize={PAGE_SIZE} noun="posts" /> : undefined}
        getRowId={(p) => p.id}
        getRowLabel={(p) => `@${p.creator.handle}, ${p.bounty.title}`}
        loading={!ready}
        loadingRows={6}
        onRowClick={(p) => router.push(`/brand/bounties/${p.bounty_id}?tab=submissions`)}
        empty={{
          art: "chart",
          title: stage === "all" ? "No posts yet" : "No posts in this stage",
          description: stage === "all" ? "Once a creator posts an approved video, its 72-hour window, fraud check and clearing show here." : "Pick another stage, or clear the filter to see every post.",
        }}
      />
    </div>
  );
}
