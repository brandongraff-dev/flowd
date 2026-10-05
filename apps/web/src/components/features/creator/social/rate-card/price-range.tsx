import type { RateSuggestion } from "@/lib/contract/types";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AskPosition = "below" | "within" | "above";

/** Where an ask sits against the market's middle range, in words that say what it means for offers (never a verdict on the creator). */
export function askPosition(ask: number, suggestion: Pick<RateSuggestion, "low_cents" | "high_cents">): AskPosition {
  return ask < suggestion.low_cents ? "below" : ask > suggestion.high_cents ? "above" : "within";
}

export const POSITION_COPY: Record<AskPosition, { title: string; body: string }> = {
  below: { title: "Below the typical range", body: "Brands will likely say yes fast. You may be leaving money on the table, and you can raise it any time." },
  within: { title: "Inside the typical range", body: "A fair ask for your views and tier. Expect offers at, or close to, this price." },
  above: { title: "Above the typical range", body: "Fewer offers at this price, and brands may counter. A strong portfolio and quick replies help hold a higher ask." },
};

export interface PriceRangeProps {
  suggestion: Pick<RateSuggestion, "price_cents" | "low_cents" | "high_cents">;
  /** Your ask in cents. */
  ask: number;
  className?: string;
}

/**
 * Your ask on the market's scale: the middle half of comparable prices as a bar, the suggested price as a tick, you as a marker with a
 * label. The scale runs from zero to 1.6 times the top of the range, or to your ask if that is higher. All numbers are also text.
 */
export function PriceRange({ suggestion, ask, className }: PriceRangeProps) {
  const max = Math.max(suggestion.high_cents * 1.6, ask * 1.12);
  const at = (value: number): number => Math.min(Math.max(value / max, 0), 1) * 100;
  const position = askPosition(ask, suggestion);
  const markerSide = at(ask) > 82 ? "right-0 translate-x-0 text-right" : at(ask) < 18 ? "left-0 translate-x-0" : "-translate-x-1/2 text-center";
  return (
    <div className={cn("grid gap-3", className)}>
      <div role="img" aria-label={`Your ask ${formatMoney(ask)}. Typical range ${formatMoney(suggestion.low_cents)} to ${formatMoney(suggestion.high_cents)}, suggested ${formatMoney(suggestion.price_cents)}.`} className="relative h-16">
        <div aria-hidden="true" className="absolute inset-x-0 top-9 h-px bg-(--fd-chart-axis)" />
        <div aria-hidden="true" className="absolute top-[30px] h-3 rounded-[4px] bg-(--fd-chart-1) opacity-35" style={{ left: `${at(suggestion.low_cents)}%`, width: `${at(suggestion.high_cents) - at(suggestion.low_cents)}%` }} />
        <div aria-hidden="true" className="absolute top-[27px] h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-fg-muted" style={{ left: `${at(suggestion.price_cents)}%` }} />
        <div aria-hidden="true" className="absolute top-[22px] -translate-x-1/2" style={{ left: `${at(ask)}%` }}>
          <span className={cn("block size-[26px] rounded-full border-[3px] border-bg shadow-float", position === "within" ? "bg-mint-solid" : "bg-accent-bright")} />
        </div>
        <span aria-hidden="true" className={cn("absolute top-0 w-max text-caption font-semibold text-fg tabular-nums", markerSide)} style={at(ask) > 82 || at(ask) < 18 ? undefined : { left: `${at(ask)}%` }}>
          You: {formatMoney(ask, { cents: "never" })}
        </span>
      </div>
      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-caption">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-fg-subtle">Typical range</dt>
          <dd className="font-semibold text-fg tabular-nums">
            {formatMoney(suggestion.low_cents, { cents: "never" })} to {formatMoney(suggestion.high_cents, { cents: "never" })}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-fg-subtle">Suggested</dt>
          <dd className="font-semibold text-fg tabular-nums">{formatMoney(suggestion.price_cents, { cents: "never" })}</dd>
        </div>
      </dl>
    </div>
  );
}
