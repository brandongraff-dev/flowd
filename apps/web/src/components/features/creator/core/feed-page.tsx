"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, Lock, ShieldCheck, Zap } from "lucide-react";
import type { BountyType, Platform } from "@/lib/contract/types";
import { useFeed, useStoreReady, useSubmissions, useTiers } from "@/lib/data";
import type { FeedFilter } from "@/lib/data/selectors";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { pluralise } from "@/lib/format";
import { PageHeader } from "@/components/shell";
import { Button, Callout, Chip, ChipGroup, EmptyState, SearchInput, Select, Skeleton, SkeletonGroup, buttonVariants } from "@/components/ui";
import { GlassCard } from "@/components/glass";
import { cn } from "@/lib/utils";
import { BountyCard } from "./bounty-card";
import { useUrlState } from "./use-url-state";

const SORTS = [
  { value: "match", label: "Best match" },
  { value: "pay", label: "Highest pay" },
  { value: "new", label: "Newest" },
  { value: "ending", label: "Ending soon" },
  { value: "spots", label: "Fewest spots left" },
] as const;
type SortKey = (typeof SORTS)[number]["value"];

const STRUCTURES: readonly { value: BountyType; label: string; hint: string }[] = [
  { value: "cpm", label: "Views (CPM)", hint: "Paid per 1,000 verified views" },
  { value: "stacked", label: "Views + outcomes", hint: "Views, plus a bonus per install, trial or paid" },
  { value: "cpa", label: "Outcomes (CPA)", hint: "Paid per install, trial or paid subscription" },
  { value: "install_only", label: "Install-only", hint: "Paid per tracked install" },
];

const PLATFORMS: readonly { value: Platform; label: string }[] = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
];

const isSort = (value: string | null): value is SortKey => SORTS.some((s) => s.value === value);

/**
 * The bounty feed: funded bounties ranked for you. Filters live in one row and in the URL (`?q=`, `?sort=`, `?structure=`, `?platform=`, `?saved=1`,
 * `?locked=hide`, `?funded=any`). Every card shows the pay, the Funded badge, a median estimate with its range, the pool and spots left and how fast the
 * brand decides. Locked bounties say why and what unlocks them; bounties your tier cannot see yet are counted, not hidden in silence.
 */
export function FeedPage() {
  const ready = useStoreReady();
  const url = useUrlState();
  const tiers = useTiers("mine");

  const sortParam = url.get("sort");
  const sort: SortKey = isSort(sortParam) ? sortParam : "match";
  const structure = (url.get("structure")?.split(",").filter((s): s is BountyType => STRUCTURES.some((x) => x.value === s)) ?? []) as BountyType[];
  const platform = PLATFORMS.find((p) => p.value === url.get("platform"))?.value;
  const saved = url.get("saved") === "1";
  const hideLocked = url.get("locked") === "hide";
  const fundedOnly = url.get("funded") !== "any";

  const [text, setText] = useState(url.get("q") ?? "");
  const q = useDebouncedValue(text, 220);
  useEffect(() => {
    if ((url.get("q") ?? "") !== q) url.set({ q: q || null });
    // url.set changes with the params; the debounced text is the only trigger we want here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filter = useMemo<FeedFilter>(
    () => ({ sort, structure: structure.length > 0 ? structure : undefined, platform, saved: saved || undefined, hide_locked: hideLocked || undefined, funded_only: fundedOnly, q: q || undefined }),
    // structure is derived from the URL string
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sort, structure.join(","), platform, saved, hideLocked, fundedOnly, q],
  );
  const feed = useFeed(filter);
  const filtered = Boolean(q || structure.length > 0 || platform || saved || hideLocked || !fundedOnly);

  const clear = (): void => {
    setText("");
    url.set({ q: null, structure: null, platform: null, saved: null, locked: null, funded: null });
  };
  const toggleStructure = (value: BountyType): void => {
    const next = structure.includes(value) ? structure.filter((s) => s !== value) : [...structure, value];
    url.set({ structure: next.length > 0 ? next.join(",") : null });
  };

  const mine = useSubmissions({ creator: "mine" });
  const submissionOf = useMemo(() => new Map(mine.map((s) => [s.bounty_id, s.id])), [mine]);
  const open = feed.items.filter((i) => !i.match.locked);
  const submitted = feed.items.filter((i) => i.match.locked && i.submitted);
  const locked = feed.items.filter((i) => i.match.locked && !i.submitted);
  const next = tiers.next ? tiers.next[0]?.toUpperCase() + tiers.next.slice(1) : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Bounty feed"
        title="Funded bounties, ranked for you"
        description="Every bounty here is fully escrowed before it goes live. Pay shown is what creators like you earned at the median, with the middle half beside it."
      />

      <GlassCard padding="sm" className="grid gap-3.5" role="search" aria-label="Filter the feed">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
          <SearchInput value={text} onValueChange={setText} onClear={() => setText("")} placeholder="Search bounties, apps and brands" aria-label="Search bounties" />
          <Select
            aria-label="Sort bounties"
            value={sort}
            onValueChange={(value) => url.set({ sort: value === "match" ? null : value })}
            options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <ChipGroup aria-label="Pay structure">
            {STRUCTURES.map((s) => (
              <Chip key={s.value} selected={structure.includes(s.value)} onSelectedChange={() => toggleStructure(s.value)} title={s.hint}>
                {s.label}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup aria-label="Platform">
            {PLATFORMS.map((p) => (
              <Chip key={p.value} selected={platform === p.value} onSelectedChange={(on) => url.set({ platform: on ? p.value : null })}>
                {p.label}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup aria-label="Show only">
            <Chip selected={fundedOnly} icon={<ShieldCheck />} onSelectedChange={(on) => url.set({ funded: on ? null : "any" })}>
              Funded only
            </Chip>
            <Chip selected={saved} icon={<Bookmark />} count={feed.counts.saved} onSelectedChange={(on) => url.set({ saved: on ? "1" : null })}>
              Saved
            </Chip>
            <Chip selected={hideLocked} icon={<Lock />} onSelectedChange={(on) => url.set({ locked: on ? "hide" : null })}>
              Hide locked
            </Chip>
          </ChipGroup>
        </div>
      </GlassCard>

      <p role="status" aria-live="polite" className="text-body-sm text-fg-muted">
        {ready ? (
          <>
            <span className="font-semibold text-fg tabular-nums">{open.length} open to you</span>
            {submitted.length > 0 ? `, ${submitted.length} already submitted` : ""}
            {locked.length > 0 ? `, ${locked.length} locked` : ""}
            {filtered ? " with these filters." : "."}
          </>
        ) : (
          "Loading bounties"
        )}
      </p>

      {feed.counts.early_access > 0 && !hideLocked ? (
        <Callout tone="ember" icon={<Zap />} title={`${pluralise(feed.counts.early_access, "more bounty", "more bounties")} will open to your tier soon`}>
          Higher tiers see new bounties first: Silver 1 hour ahead, Gold 3, Platinum 6, Elite 12. They show up here the moment your tier can see them.
        </Callout>
      ) : null}

      {!ready ? (
        <SkeletonGroup label="Loading bounties" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[27rem] rounded-[28px]" />
          ))}
        </SkeletonGroup>
      ) : feed.items.length === 0 ? (
        <GlassCard>
          <EmptyState
            art={filtered ? "search" : "bounty"}
            title={filtered ? "Nothing matches those filters" : "Nothing matches yet"}
            description={filtered ? "Widen the filters, or clear them to see every funded bounty open to you." : "Widen your niches, or check back when the Daily Drop lands at 4 PM UTC."}
            action={
              filtered ? (
                <Button variant="primary" onClick={clear}>
                  Clear filters
                </Button>
              ) : (
                <Link href="/creator/settings" className={buttonVariants({ variant: "primary" })}>
                  Edit niches
                </Link>
              )
            }
          />
        </GlassCard>
      ) : (
        <>
          {open.length > 0 ? (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Open bounties">
              {open.map((item) => (
                <li key={item.bounty.id} className="grid min-w-0">
                  <BountyCard item={item} />
                </li>
              ))}
            </ul>
          ) : null}
          {submitted.length > 0 ? (
            <section aria-labelledby="submitted-title" className={cn("grid gap-4", open.length > 0 && "pt-4")}>
              <div className="grid gap-1">
                <h2 id="submitted-title" className="font-display text-title-md text-fg">
                  You already submitted
                </h2>
                <p className="max-w-[62ch] text-body-sm text-fg-muted">One video per bounty unless the brief allows more. Open the submission to see where it stands.</p>
              </div>
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Bounties you submitted to">
                {submitted.map((item) => (
                  <li key={item.bounty.id} className="grid min-w-0">
                    <BountyCard item={item} submissionHref={submissionOf.has(item.bounty.id) ? `/creator/submissions/${submissionOf.get(item.bounty.id)}` : undefined} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {locked.length > 0 ? (
            <section aria-labelledby="locked-title" className={cn("grid gap-4", (open.length > 0 || submitted.length > 0) && "pt-4")}>
              <div className="grid gap-1">
                <h2 id="locked-title" className="font-display text-title-md text-fg">
                  Locked for now
                </h2>
                <p className="max-w-[62ch] text-body-sm text-fg-muted">
                  Each one says what is missing. {next ? `Reaching ${next} unlocks many of these.` : ""}{" "}
                  <Link href="/creator/tiers" className="font-semibold text-accent hover:underline">
                    See what unlocks them
                  </Link>
                </p>
              </div>
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Locked bounties">
                {locked.map((item) => (
                  <li key={item.bounty.id} className="grid min-w-0">
                    <BountyCard item={item} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
