"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Sparkles } from "lucide-react";
import { Thumb, TierBadge } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { PageHeader, Section } from "@/components/shell";
import { Badge, Button, EmptyState, SearchInput, Select, Tabs, TabsList, TabsTrigger, buttonVariants } from "@/components/ui";
import { CATEGORIES, CATEGORY_META, FORMAT_IDS, FORMAT_ID_META, type Category, type FormatId } from "@/lib/contract/types";
import { useMe, useSpecs, useStoreReady } from "@/lib/data";
import type { SpecFilter, SpecView } from "@/lib/data/selectors/market";
import { formatDate, formatMoney, pluralise } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CardGridSkeleton } from "./route-states";
import { BandChip } from "./spec-bits";
import { SpecSheet } from "./spec-sheet";
import { useQueryParams } from "./use-query-state";

const PARAMS = { tab: "", q: "", category: "", format: "", flow: "", price: "", sort: "" } as const;

const FLOW = [
  { value: "70", label: "B or better (70+)" },
  { value: "85", label: "A (85+)" },
  { value: "55", label: "C or better (55+)" },
] as const;
const PRICE = [
  { value: "5000", label: "Under $50" },
  { value: "8000", label: "Under $80" },
  { value: "12000", label: "Under $120" },
] as const;
const SORT = [
  { value: "flow", label: "Highest Flow Score" },
  { value: "price", label: "Lowest price" },
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most licensed" },
] as const;

function SpecCard({ spec, onOpen }: { spec: SpecView; onOpen: (spec: SpecView) => void }) {
  const price = spec.brand_price_cents ?? spec.price_cents;
  return (
    <GlassCard as="article" aria-label={spec.title} padding="sm" className="relative grid content-start gap-3.5 transition-shadow duration-(--fd-dur-base) ease-standard hover:shadow-raised">
      <Thumb art={spec.art} aspect="4:5" hook={spec.hook_text} caption={spec.format ? FORMAT_ID_META[spec.format.id].label : undefined} durationSec={Math.round(spec.video.duration_ms / 1000)} radius="lg" />
      <div className="grid gap-2.5 px-1.5 pb-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <BandChip label="Flow" band={spec.flow_band} points={spec.flow_points} />
          {spec.status === "first_refusal" ? (
            <Badge size="md" tone="accent">
              {spec.first_refusal_mine ? "Your first refusal" : "First refusal"}
            </Badge>
          ) : null}
          {spec.licensed_by_me ? (
            <Badge size="md" tone="mint">
              Licensed
            </Badge>
          ) : null}
          {spec.exclusive ? (
            <Badge size="md" tone="sun" variant="outline">
              Exclusive
            </Badge>
          ) : null}
        </div>
        <h3 className="line-clamp-2 text-body-sm font-semibold text-fg">
          <button type="button" onClick={() => onOpen(spec)} className="text-left after:absolute after:inset-0 after:rounded-[inherit] after:content-['']">
            {spec.title}
          </button>
        </h3>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-caption text-fg-subtle">
            <TierBadge tier={spec.creator.tier} size={20} decorative />
            <span className="truncate">@{spec.creator.handle}</span>
          </span>
          <span className="text-right">
            <span className="font-display text-figure-sm font-semibold text-fg tabular-nums">{formatMoney(price, { cents: "never" })}</span>
            <span className="block text-micro text-fg-subtle">{spec.paid_ads_days > 0 ? `${spec.paid_ads_days} days of ads` : "organic only"}</span>
          </span>
        </div>
      </div>
    </GlassCard>
  );
}

/** The Spec Market: pre-scored videos a brand can license off the shelf, with first refusal on its own approved-but-unused videos. */
export function SpecsView() {
  const ready = useStoreReady();
  const me = useMe();
  const { values, set, clear } = useQueryParams(PARAMS);
  const [open, setOpen] = useState<SpecView | null>(null);

  const filter = useMemo<SpecFilter>(() => {
    const f: SpecFilter = { status: "available", sort: "flow" };
    if (values.q.trim()) f.q = values.q.trim();
    if ((CATEGORIES as readonly string[]).includes(values.category)) f.category = values.category as Category;
    if ((FORMAT_IDS as readonly string[]).includes(values.format)) f.format = values.format as FormatId;
    if (FLOW.some((entry) => entry.value === values.flow)) f.min_flow = Number(values.flow);
    if (PRICE.some((entry) => entry.value === values.price)) f.max_price_cents = Number(values.price);
    const sort = SORT.find((entry) => entry.value === values.sort)?.value;
    if (sort) f.sort = sort;
    return f;
  }, [values]);

  const browse = useSpecs(filter);
  const licensed = useSpecs({ licensed_by_me: true, sort: "newest" });
  const refusal = useSpecs({ first_refusal: true });
  const tab = values.tab === "licences" ? "licences" : "browse";
  const filtered = Object.entries(values).some(([key, value]) => key !== "tab" && key !== "sort" && value !== "");
  const brandId = me.brand?.id;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Market"
        title="Spec Market"
        description="Videos that already exist, scored before you pay. License one for a flat fee and run it as an organic post or a paid ad."
        tabs={
          <Tabs value={tab} onValueChange={(next) => set({ tab: next === "browse" ? null : next })} variant="underline">
            <TabsList aria-label="Spec Market views">
              <TabsTrigger value="browse">Browse</TabsTrigger>
              <TabsTrigger value="licences" count={licensed.length}>
                My licences
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {refusal.length > 0 ? (
        <GlassCard padding="md" tint="accent" className="grid gap-4" role="region" aria-label="First refusal">
          <div className="flex flex-wrap items-start gap-3">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <Sparkles className="size-[18px]" strokeWidth={1.75} />
            </span>
            <div className="grid min-w-0 flex-1 gap-0.5">
              <h2 className="font-display text-title-sm text-fg">You have first refusal on {pluralise(refusal.length, "video")}</h2>
              <p className="text-body-sm text-fg-muted">You approved these and did not use them. For seven days only you can license them, then they go on the shelf for every brand.</p>
            </div>
          </div>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {refusal.map((spec) => (
              <li key={spec.id} className="flex items-center gap-3 rounded-xl bg-surface-field p-2.5 pr-3.5">
                <div className="w-14 shrink-0">
                  <Thumb art={spec.art} aspect="4:5" radius="md" label={spec.title} />
                </div>
                <div className="grid min-w-0 flex-1">
                  <span className="truncate text-body-sm font-semibold text-fg">{spec.title}</span>
                  <span className="flex items-center gap-1 text-caption text-fg-subtle">
                    <Clock aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                    {spec.first_refusal_days_left === null ? "" : spec.first_refusal_days_left <= 1 ? "Last day" : `${spec.first_refusal_days_left} days left`}
                  </span>
                </div>
                <Button size="sm" variant="primary" onClick={() => setOpen(spec)}>
                  License
                </Button>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      {tab === "browse" ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput aria-label="Search specs" placeholder="Search hook, title or creator" value={values.q} onValueChange={(next) => set({ q: next })} containerClassName="min-w-56 flex-1 basis-64" />
            <Select size="md" aria-label="Category" className="w-52" value={values.category || "any"} onValueChange={(next) => set({ category: next === "any" ? null : next })} options={[{ value: "any", label: "Any category" }, ...CATEGORIES.map((category) => ({ value: category, label: CATEGORY_META[category].label }))]} />
            <Select size="md" aria-label="Format" className="w-56" value={values.format || "any"} onValueChange={(next) => set({ format: next === "any" ? null : next })} options={[{ value: "any", label: "Any format" }, ...FORMAT_IDS.map((id) => ({ value: id, label: FORMAT_ID_META[id].label }))]} />
            <Select size="md" aria-label="Minimum Flow Score" className="w-48" value={values.flow || "any"} onValueChange={(next) => set({ flow: next === "any" ? null : next })} options={[{ value: "any", label: "Any Flow Score" }, ...FLOW]} />
            <Select size="md" aria-label="Maximum price" className="w-40" value={values.price || "any"} onValueChange={(next) => set({ price: next === "any" ? null : next })} options={[{ value: "any", label: "Any price" }, ...PRICE]} />
            <Select size="md" aria-label="Sort" className="w-48" value={values.sort || "flow"} onValueChange={(next) => set({ sort: next })} options={SORT} />
          </div>
          <p role="status" aria-live="polite" className="text-body-sm text-fg-muted">
            {ready ? (
              <>
                <span className="font-semibold text-fg tabular-nums">{browse.length}</span> videos on the shelf. Flow and Hook are checklist scores, shown with the price you would pay on your plan.
              </>
            ) : (
              "Loading videos"
            )}
          </p>
          {!ready ? (
            <CardGridSkeleton count={8} label="Loading videos" />
          ) : browse.length === 0 ? (
            <GlassCard padding="lg">
              <EmptyState
                art="video"
                title={filtered ? "No videos match" : "The shelf is empty"}
                description={filtered ? "Widen the category, format or price. New videos are scored and listed every day." : "Creators list pre-made videos here once their Flow Score clears 55."}
                action={
                  filtered ? (
                    <Button variant="primary" onClick={clear}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </GlassCard>
          ) : (
            <ul className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4")}>
              {browse.map((spec) => (
                <li key={spec.id} className="grid">
                  <SpecCard spec={spec} onOpen={setOpen} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <Section title="Your licences" description="Videos you license. Each runs under its Rights Card until the term ends; renew from Rights Vault.">
          {!ready ? (
            <CardGridSkeleton count={3} label="Loading licences" />
          ) : licensed.length === 0 ? (
            <GlassCard padding="lg">
              <EmptyState
                art="video"
                title="No licences yet"
                description="License a video from the shelf and it shows here with its term and rights."
                action={
                  <Button variant="primary" onClick={() => set({ tab: null })}>
                    Browse the shelf
                  </Button>
                }
              />
            </GlassCard>
          ) : (
            <ul className="grid gap-3">
              {licensed.map((spec) => {
                const mine = spec.licenses.find((entry) => entry.brand_id === brandId);
                return (
                  <li key={spec.id}>
                    <GlassCard padding="sm" className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
                      <Thumb art={spec.art} aspect="4:5" radius="md" label={spec.title} />
                      <div className="grid min-w-0 gap-1">
                        <p className="truncate text-body-sm font-semibold text-fg">{spec.title}</p>
                        <p className="text-caption text-fg-subtle">
                          @{spec.creator.handle} · licensed {mine ? formatDate(mine.licensed_at, "medium") : ""}
                          {mine?.ends_at ? ` · ads until ${formatDate(mine.ends_at, "medium")}` : ""}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <BandChip label="Flow" band={spec.flow_band} points={spec.flow_points} />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 max-sm:col-span-2">
                        <span className="font-display text-figure-sm font-semibold text-fg tabular-nums">{mine ? formatMoney(mine.price_cents, { cents: "never" }) : ""}</span>
                        <Link href="/brand/rights" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                          Rights Vault
                        </Link>
                      </div>
                    </GlassCard>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      <SpecSheet spec={open} onClose={() => setOpen(null)} />
    </div>
  );
}
