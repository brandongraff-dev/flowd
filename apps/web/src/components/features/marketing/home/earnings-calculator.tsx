"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONSTANTS, EARNINGS_DISCLAIMER, formatInt, formatMoney, monthlyEarningsRange } from "@/lib/engine";
import type { MedianEarnings } from "@/lib/data/selectors";
import { GlassCard } from "@/components/glass/glass";
import { buttonVariants } from "@/components/ui/button-variants";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Money } from "@/components/ui/money";
import { Slider } from "@/components/ui/slider";
import { DemoTag } from "@/components/shell/demo-banner";
import type { MarketRow } from "./data";

const money = (cents: number): string => formatMoney(cents, { cents: "never" });

function Control({ id, label, value, children }: { id: string; label: string; value: string; children: ReactNode }) {
  return (
    <div className="grid gap-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <span id={id} className="text-body-sm font-semibold text-fg">
          {label}
        </span>
        <span className="font-display text-figure-md text-fg tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * The creator earnings calculator, FTC-careful by construction: it never shows an estimate alone. The range (p25 to p75, with the median) is for
 * the inputs you choose, and right under it sit the typical creator and the top 10% from the last 30 days of cleared earnings, in the same size.
 * Views only: install and trial bonuses are extra, and a video that is not approved earns nothing.
 */
export function EarningsCalculator({ market, median }: { market: MarketRow[]; median: MedianEarnings }) {
  const first = market[0];
  const [category, setCategory] = useState<string>(first?.category ?? "");
  const row = market.find((candidate) => candidate.category === category) ?? first;
  const [perWeek, setPerWeek] = useState(1);
  const [views, setViews] = useState<number | null>(null);
  const [approval, setApproval] = useState(78);

  const shownViews = views ?? row?.median_views ?? 10_000;
  const range = useMemo(() => {
    if (!row) return null;
    return monthlyEarningsRange({
      median_views: shownViews,
      posts_per_month: Math.round(perWeek * 4.33),
      approval_rate: approval / 100,
      cpm_cents: row.clearing_cpm_cents,
      per_video_cap_cents: CONSTANTS.pay.default_per_video_cap_cents,
    });
  }, [row, shownViews, perWeek, approval]);

  if (!row || !range) return null;
  const monthly = range.monthly_cents;

  return (
    <GlassCard padding="none" className="overflow-hidden rounded-[32px]">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="grid content-start gap-7 p-5 sm:p-8">
          <div className="grid gap-1.5">
            <p className="fd-eyebrow text-fg-subtle">Earnings calculator</p>
            <h3 className="text-title-lg text-fg">What could a month look like?</h3>
            <p className="text-body-sm max-w-[48ch] text-fg-muted">A range for the way you post, shown beside what creators on flowd actually cleared. It is an estimate, not a promise.</p>
          </div>

          <div className="grid gap-2.5">
            <span id="earn-cat" className="text-body-sm font-semibold text-fg">
              What you make videos about
            </span>
            <ChipGroup aria-labelledby="earn-cat">
              {market.map((item) => (
                <Chip
                  key={item.category}
                  size="sm"
                  selected={item.category === row.category}
                  onSelectedChange={() => {
                    setCategory(item.category);
                    setViews(null);
                  }}
                >
                  {item.label}
                </Chip>
              ))}
            </ChipGroup>
          </div>

          <Control id="earn-posts" label="Videos you post a week" value={String(perWeek)}>
            <Slider aria-labelledby="earn-posts" min={1} max={7} step={1} value={[perWeek]} onValueChange={([next]) => setPerWeek(next ?? perWeek)} />
          </Control>
          <Control id="earn-views" label="Typical views per video" value={formatInt(shownViews)}>
            <Slider aria-labelledby="earn-views" min={1_000} max={100_000} step={500} value={[shownViews]} onValueChange={([next]) => setViews(next ?? shownViews)} format={(value) => formatInt(value)} />
            <p className="text-caption text-fg-subtle">Starts at the {row.label} median: {formatInt(row.median_views)} views a post.</p>
          </Control>
          <Control id="earn-approval" label="Videos approved" value={`${approval}%`}>
            <Slider aria-labelledby="earn-approval" min={40} max={95} step={1} value={[approval]} onValueChange={([next]) => setApproval(next ?? approval)} format={(value) => `${value}%`} />
            <p className="text-caption text-fg-subtle">The platform median is 78%. A video that is not approved earns nothing.</p>
          </Control>
        </div>

        <div className="grid content-start gap-6 border-t border-divider bg-surface-field/50 p-5 sm:p-8 lg:border-t-0 lg:border-l">
          <div className="grid gap-3" aria-live="polite">
            <p className="text-caption font-medium text-fg-muted">Your estimate for a month, before bonuses</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Low end", monthly.p25],
                ["Middle", monthly.median],
                ["High end", monthly.p75],
              ].map(([label, cents], index) => (
                <div key={label} className={cn("grid gap-1 rounded-2xl p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]", index === 1 ? "bg-surface-active" : "bg-surface-field")}>
                  <p className="text-caption font-medium text-fg-muted">{label}</p>
                  <Money cents={Number(cents)} state="neutral" size="lg" decimals="never" />
                </div>
              ))}
            </div>
            <p className="text-caption text-fg-subtle">
              About {range.approved_posts} approved videos at {formatMoney(range.per_video.median.pay_cents)} each in the middle case, at the {row.label} clearing price of {formatMoney(row.clearing_cpm_cents)} per 1,000 views, capped at {money(CONSTANTS.pay.default_per_video_cap_cents)} a video.
            </p>
          </div>

          <div className="grid gap-3 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <p className="text-body-sm font-semibold text-fg">What creators really cleared, last 30 days</p>
              <DemoTag>Demo data</DemoTag>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <dt className="text-caption font-medium text-fg-muted">Typical creator (median)</dt>
                <dd>
                  <Money cents={median.typical_cents} state="cleared" size="lg" />
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-caption font-medium text-fg-muted">Top 10% of creators</dt>
                <dd>
                  <Money cents={median.top_decile_cents} state="cleared" size="lg" />
                </dd>
              </div>
            </dl>
            <p className="text-caption text-fg-subtle">
              Middle half of {median.active_creators_30d} active creators: {formatMoney(median.p25_cents)} to {formatMoney(median.p75_cents)}. The estimate depends on how often you post; the real figures cover every creator who posted or cleared money in the period.
            </p>
          </div>

          <p className="text-caption max-w-[60ch] text-fg-subtle">
            {EARNINGS_DISCLAIMER} Install and trial bonuses are extra and only pay on tracked results. There is no guaranteed income, and approval isn&apos;t guaranteed.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/signup/creator" className={buttonVariants({ variant: "primary" })}>
              Start earning
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/tools/earnings-calculator" className={buttonVariants({ variant: "secondary" })}>
              The full calculator
            </Link>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
