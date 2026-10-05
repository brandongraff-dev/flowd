"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clapperboard } from "lucide-react";
import { useStoreReady, useSubmissions } from "@/lib/data";
import type { SubmissionView } from "@/lib/data/selectors";
import { useNow } from "@/lib/hooks/use-now";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { Thumb } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Chip, ChipGroup, EmptyState, SearchInput, Select, Skeleton, SkeletonGroup, buttonVariants } from "@/components/ui";
import { Amount } from "./amount";
import { DecideBy, SUBMISSION_GROUPS, SubmissionStatusPill, statusSentence, type SubmissionGroupId } from "./submission-parts";
import { useUrlState } from "./use-url-state";

function SubmissionCard({ sub }: { sub: SubmissionView }) {
  const now = useNow();
  const needsYou = sub.status === "changes_requested" || sub.status === "approved";
  return (
    <GlassCard padding="none" className={cn("group relative grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 overflow-hidden p-3.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:p-4", needsYou && "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-ember)_40%,transparent)]")}>
      <Thumb art={sub.current.video.art} hook={sub.title} aspect="4:5" app={{ name: sub.app.name, art: sub.app.icon }} radius="lg" label={`${sub.title}, version ${sub.version}`} />
      <div className="grid min-w-0 content-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SubmissionStatusPill status={sub.status} />
          {sub.rounds_left < 2 && (sub.status === "changes_requested" || sub.revision_round > 0) ? (
            <Badge tone="neutral" size="md">
              Round {sub.revision_round} of 2 free
            </Badge>
          ) : null}
        </div>
        <h3 className="font-display text-title-sm text-fg">
          <Link href={`/creator/submissions/${sub.id}`} className="line-clamp-2 rounded-sm after:absolute after:inset-0 after:content-['']">
            {sub.title}
          </Link>
        </h3>
        <p className="truncate text-caption text-fg-muted">
          {sub.bounty.title} · {sub.brand.name}
        </p>
        <p className="line-clamp-2 text-caption text-fg-muted">{statusSentence(sub, now)}</p>
        <DecideBy sub={sub} />
      </div>
      <div className="col-span-2 flex items-center justify-between gap-4 border-t border-divider pt-3 sm:col-span-1 sm:grid sm:justify-items-end sm:gap-1 sm:border-t-0 sm:pt-0">
        {sub.reserved_cents > 0 ? (
          <p className="grid gap-0.5 sm:justify-items-end">
            <span className="text-micro text-fg-subtle">Reserved for you</span>
            <Amount cents={sub.reserved_cents} size="sm" decimals="auto" state="neutral" icon={false} />
          </p>
        ) : null}
        <span className="inline-flex items-center gap-1 text-caption font-semibold text-accent">
          {sub.status === "approved" ? "Post it" : sub.status === "changes_requested" ? "Revise" : "Open"}
          <ArrowRight aria-hidden="true" className="size-3.5 transition-transform duration-(--fd-dur-fast) ease-standard group-hover:translate-x-0.5" strokeWidth={2.25} />
        </span>
      </div>
    </GlassCard>
  );
}

/** `/creator/submissions`: every video you sent, grouped by where it stands, each with its decide-by time and what is reserved for it. */
export function SubmissionsList() {
  const ready = useStoreReady();
  const url = useUrlState();
  const all = useSubmissions({ creator: "mine", sort: "newest" });
  const filterParam = url.get("filter");
  const group: SubmissionGroupId = SUBMISSION_GROUPS.some((g) => g.id === filterParam) ? (filterParam as SubmissionGroupId) : "all";
  const sort = url.get("sort") === "decide_by" ? "decide_by" : "newest";
  const [text, setText] = useState(url.get("q") ?? "");
  const [shown, setShown] = useState(12);
  const q = useDebouncedValue(text, 200).trim().toLowerCase();

  const counts = useMemo(() => {
    const out = new Map<SubmissionGroupId, number>();
    for (const g of SUBMISSION_GROUPS) out.set(g.id, g.statuses === null ? all.length : all.filter((s) => (g.statuses as readonly string[]).includes(s.status)).length);
    return out;
  }, [all]);

  const rows = useMemo(() => {
    const spec = SUBMISSION_GROUPS.find((g) => g.id === group);
    let list = all.filter((s) => (spec?.statuses ? (spec.statuses as readonly string[]).includes(s.status) : true));
    if (q) list = list.filter((s) => `${s.title} ${s.bounty.title} ${s.brand.name} ${s.app.name}`.toLowerCase().includes(q));
    if (sort === "decide_by") list = [...list].sort((a, b) => (a.review?.due_at ?? "9999").localeCompare(b.review?.due_at ?? "9999"));
    return list;
  }, [all, group, q, sort]);

  const reserved = all.reduce((sum, s) => sum + s.reserved_cents, 0);
  const waiting = all.filter((s) => s.status === "in_review" || s.status === "qa_pending").length;
  const needsYou = all.filter((s) => s.status === "changes_requested" || s.status === "approved").length;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Submissions"
        title="Where your videos stand"
        description="Every video has a decide-by time. If a brand misses it, you see that here, and it counts against the brand, not you."
        actions={
          <Link href="/creator/studio" className={buttonVariants({ variant: "primary" })}>
            <Clapperboard aria-hidden="true" />
            Make a take
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "In review", node: <span className="font-display text-figure-lg text-fg tabular-nums">{waiting}</span>, hint: waiting === 1 ? "waiting on a brand" : "waiting on brands" },
          { label: "Needs you", node: <span className={cn("font-display text-figure-lg tabular-nums", needsYou > 0 ? "text-ember" : "text-fg")}>{needsYou}</span>, hint: needsYou > 0 ? "a revision or a post" : "nothing to do right now" },
          { label: "Reserved for you", node: <Amount cents={reserved} size="lg" decimals="auto" state="neutral" icon={false} />, hint: "held in pools until a decision" },
        ].map((tile) => (
          <GlassCard key={tile.label} className="grid gap-1" padding="md">
            <p className="text-caption font-medium text-fg-muted">{tile.label}</p>
            {ready ? tile.node : <Skeleton className="h-9 w-20" />}
            <p className="text-caption text-fg-subtle">{tile.hint}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard padding="sm" className="grid gap-3" role="search" aria-label="Filter submissions">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
          <SearchInput
            value={text}
            onValueChange={(value) => {
              setText(value);
              url.set({ q: value || null });
            }}
            onClear={() => setText("")}
            placeholder="Search by title, bounty or brand"
            aria-label="Search submissions"
          />
          <Select aria-label="Sort" value={sort} onValueChange={(value) => url.set({ sort: value === "newest" ? null : value })} options={[{ value: "newest", label: "Newest first" }, { value: "decide_by", label: "Decide-by time" }]} />
        </div>
        <ChipGroup aria-label="Status">
          {SUBMISSION_GROUPS.map((g) => (
            <Chip key={g.id} selected={group === g.id} count={counts.get(g.id)} onSelectedChange={() => url.set({ filter: g.id === "all" ? null : g.id })}>
              {g.label}
            </Chip>
          ))}
        </ChipGroup>
      </GlassCard>

      {!ready ? (
        <SkeletonGroup label="Loading submissions" className="grid gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-[28px]" />
          ))}
        </SkeletonGroup>
      ) : rows.length === 0 ? (
        <GlassCard>
          <EmptyState
            art="video"
            title={all.length === 0 ? "No submissions yet" : "Nothing in this view"}
            description={all.length === 0 ? "Make a take in Studio. Hook Score checks the first 3 seconds before you submit, and the brand's decide-by time shows here." : "Try another status, or clear the search."}
            action={
              all.length === 0 ? (
                <Link href="/creator/studio" className={buttonVariants({ variant: "primary" })}>
                  Make a take
                </Link>
              ) : (
                <Link href="/creator/submissions" className={buttonVariants({ variant: "secondary" })}>
                  Show everything
                </Link>
              )
            }
          />
        </GlassCard>
      ) : (
        <ul className="grid gap-3" aria-label={`${rows.length} submissions`}>
          {rows.slice(0, shown).map((sub) => (
            <li key={sub.id}>
              <SubmissionCard sub={sub} />
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

      <p className="text-caption text-fg-subtle">
        A decide-by time is the brand's 72-hour promise. Two revision rounds are free; a third is paid by the brand. Reserved money is released if a video is rejected or withdrawn.
      </p>
    </div>
  );
}
