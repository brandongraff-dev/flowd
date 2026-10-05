"use client";

import { useState } from "react";
import { Info, RotateCcw, Save } from "lucide-react";
import { GlassBar, GlassCard } from "@/components/glass";
import { Badge, Button, Callout, Chip, ChipGroup, Field, SegmentedControl, Select, Slider } from "@/components/ui";
import { PlatformLabel } from "@/components/brand";
import {
  CATEGORIES,
  CATEGORY_META,
  FORMAT_ID_META,
  FORMAT_IDS,
  PLATFORMS,
  RATE_CARD_STATUS_META,
  RATE_CARD_STATUSES,
  type Category,
  type Creator,
  type FormatId,
  type Platform,
  type RateCard,
  type RateCardStatus,
} from "@/lib/contract/types";
import type { RateCardView } from "@/lib/data/selectors";
import { CONSTANTS, mulRate } from "@/lib/engine";
import { formatMoney, formatPct } from "@/lib/format";
import { actions } from "@/lib/store";
import { notify } from "@/components/ui";
import { MoneyInput } from "../shared/money-input";
import { useRun } from "../shared/run-action";
import { askPosition, POSITION_COPY, PriceRange } from "./price-range";
import { RateCardPreview } from "./rate-card-preview";

interface Draft {
  price_per_video_cents: number;
  min_cpm_cents: number;
  paid_usage_days: number;
  turnaround_days: number;
  max_videos_per_month: number;
  platforms: Platform[];
  format_ids: FormatId[];
  categories_excluded: Category[];
  status: RateCardStatus;
}

const USAGE_DAYS = [30, 60, 90, 120, 180, 365] as const;
const TURNAROUND = [2, 3, 4, 5, 7, 10, 14] as const;
const PRICE_MIN = 2_500;

const draftOf = (card: RateCard): Draft => ({
  price_per_video_cents: card.price_per_video_cents,
  min_cpm_cents: card.min_cpm_cents,
  paid_usage_days: card.paid_usage_days,
  turnaround_days: card.turnaround_days,
  max_videos_per_month: card.max_videos_per_month,
  platforms: [...card.platforms],
  format_ids: [...card.format_ids],
  categories_excluded: [...card.categories_excluded],
  status: card.status,
});

const sameList = <T extends string>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

function toggle<T extends string>(list: readonly T[], item: T, on: boolean): T[] {
  return on ? (list.includes(item) ? [...list] : [...list, item]) : list.filter((value) => value !== item);
}

export interface RateCardEditorProps {
  creator: Creator;
  card: RateCard;
  view: RateCardView;
}

/**
 * The rate card editor: what you charge, what that includes, where you stand against the market, and how it looks to brands, all on
 * one screen. Edits stay in a draft until you save; the preview and the market read follow the draft as you type.
 */
export function RateCardEditor({ creator, card, view }: RateCardEditorProps) {
  const initial = draftOf(card);
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | undefined>();
  const { busy, run } = useRun();
  const suggestion = view.suggestion ?? card.suggested;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => setDraft((current) => ({ ...current, [key]: value }));
  const dirty =
    draft.price_per_video_cents !== initial.price_per_video_cents ||
    draft.min_cpm_cents !== initial.min_cpm_cents ||
    draft.paid_usage_days !== initial.paid_usage_days ||
    draft.turnaround_days !== initial.turnaround_days ||
    draft.max_videos_per_month !== initial.max_videos_per_month ||
    draft.status !== initial.status ||
    !sameList(draft.platforms, initial.platforms) ||
    !sameList(draft.format_ids, initial.format_ids) ||
    !sameList(draft.categories_excluded, initial.categories_excluded);

  const priceMax = Math.max(50_000, (suggestion?.high_cents ?? 20_000) * 4);
  const position = suggestion ? askPosition(draft.price_per_video_cents, suggestion) : null;

  const save = async (): Promise<void> => {
    if (draft.price_per_video_cents < PRICE_MIN) {
      setError(`The smallest price is ${formatMoney(PRICE_MIN)} a video.`);
      return;
    }
    if (draft.min_cpm_cents < CONSTANTS.pay.floor_cpm_cents) {
      setError(`The minimum CPM is at least ${formatMoney(CONSTANTS.pay.floor_cpm_cents)}.`);
      return;
    }
    setError(undefined);
    const data = await run("save", () =>
      actions.saveRateCard({
        ...draft,
        accepts_direct_offers: draft.status !== "paused",
      }),
    );
    if (data) notify.success("Rate card saved", { description: `Brands now see ${formatMoney(data.rate_card.price_per_video_cents, { cents: "never" })} per video${data.rate_card.status === "paused" ? ", paused" : ""}.` });
  };

  const previewPackages = card.packages.map((pack) => ({
    ...pack,
    price_per_video_cents: Math.round(draft.price_per_video_cents * (card.price_per_video_cents > 0 ? pack.price_per_video_cents / card.price_per_video_cents : 1)),
  }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
        <GlassCard padding="lg" className="grid grid-cols-[minmax(0,1fr)] gap-6" aria-labelledby="price-title">
          <div className="grid gap-1">
            <h2 id="price-title" className="font-display text-title-md text-fg">
              Your price per video
            </h2>
            <p className="text-body-sm text-fg-muted">What a brand pays for one video with organic posting included. You can change it any time; offers already sent keep the price they were made at.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start">
            <MoneyInput label="Price" value={draft.price_per_video_cents} onChange={(cents) => set("price_per_video_cents", cents)} min={PRICE_MIN} max={priceMax} error={error?.includes("smallest price") ? error : undefined} />
            <Field label="Slide to compare">
              <Slider
                min={PRICE_MIN}
                max={priceMax}
                step={500}
                value={[Math.min(Math.max(draft.price_per_video_cents, PRICE_MIN), priceMax)]}
                onValueChange={(value) => set("price_per_video_cents", value[0] ?? draft.price_per_video_cents)}
                format={(value) => formatMoney(value, { cents: "never" })}
                aria-label="Price per video"
                marks={suggestion ? [{ value: suggestion.price_cents, label: "Suggested" }] : undefined}
              />
            </Field>
          </div>
          {suggestion && position ? (
            <div className="grid gap-4 rounded-2xl bg-surface-field p-5">
              <PriceRange suggestion={suggestion} ask={draft.price_per_video_cents} />
              <div className="grid gap-1">
                <p className="text-body-sm font-semibold text-fg">{POSITION_COPY[position].title}</p>
                <p className="text-body-sm text-pretty text-fg-muted">{POSITION_COPY[position].body}</p>
              </div>
              <p className="flex items-start gap-2 text-caption text-fg-subtle">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {suggestion.basis}. Confidence {formatPct(suggestion.confidence, 0)}. This is an estimate from market prices, not a promise of offers.
                </span>
              </p>
            </div>
          ) : (
            <Callout tone="info" title="No market read yet">
              Connect a social account so flowd can read your median views and suggest a price.
            </Callout>
          )}
        </GlassCard>

        <GlassCard padding="lg" className="grid grid-cols-[minmax(0,1fr)] gap-6" aria-labelledby="open-title">
          <div className="grid gap-1">
            <h2 id="open-title" className="font-display text-title-md text-fg">
              Open bounties
            </h2>
            <p className="text-body-sm text-fg-muted">The lowest rate per 1,000 verified views you will work for on open bounties. Bounties that pay less will not be matched to you first.</p>
          </div>
          <Field label={`Minimum: ${formatMoney(draft.min_cpm_cents)} per 1,000 views`} hint={`The floor on flowd is ${formatMoney(CONSTANTS.pay.floor_cpm_cents)}.`}>
            <Slider
              min={CONSTANTS.pay.floor_cpm_cents}
              max={800}
              step={5}
              value={[Math.min(Math.max(draft.min_cpm_cents, CONSTANTS.pay.floor_cpm_cents), 800)]}
              onValueChange={(value) => set("min_cpm_cents", value[0] ?? draft.min_cpm_cents)}
              format={(value) => formatMoney(value)}
              aria-label="Minimum CPM"
              marks={[{ value: CONSTANTS.pay.default_cpm_cents, label: "Default" }]}
            />
          </Field>
        </GlassCard>

        <GlassCard padding="lg" className="grid grid-cols-[minmax(0,1fr)] gap-6" aria-labelledby="usage-title">
          <div className="grid gap-1">
            <h2 id="usage-title" className="font-display text-title-md text-fg">
              Rights and delivery
            </h2>
            <p className="text-body-sm text-fg-muted">What a brand gets for the price, in plain terms. Anything beyond it is paid extra, and the Rights Card shows both sides before you say yes.</p>
          </div>
          <div className="grid items-start gap-5 sm:grid-cols-2">
            <Field label="Paid-ad usage included" hint={`Each extra 30 days is ${formatPct(card.paid_usage_pct_per_30d, 0)} of the base price: ${formatMoney(mulRate(draft.price_per_video_cents, card.paid_usage_pct_per_30d))}.`}>
              <Select value={String(draft.paid_usage_days)} onValueChange={(value) => set("paid_usage_days", Number(value))} options={USAGE_DAYS.map((days) => ({ value: String(days), label: `${days} days` }))} />
            </Field>
            <Field label="Turnaround">
              <Select value={String(draft.turnaround_days)} onValueChange={(value) => set("turnaround_days", Number(value))} options={TURNAROUND.map((days) => ({ value: String(days), label: `${days} days` }))} />
            </Field>
          </div>
          <Field label={`Up to ${draft.max_videos_per_month} videos a month`} hint="A cap protects your pace. Brands see it before they offer.">
            <Slider min={1} max={30} step={1} value={[draft.max_videos_per_month]} onValueChange={(value) => set("max_videos_per_month", value[0] ?? draft.max_videos_per_month)} aria-label="Videos per month" />
          </Field>
        </GlassCard>

        <GlassCard padding="lg" className="grid grid-cols-[minmax(0,1fr)] gap-6" aria-labelledby="scope-title">
          <div className="grid gap-1">
            <h2 id="scope-title" className="font-display text-title-md text-fg">
              What you offer
            </h2>
            <p className="text-body-sm text-fg-muted">Where you post, which formats you do well, and categories you would rather not make videos for.</p>
          </div>
          <div className="grid gap-2">
            <p className="text-body-sm font-semibold text-fg">Platforms</p>
            <ChipGroup aria-label="Platforms">
              {PLATFORMS.map((platform) => (
                <Chip key={platform} selected={draft.platforms.includes(platform)} onSelectedChange={(on) => set("platforms", toggle(draft.platforms, platform, on))}>
                  <PlatformLabel platform={platform} />
                </Chip>
              ))}
            </ChipGroup>
          </div>
          <div className="grid gap-2">
            <p className="text-body-sm font-semibold text-fg">Formats</p>
            <ChipGroup aria-label="Formats">
              {FORMAT_IDS.map((id) => (
                <Chip key={id} selected={draft.format_ids.includes(id)} onSelectedChange={(on) => set("format_ids", toggle(draft.format_ids, id, on))}>
                  {FORMAT_ID_META[id].label}
                </Chip>
              ))}
            </ChipGroup>
          </div>
          <div className="grid gap-2">
            <p className="text-body-sm font-semibold text-fg">Categories I skip</p>
            <ChipGroup aria-label="Categories to skip">
              {CATEGORIES.map((category) => (
                <Chip key={category} selected={draft.categories_excluded.includes(category)} onSelectedChange={(on) => set("categories_excluded", toggle(draft.categories_excluded, category, on))}>
                  {CATEGORY_META[category].label}
                </Chip>
              ))}
            </ChipGroup>
          </div>
        </GlassCard>

        <GlassCard padding="lg" className="grid grid-cols-[minmax(0,1fr)] gap-5" aria-labelledby="avail-title">
          <div className="grid gap-1">
            <h2 id="avail-title" className="font-display text-title-md text-fg">
              Availability
            </h2>
            <p className="text-body-sm text-fg-muted">Pause when you are full. Brands see the status on your card and your storefront, and nothing about your tier changes.</p>
          </div>
          <SegmentedControl<RateCardStatus>
            aria-label="Availability"
            value={draft.status}
            onValueChange={(next) => set("status", next)}
            options={RATE_CARD_STATUSES.map((status) => ({ value: status, label: RATE_CARD_STATUS_META[status].label }))}
          />
          <p className="text-caption text-fg-subtle">{RATE_CARD_STATUS_META[draft.status].meaning}</p>
        </GlassCard>
      </div>

      <aside aria-label="Preview and activity" className="grid grid-cols-[minmax(0,1fr)] content-start gap-4 lg:sticky lg:top-24">
        <RateCardPreview
          creator={creator}
          draft={{
            ...draft,
            paid_usage_pct_per_30d: card.paid_usage_pct_per_30d,
            packages: previewPackages,
          }}
        />
        <GlassCard className="grid gap-3">
          <h3 className="font-display text-title-sm text-fg">Activity</h3>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div className="grid gap-0.5">
              <dd className="font-display text-figure-md text-fg tabular-nums">{card.stats.offers_received}</dd>
              <dt className="text-caption text-fg-subtle">Offers</dt>
            </div>
            <div className="grid gap-0.5">
              <dd className="font-display text-figure-md text-fg tabular-nums">{card.stats.accepted}</dd>
              <dt className="text-caption text-fg-subtle">Accepted</dt>
            </div>
            <div className="grid gap-0.5">
              <dd className="font-display text-figure-md text-fg tabular-nums">{card.stats.median_response_hours} h</dd>
              <dt className="text-caption text-fg-subtle">Your reply</dt>
            </div>
          </dl>
        </GlassCard>
      </aside>

      <GlassBar className="sticky bottom-24 z-(--fd-z-raised) flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:bottom-6 lg:col-span-2" aria-label="Save rate card" as="div">
        <p className="min-w-0 text-body-sm text-fg-muted" role="status" aria-live="polite">
          {dirty ? <Badge tone="sun" size="md">Unsaved changes</Badge> : "Saved. Brands see this card."}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" leadingIcon={<RotateCcw />} disabled={!dirty} onClick={() => setDraft(initial)}>
            Reset
          </Button>
          <Button variant="primary" size="sm" leadingIcon={<Save />} loading={busy === "save"} disabled={!dirty} onClick={() => void save()}>
            Save rate card
          </Button>
        </div>
      </GlassBar>
    </div>
  );
}
