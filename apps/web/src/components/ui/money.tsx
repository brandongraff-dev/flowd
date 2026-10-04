"use client";

import { useRef, type ComponentPropsWithRef, type ReactNode } from "react";
import { Banknote, Check, Clock, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/hooks/use-count-up";
import { formatMoneyText, moneyParts, type MoneyDecimals, type MoneySign } from "./money-format";

export type MoneyState = "auto" | "neutral" | "cleared" | "pending" | "paid" | "negative" | "escrow";
export type MoneySize = "hero" | "xl" | "lg" | "md" | "sm" | "inherit";

const SIZE: Record<MoneySize, string> = {
  hero: "font-display text-figure-hero",
  xl: "font-display text-figure-xl",
  lg: "font-display text-figure-lg",
  md: "font-display text-figure-md",
  sm: "font-sans text-figure-sm",
  inherit: "",
};

interface StateStyle {
  text: string;
  glyph: typeof Check | null;
  spoken: string;
}

/** BRAND.md 6.8: cleared = mint + check, pending = lagoon + clock (+ hatching), negative = rose + minus, escrow = ink + lock. */
const STATE: Record<Exclude<MoneyState, "auto">, StateStyle> = {
  neutral: { text: "text-fg", glyph: null, spoken: "" },
  cleared: { text: "text-mint", glyph: Check, spoken: "cleared" },
  pending: { text: "text-info", glyph: Clock, spoken: "pending" },
  paid: { text: "text-mint", glyph: Banknote, spoken: "paid out" },
  negative: { text: "text-rose", glyph: null, spoken: "" },
  escrow: { text: "text-fg", glyph: Lock, spoken: "in escrow" },
};

export interface MoneyProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  /** Integer cents (CONVENTIONS section 1). Never pass dollars. */
  cents: number;
  /**
   * Money state, which sets colour AND a glyph (never colour alone): `cleared` mint + check, `pending` lagoon + clock + a
   * hatched underline, `paid` mint + banknote, `negative` rose (the minus is the cue), `escrow` ink + lock, `neutral` ink.
   * Default `auto`: negative amounts are `negative`, everything else `neutral`. Brands pass `neutral` for spend and deltas
   * (creators see mint for money; brands see neutral ink and arrows).
   */
  state?: MoneyState;
  /** Type size: the five figure styles of the brand scale (`hero` 72px down to `sm` 15px), or `inherit` to follow the parent. */
  size?: MoneySize;
  /** `always` adds "+" to positives (earnings rows, bonuses). Default `auto` (minus for negatives only). */
  signDisplay?: MoneySign;
  /** `always` $62.40 / $5,000.00 (default), `auto` drops .00, `never` rounds to dollars. */
  decimals?: MoneyDecimals;
  /** Short form ($12.5K) for charts and dense tiles only. */
  compact?: boolean;
  /** Show the state glyph (default true; `false` when a label next to it already says the state). A node replaces the default glyph. */
  icon?: boolean | ReactNode;
  /** Render the cents smaller than the dollars (default: on for `hero` and `xl`, where proportions matter). */
  splitCents?: boolean;
  /**
   * Count to new values on the `smooth` spring (a calm mint wash under reduced motion). `true` animates changes;
   * `"mount"` also counts up the first time the figure scrolls into view (use on scroll-revealed hero numbers only).
   * Static figures (the default) carry no observers or springs, so tables full of Money stay cheap.
   */
  animate?: boolean | "mount";
  /** Small text after the figure ("clears Sat 2:00 PM", "per 1,000 views"). Not part of the amount. */
  note?: ReactNode;
}

/**
 * The one way to show money. Bricolage with tabular numerals (so digits never jitter), integer cents formatted at the
 * edge, a typographic minus, a distinct pending vs cleared treatment, and a screen-reader string that reads the amount
 * once ("plus $62.40, cleared") while the drawn digits are hidden.
 *
 * ```tsx
 * <Money cents={128460} size="hero" state="cleared" animate />
 * <Money cents={6120} state="pending" note="clears Sat 2:00 PM" size="md" />
 * <Money cents={-1200} />                       // −$12.00 in rose
 * <Money cents={150} signDisplay="always" state="cleared" size="sm" />   // + $1.50 with a check
 * ```
 */
export function Money({ animate = false, ...props }: MoneyProps) {
  return animate ? <AnimatedMoney animate={animate} {...props} /> : <MoneyFigure {...props} />;
}

function AnimatedMoney({ animate, ...props }: MoneyProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const counted = useCountUp(ref, props.cents, { animateOnMount: animate === "mount", restDelta: 0.5 });
  return <MoneyFigure {...props} ref={ref} shownCents={Math.round(counted)} />;
}

interface MoneyFigureProps extends Omit<MoneyProps, "animate"> {
  /** The value to draw (differs from `cents` while a count-up is running). */
  shownCents?: number;
}

function MoneyFigure({
  cents,
  shownCents,
  state = "auto",
  size = "md",
  signDisplay = "auto",
  decimals = "always",
  compact = false,
  icon = true,
  splitCents,
  note,
  className,
  ...props
}: MoneyFigureProps) {
  const resolved: Exclude<MoneyState, "auto"> = state === "auto" ? (cents < 0 ? "negative" : "neutral") : state;
  const style = STATE[resolved];
  const parts = moneyParts(shownCents ?? cents, { decimals, sign: signDisplay, compact });
  const split = splitCents ?? (size === "hero" || size === "xl");
  const Glyph = style.glyph;
  const spoken = [
    cents < 0 ? "negative" : signDisplay === "always" && cents > 0 ? "plus" : "",
    formatMoneyText(Math.abs(cents), { decimals, compact }),
    style.spoken ? `, ${style.spoken}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      data-state={resolved}
      className={cn(
        "relative inline-flex items-baseline rounded-md whitespace-nowrap tabular-nums [font-feature-settings:'tnum'_1]",
        SIZE[size],
        style.text,
        className,
      )}
      {...props}
    >
      <span className="sr-only">{spoken}</span>
      <span aria-hidden="true" className="relative inline-flex items-baseline">
        {icon !== false && (icon !== true || Glyph) ? (
          <span className="mr-[0.22em] inline-grid self-center [&_svg]:size-[max(0.36em,14px)] [&_svg]:stroke-[2.25]">
            {icon === true ? Glyph ? <Glyph /> : null : icon}
          </span>
        ) : null}
        {parts.sign}
        <span className={cn(split && "mr-[0.04em] self-start text-[0.58em] leading-[1.35] font-semibold opacity-90")}>{parts.symbol}</span>
        <span>{parts.whole}</span>
        {parts.fraction ? <span className={cn(split && "text-[0.5em] font-bold opacity-90")}>{`.${parts.fraction}`}</span> : null}
        {resolved === "pending" ? <span className="fd-hatched absolute inset-x-0 -bottom-1 h-[3px] rounded-full bg-info/70" /> : null}
      </span>
      {note ? <span className="ml-2 self-baseline text-caption font-medium tracking-normal text-fg-subtle">{note}</span> : null}
    </span>
  );
}
