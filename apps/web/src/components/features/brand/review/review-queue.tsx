"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Keyboard, ShieldAlert, Zap } from "lucide-react";
import type { ArtSeed } from "@/lib/contract/types";
import { useBrandScorecard, useReviewQueue, useStoreReady, useSubmissionAnalysis } from "@/lib/data";
import type { SubmissionView } from "@/lib/data/selectors";
import { formatHours, formatMoney, pluralise } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArtAvatar } from "@/components/brand";
import { GlassCard } from "@/components/glass/glass";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Kbd } from "@/components/ui/kbd";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonGroup, SkeletonRow } from "@/components/ui/skeleton";
import { notify } from "@/components/ui/toast";
import { ChangesDialog, DuplicateOverrideDialog, RejectDialog } from "./decision-dialogs";
import { undoLatestDecision, useHeldSubmissionIds } from "./decisions";
import { MiniStat } from "./parts";
import { QueuePreview } from "./queue-preview";
import { useQueueInsights } from "./queue-data";
import { needsCloserLook, QueueRow } from "./queue-row";
import { approveVideos, rejectVideo, requestChanges } from "./review-actions";
import { clearSnoozed, snooze, unsnooze, useSnoozedIds } from "./session-state";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { useUrlChoice, useUrlText } from "./url-state";
import { useReviewKeys } from "./use-review-keys";

const FILTERS = ["all", "flagged", "stale", "breached", "first"] as const;
type Filter = (typeof FILTERS)[number];
const SORTS = ["queue", "oldest", "decide_by"] as const;
type Sort = (typeof SORTS)[number];

const SORT_OPTIONS = [
  { value: "queue", label: "Review order", description: "Flagged first, then lower Flow band, then oldest" },
  { value: "oldest", label: "Oldest first" },
  { value: "decide_by", label: "Decide by" },
] as const;

const isDuplicate = (v: SubmissionView): boolean => v.fraud_evidence.duplicate_of_submission_id !== undefined;

function matchesFilter(v: SubmissionView, filter: Filter): boolean {
  switch (filter) {
    case "flagged":
      return needsCloserLook(v);
    case "stale":
      return v.review?.state === "stale" || v.review?.state === "breached";
    case "breached":
      return v.review?.state === "breached";
    case "first":
      return v.creator.approved_count === 0;
    default:
      return true;
  }
}

type DialogTarget = { kind: "reject" | "changes"; id: string; ms: number } | { kind: "override"; id: string } | null;

/**
 * The review queue: the highest-frequency screen in the product, so it is a keyboard tool first. J and K move, A approves, F asks
 * for changes, R rejects (a reason and evidence are mandatory), Space plays the preview and a flag seeks to its moment. Videos that
 * pass every check are grouped so they can be approved together, and every decision has 10 seconds of undo instead of a confirm
 * dialog. Nothing animates except the 120 ms collapse of a decided row. No confetti: approving is a calm act.
 */
export function ReviewQueue() {
  const router = useRouter();
  const ready = useStoreReady();
  const [filter, setFilter] = useUrlChoice<Filter>("filter", FILTERS, "all");
  const [sort, setSort] = useUrlChoice<Sort>("sort", SORTS, "queue");
  const [query, setQuery] = useUrlText("q");
  const queue = useReviewQueue({ sort, ...(query.trim() ? { q: query.trim() } : {}) });
  const scorecard = useBrandScorecard();
  const insights = useQueueInsights();
  const held = useHeldSubmissionIds();
  const snoozed = useSnoozedIds();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [target, setTarget] = useState<DialogTarget>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const waitingItems = useMemo(() => queue.items.filter((v) => !held.has(v.id)), [queue.items, held]);
  const snoozedCount = waitingItems.filter((v) => snoozed.has(v.id)).length;
  const visible = useMemo(() => waitingItems.filter((v) => (showSnoozed || !snoozed.has(v.id)) && matchesFilter(v, filter)), [waitingItems, snoozed, showSnoozed, filter]);
  const needs = useMemo(() => visible.filter(needsCloserLook), [visible]);
  const clean = useMemo(() => visible.filter((v) => !needsCloserLook(v)), [visible]);
  const rows = useMemo(() => [...needs, ...clean], [needs, clean]);

  const activeIndex = Math.max(0, rows.findIndex((v) => v.id === activeId));
  const active = rows[activeIndex];
  const analysis = useSubmissionAnalysis(active?.id);

  const selectedRows = useMemo(() => rows.filter((v) => selected.has(v.id)), [rows, selected]);
  const targetSub = target ? queue.items.find((v) => v.id === target.id) : undefined;
  const targetAnalysis = useSubmissionAnalysis(target?.id);
  const overlayOpen = target !== null || helpOpen;

  // The active row stays in view as J and K move it.
  const activeKey = active?.id;
  useEffect(() => {
    if (activeKey) document.getElementById(`review-row-${activeKey}`)?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  const moveTo = (index: number): void => {
    const next = rows[Math.min(rows.length - 1, Math.max(0, index))];
    if (next) setActiveId(next.id);
  };
  const sectionStarts = needs.length > 0 && clean.length > 0 ? [0, needs.length] : [0];
  const jumpSection = (dir: 1 | -1): void => {
    if (dir === 1) {
      const next = sectionStarts.find((start) => start > activeIndex);
      if (next !== undefined) moveTo(next);
      return;
    }
    const here = [...sectionStarts].reverse().find((start) => start <= activeIndex) ?? 0;
    const previous = [...sectionStarts].reverse().find((start) => start < here);
    moveTo(here < activeIndex ? here : (previous ?? 0));
  };

  /** After a video is decided or snoozed the cursor moves to its neighbour, so the keyboard flow never stops. */
  const advanceFrom = (ids: readonly string[]): void => {
    const gone = new Set(ids);
    const remaining = rows.filter((v) => !gone.has(v.id));
    const here = Math.max(0, rows.findIndex((v) => v.id === active?.id));
    setActiveId(remaining[Math.min(here, remaining.length - 1)]?.id ?? null);
    setSelected((current) => new Set([...current].filter((id) => !gone.has(id))));
  };

  const approve = (videos: readonly SubmissionView[]): void => {
    const plain = videos.filter((v) => !isDuplicate(v));
    const needOverride = videos.length - plain.length;
    const first = videos[0];
    if (videos.length === 1 && needOverride === 1 && first) {
      setTarget({ kind: "override", id: first.id });
      return;
    }
    if (needOverride > 0) notify.info(`${needOverride} ${needOverride === 1 ? "video matches" : "videos match"} another and needs a reason`, { description: "Open it on its own to approve it." });
    if (plain.length === 0) return;
    advanceFrom(plain.map((v) => v.id));
    approveVideos(plain);
  };

  const approveSelectedOrPassing = (): void => {
    const list = selectedRows.length > 0 ? selectedRows : clean;
    if (list.length === 0) {
      notify.message("Nothing passes every check right now", { description: "Videos with a flag are approved one at a time, after a look." });
      return;
    }
    approve(list);
  };

  const snoozeIds = (ids: readonly string[]): void => {
    if (ids.length === 0) return;
    advanceFrom(ids);
    snooze(ids);
    notify.undo(ids.length === 1 ? "Snoozed. Hidden here for now." : `Snoozed ${ids.length} videos`, {
      description: "Their 72-hour clock keeps running.",
      onUndo: () => unsnooze(ids),
    });
  };

  const toggleSelect = (id: string, on: boolean): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  useReviewKeys(
    {
      j: () => moveTo(activeIndex + 1),
      k: () => moveTo(activeIndex - 1),
      "]": () => jumpSection(1),
      "[": () => jumpSection(-1),
      enter: (event) => {
        if (!active || (event.target instanceof Element && event.target.closest("a, button, [role='checkbox'], [role='slider']"))) return false;
        router.push(`/brand/review/${active.id}`);
      },
      a: () => {
        if (active) approve([active]);
      },
      "shift+a": approveSelectedOrPassing,
      f: () => {
        if (active) setTarget({ kind: "changes", id: active.id, ms: 0 });
      },
      r: () => {
        if (active) setTarget({ kind: "reject", id: active.id, ms: 0 });
      },
      v: () => {
        if (active) toggleSelect(active.id, !selected.has(active.id));
      },
      s: () => snoozeIds(selectedRows.length > 0 ? selectedRows.map((v) => v.id) : active ? [active.id] : []),
      z: () => (undoLatestDecision() ? undefined : false),
      "mod+z": () => (undoLatestDecision() ? undefined : false),
      "?": () => setHelpOpen(true),
      "/": () => searchRef.current?.focus(),
      escape: () => {
        if (selected.size === 0) return false;
        setSelected(new Set());
      },
    },
    { enabled: !overlayOpen },
  );

  const counts = queue.counts;
  const median = scorecard && !scorecard.new_brand ? scorecard.decision_hours_median : null;
  const announcement = active ? `${activeIndex + 1} of ${rows.length}. @${active.creator.handle}, ${active.title}. Flow Score ${active.flow_band}. ${active.qa.fail} failed and ${active.qa.warn} warning checks.` : "";

  const renderRow = (v: SubmissionView): ReactNode => (
    <QueueRow
      item={v}
      insight={insights[v.id]}
      active={active?.id === v.id}
      selected={selected.has(v.id)}
      onSelectedChange={(on) => toggleSelect(v.id, on)}
      onActivate={() => {
        if (window.matchMedia("(min-width: 1024px)").matches) setActiveId(v.id);
        else router.push(`/brand/review/${v.id}`);
      }}
      onApprove={() => approve([v])}
      onChanges={() => setTarget({ kind: "changes", id: v.id, ms: 0 })}
      onReject={() => setTarget({ kind: "reject", id: v.id, ms: 0 })}
    />
  );

  const header = (
    <PageHeader
      eyebrow="Review"
      title="Review queue"
      description="Every video gets a decision within 72 hours, and creators see how fast you decide. Clear what passes in one go, and give the rest a proper look."
      actions={
        <>
          <Link href="/brand/review/rules" className={buttonVariants({ variant: queue.active_rules > 0 ? "secondary" : "ghost", size: "sm" })}>
            <Zap aria-hidden="true" />
            {queue.active_rules > 0 ? `Auto-approve on · ${pluralise(queue.active_rules, "rule")}` : "Auto-approve is off"}
          </Link>
          <Button variant="ghost" size="sm" leadingIcon={<Keyboard />} onClick={() => setHelpOpen(true)} aria-keyshortcuts="?">
            Shortcuts
            <Kbd size="sm">?</Kbd>
          </Button>
        </>
      }
    />
  );

  if (!ready) {
    return (
      <div className="grid gap-8">
        {header}
        <QueueSkeleton />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {header}

      <GlassCard padding="sm" aria-label="Queue summary" className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        <MiniStat label="Waiting" value={waitingItems.length} hint={waitingItems.length === 0 ? "Inbox zero" : waitingItems.length === 1 ? "video" : "videos"} />
        <MiniStat label="Oldest" value={counts.oldest_hours === null ? "None" : formatHours(counts.oldest_hours)} hint="in the queue" />
        <MiniStat label="Stale, 48 h or more" value={counts.stale} tone={counts.stale > 0 ? "ember" : undefined} hint={counts.stale > 0 ? "decide these next" : "none"} />
        <MiniStat label="Past 72 hours" value={counts.breached} tone={counts.breached > 0 ? "rose" : undefined} hint={counts.breached > 0 ? "creators can see this" : "none"} />
        <MiniStat label="Your median decision" value={median === null ? "New brand" : formatHours(median)} hint={`${counts.auto_approved_today} auto-approved today`} />
      </GlassCard>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23.5rem]">
        <section aria-label="Videos waiting for a decision" className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput ref={searchRef} aria-label="Search the queue" size="sm" placeholder="Search creator, video or bounty" shortcut={["/"]} value={query} onValueChange={setQuery} containerClassName="w-full sm:w-72" />
            <Select size="sm" aria-label="Sort the queue" value={sort} onValueChange={(next) => setSort(next as Sort)} options={SORT_OPTIONS} className="w-44" />
            <p className="ml-auto text-caption text-fg-subtle tabular-nums" aria-live="polite">
              {rows.length === waitingItems.length ? pluralise(rows.length, "video") : `${rows.length} of ${waitingItems.length} videos`}
            </p>
          </div>
          <ChipGroup aria-label="Filter the queue">
            <Chip size="sm" selected={filter === "all"} onSelectedChange={() => setFilter("all")}>
              All
            </Chip>
            <Chip size="sm" selected={filter === "flagged"} count={waitingItems.filter(needsCloserLook).length} onSelectedChange={() => setFilter(filter === "flagged" ? "all" : "flagged")}>
              Needs a look
            </Chip>
            <Chip size="sm" selected={filter === "stale"} count={waitingItems.filter((v) => matchesFilter(v, "stale")).length} onSelectedChange={() => setFilter(filter === "stale" ? "all" : "stale")}>
              Stale
            </Chip>
            <Chip size="sm" selected={filter === "breached"} count={waitingItems.filter((v) => matchesFilter(v, "breached")).length} onSelectedChange={() => setFilter(filter === "breached" ? "all" : "breached")}>
              Past 72 h
            </Chip>
            <Chip size="sm" selected={filter === "first"} count={waitingItems.filter((v) => matchesFilter(v, "first")).length} onSelectedChange={() => setFilter(filter === "first" ? "all" : "first")}>
              First video
            </Chip>
          </ChipGroup>

          <GlassCard padding="none" className="overflow-hidden">
            {selectedRows.length > 0 ? (
              <div role="region" aria-label="Selection" className="flex flex-wrap items-center gap-3 border-b border-divider bg-accent-soft px-4 py-2.5">
                <p className="text-body-sm font-semibold text-fg tabular-nums">{selectedRows.length} selected</p>
                <Button size="xs" variant="primary" leadingIcon={<Check />} onClick={() => approve(selectedRows)}>
                  Approve {selectedRows.length}
                </Button>
                <Button size="xs" variant="secondary" onClick={() => snoozeIds(selectedRows.map((v) => v.id))}>
                  Snooze
                </Button>
                <button type="button" onClick={() => setSelected(new Set())} className="ml-auto rounded-md px-1.5 py-1 text-caption font-medium text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg">
                  Clear selection
                </button>
              </div>
            ) : null}

            {rows.length === 0 ? (
              <div className="px-4 py-6">
                {waitingItems.length === 0 && snoozedCount === 0 ? (
                  <EmptyState
                    art="inbox"
                    title="Inbox zero. Every submission has a decision."
                    description={`Creators see how fast you decide${median !== null ? `: about ${formatHours(median)} at the median` : ""}. ${counts.auto_approved_today} auto-approved today.`}
                    action={
                      <Link href="/brand/bounties" className={buttonVariants({ variant: "primary" })}>
                        See your bounties
                      </Link>
                    }
                    secondaryAction={
                      <Link href="/brand/review/rules" className={buttonVariants({ variant: "ghost" })}>
                        Auto-approve rules
                      </Link>
                    }
                  />
                ) : (
                  <EmptyState
                    art="search"
                    title="No videos match"
                    description={query.trim() ? `Nothing in the queue matches “${query.trim()}”.` : snoozedCount > 0 && filter === "all" ? "Everything left is snoozed." : "Nothing in the queue fits this filter."}
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setFilter("all");
                          setQuery("");
                          setShowSnoozed(true);
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                )}
              </div>
            ) : (
              <>
                <QueueGroup title="Needs a closer look" note="A check flagged these, they match another video, or the creator's views are under review." rows={needs} renderRow={renderRow} />
                <QueueGroup
                  title="Passes every check"
                  note="Safe to approve together."
                  rows={clean}
                  renderRow={renderRow}
                  separated={needs.length > 0}
                  action={
                    clean.length > 1 ? (
                      <Button size="xs" variant="secondary" leadingIcon={<Check />} onClick={() => approve(clean)}>
                        Approve all {clean.length}
                        <Kbd size="sm">⇧A</Kbd>
                      </Button>
                    ) : undefined
                  }
                />
              </>
            )}
          </GlassCard>

          {snoozedCount > 0 ? (
            <p className="px-1 text-caption text-fg-subtle">
              {snoozedCount} snoozed. Snoozing hides a video here only, and its 72-hour clock keeps running.{" "}
              <button type="button" className="font-medium text-accent hover:underline" onClick={() => setShowSnoozed(!showSnoozed)}>
                {showSnoozed ? "Hide them" : "Show them"}
              </button>
              {showSnoozed ? (
                <>
                  {" · "}
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => clearSnoozed()}>
                    Unsnooze all
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </section>

        <aside aria-label="Preview" className="hidden lg:sticky lg:top-24 lg:block">
          <GlassCard padding="md" className="max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain">
            {active ? (
              <QueuePreview
                key={active.id}
                item={active}
                analysis={analysis}
                keysEnabled={!overlayOpen}
                onApprove={() => approve([active])}
                onChanges={(ms) => setTarget({ kind: "changes", id: active.id, ms })}
                onReject={(ms) => setTarget({ kind: "reject", id: active.id, ms })}
              />
            ) : (
              <EmptyState size="sm" art="video" title="Pick a video" description="Move with J and K. The preview, its flags and your decisions appear here." />
            )}
          </GlassCard>
        </aside>
      </div>

      {queue.fraud_hold.length > 0 ? <FraudHoldLane lane={queue.fraud_hold} /> : null}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <RejectDialog
        open={target?.kind === "reject"}
        onOpenChange={(open) => !open && setTarget(null)}
        submission={target?.kind === "reject" ? targetSub : undefined}
        analysis={targetAnalysis.current}
        currentMs={target?.kind === "reject" ? target.ms : 0}
        onSubmit={(payload) => {
          if (!targetSub) return;
          setTarget(null);
          advanceFrom([targetSub.id]);
          rejectVideo(targetSub, payload);
        }}
      />
      <ChangesDialog
        open={target?.kind === "changes"}
        onOpenChange={(open) => !open && setTarget(null)}
        submission={target?.kind === "changes" ? targetSub : undefined}
        analysis={targetAnalysis.current}
        currentMs={target?.kind === "changes" ? target.ms : 0}
        onSubmit={(payload) => {
          if (!targetSub) return;
          setTarget(null);
          advanceFrom([targetSub.id]);
          requestChanges(targetSub, payload);
        }}
      />
      <DuplicateOverrideDialog
        open={target?.kind === "override"}
        onOpenChange={(open) => !open && setTarget(null)}
        submission={target?.kind === "override" ? targetSub : undefined}
        onSubmit={(reason) => {
          if (!targetSub) return;
          setTarget(null);
          advanceFrom([targetSub.id]);
          approveVideos([targetSub], reason);
        }}
      />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} screen="queue" />
    </div>
  );
}

interface QueueGroupProps {
  title: string;
  note: string;
  rows: readonly SubmissionView[];
  renderRow: (v: SubmissionView) => ReactNode;
  action?: ReactNode;
  separated?: boolean;
}

/** One group of rows with its heading. A decided row collapses in 120 ms and leaves; nothing else on this screen animates. */
function QueueGroup({ title, note, rows, renderRow, action, separated }: QueueGroupProps) {
  const reduce = useReducedMotion();
  if (rows.length === 0) return null;
  return (
    <section aria-label={title}>
      <header className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-divider bg-surface-field px-4 py-2.5", separated && "border-t")}>
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="shrink-0 font-display text-body-sm font-bold whitespace-nowrap text-fg">{title}</h2>
          <span className="shrink-0 text-caption font-semibold text-fg-muted tabular-nums">{rows.length}</span>
          <span className="hidden min-w-0 truncate text-caption text-fg-subtle xl:inline">{note}</span>
        </div>
        {action}
      </header>
      <ul className="divide-y divide-divider">
        <AnimatePresence initial={false}>
          {rows.map((v) => (
            <motion.li key={v.id} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduce ? 0.01 : 0.12, ease: [0.23, 1, 0.32, 1] }} style={{ overflow: "hidden" }}>
              {renderRow(v)}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function QueueSkeleton() {
  return (
    <div className="grid gap-6">
      <GlassCard padding="md" className="grid grid-cols-2 gap-6 lg:grid-cols-5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="grid gap-2">
            <Skeleton shape="text" className="w-16" />
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </GlassCard>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23.5rem]">
        <GlassCard padding="md">
          <SkeletonGroup label="Loading the review queue" className="grid gap-6">
            {Array.from({ length: 5 }, (_, index) => (
              <SkeletonRow key={index} />
            ))}
          </SkeletonGroup>
        </GlassCard>
        <GlassCard padding="md" className="hidden lg:block" aria-hidden="true">
          <Skeleton className="mx-auto aspect-[9/16] w-52 rounded-3xl" />
        </GlassCard>
      </div>
    </div>
  );
}

interface FraudHoldItem {
  post_id: string;
  submission_id: string;
  creator: { handle: string; avatar: ArtSeed };
  bounty_title: string;
  score: number;
  money_at_stake_cents: number;
}

/** Posts whose money is held while Ops reviews the views. The brand cannot decide these; it can see why and open the evidence. */
function FraudHoldLane({ lane }: { lane: readonly FraudHoldItem[] }) {
  return (
    <section aria-labelledby="fraud-hold-title" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="fraud-hold-title" className="flex items-center gap-2 font-display text-title-sm text-fg">
          <ShieldAlert aria-hidden="true" className="size-5 text-ember" />
          Fraud hold
          <span className="text-body-sm font-semibold text-fg-muted tabular-nums">{lane.length}</span>
        </h2>
        <p className="max-w-[62ch] text-body-sm text-fg-muted">Ops is checking the views on these posts and decides within 24 hours. Views that were real are still paid, and only proven fraud is taken back.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lane.map((item) => (
          <li key={item.post_id}>
            <GlassCard padding="md" className="grid h-full content-between gap-3">
              <div className="flex items-center gap-3">
                <ArtAvatar art={item.creator.avatar} name={`@${item.creator.handle}`} size={36} decorative />
                <div className="grid min-w-0">
                  <p className="truncate text-body-sm font-semibold text-fg">@{item.creator.handle}</p>
                  <p className="truncate text-caption text-fg-subtle">{item.bounty_title}</p>
                </div>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-caption text-fg-subtle">Held</p>
                  <p className="font-display text-figure-md tabular-nums">{formatMoney(item.money_at_stake_cents)}</p>
                </div>
                <div className="text-right">
                  <p className="text-caption text-fg-subtle">Fraud score</p>
                  <p className="font-display text-figure-md tabular-nums">{item.score}</p>
                </div>
              </div>
              <Link href={`/brand/review/${item.submission_id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                See the evidence
              </Link>
            </GlassCard>
          </li>
        ))}
      </ul>
    </section>
  );
}
