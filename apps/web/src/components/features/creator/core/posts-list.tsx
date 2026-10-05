"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PLATFORM_META } from "@/lib/contract/types";
import { usePosts, useStoreReady } from "@/lib/data";
import type { PostView } from "@/lib/data/selectors";
import { formatCompact, formatPct } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { Thumb } from "@/components/brand";
import { Sparkline } from "@/components/charts";
import { GlassCard } from "@/components/glass";
import { PageHeader } from "@/components/shell";
import { Button, Chip, ChipGroup, EmptyState, SearchInput, Select, Skeleton, SkeletonGroup, buttonVariants } from "@/components/ui";
import { Amount } from "./amount";
import { PostStatusPill, WindowBar, moneyStateOf, retentionLine } from "./post-parts";
import { useUrlState } from "./use-url-state";

const FILTERS = [
  { id: "all", label: "All", statuses: null },
  { id: "live", label: "Live", statuses: ["live"] },
  { id: "closed", label: "Window closed", statuses: ["window_closed", "held"] },
  { id: "cleared", label: "Cleared", statuses: ["cleared"] },
  { id: "paid", label: "Paid", statuses: ["paid"] },
  { id: "removed", label: "Removed", statuses: ["removed", "clawed_back"] },
] as const satisfies readonly { id: string; label: string; statuses: readonly string[] | null }[];
type FilterId = (typeof FILTERS)[number]["id"];

function PostCard({ post }: { post: PostView }) {
  const spark = post.retention.curve;
  return (
    <GlassCard padding="none" className="group relative grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 overflow-hidden p-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-5 sm:p-4">
      <Thumb art={post.thumb} hook={post.tags.hook_words} aspect="4:5" app={{ name: post.app.name, art: post.app.icon }} radius="lg" durationSec={Math.round(post.duration_ms / 1000)} label={`${post.tags.hook_words}, ${post.app.name}`} />
      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PostStatusPill status={post.status} />
          <span className="text-caption text-fg-subtle">{PLATFORM_META[post.platform].label}</span>
        </div>
        <div className="grid gap-0.5">
          <h3 className="font-display text-title-sm text-fg">
            <Link href={`/creator/posts/${post.id}`} className="line-clamp-2 rounded-sm after:absolute after:inset-0 after:content-['']">
              {post.bounty.title}
            </Link>
          </h3>
          <p className="truncate text-caption text-fg-muted">
            {post.app.name} · “{post.tags.hook_words}…”
          </p>
        </div>
        <WindowBar post={post} />
        <dl className="grid grid-cols-3 gap-2 text-caption">
          <div className="grid gap-0.5">
            <dt className="text-micro text-fg-subtle">Verified views</dt>
            <dd className="font-display text-figure-md text-fg tabular-nums">{formatCompact(post.window.is_open ? post.views : post.window_views)}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-micro text-fg-subtle">Installs · trials</dt>
            <dd className="font-display text-figure-md text-fg tabular-nums">
              {post.funnel.installs} · {post.funnel.trials}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-micro text-fg-subtle">Earned</dt>
            <dd>
              <Amount cents={post.earnings.total_cents} size="md" state={moneyStateOf(post.status)} decimals="auto" />
            </dd>
          </div>
        </dl>
        {post.money?.eta_label ? <p className="text-caption text-fg-muted">{post.money.eta_label}. {post.money.reason_label}.</p> : null}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Sparkline data={spark} tone="neutral" height={24} className="w-20 shrink-0" label={retentionLine(post)} />
            <p className="hidden truncate text-micro text-fg-subtle md:block">{formatPct(post.retention.avg_watch_ratio, 0)} watched on average</p>
          </div>
          <span className="inline-flex items-center gap-1 text-caption font-semibold text-accent">
            Open
            <ArrowRight aria-hidden="true" className="size-3.5 transition-transform duration-(--fd-dur-fast) ease-standard group-hover:translate-x-0.5" strokeWidth={2.25} />
          </span>
        </div>
      </div>
    </GlassCard>
  );
}

/** `/creator/posts`: your posts with views, installs, trials and earnings, each with its state and when the money lands. */
export function PostsList() {
  const ready = useStoreReady();
  const url = useUrlState();
  const sortParam = url.get("sort");
  const sort = sortParam === "views" || sortParam === "earnings" ? sortParam : "newest";
  const posts = usePosts({ creator: "mine", sort });
  const filterParam = url.get("filter");
  const filter: FilterId = FILTERS.some((f) => f.id === filterParam) ? (filterParam as FilterId) : "all";
  const [text, setText] = useState(url.get("q") ?? "");
  const q = useDebouncedValue(text, 200).trim().toLowerCase();
  const [shown, setShown] = useState(12);

  const counts = useMemo(() => new Map(FILTERS.map((f) => [f.id, f.statuses === null ? posts.length : posts.filter((p) => (f.statuses as readonly string[]).includes(p.status)).length])), [posts]);
  const rows = useMemo(() => {
    const spec = FILTERS.find((f) => f.id === filter);
    return posts.filter((p) => (spec?.statuses ? (spec.statuses as readonly string[]).includes(p.status) : true) && (!q || `${p.bounty.title} ${p.app.name} ${p.tags.hook_words} ${p.caption}`.toLowerCase().includes(q)));
  }, [posts, filter, q]);

  const live = posts.filter((p) => p.window.is_open).length;
  const views = posts.reduce((sum, p) => sum + (p.window.is_open ? p.views : p.window_views), 0);
  const pending = posts.filter((p) => moneyStateOf(p.status) === "pending").reduce((sum, p) => sum + p.earnings.total_cents, 0);
  const settled = posts.filter((p) => p.status === "cleared" || p.status === "paid").reduce((sum, p) => sum + p.earnings.total_cents, 0);

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Posts" title="Your posts and what they earned" description="Views count for 72 hours, then a view check, then the money clears. Every number here comes from the View Ledger, with the verified count apart from what the platform reported." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Live now", node: <span className="font-display text-figure-lg text-fg tabular-nums">{live}</span>, hint: "views still counting" },
          { label: "Verified views", node: <span className="font-display text-figure-lg text-fg tabular-nums">{formatCompact(views)}</span>, hint: "across all your posts" },
          { label: "Pending on posts", node: <Amount cents={pending} size="lg" state="pending" decimals="auto" />, hint: "still inside the view window or the check" },
          { label: "Cleared and paid", node: <Amount cents={settled} size="lg" state="cleared" decimals="auto" />, hint: "from posts that finished settling" },
        ].map((tile) => (
          <GlassCard key={tile.label} className="grid gap-1" padding="md">
            <p className="text-caption font-medium text-fg-muted">{tile.label}</p>
            {ready ? tile.node : <Skeleton className="h-9 w-20" />}
            <p className="text-caption text-fg-subtle">{tile.hint}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard padding="sm" className="grid gap-3" role="search" aria-label="Filter posts">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
          <SearchInput
            value={text}
            onValueChange={(value) => {
              setText(value);
              url.set({ q: value || null });
            }}
            onClear={() => setText("")}
            placeholder="Search by bounty, app or hook"
            aria-label="Search posts"
          />
          <Select aria-label="Sort" value={sort} onValueChange={(value) => url.set({ sort: value === "newest" ? null : value })} options={[{ value: "newest", label: "Newest first" }, { value: "views", label: "Most views" }, { value: "earnings", label: "Most earned" }]} />
        </div>
        <ChipGroup aria-label="State">
          {FILTERS.map((f) => (
            <Chip key={f.id} selected={filter === f.id} count={counts.get(f.id)} onSelectedChange={() => url.set({ filter: f.id === "all" ? null : f.id })}>
              {f.label}
            </Chip>
          ))}
        </ChipGroup>
      </GlassCard>

      {!ready ? (
        <SkeletonGroup label="Loading posts" className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-60 rounded-[28px]" />
          ))}
        </SkeletonGroup>
      ) : rows.length === 0 ? (
        <GlassCard>
          <EmptyState
            art="video"
            title={posts.length === 0 ? "No posts yet" : "Nothing in this view"}
            description={posts.length === 0 ? "When a video is approved you post it on your own account and attach it here. The 72-hour view window starts then." : "Try another state, or clear the search."}
            action={
              posts.length === 0 ? (
                <Link href="/creator/feed" className={buttonVariants({ variant: "primary" })}>
                  Find a bounty
                </Link>
              ) : (
                <Link href="/creator/posts" className={buttonVariants({ variant: "secondary" })}>
                  Show everything
                </Link>
              )
            }
          />
        </GlassCard>
      ) : (
        <ul className={cn("grid gap-3 lg:grid-cols-2")} aria-label={`${rows.length} posts`}>
          {rows.slice(0, shown).map((post) => (
            <li key={post.id} className="grid">
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}

      {rows.length > shown ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setShown((count) => count + 12)}>
            Show {Math.min(12, rows.length - shown)} more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
