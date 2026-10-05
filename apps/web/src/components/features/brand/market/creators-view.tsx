"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookmarkPlus, GitCompareArrows, ListFilter, ShieldCheck, Users, X } from "lucide-react";
import { GlassBar, GlassCard } from "@/components/glass";
import { Badge, Button, EmptyState, RemovableChip, SearchInput, Select, Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger, buttonVariants, notify } from "@/components/ui";
import { PageHeader } from "@/components/shell";
import { useBounties, useCreatorDirectory, useLists, useStoreReady } from "@/lib/data";
import type { CreatorCard as CreatorCardRow } from "@/lib/data/selectors/creators";
import { actions } from "@/lib/store";
import { pluralise } from "@/lib/format";
import { CompareDialog } from "./compare-dialog";
import { DiscoverCard, offerTargetOf } from "./creator-card";
import { FILTER_DEFAULTS, FilterPanel, SORTS, activeFilterCount, appliedFilters, toDirectoryFilter } from "./creator-filters";
import { OfferSheet, type OfferKindChoice, type OfferTarget } from "./offer-sheet";
import { CardGridSkeleton } from "./route-states";
import { useQueryParams } from "./use-query-state";

const PAGE = 12;
/** Compare and bulk offers work on up to this many creators at once. */
const MAX_SELECTED = 4;

interface Composer {
  targets: readonly OfferTarget[];
  kind: OfferKindChoice;
}

/** Discover creators: filters in the address, verified result cards, compare, lists and direct offers. */
export function CreatorsView() {
  const ready = useStoreReady();
  const { values, set, clear } = useQueryParams(FILTER_DEFAULTS);
  const filter = useMemo(() => toDirectoryFilter(values), [values]);
  const directory = useCreatorDirectory(filter);
  const everyone = useCreatorDirectory();
  const lists = useLists();
  const live = useBounties({ brand: "mine", status: "live" });

  const [selected, setSelected] = useState<readonly string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterKey = JSON.stringify(values);
  const [paging, setPaging] = useState({ key: filterKey, shown: PAGE });
  const shown = paging.key === filterKey ? paging.shown : PAGE;

  const count = activeFilterCount(values);
  const applied = appliedFilters(values, (id) => lists.find((list) => list.id === id)?.name);
  const rows = directory.items;
  const visible = rows.slice(0, shown);
  const selectedRows = useMemo(() => selected.map((id) => everyone.items.find((row) => row.creator.id === id)).filter((row): row is CreatorCardRow => row !== undefined), [selected, everyone.items]);
  const rankingFor = live.find((bounty) => bounty.id === values.bounty);
  const sortValue = values.sort || (values.bounty ? "match" : "reliability");

  const toggleSelected = (id: string, on: boolean): void => setSelected((current) => (on ? (current.includes(id) || current.length >= MAX_SELECTED ? current : [...current, id]) : current.filter((entry) => entry !== id)));
  const open = (rowsToOffer: readonly CreatorCardRow[], kind: OfferKindChoice): void => setComposer({ targets: rowsToOffer.map(offerTargetOf), kind });

  const addAllToFavourites = async (): Promise<void> => {
    const results = await Promise.all(selectedRows.map((row) => actions.addToList({ creator_id: row.creator.id })));
    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) notify.error(failed.error.message, failed.error.hint ? { description: failed.error.hint } : undefined);
    else notify.success(`Added ${pluralise(selectedRows.length, "creator")} to Favourites`);
  };

  const filterPanel = (
    <FilterPanel
      values={values}
      set={set}
      idPrefix={filtersOpen ? "sheet" : "rail"}
      bounties={live.map((bounty) => ({ value: bounty.id, label: bounty.title, description: bounty.app.name }))}
      lists={lists.map((list) => ({ value: list.id, label: list.name, description: `${list.members.length} saved` }))}
    />
  );

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Market"
        title="Discover creators"
        description="Search by what they have done, not what they say. Every figure comes from finished, settled work on flowd."
        meta={
          <Badge tone="accent" size="lg" icon={<ShieldCheck />}>
            Verified results
          </Badge>
        }
        actions={
          <>
            <Link href="/brand/creators/lists" className={buttonVariants({ variant: "secondary" })}>
              <Users aria-hidden="true" />
              Lists
            </Link>
            <Link href="/brand/offers" className={buttonVariants({ variant: "secondary" })}>
              Offers
            </Link>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <GlassCard as="aside" aria-label="Filters" padding="md" className="sticky top-24 hidden lg:block">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="font-display text-title-sm text-fg">Filters</h2>
            {count > 0 ? (
              <Button variant="plain" size="xs" onClick={clear}>
                Clear all
              </Button>
            ) : null}
          </div>
          {filterPanel}
        </GlassCard>

        <section aria-label="Results" className="grid min-w-0 gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              aria-label="Search creators by handle, name or niche"
              placeholder="Search handle, name or niche"
              value={values.q}
              onValueChange={(next) => set({ q: next })}
              containerClassName="min-w-56 flex-1 basis-64"
            />
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="secondary" className="lg:hidden" leadingIcon={<ListFilter />}>
                  Filters{count > 0 ? ` (${count})` : ""}
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>{ready ? `${pluralise(directory.total, "creator")} match` : "Loading creators"}</SheetDescription>
                </SheetHeader>
                <SheetBody>{filtersOpen ? filterPanel : null}</SheetBody>
                <SheetFooter>
                  <Button variant="ghost" onClick={clear} disabled={count === 0}>
                    Clear all
                  </Button>
                  <Button variant="primary" onClick={() => setFiltersOpen(false)}>
                    Show {directory.total}
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
            <Select
              size="md"
              aria-label="Sort"
              className="w-52"
              value={sortValue}
              onValueChange={(next) => set({ sort: next })}
              options={[...(values.bounty ? [{ value: "match", label: "Best match" }] : []), ...SORTS]}
            />
          </div>

          {applied.length > 0 || rankingFor ? (
            <div className="flex flex-wrap items-center gap-2" aria-label="Applied filters" role="group">
              {rankingFor ? (
                <RemovableChip onRemove={() => set({ bounty: null })} removeLabel="Stop ranking for this bounty">
                  Ranked for {rankingFor.title}
                </RemovableChip>
              ) : null}
              {applied.map((chip) => (
                <RemovableChip key={chip.id} onRemove={() => set(Object.fromEntries(chip.clear.map((key) => [key, null])))} removeLabel={`Remove filter: ${chip.label}`}>
                  {chip.label}
                </RemovableChip>
              ))}
              {applied.length > 1 ? (
                <Button variant="plain" size="xs" onClick={clear}>
                  Clear all
                </Button>
              ) : null}
            </div>
          ) : null}

          <p role="status" aria-live="polite" className="text-body-sm text-fg-muted">
            {ready ? (
              <>
                <span className="font-semibold text-fg tabular-nums">{directory.total}</span> of <span className="tabular-nums">{everyone.total}</span> creators
                {rankingFor ? ", ranked for this bounty" : ""}
              </>
            ) : (
              "Loading creators"
            )}
          </p>

          {!ready ? (
            <CardGridSkeleton label="Loading creators" />
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-rim p-6">
              <EmptyState
                art="search"
                title="No creators match all of that"
                description={count > 0 ? "Widen one filter, such as approval rate or price, or start over. New creators are shown as ranges until five posts are decided." : "Try a different spelling, or search by niche."}
                action={
                  <Button variant="primary" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {visible.map((row) => (
                  <li key={row.creator.id} className="grid min-w-0">
                    <DiscoverCard
                      row={row}
                      selected={selected.includes(row.creator.id)}
                      compareFull={selected.length >= MAX_SELECTED}
                      onSelectedChange={(on) => toggleSelected(row.creator.id, on)}
                      onOffer={(card) => open([card], "direct")}
                      onInvite={(card) => open([card], "invite")}
                    />
                  </li>
                ))}
              </ul>
              {rows.length > shown ? (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setPaging({ key: filterKey, shown: shown + PAGE })}>
                    Show {Math.min(PAGE, rows.length - shown)} more
                  </Button>
                  <p className="text-caption text-fg-subtle tabular-nums">
                    Showing {shown} of {rows.length}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {selected.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-(--fd-z-nav) flex justify-center px-3 md:bottom-6">
          <GlassBar className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-3xl p-2.5 pl-4" role="region" aria-label="Selected creators">
            <p className="mr-1 text-body-sm font-semibold text-fg tabular-nums">{selected.length} selected</p>
            <Button size="sm" variant="secondary" leadingIcon={<GitCompareArrows />} disabled={selected.length < 2} onClick={() => setCompareOpen(true)}>
              Compare
            </Button>
            <Button size="sm" variant="primary" onClick={() => open(selectedRows, "direct")}>
              Send offers
            </Button>
            <Button size="sm" variant="secondary" onClick={() => open(selectedRows, "invite")}>
              Invite to bounty
            </Button>
            <Button
              size="sm"
              variant="plain"
              leadingIcon={<BookmarkPlus />}
              onClick={() => {
                void addAllToFavourites();
              }}
            >
              Favourite
            </Button>
            <Button size="sm" variant="plain" leadingIcon={<X />} onClick={() => setSelected([])} aria-label="Clear selection">
              <span className="sr-only sm:not-sr-only">Clear</span>
            </Button>
          </GlassBar>
        </div>
      ) : null}

      <CompareDialog open={compareOpen} onOpenChange={setCompareOpen} items={selectedRows} onOffer={(items) => open(items, "direct")} />
      <OfferSheet
        open={composer !== null}
        onOpenChange={(next) => {
          if (!next) setComposer(null);
        }}
        targets={composer?.targets ?? []}
        initialKind={composer?.kind ?? "direct"}
        onSent={() => setSelected([])}
      />
    </div>
  );
}
