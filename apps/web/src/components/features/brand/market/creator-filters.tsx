"use client";

import { Chip, ChipGroup, Field, Select, Slider, Switch } from "@/components/ui";
import { NICHES, NICHE_META, type Niche, type Platform, type Tier } from "@/lib/contract/types";
import type { CreatorFilter } from "@/lib/data/selectors/creators";
import { formatMoney } from "@/lib/format";
import { numberParam } from "./use-query-state";

/** Every filter lives in the address: `?niche=fitness&tier=silver&appr=80`. Module-level so the identity is stable. */
export const FILTER_DEFAULTS = {
  q: "",
  niche: "",
  tier: "",
  appr: "",
  rel: "",
  platform: "",
  price: "",
  us: "",
  open: "",
  sort: "",
  bounty: "",
  list: "",
} as const;

export type FilterKey = keyof typeof FILTER_DEFAULTS;
export type FilterValues = Record<FilterKey, string>;
export type SetFilters = (patch: Partial<Record<FilterKey, string | null>>) => void;

const TIERS: readonly { value: Tier; label: string }[] = [
  { value: "silver", label: "Silver and up" },
  { value: "gold", label: "Gold and up" },
  { value: "platinum", label: "Platinum and up" },
  { value: "elite", label: "Elite" },
];

const PLATFORMS: readonly { value: Platform; label: string }[] = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
];

export const SORTS = [
  { value: "reliability", label: "Most reliable" },
  { value: "approval", label: "Highest approval rate" },
  { value: "views", label: "Most median views" },
  { value: "tier", label: "Highest tier" },
  { value: "price", label: "Lowest price" },
  { value: "recent", label: "Recently active" },
] as const;

const isNiche = (value: string): value is Niche => (NICHES as readonly string[]).includes(value);
const isTier = (value: string): value is Tier => TIERS.some((tier) => tier.value === value);
const isPlatform = (value: string): value is Platform => PLATFORMS.some((platform) => platform.value === value);

/** Price slider tops out at this many dollars; the top position means "no ceiling". */
export const PRICE_MAX_DOLLARS = 1500;

/** The URL values as the directory selector's filter. Anything unreadable is ignored, never an error. */
export function toDirectoryFilter(values: FilterValues): CreatorFilter {
  const filter: CreatorFilter = {};
  if (values.q.trim()) filter.q = values.q.trim();
  if (isNiche(values.niche)) filter.niche = values.niche;
  if (isTier(values.tier)) filter.min_tier = values.tier;
  const appr = numberParam(values.appr, 0, 5, 100);
  if (appr > 0) filter.min_approval_rate = appr / 100;
  const rel = numberParam(values.rel, 0, 5, 100);
  if (rel > 0) filter.min_reliability = rel;
  if (isPlatform(values.platform)) filter.platform = values.platform;
  const price = numberParam(values.price, PRICE_MAX_DOLLARS, 25, PRICE_MAX_DOLLARS - 25);
  if (price < PRICE_MAX_DOLLARS) filter.max_price_cents = price * 100;
  const us = numberParam(values.us, 0, 5, 100);
  if (us > 0) filter.min_us_audience = us / 100;
  if (values.open === "1") filter.open_to_offers = true;
  if (values.bounty) filter.for_bounty = values.bounty;
  if (values.list) filter.list = values.list;
  const sort = SORTS.find((entry) => entry.value === values.sort)?.value;
  if (sort) filter.sort = sort;
  return filter;
}

/** How many filters are active (the search box and the sort do not count: they change the order, not who is shown). */
export function activeFilterCount(values: FilterValues): number {
  const f = toDirectoryFilter(values);
  return [f.for_bounty, f.niche, f.min_tier, f.min_approval_rate, f.min_reliability, f.platform, f.max_price_cents, f.min_us_audience, f.open_to_offers, f.list].filter((entry) => entry !== undefined).length;
}

/** Applied filters as plain words, each with the keys to clear to remove it. */
export function appliedFilters(values: FilterValues, listName: (id: string) => string | undefined): readonly { id: string; label: string; clear: readonly FilterKey[] }[] {
  const out: { id: string; label: string; clear: readonly FilterKey[] }[] = [];
  const f = toDirectoryFilter(values);
  if (f.niche) out.push({ id: "niche", label: NICHE_META[f.niche].label, clear: ["niche"] });
  if (f.min_tier) out.push({ id: "tier", label: TIERS.find((tier) => tier.value === f.min_tier)?.label ?? f.min_tier, clear: ["tier"] });
  if (f.platform) out.push({ id: "platform", label: PLATFORMS.find((platform) => platform.value === f.platform)?.label ?? f.platform, clear: ["platform"] });
  if (f.min_approval_rate) out.push({ id: "appr", label: `Approval ${Math.round(f.min_approval_rate * 100)}%+`, clear: ["appr"] });
  if (f.min_reliability) out.push({ id: "rel", label: `Reliability ${f.min_reliability}+`, clear: ["rel"] });
  if (f.max_price_cents) out.push({ id: "price", label: `Up to ${formatMoney(f.max_price_cents, { cents: "never" })} a video`, clear: ["price"] });
  if (f.min_us_audience) out.push({ id: "us", label: `US audience ${Math.round(f.min_us_audience * 100)}%+`, clear: ["us"] });
  if (f.open_to_offers) out.push({ id: "open", label: "Open to offers", clear: ["open"] });
  if (f.list) out.push({ id: "list", label: `On ${listName(f.list) ?? "a list"}`, clear: ["list"] });
  return out;
}

/** The filter controls. Used in the left rail on desktop and inside a sheet on phones. */
export interface FilterPanelOptions {
  /** Live bounties a brand can rank creators for. */
  bounties: readonly { value: string; label: string; description?: string }[];
  /** The brand's CRM lists. */
  lists: readonly { value: string; label: string; description?: string }[];
}

export function FilterPanel({ values, set, idPrefix, bounties, lists }: { values: FilterValues; set: SetFilters; idPrefix: string } & FilterPanelOptions) {
  const appr = numberParam(values.appr, 0, 5, 100);
  const rel = numberParam(values.rel, 0, 5, 100);
  const price = numberParam(values.price, PRICE_MAX_DOLLARS, 25, PRICE_MAX_DOLLARS - 25);
  const us = numberParam(values.us, 0, 5, 100);

  return (
    <div className="grid gap-6">
      <Field label="Find creators for a bounty" hint="Ranks by match to its niche, platform, price and region." id={`${idPrefix}-bounty`}>
        <Select
          value={values.bounty === "" ? "none" : values.bounty}
          onValueChange={(next) => set({ bounty: next === "none" ? null : next, sort: null })}
          options={[{ value: "none", label: bounties.length === 0 ? "No live bounties" : "Not ranking for one" }, ...bounties]}
        />
      </Field>

      {lists.length > 0 ? (
        <Field label="Saved in a list" id={`${idPrefix}-list`}>
          <Select value={values.list === "" ? "all" : values.list} onValueChange={(next) => set({ list: next === "all" ? null : next })} options={[{ value: "all", label: "All creators" }, ...lists]} />
        </Field>
      ) : null}

      <Field label="Niche" id={`${idPrefix}-niche`}>
        <Select
          value={values.niche === "" ? "any" : values.niche}
          onValueChange={(next) => set({ niche: next === "any" ? null : next })}
          options={[{ value: "any", label: "Any niche" }, ...NICHES.map((niche) => ({ value: niche, label: NICHE_META[niche].label }))]}
        />
      </Field>

      <div className="grid gap-2.5">
        <p id={`${idPrefix}-tier-label`} className="text-body-sm font-medium text-fg">
          Tier
        </p>
        <ChipGroup aria-labelledby={`${idPrefix}-tier-label`}>
          {TIERS.map((tier) => (
            <Chip key={tier.value} size="sm" selected={values.tier === tier.value} onSelectedChange={(on) => set({ tier: on ? tier.value : null })}>
              {tier.label}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <div className="grid gap-2.5">
        <p id={`${idPrefix}-platform-label`} className="text-body-sm font-medium text-fg">
          Posts on
        </p>
        <ChipGroup aria-labelledby={`${idPrefix}-platform-label`}>
          {PLATFORMS.map((platform) => (
            <Chip key={platform.value} size="sm" selected={values.platform === platform.value} onSelectedChange={(on) => set({ platform: on ? platform.value : null })}>
              {platform.label}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <Field label={`Approval rate: ${appr === 0 ? "any" : `${appr}% or more`}`} id={`${idPrefix}-appr`} hint="Share of finished videos that brands approved.">
        <Slider
          aria-label="Minimum approval rate"
          min={0}
          max={100}
          step={5}
          value={[appr]}
          onValueChange={([next]) => set({ appr: next === 0 ? null : String(next) })}
          format={(value) => (value === 0 ? "Any" : `${value}%`)}
        />
      </Field>

      <Field label={`Reliability: ${rel === 0 ? "any" : `${rel} or more`}`} id={`${idPrefix}-rel`} hint="On time, posts what they submit, passes compliance.">
        <Slider
          aria-label="Minimum reliability"
          min={0}
          max={100}
          step={5}
          value={[rel]}
          onValueChange={([next]) => set({ rel: next === 0 ? null : String(next) })}
          format={(value) => (value === 0 ? "Any" : String(value))}
        />
      </Field>

      <Field label={`Price per video: ${price >= PRICE_MAX_DOLLARS ? "any" : `up to ${formatMoney(price * 100, { cents: "never" })}`}`} id={`${idPrefix}-price`} hint="The creator's rate-card ask for one video.">
        <Slider
          aria-label="Maximum price per video"
          min={25}
          max={PRICE_MAX_DOLLARS}
          step={25}
          value={[price]}
          onValueChange={([next]) => set({ price: next >= PRICE_MAX_DOLLARS ? null : String(next) })}
          format={(value) => (value >= PRICE_MAX_DOLLARS ? "Any" : formatMoney(value * 100, { cents: "never" }))}
        />
      </Field>

      <Field label={`US audience: ${us === 0 ? "any" : `${us}% or more`}`} id={`${idPrefix}-us`} hint="On the creator's strongest account.">
        <Slider
          aria-label="Minimum US audience share"
          min={0}
          max={100}
          step={5}
          value={[us]}
          onValueChange={([next]) => set({ us: next === 0 ? null : String(next) })}
          format={(value) => (value === 0 ? "Any" : `${value}%`)}
        />
      </Field>

      <Switch label="Open to offers only" description="Hide creators who are not taking offers." checked={values.open === "1"} onCheckedChange={(on) => set({ open: on ? "1" : null })} />
    </div>
  );
}
