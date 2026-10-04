import type { ComponentPropsWithRef, CSSProperties } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIER_CHEVRONS, TIER_LABEL, TIER_STOPS, tierVars, type TierName } from "./tier-art";
import "./brand.css";

export type { TierName } from "./tier-art";
export { TIER_LABEL, TIER_ORDER } from "./tier-art";

export interface TierBadgeProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  tier: TierName;
  /** Edge in px. 20 (chip: medallion only), 32 (list rows), 56 (cards) and 112 (profile, celebration) are the system sizes. */
  size?: number;
  /** Soft coloured glow. Default on from 32px; below 24px it is always dropped. */
  glow?: boolean;
  /** Print the tier name beside the medallion. The name must always be reachable as text: set this, or print the name yourself. */
  label?: boolean;
  /** Play the rank-up moment once: the medallion springs in and a specular sweep crosses it. No confetti, by design. */
  rankUp?: boolean;
  /** Hide from assistive tech (when the tier name is printed next to it). */
  decorative?: boolean;
}

/** Five-point sparks at the cardinal points of an Elite medallion, drawn as 4-point glints. */
function Glint({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <path d={`M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`} fill="var(--fd-sun-solid)" opacity={0.95} />;
}

/**
 * Tier medallion (BRAND.md 14): a gel-lit disc with one to four chevrons (rank reads without colour), a 1.6px rim, a faint
 * inner ring set 10px inside it and a soft glow. Elite is the only DARK medallion, with a prismatic ring turning once per 14 s (still under
 * reduced motion) and four sparks, so it can never be mistaken for Gold. Pure SVG + CSS: server-renderable, no images.
 *
 * ```tsx
 * <TierBadge tier="gold" size={56} label />
 * ```
 */
export function TierBadge({ tier, size = 32, glow, label = false, rankUp = false, decorative = false, className, style, ...props }: TierBadgeProps) {
  const uid = `fd-tier-${tier}-${size}`;
  const vars = tierVars(tier);
  const elite = tier === "elite";
  const compact = size < 32;
  const showGlow = (glow ?? size >= 32) && size >= 24;
  const chevrons = TIER_CHEVRONS[tier];
  const radius = elite ? 42 : 46;
  const pitch = compact ? 12 : 10.5;
  const stroke = compact ? 7.4 : 5.4;
  const stops = TIER_STOPS[tier];
  const name = `${TIER_LABEL[tier]} tier`;

  const badge = (
    <span
      role={decorative || label ? undefined : "img"}
      aria-label={decorative || label ? undefined : name}
      aria-hidden={decorative || label || undefined}
      className={cn("relative inline-block shrink-0 align-middle", rankUp && "fd-br-pop", className)}
      style={
        {
          width: size,
          height: size,
          filter: showGlow ? `drop-shadow(0 ${Math.round(size * 0.05)}px ${Math.round(size * 0.16)}px color-mix(in oklab, ${vars.glow} 75%, transparent))` : undefined,
          "--ring-t": `${(size * 3.4) / 112}px`,
          ...style,
        } as CSSProperties
      }
      {...(label ? {} : props)}
    >
      {elite ? (
        <span
          aria-hidden="true"
          className="fd-br-elite-ring absolute rounded-full"
          style={{
            inset: `${((56 - 46) / 112) * 100}%`,
            background: "conic-gradient(var(--fd-sun-solid), var(--fd-ember-solid), var(--fd-rose-solid), var(--fd-ultraviolet-500), var(--fd-lagoon-500), var(--fd-sun-solid))",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - var(--ring-t)), #000 calc(100% - var(--ring-t) + 0.5px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - var(--ring-t)), #000 calc(100% - var(--ring-t) + 0.5px))",
          }}
        />
      ) : null}
      <svg viewBox="0 0 112 112" width={size} height={size} aria-hidden="true" focusable="false" className="relative block">
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="1" y2="1">
            {stops.map(([offset, color]) => (
              <stop key={offset} offset={offset} stopColor={color} />
            ))}
          </linearGradient>
          <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={vars.rim} stopOpacity={1} />
            <stop offset="0.5" stopColor={vars.rim} stopOpacity={0.28} />
            <stop offset="1" stopColor={vars.rim} stopOpacity={0.55} />
          </linearGradient>
          <radialGradient id={`${uid}-hi`} cx="0.3" cy="0.24" r="0.62">
            <stop offset="0" stopColor="#fff" stopOpacity={elite ? 0.22 : 0.6} />
            <stop offset="1" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
        </defs>

        <circle cx={56} cy={56} r={radius} fill={elite ? vars.ink : `url(#${uid}-fill)`} />
        <circle cx={56} cy={56} r={radius} fill={`url(#${uid}-hi)`} />
        <circle cx={56} cy={56} r={radius - 0.8} fill="none" stroke={`url(#${uid}-rim)`} strokeWidth={1.6} />
        {compact ? null : elite ? (
          <circle cx={56} cy={56} r={radius - 9} fill="none" stroke="#fff" strokeOpacity={0.16} strokeWidth={1.2} strokeDasharray="2.2 3.4" />
        ) : (
          <circle cx={56} cy={56} r={radius - 10} fill="none" stroke={vars.ink} strokeOpacity={0.2} strokeWidth={1.2} />
        )}

        <g fill="none" stroke={elite ? `url(#${uid}-fill)` : vars.ink} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
          {Array.from({ length: chevrons }, (_, index) => {
            const y = 56 + 1 + (index - (chevrons - 1) / 2) * pitch;
            return <path key={index} d={`M42 ${y + 4.5}L56 ${y - 4.5}L70 ${y + 4.5}`} />;
          })}
        </g>

        {elite && !compact ? (
          <>
            <Glint cx={56} cy={5} r={3.4} />
            <Glint cx={107} cy={56} r={3.4} />
            <Glint cx={56} cy={107} r={3.4} />
            <Glint cx={5} cy={56} r={3.4} />
          </>
        ) : null}
      </svg>
      {rankUp ? <span aria-hidden="true" className="fd-br-sweep pointer-events-none absolute rounded-full" style={{ inset: `${((56 - radius) / 112) * 100}%` }} /> : null}
    </span>
  );

  if (!label) return badge;
  return (
    <span className="inline-flex items-center gap-2.5" {...props}>
      {badge}
      <span className="font-display text-title-sm text-fg">{TIER_LABEL[tier]}</span>
    </span>
  );
}

export interface TierChipProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  tier: TierName;
  size?: "sm" | "md";
}

/**
 * Tier chip for profiles, leaderboards and bios: a pill in the tier gradient, a translucent 24px disc with an up-chevron, and
 * the tier name in the tier's own ink (checked at 4.5:1 on the mid stop, 3:1 on the ends). The name is real text.
 */
export function TierChip({ tier, size = "md", className, style, ...props }: TierChipProps) {
  const vars = tierVars(tier);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-pill font-semibold whitespace-nowrap shadow-[inset_0_0_0_1px_rgb(255_255_255/0.3),0_2px_10px_-4px_var(--tier-glow)]",
        size === "md" ? "h-8 gap-2 py-1 pr-3.5 pl-1 text-body-sm" : "h-7 gap-1.5 py-0.5 pr-3 pl-0.5 text-caption",
        className,
      )}
      style={{ background: vars.gradient, color: vars.ink, fontWeight: 650, "--tier-glow": vars.glow, ...style } as CSSProperties}
      {...props}
    >
      <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-full bg-[rgb(255_255_255/0.34)]", size === "md" ? "size-6" : "size-[22px]")}>
        <ChevronUp className="size-4" strokeWidth={2.75} />
      </span>
      {TIER_LABEL[tier]}
    </span>
  );
}
